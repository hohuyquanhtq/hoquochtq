/**
 * Serverless-safe Firebase Admin SDK Singleton (Vercel / Node.js).
 *
 * - Guards against duplicate app initialization via `getApps().length === 0`.
 * - Supports both Service Account JSON (`FIREBASE_SERVICE_ACCOUNT_JSON` / `FIREBASE_SERVICE_ACCOUNT`)
 *   and split env vars (`FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`
 *   with automatic `\\n` -> `\n` normalization).
 * - Binds Firestore strictly to the configured HQTest database ID (`ai-studio-chemtest-2d596eaa-de9e-460a-8554-f85091b4622e`).
 * - Never throws at module import time if environment variables are missing or malformed.
 */
export {
  EXPECTED_FIREBASE_PROJECT_ID as FIREBASE_PROJECT_ID,
  EXPECTED_FIRESTORE_DATABASE_ID as FIRESTORE_DATABASE_ID,
  checkFirebaseAdminHealth,
  classifyFirestoreError,
  formatFirebaseAdminErrorMessage,
  getFirebaseAdminAuth as getAdminAuth,
  getFirebaseAdminDb as getAdminDb,
  getFirebaseAdminFieldValue as getAdminFieldValue,
  getFirebaseAdminState,
  getSafeFirebaseAdmin,
  isFirebaseAdminReady as isAdminReady,
  normalizeServiceAccountPrivateKey as normalizePrivateKey,
  resetFirebaseAdminCacheForTests,
} from '../server/firebaseAdmin.ts';
