import React from 'react';
import { User, Question, Exam, StudentSubmission } from '../../types';
import { 
  FileUp, 
  PlusCircle, 
  BookOpen, 
  BarChart3, 
  Users, 
  CheckCircle2, 
  Clock, 
  FolderTree, 
  Share2, 
  Sparkles,
  ArrowRight,
  TrendingUp,
  FlaskConical
} from 'lucide-react';
import { getUserGreeting, APP_CONFIG } from '../../constants/brand';

interface TeacherDashboardProps {
  currentUser: User;
  questions: Question[];
  exams: Exam[];
  submissions: StudentSubmission[];
  onNavigate: (tab: string) => void;
  onOpenExamResults: (examId: string) => void;
}

export const TeacherDashboard: React.FC<TeacherDashboardProps> = ({
  currentUser,
  questions,
  exams,
  submissions,
  onNavigate,
  onOpenExamResults,
}) => {
  const totalQuestions = questions.length;
  const activeExamsCount = exams.filter(e => e.isPublished).length;
  const totalSubmissionsCount = submissions.length;
  const avgScore = totalSubmissionsCount > 0
    ? (submissions.reduce((acc, s) => acc + s.totalScore, 0) / totalSubmissionsCount).toFixed(1)
    : '0.0';

  const part1Count = questions.filter(q => q.type === 'part1_single_choice').length;
  const part2Count = questions.filter(q => q.type === 'part2_true_false').length;
  const part3Count = questions.filter(q => q.type === 'part3_short_answer').length;

  return (
    <div className="space-y-6">
      
      {/* Welcome Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-blue-700 via-blue-800 to-indigo-900 p-6 md:p-8 text-white shadow-xl">
        <div className="absolute right-0 top-0 bottom-0 w-1/3 opacity-10 pointer-events-none flex items-center justify-center">
          <FlaskConical className="w-96 h-96 -mr-20 -mt-20 text-white" />
        </div>
        
        <div className="relative z-10 max-w-2xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/20 border border-blue-400/30 text-blue-200 text-xs font-semibold mb-3">
            <Sparkles className="w-3.5 h-3.5 text-blue-300" />
            <span>{APP_CONFIG.APP_NAME} – {APP_CONFIG.APP_DESCRIPTION}</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">
            {getUserGreeting(currentUser)}
          </h1>
          <p className="mt-2 text-sm md:text-base text-blue-100/90 leading-relaxed">
            Hệ thống nhận dạng đề thi thông minh từ file Word/PDF, hỗ trợ chuẩn 3 phần cấu trúc mới của Bộ GD&ĐT và công thức hóa học tự động.
          </p>

          {/* Quick Action Buttons in Banner */}
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              onClick={() => onNavigate('upload_exam')}
              className="px-4 py-2.5 bg-white text-blue-800 font-bold text-xs md:text-sm rounded-xl shadow-lg hover:bg-blue-50 transition-all flex items-center gap-2 group"
            >
              <FileUp className="w-4 h-4 text-blue-600 group-hover:-translate-y-0.5 transition-transform" />
              <span>Tải đề thi từ File Word / PDF</span>
            </button>
            <button
              onClick={() => onNavigate('exam_manager')}
              className="px-4 py-2.5 bg-blue-600/80 hover:bg-blue-600 border border-blue-400/40 text-white font-bold text-xs md:text-sm rounded-xl transition-all flex items-center gap-2"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Tạo đề & Mở phòng thi</span>
            </button>
          </div>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-xs flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shrink-0">
            <BookOpen className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500">Ngân hàng câu hỏi</p>
            <p className="text-xl md:text-2xl font-extrabold text-slate-900 mt-0.5">{totalQuestions}</p>
            <p className="text-[11px] text-slate-400">câu đã kiểm duyệt</p>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-xs flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 shrink-0">
            <Clock className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500">Phòng thi đang mở</p>
            <p className="text-xl md:text-2xl font-extrabold text-slate-900 mt-0.5">{activeExamsCount}</p>
            <p className="text-[11px] text-emerald-600 font-medium">Sẵn sàng nhận bài</p>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-xs flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500">Lượt làm bài</p>
            <p className="text-xl md:text-2xl font-extrabold text-slate-900 mt-0.5">{totalSubmissionsCount}</p>
            <p className="text-[11px] text-indigo-600 font-medium">Đã chấm điểm</p>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-xs flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600 shrink-0">
            <TrendingUp className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500">Điểm trung bình</p>
            <p className="text-xl md:text-2xl font-extrabold text-slate-900 mt-0.5">{avgScore} <span className="text-xs font-normal text-slate-400">/10</span></p>
            <p className="text-[11px] text-slate-400">toàn bộ bài nộp</p>
          </div>
        </div>
      </div>

      {/* Active Exams & Question Breakdown Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column: Active Exams (2 Cols) */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Clock className="w-4 h-4 text-blue-600" />
              Đề thi & Phòng thi trực tuyến
            </h2>
            <button
              onClick={() => onNavigate('exam_manager')}
              className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1"
            >
              Xem tất cả ({exams.length}) <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-3">
            {exams.map((exam) => {
              const examSubs = submissions.filter(s => s.examId === exam.id);
              return (
                <div 
                  key={exam.id}
                  className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs hover:border-blue-300 transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 text-xs font-mono font-bold bg-blue-100 text-blue-800 rounded-md">
                        {exam.code}
                      </span>
                      <span className={`px-2 py-0.5 text-[11px] font-semibold rounded-md ${
                        exam.isPublished ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
                      }`}>
                        {exam.isPublished ? 'Đang mở' : 'Bản nháp'}
                      </span>
                      <span className="text-xs text-slate-400">Khối {exam.grade === 'chuyen_hsg' ? 'Chuyên / HSG' : `Lớp ${exam.grade}`}</span>
                    </div>

                    <h3 className="font-bold text-slate-900 text-sm hover:text-blue-600 transition-colors">
                      {exam.title}
                    </h3>

                    <div className="flex items-center gap-4 text-xs text-slate-500">
                      <span>⏱ {exam.durationMinutes} phút</span>
                      <span>📝 {exam.questions.length} câu hỏi</span>
                      <span>🎯 Thang {exam.totalScore || 10.0}đ</span>
                      <span>👥 {examSubs.length} học sinh nộp</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                    <button
                      onClick={() => onOpenExamResults(exam.id)}
                      className="px-3 py-1.5 rounded-lg border border-slate-200 hover:border-slate-300 text-slate-700 hover:text-slate-900 text-xs font-semibold flex items-center gap-1 transition-colors"
                    >
                      <BarChart3 className="w-3.5 h-3.5 text-blue-600" />
                      Xem điểm
                    </button>
                    <button
                      onClick={() => {
                        navigator.clipboard?.writeText(exam.code);
                        alert(`Đã sao chép mã thi: ${exam.code}`);
                      }}
                      title="Sao chép mã phòng thi"
                      className="px-3 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold flex items-center gap-1 transition-colors"
                    >
                      <Share2 className="w-3.5 h-3.5" />
                      Mã: {exam.code}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column: Question Bank Summary & Distribution */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-indigo-600" />
              Cơ cấu Ngân hàng câu hỏi
            </h2>
            <button
              onClick={() => onNavigate('question_bank')}
              className="text-xs font-semibold text-blue-600 hover:text-blue-700"
            >
              Quản lý
            </button>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs space-y-4">
            <div>
              <p className="text-xs font-semibold text-slate-600 mb-2">Phân loại theo 3 dạng cấu trúc chuẩn:</p>
              
              <div className="space-y-2.5">
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="font-medium text-slate-700">Phần I (4 lựa chọn):</span>
                    <span className="font-bold text-blue-600">{part1Count} câu</span>
                  </div>
                  <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-blue-600 rounded-full" 
                      style={{ width: `${totalQuestions > 0 ? (part1Count / totalQuestions) * 100 : 0}%` }}
                    />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="font-medium text-slate-700">Phần II (Đúng - Sai 4 ý):</span>
                    <span className="font-bold text-indigo-600">{part2Count} câu</span>
                  </div>
                  <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-indigo-600 rounded-full" 
                      style={{ width: `${totalQuestions > 0 ? (part2Count / totalQuestions) * 100 : 0}%` }}
                    />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="font-medium text-slate-700">Phần III (Trả lời ngắn):</span>
                    <span className="font-bold text-emerald-600">{part3Count} câu</span>
                  </div>
                  <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-emerald-600 rounded-full" 
                      style={{ width: `${totalQuestions > 0 ? (part3Count / totalQuestions) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100">
              <p className="text-xs font-semibold text-slate-600 mb-2">Thao tác nhanh thư mục:</p>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <button
                  onClick={() => onNavigate('folder_manager')}
                  className="p-2 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-700 font-medium text-left flex items-center gap-1.5 transition-colors border border-slate-200"
                >
                  <FolderTree className="w-3.5 h-3.5 text-blue-600" />
                  Lớp 12 Chuyên
                </button>
                <button
                  onClick={() => onNavigate('folder_manager')}
                  className="p-2 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-700 font-medium text-left flex items-center gap-1.5 transition-colors border border-slate-200"
                >
                  <FolderTree className="w-3.5 h-3.5 text-purple-600" />
                  Ôn HSG Quốc Gia
                </button>
              </div>
            </div>

            <button
              onClick={() => onNavigate('upload_exam')}
              className="w-full py-2 bg-slate-900 hover:bg-black text-white text-xs font-bold rounded-xl transition-colors flex items-center justify-center gap-1.5"
            >
              <FileUp className="w-3.5 h-3.5" />
              Nạp thêm đề từ Word / PDF
            </button>
          </div>
        </div>

      </div>

    </div>
  );
};
