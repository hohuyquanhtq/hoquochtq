import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import {
  getAuth,
  signOut,
  onAuthStateChanged,
  User as FirebaseUser,
  Auth,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDocFromServer,
  getDoc,
  collection,
  query,
  where,
  getDocs,
  setDoc,
  writeBatch,
  serverTimestamp,
  Firestore,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import { Exam, Question, StudentSubmission } from '../types';
import {
  isValidSixDigitPublicCode,
  normalizeExamCode,
  normalizeExamCodeCompact,
} from '../utils/urlHelper';

function cleanEnvStr(val: unknown): string {
  return typeof val === 'string' ? val.trim() : '';
}

function resolveFirebaseConfig() {
  const env = (typeof import.meta !== 'undefined' ? (import.meta as any).env : {}) || {};
  const envProjectId = cleanEnvStr(env.VITE_FIREBASE_PROJECT_ID);
  const resolvedProjectId = envProjectId || firebaseConfig.projectId;
  const envDatabaseId =
    cleanEnvStr(env.VITE_FIREBASE_DATABASE_ID) ||
    cleanEnvStr(env.VITE_FIREBASE_FIRESTORE_DATABASE_ID);

  // Only inherit bundled named firestoreDatabaseId when pointing to the bundled project
  const resolvedDatabaseId =
    envDatabaseId ||
    (resolvedProjectId === firebaseConfig.projectId ? firebaseConfig.firestoreDatabaseId : '');

  return {
    projectId: resolvedProjectId,
    appId: cleanEnvStr(env.VITE_FIREBASE_APP_ID) || firebaseConfig.appId,
    apiKey: cleanEnvStr(env.VITE_FIREBASE_API_KEY) || firebaseConfig.apiKey,
    authDomain: cleanEnvStr(env.VITE_FIREBASE_AUTH_DOMAIN) || firebaseConfig.authDomain,
    firestoreDatabaseId: resolvedDatabaseId,
    storageBucket: cleanEnvStr(env.VITE_FIREBASE_STORAGE_BUCKET) || firebaseConfig.storageBucket,
    messagingSenderId: cleanEnvStr(env.VITE_FIREBASE_MESSAGING_SENDER_ID) || firebaseConfig.messagingSenderId,
    measurementId: firebaseConfig.measurementId || '',
  };
}

const resolvedConfig = resolveFirebaseConfig();
let app: FirebaseApp;
let db: Firestore;
let auth: Auth;
let firebaseInitError: string | null = null;

try {
  if (!resolvedConfig.apiKey || !resolvedConfig.projectId || !resolvedConfig.appId) {
    throw new Error('Thiếu cấu hình Firebase (apiKey / projectId / appId).');
  }
  app = getApps().length > 0 ? getApp() : initializeApp(resolvedConfig);
  db = resolvedConfig.firestoreDatabaseId
    ? getFirestore(app, resolvedConfig.firestoreDatabaseId)
    : getFirestore(app);
  auth = getAuth(app);
} catch (initErr) {
  firebaseInitError = initErr instanceof Error ? initErr.message : String(initErr);
  console.error('[HQTest Firebase] Lỗi khởi tạo Firebase:', initErr);
  app = (getApps()[0] || {}) as FirebaseApp;
  db = {} as Firestore;
  auth = {} as Auth;
}

export { app, db, auth, firebaseInitError };

export function getFirebaseProjectInfo(): {
  projectId: string;
  databaseId: string;
  bundledProjectId: string;
  bundledDatabaseId: string;
  isEnvOverridden: boolean;
  projectMismatchSuspected: boolean;
  initialized: boolean;
  initError: string | null;
} {
  const activeProjectId = resolvedConfig.projectId || '';
  const activeDatabaseId = resolvedConfig.firestoreDatabaseId || '(default)';
  const bundledProjectId = firebaseConfig.projectId || '';
  const bundledDatabaseId = firebaseConfig.firestoreDatabaseId || '(default)';
  const isEnvOverridden =
    activeProjectId !== bundledProjectId || activeDatabaseId !== bundledDatabaseId;

  return {
    projectId: activeProjectId,
    databaseId: activeDatabaseId,
    bundledProjectId,
    bundledDatabaseId,
    isEnvOverridden,
    projectMismatchSuspected: isEnvOverridden,
    initialized: !firebaseInitError,
    initError: firebaseInitError,
  };
}

// Required Firestore connectivity probe on startup
async function testFirestoreConnection(): Promise<void> {
  if (firebaseInitError) return;
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Firebase Firestore client is offline. Please verify firebase-applet-config.json.');
    }
  }
}
if (typeof window !== 'undefined') {
  void testFirestoreConnection();
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Recursively removes undefined keys from plain objects and arrays while
 * preserving special instances such as Date and Firestore FieldValue (serverTimestamp).
 */
export function stripUndefinedDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefinedDeep(item)) as unknown as T;
  }
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (v !== undefined) {
        out[k] = stripUndefinedDeep(v);
      }
    }
    return out as T;
  }
  return value;
}

