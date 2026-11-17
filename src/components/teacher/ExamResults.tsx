import React, { useMemo, useState } from 'react';
import { Exam, StudentSubmission } from '../../types';
import {
  BarChart3,
  ArrowLeft,
  Users,
  Award,
  TrendingUp,
  TrendingDown,
  CheckCircle2,
  XCircle,
  MinusCircle,
  FileSpreadsheet,
  Search,
  Lock,
  RefreshCw,
  Eye,
  ShieldCheck,
  AlertTriangle,
} from 'lucide-react';
import { exportExamResultsToExcel } from '../../utils/excelExport';
import { getEffectiveAnswerReviewConfig } from '../../services/examSecurityApi';
import { evaluateExamAttemptDetails } from '../../utils/gradingEngine';
import { normalizePublicExamCode } from '../../utils/urlHelper';
import { StudentSubmissionDetailModal } from './StudentSubmissionDetailModal';

interface ExamResultsProps {
  exam?: Exam;
  exams?: Exam[];
  submissions: StudentSubmission[];
  currentUserId?: string;
  isAdmin?: boolean;
  onSelectExam?: (examId: string) => void;
  onBack: () => void;
  onShareExam?: (exam: Exam) => void;
  onRefresh?: () => Promise<void> | void;
  isRefreshing?: boolean;
  lastSyncedAt?: string | null;
}

type ScoreRangeFilter = 'all' | 'under5' | '5to65' | '65to8' | 'ge8';
type SortOption =
  | 'submitted_desc'
  | 'submitted_asc'
  | 'score_desc'
  | 'score_asc'
  | 'name_asc'
  | 'name_desc'
  | 'class_asc';

function formatDurationCompact(seconds?: number): string {
  const safe = Math.max(0, Math.round(seconds || 0));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return m > 0 ? `${m}p ${s}s` : `${s}s`;
}

