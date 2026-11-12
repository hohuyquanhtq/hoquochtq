import { Question, QuestionType, AnswerRecognitionItem, RecognitionStatus, RecognitionSource } from '../types';
import { extractTablesFromText } from './answerExtractionEngine/documentTableReader';
import { extractAnswersAlgorithmically } from './answerExtractionEngine/algorithmicExtractor';

export interface SectionAnswersMatrix {
  part1: Map<number, { answer: string; source: RecognitionSource; notes?: string }>;
  part2: Map<number, { statements: Record<string, boolean>; source: RecognitionSource; notes?: string }>;
  part3: Map<number, { answer: string; acceptedAnswers: string[]; source: RecognitionSource; notes?: string }>;
  explanations: Map<string, string>; // "part1_1" or "part3_2" -> explanation text
}

/**
 * Normalizes text lines by removing markdown table pipes, extra spaces, and trailing symbols
 */
function cleanTableLine(line: string): string {
  return line
    .replace(/^\||\|$/g, '') // remove leading/trailing table pipes
    .replace(/\|/g, ' ')     // replace internal table pipes with space
    .replace(/[\t\r]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Recognizes and parses answer keys across all document formats:
 * 1. Standard tables (horizontal & vertical)
 * 2. Transposed True/False matrix (rows: a, b, c, d; columns: questions 1, 2, 3, 4)
 * 3. Row-wise True/False table (rows: questions; columns: a, b, c, d)
 * 4. Short answer tables (integers, decimals with comma/dot, negatives)
 * 5. Detailed solution conclusion extractions ("= 58,4", "≈ 7,1", "Đáp số: 9,5")
 * 6. Inline question cues (*, [Đúng], Đáp án:)
 */
export function extractComprehensiveAnswerKeys(rawText: string): SectionAnswersMatrix {
  const matrix: SectionAnswersMatrix = {
    part1: new Map(),
    part2: new Map(),
    part3: new Map(),
    explanations: new Map(),
  };

  // PASS 0: Fast High-Fidelity 2D Table & Matrix Extraction via Answer Extraction Engine
  try {
    const tables = extractTablesFromText(rawText);
    const { part1Items, part2Items, part3Items, detailedSolutions } = extractAnswersAlgorithmically(tables, rawText);

    for (const item of part1Items) {
      matrix.part1.set(item.questionNumber, {
        answer: item.correctAnswer,
        source: item.source || 'answer_table',
        notes: item.notes || item.sourceSnippet,
      });
    }

    for (const item of part2Items) {
      if (!matrix.part2.has(item.questionNumber)) {
        matrix.part2.set(item.questionNumber, {
          statements: {},
          source: item.source || 'answer_table',
          notes: item.notes,
        });
      }
      if (item.subQuestion) {
        matrix.part2.get(item.questionNumber)!.statements[item.subQuestion] = (item.correctAnswer === 'Đ');
      }
    }

    for (const item of part3Items) {
      matrix.part3.set(item.questionNumber, {
        answer: item.correctAnswer,
        acceptedAnswers: item.acceptedAnswers || [item.correctAnswer, item.correctAnswer.replace(',', '.'), item.correctAnswer.replace('.', ',')],
        source: item.source || 'answer_table',
        notes: item.notes || item.sourceSnippet,
      });
    }

    for (const [key, sol] of detailedSolutions.entries()) {
      matrix.explanations.set(key, sol);
    }
  } catch (err) {
    console.warn('AnswerExtractionEngine pass encountered warning, falling back to line parser:', err);
  }

  const rawLines = rawText.split(/\r?\n/).map(l => cleanTableLine(l)).filter(Boolean);

  // Locate Answer Key section
  let answerKeyStartIndex = -1;
  let detailedSolutionsStartIndex = -1;

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];
    // Standalone header: "ĐÁP ÁN", "ĐÁP ÁN:", "BẢNG ĐÁP ÁN", "HƯỚNG DẪN CHẤM"
    const isStandaloneAnswerHeader = /^(?:[\-–—*_\s]*)(?:BẢNG\s+)?ĐÁP\s*ÁN(?:\s*[:\-–—])?\s*$/i.test(line) ||
      /^(?:BẢNG\s+ĐÁP\s*ÁN|HƯỚNG\s*DẪN\s*CHẤM)\b/i.test(line);

    if (isStandaloneAnswerHeader && answerKeyStartIndex === -1 && i > 3) {
      answerKeyStartIndex = i;
    }
    if (/HƯỚNG\s*DẪN\s*GIẢI\s*CHI\s*TIẾT/i.test(line) && detailedSolutionsStartIndex === -1 && i > 3) {
      detailedSolutionsStartIndex = i;
    }
  }

  // If no standalone "ĐÁP ÁN" header was found, check if a repeated "PHẦN I" or a table header appears in the second half of the document
  if (answerKeyStartIndex === -1) {
    for (let i = 10; i < rawLines.length; i++) {
      const line = rawLines[i];
      if (/^PHẦN\s+(I|1)\b/i.test(line) && i > rawLines.length * 0.3) {
        answerKeyStartIndex = i;
        break;
      }
      if (/^Câu(?:\s*:)?\s+[\d\s]+$/i.test(line) && i + 1 < rawLines.length && /^(?:Đáp\s*án(?:\s*:)?|[a-d]\))/i.test(rawLines[i + 1])) {
        answerKeyStartIndex = (i > 0 && /PHẦN/i.test(rawLines[i - 1])) ? i - 1 : i;
        break;
      }
    }
  }

  // PASS 1: Extract from Answer Key Section (if present)
  if (answerKeyStartIndex !== -1) {
    const endIdx = detailedSolutionsStartIndex !== -1 ? detailedSolutionsStartIndex : rawLines.length;
    const answerSectionLines = rawLines.slice(answerKeyStartIndex, endIdx);
    parseAnswerKeySectionLines(answerSectionLines, matrix);
  } else {
    // If no explicit "ĐÁP ÁN" header, scan the whole text for table chunks or inline keys
    parseAnswerKeySectionLines(rawLines, matrix);
  }

  // PASS 2: Extract from Detailed Solutions Section ("HƯỚNG DẪN GIẢI CHI TIẾT")
  if (detailedSolutionsStartIndex !== -1) {
    const solutionLines = rawLines.slice(detailedSolutionsStartIndex);
    parseDetailedSolutionsSection(solutionLines, matrix);
  }

  return matrix;
}

