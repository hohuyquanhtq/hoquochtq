import {
  collection,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  query,
  where,
  setDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  serverTimestamp,
} from 'firebase/firestore';
import {
  db,
  auth,
  firebaseInitError,
  stripUndefinedDeep,
  syncExamToFirestore,
  sanitizeExamForStudent,
  handleFirestoreError,
  OperationType,
} from './firebase';
import { normalizeQuestionGrade } from '../constants/subjects';
import {
  User,
  UserRole,
  AccountStatus,
  TeacherApprovalStatus,
  PilotGroup,
  Question,
  QuestionCityStatus,
  Folder,
  SubjectItem,
  Exam,
  StudentSubmission,
  Classroom,
  ClassJoinLookup,
  ClassEnrollment,
  HubLearningProfile,
  UploadRecord,
} from '../types';
import {
  fetchHubClassesByOwner,
  fetchHubLearningProfilesByClassCodes,
  fetchStudentHubProfilesByUid,
  mapHubProfileToEnrollment,
  sortHubProfilesByStt,
  syncClassroomToHub,
  deleteClassroomFromHub,
  deleteHubStudentProfile,
} from './hubService';
import { generateExamCode6, normalizeExamCode } from '../utils/urlHelper';
import { normalizeFolderId, normalizeParentId } from '../utils/folderTree';

export interface TeacherWorkspaceData {
  questions: Question[];
  folders: Folder[];
  subjects: SubjectItem[];
  exams: Exam[];
  submissions: StudentSubmission[];
  classes: Classroom[];
  enrollments: ClassEnrollment[];
  uploadRecords: UploadRecord[];
}

export interface StudentWorkspaceData {
  enrollments: ClassEnrollment[];
  classLookups: ClassJoinLookup[];
  assignedExams: { exam: Exam; classCode: string; className: string; ownerId: string }[];
  submissions: StudentSubmission[];
  hubProfiles: HubLearningProfile[];
}

function safeDocId(raw: string): string {
  return (raw || `doc_${Date.now()}`).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128);
}

// ============================================================================
// TEACHER ISOLATED WORKSPACE OPERATIONS (ownerId == uid)
// ============================================================================

export async function fetchTeacherWorkspaceFromFirestore(
  uid: string,
  teacherEmail?: string
): Promise<TeacherWorkspaceData> {
  if (firebaseInitError || !uid) {
    return {
      questions: [],
      folders: [],
      subjects: [],
      exams: [],
      submissions: [],
      classes: [],
      enrollments: [],
      uploadRecords: [],
    };
  }

  const [qSnap, fSnap, eSnap, sSnap, cSnap, enSnap, uSnap, subSnap, hubClasses] = await Promise.all([
    getDocs(query(collection(db, 'questions'), where('ownerId', '==', uid))),
    getDocs(query(collection(db, 'folders'), where('ownerId', '==', uid))),
    getDocs(query(collection(db, 'exams'), where('ownerId', '==', uid))),
    getDocs(query(collection(db, 'submissions'), where('ownerId', '==', uid))),
    getDocs(query(collection(db, 'classes'), where('ownerId', '==', uid))),
    getDocs(query(collection(db, 'classEnrollments'), where('teacherId', '==', uid))),
    getDocs(query(collection(db, 'uploadRecords'), where('ownerId', '==', uid))),
    getDocs(query(collection(db, 'subjects'), where('ownerId', '==', uid))).catch(() => null),
    fetchHubClassesByOwner(uid, teacherEmail).catch(() => [] as Classroom[]),
  ]);

  const submissions = sSnap.docs
    .map((d) => d.data() as StudentSubmission)
    .sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());

  const exams = eSnap.docs
    .map((d) => {
      const raw = d.data() as Exam;
      return {
        ...raw,
        id: d.id,
        examId: raw.examId || d.id,
        folderId: normalizeFolderId(raw.folderId),
        ownerId: raw.ownerId || uid,
        createdBy: raw.createdBy || raw.authorId || raw.ownerId || uid,
      } satisfies Exam;
    })
    .sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime());

  const folders = fSnap.docs
    .map((d) => {
      const raw = d.data() as Folder;
      return {
        ...raw,
        id: d.id,
        folderId: raw.folderId || d.id,
        parentId: normalizeParentId(raw.parentId),
        ownerId: raw.ownerId || uid,
        createdBy: raw.createdBy || raw.authorId || raw.ownerId || uid,
      } satisfies Folder;
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'vi'));

  const questions = qSnap.docs
    .map((d) => {
      const raw = d.data() as Question;
      const normalizedGrade = normalizeQuestionGrade(raw.grade);
      return normalizedGrade && normalizedGrade !== raw.grade
        ? ({ ...raw, grade: normalizedGrade } satisfies Question)
        : raw;
    })
    .sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime());

  const localClasses = cSnap.docs.map((d) => ({
    ...(d.data() as Classroom),
    source: 'local' as const,
  }));

  // Merge hub_classes (dbHub -> long-factor-lk4jk) with local HQTest classes by classCode
  const mergedClassMap = new Map<string, Classroom>();
  localClasses.forEach((cls) => {
    const codeKey = normalizeExamCode(cls.classCode) || cls.id;
    mergedClassMap.set(codeKey, cls);
  });
  hubClasses.forEach((hubCls) => {
    const codeKey = normalizeExamCode(hubCls.classCode) || hubCls.id;
    const existingLocal = mergedClassMap.get(codeKey);
    const mergedExamCodes = Array.from(
      new Set([
        ...(hubCls.assignedExamCodes || []),
        ...(existingLocal?.assignedExamCodes || []),
      ])
    );
    mergedClassMap.set(codeKey, {
      ...existingLocal,
      ...hubCls,
      assignedExamCodes: mergedExamCodes,
      source: 'hub',
    });
  });

  const classes = Array.from(mergedClassMap.values()).sort(
    (a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime()
  );

  // Read shared students from dbHub -> hub_learning_profiles (sorted ascending by stt)
  const classCodeToMeta = new Map<string, Classroom>();
  classes.forEach((cls) => {
    const normCode = normalizeExamCode(cls.classCode);
    if (normCode) classCodeToMeta.set(normCode, cls);
  });

  const hubProfiles = await fetchHubLearningProfilesByClassCodes(
    Array.from(classCodeToMeta.keys()),
    uid
  ).catch(() => [] as HubLearningProfile[]);

  const hubEnrollments: ClassEnrollment[] = hubProfiles.map((profile) =>
    mapHubProfileToEnrollment(profile, classCodeToMeta.get(normalizeExamCode(profile.classCode)))
  );

  const localEnrollments: ClassEnrollment[] = enSnap.docs.map((d) => ({
    ...(d.data() as ClassEnrollment),
    source: 'local' as const,
  }));

  // Deduplicate enrollments (prefer hub_learning_profiles when studentUid or email matches in same class)
  const mergedEnrollmentMap = new Map<string, ClassEnrollment>();
  hubEnrollments.forEach((en) => {
    const normCode = normalizeExamCode(en.classCode);
    const dedupeKey = en.hubProfileDocId || `${normCode}_${en.stt || en.studentId}`;
    mergedEnrollmentMap.set(dedupeKey, en);
  });
  localEnrollments.forEach((en) => {
    const normCode = normalizeExamCode(en.classCode);
    const alreadyInHub = hubEnrollments.some(
      (h) =>
        normalizeExamCode(h.classCode) === normCode &&
        ((h.studentUid && en.studentId && h.studentUid === en.studentId) ||
          (h.studentEmail &&
            en.studentEmail &&
            h.studentEmail.toLowerCase() === en.studentEmail.toLowerCase()))
    );
    if (!alreadyInHub) {
      mergedEnrollmentMap.set(en.id, en);
    }
  });

  const enrollments = sortHubProfilesByStt(Array.from(mergedEnrollmentMap.values()));

  const subjects = subSnap
    ? subSnap.docs.map((d) => d.data() as SubjectItem)
    : [];

  return {
    questions,
    folders,
    subjects,
    exams,
    submissions,
    classes,
    enrollments,
    uploadRecords: uSnap.docs
      .map((d) => d.data() as UploadRecord)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
  };
}