/**
 * Strips all answer keys, solutions, and internal teacher fields from a question
 * before sending it to student-facing views or public Firestore collections.
 */
export function sanitizeQuestionForStudent(q: Question): Question {
  const safeQ = (q || {}) as Partial<Question>;
  const sanitized: Question = {
    id: safeQ.id || `q_${Math.random().toString(36).slice(2, 8)}`,
    code: safeQ.code || '',
    content: safeQ.content || '',
    type: safeQ.type || 'part1_single_choice',
    grade: safeQ.grade || '12',
    topic: safeQ.topic || 'hoa_dai_cuong',
    level: safeQ.level || 'nhan_biet',
    authorId: '',
    createdAt: safeQ.createdAt || '',
    updatedAt: safeQ.updatedAt || '',
  };

  if (safeQ.imageUrl) sanitized.imageUrl = safeQ.imageUrl;
  if (safeQ.sectionId) sanitized.sectionId = safeQ.sectionId;
  if (safeQ.section) sanitized.section = safeQ.section;
  if (safeQ.part) sanitized.part = safeQ.part;
  if (safeQ.sectionTitle) sanitized.sectionTitle = safeQ.sectionTitle;
  if (safeQ.partTitle) sanitized.partTitle = safeQ.partTitle;

  if (Array.isArray(safeQ.options)) {
    sanitized.options = safeQ.options
      .filter((opt) => opt && typeof opt === 'object')
      .map((opt) => ({
        id: opt.id || '',
        text: opt.text || '',
        // Explicitly omit isCorrect
      }));
  }

  if (Array.isArray(safeQ.statements)) {
    sanitized.statements = safeQ.statements
      .filter((stmt) => stmt && typeof stmt === 'object')
      .map((stmt) => ({
        id: stmt.id || '',
        statement: stmt.statement || '',
        correctAnswer: false, // Placeholder masked for type compatibility; never trusted client-side before review
        // Explicitly omit real correctAnswer & explanation
      }));
  }

  if (safeQ.shortAnswerConfig && typeof safeQ.shortAnswerConfig === 'object') {
    sanitized.shortAnswerConfig = {
      acceptableAnswers: [],
      isNumeric: !!safeQ.shortAnswerConfig.isNumeric,
      ...(safeQ.shortAnswerConfig.unit ? { unit: safeQ.shortAnswerConfig.unit } : {}),
    };
  }

  return sanitized;
}

/**
 * Produces a student-safe exam object with zero answer keys or solutions.
 */
export function sanitizeExamForStudent(exam: Exam): Exam {
  const rawQuestions = Array.isArray(exam?.questions) ? exam.questions : [];
  const safeQuestions = rawQuestions.filter((q) => q && typeof q === 'object').map(sanitizeQuestionForStudent);

  return {
    id: exam?.id || '',
    title: (exam?.title || 'Bài kiểm tra HQTest').slice(0, 300),
    code: normalizeExamCode(exam?.code || ''),
    ...(isValidSixDigitPublicCode(exam?.publicCode) ? { publicCode: exam.publicCode.trim() } : {}),
    grade: exam?.grade || '12',
    ...(exam?.topic ? { topic: exam.topic } : {}),
    durationMinutes: exam?.durationMinutes || 45,
    totalQuestions: exam?.totalQuestions || safeQuestions.length,
    totalScore: exam?.totalScore || 10.0,
    questions: safeQuestions,
    rules: exam?.rules || {
      part1ScorePerQuestion: 0.25,
      part2GradingModel: 'standard_moet',
      part3ScorePerQuestion: 0.25,
      totalTargetScore: 10.0,
    },
    shuffleQuestions: !!exam?.shuffleQuestions,
    shuffleOptions: !!exam?.shuffleOptions,
    isPublished: !!exam?.isPublished,
    ...(exam?.openAt ? { openAt: exam.openAt } : {}),
    ...(exam?.closeAt ? { closeAt: exam.closeAt } : {}),
    maxAttempts: exam?.maxAttempts ?? 1,
    showScoreAfterSubmit: !!exam?.showScoreAfterSubmit,
    showAnswersAfterSubmit:
      typeof exam?.allowAnswerReview === 'boolean'
        ? exam.allowAnswerReview
        : !!exam?.showAnswersAfterSubmit,
    showSolutionsAfterSubmit: !!exam?.showSolutionsAfterSubmit,
    allowReviewLater: !!exam?.allowReviewLater,
    requiresPassword: !!exam?.requiresPassword,
    ...(exam?.passwordUpdatedAt !== undefined ? { passwordUpdatedAt: exam.passwordUpdatedAt } : {}),
    ...(typeof exam?.allowAnswerReview === 'boolean'
      ? { allowAnswerReview: exam.allowAnswerReview }
      : {}),
    ...(typeof exam?.answerReviewMinScore === 'number'
      ? { answerReviewMinScore: exam.answerReviewMinScore }
      : {}),
    ...(exam?.answerReviewEnabledAt !== undefined
      ? { answerReviewEnabledAt: exam.answerReviewEnabledAt }
      : {}),
    ...(Array.isArray(exam?.assignedClassCodes) && exam.assignedClassCodes.length > 0
      ? { assignedClassCodes: exam.assignedClassCodes.slice(0, 100) }
      : {}),
    authorId: '',
    authorName: (exam?.authorName || 'Giáo viên').slice(0, 150),
    createdAt: exam?.createdAt || '',
    updatedAt: exam?.updatedAt || '',
  };
}

