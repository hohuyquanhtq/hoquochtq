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

export const EXPECTED_FIREBASE_PROJECT_ID = 'hqtest-online';
export const EXPECTED_FIRESTORE_DATABASE_ID =
  'ai-studio-chemtest-2d596eaa-de9e-460a-8554-f85091b4622e';

export const SERVICE_ACCOUNT_ENV_VAR = 'FIREBASE_SERVICE_ACCOUNT_JSON' as const;
export const PRIMARY_CLAIM_SERVICE_ACCOUNT_ENV_VAR = 'FIREBASE_SERVICE_ACCOUNT' as const;
export const SPLIT_ENV_VAR_SOURCE = 'FIREBASE_PRIVATE_KEY' as const;
export type ServiceAccountEnvVarName =
  | typeof SERVICE_ACCOUNT_ENV_VAR
  | typeof PRIMARY_CLAIM_SERVICE_ACCOUNT_ENV_VAR
  | typeof SPLIT_ENV_VAR_SOURCE;

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
  private_key_id?: unknown;
  private_key?: unknown;
  client_email?: unknown;
  client_id?: unknown;
}

let cachedEnvFingerprint: string | null = null;
let cachedInitResult: FirebaseAdminInitResult | null = null;

/**
 * Resolves the active Service Account credential source from either:
 * 1. JSON string in process.env.FIREBASE_SERVICE_ACCOUNT_JSON / FIREBASE_SERVICE_ACCOUNT, or
 * 2. Split env vars process.env.FIREBASE_PRIVATE_KEY + process.env.FIREBASE_CLIENT_EMAIL (+ optional FIREBASE_PROJECT_ID).
 */
export function resolveServiceAccountEnvSource(
  preferPrimaryClaimEnv = false
): {
  envVarName: ServiceAccountEnvVarName | null;
  rawValue: string;
  splitCredentials?: {
    projectId: string;
    clientEmail: string;
    privateKey: string;
  };
} {
  const candidates: Array<typeof SERVICE_ACCOUNT_ENV_VAR | typeof PRIMARY_CLAIM_SERVICE_ACCOUNT_ENV_VAR> =
    preferPrimaryClaimEnv
      ? [PRIMARY_CLAIM_SERVICE_ACCOUNT_ENV_VAR, SERVICE_ACCOUNT_ENV_VAR]
      : [SERVICE_ACCOUNT_ENV_VAR, PRIMARY_CLAIM_SERVICE_ACCOUNT_ENV_VAR];

  for (const envVarName of candidates) {
    const rawValue = (process.env[envVarName] || '').trim();
    if (rawValue.length > 0) {
      return {
        envVarName,
        rawValue,
      };
    }
  }

  const splitPrivateKey = (process.env.FIREBASE_PRIVATE_KEY || '').trim();
  const splitClientEmail = (process.env.FIREBASE_CLIENT_EMAIL || '').trim();
  const splitProjectId = (process.env.FIREBASE_PROJECT_ID || EXPECTED_FIREBASE_PROJECT_ID).trim();

  if (splitPrivateKey.length > 0 || splitClientEmail.length > 0) {
    return {
      envVarName: SPLIT_ENV_VAR_SOURCE,
      rawValue: `split:${splitProjectId}:${splitClientEmail}:${splitPrivateKey.length}`,
      splitCredentials: {
        projectId: splitProjectId,
        clientEmail: splitClientEmail,
        privateKey: splitPrivateKey,
      },
    };
  }

  return {
    envVarName: null,
    rawValue: '',
  };
}

/**
 * Normalizes private_key PEM newlines safely:
 * - Strips accidental outer quotes when pasted into Vercel env vars.
 * - Converts literal "\\n" (and double-escaped "\\\\n") sequences into actual "\n" newlines.
 * - Normalizes CRLF ("\r\n") to LF ("\n").
 */
