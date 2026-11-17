import {
  collection,
  doc,
  getDoc,
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
import {
  User,
  UserRole,
  AccountStatus,
  Question,
  Folder,
  SubjectItem,
  Exam,
  StudentSubmission,
  Classroom,
  ClassJoinLookup,
  ClassEnrollment,
  UploadRecord,
} from '../types';
import { normalizeExamCode } from '../utils/urlHelper';

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
}

function safeDocId(raw: string): string {
  return (raw || `doc_${Date.now()}`).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128);
}

// ============================================================================
// TEACHER ISOLATED WORKSPACE OPERATIONS (ownerId == uid)
// ============================================================================

export async function fetchTeacherWorkspaceFromFirestore(uid: string): Promise<TeacherWorkspaceData> {
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

  const [qSnap, fSnap, eSnap, sSnap, cSnap, enSnap, uSnap, subSnap] = await Promise.all([
    getDocs(query(collection(db, 'questions'), where('ownerId', '==', uid))),
    getDocs(query(collection(db, 'folders'), where('ownerId', '==', uid))),
    getDocs(query(collection(db, 'exams'), where('ownerId', '==', uid))),
    getDocs(query(collection(db, 'submissions'), where('ownerId', '==', uid))),
    getDocs(query(collection(db, 'classes'), where('ownerId', '==', uid))),
    getDocs(query(collection(db, 'classEnrollments'), where('teacherId', '==', uid))),
    getDocs(query(collection(db, 'uploadRecords'), where('ownerId', '==', uid))),
    getDocs(query(collection(db, 'subjects'), where('ownerId', '==', uid))).catch(() => null),
  ]);

  const submissions = sSnap.docs
    .map((d) => d.data() as StudentSubmission)
    .sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());

  const exams = eSnap.docs
    .map((d) => d.data() as Exam)
    .sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime());

  const questions = qSnap.docs
    .map((d) => d.data() as Question)
    .sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime());

  const classes = cSnap.docs
    .map((d) => d.data() as Classroom)
    .sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime());

  const subjects = subSnap
    ? subSnap.docs.map((d) => d.data() as SubjectItem)
    : [];

  return {
    questions,
    folders: fSnap.docs.map((d) => d.data() as Folder),
    subjects,
    exams,
    submissions,
    classes,
    enrollments: enSnap.docs.map((d) => d.data() as ClassEnrollment),
    uploadRecords: uSnap.docs
      .map((d) => d.data() as UploadRecord)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
  };
}

