/**
 * ANSWER EXTRACTION ENGINE - Algorithmic Extractor
 * Xử lý ma trận bảng 2D, bảng hoán vị, bảng dọc, bảng ngang và chuỗi văn bản quy chuẩn GDPT 2018
 */

import { RawDocumentTable, ExtractedAnswerItem } from './types';
import type { AnswerTableCandidate } from '../../types';

/**
 * Strips inline HTML tags (<b>, <u>, <sub>, <sup>, etc.) and Markdown emphasis markers from a table cell
 */
export function stripCellFormatting(token: string): string {
  return (token || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\*\*|__|~~|`/g, '')
    .replace(/(^|\s)\*+|\*+($|\s)/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Checks whether a cell text represents a Question-number row header (e.g. "Câu", "Câu hỏi", "Câu số", "Bài")
 */
export function isQuestionRowLabel(cell: string): boolean {
  const clean = stripCellFormatting(cell)
    .toLowerCase()
    .replace(/[:.\-–—\\/()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!clean) return false;
  return /^(?:câu(?:\s+(?:hỏi|số|trắc\s+nghiệm|đáp\s+án))?|bài|mã\s*câu|stt|tt)$/.test(clean) ||
    /^câu\s*(?:\/|\\|-)\s*đáp\s*án$/i.test(stripCellFormatting(cell));
}

/**
 * Checks whether a cell text represents an Answer row header (e.g. "Đáp án", "Đ/A", "Chọn", "Trả lời")
 */
export function isAnswerRowLabel(cell: string): boolean {
  const clean = stripCellFormatting(cell)
    .toLowerCase()
    .replace(/[:.\-–—\\/()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!clean) return false;
  return /^(?:đáp\s*án(?:\s+đúng)?|dap\s*an(?:\s+dung)?|đ\s*a|da|chọn|trả\s*lời|kết\s*quả|key|ans(?:wer)?)$/.test(clean);
}

/**
 * Strictly extracts a positive integer question number from a table cell (e.g. "1", "10", "Câu 12.", "**15**")
 * Rejects prose text, decimals, or out-of-range numbers so content tables are never misparsed.
 */
export function extractQuestionNumberCell(cell: string): number | null {
  const clean = stripCellFormatting(cell);
  if (!clean) return null;
  const m = clean.match(/^(?:câu\s*)?(\d{1,3})\s*[.:)]?$/i);
  if (!m) return null;
  const num = parseInt(m[1], 10);
  if (isNaN(num) || num <= 0 || num > 200) return null;
  return num;
}

/**
 * Normalizes True/False token to 'Đ' or 'S'
 */
export function normalizeTrueFalse(token: string): 'Đ' | 'S' | null {
  const clean = stripCellFormatting(token)
    .toUpperCase()
    .replace(/[^A-ZĐ\u00C0-\u1EF9]/gi, '');
  if (['Đ', 'ĐÚNG', 'DUNG', 'TRUE', 'T', 'D'].includes(clean)) return 'Đ';
  if (['S', 'SAI', 'FALSE', 'F'].includes(clean)) return 'S';
  return null;
}

/**
 * Normalizes Part I choice to 'A' | 'B' | 'C' | 'D'
 * Strips HTML/Markdown formatting first and strictly validates standalone A/B/C/D tokens
 * so Vietnamese words (e.g. "Câu", "Đáp án", "Chất") never produce false positives.
 */
export function normalizeChoice(token: string): 'A' | 'B' | 'C' | 'D' | null {
  const clean = stripCellFormatting(token).toUpperCase();
  if (!clean) return null;
  const m = clean.match(/^[(\[]?\s*([A-D])\s*[)\].:*]?$/);
  if (m) {
    return m[1] as 'A' | 'B' | 'C' | 'D';
  }
  return null;
}

/**
 * Strict question column/row label (excludes generic "STT"/"TT" used in experiment data tables)
 */
function isStrictQuestionLabel(cell: string): boolean {
  const clean = stripCellFormatting(cell)
    .toLowerCase()
    .replace(/[:.\-–—\\/()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!clean) return false;
  return /^(?:câu(?:\s+(?:hỏi|số|trắc\s+nghiệm|đáp\s+án))?|bài|mã\s*câu)$/.test(clean) ||
    /^câu\s*(?:\/|\\|-)\s*đáp\s*án$/i.test(stripCellFormatting(cell));
}

/**
 * Strict answer column/row label (excludes generic "Kết quả" used in experiment data tables)
 */
function isStrictAnswerLabel(cell: string): boolean {
  const clean = stripCellFormatting(cell)
    .toLowerCase()
    .replace(/[:.\-–—\\/()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!clean) return false;
  return /^(?:đáp\s*án(?:\s+đúng)?|dap\s*an(?:\s+dung)?|đáp\s*số|dap\s*so|đ\s*a|da|chọn|trả\s*lời|key|ans(?:wer)?)$/.test(clean);
}

/**
 * Checks whether a header row clearly belongs to an exam content/data table (experiment, substances, measurements)
 * rather than an answer key table.
 */
function isContentTableHeaderRow(row: string[]): boolean {
  const cleaned = row.map(c => stripCellFormatting(c)).filter(Boolean);
  if (cleaned.length === 0) return false;
  // Never reject a row that explicitly has BOTH strict "Câu" and strict "Đáp án" headers
  const hasBothStrict =
    cleaned.some(c => isStrictQuestionLabel(c)) && cleaned.some(c => isStrictAnswerLabel(c));
  if (hasBothStrict) return false;

  const joined = cleaned.join(' | ');
  return /\b(?:thí\s*nghiệm|ống\s*nghiệm|hiện\s*tượng|dung\s*dịch|kim\s*loại|hợp\s*chất|nhiệt\s*độ|áp\s*suất|thời\s*gian|nồng\s*độ|khối\s*lượng|thể\s*tích|mẫu\s*thử|phản\s*ứng|nguyên\s*tố|công\s*thức|tên\s*gọi|tính\s*chất|mô\s*tả|nhận\s*xét|đơn\s*vị|đại\s*lượng|biểu\s*thức|số\s*liệu|k[íý]\s*hiệu|chất(?:\s+(?:rắn|lỏng|khí|tan|điện\s*li|hữu\s*cơ|vô\s*cơ))?)\b/i.test(
    joined
  );
}

/**
 * Checks whether a cleaned cell text is a valid concise Part III short-answer value
 * (integers, multi-digit numbers, decimals with ',' or '.', negative numbers, fractions, optional short unit)
 */
function isShortAnswerToken(cellClean: string): boolean {
  if (!cellClean) return false;
  return /^[-+]?\s*\d+(?:[,.]\d+)?(?:\/\d+)?(?:\s*(?:%|°C|°|g|kg|mg|ml|mL|L|mol|M|cm|mm|m|km|s|h|pH|kJ|J|V|A|Ω|Hz))?$/i.test(
    cellClean
  );
}

/**
 * Checks whether a cleaned cell looks like prose/descriptive text rather than a concise answer key
 */
function isProseCell(cellClean: string): boolean {
  if (!cellClean) return false;
  return cellClean.length > 20 || /\s+\S+\s+/.test(cellClean);
}

/**
 * Normalizes Part III short answer:
 * Preserves exact original decimal separator (',' or '.'), trailing zeros (e.g. 7,04 / 10,2 / 188,0 / 7.04),
 * negative sign, and original Word content in `normalizedValue`, while listing both ',' and '.' in `accepted`.
 */
export function normalizeShortAnswer(rawVal: string): {
  normalizedValue: string;
  numericVal?: number;
  accepted: string[];
} {
  const trimmed = stripCellFormatting(rawVal).trim().replace(/\s+/g, ' ');
  if (!trimmed) {
    return {
      normalizedValue: '',
      accepted: [],
    };
  }

  // Check if starts with a number (including negative, decimal comma/dot, or fraction)
  const numMatch = trimmed.match(/^([-+]?\d+(?:[,.]\d+)?(?:\/\d+)?)(?:\s*(.*))?$/);

  if (numMatch) {
    const rawNumStr = numMatch[1];
    const unit = numMatch[2] ? numMatch[2].trim() : '';
    const standardPeriodStr = rawNumStr.replace(',', '.');
    const commaStr = rawNumStr.replace('.', ',');

    let parsedNum: number;
    if (standardPeriodStr.includes('/')) {
      const [numPart, denPart] = standardPeriodStr.split('/');
      const num = parseFloat(numPart);
      const den = parseFloat(denPart);
      parsedNum = !isNaN(num) && !isNaN(den) && den !== 0 ? num / den : NaN;
    } else {
      parsedNum = parseFloat(standardPeriodStr);
    }

    const accepted = new Set<string>();
    accepted.add(trimmed);
    accepted.add(rawNumStr);
    accepted.add(standardPeriodStr);
    accepted.add(commaStr);

    if (unit) {
      accepted.add(`${standardPeriodStr} ${unit}`);
      accepted.add(`${commaStr} ${unit}`);
      accepted.add(`${standardPeriodStr}${unit}`);
      accepted.add(`${commaStr}${unit}`);
    }

    return {
      normalizedValue: trimmed, // Preserve exact Word text (',' or '.', trailing zeros, negative sign, unit)
      numericVal: !isNaN(parsedNum) ? parsedNum : undefined,
      accepted: Array.from(accepted),
    };
  }

  return {
    normalizedValue: trimmed,
    accepted: [trimmed],
  };
}

/**
 * Extracts variant code (e.g. "101", "202") from table header or first row
 */
export function detectVariantCodeFromText(text?: string): string | undefined {
  if (!text) return undefined;
  const m = text.match(/\bMÃ\s*ĐỀ(?:\s*THI)?\s*[:\-–]?\s*([A-Z0-9]{2,6})\b/i);
  return m ? m[1].toUpperCase() : undefined;
}

/**
 * Detects candidate answer tables / variant codes when multiple plausible tables exist
 */
export function buildAnswerTableCandidates(
  tables: RawDocumentTable[],
  _text: string
): {
  candidates: AnswerTableCandidate[];
  hasAmbiguousCandidates: boolean;
} {
  const candidates: AnswerTableCandidate[] = [];
  const variantGroups = new Map<string, RawDocumentTable[]>();
  const answerLikeTables: RawDocumentTable[] = [];

  for (const tbl of tables) {
    const flatText = `${tbl.surroundingHeader || ''} ${tbl.rows.slice(0, 2).map(r => r.join(' ')).join(' ')}`;
    const hasAnswerMarkers =
      isLikelyPart2Matrix(tbl.rows) ||
      isLikelyPart2RowWise(tbl.rows) ||
      detectVerticalAnswerTable(tbl.rows, tbl.surroundingHeader).questions.length >= 1 ||
      detectHorizontalHeaderAnswerPairs(tbl.rows, tbl.surroundingHeader).questions.length >= 1 ||
      /(?:ĐÁP\s*ÁN|MÃ\s*ĐỀ|CÂU\s+1\b)/i.test(flatText);

    if (!hasAnswerMarkers) continue;
    answerLikeTables.push(tbl);

    const vCode = detectVariantCodeFromText(flatText);
    if (vCode) {
      if (!variantGroups.has(vCode)) variantGroups.set(vCode, []);
      variantGroups.get(vCode)!.push(tbl);
    }
  }

  // Case 1: Multiple exam variant codes (e.g. Mã đề 101, Mã đề 102)
  if (variantGroups.size > 1) {
    for (const [vCode, groupTbls] of variantGroups.entries()) {
      const tempP1 = new Map<number, ExtractedAnswerItem>();
      const tempP2 = new Map<string, ExtractedAnswerItem>();
      const tempP3 = new Map<number, ExtractedAnswerItem>();
      groupTbls.forEach(t => processTable(t, tempP1, tempP2, tempP3));
      const itemCount = tempP1.size + tempP2.size + tempP3.size;
      const preview = groupTbls
        .slice(0, 2)
        .map(t => t.rows.slice(0, 3).map(r => r.join(' | ')).join('\n'))
        .join('\n---\n');

      candidates.push({
        id: `variant_${vCode}`,
        label: `Bảng đáp án Mã đề ${vCode} (${itemCount} mục)`,
        variantCode: vCode,
        sectionHint: 'mixed',
        itemCount,
        previewText: preview.slice(0, 280),
        sourceSnippet: preview,
      });
    }
    return {
      candidates,
      hasAmbiguousCandidates: candidates.length > 1,
    };
  }

  // Case 2: Multiple conflicting horizontal Part I tables with overlapping Q1..QN
  const p1TableInfos: { tbl: RawDocumentTable; qs: number[]; p1Count: number }[] = [];
  for (const tbl of answerLikeTables) {
    if (isLikelyPart2Matrix(tbl.rows) || isLikelyPart2RowWise(tbl.rows)) continue;
    const tempP1 = new Map<number, ExtractedAnswerItem>();
    const tempP2 = new Map<string, ExtractedAnswerItem>();
    const tempP3 = new Map<number, ExtractedAnswerItem>();
    processTable(tbl, tempP1, tempP2, tempP3);
    if (tempP1.size >= 3) {
      p1TableInfos.push({
        tbl,
        qs: Array.from(tempP1.keys()),
        p1Count: tempP1.size,
      });
    }
  }

  if (p1TableInfos.length > 1) {
    // Check if there is significant question overlap (e.g., two different tables both covering Q1..Q5)
    const firstSet = new Set(p1TableInfos[0].qs);
    const hasOverlap = p1TableInfos.slice(1).some(info => {
      const overlap = info.qs.filter(q => firstSet.has(q)).length;
      return overlap >= Math.min(3, info.qs.length);
    });

    if (hasOverlap) {
      p1TableInfos.forEach((info, idx) => {
        const minQ = Math.min(...info.qs);
        const maxQ = Math.max(...info.qs);
        const preview = info.tbl.rows.slice(0, 3).map(r => r.join(' | ')).join('\n');
        candidates.push({
          id: info.tbl.id,
          label: info.tbl.surroundingHeader
            ? `${info.tbl.surroundingHeader} (Câu ${minQ}–${maxQ})`
            : `Bảng đáp án #${idx + 1} (Câu ${minQ}–${maxQ}, ${info.p1Count} mục)`,
          sectionHint: 'part1',
          questionRange: `${minQ}-${maxQ}`,
          itemCount: info.p1Count,
          previewText: preview.slice(0, 280),
          sourceSnippet: preview,
        });
      });
    }
  }

  return {
    candidates,
    hasAmbiguousCandidates: candidates.length > 1,
  };
}

