import { Question } from '../types';

/**
 * Normalizes text for duplicate detection while preserving chemical symbols,
 * numbers, formulas, and meaningful tokens.
 */
export function normalizeTextForFingerprint(raw?: string): string {
  if (!raw) return '';
  return raw
    .normalize('NFC')
    .replace(/^\s*(?:Câu|Question)\s*\d+\s*[:.)-]?\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Builds a deterministic fingerprint for a Question combining its type,
 * normalized stem content, and structured answer choices / statements / short answers.
 * This catches genuine duplicates without false-flagging distinct questions that share a lead-in.
 */
export function buildQuestionDuplicateFingerprint(q: Question): string {
  const stem = normalizeTextForFingerprint(q.content);
  const type = q.type || 'part1_single_choice';

  if (type === 'part1_single_choice' || type === 'part1_multiple_choice') {
    const opts = (q.options || [])
      .map((o) => `${(o.id || '').toUpperCase()}:${normalizeTextForFingerprint(o.text)}`)
      .join('|');
    return `${type}::${stem}::${opts}`;
  }

  if (type === 'part2_true_false') {
    const stmts = (q.statements || [])
      .map((s) => `${(s.id || '').toLowerCase()}:${normalizeTextForFingerprint(s.statement)}`)
      .join('|');
    return `${type}::${stem}::${stmts}`;
  }

  if (type === 'part3_short_answer') {
    const ans = (q.shortAnswerConfig?.acceptableAnswers || [])
      .map((a) => normalizeTextForFingerprint(a))
      .filter(Boolean)
      .sort()
      .join('|');
    return `${type}::${stem}::${ans}`;
  }

  return `${type}::${stem}`;
}

export interface DuplicateCheckStatus {
  kind: 'none' | 'in_bank' | 'in_file';
  matchedCode?: string;
  matchedIndex?: number;
}

/**
 * Checks an incoming list of parsed questions against both:
 * 1) Existing questions already stored in the teacher's Question Bank
 * 2) Earlier duplicates within the same imported Word file
 */
export function analyzeWordImportDuplicates(
  incoming: Question[],
  existingBank: Question[]
): DuplicateCheckStatus[] {
  const bankMap = new Map<string, string>();
  for (const q of existingBank) {
    const fp = buildQuestionDuplicateFingerprint(q);
    if (fp && !bankMap.has(fp)) {
      bankMap.set(fp, q.code || q.id);
    }
  }

  const seenInFile = new Map<string, number>();

  return incoming.map((q, idx) => {
    const fp = buildQuestionDuplicateFingerprint(q);
    if (!fp) return { kind: 'none' };

    const bankCode = bankMap.get(fp);
    if (bankCode) {
      return { kind: 'in_bank', matchedCode: bankCode };
    }

    const firstIdx = seenInFile.get(fp);
    if (firstIdx !== undefined) {
      return { kind: 'in_file', matchedIndex: firstIdx };
    }

    seenInFile.set(fp, idx);
    return { kind: 'none' };
  });
}
