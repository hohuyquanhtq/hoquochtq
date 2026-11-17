import React, { useEffect, useMemo, useState } from 'react';
import {
  X,
  CheckCircle2,
  XCircle,
  MinusCircle,
  User as UserIcon,
  Clock,
  Calendar,
  Award,
  AlertTriangle,
  ShieldAlert,
  FileText,
  FlaskConical,
  Lock,
} from 'lucide-react';
import { Exam, QuestionEvaluationDetail, QuestionResultStatus, StudentSubmission } from '../../types';
import { evaluateExamAttemptDetails } from '../../utils/gradingEngine';
import { ChemRenderer } from '../../utils/chemRenderer';

interface StudentSubmissionDetailModalProps {
  isOpen: boolean;
  exam: Exam;
  submission: StudentSubmission | null;
  currentUserId?: string;
  isAdmin?: boolean;
  onClose: () => void;
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

export const StudentSubmissionDetailModal: React.FC<StudentSubmissionDetailModalProps> = ({
  isOpen,
  exam,
  submission,
  currentUserId,
  isAdmin = false,
  onClose,
}) => {
  const [statusFilter, setStatusFilter] = useState<QuestionFilter>('all');

  useEffect(() => {
    setStatusFilter('all');
  }, [submission?.id, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  const evaluation = useMemo(() => {
    if (!submission) return null;
    return evaluateExamAttemptDetails(exam, submission.answers || {});
  }, [exam, submission]);

  if (!isOpen || !submission || !evaluation) return null;

  // Ownership check: strictly scope attempt inspection to owning teacher or admin
  const hasPermission =
    isAdmin ||
    !exam.ownerId ||
    !currentUserId ||
    exam.ownerId === currentUserId;

  const questionsMap = new Map((exam.questions || []).map((q) => [q.id, q]));

  const filteredDetails = evaluation.details.filter((d) => {
    if (statusFilter === 'all') return true;
    return d.status === statusFilter;
  });

  const jumpToQuestion = (order: number) => {
    setStatusFilter('all');
    setTimeout(() => {
      const el = document.getElementById(`attempt-q-${order}`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 40);
  };

  const renderStatusBadge = (detail: QuestionEvaluationDetail) => {
    if (detail.status === 'correct') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-900 border border-emerald-200 text-xs font-bold">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
          <span>Đúng</span>
        </span>
      );
    }
    if (detail.status === 'unanswered') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 border border-slate-200 text-xs font-bold">
          <MinusCircle className="w-3.5 h-3.5 text-slate-500 shrink-0" />
          <span>Chưa làm</span>
        </span>
      );
    }
    const partialText =
      detail.type === 'part2_true_false' &&
      typeof detail.correctStatementsCount === 'number' &&
      detail.correctStatementsCount > 0
        ? `Sai (đúng ${detail.correctStatementsCount}/${detail.totalStatementsCount || 4} ý)`
        : 'Sai';
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-rose-100 text-rose-900 border border-rose-200 text-xs font-bold">
        <XCircle className="w-3.5 h-3.5 text-rose-700 shrink-0" />
        <span>{partialText}</span>
      </span>
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/65 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="submission-detail-modal-title"
      onClick={onClose}
    >
      <div
        className="bg-white w-full max-w-5xl rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sticky Header */}
        <div className="bg-slate-900 px-5 sm:px-6 py-4 text-white flex items-center justify-between gap-4 shrink-0">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-teal-300">
              <span>Chi tiết bài làm học sinh</span>
              <span>•</span>
              <span className="font-mono text-white bg-white/15 px-2 py-0.5 rounded">
                {exam.code}
                {exam.publicCode ? ` / ${exam.publicCode}` : ''}
              </span>
            </div>
            <h2 id="submission-detail-modal-title" className="text-base sm:text-lg font-extrabold text-white truncate mt-0.5">
              {submission.studentName} ({submission.studentClass || 'Chưa rõ lớp'}) — {exam.title}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-white/10 text-slate-300 hover:text-white transition-colors shrink-0"
            aria-label="Đóng cửa sổ"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 bg-slate-50/70">
          {!hasPermission ? (
            <div className="bg-white border border-rose-200 rounded-2xl p-8 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto">
                <Lock className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-slate-900">Không có quyền xem bài làm này</h3>
              <p className="text-xs text-slate-600 max-w-md mx-auto">
                Bạn chỉ có thể xem chi tiết bài làm của học sinh đối với các đề thi thuộc quyền quản lý của mình.
              </p>
            </div>
          ) : (
            <>
              {/* A. THÔNG TIN CHUNG */}
              <section className="bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
                  <div className="flex items-start gap-3">
                    <div className="w-11 h-11 rounded-2xl bg-teal-50 border border-teal-200 text-teal-700 flex items-center justify-center shrink-0">
                      <UserIcon className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-base font-extrabold text-slate-900">{submission.studentName}</p>
                      <p className="text-xs text-slate-600 mt-0.5">
                        Lớp: <strong className="text-slate-800">{submission.studentClass || 'Chưa rõ'}</strong>
                        {submission.gradedByServer && (
                          <span className="ml-2 px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold text-[10px]">
                            Chấm từ máy chủ
                          </span>
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 shrink-0 tabular-nums">
                    <div className="text-right">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 block">
                        Tổng điểm
                      </span>
                      <span className="text-3xl font-black text-slate-900">
                        {submission.totalScore.toFixed(2)}
                      </span>
                      <span className="text-sm font-bold text-slate-500">
                        {' '}/ {(submission.maxPossibleScore || exam.totalScore || 10).toFixed(1)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs tabular-nums">
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80">
                    <span className="text-slate-500 flex items-center gap-1 text-[11px]">
                      <Calendar className="w-3.5 h-3.5 text-slate-400" />
                      Bắt đầu làm bài
                    </span>
                    <p className="font-semibold text-slate-900 mt-1">{formatDateTime(submission.startedAt)}</p>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80">
                    <span className="text-slate-500 flex items-center gap-1 text-[11px]">
                      <Calendar className="w-3.5 h-3.5 text-slate-400" />
                      Thời điểm nộp bài
                    </span>
                    <p className="font-semibold text-slate-900 mt-1">{formatDateTime(submission.submittedAt)}</p>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80">
                    <span className="text-slate-500 flex items-center gap-1 text-[11px]">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      Thời gian làm bài
                    </span>
                    <p className="font-semibold text-slate-900 mt-1">{formatDuration(submission.durationSeconds)}</p>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80">
                    <span className="text-slate-500 flex items-center gap-1 text-[11px]">
                      <ShieldAlert className="w-3.5 h-3.5 text-slate-400" />
                      Rời màn hình / Trạng thái
                    </span>
                    <p className="font-semibold text-slate-900 mt-1">
                      {submission.tabSwitchesCount || 0} lần •{' '}
                      {submission.status === 'timed_out' ? 'Hết giờ tự nộp' : 'Đã nộp'}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3 text-xs tabular-nums">
                  <div className="p-2.5 rounded-xl bg-blue-50/70 border border-blue-200/80 flex items-center justify-between">
                    <span className="font-semibold text-blue-900">Phần I</span>
                    <span className="font-extrabold text-blue-700">{submission.part1Score.toFixed(2)}đ</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-indigo-50/70 border border-indigo-200/80 flex items-center justify-between">
                    <span className="font-semibold text-indigo-900">Phần II</span>
                    <span className="font-extrabold text-indigo-700">{submission.part2Score.toFixed(2)}đ</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-purple-50/70 border border-purple-200/80 flex items-center justify-between">
                    <span className="font-semibold text-purple-900">Phần III</span>
                    <span className="font-extrabold text-purple-700">{submission.part3Score.toFixed(2)}đ</span>
                  </div>
                </div>
              </section>

              {/* C. THỐNG KÊ PHÂN TÍCH */}
              <section className="bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                    <Award className="w-4 h-4 text-teal-600" />
                    <span>Phân tích tổng hợp bài làm ({evaluation.totalQuestions} câu)</span>
                  </h3>

                  <div className="flex flex-wrap items-center gap-1.5 text-xs">
                    {(
                      [
                        { id: 'all', label: `Tất cả (${evaluation.totalQuestions})` },
                        { id: 'correct', label: `Câu đúng (${evaluation.correctCount})` },
                        { id: 'incorrect', label: `Câu sai (${evaluation.wrongCount})` },
                        { id: 'unanswered', label: `Chưa làm (${evaluation.unansweredCount})` },
                      ] as const
                    ).map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setStatusFilter(tab.id)}
                        className={`px-3 py-1.5 rounded-xl font-semibold transition-colors tabular-nums ${
                          statusFilter === tab.id
                            ? 'bg-slate-900 text-white'
                            : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs tabular-nums">
                  <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center gap-3">
                    <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0" />
                    <div>
                      <span className="text-emerald-800 font-semibold block">Số câu đúng</span>
                      <span className="text-lg font-extrabold text-emerald-950">{evaluation.correctCount}</span>
                    </div>
                  </div>
                  <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 flex items-center gap-3">
                    <XCircle className="w-5 h-5 text-rose-700 shrink-0" />
                    <div>
                      <span className="text-rose-800 font-semibold block">Số câu sai</span>
                      <span className="text-lg font-extrabold text-rose-950">{evaluation.wrongCount}</span>
                    </div>
                  </div>
                  <div className="p-3.5 rounded-xl bg-slate-100 border border-slate-200 flex items-center gap-3">
                    <MinusCircle className="w-5 h-5 text-slate-600 shrink-0" />
                    <div>
                      <span className="text-slate-700 font-semibold block">Số câu chưa làm</span>
                      <span className="text-lg font-extrabold text-slate-900">{evaluation.unansweredCount}</span>
                    </div>
                  </div>
                  <div className="p-3.5 rounded-xl bg-blue-50 border border-blue-200 flex items-center gap-3">
                    <Award className="w-5 h-5 text-blue-700 shrink-0" />
                    <div>
                      <span className="text-blue-800 font-semibold block">Tỉ lệ làm đúng</span>
                      <span className="text-lg font-extrabold text-blue-950">{evaluation.accuracyPercent}%</span>
                    </div>
                  </div>
                </div>

                {(evaluation.wrongQuestionOrders.length > 0 || evaluation.unansweredQuestionOrders.length > 0) && (
                  <div className="pt-2 border-t border-slate-100 space-y-2 text-xs">
                    {evaluation.wrongQuestionOrders.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-bold text-rose-800 inline-flex items-center gap-1 mr-1">
                          <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                          Câu trả lời sai:
                        </span>
                        {evaluation.wrongQuestionOrders.map((ord) => (
                          <button
                            key={`w-${ord}`}
                            type="button"
                            onClick={() => jumpToQuestion(ord)}
                            className="px-2 py-0.5 rounded-md bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-800 font-mono font-bold tabular-nums"
                          >
                            Câu {ord}
                          </button>
                        ))}
                      </div>
                    )}
                    {evaluation.unansweredQuestionOrders.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-bold text-slate-700 inline-flex items-center gap-1 mr-1">
                          <MinusCircle className="w-3.5 h-3.5 text-slate-500" />
                          Câu chưa làm:
                        </span>
                        {evaluation.unansweredQuestionOrders.map((ord) => (
                          <button
                            key={`u-${ord}`}
                            type="button"
                            onClick={() => jumpToQuestion(ord)}
                            className="px-2 py-0.5 rounded-md bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 font-mono font-bold tabular-nums"
                          >
                            Câu {ord}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </section>

              {/* B. CHI TIẾT TỪNG CÂU HỎI */}
              <section className="space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2 px-1">
                  <FileText className="w-4 h-4 text-blue-600" />
                  <span>Chi tiết từng câu hỏi theo thứ tự trong đề ({filteredDetails.length} câu đang hiển thị)</span>
                </h3>

                {filteredDetails.length === 0 ? (
                  <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-xs text-slate-500">
                    Không có câu hỏi nào thuộc nhóm bộ lọc đã chọn.
                  </div>
                ) : (
                  filteredDetails.map((detail) => {
                    const q = questionsMap.get(detail.questionId);
                    if (!q) return null;

                    const borderColor =
                      detail.status === 'correct'
                        ? 'border-emerald-200'
                        : detail.status === 'unanswered'
                        ? 'border-slate-200'
                        : 'border-rose-200';

                    const partLabel =
                      detail.type === 'part1_single_choice'
                        ? 'Phần I (Trắc nghiệm)'
                        : detail.type === 'part2_true_false'
                        ? 'Phần II (Đúng / Sai)'
                        : 'Phần III (Trả lời ngắn)';

                    return (
                      <article
                        key={detail.questionId}
                        id={`attempt-q-${detail.orderIndex}`}
                        className={`bg-white border-2 ${borderColor} rounded-2xl p-4 sm:p-5 shadow-2xs space-y-3.5`}
                      >
                        {/* Question Header */}
                        <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-100">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="px-2.5 py-1 rounded-lg bg-slate-900 text-white font-mono text-xs font-bold tabular-nums">
                              Câu {detail.orderIndex}
                            </span>
                            {detail.questionCode && (
                              <span className="font-mono text-[11px] font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                                {detail.questionCode}
                              </span>
                            )}
                            <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-blue-50 text-blue-800">
                              {partLabel}
                            </span>
                          </div>

                          <div className="flex items-center gap-2.5 tabular-nums">
                            <span className="text-xs font-bold text-slate-700">
                              Điểm: <b className="text-slate-950">{detail.earnedScore.toFixed(2)}</b> /{' '}
                              {detail.maxScore.toFixed(2)}đ
                            </span>
                            {renderStatusBadge(detail)}
                          </div>
                        </div>

                        {/* Question Stem */}
                        <div className="text-sm font-medium text-slate-900 leading-relaxed">
                          <ChemRenderer text={q.content} />
                        </div>

                        {q.imageUrl && (
                          <div className="rounded-xl overflow-hidden border border-slate-200 max-w-md">
                            <img src={q.imageUrl} alt={`Minh họa câu ${detail.orderIndex}`} className="w-full object-contain" />
                          </div>
                        )}

                        {/* Part I Options */}
                        {q.type === 'part1_single_choice' && q.options && (
                          <div className="space-y-2">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                              {q.options.map((opt) => {
                                const isStudentPick = detail.selectedOptionId === opt.id;
                                const isCorrectKey = detail.correctOptionId === opt.id;

                                let optClass = 'bg-slate-50 border-slate-200 text-slate-700';
                                if (isCorrectKey) {
                                  optClass = 'bg-emerald-50 border-emerald-400 text-emerald-950 font-semibold';
                                } else if (isStudentPick && !isCorrectKey) {
                                  optClass = 'bg-rose-50 border-rose-300 text-rose-900 font-semibold';
                                }

                                return (
                                  <div
                                    key={opt.id}
                                    className={`p-2.5 rounded-xl border flex items-start justify-between gap-2 ${optClass}`}
                                  >
                                    <div className="flex items-start gap-2 min-w-0">
                                      <span className="font-bold shrink-0">{opt.id}.</span>
                                      <div className="min-w-0">
                                        <ChemRenderer text={opt.text} />
                                      </div>
                                    </div>
                                    <div className="flex flex-col items-end gap-1 shrink-0">
                                      {isStudentPick && (
                                        <span
                                          className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                                            isCorrectKey
                                              ? 'bg-emerald-200 text-emerald-950'
                                              : 'bg-rose-200 text-rose-950'
                                          }`}
                                        >
                                          HS chọn
                                        </span>
                                      )}
                                      {isCorrectKey && (
                                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-600 text-white font-bold">
                                          Đáp án đúng
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                            <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600 pt-1">
                              <span>
                                Học sinh chọn:{' '}
                                <strong className={detail.status === 'correct' ? 'text-emerald-700' : 'text-rose-700'}>
                                  {detail.selectedOptionId || 'Bỏ trống'}
                                </strong>
                              </span>
                              <span>
                                Đáp án đúng:{' '}
                                <strong className="text-emerald-700">{detail.correctOptionId || '—'}</strong>
                              </span>
                            </div>
                          </div>
                        )}

                        {/* Part II True / False Statements */}
                        {q.type === 'part2_true_false' && detail.statementDetails && (
                          <div className="overflow-x-auto rounded-xl border border-slate-200">
                            <table className="w-full text-left text-xs">
                              <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                                <tr>
                                  <th className="py-2 px-3 w-10">Ý</th>
                                  <th className="py-2 px-3">Nội dung mệnh đề</th>
                                  <th className="py-2 px-3 w-28 text-center">HS chọn</th>
                                  <th className="py-2 px-3 w-28 text-center">Đáp án đúng</th>
                                  <th className="py-2 px-3 w-24 text-center">Kết quả</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {detail.statementDetails.map((st) => {
                                  const studentLabel =
                                    st.studentChoice === undefined
                                      ? 'Bỏ trống'
                                      : st.studentChoice
                                      ? 'Đúng'
                                      : 'Sai';
                                  const keyLabel = st.correctAnswer ? 'Đúng' : 'Sai';
                                  return (
                                    <tr
                                      key={st.statementId}
                                      className={
                                        st.isCorrect
                                          ? 'bg-emerald-50/40'
                                          : st.studentChoice === undefined
                                          ? 'bg-slate-50/50'
                                          : 'bg-rose-50/40'
                                      }
                                    >
                                      <td className="py-2.5 px-3 font-bold text-indigo-700 align-top">
                                        {st.statementId})
                                      </td>
                                      <td className="py-2.5 px-3 text-slate-900 align-top">
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
                                      <td className="py-2.5 px-3 text-center font-bold text-emerald-800 align-top">
                                        {keyLabel}
                                      </td>
                                      <td className="py-2.5 px-3 text-center align-top">
                                        {st.isCorrect ? (
                                          <span className="inline-flex items-center gap-1 text-emerald-700 font-bold">
                                            <CheckCircle2 className="w-3.5 h-3.5" />
                                            <span>Đúng</span>
                                          </span>
                                        ) : st.studentChoice === undefined ? (
                                          <span className="inline-flex items-center gap-1 text-slate-500 font-semibold">
                                            <MinusCircle className="w-3.5 h-3.5" />
                                            <span>Trống</span>
                                          </span>
                                        ) : (
                                          <span className="inline-flex items-center gap-1 text-rose-700 font-bold">
                                            <XCircle className="w-3.5 h-3.5" />
                                            <span>Sai</span>
                                          </span>
                                        )}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        )}

                        {/* Part III Short Answer */}
                        {q.type === 'part3_short_answer' && (
                          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                            <div>
                              <span className="text-slate-500 block">Học sinh trả lời:</span>
                              <span
                                className={`font-mono text-sm font-bold mt-0.5 inline-block ${
                                  detail.status === 'correct'
                                    ? 'text-emerald-700'
                                    : detail.status === 'unanswered'
                                    ? 'text-slate-500'
                                    : 'text-rose-700'
                                }`}
                              >
                                {detail.textAnswer || '(Bỏ trống)'}
                              </span>
                            </div>
                            <div>
                              <span className="text-slate-500 block">Đáp án chuẩn:</span>
                              <span className="font-mono text-sm font-bold text-purple-800 bg-purple-100 px-2 py-0.5 rounded mt-0.5 inline-block">
                                {detail.acceptableAnswers && detail.acceptableAnswers.length > 0
                                  ? detail.acceptableAnswers.join(' / ')
                                  : detail.numericValue !== undefined
                                  ? String(detail.numericValue)
                                  : '—'}
                                {detail.unit ? ` (${detail.unit})` : ''}
                              </span>
                            </div>
                          </div>
                        )}

                        {/* Explanation for Teacher Review */}
                        {q.explanation && (
                          <div className="p-3.5 rounded-xl bg-blue-50/70 border border-blue-200/80 text-xs text-blue-950">
                            <p className="font-bold text-blue-900 flex items-center gap-1.5 mb-1">
                              <FlaskConical className="w-3.5 h-3.5 text-blue-600" />
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
          )}
        </div>

        {/* Footer */}
        <div className="px-5 sm:px-6 py-3.5 bg-white border-t border-slate-200 flex items-center justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-black text-white text-xs font-bold transition-colors"
          >
            Đóng chi tiết
          </button>
        </div>
      </div>
    </div>
  );
};
