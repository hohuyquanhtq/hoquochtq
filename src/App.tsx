/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { User, UserRole, Question, Exam, Folder, StudentSubmission, ChemGrade } from './types';
import { StorageService, DEFAULT_USERS } from './services/storage';
import { Header } from './components/common/Header';
import { SystemDesignModal } from './components/docs/SystemDesignModal';
import { APP_CONFIG } from './constants/brand';
import {
  extractExamCodeFromLocation,
  normalizeExamCode,
} from './utils/urlHelper';
import {
  subscribeAuthState,
  signInWithGoogleForCloudSync,
  signOutFromCloud,
  syncExamToFirestore,
  deleteExamFromFirestore,
  fetchTeacherExamsFromFirestore,
  fetchTeacherSubmissionsFromFirestore,
  fetchAllowedAnswerKeysAfterSubmit,
  rehydrateExamWithAnswerKeys,
  saveSubmissionToFirestore,
  sanitizeExamForStudent,
} from './services/firebase';
import { gradeSubmission } from './utils/gradingEngine';

// Teacher Components
import { TeacherDashboard } from './components/teacher/TeacherDashboard';
import { ExamUploader } from './components/teacher/ExamUploader';
import { QuestionBank } from './components/teacher/QuestionBank';
import { FolderManager } from './components/teacher/FolderManager';
import { ExamCreator } from './components/teacher/ExamCreator';
import { ExamManager } from './components/teacher/ExamManager';
import { ExamResults } from './components/teacher/ExamResults';

// Student Components
import { StudentHome } from './components/student/StudentHome';
import { ExamTaker } from './components/student/ExamTaker';
import { ExamResultView } from './components/student/ExamResultView';
import { ExamJoinLanding, ExamLandingStatus } from './components/student/ExamJoinLanding';

// Admin Components
import { AdminDashboard } from './components/admin/AdminDashboard';

