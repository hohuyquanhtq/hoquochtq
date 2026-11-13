import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  User as FirebaseUser,
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
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import { Exam, Question, StudentSubmission } from '../types';
import { normalizeExamCode, normalizeExamCodeCompact } from '../utils/urlHelper';

// Initialize Firebase SDK per provisioning config
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

// Required Firestore connectivity probe on startup
async function testFirestoreConnection(): Promise<void> {
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

/**
 * Recursively removes undefined keys so Firestore never rejects payloads.
 */
function stripUndefinedDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefinedDeep(item)) as unknown as T;
  }
  if (value !== null && typeof value === 'object' && !(value instanceof Date)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
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
  const sanitized: Question = {
    id: q.id,
    code: q.code,
    content: q.content,
    type: q.type,
    grade: q.grade,
    topic: q.topic,
    level: q.level,
    authorId: '',
    createdAt: q.createdAt,
    updatedAt: q.updatedAt,
  };

  if (q.imageUrl) sanitized.imageUrl = q.imageUrl;

  if (q.options) {
    sanitized.options = q.options.map((opt) => ({
      id: opt.id,
      text: opt.text,
      // Explicitly omit isCorrect
    }));
  }

  if (q.statements) {
    sanitized.statements = q.statements.map((stmt) => ({
      id: stmt.id,
      statement: stmt.statement,
      correctAnswer: false, // Placeholder masked for type compatibility; never trusted client-side before review
      // Explicitly omit real correctAnswer & explanation
    }));
  }

  if (q.shortAnswerConfig) {
    sanitized.shortAnswerConfig = {
      acceptableAnswers: [],
      isNumeric: !!q.shortAnswerConfig.isNumeric,
      ...(q.shortAnswerConfig.unit ? { unit: q.shortAnswerConfig.unit } : {}),
    };
  }

  return sanitized;
}

/**
 * Produces a student-safe exam object with zero answer keys or solutions.
 */
export function sanitizeExamForStudent(exam: Exam): Exam {
  return {
    id: exam.id,
    title: exam.title,
    code: normalizeExamCode(exam.code),
    grade: exam.grade,
    ...(exam.topic ? { topic: exam.topic } : {}),
    durationMinutes: exam.durationMinutes,
    totalQuestions: exam.totalQuestions || exam.questions.length,
    totalScore: exam.totalScore || 10.0,
    questions: (exam.questions || []).map(sanitizeQuestionForStudent),
    rules: exam.rules,
    shuffleQuestions: !!exam.shuffleQuestions,
    shuffleOptions: !!exam.shuffleOptions,
    isPublished: !!exam.isPublished,
    ...(exam.openAt ? { openAt: exam.openAt } : {}),
    ...(exam.closeAt ? { closeAt: exam.closeAt } : {}),
    maxAttempts: exam.maxAttempts ?? 1,
    showScoreAfterSubmit: !!exam.showScoreAfterSubmit,
    showAnswersAfterSubmit: !!exam.showAnswersAfterSubmit,
    showSolutionsAfterSubmit: !!exam.showSolutionsAfterSubmit,
    allowReviewLater: !!exam.allowReviewLater,
    authorId: '',
    authorName: exam.authorName || 'Giáo viên',
    createdAt: exam.createdAt,
    updatedAt: exam.updatedAt,
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
  return onAuthStateChanged(auth, callback);
}

export async function signInWithGoogleForCloudSync(): Promise<FirebaseUser> {
  const cred = await signInWithPopup(auth, googleProvider);
  return cred.user;
}

export async function signOutFromCloud(): Promise<void> {
  await signOut(auth);
}

// --- Cloud Exam Sync (Teacher) ---
export async function syncExamToFirestore(exam: Exam): Promise<{ synced: boolean; reason?: string }> {
  const user = auth.currentUser;
  if (!user || !user.emailVerified) {
    return { synced: false, reason: 'unauthenticated' };
  }

  const normalizedCode = normalizeExamCode(exam.code);
  if (!normalizedCode || !/^[A-Z0-9-]+$/.test(normalizedCode)) {
    return { synced: false, reason: 'invalid_code' };
  }

  const nowIso = new Date().toISOString();
  const safeId = exam.id.replace(/[^a-zA-Z0-9_-]/g, '_');

  const batch = writeBatch(db);

  // 1. Private master exam
  const masterPayload = stripUndefinedDeep({
    id: safeId,
    code: normalizedCode,
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
    showAnswersAfterSubmit: !!exam.showAnswersAfterSubmit,
    showSolutionsAfterSubmit: !!exam.showSolutionsAfterSubmit,
    allowReviewLater: !!exam.allowReviewLater,
    ownerId: user.uid,
    authorId: exam.authorId || user.uid,
    authorName: (exam.authorName || user.displayName || 'Giáo viên').slice(0, 150),
    createdAt: exam.createdAt || nowIso,
    updatedAt: nowIso,
  });

  const examRef = doc(db, 'exams', safeId);
  const existingMaster = await getDoc(examRef).catch(() => null);
  batch.set(examRef, {
    ...masterPayload,
    serverCreatedAt: existingMaster?.exists() ? existingMaster.data().serverCreatedAt : serverTimestamp(),
    serverUpdatedAt: serverTimestamp(),
  });

  // 2. Public exam availability metadata (no questions, no answers)
  const statusPayload = stripUndefinedDeep({
    examCode: normalizedCode,
    examId: safeId,
    title: masterPayload.title,
    grade: masterPayload.grade,
    durationMinutes: masterPayload.durationMinutes,
    totalQuestions: masterPayload.totalQuestions,
    totalScore: masterPayload.totalScore,
    isPublished: masterPayload.isPublished,
    ...(exam.openAt ? { openAt: exam.openAt } : {}),
    ...(exam.closeAt ? { closeAt: exam.closeAt } : {}),
    authorName: masterPayload.authorName,
    ownerId: user.uid,
    updatedAt: nowIso,
    serverUpdatedAt: serverTimestamp(),
  });
  batch.set(doc(db, 'examStatus', normalizedCode), statusPayload);

  // 3. Sanitized public exam (when unpublished, write empty questions list so questions are wiped)
  const sanitized = sanitizeExamForStudent({ ...exam, id: safeId, code: normalizedCode });
  const publicPayload = stripUndefinedDeep({
    ...sanitized,
    questions: masterPayload.isPublished ? sanitized.questions : [],
    ownerId: user.uid,
    updatedAt: nowIso,
    serverUpdatedAt: serverTimestamp(),
  });
  // Ensure authorId is omitted or clean on public projection if not in schema
  delete (publicPayload as Record<string, unknown>).authorId;
  batch.set(doc(db, 'publicExams', normalizedCode), publicPayload);

  // 4. Separated answer keys (never contains keys for students when showAnswersAfterSubmit is false via Firestore rules)
  const keyPayload = stripUndefinedDeep({
    examCode: normalizedCode,
    examId: safeId,
    ownerId: user.uid,
    isPublished: masterPayload.isPublished,
    showAnswersAfterSubmit: masterPayload.showAnswersAfterSubmit,
    showSolutionsAfterSubmit: masterPayload.showSolutionsAfterSubmit,
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
  const user = auth.currentUser;
  if (!user || !user.emailVerified) return;

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
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `exams/${safeId}`);
  }
}

export async function fetchTeacherExamsFromFirestore(uid: string): Promise<Exam[]> {
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
  try {
    const q = query(collection(db, 'submissions'), where('ownerId', '==', uid));
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as StudentSubmission);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'submissions');
  }
}

