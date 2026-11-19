import type {
  ChemGrade,
  ChemTopic,
  CognitiveLevel,
  Question,
  QuestionType,
} from '../types';
import {
  DEFAULT_SUBJECT_ID,
  DEFAULT_SUBJECT_NAME,
  generateQuestionCode,
} from '../constants/subjects';
import {
  extractQuestionImageUrls,
  hashStringDeterministic,
  MAX_QUESTION_CONTENT_CHARS,
  MAX_QUESTION_EXPLANATION_CHARS,
  MAX_QUESTION_IMAGE_URL_CHARS,
  optimizeQuestionEmbeddedImages,
} from './wordImageOptimizer';

export interface PerQuestionClassification {
  subjectId: string;
  subjectName: string;
  grade: ChemGrade;
  textbookSeries?: string;
  chapterId?: string;
  chapterName?: string;
  lessonId?: string;
  lessonName?: string;
}

export interface WordBankClassificationInput {
  /**
   * When true (default), applies subject/grade/chapter/lesson/textbookSeries to every
   * question in this save batch. When false, preserves each question's own metadata
   * (or per-question overrides from `perQuestionMetadata`) without overwriting.
   */
  applyToAll: boolean;
  subjectId: string;
  subjectName: string;
  grade: ChemGrade;
  textbookSeries?: string;
  chapterId?: string;
  chapterName?: string;
  lessonId?: string;
  lessonName?: string;
  perQuestionMetadata?: Record<string, Partial<PerQuestionClassification>>;
  levelMode: 'keep_per_question' | 'apply_all';
  defaultLevel: CognitiveLevel;
  typeMode: 'keep_per_question' | 'apply_all';
  defaultType: QuestionType;
  sourceLabel: string;
  skipDuplicates: boolean;
}

export interface DuplicateMatchInfo {
  questionId: string;
  isDuplicate: boolean;
  duplicateScope?: 'firestore_bank' | 'within_selection';
  matchedQuestionId?: string;
  matchedQuestionCode?: string;
  reason?: string;
}

export interface WordBankSkippedDuplicate {
  question: Question;
  duplicateScope: 'firestore_bank' | 'within_selection';
  matchedQuestionId?: string;
  matchedQuestionCode?: string;
  reason: string;
}

export interface WordBankFailedItem {
  question: Question;
  error: string;
}

export interface WordBankSaveResult {
  totalSelected: number;
  savedQuestions: Question[];
  savedSourceIds: string[];
  skippedDuplicates: WordBankSkippedDuplicate[];
  failedItems: WordBankFailedItem[];
  sourceCollection: 'questions';
}

export interface WordQuestionPersistenceAdapter {
  getCurrentUid(): string | null;
  fetchExistingTeacherQuestions(uid: string): Promise<Question[]>;
  createQuestion(question: Question, ownerId: string): Promise<Question>;
}

/**
 * Normalizes question text for duplicate comparison while STRICTLY PRESERVING:
 * - Chemical/math formulas, subscripts (<sub>), superscripts (<sup>), charges (2+, SO4^2-),
 *   LaTeX ($...$, \ce{...}), reaction arrows, tables, and digits.
 * - Image data URLs / image links are replaced by their deterministic hash token so two questions
 *   with identical text ("Quan sát sơ đồ sau:") but different diagrams NEVER collide!
 */
function normalizeRichTextForSignature(raw?: string): string {
  if (!raw) return '';
  const withImageHashes = raw.replace(/!\[([^\]]*)\]\(([^)]+)\)/gi, (_m, _alt, url: string) => {
    const cleanUrl = (url || '').trim();
    return ` [[IMG:${hashStringDeterministic(cleanUrl)}]] `;
  });

  return withImageHashes
    .replace(/\r\n/g, '\n')
    .replace(/\u00A0/g, ' ')
    // Normalize surrounding bold/italic markdown noise while preserving sub/sup/math/chemistry
    .replace(/\*\*\s*|\s*\*\*/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .trim()
    .toLowerCase();
}

/**
 * Builds a rich, formula-aware, image-aware structural fingerprint for a Question.
 * Does NOT rely solely on naive plain text — accounts for:
 * - Question type
 * - Content (with preserved formulas, sub/superscripts, tables, and inline image hashes)
 * - Standalone imageUrl hash
 * - Options (for Part I)
 * - Statements (for Part II)
 * - Acceptable answers (for Part III)
 */
