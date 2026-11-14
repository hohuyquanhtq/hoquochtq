/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  User,
  UserRole,
  Question,
  Exam,
  Folder,
  StudentSubmission,
  ChemGrade,
  Classroom,
  ClassEnrollment,
  UploadRecord,
} from './types';
import { StorageService } from './services/storage';
import { Header } from './components/common/Header';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { SystemDesignModal } from './components/docs/SystemDesignModal';
import { APP_CONFIG } from './constants/brand';
import {
  extractExamCodeFromLocation,
  normalizeExamCode,
} from './utils/urlHelper';
import {
  syncExamToFirestore,
  deleteExamFromFirestore,
  fetchAllowedAnswerKeysAfterSubmit,
  rehydrateExamWithAnswerKeys,
  saveSubmissionToFirestore,
  sanitizeExamForStudent,
} from './services/firebase';
import {
  fetchTeacherWorkspaceFromFirestore,
  fetchStudentWorkspaceFromFirestore,
  saveQuestionToFirestore,
  saveQuestionsBatchToFirestore,
  deleteQuestionFromFirestore,
  saveFolderToFirestore,
  deleteFolderFromFirestore,
  saveUploadRecordToFirestore,
  saveClassroomToFirestore,
  deleteClassroomFromFirestore,
  removeStudentEnrollmentFromFirestore,
} from './services/workspaceService';
import { joinClassByCode } from './services/authService';
import { gradeSubmission } from './utils/gradingEngine';
import { useAuth } from './contexts/AuthContext';

// Auth Components
import { AuthPortal } from './components/auth/AuthPortal';
import { ProtectedRoute } from './components/auth/ProtectedRoute';

// Teacher Components
import { TeacherDashboard } from './components/teacher/TeacherDashboard';
import { ExamUploader } from './components/teacher/ExamUploader';
import { QuestionBank } from './components/teacher/QuestionBank';
import { FolderManager } from './components/teacher/FolderManager';
import { ExamCreator } from './components/teacher/ExamCreator';
import { ExamManager } from './components/teacher/ExamManager';
import { ExamResults } from './components/teacher/ExamResults';
import { ClassManager } from './components/teacher/ClassManager';

// Student Components
import { StudentHome, StudentAssignedExamItem } from './components/student/StudentHome';
import { ExamTaker } from './components/student/ExamTaker';
import { ExamResultView } from './components/student/ExamResultView';
import { ExamJoinLanding, ExamLandingStatus } from './components/student/ExamJoinLanding';

// Admin Components
import { AdminDashboard } from './components/admin/AdminDashboard';

function getDefaultTabForRole(role: UserRole): string {
  if (role === 'student') return 'student_home';
  if (role === 'admin') return 'admin_dashboard';
  return 'dashboard';
}

