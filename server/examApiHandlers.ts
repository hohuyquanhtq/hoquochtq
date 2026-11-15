import type {
  Exam,
  ExamRuleScore,
  Question,
  StudentAnswer,
  StudentSubmission,
} from '../src/types/index.ts';
import {
  hashExamPassword,
  signExamAccessToken,
  signSubmissionGradeDigest,
  verifyExamAccessToken,
  verifyExamPassword,
} from './examCrypto.ts';
import {
  hasServiceAccountConfigured,
  verifyFirebaseIdToken,
  type VerifiedFirebaseIdToken,
} from './firebaseServerAuth.ts';
import {
  firestoreGetDoc,
  firestorePatchFields,
  firestoreQueryEquals,
  firestoreSetDoc,
} from './firestoreRest.ts';
import {
  evaluateAnswerReviewPolicy,
  gradeAnswersOnServer,
  normalizeExamCodeServer,
  resolveLegacyAnswerPolicy,
  sanitizeAnswerMapForReview,
  sanitizeQuestionsForClient,
  type ServerAnswerKeyEntry,
} from './serverGrading.ts';

export interface ApiRequest {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
  ip?: string;
}

export interface ApiResponse {
  status: number;
  body: Record<string, unknown>;
}

export interface ExamSecretRecord {
  examCode: string;
  examId: string;
  ownerId: string;
  requiresPassword: boolean;
  passwordHash: string | null;
  passwordUpdatedAt: string | null;
  allowAnswerReview: boolean;
  answerReviewMinScore: number;
  answerReviewEnabledAt: string | null;
  showScoreAfterSubmit: boolean;
  showAnswersAfterSubmit: boolean;
  showSolutionsAfterSubmit: boolean;
  isPublished: boolean;
  openAt?: string | null;
  closeAt?: string | null;
  maxAttempts: number;
  rules: ExamRuleScore;
  questions: Array<{ id: string; type: Question['type']; statementIds?: string[] }>;
  answerMap: Record<string, ServerAnswerKeyEntry>;
  updatedAt: string;
  serverUpdatedAt?: string;
}

export interface PasswordAttemptRecord {
  failCount: number;
  lockedUntilMs: number;
  lastFailedAt: string;
}

export interface ExamAccessGrantRecord {
  examCode: string;
  uid: string;
  passwordUpdatedAt: string | null;
  grantedAt: string;
  expiresAt: string;
}

export interface ExamSecurityStore {
  hasAdminAccess(): boolean;
  verifyIdToken(token: string): Promise<VerifiedFirebaseIdToken | null>;
  getUserRoleInfo(
    uid: string,
    bearerToken?: string
  ): Promise<{ role?: string; status?: string; isAdmin: boolean }>;
  getExamSecret(examCode: string): Promise<ExamSecretRecord | null>;
  saveExamSecret(
    examCode: string,
    record: ExamSecretRecord,
    bearerToken?: string
  ): Promise<void>;
  patchExamSecretFields?(
    examCode: string,
    fields: Record<string, unknown>,
    bearerToken?: string
  ): Promise<void>;
  getLegacyExamBundle(examCode: string): Promise<{
    examKeys: Record<string, unknown> | null;
    publicExam: Record<string, unknown> | null;
    examStatus: Record<string, unknown> | null;
  }>;
  getExamStatus(examCode: string, bearerToken?: string): Promise<Record<string, unknown> | null>;
  getPublicExam(examCode: string, bearerToken?: string): Promise<Exam | null>;
  getMasterExam(examId: string, bearerToken?: string): Promise<Record<string, unknown> | null>;
  patchExamMetadataDocs(params: {
    examCode: string;
    examId: string;
    fields: Record<string, unknown>;
    bearerToken?: string;
  }): Promise<void>;
  getPasswordAttempt(attemptKey: string): Promise<PasswordAttemptRecord | null>;
  savePasswordAttempt(attemptKey: string, record: PasswordAttemptRecord): Promise<void>;
  getExamAccessGrant(examCode: string, uid: string): Promise<ExamAccessGrantRecord | null>;
  saveExamAccessGrant(record: ExamAccessGrantRecord): Promise<void>;
  saveSubmission(submission: StudentSubmission & { serverUpdatedAt?: string }): Promise<void>;
  listStudentSubmissionsForExam(examCode: string, studentId: string): Promise<StudentSubmission[]>;
  saveAnswerReviewAccess(params: {
    examCode: string;
    uid: string;
    score: number;
    minScore: number;
    grantedAt: string;
  }): Promise<void>;
}

const memoryAttemptFallback = new Map<string, PasswordAttemptRecord>();
const MAX_PASSWORD_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 5 * 60 * 1000;