export interface Part1TableDiagnostics {
  tablesMatched: number;
  duplicateQuestions: { questionNumber: number; answers: string[]; conflict: boolean }[];
  missingFromTable: number[];
  invalidCells: { questionNumber: number; rawValue: string }[];
}

export interface Part3TableDiagnostics {
  tablesMatched: number;
  duplicateQuestions: { questionNumber: number; answers: string[]; conflict: boolean }[];
  missingFromTable: number[];
}

/**
 * Parses all 3 sections from extracted 2D tables and document text
 */
export function extractAnswersAlgorithmically(
  tables: RawDocumentTable[],
  text: string,
  selectedCandidateId?: string
): {
  part1Items: ExtractedAnswerItem[];
  part2Items: ExtractedAnswerItem[];
  part3Items: ExtractedAnswerItem[];
  detailedSolutions: Map<string, string>;
  solutionChoices: Map<number, string>;
  candidates: AnswerTableCandidate[];
  hasAmbiguousCandidates: boolean;
  part1Diagnostics: Part1TableDiagnostics;
  part3Diagnostics: Part3TableDiagnostics;
} {
  const part1Map = new Map<number, ExtractedAnswerItem>();
  const part2Map = new Map<string, ExtractedAnswerItem>(); // "qNum-sub" -> item
  const part3Map = new Map<number, ExtractedAnswerItem>();

  const part1SeenAnswers = new Map<number, string[]>();
  const part1MissingSet = new Set<number>();
  const part1InvalidCells: { questionNumber: number; rawValue: string }[] = [];
  let part1TablesMatched = 0;

  const part3SeenAnswers = new Map<number, string[]>();
  const part3MissingSet = new Set<number>();
  let part3TablesMatched = 0;

  const { candidates, hasAmbiguousCandidates } = buildAnswerTableCandidates(tables, text);

  // Filter tables if teacher picked a specific variant/table candidate
  let activeTables = tables;
  if (selectedCandidateId) {
    if (selectedCandidateId.startsWith('variant_')) {
      const targetCode = selectedCandidateId.replace(/^variant_/, '');
      activeTables = tables.filter(tbl => {
        const flatText = `${tbl.surroundingHeader || ''} ${tbl.rows.slice(0, 2).map(r => r.join(' ')).join(' ')}`;
        const vCode = detectVariantCodeFromText(flatText);
        return !vCode || vCode === targetCode;
      });
    } else {
      const competingIds = new Set(candidates.map(c => c.id));
      activeTables = tables.filter(tbl => !competingIds.has(tbl.id) || tbl.id === selectedCandidateId);
    }
  }

  // 1. First pass: Analyze ALL active 2D structured tables in document order
  //    (supports single table AND multiple consecutive separate Word tables for Part I and Part III)
  let lastMatchedSection: 'part1' | 'part2' | 'part3' | null = null;
  for (const table of activeTables) {
    const matchRes = processTable(
      table,
      part1Map,
      part2Map,
      part3Map,
      {
        part1SeenAnswers,
        part1MissingSet,
        part1InvalidCells,
        part3SeenAnswers,
        part3MissingSet,
      },
      lastMatchedSection
    );
    if (matchRes.matchedPart1) part1TablesMatched++;
    if (matchRes.matchedPart3) part3TablesMatched++;

    if (matchRes.matchedPart3) {
      lastMatchedSection = 'part3';
    } else if (matchRes.matchedPart1) {
      lastMatchedSection = 'part1';
    } else if (matchRes.matchedPart2) {
      lastMatchedSection = 'part2';
    } else {
      lastMatchedSection = null;
    }
  }

  // 2. Second pass: Parse inline text lists (especially for parts missing in tables or inline blocks)
  processTextLists(text, part1Map, part2Map, part3Map);

  // 3. Third pass: Parse "HƯỚNG DẪN GIẢI CHI TIẾT" to find solutions and cross-check choices
  const { detailedSolutions, solutionChoices } = parseDetailedSolutions(text);

  // Compile Part I duplicate & missing table diagnostics and attach warnings onto affected items
  const duplicateQuestions: { questionNumber: number; answers: string[]; conflict: boolean }[] = [];
  for (const [qNum, answers] of part1SeenAnswers.entries()) {
    if (answers.length > 1) {
      const uniqueAnswers = Array.from(new Set(answers));
      const conflict = uniqueAnswers.length > 1;
      duplicateQuestions.push({ questionNumber: qNum, answers, conflict });

      const existing = part1Map.get(qNum);
      if (existing) {
        const dupMsg = conflict
          ? `Câu ${qNum} bị trùng số trong bảng đáp án với giá trị khác nhau (${uniqueAnswers.join(' và ')}) — vui lòng kiểm tra lại.`
          : `Câu ${qNum} xuất hiện lặp lại ${answers.length} lần trong các bảng đáp án (${uniqueAnswers[0]}) — vui lòng kiểm tra lại thứ tự câu.`;
        existing.validationStatus = 'needs_review';
        existing.validationIssues = [...(existing.validationIssues || []), dupMsg];
        existing.notes = existing.notes ? `${existing.notes}; ${dupMsg}` : dupMsg;
      }
    }
  }

  // Compile Part III duplicate & missing table diagnostics and attach warnings onto affected items
  const part3DuplicateQuestions: { questionNumber: number; answers: string[]; conflict: boolean }[] = [];
  for (const [qNum, answers] of part3SeenAnswers.entries()) {
    if (answers.length > 1) {
      const uniqueAnswers = Array.from(new Set(answers));
      const conflict = uniqueAnswers.length > 1;
      part3DuplicateQuestions.push({ questionNumber: qNum, answers, conflict });

      const existing = part3Map.get(qNum);
      if (existing) {
        const dupMsg = conflict
          ? `Câu ${qNum} (Phần III) bị trùng số trong bảng đáp án với giá trị khác nhau (${uniqueAnswers.join(' và ')}) — vui lòng kiểm tra lại.`
          : `Câu ${qNum} (Phần III) xuất hiện lặp lại ${answers.length} lần trong các bảng đáp án (${uniqueAnswers[0]}) — vui lòng kiểm tra lại thứ tự câu.`;
        existing.validationStatus = 'needs_review';
        existing.validationIssues = [...(existing.validationIssues || []), dupMsg];
        existing.notes = existing.notes ? `${existing.notes}; ${dupMsg}` : dupMsg;
      }
    }
  }

  // Filter out any missingFromTable numbers that were subsequently resolved by another valid table/list
  const unresolvedMissingFromTable = Array.from(part1MissingSet)
    .filter(qNum => !part1Map.has(qNum))
    .sort((a, b) => a - b);

  const unresolvedInvalidCells = part1InvalidCells.filter(c => !part1Map.has(c.questionNumber));

  const unresolvedPart3Missing = Array.from(part3MissingSet)
    .filter(qNum => !part3Map.has(qNum))
    .sort((a, b) => a - b);

  return {
    part1Items: Array.from(part1Map.values()).sort((a, b) => a.questionNumber - b.questionNumber),
    part2Items: Array.from(part2Map.values()).sort((a, b) => {
      if (a.questionNumber !== b.questionNumber) return a.questionNumber - b.questionNumber;
      return (a.subQuestion || '').localeCompare(b.subQuestion || '');
    }),
    part3Items: Array.from(part3Map.values()).sort((a, b) => a.questionNumber - b.questionNumber),
    detailedSolutions,
    solutionChoices,
    candidates,
    hasAmbiguousCandidates,
    part1Diagnostics: {
      tablesMatched: part1TablesMatched,
      duplicateQuestions: duplicateQuestions.sort((a, b) => a.questionNumber - b.questionNumber),
      missingFromTable: unresolvedMissingFromTable,
      invalidCells: unresolvedInvalidCells,
    },
    part3Diagnostics: {
      tablesMatched: part3TablesMatched,
      duplicateQuestions: part3DuplicateQuestions.sort((a, b) => a.questionNumber - b.questionNumber),
      missingFromTable: unresolvedPart3Missing,
    },
  };
}

