import {
  Exam,
  ExamAnswerReviewCheck,
  StudentAnswer,
  StudentSubmission,
} from '../types';
import { auth, AnswerKeyEntry } from './firebase';
import { normalizeExamCode, normalizePublicExamCode } from '../utils/urlHelper';

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

async function parseApiResponsePayload(res: Response): Promise<{
  data: Record<string, unknown>;
  isHtml: boolean;
  rawText: string;
}> {
  const rawText = await res.text().catch(() => '');
  const trimmed = rawText.trim();
  const isHtml =
    trimmed.startsWith('<!doctype') ||
    trimmed.startsWith('<!DOCTYPE') ||
    trimmed.startsWith('<html') ||
    trimmed.startsWith('<HTML');
  if (!trimmed || isHtml) {
    return { data: {}, isHtml, rawText: trimmed };
  }
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return { data: parsed as Record<string, unknown>, isHtml: false, rawText: trimmed };
    }
  } catch {
    // non-JSON text
  }
  return { data: {}, isHtml: false, rawText: trimmed };
}

export async function configureExamSecurityOnServer(
  params: ConfigureExamSecurityParams
): Promise<{
  ok: boolean;
  error?: string;
  code?: string;
  errorStage?: string;
  passwordUpdatedAt?: string | null;
}> {
  const headers = await getIdTokenHeader();
  if (!headers.Authorization) {
    return {
      ok: false,
      code: 'AUTH_ERROR',
      errorStage: 'auth_verify_id_token',
      error: '[AUTH_ERROR] Bạn cần đăng nhập tài khoản giáo viên để lưu cấu hình bảo mật.',
    };
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

    const { data, isHtml } = await parseApiResponsePayload(res);
    const serverCode = typeof data.code === 'string' && data.code ? data.code : undefined;
    const serverStage =
      typeof data.errorStage === 'string' && data.errorStage
        ? data.errorStage
        : typeof data.stage === 'string' && data.stage
        ? data.stage
        : undefined;
    const serverError = typeof data.error === 'string' && data.error ? data.error : undefined;

    if (!res.ok || !data.ok) {
      if (res.status === 404 || res.status === 405 || isHtml) {
        return {
          ok: false,
          code: 'API_ROUTE_ERROR',
          errorStage: 'api_route_dispatch',
          error: `[API_ROUTE_ERROR] Không gọi được API /api/exams/security/configure (HTTP ${res.status}). Vui lòng kiểm tra cấu hình Vercel Serverless Functions và redeploy.`,
        };
      }

      const resolvedCode =
        serverCode || (res.status === 401 ? 'AUTH_ERROR' : 'UNKNOWN_ERROR');
      const fallbackMsg =
        res.status === 500 && !serverError
          ? 'Máy chủ Vercel trả lỗi HTTP 500 không kèm JSON (có thể do lỗi khởi chạy Serverless Function trước khi vào handler). Vui lòng kiểm tra /api/health/firebase-admin và Vercel Function Logs.'
          : `Không thể lưu cấu hình bảo mật đề thi (HTTP ${res.status}).`;
      const baseMsg = serverError || fallbackMsg;
      const stageSuffix = serverStage ? ` (giai đoạn: ${serverStage})` : '';
      const hasCodePrefix = baseMsg.includes(`[${resolvedCode}]`);
      return {
        ok: false,
        code: resolvedCode,
        errorStage: serverStage,
        error: `${hasCodePrefix ? '' : `[${resolvedCode}] `}${baseMsg}${stageSuffix}`,
      };
    }
    return {
      ok: true,
      passwordUpdatedAt: (data.passwordUpdatedAt as string | null | undefined) ?? null,
    };
  } catch (err) {
    return {
      ok: false,
      code: 'API_ROUTE_ERROR',
      errorStage: 'network_fetch',
      error: `[API_ROUTE_ERROR] ${
        err instanceof Error ? err.message : 'Không thể kết nối tới /api/exams/security/configure.'
      }`,
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
      code: 'AUTH_ERROR',
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
    const { data, isHtml } = await parseApiResponsePayload(res);
    const typedData = data as {
      ok?: boolean;
      exam?: Exam;
      accessToken?: string;
      error?: string;
      code?: string;
      retryAfterSeconds?: number;
      remainingAttempts?: number;
    };
    if (!res.ok || !typedData.ok || !typedData.exam) {
      if (res.status === 404 || res.status === 405 || isHtml) {
        return {
          ok: false,
          code: 'API_ROUTE_ERROR',
          error: 'Không tìm thấy dịch vụ xác thực mật khẩu đề thi. Vui lòng thử lại sau.',
        };
      }
      return {
        ok: false,
        error: typedData.error || 'Mật khẩu đề thi không chính xác. Vui lòng kiểm tra lại.',
        code: typedData.code,
        retryAfterSeconds: typedData.retryAfterSeconds,
        remainingAttempts: typedData.remainingAttempts,
      };
    }

    const uid = auth?.currentUser?.uid;
    if (uid && typedData.accessToken) {
      saveStoredExamAccessToken(examCode, uid, typedData.accessToken);
    }

    return {
      ok: true,
      exam: typedData.exam,
      accessToken: typedData.accessToken,
    };
  } catch (err) {
    return {
      ok: false,
      code: 'API_ROUTE_ERROR',
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
    return { authorized: false, status: 'password_required', code: 'AUTH_ERROR' };
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
    const { data, isHtml } = await parseApiResponsePayload(res);
    const typedData = data as {
      authorized?: boolean;
      status?: string;
      code?: string;
      exam?: Exam;
      error?: string;
    };
    if (!res.ok || !typedData.authorized || !typedData.exam) {
      if (res.status === 404 || res.status === 405 || isHtml) {
        return {
          authorized: false,
          status: 'server_unavailable',
          code: 'API_ROUTE_ERROR',
          error: 'Không thể kết nối API mở đề thi.',
        };
      }
      if (typedData.status === 'password_required') {
        clearStoredExamAccessToken(cleanCode);
      }
      return {
        authorized: false,
        status: typedData.status || 'password_required',
        code: typedData.code,
        error: typedData.error,
      };
    }
    return {
      authorized: true,
      exam: typedData.exam,
    };
  } catch {
    return { authorized: false, status: 'network_error', code: 'API_ROUTE_ERROR' };
  }
}

export async function submitAndGradeExamOnServer(params: {
  submissionId: string;
  attemptId?: string;
  examCode: string;
  publicCode?: string;
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
    const { data, isHtml } = await parseApiResponsePayload(res);
    const typedData = data as {
      ok?: boolean;
      submission?: StudentSubmission;
      answerReviewCheck?: ExamAnswerReviewCheck;
      error?: string;
      code?: string;
    };
    if (!res.ok || !typedData.ok || !typedData.submission) {
      if (res.status === 404 || res.status === 405 || isHtml) {
        return {
          ok: false,
          code: 'API_ROUTE_ERROR',
          error: 'Không kết nối được dịch vụ nộp và chấm điểm bài thi.',
        };
      }
      return {
        ok: false,
        error: typedData.error || `Không thể nộp và chấm điểm bài thi (${res.status}).`,
        code: typedData.code,
      };
    }
    return {
      ok: true,
      submission: typedData.submission,
      answerReviewCheck: typedData.answerReviewCheck,
    };
  } catch (err) {
    return {
      ok: false,
      code: 'API_ROUTE_ERROR',
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
      code: 'AUTH_ERROR',
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
    const { data, isHtml } = await parseApiResponsePayload(res);
    if (res.status === 404 || res.status === 405 || isHtml) {
      return {
        allowed: false,
        reason: 'server_unavailable',
        code: 'API_ROUTE_ERROR',
        message: 'Không kết nối được dịch vụ kiểm tra điều kiện xem đáp án.',
      };
    }
    const typedData = data as Partial<ExamAnswerReviewCheck> & {
      answerMap?: Record<string, AnswerKeyEntry>;
      showSolutionsAfterSubmit?: boolean;
      exam?: Exam;
      code?: string;
    };
    return {
      allowed: Boolean(typedData.allowed),
      reason: typedData.reason || (res.ok ? 'allowed' : 'access_denied'),
      score: typedData.score,
      minScore: typedData.minScore,
      enabledAt: typedData.enabledAt ?? null,
      message: typedData.message,
      answerMap: typedData.answerMap,
      showSolutionsAfterSubmit: typedData.showSolutionsAfterSubmit,
      exam: typedData.exam,
      code: typedData.code,
    };
  } catch {
    return {
      allowed: false,
      reason: 'server_unavailable',
      code: 'API_ROUTE_ERROR',
      message: 'Không thể kết nối máy chủ để xác thực quyền xem đáp án. Vui lòng thử lại.',
    };
  }
}

export async function allocateExamPublicCodeOnServer(params: {
  examId: string;
  examCode: string;
  isPublished?: boolean;
  existingPublicCode?: string | null;
}): Promise<{
  ok: boolean;
  publicCode?: string;
  alreadyExisted?: boolean;
  error?: string;
  code?: string;
}> {
  const headers = await getIdTokenHeader();
  if (!headers.Authorization) {
    return {
      ok: false,
      code: 'AUTH_ERROR',
      error: '[AUTH_ERROR] Cần đăng nhập tài khoản giáo viên để cấp mã đường dẫn 6 ký tự.',
    };
  }

  try {
    const res = await fetch('/api/exams/allocate-public-code', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body: JSON.stringify({
        examId: params.examId,
        examCode: normalizeExamCode(params.examCode),
        isPublished: params.isPublished !== false,
        ...(params.existingPublicCode ? { existingPublicCode: params.existingPublicCode } : {}),
      }),
    });

    const { data, isHtml } = await parseApiResponsePayload(res);
    if (res.status === 404 || res.status === 405 || isHtml) {
      return {
        ok: false,
        code: 'API_ROUTE_ERROR',
        error: `[API_ROUTE_ERROR] Không gọi được API /api/exams/allocate-public-code (HTTP ${res.status}).`,
      };
    }

    const publicCode = normalizePublicExamCode(
      typeof data.publicCode === 'string' ? data.publicCode : ''
    );
    if (!res.ok || !data.ok || !publicCode) {
      return {
        ok: false,
        code: typeof data.code === 'string' ? data.code : 'EXAM_SAVE_ERROR',
        error:
          typeof data.error === 'string' && data.error
            ? data.error
            : `Không thể cấp mã đường dẫn 6 ký tự cho đề thi (HTTP ${res.status}).`,
      };
    }

    return {
      ok: true,
      publicCode,
      alreadyExisted: Boolean(data.alreadyExisted),
    };
  } catch (err) {
    return {
      ok: false,
      code: 'API_ROUTE_ERROR',
      error:
        err instanceof Error
          ? err.message
          : 'Không thể kết nối máy chủ để cấp mã đường dẫn 6 ký tự.',
    };
  }
}

export async function syncExamLinkStatusOnServer(params: {
  action: 'set_active' | 'delete';
  examId: string;
  examCode: string;
  publicCode?: string | null;
  isActive?: boolean;
}): Promise<{ ok: boolean; error?: string }> {
  const headers = await getIdTokenHeader();
  if (!headers.Authorization) {
    return { ok: false, error: 'Chưa đăng nhập.' };
  }

  try {
    const res = await fetch('/api/exams/sync-link-status', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body: JSON.stringify({
        action: params.action,
        examId: params.examId,
        examCode: normalizeExamCode(params.examCode),
        ...(params.publicCode ? { publicCode: params.publicCode } : {}),
        isActive: Boolean(params.isActive),
      }),
    });
    const { data } = await parseApiResponsePayload(res);
    return {
      ok: Boolean(res.ok && data.ok),
      error: typeof data.error === 'string' ? data.error : undefined,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Network error',
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
