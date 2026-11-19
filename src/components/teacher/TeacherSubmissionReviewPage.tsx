import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Award,
  Calendar,
  CheckCircle2,
  CheckSquare,
  Clock,
  FileText,
  FlaskConical,
  History,
  Info,
  Lock,
  MinusCircle,
  ShieldAlert,
  ShieldCheck,
  Square,
  User as UserIcon,
  XCircle,
} from 'lucide-react';
import {
  Exam,
  QuestionResultStatus,
  StudentSubmission,
  SubmissionQuestionSnapshot,
  SubmissionSnapshotRecord,
} from '../../types';
import { ChemRenderer } from '../../utils/chemRenderer';
import {
  buildSubmissionSnapshotFromExam,
  isMultiSelectQuestion,
  normalizeOptionIdList,
} from '../../utils/gradingEngine';
import { fetchTeacherSubmissionDetailOnServer } from '../../services/examSecurityApi';
import { fetchSubmissionSnapshotFromFirestore } from '../../services/firebase';

export interface TeacherSubmissionReviewPageProps {
  submission: StudentSubmission;
  exam?: Exam;
  currentUserId?: string;
  isAdmin?: boolean;
  onBackToStudentList: () => void;
}

type QuestionFilter = 'all' | QuestionResultStatus;

function formatDuration(seconds: number): string {
  const safe = Math.max(0, Math.round(seconds || 0));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  if (mins === 0) return `${secs} giây`;
  return `${mins} phút ${secs} giây`;
}

function formatDateTime(iso?: string): string {
  if (!iso) return '—';
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return '—';
  return new Date(ms).toLocaleString('vi-VN');
}

function formatScoreValue(val: number): string {
  return Number.isInteger(val) ? val.toFixed(1) : Number(val.toFixed(2)).toString();
}

function getStatusResultLabel(status: QuestionResultStatus): string {
  if (status === 'correct') return 'ĐÚNG';
  if (status === 'incorrect') return 'SAI';
  return 'CHƯA TRẢ LỜI';
}

function getPartLabel(q: SubmissionQuestionSnapshot): string {
  if (q.type === 'part1_multiple_choice' || isMultiSelectQuestion(q)) {
    return 'Phần I (Trắc nghiệm nhiều lựa chọn)';
  }
  if (q.type === 'part1_single_choice') {
    return 'Phần I (Trắc nghiệm một lựa chọn)';
  }
  if (q.type === 'part2_true_false') {
    return 'Phần II (Đúng / Sai nhiều mệnh đề)';
  }
  if (q.shortAnswerConfig?.isNumeric) {
    return 'Phần III (Trả lời ngắn - Số học)';
  }
  return 'Phần III (Trả lời ngắn)';
}

function formatMcqSelectionSummary(
  optionIds: string[],
  options: Array<{ id: string; text: string }> | undefined
): React.ReactNode {
  if (optionIds.length === 0) return 'Chưa trả lời';
  const optMap = new Map((options || []).map((o) => [o.id, o.text]));
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
      {optionIds.map((id, idx) => {
        const text = optMap.get(id);
        return (
          <span key={id} className="inline-flex items-baseline gap-1">
            <strong>{id}</strong>
            {text ? (
              <span>
                (<ChemRenderer text={text} />)
              </span>
            ) : null}
            {idx < optionIds.length - 1 ? <span>;</span> : null}
          </span>
        );
      })}
    </span>
  );
}

