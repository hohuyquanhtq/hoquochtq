import type {
  CurriculumConfig,
  CurriculumImportLog,
  CurriculumImportMode,
  CurriculumLesson,
  SubjectItem,
} from '../src/types/index.ts';
import { DEFAULT_GDPT_2018_SUBJECTS } from '../src/constants/subjects.ts';
import {
  planCurriculumImport,
  validateCurriculumImportRows,
  type CurriculumImportRawRow,
} from '../src/utils/curriculumImportEngine.ts';
import {
  getFirebaseAdminDb,
  getFirebaseAdminFieldValue,
  isFirebaseAdminReady,
} from './firebaseAdmin.ts';
import {
  resolveServerFirebaseConfig,
  verifyFirebaseIdToken,
  type VerifiedFirebaseIdToken,
} from './firebaseServerAuth.ts';
import {
  decodeFirestoreDoc,
  encodeFirestoreFields,
  firestoreGetDoc,
  firestoreQueryEquals,
  firestoreSetDoc,
  type FirestoreDocument,
} from './firestoreRest.ts';
import type { ApiRequest, ApiResponse } from './examApiHandlers.ts';

const FIRESTORE_BATCH_LIMIT = 350;

export interface CurriculumImportCommitPayload {
  toAdd: CurriculumLesson[];
  toUpdate: CurriculumLesson[];
  toDeleteIds: string[];
  existingServerCreatedAtMap: Map<string, boolean>;
}

export interface CurriculumImportStore {
  verifyIdToken(token: string): Promise<VerifiedFirebaseIdToken | null>;
  isCallerAdmin(uid: string, bearerToken?: string): Promise<{ isAdmin: boolean; displayName?: string }>;
  getCurriculumConfig(bearerToken?: string): Promise<CurriculumConfig | null>;
  listLessonsBySubjects(subjectIds: string[], bearerToken?: string): Promise<CurriculumLesson[]>;
  commitLessonChanges(payload: CurriculumImportCommitPayload, bearerToken?: string): Promise<void>;
  saveImportLog(log: CurriculumImportLog, bearerToken?: string): Promise<void>;
  listImportLogs(limit: number, bearerToken?: string): Promise<CurriculumImportLog[]>;
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

function stripUndefinedShallow(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) {
      out[k] = v;
    }
  }
  return out;
}

function getDatabaseBaseUrl(): string {
  const { projectId, databaseId } = resolveServerFirebaseConfig();
  if (!projectId) {
    throw new Error('Missing Firebase projectId configuration.');
  }
  return `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/${encodeURIComponent(databaseId)}`;
}

async function commitRestWritesInBatches(
  writes: Record<string, unknown>[],
  bearerToken: string
): Promise<void> {
  if (writes.length === 0) return;
  const base = getDatabaseBaseUrl();
  for (let i = 0; i < writes.length; i += FIRESTORE_BATCH_LIMIT) {
    const chunk = writes.slice(i, i + FIRESTORE_BATCH_LIMIT);
    const res = await fetch(`${base}/documents:commit`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${bearerToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ writes: chunk }),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      const err = new Error(`Firestore batch commit failed (${res.status}): ${txt}`);
      (err as Error & { status?: number }).status = res.status;
      throw err;
    }
  }
}