interface TableProcessTrackers {
  part1SeenAnswers: Map<number, string[]>;
  part1MissingSet: Set<number>;
  part1InvalidCells: { questionNumber: number; rawValue: string }[];
  part3SeenAnswers: Map<number, string[]>;
  part3MissingSet: Set<number>;
}

interface TableMatchResult {
  matchedPart1: boolean;
  matchedPart2: boolean;
  matchedPart3: boolean;
}

/**
 * Shared recorder for extracted (questionNumber, rawAnswer) pairs from both vertical and horizontal tables.
 * Handles Part I & Part III routing, exact decimal preservation, duplicate tracking, and empty-cell tracking.
 */
function applyExtractedQuestionAnswerPairs(
  questions: number[],
  answers: string[],
  isPart1Table: boolean,
  isPart3Table: boolean,
  isPart3Hint: boolean,
  part1Map: Map<number, ExtractedAnswerItem>,
  part3Map: Map<number, ExtractedAnswerItem>,
  trackers?: TableProcessTrackers
): { matchedPart1: boolean; matchedPart3: boolean } {
  let matchedPart1 = false;
  let matchedPart3 = false;

  for (let i = 0; i < questions.length; i++) {
    const qNum = questions[i];
    const rawAnsToken = answers[i] || '';
    const cleanAnsToken = stripCellFormatting(rawAnsToken);
    const choice = normalizeChoice(rawAnsToken);

    if (choice && !isPart3Hint && !isPart3Table) {
      matchedPart1 = true;
      if (trackers) {
        const prevList = trackers.part1SeenAnswers.get(qNum) || [];
        prevList.push(choice);
        trackers.part1SeenAnswers.set(qNum, prevList);
      }

      if (!part1Map.has(qNum) || part1Map.get(qNum)!.confidence < 0.95) {
        part1Map.set(qNum, {
          id: `I.${qNum}`,
          section: 'part1',
          questionNumber: qNum,
          answerType: 'choice',
          correctAnswer: choice,
          source: 'table',
          confidence: 0.98,
          sourceSnippet: `Câu ${qNum} -> ${choice}`,
          validationStatus: 'verified',
          teacherVerified: false,
        });
      }
    } else if (isPart1Table && !isPart3Hint && !isPart3Table) {
      // Confirmed Part I answer table, but this cell is blank or invalid -> record missing/invalid warning
      matchedPart1 = true;
      if (trackers) {
        trackers.part1MissingSet.add(qNum);
        if (cleanAnsToken) {
          trackers.part1InvalidCells.push({ questionNumber: qNum, rawValue: cleanAnsToken });
        }
      }
    } else {
      // Part III short answer (supports integers, decimals with ',' or '.', negative numbers, multi-digit values)
      const parsed = normalizeShortAnswer(cleanAnsToken);
      if (parsed.normalizedValue && (isPart3Hint || isPart3Table || (!choice && !isPart1Table))) {
        matchedPart3 = true;
        if (trackers) {
          const prevList = trackers.part3SeenAnswers.get(qNum) || [];
          prevList.push(parsed.normalizedValue);
          trackers.part3SeenAnswers.set(qNum, prevList);
        }

        if (!part3Map.has(qNum) || part3Map.get(qNum)!.confidence < 0.95) {
          part3Map.set(qNum, {
            id: `III.${qNum}`,
            section: 'part3',
            questionNumber: qNum,
            answerType: 'short_answer',
            correctAnswer: parsed.normalizedValue,
            acceptedAnswers: parsed.accepted,
            numericValue: parsed.numericVal,
            tolerance: 0.05,
            source: 'table',
            confidence: 0.96,
            sourceSnippet: `Câu ${qNum} -> ${parsed.normalizedValue}`,
            validationStatus: 'verified',
            teacherVerified: false,
          });
        }
      } else if (!cleanAnsToken && (isPart3Hint || isPart3Table)) {
        // Confirmed Part III table with an empty answer cell -> record missing warning
        matchedPart3 = true;
        if (trackers) {
          trackers.part3MissingSet.add(qNum);
        }
      }
    }
  }

  return { matchedPart1, matchedPart3 };
}

/**
 * Analyzes a single 2D table grid (handling transposed matrices, vertical answer tables, horizontal headers, generic key-value grids)
 */
