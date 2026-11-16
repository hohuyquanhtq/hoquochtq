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

export const SERVICE_ACCOUNT_ENV_VAR = 'FIREBASE_SERVICE_ACCOUNT_JSON' as const;
export type ServiceAccountEnvVarName = typeof SERVICE_ACCOUNT_ENV_VAR;

export type FirebaseAdminErrorCode =
  | 'CONFIG_MISSING'
  | 'CONFIG_PARSE_ERROR'
  | 'PRIVATE_KEY_ERROR'
  | 'ADMIN_INIT_ERROR'
  | 'AUTH_ERROR'
  | 'DATABASE_ERROR'
  | 'DATABASE_PERMISSION_ERROR'
  | 'PASSWORD_HASH_ERROR'
  | 'EXAM_SAVE_ERROR'
  | 'API_ROUTE_ERROR'
  | 'UNKNOWN_ERROR';

export interface FirebaseAdminInitResult {
  initialized: boolean;
  environmentVariablePresent: boolean;
  activeEnvVar: ServiceAccountEnvVarName | null;
  projectIdMatched: boolean;
  databaseIdMatched: boolean;
  errorCode: FirebaseAdminErrorCode | null;
  errorDetail: string | null;
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
  activeEnvVar: ServiceAccountEnvVarName | null;
  errorCode: FirebaseAdminErrorCode | null;
  errorStage: string | null;
  timestamp: string;
  message: string;
}

interface RawServiceAccountPayload {
  type?: unknown;
  project_id?: unknown;
  client_email?: unknown;
  private_key?: unknown;
}

let cachedEnvFingerprint: string | null = null;
let cachedInitResult: FirebaseAdminInitResult | null = null;

/**
 * Resolves the active Service Account JSON string strictly from
 * process.env.FIREBASE_SERVICE_ACCOUNT_JSON.
 */
export function resolveServiceAccountEnvSource(): {
  envVarName: ServiceAccountEnvVarName | null;
  rawValue: string;
} {
  const rawValue = (process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '').trim();
  if (rawValue.length > 0) {
    return {
      envVarName: SERVICE_ACCOUNT_ENV_VAR,
      rawValue,
    };
  }

  return {
    envVarName: null,
    rawValue: '',
  };
}

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

export function formatFirebaseAdminErrorMessage(
  errorCode: FirebaseAdminErrorCode | null,
  detail?: string | null
): string {
  if (detail && detail.trim()) {
    return detail.trim();
  }
  switch (errorCode) {
    case null:
      return 'Firebase Admin SDK đã khởi tạo và kết nối Firestore thành công.';
    case 'CONFIG_MISSING':
      return 'Thiếu biến môi trường FIREBASE_SERVICE_ACCOUNT_JSON trên máy chủ Vercel.';
    case 'CONFIG_PARSE_ERROR':
      return 'Không thể đọc/parse biến FIREBASE_SERVICE_ACCOUNT_JSON, thiếu trường bắt buộc (type, project_id, client_email, private_key), type != service_account hoặc project_id không khớp agile-booster-w8p5g.';
    case 'PRIVATE_KEY_ERROR':
      return 'Trường private_key trong FIREBASE_SERVICE_ACCOUNT_JSON không đúng định dạng PEM hợp lệ hoặc lỗi ký tự xuống dòng (\\n).';
    case 'ADMIN_INIT_ERROR':
      return 'Không thể khởi tạo Firebase Admin SDK trên backend.';
    case 'AUTH_ERROR':
      return 'Không xác thực được Firebase ID Token. Vui lòng đăng xuất và đăng nhập lại.';
    case 'DATABASE_PERMISSION_ERROR':
      return 'Service Account hoặc tài khoản không đủ quyền thao tác dữ liệu trên Cloud Firestore.';
    case 'DATABASE_ERROR':
      return `Không kết nối được tới cơ sở dữ liệu Firestore ${EXPECTED_FIRESTORE_DATABASE_ID} trên dự án ${EXPECTED_FIREBASE_PROJECT_ID}.`;
    case 'PASSWORD_HASH_ERROR':
      return 'Lỗi mã hóa mật khẩu đề thi trên máy chủ.';
    case 'EXAM_SAVE_ERROR':
      return 'Lỗi lưu cấu hình bảo mật đề thi lên Cloud Firestore.';
    case 'API_ROUTE_ERROR':
      return 'Không tìm thấy hoặc gọi sai API endpoint cấu hình bảo mật đề thi.';
    case 'UNKNOWN_ERROR':
    default:
      return 'Đã xảy ra lỗi chưa phân loại trên máy chủ xử lý bảo mật đề thi.';
  }
}