/**
 * Parses lines in the Answer Key block
 */
function parseAnswerKeySectionLines(lines: string[], matrix: SectionAnswersMatrix) {
  let currentSection: 'part1' | 'part2' | 'part3' | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Detect section transitions
    if (/PHẦN\s+(I|1)\b/i.test(line)) {
      currentSection = 'part1';
      continue;
    }
    if (/PHẦN\s+(II|2)\b/i.test(line)) {
      currentSection = 'part2';
      continue;
    }
    if (/PHẦN\s+(III|3)\b/i.test(line)) {
      currentSection = 'part3';
      continue;
    }

    // Skip separator lines like |---|---|
    if (/^[\-:|\s]+$/.test(line)) continue;

    // --- PART I PARSING ---
    if (currentSection === 'part1' || !currentSection) {
      // 1. Table format Part I:
      // Row 1: "Câu 1 2 3 4 5 6 7 8"
      // Row 2: "Đáp án B A C C C B C B"
      const p1HeaderMatch = line.match(/^Câu(?:\s*:)?\s+([\d\s]+)$/i);
      if (p1HeaderMatch && i + 1 < lines.length) {
        const nextLine = lines[i + 1];
        const numbers = p1HeaderMatch[1].trim().split(/\s+/).map(n => parseInt(n, 10)).filter(n => !isNaN(n));
        const lettersMatch = nextLine.match(/^(?:Đáp\s*án(?:\s*:)?\s+)?([A-D\s]+)$/i);

        if (lettersMatch) {
          const letters = lettersMatch[1].trim().split(/\s+/).map(l => l.toUpperCase()).filter(l => /^[A-D]$/.test(l));
          if (numbers.length > 0 && letters.length === numbers.length) {
            numbers.forEach((num, idx) => {
              matrix.part1.set(num, { answer: letters[idx], source: 'answer_table' });
            });
            i++; // skip next line
            continue;
          }
        }
      }

      // 2. Inline Part I: "1.B", "1: B", "1 - B", "Câu 1: B"
      const inlineMatches = [...line.matchAll(/(?:Câu\s+)?(\d+)[\s.:\-–—)]+([A-D])\b/gi)];
      if (inlineMatches.length > 0) {
        inlineMatches.forEach(m => {
          const qNum = parseInt(m[1], 10);
          const opt = m[2].toUpperCase();
          if (!matrix.part1.has(qNum)) {
            matrix.part1.set(qNum, { answer: opt, source: 'answer_table' });
          }
        });
      }
    }

    // --- PART II PARSING ---
    if (currentSection === 'part2' || !currentSection) {
      // 1. TRANSPOSED MATRIX TABLE:
      // Header: "Câu 1 2 3 4" (columns are question numbers)
      // Followed by:
      // "a) S Đ Đ Đ"
      // "b) Đ Đ Đ Đ"
      // "c) Đ S Đ Đ"
      // "d) S Đ S S"
      const transHeaderMatch = line.match(/^Câu(?:\s*:)?\s+([\d\s]+)$/i);
      if (transHeaderMatch && i + 4 <= lines.length) {
        const colNumbers = transHeaderMatch[1].trim().split(/\s+/).map(n => parseInt(n, 10)).filter(n => !isNaN(n));
        
        // Peek next 4 lines to see if they start with a), b), c), d)
        const rowA = lines[i + 1];
        const rowB = lines[i + 2];
        const rowC = lines[i + 3];
        const rowD = lines[i + 4];

        const matchA = rowA?.match(/^a\)?\s+([ĐS\s]{1,})/i);
        const matchB = rowB?.match(/^b\)?\s+([ĐS\s]{1,})/i);
        const matchC = rowC?.match(/^c\)?\s+([ĐS\s]{1,})/i);
        const matchD = rowD?.match(/^d\)?\s+([ĐS\s]{1,})/i);

        if (colNumbers.length > 0 && matchA && matchB && matchC && matchD) {
          const tokensA = matchA[1].trim().split(/\s+/).filter(t => /^[ĐS]$/i.test(t));
          const tokensB = matchB[1].trim().split(/\s+/).filter(t => /^[ĐS]$/i.test(t));
          const tokensC = matchC[1].trim().split(/\s+/).filter(t => /^[ĐS]$/i.test(t));
          const tokensD = matchD[1].trim().split(/\s+/).filter(t => /^[ĐS]$/i.test(t));

          if (tokensA.length === colNumbers.length && tokensB.length === colNumbers.length) {
            colNumbers.forEach((colNum, colIdx) => {
              matrix.part2.set(colNum, {
                statements: {
                  a: tokensA[colIdx] ? tokensA[colIdx].toUpperCase() === 'Đ' : false,
                  b: tokensB[colIdx] ? tokensB[colIdx].toUpperCase() === 'Đ' : false,
                  c: tokensC[colIdx] ? tokensC[colIdx].toUpperCase() === 'Đ' : false,
                  d: tokensD[colIdx] ? tokensD[colIdx].toUpperCase() === 'Đ' : false,
                },
                source: 'answer_table',
                notes: 'Bảng ma trận chuyển vị (cột là số câu)',
              });
            });
            i += 4; // skip 4 sub-rows
            continue;
          }
        }
      }

      // 2. STANDARD ROW-WISE TABLE:
      // Row has question number followed by 4 True/False tokens:
      // "1 S Đ Đ S" or "1: S Đ Đ S" or "Câu 1: S Đ Đ S"
      const rowWiseMatch = line.match(/^(?:Câu\s+)?(\d+)[\s.:\-–—]+([ĐS][\sĐS]{3,})$/i);
      if (rowWiseMatch) {
        const qNum = parseInt(rowWiseMatch[1], 10);
        const tokens = rowWiseMatch[2].trim().split(/\s+/).filter(t => /^[ĐS]$/i.test(t));
        if (tokens.length >= 4) {
          matrix.part2.set(qNum, {
            statements: {
              a: tokens[0].toUpperCase() === 'Đ',
              b: tokens[1].toUpperCase() === 'Đ',
              c: tokens[2].toUpperCase() === 'Đ',
              d: tokens[3].toUpperCase() === 'Đ',
            },
            source: 'answer_table',
            notes: 'Bảng theo dòng',
          });
          continue;
        }
      }

      // 3. MULTILINE True/False:
      // Line i: "Câu 1:"
      // Line i+1: "a) Đúng"
      // Line i+2: "b) Sai"
      // Line i+3: "c) Đúng"
      // Line i+4: "d) Sai"
      const multiQMatch = line.match(/^(?:Câu\s+)?(\d+)[\s.:\-–—]*$/i);
      if (multiQMatch && i + 1 < lines.length) {
        const qNum = parseInt(multiQMatch[1], 10);
        const tfMap: Record<string, boolean> = {};
        let step = 0;

        for (let nextR = i + 1; nextR < Math.min(lines.length, i + 6); nextR++) {
          const nextL = lines[nextR];
          const subMatch = nextL.match(/^(?:\(?([a-d])[\)\].:\-–\s]+|\b([a-d])\s+)(Đúng|Sai|True|False|Đ|S)\b/i);
          if (subMatch) {
            const sub = (subMatch[1] || subMatch[2]).toLowerCase();
            const val = /^(Đ|ĐÚNG|TRUE|T|D)$/i.test(subMatch[3].trim());
            tfMap[sub] = val;
            step++;
          } else {
            break;
          }
        }

        if (Object.keys(tfMap).length >= 2) {
          matrix.part2.set(qNum, {
            statements: tfMap,
            source: 'answer_table',
            notes: 'Danh sách nhiều dòng',
          });
          i += step;
          continue;
        }
      }

      // 4. INLINE True/False:
      // "Câu 1: a-S, b-Đ, c-Đ, d-S" or "Câu 1: a) Đ; b) S; c) Đ; d) S" or "Câu 1: a. Đúng, b. Sai..."
      const inlineQNumMatch = line.match(/^(?:Câu\s+)?(\d+)[\s.:\-–—]+/i);
      if (inlineQNumMatch) {
        const qNum = parseInt(inlineQNumMatch[1], 10);
        const pairs = [...line.matchAll(/(?:\(?([a-d])[\)\].:\-–\s]+|\b([a-d])\s+)(Đúng|Sai|True|False|Đ|S)\b/gi)];
        if (pairs.length >= 2) {
          const tfMap: Record<string, boolean> = {};
          pairs.forEach(p => {
            const sub = (p[1] || p[2]).toLowerCase();
            const val = /^(Đ|ĐÚNG|TRUE|T|D)$/i.test(p[3].trim());
            tfMap[sub] = val;
          });
          matrix.part2.set(qNum, {
            statements: tfMap,
            source: 'answer_table',
            notes: 'Dạng danh sách a,b,c,d cùng dòng',
          });
        }
      }
    }

    // --- PART III PARSING ---
    if (currentSection === 'part3' || !currentSection) {
      // 1. Table format Part III:
      // Row 1: "Câu 1 2 3 4 5 6"
      // Row 2: "Đáp án 4 104 58,4 7,1 9,5 4132"
      const p3HeaderMatch = line.match(/^Câu(?:\s*:)?\s+([\d\s]+)$/i);
      if (p3HeaderMatch && i + 1 < lines.length) {
        const nextLine = lines[i + 1];
        const numbers = p3HeaderMatch[1].trim().split(/\s+/).map(n => parseInt(n, 10)).filter(n => !isNaN(n));
        
        if (nextLine.startsWith('Đáp án') || /^[\d,.\-+\s]+$/.test(nextLine)) {
          const rawAns = nextLine.replace(/^Đáp\s*án(?:\s*:)?\s*/i, '').trim();
          const ansTokens = rawAns.split(/\s+/).filter(Boolean);

          if (numbers.length > 0 && ansTokens.length === numbers.length) {
            numbers.forEach((num, idx) => {
              const val = ansTokens[idx].trim();
              matrix.part3.set(num, {
                answer: val,
                acceptedAnswers: [val, val.replace(',', '.'), val.replace('.', ',')],
                source: 'answer_table',
              });
            });
            i++; // skip next line
            continue;
          }
        }
      }

      // 2. Inline Part III in Answer Section:
      // "Câu 1: 4" or "1: 104" or "Câu 3: 58,4" or "Câu 4 = 7,1"
      const p3InlineMatches = [...line.matchAll(/(?:^|\s|[,;|])(?:Câu\s*)?(\d+)[\s.:\-–—=]+([-+]?\d+(?:[,.]\d+)?(?:\/\d+)?(?:\s*[a-zA-Z/%°]+)?)/gi)];
      if (p3InlineMatches.length > 0) {
        for (const m of p3InlineMatches) {
          const qNum = parseInt(m[1], 10);
          const val = m[2].trim();
          if (!matrix.part3.has(qNum)) {
            matrix.part3.set(qNum, {
              answer: val,
              acceptedAnswers: [val, val.replace(',', '.'), val.replace('.', ',')],
              source: 'answer_table',
            });
          }
        }
      }
    }
  }
}