function processTable(
  table: RawDocumentTable,
  part1Map: Map<number, ExtractedAnswerItem>,
  part2Map: Map<string, ExtractedAnswerItem>,
  part3Map: Map<number, ExtractedAnswerItem>,
  trackers?: TableProcessTrackers,
  prevMatchedSection: 'part1' | 'part2' | 'part3' | null = null
): TableMatchResult {
  const rows = table.rows;
  if (!rows || rows.length === 0) {
    return { matchedPart1: false, matchedPart2: false, matchedPart3: false };
  }

  const headerSnippet = (table.surroundingHeader || '').toUpperCase();
  const isPart3Hint = /\b(?:PHẦN|PHAN)\s*(?:III|3)\b|TRẢ\s*LỜI\s*NGẮN/i.test(headerSnippet);
  const isPart2Hint = !isPart3Hint && /\b(?:PHẦN|PHAN)\s*(?:II|2)\b|ĐÚNG\s*[-–\/]?\s*SAI/i.test(headerSnippet);
  const isPart1Hint = !isPart3Hint && !isPart2Hint && /\b(?:PHẦN|PHAN)\s*(?:I|1)\b|TRẮC\s*NGHIỆM/i.test(headerSnippet);

  // Determine whether a headerless continuation table is allowed from the immediately preceding table
  const allowHeaderlessContinuation =
    prevMatchedSection === 'part3'
      ? !isPart1Hint && !isPart2Hint
      : prevMatchedSection === 'part1'
      ? !isPart2Hint && !isPart3Hint
      : false;
  const effectivePart3Hint = isPart3Hint || (prevMatchedSection === 'part3' && !isPart1Hint && !isPart2Hint);

  // --- CASE A: PART II TRANSPOSED MATRIX (Most complex & common in GDPT 2018 exams) ---
  if (isLikelyPart2Matrix(rows)) {
    parsePart2TransposedMatrix(rows, part2Map);
    return { matchedPart1: false, matchedPart2: true, matchedPart3: false };
  }

  // --- CASE A2: PART II ROW-WISE TABLE ---
  if (isLikelyPart2RowWise(rows)) {
    parsePart2RowWise(rows, part2Map);
    return { matchedPart1: false, matchedPart2: true, matchedPart3: false };
  }

  // --- CASE B1: VERTICAL ANSWER TABLE (2 columns or multi-pair [Câu | Đáp án], single or multiple consecutive tables) ---
  // Must run BEFORE horizontal detection so 2-column vertical tables (| Câu | Đáp án | + | 1 | 4 |, | 2 | 88 |)
  // are never misparsed horizontally across adjacent rows!
  const verticalPairs = detectVerticalAnswerTable(rows, table.surroundingHeader, allowHeaderlessContinuation);
  if (verticalPairs.questions.length > 0) {
    const { matchedPart1, matchedPart3 } = applyExtractedQuestionAnswerPairs(
      verticalPairs.questions,
      verticalPairs.answers,
      verticalPairs.isPart1Table,
      verticalPairs.isPart3Table,
      effectivePart3Hint,
      part1Map,
      part3Map,
      trackers
    );
    return { matchedPart1, matchedPart2: false, matchedPart3 };
  }

  // --- CASE B2: HORIZONTAL ANSWER TABLE (2-row, wrapped multi-row, and multiple consecutive separate Word tables) ---
  const horizontalPairs = detectHorizontalHeaderAnswerPairs(
    rows,
    table.surroundingHeader,
    allowHeaderlessContinuation
  );
  if (horizontalPairs.questions.length > 0) {
    const { matchedPart1, matchedPart3 } = applyExtractedQuestionAnswerPairs(
      horizontalPairs.questions,
      horizontalPairs.answers,
      horizontalPairs.isPart1Table,
      horizontalPairs.isPart3Table,
      effectivePart3Hint,
      part1Map,
      part3Map,
      trackers
    );
    return { matchedPart1, matchedPart2: false, matchedPart3 };
  }

  // --- CASE C: GENERIC KEY-VALUE GRID FALLBACK ---
  const beforeP1Size = part1Map.size;
  const beforeP2Size = part2Map.size;
  const beforeP3Size = part3Map.size;
  parseGenericKeyValTable(
    rows,
    part1Map,
    part2Map,
    part3Map,
    isPart1Hint,
    isPart2Hint,
    effectivePart3Hint,
    trackers
  );
  return {
    matchedPart1: part1Map.size > beforeP1Size,
    matchedPart2: part2Map.size > beforeP2Size,
    matchedPart3: part3Map.size > beforeP3Size,
  };
}

/**
 * Checks if table is a GDPT 2018 Part II Transposed Matrix:
 * Header has question numbers 1, 2, 3, 4 (or similar),
 * and consecutive rows start with a, b, c, d and contain Đ/S values.
 */
function isLikelyPart2Matrix(rows: string[][]): boolean {
  if (rows.length < 5) return false;

  // Check header row for question numbers
  const headerRow = rows[0];
  const qCols = headerRow.slice(1).map(c => extractQuestionNumberCell(c));
  const validQCols = qCols.filter((n): n is number => n !== null);
  const hasValidQNums = validQCols.length >= 2 && validQCols.length >= Math.ceil((headerRow.length - 1) * 0.6);

  // Reject if row 1 is explicitly an "Đáp án" row (that's a multi-row horizontal Part I/III table, not Part II matrix)
  if (rows[1] && rows[1].length > 0 && isAnswerRowLabel(rows[1][0])) {
    return false;
  }

  // Check next 4 rows for strict a, b, c, d labels and True/False values
  const labels: string[] = [];
  let tfCellsCount = 0;
  let totalDataCells = 0;

  for (let r = 1; r <= 4 && r < rows.length; r++) {
    const row = rows[r];
    if (row.length === 0) continue;
    const firstClean = stripCellFormatting(row[0]).toLowerCase();
    const subMatch = firstClean.match(/^\(?([a-d])\)?[.:]?$/);
    if (subMatch) {
      labels.push(subMatch[1]);
    }
    for (let c = 1; c < row.length; c++) {
      const cellClean = stripCellFormatting(row[c]);
      if (!cellClean) continue;
      totalDataCells++;
      if (normalizeTrueFalse(cellClean) !== null) {
        tfCellsCount++;
      }
    }
  }

  const hasSubLabels = labels.length >= 3 && ['a', 'b', 'c', 'd'].some(l => labels.includes(l));
  const hasHighTF = totalDataCells > 0 && tfCellsCount / totalDataCells >= 0.7;

  return hasValidQNums && (hasSubLabels || hasHighTF);
}

/**
 * Extracts Part II items from a transposed matrix:
 * Column represents Question Number (Câu 1, Câu 2...)
 * Row represents Statement Sub-Question (a, b, c, d)
 */
function parsePart2TransposedMatrix(rows: string[][], part2Map: Map<string, ExtractedAnswerItem>) {
  const headerRow = rows[0];
  const colQuestions: { colIdx: number; qNum: number }[] = [];

  for (let c = 1; c < headerRow.length; c++) {
    const rawCell = headerRow[c];
    const qNum = parseInt(rawCell.replace(/\D/g, ''), 10);
    if (!isNaN(qNum) && qNum > 0) {
      colQuestions.push({ colIdx: c, qNum });
    }
  }

  const standardSubs: ('a' | 'b' | 'c' | 'd')[] = ['a', 'b', 'c', 'd'];

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (row.length === 0) continue;

    // Detect row sub-label
    let sub: 'a' | 'b' | 'c' | 'd' | undefined;
    const firstCell = row[0].toLowerCase().trim();
    for (const s of standardSubs) {
      if (firstCell.startsWith(s) || firstCell.includes(`${s})`) || firstCell === s) {
        sub = s;
        break;
      }
    }

    if (!sub && r - 1 < standardSubs.length) {
      sub = standardSubs[r - 1];
    }

    if (!sub) continue;

    // Map each column to its question number and True/False value
    for (const { colIdx, qNum } of colQuestions) {
      if (colIdx < row.length) {
        const valToken = row[colIdx];
        const tfVal = normalizeTrueFalse(valToken);
        if (tfVal) {
          const key = `${qNum}-${sub}`;
          part2Map.set(key, {
            id: `II.${qNum}${sub}`,
            section: 'part2',
            questionNumber: qNum,
            subQuestion: sub,
            answerType: 'true_false',
            correctAnswer: tfVal,
            acceptedAnswers: [tfVal, tfVal === 'Đ' ? 'Đúng' : 'Sai'],
            source: 'table',
            confidence: 0.99, // Matrix parsing is high fidelity
            sourceSnippet: `Câu ${qNum} [${sub}] -> ${tfVal} (từ ma trận bảng)`,
            validationStatus: 'verified',
            teacherVerified: false,
          });
        }
      }
    }
  }
}

/**
 * Checks if table is a GDPT 2018 Part II Row-wise Table:
 * Header has sub-question labels (a, b, c, d),
 * and rows start with question numbers (1, 2...) followed by True/False tokens.
 */
function isLikelyPart2RowWise(rows: string[][]): boolean {
  if (rows.length < 2) return false;
  const header = rows[0];
  if (header.length < 4) return false;

  // Reject immediately if Row 1 is an explicit "Đáp án" row (horizontal Part I/III table)
  if (rows[1] && rows[1].length > 0 && isAnswerRowLabel(rows[1][0])) {
    return false;
  }

  const headerSubs = header
    .slice(1)
    .map(c => {
      const m = stripCellFormatting(c).toLowerCase().match(/^\(?([a-d])\)?[.:]?$/);
      return m ? m[1] : '';
    });
  const hasSubsInHeader = headerSubs.filter(s => ['a', 'b', 'c', 'd'].includes(s)).length >= 2;

  let validDataRows = 0;
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const qNum = extractQuestionNumberCell(row[0]);
    if (qNum !== null && row.length >= 4) {
      const dataCells = row.slice(1).map(c => stripCellFormatting(c)).filter(Boolean);
      // If row contains standalone A, B, or C choices, it's NOT a True/False row
      const hasChoiceABC = dataCells.some(c => /^[A-C]$/i.test(c));
      if (hasChoiceABC) continue;
      const tfCount = dataCells.filter(c => normalizeTrueFalse(c) !== null).length;
      if (tfCount >= 2) validDataRows++;
    }
  }

  return hasSubsInHeader || validDataRows >= 1;
}