export interface AnswerKeyEntry {
  type: Question['type'];
  correctOptionId?: string;
  statements?: Record<string, boolean>;
  statementExplanations?: Record<string, string>;
  shortAnswerConfig?: Question['shortAnswerConfig'];
  explanation?: string;
}

export function extractAnswerKeyMap(exam: Exam): Record<string, AnswerKeyEntry> {
  const answerMap: Record<string, AnswerKeyEntry> = {};
  (exam.questions || []).forEach((q) => {
    const entry: AnswerKeyEntry = { type: q.type };
    if (q.type === 'part1_single_choice' && q.correctOptionId) {
      entry.correctOptionId = q.correctOptionId;
    }
    if (q.type === 'part2_true_false' && q.statements) {
      const stMap: Record<string, boolean> = {};
      const stExp: Record<string, string> = {};
      q.statements.forEach((s) => {
        stMap[s.id] = !!s.correctAnswer;
        if (exam.showSolutionsAfterSubmit && s.explanation) {
          stExp[s.id] = s.explanation;
        }
      });
      entry.statements = stMap;
      if (Object.keys(stExp).length > 0) {
        entry.statementExplanations = stExp;
      }
    }
    if (q.type === 'part3_short_answer' && q.shortAnswerConfig) {
      entry.shortAnswerConfig = stripUndefinedDeep(q.shortAnswerConfig);
    }
    if (exam.showSolutionsAfterSubmit && q.explanation) {
      entry.explanation = q.explanation;
    }
    answerMap[q.id] = entry;
  });
  return answerMap;
}

export function rehydrateExamWithAnswerKeys(
  publicExam: Exam,
  answerMap: Record<string, AnswerKeyEntry>,
  includeSolutions: boolean
): Exam {
  return {
    ...publicExam,
    questions: (publicExam.questions || []).map((q) => {
      const key = answerMap[q.id];
      if (!key) return q;
      const hydrated: Question = { ...q };
      if (q.type === 'part1_single_choice' && key.correctOptionId) {
        hydrated.correctOptionId = key.correctOptionId;
        if (hydrated.options) {
          hydrated.options = hydrated.options.map((opt) => ({
            ...opt,
            isCorrect: opt.id === key.correctOptionId,
          }));
        }
      }
      if (q.type === 'part2_true_false' && hydrated.statements && key.statements) {
        hydrated.statements = hydrated.statements.map((st) => ({
          ...st,
          correctAnswer: !!key.statements?.[st.id],
          ...(includeSolutions && key.statementExplanations?.[st.id]
            ? { explanation: key.statementExplanations[st.id] }
            : {}),
        }));
      }
      if (q.type === 'part3_short_answer' && key.shortAnswerConfig) {
        hydrated.shortAnswerConfig = key.shortAnswerConfig;
      }
      if (includeSolutions && key.explanation) {
        hydrated.explanation = key.explanation;
      }
      return hydrated;
    }),
  };
}

// --- Auth Helpers ---
export function subscribeAuthState(callback: (user: FirebaseUser | null) => void): () => void {
  if (firebaseInitError || !auth || typeof onAuthStateChanged !== 'function') {
    callback(null);
    return () => {};
  }
  try {
    return onAuthStateChanged(auth, callback);
  } catch (err) {
    console.warn('Auth state subscription failed:', err);
    callback(null);
    return () => {};
  }
}

export async function signOutFromCloud(): Promise<void> {
  if (firebaseInitError) return;
  await signOut(auth);
}

