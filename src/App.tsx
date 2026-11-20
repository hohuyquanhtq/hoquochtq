/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

'use client';
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  User,
  UserRole,
  Question,
  Exam,
  Folder,
  SubjectItem,
  StudentSubmission,
  ChemGrade,
  Classroom,
  ClassEnrollment,
  UploadRecord,
  ExamAnswerReviewCheck,
} from './types';
import { StorageService } from './services/storage';
import { Header } from './components/common/Header';
import { WorkspaceSidebar } from './components/common/WorkspaceSidebar';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { SystemDesignModal } from './components/docs/SystemDesignModal';
import { UserGuideView } from './components/docs/UserGuideView';
import { APP_CONFIG } from './constants/brand';
import {
  DEFAULT_SUBJECT_ID,
  DEFAULT_SUBJECT_NAME,
  mergeSubjectsList,
} from './constants/subjects';
import {
  extractExamEntryFromLocation,
  ExamUrlEntry,
  isValidPublicExamCode,
  normalizePublicExamCode,
  normalizeExamCode,
} from './utils/urlHelper';
import {
  syncExamToFirestore,
  deleteExamFromFirestore,
  fetchTeacherSubmissionsFromFirestore,
  subscribeTeacherSubmissions,
  sanitizeExamForStudent,
} from './services/firebase';
import {
  submitAndGradeExamOnServer,
  evaluateLocalAnswerReviewPolicy,
  allocateExamPublicCodeOnServer,
  syncExamLinkStatusOnServer,
} from './services/examSecurityApi';
import {
  fetchTeacherWorkspaceFromFirestore,
  fetchStudentWorkspaceFromFirestore,
  saveQuestionToFirestore,
  saveQuestionsBatchToFirestore,
  deleteQuestionFromFirestore,
  deleteQuestionsBatchFromFirestore,
  saveFolderToFirestore,
  createFolderInFirestore,
  updateFolderInFirestore,
  deleteFolderAndReparentInFirestore,
  moveExamToFolderInFirestore,
  saveSubjectToFirestore,
  saveUploadRecordToFirestore,
  saveClassroomToFirestore,
  deleteClassroomFromFirestore,
  removeStudentEnrollmentFromFirestore,
} from './services/workspaceService';
import { canMoveFolder, normalizeFolderId } from './utils/folderTree';
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
import type { WordBatchSaveResult } from './components/teacher/WordImportReviewModal';
import { buildQuestionDuplicateFingerprint } from './utils/questionDuplicateCheck';
import { ExamCreator } from './components/teacher/ExamCreator';
import { ExamManager } from './components/teacher/ExamManager';
import { ExamResults } from './components/teacher/ExamResults';
import { TeacherSubmissionReviewPage } from './components/teacher/TeacherSubmissionReviewPage';
import { ClassManager } from './components/teacher/ClassManager';
import { SystemSettingsView } from './components/teacher/SystemSettingsView';

// Student Components
import { StudentHome, StudentAssignedExamItem } from './components/student/StudentHome';
import { ExamTaker } from './components/student/ExamTaker';
import { ExamResultView } from './components/student/ExamResultView';
import { ExamJoinLanding, ExamLandingStatus } from './components/student/ExamJoinLanding';

// Admin Components
import { AdminDashboard } from './components/admin/AdminDashboard';
import { CurriculumCatalogManager } from './components/admin/CurriculumCatalogManager';
import { SchoolQuestionBankManager } from './components/admin/SchoolQuestionBankManager';
import { cloneQuestionsForExam } from './components/teacher/QuestionBankPickerModal';

function getDefaultTabForRole(role: UserRole): string {
  if (role === 'student') return 'student_home';
  if (role === 'admin') return 'admin_dashboard';
  return 'dashboard';
}

