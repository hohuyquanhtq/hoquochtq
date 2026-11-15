import {
  Exam,
  ExamAnswerReviewCheck,
  StudentAnswer,
  StudentSubmission,
} from '../types';
import { auth, AnswerKeyEntry } from './firebase';
import { normalizeExamCode } from '../utils/urlHelper';

function accessStorageKey(examCode: string, uid: string): string {
  return `hqtest_exam_access_${normalizeExamCode(examCode)}_${uid}`;
}

export function getStoredExamAccessToken(examCode: string, uid?: string): string {
  const cleanCode = normalizeExamCode(examCode);
  const targetUid = (uid || auth?.currentUser?.uid || '').trim();
  if (!cleanCode || !targetUid || typeof window === 'undefined' || !window.sessionStorage) {
    return '';
  }
  try {
    return window.sessionStorage.getItem(accessStorageKey(cleanCode, targetUid)) || '';
  } catch {
    return '';
  }
}

export function saveStoredExamAccessToken(examCode: string, uid: string, token: string): void {
  const cleanCode = normalizeExamCode(examCode);
  if (!cleanCode || !uid || !token || typeof window === 'undefined' || !window.sessionStorage) {
    return;
  }
  try {
    window.sessionStorage.setItem(accessStorageKey(cleanCode, uid), token);
  } catch {
    // ignore storage limits
  }
}

export function clearStoredExamAccessToken(examCode: string, uid?: string): void {
  const cleanCode = normalizeExamCode(examCode);
  const targetUid = (uid || auth?.currentUser?.uid || '').trim();
  if (!cleanCode || !targetUid || typeof window === 'undefined' || !window.sessionStorage) {
    return;
  }
  try {
    window.sessionStorage.removeItem(accessStorageKey(cleanCode, targetUid));
  } catch {
    // ignore
  }
}

async function getIdTokenHeader(): Promise<Record<string, string>> {
  const user = auth?.currentUser;
  if (!user) return {};
  try {
    const token = await user.getIdToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

export interface ConfigureExamSecurityParams {
  examCode: string;
  examId: string;
  requiresPassword: boolean;
  passwordAction: 'set' | 'keep' | 'clear';
  password?: string;
  allowAnswerReview: boolean;
  answerReviewMinScore: number;
  answerReviewEnabledAt: string | null;
  showScoreAfterSubmit?: boolean;
  showSolutionsAfterSubmit?: boolean;
  isPublished?: boolean;
  openAt?: string | null;
  closeAt?: string | null;
  maxAttempts?: number;
  rules?: Exam['rules'];
  questions?: Array<{ id: string; type: Exam['questions'][number]['type']; statementIds?: string[] }>;
  answerMap?: Record<string, AnswerKeyEntry>;
  patchMetadataDocs?: boolean;
}

export async function configureExamSecurityOnServer(
  params: ConfigureExamSecurityParams
): Promise<{ ok: boolean; error?: string; code?: string; passwordUpdatedAt?: string | null }> {
  const headers = await getIdTokenHeader();
  if (!headers.Authorization) {
    return { ok: false, error: 'Bạn cần đăng nhập tài khoản giáo viên để lưu cấu hình bảo mật.' };
  }

  try {
    const res = await fetch('/api/exams/security/configure', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body: JSON.stringify(params),
    });
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
      code?: string;
      passwordUpdatedAt?: string | null;
    };
    if (!res.ok || !data.ok) {
      return {
        ok: false,
        error: data.error || `Lỗi cấu hình bảo mật đề thi (${res.status}).`,
        code: data.code,
      };
    }
    return {
      ok: true,
      passwordUpdatedAt: data.passwordUpdatedAt ?? null,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Không thể kết nối máy chủ cấu hình bảo mật.',
    };
  }
}