export function normalizeServiceAccountPrivateKey(rawKey: string): string {
  let cleaned = (rawKey || '').trim();
  if (
    (cleaned.startsWith('"') && cleaned.endsWith('"')) ||
    (cleaned.startsWith("'") && cleaned.endsWith("'"))
  ) {
    cleaned = cleaned.slice(1, -1).trim();
  }
  const withLf = cleaned.replace(/\r\n/g, '\n');
  const unescaped = withLf.replace(/\\\\n/g, '\n').replace(/\\n/g, '\n');
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
      return 'Thiếu biến môi trường FIREBASE_SERVICE_ACCOUNT / FIREBASE_SERVICE_ACCOUNT_JSON hoặc bộ FIREBASE_PRIVATE_KEY + FIREBASE_CLIENT_EMAIL trên máy chủ.';
    case 'CONFIG_PARSE_ERROR':
      return 'Không thể đọc/parse biến Service Account JSON, thiếu trường bắt buộc (type, project_id, private_key_id, private_key, client_email, client_id), type != service_account hoặc project_id không khớp hqtest-online.';
    case 'PRIVATE_KEY_ERROR':
      return 'Trường private_key / FIREBASE_PRIVATE_KEY không đúng định dạng PEM hợp lệ hoặc lỗi ký tự xuống dòng (\\n).';
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

function validateAndBuildCredentials(params: {
  projectId: string;
  clientEmail: string;
  rawPrivateKey: string;
  sourceLabel: string;
}): {
  parsed?: { projectId: string; clientEmail: string; privateKey: string };
  errorCode?: FirebaseAdminErrorCode;
  errorDetail?: string;
} {
  const { projectId, clientEmail, rawPrivateKey, sourceLabel } = params;

  if (!clientEmail || !rawPrivateKey.trim()) {
    const missing = [
      !clientEmail ? 'FIREBASE_CLIENT_EMAIL' : '',
      !rawPrivateKey.trim() ? 'FIREBASE_PRIVATE_KEY' : '',
    ].filter(Boolean);
    return {
      errorCode: missing.length === 1 && missing[0] === 'FIREBASE_PRIVATE_KEY' ? 'PRIVATE_KEY_ERROR' : 'CONFIG_PARSE_ERROR',
      errorDetail: `${sourceLabel} thiếu thông tin bắt buộc: ${missing.join(', ')}.`,
    };
  }

  if (projectId !== EXPECTED_FIREBASE_PROJECT_ID) {
    return {
      errorCode: 'CONFIG_PARSE_ERROR',
      errorDetail: `project_id ("${projectId}") trong ${sourceLabel} không khớp với dự án Firebase thực tế "${EXPECTED_FIREBASE_PROJECT_ID}".`,
    };
  }

  const privateKey = normalizeServiceAccountPrivateKey(rawPrivateKey);
  if (!privateKey.includes('-----BEGIN') || !privateKey.includes('PRIVATE KEY-----')) {
    return {
      errorCode: 'PRIVATE_KEY_ERROR',
      errorDetail: `private_key trong ${sourceLabel} không đúng định dạng PEM hợp lệ.`,
    };
  }

  try {
    crypto.createPrivateKey(privateKey);
  } catch {
    return {
      errorCode: 'PRIVATE_KEY_ERROR',
      errorDetail: `Không thể giải mã private_key trong ${sourceLabel} (kiểm tra ký tự xuống dòng \\n).`,
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

function parseServiceAccountJson(
  rawValue: string,
  envVarName: ServiceAccountEnvVarName
): {
  parsed?: { projectId: string; clientEmail: string; privateKey: string };
  errorCode?: FirebaseAdminErrorCode;
  errorDetail?: string;
} {
  let candidateJson = rawValue.trim();
  if (!candidateJson.startsWith('{') && !candidateJson.startsWith('"')) {
    try {
      const b64Decoded = Buffer.from(candidateJson, 'base64').toString('utf8').trim();
      if (b64Decoded.startsWith('{')) {
        candidateJson = b64Decoded;
      }
    } catch {
      // fall through to JSON.parse error handling
    }
  }

  let decoded: unknown;
  try {
    decoded = JSON.parse(candidateJson);
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
  const privateKeyId = typeof obj.private_key_id === 'string' ? obj.private_key_id.trim() : '';
  const rawPrivateKey = typeof obj.private_key === 'string' ? obj.private_key : '';
  const clientEmail = typeof obj.client_email === 'string' ? obj.client_email.trim() : '';
  const clientId = typeof obj.client_id === 'string' ? obj.client_id.trim() : '';

  if (
    !saType ||
    !projectId ||
    !privateKeyId ||
    !rawPrivateKey.trim() ||
    !clientEmail ||
    !clientId
  ) {
    const missingFields = [
      !saType ? 'type' : '',
      !projectId ? 'project_id' : '',
      !privateKeyId ? 'private_key_id' : '',
      !rawPrivateKey.trim() ? 'private_key' : '',
      !clientEmail ? 'client_email' : '',
      !clientId ? 'client_id' : '',
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

  return validateAndBuildCredentials({
    projectId,
    clientEmail,
    rawPrivateKey,
    sourceLabel: envVarName,
  });
}

/**
 * Initializes Firebase Admin SDK once (Singleton: getApps().length === 0) in serverless/Node runtime
 * from process.env.FIREBASE_SERVICE_ACCOUNT_JSON, FIREBASE_SERVICE_ACCOUNT, or
 * FIREBASE_PRIVATE_KEY + FIREBASE_CLIENT_EMAIL (+ optional FIREBASE_PROJECT_ID),
 * and binds Firestore strictly to EXPECTED_FIRESTORE_DATABASE_ID.
 */
export function getFirebaseAdminState(
  preferPrimaryClaimEnv = false
): FirebaseAdminInitResult {
  const { envVarName, rawValue, splitCredentials } = resolveServiceAccountEnvSource(preferPrimaryClaimEnv);
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

  const { parsed, errorCode, errorDetail } = splitCredentials
    ? validateAndBuildCredentials({
        projectId: splitCredentials.projectId,
        clientEmail: splitCredentials.clientEmail,
        rawPrivateKey: splitCredentials.privateKey,
        sourceLabel: 'FIREBASE_PRIVATE_KEY / FIREBASE_CLIENT_EMAIL',
      })
    : parseServiceAccountJson(rawValue, envVarName);
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
    const app: App =
      getApps().length === 0
        ? initializeApp({
            credential: cert({
              projectId: parsed.projectId,
              clientEmail: parsed.clientEmail,
              privateKey: parsed.privateKey,
            }),
            projectId: EXPECTED_FIREBASE_PROJECT_ID,
          })
        : getApp();

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

/**
 * Non-throwing Singleton accessor for serverless handlers.
 */
export function getSafeFirebaseAdmin(): {
  ready: boolean;
  app: App | null;
  auth: Auth | null;
  db: Firestore | null;
  errorCode: FirebaseAdminErrorCode | null;
  errorDetail: string | null;
} {
  try {
    const state = getFirebaseAdminState();
    const ready =
      state.initialized &&
      state.projectIdMatched &&
      state.databaseIdMatched &&
      state.db !== null;
    return {
      ready,
      app: ready ? state.app : null,
      auth: ready ? state.auth : null,
      db: ready ? state.db : null,
      errorCode: ready ? null : state.errorCode || 'ADMIN_INIT_ERROR',
      errorDetail: ready ? null : state.errorDetail,
    };
  } catch (err) {
    console.error('[Firebase-Admin-Init-Error]:', err);
    return {
      ready: false,
      app: null,
      auth: null,
      db: null,
      errorCode: 'ADMIN_INIT_ERROR',
      errorDetail: err instanceof Error ? err.message : 'Firebase Admin initialization error',
    };
  }
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
