import React, { useMemo, useState } from 'react';
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
  ArrowRight,
  QrCode,
  FileCheck,
  Activity,
  Lock,
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

function formatViDateTime(iso?: string): string | null {
  if (!iso) return null;
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return null;
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(ts));
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

  const recentExams = useMemo(() => {
    return [...exams]
      .sort((a, b) => {
        const tsA = Date.parse(a.updatedAt || a.createdAt || '') || 0;
        const tsB = Date.parse(b.updatedAt || b.createdAt || '') || 0;
        return tsB - tsA;
      })
      .slice(0, 6);
  }, [exams]);

  const [activeShareExam, setActiveShareExam] = useState<Exam | null>(null);

  return (
    <div className="space-y-6">
      {/* Clean Welcome Banner */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 md:p-7 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div className="space-y-2 min-w-0">
          <p className="text-sm font-semibold text-teal-700">
            {getUserGreeting(currentUser)}
          </p>
          <h1 className="text-[26px] sm:text-[30px] font-bold text-slate-900 tracking-tight leading-tight">
            Bảng điều khiển QUIZ PRO
          </h1>
          <p className="text-[15px] sm:text-base text-slate-600 max-w-2xl leading-relaxed">
            Bóc tách đề thi Word/PDF chuẩn GDPT 2018, tổ chức phòng thi trực tuyến bảo mật và theo dõi kết quả theo thời gian thực.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => onNavigate('upload_exam')}
            className="px-4 min-h-[44px] rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-[15px] font-semibold shadow-xs transition-colors flex items-center gap-2 whitespace-nowrap"
          >
            <FileUp className="w-4 h-4 shrink-0" />
            <span>Bóc tách Word/PDF</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigate('create_exam')}
            className="px-4 min-h-[44px] rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-[15px] font-semibold shadow-xs transition-colors flex items-center gap-2 whitespace-nowrap"
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
            <h2 className="text-lg font-bold text-slate-900">
              Không gian làm việc riêng của bạn đã sẵn sàng
            </h2>
            <p className="text-[15px] text-slate-600 leading-relaxed max-w-2xl">
              Dữ liệu câu hỏi, thư mục, lớp học và đề thi của mỗi giáo viên được tách biệt hoàn toàn. Hãy tải lên file đề Word/PDF của riêng bạn hoặc nạp nhanh bộ dữ liệu mẫu để trải nghiệm.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => onNavigate('upload_exam')}
              className="px-4 min-h-[44px] rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-[15px] font-semibold shadow-xs whitespace-nowrap"
            >
              Tải đề Word / PDF ngay
            </button>
            {onSeedStarterSamples && (
              <button
                type="button"
                disabled={isSeedingSamples}
                onClick={() => void onSeedStarterSamples()}
                className="px-4 min-h-[44px] rounded-xl border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 disabled:opacity-60 text-indigo-800 text-[15px] font-semibold whitespace-nowrap"
              >
                {isSeedingSamples ? 'Đang nạp bộ mẫu...' : 'Nạp bộ câu hỏi mẫu'}
              </button>
            )}
          </div>
        </div>
      )}

      {/* 4 Core Real-Data Statistics Cards */}
      <section aria-label="Thống kê tổng quan" className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs flex items-center gap-4 min-w-0">
          <div className="w-12 h-12 rounded-xl bg-teal-50 border border-teal-200 flex items-center justify-center text-teal-700 shrink-0">
            <FileCheck className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-600 truncate">Tổng số đề thi đã tạo</p>
            <p className="text-2xl sm:text-3xl font-bold text-slate-900 mt-0.5 tabular-nums">
              {totalExamsCount}
            </p>
            <p className="text-[13px] text-slate-500 mt-0.5 tabular-nums truncate">
              {totalQuestions} câu hỏi trong ngân hàng
            </p>
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs flex items-center gap-4 min-w-0">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700 shrink-0">
            <Activity className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-600 truncate">Đề thi đang hoạt động</p>
            <p className="text-2xl sm:text-3xl font-bold text-slate-900 mt-0.5 tabular-nums">
              {activeExamsCount}
            </p>
            <p className="text-[13px] text-emerald-700 font-medium mt-0.5 tabular-nums truncate">
              {totalExamsCount - activeExamsCount} đề ở trạng thái nháp
            </p>
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs flex items-center gap-4 min-w-0">
          <div className="w-12 h-12 rounded-xl bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-700 shrink-0">
            <Users className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-600 truncate">Tổng lượt học sinh tham gia</p>
            <p className="text-2xl sm:text-3xl font-bold text-slate-900 mt-0.5 tabular-nums">
              {totalParticipationsCount}
            </p>
            <p className="text-[13px] text-indigo-700 font-medium mt-0.5 tabular-nums truncate">
              {totalStudentsCount} thí sinh · {classesCount} lớp học
            </p>
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs flex items-center gap-4 min-w-0">
          <div className="w-12 h-12 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-700 shrink-0">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-600 truncate">Bài thi đã hoàn thành</p>
            <p className="text-2xl sm:text-3xl font-bold text-slate-900 mt-0.5 tabular-nums">
              {completedSubmissionsCount}
            </p>
            <p className="text-[13px] text-slate-600 font-medium mt-0.5 tabular-nums truncate">
              Điểm trung bình: {avgScore} / 10
            </p>
          </div>
        </div>
      </section>

      {/* 4 Balanced Quick Actions */}
      <section className="space-y-3">
        <h2 className="text-xl sm:text-2xl font-bold text-slate-900">
          Thao tác nhanh
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex flex-col justify-between gap-4 hover:border-teal-300 transition-colors">
            <div className="space-y-2.5">
              <div className="w-11 h-11 rounded-xl bg-teal-50 border border-teal-200 text-teal-700 flex items-center justify-center">
                <PlusCircle className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-slate-900">Tạo đề thi mới</h3>
              <p className="text-[15px] text-slate-600 leading-snug">
                Soạn đề trực tiếp, cân bằng thang điểm 10 và cấu hình mật khẩu thi.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('create_exam')}
              className="w-full min-h-[44px] px-4 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-[15px] font-semibold transition-colors flex items-center justify-center gap-2 whitespace-nowrap"
            >
              <span>Tạo đề ngay</span>
              <ArrowRight className="w-4 h-4 shrink-0" />
            </button>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex flex-col justify-between gap-4 hover:border-indigo-300 transition-colors">
            <div className="space-y-2.5">
              <div className="w-11 h-11 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-700 flex items-center justify-center">
                <FileUp className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-slate-900">Bóc tách đề từ file Word</h3>
              <p className="text-[15px] text-slate-600 leading-snug">
                Đọc tự động file DOCX/PDF, phân loại 3 phần và đối chiếu bảng đáp án.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('upload_exam')}
              className="w-full min-h-[44px] px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-[15px] font-semibold transition-colors flex items-center justify-center gap-2 whitespace-nowrap"
            >
              <span>Tải &amp; Bóc tách</span>
              <ArrowRight className="w-4 h-4 shrink-0" />
            </button>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex flex-col justify-between gap-4 hover:border-slate-300 transition-colors">
            <div className="space-y-2.5">
              <div className="w-11 h-11 rounded-xl bg-slate-100 border border-slate-200 text-slate-800 flex items-center justify-center">
                <BookOpen className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-slate-900">Quản lý đề thi</h3>
              <p className="text-[15px] text-slate-600 leading-snug">
                Mở/đóng phòng thi, chia sẻ mã QR, ngân hàng câu hỏi và thư mục.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('exam_manager')}
              className="w-full min-h-[44px] px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-[15px] font-semibold transition-colors flex items-center justify-center gap-2 whitespace-nowrap"
            >
              <span>Mở kho đề thi</span>
              <ArrowRight className="w-4 h-4 shrink-0" />
            </button>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex flex-col justify-between gap-4 hover:border-emerald-300 transition-colors">
            <div className="space-y-2.5">
              <div className="w-11 h-11 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center">
                <BarChart3 className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-slate-900">Xem kết quả thi</h3>
              <p className="text-[15px] text-slate-600 leading-snug">
                Phân tích phổ điểm học sinh, thống kê từng câu và xuất file Excel.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('exam_results')}
              className="w-full min-h-[44px] px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[15px] font-semibold transition-colors flex items-center justify-center gap-2 whitespace-nowrap"
            >
              <span>Xem kết quả</span>
              <ArrowRight className="w-4 h-4 shrink-0" />
            </button>
          </div>
        </div>
      </section>

      {/* Recent Activity & Question Bank Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Recent Activity / Newly Created Exams */}
        <div className="lg:col-span-2 space-y-4 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <Clock className="w-5 h-5 text-teal-600 shrink-0" />
              <span>Hoạt động gần đây</span>
            </h2>
            <button
              type="button"
              onClick={() => onNavigate('online_exams')}
              className="text-sm font-semibold text-teal-700 hover:text-teal-800 flex items-center gap-1 shrink-0 whitespace-nowrap"
            >
              <span>Xem tất cả ({exams.length})</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-3">
            {recentExams.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center space-y-3">
                <p className="text-[15px] text-slate-600">
                  Bạn chưa tạo đề thi nào trong không gian làm việc này.
                </p>
                <button
                  type="button"
                  onClick={() => onNavigate('upload_exam')}
                  className="px-4 min-h-[42px] rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold"
                >
                  Bắt đầu bóc tách đề đầu tiên
                </button>
              </div>
            ) : (
              recentExams.map((exam) => {
                const examSubs = submissions.filter((s) => s.examId === exam.id);
                const formattedCreated = formatViDateTime(exam.createdAt);
                return (
                  <div
                    key={exam.id}
                    className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-xs hover:border-teal-300 transition-colors flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
                  >
                    <div className="space-y-1.5 min-w-0 flex-1">
                      {/* Unboxed typographic metadata */}
                      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13px] font-medium text-slate-600 tabular-nums">
                        <span className="font-mono font-bold text-teal-800">
                          Mã {exam.code}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span
                          className={`inline-flex items-center gap-1 font-semibold ${
                            exam.isPublished ? 'text-emerald-700' : 'text-slate-600'
                          }`}
                        >
                          {exam.isPublished ? (
                            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                          ) : (
                            <Clock className="w-3.5 h-3.5 shrink-0" />
                          )}
                          <span>{exam.isPublished ? 'Đang hoạt động' : 'Bản nháp'}</span>
                        </span>
                        {exam.requiresPassword && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="inline-flex items-center gap-1 text-amber-700 font-semibold">
                              <Lock className="w-3.5 h-3.5 shrink-0" />
                              <span>Có mật khẩu</span>
                            </span>
                          </>
                        )}
                        <span aria-hidden="true">·</span>
                        <span>
                          {exam.grade === 'chuyen_hsg' ? 'Chuyên / HSG' : `Khối ${exam.grade}`}
                        </span>
                      </div>

                      <h3 className="font-bold text-slate-900 text-base sm:text-lg truncate">
                        {exam.title}
                      </h3>

                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-600 tabular-nums">
                        <span>{exam.durationMinutes} phút</span>
                        <span aria-hidden="true">·</span>
                        <span>{exam.questions.length} câu hỏi</span>
                        <span aria-hidden="true">·</span>
                        <span>{examSubs.length} lượt nộp</span>
                        {formattedCreated && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="text-slate-500">Tạo lúc {formattedCreated}</span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                      <button
                        type="button"
                        onClick={() => onOpenExamResults(exam.id)}
                        className="px-3.5 min-h-[42px] rounded-xl border border-slate-300 hover:bg-slate-50 bg-white text-slate-800 text-sm font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap"
                      >
                        <BarChart3 className="w-4 h-4 text-teal-600 shrink-0" />
                        <span>Xem điểm</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveShareExam(exam)}
                        title="Lấy link trực tiếp và tạo mã QR"
                        className="px-3.5 min-h-[42px] rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold flex items-center gap-1.5 transition-colors shadow-2xs whitespace-nowrap"
                      >
                        <QrCode className="w-4 h-4 shrink-0" />
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
            <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-indigo-600 shrink-0" />
              <span>Ngân hàng câu hỏi</span>
            </h2>
            <button
              type="button"
              onClick={() => onNavigate('question_bank')}
              className="text-sm font-semibold text-teal-700 hover:text-teal-800 shrink-0 whitespace-nowrap"
            >
              Quản lý
            </button>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-5">
            <div>
              <p className="text-[15px] font-semibold text-slate-800 mb-3">
                Phân loại theo 3 dạng chuẩn:
              </p>

              <div className="space-y-3.5">
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
                Truy cập nhanh:
              </p>
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => onNavigate('folder_manager')}
                  className="p-2.5 min-h-[42px] rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-800 text-sm font-medium text-left flex items-center gap-2 transition-colors border border-slate-200"
                >
                  <FolderTree className="w-4 h-4 text-teal-600 shrink-0" />
                  <span className="truncate">Thư mục</span>
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate('class_manager')}
                  className="p-2.5 min-h-[42px] rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-800 text-sm font-medium text-left flex items-center gap-2 transition-colors border border-slate-200"
                >
                  <Users className="w-4 h-4 text-indigo-600 shrink-0" />
                  <span className="truncate">Lớp học</span>
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={() => onNavigate('upload_exam')}
              className="w-full min-h-[44px] px-4 bg-slate-900 hover:bg-slate-800 text-white text-[15px] font-semibold rounded-xl transition-colors flex items-center justify-center gap-2 whitespace-nowrap"
            >
              <FileUp className="w-4 h-4 shrink-0" />
              <span>Bóc tách đề Word / PDF</span>
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