// --- Cloud Exam Sync (Teacher) ---
export async function syncExamToFirestore(
  exam: Exam,
  explicitOwnerId?: string
): Promise<{ synced: boolean; reason?: string }> {
  if (firebaseInitError) {
    return { synced: false, reason: 'firebase_not_initialized' };
  }
  const user = auth?.currentUser;
  if (!user) {
    return { synced: false, reason: 'unauthenticated' };
  }

  const targetOwnerId = (explicitOwnerId || exam.ownerId || user.uid).trim();
  const normalizedCode = normalizeExamCode(exam.code);
  if (!normalizedCode || !/^[A-Z0-9-]+$/.test(normalizedCode)) {
    return { synced: false, reason: 'invalid_code' };
  }

  const nowIso = new Date().toISOString();
  const safeId = exam.id.replace(/[^a-zA-Z0-9_-]/g, '_');

  const hasExplicitAnswerPolicy = typeof exam.allowAnswerReview === 'boolean';
  const resolvedAllowAnswerReview = hasExplicitAnswerPolicy
    ? (exam.allowAnswerReview as boolean)
    : !!exam.showAnswersAfterSubmit;
  const resolvedMinScore =
    typeof exam.answerReviewMinScore === 'number' && Number.isFinite(exam.answerReviewMinScore)
      ? Math.max(0, Math.min(10, Math.round(exam.answerReviewMinScore * 100) / 100))
      : !hasExplicitAnswerPolicy && exam.showAnswersAfterSubmit === true
      ? 0
      : 8.0;
  const resolvedEnabledAt =
    typeof exam.answerReviewEnabledAt === 'string' && exam.answerReviewEnabledAt.trim()
      ? exam.answerReviewEnabledAt.trim()
      : null;
  const resolvedRequiresPassword = !!exam.requiresPassword;
  const resolvedPasswordUpdatedAt = exam.passwordUpdatedAt ?? null;

  const batch = writeBatch(db);

  // 1. Private master exam
  const validPublicCode = isValidSixDigitPublicCode(exam.publicCode) ? exam.publicCode.trim() : undefined;
  const masterPayload = stripUndefinedDeep({
    id: safeId,
    code: normalizedCode,
    ...(validPublicCode ? { publicCode: validPublicCode } : {}),
    title: exam.title.slice(0, 300),
    grade: exam.grade,
    ...(exam.topic ? { topic: exam.topic } : {}),
    ...(exam.folderId ? { folderId: exam.folderId } : {}),
    durationMinutes: Math.max(1, Math.min(600, exam.durationMinutes || 45)),
    totalQuestions: exam.questions?.length ?? exam.totalQuestions ?? 0,
    totalScore: exam.totalScore || 10.0,
    questions: (exam.questions || []).slice(0, 200),
    rules: exam.rules,
    shuffleQuestions: !!exam.shuffleQuestions,
    shuffleOptions: !!exam.shuffleOptions,
    isPublished: !!exam.isPublished,
    ...(exam.openAt ? { openAt: exam.openAt } : {}),
    ...(exam.closeAt ? { closeAt: exam.closeAt } : {}),
    maxAttempts: exam.maxAttempts ?? 1,
    showScoreAfterSubmit: !!exam.showScoreAfterSubmit,
    showAnswersAfterSubmit: resolvedAllowAnswerReview,
    showSolutionsAfterSubmit: !!exam.showSolutionsAfterSubmit,
    allowReviewLater: !!exam.allowReviewLater,
    requiresPassword: resolvedRequiresPassword,
    passwordUpdatedAt: resolvedPasswordUpdatedAt,
    allowAnswerReview: resolvedAllowAnswerReview,
    answerReviewMinScore: resolvedMinScore,
    answerReviewEnabledAt: resolvedEnabledAt,
    ...(Array.isArray(exam.assignedClassCodes) && exam.assignedClassCodes.length > 0
      ? { assignedClassCodes: exam.assignedClassCodes.slice(0, 100) }
      : {}),
    ownerId: targetOwnerId,
    authorId: exam.authorId || targetOwnerId,
    authorName: (exam.authorName || user.displayName || 'Giáo viên').slice(0, 150),
    createdAt: exam.createdAt || nowIso,
    updatedAt: nowIso,
  });

  const examRef = doc(db, 'exams', safeId);
  const existingMaster = await getDoc(examRef).catch(() => null);
  const existingCreatedAt = existingMaster?.exists() ? existingMaster.data()?.serverCreatedAt : null;
  batch.set(examRef, {
    ...masterPayload,
    serverCreatedAt: existingCreatedAt || serverTimestamp(),
    serverUpdatedAt: serverTimestamp(),
  });

  // 2. Public exam availability metadata (no questions, no answers, no password hashes)
  const statusPayload = stripUndefinedDeep({
    examCode: normalizedCode,
    ...(validPublicCode ? { publicCode: validPublicCode } : {}),
    examId: safeId,
    title: masterPayload.title,
    grade: masterPayload.grade,
    durationMinutes: masterPayload.durationMinutes,
    totalQuestions: masterPayload.totalQuestions,
    totalScore: masterPayload.totalScore,
    isPublished: masterPayload.isPublished,
    ...(exam.openAt ? { openAt: exam.openAt } : {}),
    ...(exam.closeAt ? { closeAt: exam.closeAt } : {}),
    requiresPassword: resolvedRequiresPassword,
    allowAnswerReview: resolvedAllowAnswerReview,
    answerReviewMinScore: resolvedMinScore,
    answerReviewEnabledAt: resolvedEnabledAt,
    showScoreAfterSubmit: !!exam.showScoreAfterSubmit,
    showSolutionsAfterSubmit: !!exam.showSolutionsAfterSubmit,
    maxAttempts: exam.maxAttempts ?? 1,
    authorName: masterPayload.authorName,
    ownerId: targetOwnerId,
    updatedAt: nowIso,
    serverUpdatedAt: serverTimestamp(),
  });
  batch.set(doc(db, 'examStatus', normalizedCode), statusPayload);

  // 3. Sanitized public exam (when unpublished, write empty questions list so questions are wiped)
  const sanitized = sanitizeExamForStudent({
    ...exam,
    id: safeId,
    code: normalizedCode,
    ...(validPublicCode ? { publicCode: validPublicCode } : {}),
    requiresPassword: resolvedRequiresPassword,
    passwordUpdatedAt: resolvedPasswordUpdatedAt,
    allowAnswerReview: resolvedAllowAnswerReview,
    answerReviewMinScore: resolvedMinScore,
    answerReviewEnabledAt: resolvedEnabledAt,
    showAnswersAfterSubmit: resolvedAllowAnswerReview,
  });
  const publicPayload = stripUndefinedDeep({
    ...sanitized,
    questions: masterPayload.isPublished ? sanitized.questions : [],
    ownerId: targetOwnerId,
    updatedAt: nowIso,
    serverUpdatedAt: serverTimestamp(),
  });
  // Ensure authorId is omitted on public projection
  delete (publicPayload as Record<string, unknown>).authorId;
  batch.set(doc(db, 'publicExams', normalizedCode), publicPayload);

  // 4. Separated answer keys (never readable directly by students via Firestore rules)
  const keyPayload = stripUndefinedDeep({
    examCode: normalizedCode,
    examId: safeId,
    ownerId: targetOwnerId,
    isPublished: masterPayload.isPublished,
    showAnswersAfterSubmit: resolvedAllowAnswerReview,
    showSolutionsAfterSubmit: masterPayload.showSolutionsAfterSubmit,
    allowAnswerReview: resolvedAllowAnswerReview,
    answerReviewMinScore: resolvedMinScore,
    answerReviewEnabledAt: resolvedEnabledAt,
    answerMap: extractAnswerKeyMap({ ...exam, id: safeId, code: normalizedCode }),
    updatedAt: nowIso,
    serverUpdatedAt: serverTimestamp(),
  });
  batch.set(doc(db, 'examKeys', normalizedCode), keyPayload);

  try {
    await batch.commit();
    return { synced: true };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `exams/${safeId}`);
  }
}