export async function fetchFoldersByParentFromFirestore(
  uid: string,
  parentId: string | null
): Promise<Folder[]> {
  if (firebaseInitError || !uid) return [];
  const targetParent = normalizeParentId(parentId);
  const fSnap = await getDocs(query(collection(db, 'folders'), where('ownerId', '==', uid)));
  return fSnap.docs
    .map((d) => {
      const raw = d.data() as Folder;
      return {
        ...raw,
        id: d.id,
        folderId: raw.folderId || d.id,
        parentId: normalizeParentId(raw.parentId),
        ownerId: raw.ownerId || uid,
        createdBy: raw.createdBy || raw.authorId || raw.ownerId || uid,
      } satisfies Folder;
    })
    .filter((f) => f.parentId === targetParent)
    .sort((a, b) => a.name.localeCompare(b.name, 'vi'));
}

export async function fetchExamsByFolderFromFirestore(
  uid: string,
  folderId: string | null
): Promise<Exam[]> {
  if (firebaseInitError || !uid) return [];
  const targetFolder = normalizeFolderId(folderId);
  const eSnap = await getDocs(query(collection(db, 'exams'), where('ownerId', '==', uid)));
  return eSnap.docs
    .map((d) => {
      const raw = d.data() as Exam;
      return {
        ...raw,
        id: d.id,
        examId: raw.examId || d.id,
        folderId: normalizeFolderId(raw.folderId),
        ownerId: raw.ownerId || uid,
        createdBy: raw.createdBy || raw.authorId || raw.ownerId || uid,
      } satisfies Exam;
    })
    .filter((ex) => ex.folderId === targetFolder)
    .sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime());
}

export function buildQuestionDocPayload(q: Question, ownerId: string, existingCreatedAt?: unknown) {
  const safeId = safeDocId(q.id);
  const nowIso = new Date().toISOString();
  const normalizedGrade = normalizeQuestionGrade(q.grade);
  if (!normalizedGrade) {
    throw new Error(
      `Câu hỏi "${q.code || safeId}" chưa có khối lớp hợp lệ (10, 11, 12 hoặc chuyen_hsg). Không thể lưu lên Firestore.`
    );
  }
  return stripUndefinedDeep({
    id: safeId,
    ownerId,
    code: (q.code || `Q_${safeId.slice(-6)}`).slice(0, 64),
    content: (q.content || '').slice(0, 20000),
    type: q.type || 'part1_single_choice',
    ...(q.subjectId ? { subjectId: q.subjectId.slice(0, 64) } : {}),
    ...(q.subjectName ? { subjectName: q.subjectName.slice(0, 120) } : {}),
    grade: normalizedGrade,
    topic: (q.topic || 'hoa_dai_cuong').slice(0, 64),
    ...(q.chapterId && q.chapterId.trim() ? { chapterId: safeDocId(q.chapterId.trim()) } : {}),
    ...(q.chapterName && q.chapterName.trim() ? { chapterName: q.chapterName.trim().slice(0, 250) } : {}),
    ...(q.lessonId && q.lessonId.trim() ? { lessonId: safeDocId(q.lessonId.trim()) } : {}),
    ...(q.lessonName && q.lessonName.trim() ? { lessonName: q.lessonName.trim().slice(0, 250) } : {}),
    ...(q.lessonTopic && q.lessonTopic.trim() ? { lessonTopic: q.lessonTopic.trim().slice(0, 200) } : {}),
    level: q.level || 'nhan_biet',
    ...(q.folderId ? { folderId: q.folderId.slice(0, 128) } : {}),
    ...(q.options ? { options: q.options.slice(0, 8) } : {}),
    ...(q.correctOptionId ? { correctOptionId: q.correctOptionId.slice(0, 8) } : {}),
    ...(q.correctOptionIds && q.correctOptionIds.length > 0
      ? { correctOptionIds: q.correctOptionIds.slice(0, 8) }
      : {}),
    ...(q.statements ? { statements: q.statements.slice(0, 8) } : {}),
    ...(q.shortAnswerConfig ? { shortAnswerConfig: q.shortAnswerConfig } : {}),
    ...(q.imageUrl && q.imageUrl.trim() ? { imageUrl: q.imageUrl.trim().slice(0, 1000) } : {}),
    ...(q.explanation ? { explanation: q.explanation.slice(0, 20000) } : {}),
    ...(q.source ? { source: q.source.slice(0, 300) } : {}),
    authorId: q.authorId || ownerId,
    ...(q.authorName && q.authorName.trim() ? { authorName: q.authorName.trim().slice(0, 150) } : {}),
    ...(q.authorSchool && q.authorSchool.trim() ? { authorSchool: q.authorSchool.trim().slice(0, 200) } : {}),
    ...(q.parseStatus ? { parseStatus: q.parseStatus } : {}),
    ...(q.parseWarning ? { parseWarning: q.parseWarning.slice(0, 500) } : {}),
    ...(q.teacherVerified !== undefined ? { teacherVerified: !!q.teacherVerified } : {}),
    ...(q.isSharedCity !== undefined ? { isSharedCity: !!q.isSharedCity } : {}),
    ...(q.isPublicCity !== undefined ? { isPublicCity: !!q.isPublicCity } : {}),
    ...(q.cityStatus ? { cityStatus: q.cityStatus } : {}),
    ...(q.section ? { section: q.section.slice(0, 64) } : {}),
    ...(q.sectionTitle ? { sectionTitle: q.sectionTitle.slice(0, 300) } : {}),
    createdAt: q.createdAt || nowIso,
    updatedAt: nowIso,
    serverCreatedAt: existingCreatedAt || serverTimestamp(),
    serverUpdatedAt: serverTimestamp(),
  });
}

export async function saveQuestionToFirestore(q: Question, explicitOwnerId?: string): Promise<void> {
  if (firebaseInitError || !auth.currentUser) return;
  const ownerId = explicitOwnerId || auth.currentUser.uid;
  const safeId = safeDocId(q.id);
  const ref = doc(db, 'questions', safeId);
  try {
    const existing = await getDoc(ref).catch(() => null);
    const payload = buildQuestionDocPayload(q, ownerId, existing?.exists() ? existing.data()?.serverCreatedAt : undefined);
    await setDoc(ref, payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `questions/${safeId}`);
  }
}

export async function saveQuestionsBatchToFirestore(
  questions: Question[],
  explicitOwnerId?: string
): Promise<void> {
  if (firebaseInitError || !auth.currentUser || questions.length === 0) return;
  const ownerId = explicitOwnerId || auth.currentUser.uid;

  try {
    // Chunk into batches of 400 to respect Firestore 500-op batch limit
    for (let i = 0; i < questions.length; i += 400) {
      const chunk = questions.slice(i, i + 400);
      const batch = writeBatch(db);
      chunk.forEach((q) => {
        const safeId = safeDocId(q.id);
        const ref = doc(db, 'questions', safeId);
        batch.set(ref, buildQuestionDocPayload(q, ownerId));
      });
      await batch.commit();
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'questions');
  }
}

