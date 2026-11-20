import type {
  Exam,
  ExamAnswerReviewCheck,
  ExamRuleScore,
  Question,
  QuestionResultStatus,
  StatementEvaluationDetail,
  StudentAnswer,
  StudentSubmission,
  SubmissionQuestionSnapshot,
  SubmissionSnapshotRecord,
} from '../src/types/index.ts';

export interface ServerAnswerKeyEntry {
  type: Question['type'];
  correctOptionId?: string;
  correctOptionIds?: string[];
  statements?: Record<string, boolean>;
  statementExplanations?: Record<string, string>;
  shortAnswerConfig?: Question['shortAnswerConfig'];
  explanation?: string;
}

export interface ServerGradeBreakdown {
  part1Score: number;
  part2Score: number;
  part3Score: number;
  totalScore: number;
  totalQuestions: number;
  correctQuestionsCount: number;
  wrongQuestionsCount: number;
  unansweredQuestionsCount: number;
}

export function normalizeExamCodeServer(rawCode: string): string {
  return (rawCode || '')
    .trim()
    .replace(/^(?:#?\/?(?:c|exam)\/|#)/i, '')
    .replace(/[\s_]/g, '')
    .toUpperCase();
}

export function normalizeOptionIdsServer(ids?: string[]): string[] {
  if (!Array.isArray(ids)) return [];
  return Array.from(
    new Set(ids.map((id) => String(id || '').trim()).filter(Boolean))
  ).sort();
}

function isShortAnswerMatchServer(
  text: string,
  cfg?: Question['shortAnswerConfig']
): boolean {
  const trimmed = (text || '').trim();
  if (!trimmed || !cfg) return false;

  const normalizedText = trimmed.toLowerCase().replace(/\s+/g, '');
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
    const cleanText = trimmed.replace(',', '.');
    const studentNum = Number.parseFloat(cleanText);
    const targetNum =
      cfg.numericValue !== undefined
        ? cfg.numericValue
        : Number.parseFloat(String(acceptable[0] || '0').replace(',', '.'));
    const tol = cfg.tolerance !== undefined ? cfg.tolerance : 0.05;

    if (Number.isFinite(studentNum) && Number.isFinite(targetNum)) {
      if (Math.abs(studentNum - targetNum) <= tol) {
        return true;
      }
    }
  }

  return false;
}

export function sanitizeQuestionsForClient(questions: Question[]): Question[] {
  return (Array.isArray(questions) ? questions : [])
    .filter((q) => q && typeof q === 'object')
    .map((q) => {
      const sanitized: Question = {
        id: q.id || '',
        code: q.code || '',
        content: q.content || '',
        type: q.type || 'part1_single_choice',
        grade: q.grade || '12',
        topic: q.topic || 'hoa_dai_cuong',
        level: q.level || 'nhan_biet',
        authorId: '',
        createdAt: q.createdAt || '',
        updatedAt: q.updatedAt || '',
      };
      if (q.imageUrl) sanitized.imageUrl = q.imageUrl;
      if (q.sectionId) sanitized.sectionId = q.sectionId;
      if (q.section) sanitized.section = q.section;
      if (q.part) sanitized.part = q.part;
      if (q.sectionTitle) sanitized.sectionTitle = q.sectionTitle;
      if (q.partTitle) sanitized.partTitle = q.partTitle;

      if (Array.isArray(q.options)) {
        sanitized.options = q.options.map((o) => ({
          id: o.id || '',
          text: o.text || '',
        }));
      }
      if (Array.isArray(q.statements)) {
        sanitized.statements = q.statements.map((s) => ({
          id: s.id || '',
          statement: s.statement || '',
          correctAnswer: false,
        }));
      }
      if (q.shortAnswerConfig) {
        sanitized.shortAnswerConfig = {
          acceptableAnswers: [],
          isNumeric: !!q.shortAnswerConfig.isNumeric,
          ...(q.shortAnswerConfig.unit ? { unit: q.shortAnswerConfig.unit } : {}),
        };
      }
      return sanitized;
    });
}

export function gradeAnswersOnServer(params: {
  questionOrder: Array<{ id: string; type: Question['type']; statementIds?: string[] }>;
  answerMap: Record<string, ServerAnswerKeyEntry>;
  rules: ExamRuleScore;
  answers: Record<string, StudentAnswer>;
}): ServerGradeBreakdown {
  const { questionOrder, answerMap, rules, answers } = params;
  let part1Score = 0;
  let part2Score = 0;
  let part3Score = 0;
  let correctQuestionsCount = 0;
  let wrongQuestionsCount = 0;
  let unansweredQuestionsCount = 0;

  const p1Points = Number(rules?.part1ScorePerQuestion ?? 0.25);
  const p2Model = rules?.part2GradingModel || 'standard_moet';
  const p2CustomPoints = Number(rules?.part2CustomScorePerStatement ?? 0.25);
  const p3Points = Number(rules?.part3ScorePerQuestion ?? 0.25);

  const items: Array<{ id: string; type: Question['type']; statementIds?: string[] }> =
    questionOrder.length > 0
      ? questionOrder
      : Object.entries(answerMap).map(([id, entry]) => ({
          id,
          type: entry.type,
          statementIds: entry.statements ? Object.keys(entry.statements) : undefined,
        }));

  let totalQuestions = 0;

  for (const item of items) {
    const key = answerMap[item.id];
    if (!key) continue;
    totalQuestions++;

    const studentAns = answers?.[item.id];
    const qType = key.type || item.type;

    if (qType === 'part1_single_choice' || qType === 'part1_multiple_choice') {
      const keyCorrectIds = normalizeOptionIdsServer(
        key.correctOptionIds && key.correctOptionIds.length > 0
          ? key.correctOptionIds
          : key.correctOptionId
          ? [key.correctOptionId]
          : []
      );
      const isMulti = qType === 'part1_multiple_choice' || keyCorrectIds.length > 1;

      if (isMulti) {
        const selectedIds = normalizeOptionIdsServer(
          studentAns?.selectedOptionIds && studentAns.selectedOptionIds.length > 0
            ? studentAns.selectedOptionIds
            : studentAns?.selectedOptionId
            ? [studentAns.selectedOptionId]
            : []
        );
        if (selectedIds.length === 0) {
          unansweredQuestionsCount++;
        } else if (
          keyCorrectIds.length > 0 &&
          selectedIds.length === keyCorrectIds.length &&
          selectedIds.every((id, idx) => id === keyCorrectIds[idx])
        ) {
          part1Score += p1Points;
          correctQuestionsCount++;
        } else {
          wrongQuestionsCount++;
        }
      } else {
        const selectedOpt = studentAns?.selectedOptionId?.trim() || '';
        const singleCorrectId = keyCorrectIds[0] || key.correctOptionId;
        if (!selectedOpt) {
          unansweredQuestionsCount++;
        } else if (singleCorrectId && selectedOpt === singleCorrectId) {
          part1Score += p1Points;
          correctQuestionsCount++;
        } else {
          wrongQuestionsCount++;
        }
      }
    } else if (qType === 'part2_true_false') {
      const stMap = key.statements || {};
      const stIds = item.statementIds && item.statementIds.length > 0 ? item.statementIds : Object.keys(stMap);
      const selected = studentAns?.selectedStatements || {};
      let correctStatementsCount = 0;
      let answeredStatementsCount = 0;

      for (const stId of stIds) {
        if (selected[stId] !== undefined && selected[stId] !== null) {
          answeredStatementsCount++;
          if (stId in stMap && Boolean(selected[stId]) === Boolean(stMap[stId])) {
            correctStatementsCount++;
          }
        }
      }

      if (p2Model === 'standard_moet') {
        let qPts = 0;
        if (correctStatementsCount === 1) qPts = 0.1;
        else if (correctStatementsCount === 2) qPts = 0.25;
        else if (correctStatementsCount === 3) qPts = 0.5;
        else if (correctStatementsCount === 4) qPts = 1.0;

        part2Score += qPts;
        if (answeredStatementsCount === 0) {
          unansweredQuestionsCount++;
        } else if (stIds.length > 0 && correctStatementsCount === stIds.length) {
          correctQuestionsCount++;
        } else {
          wrongQuestionsCount++;
        }
      } else {
        part2Score += correctStatementsCount * p2CustomPoints;
        if (answeredStatementsCount === 0) {
          unansweredQuestionsCount++;
        } else if (stIds.length > 0 && correctStatementsCount === stIds.length) {
          correctQuestionsCount++;
        } else {
          wrongQuestionsCount++;
        }
      }
    } else if (qType === 'part3_short_answer') {
      const text = (studentAns?.textAnswer || '').trim();
      const cfg = key.shortAnswerConfig;

      if (!text) {
        unansweredQuestionsCount++;
      } else if (isShortAnswerMatchServer(text, cfg)) {
        part3Score += p3Points;
        correctQuestionsCount++;
      } else {
        wrongQuestionsCount++;
      }
    }
  }

  const rPart1 = Math.round(part1Score * 100) / 100;
  const rPart2 = Math.round(part2Score * 100) / 100;
  const rPart3 = Math.round(part3Score * 100) / 100;
  const totalScore = Math.min(10.0, Math.round((rPart1 + rPart2 + rPart3) * 100) / 100);

  return {
    part1Score: rPart1,
    part2Score: rPart2,
    part3Score: rPart3,
    totalScore,
    totalQuestions,
    correctQuestionsCount,
    wrongQuestionsCount,
    unansweredQuestionsCount,
  };
}

/**
 * Builds an immutable per-attempt snapshot combining exam question content,
 * variant ordering, option order, student's exact answers, authoritative answer keys,
 * and exact per-question earned/max score & status at the time of attempt.
 */
export function buildServerSubmissionSnapshot(params: {
  submission: StudentSubmission;
  masterExam?: Partial<Exam> | null;
  publicExam?: Partial<Exam> | null;
  questionOrder?: Array<{ id: string; type: Question['type']; statementIds?: string[] }>;
  answerMap?: Record<string, ServerAnswerKeyEntry>;
  rules?: ExamRuleScore;
  isLegacyReconstructed?: boolean;
}): SubmissionSnapshotRecord {
  const {
    submission,
    masterExam,
    publicExam,
    questionOrder = [],
    answerMap = {},
    rules,
    isLegacyReconstructed = false,
  } = params;

  const resolvedRules: ExamRuleScore = rules ||
    masterExam?.rules ||
    publicExam?.rules || {
      part1ScorePerQuestion: 0.25,
      part2GradingModel: 'standard_moet',
      part3ScorePerQuestion: 0.25,
      totalTargetScore: 10.0,
    };

  const p1Points = Number(resolvedRules.part1ScorePerQuestion ?? 0.25);
  const p2Model = resolvedRules.part2GradingModel || 'standard_moet';
  const p2CustomPoints = Number(resolvedRules.part2CustomScorePerStatement ?? 0.25);
  const p3Points = Number(resolvedRules.part3ScorePerQuestion ?? 0.25);

  const masterQuestions = Array.isArray(masterExam?.questions) ? masterExam!.questions! : [];
  const publicQuestions = Array.isArray(publicExam?.questions) ? publicExam!.questions! : [];
  const masterById = new Map<string, Question>(masterQuestions.map((q) => [q.id, q]));
  const publicById = new Map<string, Question>(publicQuestions.map((q) => [q.id, q]));

  const variant = submission.variantCode
    ? masterExam?.variants?.find((v) => v.code === submission.variantCode)
    : undefined;

  let orderedIds: string[] = [];
  if (variant?.questionIds && variant.questionIds.length > 0) {
    orderedIds = variant.questionIds;
  } else if (questionOrder.length > 0) {
    orderedIds = questionOrder.map((item) => item.id);
  } else if (masterQuestions.length > 0) {
    orderedIds = masterQuestions.map((q) => q.id);
  } else if (publicQuestions.length > 0) {
    orderedIds = publicQuestions.map((q) => q.id);
  } else {
    orderedIds = Object.keys(answerMap);
  }

  // Deduplicate while preserving exact attempt question order
  const seenIds = new Set<string>();
  const uniqueIds = orderedIds.filter((id) => {
    if (!id || seenIds.has(id)) return false;
    seenIds.add(id);
    return true;
  });

  const safeAnswers = submission.answers || {};
  const questionOrderMetaMap = new Map(questionOrder.map((q) => [q.id, q]));

  let part1Score = 0;
  let part2Score = 0;
  let part3Score = 0;
  let correctCount = 0;
  let wrongCount = 0;
  let unansweredCount = 0;

  const questionResults: SubmissionQuestionSnapshot[] = uniqueIds.map((qId, idx) => {
    const orderIndex = idx + 1;
    const baseQ = masterById.get(qId) || publicById.get(qId);
    const key = answerMap[qId];
    const orderMeta = questionOrderMetaMap.get(qId);
    const qType: Question['type'] = key?.type || baseQ?.type || orderMeta?.type || 'part1_single_choice';
    const studentAns = safeAnswers[qId];

    const content =
      baseQ?.content ||
      `[Câu hỏi ${baseQ?.code || qId}] Nội dung câu hỏi không còn trên đề gốc tại thời điểm khôi phục.`;
    const questionCode = baseQ?.code || `Q${orderIndex}`;
    const imageUrl = baseQ?.imageUrl;
    const explanation = key?.explanation || baseQ?.explanation;

    if (qType === 'part1_single_choice' || qType === 'part1_multiple_choice') {
      const fromKeyIds = normalizeOptionIdsServer(
        key?.correctOptionIds && key.correctOptionIds.length > 0
          ? key.correctOptionIds
          : key?.correctOptionId
          ? [key.correctOptionId]
          : []
      );
      const fromBaseIds = normalizeOptionIdsServer(
        baseQ?.correctOptionIds && baseQ.correctOptionIds.length > 0
          ? baseQ.correctOptionIds
          : baseQ?.options?.some((o) => o.isCorrect)
          ? baseQ.options.filter((o) => o.isCorrect).map((o) => o.id)
          : baseQ?.correctOptionId
          ? [baseQ.correctOptionId]
          : []
      );
      const correctOptionIds = fromKeyIds.length > 0 ? fromKeyIds : fromBaseIds;
      const isMulti = qType === 'part1_multiple_choice' || correctOptionIds.length > 1;

      // Apply variant option shuffle if present
      const shuffleOrder = variant?.optionShuffles?.[qId];
      let rawOptions = Array.isArray(baseQ?.options) ? [...baseQ!.options!] : [];
      if (Array.isArray(shuffleOrder) && shuffleOrder.length > 0 && rawOptions.length > 0) {
        const optMap = new Map(rawOptions.map((o) => [o.id, o]));
        const reordered = shuffleOrder.map((oid) => optMap.get(oid)).filter(Boolean) as typeof rawOptions;
        const missing = rawOptions.filter((o) => !shuffleOrder.includes(o.id));
        rawOptions = [...reordered, ...missing];
      }

      const normalizedOptions = rawOptions.map((o) => ({
        id: o.id,
        text: o.text,
        isCorrect: correctOptionIds.includes(o.id),
      }));

      let status: QuestionResultStatus = 'unanswered';
      let earnedScore = 0;

      if (isMulti) {
        const selectedIds = normalizeOptionIdsServer(
          studentAns?.selectedOptionIds && studentAns.selectedOptionIds.length > 0
            ? studentAns.selectedOptionIds
            : studentAns?.selectedOptionId
            ? [studentAns.selectedOptionId]
            : []
        );
        if (selectedIds.length === 0) {
          status = 'unanswered';
          unansweredCount++;
        } else if (
          correctOptionIds.length > 0 &&
          selectedIds.length === correctOptionIds.length &&
          selectedIds.every((id, i) => id === correctOptionIds[i])
        ) {
          status = 'correct';
          earnedScore = p1Points;
          part1Score += earnedScore;
          correctCount++;
        } else {
          status = 'incorrect';
          wrongCount++;
        }
      } else {
        const selectedOpt = studentAns?.selectedOptionId?.trim() || '';
        const correctSingle = correctOptionIds[0] || key?.correctOptionId || baseQ?.correctOptionId;
        if (!selectedOpt) {
          status = 'unanswered';
          unansweredCount++;
        } else if (correctSingle && selectedOpt === correctSingle) {
          status = 'correct';
          earnedScore = p1Points;
          part1Score += earnedScore;
          correctCount++;
        } else {
          status = 'incorrect';
          wrongCount++;
        }
      }

      return {
        questionId: qId,
        questionCode,
        orderIndex,
        type: qType,
        content,
        ...(imageUrl ? { imageUrl } : {}),
        ...(normalizedOptions.length > 0 ? { options: normalizedOptions } : {}),
        ...(correctOptionIds[0] ? { correctOptionId: correctOptionIds[0] } : {}),
        ...(correctOptionIds.length > 0 ? { correctOptionIds } : {}),
        ...(explanation ? { explanation } : {}),
        ...(studentAns ? { studentAnswer: studentAns } : {}),
        earnedScore: Math.round(earnedScore * 100) / 100,
        maxScore: Math.round(p1Points * 100) / 100,
        status,
      };
    }

    if (qType === 'part2_true_false') {
      const stMap = key?.statements || {};
      const stExp = key?.statementExplanations || {};
      const baseStatements = Array.isArray(baseQ?.statements) ? baseQ!.statements! : [];
      const fallbackIds =
        baseStatements.length > 0
          ? baseStatements.map((s) => s.id)
          : orderMeta?.statementIds && orderMeta.statementIds.length > 0
          ? orderMeta.statementIds
          : Object.keys(stMap);
      const baseStMap = new Map(baseStatements.map((s) => [s.id, s]));

      const statementsSnapshot = fallbackIds.map((stId) => {
        const baseSt = baseStMap.get(stId);
        const correctVal = stId in stMap ? Boolean(stMap[stId]) : Boolean(baseSt?.correctAnswer);
        const stExplanation = stExp[stId] || baseSt?.explanation;
        return {
          id: stId,
          statement: baseSt?.statement || `Mệnh đề ${stId})`,
          correctAnswer: correctVal,
          ...(stExplanation ? { explanation: stExplanation } : {}),
        };
      });

      const selected = studentAns?.selectedStatements || {};
      let correctStatementsCount = 0;
      let answeredStatementsCount = 0;

      const statementDetails: StatementEvaluationDetail[] = statementsSnapshot.map((st) => {
        const hasChoice = selected[st.id] !== undefined && selected[st.id] !== null;
        const studentChoice = hasChoice ? Boolean(selected[st.id]) : undefined;
        const isStCorrect = Boolean(hasChoice && studentChoice === st.correctAnswer);
        if (hasChoice) answeredStatementsCount++;
        if (isStCorrect) correctStatementsCount++;

        return {
          statementId: st.id,
          statementText: st.statement,
          studentChoice,
          correctAnswer: st.correctAnswer,
          isCorrect: isStCorrect,
          isAnswered: hasChoice,
          ...(st.explanation ? { explanation: st.explanation } : {}),
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
        maxScore = Math.max(statementsSnapshot.length, 1) * p2CustomPoints;
      }

      const isFullyCorrect =
        statementsSnapshot.length > 0 && correctStatementsCount === statementsSnapshot.length;
      const status: QuestionResultStatus =
        answeredStatementsCount === 0
          ? 'unanswered'
          : isFullyCorrect
          ? 'correct'
          : 'incorrect';

      part2Score += earnedScore;
      if (status === 'correct') correctCount++;
      else if (status === 'unanswered') unansweredCount++;
      else wrongCount++;

      return {
        questionId: qId,
        questionCode,
        orderIndex,
        type: qType,
        content,
        ...(imageUrl ? { imageUrl } : {}),
        statements: statementsSnapshot,
        ...(explanation ? { explanation } : {}),
        ...(studentAns ? { studentAnswer: studentAns } : {}),
        statementDetails,
        correctStatementsCount,
        totalStatementsCount: statementsSnapshot.length,
        earnedScore: Math.round(earnedScore * 100) / 100,
        maxScore: Math.round(maxScore * 100) / 100,
        status,
      };
    }

    // part3_short_answer
    const cfg = key?.shortAnswerConfig || baseQ?.shortAnswerConfig;
    const text = (studentAns?.textAnswer || '').trim();
    const isAnswered = text.length > 0;
    const isCorrect = isAnswered && isShortAnswerMatchServer(text, cfg);
    const earnedScore = isCorrect ? p3Points : 0;
    const status: QuestionResultStatus = !isAnswered
      ? 'unanswered'
      : isCorrect
      ? 'correct'
      : 'incorrect';

    part3Score += earnedScore;
    if (status === 'correct') correctCount++;
    else if (status === 'unanswered') unansweredCount++;
    else wrongCount++;

    return {
      questionId: qId,
      questionCode,
      orderIndex,
      type: qType,
      content,
      ...(imageUrl ? { imageUrl } : {}),
      ...(cfg ? { shortAnswerConfig: cfg } : {}),
      ...(explanation ? { explanation } : {}),
      ...(studentAns ? { studentAnswer: studentAns } : {}),
      earnedScore: Math.round(earnedScore * 100) / 100,
      maxScore: Math.round(p3Points * 100) / 100,
      status,
    };
  });

  const rPart1 = Math.round(part1Score * 100) / 100;
  const rPart2 = Math.round(part2Score * 100) / 100;
  const rPart3 = Math.round(part3Score * 100) / 100;
  const computedTotalScore = Math.min(10.0, Math.round((rPart1 + rPart2 + rPart3) * 100) / 100);

  return {
    id: submission.id,
    submissionId: submission.id,
    ...(submission.attemptId ? { attemptId: submission.attemptId } : {}),
    examId: submission.examId || masterExam?.id || '',
    examCode: submission.examCode || masterExam?.code || '',
    ...(submission.publicCode || masterExam?.publicCode || publicExam?.publicCode
      ? { publicCode: submission.publicCode || masterExam?.publicCode || publicExam?.publicCode }
      : {}),
    ...(submission.variantCode ? { variantCode: submission.variantCode } : {}),
    examTitle: submission.examTitle || masterExam?.title || publicExam?.title || `Bài thi ${submission.examCode}`,
    ...(submission.examVersionUpdatedAt || masterExam?.updatedAt || publicExam?.updatedAt
      ? { examVersionUpdatedAt: submission.examVersionUpdatedAt || masterExam?.updatedAt || publicExam?.updatedAt }
      : {}),
    ownerId: submission.ownerId || masterExam?.ownerId || '',
    studentId: submission.studentId,
    studentName: submission.studentName,
    studentClass: submission.studentClass,
    startedAt: submission.startedAt,
    submittedAt: submission.submittedAt,
    durationSeconds: submission.durationSeconds,
    part1Score: submission.gradedByServer ? submission.part1Score : rPart1,
    part2Score: submission.gradedByServer ? submission.part2Score : rPart2,
    part3Score: submission.gradedByServer ? submission.part3Score : rPart3,
    totalScore: submission.gradedByServer ? submission.totalScore : computedTotalScore,
    maxPossibleScore: submission.maxPossibleScore || masterExam?.totalScore || publicExam?.totalScore || 10.0,
    totalQuestions: questionResults.length,
    correctQuestionsCount: correctCount,
    wrongQuestionsCount: wrongCount,
    unansweredQuestionsCount: unansweredCount,
    ...(typeof submission.tabSwitchesCount === 'number'
      ? { tabSwitchesCount: submission.tabSwitchesCount }
      : {}),
    status: submission.status,
    gradedByServer: Boolean(submission.gradedByServer),
    ...(isLegacyReconstructed ? { isLegacyReconstructed: true } : {}),
    capturedAt: submission.submittedAt || new Date().toISOString(),
    questionResults,
  };
}

export function resolveLegacyAnswerPolicy(source: {
  allowAnswerReview?: unknown;
  answerReviewMinScore?: unknown;
  answerReviewEnabledAt?: unknown;
  showAnswersAfterSubmit?: unknown;
}): {
  allowAnswerReview: boolean;
  answerReviewMinScore: number;
  answerReviewEnabledAt: string | null;
} {
  const hasExplicitAllow = typeof source.allowAnswerReview === 'boolean';
  const allowAnswerReview = hasExplicitAllow
    ? (source.allowAnswerReview as boolean)
    : Boolean(source.showAnswersAfterSubmit);

  let answerReviewMinScore: number;
  if (typeof source.answerReviewMinScore === 'number' && Number.isFinite(source.answerReviewMinScore)) {
    answerReviewMinScore = Math.max(0, Math.min(10, Math.round(source.answerReviewMinScore * 100) / 100));
  } else {
    answerReviewMinScore = !hasExplicitAllow && source.showAnswersAfterSubmit === true ? 0 : 8.0;
  }

  const answerReviewEnabledAt =
    typeof source.answerReviewEnabledAt === 'string' && source.answerReviewEnabledAt.trim()
      ? source.answerReviewEnabledAt.trim()
      : null;

  return {
    allowAnswerReview,
    answerReviewMinScore,
    answerReviewEnabledAt,
  };
}

export function evaluateAnswerReviewPolicy(params: {
  allowAnswerReview: boolean;
  answerReviewMinScore: number;
  answerReviewEnabledAt?: string | null;
  verifiedScores: number[];
  nowMs?: number;
}): ExamAnswerReviewCheck {
  const {
    allowAnswerReview,
    answerReviewMinScore,
    answerReviewEnabledAt = null,
    verifiedScores,
    nowMs = Date.now(),
  } = params;

  const minScore = Math.max(0, Math.min(10, Math.round(Number(answerReviewMinScore || 0) * 100) / 100));

  if (!allowAnswerReview) {
    return {
      allowed: false,
      reason: 'disabled',
      minScore,
      enabledAt: answerReviewEnabledAt,
      message: 'Bài thi này hiện không mở chức năng xem đáp án theo cấu hình của giáo viên.',
    };
  }

  if (answerReviewEnabledAt) {
    const enableTimeMs = Date.parse(answerReviewEnabledAt);
    if (Number.isFinite(enableTimeMs) && nowMs < enableTimeMs) {
      const formatted = new Date(enableTimeMs).toLocaleString('vi-VN');
      return {
        allowed: false,
        reason: 'not_yet_enabled',
        minScore,
        enabledAt: answerReviewEnabledAt,
        message: `Đáp án & lời giải chưa đến thời điểm công bố. Thời gian mở: ${formatted}.`,
      };
    }
  }

  if (!Array.isArray(verifiedScores) || verifiedScores.length === 0) {
    return {
      allowed: false,
      reason: 'no_submission',
      minScore,
      enabledAt: answerReviewEnabledAt,
      message: 'Bạn cần hoàn thành và nộp bài thi hợp lệ trước khi xem đáp án.',
    };
  }

  const bestScore = Math.max(...verifiedScores.map((s) => Math.round(Number(s || 0) * 100) / 100));
  const bestScaled = Math.round(bestScore * 100);
  const minScaled = Math.round(minScore * 100);

  if (bestScaled < minScaled) {
    return {
      allowed: false,
      reason: 'below_min_score',
      score: bestScore,
      minScore,
      enabledAt: answerReviewEnabledAt,
      message: `Bạn đạt ${bestScore.toFixed(2)}/10 điểm. Điểm sàn để được xem đáp án là ${minScore.toFixed(
        1
      )} điểm. Bạn chưa đủ điều kiện xem đáp án của bài thi này.`,
    };
  }

  return {
    allowed: true,
    reason: 'allowed',
    score: bestScore,
    minScore,
    enabledAt: answerReviewEnabledAt,
    message: `Chúc mừng! Bạn đạt ${bestScore.toFixed(2)}/10 điểm (đạt điểm sàn ≥ ${minScore.toFixed(
      1
    )} điểm) và được phép xem đáp án & lời giải chi tiết.`,
  };
}

export function sanitizeAnswerMapForReview(
  answerMap: Record<string, ServerAnswerKeyEntry>,
  includeSolutions: boolean
): Record<string, ServerAnswerKeyEntry> {
  const out: Record<string, ServerAnswerKeyEntry> = {};
  for (const [qId, entry] of Object.entries(answerMap || {})) {
    const clean: ServerAnswerKeyEntry = { type: entry.type };
    if (entry.correctOptionId) clean.correctOptionId = entry.correctOptionId;
    if (Array.isArray(entry.correctOptionIds) && entry.correctOptionIds.length > 0) {
      clean.correctOptionIds = entry.correctOptionIds;
    }
    if (entry.statements) clean.statements = entry.statements;
    if (entry.shortAnswerConfig) clean.shortAnswerConfig = entry.shortAnswerConfig;
    if (includeSolutions) {
      if (entry.explanation) clean.explanation = entry.explanation;
      if (entry.statementExplanations) clean.statementExplanations = entry.statementExplanations;
    }
    out[qId] = clean;
  }
  return out;
}

export function stripSecretsFromExamForClient(exam: Exam): Exam {
  return {
    ...exam,
    questions: sanitizeQuestionsForClient(exam.questions || []),
    showAnswersAfterSubmit: false,
  };
}