export const ExamResults: React.FC<ExamResultsProps> = ({
  exam,
  exams = [],
  submissions,
  currentUserId,
  isAdmin = false,
  onSelectExam,
  onBack,
  onShareExam,
  onRefresh,
  isRefreshing = false,
  lastSyncedAt,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedClass, setSelectedClass] = useState<string>('all');
  const [scoreFilter, setScoreFilter] = useState<ScoreRangeFilter>('all');
  const [sortBy, setSortBy] = useState<SortOption>('submitted_desc');
  const [selectedSubmission, setSelectedSubmission] = useState<StudentSubmission | null>(null);

  const countsBySubmissionId = useMemo(() => {
    const map = new Map<string, { correct: number; wrong: number; unanswered: number }>();
    if (!exam) return map;

    for (const sub of submissions) {
      if (
        typeof sub.correctQuestionsCount === 'number' &&
        typeof sub.wrongQuestionsCount === 'number' &&
        typeof sub.unansweredQuestionsCount === 'number'
      ) {
        map.set(sub.id, {
          correct: sub.correctQuestionsCount,
          wrong: sub.wrongQuestionsCount,
          unanswered: sub.unansweredQuestionsCount,
        });
      } else {
        const evalRes = evaluateExamAttemptDetails(exam, sub.answers || {});
        map.set(sub.id, {
          correct: evalRes.correctCount,
          wrong: evalRes.wrongCount,
          unanswered: evalRes.unansweredCount,
        });
      }
    }
    return map;
  }, [exam, submissions]);

  const filteredAndSortedSubs = useMemo(() => {
    const filtered = submissions.filter((s) => {
      if (selectedClass !== 'all' && s.studentClass !== selectedClass) return false;

      if (scoreFilter === 'under5' && s.totalScore >= 5.0) return false;
      if (scoreFilter === '5to65' && (s.totalScore < 5.0 || s.totalScore >= 6.5)) return false;
      if (scoreFilter === '65to8' && (s.totalScore < 6.5 || s.totalScore >= 8.0)) return false;
      if (scoreFilter === 'ge8' && s.totalScore < 8.0) return false;

      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase().trim();
        const matchName = (s.studentName || '').toLowerCase().includes(term);
        const matchClass = (s.studentClass || '').toLowerCase().includes(term);
        if (!matchName && !matchClass) return false;
      }
      return true;
    });

    return [...filtered].sort((a, b) => {
      switch (sortBy) {
        case 'submitted_asc':
          return (Date.parse(a.submittedAt || '') || 0) - (Date.parse(b.submittedAt || '') || 0);
        case 'score_desc':
          return b.totalScore - a.totalScore || (Date.parse(b.submittedAt || '') || 0) - (Date.parse(a.submittedAt || '') || 0);
        case 'score_asc':
          return a.totalScore - b.totalScore || (Date.parse(b.submittedAt || '') || 0) - (Date.parse(a.submittedAt || '') || 0);
        case 'name_asc':
          return (a.studentName || '').localeCompare(b.studentName || '', 'vi');
        case 'name_desc':
          return (b.studentName || '').localeCompare(a.studentName || '', 'vi');
        case 'class_asc':
          return (
            (a.studentClass || '').localeCompare(b.studentClass || '', 'vi') ||
            (a.studentName || '').localeCompare(b.studentName || '', 'vi')
          );
        case 'submitted_desc':
        default:
          return (Date.parse(b.submittedAt || '') || 0) - (Date.parse(a.submittedAt || '') || 0);
      }
    });
  }, [submissions, selectedClass, scoreFilter, searchTerm, sortBy]);

  if (!exam) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center space-y-4 shadow-xs">
        <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-600 flex items-center justify-center mx-auto">
          <BarChart3 className="w-6 h-6" />
        </div>
        <h2 className="text-lg font-bold text-slate-900">Chưa có đề thi để xem kết quả</h2>
        <p className="text-sm text-slate-600 max-w-md mx-auto">
          Hãy tạo hoặc tải lên một đề thi và mở phòng thi để theo dõi điểm số và thống kê bài làm của học sinh tại đây.
        </p>
        <button
          type="button"
          onClick={onBack}
          className="px-4 py-2.5 min-h-[44px] rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold"
        >
          Quay về Kho đề thi
        </button>
      </div>
    );
  }

  const totalStudents = submissions.length;
  const avgScore =
    totalStudents > 0
      ? (submissions.reduce((acc, s) => acc + s.totalScore, 0) / totalStudents).toFixed(2)
      : '0.00';
  const passCount = submissions.filter((s) => s.totalScore >= 5.0).length;
  const passRate = totalStudents > 0 ? ((passCount / totalStudents) * 100).toFixed(0) : '0';
  const highest = totalStudents > 0 ? Math.max(...submissions.map((s) => s.totalScore)).toFixed(2) : '0.00';
  const lowest = totalStudents > 0 ? Math.min(...submissions.map((s) => s.totalScore)).toFixed(2) : '0.00';

  const dist = {
    under5: submissions.filter((s) => s.totalScore < 5.0).length,
    from5to65: submissions.filter((s) => s.totalScore >= 5.0 && s.totalScore < 6.5).length,
    from65to8: submissions.filter((s) => s.totalScore >= 6.5 && s.totalScore < 8.0).length,
    from8to9: submissions.filter((s) => s.totalScore >= 8.0 && s.totalScore < 9.0).length,
    from9to10: submissions.filter((s) => s.totalScore >= 9.0).length,
  };

  const classes = Array.from(new Set(submissions.map((s) => s.studentClass))).filter(Boolean).sort();
  const normalizedPublicCode = normalizePublicExamCode(exam.publicCode);

  const policy = getEffectiveAnswerReviewConfig(exam);
  const qualifiedCount = policy.allowAnswerReview
    ? submissions.filter((s) => Math.round(s.totalScore * 100) >= Math.round(policy.answerReviewMinScore * 100)).length
    : 0;
  const belowFloorCount = totalStudents - qualifiedCount;

  const handleExport = () => {
    exportExamResultsToExcel(exam, filteredAndSortedSubs.length > 0 ? filteredAndSortedSubs : submissions);
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-xs space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <button
              type="button"
              onClick={onBack}
              className="p-2.5 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-600 transition-colors shrink-0 mt-0.5"
              title="Quay lại kho đề thi"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-xs font-bold px-2.5 py-0.5 rounded-md bg-teal-100 text-teal-800">
                  {exam.code}
                </span>
                {normalizedPublicCode && (
                  <span className="font-mono text-xs font-bold px-2.5 py-0.5 rounded-md bg-blue-100 text-blue-800">
                    Link: /{normalizedPublicCode}
                  </span>
                )}
                {exam.requiresPassword && (
                  <span className="text-xs font-bold px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 inline-flex items-center gap-1">
                    <Lock className="w-3 h-3" />
                    <span>Có mật khẩu</span>
                  </span>
                )}
                <span
                  className={`text-xs font-bold px-2 py-0.5 rounded-md ${
                    policy.allowAnswerReview
                      ? 'bg-indigo-100 text-indigo-800'
                      : 'bg-rose-50 text-rose-700'
                  }`}
                >
                  {policy.allowAnswerReview
                    ? `Điểm sàn xem đáp án: ≥ ${policy.answerReviewMinScore.toFixed(1)}đ`
                    : 'Không mở đáp án'}
                </span>
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 inline-flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span>Đồng bộ trực tiếp</span>
                  {lastSyncedAt && (
                    <span className="text-emerald-800/80 font-mono">
                      ({new Date(lastSyncedAt).toLocaleTimeString('vi-VN')})
                    </span>
                  )}
                </span>
              </div>
              <h1 className="text-xl md:text-2xl font-bold text-slate-900 mt-1.5">
                {exam.title}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            {exams.length > 1 && onSelectExam && (
              <select
                value={exam.id}
                onChange={(e) => {
                  setSelectedSubmission(null);
                  onSelectExam(e.target.value);
                }}
                className="min-h-[42px] px-3 py-2 rounded-xl border border-slate-300 bg-slate-50 text-xs sm:text-sm font-semibold text-slate-800 max-w-[240px]"
              >
                {exams.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.code} — {item.title}
                  </option>
                ))}
              </select>
            )}

            {onRefresh && (
              <button
                type="button"
                onClick={() => void onRefresh()}
                disabled={isRefreshing}
                className="min-h-[42px] px-3.5 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-60 text-slate-700 text-xs sm:text-sm font-semibold transition-all flex items-center gap-1.5"
                title="Làm mới danh sách bài nộp từ Firestore"
              >
                <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-teal-600' : ''}`} />
                <span>{isRefreshing ? 'Đang tải...' : 'Làm mới'}</span>
              </button>
            )}

            {onShareExam && (
              <button
                type="button"
                onClick={() => onShareExam(exam)}
                className="min-h-[42px] px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs sm:text-sm font-semibold shadow-xs transition-all flex items-center gap-1.5"
                title="Lấy link trực tiếp và tạo mã QR cho học sinh"
              >
                <span>Chia sẻ &amp; QR</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleExport}
              className="min-h-[42px] px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-semibold shadow-xs transition-all flex items-center gap-1.5"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Xuất Excel</span>
            </button>
          </div>
        </div>
      </div>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3.5 tabular-nums">
        <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-xs flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shrink-0">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500">Số bài đã nộp</p>
            <p className="text-xl md:text-2xl font-extrabold text-slate-900 mt-0.5">{totalStudents}</p>
            <p className="text-[11px] text-slate-400">thí sinh hoàn thành</p>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-xs flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
            <TrendingUp className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500">Điểm trung bình</p>
            <p className="text-xl md:text-2xl font-extrabold text-slate-900 mt-0.5">
              {avgScore} <span className="text-xs font-normal text-slate-400">/10</span>
            </p>
            <p className="text-[11px] text-indigo-600 font-medium">Toàn bài thi</p>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-xs flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-teal-50 border border-teal-100 flex items-center justify-center text-teal-600 shrink-0">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500">Tỉ lệ đạt (≥ 5.0)</p>
            <p className="text-xl md:text-2xl font-extrabold text-teal-700 mt-0.5">{passRate}%</p>
            <p className="text-[11px] text-slate-500">
              {passCount}/{totalStudents} bài đạt
            </p>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-xs flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 shrink-0">
            <Award className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500">Điểm cao nhất</p>
            <p className="text-xl md:text-2xl font-extrabold text-emerald-600 mt-0.5">{highest}</p>
            <p className="text-[11px] text-slate-400">Thủ khoa bài thi</p>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-xs flex items-center gap-3 col-span-2 md:col-span-1">
          <div className="w-11 h-11 rounded-xl bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-600 shrink-0">
            <TrendingDown className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500">Điểm thấp nhất</p>
            <p className="text-xl md:text-2xl font-extrabold text-rose-600 mt-0.5">{lowest}</p>
            <p className="text-[11px] text-slate-400">Cần phụ đạo thêm</p>
          </div>
        </div>
      </div>

      {policy.allowAnswerReview && (
        <div className="bg-indigo-50/70 border border-indigo-200 rounded-2xl px-5 py-3.5 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-indigo-950 font-semibold">
            <CheckCircle2 className="w-4 h-4 text-indigo-600 shrink-0" />
            <span>
              Điều kiện mở đáp án: Điểm tổng ≥ <b>{policy.answerReviewMinScore.toFixed(1)} điểm</b>
              {policy.answerReviewEnabledAt
                ? ` • Thời điểm mở: ${new Date(policy.answerReviewEnabledAt).toLocaleString('vi-VN')}`
                : ''}
            </span>
          </div>
          <div className="flex items-center gap-3 font-bold tabular-nums">
            <span className="px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-800">
              Đạt điểm sàn: {qualifiedCount}
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-amber-100 text-amber-800">
              Chưa đạt sàn: {belowFloorCount}
            </span>
          </div>
        </div>
      )}

      {/* Score Distribution Chart */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-blue-600" />
          Phổ điểm toàn bài thi
        </h2>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-center tabular-nums">
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

      {/* Submissions Table with Search, Filters & Sorting */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Users className="w-4 h-4 text-blue-600" />
              <span>
                Danh sách học sinh làm bài ({filteredAndSortedSubs.length}
                {filteredAndSortedSubs.length !== totalStudents ? ` / ${totalStudents}` : ''})
              </span>
            </h2>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Nhấp vào tên học sinh hoặc nút &ldquo;Xem chi tiết&rdquo; để phân tích bài làm từng câu hỏi.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {classes.length > 0 && (
              <select
                value={selectedClass}
                onChange={(e) => setSelectedClass(e.target.value)}
                className="text-xs px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 font-medium text-slate-800"
                aria-label="Lọc theo lớp"
              >
                <option value="all">Tất cả các lớp</option>
                {classes.map((c) => (
                  <option key={c} value={c}>
                    Lớp {c}
                  </option>
                ))}
              </select>
            )}

            <select
              value={scoreFilter}
              onChange={(e) => setScoreFilter(e.target.value as ScoreRangeFilter)}
              className="text-xs px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 font-medium text-slate-800"
              aria-label="Lọc theo khoảng điểm"
            >
              <option value="all">Tất cả mức điểm</option>
              <option value="under5">Dưới 5.0 điểm</option>
              <option value="5to65">Từ 5.0 đến 6.49</option>
              <option value="65to8">Từ 6.5 đến 7.99</option>
              <option value="ge8">Từ 8.0 trở lên</option>
            </select>

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className="text-xs px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 font-medium text-slate-800"
              aria-label="Sắp xếp kết quả"
            >
              <option value="submitted_desc">Mới nộp nhất</option>
              <option value="submitted_asc">Nộp sớm nhất</option>
              <option value="score_desc">Điểm cao → thấp</option>
              <option value="score_asc">Điểm thấp → cao</option>
              <option value="name_asc">Tên A → Z</option>
              <option value="name_desc">Tên Z → A</option>
              <option value="class_asc">Theo lớp A → Z</option>
            </select>

            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Tìm tên hoặc lớp..."
                className="pl-8 pr-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[180px]"
              />
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs tabular-nums">
            <thead className="bg-slate-50 text-slate-600 uppercase text-[10px] font-bold border-b border-slate-200">
              <tr>
                <th className="py-3 px-4">STT</th>
                <th className="py-3 px-4">Họ và tên</th>
                <th className="py-3 px-4">Lớp</th>
                <th className="py-3 px-4 text-center">Điểm</th>
                <th className="py-3 px-4 text-center">Đúng</th>
                <th className="py-3 px-4 text-center">Sai</th>
                <th className="py-3 px-4 text-center">Chưa làm</th>
                <th className="py-3 px-4">Thời gian nộp</th>
                <th className="py-3 px-4 text-right">Chi tiết</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredAndSortedSubs.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-10 text-center text-slate-500">
                    {totalStudents === 0
                      ? 'Chưa có bài thi nào được nộp cho đề này.'
                      : 'Không có bài nộp nào khớp với bộ lọc đang chọn.'}
                  </td>
                </tr>
              ) : (
                filteredAndSortedSubs.map((sub, i) => {
                  const counts = countsBySubmissionId.get(sub.id) || {
                    correct: sub.correctQuestionsCount || 0,
                    wrong: sub.wrongQuestionsCount ?? 0,
                    unanswered: sub.unansweredQuestionsCount ?? 0,
                  };

                  let rankBadge = 'bg-slate-100 text-slate-700';
                  let rank = 'Chưa đạt';
                  if (sub.totalScore >= 9.0) {
                    rankBadge = 'bg-emerald-100 text-emerald-800';
                    rank = 'Xuất sắc';
                  } else if (sub.totalScore >= 8.0) {
                    rankBadge = 'bg-indigo-100 text-indigo-800';
                    rank = 'Giỏi';
                  } else if (sub.totalScore >= 6.5) {
                    rankBadge = 'bg-blue-100 text-blue-800';
                    rank = 'Khá';
                  } else if (sub.totalScore >= 5.0) {
                    rankBadge = 'bg-amber-100 text-amber-800';
                    rank = 'Trung bình';
                  }

                  return (
                    <tr key={sub.id} className="hover:bg-slate-50/90 transition-colors group">
                      <td className="py-3 px-4 text-slate-400 font-medium">{i + 1}</td>

                      <td className="py-3 px-4">
                        <button
                          type="button"
                          onClick={() => setSelectedSubmission(sub)}
                          className="text-left font-bold text-slate-900 hover:text-teal-700 transition-colors inline-flex items-center gap-1.5"
                        >
                          <span className="underline decoration-transparent group-hover:decoration-teal-500 underline-offset-2">
                            {sub.studentName}
                          </span>
                        </button>
                        <div className="flex flex-wrap items-center gap-1.5 mt-1">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${rankBadge}`}>
                            {rank}
                          </span>
                          {sub.gradedByServer && (
                            <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">
                              <ShieldCheck className="w-3 h-3" />
                              Máy chủ
                            </span>
                          )}
                          {sub.tabSwitchesCount && sub.tabSwitchesCount > 0 ? (
                            <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-rose-700 bg-rose-50 border border-rose-200 px-1.5 py-0.5 rounded">
                              <AlertTriangle className="w-3 h-3" />
                              Rời màn hình {sub.tabSwitchesCount} lần
                            </span>
                          ) : null}
                        </div>
                      </td>

                      <td className="py-3 px-4 text-slate-700 font-medium">
                        {sub.studentClass || 'Chưa rõ'}
                      </td>

                      <td className="py-3 px-4 text-center">
                        <span className="font-extrabold text-sm text-slate-900 block">
                          {sub.totalScore.toFixed(2)}
                        </span>
                        <span className="text-[10px] text-slate-500 whitespace-nowrap">
                          I: {sub.part1Score.toFixed(2)} · II: {sub.part2Score.toFixed(2)} · III: {sub.part3Score.toFixed(2)}
                        </span>
                      </td>

                      <td className="py-3 px-4 text-center">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-800 font-bold">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
                          <span>{counts.correct}</span>
                        </span>
                      </td>

                      <td className="py-3 px-4 text-center">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-50 border border-rose-200 text-rose-800 font-bold">
                          <XCircle className="w-3 h-3 text-rose-600 shrink-0" />
                          <span>{counts.wrong}</span>
                        </span>
                      </td>

                      <td className="py-3 px-4 text-center">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-slate-700 font-bold">
                          <MinusCircle className="w-3 h-3 text-slate-500 shrink-0" />
                          <span>{counts.unanswered}</span>
                        </span>
                      </td>

                      <td className="py-3 px-4 text-slate-600">
                        <div className="font-medium text-slate-800">
                          {new Date(sub.submittedAt).toLocaleTimeString('vi-VN')}{' '}
                          {new Date(sub.submittedAt).toLocaleDateString('vi-VN')}
                        </div>
                        <div className="text-[10px] text-slate-500">
                          Làm bài: {formatDurationCompact(sub.durationSeconds)}
                          {sub.status === 'timed_out' ? ' • Hết giờ' : ''}
                        </div>
                      </td>

                      <td className="py-3 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => setSelectedSubmission(sub)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-teal-50 hover:bg-teal-600 text-teal-800 hover:text-white border border-teal-200 hover:border-teal-600 text-xs font-bold transition-colors whitespace-nowrap"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Xem chi tiết</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detailed Attempt Inspection Modal */}
      <StudentSubmissionDetailModal
        isOpen={Boolean(selectedSubmission)}
        exam={exam}
        submission={selectedSubmission}
        currentUserId={currentUserId}
        isAdmin={isAdmin}
        onClose={() => setSelectedSubmission(null)}
      />
    </div>
  );
};