export function sanitizeSensitiveLogText(raw: string): string {
  if (!raw) return '';
  return raw
    .replace(/-----BEGIN[^-]*PRIVATE KEY-----[\s\S]*?-----END[^-]*PRIVATE KEY-----/gi, '[REDACTED_PRIVATE_KEY]')
    .replace(/scrypt\$\d+\$\d+\$\d+\$[a-f0-9]+\$[a-f0-9]+/gi, '[REDACTED_PASSWORD_HASH]')
    .replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}\b/g, '[REDACTED_TOKEN]')
    .replace(/Bearer\s+[^\s"']+/gi, 'Bearer [REDACTED]')
    .replace(/"private_key"\s*:\s*"[^"]*"/gi, '"private_key":"[REDACTED]"')
    .slice(0, 500);
}

export function logFirebaseAdminEvent(params: {
  api: string;
  errorStage: string;
  errorType: string;
  errorCode: FirebaseAdminErrorCode | string | null;
  message: string;
  firestoreStatus?: 'not_attempted' | 'connected' | 'permission_denied' | 'not_found' | 'write_failed' | 'read_failed' | 'ok';
}): void {
  const state = cachedInitResult;
  const envSource = resolveServiceAccountEnvSource();
  console.error(
    JSON.stringify({
      scope: 'HQTest_API',
      timestamp: new Date().toISOString(),
      api: params.api,
      errorStage: params.errorStage,
      errorType: params.errorType,
      errorCode: params.errorCode,
      message: sanitizeSensitiveLogText(params.message),
      adminInitialized: Boolean(state?.initialized),
      projectIdMatched: Boolean(state?.projectIdMatched),
      databaseIdMatched: Boolean(state?.databaseIdMatched),
      environmentVariablePresent: envSource.envVarName !== null,
      activeEnvVar: envSource.envVarName,
      adminErrorCode: state?.errorCode ?? null,
      firestoreStatus: params.firestoreStatus ?? 'not_attempted',
    })
  );
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
    code === '16' ||
    status === 401 ||
    status === 403 ||
    upper.includes('PERMISSION_DENIED') ||
    upper.includes('PERMISSION-DENIED') ||
    upper.includes('UNAUTHENTICATED') ||
    upper.includes('INVALID_GRANT') ||
    upper.includes('INSUFFICIENT PERMISSIONS')
  ) {
    return 'DATABASE_PERMISSION_ERROR';
  }
  return 'DATABASE_ERROR';
}