/**
 * Parses Part II items from a row-wise table:
 * Row represents Question Number (Câu 1, Câu 2...)
 * Column represents Statement Sub-Question (a, b, c, d)
 */
function parsePart2RowWise(rows: string[][], part2Map: Map<string, ExtractedAnswerItem>) {
  const standardSubs: ('a' | 'b' | 'c' | 'd')[] = ['a', 'b', 'c', 'd'];
  const header = rows[0];
  const colSubs: ('a' | 'b' | 'c' | 'd' | undefined)[] = [];

  for (let c = 1; c < header.length; c++) {
    const cell = header[c].toLowerCase();
    let matchedSub: 'a' | 'b' | 'c' | 'd' | undefined;
    for (const s of standardSubs) {
      if (cell.startsWith(s) || cell.includes(`${s})`) || cell === s) {
        matchedSub = s;
        break;
      }
    }
    if (!matchedSub && c - 1 < standardSubs.length) {
      matchedSub = standardSubs[c - 1];
    }
    colSubs.push(matchedSub);
  }

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const qNum = parseInt(row[0].replace(/\D/g, ''), 10);
    if (isNaN(qNum) || qNum <= 0) continue;

    for (let c = 1; c < row.length; c++) {
      const sub = colSubs[c - 1] || (c - 1 < standardSubs.length ? standardSubs[c - 1] : undefined);
      if (!sub) continue;

      const tfVal = normalizeTrueFalse(row[c]);
      if (tfVal) {
        const key = `${qNum}-${sub}`;
        part2Map.set(key, {
          id: `II.${qNum}${sub}`,
          section: 'part2',
          questionNumber: qNum,
          subQuestion: sub,
          answerType: 'true_false',
          correctAnswer: tfVal,
          acceptedAnswers: [tfVal, tfVal === 'Đ' ? 'Đúng' : 'Sai'],
          source: 'table',
          confidence: 0.99,
          sourceSnippet: `Câu ${qNum} [${sub}] -> ${tfVal} (từ bảng dòng)`,
          validationStatus: 'verified',
          teacherVerified: false,
        });
      }
    }
  }
}

/**
 * Extracts vertical (questionCol, answerCol) pairs from a candidate header row
 * e.g. ["Câu", "Đáp án"] -> [{ qCol: 0, aCol: 1 }]
 * e.g. ["Câu", "Đáp án", "Câu", "Đáp án"] -> [{ qCol: 0, aCol: 1 }, { qCol: 2, aCol: 3 }]
 * Rejects generic "STT | Kết quả" without an explicit answer-section header to avoid exam data tables.
 */
function extractVerticalColumnPairs(
  row: string[],
  hasExplicitAnswerHeader: boolean
): { qCol: number; aCol: number }[] {
  if (isContentTableHeaderRow(row)) return [];
  const pairs: { qCol: number; aCol: number }[] = [];

  for (let c = 0; c < row.length; c++) {
    const cell = stripCellFormatting(row[c]);
    if (!cell) continue;

    const strictQ = isStrictQuestionLabel(cell);
    const genericQ = !strictQ && isQuestionRowLabel(cell);
    if (!strictQ && !genericQ) continue;

    // Look for the immediate answer-label column (tolerating at most 1 empty spacer column)
    let aCol = -1;
    for (let k = c + 1; k < Math.min(row.length, c + 3); k++) {
      const nextCell = stripCellFormatting(row[k]);
      if (!nextCell) continue;
      const strictA = isStrictAnswerLabel(nextCell);
      const genericA = !strictA && isAnswerRowLabel(nextCell);
      if (strictA || (genericA && (strictQ || hasExplicitAnswerHeader))) {
        aCol = k;
      }
      break;
    }

    if (aCol !== -1) {
      pairs.push({ qCol: c, aCol });
      c = aCol; // advance past paired answer column
    }
  }

  return pairs;
}

/**
 * Detects vertical answer tables:
 * - Standard 2-column vertical table: | Câu | Đáp án | followed by | 1 | 4 |, | 2 | 88 |, ...
 * - Multi-pair vertical table: | Câu | Đáp án | Câu | Đáp án |
 * - Optional single-cell banner title row on Row 0 (e.g. "BẢNG ĐÁP ÁN PHẦN III")
 * - Headerless continuation vertical table when placed under PHẦN III / ĐÁP ÁN or immediately after another answer table
 * - Rejects horizontal tables, Part II tables, and exam content/experiment tables
 */
