import {
  Exam,
  StudentAnswer,
  Question,
  StudentSubmission,
  QuestionEvaluationDetail,
  StatementEvaluationDetail,
  QuestionResultStatus,
} from '../types';

export interface AttemptAnalyticsSummary {
  totalQuestions: number;
  correctCount: number;
  wrongCount: number;
  unansweredCount: number;
  accuracyPercent: number;
  wrongQuestionOrders: number[];
  unansweredQuestionOrders: number[];
  part1Score: number;
  part2Score: number;
  part3Score: number;
  totalScore: number;
  details: QuestionEvaluationDetail[];
}

export function isShortAnswerMatch(
  textAnswer: string,
  cfg?: Question['shortAnswerConfig']
): boolean {
  const text = (textAnswer || '').trim();
  if (!text || !cfg) return false;

  const normalizedText = text.toLowerCase().replace(/\s+/g, '');
  const acceptable = Array.isArray(cfg.acceptableAnswers) ? cfg.acceptableAnswers : [];
  const matched = acceptable.some((ans) => {
    const normAns = String(ans).toLowerCase().replace(/\s+/g, '');
    return (
      normAns === normalizedText ||
      normAns.replace(',', '.') === normalizedText.replace(',', '.')
    );
  });
  if (matched) return true;

  if (cfg.isNumeric) {
    const cleanText = text.replace(',', '.');
    const studentNum = Number.parseFloat(cleanText);
    const targetNum =
      cfg.numericValue !== undefined
        ? cfg.numericValue
        : Number.parseFloat(String(acceptable[0] || '0').replace(',', '.'));
    const tol = cfg.tolerance !== undefined ? cfg.tolerance : 0.05;

    if (Number.isFinite(studentNum) && Number.isFinite(targetNum)) {
      return Math.abs(studentNum - targetNum) <= tol;
    }
  }

  return false;
}

/**
 * Computes detailed question-by-question evaluation and overall analytics for an exam attempt.
 * Matches server grading rules exactly.
 */
