import mammoth from 'mammoth';
import {
  Question,
  QuestionType,
  ParsedExamResult,
  MultipleChoiceOption,
  TrueFalseStatement,
  DetectedExamSection,
  SectionDetectionMethod,
} from '../types';
import { extractComprehensiveAnswerKeys, buildAnswerRecognitionItems } from './answerRecognizer';
import { isolateAnswerBlock } from './answerExtractionEngine/documentTableReader';
import { parseDocxWithEquations, DocxEquationWarning } from './docxEquationParser';
import {
  detectSectionHeader,
  detectSectionHeaderDetailed,
  isSectionSubtitleLine,
  SectionDetectionCandidate,
} from './sectionDetector';

export { detectSectionHeader, detectSectionHeaderDetailed };
export type { SectionDetectionCandidate };

/**
 * Extracts rich markdown text from a DOCX ArrayBuffer,
 * preserving Office Math (OMML), chemical formulas, subscripts, equations, and tables.
 */
export async function extractTextFromDocx(arrayBuffer: ArrayBuffer): Promise<string> {
  try {
    const res = await parseDocxWithEquations(arrayBuffer);
    if (res && res.fullMarkdownText && res.fullMarkdownText.trim().length > 20) {
      return res.fullMarkdownText;
    }
  } catch (err) {
    console.warn('parseDocxWithEquations fallback to mammoth:', err);
  }

  try {
    const result = await mammoth.extractRawText({ arrayBuffer });
    return result.value;
  } catch (err) {
    console.error('Mammoth docx extraction error:', err);
    throw new Error('Không thể đọc nội dung file Word (.docx). Vui lòng thử lại.');
  }
}

/**
 * Extracts and parses a DOCX exam in one pass while preserving OMML conversion warnings
 * and unsupported equation XML fragments.
 */
export async function parseDocxExam(
  arrayBuffer: ArrayBuffer,
  defaultGrade: '10' | '11' | '12' | 'chuyen_hsg' = '12'
): Promise<{ text: string; result: ParsedExamResult }> {
  try {
    const res = await parseDocxWithEquations(arrayBuffer);
    if (res && res.fullMarkdownText && res.fullMarkdownText.trim().length > 20) {
      const result = parseExamContent(res.fullMarkdownText, defaultGrade, {
        equationWarnings: res.warnings,
      });
      return { text: res.fullMarkdownText, result };
    }
  } catch (err) {
    console.warn('parseDocxExam fallback to mammoth:', err);
  }

  const fallbackText = await extractTextFromDocx(arrayBuffer);
  return { text: fallbackText, result: parseExamContent(fallbackText, defaultGrade) };
}

/**
 * Extracts text from a PDF ArrayBuffer using pdfjs-dist,
 * reconstructing line breaks from Y-coordinates and hasEOL markers so section headers stay on separate lines.
 */
export async function extractTextFromPdf(arrayBuffer: ArrayBuffer): Promise<string> {
  try {
    const pdfjsLib = await import('pdfjs-dist');
    const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) });
    const pdf = await loadingTask.promise;
    let fullText = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      let pageText = '';
      let lastY: number | null = null;
      for (const item of textContent.items as any[]) {
        const str = typeof item.str === 'string' ? item.str : '';
        const y = Array.isArray(item.transform) ? item.transform[5] : null;
        if (lastY !== null && y !== null && Math.abs(y - lastY) > 4) {
          pageText += '\n';
        } else if (
          pageText.length > 0 &&
          !pageText.endsWith('\n') &&
          !pageText.endsWith(' ') &&
          str &&
          !str.startsWith(' ')
        ) {
          pageText += ' ';
        }
        pageText += str;
        if (item.hasEOL) {
          pageText += '\n';
          lastY = null;
        } else if (y !== null && str.trim()) {
          lastY = y;
        }
      }
      fullText += pageText + '\n\n';
    }
    return fullText;
  } catch (err) {
    console.warn('PDF extraction warning:', err);
    return '';
  }
}

/**
 * Cleans trailing unmatched markdown bold markers (e.g. from Word run splitting "**Câu 1.** **Text**" or "**Câu 1. Text**")
 */
function cleanStrayBoldEdge(text: string): string {
  let cleaned = text.trim();
  const boldMarkerCount = (cleaned.match(/\*\*/g) || []).length;
  if (boldMarkerCount % 2 === 1) {
    if (cleaned.startsWith('**')) {
      cleaned = cleaned.slice(2).trim();
    } else if (cleaned.endsWith('**')) {
      cleaned = cleaned.slice(0, -2).trim();
    }
  }
  return cleaned;
}

/**
 * Matches question headers across Word formatting (bold, italic, underline, markdown headings, single-cell tables)
 * e.g. "Câu 1.", "**Câu 1.**", "<u>Câu 2:</u>", "Câu 3 (Biết):", "Bài 1:"
 */
function matchQuestionStart(rawLine: string): { num: number; rest: string } | null {
  let line = rawLine.trim();
  if (!line || /^[\-–—=_|.\s]+$/.test(line)) return null;

  // Unwrap outer table pipe for single-cell or table-laid-out questions
  if (line.startsWith('|') && line.endsWith('|')) {
    const innerCells = line.slice(1, -1).split('|').map(c => c.trim()).filter(Boolean);
    if (innerCells.length === 1) {
      line = innerCells[0];
    }
  }

  const regex =
    /^(?:[\s#*>_|]*|<\/?(?:b|u|i|strong|em)>)*(?:Câu|Bài)\s+(\d+)(?:[\s*_]*|<\/?(?:b|u|i|strong|em)>)*(?:\s*[\(\[][^\)\]]*[\)\]])?(?:[\s*_]*|<\/?(?:b|u|i|strong|em)>)*(?:[.:–—\-]+\s*|\s*$)(?:[\s*_]*|<\/?(?:b|u|i|strong|em)>)*(.*)$/i;
  const m = line.match(regex);
  if (!m) return null;

  const num = parseInt(m[1], 10);
  if (isNaN(num)) return null;
  const rest = cleanStrayBoldEdge(m[2] || '');
  return { num, rest };
}

/**
 * Robust extractor for Part II statements (a, b, c, d)
 * Handles multiline, inline, Word bold/underline formatting, table rows, and trailing inline truth values
 */
export function extractPart2Statements(fullText: string): {
  prompt: string;
  statements: TrueFalseStatement[];
} {
  // Marker regex for lowercase a, b, c, d (allows optional Word bold/HTML wrappers around markers)
  const markerRegex =
    /(?:^|\n|[\s;,])(?:\*{2,3}|<\/?(?:b|u|strong|i|em)>)*(?:[Ýý]\s*)?(?:\(?([a-d])(?:\*{2,3}|<\/?(?:b|u|strong|i|em)>)*(?:[\)\]]\s*|[\].:\/–—]\s+)|\(([a-d])\)\s+)(?:\*{2,3}|<\/?(?:b|u|strong|i|em)>)*\s*/g;
  const matches = [...fullText.matchAll(markerRegex)];

  const subMatches: { letter: 'a' | 'b' | 'c' | 'd'; index: number; fullMatchLength: number }[] = [];
  const expectedOrder: ('a' | 'b' | 'c' | 'd')[] = ['a', 'b', 'c', 'd'];
  let currentExpectedIdx = 0;

  for (const m of matches) {
    const letter = (m[1] || m[2]).toLowerCase() as 'a' | 'b' | 'c' | 'd';
    if (letter === expectedOrder[currentExpectedIdx]) {
      subMatches.push({
        letter,
        index: m.index !== undefined ? m.index : 0,
        fullMatchLength: m[0].length,
      });
      currentExpectedIdx++;
      if (currentExpectedIdx >= 4) break;
    }
  }

  // Must have at least 2 consecutive sub-statements to qualify as Part II
  if (subMatches.length < 2) {
    return { prompt: fullText, statements: [] };
  }

  const firstSub = subMatches[0];
  const prompt = cleanStrayBoldEdge(fullText.slice(0, firstSub.index));
  const statements: TrueFalseStatement[] = [];

  for (let i = 0; i < subMatches.length; i++) {
    const curr = subMatches[i];
    const textStart = curr.index + curr.fullMatchLength;
    const textEnd = i + 1 < subMatches.length ? subMatches[i + 1].index : fullText.length;
    let stmtText = cleanStrayBoldEdge(fullText.slice(textStart, textEnd));

    // Check for inline answer tag: "[Đúng]", "(Đ)", "- Đúng", ": Đúng", "[Sai]", "(S)", "- Sai", ": Sai"
    let inlineAnswer: boolean | undefined = undefined;
    const tfMatch = stmtText.match(/(?:[\s\-–—:]+|\s*[\[\(])\s*(Đúng|Sai|True|False|Đ|S)\s*[\]\)]?\s*$/i);
    if (tfMatch) {
      const val = tfMatch[1].trim();
      inlineAnswer = /^(Đ|ĐÚNG|TRUE|T|D)$/i.test(val);
      stmtText = stmtText.slice(0, tfMatch.index).trim();
    }

    statements.push({
      id: curr.letter,
      statement: stmtText,
      correctAnswer: inlineAnswer !== undefined ? inlineAnswer : false,
      explanation: inlineAnswer !== undefined ? (inlineAnswer ? 'Đúng' : 'Sai') : undefined,
    });
  }

  return { prompt: prompt || fullText, statements };
}

/**
 * Robust extractor for Part I options (A, B, C, D)
 * Handles multiline, inline, Word bold/underline formatting, single-asterisk (*), and tags
 */
export function extractPart1Options(fullText: string): {
  prompt: string;
  options: MultipleChoiceOption[];
  correctOptionId?: string;
} {
  const markerRegex =
    /(?:^|\n|[\s;,])(?:\*{2,3}|<\/?(?:b|u|strong|i|em)>)*(?:\(?([A-D])(?:\*{2,3}|<\/?(?:b|u|strong|i|em)>)*(?:[\)\]]\s*|[\].:\/–—]\s+)|\(([A-D])\)\s+)(?:\*{2,3}|<\/?(?:b|u|strong|i|em)>)*\s*/g;
  const matches = [...fullText.matchAll(markerRegex)];

  const optMatches: { letter: string; index: number; fullMatchLength: number }[] = [];
  const expectedOrder = ['A', 'B', 'C', 'D'];
  let currentExpectedIdx = 0;

  for (const m of matches) {
    const letter = (m[1] || m[2]).toUpperCase();
    if (letter === expectedOrder[currentExpectedIdx]) {
      optMatches.push({
        letter,
        index: m.index !== undefined ? m.index : 0,
        fullMatchLength: m[0].length,
      });
      currentExpectedIdx++;
      if (currentExpectedIdx >= 4) break;
    }
  }

  if (optMatches.length < 2) {
    return { prompt: fullText, options: [] };
  }

  const firstOpt = optMatches[0];
  const prompt = cleanStrayBoldEdge(fullText.slice(0, firstOpt.index));
  const options: MultipleChoiceOption[] = [];
  let correctOptionId: string | undefined = undefined;

  for (let i = 0; i < optMatches.length; i++) {
    const curr = optMatches[i];
    const textStart = curr.index + curr.fullMatchLength;
    const textEnd = i + 1 < optMatches.length ? optMatches[i + 1].index : fullText.length;
    let optText = cleanStrayBoldEdge(fullText.slice(textStart, textEnd));

    // Only treat single '*' (not Word bold '**') or explicit [Đúng]/(Đúng) as inline answer marker
    const isCorrect =
      /^\*(?!\*)/.test(optText) ||
      /(?<!\*)\*$/.test(optText) ||
      /\[Đúng\]|\(Đúng\)/i.test(optText);
    optText = optText
      .replace(/^\*(?!\*)|(?<!\*)\*$|\[Đúng\]|\(Đúng\)/gi, '')
      .trim();

    if (isCorrect) {
      correctOptionId = curr.letter;
    }

    options.push({
      id: curr.letter,
      text: optText,
      isCorrect: isCorrect || undefined,
    });
  }

  return { prompt: prompt || fullText, options, correctOptionId };
}

/**
 * Robust extractor for Part III short answers
 */
export function extractPart3Data(fullText: string): {
  prompt: string;
  inlineAnswer?: string;
} {
  let prompt = fullText.trim();
  let inlineAnswer: string | undefined = undefined;

  const ansMatch = prompt.match(
    /(?:^|\n)\s*(?:Đáp\s*án|Trả\s*lời|KQ|Kết\s*quả)[\s.:\-–—=]+([-+]?\d+(?:[,.]\d+)?(?:\/\d+)?(?:\s*[a-zA-Z%°]+)?)\s*$/i
  );
  if (ansMatch) {
    inlineAnswer = ansMatch[1].trim();
    prompt = prompt.slice(0, ansMatch.index).trim();
  }

  return { prompt, inlineAnswer };
}

interface InternalSectionTracker {
  id: string;
  rawTitle: string;
  candidateType: QuestionType | 'ambiguous';
  detectionMethod: SectionDetectionMethod;
  confidence: number;
  needsConfirmation: boolean;
  warning?: string;
}

interface RawQuestionBlock {
  promptNum: number;
  sectionId: string;
  rawText: string;
}

/**
 * Rebuilds a Question object when its QuestionType is manually changed by the teacher,
 * using its rawSourceText (without inventing fake A/B/C/D options for Part III).
 */