function detectVerticalAnswerTable(
  rows: string[][],
  surroundingHeader?: string,
  allowHeaderlessContinuation: boolean = false
): {
  questions: number[];
  answers: string[];
  isPart1Table: boolean;
  isPart3Table: boolean;
} {
  const empty = { questions: [], answers: [], isPart1Table: false, isPart3Table: false };

  const nonEmptyRows = rows.filter(row =>
    row.some(cell => {
      const cleaned = stripCellFormatting(cell);
      return cleaned.length > 0 && !/^[\-–—_=|:]+$/.test(cleaned);
    })
  );
  if (nonEmptyRows.length === 0) return empty;
  if (isLikelyPart2Matrix(nonEmptyRows) || isLikelyPart2RowWise(nonEmptyRows)) return empty;

  const headerText = (surroundingHeader || '').toUpperCase();
  const hasExplicitAnswerHeader = /(?:ĐÁP\s*ÁN|BẢNG\s+ĐÁP\s*ÁN|HƯỚNG\s*DẪN\s*CHẤM|MÃ\s*ĐỀ)/i.test(headerText);
  const hasAnswerContextHeader =
    hasExplicitAnswerHeader || /(?:PHẦN\s+(?:III|II|I|3|2|1)\b|TRẢ\s*LỜI\s*NGẮN)/i.test(headerText);
  const isPart3Context = /\b(?:PHẦN|PHAN)\s*(?:III|3)\b|TRẢ\s*LỜI\s*NGẮN/i.test(headerText);

  // Immediately reject horizontal tables where Row 0 is "Câu | 1 | 2 | ..." and Row 1 is "Đáp án | ..."
  if (nonEmptyRows.length >= 2) {
    const r0 = nonEmptyRows[0];
    const r1 = nonEmptyRows[1];
    const r0First = r0.findIndex(c => stripCellFormatting(c).length > 0);
    if (
      r0First !== -1 &&
      isQuestionRowLabel(r0[r0First]) &&
      r1[r0First] !== undefined &&
      isAnswerRowLabel(r1[r0First])
    ) {
      const r0HasNums = r0.slice(r0First + 1).some(c => extractQuestionNumberCell(c) !== null);
      if (r0HasNums) return empty;
    }
  }

  // --- MODE 1: HEADERED VERTICAL TABLE (Row 0, or Row 1 if Row 0 is a 1-cell banner title) ---
  let headerRowIdx = -1;
  let colPairs: { qCol: number; aCol: number }[] = [];

  const row0Pairs = extractVerticalColumnPairs(nonEmptyRows[0], hasExplicitAnswerHeader);
  if (row0Pairs.length > 0) {
    headerRowIdx = 0;
    colPairs = row0Pairs;
  } else if (nonEmptyRows.length >= 3) {
    const row0NonEmpty = nonEmptyRows[0].filter(c => stripCellFormatting(c).length > 0);
    if (row0NonEmpty.length <= 1) {
      const row1Pairs = extractVerticalColumnPairs(nonEmptyRows[1], hasExplicitAnswerHeader);
      if (row1Pairs.length > 0) {
        headerRowIdx = 1;
        colPairs = row1Pairs;
      }
    }
  }

  if (headerRowIdx !== -1 && colPairs.length > 0) {
    const questions: number[] = [];
    const answers: string[] = [];
    let choiceVotes = 0;
    let shortNumVotes = 0;
    let proseVotes = 0;
    let nonEmptyAnswerVotes = 0;

    // Collect pair-by-pair so multi-pair tables (1..4 | 5..8) preserve natural reading order
    for (const { qCol, aCol } of colPairs) {
      for (let r = headerRowIdx + 1; r < nonEmptyRows.length; r++) {
        const row = nonEmptyRows[r];
        const qRaw = qCol < row.length ? row[qCol] : '';
        const aRaw = aCol < row.length ? row[aCol] : '';
        const qClean = stripCellFormatting(qRaw);
        const aClean = stripCellFormatting(aRaw);

        if (!qClean && !aClean) continue;
        // Skip repeated vertical header row inside the same table
        if (isQuestionRowLabel(qClean) && isAnswerRowLabel(aClean)) continue;

        const qNum = extractQuestionNumberCell(qRaw);
        if (qNum === null) continue;

        questions.push(qNum);
        answers.push(aClean);

        if (aClean) {
          nonEmptyAnswerVotes++;
          if (normalizeChoice(aClean) !== null) {
            choiceVotes++;
          } else if (isShortAnswerToken(aClean)) {
            shortNumVotes++;
          } else if (isProseCell(aClean)) {
            proseVotes++;
          }
        }
      }
    }

    if (questions.length === 0) return empty;
    // Reject prose content tables
    if (nonEmptyAnswerVotes > 0 && proseVotes > nonEmptyAnswerVotes * 0.4) return empty;

    const isPart1Table =
      !isPart3Context &&
      nonEmptyAnswerVotes > 0 &&
      choiceVotes / nonEmptyAnswerVotes >= 0.6;
    const isPart3Table = !isPart1Table && (isPart3Context || shortNumVotes > 0 || nonEmptyAnswerVotes === 0);

    return { questions, answers, isPart1Table, isPart3Table };
  }

  // --- MODE 2: HEADERLESS VERTICAL CONTINUATION TABLE ---
  // Only allowed when explicitly under an answer/Part III context OR immediately following another matched answer table
  if (!hasAnswerContextHeader && !allowHeaderlessContinuation) return empty;
  if (isContentTableHeaderRow(nonEmptyRows[0])) return empty;

  const minRowsRequired = allowHeaderlessContinuation ? 1 : 2;
  if (nonEmptyRows.length < minRowsRequired) return empty;

  // Guard: If table has exactly 2 rows and Row 0 is a horizontal sequence of consecutive integers (e.g. | 1 | 2 | 3 | over | 4 | 88 | 2 |),
  // it is a headerless HORIZONTAL table — let detectHorizontalHeaderAnswerPairs handle it!
  if (nonEmptyRows.length === 2) {
    const r0Nums = nonEmptyRows[0]
      .map(c => extractQuestionNumberCell(c))
      .filter((n): n is number => n !== null);
    if (r0Nums.length >= 2) {
      let consecutiveCount = 0;
      for (let i = 1; i < r0Nums.length; i++) {
        if (r0Nums[i] === r0Nums[i - 1] + 1) consecutiveCount++;
      }
      if (consecutiveCount === r0Nums.length - 1) {
        return empty;
      }
    }
  }

  // Find active non-empty columns across the table
  const maxCols = Math.max(...nonEmptyRows.map(r => r.length));
  const activeCols: number[] = [];
  for (let c = 0; c < maxCols; c++) {
    if (nonEmptyRows.some(r => c < r.length && stripCellFormatting(r[c]).length > 0)) {
      activeCols.push(c);
    }
  }

  // Headerless vertical tables must have an even number of active columns (2, 4, or 6)
  if (activeCols.length < 2 || activeCols.length % 2 !== 0 || activeCols.length > 6) {
    return empty;
  }

  const candidatePairs: { qCol: number; aCol: number }[] = [];
  for (let i = 0; i < activeCols.length; i += 2) {
    candidatePairs.push({ qCol: activeCols[i], aCol: activeCols[i + 1] });
  }

  const questions: number[] = [];
  const answers: string[] = [];
  let totalCheckedRows = 0;
  let validQRows = 0;
  let choiceVotes = 0;
  let shortNumVotes = 0;
  let proseVotes = 0;
  let nonEmptyAnswerVotes = 0;

  for (const { qCol, aCol } of candidatePairs) {
    const pairQs: number[] = [];
    for (let r = 0; r < nonEmptyRows.length; r++) {
      const row = nonEmptyRows[r];
      const qRaw = qCol < row.length ? row[qCol] : '';
      const aRaw = aCol < row.length ? row[aCol] : '';
      const qClean = stripCellFormatting(qRaw);
      const aClean = stripCellFormatting(aRaw);
      if (!qClean && !aClean) continue;

      totalCheckedRows++;
      const qNum = extractQuestionNumberCell(qRaw);
      if (qNum === null) continue;

      validQRows++;
      pairQs.push(qNum);
      questions.push(qNum);
      answers.push(aClean);

      if (aClean) {
        nonEmptyAnswerVotes++;
        if (normalizeChoice(aClean) !== null) {
          choiceVotes++;
        } else if (isShortAnswerToken(aClean)) {
          shortNumVotes++;
        } else if (isProseCell(aClean)) {
          proseVotes++;
        }
      }
    }

    // Verify question numbers in each vertical column are non-decreasing with reasonable steps (rejects random numeric data tables)
    if (pairQs.length >= 2) {
      for (let i = 1; i < pairQs.length; i++) {
        const diff = pairQs[i] - pairQs[i - 1];
        if (diff < 0 || diff > 10) return empty;
      }
    }
  }

  if (questions.length === 0 || totalCheckedRows === 0) return empty;
  if (validQRows / totalCheckedRows < 0.8) return empty;
  if (proseVotes > 0) return empty;
  if (nonEmptyAnswerVotes > 0 && (choiceVotes + shortNumVotes) / nonEmptyAnswerVotes < 0.8) {
    return empty;
  }

  const isPart1Table =
    !isPart3Context &&
    nonEmptyAnswerVotes > 0 &&
    choiceVotes / nonEmptyAnswerVotes >= 0.6;
  const isPart3Table = !isPart1Table && (isPart3Context || shortNumVotes > 0 || nonEmptyAnswerVotes === 0);

  return { questions, answers, isPart1Table, isPart3Table };
}

/**
 * Detects horizontal question-answer row pairs across a table:
 * - Supports standard 2-row tables ("Câu | 1 | 2 | ... | 10" + "Đáp án | D | A | ... | C" or "Đáp án | 4 | 88 | 2 | 100 | 7,04 | 10,2")
 * - Supports multi-row wrapped tables (Row 0-1: 1..10, Row 2-3: 11..20)
 * - Supports split separate Word tables of ANY column count (including a 1-question tail table)
 * - Tolerates leading/trailing/spacer empty cells, bold/HTML formatting, and banner title rows
 * - Rejects vertical tables and non-answer content tables inside the exam body (e.g. experiment/data tables)
 */
