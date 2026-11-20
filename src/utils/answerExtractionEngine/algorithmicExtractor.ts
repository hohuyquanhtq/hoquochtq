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
 * Normalizes Part III short answer: preserves exact decimal formatting, comma/period, negative sign
 */
export function normalizeShortAnswer(rawVal: string): {
  normalizedValue: string;
  numericVal?: number;
  accepted: string[];
} {
  const trimmed = rawVal.trim().replace(/\s+/g, ' ');
  // Check if starts with a number (including negative and decimal)
  const numMatch = trimmed.match(/^([-+]?\d+(?:[,.]\d+)?(?:\/\d+)?)(?:\s*(.*))?$/);
  
  if (numMatch) {
    const rawNumStr = numMatch[1];
    const unit = numMatch[2] ? numMatch[2].trim() : '';
    const standardPeriodStr = rawNumStr.replace(',', '.');
    const parsedNum = parseFloat(standardPeriodStr);
    const commaStr = rawNumStr.replace('.', ',');

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
      normalizedValue: commaStr, // Standard Vietnamese notation for chemical decimals
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
} {
  const part1Map = new Map<number, ExtractedAnswerItem>();
  const part2Map = new Map<string, ExtractedAnswerItem>(); // "qNum-sub" -> item
  const part3Map = new Map<number, ExtractedAnswerItem>();

  const part1SeenAnswers = new Map<number, string[]>();
  const part1MissingSet = new Set<number>();
  const part1InvalidCells: { questionNumber: number; rawValue: string }[] = [];
  let part1TablesMatched = 0;

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
  //    (supports single table AND multiple consecutive separate Word tables for Part I)
  for (const table of activeTables) {
    const matchedP1 = processTable(table, part1Map, part2Map, part3Map, {
      part1SeenAnswers,
      part1MissingSet,
      part1InvalidCells,
    });
    if (matchedP1) part1TablesMatched++;
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

  // Filter out any missingFromTable numbers that were subsequently resolved by another valid table/list
  const unresolvedMissingFromTable = Array.from(part1MissingSet)
    .filter(qNum => !part1Map.has(qNum))
    .sort((a, b) => a - b);

  const unresolvedInvalidCells = part1InvalidCells.filter(c => !part1Map.has(c.questionNumber));

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
  };
}

interface TableProcessTrackers {
  part1SeenAnswers: Map<number, string[]>;
  part1MissingSet: Set<number>;
  part1InvalidCells: { questionNumber: number; rawValue: string }[];
}

/**
 * Analyzes a single 2D table grid (handling transposed matrices, horizontal headers, vertical pairs)
 * Returns true if this table contributed Part I answer items.
 */
function processTable(
  table: RawDocumentTable,
  part1Map: Map<number, ExtractedAnswerItem>,
  part2Map: Map<string, ExtractedAnswerItem>,
  part3Map: Map<number, ExtractedAnswerItem>,
  trackers?: TableProcessTrackers
): boolean {
  const rows = table.rows;
  if (!rows || rows.length === 0) return false;

  const headerSnippet = (table.surroundingHeader || '').toUpperCase();
  const isPart3Hint = /\b(?:PHẦN|PHAN)\s*(?:III|3)\b|TRẢ\s*LỜI\s*NGẮN/i.test(headerSnippet);
  const isPart2Hint = !isPart3Hint && /\b(?:PHẦN|PHAN)\s*(?:II|2)\b|ĐÚNG\s*[-–\/]?\s*SAI/i.test(headerSnippet);
  const isPart1Hint = !isPart3Hint && !isPart2Hint && /\b(?:PHẦN|PHAN)\s*(?:I|1)\b|TRẮC\s*NGHIỆM/i.test(headerSnippet);

  // --- CASE A: PART II TRANSPOSED MATRIX (Most complex & common in GDPT 2018 exams) ---
  // Rows:
  // Row 0: ["Câu", "1", "2", "3", "4"] or ["Ý / Câu", "1", "2", "3", "4"]
  // Row 1: ["a)", "Đ", "Đ", "Đ", "Đ"]
  // Row 2: ["b)", "S", "Đ", "Đ", "S"]
  // Row 3: ["c)", "Đ", "Đ", "S", "Đ"]
  // Row 4: ["d)", "Đ", "S", "Đ", "Đ"]
  const isPart2Matrix = isLikelyPart2Matrix(rows);
  if (isPart2Matrix) {
    parsePart2TransposedMatrix(rows, part2Map);
    return false;
  }

  // --- CASE A2: PART II ROW-WISE TABLE ---
  // Row 0: ["Câu", "a", "b", "c", "d"]
  // Row 1: ["1", "Đ", "Đ", "Đ", "Đ"]
  // Row 2: ["2", "Đ", "Đ", "Đ", "S"]
  if (isLikelyPart2RowWise(rows)) {
    parsePart2RowWise(rows, part2Map);
    return false;
  }

  // --- CASE B: PART I & PART III HORIZONTAL TABLES (supports single 2-row, wrapped multi-row, and multiple consecutive Word tables) ---
  const horizontalPairs = detectHorizontalHeaderAnswerPairs(rows, table.surroundingHeader);
  if (horizontalPairs.questions.length > 0) {
    const { questions, answers, isPart1Table } = horizontalPairs;
    let contributedPart1 = false;

    for (let i = 0; i < questions.length; i++) {
      const qNum = questions[i];
      const rawAnsToken = answers[i] || '';
      const cleanAnsToken = stripCellFormatting(rawAnsToken);

      const choice = normalizeChoice(rawAnsToken);
      if (choice && !isPart3Hint) {
        contributedPart1 = true;
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
      } else if (isPart1Table && !isPart3Hint) {
        // Confirmed Part I answer table, but this cell is blank or invalid -> record missing/invalid warning
        contributedPart1 = true;
        if (trackers) {
          trackers.part1MissingSet.add(qNum);
          if (cleanAnsToken) {
            trackers.part1InvalidCells.push({ questionNumber: qNum, rawValue: cleanAnsToken });
          }
        }
      } else {
        // Might be Part III short answer
        const parsed = normalizeShortAnswer(cleanAnsToken);
        if (parsed.normalizedValue && (isPart3Hint || (!choice && !isPart1Table))) {
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
              confidence: 0.95,
              sourceSnippet: `Câu ${qNum} -> ${parsed.normalizedValue}`,
              validationStatus: 'verified',
              teacherVerified: false,
            });
          }
        }
      }
    }
    return contributedPart1;
  }

  // --- CASE C: VERTICAL OR GRID KEY-VALUE CELLS ---
  // Tables where columns are: [Câu, Đáp án, Câu, Đáp án] or row per question
  const beforeP1Size = part1Map.size;
  parseGenericKeyValTable(rows, part1Map, part2Map, part3Map, isPart1Hint, isPart2Hint, isPart3Hint, trackers);
  return part1Map.size > beforeP1Size;
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
 * Detects horizontal question-answer row pairs across a table:
 * - Supports standard 2-row tables ("Câu | 1 | 2 | ... | 10" + "Đáp án | D | A | ... | C")
 * - Supports multi-row wrapped tables (Row 0-1: 1..10, Row 2-3: 11..20)
 * - Supports split separate Word tables of ANY column count (including a 1-question tail table)
 * - Tolerates leading/trailing/spacer empty cells, bold/HTML formatting, and banner title rows
 * - Rejects non-answer content tables inside the exam body (e.g. experiment/data tables)
 */
