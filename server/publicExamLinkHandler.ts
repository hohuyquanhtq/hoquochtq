import crypto from 'node:crypto';
import type { ApiRequest, ApiResponse } from './examApiHandlers.ts';
import {
  classifyFirestoreError,
  formatFirebaseAdminErrorMessage,
  getFirebaseAdminDb,
  getFirebaseAdminFieldValue,
  getFirebaseAdminState,
  logFirebaseAdminEvent,
  sanitizeSensitiveLogText,
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
export const MAX_ALLOCATION_ATTEMPTS = 5;
const FIRESTORE_ALLOCATE_TIMEOUT_MS = 4500;

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
  isCodeTaken?(code: string): Promise<boolean>;
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

/**
 * Generates a unique 6-character fallback code combining a compact base-32
 * timestamp prefix (3 chars) with cryptographic random entropy (3 chars),
 * strictly within EXAM_LINK_ALPHABET (excluding 0, O, 1, I).
 */
export function generateFallbackPublicCode6(nowMs: number = Date.now()): string {
  const ts = Math.abs(Math.floor(nowMs));
  const t1 = EXAM_LINK_ALPHABET[(ts >> 10) & 31];
  const t2 = EXAM_LINK_ALPHABET[(ts >> 5) & 31];
  const t3 = EXAM_LINK_ALPHABET[ts & 31];
  const r1 = EXAM_LINK_ALPHABET[crypto.randomInt(0, EXAM_LINK_ALPHABET.length)];
  const r2 = EXAM_LINK_ALPHABET[crypto.randomInt(0, EXAM_LINK_ALPHABET.length)];
  const r3 = EXAM_LINK_ALPHABET[crypto.randomInt(0, EXAM_LINK_ALPHABET.length)];
  return `${t1}${t2}${t3}${r1}${r2}${r3}`;
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`Timeout after ${ms}ms during ${label}`));
        }, ms);
      }),
    ]);
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}

