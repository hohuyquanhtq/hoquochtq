import { DetectedExamSection, Exam, Question, QuestionType, StudentAnswer } from '../types';

export const DEFAULT_SECTION_TITLES: Record<QuestionType, string> = {
  part1_single_choice: 'PHẦN I. TRẮC NGHIỆM 4 LỰA CHỌN',
  part2_true_false: 'PHẦN II. TRẮC NGHIỆM ĐÚNG/SAI',
  part3_short_answer: 'PHẦN III. TRẢ LỜI NGẮN',
};

export const SHORT_PART_BADGES: Record<QuestionType, string> = {
  part1_single_choice: 'Phần I: 4 Lựa chọn',
  part2_true_false: 'Phần II: Đúng / Sai',
  part3_short_answer: 'Phần III: Trả lời ngắn',
};

export type QuestionCompletionStatus = 'unanswered' | 'partial' | 'completed';

export interface QuestionProgressInfo {
  status: QuestionCompletionStatus;
  isCompleted: boolean;
  isPartial: boolean;
  isFlagged: boolean;
  answeredUnits: number;
  totalUnits: number;
  invalidInput: boolean;
}

export interface GroupedQuestionItem {
  question: Question;
  index: number; // 0-based index in exam.questions
  questionNumber: number; // 1-based continuous number (1..N)
  partType: QuestionType;
}

export interface ExamSectionGroup {
  key: string;
  title: string;
  partType: QuestionType;
  items: GroupedQuestionItem[];
}

const SYNTHETIC_PLACEHOLDER_TITLE = 'Phần chưa có tiêu đề (Tự động suy luận)';

function stripAccentsLower(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
}

function parsePartTypeFromHint(hint?: string): QuestionType | null {
  if (!hint || typeof hint !== 'string') return null;
  const raw = hint.trim();
  if (!raw) return null;
  const norm = stripAccentsLower(raw);

  if (
    norm === 'part1' ||
    norm === 'part_1' ||
    norm === 'part1_single_choice' ||
    norm === 'p1' ||
    norm === 'i' ||
    norm === '1' ||
    /^phan\s*(i|1)\b/.test(norm) ||
    /trac\s*nghiem\s*4\s*lua\s*chon|nhieu\s*lua\s*chon|single\s*choice/.test(norm)
  ) {
    return 'part1_single_choice';
  }

  if (
    norm === 'part2' ||
    norm === 'part_2' ||
    norm === 'part2_true_false' ||
    norm === 'p2' ||
    norm === 'ii' ||
    norm === '2' ||
    /^phan\s*(ii|2)\b/.test(norm) ||
    /dung\s*[\/\-]?\s*sai|true\s*[\/\-]?\s*false/.test(norm)
  ) {
    return 'part2_true_false';
  }

  if (
    norm === 'part3' ||
    norm === 'part_3' ||
    norm === 'part3_short_answer' ||
    norm === 'p3' ||
    norm === 'iii' ||
    norm === '3' ||
    /^phan\s*(iii|3)\b/.test(norm) ||
    /tra\s*loi\s*ngan|short\s*answer/.test(norm)
  ) {
    return 'part3_short_answer';
  }

  return null;
}

function isMachineOrBareHeader(text?: string): boolean {
  if (!text || typeof text !== 'string') return true;
  const trimmed = text.trim();
  if (!trimmed) return true;
  if (trimmed === SYNTHETIC_PLACEHOLDER_TITLE) return true;
  if (/^(?:sec|part|p)_?\d+$/i.test(trimmed)) return true;
  if (/^(?:part1_single_choice|part2_true_false|part3_short_answer)$/i.test(trimmed)) return true;
  if (/^(?:I|II|III|1|2|3)$/i.test(trimmed)) return true;
  // Bare "PHẦN I", "Phần II:", "PHẦN III." without any custom descriptive title
  const norm = stripAccentsLower(trimmed);
  if (/^phan\s*(?:i{1,3}|1|2|3)\s*[:.\-–—]*$/.test(norm)) return true;
  return false;
}

