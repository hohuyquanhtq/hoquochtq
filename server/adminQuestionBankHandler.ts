import type {
  AdminQuestionAuditLog,
  AdminQuestionBankFilterParams,
  CognitiveLevel,
  CurriculumLesson,
  Question,
  QuestionType,
  User,
} from '../src/types/index.ts';
import {
  buildAdminPersonalQuestionCopy,
  enrichSchoolQuestions,
  filterAndPaginateSchoolQuestions,
  summarizeQuestionForAudit,
} from '../src/utils/schoolQuestionBankEngine.ts';
import {
  isFirebaseAdminReady,
} from './firebaseAdmin.ts';
import {
  verifyFirebaseIdToken,
  type VerifiedFirebaseIdToken,
} from './firebaseServerAuth.ts';
import {
  firestoreDeleteDoc,
  firestoreGetDoc,
  firestoreListCollection,
  firestorePatchFields,
  firestoreSetDoc,
} from './firestoreRest.ts';
import type { ApiRequest, ApiResponse } from './examApiHandlers.ts';

export interface AdminQuestionBankStore {
  verifyIdToken(token: string): Promise<VerifiedFirebaseIdToken | null>;
  isCallerAdmin(
    uid: string,
    bearerToken?: string
  ): Promise<{ isAdmin: boolean; displayName?: string; email?: string }>;
  listAllQuestions(bearerToken?: string): Promise<Question[]>;
  listAllUsers(bearerToken?: string): Promise<User[]>;
  listAllCurriculumLessons(bearerToken?: string): Promise<CurriculumLesson[]>;
  getQuestionById(questionId: string, bearerToken?: string): Promise<(Question & { serverCreatedAt?: unknown }) | null>;
  createQuestion(question: Question, bearerToken?: string): Promise<void>;
  updateQuestionFields(
    questionId: string,
    fields: Record<string, unknown>,
    hasServerCreatedAt: boolean,
    bearerToken?: string
  ): Promise<void>;
  deleteQuestion(questionId: string, bearerToken?: string): Promise<void>;
  saveAuditLog(log: AdminQuestionAuditLog, bearerToken?: string): Promise<void>;
  listAuditLogs(limit: number, bearerToken?: string): Promise<AdminQuestionAuditLog[]>;
}

function getHeaderValue(
  headers: Record<string, string | string[] | undefined>,
  name: string
): string | undefined {
  const target = name.toLowerCase();
  for (const [k, v] of Object.entries(headers || {})) {
    if (k.toLowerCase() === target) {
      return Array.isArray(v) ? v[0] : v;
    }
  }
  return undefined;
}

function extractBearerToken(headers: Record<string, string | string[] | undefined>): string | null {
  const auth = getHeaderValue(headers, 'authorization');
  if (!auth) return null;
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

function safeDocId(raw: string): string {
  return (raw || `doc_${Date.now()}`).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128);
}

function stripUndefinedShallow(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) {
      out[k] = v;
    }
  }
  return out;
}

