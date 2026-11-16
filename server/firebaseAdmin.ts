import crypto from 'node:crypto';
import {
  cert,
  getApp,
  getApps,
  initializeApp,
  type App,
} from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { FieldValue, getFirestore, type Firestore } from 'firebase-admin/firestore';

export const EXPECTED_FIREBASE_PROJECT_ID = 'agile-booster-w8p5g';
export const EXPECTED_FIRESTORE_DATABASE_ID =
  'ai-studio-chemtest-2d596eaa-de9e-460a-8554-f85091b4622e';

export type FirebaseAdminErrorCode =
  | 'MISSING_ENV_VAR'
  | 'INVALID_JSON'
  | 'MISSING_REQUIRED_FIELDS'
  | 'PROJECT_ID_MISMATCH'
  | 'INVALID_PRIVATE_KEY_FORMAT'
  | 'ADMIN_INIT_FAILED'
  | 'FIRESTORE_PERMISSION_DENIED'
  | 'FIRESTORE_NOT_FOUND'
  | 'FIRESTORE_UNAVAILABLE';

export interface FirebaseAdminInitResult {
  initialized: boolean;
  environmentVariablePresent: boolean;
  projectIdMatched: boolean;
  databaseIdMatched: boolean;
  errorCode: FirebaseAdminErrorCode | null;
  app: App | null;
  auth: Auth | null;
  db: Firestore | null;
}

export interface FirebaseAdminHealthStatus {
  adminInitialized: boolean;
  projectIdMatched: boolean;
  firestoreConnected: boolean;
  databaseIdMatched: boolean;
  environmentVariablePresent: boolean;
  errorCode: FirebaseAdminErrorCode | null;
  message: string;
}

interface RawServiceAccountPayload {
  project_id?: unknown;
  client_email?: unknown;
  private_key?: unknown;
}

let cachedEnvFingerprint: string | null = null;
let cachedInitResult: FirebaseAdminInitResult | null = null;

/**
 * Normalizes private_key PEM newlines safely:
 * - Converts literal "\\n" sequences into actual newline characters when present.
 * - Preserves private keys that already contain real "\n" line breaks.
 * - Normalizes CRLF ("\r\n") to LF ("\n").
 */
export function normalizeServiceAccountPrivateKey(rawKey: string): string {
  const withLf = rawKey.replace(/\r\n/g, '\n');
  const unescaped = withLf.includes('\\n') ? withLf.replace(/\\n/g, '\n') : withLf;
  return unescaped.trim();
}

export function formatFirebaseAdminErrorMessage(errorCode: FirebaseAdminErrorCode | null): string {
  switch (errorCode) {
    case null:
      return 'Firebase Admin SDK đã khởi tạo và kết nối Firestore thành công.';
    case 'MISSING_ENV_VAR':
      return 'Backend chưa được cấu hình: thiếu biến môi trường FIREBASE_SERVICE_ACCOUNT_JSON trên máy chủ.';
    case 'INVALID_JSON':
      return 'Biến FIREBASE_SERVICE_ACCOUNT_JSON không phải chuỗi JSON hợp lệ (lỗi parse JSON).';
    case 'MISSING_REQUIRED_FIELDS':
      return 'FIREBASE_SERVICE_ACCOUNT_JSON thiếu trường bắt buộc (project_id, client_email hoặc private_key).';
    case 'PROJECT_ID_MISMATCH':
      return `project_id trong Service Account không khớp với dự án Firebase ${EXPECTED_FIREBASE_PROJECT_ID}.`;
    case 'INVALID_PRIVATE_KEY_FORMAT':
      return 'Trường private_key trong FIREBASE_SERVICE_ACCOUNT_JSON không đúng định dạng PEM hợp lệ hoặc bị lỗi ký tự xuống dòng.';
    case 'FIRESTORE_PERMISSION_DENIED':
      return 'Service Account không có quyền truy cập Cloud Firestore (PERMISSION_DENIED). Vui lòng kiểm tra quyền IAM cho Service Account.';
    case 'FIRESTORE_NOT_FOUND':
      return `Không tìm thấy cơ sở dữ liệu Firestore ${EXPECTED_FIRESTORE_DATABASE_ID} trên dự án ${EXPECTED_FIREBASE_PROJECT_ID}.`;
    case 'FIRESTORE_UNAVAILABLE':
      return 'Không thể kết nối tới dịch vụ Cloud Firestore từ backend.';
    case 'ADMIN_INIT_FAILED':
    default:
      return 'Không thể khởi tạo Firebase Admin SDK trên backend.';
  }
}