/**
 * Parses lines in "HƯỚNG DẪN GIẢI CHI TIẾT" block to extract full explanations
 * and final numeric/concluding values
 */
function parseDetailedSolutionsSection(lines: string[], matrix: SectionAnswersMatrix) {
  let currentSection: 'part1' | 'part2' | 'part3' = 'part3'; // Default to part3 as solutions are most common for Part III
  let currentQNum: number | null = null;
  let currentExplanationLines: string[] = [];

  const finalizeExplanation = () => {
    if (currentQNum !== null && currentExplanationLines.length > 0) {
      const fullText = currentExplanationLines.join('\n').trim();
      const expKey = `${currentSection === 'part1' ? 'part1_single_choice' : currentSection === 'part2' ? 'part2_true_false' : 'part3_short_answer'}_${currentQNum}`;
      matrix.explanations.set(expKey, fullText);

      // If Part III answer was not found from table, extract concluding value:
      if (currentSection === 'part3' && !matrix.part3.has(currentQNum)) {
        const concludingValue = extractFinalValueFromSolution(fullText);
        if (concludingValue) {
          matrix.part3.set(currentQNum, {
            answer: concludingValue,
            acceptedAnswers: [concludingValue, concludingValue.replace(',', '.'), concludingValue.replace('.', ',')],
            source: 'detailed_solution',
            notes: 'Trích xuất từ kết luận lời giải',
          });
        }
      }
    }
    currentExplanationLines = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (/PHẦN\s+(I|1)\b/i.test(line)) {
      finalizeExplanation();
      currentSection = 'part1';
      continue;
    }
    if (/PHẦN\s+(II|2)\b/i.test(line)) {
      finalizeExplanation();
      currentSection = 'part2';
      continue;
    }
    if (/PHẦN\s+(III|3)\b/i.test(line)) {
      finalizeExplanation();
      currentSection = 'part3';
      continue;
    }

    const qHeaderMatch = line.match(/^Câu\s+(\d+)[\s.:\-–—]+(.*)$/i);
    if (qHeaderMatch) {
      finalizeExplanation();
      currentQNum = parseInt(qHeaderMatch[1], 10);
      if (qHeaderMatch[2]) {
        currentExplanationLines.push(qHeaderMatch[2]);
      }
      continue;
    }

    if (currentQNum !== null) {
      currentExplanationLines.push(line);
    }
  }

  finalizeExplanation();
}

