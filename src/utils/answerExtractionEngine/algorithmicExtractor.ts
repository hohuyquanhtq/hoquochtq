/**
 * ANSWER EXTRACTION ENGINE - Algorithmic Extractor
 * Xử lý ma trận bảng 2D, bảng hoán vị, bảng dọc, bảng ngang và chuỗi văn bản quy chuẩn GDPT 2018
 */

import { RawDocumentTable, ExtractedAnswerItem } from './types';

/**
 * Normalizes True/False token to 'Đ' or 'S'
 */
export function normalizeTrueFalse(token: string): 'Đ' | 'S' | null {
  const clean = token.trim().toUpperCase().replace(/[^A-ZĐ\u00C0-\u1EF9]/gi, '');
  if (['Đ', 'ĐÚNG', 'DUNG', 'TRUE', 'T', 'D'].includes(clean)) return 'Đ';
  if (['S', 'SAI', 'FALSE', 'F'].includes(clean)) return 'S';
  return null;
}

/**
 * Normalizes Part I choice to 'A' | 'B' | 'C' | 'D'
 */
export function normalizeChoice(token: string): 'A' | 'B' | 'C' | 'D' | null {
  const clean = token.trim().toUpperCase().replace(/[^A-D]/g, '');
  if (clean.length === 1 && ['A', 'B', 'C', 'D'].includes(clean)) {
    return clean as 'A' | 'B' | 'C' | 'D';
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
 * Parses all 3 sections from extracted 2D tables and document text
 */
export function extractAnswersAlgorithmically(
  tables: RawDocumentTable[],
  text: string
): {
  part1Items: ExtractedAnswerItem[];
  part2Items: ExtractedAnswerItem[];
  part3Items: ExtractedAnswerItem[];
  detailedSolutions: Map<string, string>;
  solutionChoices: Map<number, string>;
} {
  const part1Map = new Map<number, ExtractedAnswerItem>();
  const part2Map = new Map<string, ExtractedAnswerItem>(); // "qNum-sub" -> item
  const part3Map = new Map<number, ExtractedAnswerItem>();

  // 1. First pass: Analyze all 2D structured tables
  for (const table of tables) {
    processTable(table, part1Map, part2Map, part3Map);
  }

  // 2. Second pass: Parse inline text lists (especially for parts missing in tables or inline blocks)
  processTextLists(text, part1Map, part2Map, part3Map);

  // 3. Third pass: Parse "HƯỚNG DẪN GIẢI CHI TIẾT" to find solutions and cross-check choices
  const { detailedSolutions, solutionChoices } = parseDetailedSolutions(text);

  return {
    part1Items: Array.from(part1Map.values()).sort((a, b) => a.questionNumber - b.questionNumber),
    part2Items: Array.from(part2Map.values()).sort((a, b) => {
      if (a.questionNumber !== b.questionNumber) return a.questionNumber - b.questionNumber;
      return (a.subQuestion || '').localeCompare(b.subQuestion || '');
    }),
    part3Items: Array.from(part3Map.values()).sort((a, b) => a.questionNumber - b.questionNumber),
    detailedSolutions,
    solutionChoices,
  };
}

/**
 * Analyzes a single 2D table grid (handling transposed matrices, horizontal headers, vertical pairs)
 */
function processTable(
  table: RawDocumentTable,
  part1Map: Map<number, ExtractedAnswerItem>,
  part2Map: Map<string, ExtractedAnswerItem>,
  part3Map: Map<number, ExtractedAnswerItem>
) {
  const rows = table.rows;
  if (!rows || rows.length === 0) return;

  const headerSnippet = (table.surroundingHeader || '').toUpperCase();
  const isPart1Hint = headerSnippet.includes('PHẦN I') || headerSnippet.includes('PHAN I') || headerSnippet.includes('PHẦN 1');
  const isPart2Hint = headerSnippet.includes('PHẦN II') || headerSnippet.includes('PHAN II') || headerSnippet.includes('PHẦN 2');
  const isPart3Hint = headerSnippet.includes('PHẦN III') || headerSnippet.includes('PHAN III') || headerSnippet.includes('PHẦN 3');

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
    return;
  }

  // --- CASE A2: PART II ROW-WISE TABLE ---
  // Row 0: ["Câu", "a", "b", "c", "d"]
  // Row 1: ["1", "Đ", "Đ", "Đ", "Đ"]
  // Row 2: ["2", "Đ", "Đ", "Đ", "S"]
  if (isLikelyPart2RowWise(rows)) {
    parsePart2RowWise(rows, part2Map);
    return;
  }

  // --- CASE B: PART I & PART III HORIZONTAL TABLES ---
  // E.g.:
  // Row 0: ["Câu", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"]
  // Row 1: ["Đáp án", "C", "B", "C", "C", "B", "A", "C", "B", "A", "A", "B", "C"]
  const horizontalPairs = detectHorizontalHeaderAnswerPairs(rows);
  if (horizontalPairs) {
    const { questions, answers } = horizontalPairs;
    for (let i = 0; i < questions.length; i++) {
      const qNum = questions[i];
      const ansToken = answers[i] || '';

      const choice = normalizeChoice(ansToken);
      if (choice && !isPart3Hint) {
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
      } else {
        // Might be Part III short answer
        const parsed = normalizeShortAnswer(ansToken);
        if (parsed.normalizedValue && (isPart3Hint || !choice)) {
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
    return;
  }

  // --- CASE C: VERTICAL OR GRID KEY-VALUE CELLS ---
  // Tables where columns are: [Câu, Đáp án, Câu, Đáp án] or row per question
  parseGenericKeyValTable(rows, part1Map, part2Map, part3Map, isPart1Hint, isPart2Hint, isPart3Hint);
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
  const qCols = headerRow.slice(1).map(c => parseInt(c.replace(/\D/g, ''), 10));
  const hasValidQNums = qCols.length >= 2 && qCols.every(n => !isNaN(n) && n > 0);

  // Check next 4 rows for a, b, c, d labels and True/False values
  const labels: string[] = [];
  let tfCellsCount = 0;
  let totalDataCells = 0;

  for (let r = 1; r <= 4 && r < rows.length; r++) {
    const row = rows[r];
    if (row.length === 0) continue;
    const firstCell = row[0].toLowerCase().replace(/[^a-d]/g, '');
    if (firstCell.length === 1) {
      labels.push(firstCell);
    }
    for (let c = 1; c < row.length; c++) {
      totalDataCells++;
      if (normalizeTrueFalse(row[c]) !== null) {
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

  const headerSubs = header.slice(1).map(c => c.toLowerCase().replace(/[^a-d]/g, ''));
  const hasSubsInHeader = headerSubs.filter(s => ['a', 'b', 'c', 'd'].includes(s)).length >= 2;

  let validDataRows = 0;
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const qNum = parseInt(row[0].replace(/\D/g, ''), 10);
    if (!isNaN(qNum) && row.length >= 4) {
      const tfCount = row.slice(1).filter(c => normalizeTrueFalse(c) !== null).length;
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
 * Detects horizontal question-answer rows (e.g. Row 0 = Câu 1..12, Row 1 = Đáp án C..B)
 */
function detectHorizontalHeaderAnswerPairs(rows: string[][]): {
  questions: number[];
  answers: string[];
} | null {
  for (let r = 0; r < rows.length - 1; r++) {
    const r1 = rows[r];
    const r2 = rows[r + 1];

    if (r1.length < 3 || r2.length < 3) continue;

    // Check if r1 starts with "Câu" or similar and has numeric cells
    const r1First = r1[0].toLowerCase();
    const isQRow = r1First.includes('câu') || r1First.includes('tt') || r1First.includes('stt') || /^\d+$/.test(r1[1]);

    if (isQRow) {
      const startCol = /^\d+$/.test(r1[0]) ? 0 : 1;
      const questions: number[] = [];
      const answers: string[] = [];

      for (let c = startCol; c < Math.min(r1.length, r2.length); c++) {
        const qNum = parseInt(r1[c].replace(/\D/g, ''), 10);
        if (!isNaN(qNum) && qNum > 0) {
          questions.push(qNum);
          answers.push(r2[c] ? r2[c].trim() : '');
        }
      }

      if (questions.length >= 3) {
        return { questions, answers };
      }
    }
  }

  return null;
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
  isPart3Hint: boolean
) {
  for (const row of rows) {
    for (let c = 0; c < row.length - 1; c++) {
      const cellText = row[c].trim();
      const nextCell = row[c + 1] ? row[c + 1].trim() : '';

      // Match "Câu 1" or "1"
      const qMatch = cellText.match(/^(?:Câu\s*)?(\d+)(?:\s*[:.\-–])?$/i);
      if (qMatch) {
        const qNum = parseInt(qMatch[1], 10);
        const choice = normalizeChoice(nextCell);

        if (choice && !isPart3Hint) {
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
  const matches = [...text.matchAll(/(?:\(?([a-d])[\)\].:\-–\s]+|\b([a-d])\s+)(Đúng|Sai|True|False|Đ|S)\b/gi)];
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
  // Split into sections if markers exist
  const p1Block = extractSectionSubstring(text, ['PHẦN I', 'PHẦN 1', 'TRẮC NGHIỆM 4', 'TRẮC NGHIỆM NHIỀU'], ['PHẦN II', 'PHẦN 2']);
  const p2Block = extractSectionSubstring(text, ['PHẦN II', 'PHẦN 2', 'ĐÚNG/SAI', 'ĐÚNG SAI', 'ĐÚNG - SAI'], ['PHẦN III', 'PHẦN 3']);
  const p3Block = extractSectionSubstring(text, ['PHẦN III', 'PHẦN 3', 'TRẢ LỜI NGẮN'], ['HƯỚNG DẪN', 'LỜI GIẢI', 'HƯỚNG DẪN GIẢI']);

  // --- Part 1 inline regex ---
  const p1Text = p1Block || text;
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
    const p3Matches = [...p3Text.matchAll(/(?:^|\n|[,;|])\s*(?:Câu\s*)?(\d+)\s*[:.\-–=]\s*([-+]?\d+(?:[,.]\d+)?(?:\/\d+)?(?:\s*[a-zA-Z%°]+)?)/gi)];
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
 * Extracts a slice of text between start headers and end headers
 */
function extractSectionSubstring(text: string, startMarkers: string[], endMarkers: string[]): string | null {
  const upper = text.toUpperCase();
  let startIdx = -1;

  for (const marker of startMarkers) {
    const idx = upper.indexOf(marker);
    if (idx !== -1 && (startIdx === -1 || idx < startIdx)) {
      startIdx = idx;
    }
  }

  if (startIdx === -1) return null;

  let endIdx = text.length;
  for (const marker of endMarkers) {
    const idx = upper.indexOf(marker, startIdx + 10);
    if (idx !== -1 && idx < endIdx) {
      endIdx = idx;
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
