/**
 * ANSWER EXTRACTION ENGINE - 7-Point Answer Validator & Cross-Checker
 * Kiểm định logic, phát hiện thiếu/trùng/sai lệch ma trận và đối soát với lời giải chi tiết
 */

import {
  ExtractedAnswerItem,
  ValidationIssue,
  EngineVerificationReport,
  RawDocumentTable,
} from './types';

export function validateAndCrossCheckAnswers(
  part1Items: ExtractedAnswerItem[],
  part2Items: ExtractedAnswerItem[],
  part3Items: ExtractedAnswerItem[],
  solutionChoices: Map<number, string>,
  _tables: RawDocumentTable[],
  expectedCounts?: { part1?: number; part2?: number; part3?: number }
): {
  validatedPart1: ExtractedAnswerItem[];
  validatedPart2: ExtractedAnswerItem[];
  validatedPart3: ExtractedAnswerItem[];
  report: EngineVerificationReport;
} {
  const issues: ValidationIssue[] = [];

  // --- 1. PART I VALIDATION & CROSS-CHECKING ---
  const validatedPart1 = part1Items.map(item => ({ ...item }));
  const p1Map = new Map<number, ExtractedAnswerItem>();
  const p1QNums = validatedPart1.map(i => i.questionNumber);
  const maxP1 = p1QNums.length > 0 ? Math.max(...p1QNums) : 0;
  const targetP1Count = expectedCounts?.part1 || maxP1;

  for (const item of validatedPart1) {
    p1Map.set(item.questionNumber, item);

    // Rule 1: Invalid domain
    if (!['A', 'B', 'C', 'D'].includes(item.correctAnswer)) {
      issues.push({
        type: 'invalid_domain_value',
        severity: 'error',
        section: 'part1',
        questionNumber: item.questionNumber,
        message: `Câu ${item.questionNumber} (Phần I) có đáp án '${item.correctAnswer}' không hợp lệ (chỉ nhận A, B, C, D).`,
        suggestedFix: 'Chọn một trong 4 đáp án A, B, C, D.',
      });
      item.validationStatus = 'needs_review';
      item.validationIssues = [...(item.validationIssues || []), 'Đáp án không thuộc {A, B, C, D}'];
    }

    // Rule 2: Cross-check with Detailed Solutions ("HƯỚNG DẪN GIẢI CHI TIẾT")
    if (solutionChoices.has(item.questionNumber)) {
      const solChoice = solutionChoices.get(item.questionNumber)!;
      if (solChoice !== item.correctAnswer) {
        issues.push({
          type: 'contradictory_solution',
          severity: 'warning',
          section: 'part1',
          questionNumber: item.questionNumber,
          message: `Câu ${item.questionNumber}: Bảng đáp án ghi '${item.correctAnswer}', nhưng Lời giải chi tiết ghi 'Chọn ${solChoice}'.`,
          suggestedFix: `Kiểm tra lại xem đáp án đúng là ${item.correctAnswer} hay ${solChoice}.`,
        });
        item.validationStatus = 'needs_review';
        item.notes = `Lệch với Lời giải chi tiết (Lời giải ghi: Chọn ${solChoice})`;
        item.validationIssues = [
          ...(item.validationIssues || []),
          `Bảng ghi '${item.correctAnswer}' nhưng lời giải chi tiết ghi 'Chọn ${solChoice}'`,
        ];
      }
    }
  }

  // Check missing Part I questions in sequence
  const missingP1: number[] = [];
  for (let q = 1; q <= targetP1Count; q++) {
    if (!p1Map.has(q)) {
      missingP1.push(q);
      issues.push({
        type: 'missing_answer',
        severity: 'error',
        section: 'part1',
        questionNumber: q,
        message: `Thiếu đáp án Câu ${q} (Phần I).`,
        suggestedFix: `Bổ sung đáp án trắc nghiệm cho Câu ${q}.`,
      });
    }
  }

  // --- 2. PART II VALIDATION (GDPT 2018 TRUE/FALSE MATRIX) ---
  const validatedPart2 = part2Items.map(item => ({ ...item }));
  const p2ByQuestion = new Map<number, Map<string, ExtractedAnswerItem>>();

  for (const item of validatedPart2) {
    if (!p2ByQuestion.has(item.questionNumber)) {
      p2ByQuestion.set(item.questionNumber, new Map());
    }
    const qMap = p2ByQuestion.get(item.questionNumber)!;

    if (item.subQuestion && qMap.has(item.subQuestion)) {
      issues.push({
        type: 'duplicate_question',
        severity: 'warning',
        section: 'part2',
        questionNumber: item.questionNumber,
        subQuestion: item.subQuestion,
        message: `Trùng lặp ý ${item.subQuestion}) ở Câu ${item.questionNumber} (Phần II).`,
      });
    }

    if (item.subQuestion) {
      qMap.set(item.subQuestion, item);
    }

    // Rule: Invalid domain for True/False
    if (!['Đ', 'S'].includes(item.correctAnswer)) {
      issues.push({
        type: 'invalid_domain_value',
        severity: 'error',
        section: 'part2',
        questionNumber: item.questionNumber,
        subQuestion: item.subQuestion,
        message: `Câu ${item.questionNumber}${item.subQuestion || ''} có giá trị '${item.correctAnswer}' không hợp lệ (chỉ nhận Đ hoặc S).`,
      });
      item.validationStatus = 'needs_review';
      item.validationIssues = [...(item.validationIssues || []), "Chỉ nhận 'Đ' hoặc 'S'"];
    }
  }

  // Rule: Check that each Part II question has all 4 sub-statements: a, b, c, d
  const missingP2Subs: string[] = [];
  const p2QNums = Array.from(p2ByQuestion.keys()).sort((a, b) => a - b);
  const maxP2 = p2QNums.length > 0 ? Math.max(...p2QNums) : 0;
  const targetP2Count = expectedCounts?.part2 || maxP2;

  for (let q = 1; q <= targetP2Count; q++) {
    const qSubs = p2ByQuestion.get(q);
    const requiredSubs: ('a' | 'b' | 'c' | 'd')[] = ['a', 'b', 'c', 'd'];

    for (const sub of requiredSubs) {
      if (!qSubs || !qSubs.has(sub)) {
        missingP2Subs.push(`Câu ${q} ý ${sub})`);
        issues.push({
          type: 'missing_answer',
          severity: 'warning',
          section: 'part2',
          questionNumber: q,
          subQuestion: sub,
          message: `Câu ${q} (Phần II) chưa có đáp án cho lệnh hỏi ý ${sub}).`,
          suggestedFix: `Xác định ý ${sub}) là Đúng (Đ) hay Sai (S).`,
        });
      }
    }
  }

  // --- 3. PART III VALIDATION (SHORT ANSWER) ---
  const validatedPart3 = part3Items.map(item => ({ ...item }));
  const p3Map = new Map<number, ExtractedAnswerItem>();
  const p3QNums = validatedPart3.map(i => i.questionNumber);
  const maxP3 = p3QNums.length > 0 ? Math.max(...p3QNums) : 0;
  const targetP3Count = expectedCounts?.part3 || maxP3;

  for (const item of validatedPart3) {
    p3Map.set(item.questionNumber, item);

    if (!item.correctAnswer || item.correctAnswer.trim().length === 0) {
      issues.push({
        type: 'missing_answer',
        severity: 'error',
        section: 'part3',
        questionNumber: item.questionNumber,
        message: `Câu ${item.questionNumber} (Phần III) chưa có nội dung đáp án số/chuỗi.`,
      });
      item.validationStatus = 'not_found';
    }
  }

  const missingP3: number[] = [];
  for (let q = 1; q <= targetP3Count; q++) {
    if (!p3Map.has(q)) {
      missingP3.push(q);
      issues.push({
        type: 'missing_answer',
        severity: 'error',
        section: 'part3',
        questionNumber: q,
        message: `Thiếu đáp án trả lời ngắn Câu ${q} (Phần III).`,
        suggestedFix: `Nhập giá trị số hoặc chuỗi cho Câu ${q}.`,
      });
    }
  }

  // --- 4. COMPILE VERIFICATION REPORT ---
  const allItems = [...validatedPart1, ...validatedPart2, ...validatedPart3];
  const totalItems = allItems.length;
  const verifiedCount = allItems.filter(i => i.validationStatus === 'verified').length;
  const needsReviewCount = allItems.filter(i => i.validationStatus === 'needs_review').length;
  const notFoundCount = allItems.filter(i => i.validationStatus === 'not_found').length;

  const totalExpected = (targetP1Count) + (targetP2Count * 4) + (targetP3Count);
  const successRate = totalExpected > 0 ? Math.round((verifiedCount / totalExpected) * 100) : 100;

  const report: EngineVerificationReport = {
    totalExpectedItems: totalExpected,
    verifiedCount,
    needsReviewCount,
    notFoundCount,
    successRatePercent: Math.min(100, successRate),
    issues,
    part1Summary: {
      total: targetP1Count,
      found: p1Map.size,
      missing: missingP1,
    },
    part2Summary: {
      totalStatements: targetP2Count * 4,
      found: validatedPart2.length,
      missing: missingP2Subs,
    },
    part3Summary: {
      total: targetP3Count,
      found: p3Map.size,
      missing: missingP3,
    },
  };

  return {
    validatedPart1,
    validatedPart2,
    validatedPart3,
    report,
  };
}
