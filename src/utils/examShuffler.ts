import type {
  MultipleChoiceOption,
  Question,
  QuestionType,
  TrueFalseStatement,
} from '../types';
import { resolveQuestionPartType } from './examSectionGrouping';

export interface ShuffleOptions {
  variantCount: number;
  /** Starting code or prefix+number, e.g. "101", "201", "001", or "DE-101" */
  codePrefix: string;
  shuffleQuestionsInPart: boolean;
  shufflePart1Options: boolean;
  shufflePart2Statements: boolean;
}

export interface ExamHeaderMeta {
  schoolName: string;
  departmentName?: string;
  examTitle: string;
  subjectName: string;
  durationMinutes: number;
  schoolYear: string;
}

export interface ShuffledQuestionItem {
  /** 1-based position in the original exam within its part */
  originalPartIndex: number;
  /** 1-based position in the shuffled variant within its part */
  newNumber: number;
  partType: 'part1' | 'part2' | 'part3';
  question: Question;
}

export interface ShuffledExamVariant {
  variantCode: string;
  part1: ShuffledQuestionItem[];
  part2: ShuffledQuestionItem[];
  part3: ShuffledQuestionItem[];
  /** Question number (1-based within Part I) -> e.g. "A" or "A, C" */
  part1Answers: Record<number, string>;
  /** Question number (1-based within Part II) -> { a: true, b: false, c: true, d: false } */
  part2Answers: Record<number, Record<string, boolean>>;
  /** Question number (1-based within Part III) -> e.g. "7,04" */
  part3Answers: Record<number, string>;
}

export interface GroupedSourceQuestions {
  part1: Question[];
  part2: Question[];
  part3: Question[];
}

export interface ShuffledExamBundle {
  meta: ExamHeaderMeta;
  options: ShuffleOptions;
  sourceCounts: {
    part1: number;
    part2: number;
    part3: number;
    total: number;
  };
  variants: ShuffledExamVariant[];
  generatedAt: string;
}

const OPTION_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] as const;
const STATEMENT_LETTERS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;

/**
 * Unbiased Fisher-Yates shuffle returning a new array without mutating the input.
 */
export function fisherYatesShuffle<T>(
  items: readonly T[],
  rng: () => number = defaultRandomFloat
): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function defaultRandomFloat(): number {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return buf[0] / 0x100000000;
  }
  return Math.random();
}

/**
 * Generates sequential variant codes from a user-provided starting prefix/code.
 * Examples:
 * - ("101", 4) -> ["101", "102", "103", "104"]
 * - ("001", 3) -> ["001", "002", "003"]
 * - ("DE-201", 3) -> ["DE-201", "DE-202", "DE-203"]
 * - ("HOA", 2) -> ["HOA101", "HOA102"]
 */
export function generateVariantCodes(rawPrefix: string, count: number): string[] {
  const safeCount = Math.max(1, Math.min(24, Math.floor(count || 1)));
  const cleaned = (rawPrefix || '').trim() || '101';

  const trailingDigitsMatch = cleaned.match(/^(.*?)(\d+)$/);
  if (trailingDigitsMatch) {
    const prefix = trailingDigitsMatch[1];
    const digitsStr = trailingDigitsMatch[2];
    const startNum = parseInt(digitsStr, 10);
    const padLength = digitsStr.length;
    return Array.from({ length: safeCount }, (_, idx) => {
      const nextNum = String(startNum + idx).padStart(padLength, '0');
      return `${prefix}${nextNum}`;
    });
  }

  return Array.from({ length: safeCount }, (_, idx) => `${cleaned}${101 + idx}`);
}

/**
 * Strictly separates questions into GDPT 2018 Parts I, II, III.
 * Never mixes questions across parts.
 */
export function groupQuestionsByGdpt2018Part(questions: readonly Question[]): GroupedSourceQuestions {
  const part1: Question[] = [];
  const part2: Question[] = [];
  const part3: Question[] = [];

  for (const q of questions) {
    const resolvedType: QuestionType = resolveQuestionPartType(q);
    if (resolvedType === 'part2_true_false') {
      part2.push(q);
    } else if (resolvedType === 'part3_short_answer') {
      part3.push(q);
    } else {
      part1.push(q);
    }
  }

  return { part1, part2, part3 };
}

/**
 * Deep clones and optionally shuffles a Part I question's options (A, B, C, D),
 * re-labeling option IDs strictly in A..D order and updating correctOptionId / correctOptionIds / isCorrect.
 */