export function createFirestoreExamSecurityStore(): ExamSecurityStore {
  return {
    hasAdminAccess: () => hasServiceAccountConfigured(),

    verifyIdToken: (token) => verifyFirebaseIdToken(token),

    async getUserRoleInfo(uid, bearerToken) {
      let isAdmin = false;
      let role: string | undefined;
      let status: string | undefined;

      try {
        const adminDoc = await firestoreGetDoc<{ active?: boolean; role?: string; uid?: string }>(
          'admins',
          uid,
          { bearerToken }
        );
        if (adminDoc && adminDoc.active === true && adminDoc.role === 'admin') {
          isAdmin = true;
        }
      } catch {
        // ignore missing admin marker
      }

      try {
        const userDoc = await firestoreGetDoc<{ role?: string; status?: string }>('users', uid, {
          bearerToken,
        });
        if (userDoc) {
          role = userDoc.role;
          status = userDoc.status;
          if (role === 'admin' && status === 'active') {
            isAdmin = true;
          }
        }
      } catch {
        // ignore missing user doc
      }

      return { role, status, isAdmin };
    },

    async getExamSecret(examCode) {
      return firestoreGetDoc<ExamSecretRecord>('examSecrets', examCode);
    },

    async saveExamSecret(examCode, record, bearerToken) {
      await firestoreSetDoc(
        'examSecrets',
        examCode,
        {
          ...record,
          serverUpdatedAt: new Date().toISOString(),
        },
        { bearerToken, serverTimestampFields: ['serverUpdatedAt'] }
      );
    },

    async patchExamSecretFields(examCode, fields, bearerToken) {
      await firestorePatchFields(
        'examSecrets',
        examCode,
        {
          ...fields,
          serverUpdatedAt: new Date().toISOString(),
        },
        { bearerToken, serverTimestampFields: ['serverUpdatedAt'] }
      );
    },

    async getLegacyExamBundle(examCode) {
      const [examKeys, publicExam, examStatus] = await Promise.all([
        firestoreGetDoc<Record<string, unknown>>('examKeys', examCode).catch(() => null),
        firestoreGetDoc<Record<string, unknown>>('publicExams', examCode).catch(() => null),
        firestoreGetDoc<Record<string, unknown>>('examStatus', examCode).catch(() => null),
      ]);
      return { examKeys, publicExam, examStatus };
    },

    async getExamStatus(examCode, bearerToken) {
      return firestoreGetDoc<Record<string, unknown>>('examStatus', examCode, { bearerToken }).catch(
        () => null
      );
    },

    async getPublicExam(examCode, bearerToken) {
      return firestoreGetDoc<Exam>('publicExams', examCode, { bearerToken });
    },

    async getMasterExam(examId, bearerToken) {
      return firestoreGetDoc<Record<string, unknown>>('exams', examId, { bearerToken }).catch(
        () => null
      );
    },

    async patchExamMetadataDocs({ examCode, examId, fields, bearerToken }) {
      const updates: Promise<void>[] = [];
      const statusFields: Record<string, unknown> = {
        requiresPassword: fields.requiresPassword,
        allowAnswerReview: fields.allowAnswerReview,
        answerReviewMinScore: fields.answerReviewMinScore,
        answerReviewEnabledAt: fields.answerReviewEnabledAt,
        showScoreAfterSubmit: fields.showScoreAfterSubmit,
        showSolutionsAfterSubmit: fields.showSolutionsAfterSubmit,
        isPublished: fields.isPublished,
        updatedAt: fields.updatedAt,
      };
      const publicFields: Record<string, unknown> = {
        ...statusFields,
        passwordUpdatedAt: fields.passwordUpdatedAt,
        showAnswersAfterSubmit: fields.allowAnswerReview,
      };
      const keyFields: Record<string, unknown> = {
        allowAnswerReview: fields.allowAnswerReview,
        answerReviewMinScore: fields.answerReviewMinScore,
        answerReviewEnabledAt: fields.answerReviewEnabledAt,
        showAnswersAfterSubmit: fields.allowAnswerReview,
        showSolutionsAfterSubmit: fields.showSolutionsAfterSubmit,
        isPublished: fields.isPublished,
        updatedAt: fields.updatedAt,
      };
      const masterFields: Record<string, unknown> = {
        ...publicFields,
      };

      if (examId) {
        updates.push(
          firestorePatchFields('exams', examId, masterFields, {
            bearerToken,
            serverTimestampFields: ['serverUpdatedAt'],
          }).catch(() => undefined)
        );
      }
      updates.push(
        firestorePatchFields('examStatus', examCode, statusFields, {
          bearerToken,
          serverTimestampFields: ['serverUpdatedAt'],
        }).catch(() => undefined)
      );
      updates.push(
        firestorePatchFields('publicExams', examCode, publicFields, {
          bearerToken,
          serverTimestampFields: ['serverUpdatedAt'],
        }).catch(() => undefined)
      );
      updates.push(
        firestorePatchFields('examKeys', examCode, keyFields, {
          bearerToken,
          serverTimestampFields: ['serverUpdatedAt'],
        }).catch(() => undefined)
      );

      await Promise.all(updates);
    },

    async getPasswordAttempt(attemptKey) {
      try {
        const doc = await firestoreGetDoc<PasswordAttemptRecord>(
          'examPasswordAttempts',
          attemptKey
        );
        if (doc) return doc;
      } catch {
        // Fallback to in-memory map if service account isn't available or network blip
      }
      return memoryAttemptFallback.get(attemptKey) || null;
    },

    async savePasswordAttempt(attemptKey, record) {
      memoryAttemptFallback.set(attemptKey, record);
      try {
        await firestoreSetDoc('examPasswordAttempts', attemptKey, { ...record });
      } catch {
        // Non-fatal fallback stored in memory
      }
    },

    async getExamAccessGrant(examCode, uid) {
      const grantId = `${examCode}_${uid}`;
      return firestoreGetDoc<ExamAccessGrantRecord>('examAccessGrants', grantId).catch(() => null);
    },

    async saveExamAccessGrant(record) {
      const grantId = `${record.examCode}_${record.uid}`;
      await firestoreSetDoc('examAccessGrants', grantId, { ...record });
    },

    async saveSubmission(submission) {
      const safeId = submission.id.replace(/[^a-zA-Z0-9_-]/g, '_');
      await firestoreSetDoc(
        'submissions',
        safeId,
        { ...submission },
        { serverTimestampFields: ['createdAt'] }
      );
    },

    async listStudentSubmissionsForExam(examCode, studentId) {
      return firestoreQueryEquals<StudentSubmission>('submissions', [
        { field: 'examCode', value: examCode },
        { field: 'studentId', value: studentId },
      ]);
    },

    async saveAnswerReviewAccess(params) {
      const docId = `${params.examCode}_${params.uid}`;
      await firestoreSetDoc('answerReviewAccess', docId, { ...params }).catch(() => undefined);
    },
  };
}

function getHeader(headers: ApiRequest['headers'], name: string): string {
  const lower = name.toLowerCase();
  for (const [k, v] of Object.entries(headers || {})) {
    if (k.toLowerCase() === lower) {
      return Array.isArray(v) ? String(v[0] || '') : String(v || '');
    }
  }
  return '';
}

function extractBearerToken(req: ApiRequest): string {
  const auth = getHeader(req.headers, 'authorization').trim();
  if (!auth.toLowerCase().startsWith('bearer ')) return '';
  return auth.slice(7).trim();
}

function validateSafeDocCode(code: string): boolean {
  return Boolean(code) && code.length >= 2 && code.length <= 32 && /^[A-Z0-9-]+$/.test(code);
}