export const TeacherSubmissionReviewPage: React.FC<TeacherSubmissionReviewPageProps> = ({
  submission,
  exam,
  currentUserId,
  isAdmin = false,
  onBackToStudentList,
}) => {
  const [statusFilter, setStatusFilter] = useState<QuestionFilter>('all');
  const [snapshot, setSnapshot] = useState<SubmissionSnapshotRecord | null>(null);
  const [examModifiedAfterAttempt, setExamModifiedAfterAttempt] = useState(false);
  const [isLegacyReconstructed, setIsLegacyReconstructed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [isForbidden, setIsForbidden] = useState(false);
  const [highlightedOrder, setHighlightedOrder] = useState<number | null>(null);

  useEffect(() => {
    setStatusFilter('all');
    setHighlightedOrder(null);
  }, [submission.id]);

  useEffect(() => {
    let cancelled = false;

    const loadDetail = async () => {
      setIsLoading(true);
      setErrorBanner(null);
      setIsForbidden(false);

      // Client-side ownership guard as defense-in-depth
      const targetOwnerId = submission.ownerId || exam?.ownerId;
      if (!isAdmin && currentUserId && targetOwnerId && targetOwnerId !== currentUserId) {
        if (!cancelled) {
          setIsForbidden(true);
          setSnapshot(null);
          setIsLoading(false);
        }
        return;
      }

      // 1. Server-authoritative teacher detail endpoint
      const serverRes = await fetchTeacherSubmissionDetailOnServer(submission.id);
      if (cancelled) return;

      if (serverRes.ok && serverRes.snapshot) {
        setSnapshot(serverRes.snapshot);
        setExamModifiedAfterAttempt(Boolean(serverRes.examModifiedAfterAttempt));
        setIsLegacyReconstructed(Boolean(serverRes.isLegacyReconstructed));
        setIsLoading(false);
        return;
      }

      // Strictly respect RBAC / auth errors — never mask with local fallback
      if (serverRes.code === 'FORBIDDEN' || serverRes.code === 'AUTH_ERROR') {
        setIsForbidden(true);
        setErrorBanner(
          serverRes.error || 'Bạn không có quyền xem chi tiết bài làm của học sinh này.'
        );
        setSnapshot(null);
        setIsLoading(false);
        return;
      }

      // 2. Direct teacher-readable Firestore snapshot collection fallback
      const remoteSnapshot = await fetchSubmissionSnapshotFromFirestore(submission.id);
      if (cancelled) return;

      if (remoteSnapshot && Array.isArray(remoteSnapshot.questionResults) && remoteSnapshot.questionResults.length > 0) {
        const modified = Boolean(
          remoteSnapshot.examVersionUpdatedAt &&
            exam?.updatedAt &&
            remoteSnapshot.examVersionUpdatedAt !== exam.updatedAt
        );
        setSnapshot(remoteSnapshot);
        setExamModifiedAfterAttempt(modified);
        setIsLegacyReconstructed(Boolean(remoteSnapshot.isLegacyReconstructed));
        setIsLoading(false);
        return;
      }

      // 3. Last-resort fallback for local previews / legacy attempts using current exam definition
      if (exam && Array.isArray(exam.questions) && exam.questions.length > 0) {
        const rebuilt = buildSubmissionSnapshotFromExam(exam, submission, {
          isLegacyReconstructed: !submission.hasSubmissionSnapshot,
        });
        const modified = Boolean(
          submission.examVersionUpdatedAt &&
            exam.updatedAt &&
            submission.examVersionUpdatedAt !== exam.updatedAt
        );
        setSnapshot(rebuilt);
        setExamModifiedAfterAttempt(modified);
        setIsLegacyReconstructed(!submission.hasSubmissionSnapshot);
        setIsLoading(false);
        return;
      }

      setErrorBanner(
        serverRes.error || 'Không thể tải dữ liệu chi tiết bài làm từ máy chủ hoặc Firestore.'
      );
      setIsLoading(false);
    };

    void loadDetail();
    return () => {
      cancelled = true;
    };
  }, [submission, exam, currentUserId, isAdmin]);

  const metrics = useMemo(() => {
    if (!snapshot) {
      return {
        totalQuestions: 0,
        correctCount: 0,
        wrongCount: 0,
        unansweredCount: 0,
        accuracyPercent: 0,
        wrongOrders: [] as number[],
        unansweredOrders: [] as number[],
      };
    }

    const questions = snapshot.questionResults || [];
    const correctCount = questions.filter((q) => q.status === 'correct').length;
    const wrongOrders = questions.filter((q) => q.status === 'incorrect').map((q) => q.orderIndex);
    const unansweredOrders = questions
      .filter((q) => q.status === 'unanswered')
      .map((q) => q.orderIndex);
    const totalQuestions = questions.length;
    const accuracyPercent =
      totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 1000) / 10 : 0;

    return {
      totalQuestions,
      correctCount,
      wrongCount: wrongOrders.length,
      unansweredCount: unansweredOrders.length,
      accuracyPercent,
      wrongOrders,
      unansweredOrders,
    };
  }, [snapshot]);

  const filteredQuestions = useMemo(() => {
    if (!snapshot) return [];
    const list = snapshot.questionResults || [];
    if (statusFilter === 'all') return list;
    return list.filter((q) => q.status === statusFilter);
  }, [snapshot, statusFilter]);

  const jumpToQuestion = (orderIndex: number) => {
    setStatusFilter('all');
    setHighlightedOrder(orderIndex);
    setTimeout(() => {
      const el = document.getElementById(`teacher-review-q-${orderIndex}`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 50);
    setTimeout(() => {
      setHighlightedOrder((prev) => (prev === orderIndex ? null : prev));
    }, 2200);
  };

  const displaySub = snapshot || submission;
  const maxPossibleScore = displaySub.maxPossibleScore || exam?.totalScore || 10.0;

  return (
    <div className="space-y-6 pb-8">
      {/* Top Navigation & Identity Banner */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-xs space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
          <button
            type="button"
            onClick={onBackToStudentList}
            className="inline-flex items-center gap-2 px-4 py-2.5 min-h-[42px] rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs sm:text-sm font-bold transition-colors self-start"
          >
            <ArrowLeft className="w-4 h-4 text-slate-600" />
            <span>Quay lại danh sách học sinh</span>
          </button>

          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs font-bold px-2.5 py-1 rounded-lg bg-teal-50 text-teal-800 border border-teal-200">
              Mã đề: {displaySub.examCode}
            </span>
            {displaySub.publicCode && (
              <span className="font-mono text-xs font-bold px-2.5 py-1 rounded-lg bg-blue-50 text-blue-800 border border-blue-200">
                Link: /{displaySub.publicCode}
              </span>
            )}
            {displaySub.variantCode && (
              <span className="font-mono text-xs font-bold px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-800 border border-indigo-200">
                Mã đề riêng: {displaySub.variantCode}
              </span>
            )}
            {submission.gradedByServer && (
              <span className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                <span>Chấm &amp; lưu từ máy chủ</span>
              </span>
            )}
          </div>
        </div>

        {/* Student + Score Header */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div className="flex items-start gap-3.5 min-w-0">
            <div className="w-12 h-12 rounded-2xl bg-teal-600 text-white flex items-center justify-center shrink-0 shadow-xs">
              <UserIcon className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-wider text-teal-700">
                Phân tích chi tiết bài làm học sinh
              </p>
              <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 mt-0.5 truncate">
                {displaySub.studentName}{' '}
                <span className="text-base font-bold text-slate-500">
                  • Lớp {displaySub.studentClass || 'Chưa rõ'}
                </span>
              </h1>
              <p className="text-sm font-semibold text-slate-700 mt-1">
                Đề thi: <span className="text-slate-900">{displaySub.examTitle}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4 bg-slate-900 text-white px-5 py-3.5 rounded-2xl shrink-0 tabular-nums self-start lg:self-auto">
            <div>
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-300 block">
                Điểm tổng kết
              </span>
              <div className="flex items-baseline gap-1 mt-0.5">
                <span className="text-3xl font-black text-teal-400">
                  {displaySub.totalScore.toFixed(2)}
                </span>
                <span className="text-sm font-bold text-slate-400">
                  / {maxPossibleScore.toFixed(1)}
                </span>
              </div>
            </div>
            <div className="h-10 w-px bg-slate-700" />
            <div className="text-xs space-y-0.5 text-slate-200">
              <div>
                Phần I: <strong className="text-white">{displaySub.part1Score.toFixed(2)}đ</strong>
              </div>
              <div>
                Phần II: <strong className="text-white">{displaySub.part2Score.toFixed(2)}đ</strong>
              </div>
              <div>
                Phần III: <strong className="text-white">{displaySub.part3Score.toFixed(2)}đ</strong>
              </div>
            </div>
          </div>
        </div>

        {/* Attempt Metadata Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs tabular-nums">
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80">
            <span className="text-slate-500 flex items-center gap-1.5 text-[11px] font-medium">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              Bắt đầu làm bài
            </span>
            <p className="font-bold text-slate-900 mt-1">{formatDateTime(displaySub.startedAt)}</p>
          </div>
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80">
            <span className="text-slate-500 flex items-center gap-1.5 text-[11px] font-medium">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              Thời điểm nộp bài
            </span>
            <p className="font-bold text-slate-900 mt-1">{formatDateTime(displaySub.submittedAt)}</p>
          </div>
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80">
            <span className="text-slate-500 flex items-center gap-1.5 text-[11px] font-medium">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              Thời gian làm bài
            </span>
            <p className="font-bold text-slate-900 mt-1">
              {formatDuration(displaySub.durationSeconds)}
            </p>
          </div>
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80">
            <span className="text-slate-500 flex items-center gap-1.5 text-[11px] font-medium">
              <ShieldAlert className="w-3.5 h-3.5 text-slate-400" />
              Giám sát phòng thi
            </span>
            <p className="font-bold text-slate-900 mt-1">
              Rời màn hình {displaySub.tabSwitchesCount || 0} lần •{' '}
              {displaySub.status === 'timed_out' ? 'Hết giờ tự nộp' : 'Đã nộp'}
            </p>
          </div>
        </div>
      </div>

      {/* Versioning & Integrity Notices */}
      {examModifiedAfterAttempt && (
        <div className="bg-amber-50 border border-amber-300 rounded-2xl px-5 py-3.5 flex items-start gap-3 text-xs text-amber-950">
          <History className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-amber-900">
              Đề thi đã được chỉnh sửa sau thời điểm học sinh nộp bài
            </p>
            <p className="text-amber-800 mt-0.5">
              Trang này đang hiển thị nguyên trạng phiên bản câu hỏi, lựa chọn và đáp án đúng tại thời điểm học sinh thực hiện bài thi (Snapshot bất biến).
            </p>
          </div>
        </div>
      )}

      {isLegacyReconstructed && (
        <div className="bg-blue-50 border border-blue-200 rounded-2xl px-5 py-3.5 flex items-start gap-3 text-xs text-blue-950">
          <Info className="w-4 h-4 text-blue-700 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-blue-900">
              Bài làm cũ được tái dựng từ dữ liệu đã lưu
            </p>
            <p className="text-blue-800 mt-0.5">
              Lượt nộp này được tạo trước khi bật snapshot tự động. Các câu học sinh không chọn được giữ nguyên là &ldquo;Chưa trả lời&rdquo;, hệ thống không suy đoán dữ liệu bị thiếu.
            </p>
          </div>
        </div>
      )}

      {/* Loading / Error / Forbidden States */}
      {isLoading ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center space-y-3 shadow-xs">
          <div className="w-8 h-8 border-2 border-teal-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm font-semibold text-slate-700">
            Đang tải chi tiết từng câu hỏi bài làm của học sinh...
          </p>
        </div>
      ) : isForbidden ? (
        <div className="bg-white border border-rose-200 rounded-2xl p-10 text-center space-y-3 shadow-xs">
          <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto">
            <Lock className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-extrabold text-slate-900">Không có quyền truy cập bài làm</h2>
          <p className="text-xs sm:text-sm text-slate-600 max-w-lg mx-auto">
            {errorBanner ||
              'Chỉ giáo viên sở hữu đề thi hoặc Quản trị viên mới được phép xem phân tích bài làm chi tiết của học sinh.'}
          </p>
          <button
            type="button"
            onClick={onBackToStudentList}
            className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold"
          >
            Quay lại danh sách học sinh
          </button>
        </div>
      ) : errorBanner && !snapshot ? (
        <div className="bg-white border border-rose-200 rounded-2xl p-8 text-center space-y-3 shadow-xs">
          <AlertTriangle className="w-8 h-8 text-rose-600 mx-auto" />
          <h2 className="text-base font-bold text-slate-900">Không thể tải dữ liệu bài làm</h2>
          <p className="text-xs text-slate-600 max-w-lg mx-auto">{errorBanner}</p>
        </div>
      ) : snapshot ? (
        <>
          {/* Summary Analytics + Clickable Wrong/Unanswered Lists */}
          <section className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-xs space-y-5">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                <Award className="w-4 h-4 text-teal-600" />
                <span>Tổng hợp kết quả bài làm ({metrics.totalQuestions} câu hỏi)</span>
              </h2>

              {/* 4 Required Status Filter Buttons */}
              <div className="flex flex-wrap items-center gap-2 text-xs">
                {(
                  [
                    {
                      id: 'all',
                      label: `TẤT CẢ CÂU HỎI (${metrics.totalQuestions})`,
                      activeClass: 'bg-slate-900 text-white border-slate-900',
                    },
                    {
                      id: 'incorrect',
                      label: `CÂU TRẢ LỜI SAI (${metrics.wrongCount})`,
                      activeClass: 'bg-rose-600 text-white border-rose-600',
                    },
                    {
                      id: 'unanswered',
                      label: `CÂU CHƯA TRẢ LỜI (${metrics.unansweredCount})`,
                      activeClass: 'bg-slate-700 text-white border-slate-700',
                    },
                    {
                      id: 'correct',
                      label: `CÂU TRẢ LỜI ĐÚNG (${metrics.correctCount})`,
                      activeClass: 'bg-emerald-600 text-white border-emerald-600',
                    },
                  ] as const
                ).map((btn) => {
                  const isActive = statusFilter === btn.id;
                  return (
                    <button
                      key={btn.id}
                      type="button"
                      onClick={() => setStatusFilter(btn.id)}
                      className={`px-3.5 py-2 rounded-xl border font-bold tracking-wide transition-colors tabular-nums ${
                        isActive
                          ? btn.activeClass
                          : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      {btn.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 5 Summary Stat Boxes */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs tabular-nums">
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center gap-3">
                <FileText className="w-5 h-5 text-slate-600 shrink-0" />
                <div>
                  <span className="text-slate-600 font-semibold block">Tổng số câu</span>
                  <span className="text-lg font-extrabold text-slate-900">
                    {metrics.totalQuestions}
                  </span>
                </div>
              </div>
              <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0" />
                <div>
                  <span className="text-emerald-800 font-semibold block">Số câu đúng</span>
                  <span className="text-lg font-extrabold text-emerald-950">
                    {metrics.correctCount}
                  </span>
                </div>
              </div>
              <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 flex items-center gap-3">
                <XCircle className="w-5 h-5 text-rose-700 shrink-0" />
                <div>
                  <span className="text-rose-800 font-semibold block">Số câu sai</span>
                  <span className="text-lg font-extrabold text-rose-950">{metrics.wrongCount}</span>
                </div>
              </div>
              <div className="p-3.5 rounded-xl bg-slate-100 border border-slate-200 flex items-center gap-3">
                <MinusCircle className="w-5 h-5 text-slate-600 shrink-0" />
                <div>
                  <span className="text-slate-700 font-semibold block">Chưa trả lời</span>
                  <span className="text-lg font-extrabold text-slate-900">
                    {metrics.unansweredCount}
                  </span>
                </div>
              </div>
              <div className="p-3.5 rounded-xl bg-blue-50 border border-blue-200 flex items-center gap-3 col-span-2 sm:col-span-1">
                <Award className="w-5 h-5 text-blue-700 shrink-0" />
                <div>
                  <span className="text-blue-800 font-semibold block">Tỉ lệ đúng</span>
                  <span className="text-lg font-extrabold text-blue-950">
                    {metrics.accuracyPercent}%
                  </span>
                </div>
              </div>
            </div>

            {/* Dedicated Wrong / Unanswered Jump Navigation Panel */}
            <div className="pt-4 border-t border-slate-100 space-y-3">
              <div className="p-3.5 rounded-xl bg-rose-50/70 border border-rose-200 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-extrabold uppercase tracking-wider text-rose-900 flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-rose-600" />
                    <span>DANH SÁCH CÂU HỌC SINH LÀM SAI ({metrics.wrongOrders.length} câu)</span>
                  </span>
                  {metrics.wrongOrders.length > 0 && (
                    <span className="text-[11px] font-medium text-rose-700">
                      Nhấn vào số câu để cuộn tới câu hỏi đó
                    </span>
                  )}
                </div>

                {metrics.wrongOrders.length === 0 ? (
                  <p className="text-xs font-semibold text-emerald-700">
                    Học sinh không làm sai câu nào.
                  </p>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    {metrics.wrongOrders.map((ord) => (
                      <button
                        key={`wrong-chip-${ord}`}
                        type="button"
                        onClick={() => jumpToQuestion(ord)}
                        className="px-3 py-1.5 rounded-lg bg-white hover:bg-rose-600 text-rose-800 hover:text-white border border-rose-300 font-mono text-xs font-bold transition-colors shadow-2xs tabular-nums"
                      >
                        Câu {ord}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {metrics.unansweredOrders.length > 0 && (
                <div className="p-3.5 rounded-xl bg-slate-100/80 border border-slate-200 space-y-2">
                  <span className="text-xs font-extrabold uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                    <MinusCircle className="w-4 h-4 text-slate-600" />
                    <span>CÂU CHƯA TRẢ LỜI ({metrics.unansweredOrders.length} câu)</span>
                  </span>
                  <div className="flex flex-wrap items-center gap-2">
                    {metrics.unansweredOrders.map((ord) => (
                      <button
                        key={`unanswered-chip-${ord}`}
                        type="button"
                        onClick={() => jumpToQuestion(ord)}
                        className="px-3 py-1.5 rounded-lg bg-white hover:bg-slate-800 text-slate-800 hover:text-white border border-slate-300 font-mono text-xs font-bold transition-colors shadow-2xs tabular-nums"
                      >
                        Câu {ord}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* Per-Question Detailed Breakdown */}
          <section className="space-y-4">
            <div className="flex items-center justify-between gap-2 px-1">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                <FileText className="w-4 h-4 text-blue-600" />
                <span>
                  Chi tiết toàn bộ bài làm ({filteredQuestions.length} câu đang hiển thị)
                </span>
              </h2>
            </div>

            {filteredQuestions.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center space-y-3">
                <p className="text-sm font-semibold text-slate-600">
                  Không có câu hỏi nào thuộc nhóm bộ lọc đã chọn.
                </p>
                <button
                  type="button"
                  onClick={() => setStatusFilter('all')}
                  className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold"
                >
                  Hiển thị tất cả câu hỏi
                </button>
              </div>
            ) : (
              filteredQuestions.map((q) => {
                const isMulti = q.type === 'part1_multiple_choice' || isMultiSelectQuestion(q);
                const isMcq = q.type === 'part1_single_choice' || isMulti;

                const selectedIds = normalizeOptionIdList([
                  ...(q.studentAnswer?.selectedOptionIds || []),
                  ...(q.studentAnswer?.selectedOptionId ? [q.studentAnswer.selectedOptionId] : []),
                ]);

                const correctIdsFromOptions = Array.isArray(q.options)
                  ? q.options.filter((o) => o.isCorrect).map((o) => o.id)
                  : [];
                const correctIds = normalizeOptionIdList([
                  ...(q.correctOptionIds || []),
                  ...(q.correctOptionId ? [q.correctOptionId] : []),
                  ...correctIdsFromOptions,
                ]);

                const borderClass =
                  q.status === 'correct'
                    ? 'border-emerald-300'
                    : q.status === 'unanswered'
                    ? 'border-slate-300'
                    : 'border-rose-300';

                const ringClass =
                  highlightedOrder === q.orderIndex ? 'ring-4 ring-teal-400/60' : '';

                const resultLabel = getStatusResultLabel(q.status);

                return (
                  <article
                    key={`${q.questionId}_${q.orderIndex}`}
                    id={`teacher-review-q-${q.orderIndex}`}
                    className={`bg-white border-2 ${borderClass} ${ringClass} rounded-2xl p-5 sm:p-6 shadow-2xs space-y-4 transition-shadow`}
                  >
                    {/* Question Header: CÂU N. <Nội dung câu hỏi> + Status + Score */}
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 pb-3 border-b border-slate-100">
                      <div className="space-y-2 min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="px-2.5 py-1 rounded-lg bg-slate-900 text-white font-mono text-xs font-extrabold tabular-nums">
                            CÂU {q.orderIndex}
                          </span>
                          {q.questionCode && (
                            <span className="font-mono text-[11px] font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                              {q.questionCode}
                            </span>
                          )}
                          <span className="text-[11px] font-bold px-2.5 py-0.5 rounded bg-blue-50 text-blue-800 border border-blue-200">
                            {getPartLabel(q)}
                          </span>
                        </div>

                        <div className="text-base font-semibold text-slate-900 leading-relaxed">
                          <span className="font-extrabold text-slate-950 mr-1.5">
                            CÂU {q.orderIndex}.
                          </span>
                          <ChemRenderer text={q.content} />
                        </div>
                      </div>

                      <div className="flex sm:flex-col items-center sm:items-end justify-between gap-2 shrink-0 tabular-nums">
                        {q.status === 'correct' ? (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-emerald-100 text-emerald-900 border border-emerald-300 text-xs font-extrabold">
                            <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                            <span>ĐÚNG</span>
                          </span>
                        ) : q.status === 'unanswered' ? (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-slate-100 text-slate-700 border border-slate-300 text-xs font-extrabold">
                            <MinusCircle className="w-4 h-4 text-slate-500" />
                            <span>CHƯA TRẢ LỜI</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-rose-100 text-rose-900 border border-rose-300 text-xs font-extrabold">
                            <XCircle className="w-4 h-4 text-rose-700" />
                            <span>
                              {q.type === 'part2_true_false' &&
                              typeof q.correctStatementsCount === 'number' &&
                              q.correctStatementsCount > 0
                                ? `SAI (đúng ${q.correctStatementsCount}/${q.totalStatementsCount || 4} ý)`
                                : 'SAI'}
                            </span>
                          </span>
                        )}

                        <span className="text-xs font-bold text-slate-700 bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-lg">
                          Điểm câu hỏi:{' '}
                          <strong className="text-slate-950">
                            {formatScoreValue(q.earnedScore)}/{formatScoreValue(q.maxScore)}
                          </strong>
                        </span>
                      </div>
                    </div>

                    {/* Question Image */}
                    {q.imageUrl && (
                      <div className="rounded-xl overflow-hidden border border-slate-200 bg-slate-50 p-2 max-w-lg">
                        <img
                          src={q.imageUrl}
                          alt={`Hình minh họa Câu ${q.orderIndex}`}
                          className="w-full max-h-80 object-contain rounded-lg"
                        />
                      </div>
                    )}

                    {/* Part I Single / Multi-Select Options with Full Content */}
                    {isMcq && Array.isArray(q.options) && (
                      <div className="space-y-3">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 text-sm">
                          {q.options.map((opt) => {
                            const isPicked = selectedIds.includes(opt.id);
                            const isCorrect = correctIds.includes(opt.id) || Boolean(opt.isCorrect);

                            let cardClass = 'bg-slate-50 border-slate-200 text-slate-800';
                            if (isCorrect) {
                              cardClass =
                                'bg-emerald-50 border-emerald-400 text-emerald-950 font-semibold';
                            } else if (isPicked && !isCorrect) {
                              cardClass =
                                'bg-rose-50 border-rose-400 text-rose-950 font-semibold';
                            }

                            return (
                              <div
                                key={opt.id}
                                className={`p-3 rounded-xl border-2 flex items-start justify-between gap-2.5 ${cardClass}`}
                              >
                                <div className="flex items-start gap-2 min-w-0">
                                  {isMulti ? (
                                    isPicked ? (
                                      <CheckSquare
                                        className={`w-4 h-4 mt-0.5 shrink-0 ${
                                          isCorrect ? 'text-emerald-700' : 'text-rose-700'
                                        }`}
                                      />
                                    ) : (
                                      <Square className="w-4 h-4 mt-0.5 shrink-0 text-slate-400" />
                                    )
                                  ) : null}
                                  <span className="font-extrabold shrink-0">{opt.id}.</span>
                                  <div className="min-w-0 leading-relaxed">
                                    <ChemRenderer text={opt.text} />
                                  </div>
                                </div>

                                <div className="flex flex-col items-end gap-1 shrink-0">
                                  {isPicked && (
                                    <span
                                      className={`text-[10px] px-2 py-0.5 rounded font-extrabold whitespace-nowrap ${
                                        isCorrect
                                          ? 'bg-emerald-200 text-emerald-950'
                                          : 'bg-rose-200 text-rose-950'
                                      }`}
                                    >
                                      HS chọn
                                    </span>
                                  )}
                                  {isCorrect && (
                                    <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-600 text-white font-extrabold whitespace-nowrap">
                                      Đáp án đúng
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {/* Explicit Student Pick vs Correct Key vs Result Box */}
                        <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5 text-xs sm:text-sm">
                          <div>
                            <span className="font-semibold text-slate-600">
                              Đáp án học sinh chọn:{' '}
                            </span>
                            <span
                              className={
                                q.status === 'correct'
                                  ? 'font-bold text-emerald-700'
                                  : q.status === 'unanswered'
                                  ? 'font-bold text-slate-500'
                                  : 'font-bold text-rose-700'
                              }
                            >
                              {formatMcqSelectionSummary(selectedIds, q.options)}
                            </span>
                          </div>
                          <div>
                            <span className="font-semibold text-slate-600">Đáp án đúng: </span>
                            <span className="font-bold text-emerald-700">
                              {correctIds.length > 0
                                ? formatMcqSelectionSummary(correctIds, q.options)
                                : '—'}
                            </span>
                          </div>
                          <div>
                            <span className="font-semibold text-slate-600">Kết quả: </span>
                            <span
                              className={`font-extrabold ${
                                q.status === 'correct'
                                  ? 'text-emerald-700'
                                  : q.status === 'unanswered'
                                  ? 'text-slate-600'
                                  : 'text-rose-700'
                              }`}
                            >
                              {resultLabel}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Part II True / False Multi-Statement */}
                    {q.type === 'part2_true_false' && (
                      <div className="space-y-3">
                        <div className="overflow-x-auto rounded-xl border border-slate-200">
                          <table className="w-full text-left text-xs sm:text-sm">
                            <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                              <tr>
                                <th className="py-2.5 px-3 w-12">Ý</th>
                                <th className="py-2.5 px-3">Nội dung mệnh đề</th>
                                <th className="py-2.5 px-3 w-32 text-center">HS chọn</th>
                                <th className="py-2.5 px-3 w-32 text-center">Đáp án đúng</th>
                                <th className="py-2.5 px-3 w-28 text-center">Kết quả</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {(q.statementDetails || []).map((st) => {
                                const studentLabel =
                                  st.studentChoice === undefined
                                    ? 'Chưa trả lời'
                                    : st.studentChoice
                                    ? 'Đúng'
                                    : 'Sai';
                                const keyLabel = st.correctAnswer ? 'Đúng' : 'Sai';

                                return (
                                  <tr
                                    key={st.statementId}
                                    className={
                                      st.isCorrect
                                        ? 'bg-emerald-50/50'
                                        : st.studentChoice === undefined
                                        ? 'bg-slate-50/60'
                                        : 'bg-rose-50/50'
                                    }
                                  >
                                    <td className="py-2.5 px-3 font-extrabold text-indigo-700 align-top">
                                      {st.statementId})
                                    </td>
                                    <td className="py-2.5 px-3 text-slate-900 align-top leading-relaxed">
                                      <ChemRenderer text={st.statementText} />
                                    </td>
                                    <td className="py-2.5 px-3 text-center font-bold align-top">
                                      <span
                                        className={
                                          st.studentChoice === undefined
                                            ? 'text-slate-500'
                                            : st.isCorrect
                                            ? 'text-emerald-700'
                                            : 'text-rose-700'
                                        }
                                      >
                                        {studentLabel}
                                      </span>
                                    </td>
                                    <td className="py-2.5 px-3 text-center font-extrabold text-emerald-800 align-top">
                                      {keyLabel}
                                    </td>
                                    <td className="py-2.5 px-3 text-center align-top">
                                      {st.isCorrect ? (
                                        <span className="inline-flex items-center gap-1 text-emerald-700 font-bold">
                                          <CheckCircle2 className="w-3.5 h-3.5" />
                                          <span>ĐÚNG</span>
                                        </span>
                                      ) : st.studentChoice === undefined ? (
                                        <span className="inline-flex items-center gap-1 text-slate-500 font-semibold">
                                          <MinusCircle className="w-3.5 h-3.5" />
                                          <span>Chưa trả lời</span>
                                        </span>
                                      ) : (
                                        <span className="inline-flex items-center gap-1 text-rose-700 font-bold">
                                          <XCircle className="w-3.5 h-3.5" />
                                          <span>SAI</span>
                                        </span>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>

                        <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs sm:text-sm">
                          <div>
                            <span className="font-semibold text-slate-600">Số mệnh đề đúng: </span>
                            <strong className="text-slate-950">
                              {q.correctStatementsCount ?? 0} /{' '}
                              {q.totalStatementsCount || (q.statementDetails || []).length || 4} ý
                            </strong>
                          </div>
                          <div>
                            <span className="font-semibold text-slate-600">Kết quả: </span>
                            <span
                              className={`font-extrabold ${
                                q.status === 'correct'
                                  ? 'text-emerald-700'
                                  : q.status === 'unanswered'
                                  ? 'text-slate-600'
                                  : 'text-rose-700'
                              }`}
                            >
                              {resultLabel}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Part III Short Answer (Text & Numeric) */}
                    {q.type === 'part3_short_answer' && (
                      <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5 text-xs sm:text-sm">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div
                            className={`p-3 rounded-xl border ${
                              q.status === 'correct'
                                ? 'bg-emerald-50 border-emerald-300'
                                : q.status === 'unanswered'
                                ? 'bg-white border-slate-200'
                                : 'bg-rose-50 border-rose-300'
                            }`}
                          >
                            <span className="text-xs font-semibold text-slate-600 block">
                              Đáp án học sinh chọn / nhập:
                            </span>
                            <span
                              className={`font-mono text-base font-extrabold mt-1 inline-block ${
                                q.status === 'correct'
                                  ? 'text-emerald-800'
                                  : q.status === 'unanswered'
                                  ? 'text-slate-500'
                                  : 'text-rose-800'
                              }`}
                            >
                              {q.studentAnswer?.textAnswer?.trim() || 'Chưa trả lời'}
                            </span>
                          </div>

                          <div className="p-3 rounded-xl border bg-emerald-50 border-emerald-300">
                            <span className="text-xs font-semibold text-emerald-900 block">
                              Đáp án đúng:
                            </span>
                            <span className="font-mono text-base font-extrabold text-emerald-950 mt-1 inline-block">
                              {q.shortAnswerConfig?.isNumeric &&
                              typeof q.shortAnswerConfig.numericValue === 'number' ? (
                                <>
                                  {q.shortAnswerConfig.numericValue}
                                  {typeof q.shortAnswerConfig.tolerance === 'number' &&
                                  q.shortAnswerConfig.tolerance > 0
                                    ? ` (± ${q.shortAnswerConfig.tolerance})`
                                    : ''}
                                  {q.shortAnswerConfig.unit ? ` ${q.shortAnswerConfig.unit}` : ''}
                                  {q.shortAnswerConfig.acceptableAnswers?.length
                                    ? ` · [${q.shortAnswerConfig.acceptableAnswers.join(' / ')}]`
                                    : ''}
                                </>
                              ) : q.shortAnswerConfig?.acceptableAnswers?.length ? (
                                <>
                                  {q.shortAnswerConfig.acceptableAnswers.join(' / ')}
                                  {q.shortAnswerConfig.unit ? ` (${q.shortAnswerConfig.unit})` : ''}
                                </>
                              ) : (
                                '—'
                              )}
                            </span>
                          </div>
                        </div>

                        <div>
                          <span className="font-semibold text-slate-600">Kết quả: </span>
                          <span
                            className={`font-extrabold ${
                              q.status === 'correct'
                                ? 'text-emerald-700'
                                : q.status === 'unanswered'
                                ? 'text-slate-600'
                                : 'text-rose-700'
                            }`}
                          >
                            {resultLabel}
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Explanation */}
                    {q.explanation && (
                      <div className="p-3.5 rounded-xl bg-blue-50/70 border border-blue-200/80 text-xs sm:text-sm text-blue-950">
                        <p className="font-bold text-blue-900 flex items-center gap-1.5 mb-1">
                          <FlaskConical className="w-4 h-4 text-blue-600" />
                          <span>Hướng dẫn giải / Ghi chú đáp án:</span>
                        </p>
                        <ChemRenderer text={q.explanation} />
                      </div>
                    )}
                  </article>
                );
              })
            )}
          </section>
        </>
      ) : null}
    </div>
  );
};