function preparePart1Question(
  source: Question,
  shouldShuffleOptions: boolean,
  rng: () => number
): { question: Question; answerKey: string } {
  const rawOptions = Array.isArray(source.options) ? source.options : [];
  const existingCorrectSet = new Set<string>();

  if (Array.isArray(source.correctOptionIds) && source.correctOptionIds.length > 0) {
    for (const id of source.correctOptionIds) {
      if (typeof id === 'string' && id.trim()) {
        existingCorrectSet.add(id.trim().toUpperCase());
      }
    }
  }
  if (typeof source.correctOptionId === 'string' && source.correctOptionId.trim()) {
    existingCorrectSet.add(source.correctOptionId.trim().toUpperCase());
  }

  const annotated = rawOptions.map((opt, idx) => {
    const normalizedId = (opt.id || OPTION_LETTERS[idx] || String(idx + 1)).trim().toUpperCase();
    const isCorrect = Boolean(opt.isCorrect) || existingCorrectSet.has(normalizedId);
    return {
      text: opt.text || '',
      isCorrect,
    };
  });

  const ordered =
    shouldShuffleOptions && annotated.length > 1
      ? fisherYatesShuffle(annotated, rng)
      : annotated;

  const nextOptions: MultipleChoiceOption[] = ordered.map((item, idx) => ({
    id: OPTION_LETTERS[idx] || String.fromCharCode(65 + idx),
    text: item.text,
    isCorrect: item.isCorrect,
  }));

  const nextCorrectIds = nextOptions.filter((o) => o.isCorrect).map((o) => o.id);
  const nextCorrectId = nextCorrectIds[0] || '';

  const cloned: Question = {
    ...source,
    options: nextOptions,
    correctOptionId: nextCorrectId || undefined,
    ...(source.type === 'part1_multiple_choice' || nextCorrectIds.length > 1
      ? { correctOptionIds: nextCorrectIds }
      : { correctOptionIds: undefined }),
  };

  const answerKey =
    nextCorrectIds.length > 1
      ? nextCorrectIds.join(', ')
      : nextCorrectId || '—';

  return { question: cloned, answerKey };
}

/**
 * Deep clones and optionally shuffles a Part II question's sub-statements (a, b, c, d),
 * re-labeling IDs strictly in a..d order while preserving each statement's exact True/False state.
 */
function preparePart2Question(
  source: Question,
  shouldShuffleStatements: boolean,
  rng: () => number
): { question: Question; answerMap: Record<string, boolean> } {
  const rawStatements = Array.isArray(source.statements) ? source.statements : [];

  const clonedSource = rawStatements.map((st) => ({
    statement: st.statement || '',
    correctAnswer: Boolean(st.correctAnswer),
    explanation: st.explanation,
  }));

  const ordered =
    shouldShuffleStatements && clonedSource.length > 1
      ? fisherYatesShuffle(clonedSource, rng)
      : clonedSource;

  const answerMap: Record<string, boolean> = {};
  const nextStatements: TrueFalseStatement[] = ordered.map((item, idx) => {
    const letter = STATEMENT_LETTERS[idx] || String.fromCharCode(97 + idx);
    answerMap[letter] = item.correctAnswer;
    return {
      id: letter,
      statement: item.statement,
      correctAnswer: item.correctAnswer,
      ...(item.explanation ? { explanation: item.explanation } : {}),
    };
  });

  const cloned: Question = {
    ...source,
    statements: nextStatements,
  };

  return { question: cloned, answerMap };
}

/**
 * Deep clones a Part III short-answer question and formats its exact canonical answer string.
 */
function preparePart3Question(source: Question): { question: Question; answerValue: string } {
  const cfg = source.shortAnswerConfig;
  const acceptable = Array.isArray(cfg?.acceptableAnswers)
    ? cfg.acceptableAnswers.map((a) => String(a).trim()).filter(Boolean)
    : [];

  let displayAnswer = acceptable[0] || '';
  if (!displayAnswer && typeof cfg?.numericValue === 'number' && Number.isFinite(cfg.numericValue)) {
    displayAnswer = String(cfg.numericValue).replace('.', ',');
  }

  const cloned: Question = {
    ...source,
    shortAnswerConfig: cfg
      ? {
          ...cfg,
          acceptableAnswers: [...acceptable],
        }
      : undefined,
  };

  return {
    question: cloned,
    answerValue: displayAnswer || '—',
  };
}

function buildVariantFingerprint(variant: ShuffledExamVariant): string {
  const p1 = variant.part1
    .map((item) => `${item.originalPartIndex}:${variant.part1Answers[item.newNumber] || ''}`)
    .join(',');
  const p2 = variant.part2
    .map((item) => {
      const m = variant.part2Answers[item.newNumber] || {};
      const key = Object.entries(m)
        .map(([k, v]) => `${k}${v ? 'D' : 'S'}`)
        .join('');
      return `${item.originalPartIndex}:${key}`;
    })
    .join(',');
  const p3 = variant.part3.map((item) => item.originalPartIndex).join(',');
  return `${p1}|${p2}|${p3}`;
}