/**
 * Extracts final answer from chemistry solution text (e.g. "= 6", "≈ 0,4", "V = 0,3", "≈ 58,4")
 */
function extractFinalValueFromSolution(text: string): string | null {
  // Look for pattern at the end of the explanation or formulas:
  // e.g. "≈ 0,4 (hàng phần mười)" or "= 188,0 mg KOH/g" or "= 6"
  const patterns = [
    /[=≈~]\s*([0-9]+[.,][0-9]+|[0-9]+)\s*(?:[a-zA-Z/%°]+)?(?:\s*\(.*?\))?[\s.]*$/m,
    /Đáp\s*(?:án|số)(?:\s*:)?\s*([0-9]+[.,][0-9]+|[0-9]+)/i,
    /([0-9]+[.,][0-9]+|[0-9]+)\s*(?:\([^\)]*hàng phần mười[^\)]*\))/i,
    /[=≈~]\s*([0-9]+[.,][0-9]+|[0-9]+)\b/g,
  ];

  for (const pat of patterns) {
    if (pat.global) {
      const allMatches = [...text.matchAll(pat)];
      if (allMatches.length > 0) {
        // Return the last calculated value in the solution
        return allMatches[allMatches.length - 1][1];
      }
    } else {
      const match = text.match(pat);
      if (match && match[1]) {
        return match[1];
      }
    }
  }

  return null;
}