export function buildQuestionDuplicateSignature(question: Question): string {
  const typePart = question.type || 'part1_single_choice';
  const contentPart = normalizeRichTextForSignature(question.content);
  const standaloneImgPart = question.imageUrl?.trim()
    ? `IMGURL:${hashStringDeterministic(question.imageUrl.trim())}`
    : '';

  const allImgHashes = extractQuestionImageUrls(question)
    .map((u) => hashStringDeterministic(u))
    .join(',');

  let structurePart = '';
  if (typePart === 'part1_single_choice' || typePart === 'part1_multiple_choice') {
    const opts = (question.options || [])
      .map((o) => `${(o.id || '').toUpperCase()}:${normalizeRichTextForSignature(o.text)}`)
      .join('|');
    const ans =
      typePart === 'part1_multiple_choice'
        ? (question.correctOptionIds || []).slice().sort().join(',')
        : (question.correctOptionId || '').toUpperCase();
    structurePart = `OPTS[${opts}]|ANS[${ans}]`;
  } else if (typePart === 'part2_true_false') {
    const stmts = (question.statements || [])
      .map(
        (s) =>
          `${(s.id || '').toLowerCase()}:${normalizeRichTextForSignature(s.statement)}=${
            s.correctAnswer ? 'T' : 'F'
          }`
      )
      .join('|');
    structurePart = `STMTS[${stmts}]`;
  } else if (typePart === 'part3_short_answer') {
    const acceptable = (question.shortAnswerConfig?.acceptableAnswers || [])
      .map((a) => a.trim().toLowerCase())
      .filter(Boolean)
      .sort()
      .join('|');
    structurePart = `SHORT[${acceptable}]`;
  }

  return `${typePart}||${contentPart}||${standaloneImgPart}||IMGS[${allImgHashes}]||${structurePart}`;
}

/**
 * Checks each candidate question against the teacher's existing Firestore question bank
 * as well as earlier items in the same selection batch.
 */
export function detectWordDuplicateQuestions(
  candidates: Question[],
  existingBankQuestions: Question[]
): Map<string, DuplicateMatchInfo> {
  const existingBySignature = new Map<string, Question>();
  for (const existing of existingBankQuestions) {
    const sig = buildQuestionDuplicateSignature(existing);
    if (!existingBySignature.has(sig)) {
      existingBySignature.set(sig, existing);
    }
  }

  const seenInSelection = new Map<string, Question>();
  const results = new Map<string, DuplicateMatchInfo>();

  for (const q of candidates) {
    const sig = buildQuestionDuplicateSignature(q);
    const existingMatch = existingBySignature.get(sig);
    if (existingMatch) {
      results.set(q.id, {
        questionId: q.id,
        isDuplicate: true,
        duplicateScope: 'firestore_bank',
        matchedQuestionId: existingMatch.id,
        matchedQuestionCode: existingMatch.code,
        reason: `Trùng nội dung, công thức/hình ảnh và cấu trúc với câu hỏi "${existingMatch.code}" đã có trong ngân hàng.`,
      });
      continue;
    }

    const batchMatch = seenInSelection.get(sig);
    if (batchMatch) {
      results.set(q.id, {
        questionId: q.id,
        isDuplicate: true,
        duplicateScope: 'within_selection',
        matchedQuestionId: batchMatch.id,
        matchedQuestionCode: batchMatch.code,
        reason: `Trùng lặp với câu "${batchMatch.code}" ngay trong danh sách vừa bóc tách.`,
      });
      continue;
    }

    seenInSelection.set(sig, q);
    results.set(q.id, {
      questionId: q.id,
      isDuplicate: false,
    });
  }

  return results;
}

const VALID_GRADES = new Set<ChemGrade>(['10', '11', '12', 'chuyen_hsg']);
const VALID_LEVELS = new Set<CognitiveLevel>(['nhan_biet', 'thong_hieu', 'van_dung', 'van_dung_cao']);
const VALID_TYPES = new Set<QuestionType>([
  'part1_single_choice',
  'part1_multiple_choice',
  'part2_true_false',
  'part3_short_answer',
]);