function readQueryValue(req: ApiRequest, key: string): string {
  const q = req.query?.[key];
  if (typeof q === 'string') return q;
  if (Array.isArray(q) && q.length > 0) return String(q[0] || '');
  if (req.url) {
    try {
      const parsed = new URL(req.url, 'http://localhost');
      return parsed.searchParams.get(key) || '';
    } catch {
      return '';
    }
  }
  return '';
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
        (adminDoc.role === 'admin' || adminDoc.role === 'super_admin')
      ) {
        isAdmin = true;
      }

      const userDoc = await firestoreGetDoc<{ role?: string; status?: string }>('users', uid, {
        bearerToken,
      }).catch(() => null);
      if (userDoc) {
        role = userDoc.role;
        status = userDoc.status;
        if (
          (role === 'admin' || role === 'super_admin') &&
          (status === 'active' || status === 'approved')
        ) {
          isAdmin = true;
        }
      }

      return { role, status, isAdmin };
    },

    async isCodeTaken(code: string): Promise<boolean> {
      const db = getFirebaseAdminDb();
      const [linkSnap, examSnap] = await withTimeout(
        Promise.all([
          db.collection('examLinks').doc(code).get(),
          db.collection('exams').where('publicCode', '==', code).limit(1).get(),
        ]),
        FIRESTORE_ALLOCATE_TIMEOUT_MS,
        'isCodeTaken'
      );
      return linkSnap.exists || !examSnap.empty;
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

      return withTimeout(
        db.runTransaction(async (tx) => {
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

        // Allocate a fresh unique 6-character alphanumeric code atomically (max 5 attempts)
        const tried = new Set<string>();
        for (let attempt = 0; attempt < MAX_ALLOCATION_ATTEMPTS; attempt++) {
          const candidate = normalizePublicCodeServer(String(codeGenerator()));
          if (!candidate || tried.has(candidate)) {
            continue;
          }
          tried.add(candidate);

          const linkRef = linksCol.doc(candidate);
          const [linkSnap, examByPublicCodeSnap] = await Promise.all([
            tx.get(linkRef),
            tx.get(db.collection('exams').where('publicCode', '==', candidate).limit(1)),
          ]);
          if (!linkSnap.exists && examByPublicCodeSnap.empty) {
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
          'MAX_ATTEMPTS_EXCEEDED',
          'allocate_public_code',
          `Không thể cấp mã truy cập 6 ký tự duy nhất sau ${MAX_ALLOCATION_ATTEMPTS} lần thử.`
        );
      }),
      FIRESTORE_ALLOCATE_TIMEOUT_MS,
      'allocatePublicCodeTransaction'
      );
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
      const method = (req.method || 'GET').toUpperCase();
      const apiName = `${method} /api/exams/allocate-public-code`;
      let stage = 'method_check';

      const buildSafeFallbackResponse = (params: {
        reason: string;
        preferredCode?: string | null;
        preferFreshOnCollision?: boolean;
        examId?: string;
        examCode?: string;
        isPublished?: boolean;
        errorCode?: string | null;
      }): ApiResponse => {
        const reusableCode =
          !params.preferFreshOnCollision && params.preferredCode
            ? normalizePublicCodeServer(params.preferredCode)
            : '';
        const fallbackCode = reusableCode || generateFallbackPublicCode6();
        return {
          status: 200,
          body: {
            ok: true,
            publicCode: fallbackCode,
            code: fallbackCode,
            alreadyExisted: Boolean(reusableCode),
            fallback: true,
            source: 'fallback',
            ...(params.examId ? { examId: params.examId } : {}),
            ...(params.examCode ? { examCode: params.examCode } : {}),
            isActive: params.isPublished !== false,
            warning: sanitizeSensitiveLogText(params.reason),
            ...(params.errorCode ? { fallbackReasonCode: params.errorCode } : {}),
          },
        };
      };

      const generateCodeWithReadChecks = async (
        preferredCode?: string | null
      ): Promise<{ publicCode: string; fallback: boolean; reason?: string }> => {
        if (!store.hasAdminAccess() || typeof store.isCodeTaken !== 'function') {
          const diag = store.getAdminError();
          console.error('[Allocate-Code-Error]:', {
            api: apiName,
            stage: 'admin_sdk_check',
            code: diag.code,
            message: sanitizeSensitiveLogText(diag.message),
          });
          return {
            publicCode: normalizePublicCodeServer(preferredCode) || generateFallbackPublicCode6(),
            fallback: true,
            reason: diag.message,
          };
        }

        const tried = new Set<string>();
        const preferred = normalizePublicCodeServer(preferredCode);
        if (preferred) {
          tried.add(preferred);
          const taken = await store.isCodeTaken(preferred);
          if (!taken) {
            return { publicCode: preferred, fallback: false };
          }
        }

        for (let attempt = 0; attempt < MAX_ALLOCATION_ATTEMPTS; attempt++) {
          const candidate = generateAlphanumericPublicCode();
          if (tried.has(candidate)) continue;
          tried.add(candidate);
          const taken = await store.isCodeTaken(candidate);
          if (!taken) {
            return { publicCode: candidate, fallback: false };
          }
        }

        console.error('[Allocate-Code-Error]:', {
          api: apiName,
          stage: 'max_attempts_exceeded',
          attempts: MAX_ALLOCATION_ATTEMPTS,
        });
        return {
          publicCode: generateFallbackPublicCode6(),
          fallback: true,
          reason: `Đã đạt tối đa ${MAX_ALLOCATION_ATTEMPTS} lần kiểm tra trùng mã, sử dụng mã dự phòng kèm timestamp.`,
        };
      };

      try {
        if (method !== 'POST' && method !== 'GET') {
          return {
            status: 405,
            body: {
              stage,
              errorStage: stage,
              code: 'API_ROUTE_ERROR',
              error: 'Phương thức không hợp lệ. API /api/exams/allocate-public-code hỗ trợ POST và GET.',
            },
          };
        }

        const body = method === 'POST' ? parseJsonBody(req.body) : {};
        const rawExamId = body.examId ?? readQueryValue(req, 'examId');
        const rawExamCode = body.examCode ?? readQueryValue(req, 'examCode');
        const rawExistingPublicCode =
          body.existingPublicCode ?? readQueryValue(req, 'existingPublicCode');
        const examId = sanitizeDocId(rawExamId);
        const examCode = normalizeExamCodeServer(String(rawExamCode || ''));
        const isPublished = body.isPublished !== false;
        const normalizedExisting = normalizePublicCodeServer(rawExistingPublicCode);
        const existingPublicCode = normalizedExisting || null;

        // Lightweight GET (or POST without examId/examCode): generate a unique 6-char code with max 5 Firestore checks + fallback
        if (method === 'GET') {
          stage = 'get_generate_code';
          try {
            const generated = await generateCodeWithReadChecks(existingPublicCode);
            return {
              status: 200,
              body: {
                ok: true,
                publicCode: generated.publicCode,
                code: generated.publicCode,
                alreadyExisted: false,
                fallback: generated.fallback,
                source: generated.fallback ? 'fallback' : 'firestore',
                ...(examId ? { examId } : {}),
                ...(examCode ? { examCode } : {}),
                isActive: isPublished,
                ...(generated.reason ? { warning: sanitizeSensitiveLogText(generated.reason) } : {}),
              },
            };
          } catch (err) {
            console.error('[Allocate-Code-Error]:', err);
            return buildSafeFallbackResponse({
              reason: err instanceof Error ? err.message : 'Lỗi kết nối Firestore khi kiểm tra mã.',
              preferredCode: existingPublicCode,
              examId,
              examCode,
              isPublished,
              errorCode: classifyFirestoreError(err),
            });
          }
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
        // If caller calls POST without examId/examCode, still allocate a clean 6-char code with read checks + fallback
        if (!examId && !examCode) {
          const generated = await generateCodeWithReadChecks(existingPublicCode);
          return {
            status: 200,
            body: {
              ok: true,
              publicCode: generated.publicCode,
              code: generated.publicCode,
              alreadyExisted: false,
              fallback: generated.fallback,
              source: generated.fallback ? 'fallback' : 'firestore',
              isActive: isPublished,
              ...(generated.reason ? { warning: sanitizeSensitiveLogText(generated.reason) } : {}),
            },
          };
        }

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
          console.error('[Allocate-Code-Error]:', {
            api: apiName,
            stage,
            code: diag.code,
            message: sanitizeSensitiveLogText(diag.message),
          });
          logFirebaseAdminEvent({
            api: apiName,
            errorStage: stage,
            errorType: 'AdminSdkNotReady',
            errorCode: diag.code,
            message: diag.message,
            firestoreStatus: 'not_attempted',
          });
          return buildSafeFallbackResponse({
            reason: diag.message,
            preferredCode: existingPublicCode,
            examId,
            examCode,
            isPublished,
            errorCode: diag.code || 'CONFIG_MISSING',
          });
        }

        stage = 'role_check';
        const roleInfo = await store.getUserRoleInfo(caller.uid, bearer);
        const hasLoadedRoleProfile = roleInfo.isAdmin || Boolean(roleInfo.role);
        const canManage =
          roleInfo.isAdmin ||
          (roleInfo.role === 'teacher' &&
            (roleInfo.status === 'active' || roleInfo.status === 'approved'));
        if (hasLoadedRoleProfile && !canManage) {
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
            code: result.publicCode,
            alreadyExisted: result.alreadyExisted,
            fallback: false,
            source: 'firestore',
            examId: result.examId,
            examCode: result.examCode,
            isActive: result.isActive,
          },
        };
      } catch (err) {
        if (err instanceof PublicExamLinkError && err.status === 403) {
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

        const classified =
          err instanceof PublicExamLinkError ? err.code : classifyFirestoreError(err);
        const msg = err instanceof Error ? err.message : 'Lỗi cấp mã truy cập 6 ký tự.';
        console.error('[Allocate-Code-Error]:', err);
        logFirebaseAdminEvent({
          api: apiName,
          errorStage: stage,
          errorType: err instanceof Error ? err.name : 'Error',
          errorCode: classified,
          message: msg,
          firestoreStatus: 'write_failed',
        });

        const bodyFallback = method === 'POST' ? parseJsonBody(req.body) : {};
        const fallbackExamId = sanitizeDocId(bodyFallback.examId ?? readQueryValue(req, 'examId'));
        const fallbackExamCode = normalizeExamCodeServer(
          String(bodyFallback.examCode ?? readQueryValue(req, 'examCode') ?? '')
        );
        const fallbackExisting = normalizePublicCodeServer(
          bodyFallback.existingPublicCode ?? readQueryValue(req, 'existingPublicCode')
        );
        const isCollisionExhausted =
          err instanceof PublicExamLinkError && err.code === 'MAX_ATTEMPTS_EXCEEDED';

        return buildSafeFallbackResponse({
          reason: msg,
          preferredCode: fallbackExisting || null,
          preferFreshOnCollision: isCollisionExhausted,
          examId: fallbackExamId || undefined,
          examCode: fallbackExamCode || undefined,
          isPublished: bodyFallback.isPublished !== false,
          errorCode: classified,
        });
      }
    },

    async handleSyncPublicExamLinkStatus(req: ApiRequest): Promise<ApiResponse> {
      const apiName = 'POST /api/exams/sync-link-status';
      let stage = 'method_check';
      if ((req.method || '').toUpperCase() !== 'POST') {
        return {
          status: 405,
          body: {
            stage,
            errorStage: stage,
            code: 'API_ROUTE_ERROR',
            error: 'Phương thức không hợp lệ. API /api/exams/sync-link-status chỉ hỗ trợ POST.',
          },
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
          roleInfo.isAdmin ||
          (roleInfo.role === 'teacher' &&
            (roleInfo.status === 'active' || roleInfo.status === 'approved'));
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