function buildFirestoreQuestionDocument(q: Question, ownerId: string): Record<string, unknown> {
  const safeId = safeDocId(q.id);
  const nowIso = new Date().toISOString();
  return stripUndefinedShallow({
    id: safeId,
    ownerId,
    code: (q.code || `Q_${safeId.slice(-6)}`).slice(0, 64),
    content: (q.content || '').slice(0, 20000),
    type: q.type || 'part1_single_choice',
    ...(q.subjectId ? { subjectId: q.subjectId.slice(0, 64) } : {}),
    ...(q.subjectName ? { subjectName: q.subjectName.slice(0, 120) } : {}),
    grade: q.grade || '12',
    topic: (q.topic || 'hoa_dai_cuong').slice(0, 64),
    ...(q.chapterId && q.chapterId.trim() ? { chapterId: safeDocId(q.chapterId.trim()) } : {}),
    ...(q.chapterName && q.chapterName.trim() ? { chapterName: q.chapterName.trim().slice(0, 250) } : {}),
    ...(q.lessonId && q.lessonId.trim() ? { lessonId: safeDocId(q.lessonId.trim()) } : {}),
    ...(q.lessonName && q.lessonName.trim() ? { lessonName: q.lessonName.trim().slice(0, 250) } : {}),
    ...(q.lessonTopic && q.lessonTopic.trim() ? { lessonTopic: q.lessonTopic.trim().slice(0, 200) } : {}),
    ...(q.textbookSeries && q.textbookSeries.trim()
      ? { textbookSeries: q.textbookSeries.trim().slice(0, 150) }
      : {}),
    level: q.level || 'nhan_biet',
    ...(q.folderId ? { folderId: q.folderId.slice(0, 128) } : {}),
    ...(q.options ? { options: q.options.slice(0, 8) } : {}),
    ...(q.correctOptionId ? { correctOptionId: q.correctOptionId.slice(0, 8) } : {}),
    ...(Array.isArray(q.correctOptionIds) && q.correctOptionIds.length > 0
      ? { correctOptionIds: q.correctOptionIds.slice(0, 8) }
      : {}),
    ...(q.statements ? { statements: q.statements.slice(0, 8) } : {}),
    ...(q.shortAnswerConfig ? { shortAnswerConfig: q.shortAnswerConfig } : {}),
    ...(q.imageUrl && q.imageUrl.trim() ? { imageUrl: q.imageUrl.trim().slice(0, 1000) } : {}),
    ...(q.explanation ? { explanation: q.explanation.slice(0, 20000) } : {}),
    ...(q.source ? { source: q.source.slice(0, 300) } : {}),
    authorId: q.authorId || ownerId,
    ...(q.parseStatus ? { parseStatus: q.parseStatus } : {}),
    ...(q.parseWarning ? { parseWarning: q.parseWarning.slice(0, 500) } : {}),
    ...(q.teacherVerified !== undefined ? { teacherVerified: !!q.teacherVerified } : {}),
    ...(q.section ? { section: q.section.slice(0, 64) } : {}),
    ...(q.sectionTitle ? { sectionTitle: q.sectionTitle.slice(0, 300) } : {}),
    ...(q.copiedFromQuestionId ? { copiedFromQuestionId: q.copiedFromQuestionId.slice(0, 128) } : {}),
    ...(q.copiedFromOwnerId ? { copiedFromOwnerId: q.copiedFromOwnerId.slice(0, 128) } : {}),
    ...(q.copiedFromOwnerName ? { copiedFromOwnerName: q.copiedFromOwnerName.slice(0, 150) } : {}),
    createdAt: q.createdAt || nowIso,
    updatedAt: q.updatedAt || nowIso,
  });
}

