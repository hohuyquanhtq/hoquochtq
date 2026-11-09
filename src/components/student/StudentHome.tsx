import React, { useState } from 'react';
import { User, Exam, StudentSubmission } from '../../types';
import { 
  GraduationCap, 
  Play, 
  Clock, 
  Award, 
  CheckCircle2, 
  FileText, 
  ArrowRight,
  Sparkles,
  FlaskConical,
  Search
} from 'lucide-react';

interface StudentHomeProps {
  currentUser: User;
  exams: Exam[];
  submissions: StudentSubmission[];
  onStartExam: (exam: Exam, studentName: string, studentClass: string) => void;
  onReviewSubmission: (sub: StudentSubmission) => void;
}

export const StudentHome: React.FC<StudentHomeProps> = ({
  currentUser,
  exams,
  submissions,
  onStartExam,
  onReviewSubmission,
}) => {
  const [examCode, setExamCode] = useState('');
  const [name, setName] = useState(currentUser.name || 'Trần Minh Khang');
  const [className, setClassName] = useState(currentUser.className || '12 Hóa 1');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const activeExams = exams.filter(e => e.isPublished);
  const mySubmissions = submissions.filter(s => s.studentName === name || s.studentId === currentUser.id);

  const handleJoinByCode = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!name.trim() || !className.trim() || !examCode.trim()) {
      setErrorMsg('Vui lòng nhập đầy đủ Họ tên, Lớp và Mã bài thi!');
      return;
    }

    const found = exams.find(e => e.code.toUpperCase() === examCode.trim().toUpperCase());
    if (!found) {
      setErrorMsg(`Không tìm thấy bài thi với mã "${examCode}". Vui lòng kiểm tra lại!`);
      return;
    }

    if (!found.isPublished) {
      setErrorMsg('Phòng thi này hiện đang tạm đóng bởi giáo viên.');
      return;
    }

    onStartExam(found, name.trim(), className.trim());
  };

  return (
    <div className="space-y-6">
      
      {/* Top Banner & Quick Join Card */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Welcome Text */}
        <div className="lg:col-span-2 bg-gradient-to-r from-blue-700 to-indigo-800 rounded-2xl p-6 md:p-8 text-white shadow-xl flex flex-col justify-between">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 text-blue-200 text-xs font-semibold mb-3">
              <FlaskConical className="w-3.5 h-3.5" />
              <span>Phòng Thi Trắc Nghiệm Hóa Học Trực Tuyến</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">
              Chào mừng, {name}!
            </h1>
            <p className="mt-2 text-sm text-blue-100 max-w-xl leading-relaxed">
              Nhập mã bài thi do giáo viên cung cấp để tham gia làm bài, hoặc chọn từ danh sách các bài kiểm tra đang mở dưới đây.
            </p>
          </div>

          <div className="mt-6 flex items-center gap-6 text-xs text-blue-200 border-t border-white/10 pt-4">
            <div>
              <p className="font-bold text-lg text-white">{mySubmissions.length}</p>
              <p>Bài đã hoàn thành</p>
            </div>
            <div>
              <p className="font-bold text-lg text-white">{activeExams.length}</p>
              <p>Bài thi đang mở</p>
            </div>
            <div>
              <p className="font-bold text-lg text-white">10.0</p>
              <p>Thang điểm chuẩn</p>
            </div>
          </div>
        </div>

        {/* Quick Join Form */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs flex flex-col justify-between">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-800 flex items-center gap-2 mb-3">
              <GraduationCap className="w-4 h-4 text-blue-600" />
              Vào phòng thi nhanh
            </h2>

            {errorMsg && (
              <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium mb-3">
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleJoinByCode} className="space-y-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Họ và tên thí sinh</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Nguyễn Văn A"
                  className="w-full p-2.5 rounded-xl border border-slate-200 text-xs font-semibold focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Lớp</label>
                <input
                  type="text"
                  required
                  value={className}
                  onChange={(e) => setClassName(e.target.value)}
                  placeholder="12 Hóa 1"
                  className="w-full p-2.5 rounded-xl border border-slate-200 text-xs font-semibold focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Mã bài thi (6 ký tự)</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    required
                    value={examCode}
                    onChange={(e) => setExamCode(e.target.value.toUpperCase())}
                    placeholder="VD: CHEM12"
                    className="flex-1 p-2.5 rounded-xl border border-slate-200 text-xs font-mono font-bold uppercase focus:ring-2 focus:ring-blue-500 bg-slate-50 text-blue-800"
                  />
                  {activeExams.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setExamCode(activeExams[0].code)}
                      className="px-2.5 py-1 text-[11px] font-bold bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-xl"
                      title="Nạp nhanh mã đề có sẵn"
                    >
                      Mẫu
                    </button>
                  )}
                </div>
              </div>

              <button
                type="submit"
                className="w-full mt-2 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-md shadow-blue-500/20 transition-all flex items-center justify-center gap-2"
              >
                <Play className="w-4 h-4" />
                <span>Bắt đầu làm bài thi</span>
              </button>
            </form>
          </div>
        </div>

      </div>

      {/* Active Exams Available to Join */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Clock className="w-4 h-4 text-emerald-600" />
            Các bài kiểm tra đang mở ({activeExams.length})
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {activeExams.map((exam) => (
            <div
              key={exam.id}
              className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs hover:border-blue-300 transition-all flex flex-col justify-between gap-4"
            >
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="px-2.5 py-0.5 rounded-md bg-blue-100 text-blue-800 font-mono font-bold text-xs">
                    {exam.code}
                  </span>
                  <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 text-[11px] font-bold">
                    Đang mở
                  </span>
                  <span className="text-xs text-slate-400">
                    Khối {exam.grade === 'chuyen_hsg' ? 'Chuyên & HSG' : `Lớp ${exam.grade}`}
                  </span>
                </div>

                <h3 className="font-bold text-slate-900 text-sm">
                  {exam.title}
                </h3>

                <div className="flex items-center gap-4 text-xs text-slate-500 mt-2">
                  <span>⏱ {exam.durationMinutes} phút</span>
                  <span>📝 {exam.questions.length} câu</span>
                  <span>🎯 Thang {exam.totalScore || 10.0} điểm</span>
                </div>
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                <span className="text-[11px] text-slate-500">Giáo viên: {exam.authorName}</span>
                <button
                  onClick={() => onStartExam(exam, name, className)}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors flex items-center gap-1.5"
                >
                  <Play className="w-3.5 h-3.5" />
                  <span>Vào thi ngay</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* History of Past Submissions */}
      <div className="space-y-4 pt-2">
        <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
          <Award className="w-4 h-4 text-indigo-600" />
          Lịch sử bài làm & Bảng điểm của bạn ({mySubmissions.length})
        </h2>

        {mySubmissions.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-slate-400 text-xs italic">
            Bạn chưa hoàn thành bài thi nào. Hãy tham gia bài thi đang mở ở trên để kiểm tra kiến thức!
          </div>
        ) : (
          <div className="space-y-3">
            {mySubmissions.map((sub) => (
              <div
                key={sub.id}
                className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-blue-50 text-blue-700">
                      {sub.examCode}
                    </span>
                    <span className="font-bold text-slate-900 text-sm">{sub.examTitle}</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    Nộp bài lúc {new Date(sub.submittedAt).toLocaleTimeString('vi-VN')} ngày {new Date(sub.submittedAt).toLocaleDateString('vi-VN')} • Thời gian làm: {Math.floor(sub.durationSeconds / 60)} phút {sub.durationSeconds % 60} giây
                  </p>
                </div>

                <div className="flex items-center gap-4 self-end sm:self-center shrink-0">
                  <div className="text-right">
                    <p className="text-lg font-extrabold text-blue-700">{sub.totalScore.toFixed(2)} <span className="text-xs font-normal text-slate-400">/10</span></p>
                    <p className="text-[10px] text-slate-500">Phần I: {sub.part1Score} | Phần II: {sub.part2Score} | Phần III: {sub.part3Score}</p>
                  </div>

                  <button
                    onClick={() => onReviewSubmission(sub)}
                    className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-black text-white text-xs font-bold transition-colors flex items-center gap-1.5"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>Xem lại bài</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
};