export function classifyFirestoreError(err: unknown): FirebaseAdminErrorCode {
  const code =
    err && typeof err === 'object' && 'code' in err ? String((err as { code?: unknown }).code) : '';
  const status =
    err && typeof err === 'object' && 'status' in err ? Number((err as { status?: unknown }).status) : 0;
  const msg = err instanceof Error ? err.message : '';
  const upper = `${code} ${msg}`.toUpperCase();

  if (
    code === '7' ||
    status === 403 ||
    upper.includes('PERMISSION_DENIED') ||
    upper.includes('PERMISSION-DENIED') ||
    upper.includes('INSUFFICIENT PERMISSIONS')
  ) {
    return 'FIRESTORE_PERMISSION_DENIED';
  }
  if (
    code === '5' ||
    status === 404 ||
    upper.includes('NOT_FOUND') ||
    upper.includes('NOT-FOUND')
  ) {
    return 'FIRESTORE_NOT_FOUND';
  }
  return 'FIRESTORE_UNAVAILABLE';
}

function parseServiceAccountJson(rawValue: string): {
  parsed?: { projectId: string; clientEmail: string; privateKey: string };
  errorCode?: FirebaseAdminErrorCode;
} {
  let decoded: unknown;
  try {
    decoded = JSON.parse(rawValue);
    if (typeof decoded === 'string') {
      decoded = JSON.parse(decoded);
    }
  } catch {
    return { errorCode: 'INVALID_JSON' };
  }

  if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)) {
    return { errorCode: 'INVALID_JSON' };
  }

  const obj = decoded as RawServiceAccountPayload;
  const projectId = typeof obj.project_id === 'string' ? obj.project_id.trim() : '';
  const clientEmail = typeof obj.client_email === 'string' ? obj.client_email.trim() : '';
  const rawPrivateKey = typeof obj.private_key === 'string' ? obj.private_key : '';

  if (!projectId || !clientEmail || !rawPrivateKey.trim()) {
    return { errorCode: 'MISSING_REQUIRED_FIELDS' };
  }

  if (projectId !== EXPECTED_FIREBASE_PROJECT_ID) {
    return { errorCode: 'PROJECT_ID_MISMATCH' };
  }

  const privateKey = normalizeServiceAccountPrivateKey(rawPrivateKey);
  if (
    !privateKey.includes('-----BEGIN') ||
    !privateKey.includes('PRIVATE KEY-----')
  ) {
    return { errorCode: 'INVALID_PRIVATE_KEY_FORMAT' };
  }

  try {
    crypto.createPrivateKey(privateKey);
  } catch {
    return { errorCode: 'INVALID_PRIVATE_KEY_FORMAT' };
  }

  return {
    parsed: {
      projectId,
      clientEmail,
      privateKey,
    },
  };
}

/**
 * Initializes Firebase Admin SDK once in serverless/Node runtime strictly from
 * process.env.FIREBASE_SERVICE_ACCOUNT_JSON and binds Firestore to
 * EXPECTED_FIRESTORE_DATABASE_ID.
 */