export function reclassifyQuestionType(q: Question, targetType: QuestionType): Question {
  const sourceText = q.rawSourceText || rebuildSourceFromQuestion(q);
  const now = new Date().toISOString();
  const prefix = targetType === 'part1_single_choice' ? 'P1' : targetType === 'part2_true_false' ? 'P2' : 'P3';
  const promptNumMatch = q.code.match(/_C(\d+)$/i);
  const promptNum = promptNumMatch ? promptNumMatch[1] : '1';
  const newCode = `H_${q.grade}_${prefix}_C${promptNum}`;

  if (targetType === 'part1_single_choice') {
    const mc = extractPart1Options(sourceText);
    const correctOptId = q.correctOptionId || mc.correctOptionId;
    const options = mc.options.map(o => ({ ...o, isCorrect: correctOptId ? o.id === correctOptId : o.isCorrect }));
    const isOk = options.length >= 2 && !!correctOptId;
    return {
      ...q,
      code: newCode,
      type: 'part1_single_choice',
      content: mc.prompt || sourceText,
      options,
      correctOptionId: correctOptId,
      statements: undefined,
      shortAnswerConfig: undefined,
      rawSourceText: sourceText,
      parseStatus: isOk ? 'verified' : 'needs_review',
      parseWarning: options.length < 2
        ? 'Không tìm thấy đủ các lựa chọn A, B, C, D — vui lòng kiểm tra hoặc chỉnh sửa'
        : !correctOptId
        ? 'Chưa có đáp án chính thức'
        : undefined,
      teacherVerified: isOk,
      updatedAt: now,
    };
  }

  if (targetType === 'part2_true_false') {
    const tf = extractPart2Statements(sourceText);
    const statements = tf.statements.length > 0 ? tf.statements : (q.statements || []);
    const allAssigned =
      statements.length >= 2 &&
      statements.every(st => st.explanation === 'Đúng' || st.explanation === 'Sai');
    return {
      ...q,
      code: newCode,
      type: 'part2_true_false',
      content: tf.prompt || sourceText,
      options: undefined,
      correctOptionId: undefined,
      statements,
      shortAnswerConfig: undefined,
      rawSourceText: sourceText,
      parseStatus: statements.length >= 2 && allAssigned ? 'verified' : 'needs_review',
      parseWarning: statements.length < 2
        ? 'Chưa tách được các ý a, b, c, d — vui lòng kiểm tra hoặc chỉnh sửa'
        : !allAssigned
        ? 'Chưa có đáp án chính thức cho tất cả các ý'
        : undefined,
      teacherVerified: statements.length >= 2 && allAssigned,
      updatedAt: now,
    };
  }

  // targetType === 'part3_short_answer' — never generate fake A/B/C/D options
  const { prompt, inlineAnswer } = extractPart3Data(sourceText);
  const existingAns = q.shortAnswerConfig?.acceptableAnswers?.[0] || inlineAnswer || '';
  const hasAnswer = !!existingAns;
  return {
    ...q,
    code: newCode,
    type: 'part3_short_answer',
    content: prompt,
    options: undefined,
    correctOptionId: undefined,
    statements: undefined,
    shortAnswerConfig: {
      acceptableAnswers: hasAnswer
        ? (q.shortAnswerConfig?.acceptableAnswers?.length
            ? q.shortAnswerConfig.acceptableAnswers
            : [existingAns, existingAns.replace(',', '.'), existingAns.replace('.', ',')])
        : [],
      isNumeric: !isNaN(Number(existingAns.replace(',', '.'))),
      numericValue: hasAnswer ? parseFloat(existingAns.replace(',', '.') || '0') : undefined,
      tolerance: 0.05,
    },
    rawSourceText: sourceText,
    parseStatus: hasAnswer ? 'verified' : 'needs_review',
    parseWarning: hasAnswer ? undefined : 'Chưa có đáp án chính thức',
    teacherVerified: hasAnswer,
    updatedAt: now,
  };
}

function rebuildSourceFromQuestion(q: Question): string {
  const parts: string[] = [q.content];
  if (q.options && q.options.length > 0) {
    q.options.forEach(o => parts.push(`${o.id}. ${o.text}`));
  }
  if (q.statements && q.statements.length > 0) {
    q.statements.forEach(s => parts.push(`${s.id}) ${s.statement}`));
  }
  return parts.join('\n');
}

/**
 * Recalculates all summary counts, answer recognition items, and detected section stats
 * after questions or sections are modified in the UI.
 */
export function recalculateParsedExamResult(
  base: ParsedExamResult,
  questions: Question[],
  sectionsOverride?: DetectedExamSection[],
  sectionsConfirmed?: boolean
): ParsedExamResult {
  const part1Questions = questions.filter(q => q.type === 'part1_single_choice');
  const part2Questions = questions.filter(q => q.type === 'part2_true_false');
  const part3Questions = questions.filter(q => q.type === 'part3_short_answer');

  const part1Count = part1Questions.length;
  const part2Count = part2Questions.length;
  const part2StatementsCount = part2Questions.reduce((sum, q) => sum + (q.statements?.length || 0), 0);
  const part3Count = part3Questions.length;

  // Rebuild answerItems cleanly while preserving existing verified answers by questionId
  const existingItemMap = new Map(base.answerItems.map(it => [`${it.questionId}_${it.subQuestion || ''}`, it]));
  const answerItems: ParsedExamResult['answerItems'] = [];
  let p1Idx = 1;
  let p2Idx = 1;
  let p3Idx = 1;

  for (const q of questions) {
    if (q.type === 'part1_single_choice') {
      const qNum = p1Idx++;
      const prev = existingItemMap.get(`${q.id}_`);
      const ans = q.correctOptionId || prev?.correctAnswer || '';
      answerItems.push({
        id: `I.${qNum}`,
        questionId: q.id,
        section: 'part1',
        questionNumber: qNum,
        answerType: 'choice',
        correctAnswer: ans,
        recognitionStatus: ans ? 'verified' : 'not_found',
        recognitionSource: prev?.recognitionSource || q.recognitionSource || 'manual',
        teacherVerified: ans ? (q.teacherVerified ?? prev?.teacherVerified ?? true) : false,
        notes: prev?.notes,
      });
    } else if (q.type === 'part2_true_false') {
      const qNum = p2Idx++;
      const stmts = q.statements && q.statements.length > 0
        ? q.statements
        : [
            { id: 'a', statement: '', correctAnswer: false },
            { id: 'b', statement: '', correctAnswer: false },
            { id: 'c', statement: '', correctAnswer: false },
            { id: 'd', statement: '', correctAnswer: false },
          ];
      stmts.forEach(st => {
        const prev = existingItemMap.get(`${q.id}_${st.id}`);
        const hasVal = st.explanation === 'Đúng' || st.explanation === 'Sai' || prev?.recognitionStatus === 'verified';
        const ansStr = hasVal ? (st.correctAnswer ? 'Đ' : 'S') : '';
        answerItems.push({
          id: `II.${qNum}${st.id}`,
          questionId: q.id,
          section: 'part2',
          questionNumber: qNum,
          subQuestion: st.id as 'a' | 'b' | 'c' | 'd',
          answerType: 'true_false',
          correctAnswer: ansStr,
          recognitionStatus: hasVal ? 'verified' : 'not_found',
          recognitionSource: prev?.recognitionSource || q.recognitionSource || 'manual',
          teacherVerified: hasVal,
          notes: st.statement?.slice(0, 50),
        });
      });
    } else {
      const qNum = p3Idx++;
      const prev = existingItemMap.get(`${q.id}_`);
      const ans = q.shortAnswerConfig?.acceptableAnswers?.[0] || prev?.correctAnswer || '';
      answerItems.push({
        id: `III.${qNum}`,
        questionId: q.id,
        section: 'part3',
        questionNumber: qNum,
        answerType: 'short_answer',
        correctAnswer: ans,
        acceptedAnswers: q.shortAnswerConfig?.acceptableAnswers || prev?.acceptedAnswers || [],
        tolerance: q.shortAnswerConfig?.tolerance ?? 0.05,
        recognitionStatus: ans ? 'verified' : 'not_found',
        recognitionSource: prev?.recognitionSource || q.recognitionSource || 'manual',
        teacherVerified: !!ans,
        notes: prev?.notes,
      });
    }
  }

  const part1FoundCount = answerItems.filter(it => it.section === 'part1' && it.recognitionStatus === 'verified' && it.correctAnswer).length;
  const part2StatementsFoundCount = answerItems.filter(it => it.section === 'part2' && it.recognitionStatus === 'verified' && it.correctAnswer).length;
  const part3FoundCount = answerItems.filter(it => it.section === 'part3' && it.recognitionStatus === 'verified' && it.correctAnswer).length;

  const part1TotalCount = answerItems.filter(it => it.section === 'part1').length;
  const part2StatementsTotalCount = answerItems.filter(it => it.section === 'part2').length;
  const part3TotalCount = answerItems.filter(it => it.section === 'part3').length;

  const questionsWithAnswers = questions.filter(q => {
    if (q.type === 'part1_single_choice') return !!q.correctOptionId;
    if (q.type === 'part2_true_false') return q.statements && q.statements.length > 0 && q.teacherVerified;
    if (q.type === 'part3_short_answer') return q.shortAnswerConfig && q.shortAnswerConfig.acceptableAnswers.length > 0;
    return false;
  }).length;

  const updatedSections = (sectionsOverride || base.detectedSections || []).map(sec => {
    const secQs = questions.filter(q => q.sectionId === sec.id);
    return {
      ...sec,
      questionCount: secQs.length,
      statementCount: secQs
        .filter(q => q.type === 'part2_true_false')
        .reduce((sum, q) => sum + (q.statements?.length || 0), 0),
    };
  });

  const hasAmbiguousSections = updatedSections.some(s => s.needsConfirmation && !s.teacherConfirmed);

  return {
    ...base,
    totalQuestions: questions.length,
    part1Count,
    part2Count,
    part2StatementsCount,
    part3Count,
    questionsWithAnswers,
    questionsMissingAnswers: questions.length - questionsWithAnswers,
    questionsWithWarnings: questions.filter(q => q.parseStatus !== 'verified').length,
    questions,
    answerItems,
    part1FoundCount,
    part1TotalCount,
    part2StatementsFoundCount,
    part2StatementsTotalCount,
    part3FoundCount,
    part3TotalCount,
    allAnswersVerified: answerItems.length > 0 && answerItems.every(it => it.recognitionStatus === 'verified'),
    detectedSections: updatedSections,
    hasAmbiguousSections,
    sectionsConfirmed: sectionsConfirmed !== undefined ? sectionsConfirmed : !hasAmbiguousSections,
  };
}

/**
 * Parses Vietnamese Chemistry Exam text into structured Question array
 * supporting Part I (4-choice), Part II (True/False statements), and Part III (Short Answer)
 */