function detectHorizontalHeaderAnswerPairs(
  rows: string[][],
  surroundingHeader?: string,
  allowHeaderlessContinuation: boolean = false
): {
  questions: number[];
  answers: string[];
  isPart1Table: boolean;
  isPart3Table: boolean;
} {
  const questions: number[] = [];
  const answers: string[] = [];
  let choiceVotes = 0;
  let shortNumVotes = 0;
  let nonEmptyAnswerVotes = 0;

  // Filter out completely empty / separator-only rows
  const nonEmptyRows = rows.filter(row =>
    row.some(cell => {
      const cleaned = stripCellFormatting(cell);
      return cleaned.length > 0 && !/^[\-–—_=|:]+$/.test(cleaned);
    })
  );
  if (nonEmptyRows.length < 2) {
    return { questions, answers, isPart1Table: false, isPart3Table: false };
  }

  const headerText = (surroundingHeader || '').toUpperCase();
  const hasExplicitAnswerHeader = /(?:ĐÁP\s*ÁN|BẢNG\s+ĐÁP\s*ÁN|HƯỚNG\s*DẪN\s*CHẤM|MÃ\s*ĐỀ)/i.test(headerText);
  const hasAnswerContextHeader =
    hasExplicitAnswerHeader ||
    /(?:PHẦN\s+(?:III|II|I|3|2|1)\b|TRẢ\s*LỜI\s*NGẮN)/i.test(headerText) ||
    allowHeaderlessContinuation;
  const isPart3Context = /\b(?:PHẦN|PHAN)\s*(?:III|3)\b|TRẢ\s*LỜI\s*NGẮN/i.test(headerText);

  // Guard: Never misparse a vertical table (whose Row 0 or Row 1 has "Câu" and "Đáp án" side-by-side) horizontally!
  if (
    extractVerticalColumnPairs(nonEmptyRows[0], hasExplicitAnswerHeader).length > 0 ||
    (nonEmptyRows.length >= 3 &&
      nonEmptyRows[0].filter(c => stripCellFormatting(c).length > 0).length <= 1 &&
      extractVerticalColumnPairs(nonEmptyRows[1], hasExplicitAnswerHeader).length > 0)
  ) {
    return { questions, answers, isPart1Table: false, isPart3Table: false };
  }

  // Guard: Reject exam content/experiment tables
  if (isContentTableHeaderRow(nonEmptyRows[0])) {
    return { questions, answers, isPart1Table: false, isPart3Table: false };
  }

  for (let r = 0; r < nonEmptyRows.length - 1; r++) {
    const r1 = nonEmptyRows[r];
    const r2 = nonEmptyRows[r + 1];

    // Find first non-empty cell index in r1 to tolerate leading empty/formatting columns
    const r1FirstIdx = r1.findIndex(c => stripCellFormatting(c).length > 0);
    if (r1FirstIdx === -1) continue;

    const r1LabelCell = stripCellFormatting(r1[r1FirstIdx]);
    const r2AlignedLabelCell = r2[r1FirstIdx] !== undefined ? stripCellFormatting(r2[r1FirstIdx]) : '';
    const r2FirstIdx = r2.findIndex(c => stripCellFormatting(c).length > 0);
    const r2FirstCell = r2FirstIdx !== -1 ? stripCellFormatting(r2[r2FirstIdx]) : '';

    const r1HasExplicitQLabel = isQuestionRowLabel(r1LabelCell);
    const r2HasExplicitAnsLabel =
      isAnswerRowLabel(r2AlignedLabelCell) || (r2FirstIdx === r1FirstIdx && isAnswerRowLabel(r2FirstCell));
    const r2IsAnotherQRow = isQuestionRowLabel(r2AlignedLabelCell) || isQuestionRowLabel(r2FirstCell);

    if (r2IsAnotherQRow && !r2HasExplicitAnsLabel) continue;

    // Determine whether r1 is a headerless pure-numeric question row (e.g. | 1 | 2 | 3 | 4 |)
    const r1StartsWithNumber = extractQuestionNumberCell(r1LabelCell) !== null;

    if (!r1HasExplicitQLabel && !r1StartsWithNumber) continue;

    // Guard against exam content tables like "STT | 1 | 2 | 3" + "Kết quả | 25 | ..." or "Hiện tượng | ..."
    const isGenericSttLabel = /^(?:stt|tt)$/i.test(r1LabelCell.replace(/[:.]/g, '').trim());
    const r2HasStrictAnsLabel =
      isStrictAnswerLabel(r2AlignedLabelCell) || (r2FirstIdx === r1FirstIdx && isStrictAnswerLabel(r2FirstCell));
    if (isGenericSttLabel && !r2HasStrictAnsLabel && !hasExplicitAnswerHeader) {
      continue;
    }

    const startCol = r1HasExplicitQLabel ? r1FirstIdx + 1 : r1FirstIdx;
    const maxCol = Math.max(r1.length, r2.length);

    const pairQs: number[] = [];
    const pairAns: string[] = [];
    let pairChoiceCount = 0;
    let pairShortNumCount = 0;
    let pairProseCount = 0;
    let pairNonEmptyAnsCount = 0;

    for (let c = startCol; c < maxCol; c++) {
      const qCellRaw = c < r1.length ? r1[c] : '';
      const aCellRaw = c < r2.length ? r2[c] : '';
      const qCellClean = stripCellFormatting(qCellRaw);
      const aCellClean = stripCellFormatting(aCellRaw);

      // Ignore empty spacer / formatting columns
      if (!qCellClean && !aCellClean) continue;

      const qNum = extractQuestionNumberCell(qCellRaw);
      if (qNum === null) continue;

      pairQs.push(qNum);
      pairAns.push(aCellClean);

      if (aCellClean) {
        pairNonEmptyAnsCount++;
        if (normalizeChoice(aCellClean) !== null) {
          pairChoiceCount++;
        } else if (isShortAnswerToken(aCellClean)) {
          pairShortNumCount++;
        } else if (isProseCell(aCellClean)) {
          pairProseCount++;
        }
      }
    }

    if (pairQs.length === 0) continue;

    // Reject content tables whose second row is mostly prose text (e.g., experiment observations)
    if (pairNonEmptyAnsCount > 0 && pairProseCount > pairNonEmptyAnsCount * 0.4) {
      continue;
    }

    // Validate minimum pair count and answer-row credibility:
    // - Explicit "Câu" + "Đáp án" allows even 1 question (e.g., last split table has Câu 21 or Câu 6)
    // - Explicit "Câu" without "Đáp án" label needs >=2 questions and valid answer tokens
    // - Headerless numeric row needs >=2 questions and >=70% valid choices/numbers (and answer context or pure A-D choices)
    const hasExplicitBothLabels = r1HasExplicitQLabel && r2HasExplicitAnsLabel;
    const validAnswerRatio =
      pairNonEmptyAnsCount > 0 ? (pairChoiceCount + pairShortNumCount) / pairNonEmptyAnsCount : 0;

    let accepted = false;
    if (hasExplicitBothLabels) {
      // Both "Câu" and "Đáp án" labels present -> strong answer table signal (also accepts concise Part III text/codes)
      accepted =
        pairQs.length >= 1 &&
        (pairNonEmptyAnsCount === 0 || validAnswerRatio >= 0.5 || (isPart3Context && pairProseCount === 0));
    } else if (r1HasExplicitQLabel) {
      accepted =
        pairQs.length >= 2 &&
        pairNonEmptyAnsCount >= 1 &&
        validAnswerRatio >= 0.7 &&
        (r2AlignedLabelCell === '' || hasAnswerContextHeader || pairChoiceCount >= 2);
    } else if (r1StartsWithNumber) {
      accepted =
        pairQs.length >= 2 &&
        pairNonEmptyAnsCount >= 2 &&
        (pairChoiceCount / pairNonEmptyAnsCount >= 0.7 ||
          (hasAnswerContextHeader && validAnswerRatio >= 0.7));
    }

    if (accepted) {
      questions.push(...pairQs);
      answers.push(...pairAns);
      choiceVotes += pairChoiceCount;
      shortNumVotes += pairShortNumCount;
      nonEmptyAnswerVotes += pairNonEmptyAnsCount;
      r++; // skip the paired answer row
    }
  }

  const isPart1Table =
    !isPart3Context &&
    questions.length > 0 &&
    nonEmptyAnswerVotes > 0 &&
    choiceVotes / nonEmptyAnswerVotes >= 0.6;
  const isPart3Table =
    questions.length > 0 &&
    !isPart1Table &&
    (isPart3Context || shortNumVotes > 0 || (nonEmptyAnswerVotes === 0 && isPart3Context));

  return { questions, answers, isPart1Table, isPart3Table };
}

/**
 * Parses generic key-value table cells (fallback for irregular non-standard layouts)
 */
function parseGenericKeyValTable(
  rows: string[][],
  part1Map: Map<number, ExtractedAnswerItem>,
  part2Map: Map<string, ExtractedAnswerItem>,
  part3Map: Map<number, ExtractedAnswerItem>,
  isPart1Hint: boolean,
  isPart2Hint: boolean,
  isPart3Hint: boolean,
  trackers?: TableProcessTrackers
) {
  if (rows.length > 0 && isContentTableHeaderRow(rows[0])) {
    return;
  }

  // Guard: require either section hint or explicit strict "Câu"/"Đáp án" header in row 0
  // to avoid mistaking exam data tables (like [1, "A", 2, "B"]) for answer tables
  const firstRowClean = rows[0] ? rows[0].map(c => stripCellFormatting(c)) : [];
  const hasExplicitKeyValHeader =
    firstRowClean.some(c => isStrictQuestionLabel(c)) && firstRowClean.some(c => isStrictAnswerLabel(c));
  const hasAnyAnswerHint = isPart1Hint || isPart2Hint || isPart3Hint || hasExplicitKeyValHeader;

  for (let rIdx = 0; rIdx < rows.length; rIdx++) {
    const row = rows[rIdx];
    for (let c = 0; c < row.length - 1; c++) {
      const cellText = stripCellFormatting(row[c]);
      const nextCell = row[c + 1] ? stripCellFormatting(row[c + 1]) : '';

      // Match "Câu 1" or "1"
      const qMatch = cellText.match(/^(?:Câu\s*)?(\d+)(?:\s*[:.\-–])?$/i);
      if (qMatch) {
        const startsWithCau = /^Câu\s*/i.test(cellText);
        if (!startsWithCau && !hasAnyAnswerHint) continue;

        const qNum = parseInt(qMatch[1], 10);
        if (qNum <= 0 || qNum > 200) continue;
        const choice = normalizeChoice(nextCell);

        if (choice && !isPart3Hint) {
          if (trackers) {
            const prevList = trackers.part1SeenAnswers.get(qNum) || [];
            prevList.push(choice);
            trackers.part1SeenAnswers.set(qNum, prevList);
          }
          if (!part1Map.has(qNum)) {
            part1Map.set(qNum, {
              id: `I.${qNum}`,
              section: 'part1',
              questionNumber: qNum,
              answerType: 'choice',
              correctAnswer: choice,
              source: 'table',
              confidence: 0.92,
              sourceSnippet: `${cellText} -> ${choice}`,
              validationStatus: 'verified',
              teacherVerified: false,
            });
          }
          c++; // skip consumed answer cell
        } else if (isPart2Hint) {
          // Part II inline: e.g. "a-Đ, b-S, c-Đ, d-Đ"
          parsePart2InlineString(qNum, nextCell, part2Map, 'table');
          c++;
        } else if (nextCell && !isProseCell(nextCell) && (isShortAnswerToken(nextCell) || (isPart3Hint && nextCell.length <= 15))) {
          const parsed = normalizeShortAnswer(nextCell);
          if (parsed.normalizedValue && (isPart3Hint || !choice)) {
            if (trackers) {
              const prevList = trackers.part3SeenAnswers.get(qNum) || [];
              prevList.push(parsed.normalizedValue);
              trackers.part3SeenAnswers.set(qNum, prevList);
            }
            if (!part3Map.has(qNum)) {
              part3Map.set(qNum, {
                id: `III.${qNum}`,
                section: 'part3',
                questionNumber: qNum,
                answerType: 'short_answer',
                correctAnswer: parsed.normalizedValue,
                acceptedAnswers: parsed.accepted,
                numericValue: parsed.numericVal,
                tolerance: 0.05,
                source: 'table',
                confidence: 0.90,
                sourceSnippet: `${cellText} -> ${parsed.normalizedValue}`,
                validationStatus: 'verified',
                teacherVerified: false,
              });
            }
            c++; // skip consumed answer cell so numeric answers are never misread as question numbers
          }
        }
      }
    }
  }
}

/**
 * Parses inline string representation for Part II (e.g. "a - Đ, b - S, c - Đ, d - Đ")
 */
