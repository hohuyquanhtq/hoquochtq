/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { User, UserRole, Question, Exam, Folder, StudentSubmission, ChemGrade } from './types';
import { StorageService, DEFAULT_USERS } from './services/storage';
import { Header } from './components/common/Header';
import { SystemDesignModal } from './components/docs/SystemDesignModal';

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

// Admin Components
import { AdminDashboard } from './components/admin/AdminDashboard';

export default function App() {
  const [currentUser, setCurrentUser] = useState<User>(() => StorageService.getCurrentUser());
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [isSystemDocsOpen, setIsSystemDocsOpen] = useState(false);

  // Core Data State
  const [questions, setQuestions] = useState<Question[]>(() => StorageService.getQuestions());
  const [exams, setExams] = useState<Exam[]>(() => StorageService.getExams());
  const [folders, setFolders] = useState<Folder[]>(() => StorageService.getFolders());
  const [submissions, setSubmissions] = useState<StudentSubmission[]>(() => StorageService.getSubmissions());

  // Interactive flow state
  const [activeExamForTaking, setActiveExamForTaking] = useState<Exam | null>(null);
  const [activeStudentName, setActiveStudentName] = useState<string>('Trần Minh Khang');
  const [activeStudentClass, setActiveStudentClass] = useState<string>('12 Hóa 1');
  const [reviewSubmission, setReviewSubmission] = useState<StudentSubmission | null>(null);
  const [selectedExamIdForResults, setSelectedExamIdForResults] = useState<string | null>(null);

  // Preload questions for ExamCreator
  const [creatorInitialQuestions, setCreatorInitialQuestions] = useState<Question[]>([]);
  const [creatorInitialTitle, setCreatorInitialTitle] = useState<string>('');
  const [creatorInitialGrade, setCreatorInitialGrade] = useState<ChemGrade>('12');

  // Sync state whenever activeTab or role changes
  const handleSwitchUserRole = (role: UserRole) => {
    const targetUser = DEFAULT_USERS.find(u => u.role === role) || DEFAULT_USERS[0];
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

  // Reload data from storage helper
  const reloadDataFromStorage = () => {
    setQuestions(StorageService.getQuestions());
    setExams(StorageService.getExams());
    setFolders(StorageService.getFolders());
    setSubmissions(StorageService.getSubmissions());
  };

  // --- Handlers for Teacher Actions ---
  const handleSaveQuestionsToBank = (newQuestions: Question[]) => {
    newQuestions.forEach(q => StorageService.addQuestion(q));
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
    const updated = [newExam, ...exams];
    StorageService.saveExams(updated);
    setExams(updated);
    setActiveTab('exam_manager');
  };

  const handleToggleExamPublish = (examId: string) => {
    const updated = exams.map(e => e.id === examId ? { ...e, isPublished: !e.isPublished } : e);
    StorageService.saveExams(updated);
    setExams(updated);
  };

  const handleDeleteExam = (examId: string) => {
    const updated = exams.filter(e => e.id !== examId);
    StorageService.saveExams(updated);
    setExams(updated);
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
  const handleStartExam = (exam: Exam, name: string, cls: string) => {
    setActiveExamForTaking(exam);
    setActiveStudentName(name);
    setActiveStudentClass(cls);
    setActiveTab('take_exam');
  };

  const handleFinishExam = (submission: StudentSubmission) => {
    StorageService.addSubmission(submission);
    setSubmissions(StorageService.getSubmissions());
    setReviewSubmission(submission);
    setActiveTab('review_submission');
  };

  const handleReviewSubmission = (sub: StudentSubmission) => {
    setReviewSubmission(sub);
    setActiveTab('review_submission');
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
                exam={exams.find(e => e.id === selectedExamIdForResults) || exams[0]}
                submissions={submissions.filter(s => s.examId === (selectedExamIdForResults || exams[0]?.id))}
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

            {activeTab === 'take_exam' && activeExamForTaking && (
              <ExamTaker
                exam={activeExamForTaking}
                studentName={activeStudentName}
                studentClass={activeStudentClass}
                onFinishExam={handleFinishExam}
                onExitWithoutSave={() => setActiveTab('student_home')}
              />
            )}

            {activeTab === 'review_submission' && reviewSubmission && (
              <ExamResultView
                submission={reviewSubmission}
                exam={exams.find(e => e.id === reviewSubmission.examId)}
                onBackToHome={() => setActiveTab('student_home')}
              />
            )}
          </>
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
        <footer className="border-t border-slate-200 bg-white py-6 text-center text-xs text-slate-500">
          <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
            <p className="font-semibold text-slate-700">
              CHEM TEST © 2025 – Nền tảng Ngân hàng câu hỏi, tạo đề và thi trắc nghiệm trực tuyến môn Hóa học
            </p>
            <div className="flex items-center gap-4 text-slate-500">
              <button 
                onClick={() => setIsSystemDocsOpen(true)}
                className="hover:text-blue-600 transition-colors"
              >
                Hồ sơ kiến trúc kỹ thuật
              </button>
              <span>•</span>
              <span>Chuẩn Bộ GD&ĐT 2025</span>
              <span>•</span>
              <span>Hỗ trợ KaTeX & DOCX</span>
            </div>
          </div>
        </footer>
      )}

      {/* System Technical Architecture & Design Modal */}
      <SystemDesignModal
        isOpen={isSystemDocsOpen}
        onClose={() => setIsSystemDocsOpen(false)}
      />

    </div>
  );
}
