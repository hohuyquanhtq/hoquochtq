import crypto from 'node:crypto';
import type { ApiRequest, ApiResponse } from './examApiHandlers.ts';
import {
  classifyFirestoreError,
  formatFirebaseAdminErrorMessage,
  getFirebaseAdminDb,
  getFirebaseAdminFieldValue,
  getFirebaseAdminState,
  logFirebaseAdminEvent,
} from './firebaseAdmin.ts';
import {
  hasServiceAccountConfigured,
  verifyFirebaseIdToken,
  type VerifiedFirebaseIdToken,
} from './firebaseServerAuth.ts';
import { firestoreGetDoc } from './firestoreRest.ts';
import { normalizeExamCodeServer } from './serverGrading.ts';

export const EXAM_LINK_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const NEW_PUBLIC_CODE_REGEX = /^[A-HJ-NP-Z2-9]{6}$/;
const LEGACY_PUBLIC_CODE_REGEX = /^[0-9]{6}$/;
const SAFE_DOC_ID_REGEX = /^[a-zA-Z0-9_-]{1,128}$/;
const MAX_ALLOCATION_ATTEMPTS = 30;

export interface PublicExamLinkDoc {
  publicCode: string;
  examId: string;
  examCode: string;
  ownerId: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  serverUpdatedAt?: unknown;
}

export interface PublicExamLinkAllocationResult {
  publicCode: string;
  alreadyExisted: boolean;
  examId: string;
  examCode: string;
  ownerId: string;
  isActive: boolean;
}

export interface PublicExamLinkStore {
  hasAdminAccess(): boolean;
  getAdminError(): { code: string | null; message: string };
  verifyIdToken(token: string): Promise<VerifiedFirebaseIdToken | null>;
  getUserRoleInfo(
    uid: string,
    bearerToken?: string
  ): Promise<{ role?: string; status?: string; isAdmin: boolean }>;
  allocatePublicCodeTransaction(params: {
    examId: string;
    examCode: string;
    callerUid: string;
    isAdmin: boolean;
    isPublished: boolean;
    existingPublicCode?: string | null;
    codeGenerator?: () => string;
  }): Promise<PublicExamLinkAllocationResult>;
  syncLinkStatus(params: {
    action: 'set_active' | 'delete';
    examId: string;
    examCode: string;
    publicCode?: string | null;
    callerUid: string;
    isAdmin: boolean;
    isActive?: boolean;
  }): Promise<{ ok: boolean; publicCode?: string | null }>;
}

export class PublicExamLinkError extends Error {
  status: number;
  code: string;
  stage: string;

  constructor(status: number, code: string, stage: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
    this.stage = stage;
  }
}

export function isValidNewPublicCodeServer(value: unknown): value is string {
  return typeof value === 'string' && NEW_PUBLIC_CODE_REGEX.test(value.trim().toUpperCase());
}

export function isValidLegacyNumericPublicCodeServer(value: unknown): value is string {
  return typeof value === 'string' && LEGACY_PUBLIC_CODE_REGEX.test(value.trim());
}

export function normalizePublicCodeServer(value: unknown): string {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (LEGACY_PUBLIC_CODE_REGEX.test(trimmed)) return trimmed;
  const upper = trimmed.toUpperCase();
  return NEW_PUBLIC_CODE_REGEX.test(upper) ? upper : '';
}

export function isValidSixDigitPublicCodeServer(value: unknown): value is string {
  return normalizePublicCodeServer(value) !== '';
}

/**
 * Generates a cryptographically random 6-character uppercase alphanumeric code
 * excluding ambiguous characters (O, 0, I, 1).
 */
export function generateAlphanumericPublicCode(): string {
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += EXAM_LINK_ALPHABET[crypto.randomInt(0, EXAM_LINK_ALPHABET.length)];
  }
  return code;
}

export function generateSixDigitPublicCode(): string {
  return generateAlphanumericPublicCode();
}

function sanitizeDocId(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const cleaned = raw.trim().replace(/[^a-zA-Z0-9_-]/g, '_');
  return SAFE_DOC_ID_REGEX.test(cleaned) ? cleaned : '';
}