export default function App() {
  const { authState, userProfile, setLocalUpdatedProfile, logout } = useAuth();

  const [initialDirectCode] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    try {
      return extractExamCodeFromLocation(window.location);
    } catch {
      return null;
    }
  });

  // Guest direct-link exam access (/c/:code or ?examCode=...)
  const [guestExamMode, setGuestExamMode] = useState<boolean>(() => Boolean(initialDirectCode));
  const [activeTab, setActiveTab] = useState<string>(() =>
    initialDirectCode ? 'exam_landing' : 'dashboard'
  );
  const [isSystemDocsOpen, setIsSystemDocsOpen] = useState(false);

  // Scoped Workspace State (Strict UID isolation)
  const [questions, setQuestions] = useState<Question[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [submissions, setSubmissions] = useState<StudentSubmission[]>([]);
  const [classes, setClasses] = useState<Classroom[]>([]);
  const [enrollments, setEnrollments] = useState<ClassEnrollment[]>([]);
  const [assignedExams, setAssignedExams] = useState<StudentAssignedExamItem[]>([]);
  const [isLoadingWorkspace, setIsLoadingWorkspace] = useState(false);
  const [isSeedingSamples, setIsSeedingSamples] = useState(false);

  // Interactive flow state
  const [activeExamForTaking, setActiveExamForTaking] = useState<Exam | null>(null);
  const [activeExamOwnerId, setActiveExamOwnerId] = useState<string | undefined>(undefined);
  const [activeStudentName, setActiveStudentName] = useState<string>('');
  const [activeStudentClass, setActiveStudentClass] = useState<string>('');
  const [reviewSubmission, setReviewSubmission] = useState<StudentSubmission | null>(null);
  const [reviewExamOverride, setReviewExamOverride] = useState<Exam | undefined>(undefined);
  const [selectedExamIdForResults, setSelectedExamIdForResults] = useState<string | null>(null);

  // Preload questions for ExamCreator
  const [creatorInitialQuestions, setCreatorInitialQuestions] = useState<Question[]>([]);
  const [creatorInitialTitle, setCreatorInitialTitle] = useState<string>('');
  const [creatorInitialGrade, setCreatorInitialGrade] = useState<ChemGrade>('12');

  // Direct Join via link/QR state
  const [directJoinExam, setDirectJoinExam] = useState<Exam | null>(null);
  const [directJoinOwnerId, setDirectJoinOwnerId] = useState<string | undefined>(undefined);
  const [directJoinCode, setDirectJoinCode] = useState<string>(() =>
    initialDirectCode ? normalizeExamCode(initialDirectCode) : ''
  );
  const [directJoinStatus, setDirectJoinStatus] = useState<ExamLandingStatus>(() =>
    initialDirectCode ? 'loading' : 'found'
  );
  const [directJoinMessage, setDirectJoinMessage] = useState<string | undefined>(undefined);

  const activeUid = userProfile?.uid || userProfile?.id || '';

  const resetWorkspaceMemoryState = useCallback(() => {
    setQuestions([]);
    setExams([]);
    setFolders([]);
    setSubmissions([]);
    setClasses([]);
    setEnrollments([]);
    setAssignedExams([]);
    setSelectedExamIdForResults(null);
  }, []);

  // Load workspace when authenticated user changes
  const hydrateAuthenticatedWorkspace = useCallback(async (user: User) => {
    const uid = user.uid || user.id;
    if (!uid) return;

    StorageService.setActiveWorkspaceUid(uid);
    setQuestions(StorageService.getQuestions(uid));
    setExams(StorageService.getExams(uid));
    setFolders(StorageService.getFolders(uid));
    setSubmissions(StorageService.getSubmissions(undefined, uid));

    setIsLoadingWorkspace(true);
    try {
      if (user.role === 'teacher') {
        const ws = await fetchTeacherWorkspaceFromFirestore(uid);
        setQuestions(ws.questions);
        setFolders(ws.folders);
        setExams(ws.exams);
        setSubmissions(ws.submissions);
        setClasses(ws.classes);
        setEnrollments(ws.enrollments);

        StorageService.saveQuestions(ws.questions, uid);
        StorageService.saveFolders(ws.folders, uid);
        StorageService.saveExams(ws.exams, uid);
        StorageService.saveSubmissions(ws.submissions, uid);
      } else if (user.role === 'student') {
        const sws = await fetchStudentWorkspaceFromFirestore(uid);
        setEnrollments(sws.enrollments);
        setAssignedExams(sws.assignedExams);
        setSubmissions(sws.submissions);
        StorageService.saveSubmissions(sws.submissions, uid);
      }
    } catch (err) {
      console.warn('[HQTest Workspace] Could not sync remote workspace:', err);
    } finally {
      setIsLoadingWorkspace(false);
    }
  }, []);

  useEffect(() => {
    if (authState === 'authenticated' && userProfile) {
      void hydrateAuthenticatedWorkspace(userProfile);
      setActiveTab((prev) => {
        if (guestExamMode || prev === 'exam_landing' || prev === 'take_exam' || prev === 'review_submission') {
          return prev;
        }
        return getDefaultTabForRole(userProfile.role);
      });
    } else if (authState === 'unauthenticated' || authState === 'locked' || authState === 'rejected' || authState === 'pending_approval') {
      resetWorkspaceMemoryState();
    }
  }, [authState, userProfile, hydrateAuthenticatedWorkspace, resetWorkspaceMemoryState, guestExamMode]);

  const reloadDataFromStorage = useCallback(() => {
    if (!activeUid) return;
    setQuestions(StorageService.getQuestions(activeUid));
    setExams(StorageService.getExams(activeUid));
    setFolders(StorageService.getFolders(activeUid));
    setSubmissions(StorageService.getSubmissions(undefined, activeUid));
  }, [activeUid]);

  const resolveDirectExamByCode = useCallback(async (rawCode: string) => {
    const clean = normalizeExamCode(rawCode);
    if (!clean) return;

    setGuestExamMode(true);
    setDirectJoinCode(clean);
    setDirectJoinExam(null);
    setDirectJoinOwnerId(undefined);
    setDirectJoinStatus('loading');
    setDirectJoinMessage(undefined);
    setActiveTab('exam_landing');

    try {
      const res = await StorageService.checkExamStatusAsync(clean);
      setDirectJoinStatus(res.status);
      setDirectJoinMessage(res.message);
      setDirectJoinExam(res.exam || null);
      setDirectJoinOwnerId(res.ownerId);
    } catch (err) {
      console.error('[HQTest] Lỗi tải thông tin bài thi:', err);
      setDirectJoinStatus('unexpected_error');
      setDirectJoinMessage('Đã xảy ra lỗi không mong muốn khi tải thông tin bài thi. Vui lòng thử tải lại.');
      setDirectJoinExam(null);
      setDirectJoinOwnerId(undefined);
    }
  }, []);

  const resolveDirectExamFromUrl = useCallback(async () => {
    if (typeof window === 'undefined') return;
    const targetCode = extractExamCodeFromLocation(window.location);
    if (!targetCode) return;
    await resolveDirectExamByCode(targetCode);
  }, [resolveDirectExamByCode]);

  // URL Routing, QR Scan Detection & Cross-Tab Storage Sync
  useEffect(() => {
    const handleStorageUpdate = () => {
      reloadDataFromStorage();
    };
    const handleRouteChange = () => {
      const code = extractExamCodeFromLocation(window.location);
      if (code) {
        void resolveDirectExamFromUrl();
      } else {
        setDirectJoinExam(null);
        setDirectJoinCode('');
        setGuestExamMode(false);
        setActiveTab((prev) =>
          prev === 'exam_landing'
            ? userProfile
              ? getDefaultTabForRole(userProfile.role)
              : 'dashboard'
            : prev
        );
      }
    };

    window.addEventListener('storage', handleStorageUpdate);
    window.addEventListener('hqtest_exams_updated', handleStorageUpdate);

    void resolveDirectExamFromUrl();
    window.addEventListener('popstate', handleRouteChange);
    window.addEventListener('hashchange', handleRouteChange);

    return () => {
      window.removeEventListener('storage', handleStorageUpdate);
      window.removeEventListener('hqtest_exams_updated', handleStorageUpdate);
      window.removeEventListener('popstate', handleRouteChange);
      window.removeEventListener('hashchange', handleRouteChange);
    };
  }, [reloadDataFromStorage, resolveDirectExamFromUrl, userProfile]);

  const clearExamUrlParam = () => {
    if (typeof window !== 'undefined') {
      try {
        if (window.location.pathname !== '/' || window.location.search || window.location.hash) {
          window.history.replaceState({}, '', '/');
        }
      } catch {
        // Ignore history restriction
      }
    }
  };

  // --- Handlers for Teacher Actions (Strictly Owner-Scoped + Firestore Persisted) ---
  const handleSaveQuestionsToBank = (newQuestions: Question[]) => {
    if (!activeUid) return;
    const nowIso = new Date().toISOString();
    const scoped = newQuestions.map((q) => ({
      ...q,
      ownerId: activeUid,
      authorId: activeUid,
      updatedAt: nowIso,
    }));
    scoped.forEach((q) => StorageService.addQuestion(q, activeUid));
    setQuestions(StorageService.getQuestions(activeUid));
    void saveQuestionsBatchToFirestore(scoped, activeUid).catch((err) => {
      console.warn('[HQTest] Could not sync question batch to Firestore:', err);
    });
    setActiveTab('question_bank');
  };

  const handleFileParsedRecord = (rec: {
    fileName: string;
    fileType: 'docx' | 'pdf' | 'text';
    examTitle: string;
    totalQuestions: number;
    grade: ChemGrade;
  }) => {
    if (!activeUid) return;
    const uploadRecord: UploadRecord = {
      id: `up_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      ownerId: activeUid,
      fileName: rec.fileName,
      fileType: rec.fileType,
      examTitle: rec.examTitle,
      totalQuestions: rec.totalQuestions,
      grade: rec.grade,
      createdAt: new Date().toISOString(),
    };
    void saveUploadRecordToFirestore(uploadRecord, activeUid).catch((err) => {
      console.warn('[HQTest] Could not save upload record:', err);
    });
  };

  const handleCreateExamFromParsed = (title: string, parsedQuestions: Question[], grade: ChemGrade) => {
    setCreatorInitialTitle(title);
    setCreatorInitialQuestions(parsedQuestions);
    setCreatorInitialGrade(grade);
    setActiveTab('create_exam');
  };

  const handleCreateExamFromSelected = (selectedQuestions: Question[]) => {
    setCreatorInitialTitle(`Đề thi chọn lọc Hóa học (${selectedQuestions.length} câu)`);
    setCreatorInitialQuestions(selectedQuestions);
    setActiveTab('create_exam');
  };

  const handleSaveExam = (newExam: Exam) => {
    if (!activeUid) return;
    const scopedExam: Exam = {
      ...newExam,
      ownerId: activeUid,
      authorId: activeUid,
      authorName: userProfile?.name || newExam.authorName || APP_CONFIG.APP_AUTHOR,
    };
    StorageService.addExam(scopedExam, activeUid);
    setExams(StorageService.getExams(activeUid));
    void syncExamToFirestore(scopedExam, activeUid).catch((err) => {
      console.warn('[HQTest] Could not sync saved exam to Firestore:', err);
    });
    setActiveTab('exam_manager');
  };

  const handleToggleExamPublish = (examId: string) => {
    if (!activeUid) return;
    const updated = exams.map((e) =>
      e.id === examId
        ? { ...e, isPublished: !e.isPublished, ownerId: activeUid, updatedAt: new Date().toISOString() }
        : e
    );
    StorageService.saveExams(updated, activeUid);
    setExams(updated);

    const toggled = updated.find((e) => e.id === examId);
    if (toggled) {
      void syncExamToFirestore(toggled, activeUid).catch((err) => {
        console.warn('Could not sync publish toggle to Firestore:', err);
      });
    }
  };

  const handleDeleteExam = (examId: string) => {
    if (!activeUid) return;
    const target = exams.find((e) => e.id === examId);
    const updated = exams.filter((e) => e.id !== examId);
    StorageService.saveExams(updated, activeUid);
    setExams(updated);

    if (target) {
      void deleteExamFromFirestore(target).catch((err) => {
        console.warn('Could not delete exam from Firestore:', err);
      });
    }
  };

  const handleAddQuestion = (q: Question) => {
    if (!activeUid) return;
    const scoped: Question = { ...q, ownerId: activeUid, authorId: activeUid };
    StorageService.addQuestion(scoped, activeUid);
    setQuestions(StorageService.getQuestions(activeUid));
    void saveQuestionToFirestore(scoped, activeUid).catch((err) => {
      console.warn('[HQTest] Could not save question to Firestore:', err);
    });
  };

  const handleUpdateQuestion = (q: Question) => {
    if (!activeUid) return;
    const scoped: Question = {
      ...q,
      ownerId: activeUid,
      authorId: activeUid,
      updatedAt: new Date().toISOString(),
    };
    StorageService.updateQuestion(scoped, activeUid);
    setQuestions(StorageService.getQuestions(activeUid));
    void saveQuestionToFirestore(scoped, activeUid).catch((err) => {
      console.warn('[HQTest] Could not update question in Firestore:', err);
    });
  };

  const handleDeleteQuestion = (id: string) => {
    if (!activeUid) return;
    StorageService.deleteQuestion(id, activeUid);
    setQuestions(StorageService.getQuestions(activeUid));
    void deleteQuestionFromFirestore(id).catch((err) => {
      console.warn('[HQTest] Could not delete question from Firestore:', err);
    });
  };

  const handleSaveFolders = (newFolders: Folder[]) => {
    if (!activeUid) return;
    const prevIds = new Set(folders.map((f) => f.id));
    const nextIds = new Set(newFolders.map((f) => f.id));
    const scopedFolders = newFolders.map((f) => ({
      ...f,
      ownerId: activeUid,
      authorId: activeUid,
    }));

    StorageService.saveFolders(scopedFolders, activeUid);
    setFolders(scopedFolders);

    // Persist added/updated folders & delete removed folders
    scopedFolders.forEach((f) => {
      void saveFolderToFirestore(f, activeUid).catch((err) => {
        console.warn('[HQTest] Could not sync folder to Firestore:', err);
      });
    });
    prevIds.forEach((oldId) => {
      if (!nextIds.has(oldId)) {
        void deleteFolderFromFirestore(oldId).catch((err) => {
          console.warn('[HQTest] Could not delete folder from Firestore:', err);
        });
      }
    });
  };

  const handleSaveClass = async (cls: Classroom) => {
    if (!activeUid) return;
    const scopedCls: Classroom = {
      ...cls,
      ownerId: activeUid,
      teacherName: userProfile?.name || cls.teacherName,
      school: userProfile?.school || cls.school,
    };
    await saveClassroomToFirestore(scopedCls, activeUid);
    setClasses((prev) => {
      const idx = prev.findIndex((c) => c.id === scopedCls.id);
      if (idx === -1) return [scopedCls, ...prev];
      const next = [...prev];
      next[idx] = scopedCls;
      return next;
    });
  };

  const handleDeleteClass = async (cls: Classroom) => {
    await deleteClassroomFromFirestore(cls);
    setClasses((prev) => prev.filter((c) => c.id !== cls.id));
    setEnrollments((prev) => prev.filter((en) => en.classId !== cls.id));
  };

  const handleRemoveEnrollment = async (enrollmentId: string) => {
    await removeStudentEnrollmentFromFirestore(enrollmentId);
    setEnrollments((prev) => prev.filter((en) => en.id !== enrollmentId));
  };

  const handleSeedStarterSamples = async () => {
    if (!activeUid || !userProfile) return;
    setIsSeedingSamples(true);
    try {
      const seeded = StorageService.seedStarterSamplesForTeacher(activeUid, userProfile.name);
      setFolders(seeded.folders);
      setQuestions(seeded.questions);
      setExams(seeded.exams);

      await Promise.all([
        ...seeded.folders.map((f) => saveFolderToFirestore(f, activeUid).catch(() => {})),
        saveQuestionsBatchToFirestore(seeded.questions, activeUid).catch(() => {}),
        ...seeded.exams.map((ex) => syncExamToFirestore(ex, activeUid).catch(() => {})),
      ]);
    } finally {
      setIsSeedingSamples(false);
    }
  };

  const handleOpenExamResults = (examId: string) => {
    setSelectedExamIdForResults(examId);
    setActiveTab('exam_results');
  };

  // --- Handlers for Student & Exam Taking Actions ---
  const handleStartExam = (exam: Exam, name: string, cls: string, ownerId?: string) => {
    setActiveExamForTaking(sanitizeExamForStudent(exam));
    setActiveExamOwnerId(ownerId || exam.ownerId);
    setActiveStudentName(name);
    setActiveStudentClass(cls);

    if (typeof window !== 'undefined' && exam.code) {
      try {
        const normalized = normalizeExamCode(exam.code);
        const nextUrl = `/?examCode=${encodeURIComponent(normalized)}`;
        window.history.replaceState({}, '', nextUrl);
      } catch {
        // Ignore history restriction
      }
    }
    setActiveTab('take_exam');
  };

  const handleFinishExam = async (rawSubmission: StudentSubmission) => {
    let finalSubmission: StudentSubmission = {
      ...rawSubmission,
      studentId: activeUid || rawSubmission.studentId || 'guest_student',
      ownerId: activeExamOwnerId || rawSubmission.ownerId,
    };
    let examForReview: Exam | undefined = activeExamForTaking || undefined;

    if (activeExamForTaking) {
      const resolvedOwnerId = activeExamOwnerId || activeExamForTaking.ownerId;
      if (resolvedOwnerId) {
        if (activeExamForTaking.showAnswersAfterSubmit) {
          const allowedKeys = await fetchAllowedAnswerKeysAfterSubmit(activeExamForTaking.code);
          if (allowedKeys) {
            const hydrated = rehydrateExamWithAnswerKeys(
              activeExamForTaking,
              allowedKeys.answerMap,
              allowedKeys.showSolutionsAfterSubmit
            );
            const graded = gradeSubmission(
              hydrated,
              finalSubmission.studentId,
              rawSubmission.studentName,
              rawSubmission.studentClass,
              rawSubmission.startedAt,
              rawSubmission.answers,
              rawSubmission.tabSwitchesCount || 0
            );
            finalSubmission = {
              ...graded,
              id: rawSubmission.id,
              ownerId: resolvedOwnerId,
              durationSeconds: rawSubmission.durationSeconds,
              submittedAt: rawSubmission.submittedAt,
              status: rawSubmission.status,
            };
            examForReview = hydrated;
          }
        }
        void saveSubmissionToFirestore(finalSubmission, resolvedOwnerId);
      } else {
        const localMaster = StorageService.getExamByCode(activeExamForTaking.code, activeUid || undefined);
        if (localMaster) {
          const graded = gradeSubmission(
            localMaster,
            finalSubmission.studentId,
            rawSubmission.studentName,
            rawSubmission.studentClass,
            rawSubmission.startedAt,
            rawSubmission.answers,
            rawSubmission.tabSwitchesCount || 0
          );
          finalSubmission = {
            ...graded,
            id: rawSubmission.id,
            durationSeconds: rawSubmission.durationSeconds,
            submittedAt: rawSubmission.submittedAt,
            status: rawSubmission.status,
          };
          examForReview = localMaster.showAnswersAfterSubmit
            ? localMaster
            : sanitizeExamForStudent(localMaster);
        }
      }
    }

    if (activeUid) {
      StorageService.addSubmission(finalSubmission, activeUid);
      setSubmissions(StorageService.getSubmissions(undefined, activeUid));
    }
    setReviewExamOverride(examForReview);
    setReviewSubmission(finalSubmission);
    setActiveTab('review_submission');
  };

  const handleReviewSubmission = (sub: StudentSubmission) => {
    const matchingAssigned = assignedExams.find((a) => a.exam.id === sub.examId)?.exam;
    const localExam = exams.find((e) => e.id === sub.examId) || matchingAssigned;
    setReviewExamOverride(
      localExam
        ? localExam.showAnswersAfterSubmit
          ? localExam
          : sanitizeExamForStudent(localExam)
        : undefined
    );
    setReviewSubmission(sub);
    setActiveTab('review_submission');
  };

  const handleJoinClassByCode = async (code: string) => {
    if (!userProfile) {
      return { success: false, errorMessage: 'Vui lòng đăng nhập tài khoản học sinh để tham gia lớp.' };
    }
    const res = await joinClassByCode(userProfile, code);
    if (res.success && userProfile) {
      await hydrateAuthenticatedWorkspace(userProfile);
    }
    return res;
  };

  const handleLogout = async () => {
    clearExamUrlParam();
    setGuestExamMode(false);
    setDirectJoinExam(null);
    setActiveExamForTaking(null);
    setReviewSubmission(null);
    resetWorkspaceMemoryState();
    await logout();
  };

  const handleExitGuestModeToAuth = () => {
    clearExamUrlParam();
    setGuestExamMode(false);
    setDirectJoinExam(null);
    setActiveExamForTaking(null);
    setReviewSubmission(null);
  };

  const resetToRoleHome = () => {
    clearExamUrlParam();
    setDirectJoinExam(null);
    setActiveExamForTaking(null);
    setReviewSubmission(null);
    if (userProfile) {
      setGuestExamMode(false);
      setActiveTab(getDefaultTabForRole(userProfile.role));
    } else {
      setGuestExamMode(false);
    }
  };

  // --- Determine whether we are in Guest Direct-Exam Flow vs Auth Gate vs Authenticated App ---
  const isAuthenticatedSession = authState === 'authenticated' && Boolean(userProfile);
  const isGuestDirectExamFlow =
    guestExamMode ||
    ['exam_landing', 'take_exam', 'review_submission'].includes(activeTab) && !isAuthenticatedSession;

  if (!isAuthenticatedSession && !isGuestDirectExamFlow) {
    return (
      <ErrorBoundary fallbackTitle="Không thể khởi tạo cổng đăng nhập" onResetToHome={() => window.location.reload()}>
        <AuthPortal
          onQuickExamCodeLookup={(code) => {
            void resolveDirectExamByCode(code);
          }}
        />
      </ErrorBoundary>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      {/* Global Header (Hide during ongoing exam for full concentration) */}
      {activeTab !== 'take_exam' && (
        <Header
          currentUser={userProfile}
          isGuest={!isAuthenticatedSession}
          activeTab={activeTab}
          setActiveTab={(tab) => {
            if (isAuthenticatedSession) {
              setGuestExamMode(false);
            }
            setActiveTab(tab);
          }}
          onOpenSystemDocs={() => setIsSystemDocsOpen(true)}
          onProfileUpdated={(updated) => setLocalUpdatedProfile(updated)}
          onLogout={isAuthenticatedSession ? handleLogout : undefined}
          onRequestAuth={handleExitGuestModeToAuth}
        />
      )}

      {/* Main Content Viewport */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <ErrorBoundary fallbackTitle="Không thể hiển thị nội dung" onResetToHome={resetToRoleHome}>
          {isLoadingWorkspace && isAuthenticatedSession && activeTab !== 'take_exam' && activeTab !== 'exam_landing' && (
            <div className="mb-4 px-4 py-2 rounded-xl bg-blue-50 border border-blue-200 text-blue-800 text-xs font-semibold flex items-center gap-2">
              <div className="w-3.5 h-3.5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
              <span>Đang đồng bộ không gian dữ liệu riêng từ Cloud Firestore...</span>
            </div>
          )}

          {/* --- DIRECT EXAM JOIN LANDING (Guests & Students) --- */}
          {activeTab === 'exam_landing' && (
            <ExamJoinLanding
              exam={directJoinExam}
              examCode={directJoinCode}
              status={directJoinStatus}
              statusMessage={directJoinMessage}
              currentUser={userProfile}
              onStartExam={(ex, name, cls) => {
                handleStartExam(ex, name, cls, directJoinOwnerId);
              }}
              onRetryLookup={() => void resolveDirectExamByCode(directJoinCode)}
              onBackToHome={() => {
                if (isAuthenticatedSession && userProfile) {
                  resetToRoleHome();
                } else {
                  handleExitGuestModeToAuth();
                }
              }}
            />
          )}

          {/* --- SHARED EXAM TAKING & RESULT VIEWS --- */}
          {activeTab === 'take_exam' &&
            (activeExamForTaking ? (
              <ExamTaker
                exam={activeExamForTaking}
                studentName={activeStudentName || userProfile?.name || 'Thí sinh'}
                studentClass={activeStudentClass || userProfile?.className || 'Tự do'}
                onFinishExam={handleFinishExam}
                onExitWithoutSave={() => {
                  if (isAuthenticatedSession && userProfile) {
                    clearExamUrlParam();
                    setGuestExamMode(false);
                    setActiveTab(userProfile.role === 'teacher' ? 'exam_manager' : 'student_home');
                  } else {
                    handleExitGuestModeToAuth();
                  }
                }}
              />
            ) : (
              <div className="max-w-xl mx-auto py-12 px-4 text-center bg-white border border-slate-200 rounded-3xl shadow-lg space-y-4">
                <h2 className="text-lg font-extrabold text-slate-900">Không tìm thấy phiên làm bài</h2>
                <p className="text-xs text-slate-600">Vui lòng chọn hoặc nhập mã bài thi để bắt đầu lại.</p>
                <button
                  type="button"
                  onClick={resetToRoleHome}
                  className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold"
                >
                  Quay về trang chủ
                </button>
              </div>
            ))}

          {activeTab === 'review_submission' &&
            (reviewSubmission ? (
              <ExamResultView
                submission={reviewSubmission}
                exam={reviewExamOverride || exams.find((e) => e.id === reviewSubmission.examId)}
                onBackToHome={() => {
                  if (isAuthenticatedSession && userProfile) {
                    clearExamUrlParam();
                    setGuestExamMode(false);
                    setActiveTab(userProfile.role === 'teacher' ? 'exam_manager' : 'student_home');
                  } else {
                    handleExitGuestModeToAuth();
                  }
                }}
              />
            ) : (
              <div className="max-w-xl mx-auto py-12 px-4 text-center bg-white border border-slate-200 rounded-3xl shadow-lg space-y-4">
                <h2 className="text-lg font-extrabold text-slate-900">Chưa có dữ liệu bài làm để xem lại</h2>
                <button
                  type="button"
                  onClick={resetToRoleHome}
                  className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold"
                >
                  Quay về trang chủ
                </button>
              </div>
            ))}

          {/* --- AUTHENTICATED TEACHER VIEWS --- */}
          {isAuthenticatedSession &&
            userProfile?.role === 'teacher' &&
            !['exam_landing', 'take_exam', 'review_submission'].includes(activeTab) && (
              <ProtectedRoute allowedRoles={['teacher']} onBackHome={resetToRoleHome}>
                {activeTab === 'dashboard' && (
                  <TeacherDashboard
                    currentUser={userProfile}
                    questions={questions}
                    exams={exams}
                    submissions={submissions}
                    classesCount={classes.length}
                    isSeedingSamples={isSeedingSamples}
                    onNavigate={(tab) => setActiveTab(tab)}
                    onOpenExamResults={handleOpenExamResults}
                    onTogglePublish={handleToggleExamPublish}
                    onSeedStarterSamples={handleSeedStarterSamples}
                  />
                )}

                {activeTab === 'upload_exam' && (
                  <ExamUploader
                    onSaveToQuestionBank={handleSaveQuestionsToBank}
                    onCreateExamFromParsed={handleCreateExamFromParsed}
                    onFileParsedRecord={handleFileParsedRecord}
                  />
                )}

                {activeTab === 'question_bank' && (
                  <QuestionBank
                    questions={questions}
                    folders={folders}
                    onAddQuestion={handleAddQuestion}
                    onUpdateQuestion={handleUpdateQuestion}
                    onDeleteQuestion={handleDeleteQuestion}
                    onCreateExamFromSelected={handleCreateExamFromSelected}
                  />
                )}

                {activeTab === 'folder_manager' && (
                  <FolderManager
                    folders={folders}
                    questions={questions}
                    exams={exams}
                    onSaveFolders={handleSaveFolders}
                    onNavigateToExam={(id) => handleOpenExamResults(id)}
                  />
                )}

                {activeTab === 'create_exam' && (
                  <ExamCreator
                    initialTitle={creatorInitialTitle}
                    initialQuestions={creatorInitialQuestions}
                    initialGrade={creatorInitialGrade}
                    folders={folders}
                    currentUserId={activeUid}
                    currentUserName={userProfile.name}
                    onSaveExam={handleSaveExam}
                    onCancel={() => setActiveTab('dashboard')}
                  />
                )}

                {activeTab === 'exam_manager' && (
                  <ExamManager
                    exams={exams}
                    submissions={submissions}
                    onCreateNew={() => {
                      setCreatorInitialQuestions([]);
                      setCreatorInitialTitle('Đề thi Hóa học mới');
                      setActiveTab('create_exam');
                    }}
                    onOpenResults={handleOpenExamResults}
                    onTakeExamAsPreview={(ex) => handleStartExam(ex, userProfile.name, 'Giáo viên xem thử', activeUid)}
                    onTogglePublish={handleToggleExamPublish}
                    onDeleteExam={handleDeleteExam}
                  />
                )}

                {activeTab === 'class_manager' && (
                  <ClassManager
                    currentUser={userProfile}
                    classes={classes}
                    enrollments={enrollments}
                    exams={exams}
                    submissions={submissions}
                    onSaveClass={handleSaveClass}
                    onDeleteClass={handleDeleteClass}
                    onRemoveEnrollment={handleRemoveEnrollment}
                  />
                )}

                {activeTab === 'exam_results' && (
                  <ExamResults
                    exam={exams.find((e) => e.id === selectedExamIdForResults) || exams[0]}
                    submissions={submissions.filter(
                      (s) => s.examId === (selectedExamIdForResults || exams[0]?.id)
                    )}
                    onBack={() => setActiveTab('exam_manager')}
                  />
                )}

                {![
                  'dashboard',
                  'upload_exam',
                  'question_bank',
                  'folder_manager',
                  'create_exam',
                  'exam_manager',
                  'class_manager',
                  'exam_results',
                ].includes(activeTab) && (
                  <TeacherDashboard
                    currentUser={userProfile}
                    questions={questions}
                    exams={exams}
                    submissions={submissions}
                    classesCount={classes.length}
                    isSeedingSamples={isSeedingSamples}
                    onNavigate={(tab) => setActiveTab(tab)}
                    onOpenExamResults={handleOpenExamResults}
                    onTogglePublish={handleToggleExamPublish}
                    onSeedStarterSamples={handleSeedStarterSamples}
                  />
                )}
              </ProtectedRoute>
            )}

          {/* --- AUTHENTICATED STUDENT VIEWS --- */}
          {isAuthenticatedSession &&
            userProfile?.role === 'student' &&
            !['exam_landing', 'take_exam', 'review_submission'].includes(activeTab) && (
              <ProtectedRoute allowedRoles={['student']} onBackHome={resetToRoleHome}>
                <StudentHome
                  currentUser={userProfile}
                  exams={exams}
                  submissions={submissions}
                  enrollments={enrollments}
                  assignedExams={assignedExams}
                  onJoinClassByCode={handleJoinClassByCode}
                  onStartExam={handleStartExam}
                  onReviewSubmission={handleReviewSubmission}
                />
              </ProtectedRoute>
            )}

          {/* --- AUTHENTICATED ADMIN VIEW --- */}
          {isAuthenticatedSession &&
            userProfile?.role === 'admin' &&
            !['exam_landing', 'take_exam', 'review_submission'].includes(activeTab) && (
              <ProtectedRoute allowedRoles={['admin']} onBackHome={resetToRoleHome}>
                <AdminDashboard
                  currentUser={userProfile}
                  questions={questions}
                  exams={exams}
                  submissions={submissions}
                  folders={folders}
                  onDataResetOrRestored={reloadDataFromStorage}
                />
              </ProtectedRoute>
            )}
        </ErrorBoundary>
      </main>

      {/* Footer */}
      {activeTab !== 'take_exam' && (
        <footer className="border-t border-slate-200 bg-white py-6 text-xs text-slate-600">
          <div className="max-w-7xl mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="text-center md:text-left space-y-1">
              <p className="font-bold text-slate-800 text-sm">
                {APP_CONFIG.APP_NAME} – {APP_CONFIG.APP_DESCRIPTION}
              </p>
              <p className="text-slate-500 flex flex-wrap items-center justify-center md:justify-start gap-2">
                <span>
                  Tác giả: <strong className="text-slate-700 font-semibold">{APP_CONFIG.APP_AUTHOR}</strong>
                </span>
                <span className="hidden sm:inline">•</span>
                <span>{APP_CONFIG.APP_SCHOOL}</span>
              </p>
            </div>
            <div className="flex items-center gap-3 text-slate-500 text-xs shrink-0">
              <button
                onClick={() => setIsSystemDocsOpen(true)}
                className="hover:text-blue-600 font-medium transition-colors"
              >
                Hồ sơ kiến trúc &amp; Giới thiệu
              </button>
              <span>•</span>
              <span>Phiên bản {APP_CONFIG.APP_VERSION}</span>
              <span>•</span>
              <span>Bộ GD&amp;ĐT</span>
            </div>
          </div>
        </footer>
      )}

      {/* System Technical Architecture & Design Modal */}
      <SystemDesignModal isOpen={isSystemDocsOpen} onClose={() => setIsSystemDocsOpen(false)} />
    </div>
  );
}