export function evaluateExamAttemptDetails(
  exam: Exam | undefined,
  answers: Record<string, StudentAnswer> | undefined
): AttemptAnalyticsSummary {
  const questions = Array.isArray(exam?.questions) ? exam!.questions : [];
  const rules = exam?.rules || {
    part1ScorePerQuestion: 0.25,
    part2GradingModel: 'standard_moet' as const,
    part3ScorePerQuestion: 0.25,
    totalTargetScore: 10.0,
  };
  const safeAnswers = answers || {};

  let part1Score = 0;
  let part2Score = 0;
  let part3Score = 0;
  let correctCount = 0;
  let wrongCount = 0;
  let unansweredCount = 0;
  const wrongQuestionOrders: number[] = [];
  const unansweredQuestionOrders: number[] = [];

  const p1Points = Number(rules.part1ScorePerQuestion ?? 0.25);
  const p2Model = rules.part2GradingModel || 'standard_moet';
  const p2CustomPoints = Number(rules.part2CustomScorePerStatement ?? 0.25);
  const p3Points = Number(rules.part3ScorePerQuestion ?? 0.25);

  const details: QuestionEvaluationDetail[] = questions.map((q: Question, idx: number) => {
    const orderIndex = idx + 1;
    const studentAns = safeAnswers[q.id];

    if (q.type === 'part1_single_choice') {
      const selectedOptionId = studentAns?.selectedOptionId?.trim() || undefined;
      const isAnswered = Boolean(selectedOptionId);
      const isCorrect = Boolean(isAnswered && q.correctOptionId && selectedOptionId === q.correctOptionId);
      const earnedScore = isCorrect ? p1Points : 0;
      const status: QuestionResultStatus = !isAnswered
        ? 'unanswered'
        : isCorrect
        ? 'correct'
        : 'incorrect';

      part1Score += earnedScore;
      if (status === 'correct') correctCount++;
      else if (status === 'unanswered') {
        unansweredCount++;
        unansweredQuestionOrders.push(orderIndex);
      } else {
        wrongCount++;
        wrongQuestionOrders.push(orderIndex);
      }

      return {
        questionId: q.id,
        questionCode: q.code || `Q${orderIndex}`,
        orderIndex,
        type: q.type,
        status,
        earnedScore: Math.round(earnedScore * 100) / 100,
        maxScore: Math.round(p1Points * 100) / 100,
        selectedOptionId,
        correctOptionId: q.correctOptionId,
      };
    }

    if (q.type === 'part2_true_false') {
      const statements = q.statements || [];
      const selected = studentAns?.selectedStatements || {};
      let correctStatementsCount = 0;
      let answeredStatementsCount = 0;

      const statementDetails: StatementEvaluationDetail[] = statements.map((st) => {
        const hasChoice = selected[st.id] !== undefined && selected[st.id] !== null;
        const studentChoice = hasChoice ? Boolean(selected[st.id]) : undefined;
        const correctAnswer = Boolean(st.correctAnswer);
        const isStCorrect = Boolean(hasChoice && studentChoice === correctAnswer);
        if (hasChoice) answeredStatementsCount++;
        if (isStCorrect) correctStatementsCount++;

        return {
          statementId: st.id,
          statementText: st.statement,
          studentChoice,
          correctAnswer,
          isCorrect: isStCorrect,
          isAnswered: hasChoice,
          explanation: st.explanation,
        };
      });

      let earnedScore = 0;
      let maxScore = 1.0;
      if (p2Model === 'standard_moet') {
        if (correctStatementsCount === 1) earnedScore = 0.1;
        else if (correctStatementsCount === 2) earnedScore = 0.25;
        else if (correctStatementsCount === 3) earnedScore = 0.5;
        else if (correctStatementsCount === 4) earnedScore = 1.0;
        maxScore = 1.0;
      } else {
        earnedScore = correctStatementsCount * p2CustomPoints;
        maxScore = Math.max(statements.length, 1) * p2CustomPoints;
      }

      const isFullyCorrect =
        statements.length > 0 && correctStatementsCount === statements.length;
      const status: QuestionResultStatus =
        answeredStatementsCount === 0
          ? 'unanswered'
          : isFullyCorrect
          ? 'correct'
          : 'incorrect';

      part2Score += earnedScore;
      if (status === 'correct') correctCount++;
      else if (status === 'unanswered') {
        unansweredCount++;
        unansweredQuestionOrders.push(orderIndex);
      } else {
        wrongCount++;
        wrongQuestionOrders.push(orderIndex);
      }

      return {
        questionId: q.id,
        questionCode: q.code || `Q${orderIndex}`,
        orderIndex,
        type: q.type,
        status,
        earnedScore: Math.round(earnedScore * 100) / 100,
        maxScore: Math.round(maxScore * 100) / 100,
        statementDetails,
        correctStatementsCount,
        totalStatementsCount: statements.length,
      };
    }

    // part3_short_answer
    const text = (studentAns?.textAnswer || '').trim();
    const isAnswered = text.length > 0;
    const isCorrect = isAnswered && isShortAnswerMatch(text, q.shortAnswerConfig);
    const earnedScore = isCorrect ? p3Points : 0;
    const status: QuestionResultStatus = !isAnswered
      ? 'unanswered'
      : isCorrect
      ? 'correct'
      : 'incorrect';

    part3Score += earnedScore;
    if (status === 'correct') correctCount++;
    else if (status === 'unanswered') {
      unansweredCount++;
      unansweredQuestionOrders.push(orderIndex);
    } else {
      wrongCount++;
      wrongQuestionOrders.push(orderIndex);
    }

    return {
      questionId: q.id,
      questionCode: q.code || `Q${orderIndex}`,
      orderIndex,
      type: q.type,
      status,
      earnedScore: Math.round(earnedScore * 100) / 100,
      maxScore: Math.round(p3Points * 100) / 100,
      textAnswer: text || undefined,
      acceptableAnswers: q.shortAnswerConfig?.acceptableAnswers || [],
      isNumeric: q.shortAnswerConfig?.isNumeric,
      numericValue: q.shortAnswerConfig?.numericValue,
      tolerance: q.shortAnswerConfig?.tolerance,
      unit: q.shortAnswerConfig?.unit,
    };
  });

  const rPart1 = Math.round(part1Score * 100) / 100;
  const rPart2 = Math.round(part2Score * 100) / 100;
  const rPart3 = Math.round(part3Score * 100) / 100;
  const totalScore = Math.min(10.0, Math.round((rPart1 + rPart2 + rPart3) * 100) / 100);
  const totalQuestions = questions.length;
  const accuracyPercent =
    totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 1000) / 10 : 0;

  return {
    totalQuestions,
    correctCount,
    wrongCount,
    unansweredCount,
    accuracyPercent,
    wrongQuestionOrders,
    unansweredQuestionOrders,
    part1Score: rPart1,
    part2Score: rPart2,
    part3Score: rPart3,
    totalScore,
    details,
  };
}

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
  tabSwitchesCount: number = 0,
  attemptId?: string
): StudentSubmission {
  const now = new Date().toISOString();
  const startTime = new Date(startedAt).getTime();
  const durationSeconds = Number.isFinite(startTime)
    ? Math.max(1, Math.round((new Date(now).getTime() - startTime) / 1000))
    : 1;

  const summary = evaluateExamAttemptDetails(exam, answers);
  const resolvedAttemptId =
    attemptId || `att_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

  return {
    id: resolvedAttemptId,
    attemptId: resolvedAttemptId,
    examId: exam.id,
    examTitle: exam.title,
    examCode: exam.code,
    ...(exam.publicCode ? { publicCode: exam.publicCode } : {}),
    studentId,
    studentName,
    studentClass,
    startedAt,
    submittedAt: now,
    durationSeconds,
    answers,
    part1Score: summary.part1Score,
    part2Score: summary.part2Score,
    part3Score: summary.part3Score,
    totalScore: summary.totalScore,
    maxPossibleScore: exam.totalScore || 10.0,
    totalQuestions: summary.totalQuestions,
    correctQuestionsCount: summary.correctCount,
    wrongQuestionsCount: summary.wrongCount,
    unansweredQuestionsCount: summary.unansweredCount,
    tabSwitchesCount,
    status: 'completed',
  };
}