/**
 * Reconciles parsed questions with extracted answer keys and creates structured AnswerRecognitionItem[]
 */
export function buildAnswerRecognitionItems(
  questions: Question[],
  matrix: SectionAnswersMatrix
): { items: AnswerRecognitionItem[]; part1Found: number; part2StatementsFound: number; part3Found: number } {
  const items: AnswerRecognitionItem[] = [];
  let part1Found = 0;
  let part2StatementsFound = 0;
  let part3Found = 0;

  // Track counts per section
  let p1Index = 1;
  let p2Index = 1;
  let p3Index = 1;

  const getPromptNumber = (q: Question): number => {
    const codeM = q.code.match(/_C(\d+)$/i);
    if (codeM) return parseInt(codeM[1], 10);
    const contentM = q.content.match(/^Câu\s+(\d+)/i);
    return contentM ? parseInt(contentM[1], 10) : -1;
  };

  questions.forEach(q => {
    const promptNum = getPromptNumber(q);

    if (q.type === 'part1_single_choice') {
      const qNum = p1Index++;
      const detected = matrix.part1.get(qNum) || (promptNum > 0 ? matrix.part1.get(promptNum) : undefined);
      const chosenKey = q.correctOptionId || detected?.answer || '';
      const status: RecognitionStatus = chosenKey ? 'verified' : 'not_found';
      const source: RecognitionSource = q.correctOptionId && !detected ? 'question_content' : (detected?.source || 'manual');

      if (chosenKey) part1Found++;

      items.push({
        id: `I.${qNum}`,
        questionId: q.id,
        section: 'part1',
        questionNumber: qNum,
        answerType: 'choice',
        correctAnswer: chosenKey,
        recognitionStatus: status,
        recognitionSource: source,
        teacherVerified: (chosenKey ? (q.teacherVerified ?? true) : false),
        notes: detected?.notes,
      });

      // Update question object
      q.correctOptionId = chosenKey;
      q.recognitionSource = source;
      if (q.options && chosenKey) {
        q.options.forEach(o => {
          o.isCorrect = o.id === chosenKey;
        });
      }
      q.parseStatus = chosenKey ? 'verified' : 'needs_review';
      q.parseWarning = chosenKey ? undefined : 'Chưa có đáp án chính thức';
    } 
    else if (q.type === 'part2_true_false') {
      const qNum = p2Index++;
      const detectedTF = matrix.part2.get(qNum) || (promptNum > 0 ? matrix.part2.get(promptNum) : undefined);
      const stmts = q.statements || [
        { id: 'a', statement: '', correctAnswer: false },
        { id: 'b', statement: '', correctAnswer: false },
        { id: 'c', statement: '', correctAnswer: false },
        { id: 'd', statement: '', correctAnswer: false },
      ];

      let allStmtsHaveAnswer = true;

      ['a', 'b', 'c', 'd'].forEach(subLetter => {
        const stmtObj = stmts.find(s => s.id === subLetter);
        let ansVal: boolean | undefined = undefined;
        let isVerified = false;

        if (detectedTF?.statements && detectedTF.statements[subLetter] !== undefined) {
          ansVal = detectedTF.statements[subLetter];
          isVerified = true;
          if (stmtObj) stmtObj.correctAnswer = ansVal;
        } else if (stmtObj?.explanation === 'Đúng' || stmtObj?.explanation === 'Sai') {
          ansVal = stmtObj.correctAnswer;
          isVerified = true;
        }

        const hasVal = isVerified && ansVal !== undefined;
        if (hasVal) {
          part2StatementsFound++;
        } else {
          allStmtsHaveAnswer = false;
        }

        items.push({
          id: `II.${qNum}${subLetter}`,
          questionId: q.id,
          section: 'part2',
          questionNumber: qNum,
          subQuestion: subLetter as any,
          answerType: 'true_false',
          correctAnswer: hasVal ? (ansVal ? 'Đ' : 'S') : '',
          recognitionStatus: hasVal ? 'verified' : 'not_found',
          recognitionSource: detectedTF?.source || (stmtObj?.explanation ? 'question_content' : 'manual'),
          teacherVerified: hasVal,
          notes: stmtObj?.statement?.slice(0, 50),
        });
      });

      q.parseStatus = (stmts.length >= 2 && allStmtsHaveAnswer) ? 'verified' : 'needs_review';
      q.parseWarning = allStmtsHaveAnswer ? undefined : 'Chưa có đáp án chính thức cho tất cả các ý';
      q.recognitionSource = detectedTF?.source || 'question_content';
    } 
    else if (q.type === 'part3_short_answer') {
      const qNum = p3Index++;
      const detectedShort = matrix.part3.get(qNum) || (promptNum > 0 ? matrix.part3.get(promptNum) : undefined);
      const finalVal = detectedShort?.answer || q.shortAnswerConfig?.acceptableAnswers[0] || '';
      const hasVal = !!finalVal;

      if (hasVal) part3Found++;

      items.push({
        id: `III.${qNum}`,
        questionId: q.id,
        section: 'part3',
        questionNumber: qNum,
        answerType: 'short_answer',
        correctAnswer: finalVal,
        acceptedAnswers: detectedShort?.acceptedAnswers || (finalVal ? [finalVal, finalVal.replace(',', '.'), finalVal.replace('.', ',')] : []),
        tolerance: 0.05,
        recognitionStatus: hasVal ? 'verified' : 'not_found',
        recognitionSource: detectedShort?.source || (q.shortAnswerConfig?.acceptableAnswers.length ? 'question_content' : 'manual'),
        teacherVerified: hasVal,
        notes: detectedShort?.notes,
      });

      if (hasVal) {
        q.shortAnswerConfig = {
          acceptableAnswers: detectedShort?.acceptedAnswers || [finalVal, finalVal.replace(',', '.'), finalVal.replace('.', ',')],
          isNumeric: !isNaN(Number(finalVal.replace(',', '.'))),
          numericValue: parseFloat(finalVal.replace(',', '.') || '0'),
          tolerance: 0.05,
        };
        q.parseStatus = 'verified';
        q.parseWarning = undefined;
        q.recognitionSource = detectedShort?.source || 'question_content';
      } else {
        q.shortAnswerConfig = {
          acceptableAnswers: [],
          isNumeric: true,
        };
        q.parseStatus = 'needs_review';
        q.parseWarning = 'Chưa có đáp án chính thức';
      }
    }
  });

  return { items, part1Found, part2StatementsFound, part3Found };
}