/**
 * Resolves the canonical QuestionType (Part I / II / III) using priority:
 * 1. Explicit section / part metadata on the question
 * 2. Question type (question.type)
 * 3. Question structure (statements / shortAnswerConfig / options)
 */
export function resolveQuestionPartType(q: Question, detectedSec?: DetectedExamSection): QuestionType {
  const rec = q as Question & Record<string, unknown>;
  const sectionHint =
    (typeof rec.section === 'string' && rec.section) ||
    (typeof rec.part === 'string' && rec.part) ||
    (typeof rec.sectionTitle === 'string' && rec.sectionTitle) ||
    (typeof rec.partTitle === 'string' && rec.partTitle) ||
    detectedSec?.rawTitle;

  const hintedType = parsePartTypeFromHint(sectionHint);
  if (hintedType) return hintedType;

  if (
    q.type === 'part1_single_choice' ||
    q.type === 'part2_true_false' ||
    q.type === 'part3_short_answer'
  ) {
    return q.type;
  }

  if (detectedSec?.detectedType) return detectedSec.detectedType;
  if (Array.isArray(q.statements) && q.statements.length > 0) return 'part2_true_false';
  if (q.shortAnswerConfig) return 'part3_short_answer';
  return 'part1_single_choice';
}

function resolveSectionDisplayTitle(
  q: Question,
  partType: QuestionType,
  detectedSec?: DetectedExamSection
): string {
  const rec = q as Question & Record<string, unknown>;
  const candidates = [
    typeof rec.sectionTitle === 'string' ? rec.sectionTitle : undefined,
    typeof rec.partTitle === 'string' ? rec.partTitle : undefined,
    typeof rec.sectionName === 'string' ? rec.sectionName : undefined,
    detectedSec?.rawTitle,
    typeof rec.section === 'string' ? rec.section : undefined,
    typeof rec.part === 'string' ? rec.part : undefined,
  ];

  for (const candidate of candidates) {
    if (candidate && !isMachineOrBareHeader(candidate)) {
      return candidate.trim();
    }
  }

  return DEFAULT_SECTION_TITLES[partType];
}

function isEquivalentToDefaultTitle(title: string, partType: QuestionType): boolean {
  const norm = stripAccentsLower(title).replace(/[^a-z0-9]+/g, ' ').trim();
  const defNorm = stripAccentsLower(DEFAULT_SECTION_TITLES[partType]).replace(/[^a-z0-9]+/g, ' ').trim();
  return norm === defNorm;
}

/**
 * Groups exam questions into actual exam sections while preserving continuous 1..N numbering
 * and never mutating question IDs, order, or stored answer data.
 */
export function groupExamQuestionsBySection(exam?: Exam | null): ExamSectionGroup[] {
  const questions = Array.isArray(exam?.questions) ? exam.questions : [];
  if (questions.length === 0) return [];

  const detectedSectionMap = new Map<string, DetectedExamSection>();
  if (Array.isArray(exam?.detectedSections)) {
    for (const sec of exam.detectedSections) {
      if (sec?.id) detectedSectionMap.set(sec.id, sec);
    }
  }

  const groups: ExamSectionGroup[] = [];
  const groupMap = new Map<string, ExamSectionGroup>();

  questions.forEach((q, idx) => {
    const detectedSec = q.sectionId ? detectedSectionMap.get(q.sectionId) : undefined;
    const partType = resolveQuestionPartType(q, detectedSec);
    const title = resolveSectionDisplayTitle(q, partType, detectedSec);
    const hasCustomTitle = !isEquivalentToDefaultTitle(title, partType);

    const groupKey = hasCustomTitle
      ? `custom:${q.sectionId || ''}:${stripAccentsLower(title)}`
      : `canonical:${partType}`;

    let group = groupMap.get(groupKey);
    if (!group) {
      group = {
        key: groupKey,
        title,
        partType,
        items: [],
      };
      groupMap.set(groupKey, group);
      groups.push(group);
    }

    group.items.push({
      question: q,
      index: idx,
      questionNumber: idx + 1,
      partType,
    });
  });

  return groups;
}