function buildQuestionDocPayload(q: Question, ownerId: string, existingCreatedAt?: unknown) {
  const safeId = safeDocId(q.id);
  const nowIso = new Date().toISOString();
  return stripUndefinedDeep({
    id: safeId,
    ownerId,
    code: (q.code || `Q_${safeId.slice(-6)}`).slice(0, 64),
    content: (q.content || '').slice(0, 20000),
    type: q.type || 'part1_single_choice',
    ...(q.subjectId ? { subjectId: q.subjectId.slice(0, 64) } : {}),
    ...(q.subjectName ? { subjectName: q.subjectName.slice(0, 120) } : {}),
    grade: q.grade || '12',
    topic: (q.topic || 'hoa_dai_cuong').slice(0, 64),
    ...(q.lessonTopic && q.lessonTopic.trim() ? { lessonTopic: q.lessonTopic.trim().slice(0, 200) } : {}),
    level: q.level || 'nhan_biet',
    ...(q.folderId ? { folderId: q.folderId.slice(0, 128) } : {}),
    ...(q.options ? { options: q.options.slice(0, 8) } : {}),
    ...(q.correctOptionId ? { correctOptionId: q.correctOptionId.slice(0, 8) } : {}),
    ...(q.statements ? { statements: q.statements.slice(0, 8) } : {}),
    ...(q.shortAnswerConfig ? { shortAnswerConfig: q.shortAnswerConfig } : {}),
    ...(q.imageUrl && q.imageUrl.trim() ? { imageUrl: q.imageUrl.trim().slice(0, 1000) } : {}),
    ...(q.explanation ? { explanation: q.explanation.slice(0, 20000) } : {}),
    ...(q.source ? { source: q.source.slice(0, 300) } : {}),
    authorId: q.authorId || ownerId,
    ...(q.parseStatus ? { parseStatus: q.parseStatus } : {}),
    ...(q.parseWarning ? { parseWarning: q.parseWarning.slice(0, 500) } : {}),
    ...(q.teacherVerified !== undefined ? { teacherVerified: !!q.teacherVerified } : {}),
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

function buildFolderDocPayload(f: Folder, ownerId: string, existingCreatedAt?: unknown) {
  const safeId = safeDocId(f.id);
  const nowIso = new Date().toISOString();
  return stripUndefinedDeep({
    id: safeId,
    ownerId,
    name: (f.name || 'Thư mục mới').slice(0, 150),
    parentId: f.parentId && f.parentId.trim() ? f.parentId.trim().slice(0, 128) : null,
    ...(f.description ? { description: f.description.slice(0, 500) } : {}),
    ...(f.grade ? { grade: f.grade } : {}),
    ...(f.color ? { color: f.color.slice(0, 32) } : {}),
    authorId: f.authorId || ownerId,
    ...(typeof f.itemCount === 'number' ? { itemCount: Math.max(0, f.itemCount) } : {}),
    createdAt: f.createdAt || nowIso,
    updatedAt: f.updatedAt || nowIso,
    serverCreatedAt: existingCreatedAt || serverTimestamp(),
    serverUpdatedAt: serverTimestamp(),
  });
}

export async function saveFolderToFirestore(folder: Folder, explicitOwnerId?: string): Promise<void> {
  if (firebaseInitError || !auth.currentUser) return;
  const ownerId = explicitOwnerId || auth.currentUser.uid;
  const safeId = safeDocId(folder.id);
  const ref = doc(db, 'folders', safeId);
  try {
    const existing = await getDoc(ref).catch(() => null);
    await setDoc(ref, buildFolderDocPayload(folder, ownerId, existing?.exists() ? existing.data()?.serverCreatedAt : undefined));
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `folders/${safeId}`);
  }
}

export async function deleteFolderFromFirestore(folderId: string): Promise<void> {
  if (firebaseInitError || !auth.currentUser) return;
  const safeId = safeDocId(folderId);
  try {
    await deleteDoc(doc(db, 'folders', safeId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `folders/${safeId}`);
  }
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
}

export async function removeStudentEnrollmentFromFirestore(enrollmentId: string): Promise<void> {
  if (firebaseInitError || !auth.currentUser) return;
  await deleteDoc(doc(db, 'classEnrollments', safeDocId(enrollmentId)));
}

// ============================================================================
// STUDENT WORKSPACE (ENROLLED CLASSES, ASSIGNED EXAMS, SYNCED SUBMISSIONS)
// ============================================================================

export async function fetchStudentWorkspaceFromFirestore(uid: string): Promise<StudentWorkspaceData> {
  if (firebaseInitError || !uid) {
    return {
      enrollments: [],
      classLookups: [],
      assignedExams: [],
      submissions: [],
    };
  }

  const [enSnap, subSnap] = await Promise.all([
    getDocs(query(collection(db, 'classEnrollments'), where('studentId', '==', uid))),
    getDocs(query(collection(db, 'submissions'), where('studentId', '==', uid))),
  ]);

  const enrollments = enSnap.docs.map((d) => d.data() as ClassEnrollment);
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
      return {
        id: String(raw.uid || d.id),
        uid: String(raw.uid || d.id),
        name: String(raw.name || ''),
        email: String(raw.email || ''),
        role: (raw.role as UserRole) || 'student',
        status: (raw.status as AccountStatus) || 'active',
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
    role?: UserRole;
    name?: string;
    school?: string;
    className?: string;
    phone?: string;
  }
): Promise<void> {
  if (firebaseInitError || !auth.currentUser) {
    throw new Error('Firebase chưa sẵn sàng.');
  }
  const nowIso = new Date().toISOString();
  const payload = stripUndefinedDeep({
    ...(updates.status ? { status: updates.status } : {}),
    ...(updates.role ? { role: updates.role } : {}),
    ...(updates.name !== undefined ? { name: updates.name.trim().slice(0, 150) } : {}),
    ...(updates.school !== undefined ? { school: updates.school.trim().slice(0, 200) } : {}),
    ...(updates.className !== undefined ? { className: updates.className.trim().slice(0, 80) } : {}),
    ...(updates.phone !== undefined ? { phone: updates.phone.trim().slice(0, 32) } : {}),
    ...(updates.status === 'active'
      ? { approvedBy: adminUid, approvedAt: nowIso }
      : {}),
    updatedAt: nowIso,
    serverUpdatedAt: serverTimestamp(),
  });

  await updateDoc(doc(db, 'users', targetUid), payload);
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