// --- Public Student Lookup & Submission ---
export interface CloudExamLookupResult {
  status: 'found' | 'not_found' | 'not_published' | 'not_started' | 'expired';
  exam?: Exam;
  ownerId?: string;
  message?: string;
}

export async function fetchPublicExamFromFirestore(rawCode: string): Promise<CloudExamLookupResult> {
  const normalized = normalizeExamCode(rawCode);
  const compact = normalizeExamCodeCompact(rawCode);
  const candidateCodes = Array.from(new Set([normalized, compact].filter(Boolean)));

  for (const code of candidateCodes) {
    if (!/^[A-Z0-9-]+$/.test(code)) continue;
    try {
      const statusSnap = await getDoc(doc(db, 'examStatus', code));
      if (!statusSnap.exists()) continue;

      const statusData = statusSnap.data() as {
        examCode: string;
        examId: string;
        title: string;
        grade: Exam['grade'];
        durationMinutes: number;
        totalQuestions: number;
        totalScore: number;
        isPublished: boolean;
        openAt?: string;
        closeAt?: string;
        authorName: string;
        ownerId: string;
      };

      const placeholderExam: Exam = {
        id: statusData.examId,
        code: statusData.examCode,
        title: statusData.title,
        grade: statusData.grade,
        durationMinutes: statusData.durationMinutes,
        totalQuestions: statusData.totalQuestions,
        totalScore: statusData.totalScore,
        questions: [],
        rules: {
          part1ScorePerQuestion: 0.25,
          part2GradingModel: 'standard_moet',
          part3ScorePerQuestion: 0.25,
          totalTargetScore: 10.0,
        },
        shuffleQuestions: false,
        shuffleOptions: false,
        isPublished: statusData.isPublished,
        openAt: statusData.openAt,
        closeAt: statusData.closeAt,
        maxAttempts: 1,
        showScoreAfterSubmit: true,
        showAnswersAfterSubmit: false,
        showSolutionsAfterSubmit: false,
        allowReviewLater: false,
        authorId: '',
        authorName: statusData.authorName,
        createdAt: '',
        updatedAt: '',
      };

      if (!statusData.isPublished) {
        return {
          status: 'not_published',
          exam: placeholderExam,
          ownerId: statusData.ownerId,
          message: `Bài thi "${statusData.title}" (Mã: ${statusData.examCode}) hiện đang ở trạng thái Bản nháp hoặc đã được giáo viên đóng phòng thi.`,
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

      const publicSnap = await getDoc(doc(db, 'publicExams', code));
      if (!publicSnap.exists()) {
        return { status: 'not_found' };
      }

      const pubData = publicSnap.data() as Exam & { ownerId?: string };
      return {
        status: 'found',
        exam: sanitizeExamForStudent(pubData),
        ownerId: pubData.ownerId || statusData.ownerId,
      };
    } catch (error) {
      // Do not fail fatally if Firestore is unreachable or permission denied on malformed ID
      console.warn('Cloud exam lookup skipped for code', code, error);
    }
  }

  return { status: 'not_found' };
}

export async function fetchAllowedAnswerKeysAfterSubmit(
  examCode: string
): Promise<{ answerMap: Record<string, AnswerKeyEntry>; showSolutionsAfterSubmit: boolean } | null> {
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
  if (!ownerId) return false;
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