function isWithinExamSchedule(secret: { openAt?: string | null; closeAt?: string | null }, nowMs: number): {
  ok: boolean;
  reason?: string;
} {
  if (secret.openAt) {
    const openMs = Date.parse(secret.openAt);
    if (Number.isFinite(openMs) && nowMs < openMs) {
      return {
        ok: false,
        reason: `Bài thi chưa đến giờ mở phòng. Thời gian bắt đầu: ${new Date(openMs).toLocaleString('vi-VN')}`,
      };
    }
  }
  if (secret.closeAt) {
    const closeMs = Date.parse(secret.closeAt);
    if (Number.isFinite(closeMs) && nowMs > closeMs) {
      return {
        ok: false,
        reason: `Bài thi đã hết thời hạn tham gia lúc: ${new Date(closeMs).toLocaleString('vi-VN')}`,
      };
    }
  }
  return { ok: true };
}

async function resolveAuthoritativeExamSecret(
  store: ExamSecurityStore,
  examCode: string
): Promise<ExamSecretRecord | null> {
  const secret = await store.getExamSecret(examCode).catch((err) => {
    if (err instanceof Error && err.message === 'SERVER_CREDENTIALS_MISSING') {
      throw err;
    }
    return null;
  });
  if (secret) return secret;

  // Backward compatibility for legacy exams synced before examSecrets existed
  const { examKeys, publicExam, examStatus } = await store.getLegacyExamBundle(examCode);
  if (!examKeys && !publicExam) {
    return null;
  }

  const pubQuestions = Array.isArray(publicExam?.questions) ? (publicExam.questions as Question[]) : [];
  const policy = resolveLegacyAnswerPolicy({
    allowAnswerReview:
      publicExam?.allowAnswerReview ?? examKeys?.allowAnswerReview ?? examStatus?.allowAnswerReview,
    answerReviewMinScore:
      publicExam?.answerReviewMinScore ??
      examKeys?.answerReviewMinScore ??
      examStatus?.answerReviewMinScore,
    answerReviewEnabledAt:
      publicExam?.answerReviewEnabledAt ??
      examKeys?.answerReviewEnabledAt ??
      examStatus?.answerReviewEnabledAt,
    showAnswersAfterSubmit:
      examKeys?.showAnswersAfterSubmit ?? publicExam?.showAnswersAfterSubmit,
  });

  return {
    examCode,
    examId: String(publicExam?.id || examKeys?.examId || examStatus?.examId || examCode),
    ownerId: String(publicExam?.ownerId || examKeys?.ownerId || examStatus?.ownerId || ''),
    requiresPassword: Boolean(publicExam?.requiresPassword ?? examStatus?.requiresPassword ?? false),
    passwordHash: null,
    passwordUpdatedAt: (publicExam?.passwordUpdatedAt as string | null) ?? null,
    allowAnswerReview: policy.allowAnswerReview,
    answerReviewMinScore: policy.answerReviewMinScore,
    answerReviewEnabledAt: policy.answerReviewEnabledAt,
    showScoreAfterSubmit: Boolean(publicExam?.showScoreAfterSubmit ?? true),
    showAnswersAfterSubmit: policy.allowAnswerReview,
    showSolutionsAfterSubmit: Boolean(
      examKeys?.showSolutionsAfterSubmit ?? publicExam?.showSolutionsAfterSubmit ?? false
    ),
    isPublished: Boolean(publicExam?.isPublished ?? examKeys?.isPublished ?? examStatus?.isPublished ?? false),
    openAt: (publicExam?.openAt as string | undefined) || (examStatus?.openAt as string | undefined) || null,
    closeAt: (publicExam?.closeAt as string | undefined) || (examStatus?.closeAt as string | undefined) || null,
    maxAttempts: Number(publicExam?.maxAttempts ?? 1),
    rules: (publicExam?.rules as ExamRuleScore) || {
      part1ScorePerQuestion: 0.25,
      part2GradingModel: 'standard_moet',
      part3ScorePerQuestion: 0.25,
      totalTargetScore: 10.0,
    },
    questions: pubQuestions.map((q) => ({
      id: q.id,
      type: q.type,
      ...(Array.isArray(q.statements) ? { statementIds: q.statements.map((s) => s.id) } : {}),
    })),
    answerMap: (examKeys?.answerMap as Record<string, ServerAnswerKeyEntry>) || {},
    updatedAt: String(publicExam?.updatedAt || examKeys?.updatedAt || new Date().toISOString()),
  };
}

function isGrantValidForSecret(
  grant: ExamAccessGrantRecord | null,
  secret: ExamSecretRecord,
  nowMs: number
): boolean {
  if (!grant) return false;
  if (grant.examCode !== secret.examCode) return false;
  const expMs = Date.parse(grant.expiresAt);
  if (!Number.isFinite(expMs) || expMs <= nowMs) return false;
  if (secret.passwordUpdatedAt && grant.passwordUpdatedAt !== secret.passwordUpdatedAt) {
    return false;
  }
  return true;
}