export async function deleteExamFromFirestore(exam: Exam): Promise<void> {
  if (firebaseInitError) return;
  const user = auth?.currentUser;
  if (!user) return;

  const safeId = exam.id.replace(/[^a-zA-Z0-9_-]/g, '_');
  const normalizedCode = normalizeExamCode(exam.code);
  const batch = writeBatch(db);
  batch.delete(doc(db, 'exams', safeId));
  if (normalizedCode) {
    batch.delete(doc(db, 'examStatus', normalizedCode));
    batch.delete(doc(db, 'publicExams', normalizedCode));
    batch.delete(doc(db, 'examKeys', normalizedCode));
  }
  try {
    await batch.commit();
    if (normalizedCode) {
      const { deleteDoc } = await import('firebase/firestore');
      await deleteDoc(doc(db, 'examSecrets', normalizedCode)).catch(() => {});
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `exams/${safeId}`);
  }
}

export async function fetchTeacherExamsFromFirestore(uid: string): Promise<Exam[]> {
  if (firebaseInitError || !uid) return [];
  try {
    const q = query(collection(db, 'exams'), where('ownerId', '==', uid));
    const snap = await getDocs(q);
    return snap.docs.map((d) => {
      const data = d.data() as Exam;
      return data;
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'exams');
  }
}

export async function fetchTeacherSubmissionsFromFirestore(uid: string): Promise<StudentSubmission[]> {
  if (firebaseInitError || !uid) return [];
  try {
    const q = query(collection(db, 'submissions'), where('ownerId', '==', uid));
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as StudentSubmission);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'submissions');
  }
}