export function createFirestoreCurriculumImportStore(): CurriculumImportStore {
  return {
    verifyIdToken: (token) => verifyFirebaseIdToken(token),

    async isCallerAdmin(uid, bearerToken) {
      let isAdmin = false;
      let displayName: string | undefined;
      const adminReady = isFirebaseAdminReady();

      try {
        const adminDoc = await firestoreGetDoc<{
          isActive?: boolean;
          active?: boolean;
          role?: string;
          name?: string;
          displayName?: string;
        }>('admins', uid, { bearerToken });
        if (
          adminDoc &&
          (adminDoc.isActive === true || adminDoc.active === true) &&
          adminDoc.role === 'admin'
        ) {
          isAdmin = true;
          displayName = adminDoc.name || adminDoc.displayName;
        }
      } catch (err) {
        if (adminReady) throw err;
      }

      try {
        const userDoc = await firestoreGetDoc<{
          role?: string;
          status?: string;
          name?: string;
        }>('users', uid, { bearerToken });
        if (userDoc) {
          if (!displayName && userDoc.name) {
            displayName = userDoc.name;
          }
          if (userDoc.role === 'admin' && userDoc.status === 'active') {
            isAdmin = true;
          }
        }
      } catch (err) {
        if (adminReady) throw err;
      }

      return { isAdmin, displayName };
    },

    async getCurriculumConfig(bearerToken) {
      try {
        return await firestoreGetDoc<CurriculumConfig>('curriculumConfig', 'global', { bearerToken });
      } catch {
        return null;
      }
    },

    async listLessonsBySubjects(subjectIds, bearerToken) {
      const uniqueSubjects = Array.from(new Set(subjectIds.filter(Boolean)));
      if (uniqueSubjects.length === 0) return [];

      const results: CurriculumLesson[] = [];
      for (const subjectId of uniqueSubjects) {
        const rows = await firestoreQueryEquals<CurriculumLesson & { serverCreatedAt?: unknown }>(
          'curriculumLessons',
          [{ field: 'subjectId', value: subjectId }],
          { bearerToken, limit: 2000 }
        );
        for (const r of rows) {
          if (r && typeof r.id === 'string') {
            results.push({
              ...r,
              lessonId: r.lessonId || r.id,
              status: r.status === 'inactive' ? 'inactive' : 'active',
            });
          }
        }
      }
      return results;
    },

    async commitLessonChanges(payload, bearerToken) {
      const { toAdd, toUpdate, toDeleteIds, existingServerCreatedAtMap } = payload;

      if (isFirebaseAdminReady()) {
        const db = getFirebaseAdminDb();
        const FieldValue = getFirebaseAdminFieldValue();

        type Op =
          | { kind: 'add'; lesson: CurriculumLesson }
          | { kind: 'update'; lesson: CurriculumLesson }
          | { kind: 'delete'; id: string };

        const ops: Op[] = [
          ...toAdd.map((lesson): Op => ({ kind: 'add', lesson })),
          ...toUpdate.map((lesson): Op => ({ kind: 'update', lesson })),
          ...toDeleteIds.map((id): Op => ({ kind: 'delete', id })),
        ];

        for (let i = 0; i < ops.length; i += FIRESTORE_BATCH_LIMIT) {
          const chunk = ops.slice(i, i + FIRESTORE_BATCH_LIMIT);
          const batch = db.batch();

          for (const op of chunk) {
            if (op.kind === 'add') {
              const ref = db.collection('curriculumLessons').doc(op.lesson.id);
              const data = stripUndefinedShallow({
                ...op.lesson,
                serverCreatedAt: FieldValue.serverTimestamp(),
                serverUpdatedAt: FieldValue.serverTimestamp(),
              });
              batch.set(ref, data);
            } else if (op.kind === 'update') {
              const ref = db.collection('curriculumLessons').doc(op.lesson.id);
              const hasCreatedTs = existingServerCreatedAtMap.get(op.lesson.id) === true;
              const data = stripUndefinedShallow({
                ...op.lesson,
                ...(hasCreatedTs ? {} : { serverCreatedAt: FieldValue.serverTimestamp() }),
                serverUpdatedAt: FieldValue.serverTimestamp(),
              });
              batch.set(ref, data, { merge: true });
            } else {
              const ref = db.collection('curriculumLessons').doc(op.id);
              batch.delete(ref);
            }
          }

          await batch.commit();
        }
        return;
      }

      if (!bearerToken) {
        throw new Error('SERVER_CREDENTIALS_MISSING');
      }

      const { projectId, databaseId } = resolveServerFirebaseConfig();
      const docPrefix = `projects/${projectId}/databases/${databaseId}/documents/curriculumLessons`;
      const writes: Record<string, unknown>[] = [];

      for (const lesson of toAdd) {
        const cleanData = stripUndefinedShallow({ ...lesson });
        writes.push({
          update: {
            name: `${docPrefix}/${lesson.id}`,
            fields: encodeFirestoreFields(cleanData),
          },
          updateTransforms: [
            { fieldPath: 'serverCreatedAt', setToServerValue: 'REQUEST_TIME' },
            { fieldPath: 'serverUpdatedAt', setToServerValue: 'REQUEST_TIME' },
          ],
        });
      }

      for (const lesson of toUpdate) {
        const cleanData = stripUndefinedShallow({ ...lesson });
        delete cleanData.serverCreatedAt;
        delete cleanData.serverUpdatedAt;
        const fieldPaths = Object.keys(cleanData);
        const hasCreatedTs = existingServerCreatedAtMap.get(lesson.id) === true;
        const transforms = hasCreatedTs
          ? [{ fieldPath: 'serverUpdatedAt', setToServerValue: 'REQUEST_TIME' }]
          : [
              { fieldPath: 'serverCreatedAt', setToServerValue: 'REQUEST_TIME' },
              { fieldPath: 'serverUpdatedAt', setToServerValue: 'REQUEST_TIME' },
            ];
        writes.push({
          update: {
            name: `${docPrefix}/${lesson.id}`,
            fields: encodeFirestoreFields(cleanData),
          },
          updateMask: { fieldPaths },
          updateTransforms: transforms,
        });
      }

      for (const id of toDeleteIds) {
        writes.push({
          delete: `${docPrefix}/${id}`,
        });
      }

      await commitRestWritesInBatches(writes, bearerToken);
    },

    async saveImportLog(log, bearerToken) {
      const payload = stripUndefinedShallow({
        id: log.id,
        fileName: log.fileName,
        actorUid: log.actorUid,
        actorName: log.actorName,
        actorEmail: log.actorEmail,
        importedAt: log.importedAt,
        mode: log.mode,
        subjectsCount: log.subjectsCount,
        gradesCount: log.gradesCount,
        chaptersCount: log.chaptersCount,
        lessonsCount: log.lessonsCount,
        addedCount: log.addedCount,
        updatedCount: log.updatedCount,
        skippedCount: log.skippedCount,
        deletedCount: log.deletedCount,
        errorCount: log.errorCount,
        duplicateCount: log.duplicateCount,
        ...(log.textbooks && log.textbooks.length > 0
          ? { textbooks: log.textbooks.slice(0, 30) }
          : {}),
      });

      await firestoreSetDoc('curriculumImportLogs', log.id, payload, {
        bearerToken,
        serverTimestampFields: ['serverCreatedAt'],
      });
    },

    async listImportLogs(limit, bearerToken) {
      const safeLimit = Math.max(1, Math.min(100, limit || 50));

      if (isFirebaseAdminReady()) {
        const db = getFirebaseAdminDb();
        const snap = await db.collection('curriculumImportLogs').limit(safeLimit * 2).get();
        const logs: CurriculumImportLog[] = snap.docs.map((doc) => {
          const data = doc.data() as Record<string, unknown>;
          return {
            id: String(data.id || doc.id),
            fileName: String(data.fileName || ''),
            actorUid: String(data.actorUid || ''),
            actorName: String(data.actorName || ''),
            actorEmail: String(data.actorEmail || ''),
            importedAt: String(data.importedAt || ''),
            mode: data.mode === 'sync' ? 'sync' : 'append',
            subjectsCount: Number(data.subjectsCount || 0),
            gradesCount: Number(data.gradesCount || 0),
            chaptersCount: Number(data.chaptersCount || 0),
            lessonsCount: Number(data.lessonsCount || 0),
            addedCount: Number(data.addedCount || 0),
            updatedCount: Number(data.updatedCount || 0),
            skippedCount: Number(data.skippedCount || 0),
            deletedCount: Number(data.deletedCount || 0),
            errorCount: Number(data.errorCount || 0),
            duplicateCount: Number(data.duplicateCount || 0),
            textbooks: Array.isArray(data.textbooks) ? data.textbooks.map(String) : undefined,
          };
        });
        return logs
          .sort((a, b) => (b.importedAt || '').localeCompare(a.importedAt || ''))
          .slice(0, safeLimit);
      }

      if (!bearerToken) {
        throw new Error('SERVER_CREDENTIALS_MISSING');
      }

      const base = getDatabaseBaseUrl();
      const res = await fetch(`${base}/documents/curriculumImportLogs?pageSize=${safeLimit * 2}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${bearerToken}` },
      });

      if (res.status === 404) return [];
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error(`Firestore LIST curriculumImportLogs failed (${res.status}): ${txt}`);
      }

      const body = (await res.json()) as { documents?: FirestoreDocument[] };
      const logs = (body.documents || []).map((doc) => decodeFirestoreDoc<CurriculumImportLog>(doc));
      return logs
        .sort((a, b) => (b.importedAt || '').localeCompare(a.importedAt || ''))
        .slice(0, safeLimit);
    },
  };
}

