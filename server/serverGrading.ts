import type {
  Exam,
  ExamAnswerReviewCheck,
  ExamRuleScore,
  Question,
  StudentAnswer,
} from '../src/types/index.ts';

export interface ServerAnswerKeyEntry {
  type: Question['type'];
  correctOptionId?: string;
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
  correctQuestionsCount: number;
}

export function normalizeExamCodeServer(rawCode: string): string {
  return (rawCode || '')
    .trim()
    .replace(/^(?:#?\/?(?:c|exam)\/|#)/i, '')
    .replace(/[\s_]/g, '')
    .toUpperCase();
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

  const p1Points = Number(rules?.part1ScorePerQuestion ?? 0.25);
  const p2Model = rules?.part2GradingModel || 'standard_moet';
  const p2CustomPoints = Number(rules?.part2CustomScorePerStatement ?? 0.25);
  const p3Points = Number(rules?.part3ScorePerQuestion ?? 0.25);

  // Iterate over authoritative server question list or answerMap keys so no extra fake question IDs count
  const items: Array<{ id: string; type: Question['type']; statementIds?: string[] }> =
    questionOrder.length > 0
      ? questionOrder
      : Object.entries(answerMap).map(([id, entry]) => ({
          id,
          type: entry.type,
          statementIds: entry.statements ? Object.keys(entry.statements) : undefined,
        }));

  for (const item of items) {
    const key = answerMap[item.id];
    const studentAns = answers?.[item.id];
    if (!key || !studentAns) continue;

    const qType = key.type || item.type;

    if (qType === 'part1_single_choice') {
      if (
        studentAns.selectedOptionId &&
        key.correctOptionId &&
        studentAns.selectedOptionId === key.correctOptionId
      ) {
        part1Score += p1Points;
        correctQuestionsCount++;
      }
    } else if (qType === 'part2_true_false') {
      const stMap = key.statements || {};
      const stIds = item.statementIds && item.statementIds.length > 0 ? item.statementIds : Object.keys(stMap);
      const selected = studentAns.selectedStatements || {};
      let correctStatementsCount = 0;

      for (const stId of stIds) {
        if (
          stId in stMap &&
          selected[stId] !== undefined &&
          Boolean(selected[stId]) === Boolean(stMap[stId])
        ) {
          correctStatementsCount++;
        }
      }

      if (p2Model === 'standard_moet') {
        let qPts = 0;
        if (correctStatementsCount === 1) qPts = 0.1;
        else if (correctStatementsCount === 2) qPts = 0.25;
        else if (correctStatementsCount === 3) qPts = 0.5;
        else if (correctStatementsCount === 4) qPts = 1.0;

        part2Score += qPts;
        if (correctStatementsCount === 4) correctQuestionsCount++;
      } else {
        part2Score += correctStatementsCount * p2CustomPoints;
        if (stIds.length > 0 && correctStatementsCount === stIds.length) {
          correctQuestionsCount++;
        }
      }
    } else if (qType === 'part3_short_answer') {
      const text = (studentAns.textAnswer || '').trim();
      const cfg = key.shortAnswerConfig;

      if (text && cfg) {
        let isCorrect = false;
        const normalizedText = text.toLowerCase().replace(/\s+/g, '');
        const acceptable = Array.isArray(cfg.acceptableAnswers) ? cfg.acceptableAnswers : [];
        const matched = acceptable.some((ans) => {
          const normAns = String(ans).toLowerCase().replace(/\s+/g, '');
          return (
            normAns === normalizedText ||
            normAns.replace(',', '.') === normalizedText.replace(',', '.')
          );
        });

        if (matched) {
          isCorrect = true;
        } else if (cfg.isNumeric) {
          const cleanText = text.replace(',', '.');
          const studentNum = Number.parseFloat(cleanText);
          const targetNum =
            cfg.numericValue !== undefined
              ? cfg.numericValue
              : Number.parseFloat(String(acceptable[0] || '0').replace(',', '.'));
          const tol = cfg.tolerance !== undefined ? cfg.tolerance : 0.05;

          if (Number.isFinite(studentNum) && Number.isFinite(targetNum)) {
            if (Math.abs(studentNum - targetNum) <= tol) {
              isCorrect = true;
            }
          }
        }

        if (isCorrect) {
          part3Score += p3Points;
          correctQuestionsCount++;
        }
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
    correctQuestionsCount,
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
    // Legacy compatibility: exams created before this upgrade that already had showAnswersAfterSubmit = true
    // keep opening answers (floor 0), whereas newly configured exams default to 8.0 in creator/config UI.
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