// --- Public Student Lookup & Submission ---
export type CloudExamLookupStatus =
  | 'found'
  | 'password_required'
  | 'not_found'
  | 'not_published'
  | 'not_started'
  | 'expired'
  | 'unauthorized'
  | 'network_error'
  | 'firebase_not_initialized'
  | 'unexpected_error';

export interface CloudExamLookupResult {
  status: CloudExamLookupStatus;
  exam?: Exam;
  ownerId?: string;
  message?: string;
}

function classifyFirestoreError(error: unknown): {
  status: 'unauthorized' | 'network_error' | 'unexpected_error';
  message: string;
} {
  const errObj = error as { code?: string; message?: string } | undefined;
  const code = (errObj?.code || '').toLowerCase();
  const msg = (errObj?.message || String(error || '')).toLowerCase();

  if (code.includes('permission-denied') || code.includes('unauthenticated') || msg.includes('missing or insufficient permissions')) {
    return {
      status: 'unauthorized',
      message: 'Không đủ quyền truy cập dữ liệu bài thi này trên máy chủ. Vui lòng liên hệ giáo viên kiểm tra trạng thái mở thi.',
    };
  }

  if (
    code.includes('unavailable') ||
    code.includes('deadline-exceeded') ||
    msg.includes('offline') ||
    msg.includes('network') ||
    msg.includes('failed to fetch') ||
    msg.includes('timeout')
  ) {
    return {
      status: 'network_error',
      message: 'Không thể kết nối tới máy chủ Firebase (mạng yếu hoặc mất kết nối). Vui lòng kiểm tra Internet và thử lại.',
    };
  }

  return {
    status: 'unexpected_error',
    message: 'Đã xảy ra lỗi hệ thống khi tải thông tin bài thi. Vui lòng thử lại sau giây lát.',
  };
}