function readBearerToken(req: ApiRequest): string {
  const raw = req.headers?.authorization || req.headers?.Authorization;
  const headerVal = Array.isArray(raw) ? raw[0] : raw;
  if (typeof headerVal !== 'string') return '';
  const match = headerVal.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

function parseJsonBody(body: unknown): Record<string, unknown> {
  if (!body) return {};
  if (typeof body === 'string') {
    try {
      const parsed = JSON.parse(body);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  }
  if (typeof body === 'object' && !Array.isArray(body)) {
    return body as Record<string, unknown>;
  }
  return {};
}

export function createFirestorePublicExamLinkStore(): PublicExamLinkStore {
  return {
    hasAdminAccess: () => hasServiceAccountConfigured(),

    getAdminError() {
      const state = getFirebaseAdminState();
      const errorCode = state.errorCode || 'ADMIN_INIT_ERROR';
      return {
        code: errorCode,
        message: formatFirebaseAdminErrorMessage(errorCode, state.errorDetail),
      };
    },

    verifyIdToken: (token) => verifyFirebaseIdToken(token),

    async getUserRoleInfo(uid, bearerToken) {
      let isAdmin = false;
      let role: string | undefined;
      let status: string | undefined;

      const adminDoc = await firestoreGetDoc<{ isActive?: boolean; active?: boolean; role?: string }>(
        'admins',
        uid,
        { bearerToken }
      ).catch(() => null);
      if (
        adminDoc &&
        (adminDoc.isActive === true || adminDoc.active === true) &&
        adminDoc.role === 'admin'
      ) {
        isAdmin = true;
      }

      const userDoc = await firestoreGetDoc<{ role?: string; status?: string }>('users', uid, {
        bearerToken,
      }).catch(() => null);
      if (userDoc) {
        role = userDoc.role;
        status = userDoc.status;
        if (role === 'admin' && status === 'active') {
          isAdmin = true;
        }
      }

      return { role, status, isAdmin };
    },

    async allocatePublicCodeTransaction({
      examId,
      examCode,
      callerUid,
      isAdmin,
      isPublished,
      existingPublicCode,
      codeGenerator = generateAlphanumericPublicCode,
    }) {
      const db = getFirebaseAdminDb();
      const FieldValue = getFirebaseAdminFieldValue();

      return db.runTransaction(async (tx) => {
        const masterRef = db.collection('exams').doc(examId);
        const statusRef = db.collection('examStatus').doc(examCode);
        const pubRef = db.collection('publicExams').doc(examCode);
        const linksCol = db.collection('examLinks');

        const [masterSnap, statusSnap, pubSnap] = await Promise.all([
          tx.get(masterRef),
          tx.get(statusRef),
          tx.get(pubRef),
        ]);

        const masterData = masterSnap.exists ? (masterSnap.data() as Record<string, unknown>) : null;
        const statusData = statusSnap.exists ? (statusSnap.data() as Record<string, unknown>) : null;
        const pubData = pubSnap.exists ? (pubSnap.data() as Record<string, unknown>) : null;

        const existingOwner = String(
          masterData?.ownerId || statusData?.ownerId || pubData?.ownerId || ''
        ).trim();
        if (existingOwner && !isAdmin && existingOwner !== callerUid) {
          throw new PublicExamLinkError(
            403,
            'DATABASE_PERMISSION_ERROR',
            'ownership_check',
            'Bạn không phải chủ sở hữu của đề thi này.'
          );
        }

        const resolvedOwnerId = existingOwner || callerUid;
        const resolvedIsPublished =
          typeof statusData?.isPublished === 'boolean'
            ? statusData.isPublished
            : typeof masterData?.isPublished === 'boolean'
            ? masterData.isPublished
            : Boolean(isPublished);
        const nowIso = new Date().toISOString();

        // Check if this exam already has a permanently assigned valid publicCode (alphanumeric or legacy 6-digit)
        const candidateExistingList = [
          masterData?.publicCode,
          statusData?.publicCode,
          pubData?.publicCode,
          existingPublicCode,
        ]
          .map((v) => normalizePublicCodeServer(v))
          .filter(Boolean);

        const existingCodeToReuse = candidateExistingList[0] || '';
        if (existingCodeToReuse) {
          const existingLinkRef = linksCol.doc(existingCodeToReuse);
          const existingLinkSnap = await tx.get(existingLinkRef);

          if (!existingLinkSnap.exists) {
            tx.create(existingLinkRef, {
              publicCode: existingCodeToReuse,
              examId,
              examCode,
              ownerId: resolvedOwnerId,
              isActive: resolvedIsPublished,
              createdAt: nowIso,
              updatedAt: nowIso,
              serverUpdatedAt: FieldValue.serverTimestamp(),
            });
            if (masterSnap.exists) {
              tx.update(masterRef, {
                publicCode: existingCodeToReuse,
                updatedAt: nowIso,
                serverUpdatedAt: FieldValue.serverTimestamp(),
              });
            }
            if (statusSnap.exists) {
              tx.update(statusRef, {
                publicCode: existingCodeToReuse,
                updatedAt: nowIso,
                serverUpdatedAt: FieldValue.serverTimestamp(),
              });
            }
            if (pubSnap.exists) {
              tx.update(pubRef, {
                publicCode: existingCodeToReuse,
                updatedAt: nowIso,
                serverUpdatedAt: FieldValue.serverTimestamp(),
              });
            }
            return {
              publicCode: existingCodeToReuse,
              alreadyExisted: true,
              examId,
              examCode,
              ownerId: resolvedOwnerId,
              isActive: resolvedIsPublished,
            };
          }

          const linkData = existingLinkSnap.data() as Partial<PublicExamLinkDoc>;
          const sameExam =
            linkData.examId === examId ||
            (typeof linkData.examCode === 'string' &&
              normalizeExamCodeServer(linkData.examCode) === examCode &&
              (!linkData.ownerId || linkData.ownerId === resolvedOwnerId || isAdmin));

          if (sameExam) {
            if (
              linkData.isActive !== resolvedIsPublished ||
              linkData.examCode !== examCode ||
              linkData.examId !== examId
            ) {
              tx.update(existingLinkRef, {
                examId,
                examCode,
                ownerId: resolvedOwnerId,
                isActive: resolvedIsPublished,
                updatedAt: nowIso,
                serverUpdatedAt: FieldValue.serverTimestamp(),
              });
            }
            if (masterSnap.exists && masterData?.publicCode !== existingCodeToReuse) {
              tx.update(masterRef, {
                publicCode: existingCodeToReuse,
                updatedAt: nowIso,
                serverUpdatedAt: FieldValue.serverTimestamp(),
              });
            }
            if (statusSnap.exists && statusData?.publicCode !== existingCodeToReuse) {
              tx.update(statusRef, {
                publicCode: existingCodeToReuse,
                updatedAt: nowIso,
                serverUpdatedAt: FieldValue.serverTimestamp(),
              });
            }
            if (pubSnap.exists && pubData?.publicCode !== existingCodeToReuse) {
              tx.update(pubRef, {
                publicCode: existingCodeToReuse,
                updatedAt: nowIso,
                serverUpdatedAt: FieldValue.serverTimestamp(),
              });
            }
            return {
              publicCode: existingCodeToReuse,
              alreadyExisted: true,
              examId,
              examCode,
              ownerId: resolvedOwnerId,
              isActive: resolvedIsPublished,
            };
          }
        }

        // Check by query if an examLinks doc already exists for examId (only read before write)
        const existingByExamQuery = await tx.get(
          linksCol.where('examId', '==', examId).limit(1)
        );
        if (!existingByExamQuery.empty) {
          const foundDoc = existingByExamQuery.docs[0];
          const foundData = foundDoc.data() as Partial<PublicExamLinkDoc>;
          const stableCode = normalizePublicCodeServer(foundDoc.id);
          if (stableCode) {
            if (
              foundData.isActive !== resolvedIsPublished ||
              foundData.examCode !== examCode
            ) {
              tx.update(foundDoc.ref, {
                examCode,
                isActive: resolvedIsPublished,
                updatedAt: nowIso,
                serverUpdatedAt: FieldValue.serverTimestamp(),
              });
            }
            if (masterSnap.exists && masterData?.publicCode !== stableCode) {
              tx.update(masterRef, {
                publicCode: stableCode,
                updatedAt: nowIso,
                serverUpdatedAt: FieldValue.serverTimestamp(),
              });
            }
            if (statusSnap.exists && statusData?.publicCode !== stableCode) {
              tx.update(statusRef, {
                publicCode: stableCode,
                updatedAt: nowIso,
                serverUpdatedAt: FieldValue.serverTimestamp(),
              });
            }
            if (pubSnap.exists && pubData?.publicCode !== stableCode) {
              tx.update(pubRef, {
                publicCode: stableCode,
                updatedAt: nowIso,
                serverUpdatedAt: FieldValue.serverTimestamp(),
              });
            }
            return {
              publicCode: stableCode,
              alreadyExisted: true,
              examId,
              examCode,
              ownerId: resolvedOwnerId,
              isActive: resolvedIsPublished,
            };
          }
        }

        // Allocate a fresh unique 6-character alphanumeric code atomically
        const tried = new Set<string>();
        for (let attempt = 0; attempt < MAX_ALLOCATION_ATTEMPTS; attempt++) {
          const candidate = normalizePublicCodeServer(String(codeGenerator()));
          if (!candidate || tried.has(candidate)) {
            continue;
          }
          tried.add(candidate);

          const linkRef = linksCol.doc(candidate);
          const linkSnap = await tx.get(linkRef);
          if (!linkSnap.exists) {
            tx.create(linkRef, {
              publicCode: candidate,
              examId,
              examCode,
              ownerId: resolvedOwnerId,
              isActive: resolvedIsPublished,
              createdAt: nowIso,
              updatedAt: nowIso,
              serverUpdatedAt: FieldValue.serverTimestamp(),
            });

            if (masterSnap.exists) {
              tx.update(masterRef, {
                publicCode: candidate,
                updatedAt: nowIso,
                serverUpdatedAt: FieldValue.serverTimestamp(),
              });
            }
            if (statusSnap.exists) {
              tx.update(statusRef, {
                publicCode: candidate,
                updatedAt: nowIso,
                serverUpdatedAt: FieldValue.serverTimestamp(),
              });
            }
            if (pubSnap.exists) {
              tx.update(pubRef, {
                publicCode: candidate,
                updatedAt: nowIso,
                serverUpdatedAt: FieldValue.serverTimestamp(),
              });
            }

            return {
              publicCode: candidate,
              alreadyExisted: false,
              examId,
              examCode,
              ownerId: resolvedOwnerId,
              isActive: resolvedIsPublished,
            };
          }
        }

        throw new PublicExamLinkError(
          409,
          'EXAM_SAVE_ERROR',
          'allocate_public_code',
          'Không thể cấp mã truy cập 6 ký tự duy nhất sau nhiều lần thử. Vui lòng thử lại.'
        );
      });
    },

    async syncLinkStatus({
      action,
      examId,
      examCode,
      publicCode,
      callerUid,
      isAdmin,
      isActive,
    }) {
      const db = getFirebaseAdminDb();
      const FieldValue = getFirebaseAdminFieldValue();
      const linksCol = db.collection('examLinks');

      const docsToHandle: Array<{ ref: FirebaseFirestore.DocumentReference; data: Partial<PublicExamLinkDoc> }> = [];
      const cleanPublicCode = normalizePublicCodeServer(publicCode);
      if (cleanPublicCode) {
        const directRef = linksCol.doc(cleanPublicCode);
        const directSnap = await directRef.get();
        if (directSnap.exists) {
          docsToHandle.push({
            ref: directRef,
            data: directSnap.data() as Partial<PublicExamLinkDoc>,
          });
        }
      }

      if (docsToHandle.length === 0 && examId) {
        const byExamSnap = await linksCol.where('examId', '==', examId).get();
        byExamSnap.docs.forEach((d) => {
          docsToHandle.push({
            ref: d.ref,
            data: d.data() as Partial<PublicExamLinkDoc>,
          });
        });
      }

      if (docsToHandle.length === 0 && examCode) {
        const byCodeSnap = await linksCol.where('examCode', '==', examCode).get();
        byCodeSnap.docs.forEach((d) => {
          docsToHandle.push({
            ref: d.ref,
            data: d.data() as Partial<PublicExamLinkDoc>,
          });
        });
      }

      if (docsToHandle.length === 0) {
        return { ok: true, publicCode: publicCode || null };
      }

      for (const item of docsToHandle) {
        const docOwner = String(item.data.ownerId || '').trim();
        if (docOwner && !isAdmin && docOwner !== callerUid) {
          throw new PublicExamLinkError(
            403,
            'DATABASE_PERMISSION_ERROR',
            'ownership_check',
            'Bạn không có quyền thay đổi liên kết của đề thi này.'
          );
        }
      }

      const nowIso = new Date().toISOString();
      if (action === 'delete') {
        await Promise.all(docsToHandle.map((item) => item.ref.delete()));
        return { ok: true, publicCode: docsToHandle[0].ref.id };
      }

      await Promise.all(
        docsToHandle.map((item) =>
          item.ref.update({
            isActive: Boolean(isActive),
            updatedAt: nowIso,
            serverUpdatedAt: FieldValue.serverTimestamp(),
          })
        )
      );
      return { ok: true, publicCode: docsToHandle[0].ref.id };
    },
  };
}

export function createPublicExamLinkHandlers(
  store: PublicExamLinkStore = createFirestorePublicExamLinkStore()
) {
  return {
    async handleAllocatePublicCode(req: ApiRequest): Promise<ApiResponse> {
      const apiName = 'POST /api/exams/allocate-public-code';
      let stage = 'method_check';
      if (req.method !== 'POST') {
        return {
          status: 405,
          body: { stage, errorStage: stage, code: 'API_ROUTE_ERROR', error: 'Method Not Allowed' },
        };
      }

      stage = 'auth_verify_id_token';
      const bearer = readBearerToken(req);
      if (!bearer) {
        return {
          status: 401,
          body: {
            stage,
            errorStage: stage,
            code: 'AUTH_ERROR',
            error: 'Thiếu token xác thực giáo viên.',
          },
        };
      }

      const caller = await store.verifyIdToken(bearer);
      if (!caller) {
        return {
          status: 401,
          body: {
            stage,
            errorStage: stage,
            code: 'AUTH_ERROR',
            error: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn. Vui lòng đăng nhập lại.',
          },
        };
      }

      stage = 'validate_request_body';
      const body = parseJsonBody(req.body);
      const examId = sanitizeDocId(body.examId);
      const examCode = normalizeExamCodeServer(String(body.examCode || ''));
      const isPublished = body.isPublished !== false;
      const normalizedExisting = normalizePublicCodeServer(body.existingPublicCode);
      const existingPublicCode = normalizedExisting || null;

      if (!examId || !examCode || !/^[A-Z0-9-]{2,32}$/.test(examCode)) {
        return {
          status: 400,
          body: {
            stage,
            errorStage: stage,
            code: 'EXAM_SAVE_ERROR',
            error: 'Thiếu hoặc sai định dạng examId / examCode.',
          },
        };
      }

      stage = 'admin_sdk_check';
      if (!store.hasAdminAccess()) {
        const diag = store.getAdminError();
        logFirebaseAdminEvent({
          api: apiName,
          errorStage: stage,
          errorType: 'AdminSdkNotReady',
          errorCode: diag.code,
          message: diag.message,
          firestoreStatus: 'not_attempted',
        });
        return {
          status: 503,
          body: {
            stage,
            errorStage: stage,
            code: diag.code || 'CONFIG_MISSING',
            error: diag.message,
          },
        };
      }

      try {
        stage = 'role_check';
        const roleInfo = await store.getUserRoleInfo(caller.uid, bearer);
        const canManage =
          roleInfo.isAdmin || (roleInfo.role === 'teacher' && roleInfo.status === 'active');
        if (!canManage) {
          return {
            status: 403,
            body: {
              stage,
              errorStage: stage,
              code: 'DATABASE_PERMISSION_ERROR',
              error:
                'Chỉ tài khoản giáo viên đang hoạt động hoặc quản trị viên mới có quyền cấp mã truy cập đề thi.',
            },
          };
        }

        stage = 'allocate_public_code_transaction';
        const result = await store.allocatePublicCodeTransaction({
          examId,
          examCode,
          callerUid: caller.uid,
          isAdmin: roleInfo.isAdmin,
          isPublished,
          existingPublicCode,
        });

        return {
          status: 200,
          body: {
            ok: true,
            publicCode: result.publicCode,
            alreadyExisted: result.alreadyExisted,
            examId: result.examId,
            examCode: result.examCode,
            isActive: result.isActive,
          },
        };
      } catch (err) {
        if (err instanceof PublicExamLinkError) {
          return {
            status: err.status,
            body: {
              stage: err.stage,
              errorStage: err.stage,
              code: err.code,
              error: err.message,
            },
          };
        }
        const classified = classifyFirestoreError(err);
        const msg = err instanceof Error ? err.message : 'Lỗi cấp mã truy cập 6 chữ số.';
        logFirebaseAdminEvent({
          api: apiName,
          errorStage: stage,
          errorType: err instanceof Error ? err.name : 'Error',
          errorCode: classified,
          message: msg,
          firestoreStatus: 'write_failed',
        });
        return {
          status: classified === 'DATABASE_PERMISSION_ERROR' ? 403 : 500,
          body: {
            stage,
            errorStage: stage,
            code: classified,
            error: formatFirebaseAdminErrorMessage(classified),
          },
        };
      }
    },

    async handleSyncPublicExamLinkStatus(req: ApiRequest): Promise<ApiResponse> {
      const apiName = 'POST /api/exams/sync-link-status';
      let stage = 'method_check';
      if (req.method !== 'POST') {
        return {
          status: 405,
          body: { stage, errorStage: stage, code: 'API_ROUTE_ERROR', error: 'Method Not Allowed' },
        };
      }

      stage = 'auth_verify_id_token';
      const bearer = readBearerToken(req);
      if (!bearer) {
        return {
          status: 401,
          body: { stage, errorStage: stage, code: 'AUTH_ERROR', error: 'Thiếu token xác thực.' },
        };
      }

      const caller = await store.verifyIdToken(bearer);
      if (!caller) {
        return {
          status: 401,
          body: { stage, errorStage: stage, code: 'AUTH_ERROR', error: 'Token không hợp lệ.' },
        };
      }

      stage = 'validate_request_body';
      const body = parseJsonBody(req.body);
      const action = body.action === 'delete' ? 'delete' : 'set_active';
      const examId = sanitizeDocId(body.examId);
      const examCode = normalizeExamCodeServer(String(body.examCode || ''));
      const normalizedPublic = normalizePublicCodeServer(body.publicCode);
      const publicCode = normalizedPublic || null;
      const isActive = Boolean(body.isActive);

      if (!examId && !examCode && !publicCode) {
        return {
          status: 400,
          body: {
            stage,
            errorStage: stage,
            code: 'EXAM_SAVE_ERROR',
            error: 'Thiếu thông tin định danh đề thi để đồng bộ liên kết.',
          },
        };
      }

      stage = 'admin_sdk_check';
      if (!store.hasAdminAccess()) {
        const diag = store.getAdminError();
        return {
          status: 503,
          body: {
            stage,
            errorStage: stage,
            code: diag.code || 'CONFIG_MISSING',
            error: diag.message,
          },
        };
      }

      try {
        stage = 'role_check';
        const roleInfo = await store.getUserRoleInfo(caller.uid, bearer);
        const canManage =
          roleInfo.isAdmin || (roleInfo.role === 'teacher' && roleInfo.status === 'active');
        if (!canManage) {
          return {
            status: 403,
            body: {
              stage,
              errorStage: stage,
              code: 'DATABASE_PERMISSION_ERROR',
              error: 'Không đủ quyền cập nhật liên kết đề thi.',
            },
          };
        }

        stage = 'sync_link_status';
        const result = await store.syncLinkStatus({
          action,
          examId,
          examCode,
          publicCode,
          callerUid: caller.uid,
          isAdmin: roleInfo.isAdmin,
          isActive,
        });

        return {
          status: 200,
          body: {
            ok: result.ok,
            publicCode: result.publicCode ?? null,
          },
        };
      } catch (err) {
        if (err instanceof PublicExamLinkError) {
          return {
            status: err.status,
            body: {
              stage: err.stage,
              errorStage: err.stage,
              code: err.code,
              error: err.message,
            },
          };
        }
        const classified = classifyFirestoreError(err);
        logFirebaseAdminEvent({
          api: apiName,
          errorStage: stage,
          errorType: err instanceof Error ? err.name : 'Error',
          errorCode: classified,
          message: err instanceof Error ? err.message : 'Sync link status failed',
          firestoreStatus: 'write_failed',
        });
        return {
          status: classified === 'DATABASE_PERMISSION_ERROR' ? 403 : 500,
          body: {
            stage,
            errorStage: stage,
            code: classified,
            error: formatFirebaseAdminErrorMessage(classified),
          },
        };
      }
    },
  };
}
