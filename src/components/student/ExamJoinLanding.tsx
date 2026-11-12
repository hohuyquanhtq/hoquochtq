import React, { useState } from 'react';
import { 
  GraduationCap, 
  Clock, 
  FileText, 
  Award, 
  Play, 
  AlertCircle, 
  CheckCircle2, 
  User as UserIcon, 
  Layers, 
  FlaskConical,
  ShieldAlert,
  ArrowLeft
} from 'lucide-react';
import { Exam, User } from '../../types';
import { APP_CONFIG } from '../../constants/brand';

interface ExamJoinLandingProps {
  exam: Exam;
  currentUser: User;
  onStartExam: (exam: Exam, studentName: string, studentClass: string) => void;
  onBackToHome: () => void;
}

export const ExamJoinLanding: React.FC<ExamJoinLandingProps> = ({
  exam,
  currentUser,
  onStartExam,
  onBackToHome,
}) => {
  const [studentName, setStudentName] = useState(currentUser.name || '');
  const [studentClass, setStudentClass] = useState(currentUser.className || '12 Hóa 1');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentName.trim() || !studentClass.trim()) {
      setErrorMsg('Vui lòng nhập đầy đủ Họ tên và Lớp của bạn trước khi làm bài!');
      return;
    }

    if (!exam.isPublished) {
      setErrorMsg('Phòng thi này hiện đang tạm đóng bởi giáo viên.');
      return;
    }

    onStartExam(exam, studentName.trim(), studentClass.trim());
  };

  // Count question types
  const p1Count = exam.questions.filter(q => q.type === 'part1_single_choice').length;
  const p2Count = exam.questions.filter(q => q.type === 'part2_true_false').length;
  const p3Count = exam.questions.filter(q => q.type === 'part3_short_answer').length;

  return (
    <div className="max-w-3xl mx-auto py-6 px-4 space-y-6">
      
      {/* Top Navigation */}
      <button
        onClick={onBackToHome}
        className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-blue-600 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Quay lại trang chính</span>
      </button>

      {/* Main Card */}
      <div className="bg-white border border-slate-200 rounded-3xl shadow-xl overflow-hidden">
        
        {/* Banner */}
        <div className="bg-gradient-to-r from-blue-700 via-indigo-700 to-blue-800 p-6 md:p-8 text-white relative">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 text-blue-200 text-xs font-semibold mb-3">
            <FlaskConical className="w-3.5 h-3.5" />
            <span>{APP_CONFIG.APP_NAME} • Môn Hóa Học (GDPT 2018)</span>
          </div>

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight">
                {exam.title}
              </h1>
              <p className="text-xs text-blue-200 mt-1">
                Giáo viên ra đề: <strong className="text-white">{exam.authorName}</strong> • {APP_CONFIG.APP_SCHOOL}
              </p>
            </div>

            <div className="bg-white/15 backdrop-blur-xs border border-white/20 px-4 py-2.5 rounded-2xl text-center self-start md:self-auto shrink-0">
              <span className="text-[10px] font-bold uppercase tracking-wider text-blue-200 block">
                MÃ BÀI THI
              </span>
              <span className="text-2xl font-black font-mono tracking-widest text-white">
                {exam.code}
              </span>
            </div>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 md:p-8 space-y-6">
          
          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold rounded-xl flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Quick Stats Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3.5 rounded-2xl bg-blue-50/60 border border-blue-100 flex items-center gap-3">
              <div className="p-2.5 bg-blue-100 rounded-xl text-blue-700">
                <Clock className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[11px] text-slate-500 font-medium">Thời gian</p>
                <p className="text-base font-extrabold text-slate-900">{exam.durationMinutes} phút</p>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-indigo-50/60 border border-indigo-100 flex items-center gap-3">
              <div className="p-2.5 bg-indigo-100 rounded-xl text-indigo-700">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[11px] text-slate-500 font-medium">Số câu hỏi</p>
                <p className="text-base font-extrabold text-slate-900">{exam.totalQuestions} câu</p>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-emerald-50/60 border border-emerald-100 flex items-center gap-3">
              <div className="p-2.5 bg-emerald-100 rounded-xl text-emerald-700">
                <Award className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[11px] text-slate-500 font-medium">Thang điểm</p>
                <p className="text-base font-extrabold text-slate-900">{exam.totalScore || 10.0} điểm</p>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-purple-50/60 border border-purple-100 flex items-center gap-3">
              <div className="p-2.5 bg-purple-100 rounded-xl text-purple-700">
                <Layers className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[11px] text-slate-500 font-medium">Cấu trúc</p>
                <p className="text-base font-extrabold text-slate-900">3 Phần thi</p>
              </div>
            </div>
          </div>

          {/* Detailed Instructions */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-3 text-xs text-slate-700">
            <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>Hướng Dẫn &amp; Quy Chế Làm Bài Trắc Nghiệm</span>
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 pt-1">
              <div className="p-2.5 rounded-xl bg-white border border-slate-200">
                <span className="font-bold text-blue-700 block mb-0.5">Phần I: 4 Lựa chọn ({p1Count} câu)</span>
                <p className="text-slate-500 leading-relaxed">Mỗi câu chọn duy nhất 01 phương án đúng (A, B, C hoặc D).</p>
              </div>

              <div className="p-2.5 rounded-xl bg-white border border-slate-200">
                <span className="font-bold text-indigo-700 block mb-0.5">Phần II: Đúng / Sai ({p2Count} câu)</span>
                <p className="text-slate-500 leading-relaxed">Mỗi câu có 4 ý a, b, c, d. Thí sinh chọn Đúng hoặc Sai cho từng ý.</p>
              </div>

              <div className="p-2.5 rounded-xl bg-white border border-slate-200">
                <span className="font-bold text-purple-700 block mb-0.5">Phần III: Trả lời ngắn ({p3Count} câu)</span>
                <p className="text-slate-500 leading-relaxed">Thí sinh nhập giá trị số (ví dụ: 4 hoặc 58,4) vào ô trả lời.</p>
              </div>
            </div>

            <div className="flex items-center gap-2 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 p-2.5 rounded-xl">
              <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />
              <span>Hệ thống giám sát chuyển tab/cửa sổ. Hãy tập trung làm bài và nhấn "Nộp bài" khi hoàn thành.</span>
            </div>
          </div>

          {/* Student Info Form to Start */}
          <form onSubmit={handleSubmit} className="space-y-4 pt-2">
            <div className="border-t border-slate-100 pt-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5 mb-3">
                <UserIcon className="w-4 h-4 text-blue-600" />
                <span>Thông Tin Thí Sinh Tham Gia</span>
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Họ và tên thí sinh <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={studentName}
                    onChange={(e) => setStudentName(e.target.value)}
                    placeholder="Nguyễn Văn A"
                    className="w-full p-3 rounded-xl border border-slate-200 text-xs font-semibold focus:ring-2 focus:ring-blue-500 bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Lớp / Trường <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={studentClass}
                    onChange={(e) => setStudentClass(e.target.value)}
                    placeholder="12 Hóa 1"
                    className="w-full p-3 rounded-xl border border-slate-200 text-xs font-semibold focus:ring-2 focus:ring-blue-500 bg-white"
                  />
                </div>
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-extrabold text-sm rounded-2xl shadow-lg shadow-blue-500/25 transition-all flex items-center justify-center gap-2"
            >
              <Play className="w-5 h-5 fill-white" />
              <span>BẮT ĐẦU LÀM BÀI THI ({exam.durationMinutes} PHÚT)</span>
            </button>
          </form>

        </div>

      </div>

    </div>
  );
};