export async function fetchPublicExamFromFirestore(rawCode: string): Promise<CloudExamLookupResult> {
  if (firebaseInitError) {
    return {
      status: 'firebase_not_initialized',
      message: `Dịch vụ Firestore chưa khởi tạo thành công (${firebaseInitError}). Vui lòng kiểm tra cấu hình hoặc tải lại trang.`,
    };
  }

  const normalized = normalizeExamCode(rawCode);
  const compact = normalizeExamCodeCompact(rawCode);
  const candidateCodes = Array.from(new Set([normalized, compact].filter(Boolean)));

  let lastNonNotFoundFailure: CloudExamLookupResult | null = null;

  for (const code of candidateCodes) {
    if (!/^[A-Z0-9-]+$/.test(code) || code.length < 2 || code.length > 32) continue;
    try {
      const statusSnap = await getDoc(doc(db, 'examStatus', code));
      if (!statusSnap.exists()) continue;

      const statusData = statusSnap.data() as {
        examCode?: string;
        publicCode?: string;
        examId?: string;
        title?: string;
        grade?: Exam['grade'];
        durationMinutes?: number;
        totalQuestions?: number;
        totalScore?: number;
        isPublished?: boolean;
        openAt?: string;
        closeAt?: string;
        requiresPassword?: boolean;
        allowAnswerReview?: boolean;
        answerReviewMinScore?: number;
        answerReviewEnabledAt?: string | null;
        showScoreAfterSubmit?: boolean;
        showSolutionsAfterSubmit?: boolean;
        maxAttempts?: number;
        authorName?: string;
        ownerId?: string;
      };

      const recordExamCode = normalizeExamCode(statusData.examCode || code);
      if (recordExamCode !== code && normalizeExamCodeCompact(recordExamCode) !== normalizeExamCodeCompact(code)) {
        continue;
      }

      const placeholderExam: Exam = {
        id: statusData.examId || code,
        code: recordExamCode,
        ...(isValidSixDigitPublicCode(statusData.publicCode)
          ? { publicCode: statusData.publicCode.trim() }
          : {}),
        title: statusData.title || `Bài thi ${recordExamCode}`,
        grade: statusData.grade || '12',
        durationMinutes: statusData.durationMinutes || 45,
        totalQuestions: statusData.totalQuestions || 0,
        totalScore: statusData.totalScore || 10.0,
        questions: [],
        rules: {
          part1ScorePerQuestion: 0.25,
          part2GradingModel: 'standard_moet',
          part3ScorePerQuestion: 0.25,
          totalTargetScore: 10.0,
        },
        shuffleQuestions: false,
        shuffleOptions: false,
        isPublished: !!statusData.isPublished,
        openAt: statusData.openAt,
        closeAt: statusData.closeAt,
        maxAttempts: statusData.maxAttempts ?? 1,
        showScoreAfterSubmit:
          typeof statusData.showScoreAfterSubmit === 'boolean' ? statusData.showScoreAfterSubmit : true,
        showAnswersAfterSubmit:
          typeof statusData.allowAnswerReview === 'boolean' ? statusData.allowAnswerReview : false,
        showSolutionsAfterSubmit: !!statusData.showSolutionsAfterSubmit,
        allowReviewLater: false,
        requiresPassword: !!statusData.requiresPassword,
        ...(typeof statusData.allowAnswerReview === 'boolean'
          ? { allowAnswerReview: statusData.allowAnswerReview }
          : {}),
        ...(typeof statusData.answerReviewMinScore === 'number'
          ? { answerReviewMinScore: statusData.answerReviewMinScore }
          : {}),
        ...(statusData.answerReviewEnabledAt !== undefined
          ? { answerReviewEnabledAt: statusData.answerReviewEnabledAt }
          : {}),
        authorId: '',
        authorName: statusData.authorName || 'Giáo viên',
        createdAt: '',
        updatedAt: '',
      };

      if (!statusData.isPublished) {
        return {
          status: 'not_published',
          exam: placeholderExam,
          ownerId: statusData.ownerId,
          message: `Bài thi "${placeholderExam.title}" (Mã: ${placeholderExam.code}) hiện đang ở trạng thái Bản nháp hoặc đã được giáo viên đóng phòng thi.`,
        };
      }

      const now = new Date();
      if (statusData.openAt) {
        const openTime = new Date(statusData.openAt);
        if (!isNaN(openTime.getTime()) && now < openTime) {
          return {
            status: 'not_started',
            exam: placeholderExam,
            ownerId: statusData.ownerId,
            message: `Bài thi chưa đến giờ mở phòng. Thời gian bắt đầu: ${openTime.toLocaleString('vi-VN')}`,
          };
        }
      }

      if (statusData.closeAt) {
        const closeTime = new Date(statusData.closeAt);
        if (!isNaN(closeTime.getTime()) && now > closeTime) {
          return {
            status: 'expired',
            exam: placeholderExam,
            ownerId: statusData.ownerId,
            message: `Bài thi đã hết thời hạn tham gia lúc: ${closeTime.toLocaleString('vi-VN')}`,
          };
        }
      }

      // If exam is password-protected, NEVER fetch publicExams/{code} directly before unlock!
      if (statusData.requiresPassword === true) {
        if (auth?.currentUser) {
          const { accessExamQuestionsOnServer } = await import('./examSecurityApi');
          const accessRes = await accessExamQuestionsOnServer(recordExamCode);
          if (accessRes.authorized && accessRes.exam) {
            return {
              status: 'found',
              exam: sanitizeExamForStudent(accessRes.exam),
              ownerId: accessRes.exam.ownerId || statusData.ownerId,
            };
          }
          if (accessRes.status === 'not_published' || accessRes.status === 'not_started' || accessRes.status === 'expired') {
            return {
              status: accessRes.status,
              exam: placeholderExam,
              ownerId: statusData.ownerId,
              message: accessRes.error,
            };
          }
        }
        return {
          status: 'password_required',
          exam: placeholderExam,
          ownerId: statusData.ownerId,
          message: `Bài thi "${placeholderExam.title}" được bảo vệ bằng mật khẩu. Vui lòng nhập mật khẩu đề thi do giáo viên cung cấp.`,
        };
      }

      const publicSnap = await getDoc(doc(db, 'publicExams', code));
      if (!publicSnap.exists()) {
        return {
          status: 'not_found',
          message: `Không tìm thấy nội dung bài thi cho mã "${recordExamCode}".`,
        };
      }

      const pubData = publicSnap.data() as Exam & { ownerId?: string };
      return {
        status: 'found',
        exam: sanitizeExamForStudent(pubData),
        ownerId: pubData.ownerId || statusData.ownerId,
      };
    } catch (error) {
      console.warn('Cloud exam lookup error for code', code, error);
      const classified = classifyFirestoreError(error);
      lastNonNotFoundFailure = {
        status: classified.status,
        message: classified.message,
      };
    }
  }

  if (lastNonNotFoundFailure) {
    return lastNonNotFoundFailure;
  }

  return { status: 'not_found' };
}

