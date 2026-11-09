import React, { useState } from 'react';
import { Exam, StudentSubmission } from '../../types';
import { 
  FileCheck, 
  Plus, 
  Share2, 
  Clock, 
  BarChart3, 
  Trash2, 
  Play, 
  Eye, 
  Copy, 
  CheckCircle2, 
  AlertCircle,
  ToggleLeft,
  ToggleRight,
  Sparkles
} from 'lucide-react';

interface ExamManagerProps {
  exams: Exam[];
  submissions: StudentSubmission[];
  onCreateNew: () => void;
  onOpenResults: (examId: string) => void;
  onTakeExamAsPreview: (exam: Exam) => void;
  onTogglePublish: (examId: string) => void;
  onDeleteExam: (examId: string) => void;
}

export const ExamManager: React.FC<ExamManagerProps> = ({
  exams,
  submissions,
  onCreateNew,
  onOpenResults,
  onTakeExamAsPreview,
  onTogglePublish,
  onDeleteExam,
}) => {
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const handleCopyCode = (code: string) => {
    navigator.clipboard?.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2500);
  };

  return (
    <div className="space-y-6">
      
      {/* Top Banner */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-blue-600 font-bold text-xs uppercase tracking-wider">
            <FileCheck className="w-4 h-4" />
            <span>Tổ chức thi & Quản lý bài kiểm tra</span>
          </div>
          <h1 className="text-xl md:text-2xl font-extrabold text-slate-900 mt-1">
            Phòng Thi Trực Tuyến & Danh Sách Đề Thi ({exams.length})
          </h1>
          <p className="text-xs md:text-sm text-slate-500 mt-1">
            Quản lý mã tham gia, trạng thái mở/đóng thi, theo dõi kết quả nộp bài của học sinh.
          </p>
        </div>

        <button
          onClick={onCreateNew}
          className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-md shadow-blue-500/20 transition-all flex items-center gap-2 shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Tạo đề thi mới</span>
        </button>
      </div>

      {/* Exams Grid */}
      <div className="space-y-4">
        {exams.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center text-slate-500 text-xs">
            Chưa có đề thi nào. Nhấn "Tạo đề thi mới" hoặc "Tải đề thi từ File" để bắt đầu!
          </div>
        ) : (
          exams.map((exam) => {
            const examSubs = submissions.filter(s => s.examId === exam.id);
            const isCopied = copiedCode === exam.code;

            return (
              <div
                key={exam.id}
                className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs hover:border-blue-300 transition-all flex flex-col lg:flex-row lg:items-center justify-between gap-5"
              >
                {/* Left: Info */}
                <div className="space-y-2 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="px-2.5 py-1 text-xs font-mono font-bold bg-blue-100 text-blue-800 rounded-lg">
                      Mã: {exam.code}
                    </span>
                    <button
                      onClick={() => onTogglePublish(exam.id)}
                      className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition-colors flex items-center gap-1.5 ${
                        exam.isPublished
                          ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      <span className={`w-2 h-2 rounded-full ${exam.isPublished ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
                      {exam.isPublished ? 'Đang mở thi' : 'Đã đóng phòng thi'}
                    </button>
                    <span className="text-xs text-slate-500 font-medium">
                      Khối {exam.grade === 'chuyen_hsg' ? 'Chuyên & HSG' : `Lớp ${exam.grade}`}
                    </span>
                    <span className="text-xs text-slate-400">
                      Tạo ngày {new Date(exam.createdAt).toLocaleDateString('vi-VN')}
                    </span>
                  </div>

                  <h3 className="text-base font-bold text-slate-900">
                    {exam.title}
                  </h3>

                  <div className="flex items-center gap-4 text-xs text-slate-500 flex-wrap">
                    <span>⏱ {exam.durationMinutes} phút</span>
                    <span>📝 {exam.questions.length} câu hỏi</span>
                    <span>🎯 Thang {exam.totalScore || 10.0} điểm</span>
                    <span>👥 {examSubs.length} lượt nộp bài</span>
                    {exam.shuffleQuestions && <span className="text-purple-600">🔀 Đảo câu</span>}
                    {exam.shuffleOptions && <span className="text-indigo-600">🔀 Đảo đáp án</span>}
                  </div>
                </div>

                {/* Right: Actions */}
                <div className="flex items-center gap-2 flex-wrap self-end lg:self-center shrink-0">
                  {/* Copy Code Button */}
                  <button
                    onClick={() => handleCopyCode(exam.code)}
                    className="px-3 py-2 rounded-xl border border-blue-200 bg-blue-50/80 hover:bg-blue-100 text-blue-700 text-xs font-bold transition-colors flex items-center gap-1.5"
                  >
                    {isCopied ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                    <span>{isCopied ? 'Đã chép mã!' : `Mã: ${exam.code}`}</span>
                  </button>

                  {/* Student View Preview */}
                  <button
                    onClick={() => onTakeExamAsPreview(exam)}
                    className="px-3 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-colors flex items-center gap-1.5"
                    title="Vào thi thử nghiệm với tư cách thí sinh"
                  >
                    <Play className="w-3.5 h-3.5 text-blue-600" />
                    <span>Thi thử</span>
                  </button>

                  {/* View Results / Analytics */}
                  <button
                    onClick={() => onOpenResults(exam.id)}
                    className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-black text-white text-xs font-bold shadow-xs transition-colors flex items-center gap-1.5"
                  >
                    <BarChart3 className="w-3.5 h-3.5 text-blue-400" />
                    <span>Xem điểm ({examSubs.length})</span>
                  </button>

                  {/* Delete */}
                  <button
                    onClick={() => {
                      if (confirm(`Bạn có chắc muốn xóa đề thi "${exam.title}"?`)) {
                        onDeleteExam(exam.id);
                      }
                    }}
                    className="p-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                    title="Xóa đề thi"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

    </div>
  );
};