export function getFirebaseAdminState(): FirebaseAdminInitResult {
  const rawEnv = (process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '').trim();
  const environmentVariablePresent = rawEnv.length > 0;

  if (!environmentVariablePresent) {
    cachedEnvFingerprint = '';
    cachedInitResult = {
      initialized: false,
      environmentVariablePresent: false,
      projectIdMatched: false,
      databaseIdMatched: false,
      errorCode: 'MISSING_ENV_VAR',
      app: null,
      auth: null,
      db: null,
    };
    return cachedInitResult;
  }

  if (cachedInitResult && cachedEnvFingerprint === rawEnv && cachedInitResult.initialized) {
    return cachedInitResult;
  }

  const { parsed, errorCode } = parseServiceAccountJson(rawEnv);
  if (!parsed || errorCode) {
    cachedEnvFingerprint = rawEnv;
    cachedInitResult = {
      initialized: false,
      environmentVariablePresent: true,
      projectIdMatched:
        errorCode !== 'PROJECT_ID_MISMATCH' &&
        errorCode !== 'INVALID_JSON' &&
        errorCode !== 'MISSING_REQUIRED_FIELDS',
      databaseIdMatched: false,
      errorCode: errorCode || 'INVALID_JSON',
      app: null,
      auth: null,
      db: null,
    };
    return cachedInitResult;
  }

  try {
    const existingApps = getApps();
    const app: App =
      existingApps.length > 0
        ? getApp()
        : initializeApp({
            credential: cert({
              projectId: parsed.projectId,
              clientEmail: parsed.clientEmail,
              privateKey: parsed.privateKey,
            }),
            projectId: EXPECTED_FIREBASE_PROJECT_ID,
          });

    const auth = getAuth(app);
    const db = getFirestore(app, EXPECTED_FIRESTORE_DATABASE_ID);

    const projectIdMatched =
      (app.options.projectId || parsed.projectId) === EXPECTED_FIREBASE_PROJECT_ID;
    const resolvedDbId =
      (db as unknown as { databaseId?: string }).databaseId || EXPECTED_FIRESTORE_DATABASE_ID;
    const databaseIdMatched = resolvedDbId === EXPECTED_FIRESTORE_DATABASE_ID;

    cachedEnvFingerprint = rawEnv;
    cachedInitResult = {
      initialized: true,
      environmentVariablePresent: true,
      projectIdMatched,
      databaseIdMatched,
      errorCode: null,
      app,
      auth,
      db,
    };
    return cachedInitResult;
  } catch (err) {
    const safeCode =
      err && typeof err === 'object' && 'code' in err && typeof err.code === 'string'
        ? err.code
        : 'ADMIN_INIT_FAILED';
    const isPrivateKeyIssue =
      safeCode.includes('invalid-credential') ||
      (err instanceof Error && err.message.toLowerCase().includes('private key'));
    const classified: FirebaseAdminErrorCode = isPrivateKeyIssue
      ? 'INVALID_PRIVATE_KEY_FORMAT'
      : 'ADMIN_INIT_FAILED';
    console.error(`[HQTest Admin] Initialization failed with code: ${classified}`);
    cachedEnvFingerprint = rawEnv;
    cachedInitResult = {
      initialized: false,
      environmentVariablePresent: true,
      projectIdMatched: true,
      databaseIdMatched: false,
      errorCode: classified,
      app: null,
      auth: null,
      db: null,
    };
    return cachedInitResult;
  }
}

export function isFirebaseAdminReady(): boolean {
  const state = getFirebaseAdminState();
  return state.initialized && state.projectIdMatched && state.databaseIdMatched && state.db !== null;
}

export function getFirebaseAdminDb(): Firestore {
  const state = getFirebaseAdminState();
  if (!state.initialized || !state.db) {
    throw new Error(state.errorCode || 'MISSING_ENV_VAR');
  }
  return state.db;
}

export function getFirebaseAdminAuth(): Auth {
  const state = getFirebaseAdminState();
  if (!state.initialized || !state.auth) {
    throw new Error(state.errorCode || 'MISSING_ENV_VAR');
  }
  return state.auth;
}

export function getFirebaseAdminFieldValue(): typeof FieldValue {
  return FieldValue;
}

export async function checkFirebaseAdminHealth(): Promise<FirebaseAdminHealthStatus> {
  const state = getFirebaseAdminState();
  if (!state.initialized || !state.db) {
    const errorCode = state.errorCode || 'ADMIN_INIT_FAILED';
    return {
      adminInitialized: false,
      projectIdMatched: state.projectIdMatched,
      firestoreConnected: false,
      databaseIdMatched: false,
      environmentVariablePresent: state.environmentVariablePresent,
      errorCode,
      message: formatFirebaseAdminErrorMessage(errorCode),
    };
  }

  try {
    await state.db.collection('examStatus').limit(1).get();
    return {
      adminInitialized: true,
      projectIdMatched: state.projectIdMatched,
      firestoreConnected: true,
      databaseIdMatched: state.databaseIdMatched,
      environmentVariablePresent: true,
      errorCode: null,
      message: formatFirebaseAdminErrorMessage(null),
    };
  } catch (err) {
    const errorCode = classifyFirestoreError(err);
    console.error(`[HQTest Admin] Firestore health check failed: ${errorCode}`);
    return {
      adminInitialized: true,
      projectIdMatched: state.projectIdMatched,
      firestoreConnected: false,
      databaseIdMatched: state.databaseIdMatched,
      environmentVariablePresent: true,
      errorCode,
      message: formatFirebaseAdminErrorMessage(errorCode),
    };
  }
}

export function resetFirebaseAdminCacheForTests(): void {
  cachedEnvFingerprint = null;
  cachedInitResult = null;
}
