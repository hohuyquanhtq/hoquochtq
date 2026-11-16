import React, { useState } from 'react';
import { User, Question, Exam, StudentSubmission, ClassEnrollment } from '../../types';
import {
  FileUp,
  PlusCircle,
  BookOpen,
  BarChart3,
  Users,
  CheckCircle2,
  Clock,
  FolderTree,
  Sparkles,
  ArrowRight,
  QrCode,
  FileCheck,
  TrendingUp,
} from 'lucide-react';
import { getUserGreeting } from '../../constants/brand';
import { ExamShareModal } from '../common/ExamShareModal';

interface TeacherDashboardProps {
  currentUser: User;
  questions: Question[];
  exams: Exam[];
  submissions: StudentSubmission[];
  enrollments?: ClassEnrollment[];
  classesCount?: number;
  isSeedingSamples?: boolean;
  onNavigate: (tab: string) => void;
  onOpenExamResults: (examId: string) => void;
  onTogglePublish?: (examId: string) => void;
  onSeedStarterSamples?: () => Promise<void> | void;
}

export const TeacherDashboard: React.FC<TeacherDashboardProps> = ({
  currentUser,
  questions,
  exams,
  submissions,
  enrollments = [],
  classesCount = 0,
  isSeedingSamples = false,
  onNavigate,
  onOpenExamResults,
  onTogglePublish,
  onSeedStarterSamples,
}) => {
  const totalQuestions = questions.length;
  const totalExamsCount = exams.length;
  const activeExamsCount = exams.filter((e) => e.isPublished).length;
  const totalParticipationsCount = submissions.length;
  const completedSubmissionsCount = submissions.filter(
    (s) => s.status === 'completed' || s.status === 'timed_out'
  ).length;

  const enrolledStudentIds = new Set(
    enrollments.map((e) => e.studentId).filter(Boolean)
  );
  const participantKeys = new Set(
    submissions
      .map((s) => s.studentId || `${s.studentName}_${s.studentClass}`)
      .filter(Boolean)
  );
  const totalStudentsCount =
    enrolledStudentIds.size > 0 ? enrolledStudentIds.size : participantKeys.size;

  const avgScore =
    totalParticipationsCount > 0
      ? (
          submissions.reduce((acc, s) => acc + s.totalScore, 0) /
          totalParticipationsCount
        ).toFixed(1)
      : '0.0';

  const part1Count = questions.filter(
    (q) => q.type === 'part1_single_choice'
  ).length;
  const part2Count = questions.filter(
    (q) => q.type === 'part2_true_false'
  ).length;
  const part3Count = questions.filter(
    (q) => q.type === 'part3_short_answer'
  ).length;

  const [activeShareExam, setActiveShareExam] = useState<Exam | null>(null);

  return (
    <div className="space-y-6">
      {/* Clean Welcome Header */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 md:p-7 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div className="space-y-2 min-w-0">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-teal-50 border border-teal-200 text-teal-800 text-xs font-bold">
            <Sparkles className="w-3.5 h-3.5 text-teal-600 shrink-0" />
            <span>{getUserGreeting(currentUser)}</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-900 tracking-tight">
            Chào mừng đến với QUIZ PRO
          </h1>
          <p className="text-sm md:text-base text-slate-600 max-w-2xl leading-relaxed">
            Nền tảng bóc tách đề thi thông minh từ Word/PDF, tổ chức thi trực tuyến chuẩn GDPT 2018 và thống kê kết quả theo thời gian thực.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => onNavigate('upload_exam')}
            className="px-4 min-h-[44px] rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold shadow-xs transition-colors flex items-center gap-2"
          >
            <FileUp className="w-4 h-4 shrink-0" />
            <span>Tải đề từ Word/PDF</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigate('create_exam')}
            className="px-4 min-h-[44px] rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold shadow-xs transition-colors flex items-center gap-2"
          >
            <PlusCircle className="w-4 h-4 shrink-0" />
            <span>Tạo đề thi mới</span>
          </button>
        </div>
      </div>

      {/* Empty Workspace Onboarding for Newly Approved Teachers */}
      {totalQuestions === 0 && exams.length === 0 && (
        <div className="bg-white border-2 border-dashed border-teal-300 rounded-2xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xs">
          <div className="space-y-1.5 min-w-0">
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-teal-600 shrink-0" />
              <span>Không gian làm việc riêng của bạn đã sẵn sàng</span>
            </h2>
            <p className="text-sm text-slate-600 leading-relaxed max-w-2xl">
              Dữ liệu câu hỏi, thư mục, lớp học và đề thi của mỗi giáo viên được tách biệt hoàn toàn. Hãy tải lên file đề Word/PDF của riêng bạn hoặc nạp nhanh bộ dữ liệu mẫu để trải nghiệm.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => onNavigate('upload_exam')}
              className="px-4 min-h-[42px] rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold shadow-xs"
            >
              Tải đề Word / PDF ngay
            </button>
            {onSeedStarterSamples && (
              <button
                type="button"
                disabled={isSeedingSamples}
                onClick={() => void onSeedStarterSamples()}
                className="px-4 min-h-[42px] rounded-xl border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 disabled:opacity-60 text-indigo-800 text-sm font-semibold"
              >
                {isSeedingSamples ? 'Đang nạp bộ mẫu...' : 'Nạp bộ câu hỏi mẫu'}
              </button>
            )}
          </div>
        </div>
      )}

      {/* 4 Core Real-Data Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs flex items-center gap-4 min-w-0">
          <div className="w-12 h-12 rounded-xl bg-teal-50 border border-teal-200 flex items-center justify-center text-teal-700 shrink-0">
            <FileCheck className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-500 truncate">Tổng số đề thi</p>
            <p className="text-2xl md:text-3xl font-bold text-slate-900 mt-0.5 tabular-nums">
              {totalExamsCount}
            </p>
            <p className="text-xs text-teal-700 font-semibold mt-0.5 tabular-nums">
              {activeExamsCount} đề đang mở thi
            </p>
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs flex items-center gap-4 min-w-0">
          <div className="w-12 h-12 rounded-xl bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-700 shrink-0">
            <TrendingUp className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-500 truncate">Tổng số lượt tham gia</p>
            <p className="text-2xl md:text-3xl font-bold text-slate-900 mt-0.5 tabular-nums">
              {totalParticipationsCount}
            </p>
            <p className="text-xs text-indigo-700 font-semibold mt-0.5 tabular-nums">
              Điểm TB: {avgScore} / 10
            </p>
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs flex items-center gap-4 min-w-0">
          <div className="w-12 h-12 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-700 shrink-0">
            <Users className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-500 truncate">Tổng số học sinh</p>
            <p className="text-2xl md:text-3xl font-bold text-slate-900 mt-0.5 tabular-nums">
              {totalStudentsCount}
            </p>
            <p className="text-xs text-slate-600 font-medium mt-0.5 tabular-nums">
              {enrolledStudentIds.size > 0
                ? `Trong ${classesCount} lớp học`
                : 'Thí sinh đã tham gia'}
            </p>
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs flex items-center gap-4 min-w-0">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700 shrink-0">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-500 truncate">Bài thi đã hoàn thành</p>
            <p className="text-2xl md:text-3xl font-bold text-slate-900 mt-0.5 tabular-nums">
              {completedSubmissionsCount}
            </p>
            <p className="text-xs text-emerald-700 font-semibold mt-0.5 tabular-nums">
              {totalQuestions} câu hỏi trong kho
            </p>
          </div>
        </div>
      </div>

      {/* Prominent Action Cards */}
      <section className="space-y-3">
        <h2 className="text-lg md:text-xl font-bold text-slate-900">
          Thao tác nhanh
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex flex-col justify-between gap-4 hover:border-teal-300 transition-colors">
            <div className="space-y-2">
              <div className="w-11 h-11 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center">
                <PlusCircle className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-slate-900">Tạo đề thi mới</h3>
              <p className="text-sm text-slate-600 leading-snug">
                Soạn đề, cấu hình thang điểm 3 phần và mật khẩu thi.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('create_exam')}
              className="w-full min-h-[44px] px-4 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold transition-colors flex items-center justify-center gap-1.5"
            >
              <span>Tạo đề ngay</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex flex-col justify-between gap-4 hover:border-indigo-300 transition-colors">
            <div className="space-y-2">
              <div className="w-11 h-11 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center">
                <FileUp className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-slate-900">Tải đề Word/PDF</h3>
              <p className="text-sm text-slate-600 leading-snug">
                Tự động tách 3 phần, bảng đáp án và công thức hóa học.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('upload_exam')}
              className="w-full min-h-[44px] px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition-colors flex items-center justify-center gap-1.5"
            >
              <span>Bóc tách đề</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex flex-col justify-between gap-4 hover:border-teal-300 transition-colors">
            <div className="space-y-2">
              <div className="w-11 h-11 rounded-xl bg-slate-100 text-slate-800 flex items-center justify-center">
                <BookOpen className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-slate-900">Xem kho đề thi</h3>
              <p className="text-sm text-slate-600 leading-snug">
                Quản lý danh sách đề, ngân hàng câu hỏi và thư mục.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('exam_manager')}
              className="w-full min-h-[44px] px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold transition-colors flex items-center justify-center gap-1.5"
            >
              <span>Mở kho đề</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex flex-col justify-between gap-4 hover:border-emerald-300 transition-colors">
            <div className="space-y-2">
              <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-slate-900">Quản lý kết quả</h3>
              <p className="text-sm text-slate-600 leading-snug">
                Theo dõi điểm số từng thí sinh và xuất file Excel.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('exam_results')}
              className="w-full min-h-[44px] px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold transition-colors flex items-center justify-center gap-1.5"
            >
              <span>Xem kết quả</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex flex-col justify-between gap-4 hover:border-teal-300 transition-colors">
            <div className="space-y-2">
              <div className="w-11 h-11 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center">
                <BarChart3 className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-slate-900">Thống kê kết quả</h3>
              <p className="text-sm text-slate-600 leading-snug">
                Phân tích phổ điểm, tỉ lệ đúng theo từng câu hỏi.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('exam_results')}
              className="w-full min-h-[44px] px-4 rounded-xl border border-teal-300 bg-teal-50 hover:bg-teal-100 text-teal-800 text-sm font-semibold transition-colors flex items-center justify-center gap-1.5"
            >
              <span>Xem thống kê</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </section>

      {/* Active Exams & Question Bank Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Active Exams (2 Cols) */}
        <div className="lg:col-span-2 space-y-4 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Clock className="w-5 h-5 text-teal-600 shrink-0" />
              <span>Đề thi &amp; Phòng thi trực tuyến</span>
            </h2>
            <button
              type="button"
              onClick={() => onNavigate('online_exams')}
              className="text-sm font-semibold text-teal-700 hover:text-teal-800 flex items-center gap-1 shrink-0"
            >
              <span>Xem tất cả ({exams.length})</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-3">
            {exams.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-sm text-slate-500">
                Bạn chưa tạo đề thi nào trong không gian làm việc này.
              </div>
            ) : (
              exams.slice(0, 6).map((exam) => {
                const examSubs = submissions.filter((s) => s.examId === exam.id);
                return (
                  <div
                    key={exam.id}
                    className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-xs hover:border-teal-300 transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
                  >
                    <div className="space-y-1.5 min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="px-2.5 py-0.5 text-xs font-mono font-bold bg-teal-50 text-teal-800 border border-teal-200 rounded-md">
                          {exam.code}
                        </span>
                        <span
                          className={`px-2.5 py-0.5 text-xs font-semibold rounded-md ${
                            exam.isPublished
                              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {exam.isPublished ? 'Đang mở' : 'Bản nháp'}
                        </span>
                        <span className="text-xs font-medium text-slate-500">
                          {exam.grade === 'chuyen_hsg'
                            ? 'Chuyên / HSG'
                            : `Khối ${exam.grade}`}
                        </span>
                      </div>

                      <h3 className="font-bold text-slate-900 text-base truncate">
                        {exam.title}
                      </h3>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-600 tabular-nums">
                        <span>{exam.durationMinutes} phút</span>
                        <span>• {exam.questions.length} câu hỏi</span>
                        <span>• Thang {exam.totalScore || 10.0}đ</span>
                        <span>• {examSubs.length} lượt nộp</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                      <button
                        type="button"
                        onClick={() => onOpenExamResults(exam.id)}
                        className="px-3.5 min-h-[40px] rounded-xl border border-slate-200 hover:border-slate-300 bg-white text-slate-700 hover:text-slate-900 text-sm font-semibold flex items-center gap-1.5 transition-colors"
                      >
                        <BarChart3 className="w-4 h-4 text-teal-600" />
                        <span>Xem điểm</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveShareExam(exam)}
                        title="Lấy link trực tiếp và tạo mã QR"
                        className="px-3.5 min-h-[40px] rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold flex items-center gap-1.5 transition-colors shadow-2xs"
                      >
                        <QrCode className="w-4 h-4" />
                        <span>Chia sẻ &amp; QR</span>
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Question Bank Summary & Distribution */}
        <div className="space-y-4 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-indigo-600 shrink-0" />
              <span>Cơ cấu Ngân hàng câu hỏi</span>
            </h2>
            <button
              type="button"
              onClick={() => onNavigate('question_bank')}
              className="text-sm font-semibold text-teal-700 hover:text-teal-800 shrink-0"
            >
              Quản lý
            </button>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-5">
            <div>
              <p className="text-sm font-semibold text-slate-700 mb-3">
                Phân loại theo 3 dạng cấu trúc chuẩn:
              </p>

              <div className="space-y-3">
                <div>
                  <div className="flex justify-between text-sm mb-1.5 tabular-nums">
                    <span className="font-medium text-slate-700">Phần I (4 lựa chọn):</span>
                    <span className="font-bold text-teal-700">{part1Count} câu</span>
                  </div>
                  <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-teal-600 rounded-full"
                      style={{
                        width: `${totalQuestions > 0 ? (part1Count / totalQuestions) * 100 : 0}%`,
                      }}
                    />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-sm mb-1.5 tabular-nums">
                    <span className="font-medium text-slate-700">Phần II (Đúng - Sai 4 ý):</span>
                    <span className="font-bold text-indigo-700">{part2Count} câu</span>
                  </div>
                  <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-indigo-600 rounded-full"
                      style={{
                        width: `${totalQuestions > 0 ? (part2Count / totalQuestions) * 100 : 0}%`,
                      }}
                    />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-sm mb-1.5 tabular-nums">
                    <span className="font-medium text-slate-700">Phần III (Trả lời ngắn):</span>
                    <span className="font-bold text-emerald-700">{part3Count} câu</span>
                  </div>
                  <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-600 rounded-full"
                      style={{
                        width: `${totalQuestions > 0 ? (part3Count / totalQuestions) * 100 : 0}%`,
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-100">
              <p className="text-sm font-semibold text-slate-700 mb-2.5">
                Truy cập nhanh thư mục:
              </p>
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => onNavigate('folder_manager')}
                  className="p-2.5 min-h-[42px] rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-800 text-sm font-medium text-left flex items-center gap-2 transition-colors border border-slate-200"
                >
                  <FolderTree className="w-4 h-4 text-teal-600 shrink-0" />
                  <span className="truncate">Chuyên đề lớp</span>
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate('folder_manager')}
                  className="p-2.5 min-h-[42px] rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-800 text-sm font-medium text-left flex items-center gap-2 transition-colors border border-slate-200"
                >
                  <FolderTree className="w-4 h-4 text-indigo-600 shrink-0" />
                  <span className="truncate">Ôn tập HSG</span>
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={() => onNavigate('upload_exam')}
              className="w-full min-h-[44px] px-4 bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              <FileUp className="w-4 h-4" />
              <span>Nạp đề từ Word / PDF</span>
            </button>
          </div>
        </div>
      </div>

      {/* Share Modal */}
      <ExamShareModal
        isOpen={!!activeShareExam}
        exam={
          activeShareExam
            ? exams.find((e) => e.id === activeShareExam.id) || activeShareExam
            : null
        }
        onClose={() => setActiveShareExam(null)}
        onTogglePublish={onTogglePublish}
      />
    </div>
  );
};