export function createFirestoreAdminQuestionBankStore(): AdminQuestionBankStore {
  return {
    verifyIdToken: (token) => verifyFirebaseIdToken(token),

    async isCallerAdmin(uid, bearerToken) {
      let isAdmin = false;
      let displayName: string | undefined;
      let email: string | undefined;
      const adminReady = isFirebaseAdminReady();

      try {
        const adminDoc = await firestoreGetDoc<{
          isActive?: boolean;
          active?: boolean;
          role?: string;
          name?: string;
          displayName?: string;
          email?: string;
        }>('admins', uid, { bearerToken });
        if (
          adminDoc &&
          (adminDoc.isActive === true || adminDoc.active === true) &&
          (adminDoc.role === 'admin' || adminDoc.role === 'super_admin')
        ) {
          isAdmin = true;
          displayName = adminDoc.name || adminDoc.displayName;
          email = adminDoc.email;
        }
      } catch (err) {
        if (adminReady) throw err;
      }

      try {
        const userDoc = await firestoreGetDoc<{
          role?: string;
          status?: string;
          name?: string;
          email?: string;
        }>('users', uid, { bearerToken });
        if (userDoc) {
          if (!displayName && userDoc.name) displayName = userDoc.name;
          if (!email && userDoc.email) email = userDoc.email;
          if (
            (userDoc.role === 'admin' || userDoc.role === 'super_admin') &&
            (userDoc.status === 'active' || userDoc.status === 'approved')
          ) {
            isAdmin = true;
          }
        }
      } catch (err) {
        if (adminReady) throw err;
      }

      return { isAdmin, displayName, email };
    },

    async listAllQuestions(bearerToken) {
      const docs = await firestoreListCollection<Question>('questions', {
        bearerToken,
        maxDocs: 15000,
      });
      return docs.map((d) => {
        const { __docId, ...rest } = d;
        return {
          ...rest,
          id: rest.id || __docId,
        } as Question;
      });
    },

    async listAllUsers(bearerToken) {
      const docs = await firestoreListCollection<Record<string, unknown>>('users', {
        bearerToken,
        maxDocs: 5000,
      });
      return docs.map((raw) => {
        const uid = String(raw.uid || raw.__docId || '');
        return {
          id: uid,
          uid,
          name: String(raw.name || ''),
          email: String(raw.email || ''),
          role: (raw.role as User['role']) || 'student',
          status: (raw.status as User['status']) || 'active',
          phone: typeof raw.phone === 'string' ? raw.phone : undefined,
          school: typeof raw.school === 'string' ? raw.school : undefined,
          className: typeof raw.className === 'string' ? raw.className : undefined,
          createdAt: String(raw.createdAt || ''),
          updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : undefined,
        } satisfies User;
      });
    },

    async listAllCurriculumLessons(bearerToken) {
      try {
        const docs = await firestoreListCollection<CurriculumLesson>('curriculumLessons', {
          bearerToken,
          maxDocs: 5000,
        });
        return docs.map((d) => {
          const { __docId, ...rest } = d;
          return {
            ...rest,
            id: rest.id || __docId,
            lessonId: rest.lessonId || rest.id || __docId,
          } as CurriculumLesson;
        });
      } catch {
        return [];
      }
    },

    async getQuestionById(questionId, bearerToken) {
      const safeId = safeDocId(questionId);
      const doc = await firestoreGetDoc<Question & { serverCreatedAt?: unknown }>('questions', safeId, {
        bearerToken,
      });
      if (!doc) return null;
      return { ...doc, id: doc.id || safeId };
    },

    async createQuestion(question, bearerToken) {
      const safeId = safeDocId(question.id);
      const ownerId = question.ownerId || question.authorId;
      const payload = buildFirestoreQuestionDocument({ ...question, id: safeId }, ownerId);
      await firestoreSetDoc('questions', safeId, payload, {
        bearerToken,
        serverTimestampFields: ['serverCreatedAt', 'serverUpdatedAt'],
      });
    },

    async updateQuestionFields(questionId, fields, hasServerCreatedAt, bearerToken) {
      const safeId = safeDocId(questionId);
      const tsFields = hasServerCreatedAt
        ? ['serverUpdatedAt']
        : ['serverCreatedAt', 'serverUpdatedAt'];
      await firestorePatchFields('questions', safeId, stripUndefinedShallow(fields), {
        bearerToken,
        serverTimestampFields: tsFields,
      });
    },

    async deleteQuestion(questionId, bearerToken) {
      await firestoreDeleteDoc('questions', safeDocId(questionId), { bearerToken });
    },

    async saveAuditLog(log, bearerToken) {
      const safeId = safeDocId(log.id);
      const payload = stripUndefinedShallow({
        ...log,
        id: safeId,
      });
      await firestoreSetDoc('adminQuestionAuditLogs', safeId, payload, {
        bearerToken,
        serverTimestampFields: ['serverCreatedAt'],
      });
    },

    async listAuditLogs(limit, bearerToken) {
      const docs = await firestoreListCollection<AdminQuestionAuditLog>('adminQuestionAuditLogs', {
        bearerToken,
        maxDocs: Math.max(50, limit * 3),
      });
      return docs
        .map((d) => {
          const { __docId, ...rest } = d;
          return { ...rest, id: rest.id || __docId } as AdminQuestionAuditLog;
        })
        .sort((a, b) => Date.parse(b.createdAt || '') - Date.parse(a.createdAt || ''))
        .slice(0, limit);
    },
  };
}

const VALID_LEVELS = new Set<CognitiveLevel>(['nhan_biet', 'thong_hieu', 'van_dung', 'van_dung_cao']);
const VALID_TYPES = new Set<QuestionType>([
  'part1_single_choice',
  'part1_multiple_choice',
  'part2_true_false',
  'part3_short_answer',
]);
const VALID_GRADES = new Set<Question['grade']>(['10', '11', '12', 'chuyen_hsg']);