export async function updateQuestionCityShareInFirestore(
  q: Question,
  isSharedCity: boolean,
  explicitOwnerId?: string,
  authorMeta?: { authorName?: string; authorSchool?: string }
): Promise<void> {
  if (firebaseInitError || !auth.currentUser) return;
  const ownerId = explicitOwnerId || auth.currentUser.uid;
  const safeId = safeDocId(q.id);
  const ref = doc(db, 'questions', safeId);
  const nowIso = new Date().toISOString();
  const cleanAuthorName = (authorMeta?.authorName || q.authorName || '').trim().slice(0, 150);
  const cleanAuthorSchool = (authorMeta?.authorSchool || q.authorSchool || '').trim().slice(0, 200);
  const sharePatch = stripUndefinedDeep({
    isSharedCity: !!isSharedCity,
    cityStatus: 'pending' as QuestionCityStatus,
    ...(isSharedCity && cleanAuthorName ? { authorName: cleanAuthorName } : {}),
    ...(isSharedCity && cleanAuthorSchool ? { authorSchool: cleanAuthorSchool } : {}),
    updatedAt: nowIso,
    serverUpdatedAt: serverTimestamp(),
  });

  try {
    // Immediately attempt updateDoc on the Firestore question document
    await updateDoc(ref, sharePatch);
  } catch (updateErr) {
    // Fallback if doc does not exist yet or is a legacy doc missing serverCreatedAt
    try {
      const existing = await getDoc(ref).catch(() => null);
      if (existing?.exists() && !existing.data()?.serverCreatedAt) {
        await updateDoc(ref, {
          ...sharePatch,
          serverCreatedAt: serverTimestamp(),
        });
        return;
      }
      const payload = buildQuestionDocPayload(
        {
          ...q,
          isSharedCity: !!isSharedCity,
          cityStatus: 'pending',
          ...(cleanAuthorName ? { authorName: cleanAuthorName } : {}),
          ...(cleanAuthorSchool ? { authorSchool: cleanAuthorSchool } : {}),
          updatedAt: nowIso,
        },
        ownerId,
        existing?.exists() ? existing.data()?.serverCreatedAt : undefined
      );
      await setDoc(ref, payload);
    } catch (fallbackErr) {
      handleFirestoreError(fallbackErr || updateErr, OperationType.WRITE, `questions/${safeId}`);
    }
  }
}

export async function bulkShareQuestionsToCityInFirestore(
  questions: Question[],
  explicitOwnerId?: string
): Promise<void> {
  if (firebaseInitError || !auth.currentUser || questions.length === 0) return;
  const ownerId = explicitOwnerId || auth.currentUser.uid;
  const nowIso = new Date().toISOString();

  try {
    for (let i = 0; i < questions.length; i += 400) {
      const chunk = questions.slice(i, i + 400);
      try {
        const batch = writeBatch(db);
        chunk.forEach((q) => {
          const ref = doc(db, 'questions', safeDocId(q.id));
          batch.update(ref, {
            isSharedCity: true,
            cityStatus: 'pending',
            updatedAt: nowIso,
            serverUpdatedAt: serverTimestamp(),
          });
        });
        await batch.commit();
      } catch {
        // Fallback for local-only or legacy docs missing serverCreatedAt
        for (const q of chunk) {
          await updateQuestionCityShareInFirestore(q, true, ownerId);
        }
      }
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'questions');
  }
}

export async function deleteQuestionFromFirestore(questionId: string): Promise<void> {
  if (firebaseInitError || !auth.currentUser) return;
  const safeId = safeDocId(questionId);
  try {
    await deleteDoc(doc(db, 'questions', safeId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `questions/${safeId}`);
  }
}

export async function deleteQuestionsBatchFromFirestore(questionIds: string[]): Promise<void> {
  if (firebaseInitError || !auth.currentUser || questionIds.length === 0) return;
  try {
    for (let i = 0; i < questionIds.length; i += 400) {
      const chunk = questionIds.slice(i, i + 400);
      const batch = writeBatch(db);
      chunk.forEach((id) => {
        batch.delete(doc(db, 'questions', safeDocId(id)));
      });
      await batch.commit();
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, 'questions');
  }
}

export async function saveSubjectToFirestore(
  subject: SubjectItem,
  explicitOwnerId?: string
): Promise<void> {
  if (firebaseInitError || !auth.currentUser) return;
  const ownerId = explicitOwnerId || auth.currentUser.uid;
  const safeId = safeDocId(subject.id).slice(0, 64);
  const ref = doc(db, 'subjects', safeId);
  const nowIso = new Date().toISOString();
  try {
    const existing = await getDoc(ref).catch(() => null);
    const payload = stripUndefinedDeep({
      id: safeId,
      ownerId,
      authorId: subject.authorId || ownerId,
      name: (subject.name || 'Môn học mới').trim().slice(0, 120),
      ...(subject.shortName ? { shortName: subject.shortName.trim().slice(0, 40) } : {}),
      ...(subject.codePrefix ? { codePrefix: subject.codePrefix.trim().slice(0, 16) } : {}),
      isDefault: !!subject.isDefault,
      order: typeof subject.order === 'number' ? subject.order : 100,
      createdAt: subject.createdAt || nowIso,
      updatedAt: nowIso,
      serverCreatedAt: existing?.exists() ? existing.data()?.serverCreatedAt : serverTimestamp(),
      serverUpdatedAt: serverTimestamp(),
    });
    await setDoc(ref, payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `subjects/${safeId}`);
  }
}

export async function deleteSubjectFromFirestore(subjectId: string): Promise<void> {
  if (firebaseInitError || !auth.currentUser) return;
  const safeId = safeDocId(subjectId).slice(0, 64);
  try {
    await deleteDoc(doc(db, 'subjects', safeId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `subjects/${safeId}`);
  }
}

function buildFolderDocPayload(
  f: Folder,
  ownerId: string,
  existingCreatedAt?: unknown,
  actorUid?: string
) {
  const safeId = safeDocId(f.id);
  const nowIso = new Date().toISOString();
  const normalizedParent = normalizeParentId(f.parentId);
  return stripUndefinedDeep({
    id: safeId,
    folderId: safeId,
    ownerId,
    name: (f.name || 'Thư mục mới').trim().slice(0, 150),
    parentId: normalizedParent ? safeDocId(normalizedParent) : null,
    ...(f.description && f.description.trim() ? { description: f.description.trim().slice(0, 500) } : {}),
    ...(f.grade ? { grade: f.grade } : {}),
    ...(f.color ? { color: f.color.slice(0, 32) } : {}),
    authorId: f.authorId || ownerId,
    createdBy: f.createdBy || f.authorId || ownerId,
    updatedBy: actorUid || f.updatedBy || ownerId,
    ...(typeof f.itemCount === 'number' ? { itemCount: Math.max(0, f.itemCount) } : {}),
    createdAt: f.createdAt || nowIso,
    updatedAt: f.updatedAt || nowIso,
    serverCreatedAt: existingCreatedAt || serverTimestamp(),
    serverUpdatedAt: serverTimestamp(),
  });
}

export async function saveFolderToFirestore(folder: Folder, explicitOwnerId?: string): Promise<void> {
  if (firebaseInitError || !auth.currentUser) {
    throw new Error('Bạn cần đăng nhập để lưu thư mục.');
  }
  const ownerId = explicitOwnerId || folder.ownerId || auth.currentUser.uid;
  const actorUid = auth.currentUser.uid;
  const safeId = safeDocId(folder.id);
  const ref = doc(db, 'folders', safeId);
  try {
    const existing = await getDocFromServer(ref).catch(() => getDoc(ref).catch(() => null));
    const existingData = existing?.exists() ? existing.data() : null;
    const normalizedParent = normalizeParentId(folder.parentId);
    const nowIso = new Date().toISOString();

    if (existingData) {
      const updatePayload = stripUndefinedDeep({
        folderId: safeId,
        ownerId: existingData.ownerId === ownerId ? existingData.ownerId : ownerId,
        authorId: folder.authorId || existingData.authorId || ownerId,
        createdBy: existingData.createdBy || folder.createdBy || existingData.authorId || ownerId,
        updatedBy: actorUid,
        name: (folder.name || 'Thư mục mới').trim().slice(0, 150),
        parentId: normalizedParent ? safeDocId(normalizedParent) : null,
        description: folder.description && folder.description.trim() ? folder.description.trim().slice(0, 500) : '',
        ...(folder.grade ? { grade: folder.grade } : {}),
        ...(folder.color ? { color: folder.color.slice(0, 32) } : {}),
        ...(typeof folder.itemCount === 'number' ? { itemCount: Math.max(0, folder.itemCount) } : {}),
        updatedAt: folder.updatedAt || nowIso,
        ...(!existingData.serverCreatedAt ? { serverCreatedAt: serverTimestamp() } : {}),
        serverUpdatedAt: serverTimestamp(),
      });
      await updateDoc(ref, updatePayload);
      return;
    }

    await setDoc(ref, buildFolderDocPayload(folder, ownerId, undefined, actorUid));
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `folders/${safeId}`);
  }
}

export async function createFolderInFirestore(
  input: {
    id?: string;
    name: string;
    parentId?: string | null;
    description?: string;
    grade?: Folder['grade'];
    color?: string;
  },
  explicitOwnerId?: string
): Promise<Folder> {
  if (firebaseInitError || !auth.currentUser) {
    throw new Error('Bạn cần đăng nhập để tạo thư mục.');
  }
  const ownerId = explicitOwnerId || auth.currentUser.uid;
  const actorUid = auth.currentUser.uid;
  const nowIso = new Date().toISOString();
  const safeId = safeDocId(input.id || `f_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`);
  const normalizedParent = normalizeParentId(input.parentId);
  const folder: Folder = {
    id: safeId,
    folderId: safeId,
    name: input.name.trim().slice(0, 150),
    parentId: normalizedParent ? safeDocId(normalizedParent) : null,
    ...(input.description && input.description.trim()
      ? { description: input.description.trim().slice(0, 500) }
      : {}),
    ...(input.grade ? { grade: input.grade } : {}),
    ...(input.color ? { color: input.color.slice(0, 32) } : {}),
    ownerId,
    authorId: ownerId,
    createdBy: actorUid,
    updatedBy: actorUid,
    createdAt: nowIso,
    updatedAt: nowIso,
    itemCount: 0,
  };

  const ref = doc(db, 'folders', safeId);
  try {
    await setDoc(ref, buildFolderDocPayload(folder, ownerId, undefined, actorUid));
    return folder;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `folders/${safeId}`);
  }
}

