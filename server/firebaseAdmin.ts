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

function parseServiceAccountJson(rawValue: string): {
  parsed?: { projectId: string; clientEmail: string; privateKey: string };
  errorCode?: FirebaseAdminErrorCode;
} {
  let decoded: unknown;
  try {
    decoded = JSON.parse(rawValue);
    // Handle accidentally double-stringified JSON env values safely
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
      projectIdMatched: errorCode !== 'PROJECT_ID_MISMATCH' && errorCode !== 'INVALID_JSON' && errorCode !== 'MISSING_REQUIRED_FIELDS',
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
    console.error(`[HQTest Admin] Initialization failed with code: ${safeCode}`);
    cachedEnvFingerprint = rawEnv;
    cachedInitResult = {
      initialized: false,
      environmentVariablePresent: true,
      projectIdMatched: true,
      databaseIdMatched: false,
      errorCode: 'ADMIN_INIT_FAILED',
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
    throw new Error(state.errorCode || 'SERVER_CREDENTIALS_MISSING');
  }
  return state.db;
}

export function getFirebaseAdminAuth(): Auth {
  const state = getFirebaseAdminState();
  if (!state.initialized || !state.auth) {
    throw new Error(state.errorCode || 'SERVER_CREDENTIALS_MISSING');
  }
  return state.auth;
}

export function getFirebaseAdminFieldValue(): typeof FieldValue {
  return FieldValue;
}

function classifyFirestoreConnectError(err: unknown): FirebaseAdminErrorCode {
  const code =
    err && typeof err === 'object' && 'code' in err ? String((err as { code?: unknown }).code) : '';
  const msg = err instanceof Error ? err.message : '';
  if (code === '7' || code.toUpperCase().includes('PERMISSION_DENIED') || msg.includes('PERMISSION_DENIED')) {
    return 'FIRESTORE_PERMISSION_DENIED';
  }
  if (code === '5' || code.toUpperCase().includes('NOT_FOUND') || msg.includes('NOT_FOUND')) {
    return 'FIRESTORE_NOT_FOUND';
  }
  return 'FIRESTORE_UNAVAILABLE';
}

export async function checkFirebaseAdminHealth(): Promise<FirebaseAdminHealthStatus> {
  const state = getFirebaseAdminState();
  if (!state.initialized || !state.db) {
    return {
      adminInitialized: false,
      projectIdMatched: state.projectIdMatched,
      firestoreConnected: false,
      databaseIdMatched: false,
      environmentVariablePresent: state.environmentVariablePresent,
      errorCode: state.errorCode || 'ADMIN_INIT_FAILED',
    };
  }

  try {
    // Non-destructive minimal connectivity read on public metadata collection
    await state.db.collection('examStatus').limit(1).get();
    return {
      adminInitialized: true,
      projectIdMatched: state.projectIdMatched,
      firestoreConnected: true,
      databaseIdMatched: state.databaseIdMatched,
      environmentVariablePresent: true,
      errorCode: null,
    };
  } catch (err) {
    const errorCode = classifyFirestoreConnectError(err);
    console.error(`[HQTest Admin] Firestore health check failed: ${errorCode}`);
    return {
      adminInitialized: true,
      projectIdMatched: state.projectIdMatched,
      firestoreConnected: false,
      databaseIdMatched: state.databaseIdMatched,
      environmentVariablePresent: true,
      errorCode,
    };
  }
}

export function resetFirebaseAdminCacheForTests(): void {
  cachedEnvFingerprint = null;
  cachedInitResult = null;
}
