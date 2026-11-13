import React, { useState } from 'react';
import { Exam, StudentSubmission, Question } from '../../types';
import { 
  BarChart3, 
  Download, 
  ArrowLeft, 
  Users, 
  Award, 
  TrendingUp, 
  TrendingDown, 
  AlertTriangle, 
  CheckCircle2, 
  FileSpreadsheet,
  Clock,
  Search,
  Filter
} from 'lucide-react';
import { exportExamResultsToExcel } from '../../utils/excelExport';
import { ChemRenderer } from '../../utils/chemRenderer';

interface ExamResultsProps {
  exam: Exam;
  submissions: StudentSubmission[];
  onBack: () => void;
  onShareExam?: (exam: Exam) => void;
}

export const ExamResults: React.FC<ExamResultsProps> = ({
  exam,
  submissions,
  onBack,
  onShareExam,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedClass, setSelectedClass] = useState<string>('all');

  const filteredSubs = submissions.filter(s => {
    if (selectedClass !== 'all' && s.studentClass !== selectedClass) return false;
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      return s.studentName.toLowerCase().includes(term) || s.studentClass.toLowerCase().includes(term);
    }
    return true;
  });

  const totalStudents = submissions.length;
  const avgScore = totalStudents > 0 
    ? (submissions.reduce((acc, s) => acc + s.totalScore, 0) / totalStudents).toFixed(2)
    : '0.00';
  const highest = totalStudents > 0 ? Math.max(...submissions.map(s => s.totalScore)).toFixed(1) : '0';
  const lowest = totalStudents > 0 ? Math.min(...submissions.map(s => s.totalScore)).toFixed(1) : '0';

  // Score distribution counts
  const dist = {
    under5: submissions.filter(s => s.totalScore < 5.0).length,
    from5to65: submissions.filter(s => s.totalScore >= 5.0 && s.totalScore < 6.5).length,
    from65to8: submissions.filter(s => s.totalScore >= 6.5 && s.totalScore < 8.0).length,
    from8to9: submissions.filter(s => s.totalScore >= 8.0 && s.totalScore < 9.0).length,
    from9to10: submissions.filter(s => s.totalScore >= 9.0).length,
  };

  // Unique classes for filter
  const classes = Array.from(new Set(submissions.map(s => s.studentClass))).filter(Boolean);

  const handleExport = () => {
    exportExamResultsToExcel(exam, submissions);
  };

  return (
    <div className="space-y-6">
      
      {/* Top Header */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-600 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-md bg-blue-100 text-blue-800">
                {exam.code}
              </span>
              <span className="text-xs font-semibold text-slate-500">
                Báo cáo & Thống kê kết quả kiểm tra
              </span>
            </div>
            <h1 className="text-xl md:text-2xl font-extrabold text-slate-900 mt-1">
              {exam.title}
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
          {onShareExam && (
            <button
              onClick={() => onShareExam(exam)}
              className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-xs font-bold shadow-md shadow-blue-500/20 transition-all flex items-center gap-2"
              title="Lấy link trực tiếp và tạo mã QR cho học sinh"
            >
              <BarChart3 className="w-4 h-4 hidden" />
              <span>Chia sẻ &amp; QR</span>
            </button>
          )}

          <button
            onClick={handleExport}
            className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-md shadow-emerald-500/20 transition-all flex items-center gap-2"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Xuất Bảng Điểm Excel (.xlsx)</span>
          </button>
        </div>
      </div>

      {/* Stats Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-xs flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shrink-0">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500">Số bài đã nộp</p>
            <p className="text-xl md:text-2xl font-extrabold text-slate-900 mt-0.5">{totalStudents}</p>
            <p className="text-[11px] text-slate-400">thí sinh hoàn thành</p>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-xs flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
            <TrendingUp className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500">Điểm trung bình</p>
            <p className="text-xl md:text-2xl font-extrabold text-slate-900 mt-0.5">{avgScore} <span className="text-xs font-normal text-slate-400">/10</span></p>
            <p className="text-[11px] text-indigo-600 font-medium">Toàn bài thi</p>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-xs flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 shrink-0">
            <Award className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500">Điểm cao nhất</p>
            <p className="text-xl md:text-2xl font-extrabold text-emerald-600 mt-0.5">{highest}</p>
            <p className="text-[11px] text-slate-400">Thủ khoa bài thi</p>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-xs flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-xl bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-600 shrink-0">
            <TrendingDown className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500">Điểm thấp nhất</p>
            <p className="text-xl md:text-2xl font-extrabold text-rose-600 mt-0.5">{lowest}</p>
            <p className="text-[11px] text-slate-400">Cần phụ đạo thêm</p>
          </div>
        </div>
      </div>

      {/* Score Distribution Chart */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-blue-600" />
          Phổ điểm toàn bài thi
        </h2>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-center">
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-100">
            <p className="text-[11px] font-semibold text-rose-700">Dưới 5.0 (Yếu)</p>
            <p className="text-xl font-extrabold text-rose-800 mt-1">{dist.under5}</p>
            <p className="text-[10px] text-rose-600">{totalStudents > 0 ? ((dist.under5 / totalStudents) * 100).toFixed(0) : 0}%</p>
          </div>
          <div className="p-3 rounded-xl bg-amber-50 border border-amber-100">
            <p className="text-[11px] font-semibold text-amber-700">5.0 - 6.4 (Trung bình)</p>
            <p className="text-xl font-extrabold text-amber-800 mt-1">{dist.from5to65}</p>
            <p className="text-[10px] text-amber-600">{totalStudents > 0 ? ((dist.from5to65 / totalStudents) * 100).toFixed(0) : 0}%</p>
          </div>
          <div className="p-3 rounded-xl bg-blue-50 border border-blue-100">
            <p className="text-[11px] font-semibold text-blue-700">6.5 - 7.9 (Khá)</p>
            <p className="text-xl font-extrabold text-blue-800 mt-1">{dist.from65to8}</p>
            <p className="text-[10px] text-blue-600">{totalStudents > 0 ? ((dist.from65to8 / totalStudents) * 100).toFixed(0) : 0}%</p>
          </div>
          <div className="p-3 rounded-xl bg-indigo-50 border border-indigo-100">
            <p className="text-[11px] font-semibold text-indigo-700">8.0 - 8.9 (Giỏi)</p>
            <p className="text-xl font-extrabold text-indigo-800 mt-1">{dist.from8to9}</p>
            <p className="text-[10px] text-indigo-600">{totalStudents > 0 ? ((dist.from8to9 / totalStudents) * 100).toFixed(0) : 0}%</p>
          </div>
          <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-100">
            <p className="text-[11px] font-semibold text-emerald-700">9.0 - 10.0 (Xuất sắc)</p>
            <p className="text-xl font-extrabold text-emerald-800 mt-1">{dist.from9to10}</p>
            <p className="text-[10px] text-emerald-600">{totalStudents > 0 ? ((dist.from9to10 / totalStudents) * 100).toFixed(0) : 0}%</p>
          </div>
        </div>
      </div>

      {/* Submissions Table with Filters */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Users className="w-4 h-4 text-blue-600" />
            Danh sách học sinh làm bài ({filteredSubs.length})
          </h2>

          <div className="flex items-center gap-2.5">
            {classes.length > 0 && (
              <select
                value={selectedClass}
                onChange={(e) => setSelectedClass(e.target.value)}
                className="text-xs p-2 rounded-xl border border-slate-200 bg-slate-50 font-medium"
              >
                <option value="all">Tất cả các lớp</option>
                {classes.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            )}

            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Tìm tên học sinh..."
                className="pl-8 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 uppercase text-[10px] font-bold border-b border-slate-200">
              <tr>
                <th className="py-3 px-4">STT</th>
                <th className="py-3 px-4">Họ và tên</th>
                <th className="py-3 px-4">Lớp</th>
                <th className="py-3 px-4">Thời gian nộp</th>
                <th className="py-3 px-4 text-center">Phần I</th>
                <th className="py-3 px-4 text-center">Phần II</th>
                <th className="py-3 px-4 text-center">Phần III</th>
                <th className="py-3 px-4 text-center">Tổng điểm</th>
                <th className="py-3 px-4 text-center">Xếp loại</th>
                <th className="py-3 px-4 text-center">Rời màn hình</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredSubs.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-8 text-center text-slate-400 italic">
                    Chưa có bài thi nào được nộp cho đề này.
                  </td>
                </tr>
              ) : (
                filteredSubs.map((sub, i) => {
                  let badge = 'bg-slate-100 text-slate-700';
                  let rank = 'Chưa đạt';
                  if (sub.totalScore >= 9.0) { badge = 'bg-emerald-100 text-emerald-800 font-bold'; rank = 'Xuất sắc'; }
                  else if (sub.totalScore >= 8.0) { badge = 'bg-indigo-100 text-indigo-800 font-bold'; rank = 'Giỏi'; }
                  else if (sub.totalScore >= 6.5) { badge = 'bg-blue-100 text-blue-800 font-bold'; rank = 'Khá'; }
                  else if (sub.totalScore >= 5.0) { badge = 'bg-amber-100 text-amber-800 font-bold'; rank = 'Trung bình'; }

                  return (
                    <tr key={sub.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4 text-slate-400 font-medium">{i + 1}</td>
                      <td className="py-3 px-4 font-bold text-slate-900">{sub.studentName}</td>
                      <td className="py-3 px-4 text-slate-600">{sub.studentClass}</td>
                      <td className="py-3 px-4 text-slate-500">
                        {new Date(sub.submittedAt).toLocaleTimeString('vi-VN')} {new Date(sub.submittedAt).toLocaleDateString('vi-VN')}
                      </td>
                      <td className="py-3 px-4 text-center font-medium text-blue-700">{sub.part1Score.toFixed(2)}</td>
                      <td className="py-3 px-4 text-center font-medium text-indigo-700">{sub.part2Score.toFixed(2)}</td>
                      <td className="py-3 px-4 text-center font-medium text-purple-700">{sub.part3Score.toFixed(2)}</td>
                      <td className="py-3 px-4 text-center">
                        <span className="font-extrabold text-sm text-slate-900">
                          {sub.totalScore.toFixed(2)}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] ${badge}`}>
                          {rank}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center text-slate-400">
                        {sub.tabSwitchesCount && sub.tabSwitchesCount > 0 ? (
                          <span className="text-rose-600 font-bold">{sub.tabSwitchesCount} lần</span>
                        ) : (
                          <span className="text-emerald-600 font-semibold">0</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
};