function parsePart2InlineString(
  qNum: number,
  text: string,
  part2Map: Map<string, ExtractedAnswerItem>,
  source: 'table' | 'text'
) {
  // Matches "a) Đúng", "a) Đ", "a. S", "a - Đ", "a: Sai", "a Đ", "(a) Đúng"
  const matches = [...text.matchAll(/(?:\(?([a-d])[\)\].:\-–\s]+|\b([a-d])\s+)(Đúng|Sai|True|False|Đ|S)(?=$|[\s,;.)\]\|])/gi)];
  for (const m of matches) {
    const sub = (m[1] || m[2]).toLowerCase() as 'a' | 'b' | 'c' | 'd';
    const val = normalizeTrueFalse(m[3]);
    if (val) {
      const key = `${qNum}-${sub}`;
      if (!part2Map.has(key) || part2Map.get(key)!.confidence < 0.90) {
        part2Map.set(key, {
          id: `II.${qNum}${sub}`,
          section: 'part2',
          questionNumber: qNum,
          subQuestion: sub,
          answerType: 'true_false',
          correctAnswer: val,
          acceptedAnswers: [val, val === 'Đ' ? 'Đúng' : 'Sai'],
          source: source,
          confidence: source === 'table' ? 0.95 : 0.90,
          sourceSnippet: `Câu ${qNum} [${sub}] -> ${val}`,
          validationStatus: 'verified',
          teacherVerified: false,
        });
      }
    }
  }
}

/**
 * Parses unstructured or inline text lists (e.g. "1.A  2.B  3.C", "Câu 1: A", etc.)
 */
function processTextLists(
  text: string,
  part1Map: Map<number, ExtractedAnswerItem>,
  part2Map: Map<string, ExtractedAnswerItem>,
  part3Map: Map<number, ExtractedAnswerItem>
) {
  // If full document includes exam questions + answer section, focus on the tail where answer keys reside
  const hetMatches = [
    ...text.matchAll(
      /(?:^|\n)\s*(?:[\-–—*_\s|]*HẾT[\-–—*_\s|]*$|(?:BẢNG\s+)?ĐÁP\s*ÁN(?:\s*[:\-–—])?\s*$)/gim
    ),
  ];
  const answerFocusText =
    hetMatches.length > 0 && hetMatches[hetMatches.length - 1].index !== undefined
      ? text.slice(hetMatches[hetMatches.length - 1].index!)
      : text;

  // Split into sections if markers exist (using word-boundary regexes to prevent PHẦN I matching PHẦN II/III)
  const p1Start = [/\bPHẦN\s+(?:I|1)\b/i, /\bI\.\s*TRẮC\s+NGHIỆM/i, /TRẮC\s+NGHIỆM\s+(?:4|NHIỀU)\s+(?:LỰA\s+CHỌN|PHƯƠNG\s+ÁN)/i];
  const p2Start = [/\bPHẦN\s+(?:II|2)\b/i, /\bII\.\s*TRẮC\s+NGHIỆM/i, /TRẮC\s+NGHIỆM\s+ĐÚNG\s*[-–\/]?\s*SAI/i];
  const p3Start = [/\bPHẦN\s+(?:III|3)\b/i, /\bIII\.\s*(?:TRẮC\s+NGHIỆM\s+)?TRẢ\s+LỜI\s+NGẮN/i, /TRẢ\s+LỜI\s+NGẮN/i];
  const solStart = [/HƯỚNG\s+DẪN\s+GIẢI/i, /LỜI\s+GIẢI\s+CHI\s+TIẾT/i];

  const p1Block = extractSectionSubstringByRegex(answerFocusText, p1Start, [...p2Start, ...p3Start, ...solStart]);
  const p2Block = extractSectionSubstringByRegex(answerFocusText, p2Start, [...p3Start, ...solStart]);
  const p3Block = extractSectionSubstringByRegex(answerFocusText, p3Start, solStart);

  // --- Part 1 inline regex ---
  const p1Text = p1Block || answerFocusText;
  // Match patterns like: "1.A", "1 - B", "Câu 1: C", "Câu 1. D"
  const p1Matches = [...p1Text.matchAll(/(?:^|\s|[,;|])(?:Câu\s*)?(\d+)\s*[:.\-–]\s*([A-D])(?=[,\s;|]|$)/gi)];
  for (const m of p1Matches) {
    const qNum = parseInt(m[1], 10);
    const choice = normalizeChoice(m[2]);
    if (choice && !part1Map.has(qNum)) {
      part1Map.set(qNum, {
        id: `I.${qNum}`,
        section: 'part1',
        questionNumber: qNum,
        answerType: 'choice',
        correctAnswer: choice,
        source: 'text',
        confidence: 0.90,
        sourceSnippet: m[0].trim(),
        validationStatus: 'verified',
        teacherVerified: false,
      });
    }
  }

  // --- Part 2 inline regex ---
  const p2Text = p2Block || text;
  // Patterns like: "Câu 1: a - Đ, b - S, c - Đ, d - Đ" or "Câu 1. a) Đ; b) S..." or multiline
  const p2QuestionBlocks = [...p2Text.matchAll(/(?:^|\n|[,;])\s*(?:Câu\s*)?(\d+)[\s.:\-–]+([\s\S]*?)(?=(?:(?:^|\n|[,;])\s*(?:Câu\s*)?\d+[\s.:\-–]+)|$|PHẦN|HƯỚNG\s*DẪN)/gi)];
  for (const qBlock of p2QuestionBlocks) {
    const qNum = parseInt(qBlock[1], 10);
    const body = qBlock[2];
    parsePart2InlineString(qNum, body, part2Map, 'text');
  }

  // --- Part 3 inline regex ---
  const p3Text = p3Block || text;
  if (p3Text) {
    const p3Matches = [
      ...p3Text.matchAll(
        /(?:^|\n|[,;|])[ \t]*(?:Câu\s*)?(\d+)[ \t]*(?:[:.=–—]|-(?!\d))[ \t]*([-+]?\d+(?:[,.]\d+)?(?:\/\d+)?(?:[ \t]+(?!(?:Câu|PHẦN)\b)[a-zA-Z%°]+|[%°])?)/gi
      ),
    ];
    for (const m of p3Matches) {
      const qNum = parseInt(m[1], 10);
      const valStr = m[2];
      const parsed = normalizeShortAnswer(valStr);
      if (parsed.normalizedValue && !part3Map.has(qNum)) {
        part3Map.set(qNum, {
          id: `III.${qNum}`,
          section: 'part3',
          questionNumber: qNum,
          answerType: 'short_answer',
          correctAnswer: parsed.normalizedValue,
          acceptedAnswers: parsed.accepted,
          numericValue: parsed.numericVal,
          tolerance: 0.05,
          source: 'text',
          confidence: 0.90,
          sourceSnippet: m[0].trim(),
          validationStatus: 'verified',
          teacherVerified: false,
        });
      }
    }
  }
}

/**
 * Extracts a slice of text between start regexes and end regexes
 */
function extractSectionSubstringByRegex(text: string, startRegexes: RegExp[], endRegexes: RegExp[]): string | null {
  let startIdx = -1;

  for (const rx of startRegexes) {
    const m = text.match(rx);
    if (m && m.index !== undefined && (startIdx === -1 || m.index < startIdx)) {
      startIdx = m.index;
    }
  }

  if (startIdx === -1) return null;

  let endIdx = text.length;
  const tail = text.slice(startIdx + 6);
  for (const rx of endRegexes) {
    const m = tail.match(rx);
    if (m && m.index !== undefined) {
      const candidateEnd = startIdx + 6 + m.index;
      if (candidateEnd < endIdx) {
        endIdx = candidateEnd;
      }
    }
  }

  return text.substring(startIdx, endIdx);
}

/**
 * Parses detailed solutions ("HƯỚNG DẪN GIẢI CHI TIẾT" / "LỜI GIẢI CHI TIẾT")
 * Extracts choices such as "Câu 1: Chọn C", "Câu 2: Chọn B"
 */
function parseDetailedSolutions(text: string): {
  detailedSolutions: Map<string, string>;
  solutionChoices: Map<number, string>;
} {
  const detailedSolutions = new Map<string, string>();
  const solutionChoices = new Map<number, string>();

  const upper = text.toUpperCase();
  const solIndex = Math.max(
    upper.indexOf('HƯỚNG DẪN GIẢI CHI TIẾT'),
    upper.indexOf('LỜI GIẢI CHI TIẾT'),
    upper.indexOf('HƯỚNG DẪN CHẤM VÀ THANG ĐIỂM')
  );

  const solSection = solIndex !== -1 ? text.substring(solIndex) : text;

  // Match: "Câu 1[:.-] ... Chọn [A-D]"
  const qMatches = [...solSection.matchAll(/Câu\s*(\d+)[\s.:\-–]+([\s\S]*?)(?=(?:Câu\s*\d+|$))/gi)];

  for (const match of qMatches) {
    const qNum = parseInt(match[1], 10);
    const content = match[2].trim();
    detailedSolutions.set(`I.${qNum}`, content);

    // Look for explicit choice statement: "Chọn A", "Chọn đáp án B", "=> Chọn C"
    const choiceMatch = content.match(/(?:Chọn|Đáp án|=>)\s*(?:đáp án\s*)?([A-D])\b/i);
    if (choiceMatch) {
      solutionChoices.set(qNum, choiceMatch[1].toUpperCase());
    }
  }

  return { detailedSolutions, solutionChoices };
}