export async function updateFolderInFirestore(
  folder: Folder,
  explicitOwnerId?: string
): Promise<Folder> {
  const nowIso = new Date().toISOString();
  const updated: Folder = {
    ...folder,
    id: safeDocId(folder.id),
    folderId: safeDocId(folder.id),
    parentId: normalizeParentId(folder.parentId),
    ownerId: explicitOwnerId || folder.ownerId || auth.currentUser?.uid,
    updatedBy: auth.currentUser?.uid || folder.updatedBy,
    updatedAt: nowIso,
  };
  await saveFolderToFirestore(updated, explicitOwnerId);
  return updated;
}

export async function deleteFolderFromFirestore(folderId: string): Promise<void> {
  if (firebaseInitError || !auth.currentUser) {
    throw new Error('Bạn cần đăng nhập để xóa thư mục.');
  }
  const safeId = safeDocId(folderId);
  try {
    await deleteDoc(doc(db, 'folders', safeId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `folders/${safeId}`);
  }
}

export async function deleteFolderAndReparentInFirestore(
  targetFolder: Folder,
  allFolders: Folder[],
  allExams: Exam[],
  explicitOwnerId?: string
): Promise<{ folders: Folder[]; exams: Exam[] }> {
  if (firebaseInitError || !auth.currentUser) {
    throw new Error('Bạn cần đăng nhập để xóa thư mục.');
  }
  const targetId = safeDocId(targetFolder.id);
  const parentOfDeleted = normalizeParentId(targetFolder.parentId);
  const nowIso = new Date().toISOString();
  const ownerId = explicitOwnerId || targetFolder.ownerId || auth.currentUser.uid;
  const actorUid = auth.currentUser.uid;

  const directChildFolders = allFolders.filter(
    (f) => f.id !== targetId && normalizeParentId(f.parentId) === targetId
  );
  const updatedChildren: Folder[] = [];
  for (const child of directChildFolders) {
    const reparented: Folder = {
      ...child,
      parentId: parentOfDeleted,
      updatedBy: actorUid,
      updatedAt: nowIso,
    };
    await saveFolderToFirestore(reparented, ownerId);
    updatedChildren.push(reparented);
  }

  const directExams = allExams.filter((ex) => normalizeFolderId(ex.folderId) === targetId);
  const updatedExamsMap = new Map<string, Exam>();
  for (const ex of directExams) {
    const movedExam: Exam = {
      ...ex,
      folderId: parentOfDeleted,
      updatedBy: actorUid,
      updatedAt: nowIso,
    };
    await syncExamToFirestore(movedExam, ownerId);
    updatedExamsMap.set(movedExam.id, movedExam);
  }

  await deleteFolderFromFirestore(targetId);

  const childMap = new Map(updatedChildren.map((f) => [f.id, f]));
  const nextFolders = allFolders
    .filter((f) => f.id !== targetId)
    .map((f) => childMap.get(f.id) || f);
  const nextExams = allExams.map((ex) => updatedExamsMap.get(ex.id) || ex);
  return { folders: nextFolders, exams: nextExams };
}

export async function moveExamToFolderInFirestore(
  exam: Exam,
  targetFolderId: string | null,
  explicitOwnerId?: string,
  updates?: { title?: string; description?: string }
): Promise<Exam> {
  if (firebaseInitError || !auth.currentUser) {
    throw new Error('Bạn cần đăng nhập để di chuyển đề thi.');
  }
  const nowIso = new Date().toISOString();
  const ownerId = explicitOwnerId || exam.ownerId || auth.currentUser.uid;
  const cleanFolderId = normalizeFolderId(targetFolderId);
  const nextExam: Exam = {
    ...exam,
    examId: exam.examId || exam.id,
    ...(updates?.title !== undefined ? { title: updates.title.trim() } : {}),
    ...(updates?.description !== undefined
      ? { description: updates.description.trim() || undefined }
      : {}),
    folderId: cleanFolderId,
    ownerId,
    updatedBy: auth.currentUser.uid,
    updatedAt: nowIso,
  };
  await syncExamToFirestore(nextExam, ownerId);
  return nextExam;
}

export async function saveUploadRecordToFirestore(
  record: UploadRecord,
  explicitOwnerId?: string
): Promise<void> {
  if (firebaseInitError || !auth.currentUser) return;
  const ownerId = explicitOwnerId || auth.currentUser.uid;
  const safeId = safeDocId(record.id);
  const payload = stripUndefinedDeep({
    id: safeId,
    ownerId,
    fileName: (record.fileName || 'exam.docx').slice(0, 255),
    fileType: record.fileType || 'docx',
    examTitle: (record.examTitle || 'Đề thi mới').slice(0, 300),
    totalQuestions: Math.max(0, Math.min(200, record.totalQuestions || 0)),
    grade: record.grade || '12',
    createdAt: record.createdAt || new Date().toISOString(),
    serverCreatedAt: serverTimestamp(),
  });
  await setDoc(doc(db, 'uploadRecords', safeId), payload);
}

// ============================================================================
// TEACHER CLASSROOM MANAGEMENT
// ============================================================================

export async function saveClassroomToFirestore(
  cls: Classroom,
  explicitOwnerId?: string
): Promise<void> {
  if (firebaseInitError || !auth.currentUser) {
    throw new Error('Bạn cần đăng nhập để lưu lớp học.');
  }
  const ownerId = explicitOwnerId || auth.currentUser.uid;
  const safeId = safeDocId(cls.id);
  const normalizedCode = normalizeExamCode(cls.classCode);
  if (!normalizedCode || !/^[A-Z0-9-]+$/.test(normalizedCode)) {
    throw new Error('Mã lớp chỉ được chứa chữ in hoa, số và dấu gạch ngang (2-32 ký tự).');
  }

  const nowIso = new Date().toISOString();
  const classRef = doc(db, 'classes', safeId);
  const existingClass = await getDoc(classRef).catch(() => null);
  const existingCreatedAt = existingClass?.exists() ? existingClass.data()?.serverCreatedAt : null;

  const classPayload = stripUndefinedDeep({
    id: safeId,
    ownerId,
    teacherName: (cls.teacherName || 'Giáo viên').slice(0, 150),
    ...(cls.school ? { school: cls.school.slice(0, 200) } : {}),
    className: cls.className.trim().slice(0, 120),
    classCode: normalizedCode,
    ...(cls.description ? { description: cls.description.slice(0, 500) } : {}),
    assignedExamCodes: Array.from(new Set((cls.assignedExamCodes || []).map((c) => normalizeExamCode(c)).filter(Boolean))).slice(0, 100),
    isActive: cls.isActive !== false,
    createdAt: cls.createdAt || nowIso,
    updatedAt: nowIso,
    serverCreatedAt: existingCreatedAt || serverTimestamp(),
    serverUpdatedAt: serverTimestamp(),
  });

  const joinLookupPayload = stripUndefinedDeep({
    classCode: normalizedCode,
    classId: safeId,
    className: classPayload.className,
    teacherId: ownerId,
    teacherName: classPayload.teacherName,
    ...(classPayload.school ? { school: classPayload.school } : {}),
    assignedExamCodes: classPayload.assignedExamCodes,
    isActive: classPayload.isActive,
    updatedAt: nowIso,
    serverUpdatedAt: serverTimestamp(),
  });

  const batch = writeBatch(db);
  batch.set(classRef, classPayload);
  batch.set(doc(db, 'classJoinCodes', normalizedCode), joinLookupPayload);
  await batch.commit();

  // Mirror classroom to shared dbHub (hub_classes) in best-effort mode
  await syncClassroomToHub(
    {
      ...cls,
      id: safeId,
      ownerId,
      classCode: normalizedCode,
      assignedExamCodes: classPayload.assignedExamCodes,
      isActive: classPayload.isActive,
      updatedAt: nowIso,
    },
    ownerId,
    auth.currentUser?.email || undefined
  ).catch(() => false);
}

export async function deleteClassroomFromFirestore(cls: Classroom): Promise<void> {
  if (firebaseInitError || !auth.currentUser) return;
  const batch = writeBatch(db);
  batch.delete(doc(db, 'classes', safeDocId(cls.id)));
  const normalizedCode = normalizeExamCode(cls.classCode);
  if (normalizedCode) {
    batch.delete(doc(db, 'classJoinCodes', normalizedCode));
  }
  await batch.commit();
  await deleteClassroomFromHub(cls).catch(() => false);
}

export async function removeStudentEnrollmentFromFirestore(
  enrollmentId: string,
  hubProfileDocId?: string
): Promise<void> {
  if (firebaseInitError || !auth.currentUser) return;
  await deleteDoc(doc(db, 'classEnrollments', safeDocId(enrollmentId))).catch(() => {});
  if (hubProfileDocId) {
    await deleteHubStudentProfile(hubProfileDocId).catch(() => false);
  }
}

// ============================================================================
// STUDENT WORKSPACE (ENROLLED CLASSES, ASSIGNED EXAMS, SYNCED SUBMISSIONS)
// ============================================================================

export async function fetchStudentWorkspaceFromFirestore(
  uid: string,
  studentEmail?: string
): Promise<StudentWorkspaceData> {
  if (firebaseInitError || !uid) {
    return {
      enrollments: [],
      classLookups: [],
      assignedExams: [],
      submissions: [],
      hubProfiles: [],
    };
  }

  const [enSnap, subSnap, hubProfiles] = await Promise.all([
    getDocs(query(collection(db, 'classEnrollments'), where('studentId', '==', uid))),
    getDocs(query(collection(db, 'submissions'), where('studentId', '==', uid))),
    fetchStudentHubProfilesByUid(uid, studentEmail).catch(() => [] as HubLearningProfile[]),
  ]);

  const localEnrollments = enSnap.docs.map((d) => ({
    ...(d.data() as ClassEnrollment),
    source: 'local' as const,
  }));
  const hubEnrollments = hubProfiles.map((profile) => mapHubProfileToEnrollment(profile));

  const enrollmentByClassCode = new Map<string, ClassEnrollment>();
  localEnrollments.forEach((en) => {
    enrollmentByClassCode.set(normalizeExamCode(en.classCode) || en.id, en);
  });
  hubEnrollments.forEach((en) => {
    const key = normalizeExamCode(en.classCode) || en.id;
    const existing = enrollmentByClassCode.get(key);
    enrollmentByClassCode.set(key, {
      ...existing,
      ...en,
      classId: existing?.classId || en.classId,
      className: en.className || existing?.className || en.classCode,
      teacherName: existing?.teacherName || en.teacherName,
    });
  });

  const enrollments = sortHubProfilesByStt(Array.from(enrollmentByClassCode.values()));
  const submissions = subSnap.docs
    .map((d) => d.data() as StudentSubmission)
    .sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());

  const classLookups: ClassJoinLookup[] = [];
  const examToClassMap = new Map<string, { classCode: string; className: string; ownerId: string }>();

  await Promise.all(
    enrollments.map(async (en) => {
      try {
        const lookupSnap = await getDoc(doc(db, 'classJoinCodes', en.classCode));
        if (lookupSnap.exists()) {
          const data = lookupSnap.data() as ClassJoinLookup;
          classLookups.push(data);
          (data.assignedExamCodes || []).forEach((examCode) => {
            const norm = normalizeExamCode(examCode);
            if (norm && !examToClassMap.has(norm)) {
              examToClassMap.set(norm, {
                classCode: data.classCode,
                className: data.className,
                ownerId: data.teacherId,
              });
            }
          });
        }
      } catch {
        // ignore missing class lookup
      }
    })
  );

  const assignedExams: StudentWorkspaceData['assignedExams'] = [];
  await Promise.all(
    Array.from(examToClassMap.entries()).map(async ([examCode, meta]) => {
      try {
        const statusSnap = await getDoc(doc(db, 'examStatus', examCode));
        if (!statusSnap.exists()) return;
        const st = statusSnap.data() as {
          examCode?: string;
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
        if (!st.isPublished) return;

        if (st.requiresPassword) {
          const placeholderExam: Exam = {
            id: st.examId || examCode,
            code: normalizeExamCode(st.examCode || examCode),
            title: st.title || `Bài thi ${examCode}`,
            grade: st.grade || '12',
            durationMinutes: st.durationMinutes || 45,
            totalQuestions: st.totalQuestions || 0,
            totalScore: st.totalScore || 10.0,
            questions: [],
            rules: {
              part1ScorePerQuestion: 0.25,
              part2GradingModel: 'standard_moet',
              part3ScorePerQuestion: 0.25,
              totalTargetScore: 10.0,
            },
            shuffleQuestions: false,
            shuffleOptions: false,
            isPublished: true,
            openAt: st.openAt,
            closeAt: st.closeAt,
            maxAttempts: st.maxAttempts ?? 1,
            showScoreAfterSubmit:
              typeof st.showScoreAfterSubmit === 'boolean' ? st.showScoreAfterSubmit : true,
            showAnswersAfterSubmit:
              typeof st.allowAnswerReview === 'boolean' ? st.allowAnswerReview : false,
            showSolutionsAfterSubmit: !!st.showSolutionsAfterSubmit,
            allowReviewLater: false,
            requiresPassword: true,
            ...(typeof st.allowAnswerReview === 'boolean'
              ? { allowAnswerReview: st.allowAnswerReview }
              : {}),
            ...(typeof st.answerReviewMinScore === 'number'
              ? { answerReviewMinScore: st.answerReviewMinScore }
              : {}),
            ...(st.answerReviewEnabledAt !== undefined
              ? { answerReviewEnabledAt: st.answerReviewEnabledAt }
              : {}),
            authorId: '',
            authorName: st.authorName || 'Giáo viên',
            createdAt: '',
            updatedAt: '',
          };
          assignedExams.push({
            exam: placeholderExam,
            classCode: meta.classCode,
            className: meta.className,
            ownerId: st.ownerId || meta.ownerId,
          });
          return;
        }

        const pubSnap = await getDoc(doc(db, 'publicExams', examCode));
        if (pubSnap.exists()) {
          const pubExam = pubSnap.data() as Exam & { ownerId?: string };
          if (pubExam.isPublished) {
            assignedExams.push({
              exam: sanitizeExamForStudent(pubExam),
              classCode: meta.classCode,
              className: meta.className,
              ownerId: pubExam.ownerId || meta.ownerId,
            });
          }
        }
      } catch {
        // unpublished or inaccessible exam -> safely ignored
      }
    })
  );

  return {
    enrollments,
    classLookups,
    assignedExams,
    submissions,
    hubProfiles,
  };
}

// ============================================================================
// ADMIN USER MANAGEMENT & LEGACY DATA ALLOCATION
// ============================================================================

export async function fetchAllUsersForAdmin(): Promise<User[]> {
  if (firebaseInitError || !auth.currentUser) return [];
  const snap = await getDocs(collection(db, 'users'));
  return snap.docs
    .map((d) => {
      const raw = d.data() as Record<string, unknown>;
      const role = (raw.role as UserRole) || 'student';
      const status = (raw.status as AccountStatus) || 'active';
      const rawApproval = raw.approval_status;
      const approval_status: TeacherApprovalStatus | undefined =
        rawApproval === 'pending' || rawApproval === 'approved' || rawApproval === 'rejected'
          ? rawApproval
          : role === 'teacher' || role === 'super_admin' || role === 'admin'
          ? status === 'active' || status === 'approved'
            ? 'approved'
            : status === 'rejected'
            ? 'rejected'
            : 'pending'
          : undefined;
      const rawPilot = raw.pilot_group;
      const pilot_group: PilotGroup | undefined =
        rawPilot === 'host_school' || rawPilot === 'expanded_pilot' || rawPilot === 'standard'
          ? rawPilot
          : role === 'teacher'
          ? 'standard'
          : undefined;

      return {
        id: String(raw.uid || d.id),
        uid: String(raw.uid || d.id),
        name: String(raw.name || ''),
        email: String(raw.email || ''),
        role,
        status,
        approval_status,
        pilot_group,
        department: typeof raw.department === 'string' ? raw.department : undefined,
        phone: typeof raw.phone === 'string' ? raw.phone : undefined,
        school: typeof raw.school === 'string' ? raw.school : undefined,
        className: typeof raw.className === 'string' ? raw.className : undefined,
        approvedBy: typeof raw.approvedBy === 'string' ? raw.approvedBy : undefined,
        approvedAt: typeof raw.approvedAt === 'string' ? raw.approvedAt : undefined,
        createdAt: String(raw.createdAt || ''),
        updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : undefined,
      } satisfies User;
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export async function updateUserAccountByAdmin(
  targetUid: string,
  adminUid: string,
  updates: {
    status?: AccountStatus;
    approval_status?: TeacherApprovalStatus;
    pilot_group?: PilotGroup;
    role?: UserRole;
    name?: string;
    school?: string;
    department?: string;
    className?: string;
    phone?: string;
  }
): Promise<void> {
  if (firebaseInitError || !auth.currentUser) {
    throw new Error('Firebase chưa sẵn sàng.');
  }
  const nowIso = new Date().toISOString();

  // Keep status and approval_status strictly synchronized
  let resolvedStatus = updates.status;
  let resolvedApproval = updates.approval_status;
  if (resolvedStatus && !resolvedApproval) {
    if (resolvedStatus === 'active' || resolvedStatus === 'approved') resolvedApproval = 'approved';
    else if (resolvedStatus === 'pending') resolvedApproval = 'pending';
    else if (resolvedStatus === 'rejected') resolvedApproval = 'rejected';
  } else if (resolvedApproval && !resolvedStatus) {
    if (resolvedApproval === 'approved') resolvedStatus = 'active';
    else if (resolvedApproval === 'pending') resolvedStatus = 'pending';
    else if (resolvedApproval === 'rejected') resolvedStatus = 'rejected';
  }

  const isApproving = resolvedStatus === 'active' || resolvedStatus === 'approved';
  const payload = stripUndefinedDeep({
    ...(resolvedStatus ? { status: resolvedStatus } : {}),
    ...(resolvedApproval ? { approval_status: resolvedApproval } : {}),
    ...(updates.pilot_group ? { pilot_group: updates.pilot_group } : {}),
    ...(updates.role ? { role: updates.role } : {}),
    ...(updates.name !== undefined ? { name: updates.name.trim().slice(0, 150) } : {}),
    ...(updates.school !== undefined ? { school: updates.school.trim().slice(0, 200) } : {}),
    ...(updates.department !== undefined
      ? { department: updates.department.trim().slice(0, 150) }
      : {}),
    ...(updates.className !== undefined ? { className: updates.className.trim().slice(0, 80) } : {}),
    ...(updates.phone !== undefined ? { phone: updates.phone.trim().slice(0, 32) } : {}),
    ...(isApproving ? { approvedBy: adminUid, approvedAt: nowIso } : {}),
    updatedAt: nowIso,
    serverUpdatedAt: serverTimestamp(),
  });

  await updateDoc(doc(db, 'users', targetUid), payload);

  // Best-effort synchronization with `teachers/{targetUid}` so HTQ Chemistry Hub & HQTest stay aligned
  try {
    const teacherRef = doc(db, 'teachers', targetUid);
    const [teacherSnap, userSnap] = await Promise.all([
      getDoc(teacherRef).catch(() => null),
      getDoc(doc(db, 'users', targetUid)).catch(() => null),
    ]);
    const userData = userSnap?.exists() ? (userSnap.data() as Record<string, unknown>) : null;
    const effectiveRole = (updates.role || userData?.role) as UserRole | undefined;
    if (
      effectiveRole === 'teacher' ||
      effectiveRole === 'admin' ||
      effectiveRole === 'super_admin'
    ) {
      const teacherRole = effectiveRole;
      if (teacherSnap?.exists()) {
        await updateDoc(
          teacherRef,
          stripUndefinedDeep({
            ...(resolvedStatus ? { status: resolvedStatus } : {}),
            ...(resolvedApproval ? { approval_status: resolvedApproval } : {}),
            ...(updates.pilot_group ? { pilot_group: updates.pilot_group } : {}),
            role: teacherRole,
            ...(updates.name !== undefined ? { name: updates.name.trim().slice(0, 150) } : {}),
            ...(updates.school !== undefined ? { school: updates.school.trim().slice(0, 200) } : {}),
            ...(updates.department !== undefined
              ? { department: updates.department.trim().slice(0, 150) }
              : {}),
            ...(updates.phone !== undefined ? { phone: updates.phone.trim().slice(0, 32) } : {}),
            ...(isApproving ? { approvedBy: adminUid, approvedAt: nowIso } : {}),
            updatedAt: nowIso,
            serverUpdatedAt: serverTimestamp(),
          })
        );
      } else if (userData && typeof userData.email === 'string' && userData.email.trim()) {
        await setDoc(
          teacherRef,
          stripUndefinedDeep({
            uid: targetUid,
            email: userData.email.trim().toLowerCase(),
            name: String(updates.name ?? userData.name ?? '').trim().slice(0, 150) || undefined,
            role: teacherRole,
            status: (resolvedStatus || (userData.status as AccountStatus) || 'active'),
            ...(resolvedApproval ? { approval_status: resolvedApproval } : {}),
            ...(updates.pilot_group || userData.pilot_group
              ? { pilot_group: updates.pilot_group || userData.pilot_group }
              : {}),
            ...(updates.school ?? userData.school
              ? { school: String(updates.school ?? userData.school).trim().slice(0, 200) }
              : {}),
            ...(updates.department ?? userData.department
              ? { department: String(updates.department ?? userData.department).trim().slice(0, 150) }
              : {}),
            ...(updates.phone ?? userData.phone
              ? { phone: String(updates.phone ?? userData.phone).trim().slice(0, 32) }
              : {}),
            ...(isApproving ? { approvedBy: adminUid, approvedAt: nowIso } : {}),
            createdAt: String(userData.createdAt || nowIso),
            updatedAt: nowIso,
            serverCreatedAt: serverTimestamp(),
            serverUpdatedAt: serverTimestamp(),
          })
        );
      }
    }
  } catch (err) {
    console.warn('[HQTest Workspace] Could not mirror user update to teachers/{uid}:', err);
  }
}

// ============================================================================
// CITY-WIDE SHARED EXAM REPOSITORY (KHO ĐỀ THÀNH PHỐ — KIỂM DUYỆT)
// ============================================================================

export async function requestExamCityShare(
  exam: Exam,
  teacher: User
): Promise<Exam> {
  if (firebaseInitError || !auth.currentUser) {
    throw new Error('Bạn cần đăng nhập để gửi đề xuất chia sẻ lên Kho Thành phố.');
  }
  const safeId = safeDocId(exam.id);
  const nowIso = new Date().toISOString();
  const nextSchool = (exam.authorSchool || teacher.school || '').trim().slice(0, 200);
  const nextDept = (exam.authorDepartment || teacher.department || 'Tổ Hóa học').trim().slice(0, 150);

  await updateDoc(
    doc(db, 'exams', safeId),
    stripUndefinedDeep({
      share_status: 'pending_review',
      shareRequestedAt: nowIso,
      ...(nextSchool ? { authorSchool: nextSchool } : {}),
      ...(nextDept ? { authorDepartment: nextDept } : {}),
      updatedBy: auth.currentUser.uid,
      updatedAt: nowIso,
      serverUpdatedAt: serverTimestamp(),
    })
  );

  return {
    ...exam,
    share_status: 'pending_review',
    shareRequestedAt: nowIso,
    authorSchool: nextSchool || exam.authorSchool,
    authorDepartment: nextDept || exam.authorDepartment,
    updatedAt: nowIso,
  };
}

export async function withdrawExamCityShareRequest(exam: Exam): Promise<Exam> {
  if (firebaseInitError || !auth.currentUser) {
    throw new Error('Bạn cần đăng nhập để thu hồi yêu cầu chia sẻ.');
  }
  const safeId = safeDocId(exam.id);
  const nowIso = new Date().toISOString();

  await updateDoc(
    doc(db, 'exams', safeId),
    stripUndefinedDeep({
      share_status: 'private',
      updatedBy: auth.currentUser.uid,
      updatedAt: nowIso,
      serverUpdatedAt: serverTimestamp(),
    })
  );

  return {
    ...exam,
    share_status: 'private',
    updatedAt: nowIso,
  };
}

export async function reviewExamCityShareByAdmin(
  examId: string,
  adminUid: string,
  decision: 'approve' | 'reject',
  note?: string
): Promise<void> {
  if (firebaseInitError || !auth.currentUser) {
    throw new Error('Cần quyền Quản trị viên để duyệt đề chia sẻ.');
  }
  const safeId = safeDocId(examId);
  const ref = doc(db, 'exams', safeId);
  const nowIso = new Date().toISOString();
  const cleanNote = (note || '').trim().slice(0, 500);

  const patch = stripUndefinedDeep({
    share_status: decision === 'approve' ? 'city_public' : 'private',
    ...(decision === 'approve'
      ? {
          cityApprovedBy: adminUid,
          cityApprovedAt: nowIso,
        }
      : {}),
    cityReviewNote:
      cleanNote ||
      (decision === 'approve'
        ? 'Đã kiểm duyệt chuẩn GDPT 2018.'
        : 'Chưa đạt yêu cầu kiểm duyệt — đã trả lại tác giả chỉnh sửa.'),
    updatedBy: adminUid,
    updatedAt: nowIso,
    serverUpdatedAt: serverTimestamp(),
  });

  try {
    await updateDoc(ref, patch);
  } catch (err) {
    const existing = await getDoc(ref).catch(() => null);
    if (existing?.exists() && !existing.data()?.serverCreatedAt) {
      await updateDoc(ref, {
        ...patch,
        serverCreatedAt: serverTimestamp(),
      });
      return;
    }
    handleFirestoreError(err, OperationType.UPDATE, `exams/${safeId}`);
  }
}

export async function fetchCitySharedQuestions(options?: {
  isSuperAdmin?: boolean;
}): Promise<Question[]> {
  if (firebaseInitError || !auth.currentUser) return [];
  const isSuperAdmin = Boolean(options?.isSuperAdmin);
  try {
    const qRef = isSuperAdmin
      ? query(collection(db, 'questions'), where('isSharedCity', '==', true))
      : query(
          collection(db, 'questions'),
          where('isSharedCity', '==', true),
          where('cityStatus', '==', 'approved')
        );
    const snap = await getDocs(qRef);
    const statusWeight: Record<QuestionCityStatus, number> = {
      pending: 0,
      approved: 1,
      rejected: 2,
    };

    return snap.docs
      .map((d) => {
        const raw = d.data() as Question;
        const normalizedGrade = normalizeQuestionGrade(raw.grade);
        const normalizedCityStatus: QuestionCityStatus =
          raw.cityStatus === 'approved' ||
          raw.cityStatus === 'rejected' ||
          raw.cityStatus === 'pending'
            ? raw.cityStatus
            : 'pending';
        return {
          ...raw,
          id: raw.id || d.id,
          grade: normalizedGrade || raw.grade,
          isSharedCity: true,
          cityStatus: normalizedCityStatus,
        } satisfies Question;
      })
      .filter((q) => (isSuperAdmin ? true : q.cityStatus === 'approved'))
      .sort((a, b) => {
        if (isSuperAdmin) {
          const diff =
            statusWeight[a.cityStatus || 'pending'] - statusWeight[b.cityStatus || 'pending'];
          if (diff !== 0) return diff;
        }
        return (
          new Date(b.updatedAt || b.createdAt).getTime() -
          new Date(a.updatedAt || a.createdAt).getTime()
        );
      });
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'questions');
    return [];
  }
}

export async function reviewCityQuestionStatusByAdmin(
  questionId: string,
  nextStatus: QuestionCityStatus
): Promise<void> {
  if (firebaseInitError || !auth.currentUser) {
    throw new Error('Cần quyền Quản trị viên để kiểm duyệt câu hỏi đóng góp.');
  }
  const safeId = safeDocId(questionId);
  const ref = doc(db, 'questions', safeId);
  const nowIso = new Date().toISOString();
  const patch = {
    cityStatus: nextStatus,
    updatedAt: nowIso,
    serverUpdatedAt: serverTimestamp(),
  };

  try {
    await updateDoc(ref, patch);
  } catch (err) {
    const existing = await getDoc(ref).catch(() => null);
    if (existing?.exists() && !existing.data()?.serverCreatedAt) {
      await updateDoc(ref, {
        ...patch,
        serverCreatedAt: serverTimestamp(),
      });
      return;
    }
    handleFirestoreError(err, OperationType.UPDATE, `questions/${safeId}`);
  }
}

export async function bulkReviewCityQuestionsStatusByAdmin(
  questionIds: string[],
  nextStatus: QuestionCityStatus
): Promise<void> {
  if (firebaseInitError || !auth.currentUser) {
    throw new Error('Cần quyền Quản trị viên để kiểm duyệt hàng loạt câu hỏi.');
  }
  const uniqueIds = Array.from(new Set(questionIds.map((id) => safeDocId(id)).filter(Boolean)));
  if (uniqueIds.length === 0) return;
  const nowIso = new Date().toISOString();

  for (let i = 0; i < uniqueIds.length; i += 400) {
    const chunk = uniqueIds.slice(i, i + 400);
    try {
      const batch = writeBatch(db);
      chunk.forEach((safeId) => {
        batch.update(doc(db, 'questions', safeId), {
          cityStatus: nextStatus,
          updatedAt: nowIso,
          serverUpdatedAt: serverTimestamp(),
        });
      });
      await batch.commit();
    } catch {
      // Fallback per-document to safely handle legacy docs lacking serverCreatedAt
      for (const safeId of chunk) {
        await reviewCityQuestionStatusByAdmin(safeId, nextStatus);
      }
    }
  }
}

export async function cloneCityQuestionToPersonalBank(
  sourceQuestion: Question,
  targetTeacher: User
): Promise<Question> {
  if (firebaseInitError || !auth.currentUser) {
    throw new Error('Bạn cần đăng nhập để lưu câu hỏi về ngân hàng cá nhân.');
  }
  const ownerId = targetTeacher.uid || targetTeacher.id || auth.currentUser.uid;
  const nowIso = new Date().toISOString();
  const newQuestionId = `q_city_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

  const cloned: Question = {
    ...structuredClone(sourceQuestion),
    id: newQuestionId,
    ownerId,
    authorId: ownerId,
    authorName: targetTeacher.name || auth.currentUser.displayName || sourceQuestion.authorName,
    authorSchool: targetTeacher.school || sourceQuestion.authorSchool,
    isSharedCity: false,
    isPublicCity: false,
    cityStatus: undefined,
    source:
      sourceQuestion.source ||
      (sourceQuestion.authorSchool
        ? `Kho TP (${sourceQuestion.authorSchool})`
        : 'Kho câu hỏi Thành phố'),
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  await saveQuestionToFirestore(cloned, ownerId);
  return cloned;
}

export async function fetchCityPublicExams(): Promise<Exam[]> {
  if (firebaseInitError || !auth.currentUser) return [];
  const snap = await getDocs(
    query(collection(db, 'exams'), where('share_status', '==', 'city_public'))
  );
  return snap.docs
    .map((d) => {
      const raw = d.data() as Exam;
      return {
        ...raw,
        id: d.id,
        examId: raw.examId || d.id,
        share_status: 'city_public' as const,
      } satisfies Exam;
    })
    .sort(
      (a, b) =>
        new Date(b.cityApprovedAt || b.updatedAt || b.createdAt).getTime() -
        new Date(a.cityApprovedAt || a.updatedAt || a.createdAt).getTime()
    );
}

export async function fetchCityExamsForSuperAdmin(): Promise<Exam[]> {
  if (firebaseInitError || !auth.currentUser) return [];
  try {
    const [pendingSnap, publicSnap] = await Promise.all([
      getDocs(query(collection(db, 'exams'), where('share_status', '==', 'pending_review'))),
      getDocs(query(collection(db, 'exams'), where('share_status', '==', 'city_public'))),
    ]);

    const mergedMap = new Map<string, Exam>();
    pendingSnap.docs.forEach((d) => {
      const raw = d.data() as Exam;
      mergedMap.set(d.id, {
        ...raw,
        id: d.id,
        examId: raw.examId || d.id,
        share_status: 'pending_review',
      });
    });
    publicSnap.docs.forEach((d) => {
      const raw = d.data() as Exam;
      mergedMap.set(d.id, {
        ...raw,
        id: d.id,
        examId: raw.examId || d.id,
        share_status: 'city_public',
      });
    });

    return Array.from(mergedMap.values()).sort((a, b) => {
      // Pending exams surface first so Super Admin sees review queue immediately
      const aPending = a.share_status === 'pending_review' ? 1 : 0;
      const bPending = b.share_status === 'pending_review' ? 1 : 0;
      if (aPending !== bPending) return bPending - aPending;
      const timeA = new Date(
        a.shareRequestedAt || a.cityApprovedAt || a.updatedAt || a.createdAt
      ).getTime();
      const timeB = new Date(
        b.shareRequestedAt || b.cityApprovedAt || b.updatedAt || b.createdAt
      ).getTime();
      return timeB - timeA;
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'exams');
    return [];
  }
}

export async function cloneCityExamToPersonalBank(
  sourceExam: Exam,
  targetTeacher: User
): Promise<Exam> {
  if (firebaseInitError || !auth.currentUser) {
    throw new Error('Bạn cần đăng nhập để nhân bản đề thi.');
  }
  const ownerId = targetTeacher.uid || targetTeacher.id || auth.currentUser.uid;
  const nowIso = new Date().toISOString();
  const newExamId = `exam_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const newCode = generateExamCode6();

  const clonedQuestions: Question[] = (sourceExam.questions || []).map((q, idx) => ({
    ...structuredClone(q),
    id: `q_clone_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 5)}`,
    ownerId,
    authorId: ownerId,
    updatedAt: nowIso,
  }));

  const clonedExam: Exam = {
    ...sourceExam,
    id: newExamId,
    examId: newExamId,
    code: newCode,
    publicCode: newCode,
    shortId: newCode,
    slug: `/${newCode}`,
    title: `${sourceExam.title} (Bản sao)`,
    folderId: null,
    questions: clonedQuestions,
    totalQuestions: clonedQuestions.length,
    isPublished: false,
    requiresPassword: false,
    passwordUpdatedAt: null,
    assignedClassCodes: [],
    ownerId,
    authorId: ownerId,
    authorName: targetTeacher.name || auth.currentUser.displayName || 'Giáo viên',
    authorSchool: targetTeacher.school || undefined,
    authorDepartment: targetTeacher.department || 'Tổ Hóa học',
    share_status: 'private',
    shareRequestedAt: undefined,
    cityApprovedBy: undefined,
    cityApprovedAt: undefined,
    cityReviewNote: undefined,
    clonedFromExamId: sourceExam.id,
    cloneCount: 0,
    createdBy: ownerId,
    updatedBy: ownerId,
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  await syncExamToFirestore(clonedExam, ownerId);
  return clonedExam;
}

export interface LegacyCloudAuditResult {
  allExams: Exam[];
  allQuestions: Question[];
  allFolders: Folder[];
  allSubmissions: StudentSubmission[];
}

export async function fetchCloudAuditDataForAdmin(): Promise<LegacyCloudAuditResult> {
  if (firebaseInitError || !auth.currentUser) {
    return { allExams: [], allQuestions: [], allFolders: [], allSubmissions: [] };
  }
  const [eSnap, qSnap, fSnap, sSnap] = await Promise.all([
    getDocs(collection(db, 'exams')),
    getDocs(collection(db, 'questions')),
    getDocs(collection(db, 'folders')),
    getDocs(collection(db, 'submissions')),
  ]);

  return {
    allExams: eSnap.docs.map((d) => d.data() as Exam),
    allQuestions: qSnap.docs.map((d) => d.data() as Question),
    allFolders: fSnap.docs.map((d) => d.data() as Folder),
    allSubmissions: sSnap.docs.map((d) => d.data() as StudentSubmission),
  };
}

export async function assignLegacyRecordToTeacher(params: {
  targetTeacher: User;
  exams?: Exam[];
  questions?: Question[];
  folders?: Folder[];
  submissions?: StudentSubmission[];
}): Promise<number> {
  if (firebaseInitError || !auth.currentUser) {
    throw new Error('Cần đăng nhập Admin để phân bổ dữ liệu.');
  }
  const teacherUid = params.targetTeacher.uid || params.targetTeacher.id;
  let assignedCount = 0;

  if (params.folders && params.folders.length > 0) {
    for (const f of params.folders) {
      await saveFolderToFirestore({ ...f, ownerId: teacherUid, authorId: teacherUid }, teacherUid);
      assignedCount++;
    }
  }

  if (params.questions && params.questions.length > 0) {
    await saveQuestionsBatchToFirestore(
      params.questions.map((q) => ({ ...q, ownerId: teacherUid, authorId: teacherUid })),
      teacherUid
    );
    assignedCount += params.questions.length;
  }

  if (params.exams && params.exams.length > 0) {
    for (const ex of params.exams) {
      await syncExamToFirestore(
        {
          ...ex,
          ownerId: teacherUid,
          authorId: teacherUid,
          authorName: ex.authorName || params.targetTeacher.name,
        },
        teacherUid
      );
      assignedCount++;
    }
  }

  if (params.submissions && params.submissions.length > 0) {
    for (const sub of params.submissions) {
      const ref = doc(db, 'submissions', safeDocId(sub.id));
      await updateDoc(ref, { ownerId: teacherUid }).catch(() => {});
      assignedCount++;
    }
  }

  return assignedCount;
}
