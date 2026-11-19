import {
  Exam,
  StudentAnswer,
  Question,
  StudentSubmission,
  QuestionEvaluationDetail,
  StatementEvaluationDetail,
  QuestionResultStatus,
  SubmissionQuestionSnapshot,
  SubmissionSnapshotRecord,
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

export function normalizeOptionIdList(ids?: string[]): string[] {
  if (!Array.isArray(ids)) return [];
  return Array.from(
    new Set(ids.map((id) => String(id || '').trim()).filter(Boolean))
  ).sort();
}

export function resolveQuestionCorrectOptionIds(q: Partial<Question>): string[] {
  const fromArray = normalizeOptionIdList(q.correctOptionIds);
  if (fromArray.length > 0) return fromArray;
  const fromOptions = Array.isArray(q.options)
    ? normalizeOptionIdList(q.options.filter((o) => o && o.isCorrect).map((o) => o.id))
    : [];
  if (fromOptions.length > 0) return fromOptions;
  if (q.correctOptionId && q.correctOptionId.trim()) {
    return [q.correctOptionId.trim()];
  }
  return [];
}

export function resolveStudentSelectedOptionIds(ans?: StudentAnswer): string[] {
  const fromArray = normalizeOptionIdList(ans?.selectedOptionIds);
  if (fromArray.length > 0) return fromArray;
  if (ans?.selectedOptionId && ans.selectedOptionId.trim()) {
    return [ans.selectedOptionId.trim()];
  }
  return [];
}

export function isMultiSelectQuestion(q: Partial<Question>): boolean {
  if (q.type === 'part1_multiple_choice') return true;
  if (q.type === 'part1_single_choice') {
    const ids = resolveQuestionCorrectOptionIds(q);
    return ids.length > 1;
  }
  return false;
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

    if (q.type === 'part1_single_choice' || q.type === 'part1_multiple_choice') {
      const multi = isMultiSelectQuestion(q);
      if (multi) {
        const selectedOptionIds = resolveStudentSelectedOptionIds(studentAns);
        const correctOptionIds = resolveQuestionCorrectOptionIds(q);
        const isAnswered = selectedOptionIds.length > 0;
        const isCorrect =
          isAnswered &&
          correctOptionIds.length > 0 &&
          selectedOptionIds.length === correctOptionIds.length &&
          selectedOptionIds.every((id, index) => id === correctOptionIds[index]);
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
          selectedOptionId: selectedOptionIds[0],
          selectedOptionIds,
          correctOptionId: correctOptionIds[0],
          correctOptionIds,
        };
      }

      const selectedOptionId = studentAns?.selectedOptionId?.trim() || undefined;
      const correctOptionId = resolveQuestionCorrectOptionIds(q)[0] || q.correctOptionId;
      const isAnswered = Boolean(selectedOptionId);
      const isCorrect = Boolean(isAnswered && correctOptionId && selectedOptionId === correctOptionId);
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
        correctOptionId,
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

    if (q.type === 'essay') {
      const text = (studentAns?.textAnswer || '').trim();
      const isAnswered = text.length > 0;
      const status: QuestionResultStatus = isAnswered ? 'correct' : 'unanswered';
      if (!isAnswered) {
        unansweredCount++;
        unansweredQuestionOrders.push(orderIndex);
      } else {
        correctCount++;
      }

      return {
        questionId: q.id,
        questionCode: q.code || `Q${orderIndex}`,
        orderIndex,
        type: q.type,
        status,
        earnedScore: 0,
        maxScore: 0,
        textAnswer: text || undefined,
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
 * Builds an immutable SubmissionSnapshotRecord from a known Exam object & StudentSubmission.
 * Used for teacher preview / legacy local reconstruction when server snapshot doc isn't stored yet.
 */
export function buildSubmissionSnapshotFromExam(
  exam: Exam,
  submission: StudentSubmission,
  options?: { isLegacyReconstructed?: boolean }
): SubmissionSnapshotRecord {
  const safeAnswers = submission.answers || {};
  const questions = Array.isArray(exam.questions) ? exam.questions : [];
  const evalSummary = evaluateExamAttemptDetails(exam, safeAnswers);
  const detailById = new Map<string, QuestionEvaluationDetail>(
    evalSummary.details.map((d) => [d.questionId, d])
  );

  const questionResults: SubmissionQuestionSnapshot[] = questions.map((q, idx) => {
    const orderIndex = idx + 1;
    const detail = detailById.get(q.id);
    const correctIds = resolveQuestionCorrectOptionIds(q);
    const normalizedOptions = Array.isArray(q.options)
      ? q.options.map((opt) => ({
          id: opt.id,
          text: opt.text,
          isCorrect: correctIds.includes(opt.id) || opt.id === q.correctOptionId || Boolean(opt.isCorrect),
        }))
      : undefined;

    return {
      questionId: q.id,
      questionCode: q.code || `Q${orderIndex}`,
      orderIndex,
      type: q.type,
      content: q.content || '',
      ...(q.imageUrl ? { imageUrl: q.imageUrl } : {}),
      ...(normalizedOptions ? { options: normalizedOptions } : {}),
      ...(q.correctOptionId || correctIds[0]
        ? { correctOptionId: q.correctOptionId || correctIds[0] }
        : {}),
      ...(correctIds.length > 0 ? { correctOptionIds: correctIds } : {}),
      ...(Array.isArray(q.statements) ? { statements: q.statements.map((st) => ({ ...st })) } : {}),
      ...(q.shortAnswerConfig ? { shortAnswerConfig: { ...q.shortAnswerConfig } } : {}),
      ...(q.explanation ? { explanation: q.explanation } : {}),
      ...(safeAnswers[q.id] ? { studentAnswer: { ...safeAnswers[q.id] } } : {}),
      ...(detail?.statementDetails ? { statementDetails: detail.statementDetails } : {}),
      ...(typeof detail?.correctStatementsCount === 'number'
        ? { correctStatementsCount: detail.correctStatementsCount }
        : {}),
      ...(typeof detail?.totalStatementsCount === 'number'
        ? { totalStatementsCount: detail.totalStatementsCount }
        : {}),
      earnedScore: detail?.earnedScore ?? 0,
      maxScore: detail?.maxScore ?? 0,
      status: detail?.status ?? 'unanswered',
    };
  });

  return {
    id: submission.id,
    submissionId: submission.id,
    attemptId: submission.attemptId || submission.id,
    examId: submission.examId || exam.id,
    examCode: submission.examCode || exam.code,
    ...(submission.publicCode || exam.publicCode
      ? { publicCode: submission.publicCode || exam.publicCode }
      : {}),
    ...(submission.variantCode ? { variantCode: submission.variantCode } : {}),
    examTitle: submission.examTitle || exam.title,
    examVersionUpdatedAt: submission.examVersionUpdatedAt || exam.updatedAt,
    ownerId: submission.ownerId || exam.ownerId || '',
    studentId: submission.studentId,
    studentName: submission.studentName,
    studentClass: submission.studentClass,
    startedAt: submission.startedAt,
    submittedAt: submission.submittedAt,
    durationSeconds: submission.durationSeconds,
    part1Score: evalSummary.part1Score,
    part2Score: evalSummary.part2Score,
    part3Score: evalSummary.part3Score,
    totalScore: submission.totalScore ?? evalSummary.totalScore,
    maxPossibleScore: submission.maxPossibleScore || exam.totalScore || 10.0,
    totalQuestions: evalSummary.totalQuestions,
    correctQuestionsCount: evalSummary.correctCount,
    wrongQuestionsCount: evalSummary.wrongCount,
    unansweredQuestionsCount: evalSummary.unansweredCount,
    ...(typeof submission.tabSwitchesCount === 'number'
      ? { tabSwitchesCount: submission.tabSwitchesCount }
      : {}),
    status: submission.status,
    gradedByServer: Boolean(submission.gradedByServer),
    ...(options?.isLegacyReconstructed ? { isLegacyReconstructed: true } : {}),
    capturedAt: submission.submittedAt || new Date().toISOString(),
    questionResults,
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
    ...(exam.updatedAt ? { examVersionUpdatedAt: exam.updatedAt } : {}),
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