function parseServiceAccountJson(
  rawValue: string,
  envVarName: ServiceAccountEnvVarName
): {
  parsed?: { projectId: string; clientEmail: string; privateKey: string };
  errorCode?: FirebaseAdminErrorCode;
  errorDetail?: string;
} {
  let decoded: unknown;
  try {
    decoded = JSON.parse(rawValue);
    if (typeof decoded === 'string') {
      decoded = JSON.parse(decoded);
    }
  } catch {
    return {
      errorCode: 'CONFIG_PARSE_ERROR',
      errorDetail: `Biến ${envVarName} không phải chuỗi JSON hợp lệ (lỗi JSON.parse).`,
    };
  }

  if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)) {
    return {
      errorCode: 'CONFIG_PARSE_ERROR',
      errorDetail: `Nội dung ${envVarName} phải là một JSON object Service Account hợp lệ.`,
    };
  }

  const obj = decoded as RawServiceAccountPayload;
  const saType = typeof obj.type === 'string' ? obj.type.trim() : '';
  const projectId = typeof obj.project_id === 'string' ? obj.project_id.trim() : '';
  const clientEmail = typeof obj.client_email === 'string' ? obj.client_email.trim() : '';
  const rawPrivateKey = typeof obj.private_key === 'string' ? obj.private_key : '';

  if (!saType || !projectId || !clientEmail || !rawPrivateKey.trim()) {
    const missingFields = [
      !saType ? 'type' : '',
      !projectId ? 'project_id' : '',
      !clientEmail ? 'client_email' : '',
      !rawPrivateKey.trim() ? 'private_key' : '',
    ].filter(Boolean);
    const onlyPrivateKeyMissing =
      missingFields.length === 1 && missingFields[0] === 'private_key';
    return {
      errorCode: onlyPrivateKeyMissing ? 'PRIVATE_KEY_ERROR' : 'CONFIG_PARSE_ERROR',
      errorDetail: `${envVarName} thiếu trường bắt buộc: ${missingFields.join(', ')}.`,
    };
  }

  if (saType !== 'service_account') {
    return {
      errorCode: 'CONFIG_PARSE_ERROR',
      errorDetail: `Trường "type" trong ${envVarName} phải là "service_account".`,
    };
  }

  if (projectId !== EXPECTED_FIREBASE_PROJECT_ID) {
    return {
      errorCode: 'CONFIG_PARSE_ERROR',
      errorDetail: `project_id ("${projectId}") trong ${envVarName} không khớp với dự án Firebase thực tế "${EXPECTED_FIREBASE_PROJECT_ID}". Vui lòng sử dụng đúng Service Account JSON của dự án ${EXPECTED_FIREBASE_PROJECT_ID}.`,
    };
  }

  const privateKey = normalizeServiceAccountPrivateKey(rawPrivateKey);
  if (
    !privateKey.includes('-----BEGIN') ||
    !privateKey.includes('PRIVATE KEY-----')
  ) {
    return {
      errorCode: 'PRIVATE_KEY_ERROR',
      errorDetail: `Trường private_key trong ${envVarName} không đúng định dạng PEM hợp lệ.`,
    };
  }

  try {
    crypto.createPrivateKey(privateKey);
  } catch {
    return {
      errorCode: 'PRIVATE_KEY_ERROR',
      errorDetail: `Không thể giải mã private_key trong ${envVarName} (kiểm tra ký tự xuống dòng \\n trong JSON).`,
    };
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
 * process.env.FIREBASE_SERVICE_ACCOUNT_JSON and binds Firestore strictly to
 * EXPECTED_FIRESTORE_DATABASE_ID.
 */
export function getFirebaseAdminState(): FirebaseAdminInitResult {
  const { envVarName, rawValue } = resolveServiceAccountEnvSource();
  const environmentVariablePresent = envVarName !== null && rawValue.length > 0;

  if (!environmentVariablePresent || !envVarName) {
    cachedEnvFingerprint = '';
    cachedInitResult = {
      initialized: false,
      environmentVariablePresent: false,
      activeEnvVar: null,
      projectIdMatched: false,
      databaseIdMatched: false,
      errorCode: 'CONFIG_MISSING',
      errorDetail: formatFirebaseAdminErrorMessage('CONFIG_MISSING'),
      app: null,
      auth: null,
      db: null,
    };
    return cachedInitResult;
  }

  const fingerprint = `${envVarName}:${rawValue}`;
  if (cachedInitResult && cachedEnvFingerprint === fingerprint && cachedInitResult.initialized) {
    return cachedInitResult;
  }

  const { parsed, errorCode, errorDetail } = parseServiceAccountJson(rawValue, envVarName);
  if (!parsed || errorCode) {
    cachedEnvFingerprint = fingerprint;
    cachedInitResult = {
      initialized: false,
      environmentVariablePresent: true,
      activeEnvVar: envVarName,
      projectIdMatched: errorCode === 'PRIVATE_KEY_ERROR',
      databaseIdMatched: false,
      errorCode: errorCode || 'CONFIG_PARSE_ERROR',
      errorDetail: errorDetail || formatFirebaseAdminErrorMessage(errorCode || 'CONFIG_PARSE_ERROR'),
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

    if (!projectIdMatched || !databaseIdMatched) {
      cachedEnvFingerprint = fingerprint;
      cachedInitResult = {
        initialized: false,
        environmentVariablePresent: true,
        activeEnvVar: envVarName,
        projectIdMatched,
        databaseIdMatched,
        errorCode: 'ADMIN_INIT_ERROR',
        errorDetail: !projectIdMatched
          ? `Firebase Admin App projectId không khớp ${EXPECTED_FIREBASE_PROJECT_ID}.`
          : `Firestore Database ID không khớp ${EXPECTED_FIRESTORE_DATABASE_ID}.`,
        app: null,
        auth: null,
        db: null,
      };
      return cachedInitResult;
    }

    cachedEnvFingerprint = fingerprint;
    cachedInitResult = {
      initialized: true,
      environmentVariablePresent: true,
      activeEnvVar: envVarName,
      projectIdMatched,
      databaseIdMatched,
      errorCode: null,
      errorDetail: null,
      app,
      auth,
      db,
    };
    return cachedInitResult;
  } catch (err) {
    const safeCode =
      err && typeof err === 'object' && 'code' in err && typeof err.code === 'string'
        ? err.code
        : 'ADMIN_INIT_ERROR';
    const isPrivateKeyIssue =
      safeCode.includes('invalid-credential') ||
      (err instanceof Error && err.message.toLowerCase().includes('private key'));
    const classified: FirebaseAdminErrorCode = isPrivateKeyIssue
      ? 'PRIVATE_KEY_ERROR'
      : 'ADMIN_INIT_ERROR';
    logFirebaseAdminEvent({
      api: 'firebaseAdmin.init',
      errorStage: 'admin_sdk_init',
      errorType: err instanceof Error ? err.name || 'Error' : typeof err,
      errorCode: classified,
      message: err instanceof Error ? err.message : 'Firebase Admin initialization failed',
      firestoreStatus: 'not_attempted',
    });
    cachedEnvFingerprint = fingerprint;
    cachedInitResult = {
      initialized: false,
      environmentVariablePresent: true,
      activeEnvVar: envVarName,
      projectIdMatched: true,
      databaseIdMatched: false,
      errorCode: classified,
      errorDetail: formatFirebaseAdminErrorMessage(classified),
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
    throw new Error(state.errorCode || 'CONFIG_MISSING');
  }
  return state.db;
}

export function getFirebaseAdminAuth(): Auth {
  const state = getFirebaseAdminState();
  if (!state.initialized || !state.auth) {
    throw new Error(state.errorCode || 'CONFIG_MISSING');
  }
  return state.auth;
}

export function getFirebaseAdminFieldValue(): typeof FieldValue {
  return FieldValue;
}

export async function checkFirebaseAdminHealth(): Promise<FirebaseAdminHealthStatus> {
  const state = getFirebaseAdminState();
  const timestamp = new Date().toISOString();
  if (!state.initialized || !state.db) {
    const errorCode = state.errorCode || 'ADMIN_INIT_ERROR';
    return {
      adminInitialized: false,
      projectIdMatched: state.projectIdMatched,
      firestoreConnected: false,
      databaseIdMatched: false,
      environmentVariablePresent: state.environmentVariablePresent,
      activeEnvVar: state.activeEnvVar,
      errorCode,
      errorStage: 'admin_sdk_init',
      timestamp,
      message: formatFirebaseAdminErrorMessage(errorCode, state.errorDetail),
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
      activeEnvVar: state.activeEnvVar,
      errorCode: null,
      errorStage: null,
      timestamp,
      message: formatFirebaseAdminErrorMessage(null),
    };
  } catch (err) {
    const errorCode = classifyFirestoreError(err);
    logFirebaseAdminEvent({
      api: 'GET /api/health/firebase-admin',
      errorStage: 'firestore_connectivity_check',
      errorType: err instanceof Error ? err.name || 'Error' : typeof err,
      errorCode,
      message: err instanceof Error ? err.message : 'Firestore health check failed',
      firestoreStatus: errorCode === 'DATABASE_PERMISSION_ERROR' ? 'permission_denied' : 'read_failed',
    });
    return {
      adminInitialized: true,
      projectIdMatched: state.projectIdMatched,
      firestoreConnected: false,
      databaseIdMatched: state.databaseIdMatched,
      environmentVariablePresent: true,
      activeEnvVar: state.activeEnvVar,
      errorCode,
      errorStage: 'firestore_connectivity_check',
      timestamp,
      message: formatFirebaseAdminErrorMessage(errorCode),
    };
  }
}

export function resetFirebaseAdminCacheForTests(): void {
  cachedEnvFingerprint = null;
  cachedInitResult = null;
}