export default function App() {
  const {
    authState,
    userProfile,
    isAdminClaimVerified,
    postSyncNotice,
    clearPostSyncNotice,
    refreshProfile,
    setLocalUpdatedProfile,
    logout,
  } = useAuth();

  const [initialDirectEntry] = useState<ExamUrlEntry | null>(() => {
    if (typeof window === 'undefined') return null;
    try {
      return extractExamEntryFromLocation(window.location);
    } catch {
      return null;
    }
  });

  // Guest direct-link exam access (/583921, /c/:code, or ?examCode=...)
  const [guestExamMode, setGuestExamMode] = useState<boolean>(() => Boolean(initialDirectEntry));
  const [activeTab, setActiveTab] = useState<string>(() =>
    initialDirectEntry ? 'exam_landing' : 'dashboard'
  );
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isSystemDocsOpen, setIsSystemDocsOpen] = useState(false);
  const [autoOpenShareExamId, setAutoOpenShareExamId] = useState<string | null>(null);
  const backfillingUidRef = useRef<string | null>(null);

  // Scoped Workspace State (Strict UID isolation)
  const [questions, setQuestions] = useState<Question[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [customSubjects, setCustomSubjects] = useState<SubjectItem[]>([]);
  const [submissions, setSubmissions] = useState<StudentSubmission[]>([]);
  const [classes, setClasses] = useState<Classroom[]>([]);
  const [enrollments, setEnrollments] = useState<ClassEnrollment[]>([]);
  const [assignedExams, setAssignedExams] = useState<StudentAssignedExamItem[]>([]);
  const [isLoadingWorkspace, setIsLoadingWorkspace] = useState(false);
  const [isSeedingSamples, setIsSeedingSamples] = useState(false);

  const mergedSubjects = useMemo(() => mergeSubjectsList(customSubjects), [customSubjects]);

  // Interactive flow state
  const [activeExamForTaking, setActiveExamForTaking] = useState<Exam | null>(null);
  const [activeExamOwnerId, setActiveExamOwnerId] = useState<string | undefined>(undefined);
  const [activeStudentName, setActiveStudentName] = useState<string>('');
  const [activeStudentClass, setActiveStudentClass] = useState<string>('');
  const [reviewSubmission, setReviewSubmission] = useState<StudentSubmission | null>(null);
  const [reviewExamOverride, setReviewExamOverride] = useState<Exam | undefined>(undefined);
  const [reviewAnswerCheck, setReviewAnswerCheck] = useState<ExamAnswerReviewCheck | null>(null);
  const [reviewIsTeacherPreview, setReviewIsTeacherPreview] = useState<boolean>(false);
  const [pendingExamEntryAfterAuth, setPendingExamEntryAfterAuth] = useState<ExamUrlEntry | null>(null);
  const [selectedExamIdForResults, setSelectedExamIdForResults] = useState<string | null>(null);
  const [reviewingSubmissionForTeacher, setReviewingSubmissionForTeacher] = useState<StudentSubmission | null>(null);
  const [isRefreshingSubmissions, setIsRefreshingSubmissions] = useState(false);
  const [lastSubmissionsSyncAt, setLastSubmissionsSyncAt] = useState<string | null>(null);
  const [submitSyncError, setSubmitSyncError] = useState<string | null>(null);
  const [isRetryingSubmit, setIsRetryingSubmit] = useState(false);
  const [pendingCloudSubmitPayload, setPendingCloudSubmitPayload] = useState<{
    exam: Exam;
    rawSubmission: StudentSubmission;
    ownerId: string;
  } | null>(null);

  // Preload questions & folder target for ExamCreator + persistent active folder explorer state
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [creatorInitialQuestions, setCreatorInitialQuestions] = useState<Question[]>([]);
  const [creatorInitialTitle, setCreatorInitialTitle] = useState<string>('');
  const [creatorInitialGrade, setCreatorInitialGrade] = useState<ChemGrade>('12');
  const [creatorInitialFolderId, setCreatorInitialFolderId] = useState<string | null>(null);

  // Direct Join via link/QR state
  const [directJoinExam, setDirectJoinExam] = useState<Exam | null>(null);
  const [directJoinOwnerId, setDirectJoinOwnerId] = useState<string | undefined>(undefined);
  const [directJoinCode, setDirectJoinCode] = useState<string>(() =>
    initialDirectEntry
      ? initialDirectEntry.kind === 'examCode'
        ? normalizeExamCode(initialDirectEntry.value)
        : initialDirectEntry.value
      : ''
  );
  const [directJoinEntryKind, setDirectJoinEntryKind] = useState<ExamUrlEntry['kind']>(() =>
    initialDirectEntry ? initialDirectEntry.kind : 'examCode'
  );
  const [directJoinStatus, setDirectJoinStatus] = useState<ExamLandingStatus>(() =>
    initialDirectEntry ? 'loading' : 'found'
  );
  const [directJoinMessage, setDirectJoinMessage] = useState<string | undefined>(undefined);

  const activeUid = userProfile?.uid || userProfile?.id || '';

  const resetWorkspaceMemoryState = useCallback(() => {
    setQuestions([]);
    setExams([]);
    setFolders([]);
    setCustomSubjects([]);
    setSubmissions([]);
    setClasses([]);
    setEnrollments([]);
    setAssignedExams([]);
    setSelectedExamIdForResults(null);
    setReviewingSubmissionForTeacher(null);
    setCurrentFolderId(null);
    setCreatorInitialFolderId(null);
  }, []);

  // Load workspace when authenticated user changes
  const hydrateAuthenticatedWorkspace = useCallback(async (user: User) => {
    const uid = user.uid || user.id;
    if (!uid) return;

    StorageService.setActiveWorkspaceUid(uid);
    setQuestions(StorageService.getQuestions(uid));
    setExams(StorageService.getExams(uid));
    setFolders(StorageService.getFolders(uid));
    setCustomSubjects(StorageService.getSubjects(uid));
    setSubmissions(StorageService.getSubmissions(undefined, uid));

    setIsLoadingWorkspace(true);
    try {
      if (user.role === 'teacher' || user.role === 'admin') {
        const ws = await fetchTeacherWorkspaceFromFirestore(uid);
        setQuestions(ws.questions);
        setFolders(ws.folders);
        setCustomSubjects(ws.subjects || []);
        setExams(ws.exams);
        setSubmissions(ws.submissions);
        setLastSubmissionsSyncAt(new Date().toISOString());
        setClasses(ws.classes);
        setEnrollments(ws.enrollments);

        StorageService.saveQuestions(ws.questions, uid);
        StorageService.saveFolders(ws.folders, uid);
        StorageService.saveSubjects(ws.subjects || [], uid);
        StorageService.saveExams(ws.exams, uid);
        StorageService.saveSubmissions(ws.submissions, uid);

        // One-time background backfill: permanently assign a unique 6-char publicCode to legacy exams
        const missingPublicCodes = ws.exams.filter((ex) => !normalizePublicExamCode(ex.publicCode));
        if (missingPublicCodes.length > 0 && backfillingUidRef.current !== uid) {
          backfillingUidRef.current = uid;
          void (async () => {
            try {
              const allocatedMap = new Map<string, string>();
              for (const legacyExam of missingPublicCodes) {
                const res = await allocateExamPublicCodeOnServer({
                  examId: legacyExam.id,
                  examCode: legacyExam.code,
                  isPublished: legacyExam.isPublished,
                });
                if (res.ok && res.publicCode) {
                  allocatedMap.set(legacyExam.id, res.publicCode);
                }
              }
              if (allocatedMap.size > 0) {
                setExams((prev) => {
                  const next = prev.map((item) => {
                    const assigned = allocatedMap.get(item.id);
                    return assigned && !normalizePublicExamCode(item.publicCode)
                      ? { ...item, publicCode: assigned }
                      : item;
                  });
                  StorageService.saveExams(next, uid);
                  return next;
                });
              }
            } catch (err) {
              console.warn('[HQTest] Backfill publicCode notice:', err);
            } finally {
              if (backfillingUidRef.current === uid) {
                backfillingUidRef.current = null;
              }
            }
          })();
        }
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
      if (pendingExamEntryAfterAuth) return;
      setActiveTab((prev) => {
        if (guestExamMode || prev === 'exam_landing' || prev === 'take_exam' || prev === 'review_submission') {
          return prev;
        }
        return getDefaultTabForRole(userProfile.role);
      });
    } else if (authState === 'unauthenticated' || authState === 'locked' || authState === 'rejected' || authState === 'pending_approval') {
      resetWorkspaceMemoryState();
    }
  }, [authState, userProfile, hydrateAuthenticatedWorkspace, resetWorkspaceMemoryState, guestExamMode, pendingExamEntryAfterAuth]);

  useEffect(() => {
    if (
      authState !== 'authenticated' ||
      !activeUid ||
      (userProfile?.role !== 'teacher' && userProfile?.role !== 'admin')
    ) {
      return;
    }

    const unsubscribe = subscribeTeacherSubmissions(activeUid, (liveSubs) => {
      setSubmissions(liveSubs);
      StorageService.saveSubmissions(liveSubs, activeUid);
      setLastSubmissionsSyncAt(new Date().toISOString());
    });

    return () => {
      unsubscribe();
    };
  }, [authState, activeUid, userProfile?.role]);

  const handleRefreshTeacherSubmissions = useCallback(async () => {
    if (!activeUid) return;
    setIsRefreshingSubmissions(true);
    try {
      const fresh = await fetchTeacherSubmissionsFromFirestore(activeUid);
      setSubmissions(fresh);
      StorageService.saveSubmissions(fresh, activeUid);
      setLastSubmissionsSyncAt(new Date().toISOString());
    } catch (err) {
      console.warn('[HQTest] Không thể làm mới danh sách bài nộp:', err);
    } finally {
      setIsRefreshingSubmissions(false);
    }
  }, [activeUid]);

  const reloadDataFromStorage = useCallback(() => {
    if (!activeUid) return;
    setQuestions(StorageService.getQuestions(activeUid));
    setExams(StorageService.getExams(activeUid));
    setFolders(StorageService.getFolders(activeUid));
    setCustomSubjects(StorageService.getSubjects(activeUid));
    setSubmissions(StorageService.getSubmissions(undefined, activeUid));
  }, [activeUid]);

  const resolveDirectExamByCode = useCallback(
    async (rawValue: string, kind: ExamUrlEntry['kind'] = 'examCode') => {
      const clean =
        kind === 'examCode'
          ? normalizeExamCode(rawValue)
          : kind === 'publicCode'
          ? normalizePublicExamCode(rawValue) || rawValue.trim().toUpperCase()
          : rawValue.trim();
      if (!clean) return;

      if (typeof window !== 'undefined') {
        try {
          if (kind === 'publicCode') {
            const expectedPath = `/${clean}`;
            if (window.location.pathname !== expectedPath || window.location.search) {
              window.history.replaceState({}, '', expectedPath);
            }
          } else if (kind === 'examCode') {
            const expected = `/?examCode=${encodeURIComponent(clean)}`;
            if (window.location.search !== `?examCode=${encodeURIComponent(clean)}`) {
              window.history.replaceState({}, '', expected);
            }
          }
          // For 'invalidPublicUrl', keep the invalid pathname visible as-is
        } catch {
          // Ignore history restrictions
        }
      }

      setGuestExamMode(true);
      setDirectJoinEntryKind(kind);
      setDirectJoinCode(clean);
      setDirectJoinExam(null);
      setDirectJoinOwnerId(undefined);
      setDirectJoinStatus('loading');
      setDirectJoinMessage(undefined);
      setActiveTab('exam_landing');

      try {
        const res = await StorageService.checkExamStatusAsync(clean, kind);
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
    },
    []
  );

  useEffect(() => {
    if (authState === 'authenticated' && userProfile && pendingExamEntryAfterAuth) {
      const entryToResume = pendingExamEntryAfterAuth;
      setPendingExamEntryAfterAuth(null);
      void resolveDirectExamByCode(entryToResume.value, entryToResume.kind);
    }
  }, [authState, userProfile, pendingExamEntryAfterAuth, resolveDirectExamByCode]);

  const resolveDirectExamFromUrl = useCallback(async () => {
    if (typeof window === 'undefined') return;
    const entry = extractExamEntryFromLocation(window.location);
    if (!entry) return;
    await resolveDirectExamByCode(entry.value, entry.kind);
  }, [resolveDirectExamByCode]);

  // URL Routing, QR Scan Detection & Cross-Tab Storage Sync
  useEffect(() => {
    const handleStorageUpdate = () => {
      reloadDataFromStorage();
    };
    const handleRouteChange = () => {
      const entry = extractExamEntryFromLocation(window.location);
      if (entry) {
        void resolveDirectExamFromUrl();
      } else {
        setDirectJoinExam(null);
        setDirectJoinCode('');
        setDirectJoinEntryKind('examCode');
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
      subjectId: q.subjectId || DEFAULT_SUBJECT_ID,
      subjectName: q.subjectName || DEFAULT_SUBJECT_NAME,
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

  const handleImportWordQuestionsToBank = async (
    incomingQuestions: Question[]
  ): Promise<WordBatchSaveResult> => {
    if (!activeUid) {
      return {
        savedCount: 0,
        skippedDuplicateCount: 0,
        firestoreSynced: false,
        error: 'Phiên đăng nhập chưa sẵn sàng. Vui lòng đăng nhập lại trước khi lưu.',
      };
    }

    const latestExisting = StorageService.getQuestions(activeUid);
    const existingFingerprints = new Set<string>();
    [...latestExisting, ...questions].forEach((existingQ) => {
      const fp = buildQuestionDuplicateFingerprint(existingQ);
      if (fp) existingFingerprints.add(fp);
    });

    const nowIso = new Date().toISOString();
    const uniqueScoped: Question[] = [];
    let skippedDuplicateCount = 0;

    incomingQuestions.forEach((q, idx) => {
      const fp = buildQuestionDuplicateFingerprint(q);
      if (fp && existingFingerprints.has(fp)) {
        skippedDuplicateCount++;
        return;
      }
      if (fp) existingFingerprints.add(fp);

      uniqueScoped.push({
        ...q,
        id: q.id || `q_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 6)}`,
        subjectId: q.subjectId || DEFAULT_SUBJECT_ID,
        subjectName: q.subjectName || DEFAULT_SUBJECT_NAME,
        ownerId: activeUid,
        authorId: activeUid,
        createdAt: q.createdAt || nowIso,
        updatedAt: nowIso,
      });
    });

    if (uniqueScoped.length === 0) {
      return {
        savedCount: 0,
        skippedDuplicateCount,
        firestoreSynced: false,
        error: 'Tất cả các câu hỏi được chọn đều đã tồn tại trong Ngân hàng câu hỏi.',
      };
    }

    try {
      await saveQuestionsBatchToFirestore(uniqueScoped, activeUid);
      uniqueScoped.forEach((q) => StorageService.addQuestion(q, activeUid));
      setQuestions(StorageService.getQuestions(activeUid));
      return {
        savedCount: uniqueScoped.length,
        skippedDuplicateCount,
        firestoreSynced: true,
      };
    } catch (err) {
      console.error('[HQTest] Failed to save imported Word questions to Firestore:', err);
      let friendlyMsg = 'Không thể lưu câu hỏi lên Firestore. Vui lòng kiểm tra kết nối mạng hoặc quyền truy cập.';
      if (err instanceof Error && err.message) {
        try {
          const parsed = JSON.parse(err.message) as { error?: string };
          friendlyMsg = parsed.error || err.message;
        } catch {
          friendlyMsg = err.message;
        }
      }
      return {
        savedCount: 0,
        skippedDuplicateCount,
        firestoreSynced: false,
        error: friendlyMsg,
      };
    }
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
    setCreatorInitialFolderId(currentFolderId);
    setActiveTab('create_exam');
  };

  const handleCreateExamFromSelected = (selectedQuestions: Question[]) => {
    const distinctSubjects = Array.from(
      new Set(
        selectedQuestions
          .map((q) => q.subjectName?.trim() || DEFAULT_SUBJECT_NAME)
          .filter(Boolean)
      )
    );
    const subjectLabel = distinctSubjects.length === 1 ? ` ${distinctSubjects[0]}` : '';
    setCreatorInitialTitle(`Đề thi chọn lọc${subjectLabel} (${selectedQuestions.length} câu)`);
    setCreatorInitialQuestions(selectedQuestions);
    setCreatorInitialFolderId(currentFolderId);
    setActiveTab('create_exam');
  };

  const handleSaveExam = (newExam: Exam) => {
    if (!activeUid) return;
    const resolvedFolderId = normalizeFolderId(newExam.folderId);
    const scopedExam: Exam = {
      ...newExam,
      id: newExam.id,
      examId: newExam.examId || newExam.id,
      folderId: resolvedFolderId,
      ownerId: activeUid,
      authorId: activeUid,
      createdBy: newExam.createdBy || activeUid,
      updatedBy: activeUid,
      authorName: userProfile?.name || newExam.authorName || APP_CONFIG.APP_AUTHOR,
    };
    StorageService.addExam(scopedExam, activeUid);
    setExams(StorageService.getExams(activeUid));
    // Preserve & activate the exact folder where the exam was saved so user lands directly in that subfolder
    setCurrentFolderId(resolvedFolderId);
    setCreatorInitialFolderId(resolvedFolderId);
    setCreatorInitialQuestions([]);
    setAutoOpenShareExamId(scopedExam.id);
    setActiveTab('exam_manager');
  };

  const handleExamUpdated = (updatedExam: Exam) => {
    if (!activeUid) return;
    const scopedExam: Exam = {
      ...updatedExam,
      examId: updatedExam.examId || updatedExam.id,
      folderId: normalizeFolderId(updatedExam.folderId),
      ownerId: updatedExam.ownerId || activeUid,
    };
    StorageService.addExam(scopedExam, activeUid);
    setExams(StorageService.getExams(activeUid));
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
      void syncExamLinkStatusOnServer({
        action: 'set_active',
        examId: toggled.id,
        examCode: toggled.code,
        publicCode: toggled.publicCode,
        isActive: toggled.isPublished,
      }).catch((err) => {
        console.warn('Could not sync examLinks active status:', err);
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
      void syncExamLinkStatusOnServer({
        action: 'delete',
        examId: target.id,
        examCode: target.code,
        publicCode: target.publicCode,
      }).catch((err) => {
        console.warn('Could not sync examLinks deletion:', err);
      });
    }
  };

  const handleAddSubject = (subject: SubjectItem) => {
    if (!activeUid) return;
    const scoped: SubjectItem = {
      ...subject,
      ownerId: activeUid,
      authorId: activeUid,
    };
    setCustomSubjects((prev) => {
      const exists = prev.some(
        (s) => s.id === scoped.id || s.name.trim().toLowerCase() === scoped.name.trim().toLowerCase()
      );
      const next = exists
        ? prev.map((s) => (s.id === scoped.id ? scoped : s))
        : [...prev, scoped];
      StorageService.saveSubjects(next, activeUid);
      return next;
    });
    void saveSubjectToFirestore(scoped, activeUid).catch((err) => {
      console.warn('[HQTest] Could not save subject to Firestore:', err);
    });
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

  const handleBulkDeleteQuestions = (ids: string[]) => {
    if (!activeUid || ids.length === 0) return;
    const removeSet = new Set(ids);
    const remaining = questions.filter((q) => !removeSet.has(q.id));
    StorageService.saveQuestions(remaining, activeUid);
    setQuestions(remaining);
    void deleteQuestionsBatchFromFirestore(ids).catch((err) => {
      console.warn('[HQTest] Could not bulk delete questions from Firestore:', err);
    });
  };

  const handleCreateFolder = async (input: {
    name: string;
    parentId: string | null;
    description?: string;
  }) => {
    if (!activeUid) {
      throw new Error('Bạn cần đăng nhập để tạo thư mục.');
    }
    const created = await createFolderInFirestore(input, activeUid);
    setFolders((prev) => {
      const next = [...prev, created];
      StorageService.saveFolders(next, activeUid);
      return next;
    });
  };

  const handleRenameFolder = async (
    folder: Folder,
    updates: { name: string; description?: string }
  ) => {
    if (!activeUid) {
      throw new Error('Bạn cần đăng nhập để cập nhật thư mục.');
    }
    const updated = await updateFolderInFirestore(
      {
        ...folder,
        name: updates.name,
        description: updates.description,
      },
      activeUid
    );
    setFolders((prev) => {
      const next = prev.map((f) => (f.id === updated.id ? updated : f));
      StorageService.saveFolders(next, activeUid);
      return next;
    });
  };

  const handleMoveFolder = async (folder: Folder, targetParentId: string | null) => {
    if (!activeUid) {
      throw new Error('Bạn cần đăng nhập để di chuyển thư mục.');
    }
    const cleanTarget = normalizeFolderId(targetParentId);
    if (!canMoveFolder(folder.id, cleanTarget, folders)) {
      throw new Error('Không thể di chuyển thư mục vào chính nó hoặc thư mục con của nó.');
    }
    const updated = await updateFolderInFirestore(
      {
        ...folder,
        parentId: cleanTarget,
      },
      activeUid
    );
    setFolders((prev) => {
      const next = prev.map((f) => (f.id === updated.id ? updated : f));
      StorageService.saveFolders(next, activeUid);
      return next;
    });
  };

  const handleDeleteFolder = async (folder: Folder) => {
    if (!activeUid) {
      throw new Error('Bạn cần đăng nhập để xóa thư mục.');
    }
    const parentOfDeleted = normalizeFolderId(folder.parentId);
    const { folders: nextFolders, exams: nextExams } = await deleteFolderAndReparentInFirestore(
      folder,
      folders,
      exams,
      activeUid
    );
    StorageService.saveFolders(nextFolders, activeUid);
    StorageService.saveExams(nextExams, activeUid);
    setFolders(nextFolders);
    setExams(nextExams);
    if (currentFolderId === folder.id) {
      setCurrentFolderId(parentOfDeleted);
    }
  };

  const handleMoveExam = async (
    exam: Exam,
    targetFolderId: string | null,
    updates?: { title?: string; description?: string }
  ) => {
    if (!activeUid) {
      throw new Error('Bạn cần đăng nhập để di chuyển đề thi.');
    }
    const updatedExam = await moveExamToFolderInFirestore(
      exam,
      targetFolderId,
      activeUid,
      updates
    );
    StorageService.addExam(updatedExam, activeUid);
    setExams(StorageService.getExams(activeUid));
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
    void handleRefreshTeacherSubmissions();
  };

  // --- Handlers for Student & Exam Taking Actions ---
  const handleStartExam = (exam: Exam, name: string, cls: string, ownerId?: string) => {
    setActiveExamForTaking(sanitizeExamForStudent(exam));
    setActiveExamOwnerId(ownerId || exam.ownerId);
    setActiveStudentName(name);
    setActiveStudentClass(cls);
    setSubmitSyncError(null);
    setPendingCloudSubmitPayload(null);

    if (typeof window !== 'undefined') {
      try {
        const currentEntry = extractExamEntryFromLocation(window.location);
        const normalizedPubCode = normalizePublicExamCode(exam.publicCode);
        if (normalizedPubCode) {
          const shortPath = `/${normalizedPubCode}`;
          if (window.location.pathname !== shortPath || window.location.search) {
            window.history.replaceState({}, '', shortPath);
          }
        } else if (currentEntry?.kind === 'publicCode') {
          const shortPath = `/${normalizePublicExamCode(currentEntry.value) || currentEntry.value}`;
          if (window.location.pathname !== shortPath || window.location.search) {
            window.history.replaceState({}, '', shortPath);
          }
        } else if (exam.code) {
          const normalized = normalizeExamCode(exam.code);
          const nextUrl = `/?examCode=${encodeURIComponent(normalized)}`;
          window.history.replaceState({}, '', nextUrl);
        }
      } catch {
        // Ignore history restriction
      }
    }
    setActiveTab('take_exam');
  };

  const handleFinishExam = async (rawSubmission: StudentSubmission) => {
    setSubmitSyncError(null);
    setPendingCloudSubmitPayload(null);

    let finalSubmission: StudentSubmission = {
      ...rawSubmission,
      studentId: activeUid || rawSubmission.studentId || 'guest_student',
      ownerId: activeExamOwnerId || rawSubmission.ownerId,
    };
    let examForReview: Exam | undefined = activeExamForTaking
      ? sanitizeExamForStudent(activeExamForTaking)
      : undefined;
    let nextReviewCheck: ExamAnswerReviewCheck | null = null;
    let nextIsTeacherPreview = false;
    let cloudSubmitFailed = false;

    if (activeExamForTaking) {
      const teacherMaster =
        userProfile?.role === 'teacher'
          ? exams.find((e) => e.id === activeExamForTaking.id)
          : undefined;
      const resolvedOwnerId = activeExamOwnerId || activeExamForTaking.ownerId;

      if (teacherMaster) {
        // Teacher previewing their own exam in-browser
        nextIsTeacherPreview = true;
        const graded = gradeSubmission(
          teacherMaster,
          finalSubmission.studentId,
          rawSubmission.studentName,
          rawSubmission.studentClass,
          rawSubmission.startedAt,
          rawSubmission.answers,
          rawSubmission.tabSwitchesCount || 0,
          rawSubmission.attemptId
        );
        finalSubmission = {
          ...graded,
          id: rawSubmission.id,
          ownerId: resolvedOwnerId || activeUid,
          durationSeconds: rawSubmission.durationSeconds,
          submittedAt: rawSubmission.submittedAt,
          status: rawSubmission.status,
        };
        examForReview = teacherMaster;
        nextReviewCheck = {
          allowed: true,
          reason: 'allowed',
          score: finalSubmission.totalScore,
          minScore: 0,
        };
      } else if (resolvedOwnerId) {
        // Cloud exam: server-authoritative grading & floor-score verification
        const serverRes = await submitAndGradeExamOnServer({
          submissionId: rawSubmission.id,
          attemptId: rawSubmission.attemptId,
          examCode: activeExamForTaking.code,
          publicCode: normalizePublicExamCode(activeExamForTaking.publicCode) || undefined,
          examTitle: activeExamForTaking.title,
          studentName: rawSubmission.studentName,
          studentClass: rawSubmission.studentClass,
          startedAt: rawSubmission.startedAt,
          durationSeconds: rawSubmission.durationSeconds,
          answers: rawSubmission.answers,
          tabSwitchesCount: rawSubmission.tabSwitchesCount || 0,
          status: rawSubmission.status === 'timed_out' ? 'timed_out' : 'completed',
        });

        if (serverRes.ok && serverRes.submission) {
          finalSubmission = serverRes.submission;
          nextReviewCheck = serverRes.answerReviewCheck || null;
          examForReview = sanitizeExamForStudent(activeExamForTaking);
        } else {
          // Never fabricate a 0-score submission on Firestore; keep student's attempt intact and allow retry
          cloudSubmitFailed = true;
          const errMessage =
            serverRes.error ||
            'Không thể kết nối máy chủ chấm điểm để ghi nhận bài làm. Vui lòng thử nộp lại.';
          setSubmitSyncError(errMessage);
          setPendingCloudSubmitPayload({
            exam: activeExamForTaking,
            rawSubmission,
            ownerId: resolvedOwnerId,
          });
          nextReviewCheck = {
            allowed: false,
            reason: 'server_unavailable',
            score: finalSubmission.totalScore,
            minScore: activeExamForTaking.answerReviewMinScore ?? 8.0,
            message: errMessage,
          };
        }
      } else {
        // Built-in local sample/demo exam (no remote owner)
        const localMaster = StorageService.getExamByCode(
          activeExamForTaking.code,
          activeUid || undefined
        );
        if (localMaster) {
          const graded = gradeSubmission(
            localMaster,
            finalSubmission.studentId,
            rawSubmission.studentName,
            rawSubmission.studentClass,
            rawSubmission.startedAt,
            rawSubmission.answers,
            rawSubmission.tabSwitchesCount || 0,
            rawSubmission.attemptId
          );
          finalSubmission = {
            ...graded,
            id: rawSubmission.id,
            durationSeconds: rawSubmission.durationSeconds,
            submittedAt: rawSubmission.submittedAt,
            status: rawSubmission.status,
          };
          const policyCheck = evaluateLocalAnswerReviewPolicy(
            localMaster,
            finalSubmission.totalScore
          );
          nextReviewCheck = policyCheck;
          examForReview = policyCheck.allowed
            ? localMaster
            : sanitizeExamForStudent(localMaster);
        }
      }
    }

    if (activeUid && !cloudSubmitFailed) {
      StorageService.addSubmission(finalSubmission, activeUid);
      setSubmissions(StorageService.getSubmissions(undefined, activeUid));
    }
    setReviewIsTeacherPreview(nextIsTeacherPreview);
    setReviewAnswerCheck(nextReviewCheck);
    setReviewExamOverride(examForReview);
    setReviewSubmission(finalSubmission);
    setActiveTab('review_submission');
  };

  const handleRetryCloudSubmission = async () => {
    if (!pendingCloudSubmitPayload || isRetryingSubmit) return;
    setIsRetryingSubmit(true);
    try {
      const { exam, rawSubmission } = pendingCloudSubmitPayload;
      const serverRes = await submitAndGradeExamOnServer({
        submissionId: rawSubmission.id,
        attemptId: rawSubmission.attemptId,
        examCode: exam.code,
        publicCode: normalizePublicExamCode(exam.publicCode) || undefined,
        examTitle: exam.title,
        studentName: rawSubmission.studentName,
        studentClass: rawSubmission.studentClass,
        startedAt: rawSubmission.startedAt,
        durationSeconds: rawSubmission.durationSeconds,
        answers: rawSubmission.answers,
        tabSwitchesCount: rawSubmission.tabSwitchesCount || 0,
        status: rawSubmission.status === 'timed_out' ? 'timed_out' : 'completed',
      });

      if (serverRes.ok && serverRes.submission) {
        setSubmitSyncError(null);
        setPendingCloudSubmitPayload(null);
        setReviewSubmission(serverRes.submission);
        setReviewAnswerCheck(serverRes.answerReviewCheck || null);
        setReviewExamOverride(sanitizeExamForStudent(exam));
        if (activeUid) {
          StorageService.addSubmission(serverRes.submission, activeUid);
          setSubmissions(StorageService.getSubmissions(undefined, activeUid));
        }
      } else {
        setSubmitSyncError(
          serverRes.error || 'Vẫn chưa thể gửi bài làm lên máy chủ. Vui lòng kiểm tra mạng và thử lại.'
        );
      }
    } finally {
      setIsRetryingSubmit(false);
    }
  };

  const handleReviewSubmission = (sub: StudentSubmission) => {
    const teacherOwnedExam =
      userProfile?.role === 'teacher'
        ? exams.find((e) => e.id === sub.examId)
        : undefined;
    const matchingAssigned = assignedExams.find(
      (a) =>
        a.exam.id === sub.examId ||
        normalizeExamCode(a.exam.code) === normalizeExamCode(sub.examCode)
    )?.exam;
    const localBuiltIn = StorageService.getBuiltInPublicExams().find(
      (e) =>
        e.id === sub.examId ||
        normalizeExamCode(e.code) === normalizeExamCode(sub.examCode)
    );
    const isTeacherOwn = Boolean(teacherOwnedExam);
    const baseExam = teacherOwnedExam || matchingAssigned || localBuiltIn;

    setReviewIsTeacherPreview(isTeacherOwn);
    setReviewAnswerCheck(
      !isTeacherOwn && localBuiltIn && !localBuiltIn.ownerId
        ? evaluateLocalAnswerReviewPolicy(localBuiltIn, sub.totalScore)
        : null
    );
    setReviewExamOverride(
      baseExam ? (isTeacherOwn ? baseExam : sanitizeExamForStudent(baseExam)) : undefined
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
            void resolveDirectExamByCode(
              code,
              isValidPublicExamCode(code) ? 'publicCode' : 'examCode'
            );
          }}
        />
      </ErrorBoundary>
    );
  }

  const isWorkspaceShell =
    isAuthenticatedSession &&
    (userProfile?.role === 'teacher' || userProfile?.role === 'admin') &&
    !['exam_landing', 'take_exam', 'review_submission'].includes(activeTab);

  const renderWorkspaceSubNav = () => {
    if (['upload_exam', 'create_exam'].includes(activeTab)) {
      return (
        <div className="mb-5 flex flex-wrap items-center gap-2 bg-white border border-slate-200 rounded-2xl p-2 shadow-2xs">
          <button
            type="button"
            onClick={() => setActiveTab('upload_exam')}
            className={`px-4 py-2 min-h-[40px] rounded-xl text-sm font-semibold transition-colors ${
              activeTab === 'upload_exam'
                ? 'bg-teal-600 text-white shadow-xs'
                : 'text-slate-700 hover:bg-slate-100'
            }`}
          >
            Tải file Word / PDF tự động
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('create_exam')}
            className={`px-4 py-2 min-h-[40px] rounded-xl text-sm font-semibold transition-colors ${
              activeTab === 'create_exam'
                ? 'bg-teal-600 text-white shadow-xs'
                : 'text-slate-700 hover:bg-slate-100'
            }`}
          >
            Soạn đề &amp; Ma trận đề thi
          </button>
        </div>
      );
    }

    if (['exam_manager', 'folder_manager'].includes(activeTab)) {
      return (
        <div className="mb-5 flex flex-wrap items-center gap-2 bg-white border border-slate-200 rounded-2xl p-2 shadow-2xs">
          <button
            type="button"
            onClick={() => setActiveTab('exam_manager')}
            className="px-4 py-2 min-h-[40px] rounded-xl text-sm font-semibold transition-colors bg-teal-600 text-white shadow-xs"
          >
            Đề thi &amp; Cây thư mục ({exams.length} đề · {folders.length} thư mục)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('question_bank')}
            className="px-4 py-2 min-h-[40px] rounded-xl text-sm font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
          >
            Ngân hàng câu hỏi ({questions.length})
          </button>
        </div>
      );
    }

    return null;
  };

  const renderMainViewportContent = () => (
    <ErrorBoundary fallbackTitle="Không thể hiển thị nội dung" onResetToHome={resetToRoleHome}>
      {postSyncNotice && isAuthenticatedSession && (
        <div className="mb-4 px-4 py-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center justify-between gap-2">
          <span>{postSyncNotice}</span>
          <button
            type="button"
            onClick={clearPostSyncNotice}
            className="text-emerald-700 hover:text-emerald-950 font-bold text-[11px]"
          >
            Đóng
          </button>
        </div>
      )}

      {isLoadingWorkspace && isAuthenticatedSession && activeTab !== 'take_exam' && activeTab !== 'exam_landing' && (
        <div className="mb-4 px-4 py-2 rounded-xl bg-teal-50 border border-teal-200 text-teal-800 text-xs font-semibold flex items-center gap-2">
          <div className="w-3.5 h-3.5 border-2 border-teal-600 border-t-transparent rounded-full animate-spin" />
          <span>Đang đồng bộ không gian dữ liệu riêng từ Cloud Firestore...</span>
        </div>
      )}

      {/* --- DIRECT EXAM JOIN LANDING (Guests & Students) --- */}
      {activeTab === 'exam_landing' && (
        <ExamJoinLanding
          exam={directJoinExam}
          examCode={directJoinCode}
          entryKind={directJoinEntryKind}
          status={directJoinStatus}
          statusMessage={directJoinMessage}
          currentUser={userProfile}
          onStartExam={(ex, name, cls) => {
            handleStartExam(ex, name, cls, directJoinOwnerId);
          }}
          onPasswordVerified={(unlockedExam) => {
            setDirectJoinExam(unlockedExam);
            setDirectJoinStatus('found');
            setDirectJoinMessage(undefined);
          }}
          onRequestLoginForProtectedExam={() => {
            const entry = extractExamEntryFromLocation(window.location);
            if (entry && entry.kind !== 'invalidPublicUrl') {
              setPendingExamEntryAfterAuth(entry);
            } else if (directJoinCode) {
              setPendingExamEntryAfterAuth({
                value: directJoinCode,
                kind: directJoinEntryKind,
              });
            }
            setGuestExamMode(false);
            setActiveTab('dashboard');
          }}
          onRetryLookup={() => void resolveDirectExamByCode(directJoinCode, directJoinEntryKind)}
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
                setActiveTab(
                  userProfile.role === 'teacher' || userProfile.role === 'admin'
                    ? 'exam_manager'
                    : 'student_home'
                );
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
              className="px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold"
            >
              Quay về trang chủ
            </button>
          </div>
        ))}

      {activeTab === 'review_submission' &&
        (reviewSubmission ? (
          <ExamResultView
            submission={reviewSubmission}
            exam={reviewExamOverride}
            answerReviewCheck={reviewAnswerCheck}
            submitSyncError={submitSyncError}
            isRetryingSubmit={isRetryingSubmit}
            onRetrySubmit={pendingCloudSubmitPayload ? () => void handleRetryCloudSubmission() : undefined}
            isTeacherPreview={reviewIsTeacherPreview}
            onUnlockAnswers={(hydrated) => setReviewExamOverride(hydrated)}
            onBackToHome={() => {
              if (isAuthenticatedSession && userProfile) {
                clearExamUrlParam();
                setGuestExamMode(false);
                setActiveTab(
                  userProfile.role === 'teacher' || userProfile.role === 'admin'
                    ? 'exam_manager'
                    : 'student_home'
                );
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
              className="px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold"
            >
              Quay về trang chủ
            </button>
          </div>
        ))}

      {/* --- AUTHENTICATED TEACHER & ADMIN WORKSPACE VIEWS --- */}
      {isAuthenticatedSession &&
        (userProfile?.role === 'teacher' || userProfile?.role === 'admin') &&
        !['exam_landing', 'take_exam', 'review_submission'].includes(activeTab) && (
          <ProtectedRoute allowedRoles={['teacher', 'admin']} onBackHome={resetToRoleHome}>
            {renderWorkspaceSubNav()}

            {userProfile.role === 'admin' &&
              (activeTab === 'admin_dashboard' ||
                activeTab === 'admin_users' ||
                activeTab === 'admin_curriculum' ||
                activeTab === 'admin_school_bank') && (
              isAdminClaimVerified ? (
                activeTab === 'admin_curriculum' ? (
                  <CurriculumCatalogManager
                    currentUser={userProfile}
                    subjects={mergedSubjects}
                  />
                ) : activeTab === 'admin_school_bank' ? (
                  <SchoolQuestionBankManager
                    currentUser={userProfile}
                    subjects={mergedSubjects}
                    onCreateExamFromQuestions={(pickedItems, suggestedTitle) => {
                      const examQuestions = cloneQuestionsForExam(pickedItems, 'school_bank');
                      setCreatorInitialQuestions(examQuestions);
                      setCreatorInitialTitle(
                        suggestedTitle || `Đề kiểm tra tổng hợp (${examQuestions.length} câu)`
                      );
                      setCreatorInitialGrade(examQuestions[0]?.grade || '12');
                      setCreatorInitialFolderId(null);
                      setActiveTab('create_exam');
                    }}
                    onPersonalBankUpdated={reloadDataFromStorage}
                  />
                ) : (
                  <AdminDashboard
                    currentUser={userProfile}
                    questions={questions}
                    exams={exams}
                    submissions={submissions}
                    folders={folders}
                    sectionFocus={activeTab === 'admin_users' ? 'users' : 'overview'}
                    onNavigate={(tab) => setActiveTab(tab)}
                    onDataResetOrRestored={reloadDataFromStorage}
                  />
                )
              ) : (
                <div className="max-w-lg mx-auto my-10 bg-white border border-rose-200 rounded-3xl p-7 shadow-sm text-center space-y-4">
                  <h2 className="text-base font-extrabold text-slate-900">
                    Chưa xác thực quyền Quản trị viên (token.claims.admin != true)
                  </h2>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Phiên Firebase Authentication của bạn được giữ nguyên, nhưng ID Token hiện tại chưa có Custom Claim <code className="font-mono">admin: true</code>. Vui lòng kiểm tra cấu hình <code className="font-mono">INITIAL_ADMIN_UID</code>, <code className="font-mono">FIREBASE_SERVICE_ACCOUNT</code> và document <code className="font-mono">admins/{activeUid}</code> (<code className="font-mono">isActive: true</code>).
                  </p>
                  <button
                    type="button"
                    onClick={() => void refreshProfile()}
                    className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold"
                  >
                    Làm mới ID Token &amp; Kiểm tra lại
                  </button>
                </div>
              )
            )}

            {activeTab === 'dashboard' && (
              <TeacherDashboard
                currentUser={userProfile}
                questions={questions}
                exams={exams}
                submissions={submissions}
                enrollments={enrollments}
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
                subjects={mergedSubjects}
                currentUserId={activeUid}
                onAddSubject={handleAddSubject}
                onAddQuestion={handleAddQuestion}
                onUpdateQuestion={handleUpdateQuestion}
                onDeleteQuestion={handleDeleteQuestion}
                onBulkDeleteQuestions={handleBulkDeleteQuestions}
                onImportQuestionsBatch={handleImportWordQuestionsToBank}
                onFileParsedRecord={handleFileParsedRecord}
                onCreateExamFromSelected={handleCreateExamFromSelected}
              />
            )}

            {activeTab === 'create_exam' && (
              <ExamCreator
                key={`${creatorInitialFolderId || 'root'}_${creatorInitialQuestions.length}_${creatorInitialTitle}`}
                initialTitle={creatorInitialTitle || 'Đề kiểm tra mới'}
                initialQuestions={creatorInitialQuestions}
                initialGrade={creatorInitialGrade}
                initialFolderId={creatorInitialFolderId}
                folders={folders}
                bankQuestions={questions}
                subjects={mergedSubjects}
                currentUserId={activeUid}
                currentUserName={userProfile.name}
                isAdmin={userProfile.role === 'admin'}
                onSaveExam={handleSaveExam}
                onCancel={() => setActiveTab('exam_manager')}
              />
            )}

            {(activeTab === 'exam_manager' || activeTab === 'folder_manager' || activeTab === 'online_exams') && (
              <ExamManager
                exams={exams}
                folders={folders}
                submissions={submissions}
                currentUserId={activeUid}
                userRole={userProfile.role === 'admin' ? 'admin' : 'teacher'}
                mode={activeTab === 'online_exams' ? 'online' : 'all'}
                activeFolderId={currentFolderId}
                onActiveFolderChange={setCurrentFolderId}
                autoOpenShareExamId={autoOpenShareExamId}
                onClearAutoOpenShare={() => setAutoOpenShareExamId(null)}
                onCreateNew={(folderId) => {
                  const targetFolder = normalizeFolderId(folderId);
                  setCurrentFolderId(targetFolder);
                  setCreatorInitialQuestions([]);
                  setCreatorInitialTitle('Đề kiểm tra mới');
                  setCreatorInitialFolderId(targetFolder);
                  setActiveTab('create_exam');
                }}
                onOpenResults={handleOpenExamResults}
                onTakeExamAsPreview={(ex) => handleStartExam(ex, userProfile.name, 'Giáo viên xem thử', activeUid)}
                onTogglePublish={handleToggleExamPublish}
                onExamUpdated={handleExamUpdated}
                onCreateFolder={handleCreateFolder}
                onRenameFolder={handleRenameFolder}
                onMoveFolder={handleMoveFolder}
                onDeleteFolder={handleDeleteFolder}
                onMoveExam={handleMoveExam}
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

            {activeTab === 'exam_results' && (() => {
              const targetExam = exams.find((e) => e.id === selectedExamIdForResults) || exams[0];
              const cleanTargetCode = targetExam ? normalizeExamCode(targetExam.code) : '';
              const examSubs = targetExam
                ? submissions.filter(
                    (s) =>
                      s.examId === targetExam.id ||
                      (cleanTargetCode &&
                        normalizeExamCode(s.examCode) === cleanTargetCode &&
                        (!s.ownerId || !targetExam.ownerId || s.ownerId === targetExam.ownerId))
                  )
                : [];
              return (
                <ExamResults
                  exam={targetExam}
                  exams={exams}
                  submissions={examSubs}
                  currentUserId={activeUid}
                  isAdmin={userProfile.role === 'admin'}
                  onSelectExam={(examId) => setSelectedExamIdForResults(examId)}
                  onInspectSubmission={(sub) => {
                    setReviewingSubmissionForTeacher(sub);
                    if (sub.examId) {
                      setSelectedExamIdForResults(sub.examId);
                    }
                    setActiveTab('teacher_submission_review');
                  }}
                  onBack={() => setActiveTab('exam_manager')}
                  onShareExam={(ex) => {
                    setAutoOpenShareExamId(ex.id);
                    setActiveTab('exam_manager');
                  }}
                  onRefresh={handleRefreshTeacherSubmissions}
                  isRefreshing={isRefreshingSubmissions}
                  lastSyncedAt={lastSubmissionsSyncAt}
                />
              );
            })()}

            {activeTab === 'teacher_submission_review' && (() => {
              if (!reviewingSubmissionForTeacher) {
                return (
                  <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center space-y-4 shadow-xs">
                    <h2 className="text-lg font-bold text-slate-900">
                      Chưa chọn bài làm học sinh để xem chi tiết
                    </h2>
                    <button
                      type="button"
                      onClick={() => setActiveTab('exam_results')}
                      className="px-4 py-2.5 min-h-[44px] rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold"
                    >
                      Quay lại danh sách kết quả
                    </button>
                  </div>
                );
              }

              const targetSub = reviewingSubmissionForTeacher;
              const cleanSubCode = normalizeExamCode(targetSub.examCode);
              const matchedExam =
                exams.find((e) => e.id === targetSub.examId) ||
                exams.find((e) => cleanSubCode && normalizeExamCode(e.code) === cleanSubCode) ||
                exams.find((e) => e.id === selectedExamIdForResults);

              return (
                <TeacherSubmissionReviewPage
                  submission={targetSub}
                  exam={matchedExam}
                  currentUserId={activeUid}
                  isAdmin={userProfile.role === 'admin'}
                  onBackToStudentList={() => {
                    setReviewingSubmissionForTeacher(null);
                    setActiveTab('exam_results');
                  }}
                />
              );
            })()}

            {activeTab === 'user_guide' && (
              <UserGuideView
                onNavigate={(tab) => setActiveTab(tab)}
                onOpenSystemDocs={() => setIsSystemDocsOpen(true)}
              />
            )}

            {activeTab === 'system_settings' && (
              <SystemSettingsView
                currentUser={userProfile}
                onProfileUpdated={(updated) => setLocalUpdatedProfile(updated)}
                onOpenSystemDocs={() => setIsSystemDocsOpen(true)}
                onOpenAdminLegacy={
                  userProfile.role === 'admin' ? () => setActiveTab('admin_dashboard') : undefined
                }
              />
            )}

            {![
              'dashboard',
              'admin_dashboard',
              'admin_users',
              'admin_curriculum',
              'admin_school_bank',
              'upload_exam',
              'question_bank',
              'folder_manager',
              'create_exam',
              'exam_manager',
              'online_exams',
              'class_manager',
              'exam_results',
              'teacher_submission_review',
              'user_guide',
              'system_settings',
            ].includes(activeTab) && (
              userProfile.role === 'admin' ? (
                <AdminDashboard
                  currentUser={userProfile}
                  questions={questions}
                  exams={exams}
                  submissions={submissions}
                  folders={folders}
                  onDataResetOrRestored={reloadDataFromStorage}
                />
              ) : (
                <TeacherDashboard
                  currentUser={userProfile}
                  questions={questions}
                  exams={exams}
                  submissions={submissions}
                  enrollments={enrollments}
                  classesCount={classes.length}
                  isSeedingSamples={isSeedingSamples}
                  onNavigate={(tab) => setActiveTab(tab)}
                  onOpenExamResults={handleOpenExamResults}
                  onTogglePublish={handleToggleExamPublish}
                  onSeedStarterSamples={handleSeedStarterSamples}
                />
              )
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
              onOpenExamLanding={(code) =>
                void resolveDirectExamByCode(
                  code,
                  isValidPublicExamCode(code) ? 'publicCode' : 'examCode'
                )
              }
              onReviewSubmission={handleReviewSubmission}
            />
          </ProtectedRoute>
        )}
    </ErrorBoundary>
  );

  const renderFooter = () => (
    <footer className="border-t border-slate-200 bg-white py-5 text-xs text-slate-600">
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
            type="button"
            onClick={() => setIsSystemDocsOpen(true)}
            className="hover:text-teal-700 font-medium transition-colors"
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
  );

  if (isWorkspaceShell && userProfile) {
    return (
      <div className="h-screen flex overflow-hidden bg-slate-50 font-sans">
        <WorkspaceSidebar
          activeTab={activeTab}
          userRole={userProfile.role}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={() => setIsSidebarCollapsed((prev) => !prev)}
          onSelectTab={(tab) => {
            setGuestExamMode(false);
            if (tab === 'create_exam') {
              setCreatorInitialQuestions([]);
              setCreatorInitialTitle('Đề kiểm tra mới');
              setCreatorInitialFolderId(null);
            }
            setActiveTab(tab);
          }}
          onOpenSystemDocs={() => setIsSystemDocsOpen(true)}
          isMobileOpen={isMobileSidebarOpen}
          onCloseMobile={() => setIsMobileSidebarOpen(false)}
        />

        <div className="flex-1 min-w-0 flex flex-col h-full overflow-hidden">
          <Header
            workspaceMode
            currentUser={userProfile}
            isGuest={false}
            activeTab={activeTab}
            setActiveTab={(tab) => {
              setGuestExamMode(false);
              setActiveTab(tab);
            }}
            onOpenMobileMenu={() => setIsMobileSidebarOpen(true)}
            onOpenSystemDocs={() => setIsSystemDocsOpen(true)}
            onProfileUpdated={(updated) => setLocalUpdatedProfile(updated)}
            onLogout={handleLogout}
          />

          <main className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-4 sm:px-6 lg:px-8 py-6">
            <div className="max-w-7xl mx-auto">
              {renderMainViewportContent()}
            </div>
            <div className="mt-10 -mx-4 sm:-mx-6 lg:-mx-8 -mb-6">
              {renderFooter()}
            </div>
          </main>
        </div>

        <SystemDesignModal isOpen={isSystemDocsOpen} onClose={() => setIsSystemDocsOpen(false)} />
      </div>
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
        {renderMainViewportContent()}
      </main>

      {/* Footer */}
      {activeTab !== 'take_exam' && renderFooter()}

      {/* System Technical Architecture & Design Modal */}
      <SystemDesignModal isOpen={isSystemDocsOpen} onClose={() => setIsSystemDocsOpen(false)} />
    </div>
  );
}