interface CurriculumImportRequestBody {
  fileName?: string;
  mode?: CurriculumImportMode;
  rows?: CurriculumImportRawRow[];
  configuredTextbooks?: string[];
  defaultTextbookYear?: string;
  subjects?: SubjectItem[];
  confirmDeleteMissing?: boolean;
  confirmedDeleteIds?: string[];
  clientErrorCount?: number;
  clientDuplicateCount?: number;
  finalizeLog?: boolean;
  logTotals?: {
    subjectsCount: number;
    gradesCount: number;
    chaptersCount: number;
    lessonsCount: number;
    priorAddedCount?: number;
    priorUpdatedCount?: number;
    priorSkippedCount?: number;
    priorDeletedCount?: number;
    errorCount: number;
    duplicateCount: number;
    textbooks?: string[];
  };
}

function safeNonNegInt(val: unknown): number {
  const n = Number(val);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(100000, Math.round(n));
}

export function createCurriculumImportHandlers(
  store: CurriculumImportStore = createFirestoreCurriculumImportStore()
) {
  async function handleImportCurriculum(req: ApiRequest): Promise<ApiResponse> {
    if (req.method !== 'POST') {
      return { status: 405, body: { error: 'Phương thức không được hỗ trợ.', code: 'METHOD_NOT_ALLOWED' } };
    }

    const bearer = extractBearerToken(req.headers);
    if (!bearer) {
      return {
        status: 401,
        body: { error: 'Thiếu token xác thực Firebase.', code: 'UNAUTHORIZED' },
      };
    }

    const caller = await store.verifyIdToken(bearer);
    if (!caller) {
      return {
        status: 401,
        body: { error: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.', code: 'INVALID_TOKEN' },
      };
    }

    const adminCheck = await store.isCallerAdmin(caller.uid, bearer);
    if (!adminCheck.isAdmin) {
      return {
        status: 403,
        body: {
          error: 'Chỉ Quản trị viên (Admin) mới có quyền import danh mục Chương & Bài học SGK.',
          code: 'FORBIDDEN',
        },
      };
    }

    const body = (req.body || {}) as CurriculumImportRequestBody;
    const mode: CurriculumImportMode | null =
      body.mode === 'append' || body.mode === 'sync' ? body.mode : null;
    if (!mode) {
      return {
        status: 400,
        body: {
          error: 'Chế độ import không hợp lệ. Chỉ chấp nhận "append" (Bổ sung) hoặc "sync" (Đồng bộ).',
          code: 'INVALID_MODE',
        },
      };
    }

    const rawRows = Array.isArray(body.rows) ? body.rows : [];
    const confirmDeleteMissing = body.confirmDeleteMissing === true;
    const confirmedDeleteIds = Array.isArray(body.confirmedDeleteIds)
      ? body.confirmedDeleteIds.map((x) => String(x || '').trim()).filter(Boolean)
      : [];

    if (rawRows.length === 0 && !(mode === 'sync' && confirmDeleteMissing && confirmedDeleteIds.length > 0)) {
      return {
        status: 400,
        body: {
          error: 'Không có dòng dữ liệu hợp lệ nào để import.',
          code: 'EMPTY_ROWS',
        },
      };
    }

    if (rawRows.length > 2000) {
      return {
        status: 400,
        body: {
          error: 'Mỗi yêu cầu import tối đa 2000 dòng. Vui lòng chia nhỏ batch.',
          code: 'PAYLOAD_TOO_LARGE',
        },
      };
    }

    const config = await store.getCurriculumConfig(bearer);
    const configuredTextbooks = Array.from(
      new Set([
        ...(Array.isArray(body.configuredTextbooks) ? body.configuredTextbooks : []),
        ...(config?.textbookSeries ? [config.textbookSeries] : []),
      ].filter((x) => typeof x === 'string' && x.trim().length > 0))
    );
    const defaultTextbookYear =
      (typeof body.defaultTextbookYear === 'string' && body.defaultTextbookYear.trim()) ||
      config?.textbookYear ||
      '2025-2026';

    const subjects =
      Array.isArray(body.subjects) && body.subjects.length > 0
        ? body.subjects
        : DEFAULT_GDPT_2018_SUBJECTS;

    // Server-side validation: NEVER write invalid or duplicate rows to Firestore
    const validation = validateCurriculumImportRows(rawRows, {
      subjects,
      configuredTextbooks,
      defaultTextbookYear,
    });

    if (validation.errors.length > 0 || validation.duplicates.length > 0) {
      return {
        status: 400,
        body: {
          error: `Phát hiện ${validation.errors.length} dòng lỗi và ${validation.duplicates.length} dòng trùng lặp. Hệ thống từ chối ghi dữ liệu lỗi lên Firestore.`,
          code: 'VALIDATION_FAILED',
          errors: validation.errors,
          duplicates: validation.duplicates,
          stats: validation.stats,
        },
      };
    }

    const affectedSubjectIds = Array.from(new Set(validation.validRows.map((r) => r.subjectId)));
    const existingLessonsRaw = await store.listLessonsBySubjects(affectedSubjectIds, bearer);

    const existingServerCreatedAtMap = new Map<string, boolean>();
    for (const ex of existingLessonsRaw) {
      const rec = ex as CurriculumLesson & { serverCreatedAt?: unknown };
      existingServerCreatedAtMap.set(ex.id, Boolean(rec.serverCreatedAt));
    }

    const plan = planCurriculumImport(validation.validRows, existingLessonsRaw, mode, caller.uid);

    // Strictly guard deletions: only in sync mode, only with explicit confirmation, and ONLY IDs actually in missingInFile
    const allowedMissingIdSet = new Set(plan.missingInFile.map((m) => m.id));
    const toDeleteIds =
      mode === 'sync' && confirmDeleteMissing
        ? Array.from(new Set(confirmedDeleteIds.filter((id) => allowedMissingIdSet.has(id))))
        : [];

    await store.commitLessonChanges(
      {
        toAdd: plan.toAdd,
        toUpdate: plan.toUpdate,
        toDeleteIds,
        existingServerCreatedAtMap,
      },
      bearer
    );

    const addedCount = plan.toAdd.length;
    const updatedCount = plan.toUpdate.length;
    const skippedCount = plan.skipped.length;
    const deletedCount = toDeleteIds.length;

    let savedLog: CurriculumImportLog | null = null;
    const shouldFinalizeLog = body.finalizeLog !== false;

    if (shouldFinalizeLog) {
      const nowIso = new Date().toISOString();
      const randSuffix = Math.random().toString(36).slice(2, 8);
      const logId = `imp_${Date.now()}_${randSuffix}`;
      const cleanFileName =
        (typeof body.fileName === 'string' && body.fileName.trim().slice(0, 260)) ||
        'curriculum_import.xlsx';
      const actorName = (adminCheck.displayName || caller.name || caller.email || caller.uid)
        .trim()
        .slice(0, 200);
      const actorEmail = (caller.email || '').trim().slice(0, 200);

      const totals = body.logTotals;
      savedLog = {
        id: logId,
        fileName: cleanFileName,
        actorUid: caller.uid,
        actorName: actorName || 'Admin',
        actorEmail,
        importedAt: nowIso,
        mode,
        subjectsCount: totals ? safeNonNegInt(totals.subjectsCount) : validation.stats.totalSubjects,
        gradesCount: totals ? safeNonNegInt(totals.gradesCount) : validation.stats.totalGrades,
        chaptersCount: totals ? safeNonNegInt(totals.chaptersCount) : validation.stats.totalChapters,
        lessonsCount: totals ? safeNonNegInt(totals.lessonsCount) : validation.stats.totalLessons,
        addedCount: totals ? safeNonNegInt(totals.priorAddedCount) + addedCount : addedCount,
        updatedCount: totals ? safeNonNegInt(totals.priorUpdatedCount) + updatedCount : updatedCount,
        skippedCount: totals ? safeNonNegInt(totals.priorSkippedCount) + skippedCount : skippedCount,
        deletedCount: totals ? safeNonNegInt(totals.priorDeletedCount) + deletedCount : deletedCount,
        errorCount: totals ? safeNonNegInt(totals.errorCount) : safeNonNegInt(body.clientErrorCount),
        duplicateCount: totals
          ? safeNonNegInt(totals.duplicateCount)
          : safeNonNegInt(body.clientDuplicateCount),
        textbooks:
          totals?.textbooks && totals.textbooks.length > 0
            ? totals.textbooks.slice(0, 30)
            : validation.stats.detectedTextbooks.slice(0, 30),
      };

      await store.saveImportLog(savedLog, bearer);
    }

    return {
      status: 200,
      body: {
        ok: true,
        mode,
        addedCount,
        updatedCount,
        skippedCount,
        deletedCount,
        missingInFileCount: plan.missingInFile.length,
        affectedScopes: plan.affectedScopes,
        log: savedLog,
      },
    };
  }

  async function handleGetCurriculumImportHistory(req: ApiRequest): Promise<ApiResponse> {
    if (req.method !== 'GET' && req.method !== 'POST') {
      return { status: 405, body: { error: 'Phương thức không được hỗ trợ.', code: 'METHOD_NOT_ALLOWED' } };
    }

    const bearer = extractBearerToken(req.headers);
    if (!bearer) {
      return {
        status: 401,
        body: { error: 'Thiếu token xác thực Firebase.', code: 'UNAUTHORIZED' },
      };
    }

    const caller = await store.verifyIdToken(bearer);
    if (!caller) {
      return {
        status: 401,
        body: { error: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.', code: 'INVALID_TOKEN' },
      };
    }

    const adminCheck = await store.isCallerAdmin(caller.uid, bearer);
    if (!adminCheck.isAdmin) {
      return {
        status: 403,
        body: {
          error: 'Chỉ Quản trị viên (Admin) mới có quyền xem lịch sử import danh mục.',
          code: 'FORBIDDEN',
        },
      };
    }

    const logs = await store.listImportLogs(50, bearer);
    return {
      status: 200,
      body: {
        ok: true,
        logs,
      },
    };
  }

  return {
    handleImportCurriculum,
    handleGetCurriculumImportHistory,
  };
}