export async function fetchPublicExamByPublicCode(
  rawPublicCode: string
): Promise<CloudExamLookupResult> {
  if (firebaseInitError) {
    return {
      status: 'firebase_not_initialized',
      message: `Dịch vụ Firestore chưa khởi tạo thành công (${firebaseInitError}). Vui lòng kiểm tra cấu hình hoặc tải lại trang.`,
    };
  }

  const cleanPublicCode = (rawPublicCode || '').trim();
  if (!isValidSixDigitPublicCode(cleanPublicCode)) {
    return {
      status: 'not_found',
      message: 'Đường dẫn đề thi không hợp lệ hoặc không tồn tại',
    };
  }

  try {
    const linkSnap = await getDoc(doc(db, 'examLinks', cleanPublicCode));
    if (!linkSnap.exists()) {
      return {
        status: 'not_found',
        message: 'Đường dẫn đề thi không hợp lệ hoặc không tồn tại',
      };
    }

    const linkData = linkSnap.data() as {
      examId?: string;
      examCode?: string;
      ownerId?: string;
      isActive?: boolean;
    };

    if (linkData.isActive === false) {
      return {
        status: 'not_published',
        ownerId: linkData.ownerId,
        message: 'Đề thi hiện không còn khả dụng',
      };
    }

    const targetExamCode = normalizeExamCode(linkData.examCode || '');
    if (!targetExamCode) {
      return {
        status: 'not_found',
        message: 'Đường dẫn đề thi không hợp lệ hoặc không tồn tại',
      };
    }

    const res = await fetchPublicExamFromFirestore(targetExamCode);
    if (res.status === 'not_found') {
      return {
        status: 'not_found',
        message: 'Đề thi đã bị xóa hoặc không còn khả dụng.',
      };
    }

    if (res.status === 'not_published') {
      return {
        ...res,
        exam: res.exam ? { ...res.exam, publicCode: cleanPublicCode } : undefined,
        status: 'not_published',
        message: 'Đề thi hiện không còn khả dụng',
      };
    }

    return {
      ...res,
      exam: res.exam ? { ...res.exam, publicCode: cleanPublicCode } : undefined,
    };
  } catch (error) {
    console.warn('Cloud exam lookup error for publicCode', cleanPublicCode, error);
    const classified = classifyFirestoreError(error);
    return {
      status: classified.status,
      message: classified.message,
    };
  }
}

export async function fetchAllowedAnswerKeysAfterSubmit(
  examCode: string
): Promise<{ answerMap: Record<string, AnswerKeyEntry>; showSolutionsAfterSubmit: boolean } | null> {
  if (firebaseInitError) return null;
  const code = normalizeExamCode(examCode);
  if (!code) return null;
  try {
    const snap = await getDoc(doc(db, 'examKeys', code));
    if (!snap.exists()) return null;
    const data = snap.data() as {
      showAnswersAfterSubmit: boolean;
      showSolutionsAfterSubmit: boolean;
      answerMap: Record<string, AnswerKeyEntry>;
    };
    if (!data.showAnswersAfterSubmit) return null;
    return {
      answerMap: data.answerMap || {},
      showSolutionsAfterSubmit: !!data.showSolutionsAfterSubmit,
    };
  } catch {
    // Expected PERMISSION_DENIED when showAnswersAfterSubmit == false
    return null;
  }
}

export async function saveSubmissionToFirestore(
  submission: StudentSubmission,
  ownerId: string
): Promise<boolean> {
  if (firebaseInitError || !ownerId) return false;
  const safeSubId = submission.id.replace(/[^a-zA-Z0-9_-]/g, '_');
  const code = normalizeExamCode(submission.examCode);

  const payload = stripUndefinedDeep({
    id: safeSubId,
    examId: submission.examId.replace(/[^a-zA-Z0-9_-]/g, '_'),
    examTitle: (submission.examTitle || 'Bài thi HQTest').slice(0, 300),
    examCode: code,
    ...(submission.variantCode ? { variantCode: submission.variantCode } : {}),
    ownerId,
    studentId: (submission.studentId || safeSubId).slice(0, 128),
    studentName: (submission.studentName || 'Thí sinh').slice(0, 120),
    studentClass: (submission.studentClass || 'Chưa rõ lớp').slice(0, 80),
    startedAt: submission.startedAt,
    submittedAt: submission.submittedAt,
    durationSeconds: Math.max(0, submission.durationSeconds || 1),
    answers: submission.answers || {},
    part1Score: submission.part1Score || 0,
    part2Score: submission.part2Score || 0,
    part3Score: submission.part3Score || 0,
    totalScore: submission.totalScore || 0,
    maxPossibleScore: submission.maxPossibleScore || 10.0,
    correctQuestionsCount: submission.correctQuestionsCount || 0,
    ...(submission.tabSwitchesCount !== undefined ? { tabSwitchesCount: submission.tabSwitchesCount } : {}),
    status: submission.status || 'completed',
    createdAt: serverTimestamp(),
  });

  try {
    await setDoc(doc(db, 'submissions', safeSubId), payload);
    return true;
  } catch (error) {
    console.warn('Could not persist submission to Firestore:', error);
    return false;
  }
}