export function createExamApiHandlers(store: ExamSecurityStore = createFirestoreExamSecurityStore()) {
  /**
   * 1. POST /api/exams/security/configure
   * Authenticated teacher owner (or admin) configures exam password & floor-score answer settings.
   */
  async function handleConfigureExamSecurity(req: ApiRequest): Promise<ApiResponse> {
    if (req.method !== 'POST') {
      return { status: 405, body: { error: 'Phương thức không hợp lệ.' } };
    }

    const bearer = extractBearerToken(req);
    const caller = await store.verifyIdToken(bearer);
    if (!caller) {
      return { status: 401, body: { error: 'Vui lòng đăng nhập tài khoản giáo viên hợp lệ.' } };
    }

    const body = (req.body || {}) as Record<string, unknown>;
    const examCode = normalizeExamCodeServer(String(body.examCode || ''));
    const examId = String(body.examId || '').replace(/[^a-zA-Z0-9_-]/g, '_');

    if (!validateSafeDocCode(examCode) || !examId) {
      return { status: 400, body: { error: 'Mã đề thi hoặc ID đề thi không hợp lệ.' } };
    }

    const roleInfo = await store.getUserRoleInfo(caller.uid, bearer);
    const isTeacher = roleInfo.isAdmin || (roleInfo.role === 'teacher' && roleInfo.status === 'active');
    if (!isTeacher) {
      return {
        status: 403,
        body: { error: 'Chỉ tài khoản giáo viên đang hoạt động hoặc quản trị viên mới có quyền cấu hình bảo mật đề thi.' },
      };
    }

    // Verify ownership against existing exam records if present
    let existingSecret: ExamSecretRecord | null = null;
    if (store.hasAdminAccess()) {
      existingSecret = await store.getExamSecret(examCode).catch(() => null);
    }
    const existingStatus = await store.getExamStatus(examCode, bearer);
    const existingMaster = await store.getMasterExam(examId, bearer);
    const existingOwner = String(
      existingSecret?.ownerId || existingMaster?.ownerId || existingStatus?.ownerId || caller.uid
    );

    if (!roleInfo.isAdmin && existingOwner !== caller.uid) {
      return { status: 403, body: { error: 'Bạn không phải chủ sở hữu của đề thi này.' } };
    }

    const requiresPassword = Boolean(body.requiresPassword);
    const passwordAction = String(
      body.passwordAction || (requiresPassword ? 'set' : 'clear')
    ) as 'set' | 'keep' | 'clear';
    const rawPassword = typeof body.password === 'string' ? body.password : '';

    // Validate answer review parameters
    const allowAnswerReview =
      typeof body.allowAnswerReview === 'boolean' ? body.allowAnswerReview : true;
    const rawMinScore = Number(body.answerReviewMinScore ?? 8.0);
    if (!Number.isFinite(rawMinScore) || rawMinScore < 0 || rawMinScore > 10) {
      return {
        status: 400,
        body: { error: 'Điểm sàn xem đáp án phải nằm trong khoảng từ 0.0 đến 10.0 điểm.' },
      };
    }
    const answerReviewMinScore = Math.round(rawMinScore * 100) / 100;

    let answerReviewEnabledAt: string | null = null;
    if (typeof body.answerReviewEnabledAt === 'string' && body.answerReviewEnabledAt.trim()) {
      const parsedMs = Date.parse(body.answerReviewEnabledAt.trim());
      if (!Number.isFinite(parsedMs)) {
        return { status: 400, body: { error: 'Thời điểm mở xem đáp án không hợp lệ.' } };
      }
      answerReviewEnabledAt = new Date(parsedMs).toISOString();
    }

    const nowIso = new Date().toISOString();
    let finalPasswordHash: string | null = existingSecret?.passwordHash || null;
    let finalPasswordUpdatedAt: string | null = existingSecret?.passwordUpdatedAt || null;

    if (!requiresPassword || passwordAction === 'clear') {
      finalPasswordHash = null;
      finalPasswordUpdatedAt = nowIso;
    } else if (passwordAction === 'set') {
      if (rawPassword.length < 6) {
        return {
          status: 400,
          body: { error: 'Mật khẩu đề thi phải có ít nhất 6 ký tự.' },
        };
      }
      finalPasswordHash = hashExamPassword(rawPassword);
      finalPasswordUpdatedAt = nowIso;
    } else if (passwordAction === 'keep') {
      if (!finalPasswordHash && store.hasAdminAccess()) {
        return {
          status: 400,
          body: { error: 'Đề thi chưa có mật khẩu trước đó. Vui lòng nhập mật khẩu mới (tối thiểu 6 ký tự).' },
        };
      }
    }

    // Build question order & answerMap either from payload or existing records
    const payloadAnswerMap =
      body.answerMap && typeof body.answerMap === 'object'
        ? (body.answerMap as Record<string, ServerAnswerKeyEntry>)
        : undefined;
    const payloadQuestions = Array.isArray(body.questions)
      ? (body.questions as Array<{ id: string; type: Question['type']; statementIds?: string[] }>)
      : undefined;

    const finalQuestions =
      payloadQuestions && payloadQuestions.length > 0
        ? payloadQuestions
        : existingSecret?.questions ||
          (Array.isArray(existingMaster?.questions)
            ? (existingMaster.questions as Question[]).map((q) => ({
                id: q.id,
                type: q.type,
                ...(Array.isArray(q.statements) ? { statementIds: q.statements.map((s) => s.id) } : {}),
              }))
            : []);

    const finalAnswerMap =
      payloadAnswerMap && Object.keys(payloadAnswerMap).length > 0
        ? payloadAnswerMap
        : existingSecret?.answerMap || {};

    const finalRules =
      (body.rules && typeof body.rules === 'object' ? (body.rules as ExamRuleScore) : undefined) ||
      existingSecret?.rules ||
      (existingMaster?.rules as ExamRuleScore) || {
        part1ScorePerQuestion: 0.25,
        part2GradingModel: 'standard_moet',
        part3ScorePerQuestion: 0.25,
        totalTargetScore: 10.0,
      };

    const isPublished =
      typeof body.isPublished === 'boolean'
        ? body.isPublished
        : existingSecret?.isPublished ?? Boolean(existingMaster?.isPublished ?? true);
    const showScoreAfterSubmit =
      typeof body.showScoreAfterSubmit === 'boolean'
        ? body.showScoreAfterSubmit
        : existingSecret?.showScoreAfterSubmit ?? Boolean(existingMaster?.showScoreAfterSubmit ?? true);
    const showSolutionsAfterSubmit =
      typeof body.showSolutionsAfterSubmit === 'boolean'
        ? body.showSolutionsAfterSubmit
        : existingSecret?.showSolutionsAfterSubmit ?? Boolean(existingMaster?.showSolutionsAfterSubmit ?? true);
    const maxAttempts =
      typeof body.maxAttempts === 'number'
        ? Math.max(0, Math.min(1000, body.maxAttempts))
        : existingSecret?.maxAttempts ?? Number(existingMaster?.maxAttempts ?? 1);

    const secretRecord: ExamSecretRecord = {
      examCode,
      examId,
      ownerId: existingOwner,
      requiresPassword,
      passwordHash: finalPasswordHash,
      passwordUpdatedAt: finalPasswordUpdatedAt,
      allowAnswerReview,
      answerReviewMinScore,
      answerReviewEnabledAt,
      showScoreAfterSubmit,
      showAnswersAfterSubmit: allowAnswerReview,
      showSolutionsAfterSubmit,
      isPublished,
      openAt:
        typeof body.openAt === 'string'
          ? body.openAt
          : existingSecret?.openAt ?? (existingMaster?.openAt as string | null) ?? null,
      closeAt:
        typeof body.closeAt === 'string'
          ? body.closeAt
          : existingSecret?.closeAt ?? (existingMaster?.closeAt as string | null) ?? null,
      maxAttempts,
      rules: finalRules,
      questions: finalQuestions,
      answerMap: finalAnswerMap,
      updatedAt: nowIso,
    };

    try {
      if (
        !store.hasAdminAccess() &&
        requiresPassword &&
        passwordAction === 'keep' &&
        store.patchExamSecretFields
      ) {
        const patchPayload: Record<string, unknown> = {
          requiresPassword,
          allowAnswerReview,
          answerReviewMinScore,
          answerReviewEnabledAt,
          showScoreAfterSubmit,
          showAnswersAfterSubmit: allowAnswerReview,
          showSolutionsAfterSubmit,
          isPublished,
          maxAttempts,
          rules: finalRules,
          ...(finalQuestions.length > 0 ? { questions: finalQuestions } : {}),
          ...(Object.keys(finalAnswerMap).length > 0 ? { answerMap: finalAnswerMap } : {}),
          updatedAt: nowIso,
        };
        await store.patchExamSecretFields(examCode, patchPayload, bearer);
      } else {
        await store.saveExamSecret(examCode, secretRecord, bearer);
      }
      if (body.patchMetadataDocs !== false) {
        await store.patchExamMetadataDocs({
          examCode,
          examId,
          bearerToken: bearer,
          fields: {
            requiresPassword,
            passwordUpdatedAt: finalPasswordUpdatedAt,
            allowAnswerReview,
            answerReviewMinScore,
            answerReviewEnabledAt,
            showScoreAfterSubmit,
            showSolutionsAfterSubmit,
            isPublished,
            updatedAt: nowIso,
          },
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === 'SERVER_CREDENTIALS_MISSING') {
        return {
          status: 503,
          body: {
            error:
              'Máy chủ chưa cấu hình FIREBASE_SERVICE_ACCOUNT_JSON để lưu cấu hình bảo mật phía server.',
            code: 'SERVER_CREDENTIALS_MISSING',
          },
        };
      }
      return { status: 500, body: { error: `Không thể lưu cấu hình bảo mật: ${msg}` } };
    }

    return {
      status: 200,
      body: {
        ok: true,
        examCode,
        requiresPassword,
        passwordUpdatedAt: finalPasswordUpdatedAt,
        allowAnswerReview,
        answerReviewMinScore,
        answerReviewEnabledAt,
      },
    };
  }

  /**
   * 2. POST /api/exams/verify-password
   * Verifies exam password with scrypt + rate limiting, grants per-user-per-exam access token,
   * and returns sanitized student questions (NEVER keys/answers/password hashes).
   */
  async function handleVerifyExamPassword(req: ApiRequest): Promise<ApiResponse> {
    if (req.method !== 'POST') {
      return { status: 405, body: { error: 'Phương thức không hợp lệ.' } };
    }

    const bearer = extractBearerToken(req);
    const caller = await store.verifyIdToken(bearer);
    if (!caller) {
      return {
        status: 401,
        body: {
          error: 'Vui lòng đăng nhập tài khoản học sinh để xác thực mật khẩu vào thi.',
          code: 'UNAUTHENTICATED',
        },
      };
    }

    if (!store.hasAdminAccess()) {
      return {
        status: 503,
        body: {
          error:
            'Máy chủ chưa cấu hình FIREBASE_SERVICE_ACCOUNT_JSON để xác thực mật khẩu đề thi an toàn.',
          code: 'SERVER_CREDENTIALS_MISSING',
        },
      };
    }

    const body = (req.body || {}) as Record<string, unknown>;
    const examCode = normalizeExamCodeServer(String(body.examCode || ''));
    const password = typeof body.password === 'string' ? body.password : '';

    if (!validateSafeDocCode(examCode)) {
      return { status: 400, body: { error: 'Mã bài thi không hợp lệ.' } };
    }
    if (!password) {
      return {
        status: 400,
        body: { error: 'Vui lòng nhập mật khẩu đề thi.' },
      };
    }

    const secret = await resolveAuthoritativeExamSecret(store, examCode);
    if (!secret) {
      return { status: 404, body: { error: `Không tìm thấy đề thi với mã "${examCode}".` } };
    }
    if (!secret.isPublished) {
      return {
        status: 403,
        body: { error: 'Phòng thi hiện đang tạm đóng hoặc chưa được giáo viên mở.' },
      };
    }

    const nowMs = Date.now();
    const sched = isWithinExamSchedule(secret, nowMs);
    if (!sched.ok) {
      return { status: 403, body: { error: sched.reason || 'Ngoài thời gian mở đề thi.' } };
    }

    const attemptKey = `${examCode}_${caller.uid}`;
    const existingAttempt = await store.getPasswordAttempt(attemptKey);
    if (existingAttempt && existingAttempt.lockedUntilMs > nowMs) {
      const waitSec = Math.ceil((existingAttempt.lockedUntilMs - nowMs) / 1000);
      const mins = Math.floor(waitSec / 60);
      const secs = waitSec % 60;
      return {
        status: 429,
        body: {
          error: `Bạn đã nhập sai mật khẩu quá số lần cho phép. Vui lòng thử lại sau ${mins} phút ${secs} giây.`,
          code: 'PASSWORD_RATE_LIMITED',
          retryAfterSeconds: waitSec,
        },
      };
    }

    if (secret.requiresPassword) {
      if (!secret.passwordHash || !verifyExamPassword(password, secret.passwordHash)) {
        const nextFailCount =
          existingAttempt && existingAttempt.lockedUntilMs <= nowMs
            ? existingAttempt.failCount + 1
            : 1;
        const lockedUntilMs =
          nextFailCount >= MAX_PASSWORD_ATTEMPTS ? nowMs + LOCKOUT_DURATION_MS : 0;

        await store.savePasswordAttempt(attemptKey, {
          failCount: nextFailCount,
          lockedUntilMs,
          lastFailedAt: new Date(nowMs).toISOString(),
        });

        if (lockedUntilMs > 0) {
          return {
            status: 429,
            body: {
              error:
                'Mật khẩu đề thi không chính xác. Bạn đã nhập sai 5 lần liên tiếp, vui lòng thử lại sau 5 phút.',
              code: 'PASSWORD_RATE_LIMITED',
              retryAfterSeconds: Math.ceil(LOCKOUT_DURATION_MS / 1000),
            },
          };
        }

        return {
          status: 403,
          body: {
            error: 'Mật khẩu đề thi không chính xác. Vui lòng kiểm tra lại.',
            code: 'INVALID_EXAM_PASSWORD',
            remainingAttempts: Math.max(0, MAX_PASSWORD_ATTEMPTS - nextFailCount),
          },
        };
      }
    }

    // Success -> reset failed attempts
    await store.savePasswordAttempt(attemptKey, {
      failCount: 0,
      lockedUntilMs: 0,
      lastFailedAt: '',
    });

    const publicExam = await store.getPublicExam(examCode);
    if (!publicExam) {
      return { status: 404, body: { error: 'Không tìm thấy nội dung câu hỏi của đề thi này.' } };
    }

    const ttlMs = Math.max(2 * 60 * 60 * 1000, ((publicExam.durationMinutes || 45) + 90) * 60 * 1000);
    const expiresAtMs = nowMs + ttlMs;
    const expiresAtIso = new Date(expiresAtMs).toISOString();
    const pwdVer = secret.passwordUpdatedAt || 'v1';

    await store.saveExamAccessGrant({
      examCode,
      uid: caller.uid,
      passwordUpdatedAt: secret.passwordUpdatedAt || null,
      grantedAt: new Date(nowMs).toISOString(),
      expiresAt: expiresAtIso,
    });

    const accessToken = signExamAccessToken({
      examCode,
      uid: caller.uid,
      pwdVer,
      exp: Math.floor(expiresAtMs / 1000),
    });

    const safeExam: Exam = {
      ...publicExam,
      questions: sanitizeQuestionsForClient(publicExam.questions || []),
      requiresPassword: Boolean(secret.requiresPassword),
      allowAnswerReview: secret.allowAnswerReview,
      answerReviewMinScore: secret.answerReviewMinScore,
      answerReviewEnabledAt: secret.answerReviewEnabledAt,
      showAnswersAfterSubmit: false,
    };

    return {
      status: 200,
      body: {
        ok: true,
        accessToken,
        expiresAt: expiresAtIso,
        exam: safeExam,
      },
    };
  }

  /**
   * 3. POST /api/exams/access-questions
   * Restores sanitized questions on F5 reload ONLY if the user+exam already has a valid grant/token.
   */
  async function handleAccessExamQuestions(req: ApiRequest): Promise<ApiResponse> {
    if (req.method !== 'POST') {
      return { status: 405, body: { error: 'Phương thức không hợp lệ.' } };
    }

    const bearer = extractBearerToken(req);
    const caller = await store.verifyIdToken(bearer);
    if (!caller) {
      return {
        status: 401,
        body: { authorized: false, status: 'password_required', error: 'Chưa đăng nhập.' },
      };
    }

    if (!store.hasAdminAccess()) {
      return {
        status: 503,
        body: {
          authorized: false,
          status: 'server_unavailable',
          code: 'SERVER_CREDENTIALS_MISSING',
          error: 'Máy chủ chưa cấu hình FIREBASE_SERVICE_ACCOUNT_JSON.',
        },
      };
    }

    const body = (req.body || {}) as Record<string, unknown>;
    const examCode = normalizeExamCodeServer(String(body.examCode || ''));
    const accessToken = typeof body.accessToken === 'string' ? body.accessToken : '';

    if (!validateSafeDocCode(examCode)) {
      return { status: 400, body: { authorized: false, error: 'Mã đề thi không hợp lệ.' } };
    }

    const secret = await resolveAuthoritativeExamSecret(store, examCode);
    if (!secret) {
      return { status: 404, body: { authorized: false, status: 'not_found', error: 'Không tìm thấy đề thi.' } };
    }

    const roleInfo = await store.getUserRoleInfo(caller.uid);
    const isOwnerOrAdmin = roleInfo.isAdmin || secret.ownerId === caller.uid;

    if (!isOwnerOrAdmin) {
      if (!secret.isPublished) {
        return {
          status: 403,
          body: { authorized: false, status: 'not_published', error: 'Phòng thi đang tạm đóng.' },
        };
      }
      const sched = isWithinExamSchedule(secret, Date.now());
      if (!sched.ok) {
        return { status: 403, body: { authorized: false, error: sched.reason } };
      }

      if (secret.requiresPassword) {
        const nowMs = Date.now();
        const grant = await store.getExamAccessGrant(examCode, caller.uid);
        const tokenValid = verifyExamAccessToken(
          accessToken,
          examCode,
          caller.uid,
          secret.passwordUpdatedAt || 'v1'
        );
        if (!isGrantValidForSecret(grant, secret, nowMs) && !tokenValid) {
          return {
            status: 403,
            body: {
              authorized: false,
              status: 'password_required',
              error: 'Vui lòng nhập mật khẩu đề thi để truy cập nội dung câu hỏi.',
            },
          };
        }
      }
    }

    const publicExam = await store.getPublicExam(examCode);
    if (!publicExam) {
      return { status: 404, body: { authorized: false, status: 'not_found', error: 'Không tìm thấy đề thi.' } };
    }

    return {
      status: 200,
      body: {
        authorized: true,
        exam: {
          ...publicExam,
          questions: sanitizeQuestionsForClient(publicExam.questions || []),
          requiresPassword: Boolean(secret.requiresPassword),
          allowAnswerReview: secret.allowAnswerReview,
          answerReviewMinScore: secret.answerReviewMinScore,
          answerReviewEnabledAt: secret.answerReviewEnabledAt,
          showAnswersAfterSubmit: false,
        },
      },
    };
  }

  /**
   * 4. POST /api/exams/submit-and-grade
   * Grades answers exclusively on server from authoritative answerMap & rules, saves verified submission,
   * and returns score + floor-score eligibility status WITHOUT leaking answer keys.
   */
  async function handleSubmitAndGradeExam(req: ApiRequest): Promise<ApiResponse> {
    if (req.method !== 'POST') {
      return { status: 405, body: { error: 'Phương thức không hợp lệ.' } };
    }

    if (!store.hasAdminAccess()) {
      return {
        status: 503,
        body: {
          error: 'Máy chủ chưa cấu hình FIREBASE_SERVICE_ACCOUNT_JSON để chấm điểm bảo mật.',
          code: 'SERVER_CREDENTIALS_MISSING',
        },
      };
    }

    const bearer = extractBearerToken(req);
    const caller = bearer ? await store.verifyIdToken(bearer) : null;

    const body = (req.body || {}) as Record<string, unknown>;
    const examCode = normalizeExamCodeServer(String(body.examCode || ''));
    const accessToken = typeof body.accessToken === 'string' ? body.accessToken : '';

    if (!validateSafeDocCode(examCode)) {
      return { status: 400, body: { error: 'Mã đề thi không hợp lệ.' } };
    }

    const secret = await resolveAuthoritativeExamSecret(store, examCode);
    if (!secret) {
      return { status: 404, body: { error: 'Không tìm thấy đề thi trên hệ thống.' } };
    }

    const roleInfo = caller ? await store.getUserRoleInfo(caller.uid) : { isAdmin: false };
    const isOwnerOrAdmin = Boolean(caller && (roleInfo.isAdmin || secret.ownerId === caller.uid));

    if (!isOwnerOrAdmin && !secret.isPublished) {
      return { status: 403, body: { error: 'Phòng thi đã đóng, không thể nộp bài.' } };
    }

    if (secret.requiresPassword && !isOwnerOrAdmin) {
      if (!caller) {
        return { status: 401, body: { error: 'Phiên làm bài yêu cầu đăng nhập tài khoản học sinh.' } };
      }
      const grant = await store.getExamAccessGrant(examCode, caller.uid);
      const tokenValid = verifyExamAccessToken(
        accessToken,
        examCode,
        caller.uid,
        secret.passwordUpdatedAt || 'v1'
      );
      if (!isGrantValidForSecret(grant, secret, Date.now()) && !tokenValid) {
        return {
          status: 403,
          body: { error: 'Quyền truy cập đề thi đã hết hạn hoặc chưa xác thực mật khẩu.' },
        };
      }
    }

    const studentId = caller?.uid || `guest_${Date.now()}`;
    const existingSubs = caller
      ? await store.listStudentSubmissionsForExam(examCode, caller.uid)
      : [];

    if (!isOwnerOrAdmin && secret.maxAttempts > 0 && existingSubs.length >= secret.maxAttempts) {
      return {
        status: 403,
        body: {
          error: `Bạn đã dùng hết ${secret.maxAttempts} lượt làm bài cho phép của đề thi này.`,
          code: 'MAX_ATTEMPTS_EXCEEDED',
        },
      };
    }

    const publicExam = await store.getPublicExam(examCode);
    const answers =
      body.answers && typeof body.answers === 'object'
        ? (body.answers as Record<string, StudentAnswer>)
        : {};

    const grade = gradeAnswersOnServer({
      questionOrder: secret.questions || [],
      answerMap: secret.answerMap || {},
      rules: secret.rules,
      answers,
    });

    const nowIso = new Date().toISOString();
    const startedAt =
      typeof body.startedAt === 'string' && body.startedAt.trim() ? body.startedAt.trim() : nowIso;
    const submittedAt = nowIso;
    const startMs = Date.parse(startedAt);
    const durationSeconds = Number.isFinite(startMs)
      ? Math.max(1, Math.min(86400, Math.round((Date.now() - startMs) / 1000)))
      : Math.max(1, Number(body.durationSeconds || 1));

    const rawId =
      typeof body.submissionId === 'string' && body.submissionId.trim()
        ? body.submissionId.trim().replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128)
        : `sub_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    const digest = signSubmissionGradeDigest({
      submissionId: rawId,
      examCode,
      studentId,
      totalScore: grade.totalScore,
      part1Score: grade.part1Score,
      part2Score: grade.part2Score,
      part3Score: grade.part3Score,
    });

    const verifiedSubmission: StudentSubmission = {
      id: rawId,
      examId: secret.examId,
      examTitle: String(publicExam?.title || body.examTitle || `Bài thi ${examCode}`).slice(0, 300),
      examCode,
      ...(typeof body.variantCode === 'string' && body.variantCode
        ? { variantCode: body.variantCode.slice(0, 32) }
        : {}),
      ownerId: secret.ownerId,
      studentId,
      studentName: String(body.studentName || caller?.name || 'Thí sinh').slice(0, 120),
      studentClass: String(body.studentClass || 'Tự do').slice(0, 80),
      startedAt,
      submittedAt,
      durationSeconds,
      answers,
      part1Score: grade.part1Score,
      part2Score: grade.part2Score,
      part3Score: grade.part3Score,
      totalScore: grade.totalScore,
      maxPossibleScore: Number(publicExam?.totalScore || 10.0),
      correctQuestionsCount: grade.correctQuestionsCount,
      tabSwitchesCount: Math.max(0, Math.min(10000, Number(body.tabSwitchesCount || 0))),
      status: body.status === 'timed_out' ? 'timed_out' : 'completed',
      gradedByServer: true,
      serverGradeDigest: digest,
      serverGradedAt: nowIso,
    };

    await store.saveSubmission(verifiedSubmission);

    // Evaluate eligibility across all valid submissions including the one just graded
    const allSubs = [...existingSubs, verifiedSubmission];
    const verifiedScores = allSubs.map(
      (s) =>
        gradeAnswersOnServer({
          questionOrder: secret.questions || [],
          answerMap: secret.answerMap || {},
          rules: secret.rules,
          answers: s.answers || {},
        }).totalScore
    );

    const answerReviewCheck = !caller
      ? {
          allowed: false,
          reason: 'unauthenticated' as const,
          score: grade.totalScore,
          minScore: secret.answerReviewMinScore,
          enabledAt: secret.answerReviewEnabledAt,
          message: 'Vui lòng đăng nhập tài khoản học sinh để kiểm tra quyền xem đáp án & lời giải.',
        }
      : evaluateAnswerReviewPolicy({
          allowAnswerReview: secret.allowAnswerReview,
          answerReviewMinScore: secret.answerReviewMinScore,
          answerReviewEnabledAt: secret.answerReviewEnabledAt,
          verifiedScores,
        });

    return {
      status: 200,
      body: {
        ok: true,
        submission: verifiedSubmission,
        answerReviewCheck,
      },
    };
  }

  /**
   * 5. POST /api/exams/request-answer-review
   * Strictly checks auth, exam access grant, allowAnswerReview, answerReviewEnabledAt,
   * and RE-COMPUTED server score >= answerReviewMinScore before returning answer keys & solutions.
   */
  async function handleRequestAnswerReview(req: ApiRequest): Promise<ApiResponse> {
    if (req.method !== 'POST') {
      return { status: 405, body: { error: 'Phương thức không hợp lệ.' } };
    }

    const bearer = extractBearerToken(req);
    const caller = await store.verifyIdToken(bearer);
    if (!caller) {
      return {
        status: 401,
        body: {
          allowed: false,
          reason: 'unauthenticated',
          message: 'Bạn cần đăng nhập tài khoản học sinh để xem đáp án.',
        },
      };
    }

    if (!store.hasAdminAccess()) {
      return {
        status: 503,
        body: {
          allowed: false,
          reason: 'server_unavailable',
          code: 'SERVER_CREDENTIALS_MISSING',
          message: 'Máy chủ chưa cấu hình FIREBASE_SERVICE_ACCOUNT_JSON để kiểm tra điều kiện xem đáp án.',
        },
      };
    }

    const body = (req.body || {}) as Record<string, unknown>;
    const examCode = normalizeExamCodeServer(String(body.examCode || ''));
    const accessToken = typeof body.accessToken === 'string' ? body.accessToken : '';

    if (!validateSafeDocCode(examCode)) {
      return { status: 400, body: { allowed: false, message: 'Mã bài thi không hợp lệ.' } };
    }

    const secret = await resolveAuthoritativeExamSecret(store, examCode);
    if (!secret) {
      return { status: 404, body: { allowed: false, message: 'Không tìm thấy đề thi.' } };
    }

    const roleInfo = await store.getUserRoleInfo(caller.uid);
    const isOwnerOrAdmin = roleInfo.isAdmin || secret.ownerId === caller.uid;

    // Owner teacher / admin can always inspect keys of their own exam
    if (isOwnerOrAdmin) {
      const publicExam = await store.getPublicExam(examCode).catch(() => null);
      return {
        status: 200,
        body: {
          allowed: true,
          reason: 'allowed',
          score: 10,
          minScore: secret.answerReviewMinScore,
          showSolutionsAfterSubmit: secret.showSolutionsAfterSubmit,
          answerMap: sanitizeAnswerMapForReview(secret.answerMap, secret.showSolutionsAfterSubmit),
          ...(publicExam
            ? {
                exam: {
                  ...publicExam,
                  questions: sanitizeQuestionsForClient(publicExam.questions || []),
                  requiresPassword: Boolean(secret.requiresPassword),
                  allowAnswerReview: secret.allowAnswerReview,
                  answerReviewMinScore: secret.answerReviewMinScore,
                  answerReviewEnabledAt: secret.answerReviewEnabledAt,
                },
              }
            : {}),
        },
      };
    }

    // If exam is password protected, verify active grant or token
    if (secret.requiresPassword) {
      const grant = await store.getExamAccessGrant(examCode, caller.uid);
      const tokenValid = verifyExamAccessToken(
        accessToken,
        examCode,
        caller.uid,
        secret.passwordUpdatedAt || 'v1'
      );
      if (!isGrantValidForSecret(grant, secret, Date.now()) && !tokenValid) {
        return {
          status: 403,
          body: {
            allowed: false,
            reason: 'access_denied',
            message: 'Bạn chưa có quyền truy cập đề thi bảo mật này.',
          },
        };
      }
    }

    const submissions = await store.listStudentSubmissionsForExam(examCode, caller.uid);
    const validSubmissions = submissions.filter(
      (s) => s && s.studentId === caller.uid && (s.status === 'completed' || s.status === 'timed_out')
    );

    // CRITICAL: Re-compute each submission's true score from answers + server answerMap.
    // Never trust client-supplied or tampered score fields!
    const verifiedScores = validSubmissions.map(
      (s) =>
        gradeAnswersOnServer({
          questionOrder: secret.questions || [],
          answerMap: secret.answerMap || {},
          rules: secret.rules,
          answers: s.answers || {},
        }).totalScore
    );

    const check = evaluateAnswerReviewPolicy({
      allowAnswerReview: secret.allowAnswerReview,
      answerReviewMinScore: secret.answerReviewMinScore,
      answerReviewEnabledAt: secret.answerReviewEnabledAt,
      verifiedScores,
    });

    if (!check.allowed) {
      return {
        status: 403,
        body: { ...check },
      };
    }

    await store.saveAnswerReviewAccess({
      examCode,
      uid: caller.uid,
      score: check.score ?? 0,
      minScore: check.minScore ?? secret.answerReviewMinScore,
      grantedAt: new Date().toISOString(),
    });

    const publicExam = await store.getPublicExam(examCode).catch(() => null);

    return {
      status: 200,
      body: {
        ...check,
        showSolutionsAfterSubmit: secret.showSolutionsAfterSubmit,
        answerMap: sanitizeAnswerMapForReview(secret.answerMap, secret.showSolutionsAfterSubmit),
        ...(publicExam
          ? {
              exam: {
                ...publicExam,
                questions: sanitizeQuestionsForClient(publicExam.questions || []),
                requiresPassword: Boolean(secret.requiresPassword),
                allowAnswerReview: secret.allowAnswerReview,
                answerReviewMinScore: secret.answerReviewMinScore,
                answerReviewEnabledAt: secret.answerReviewEnabledAt,
              },
            }
          : {}),
      },
    };
  }

  return {
    handleConfigureExamSecurity,
    handleVerifyExamPassword,
    handleAccessExamQuestions,
    handleSubmitAndGradeExam,
    handleRequestAnswerReview,
  };
}