export function parseExamContent(
  rawText: string,
  defaultGrade: '10' | '11' | '12' | 'chuyen_hsg' = '12',
  extraMeta?: { equationWarnings?: DocxEquationWarning[] }
): ParsedExamResult {
  // 1. Isolate question content from answer keys and solutions
  const { answerSectionText } = isolateAnswerBlock(rawText);
  const examBodyText =
    rawText.includes(answerSectionText) && answerSectionText.length > 20
      ? rawText.slice(0, rawText.indexOf(answerSectionText))
      : rawText;

  const lines = (examBodyText.trim() ? examBodyText : rawText)
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean);

  // 2. Find exam title
  let title = 'Đề kiểm tra Hóa học';
  for (let i = 0; i < Math.min(8, lines.length); i++) {
    const line = lines[i];
    if (/ĐỀ (THI|KIỂM TRA|KHẢO SÁT|ÔN TẬP)/i.test(line) || /HÓA HỌC/i.test(line)) {
      title = line.replace(/^[#*_\s\-–—:|]+|[#*_\s\-–—:|]+$/g, '');
      break;
    }
  }

  // 3. Pre-extract Answer Keys matrix from the full document
  const answerKeys = extractComprehensiveAnswerKeys(rawText);

  // 4. Split question lines into distinct question blocks while tracking section transitions & metadata
  const sectionTrackers: InternalSectionTracker[] = [];
  const sectionTrackerById = new Map<string, InternalSectionTracker>();
  const questionBlocks: RawQuestionBlock[] = [];
  let activeSection: InternalSectionTracker | null = null;
  let activeBlock: { promptNum: number; sectionId: string; lines: string[] } | null = null;

  const ensureFallbackSection = (): InternalSectionTracker => {
    const id = `sec_${sectionTrackers.length + 1}`;
    const tracker: InternalSectionTracker = {
      id,
      rawTitle: 'Phần chưa có tiêu đề (Tự động suy luận)',
      candidateType: 'ambiguous',
      detectionMethod: 'structure_inferred',
      confidence: 0.6,
      needsConfirmation: true,
      warning: 'Không tìm thấy tiêu đề PHẦN I/II/III trước các câu hỏi — hệ thống tự suy luận dạng câu hỏi theo cấu trúc, vui lòng xác nhận.',
    };
    sectionTrackers.push(tracker);
    sectionTrackerById.set(id, tracker);
    return tracker;
  };

  const flushActiveBlock = () => {
    if (activeBlock && activeBlock.lines.length > 0) {
      questionBlocks.push({
        promptNum: activeBlock.promptNum,
        sectionId: activeBlock.sectionId,
        rawText: activeBlock.lines.join('\n').trim(),
      });
      activeBlock = null;
    }
  };

  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx];

    // Stop at end-of-exam markers ("Hết", "ĐÁP ÁN")
    if (/^[\-–—*_\s|]*HẾT[\-–—*_\s|]*$/i.test(line) || /^(?:BẢNG\s+)?ĐÁP\s*ÁN(?:\s*[:\-–—])?$/i.test(line)) {
      flushActiveBlock();
      break;
    }

    // Check for Section Header
    const secCandidate = detectSectionHeaderDetailed(line);
    if (secCandidate) {
      flushActiveBlock();

      // Merge up to 2 immediate subtitle lines (e.g. bare "PHẦN II" followed by "TRẮC NGHIỆM ĐÚNG SAI" or "(2,0 điểm)")
      let combinedRawTitle = secCandidate.rawTitle;
      let resolvedCandidate = secCandidate;

      for (let lookahead = 1; lookahead <= 2 && idx + 1 < lines.length; lookahead++) {
        const nextLine = lines[idx + 1];
        if (matchQuestionStart(nextLine)) break;
        if (/^[\-–—*_\s|]*HẾT[\-–—*_\s|]*$/i.test(nextLine) || /^(?:BẢNG\s+)?ĐÁP\s*ÁN/i.test(nextLine)) break;

        const nextHeader = detectSectionHeaderDetailed(nextLine);
        if (nextHeader && nextHeader.method === 'roman_header') {
          // Next line starts a distinct Roman section header (e.g., empty Part I followed directly by PHẦN II)
          break;
        }

        if (isSectionSubtitleLine(nextLine)) {
          const merged = detectSectionHeaderDetailed(`${combinedRawTitle} ${nextLine}`);
          if (merged && merged.type !== 'ambiguous') {
            resolvedCandidate = merged;
          }
          combinedRawTitle = `${combinedRawTitle} — ${nextLine.replace(/[*_`#|]+/g, '').trim()}`;
          idx++;
        } else {
          break;
        }
      }

      const secId = `sec_${sectionTrackers.length + 1}`;
      activeSection = {
        id: secId,
        rawTitle: combinedRawTitle,
        candidateType: resolvedCandidate.type,
        detectionMethod: resolvedCandidate.method,
        confidence: resolvedCandidate.confidence,
        needsConfirmation: resolvedCandidate.needsConfirmation,
        warning: resolvedCandidate.warning,
      };
      sectionTrackers.push(activeSection);
      sectionTrackerById.set(secId, activeSection);
      continue;
    }

    // Check for Question start: "Câu 1.", "**Câu 1:**", "Bài 1:"
    const qMatch = matchQuestionStart(line);
    if (qMatch) {
      flushActiveBlock();
      if (!activeSection) {
        activeSection = ensureFallbackSection();
      }
      activeBlock = {
        promptNum: qMatch.num,
        sectionId: activeSection.id,
        lines: qMatch.rest ? [qMatch.rest] : [],
      };
      continue;
    }

    // Continuation line for active question
    if (activeBlock) {
      activeBlock.lines.push(line);
    }
  }

  flushActiveBlock();

  // 5. Structure each question block into Question object, respecting explicit section headers
  const questions: Question[] = [];
  let p1Counter = 0;
  let p2Counter = 0;
  let p3Counter = 0;

  // Track structural mismatch stats per section
  const sectionMismatchCounts = new Map<string, { total: number; mc: number; tf: number; sa: number }>();

  for (let bIdx = 0; bIdx < questionBlocks.length; bIdx++) {
    const block = questionBlocks[bIdx];
    const rawContent = block.rawText;
    const promptNum = block.promptNum;
    const secTracker = sectionTrackerById.get(block.sectionId);

    const tfResult = extractPart2Statements(rawContent);
    const hasTFStatements = tfResult.statements.length >= 2;

    const mcResult = extractPart1Options(rawContent);
    const hasMCOptions = mcResult.options.length >= 2;

    if (!sectionMismatchCounts.has(block.sectionId)) {
      sectionMismatchCounts.set(block.sectionId, { total: 0, mc: 0, tf: 0, sa: 0 });
    }
    const secStat = sectionMismatchCounts.get(block.sectionId)!;
    secStat.total++;
    if (hasMCOptions) secStat.mc++;
    else if (hasTFStatements) secStat.tf++;
    else secStat.sa++;

    // Resolve Question Type:
    let finalType: QuestionType;
    let structureMismatchWarning: string | undefined;

    if (!secTracker || secTracker.candidateType === 'ambiguous') {
      // No clear header or ambiguous header -> infer strictly from internal question structure
      if (hasTFStatements && !hasMCOptions) {
        finalType = 'part2_true_false';
      } else if (hasMCOptions) {
        finalType = 'part1_single_choice';
      } else {
        finalType = 'part3_short_answer';
      }
    } else if (secTracker.candidateType === 'part1_single_choice') {
      if (hasTFStatements && !hasMCOptions) {
        finalType = 'part2_true_false';
        structureMismatchWarning = `Câu ${promptNum} nằm trong "${secTracker.rawTitle}" nhưng có các ý Đúng/Sai (a, b, c, d)`;
        secTracker.needsConfirmation = true;
        secTracker.warning =
          secTracker.warning ||
          `Phát hiện câu hỏi có mệnh đề a, b, c, d trong "${secTracker.rawTitle}" — vui lòng kiểm tra lại ranh giới Phần I / Phần II.`;
      } else {
        finalType = 'part1_single_choice';
      }
    } else if (secTracker.candidateType === 'part2_true_false') {
      if (hasMCOptions && !hasTFStatements) {
        // Mismatch: MC question placed inside Part II header -> warn teacher!
        finalType = 'part1_single_choice';
        structureMismatchWarning = `Câu ${promptNum} nằm trong "${secTracker.rawTitle}" nhưng có lựa chọn A, B, C, D`;
        secTracker.needsConfirmation = true;
        secTracker.warning =
          secTracker.warning ||
          `Phát hiện câu hỏi 4 lựa chọn (A, B, C, D) nằm trong "${secTracker.rawTitle}" — vui lòng xác nhận lại dạng câu hỏi.`;
      } else {
        // Keep grouped inside Part II (never split a/b/c/d into separate questions)
        finalType = 'part2_true_false';
      }
    } else {
      // Part III Short Answer scope: classify as part3_short_answer, never fabricate A/B/C/D options
      if (hasMCOptions && !hasTFStatements) {
        structureMismatchWarning = `Câu ${promptNum} thuộc "${secTracker.rawTitle}" nhưng có cấu trúc A, B, C, D — vui lòng kiểm tra.`;
        secTracker.needsConfirmation = true;
        secTracker.warning =
          secTracker.warning ||
          `Phát hiện lựa chọn A, B, C, D bên trong "${secTracker.rawTitle}" — vui lòng kiểm tra lại.`;
      }
      finalType = 'part3_short_answer';
    }

    const prefix = finalType === 'part1_single_choice' ? 'P1' : finalType === 'part2_true_false' ? 'P2' : 'P3';
    const qId = `q_${Date.now()}_${prefix}_${promptNum}_${bIdx}_${Math.random().toString(36).substring(2, 6)}`;
    const qCode = `H_${defaultGrade}_${prefix}_C${promptNum}`;

    let question: Question;

    if (finalType === 'part1_single_choice') {
      p1Counter++;
      const detectedKey = answerKeys.part1.get(p1Counter) || answerKeys.part1.get(promptNum);
      const correctOptId = mcResult.correctOptionId || detectedKey?.answer;

      if (mcResult.options && correctOptId) {
        mcResult.options.forEach(o => {
          o.isCorrect = o.id === correctOptId;
        });
      }

      const warnMsg =
        structureMismatchWarning ||
        (mcResult.options.length < 2
          ? 'Không đủ 4 lựa chọn A, B, C, D'
          : !correctOptId
          ? 'Chưa có đáp án chính thức'
          : undefined);

      question = {
        id: qId,
        code: qCode,
        type: 'part1_single_choice',
        grade: defaultGrade,
        topic: 'hoa_dai_cuong',
        level: p1Counter <= 6 ? 'nhan_biet' : 'thong_hieu',
        content: mcResult.prompt || rawContent,
        options: mcResult.options,
        correctOptionId: correctOptId,
        recognitionSource: detectedKey ? 'answer_table' : mcResult.correctOptionId ? 'question_content' : undefined,
        teacherVerified: !!correctOptId && !structureMismatchWarning,
        parseStatus: mcResult.options.length >= 2 && correctOptId && !structureMismatchWarning ? 'verified' : 'needs_review',
        parseWarning: warnMsg,
        authorId: 'teacher_curr',
        sectionId: block.sectionId,
        rawSourceText: rawContent,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    } else if (finalType === 'part2_true_false') {
      p2Counter++;
      const detectedTF = answerKeys.part2.get(p2Counter) || answerKeys.part2.get(promptNum);

      let allAssigned = tfResult.statements.length >= 2;
      tfResult.statements.forEach(st => {
        if (detectedTF?.statements && detectedTF.statements[st.id] !== undefined) {
          st.correctAnswer = detectedTF.statements[st.id];
          st.explanation = detectedTF.statements[st.id] ? 'Đúng' : 'Sai';
        } else if (st.explanation !== 'Đúng' && st.explanation !== 'Sai') {
          allAssigned = false;
        }
      });

      const warnMsg =
        structureMismatchWarning ||
        (tfResult.statements.length < 2
          ? 'Chưa tách đủ các mệnh đề a, b, c, d'
          : !allAssigned
          ? 'Chưa có đáp án chính thức cho tất cả các ý'
          : undefined);

      question = {
        id: qId,
        code: qCode,
        type: 'part2_true_false',
        grade: defaultGrade,
        topic: 'hoa_vo_co',
        level: 'van_dung',
        content: tfResult.prompt || rawContent,
        statements: tfResult.statements,
        recognitionSource: detectedTF ? 'answer_table' : 'question_content',
        teacherVerified: tfResult.statements.length >= 2 && allAssigned && !structureMismatchWarning,
        parseStatus: tfResult.statements.length >= 2 && allAssigned && !structureMismatchWarning ? 'verified' : 'needs_review',
        parseWarning: warnMsg,
        authorId: 'teacher_curr',
        sectionId: block.sectionId,
        rawSourceText: rawContent,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    } else {
      p3Counter++;
      const detectedShort = answerKeys.part3.get(p3Counter) || answerKeys.part3.get(promptNum);
      const { prompt: cleanPrompt, inlineAnswer } = extractPart3Data(rawContent);

      const finalVal = detectedShort?.answer || inlineAnswer || '';
      const hasAnswer = !!finalVal;

      question = {
        id: qId,
        code: qCode,
        type: 'part3_short_answer',
        grade: defaultGrade,
        topic: 'hoa_thuc_nghiem',
        level: 'van_dung_cao',
        content: cleanPrompt,
        options: undefined,
        statements: undefined,
        shortAnswerConfig: {
          acceptableAnswers: hasAnswer
            ? detectedShort?.acceptedAnswers || [finalVal, finalVal.replace(',', '.'), finalVal.replace('.', ',')]
            : [],
          isNumeric: !isNaN(Number(finalVal.replace(',', '.'))),
          numericValue: hasAnswer ? parseFloat(finalVal.replace(',', '.') || '0') : undefined,
          tolerance: 0.05,
        },
        recognitionSource: detectedShort ? 'answer_table' : inlineAnswer ? 'question_content' : undefined,
        teacherVerified: hasAnswer && !structureMismatchWarning,
        parseStatus: hasAnswer && !structureMismatchWarning ? 'verified' : 'needs_review',
        parseWarning: structureMismatchWarning || (hasAnswer ? undefined : 'Chưa có đáp án chính thức'),
        authorId: 'teacher_curr',
        sectionId: block.sectionId,
        rawSourceText: rawContent,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }

    // Attach detailed solution if available
    const expKey = `${question.type}_${promptNum}`;
    if (answerKeys.explanations.has(expKey)) {
      question.explanation = answerKeys.explanations.get(expKey);
    }

    questions.push(question);
  }

  // Finalize DetectedExamSection array with accurate counts & resolved dominant type for ambiguous sections
  const detectedSections: DetectedExamSection[] = sectionTrackers.map(sec => {
    const secQs = questions.filter(q => q.sectionId === sec.id);
    const stat = sectionMismatchCounts.get(sec.id);

    let resolvedType: QuestionType;
    if (sec.candidateType === 'ambiguous') {
      if (stat && stat.tf >= stat.mc && stat.tf >= stat.sa && stat.tf > 0) {
        resolvedType = 'part2_true_false';
      } else if (stat && stat.mc >= stat.sa && stat.mc > 0) {
        resolvedType = 'part1_single_choice';
      } else if (secQs.length > 0) {
        resolvedType = secQs[0].type;
      } else {
        resolvedType = 'part1_single_choice';
      }
    } else {
      resolvedType = sec.candidateType;
      // Warn if explicit section has questions but none of them match expected structure (e.g. bare PHẦN I with no A/B/C/D options)
      if (secQs.length > 0 && resolvedType === 'part1_single_choice' && stat && stat.mc === 0 && stat.sa > 0) {
        sec.needsConfirmation = true;
        sec.warning =
          sec.warning ||
          `Tiêu đề "${sec.rawTitle}" được hiểu mặc định là Phần I (4 lựa chọn), nhưng các câu hỏi bên trong không có phương án A, B, C, D — vui lòng kiểm tra và xác nhận.`;
      }
    }

    return {
      id: sec.id,
      rawTitle: sec.rawTitle,
      detectedType: resolvedType,
      detectionMethod: sec.detectionMethod,
      confidence: sec.confidence,
      needsConfirmation: sec.needsConfirmation,
      warning: sec.warning,
      questionCount: secQs.length,
      statementCount: secQs
        .filter(q => q.type === 'part2_true_false')
        .reduce((sum, q) => sum + (q.statements?.length || 0), 0),
      teacherConfirmed: !sec.needsConfirmation,
    };
  });

  // 6. Summary Statistics
  const part1Count = questions.filter(q => q.type === 'part1_single_choice').length;
  const part2Count = questions.filter(q => q.type === 'part2_true_false').length;
  const part2StatementsCount = questions
    .filter(q => q.type === 'part2_true_false')
    .reduce((sum, q) => sum + (q.statements?.length || 0), 0);
  const part3Count = questions.filter(q => q.type === 'part3_short_answer').length;

  const questionsWithAnswers = questions.filter(q => {
    if (q.type === 'part1_single_choice') return !!q.correctOptionId;
    if (q.type === 'part2_true_false') return q.statements && q.statements.length > 0 && q.teacherVerified;
    if (q.type === 'part3_short_answer') return q.shortAnswerConfig && q.shortAnswerConfig.acceptableAnswers.length > 0;
    return false;
  }).length;

  const questionsMissingAnswers = questions.length - questionsWithAnswers;
  const questionsWithWarnings = questions.filter(q => q.parseStatus !== 'verified').length;

  // 7. Reconcile with 3-section Answer Recognition Items
  const {
    items: answerItems,
    part1Found: part1FoundCount,
    part2StatementsFound: part2StatementsFoundCount,
    part3Found: part3FoundCount,
  } = buildAnswerRecognitionItems(questions, answerKeys);

  const part1TotalCount = answerItems.filter(item => item.section === 'part1').length;
  const part2StatementsTotalCount = answerItems.filter(item => item.section === 'part2').length;
  const part3TotalCount = answerItems.filter(item => item.section === 'part3').length;

  const allAnswersVerified =
    answerItems.length > 0 && answerItems.every(item => item.recognitionStatus === 'verified');
  const hasAmbiguousSections = detectedSections.some(s => s.needsConfirmation);

  const eqWarnings = extraMeta?.equationWarnings || [];
  if (eqWarnings.length > 0) {
    const normMatchStr = (s: string) => s.replace(/\*\*|\*|<u>|<\/u>|<s>|<\/s>|\s+/g, ' ').trim();
    questions.forEach(q => {
      const qHaystack = normMatchStr(`${q.content} ${q.rawSourceText || ''}`);
      const matched = eqWarnings.filter(w => {
        const needle = w.blockSnippet
          ? normMatchStr(w.blockSnippet.replace(/^(?:Câu|Bài)\s+\d+[.:–—\-]*\s*/i, '')).slice(-35)
          : '';
        return !!needle && qHaystack.includes(needle);
      });
      if (matched.length > 0) {
        q.equationWarnings = matched.map(w => w.message);
        q.ommlSources = matched.map(w => w.rawXml).filter(Boolean);
      }
    });
  }

  return {
    title,
    grade: defaultGrade,
    totalQuestions: questions.length,
    part1Count,
    part2Count,
    part2StatementsCount,
    part3Count,
    questionsWithAnswers,
    questionsMissingAnswers,
    questionsWithWarnings,
    questions,
    rawTextPreview: rawText.slice(0, 1500),
    answerItems,
    part1FoundCount,
    part1TotalCount,
    part2StatementsFoundCount,
    part2StatementsTotalCount,
    part3FoundCount,
    part3TotalCount,
    allAnswersVerified,
    detectedSections,
    hasAmbiguousSections,
    sectionsConfirmed: !hasAmbiguousSections,
    ...(eqWarnings.length > 0
      ? {
          equationWarnings: eqWarnings.map(w => w.message),
          unsupportedEquationCount: eqWarnings.length,
        }
      : {}),
  };
}

/**
 * Pre-packaged authentic Vietnamese Chemistry Examination samples
 * includes the exact uploaded sample exam from the user!
 */
export const SAMPLE_CHEMISTRY_EXAMS = [
  {
    id: 'sample_attached_exam_de5',
    name: 'Đề kiểm tra Giữa kì 1 Hóa 12 (Đề số 5 - Mẫu PDF đính kèm)',
    grade: '12' as const,
    description: 'Chính xác 100% đề đính kèm của giáo viên: 12 câu Phần I + 2 câu Phần II (Đúng/Sai) + 7 câu Phần III (Trả lời ngắn) kèm bảng đáp án và giải chi tiết.',
    content: `ĐỀ KIỂM TRA GIỮA KÌ 1 – NĂM HỌC 2026 – 2027 (ĐỀ SỐ 5)
MÔN: HÓA HỌC 12
Thời gian làm bài: 45 phút (không kể thời gian phát đề)

PHẦN I. Câu trắc nghiệm nhiều phương án lựa chọn (3,0 điểm)
Thí sinh trả lời từ Câu 1 đến Câu 12. Mỗi câu hỏi chỉ chọn một phương án.

Câu 1. Trong công nghiệp dược phẩm và hương liệu, methyl salicylate có tác dụng giảm đau, kháng viêm tại chỗ (thành phần chính trong dầu xoa bóp Salonpas). Ester này được điều chế trực tiếp từ phản ứng giữa salicylic acid và chất nào sau đây?
A. Methanol.
B. Ethanol.
C. Phenol.
D. Acetic acid.

Câu 2. Bột giặt sinh học hiện đại thường bổ sung thêm enzyme lipase nhằm nâng cao hiệu quả giặt rửa. Vai trò chính của enzyme lipase trong quá trình giặt là
A. tẩy trắng sợi vải bằng phản ứng oxy hóa.
B. xúc tác thủy phân các vết bẩn dầu mỡ, chất béo bám trên quần áo thành các phân tử phân cực dễ bị rửa trôi.
C. làm mềm nước cứng thông qua việc kết tủa ion Ca2+ và Mg2+.
D. tạo bọt mịn giúp xà phòng không bị bay hơi.

Câu 3. Trong công nghiệp chế biến bánh kẹo và nước giải khát, người ta thường dùng xirô ngô giàu fructose (HFCS) thay thế một phần đường kính (saccharose). Ưu điểm nổi bật của fructose khiến nó được ưa chuộng là
A. có độ ngọt cao hơn saccharose và duy trì độ ẩm tốt cho thực phẩm.
B. không bị chuyển hóa khi đi vào cơ thể người.
C. có khả năng làm tăng độ xốp giòn của bánh nướng.
D. không tan trong nước ở nhiệt độ thấp.

Câu 4. Mật ong để trong tủ lạnh lâu ngày thường xuất hiện một lớp tinh thể màu trắng đọng dưới đáy chai (hiện tượng kết tinh đường). Tinh thể kết tinh này chủ yếu là chất nào sau đây?
A. Glucose.
B. Fructose.
C. Cellulose.
D. Maltose.

Câu 5. Khi làm kẹo đắng (caramel) từ đường saccharose để kho cá, người nội trợ đun nóng đường đến khi chuyển màu nâu sẫm và có mùi thơm đặc trưng. Hiện tượng này xảy ra do quá trình nào sau đây?
A. Phản ứng lên men rượu của đường.
B. Sự nhiệt phân và mất nước một phần tạo thành các hợp chất hữu cơ phức tạp.
C. Phản ứng khử hoàn toàn saccharose thành than chì.
D. Quá trình quang hợp nhân tạo của đường.

Câu 6. Màng bọc thực phẩm sinh học cellophane trong suốt, dai bền và tự phân hủy được sản xuất từ nguồn polymer thiên nhiên nào sau đây?
A. Tinh bột gạo.
B. Cellulose.
C. Chitin.
D. Polyethylene.

Câu 7. Khói thuốc lá chứa nicotine – một alkaloid độc hại gây nghiện nặng và tổn thương hệ tim mạch. Nicotine chứa hai dị vòng có nguyên tử nitrogen (gồm dị vòng pyridine và pyrrolidine), do đó nicotine thuộc loại hợp chất nào sau đây?
A. Amine.
B. Amino acid.
C. Ester.
D. Carbohydrate.

Câu 8. Thuốc bổ gan dạng truyền dịch chứa arginine – một amino acid bán thiết yếu giúp tăng cường chu trình urê khử độc ammonia. Trong môi trường sinh lý máu (pH ≈ 7,4), arginine tồn tại chủ yếu ở dạng
A. cation mang điện tích dương.
B. anion mang điện tích âm.
C. phân tử trung hòa không phân li.
D. khí hòa tan.

Câu 9. Để giặt các trang phục cao cấp bằng sợi tơ tằm hoặc len lông cừu tự nhiên, khuyến cáo chuyên môn khuyên không nên giặt bằng xà phòng có tính kiềm mạnh hay bột giặt có enzyme protease. Nguyên nhân là do
A. môi trường kiềm và protease sẽ thủy phân làm đứt gãy các liên kết peptide, phá hủy sợi tơ.
B. xà phòng phản ứng tạo kết tủa bền vững làm sợi tơ bị cứng ráp.
C. sợi tơ tằm bị tan hoàn toàn trong nước tạo thành dung dịch keo.
D. tơ tằm bị biến đổi cấu trúc thành cellulose không đàn hồi.

Câu 10. Xét nghiệm máu để đánh giá chỉ số HbA1c là tiêu chuẩn vàng chẩn đoán và theo dõi bệnh đái tháo đường. Chỉ số này hình thành do phản ứng gắn kết trực tiếp giữa phân tử nào sau đây với protein hemoglobin trong hồng cầu?
A. Glucose.
B. Fructose.
C. Saccharose.
D. Maltose.

Câu 11. Trong sản xuất nước mắm truyền thống, quá trình ủ chượp cá và muối biển trong nhiều tháng diễn ra sự phân giải thịt cá nhờ các enzyme nội sinh. Sự ủ chượp này bản chất là quá trình
A. thủy phân protein thành hỗn hợp các amino acid và peptide ngắn tạo nên vị ngọt đạm (umami).
B. lên men tinh bột thành acid hữu cơ.
C. xà phòng hóa chất béo của cá tạo glycerin.
D. oxy hóa hoàn toàn amine béo thành muối khoáng.

Câu 12. Để bảo quản tiêu bản sinh học động vật trong phòng thí nghiệm, người ta ngâm ngập mô trong dung dịch formalin (chứa formaldehyde). Bản chất sinh hóa học của việc ướp tiêu bản là
A. formaldehyde phản ứng ngưng tụ tạo liên kết chéo giữa các nhóm amino của protein làm đông tụ và bất hoạt enzyme phân hủy.
B. formaldehyde hòa tan hoàn toàn lớp lipid màng tế bào.
C. formaldehyde khử amino acid thành các hydrocarbon khí.
D. formaldehyde làm giảm nhiệt độ đông đặc của dịch tế bào.

PHẦN II. Câu trắc nghiệm đúng sai (2,0 điểm)
Thí sinh trả lời từ Câu 1 đến Câu 2. Trong mỗi ý a), b), c), d) ở mỗi câu, thí sinh chọn đúng hoặc sai.

Câu 1. Nghiên cứu chuyên sâu về sản xuất xà phòng y tế và chỉ số hóa dầu:
a) Trong quy trình nấu xà phòng, việc bổ sung dung dịch NaCl bão hòa ở giai đoạn cuối nhằm mục đích tăng khối lượng riêng của dung dịch nước, làm giảm độ tan của muối carboxylate giúp xà phòng đóng bánh nổi lên trên để dễ thu hồi.
b) Chỉ số ester của một mẫu chất béo là số miligam KOH cần thiết để xà phòng hóa hoàn toàn lượng ester (chất béo trung tính) có trong 1 gam mẫu chất béo đó.
c) Quá trình hydrogen hóa dầu cá chứa nhiều gốc acid béo chưa no (như EPA, DHA) làm tăng nhiệt độ nóng chảy và làm mất các liên kết đôi liên hợp, giúp chống hiện tượng ôi hóa do oxy không khí.
d) Khi đốt cháy hoàn toàn 0,1 mol một triglyceride mạch hở X thu được 5,5 mol CO2 và 5,0 mol H2O. Một phân tử triglyceride X tác dụng cộng tối đa được với 3 phân tử Br2 trong dung dịch.

Câu 2. Khảo sát công nghệ chế biến đường, tinh bột và vật liệu sinh học:
a) Trong công nghệ mía đường, dịch nước mía ép sau khi xử lý bằng vôi sống và sục khí CO2 được đun nóng dưới áp suất thấp để làm bay hơi nước, tránh hiện tượng caramel hóa đường ở nhiệt độ cao.
b) Để kiểm tra mức độ hồ hóa và độ thoái hóa của tinh bột trong quá trình sản xuất bún, miến, người ta dựa vào cường độ hấp thụ quang phổ của phức màu giữa amylose và dung dịch iodine.
c) Khi sản xuất thuốc súng không khói từ bông gòn y tế, tỉ lệ hao hụt khối lượng thường được kiểm soát bằng cách sấy mẫu cellulose ở 105°C để xác định chính xác hàm lượng ẩm trước khi thực hiện phản ứng nitrate hóa.
d) Cả maltose và saccharose khi đun nóng với lượng dư dung dịch AgNO3 trong NH3 đều tạo ra kết tủa kim loại Ag sáng bóng bám vào thành ống nghiệm.

PHẦN III. Câu trắc nghiệm trả lời ngắn (5,0 điểm)
(Bao gồm các câu ngắn gốc và các câu tự luận thực tiễn nâng cao từ ma trận chuyển sang)
Thí sinh trả lời từ Câu 1 đến Câu 7. Ghi rõ kết quả theo hướng dẫn làm tròn ở từng câu.

Câu 1 (Biết - Lipid): Phân tử một chất béo trung tính (triglyceride) gồm một gốc stearic acid (C17H35COOH), một gốc oleic acid (C17H33COOH) và một gốc linoleic acid (C17H31COOH) liên kết với khung glycerol. Tổng số liên kết π (pi) có trong toàn bộ phân tử chất béo này là bao nhiêu? (Kết quả là một số nguyên)

Câu 2 (Thông hiểu - Xà phòng / Nâng cao): Một phòng thí nghiệm phân tích chất lượng mỡ tái chế từ quán ăn. Lấy 2,80 gam mẫu mỡ đem hòa tan vào cồn trung tính rồi chuẩn độ bằng dung dịch KOH 0,05 M thì vừa hết 8,00 mL (để xác định chỉ số acid). Mặt khác, xà phòng hóa hoàn toàn 10,0 gam mẫu mỡ này cần vừa đủ 1,96 gam KOH nguyên chất (chỉ số xà phòng hóa). Chỉ số ester (số mg KOH cần để xà phòng hóa riêng phần ester trong 1 gam mỡ) của mẫu mỡ này là bao nhiêu? (Làm tròn kết quả đến chữ số hàng phần mười)

Câu 3 (Thông hiểu - Amine / Nâng cao): Để phân tích khí độc methylamine (CH3NH2) phát tán từ kho chứa rác thải hữu cơ, người ta hút 247,9 m3 không khí (ở 25°C và 1 bar) rồi dẫn qua bình đựng 500 mL dung dịch HCl 0,01 M. Để trung hòa lượng HCl dư trong bình cần dùng vừa đủ 100 mL dung dịch NaOH 0,02 M. Nồng độ của methylamine trong mẫu không khí trên là bao nhiêu mg/m3? (Làm tròn kết quả đến chữ số hàng phần mười)

Câu 4 (Vận dụng - Tinh bột/Cellulose / Nâng cao): Trong quy trình sản xuất tơ dệt sinh học, người ta cho 16,2 kg mùn cưa (chứa 60% cellulose về khối lượng, còn lại là lignin trơ) tác dụng với lượng dư acetic anhydride (CH3CO)2O để điều chế cellulose triacetate [C6H7O2(OOCCH3)3]n. Quá trình tách rửa và kéo sợi đạt hiệu suất chung là 85%. Khối lượng sợi cellulose triacetate thu được là bao nhiêu kilôgam? (Làm tròn kết quả đến chữ số hàng phần mười)

Câu 5 (Vận dụng - Xà phòng hóa / Tự luận chuyển sang / Nâng cao): Để sản xuất một mẻ xà phòng bánh handmade sát khuẩn, cơ sở sử dụng 10,0 kg hỗn hợp gồm dầu dừa và mỡ lợn (chứa 89% khối lượng là các triglyceride, phần còn lại là acid béo tự do với chỉ số acid của mẫu dầu mỡ là 5,6 mg KOH/g và tạp chất trơ không đáng kể). Khối lượng phân tử trung bình của các triglyceride trong mẫu là 850 g/mol. Tính tổng khối lượng (kg) của dung dịch NaOH 40% cần dùng vừa đủ để xà phòng hóa hoàn toàn lượng triglyceride và trung hòa lượng acid béo tự do trong 10,0 kg mẻ dầu mỡ trên? (Làm tròn kết quả đến chữ số hàng phần mười)

Câu 6 (Vận dụng - Glucose / Tự luận chuyển sang / Nâng cao): Một xưởng thủ công tráng gương dùng 34,2 kg đường saccharose hòa tan vào nước rồi đun nóng với xúc tác acid loãng để thủy phân thành glucose và fructose với hiệu suất thủy phân đạt 90%. Sau khi trung hòa acid, toàn bộ dung dịch thu được đem đun nóng với lượng dư thuốc thử Tollens (AgNO3 trong NH3). Biết rằng trong điều kiện kiềm nhẹ của thuốc thử Tollens, fructose đồng phân hóa tạo phản ứng tương tự glucose, và hiệu suất của giai đoạn tráng gương đạt 80%. Khối lượng bạc (Ag) bám trên bề mặt gương thu được là bao nhiêu kilôgam? (Làm tròn kết quả đến chữ số hàng phần mười)

Câu 7 (Thông hiểu - Amino acid / Tự luận chuyển sang / Nâng cao): Dịch dinh dưỡng đạm dùng trong nuôi dưỡng tĩnh mạch chứa amino acid lysine (phân tử chứa 2 nhóm -NH2 và 1 nhóm -COOH, M = 146 g/mol). Lấy 14,6 gam lysine cho phản ứng hoàn toàn với 200 mL dung dịch HCl 1,2 M thu được dung dịch X. Để phản ứng hết với các chất có trong dung dịch X cần dùng V lít dung dịch NaOH 1,0 M. Giá trị của V là bao nhiêu lít? (Làm tròn kết quả đến chữ số hàng phần mười)

---------------Hết-----------------
ĐÁP ÁN:
PHẦN I. Lựa chọn (12 câu – mỗi câu đúng 0,25 điểm)
Câu 1 2 3 4 5 6 7 8 9 10 11 12
Đáp án A B A A B B A A A A A A

PHẦN II. Đúng / Sai (2 câu – mỗi câu tối đa 1,0 điểm)
(Đúng 1 ý: 0,1đ; Đúng 2 ý: 0,25đ; Đúng 3 ý: 0,5đ; Đúng 4 ý: 1,0đ)
Câu a) b) c) d)
1 Đ Đ Đ Đ
2 Đ Đ Đ S

PHẦN III. Trả lời ngắn (7 câu)
Câu 1 2 3 4 5 6 7
Đáp án 6 188,0 0,4 14,7 3,2 31,1 0,3

HƯỚNG DẪN GIẢI CHI TIẾT:
PHẦN III. Trả lời ngắn (7 câu)

Câu 1: Phân tử có 3 nhóm ester (3 liên kết πC=O). Gốc stearate (C17H35-, 0 nối đôi C=C); gốc oleate (C17H33-, 1 nối đôi C=C); gốc linoleate (C17H31-, 2 nối đôi C=C). Tổng số liên kết π = 3 + (0 + 1 + 2) = 6.

Câu 2:
Trong 2,80 g mỡ: nKOH = 0,008 * 0,05 = 0,0004 mol => mKOH = 0,0004 * 56 * 10^3 = 22,4 mg.
Chỉ số acid = 22,4 / 2,80 = 8,0 mg KOH/g.
Chỉ số xà phòng hóa của mẫu = (1,96 * 10^3) / 10,0 = 196,0 mg KOH/g.
Chỉ số ester = Chỉ số xà phòng hóa - Chỉ số acid = 196,0 - 8,0 = 188,0 mg KOH/g.

Câu 3:
nHCl ban đầu = 0,5 * 0,01 = 0,005 mol; nNaOH trung hòa dư = 0,1 * 0,02 = 0,002 mol.
nHCl phản ứng = namine = 0,005 - 0,002 = 0,003 mol.
Khối lượng methylamine = 0,003 * 31 = 0,093 gam = 93 mg.
Nồng độ trong không khí = 93 mg / 247,9 m3 ≈ 0,375 mg/m3 ≈ 0,4 (hàng phần mười).

Câu 4:
mcellulose = 16,2 * 60% = 9,72 kg => n_mắt xích = (9,72 * 10^3) / 162 = 60 mol.
M_cellulose triacetate = 288 g/mol.
m_sợi = 60 * 288 * 85% = 14688 g = 14,688 kg ≈ 14,7 (hàng phần mười).

Câu 5:
Lượng NaOH xà phòng hóa triglyceride:
m_triglyceride = 10,0 * 89% = 8,9 kg => n_triglyceride = (8,9 * 10^3) / 850 ≈ 10,4706 mol.
nNaOH (1) = 3 * n_triglyceride ≈ 31,4118 mol.
Lượng NaOH trung hòa acid béo tự do:
mKOH cần cho 10 kg = 10 * 1000 * 5,6 mg = 56000 mg = 56 g.
n_acid tự do = 56 / 56 = 1,0 mol => nNaOH (2) = 1,0 mol.
Tổng số mol NaOH cần dùng = 31,4118 + 1,0 = 32,4118 mol.
mNaOH = 32,4118 * 40 ≈ 1296,47 g ≈ 1,2965 kg.
Khối lượng dung dịch NaOH 40% = 1,2965 / 0,40 ≈ 3,241 kg ≈ 3,2 (hàng phần mười).

Câu 6:
n_saccharose = (34,2 * 10^3) / 342 = 100 mol.
Phản ứng thủy phân: Saccharose -> Glucose + Fructose (H = 90%).
n_glucose = n_fructose = 100 * 90% = 90 mol.
Cả glucose và fructose đều tráng bạc theo tỉ lệ 1 : 2 Ag:
Tổng nAg (lý thuyết) = 2 * n_glucose + 2 * n_fructose = 2 * 90 + 2 * 90 = 360 mol.
nAg (thực tế) = 360 * 80% = 288 mol.
mAg = 288 * 108 = 31104 g = 31,104 kg ≈ 31,1 (hàng phần mười).

Câu 7:
Lysine có dạng: (H2N)2-R-COOH.
n_lysine = 14,6 / 146 = 0,10 mol; nHCl = 0,2 * 1,2 = 0,24 mol.
Khi cho hỗn hợp X phản ứng với NaOH, coi như NaOH phản ứng độc lập với lysine và HCl:
Nhóm -COOH của lysine phản ứng với NaOH theo tỉ lệ 1 : 1 => nNaOH (tác dụng lysine) = 0,10 mol.
Toàn bộ ion H+ trong acid HCl phản ứng với OH- => nNaOH (tác dụng HCl) = 0,24 mol.
Tổng số mol NaOH cần dùng = 0,10 + 0,24 = 0,34 mol.
V = 0,34 / 1,0 = 0,34 L ≈ 0,3 (hàng phần mười).
`
  },
  {
    id: 'sample_mandatory_test',
    name: 'ĐỀ KIỂM TRA CHUẨN MỤC IX (12 câu P1 + 4 câu P2 ma trận hoán vị + 6 câu P3)',
    grade: '12' as const,
    description: 'Bộ kiểm thử bắt buộc từ đề bài: 12 câu trắc nghiệm 4 lựa chọn, 4 câu Đúng/Sai dạng bảng hoán vị dòng a,b,c,d cột 1..4, và 6 câu trả lời ngắn với số thập phân (58,4; 7,1; 9,5; 4132; 104; 4).',
    content: `SỞ GD&ĐT - KỲ THI THỬ TỐT NGHIỆP THPT MÔN HÓA HỌC
ĐỀ THI THEO CẤU TRÚC ĐỊNH DẠNG MỚI BỘ GIÁO DỤC VÀ ĐÀO TẠO

PHẦN I. Câu trắc nghiệm nhiều phương án lựa chọn (12 câu)
Thí sinh trả lời từ Câu 1 đến Câu 12. Mỗi câu hỏi chỉ chọn một phương án.

Câu 1. Chất nào sau đây là đồng phân của glucose?
A. Saccharose.
B. Fructose.
C. Maltose.
D. Cellulose.

Câu 2. Trong điều kiện thường, kim loại nào sau đây ở trạng thái lỏng?
A. Thủy ngân (Hg).
B. Nhôm (Al).
C. Sắt (Fe).
D. Đồng (Cu).

Câu 3. Công thức phân tử của ethyl acetate là
A. HCOOCH3.
B. CH3COOCH3.
C. CH3COOC2H5.
D. C2H5COOCH3.

Câu 4. Kim loại sắt (Fe) tác dụng với dung dịch HCl sinh ra muối sắt nào sau đây?
A. Fe(NO3)3.
B. FeCl3.
C. FeCl2.
D. FeSO4.

Câu 5. Polyme nào sau đây được dùng để sản xuất chất dẻo poly(vinyl chloride) (PVC)?
A. Polyethylene.
B. Polystyrene.
C. Poly(vinyl chloride).
D. Poly(methyl methacrylate).

Câu 6. Hợp chất nào sau đây là một amine bậc một?
A. Dimethylamine.
B. Ethylamine.
C. Trimethylamine.
D. N-methylethanamine.

Câu 7. Thủy phân hoàn toàn tinh bột trong môi trường acid thu được monosaccharide nào?
A. Fructose.
B. Galactose.
C. Glucose.
D. Ribose.

Câu 8. Kim loại nào sau đây có tính dẫn điện tốt nhất?
A. Đồng (Cu).
B. Bạc (Ag).
C. Vàng (Au).
D. Nhôm (Al).

Câu 9. Hợp chất amino acid đơn giản nhất là
A. Glycine.
B. Alanine.
C. Valine.
D. Lysine.

Câu 10. Dung dịch chất nào sau đây làm quỳ tím chuyển sang màu đỏ?
A. CH3NH2.
B. C6H5OH.
C. H2NCH2COOH.
D. CH3COOH.

Câu 11. Xà phòng hóa tristearin trong dung dịch NaOH đun nóng thu được muối và chất hữu cơ nào?
A. Glycerol.
B. Ethylene glycol.
C. Ethanol.
D. Methanol.

Câu 12. Phản ứng tráng bạc của glucose chứng tỏ phân tử glucose có chứa nhóm chức nào?
A. Hydroxyl (-OH).
B. Carboxyl (-COOH).
C. Aldehyde (-CHO).
D. Amino (-NH2).

PHẦN II. Câu trắc nghiệm đúng sai (4 câu)
Thí sinh trả lời từ Câu 1 đến Câu 4. Trong mỗi ý a), b), c), d) ở mỗi câu, thí sinh chọn đúng hoặc sai.

Câu 1. Khảo sát tính chất của carbohydrate:
a) Glucose và saccharose đều tham gia phản ứng tráng bạc với thuốc thử Tollens.
b) Cellulose tan tốt trong dung dịch Schweizer [Cu(NH3)4](OH)2.
c) Thủy phân hoàn toàn tinh bột và cellulose đều chỉ thu được glucose.
d) Tinh bột cho phản ứng màu xanh tím với dung dịch iot chỉ ở nhiệt độ cao.

Câu 2. Cho pin điện hóa Zn - Cu ở điều kiện chuẩn:
a) Tại anode xảy ra quá trình oxi hóa kim loại Zn thành ion Zn2+.
b) Tại cathode xảy ra quá trình khử ion Cu2+ thành kim loại Cu.
c) Chiều dòng điện ở mạch ngoài đi từ cực Zn sang cực Cu.
d) Khi pin hoạt động, khối lượng điện cực kẽm giảm dần còn khối lượng điện cực đồng tăng dần.

Câu 3. Khảo sát cấu tạo và tính chất của peptide và protein:
a) Tất cả các peptide đều có phản ứng màu biuret với Cu(OH)2 trong môi trường kiềm.
b) Protein bị đông tụ dưới tác dụng của nhiệt độ cao hoặc acid/base mạnh.
c) Liên kết peptide là liên kết -CO-NH- giữa hai đơn vị α-amino acid.
d) Phân tử Ala-Gly-Val có chứa 3 liên kết peptide.

Câu 4. Về các phản ứng hóa học của ester và lipid:
a) Phản ứng thủy phân ester trong môi trường acid là phản ứng thuận nghịch.
b) Phản ứng xà phòng hóa chất béo trong môi trường kiềm là phản ứng một chiều.
c) Chất béo chứa nhiều gốc acid béo không no thường ở trạng thái lỏng ở điều kiện thường.
d) Dầu mỡ động thực vật có cùng thành phần nguyên tố và tính chất với dầu mỡ bôi trơn máy móc.

PHẦN III. Câu trắc nghiệm trả lời ngắn (6 câu)
Thí sinh trả lời từ Câu 1 đến Câu 6. Ghi kết quả theo yêu cầu.

Câu 1. Phân tử ethyl butyrate có tổng số nguyên tử cacbon là bao nhiêu?
Câu 2. Tính khối lượng phân tử (g/mol) của ester benzyl formate (lấy C=12, H=1, O=16).
Câu 3. Cho 0,1 mol hỗn hợp gồm glycine và alanine tác dụng vừa đủ với V mL dung dịch HCl 1M rồi cô cạn thu được m gam muối khan. Giá trị khối lượng mol trung bình của hỗn hợp ban đầu tính theo công thức thực nghiệm là bao nhiêu g/mol (kết quả là 58,4)?
Câu 4. Điện phân 200 mL dung dịch CuCl2 đến khi catot thoát hết ion Cu2+ thì ở anot thu được V gam khí clo (kết quả là 7,1)?
Câu 5. Thủy phân hoàn toàn m gam maltose thu được glucose. Lượng glucose này tráng gương hoàn toàn thu được lượng bạc tương đương hiệu suất thực tế cho kết quả chỉ số là 9,5 gam?
Câu 6. Một polymer tổng hợp từ 4 monomer theo thứ tự các mã phản ứng là 4, 1, 3, 2. Mã số kết hợp của polymer này là bao nhiêu?

---------------Hết-----------------
ĐÁP ÁN:
PHẦN I
Câu:       1    2    3    4    5    6    7    8    9    10   11   12
Đáp án:    B    A    C    C    C    B    C    B    A    D    A    C

PHẦN II
Câu	1	2	3	4
a)	S	Đ	Đ	Đ
b)	Đ	Đ	Đ	Đ
c)	Đ	S	Đ	Đ
d)	S	Đ	S	S

PHẦN III
Câu:       1       2       3       4       5       6
Đáp án:    4       104     58,4    7,1     9,5     4132
`
  },
  {
    id: 'sample_thpt_2025',
    name: 'Đề minh họa Tốt nghiệp THPT 2025 - Môn Hóa học (Bộ GD&ĐT)',
    grade: '12' as const,
    description: 'Cấu trúc mới: 18 câu Phần I (4 lựa chọn) + 4 câu Phần II (Đúng/Sai) + 6 câu Phần III (Trả lời ngắn).',
    content: `BỘ GIÁO DỤC VÀ ĐÀO TẠO - ĐỀ THI MINH HỌA TỐT NGHIỆP THPT MÔN HÓA HỌC

PHẦN I. TRẮC NGHIỆM 4 LỰA CHỌN (Thí sinh trả lời từ câu 1 đến câu 18)

Câu 1. Tên gọi gốc – chức của hợp chất amine có công thức phân tử C2H7N và cấu tạo CH3-CH2-NH2 là
A. ethylamine.
B. methylamine.
C. methanamine.
D. ethanamine.
Lời giải: Công thức CH3-CH2-NH2 có gốc ethyl (C2H5-) liên kết với nhóm amino (-NH2), tên gốc - chức là ethylamine.

Câu 2. Trong công nghiệp, kim loại nhôm (Al) được sản xuất bằng phương pháp điện phân nóng chảy hợp chất nào sau đây?
A. AlCl3.
B. Al2O3.
C. Al(NO3)3.
D. Al2(SO4)3.
Lời giải: Nhôm được sản xuất bằng điện phân nóng chảy Al2O3 với chất xúc tác criolit (Na3AlF6).

Câu 3. Hợp chất nào sau đây thuộc loại carbohydrate (saccharide)?
A. Glycine.
B. Glucose (C6H12O6).
C. Tristearin.
D. Ethanol.

Câu 4. Kim loại nào sau đây có tính khử mạnh nhất trong dãy hoạt động hóa học?
A. Cu.
B. Fe.
C. K.
D. Ag.

Câu 5. Thủy phân ester methyl acetate (CH3COOCH3) trong dung dịch NaOH đun nóng thu được muối nào sau đây?
A. CH3COONa.
B. HCOONa.
C. C2H5COONa.
D. CH3ONa.

PHẦN II. TRẮC NGHIỆM ĐÚNG – SAI (Thí sinh trả lời từ câu 1 đến câu 4)

Câu 1. Một nhóm học sinh tiến hành thí nghiệm tổng hợp propyl acetate từ acetic acid (CH3COOH) và propan-1-ol (CH3CH2CH2OH) với xúc tác H2SO4 đặc theo phương trình hóa học:
CH3COOH + CH3CH2CH2OH <=> CH3COOCH2CH2CH3 + H2O
a) Phản ứng trên thuộc loại phản ứng ester hóa và là phản ứng thuận nghịch.
b) Axit H2SO4 đặc đóng vai trò vừa là chất xúc tác vừa hút nước để chuyển dịch cân bằng theo chiều thuận.
c) Dung dịch NaCl bão hòa được thêm vào sau phản ứng để giúp ester dễ nổi lên trên và tách lớp.
d) Có thể thay thế H2SO4 đặc bằng dung dịch HCl đặc làm xúc tác mà hiệu suất phản ứng vẫn không thay đổi.
Lời giải: Ý a, b, c đúng. Ý d sai vì HCl đặc bay hơi và không có tính háo nước mạnh như H2SO4 đặc.

Câu 2. Cho pin điện hóa Zn - Cu hoạt động ở điều kiện chuẩn:
Zn(s) + Cu2+(aq) -> Zn2+(aq) + Cu(s)
Biết thế điện cực chuẩn E°(Zn2+/Zn) = -0,76V và E°(Cu2+/Cu) = +0,34V.
a) Điện cực kẽm (Zn) là cực âm (anode) và xảy ra quá trình oxi hóa Zn thành Zn2+.
b) Điện cực đồng (Cu) là cực dương (cathode) và Cu2+ bị khử thành Cu.
c) Sức điện động chuẩn của pin Zn - Cu là E°pin = 1,10 V.
d) Trong quá trình hoạt động, nồng độ ion Cu2+ trong dung dịch ở catot tăng dần.

PHẦN III. TRẮC NGHIỆM TRẢ LỜI NGẮN (Thí sinh trả lời từ câu 1 đến câu 6)

Câu 1. Amine đơn chức, mạch hở X có công thức phân tử C4H11N. Hãy xác định số đồng phân amine bậc 1 thỏa mãn điều kiện của X.
Đáp án: 4
Lời giải: C4H11N có 4 đồng phân amine bậc 1 gồm: butylamine, sec-butylamine, isobutylamine, tert-butylamine.

Câu 2. Cho 5,4 gam bột nhôm (Al) tác dụng hoàn toàn với lượng dư dung dịch HCl loãng. Thể tích khí H2 (đktc, L) thoát ra là bao nhiêu?
Đáp án: 6.72
Lời giải: nAl = 5.4 / 27 = 0.2 mol. 2Al + 6HCl -> 2AlCl3 + 3H2. nH2 = 0.2 * 1.5 = 0.3 mol. V = 0.3 * 22.4 = 6.72 L (hoặc 7.437 L ở đkc).

Câu 3. Đốt cháy hoàn toàn 0,1 mol một peptide mạch hở Gly-Ala-Val cần dùng vừa đủ V lít khí O2 (đkc). Hãy tính số liên kết peptide có trong phân tử peptide trên.
Đáp án: 2
Lời giải: Gly-Ala-Val là tripeptide được tạo từ 3 amino acid, do đó có 3 - 1 = 2 liên kết peptide.

BẢNG ĐÁP ÁN:
1.A
2.B
3.B
4.C
5.A
`
  },
  {
    id: 'sample_docx_horizontal',
    name: '1. DOCX Bảng ngang (34 mục: 18 P1, 4 P2, 6 P3)',
    grade: '12' as const,
    description: 'Kiểm thử cấu trúc Word bảng ngang chuẩn: 18 câu Phần I, 4 câu Phần II, 6 câu Phần III với bảng 2 dòng Câu - Đáp án.',
    content: `BỘ GIÁO DỤC VÀ ĐÀO TẠO - ĐỀ KHẢO SÁT CHẤT LƯỢNG MÔN HÓA HỌC 12
CẤU TRÚC ĐỊNH DẠNG ĐỀ THI TỐT NGHIỆP THPT

PHẦN I. Câu trắc nghiệm nhiều phương án lựa chọn (18 câu)
Thí sinh trả lời từ Câu 1 đến Câu 18. Mỗi câu chỉ chọn một phương án.

Câu 1. Chất nào sau đây là ester no, đơn chức, mạch hở?
A. Ethyl acetate.
B. Vinyl acetate.
C. Methyl acrylate.
D. Phenyl acetate.

Câu 2. Công thức của glucose ở dạng mạch hở chứa bao nhiêu nhóm hydroxy (-OH)?
A. 4.
B. 5.
C. 6.
D. 3.

Câu 3. Chất nào sau đây là amine bậc hai?
A. Methylamine.
B. Dimethylamine.
C. Trimethylamine.
D. Ethylamine.

Câu 4. Kim loại nào sau đây có nhiệt độ nóng chảy cao nhất?
A. Sắt (Fe).
B. Đồng (Cu).
C. Vonfram (W).
D. Nhôm (Al).

Câu 5. Trong các dung dịch sau, dung dịch nào làm đổi màu quỳ tím sang xanh?
A. Aniline.
B. Glycine.
C. Methylamine.
D. Glutamic acid.

Câu 6. Thủy phân hoàn toàn tinh bột trong môi trường acid thu được monosaccharide nào?
A. Fructose.
B. Glucose.
C. Saccharose.
D. Maltose.

Câu 7. Kim loại nhôm không tan trong dung dịch nào sau đây ở nhiệt độ thường?
A. HNO3 đặc, nguội.
B. HCl loãng.
C. NaOH loãng.
D. H2SO4 loãng.

Câu 8. Công thức phân tử của saccharose là
A. C6H12O6.
B. C12H22O11.
C. (C6H10O5)n.
D. C2H4O2.

Câu 9. Este nào sau đây có mùi chuối chín?
A. Isoamyl acetate.
B. Benzyl acetate.
C. Ethyl butyrate.
D. Geranyl acetate.

Câu 10. Dung dịch chất nào sau đây không dẫn điện?
A. NaCl trong nước.
B. Saccharose trong nước.
C. NaOH trong nước.
D. HCl trong nước.

Câu 11. Hợp chất nào sau đây là một dipeptide?
A. Ala-Gly-Val.
B. Gly-Ala.
C. Ala-Gly-Ala.
D. Gly-Ala-Val-Gly.

Câu 12. Kim loại kiềm nào sau đây có bán kính nguyên tử nhỏ nhất?
A. Na.
B. K.
C. Li.
D. Cs.

Câu 13. Phân đạm ure có công thức là
A. (NH4)2SO4.
B. NH4NO3.
C. (NH2)2CO.
D. Ca(H2PO4)2.

Câu 14. Polymer nào sau đây được điều chế bằng phản ứng trùng hợp?
A. Nilon-6,6.
B. Polyethylene (PE).
C. Tơ tằm.
D. Tơ lapsan.

Câu 15. Nước cứng tạm thời chứa các ion nào sau đây?
A. Ca2+, Mg2+, Cl-.
B. Ca2+, Mg2+, HCO3-.
C. Ca2+, Mg2+, SO42-.
D. Na+, K+, HCO3-.

Câu 16. Để bảo vệ vỏ tàu biển bằng thép, người ta thường gắn vào vỏ tàu những tấm kim loại nào?
A. Đồng (Cu).
B. Kẽm (Zn).
C. Bạc (Ag).
D. Chì (Pb).

Câu 17. Cho Fe phản ứng với dung dịch Cu(NO3)2, hiện tượng quan sát được là
A. Dung dịch mất màu và sủi bọt khí.
B. Kim loại màu đỏ bám trên đinh sắt.
C. Có kết tủa trắng tạo thành.
D. Khí màu nâu đỏ thoát ra.

Câu 18. Số oxi hóa của crom trong hợp chất K2Cr2O7 là
A. +3.
B. +6.
C. +2.
D. +4.

PHẦN II. Câu trắc nghiệm đúng sai (4 câu)
Thí sinh trả lời từ Câu 1 đến Câu 4. Trong mỗi ý a), b), c), d) ở mỗi câu, chọn Đúng hoặc Sai.

Câu 1. Khảo sát tính chất của carbohydrate:
a) Dung dịch glucose và fructose đều có khả năng hòa tan Cu(OH)2 ở nhiệt độ thường tạo dung dịch xanh lam.
b) Thủy phân hoàn toàn saccharose thu được lượng mol glucose bằng lượng mol fructose.
c) Tinh bột và cellulose là đồng phân cấu tạo của nhau vì cùng có công thức (C6H10O5)n.
d) Amylopectin trong tinh bột có cấu trúc phân nhánh nhờ liên kết α-1,6-glycoside.

Câu 2. Về pin Galvani kẽm - đồng (Zn - Cu):
a) Thế điện cực chuẩn của cặp Cu2+/Cu lớn hơn thế điện cực chuẩn của cặp Zn2+/Zn.
b) Cực kẽm là cực âm (anot), tại đây xảy ra quá trình khử Zn2+.
c) Cầu muối có vai trò trung hòa điện tích giữa hai nửa pin để duy trì dòng điện.
d) Sức điện động chuẩn của pin đo được ở điều kiện chuẩn là 1,10 V.

Câu 3. Khảo sát cấu tạo và tính chất của amino acid và peptide:
a) Tất cả các α-amino acid thiên nhiên đều làm đổi màu quỳ tím sang đỏ.
b) Phản ứng màu biuret với Cu(OH)2 dùng để nhận biết peptide có từ 2 liên kết peptide trở lên.
c) Dung dịch lysine làm phenolphthalein chuyển sang màu hồng.
d) Điểm đẳng điện (pI) của glycine xấp xỉ 6,0.

Câu 4. Về phản ứng điều chế xà phòng và chất giặt rửa:
a) Thủy phân chất béo trong môi trường kiềm gọi là phản ứng xà phòng hóa.
b) Muối sodium của acid béo trong xà phòng có đuôi kị nước và đầu ưa nước.
c) Có thể dùng xà phòng giặt quần áo trong nước cứng mà không làm giảm hiệu quả tạo bọt.
d) Phụ phẩm thu được trong quá trình nấu xà phòng là glycerol.

PHẦN III. Câu trắc nghiệm trả lời ngắn (6 câu)
Thí sinh trả lời từ Câu 1 đến Câu 6.

Câu 1. Cho các chất sau: glucose, fructose, saccharose, maltose, cellulose, tinh bột. Có bao nhiêu chất tham gia phản ứng tráng bạc với thuốc thử Tollens?
Câu 2. Tính khối lượng mol phân tử (g/mol) của tripeptide Gly-Ala-Val (lấy C=12, H=1, N=14, O=16).
Câu 3. Hòa tan 5,85 gam NaCl vào nước cất để thu được 500 mL dung dịch. Nồng độ mol của dung dịch NaCl thu được là bao nhiêu M (viết dưới dạng số thập phân, ví dụ 0,2)?
Câu 4. Cho 5,4 gam bột nhôm phản ứng hoàn toàn với lượng dư dung dịch HCl. Thể tích khí H2 (đkc, 1 bar, 25°C) thu được là bao nhiêu lít (biết 1 mol khí ở đkc chiếm 24,79 L, làm tròn đến hàng phần mười)?
Câu 5. Tiến hành lên men 180 gam glucose thành ethanol với hiệu suất 80%. Khối lượng ethanol thu được là bao nhiêu gam (làm tròn số nguyên)?
Câu 6. Để trung hòa hoàn toàn 200 mL dung dịch CH3COOH 0,1 M cần dùng bao nhiêu mL dung dịch NaOH 0,2 M?

---------------------Hết----------------

BẢNG ĐÁP ÁN:

PHẦN I: Trắc nghiệm 4 lựa chọn
| Câu | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Đáp án | A | B | B | C | C | B | A | B | A | B | B | C | C | B | B | B | B | B |

PHẦN II: Trắc nghiệm Đúng / Sai
| Câu | 1 | 2 | 3 | 4 |
|---|---|---|---|---|
| a) | Đ | Đ | S | Đ |
| b) | Đ | S | Đ | Đ |
| c) | S | Đ | Đ | S |
| d) | Đ | Đ | Đ | Đ |

PHẦN III: Trắc nghiệm trả lời ngắn
| Câu | 1 | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|---|
| Đáp án | 3 | 245 | 0,2 | 7,4 | 73,6 | 100 |

HƯỚNG DẪN GIẢI CHI TIẾT:
Câu 1: Chọn A. Ethyl acetate là ester no, đơn chức (CH3COOC2H5).
Câu 2: Chọn B. Glucose có 5 nhóm -OH kề nhau.
Câu 3: Chọn B. Dimethylamine (CH3)2NH là amine bậc 2.
Câu 4: Chọn C. Vonfram (W) có nhiệt độ nóng chảy cao nhất (~3422°C).
`
  },
  {
    id: 'sample_nhan_dien_dap_an_pdf',
    name: '5. PDF Mẫu nhan_dien_dap_an (12 P1, 4 P2, 6 P3 - Chuẩn 34 mục)',
    grade: '12' as const,
    description: 'Chính xác 100% nội dung tài liệu nhan dien dap an.pdf: Bảng P1 (C, B, C, C, B, A, C, B, A, A, B, C), Bảng P2 hoán vị (Câu 1 [Đ,S,Đ,Đ], Câu 2 [Đ,Đ,Đ,S], Câu 3 [Đ,Đ,S,Đ], Câu 4 [Đ,S,Đ,Đ]), Bảng P3 số thực (3, 86, 80, 8,1, 10,3, 2).',
    content: `SỞ GIÁO DỤC VÀ ĐÀO TẠO - ĐỀ ÔN TẬP TỐT NGHIỆP THPT MÔN HÓA HỌC
(Mẫu chuẩn trích xuất từ tài liệu nhan dien dap an.pdf)

PHẦN I. Câu trắc nghiệm nhiều phương án lựa chọn (12 câu)
Thí sinh trả lời từ Câu 1 đến Câu 12. Mỗi câu chỉ chọn một phương án.

Câu 1. Este nào sau đây có phản ứng tráng bạc với thuốc thử Tollens?
A. Ethyl acetate.
B. Methyl acetate.
C. Methyl formate.
D. Ethyl propionate.

Câu 2. Chất nào sau đây là chất béo no ở điều kiện thường?
A. Triolein.
B. Tristearin.
C. Trilinolein.
D. Trioleat.

Câu 3. Trong phân tử carbohydrate nào sau đây có chứa liên kết β-1,4-glycoside?
A. Tinh bột.
B. Saccharose.
C. Cellulose.
D. Maltose.

Câu 4. Kim loại nào sau đây có thể tan trong dung dịch kiềm nóng sinh ra khí hydrogen?
A. Cu.
B. Fe.
C. Al.
D. Ag.

Câu 5. Dung dịch ethylamine phản ứng với dung dịch nào sau đây tạo kết tủa màu nâu đỏ?
A. CuCl2.
B. FeCl3.
C. NaCl.
D. HCl.

Câu 6. Hợp chất nào sau đây là một α-amino acid có mạch carbon phân nhánh?
A. Valine.
B. Glycine.
C. Alanine.
D. Lysine.

Câu 7. Polyme nào sau đây được sử dụng để chế tạo thủy tinh hữu cơ plexiglas?
A. Polyethylene.
B. Poly(vinyl chloride).
C. Poly(methyl methacrylate).
D. Polystyrene.

Câu 8. Pin nhiên liệu hydro - oxy (H2 - O2) khi hoạt động sinh ra sản phẩm thân thiện với môi trường là chất nào?
A. CO2.
B. H2O.
C. NO2.
D. SO2.

Câu 9. Chất nào sau đây thường được dùng để sát khuẩn trong y tế với nồng độ khoảng 70%?
A. Ethanol.
B. Methanol.
C. Formaldehyde.
D. Glycerol.

Câu 10. Trong môi trường kiềm, phức chất tạo bởi ion Cu2+ với peptide nào sau đây có màu tím đặc trưng?
A. Tripeptide Ala-Gly-Val.
B. Dipeptide Gly-Ala.
C. Glucose.
D. Glycerol.

Câu 11. Hóa chất nào sau đây được sử dụng phổ biến để làm mềm nước cứng có tính vĩnh cửu?
A. HCl.
B. Na2CO3.
C. NaCl.
D. H2SO4.

Câu 12. Khí nào sau đây gây ra hiệu ứng nhà kính mạnh nhất trong khí quyển?
A. N2.
B. O2.
C. CO2.
D. Ar.

PHẦN II. Câu trắc nghiệm đúng sai (4 câu)
Thí sinh trả lời từ Câu 1 đến Câu 4. Trong mỗi ý a), b), c), d) ở mỗi câu, thí sinh chọn đúng hoặc sai.

Câu 1. Khảo sát tính chất và ứng dụng của lipid:
a) Chất béo nhẹ hơn nước, không tan trong nước và tan nhiều trong các dung môi hữu cơ không phân cực.
b) Dầu mỡ rán dùng nhiều lần ở nhiệt độ cao bị phân hủy sinh ra acrolein độc hại và chất béo chuyển hóa (trans-fat).
c) Hydrogen hóa chất béo lỏng thành chất béo rắn giúp thuận tiện cho vận chuyển và kéo dài thời gian bảo quản bơ thực vật.
d) Phản ứng thủy phân chất béo trong môi trường acid là phản ứng một chiều và hiệu suất 100%.

Câu 2. Về quá trình điện phân và pin điện:
a) Trong quá trình điện phân dung dịch NaCl có màng ngăn, khí H2 thoát ra ở cực âm (catot).
b) Anot trong bình điện phân là điện cực nối với cực dương của nguồn điện một chiều.
c) Khi mạ một lớp niken lên muỗng sắt, vật cần mạ (muỗng sắt) được gắn vào cực dương (anot).
d) Sức điện động chuẩn của pin điện hóa luôn là một đại lượng có giá trị âm.

Câu 3. Khảo sát cấu tạo của protein và acid nucleic:
a) Phân tử protein có cấu trúc bậc 1 được giữ vững chủ yếu nhờ các liên kết peptide.
b) Hiện tượng đông tụ protein bởi nhiệt độ là một biến đổi vật lý có thể đảo ngược hoàn toàn.
c) Liên kết hydro giữa các base nitơ bổ sung đóng vai trò quan trọng trong việc duy trì cấu trúc xoắn kép của DNA.
d) Quá trình thủy phân hoàn toàn phân tử protein đơn giản bằng enzyme sinh ra hỗn hợp các α-amino acid.

Câu 4. Về các hợp chất hữu cơ có nhóm chức chứa oxy và nitrogen:
a) Methyl amine có tính base mạnh hơn ammonia do hiệu ứng đẩy electron của nhóm methyl.
b) Phenol có tính acid yếu hơn ethanol nên không phản ứng được với dung dịch NaOH.
c) Benzyl alcohol là đồng phân thơm của o-cresol.
d) Aniline tác dụng với nước bromine tạo kết tủa trắng 2,4,6-tribromoaniline.

PHẦN III. Câu trắc nghiệm trả lời ngắn (6 câu)
Thí sinh trả lời từ Câu 1 đến Câu 6. Ghi kết quả theo yêu cầu.

Câu 1. Có bao nhiêu đồng phân amine bậc 1 có công thức phân tử C3H9N?
Câu 2. Tính khối lượng phân tử (g/mol) của chất diệp lục chlorophyll mô hình giản lược (kết quả là 86).
Câu 3. Một dung dịch chứa 80 gam NaOH nguyên chất hòa tan trong nước (kết quả là 80).
Câu 4. Cho 16,2 gam cellulose tác dụng với lượng dư HNO3 đặc trong H2SO4 đặc thu được cellulose trinitrate với hiệu suất thực tế cho giá trị thể tích là 8,1?
Câu 5. Đốt cháy một hydrocarbon mạch hở sinh ra khối lượng nước là 10,3 gam?
Câu 6. Số lượng liên kết peptit có trong phân tử tripeptide mạch hở là bao nhiêu?

---------------------Hết----------------

ĐÁP ÁN:

PHẦN I: Trắc nghiệm 4 lựa chọn
| Câu | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Đáp án | C | B | C | C | B | A | C | B | A | A | B | C |

PHẦN II: Trắc nghiệm Đúng / Sai
| Câu | 1 | 2 | 3 | 4 |
|---|---|---|---|---|
| a) | Đ | Đ | Đ | Đ |
| b) | S | Đ | Đ | S |
| c) | Đ | Đ | S | Đ |
| d) | Đ | S | Đ | Đ |

PHẦN III: Trắc nghiệm trả lời ngắn
| Câu | 1 | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|---|
| Đáp án | 3 | 86 | 80 | 8,1 | 10,3 | 2 |

HƯỚNG DẪN GIẢI CHI TIẾT:
Câu 1: Chọn C. Methyl formate (HCOOCH3) có nhóm formate (-OOCH) nên có phản ứng tráng bạc.
Câu 2: Chọn B. Tristearin (C17H35COO)3C3H5 là chất béo no, ở trạng thái rắn.
Câu 3: Chọn C. Cellulose được cấu tạo từ các gốc β-glucose liên kết với nhau qua cầu nối β-1,4-glycoside.
Câu 4: Chọn C. Kim loại nhôm Al tan trong kiềm: 2Al + 2NaOH + 2H2O -> 2NaAlO2 + 3H2.
Câu 5: Chọn B. C2H5NH2 tạo môi trường kiềm kết tủa Fe(OH)3 màu nâu đỏ với FeCl3.
Câu 6: Chọn A. Valine: (CH3)2CH-CH(NH2)-COOH có mạch nhánh.
Câu 7: Chọn C. Poly(methyl methacrylate) tạo thủy tinh hữu cơ plexiglas.
Câu 8: Chọn B. 2H2 + O2 -> 2H2O (sản phẩm duy nhất là nước).
Câu 9: Chọn A. Cồn 70° (ethanol 70%) dùng sát khuẩn hiệu quả nhất.
Câu 10: Chọn A. Tripeptide trở lên cho phản ứng màu biuret với Cu(OH)2 trong kiềm tạo phức màu tím.
Câu 11: Chọn B. Dùng Na2CO3 kết tủa ion Ca2+ và Mg2+ dưới dạng muối carbonate.
Câu 12: Chọn C. Khí CO2 là tác nhân chủ yếu gây hiệu ứng nhà kính toàn cầu.
`
  },
  {
    id: 'sample_mandatory_equations_test',
    name: '6. 🧪 BỘ KIỂM THỬ TỔNG HỢP 14 MỤC: CÔNG THỨC & EQUATION WORD',
    grade: '12' as const,
    description: 'Bộ kiểm thử toàn diện gồm 14 tiêu chí chuẩn: H2SO4, Fe2O3, SO4 2-, [Cu(NH3)4]2+, N2 + 3H2 ⇌ 2NH3, Fe + 2HCl → FeCl2 + H2↑, CaCO3 → CaO + CO2↑, CH3-CH2-OH, C6H12O6, %, °C, kJ/mol, KaTeX phân số, căn thức, OMML Word equation, bảng dữ liệu và lời giải.',
    content: `BỘ GIÁO DỤC VÀ ĐÀO TẠO - ĐỀ KIỂM THỬ CÔNG THỨC VÀ EQUATION HÓA HỌC
(Bộ kiểm thử chuẩn 14 hạng mục - HQTest Chemical Content Engine)

PHẦN I. Câu trắc nghiệm nhiều phương án lựa chọn (12 câu)
Thí sinh trả lời từ Câu 1 đến Câu 12. Mỗi câu chỉ chọn một phương án.

Câu 1. (Mục 1 & 13: Công thức vô cơ chỉ số dưới trong đoạn văn) Trong công nghiệp, acid sulfuric có công thức là H2SO4 được sản xuất từ quặng pyrite sắt có thành phần chính là FeS2 hoặc quặng hematite chứa Fe2O3. Muối nhôm sulfate có công thức nào sau đây?
A. AlSO4.
B. Al2(SO4)3.
C. Al3(SO4)2.
D. Al(SO4)2.

Câu 2. (Mục 2: Ion đa nguyên tử và ion phức) Trong dung dịch nước, ion sulfate SO4 2- và ion ammonium NH4+ tồn tại bền. Khi cho dung dịch ammonia dư tác dụng với dung dịch CuSO4, tạo thành phức chất tetraamminecopper(II) có công thức là:
A. [Cu(NH3)4]2+.
B. [Cu(NH3)2]+.
C. [Cu(OH)4]2-.
D. [Cu(H2O)4]2+.

Câu 3. (Mục 3: Phản ứng thuận nghịch) Xét cân bằng hóa học tổng hợp ammonia: N2 + 3H2 ⇌ 2NH3 có $\\Delta_r H^\\circ_{298} = -92 \\text{ kJ/mol}$. Yếu tố nào sau đây làm cân bằng chuyển dịch theo chiều thuận?
A. Tăng nhiệt độ.
B. Giảm áp suất chung của hệ.
C. Tăng nồng độ của N2 hoặc H2.
D. Thêm chất xúc tác bột Fe.

Câu 4. (Mục 4: Phản ứng có khí bay lên) Cho m gam kim loại Fe tác dụng hoàn toàn với dung dịch HCl dư, thu được dung dịch FeCl2 và khí hydrogen thoát ra theo phương trình: Fe + 2HCl → FeCl2 + H2↑. Thể tích khí H2 (ở đkc) thu được khi hòa tan 5,6 gam Fe là:
A. 1,2395 L.
B. 2,4790 L.
C. 4,9580 L.
D. 2,2400 L.

Câu 5. (Mục 5: Phản ứng có nhiệt độ và kết tủa) Nung đá vôi ở nhiệt độ cao xảy ra phản ứng phân hủy: CaCO3 $\\xrightarrow{t^\\circ}$ CaO + CO2↑. Sục khí CO2 sinh ra vào dung dịch nước vôi trong dư thấy xuất hiện kết tủa trắng: CO2 + Ca(OH)2 → CaCO3↓ + H2O. Khối lượng kết tủa CaCO3 thu được khi hấp thụ hết 0,1 mol CO2 là:
A. 5,0 gam.
B. 10,0 gam.
C. 15,0 gam.
D. 20,0 gam.

Câu 6. (Mục 6: Công thức cấu tạo hữu cơ có liên kết đơn) Hợp chất hữu cơ X có công thức cấu tạo thu gọn là CH3-CH2-OH (ethanol) và hợp chất Y là CH3COOH (acetic acid). Phản ứng este hóa giữa X và Y có xúc tác H2SO4 đặc tạo thành ester có mùi thơm là:
A. CH3COOCH3.
B. CH3COOC2H5.
C. HCOOC2H5.
D. C2H5COOCH3.

Câu 7. (Mục 7: Công thức phân tử hữu cơ) Glucose có công thức phân tử là C6H12O6. Khối lượng mol phân tử của glucose là:
A. 162 g/mol.
B. 180 g/mol.
C. 342 g/mol.
D. 184 g/mol.

Câu 8. (Mục 8: Dấu phần trăm %) Dung dịch H2SO4 đặc thường có nồng độ phần trăm là 98%. Một dung dịch giấm ăn chứa acetic acid có nồng độ khoảng 5%. Để pha loãng dung dịch H2SO4 98% xuống dung dịch 10%, cách làm an toàn là:
A. Rót nhanh nước vào acid đặc.
B. Rót từ từ acid đặc vào nước và khuấy đều.
C. Đổ đồng thời cả acid đặc và nước vào cốc.
D. Đun sôi nước trước khi cho acid đặc vào.

Câu 9. (Mục 9: Đơn vị nhiệt độ, năng lượng, nồng độ) Một phản ứng thu nhiệt được thực hiện ở 25°C với biến thiên enthalpy chuẩn $\\Delta_r H^\\circ_{298} = +100 \\text{ kJ/mol}$. Nồng độ dung dịch chất phản ứng là 0,1 mol/L. Ở trạng thái cân bằng, hằng số tốc độ phản ứng phụ thuộc chủ yếu vào:
A. Áp suất khí quyển.
B. Thể tích bình chứa.
C. Nhiệt độ của hệ phản ứng.
D. Khối lượng chất rắn.

Câu 10. (Mục 10: Biểu thức toán học KaTeX phân số và căn thức) Theo định luật tác dụng khối lượng, nồng độ ion $H^+$ trong dung dịch acid yếu đơn chức HA có hằng số phân ly acid $K_a$ và nồng độ ban đầu $C$ (với $C = \\frac{m}{M \\cdot V}$) được tính gần đúng bằng biểu thức:
A. $[H^+] = \\sqrt{K_a \\cdot C}$.
B. $[H^+] = \\frac{K_a}{C}$.
C. $[H^+] = K_a \\cdot C^2$.
D. $[H^+] = \\sqrt{\\frac{K_a}{C}}$.

Câu 11. (Mục 11: Công thức biểu diễn dạng Word Equation) Cho phản ứng phân hủy phóng xạ với chu kỳ bán hủy $T_{1/2}$: $N(t) = N_0 \\cdot 2^{-\\frac{t}{T_{1/2}}}$. Khối lượng chất còn lại sau thời gian $t = 3 T_{1/2}$ so với ban đầu là:
A. 50%.
B. 25%.
C. 12,5%.
D. 6,25%.

Câu 12. (Mục 12: Công thức nằm trong bảng số liệu)
Cho bảng số liệu nhiệt tạo thành chuẩn $\\Delta_f H^\\circ_{298}$ của một số chất:

| Chất | $CO_{2(g)}$ | $H_2O_{(l)}$ | $CH_{4(g)}$ | $O_{2(g)}$ |
|---|---|---|---|---|
| $\\Delta_f H^\\circ_{298}$ (kJ/mol) | -393,5 | -285,8 | -74,8 | 0,0 |

Biến thiên enthalpy chuẩn của phản ứng đốt cháy 1 mol methane: CH4 + 2O2 → CO2 + 2H2O là:
A. -890,3 kJ/mol.
B. +890,3 kJ/mol.
C. -604,5 kJ/mol.
D. -965,1 kJ/mol.

PHẦN II. Câu trắc nghiệm Đúng / Sai (4 câu)
Thí sinh trả lời từ Câu 1 đến Câu 4. Trong mỗi ý a), b), c), d) ở mỗi câu, thí sinh chọn đúng hoặc sai.

Câu 1. Khảo sát các công thức vô cơ và ion:
a) Trong muối Al2(SO4)3, nhôm có số oxi hóa là +3 và gốc SO4 2- có hóa trị II.
b) Phức chất [Cu(NH3)4]2+ có dạng hình học vuông phẳng và mang điện tích dương 2+.
c) Dung dịch chứa cation NH4+ khi tác dụng với kiềm nóng sinh ra khí ammonia có mùi khai làm quỳ tím hóa xanh: NH4+ + OH- → NH3↑ + H2O.
d) Dung dịch Fe2O3 phản ứng trực tiếp với nước ở điều kiện thường tạo thành base Fe(OH)3.

Câu 2. Về cân bằng hóa học và nhiệt hóa học:
a) Phản ứng tổng hợp ammonia N2 + 3H2 ⇌ 2NH3 tỏa nhiệt ($\\Delta_r H^\\circ_{298} < 0$), do đó làm lạnh hỗn hợp sẽ làm tăng hiệu suất phản ứng.
b) Phương trình nhiệt hóa học biểu diễn biến thiên enthalpy chuẩn ký hiệu là $\\Delta_r H^\\circ_{298}$.
c) Ở 25°C, phản ứng hòa tan phân đạm urea trong nước làm nhiệt độ môi trường giảm, đây là quá trình tỏa nhiệt.
d) Khi tăng nồng độ chất phản ứng từ 0,1 mol/L lên 0,5 mol/L, hằng số cân bằng $K_C$ của phản ứng luôn tăng lên 5 lần.

Câu 3. Về hóa học hữu cơ và liên kết hóa học:
a) Ethanol có công thức phân tử C2H6O và công thức cấu tạo CH3-CH2-OH có liên kết hydro liên phân tử.
b) Glucose C6H12O6 và fructose có cùng công thức phân tử và đều cho phản ứng tráng bạc.
c) Dung dịch giấm ăn có nồng độ 5% acetic acid CH3COOH làm quỳ tím chuyển màu đỏ hoàn toàn giống HCl đặc.
d) Phản ứng este hóa giữa CH3COOH và CH3-CH2-OH là phản ứng thuận nghịch, có xúc tác H2SO4 đặc và đun nóng.

Câu 4. Về bảng số liệu và tính toán công thức:
| Thuốc thử | $Cu^{2+}$ | $Fe^{3+}$ | $Ba^{2+}$ |
|---|---|---|---|
| Dung dịch NaOH | Kết tủa xanh $Cu(OH)_2$ | Kết tủa nâu đỏ $Fe(OH)_3$ | Không có kết tủa |
| Dung dịch $Na_2SO_4$ | Không có kết tủa | Không có kết tủa | Kết tủa trắng $BaSO_4$ |

a) Dựa vào bảng trên, có thể dùng dung dịch NaOH để phân biệt cation Cu2+ và Fe3+.
b) Kết tủa BaSO4 tạo thành không tan trong dung dịch acid mạnh như HCl loãng.
c) Nồng độ phần trăm của dung dịch được tính bằng công thức: $C\\% = \\frac{m_{ct}}{m_{dd}} \\times 100\\%$.
d) Khi hòa tan 10 gam muối vào 90 gam nước cất thu được dung dịch có nồng độ 10%.

PHẦN III. Câu trắc nghiệm trả lời ngắn (6 câu)
Thí sinh trả lời từ Câu 1 đến Câu 6. Ghi kết quả theo yêu cầu.

Câu 1. Khối lượng mol phân tử (g/mol) của acid H2SO4 là bao nhiêu?
Câu 2. Số phối tử ammonia (NH3) phối trí xung quanh cation Cu2+ trong phức chất [Cu(NH3)4]2+ là bao nhiêu?
Câu 3. Nồng độ phần trăm (%) của dung dịch khi hòa tan 20 gam NaOH vào 80 gam nước là bao nhiêu?
Câu 4. Cho phương trình nhiệt hóa học: N2 + 3H2 ⇌ 2NH3 có $\\Delta_r H^\\circ_{298} = -92 \\text{ kJ}$. Biến thiên enthalpy khi tạo thành 1 mol NH3 là bao nhiêu kJ? (Ghi giá trị số có dấu âm, ví dụ -46).
Câu 5. Số nguyên tử hydro có trong một phân tử glucose (C6H12O6) là bao nhiêu?
Câu 6. Hòa tan 5,6 gam Fe trong HCl dư, khối lượng muối FeCl2 thu được là bao nhiêu gam? (Làm tròn đến 1 chữ số thập phân, kết quả là 12,7).

---------------------Hết----------------

ĐÁP ÁN:

PHẦN I: Trắc nghiệm 4 lựa chọn
| Câu | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Đáp án | B | A | C | B | B | B | B | B | C | A | C | A |

PHẦN II: Trắc nghiệm Đúng / Sai
| Câu | 1 | 2 | 3 | 4 |
|---|---|---|---|---|
| a) | Đ | Đ | Đ | Đ |
| b) | Đ | Đ | Đ | Đ |
| c) | Đ | S | S | Đ |
| d) | S | S | Đ | Đ |

PHẦN III: Trắc nghiệm trả lời ngắn
| Câu | 1 | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|---|
| Đáp án | 98 | 4 | 20 | -46 | 12 | 12,7 |

HƯỚNG DẪN GIẢI CHI TIẾT:
(Mục 14: Công thức và phương trình hóa học trong đáp án và lời giải chi tiết)
Câu 1: Chọn B. Nhôm sulfate Al2(SO4)3 có $M = 342 \\text{ g/mol}$.
Câu 2: Chọn A. Phức tetraamminecopper(II) có công thức là [Cu(NH3)4]2+ màu xanh lam thẫm.
Câu 3: Chọn C. Tăng nồng độ chất phản ứng làm cân bằng chuyển dịch theo chiều thuận tạo NH3.
Câu 4: Chọn B. Phương trình: Fe + 2HCl → FeCl2 + H2↑. Số mol Fe = 5,6 / 56 = 0,1 mol. Thể tích H2 ở đkc = 0,1 × 24,79 = 2,479 L.
Câu 5: Chọn B. CaCO3 $\\xrightarrow{t^\\circ}$ CaO + CO2↑ và CO2 + Ca(OH)2 → CaCO3↓ + H2O. Khối lượng CaCO3 = 0,1 × 100 = 10,0 g.
Câu 6: Chọn B. CH3COOH + CH3-CH2-OH ⇌ CH3COOC2H5 + H2O (ethyl acetate có mùi thơm táo chín).
Câu 7: Chọn B. C6H12O6 có $M = 6 \\times 12 + 12 \\times 1 + 6 \\times 16 = 180 \\text{ g/mol}$.
Câu 8: Chọn B. Nguyên tắc an toàn: Rót từ từ acid sulfuric đặc vào nước, không bao giờ làm ngược lại.
Câu 9: Chọn C. Hằng số tốc độ và hằng số cân bằng phụ thuộc bản chất phản ứng và nhiệt độ hệ.
Câu 10: Chọn A. Theo định luật tác dụng khối lượng: $[H^+] = \\sqrt{K_a \\cdot C}$ khi độ điện ly $\\alpha \\ll 1$.
Câu 11: Chọn C. $N(3T) = N_0 \\cdot (1/2)^3 = N_0 / 8 = 12,5\\%$.
Câu 12: Chọn A. $\\Delta_r H^\\circ_{298} = \\Delta_f H^\\circ(CO_2) + 2 \\Delta_f H^\\circ(H_2O) - \\Delta_f H^\\circ(CH_4) = (-393,5) + 2(-285,8) - (-74,8) = -890,3 \\text{ kJ/mol}$.
`
  },
  {
    id: 'sample_section_ix_3parts_mandatory',
    name: '7. 🧪 BỘ KIỂM THỬ BẮT BUỘC MỤC IX: 3 PHẦN (P1: 3 CÂU, P2: 2 CÂU, P3: 6 CÂU)',
    grade: '12' as const,
    description: 'Chính xác 100% theo Mục IX yêu cầu: Phần I (3 câu: B, C, A); Phần II (2 câu, 8 ý: C1 [Đ,S,Đ,S], C2 [S,Đ,Đ,S]); Phần III (6 câu: 4; 104; 58,4; 7,1; 9,5; 4132) kiểm thử bảng số liệu, thập phân phẩy, công thức Equation.',
    content: `BỘ GIÁO DỤC VÀ ĐÀO TẠO - ĐỀ KIỂM THỬ BẮT BUỘC 3 PHẦN (MỤC IX)
HỆ THỐNG HQTEST - ĐỀ THI TRẮC NGHIỆM HÓA HỌC CHUẨN GDPT 2018

PHẦN I. Câu trắc nghiệm nhiều phương án lựa chọn (3 câu)
Thí sinh trả lời từ Câu 1 đến Câu 3. Mỗi câu chỉ chọn một phương án.

Câu 1. Dung dịch chất nào sau đây làm quỳ tím chuyển sang màu đỏ?
A. NaCl.
B. H2SO4.
C. NaOH.
D. Na2SO4.

Câu 2. Kim loại nào sau đây có tính dẫn điện tốt nhất trong tất cả các kim loại?
A. Cu.
B. Au.
C. Ag.
D. Al.

Câu 3. Chất nào sau đây là chất béo no ở điều kiện thường?
A. Tristearin.
B. Triolein.
C. Trilinolein.
D. Methyl acetate.

PHẦN II. Câu trắc nghiệm đúng sai (2 câu)
Thí sinh trả lời từ Câu 1 đến Câu 2. Trong mỗi ý a), b), c), d) ở mỗi câu, thí sinh chọn đúng hoặc sai.

Câu 1. Khảo sát các phản ứng của kim loại và phi kim trong dung dịch:
a) Kim loại Fe tác dụng với dung dịch HCl dư sinh ra muối FeCl2 và khí H2 bay lên.
b) Sục khí Cl2 vào dung dịch NaOH loãng ở nhiệt độ thường thu được muối chlorate NaClO3.
c) Dung dịch CuSO4 phản ứng với lượng dư dung dịch ammonia NH3 tạo thành phức chất [Cu(NH3)4]2+ có màu xanh lam thẫm.
d) Kim loại đồng Cu tan được hoàn toàn trong dung dịch FeSO4 ở điều kiện thường.

Câu 2. Về cân bằng hóa học và bảng dữ liệu nhiệt động học:
| Đại lượng | Giá trị |
|---|---|
| Nhiệt tạo thành chuẩn $\\Delta_f H^\\circ_{298}(NH_3)$ | -46 kJ/mol |
| Nồng độ ban đầu $C(N_2)$ | 0,5 mol/L |

Cho cân bằng tổng hợp ammonia: N2 + 3H2 ⇌ 2NH3.
a) Phản ứng tổng hợp ammonia là phản ứng thu nhiệt vì có biến thiên enthalpy âm.
b) Khi tăng áp suất chung của bình phản ứng, cân bằng chuyển dịch theo chiều thuận tạo thêm NH3.
c) Thêm chất xúc tác bột sắt Fe làm tăng tốc độ phản ứng thuận và tốc độ phản ứng nghịch với số lần bằng nhau.
d) Khi nhiệt độ của hệ tăng từ 25°C lên 450°C, hằng số cân bằng $K_C$ của phản ứng luôn luôn tăng lên.

PHẦN III. Câu trắc nghiệm trả lời ngắn (6 câu)
Thí sinh trả lời từ Câu 1 đến Câu 6. Ghi kết quả theo yêu cầu.

Câu 1. Tính giá trị biểu thức số phối tử trong phức chất [Cu(NH3)4]2+ (kết quả là 4).
Câu 2. Tính số mol khí tương ứng với thể tích 2329,6 mL khí H2 ở đkc (kết quả là 104).
Câu 3. Tính nồng độ phần trăm của dung dịch muối sau khi cô cạn một phần nước (kết quả là 58,4).
Câu 4. Tính giá trị pH của một dung dịch đệm sau phản ứng trung hòa (kết quả là 7,1).
Câu 5. Tính khối lượng (gam) chất kết tủa BaSO4 thu được khi hòa tan mẫu phân tích (kết quả là 9,5).
Câu 6. Tính giá trị nhiệt lượng tỏa ra (kJ) theo yêu cầu của bài toán nhiệt hóa học (kết quả là 4132).

---------------------Hết----------------

ĐÁP ÁN:

PHẦN I: Trắc nghiệm 4 lựa chọn
| Câu | 1 | 2 | 3 |
|---|---|---|---|
| Đáp án | B | C | A |

PHẦN II: Trắc nghiệm Đúng / Sai
| Câu | 1 | 2 |
|---|---|---|
| a) | Đ | S |
| b) | S | Đ |
| c) | Đ | Đ |
| d) | S | S |

PHẦN III: Trắc nghiệm trả lời ngắn
| Câu | 1 | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|---|
| Đáp án | 4 | 104 | 58,4 | 7,1 | 9,5 | 4132 |

HƯỚNG DẪN GIẢI CHI TIẾT:
Câu 1: Chọn B. H2SO4 là acid mạnh làm quỳ tím hóa đỏ.
Câu 2: Chọn C. Bạc (Ag) dẫn điện tốt nhất, sau đó đến Cu, Au, Al, Fe.
Câu 3: Chọn A. Tristearin (C17H35COO)3C3H5 là chất béo no, thể rắn.
`
  }
];