function detectHorizontalHeaderAnswerPairs(
  rows: string[][],
  surroundingHeader?: string
): {
  questions: number[];
  answers: string[];
  isPart1Table: boolean;
} {
  const questions: number[] = [];
  const answers: string[] = [];
  let choiceVotes = 0;
  let nonEmptyAnswerVotes = 0;

  // Filter out completely empty / separator-only rows
  const nonEmptyRows = rows.filter(row =>
    row.some(cell => {
      const cleaned = stripCellFormatting(cell);
      return cleaned.length > 0 && !/^[\-–—_=|:]+$/.test(cleaned);
    })
  );

  const headerText = (surroundingHeader || '').toUpperCase();
  const hasAnswerContextHeader = /(?:PHẦN\s+(?:III|II|I|3|2|1)\b|ĐÁP\s*ÁN|BẢNG\s+ĐÁP\s*ÁN|HƯỚNG\s*DẪN\s*CHẤM|MÃ\s*ĐỀ)/i.test(
    headerText
  );

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

    // Guard against exam content tables like "STT | 1 | 2 | 3" + "Hiện tượng | Kết tủa | ..."
    const isGenericSttLabel = /^(?:stt|tt)$/i.test(r1LabelCell.replace(/[:.]/g, '').trim());
    if (isGenericSttLabel && !r2HasExplicitAnsLabel && !hasAnswerContextHeader) {
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
        } else if (/^[-+]?\d+(?:[,.]\d+)?(?:\/\d+)?(?:\s*[a-zA-Z%°]{1,6})?$/.test(aCellClean)) {
          pairShortNumCount++;
        } else if (aCellClean.length > 12 || /\s+\S+\s+/.test(aCellClean)) {
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
    // - Explicit "Câu" + "Đáp án" allows even 1 question (e.g., last split table has Câu 21)
    // - Explicit "Câu" without "Đáp án" label needs >=2 questions and valid answer tokens
    // - Headerless numeric row needs >=2 questions and >=70% valid choices/numbers (and answer context or pure A-D choices)
    const hasExplicitBothLabels = r1HasExplicitQLabel && r2HasExplicitAnsLabel;
    const validAnswerRatio =
      pairNonEmptyAnsCount > 0 ? (pairChoiceCount + pairShortNumCount) / pairNonEmptyAnsCount : 0;

    let accepted = false;
    if (hasExplicitBothLabels) {
      // Both "Câu" and "Đáp án" labels present -> strong answer table signal
      accepted = pairQs.length >= 1 && (pairNonEmptyAnsCount === 0 || validAnswerRatio >= 0.5);
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
      nonEmptyAnswerVotes += pairNonEmptyAnsCount;
      r++; // skip the paired answer row
    }
  }

  const isPart1Table =
    questions.length > 0 &&
    nonEmptyAnswerVotes > 0 &&
    choiceVotes / nonEmptyAnswerVotes >= 0.6;

  return { questions, answers, isPart1Table };
}

/**
 * Parses generic key-value table cells
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
  // Guard: require either section hint or explicit "Câu"/"Đáp án" header in row 0
  // to avoid mistaking exam data tables (like [1, "A", 2, "B"]) for answer tables
  const firstRowClean = rows[0] ? rows[0].map(c => stripCellFormatting(c)) : [];
  const hasExplicitKeyValHeader =
    firstRowClean.some(c => isQuestionRowLabel(c)) && firstRowClean.some(c => isAnswerRowLabel(c));
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
        } else if (isPart2Hint) {
          // Part II inline: e.g. "a-Đ, b-S, c-Đ, d-Đ"
          parsePart2InlineString(qNum, nextCell, part2Map, 'table');
        } else if (nextCell) {
          const parsed = normalizeShortAnswer(nextCell);
          if (parsed.normalizedValue && (isPart3Hint || !choice)) {
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
