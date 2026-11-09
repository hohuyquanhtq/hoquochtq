import { Exam, StudentAnswer, Question, StudentSubmission } from '../types';

/**
 * Grades an entire exam submission according to official MOET rules and exam configuration
 */
export function gradeSubmission(
  exam: Exam,
  studentId: string,
  studentName: string,
  studentClass: string,
  startedAt: string,
  answers: Record<string, StudentAnswer>,
  tabSwitchesCount: number = 0
): StudentSubmission {
  let part1Score = 0;
  let part2Score = 0;
  let part3Score = 0;
  let correctQuestionsCount = 0;

  const now = new Date().toISOString();
  const startTime = new Date(startedAt).getTime();
  const durationSeconds = Math.max(1, Math.round((new Date(now).getTime() - startTime) / 1000));

  exam.questions.forEach((q: Question) => {
    const studentAns = answers[q.id];
    if (!studentAns) return;

    if (q.type === 'part1_single_choice') {
      const qScore = exam.rules.part1ScorePerQuestion;
      if (studentAns.selectedOptionId && q.correctOptionId && studentAns.selectedOptionId === q.correctOptionId) {
        part1Score += qScore;
        correctQuestionsCount++;
      }
    } else if (q.type === 'part2_true_false') {
      const statements = q.statements || [];
      const selected = studentAns.selectedStatements || {};
      let correctStatementsCount = 0;

      statements.forEach(st => {
        if (selected[st.id] !== undefined && selected[st.id] === st.correctAnswer) {
          correctStatementsCount++;
        }
      });

      if (exam.rules.part2GradingModel === 'standard_moet') {
        // Official MOET scaling for 4-statement True/False questions (total 1.0 point max per question)
        // 1 ý đúng = 0.1đ; 2 ý đúng = 0.25đ; 3 ý đúng = 0.50đ; 4 ý đúng = 1.00đ
        let questionPoints = 0;
        if (correctStatementsCount === 1) questionPoints = 0.1;
        else if (correctStatementsCount === 2) questionPoints = 0.25;
        else if (correctStatementsCount === 3) questionPoints = 0.5;
        else if (correctStatementsCount === 4) questionPoints = 1.0;

        // Multiply by multiplier if exam has non-standard base
        part2Score += questionPoints;
        if (correctStatementsCount === 4) correctQuestionsCount++;
      } else {
        // Custom per statement
        const perStatement = (exam.rules.part2CustomScorePerStatement || 0.25);
        part2Score += correctStatementsCount * perStatement;
        if (correctStatementsCount === statements.length) correctQuestionsCount++;
      }
    } else if (q.type === 'part3_short_answer') {
      const qScore = exam.rules.part3ScorePerQuestion;
      const text = (studentAns.textAnswer || '').trim();
      const cfg = q.shortAnswerConfig;

      if (text && cfg) {
        let isCorrect = false;

        // 1. Direct match with acceptable answers
        const normalizedText = text.toLowerCase().replace(/\s+/g, '');
        const matched = cfg.acceptableAnswers.some(ans => {
          const normAns = ans.toLowerCase().replace(/\s+/g, '');
          return normAns === normalizedText || normAns.replace(',', '.') === normalizedText.replace(',', '.');
        });

        if (matched) {
          isCorrect = true;
        } else if (cfg.isNumeric) {
          // 2. Numeric comparison with tolerance
          const cleanText = text.replace(',', '.');
          const studentNum = parseFloat(cleanText);
          const targetNum = cfg.numericValue !== undefined ? cfg.numericValue : parseFloat(cfg.acceptableAnswers[0]?.replace(',', '.') || '0');
          const tol = cfg.tolerance !== undefined ? cfg.tolerance : 0.05;

          if (!isNaN(studentNum) && !isNaN(targetNum)) {
            if (Math.abs(studentNum - targetNum) <= tol) {
              isCorrect = true;
            }
          }
        }

        if (isCorrect) {
          part3Score += qScore;
          correctQuestionsCount++;
        }
      }
    }
  });

  const totalScore = Math.min(10.0, Math.round((part1Score + part2Score + part3Score) * 100) / 100);

  return {
    id: `sub_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    examId: exam.id,
    examTitle: exam.title,
    examCode: exam.code,
    studentId,
    studentName,
    studentClass,
    startedAt,
    submittedAt: now,
    durationSeconds,
    answers,
    part1Score: Math.round(part1Score * 100) / 100,
    part2Score: Math.round(part2Score * 100) / 100,
    part3Score: Math.round(part3Score * 100) / 100,
    totalScore,
    maxPossibleScore: exam.totalScore || 10.0,
    correctQuestionsCount,
    tabSwitchesCount,
    status: 'completed',
  };
}