export default function App() {
  const [currentUser, setCurrentUser] = useState<User>(() => StorageService.getCurrentUser());
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [isSystemDocsOpen, setIsSystemDocsOpen] = useState(false);

  // Firebase Auth Cloud User State
  const [cloudUserUid, setCloudUserUid] = useState<string | null>(null);
  const [cloudUserEmail, setCloudUserEmail] = useState<string | null>(null);

  // Core Data State
  const [questions, setQuestions] = useState<Question[]>(() => StorageService.getQuestions());
  const [exams, setExams] = useState<Exam[]>(() => StorageService.getExams());
  const [folders, setFolders] = useState<Folder[]>(() => StorageService.getFolders());
  const [submissions, setSubmissions] = useState<StudentSubmission[]>(() => StorageService.getSubmissions());

  // Interactive flow state
  const [activeExamForTaking, setActiveExamForTaking] = useState<Exam | null>(null);
  const [activeExamOwnerId, setActiveExamOwnerId] = useState<string | undefined>(undefined);
  const [activeStudentName, setActiveStudentName] = useState<string>('Trần Minh Khang');
  const [activeStudentClass, setActiveStudentClass] = useState<string>('12 Hóa 1');
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
  const [directJoinCode, setDirectJoinCode] = useState<string>('');
  const [directJoinStatus, setDirectJoinStatus] = useState<ExamLandingStatus>('found');
  const [directJoinMessage, setDirectJoinMessage] = useState<string | undefined>(undefined);

  // Reload data from storage helper
  const reloadDataFromStorage = useCallback(() => {
    setQuestions(StorageService.getQuestions());
    setExams(StorageService.getExams());
    setFolders(StorageService.getFolders());
    setSubmissions(StorageService.getSubmissions());
  }, []);

  // Subscribe to Firebase Auth & hydrate teacher's cloud exams/submissions when signed in
  useEffect(() => {
    const unsub = subscribeAuthState(async (fbUser) => {
      if (fbUser && fbUser.emailVerified) {
        setCloudUserUid(fbUser.uid);
        setCloudUserEmail(fbUser.email || fbUser.uid);

        try {
          const [cloudExams, cloudSubs] = await Promise.all([
            fetchTeacherExamsFromFirestore(fbUser.uid),
            fetchTeacherSubmissionsFromFirestore(fbUser.uid),
          ]);

          if (cloudExams.length > 0) {
            const localExams = StorageService.getExams();
            const mergedMap = new Map<string, Exam>();
            localExams.forEach((e) => mergedMap.set(e.id, e));
            cloudExams.forEach((ce) => mergedMap.set(ce.id, ce));
            const mergedList = Array.from(mergedMap.values());
            StorageService.saveExams(mergedList);
            setExams(mergedList);
          }

          if (cloudSubs.length > 0) {
            const localSubs = StorageService.getSubmissions();
            const subMap = new Map<string, StudentSubmission>();
            localSubs.forEach((s) => subMap.set(s.id, s));
            cloudSubs.forEach((cs) => subMap.set(cs.id, cs));
            const mergedSubs = Array.from(subMap.values()).sort(
              (a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()
            );
            StorageService.saveSubmissions(mergedSubs);
            setSubmissions(mergedSubs);
          }
        } catch (err) {
          console.warn('Could not fetch teacher cloud data:', err);
        }
      } else {
        setCloudUserUid(null);
        setCloudUserEmail(null);
      }
    });

    return () => unsub();
  }, []);

  const resolveDirectExamFromUrl = useCallback(async () => {
    if (typeof window === 'undefined') return;

    const targetCode = extractExamCodeFromLocation(window.location);
    if (!targetCode) return;

    const clean = normalizeExamCode(targetCode);
    const studentUser = DEFAULT_USERS.find((u) => u.role === 'student') || DEFAULT_USERS[1];
    setCurrentUser(studentUser);
    StorageService.setCurrentUser(studentUser);

    setDirectJoinCode(clean);
    setDirectJoinExam(null);
    setDirectJoinOwnerId(undefined);
    setDirectJoinStatus('loading');
    setDirectJoinMessage(undefined);
    setActiveTab('exam_landing');

    const res = await StorageService.checkExamStatusAsync(clean);
    setDirectJoinStatus(res.status);
    setDirectJoinMessage(res.message);
    setDirectJoinExam(res.exam || null);
    setDirectJoinOwnerId(res.ownerId);
  }, []);

  // URL Routing, QR Scan Detection & Cross-Tab Storage Sync
  useEffect(() => {
    const handleStorageUpdate = () => {
      reloadDataFromStorage();
    };
    window.addEventListener('storage', handleStorageUpdate);
    window.addEventListener('hqtest_exams_updated', handleStorageUpdate);

    void resolveDirectExamFromUrl();
    window.addEventListener('popstate', resolveDirectExamFromUrl);
    window.addEventListener('hashchange', resolveDirectExamFromUrl);

    return () => {
      window.removeEventListener('storage', handleStorageUpdate);
      window.removeEventListener('hqtest_exams_updated', handleStorageUpdate);
      window.removeEventListener('popstate', resolveDirectExamFromUrl);
      window.removeEventListener('hashchange', resolveDirectExamFromUrl);
    };
  }, [reloadDataFromStorage, resolveDirectExamFromUrl]);

  // Sync state whenever activeTab or role changes
  const handleSwitchUserRole = (role: UserRole) => {
    const targetUser = DEFAULT_USERS.find((u) => u.role === role) || DEFAULT_USERS[0];
    setCurrentUser(targetUser);
    StorageService.setCurrentUser(targetUser);

    if (role === 'teacher') {
      setActiveTab('dashboard');
    } else if (role === 'student') {
      setActiveTab('student_home');
    } else if (role === 'admin') {
      setActiveTab('admin_dashboard');
    }
  };

  // --- Handlers for Teacher Actions ---
  const handleSaveQuestionsToBank = (newQuestions: Question[]) => {
    newQuestions.forEach((q) => StorageService.addQuestion(q));
    setQuestions(StorageService.getQuestions());
    setActiveTab('question_bank');
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
    const current = StorageService.getExams();
    setExams(current.some((e) => e.id === newExam.id) ? current : [newExam, ...current]);
    setActiveTab('exam_manager');
  };

  const handleToggleExamPublish = (examId: string) => {
    const updated = exams.map((e) =>
      e.id === examId ? { ...e, isPublished: !e.isPublished, updatedAt: new Date().toISOString() } : e
    );
    StorageService.saveExams(updated);
    setExams(updated);

    const toggled = updated.find((e) => e.id === examId);
    if (toggled && cloudUserUid) {
      void syncExamToFirestore(toggled).catch((err) => {
        console.warn('Could not sync publish toggle to Firestore:', err);
      });
    }
  };

  const handleDeleteExam = (examId: string) => {
    const target = exams.find((e) => e.id === examId);
    const updated = exams.filter((e) => e.id !== examId);
    StorageService.saveExams(updated);
    setExams(updated);

    if (target && cloudUserUid) {
      void deleteExamFromFirestore(target).catch((err) => {
        console.warn('Could not delete exam from Firestore:', err);
      });
    }
  };

  const handleAddQuestion = (q: Question) => {
    StorageService.addQuestion(q);
    setQuestions(StorageService.getQuestions());
  };

  const handleUpdateQuestion = (q: Question) => {
    StorageService.updateQuestion(q);
    setQuestions(StorageService.getQuestions());
  };

  const handleDeleteQuestion = (id: string) => {
    StorageService.deleteQuestion(id);
    setQuestions(StorageService.getQuestions());
  };

  const handleSaveFolders = (newFolders: Folder[]) => {
    StorageService.saveFolders(newFolders);
    setFolders(newFolders);
  };

  const handleOpenExamResults = (examId: string) => {
    setSelectedExamIdForResults(examId);
    setActiveTab('exam_results');
  };

  // --- Handlers for Student Actions ---
  const handleStartExam = (exam: Exam, name: string, cls: string, ownerId?: string) => {
    // Always enforce sanitized question payload while taking exam so answer keys cannot be inspected prematurely
    setActiveExamForTaking(sanitizeExamForStudent(exam));
    setActiveExamOwnerId(ownerId);
    setActiveStudentName(name);
    setActiveStudentClass(cls);
    if (currentUser.role === 'student' && name.trim() && name.trim() !== currentUser.name) {
      const updated = { ...currentUser, name: name.trim(), className: cls.trim() };
      setCurrentUser(updated);
      StorageService.setCurrentUser(updated);
    }
    // Keep ?examCode= in URL so refreshing (F5) during the session never 404s and restores cleanly
    if (typeof window !== 'undefined' && exam.code) {
      const normalized = normalizeExamCode(exam.code);
      const nextUrl = `/?examCode=${encodeURIComponent(normalized)}`;
      window.history.replaceState({}, '', nextUrl);
    }
    setActiveTab('take_exam');
  };

  const handleFinishExam = async (rawSubmission: StudentSubmission) => {
    let finalSubmission = rawSubmission;
    let examForReview: Exam | undefined = activeExamForTaking || undefined;

    if (activeExamForTaking) {
      // 1. If this exam came from Cloud and permits post-submit answer review, fetch allowed answer key now
      if (activeExamOwnerId) {
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
              rawSubmission.studentId,
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
            examForReview = hydrated;
          }
        }
        // Always persist student submission back to Firestore for teacher review
        void saveSubmissionToFirestore(finalSubmission, activeExamOwnerId);
      } else {
        // 2. Local/built-in exam: look up local master key strictly post-submission for grading
        const localMaster = StorageService.getExamByCode(activeExamForTaking.code);
        if (localMaster) {
          const graded = gradeSubmission(
            localMaster,
            rawSubmission.studentId,
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
          // Only expose answers/solutions to ExamResultView if teacher policy allows it
          examForReview = localMaster.showAnswersAfterSubmit
            ? localMaster
            : sanitizeExamForStudent(localMaster);
        }
      }
    }

    StorageService.addSubmission(finalSubmission);
    setSubmissions(StorageService.getSubmissions());
    setReviewExamOverride(examForReview);
    setReviewSubmission(finalSubmission);
    setActiveTab('review_submission');
  };

  const handleReviewSubmission = (sub: StudentSubmission) => {
    const localExam = exams.find((e) => e.id === sub.examId);
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

  const handleUpdateCurrentUser = (updatedUser: User) => {
    setCurrentUser(updatedUser);
    StorageService.setCurrentUser(updatedUser);
  };

  const handleCloudSignIn = async () => {
    try {
      const fbUser = await signInWithGoogleForCloudSync();
      if (fbUser.emailVerified) {
        // Sync local custom exams up to Firestore so shared links work across all devices
        const localExams = StorageService.getExams();
        for (const ex of localExams) {
          if (!['exam_hq50_standard', 'exam_de5_attached', 'exam_chem12_01', 'exam_olymp_01'].includes(ex.id)) {
            await syncExamToFirestore(ex).catch(() => {});
          }
        }
      }
    } catch (err) {
      console.warn('Google sign-in cancelled or failed:', err);
    }
  };

  const handleCloudSignOut = async () => {
    await signOutFromCloud();
  };

  const clearExamUrlParam = () => {
    if (typeof window !== 'undefined') {
      if (window.location.pathname !== '/' || window.location.search || window.location.hash) {
        window.history.replaceState({}, '', '/');
      }
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      {/* Global Header (Hide during ongoing exam for full concentration) */}
      {activeTab !== 'take_exam' && (
        <Header
          currentUser={currentUser}
          onSwitchUser={handleSwitchUserRole}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          onOpenSystemDocs={() => setIsSystemDocsOpen(true)}
          onUpdateUser={handleUpdateCurrentUser}
          cloudUserEmail={cloudUserEmail}
          onCloudSignIn={handleCloudSignIn}
          onCloudSignOut={handleCloudSignOut}
        />
      )}

      {/* Main Content Viewport */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* --- TEACHER VIEWS --- */}
        {currentUser.role === 'teacher' && (
          <>
            {activeTab === 'dashboard' && (
              <TeacherDashboard
                currentUser={currentUser}
                questions={questions}
                exams={exams}
                submissions={submissions}
                onNavigate={(tab) => setActiveTab(tab)}
                onOpenExamResults={handleOpenExamResults}
              />
            )}

            {activeTab === 'upload_exam' && (
              <ExamUploader
                onSaveToQuestionBank={handleSaveQuestionsToBank}
                onCreateExamFromParsed={handleCreateExamFromParsed}
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
                onTakeExamAsPreview={(ex) => handleStartExam(ex, currentUser.name, 'Giáo viên xem thử')}
                onTogglePublish={handleToggleExamPublish}
                onDeleteExam={handleDeleteExam}
              />
            )}

            {activeTab === 'exam_results' && (
              <ExamResults
                exam={exams.find((e) => e.id === selectedExamIdForResults) || exams[0]}
                submissions={submissions.filter((s) => s.examId === (selectedExamIdForResults || exams[0]?.id))}
                onBack={() => setActiveTab('exam_manager')}
              />
            )}
          </>
        )}

        {/* --- STUDENT VIEWS --- */}
        {currentUser.role === 'student' && (
          <>
            {activeTab === 'student_home' && (
              <StudentHome
                currentUser={currentUser}
                exams={exams}
                submissions={submissions}
                onStartExam={handleStartExam}
                onReviewSubmission={handleReviewSubmission}
              />
            )}

            {activeTab === 'exam_landing' && (
              <ExamJoinLanding
                exam={directJoinExam}
                examCode={directJoinCode}
                status={directJoinStatus}
                statusMessage={directJoinMessage}
                currentUser={currentUser}
                onStartExam={(ex, name, cls) => {
                  handleStartExam(ex, name, cls, directJoinOwnerId);
                }}
                onRetryLookup={() => void resolveDirectExamFromUrl()}
                onBackToHome={() => {
                  clearExamUrlParam();
                  setDirectJoinExam(null);
                  setActiveTab('student_home');
                }}
              />
            )}
          </>
        )}

        {/* --- SHARED EXAM TAKING & RESULT VIEWS (Student & Teacher Preview) --- */}
        {activeTab === 'take_exam' && activeExamForTaking && (
          <ExamTaker
            exam={activeExamForTaking}
            studentName={activeStudentName}
            studentClass={activeStudentClass}
            onFinishExam={handleFinishExam}
            onExitWithoutSave={() => {
              clearExamUrlParam();
              setActiveTab(currentUser.role === 'teacher' ? 'exam_manager' : 'student_home');
            }}
          />
        )}

        {activeTab === 'review_submission' && reviewSubmission && (
          <ExamResultView
            submission={reviewSubmission}
            exam={reviewExamOverride || exams.find((e) => e.id === reviewSubmission.examId)}
            onBackToHome={() => {
              clearExamUrlParam();
              setActiveTab(currentUser.role === 'teacher' ? 'exam_manager' : 'student_home');
            }}
          />
        )}

        {/* --- ADMIN VIEW --- */}
        {currentUser.role === 'admin' && (
          <AdminDashboard
            questions={questions}
            exams={exams}
            submissions={submissions}
            folders={folders}
            onDataResetOrRestored={reloadDataFromStorage}
          />
        )}
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