function inferLegacyTopic(lessonName?: string, chapterName?: string, fallback?: ChemTopic): ChemTopic {
  const haystack = `${chapterName || ''} ${lessonName || ''}`.toLowerCase();
  if (/thực nghiệm|thí nghiệm|ứng dụng/.test(haystack)) return 'hoa_thuc_nghiem';
  if (/chuyên đề|học sinh giỏi|hsg/.test(haystack)) return 'chuyen_sau_hsg';
  if (
    /ester|lipid|chất béo|xà phòng|carbohydrate|glucoz|fructoz|saccaroz|tinh bột|cellulose|amine|amino|peptide|protein|polymer|polime|tơ|cao su|nhựa|hữu cơ|alkane|alkene|alkyne|arene|alcohol|phenol|aldehyde|ketone|carboxylic/.test(
      haystack
    )
  ) {
    return 'hoa_huu_co';
  }
  if (/pin điện|điện phân|điện hóa|thế điện cực|kim loại|sắt|đồng|nhôm|kiềm|phức chất|chuyển tiếp|vô cơ|halogen|nitrogen|sulfur/.test(haystack)) {
    return 'hoa_vo_co';
  }
  return fallback || 'hoa_dai_cuong';
}

function buildUniqueWordQuestionId(index: number): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `q_word_${Date.now()}_${index + 1}_${rand}`;
}

export function validateQuestionBeforeFirestoreSave(question: Question): string | null {
  if (!question.content || !question.content.trim()) {
    return 'Nội dung câu hỏi đang trống.';
  }
  if (question.content.length > MAX_QUESTION_CONTENT_CHARS) {
    return `Nội dung câu hỏi (kèm hình ảnh nhúng) vượt quá giới hạn lưu trữ an toàn (${Math.round(
      question.content.length / 1024
    )} KB > ${Math.round(MAX_QUESTION_CONTENT_CHARS / 1024)} KB). Vui lòng giảm dung lượng ảnh trong câu này.`;
  }
  if (question.imageUrl && question.imageUrl.length > MAX_QUESTION_IMAGE_URL_CHARS) {
    return 'Ảnh minh họa của câu hỏi vượt quá giới hạn dung lượng Firestore.';
  }
  if (question.explanation && question.explanation.length > MAX_QUESTION_EXPLANATION_CHARS) {
    return 'Lời giải chi tiết vượt quá giới hạn độ dài lưu trữ.';
  }
  if (!VALID_TYPES.has(question.type)) {
    return `Dạng câu hỏi "${question.type}" không hợp lệ.`;
  }
  if (!VALID_GRADES.has(question.grade)) {
    return `Khối lớp "${question.grade}" không hợp lệ.`;
  }
  if (!VALID_LEVELS.has(question.level)) {
    return `Mức độ nhận thức "${question.level}" không hợp lệ.`;
  }
  return null;
}

/**
 * Prepares a single parsed Word/PDF question with full classification metadata,
 * brand-new unique Firestore document ID, owner attribution, and image optimization.
 * Never mutates the original `raw` parsed question object.
 */