function buildSingleVariant(
  variantCode: string,
  grouped: GroupedSourceQuestions,
  options: ShuffleOptions,
  rng: () => number
): ShuffledExamVariant {
  const p1Indexed = grouped.part1.map((q, idx) => ({ q, originalPartIndex: idx + 1 }));
  const p2Indexed = grouped.part2.map((q, idx) => ({ q, originalPartIndex: idx + 1 }));
  const p3Indexed = grouped.part3.map((q, idx) => ({ q, originalPartIndex: idx + 1 }));

  const p1Ordered =
    options.shuffleQuestionsInPart && p1Indexed.length > 1
      ? fisherYatesShuffle(p1Indexed, rng)
      : p1Indexed;
  const p2Ordered =
    options.shuffleQuestionsInPart && p2Indexed.length > 1
      ? fisherYatesShuffle(p2Indexed, rng)
      : p2Indexed;
  const p3Ordered =
    options.shuffleQuestionsInPart && p3Indexed.length > 1
      ? fisherYatesShuffle(p3Indexed, rng)
      : p3Indexed;

  const part1Answers: Record<number, string> = {};
  const part1: ShuffledQuestionItem[] = p1Ordered.map((entry, idx) => {
    const newNumber = idx + 1;
    const { question, answerKey } = preparePart1Question(entry.q, options.shufflePart1Options, rng);
    part1Answers[newNumber] = answerKey;
    return {
      originalPartIndex: entry.originalPartIndex,
      newNumber,
      partType: 'part1',
      question,
    };
  });

  const part2Answers: Record<number, Record<string, boolean>> = {};
  const part2: ShuffledQuestionItem[] = p2Ordered.map((entry, idx) => {
    const newNumber = idx + 1;
    const { question, answerMap } = preparePart2Question(
      entry.q,
      options.shufflePart2Statements,
      rng
    );
    part2Answers[newNumber] = answerMap;
    return {
      originalPartIndex: entry.originalPartIndex,
      newNumber,
      partType: 'part2',
      question,
    };
  });

  const part3Answers: Record<number, string> = {};
  const part3: ShuffledQuestionItem[] = p3Ordered.map((entry, idx) => {
    const newNumber = idx + 1;
    const { question, answerValue } = preparePart3Question(entry.q);
    part3Answers[newNumber] = answerValue;
    return {
      originalPartIndex: entry.originalPartIndex,
      newNumber,
      partType: 'part3',
      question,
    };
  });

  return {
    variantCode,
    part1,
    part2,
    part3,
    part1Answers,
    part2Answers,
    part3Answers,
  };
}

/**
 * Generates N shuffled exam variants strictly respecting GDPT 2018 Part I / II / III boundaries.
 * Attempts up to 8 retries per variant when shuffling is active so generated exam codes stay distinct.
 */
export function generateShuffledExamBundle(
  sourceQuestions: readonly Question[],
  meta: ExamHeaderMeta,
  options: ShuffleOptions,
  rng: () => number = defaultRandomFloat
): ShuffledExamBundle {
  const grouped = groupQuestionsByGdpt2018Part(sourceQuestions);
  const codes = generateVariantCodes(options.codePrefix, options.variantCount);

  const anyShuffleEnabled =
    options.shuffleQuestionsInPart ||
    options.shufflePart1Options ||
    options.shufflePart2Statements;

  const seenFingerprints = new Set<string>();
  const variants: ShuffledExamVariant[] = [];

  for (const code of codes) {
    let chosen = buildSingleVariant(code, grouped, options, rng);
    if (anyShuffleEnabled) {
      let fp = buildVariantFingerprint(chosen);
      let retries = 0;
      while (seenFingerprints.has(fp) && retries < 8) {
        chosen = buildSingleVariant(code, grouped, options, rng);
        fp = buildVariantFingerprint(chosen);
        retries += 1;
      }
      seenFingerprints.add(fp);
    }
    variants.push(chosen);
  }

  return {
    meta,
    options,
    sourceCounts: {
      part1: grouped.part1.length,
      part2: grouped.part2.length,
      part3: grouped.part3.length,
      total: grouped.part1.length + grouped.part2.length + grouped.part3.length,
    },
    variants,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Formats a Part II answer map into compact display string e.g. "a-Đ, b-S, c-Đ, d-S".
 */
export function formatPart2AnswerCompact(map?: Record<string, boolean>): string {
  if (!map) return '—';
  const entries = Object.entries(map);
  if (entries.length === 0) return '—';
  return entries.map(([letter, val]) => `${letter}-${val ? 'Đ' : 'S'}`).join(', ');
}