/**
 * Validates Part III short-answer input according to question rules.
 */
export function isValidShortAnswerValue(q: Question, rawAnswer?: string): boolean {
  const trimmed = (rawAnswer ?? '').trim();
  if (!trimmed) return false;

  if (q.shortAnswerConfig?.isNumeric) {
    const compact = trimmed.replace(/\s+/g, '');
    if (!/^[+-]?(?:\d+(?:[.,]\d+)?|[.,]\d+)$/.test(compact)) {
      return false;
    }
    const parsed = parseFloat(compact.replace(',', '.'));
    return !Number.isNaN(parsed) && Number.isFinite(parsed);
  }

  return trimmed.length > 0;
}

/**
 * Computes completion, partial-completion (Part II), review-flag, and validity state for a question.
 */
export function getQuestionProgress(q: Question, answer?: StudentAnswer): QuestionProgressInfo {
  const partType = resolveQuestionPartType(q);
  const isFlagged = !!answer?.isMarkedForReview;

  if (partType === 'part1_single_choice') {
    const hasSelected = !!answer?.selectedOptionId && answer.selectedOptionId.trim().length > 0;
    return {
      status: hasSelected ? 'completed' : 'unanswered',
      isCompleted: hasSelected,
      isPartial: false,
      isFlagged,
      answeredUnits: hasSelected ? 1 : 0,
      totalUnits: 1,
      invalidInput: false,
    };
  }

  if (partType === 'part2_true_false') {
    const statements = Array.isArray(q.statements) ? q.statements : [];
    const selected = answer?.selectedStatements || {};

    if (statements.length > 0) {
      const answeredUnits = statements.filter(
        st => selected[st.id] === true || selected[st.id] === false
      ).length;
      const totalUnits = statements.length;
      const isCompleted = answeredUnits === totalUnits;
      const isPartial = answeredUnits > 0 && answeredUnits < totalUnits;

      return {
        status: isCompleted ? 'completed' : isPartial ? 'partial' : 'unanswered',
        isCompleted,
        isPartial,
        isFlagged,
        answeredUnits,
        totalUnits,
        invalidInput: false,
      };
    }

    const fallbackAnswered = Object.values(selected).filter(v => v === true || v === false).length;
    const isCompleted = fallbackAnswered >= 4;
    const isPartial = fallbackAnswered > 0 && fallbackAnswered < 4;
    return {
      status: isCompleted ? 'completed' : isPartial ? 'partial' : 'unanswered',
      isCompleted,
      isPartial,
      isFlagged,
      answeredUnits: fallbackAnswered,
      totalUnits: 4,
      invalidInput: false,
    };
  }

  // Part III: Short answer
  const rawText = (answer?.textAnswer ?? '').trim();
  if (!rawText) {
    return {
      status: 'unanswered',
      isCompleted: false,
      isPartial: false,
      isFlagged,
      answeredUnits: 0,
      totalUnits: 1,
      invalidInput: false,
    };
  }

  const valid = isValidShortAnswerValue(q, rawText);
  return {
    status: valid ? 'completed' : 'unanswered',
    isCompleted: valid,
    isPartial: false,
    isFlagged,
    answeredUnits: valid ? 1 : 0,
    totalUnits: 1,
    invalidInput: !valid,
  };
}

export function getSectionProgressSummary(
  group: ExamSectionGroup,
  answers: Record<string, StudentAnswer>
): {
  completedCount: number;
  partialCount: number;
  totalCount: number;
  label: string;
} {
  let completedCount = 0;
  let partialCount = 0;

  for (const item of group.items) {
    const progress = getQuestionProgress(item.question, answers[item.question.id]);
    if (progress.isCompleted) completedCount++;
    else if (progress.isPartial) partialCount++;
  }

  const totalCount = group.items.length;
  const verb = group.partType === 'part2_true_false' ? 'Đã hoàn thành' : 'Đã trả lời';

  return {
    completedCount,
    partialCount,
    totalCount,
    label: `${verb} ${completedCount}/${totalCount} câu`,
  };
}