export async function buildPreparedWordQuestionForBank(
  raw: Question,
  index: number,
  ownerId: string,
  classification: WordBankClassificationInput,
  existingCodesSet: Set<string>,
  nowIso: string
): Promise<Question> {
  const optimized = await optimizeQuestionEmbeddedImages(raw);
  const perOverride = !classification.applyToAll
    ? classification.perQuestionMetadata?.[raw.id]
    : undefined;

  let subjectId: string;
  let subjectName: string;
  let grade: ChemGrade;
  let chapterId: string | undefined;
  let chapterName: string | undefined;
  let lessonId: string | undefined;
  let lessonName: string | undefined;
  let lessonTopic: string | undefined;
  let textbookSeries: string | undefined;

  if (classification.applyToAll) {
    // Batch mode: explicitly apply modal's selected classification to every question
    subjectId = classification.subjectId?.trim() || raw.subjectId || DEFAULT_SUBJECT_ID;
    subjectName = classification.subjectName?.trim() || raw.subjectName || DEFAULT_SUBJECT_NAME;
    grade = VALID_GRADES.has(classification.grade)
      ? classification.grade
      : VALID_GRADES.has(raw.grade)
      ? raw.grade
      : '12';
    chapterId = classification.chapterId?.trim() || undefined;
    chapterName = classification.chapterName?.trim() || undefined;
    lessonId = classification.lessonId?.trim() || undefined;
    lessonName = classification.lessonName?.trim() || undefined;
    lessonTopic = lessonName || undefined;
    textbookSeries = classification.textbookSeries?.trim() || undefined;
  } else {
    // Per-question mode: NEVER auto-apply bulk metadata; preserve each question's own or per-question configured metadata
    subjectId =
      perOverride?.subjectId?.trim() || raw.subjectId?.trim() || DEFAULT_SUBJECT_ID;
    subjectName =
      perOverride?.subjectName?.trim() || raw.subjectName?.trim() || DEFAULT_SUBJECT_NAME;
    grade =
      perOverride?.grade && VALID_GRADES.has(perOverride.grade)
        ? perOverride.grade
        : VALID_GRADES.has(raw.grade)
        ? raw.grade
        : '12';
    chapterId =
      perOverride !== undefined
        ? perOverride.chapterId?.trim() || undefined
        : raw.chapterId?.trim() || undefined;
    chapterName =
      perOverride !== undefined
        ? perOverride.chapterName?.trim() || undefined
        : raw.chapterName?.trim() || undefined;
    lessonId =
      perOverride !== undefined
        ? perOverride.lessonId?.trim() || undefined
        : raw.lessonId?.trim() || undefined;
    lessonName =
      perOverride !== undefined
        ? perOverride.lessonName?.trim() || undefined
        : raw.lessonName?.trim() || undefined;
    lessonTopic =
      lessonName ||
      (perOverride !== undefined ? undefined : raw.lessonTopic?.trim() || undefined);
    textbookSeries =
      perOverride !== undefined
        ? perOverride.textbookSeries?.trim() || undefined
        : raw.textbookSeries?.trim() || undefined;
  }

  const level: CognitiveLevel =
    classification.levelMode === 'apply_all'
      ? classification.defaultLevel
      : VALID_LEVELS.has(raw.level)
      ? raw.level
      : classification.defaultLevel;
  const type: QuestionType =
    classification.typeMode === 'apply_all'
      ? classification.defaultType
      : VALID_TYPES.has(raw.type)
      ? raw.type
      : classification.defaultType;

  const topic = inferLegacyTopic(lessonName || lessonTopic, chapterName, raw.topic);
  const source =
    (raw.source && raw.source.trim()) ||
    classification.sourceLabel.trim() ||
    'Import từ Word/PDF';

  // Ensure question code does not clash with existing bank codes
  let resolvedCode = (raw.code || '').trim();
  if (!resolvedCode || existingCodesSet.has(resolvedCode)) {
    resolvedCode = generateQuestionCode({ subjectId, grade, type });
    let suffix = 1;
    while (existingCodesSet.has(resolvedCode)) {
      suffix++;
      resolvedCode = `${generateQuestionCode({ subjectId, grade, type })}_${suffix}`;
    }
  }
  existingCodesSet.add(resolvedCode);

  const newId = buildUniqueWordQuestionId(index);

  // Clone nested question-type structures so source parsed objects are never mutated
  const clonedOptions = optimized.options
    ? optimized.options.map((o) => ({ ...o }))
    : undefined;
  const clonedCorrectOptionIds = Array.isArray(optimized.correctOptionIds)
    ? [...optimized.correctOptionIds]
    : undefined;
  const clonedStatements = optimized.statements
    ? optimized.statements.map((s) => ({ ...s }))
    : undefined;
  const clonedShortAnswerConfig = optimized.shortAnswerConfig
    ? {
        ...optimized.shortAnswerConfig,
        acceptableAnswers: [...(optimized.shortAnswerConfig.acceptableAnswers || [])],
      }
    : undefined;

  const prepared: Question = {
    ...optimized,
    id: newId,
    code: resolvedCode,
    type,
    subjectId,
    subjectName,
    grade,
    topic,
    chapterId,
    chapterName,
    lessonId,
    lessonName,
    lessonTopic,
    textbookSeries,
    level,
    options: clonedOptions,
    correctOptionIds: clonedCorrectOptionIds,
    statements: clonedStatements,
    shortAnswerConfig: clonedShortAnswerConfig,
    source: source.slice(0, 300),
    ownerId,
    authorId: ownerId,
    parseStatus: raw.parseStatus === 'error' ? 'needs_review' : raw.parseStatus || 'verified',
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  // Strip undefined optional fields cleanly
  if (!chapterId) delete prepared.chapterId;
  if (!chapterName) delete prepared.chapterName;
  if (!lessonId) delete prepared.lessonId;
  if (!lessonName) delete prepared.lessonName;
  if (!lessonTopic) delete prepared.lessonTopic;
  if (!textbookSeries) delete prepared.textbookSeries;
  if (!clonedOptions) delete prepared.options;
  if (!clonedCorrectOptionIds) delete prepared.correctOptionIds;
  if (!clonedStatements) delete prepared.statements;
  if (!clonedShortAnswerConfig) delete prepared.shortAnswerConfig;

  return prepared;
}

/**
 * Persists selected Word-parsed questions directly to Firestore `/questions/{questionId}`
 * with real authentication check, authoritative live duplicate detection, per-question
 * error isolation (one failure never silently wipes other questions), and accurate summary.
 */
export async function persistWordQuestionsToBank(params: {
  selectedQuestions: Question[];
  classification: WordBankClassificationInput;
  adapter: WordQuestionPersistenceAdapter;
  onProgress?: (done: number, total: number, currentCode: string) => void;
}): Promise<WordBankSaveResult> {
  const { selectedQuestions, classification, adapter, onProgress } = params;
  const totalSelected = selectedQuestions.length;

  const uid = adapter.getCurrentUid();
  if (!uid) {
    return {
      totalSelected,
      savedQuestions: [],
      savedSourceIds: [],
      skippedDuplicates: [],
      failedItems: selectedQuestions.map((q) => ({
        question: q,
        error: 'Chưa xác thực tài khoản Firebase Authentication. Vui lòng đăng nhập lại trước khi lưu câu hỏi.',
      })),
      sourceCollection: 'questions',
    };
  }

  if (totalSelected === 0) {
    return {
      totalSelected: 0,
      savedQuestions: [],
      savedSourceIds: [],
      skippedDuplicates: [],
      failedItems: [],
      sourceCollection: 'questions',
    };
  }

  // Always fetch latest teacher questions from Firestore before duplicate checking
  let existingBankQuestions: Question[] = [];
  try {
    existingBankQuestions = await adapter.fetchExistingTeacherQuestions(uid);
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : 'Không thể kết nối Firestore để kiểm tra ngân hàng câu hỏi hiện tại.';
    return {
      totalSelected,
      savedQuestions: [],
      savedSourceIds: [],
      skippedDuplicates: [],
      failedItems: selectedQuestions.map((q) => ({
        question: q,
        error: `Lỗi đọc Firestore trước khi lưu: ${message}`,
      })),
      sourceCollection: 'questions',
    };
  }

  const duplicateMap = detectWordDuplicateQuestions(selectedQuestions, existingBankQuestions);
  const existingCodesSet = new Set(existingBankQuestions.map((q) => q.code).filter(Boolean));
  const nowIso = new Date().toISOString();

  const savedQuestions: Question[] = [];
  const savedSourceIds: string[] = [];
  const skippedDuplicates: WordBankSkippedDuplicate[] = [];
  const failedItems: WordBankFailedItem[] = [];

  let processed = 0;

  for (let i = 0; i < selectedQuestions.length; i++) {
    const rawQ = selectedQuestions[i];
    const dupInfo = duplicateMap.get(rawQ.id);

    if (classification.skipDuplicates && dupInfo?.isDuplicate) {
      skippedDuplicates.push({
        question: rawQ,
        duplicateScope: dupInfo.duplicateScope || 'firestore_bank',
        matchedQuestionId: dupInfo.matchedQuestionId,
        matchedQuestionCode: dupInfo.matchedQuestionCode,
        reason: dupInfo.reason || 'Câu hỏi đã tồn tại trong ngân hàng.',
      });
      processed++;
      onProgress?.(processed, totalSelected, rawQ.code || `Câu ${i + 1}`);
      continue;
    }

    try {
      const prepared = await buildPreparedWordQuestionForBank(
        rawQ,
        i,
        uid,
        classification,
        existingCodesSet,
        nowIso
      );

      const validationErr = validateQuestionBeforeFirestoreSave(prepared);
      if (validationErr) {
        failedItems.push({ question: rawQ, error: validationErr });
        processed++;
        onProgress?.(processed, totalSelected, prepared.code);
        continue;
      }

      const persisted = await adapter.createQuestion(prepared, uid);
      savedQuestions.push(persisted);
      savedSourceIds.push(rawQ.id);
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Firestore từ chối ghi câu hỏi này. Vui lòng kiểm tra kết nối và quyền tài khoản.';
      failedItems.push({ question: rawQ, error: msg });
    } finally {
      processed++;
      onProgress?.(processed, totalSelected, rawQ.code || `Câu ${i + 1}`);
    }
  }

  return {
    totalSelected,
    savedQuestions,
    savedSourceIds,
    skippedDuplicates,
    failedItems,
    sourceCollection: 'questions',
  };
}