function parseStringArray(val: unknown): string[] | undefined {
  if (!Array.isArray(val)) return undefined;
  const cleaned = val
    .filter((v): v is string => typeof v === 'string')
    .map((v) => v.trim())
    .filter(Boolean);
  return cleaned.length > 0 ? cleaned : undefined;
}

export function createAdminQuestionBankHandlers(
  store: AdminQuestionBankStore = createFirestoreAdminQuestionBankStore()
) {
  async function requireAdminCaller(req: ApiRequest): Promise<
    | { ok: true; caller: VerifiedFirebaseIdToken; bearerToken: string; adminName: string; adminEmail?: string }
    | { ok: false; response: ApiResponse }
  > {
    const bearerToken = extractBearerToken(req.headers);
    if (!bearerToken) {
      return {
        ok: false,
        response: {
          status: 401,
          body: {
            error: 'Thiếu token xác thực Firebase. Vui lòng đăng nhập lại bằng tài khoản Quản trị viên.',
            code: 'AUTH_REQUIRED',
          },
        },
      };
    }

    const caller = await store.verifyIdToken(bearerToken);
    if (!caller) {
      return {
        ok: false,
        response: {
          status: 401,
          body: {
            error: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn. Vui lòng đăng nhập lại.',
            code: 'INVALID_TOKEN',
          },
        },
      };
    }

    const adminCheck = await store.isCallerAdmin(caller.uid, bearerToken);
    if (!adminCheck.isAdmin) {
      return {
        ok: false,
        response: {
          status: 403,
          body: {
            error: 'Truy cập bị từ chối (403 FORBIDDEN). Chỉ Quản trị viên (Super Admin) mới có quyền truy cập Ngân hàng câu hỏi toàn trường.',
            code: 'FORBIDDEN',
          },
        },
      };
    }

    return {
      ok: true,
      caller,
      bearerToken,
      adminName: adminCheck.displayName || caller.email || 'Quản trị viên',
      adminEmail: adminCheck.email || caller.email,
    };
  }

  /**
   * GET / POST /api/admin/question-bank
   * Returns school-wide question bank (filtered + paginated) and real Firestore statistics.
   * Strictly rejects non-Admin accounts (Teachers / Students) with 403 FORBIDDEN.
   */
  async function handleGetSchoolQuestionBank(req: ApiRequest): Promise<ApiResponse> {
    if (req.method && !['GET', 'POST'].includes(req.method.toUpperCase())) {
      return { status: 405, body: { error: 'Method Not Allowed' } };
    }

    const authResult = await requireAdminCaller(req);
    if (!authResult.ok) return authResult.response;

    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
    const filters: AdminQuestionBankFilterParams = {
      teacherIds: parseStringArray(body.teacherIds),
      subjectIds: parseStringArray(body.subjectIds),
      grades: parseStringArray(body.grades),
      textbookSeries: typeof body.textbookSeries === 'string' ? body.textbookSeries.trim() : undefined,
      chapter: typeof body.chapter === 'string' ? body.chapter.trim() : undefined,
      lesson: typeof body.lesson === 'string' ? body.lesson.trim() : undefined,
      levels: parseStringArray(body.levels)?.filter((l): l is CognitiveLevel =>
        VALID_LEVELS.has(l as CognitiveLevel)
      ),
      types: parseStringArray(body.types)?.filter((t): t is QuestionType =>
        VALID_TYPES.has(t as QuestionType)
      ),
      dateFrom: typeof body.dateFrom === 'string' ? body.dateFrom.trim() : undefined,
      dateTo: typeof body.dateTo === 'string' ? body.dateTo.trim() : undefined,
      search: typeof body.search === 'string' ? body.search.trim().slice(0, 200) : undefined,
      sortBy:
        body.sortBy === 'createdAt_desc' ||
        body.sortBy === 'createdAt_asc' ||
        body.sortBy === 'code_asc'
          ? body.sortBy
          : 'updatedAt_desc',
      page: typeof body.page === 'number' ? body.page : 1,
      pageSize: typeof body.pageSize === 'number' ? body.pageSize : 20,
      includeAllFiltered: body.includeAllFiltered === true,
    };

    try {
      const [questions, users, curriculumLessons] = await Promise.all([
        store.listAllQuestions(authResult.bearerToken),
        store.listAllUsers(authResult.bearerToken),
        store.listAllCurriculumLessons(authResult.bearerToken),
      ]);

      const enriched = enrichSchoolQuestions({ questions, users, curriculumLessons });
      const result = filterAndPaginateSchoolQuestions(enriched, filters, users, curriculumLessons);

      return {
        status: 200,
        body: {
          ok: true,
          ...result,
        },
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Không thể tải ngân hàng câu hỏi toàn trường.';
      return {
        status: 500,
        body: {
          error: `Lỗi truy vấn Ngân hàng câu hỏi toàn trường: ${msg}`,
          code: 'SCHOOL_BANK_FETCH_FAILED',
        },
      };
    }
  }

  /**
   * POST /api/admin/question-bank/action
   * Privileged Super Admin actions with strict separation between:
   * - copy_to_admin: safe copy into Admin's own personal bank (NEVER mutates teacher's original)
   * - edit_original: requires explicit confirmOriginalMutation=true + reason >= 5 chars + writes immutable audit log
   * - delete_original: requires explicit confirmOriginalMutation=true + reason >= 5 chars + writes immutable audit log
   */
  async function handleAdminQuestionAction(req: ApiRequest): Promise<ApiResponse> {
    if (req.method && req.method.toUpperCase() !== 'POST') {
      return { status: 405, body: { error: 'Method Not Allowed' } };
    }

    const authResult = await requireAdminCaller(req);
    if (!authResult.ok) return authResult.response;

    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
    const action = typeof body.action === 'string' ? body.action.trim() : '';
    const questionId = typeof body.questionId === 'string' ? body.questionId.trim() : '';

    if (!questionId) {
      return { status: 400, body: { error: 'Thiếu mã câu hỏi (questionId).', code: 'MISSING_QUESTION_ID' } };
    }

    if (!['copy_to_admin', 'edit_original', 'delete_original'].includes(action)) {
      return {
        status: 400,
        body: { error: 'Hành động không hợp lệ (chỉ hỗ trợ copy_to_admin, edit_original, delete_original).', code: 'INVALID_ACTION' },
      };
    }

    try {
      const original = await store.getQuestionById(questionId, authResult.bearerToken);
      if (!original) {
        return {
          status: 404,
          body: { error: 'Không tìm thấy câu hỏi cần thao tác trên hệ thống.', code: 'QUESTION_NOT_FOUND' },
        };
      }

      const users = await store.listAllUsers(authResult.bearerToken);
      const originalOwnerId = (original.ownerId || original.authorId || 'unknown').trim() || 'unknown';
      const ownerUser = users.find((u) => (u.uid || u.id) === originalOwnerId);
      const originalOwnerName =
        ownerUser?.name?.trim() || `Giáo viên (${originalOwnerId.slice(0, 8)})`;
      const originalOwnerEmail = ownerUser?.email?.trim() || undefined;
      const nowIso = new Date().toISOString();
      const auditId = `qaudit_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

      if (action === 'copy_to_admin') {
        const copiedQuestion = buildAdminPersonalQuestionCopy({
          source: original,
          adminUid: authResult.caller.uid,
          originalOwnerId,
          originalOwnerName,
          nowIso,
        });

        await store.createQuestion(copiedQuestion, authResult.bearerToken);

        const auditLog: AdminQuestionAuditLog = {
          id: auditId,
          action: 'copy_to_admin',
          questionId: original.id,
          questionCode: (original.code || original.id).slice(0, 64),
          copiedQuestionId: copiedQuestion.id,
          originalOwnerId,
          originalOwnerName: originalOwnerName.slice(0, 150),
          ...(originalOwnerEmail ? { originalOwnerEmail: originalOwnerEmail.slice(0, 200) } : {}),
          actorUid: authResult.caller.uid,
          actorName: authResult.adminName.slice(0, 150),
          ...(authResult.adminEmail ? { actorEmail: authResult.adminEmail.slice(0, 200) } : {}),
          reason: 'Sao chép câu hỏi vào ngân hàng riêng của Admin (không làm thay đổi bản gốc của giáo viên).',
          beforeSummary: summarizeQuestionForAudit(original),
          createdAt: nowIso,
        };
        await store.saveAuditLog(auditLog, authResult.bearerToken);

        return {
          status: 200,
          body: {
            ok: true,
            action: 'copy_to_admin',
            copiedQuestion,
            auditLogId: auditId,
            message: 'Đã sao chép câu hỏi sang Ngân hàng câu hỏi riêng của Admin. Bản gốc của giáo viên được giữ nguyên.',
          },
        };
      }

      // Privileged direct mutation on teacher's original question requires explicit confirmation + reason
      const confirmOriginalMutation = body.confirmOriginalMutation === true;
      const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
      if (!confirmOriginalMutation) {
        return {
          status: 400,
          body: {
            error: 'Thao tác chỉnh sửa/xóa câu hỏi gốc của giáo viên yêu cầu xác nhận rõ ràng (confirmOriginalMutation = true).',
            code: 'CONFIRMATION_REQUIRED',
          },
        };
      }
      if (reason.length < 5) {
        return {
          status: 400,
          body: {
            error: 'Vui lòng nhập lý do thao tác (tối thiểu 5 ký tự) để lưu nhật ký kiểm duyệt Admin.',
            code: 'REASON_REQUIRED',
          },
        };
      }

      if (action === 'edit_original') {
        const rawUpdates =
          body.updates && typeof body.updates === 'object'
            ? (body.updates as Record<string, unknown>)
            : {};

        const safePatch: Record<string, unknown> = {
          updatedAt: nowIso,
        };

        if (typeof rawUpdates.content === 'string' && rawUpdates.content.trim()) {
          safePatch.content = rawUpdates.content.trim().slice(0, 20000);
        }
        if (typeof rawUpdates.code === 'string' && rawUpdates.code.trim()) {
          safePatch.code = rawUpdates.code.trim().slice(0, 64);
        }
        if (typeof rawUpdates.explanation === 'string') {
          safePatch.explanation = rawUpdates.explanation.trim().slice(0, 20000);
        }
        if (typeof rawUpdates.level === 'string' && VALID_LEVELS.has(rawUpdates.level as CognitiveLevel)) {
          safePatch.level = rawUpdates.level;
        }
        if (typeof rawUpdates.grade === 'string' && VALID_GRADES.has(rawUpdates.grade as Question['grade'])) {
          safePatch.grade = rawUpdates.grade;
        }
        if (typeof rawUpdates.subjectId === 'string' && rawUpdates.subjectId.trim()) {
          safePatch.subjectId = rawUpdates.subjectId.trim().slice(0, 64);
        }
        if (typeof rawUpdates.subjectName === 'string' && rawUpdates.subjectName.trim()) {
          safePatch.subjectName = rawUpdates.subjectName.trim().slice(0, 120);
        }
        if (typeof rawUpdates.chapterName === 'string') {
          safePatch.chapterName = rawUpdates.chapterName.trim().slice(0, 250);
        }
        if (typeof rawUpdates.lessonName === 'string') {
          safePatch.lessonName = rawUpdates.lessonName.trim().slice(0, 250);
          safePatch.lessonTopic = rawUpdates.lessonName.trim().slice(0, 200);
        }
        if (typeof rawUpdates.textbookSeries === 'string') {
          safePatch.textbookSeries = rawUpdates.textbookSeries.trim().slice(0, 150);
        }
        if (typeof rawUpdates.correctOptionId === 'string' && rawUpdates.correctOptionId.trim()) {
          safePatch.correctOptionId = rawUpdates.correctOptionId.trim().slice(0, 8);
        }
        if (Array.isArray(rawUpdates.options)) {
          safePatch.options = rawUpdates.options.slice(0, 8);
        }
        if (Array.isArray(rawUpdates.statements)) {
          safePatch.statements = rawUpdates.statements.slice(0, 8);
        }
        if (rawUpdates.shortAnswerConfig && typeof rawUpdates.shortAnswerConfig === 'object') {
          safePatch.shortAnswerConfig = rawUpdates.shortAnswerConfig;
        }

        // CRITICAL: Never change ownerId, authorId, or createdAt when Admin edits original
        const hasServerCreatedAt = Boolean(original.serverCreatedAt);
        await store.updateQuestionFields(original.id, safePatch, hasServerCreatedAt, authResult.bearerToken);

        const updatedPreview: Question = {
          ...original,
          ...(safePatch as Partial<Question>),
          ownerId: original.ownerId,
          authorId: original.authorId,
        };

        const auditLog: AdminQuestionAuditLog = {
          id: auditId,
          action: 'edit_original',
          questionId: original.id,
          questionCode: (updatedPreview.code || original.id).slice(0, 64),
          originalOwnerId,
          originalOwnerName: originalOwnerName.slice(0, 150),
          ...(originalOwnerEmail ? { originalOwnerEmail: originalOwnerEmail.slice(0, 200) } : {}),
          actorUid: authResult.caller.uid,
          actorName: authResult.adminName.slice(0, 150),
          ...(authResult.adminEmail ? { actorEmail: authResult.adminEmail.slice(0, 200) } : {}),
          reason: reason.slice(0, 1000),
          beforeSummary: summarizeQuestionForAudit(original),
          afterSummary: summarizeQuestionForAudit(updatedPreview),
          createdAt: nowIso,
        };
        await store.saveAuditLog(auditLog, authResult.bearerToken);

        return {
          status: 200,
          body: {
            ok: true,
            action: 'edit_original',
            updatedQuestion: updatedPreview,
            auditLogId: auditId,
            message: 'Đã cập nhật câu hỏi gốc và lưu nhật ký kiểm duyệt Admin.',
          },
        };
      }

      // action === 'delete_original'
      await store.deleteQuestion(original.id, authResult.bearerToken);

      const auditLog: AdminQuestionAuditLog = {
        id: auditId,
        action: 'delete_original',
        questionId: original.id,
        questionCode: (original.code || original.id).slice(0, 64),
        originalOwnerId,
        originalOwnerName: originalOwnerName.slice(0, 150),
        ...(originalOwnerEmail ? { originalOwnerEmail: originalOwnerEmail.slice(0, 200) } : {}),
        actorUid: authResult.caller.uid,
        actorName: authResult.adminName.slice(0, 150),
        ...(authResult.adminEmail ? { actorEmail: authResult.adminEmail.slice(0, 200) } : {}),
        reason: reason.slice(0, 1000),
        beforeSummary: summarizeQuestionForAudit(original),
        createdAt: nowIso,
      };
      await store.saveAuditLog(auditLog, authResult.bearerToken);

      return {
        status: 200,
        body: {
          ok: true,
          action: 'delete_original',
          deletedQuestionId: original.id,
          auditLogId: auditId,
          message: 'Đã xóa câu hỏi gốc và ghi nhận đầy đủ vào nhật ký quản trị.',
        },
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Thao tác quản trị câu hỏi thất bại.';
      return {
        status: 500,
        body: {
          error: `Lỗi thực hiện thao tác quản trị câu hỏi: ${msg}`,
          code: 'SCHOOL_BANK_ACTION_FAILED',
        },
      };
    }
  }

  /**
   * GET / POST /api/admin/question-bank/audit-logs
   * Admin-only audit history of copy/edit_original/delete_original operations.
   */
  async function handleGetQuestionAuditLogs(req: ApiRequest): Promise<ApiResponse> {
    if (req.method && !['GET', 'POST'].includes(req.method.toUpperCase())) {
      return { status: 405, body: { error: 'Method Not Allowed' } };
    }

    const authResult = await requireAdminCaller(req);
    if (!authResult.ok) return authResult.response;

    try {
      const logs = await store.listAuditLogs(50, authResult.bearerToken);
      return {
        status: 200,
        body: { ok: true, logs },
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Không thể tải nhật ký quản trị câu hỏi.';
      return {
        status: 500,
        body: { error: msg, code: 'AUDIT_LOGS_FETCH_FAILED' },
      };
    }
  }

  return {
    handleGetSchoolQuestionBank,
    handleAdminQuestionAction,
    handleGetQuestionAuditLogs,
  };
}