export async function verifyExamPasswordOnServer(
  examCode: string,
  password: string
): Promise<{
  ok: boolean;
  exam?: Exam;
  accessToken?: string;
  error?: string;
  code?: string;
  retryAfterSeconds?: number;
  remainingAttempts?: number;
}> {
  const headers = await getIdTokenHeader();
  if (!headers.Authorization) {
    return {
      ok: false,
      code: 'UNAUTHENTICATED',
      error: 'Vui lòng đăng nhập tài khoản học sinh trước khi xác thực mật khẩu đề thi.',
    };
  }

  try {
    const res = await fetch('/api/exams/verify-password', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body: JSON.stringify({ examCode: normalizeExamCode(examCode), password }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      exam?: Exam;
      accessToken?: string;
      error?: string;
      code?: string;
      retryAfterSeconds?: number;
      remainingAttempts?: number;
    };
    if (!res.ok || !data.ok || !data.exam) {
      return {
        ok: false,
        error: data.error || 'Mật khẩu đề thi không chính xác. Vui lòng kiểm tra lại.',
        code: data.code,
        retryAfterSeconds: data.retryAfterSeconds,
        remainingAttempts: data.remainingAttempts,
      };
    }

    const uid = auth?.currentUser?.uid;
    if (uid && data.accessToken) {
      saveStoredExamAccessToken(examCode, uid, data.accessToken);
    }

    return {
      ok: true,
      exam: data.exam,
      accessToken: data.accessToken,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Không thể xác thực mật khẩu đề thi.',
    };
  }
}

export async function accessExamQuestionsOnServer(examCode: string): Promise<{
  authorized: boolean;
  status?: string;
  code?: string;
  exam?: Exam;
  error?: string;
}> {
  const headers = await getIdTokenHeader();
  if (!headers.Authorization) {
    return { authorized: false, status: 'password_required' };
  }

  const cleanCode = normalizeExamCode(examCode);
  const accessToken = getStoredExamAccessToken(cleanCode);

  try {
    const res = await fetch('/api/exams/access-questions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body: JSON.stringify({ examCode: cleanCode, accessToken }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      authorized?: boolean;
      status?: string;
      code?: string;
      exam?: Exam;
      error?: string;
    };
    if (!res.ok || !data.authorized || !data.exam) {
      if (data.status === 'password_required') {
        clearStoredExamAccessToken(cleanCode);
      }
      return {
        authorized: false,
        status: data.status || 'password_required',
        code: data.code,
        error: data.error,
      };
    }
    return {
      authorized: true,
      exam: data.exam,
    };
  } catch {
    return { authorized: false, status: 'network_error' };
  }
}

export async function submitAndGradeExamOnServer(params: {
  submissionId: string;
  examCode: string;
  examTitle?: string;
  variantCode?: string;
  studentName: string;
  studentClass: string;
  startedAt: string;
  durationSeconds: number;
  answers: Record<string, StudentAnswer>;
  tabSwitchesCount: number;
  status: 'completed' | 'timed_out';
}): Promise<{
  ok: boolean;
  submission?: StudentSubmission;
  answerReviewCheck?: ExamAnswerReviewCheck;
  error?: string;
  code?: string;
}> {
  const headers = await getIdTokenHeader();
  const cleanCode = normalizeExamCode(params.examCode);
  const accessToken = getStoredExamAccessToken(cleanCode);

  try {
    const res = await fetch('/api/exams/submit-and-grade', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body: JSON.stringify({
        ...params,
        examCode: cleanCode,
        accessToken,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      submission?: StudentSubmission;
      answerReviewCheck?: ExamAnswerReviewCheck;
      error?: string;
      code?: string;
    };
    if (!res.ok || !data.ok || !data.submission) {
      return {
        ok: false,
        error: data.error || `Không thể nộp và chấm điểm bài thi (${res.status}).`,
        code: data.code,
      };
    }
    return {
      ok: true,
      submission: data.submission,
      answerReviewCheck: data.answerReviewCheck,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Lỗi kết nối máy chủ khi nộp bài.',
    };
  }
}

export async function requestAnswerReviewOnServer(examCode: string): Promise<
  ExamAnswerReviewCheck & {
    answerMap?: Record<string, AnswerKeyEntry>;
    showSolutionsAfterSubmit?: boolean;
    exam?: Exam;
    code?: string;
  }
> {
  const headers = await getIdTokenHeader();
  if (!headers.Authorization) {
    return {
      allowed: false,
      reason: 'unauthenticated',
      message: 'Vui lòng đăng nhập tài khoản học sinh để kiểm tra điều kiện và xem đáp án.',
    };
  }

  const cleanCode = normalizeExamCode(examCode);
  const accessToken = getStoredExamAccessToken(cleanCode);

  try {
    const res = await fetch('/api/exams/request-answer-review', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body: JSON.stringify({ examCode: cleanCode, accessToken }),
    });
    const data = (await res.json().catch(() => ({}))) as ExamAnswerReviewCheck & {
      answerMap?: Record<string, AnswerKeyEntry>;
      showSolutionsAfterSubmit?: boolean;
      exam?: Exam;
      code?: string;
    };
    return {
      allowed: Boolean(data.allowed),
      reason: data.reason || (res.ok ? 'allowed' : 'access_denied'),
      score: data.score,
      minScore: data.minScore,
      enabledAt: data.enabledAt ?? null,
      message: data.message,
      answerMap: data.answerMap,
      showSolutionsAfterSubmit: data.showSolutionsAfterSubmit,
      exam: data.exam,
      code: data.code,
    };
  } catch {
    return {
      allowed: false,
      reason: 'server_unavailable',
      message: 'Không thể kết nối máy chủ để xác thực quyền xem đáp án. Vui lòng thử lại.',
    };
  }
}

export function getEffectiveAnswerReviewConfig(exam?: Partial<Exam> | null): {
  allowAnswerReview: boolean;
  answerReviewMinScore: number;
  answerReviewEnabledAt: string | null;
} {
  if (!exam) {
    return { allowAnswerReview: false, answerReviewMinScore: 8.0, answerReviewEnabledAt: null };
  }
  const hasExplicit = typeof exam.allowAnswerReview === 'boolean';
  const allowAnswerReview = hasExplicit
    ? (exam.allowAnswerReview as boolean)
    : Boolean(exam.showAnswersAfterSubmit);

  const answerReviewMinScore =
    typeof exam.answerReviewMinScore === 'number' && Number.isFinite(exam.answerReviewMinScore)
      ? Math.max(0, Math.min(10, Math.round(exam.answerReviewMinScore * 100) / 100))
      : !hasExplicit && exam.showAnswersAfterSubmit === true
      ? 0
      : 8.0;

  const answerReviewEnabledAt =
    typeof exam.answerReviewEnabledAt === 'string' && exam.answerReviewEnabledAt.trim()
      ? exam.answerReviewEnabledAt.trim()
      : null;

  return { allowAnswerReview, answerReviewMinScore, answerReviewEnabledAt };
}

export function evaluateLocalAnswerReviewPolicy(
  exam: Exam | undefined,
  score: number,
  nowMs: number = Date.now()
): ExamAnswerReviewCheck {
  const cfg = getEffectiveAnswerReviewConfig(exam);
  const roundedScore = Math.round(Number(score || 0) * 100) / 100;

  if (!cfg.allowAnswerReview) {
    return {
      allowed: false,
      reason: 'disabled',
      score: roundedScore,
      minScore: cfg.answerReviewMinScore,
      enabledAt: cfg.answerReviewEnabledAt,
      message: 'Bài thi này hiện không mở chức năng xem đáp án theo cấu hình của giáo viên.',
    };
  }

  if (cfg.answerReviewEnabledAt) {
    const enableMs = Date.parse(cfg.answerReviewEnabledAt);
    if (Number.isFinite(enableMs) && nowMs < enableMs) {
      return {
        allowed: false,
        reason: 'not_yet_enabled',
        score: roundedScore,
        minScore: cfg.answerReviewMinScore,
        enabledAt: cfg.answerReviewEnabledAt,
        message: `Đáp án & lời giải sẽ được mở vào lúc ${new Date(enableMs).toLocaleString('vi-VN')}.`,
      };
    }
  }

  if (Math.round(roundedScore * 100) < Math.round(cfg.answerReviewMinScore * 100)) {
    return {
      allowed: false,
      reason: 'below_min_score',
      score: roundedScore,
      minScore: cfg.answerReviewMinScore,
      enabledAt: cfg.answerReviewEnabledAt,
      message: `Bạn đạt ${roundedScore.toFixed(2)}/10 điểm. Điểm sàn để được xem đáp án là ${cfg.answerReviewMinScore.toFixed(
        1
      )} điểm. Bạn chưa đủ điều kiện xem đáp án của bài thi này.`,
    };
  }

  return {
    allowed: true,
    reason: 'allowed',
    score: roundedScore,
    minScore: cfg.answerReviewMinScore,
    enabledAt: cfg.answerReviewEnabledAt,
    message: `Chúc mừng! Bạn đạt ${roundedScore.toFixed(2)}/10 điểm (đạt điểm sàn ≥ ${cfg.answerReviewMinScore.toFixed(
      1
    )} điểm).`,
  };
}
