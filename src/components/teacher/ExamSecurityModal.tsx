import React, { useState, useEffect } from 'react';
import {
  X,
  Lock,
  Unlock,
  Eye,
  EyeOff,
  Award,
  Clock,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  Save,
} from 'lucide-react';
import { Exam } from '../../types';
import { auth, extractAnswerKeyMap, syncExamToFirestore } from '../../services/firebase';
import {
  configureExamSecurityOnServer,
  getEffectiveAnswerReviewConfig,
} from '../../services/examSecurityApi';
import { StorageService } from '../../services/storage';
import { getUnifiedExamCode, normalizeExamCode } from '../../utils/urlHelper';

interface ExamSecurityModalProps {
  isOpen: boolean;
  exam: Exam | null;
  onClose: () => void;
  onExamUpdated: (updatedExam: Exam) => void;
}

function toDatetimeLocalValue(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(
    d.getMinutes()
  )}`;
}

export const ExamSecurityModal: React.FC<ExamSecurityModalProps> = ({
  isOpen,
  exam,
  onClose,
  onExamUpdated,
}) => {
  const [isPublished, setIsPublished] = useState(true);
  const [requiresPassword, setRequiresPassword] = useState(false);
  const [passwordAction, setPasswordAction] = useState<'keep' | 'set' | 'clear'>('clear');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [allowAnswerReview, setAllowAnswerReview] = useState(true);
  const [answerReviewMinScore, setAnswerReviewMinScore] = useState<string>('8.0');
  const [answerReviewEnabledAtLocal, setAnswerReviewEnabledAtLocal] = useState('');
  const [showScoreAfterSubmit, setShowScoreAfterSubmit] = useState(true);
  const [showSolutionsAfterSubmit, setShowSolutionsAfterSubmit] = useState(true);

  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !exam) return;
    const effective = getEffectiveAnswerReviewConfig(exam);
    const hasExistingPwd = Boolean(exam.requiresPassword);

    setIsPublished(Boolean(exam.isPublished));
    setRequiresPassword(hasExistingPwd);
    setPasswordAction(hasExistingPwd ? 'keep' : 'clear');
    setPassword('');
    setConfirmPassword('');
    setShowPassword(false);

    setAllowAnswerReview(effective.allowAnswerReview);
    setAnswerReviewMinScore(effective.answerReviewMinScore.toFixed(1));
    setAnswerReviewEnabledAtLocal(toDatetimeLocalValue(effective.answerReviewEnabledAt));
    setShowScoreAfterSubmit(exam.showScoreAfterSubmit !== false);
    setShowSolutionsAfterSubmit(exam.showSolutionsAfterSubmit !== false);

    setErrorMsg(null);
    setSuccessMsg(null);
  }, [isOpen, exam]);

  if (!isOpen || !exam) return null;

  const handleClose = () => {
    setPassword('');
    setConfirmPassword('');
    setErrorMsg(null);
    setSuccessMsg(null);
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (requiresPassword) {
      if (passwordAction === 'set' || !exam.requiresPassword) {
        if (password.length < 6) {
          setErrorMsg('Mật khẩu đề thi phải có ít nhất 6 ký tự.');
          return;
        }
        if (password !== confirmPassword) {
          setErrorMsg('Mật khẩu xác nhận không khớp. Vui lòng kiểm tra lại.');
          return;
        }
      }
    }

    const parsedMinScore = Number(answerReviewMinScore.replace(',', '.'));
    if (!Number.isFinite(parsedMinScore) || parsedMinScore < 0 || parsedMinScore > 10) {
      setErrorMsg('Điểm sàn xem đáp án phải nằm trong khoảng từ 0.0 đến 10.0 điểm.');
      return;
    }
    const cleanMinScore = Math.round(parsedMinScore * 100) / 100;

    let enabledAtIso: string | null = null;
    if (answerReviewEnabledAtLocal.trim()) {
      const ms = Date.parse(answerReviewEnabledAtLocal.trim());
      if (!Number.isFinite(ms)) {
        setErrorMsg('Thời điểm mở xem đáp án không hợp lệ.');
        return;
      }
      enabledAtIso = new Date(ms).toISOString();
    }

    const effectivePwdAction: 'set' | 'keep' | 'clear' = !requiresPassword
      ? 'clear'
      : !exam.requiresPassword
      ? 'set'
      : passwordAction;

    setIsSaving(true);
    try {
      const cleanCode = normalizeExamCode(exam.code);
      const ownerId = exam.ownerId || auth.currentUser?.uid || '';
      let passwordUpdatedAt = exam.passwordUpdatedAt ?? null;

      if (auth.currentUser) {
        const serverRes = await configureExamSecurityOnServer({
          examCode: cleanCode,
          examId: exam.id,
          requiresPassword,
          passwordAction: effectivePwdAction,
          ...(effectivePwdAction === 'set' ? { password } : {}),
          allowAnswerReview,
          answerReviewMinScore: cleanMinScore,
          answerReviewEnabledAt: enabledAtIso,
          showScoreAfterSubmit,
          showSolutionsAfterSubmit,
          isPublished,
          openAt: exam.openAt ?? null,
          closeAt: exam.closeAt ?? null,
          maxAttempts: exam.maxAttempts,
          rules: exam.rules,
          questions: (exam.questions || []).map((q) => ({
            id: q.id,
            type: q.type,
            ...(Array.isArray(q.statements) ? { statementIds: q.statements.map((s) => s.id) } : {}),
          })),
          answerMap: extractAnswerKeyMap({ ...exam, showSolutionsAfterSubmit }),
          patchMetadataDocs: false,
        });

        if (!serverRes.ok) {
          setErrorMsg(
            serverRes.error ||
              'Không thể lưu cấu hình bảo mật lên máy chủ. Vui lòng kiểm tra lại kết nối và cấu hình server.'
          );
          return;
        }
        if (serverRes.passwordUpdatedAt !== undefined) {
          passwordUpdatedAt = serverRes.passwordUpdatedAt;
        }
      } else if (requiresPassword) {
        setErrorMsg('Bạn cần đăng nhập tài khoản Giáo viên để cấu hình mật khẩu đề thi.');
        return;
      }

      const updatedExam: Exam = {
        ...exam,
        isPublished,
        requiresPassword,
        passwordUpdatedAt: requiresPassword ? passwordUpdatedAt : null,
        allowAnswerReview,
        answerReviewMinScore: cleanMinScore,
        answerReviewEnabledAt: enabledAtIso,
        showScoreAfterSubmit,
        showAnswersAfterSubmit: allowAnswerReview,
        showSolutionsAfterSubmit,
        updatedAt: new Date().toISOString(),
      };

      if (ownerId) {
        StorageService.addExam(updatedExam, ownerId);
      }
      if (auth.currentUser) {
        await syncExamToFirestore(updatedExam, ownerId || auth.currentUser.uid);
      }

      setPassword('');
      setConfirmPassword('');
      onExamUpdated(updatedExam);
      setSuccessMsg('Đã lưu cấu hình bảo mật & điều kiện xem đáp án thành công!');
      setTimeout(() => {
        onClose();
      }, 600);
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Đã xảy ra lỗi khi cập nhật cấu hình đề thi.'
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white w-full max-w-xl rounded-3xl shadow-2xl border border-slate-200 overflow-hidden my-auto max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="bg-[#0F172A] px-6 py-4 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-emerald-500/20">
              <ShieldCheck className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-300">
                  Cấu hình bảo mật &amp; Đáp án
                </span>
                <span className="px-2 py-0.5 rounded bg-white/15 font-mono text-[10px] font-bold tracking-wider">
                  Mã phòng: {getUnifiedExamCode(exam)}
                </span>
              </div>
              <h2 className="text-sm sm:text-base font-extrabold text-white line-clamp-1 mt-0.5">
                {exam.title}
              </h2>
            </div>
          </div>

          <button
            type="button"
            onClick={handleClose}
            className="p-2 rounded-xl hover:bg-white/10 text-white/80 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-5 text-xs">
          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 font-semibold flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 font-semibold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Publish Status */}
          <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-between">
            <div>
              <p className="font-bold text-slate-900">Trạng thái phòng thi</p>
              <p className="text-[11px] text-slate-500">
                Cho phép học sinh truy cập bài thi qua mã đề / link chia sẻ
              </p>
            </div>
            <label className="inline-flex items-center gap-2 cursor-pointer font-bold">
              <input
                type="checkbox"
                checked={isPublished}
                onChange={(e) => setIsPublished(e.target.checked)}
                className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500"
              />
              <span className={isPublished ? 'text-emerald-700' : 'text-slate-600'}>
                {isPublished ? 'Đang mở thi' : 'Đã đóng'}
              </span>
            </label>
          </div>

          {/* Section 1: Password Protection */}
          <div className="p-4 rounded-2xl border border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                {requiresPassword ? (
                  <Lock className="w-4 h-4 text-amber-600" />
                ) : (
                  <Unlock className="w-4 h-4 text-emerald-600" />
                )}
                <span>Bảo mật đề thi bằng mật khẩu</span>
              </h3>
              <span
                className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                  requiresPassword
                    ? 'bg-amber-100 text-amber-800'
                    : 'bg-emerald-100 text-emerald-800'
                }`}
              >
                {requiresPassword ? 'Đang bật mật khẩu' : 'Không mật khẩu'}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setRequiresPassword(false);
                  setPasswordAction('clear');
                  setPassword('');
                  setConfirmPassword('');
                }}
                className={`p-2.5 rounded-xl border text-left font-semibold transition-all ${
                  !requiresPassword
                    ? 'bg-emerald-50 border-emerald-400 text-emerald-900'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                Không sử dụng mật khẩu
              </button>
              <button
                type="button"
                onClick={() => {
                  setRequiresPassword(true);
                  setPasswordAction(exam.requiresPassword ? 'keep' : 'set');
                }}
                className={`p-2.5 rounded-xl border text-left font-semibold transition-all ${
                  requiresPassword
                    ? 'bg-amber-50 border-amber-400 text-amber-900'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                Yêu cầu mật khẩu khi vào thi
              </button>
            </div>

            {requiresPassword && (
              <div className="space-y-3 pt-1">
                {exam.requiresPassword && (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setPasswordAction('keep');
                        setPassword('');
                        setConfirmPassword('');
                      }}
                      className={`px-3 py-1.5 rounded-lg border text-[11px] font-bold ${
                        passwordAction === 'keep'
                          ? 'bg-blue-600 border-blue-600 text-white'
                          : 'bg-slate-50 border-slate-200 text-slate-700'
                      }`}
                    >
                      Giữ mật khẩu hiện tại
                    </button>
                    <button
                      type="button"
                      onClick={() => setPasswordAction('set')}
                      className={`px-3 py-1.5 rounded-lg border text-[11px] font-bold ${
                        passwordAction === 'set'
                          ? 'bg-blue-600 border-blue-600 text-white'
                          : 'bg-slate-50 border-slate-200 text-slate-700'
                      }`}
                    >
                      Đổi mật khẩu mới
                    </button>
                  </div>
                )}

                {(!exam.requiresPassword || passwordAction === 'set') && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">
                        Mật khẩu đề thi (≥ 6 ký tự)
                      </label>
                      <div className="relative">
                        <input
                          type={showPassword ? 'text' : 'password'}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="Nhập mật khẩu đề thi..."
                          className="w-full p-2.5 pr-9 rounded-xl border border-slate-300 bg-white font-semibold focus:ring-2 focus:ring-blue-500"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((prev) => !prev)}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                          title={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                        >
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">
                        Xác nhận mật khẩu đề thi
                      </label>
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Nhập lại mật khẩu..."
                        className="w-full p-2.5 rounded-xl border border-slate-300 bg-white font-semibold focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                )}

                <p className="text-[11px] text-slate-500">
                  Mật khẩu được mã hóa bằng thuật toán băm an toàn trên máy chủ và không lưu dạng văn bản thuần. Khi đổi hoặc tắt mật khẩu, phiên mở khóa cũ của học sinh sẽ tự động hết hiệu lực.
                </p>
              </div>
            )}
          </div>

          {/* Section 2: Floor-Score Gated Answer Review */}
          <div className="p-4 rounded-2xl border border-slate-200 space-y-3">
            <h3 className="font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <Award className="w-4 h-4 text-indigo-600" />
              <span>Điều kiện xem đáp án &amp; Điểm sàn</span>
            </h3>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showScoreAfterSubmit}
                onChange={(e) => setShowScoreAfterSubmit(e.target.checked)}
                className="w-4 h-4 rounded text-blue-600"
              />
              <span className="font-semibold text-slate-800">
                Hiển thị điểm tổng &amp; điểm từng phần ngay sau khi nộp bài
              </span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={allowAnswerReview}
                onChange={(e) => setAllowAnswerReview(e.target.checked)}
                className="w-4 h-4 rounded text-indigo-600"
              />
              <span className="font-semibold text-slate-800">
                Cho phép học sinh xem đáp án khi đạt điều kiện
              </span>
            </label>

            {allowAnswerReview && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 pl-1">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Điểm sàn tối thiểu để xem đáp án (0.0 – 10.0)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="10"
                    value={answerReviewMinScore}
                    onChange={(e) => setAnswerReviewMinScore(e.target.value)}
                    className="w-full p-2.5 rounded-xl border border-slate-300 bg-white font-bold text-indigo-700 focus:ring-2 focus:ring-indigo-500"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    Ví dụ: nhập <b>8.0</b> → chỉ học sinh đạt ≥ 8.0 điểm mới được xem đáp án. Nhập <b>0.0</b> để mở cho mọi học sinh đã nộp bài.
                  </p>
                </div>

                <div>
                  <label className="flex items-center justify-between font-semibold text-slate-700 mb-1">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-slate-500" />
                      <span>Thời điểm mở đáp án (tùy chọn)</span>
                    </span>
                    {answerReviewEnabledAtLocal && (
                      <button
                        type="button"
                        onClick={() => setAnswerReviewEnabledAtLocal('')}
                        className="text-[10px] text-blue-600 hover:underline font-bold"
                      >
                        Xóa mốc giờ
                      </button>
                    )}
                  </label>
                  <input
                    type="datetime-local"
                    value={answerReviewEnabledAtLocal}
                    onChange={(e) => setAnswerReviewEnabledAtLocal(e.target.value)}
                    className="w-full p-2.5 rounded-xl border border-slate-300 bg-white font-medium"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    Để trống nếu muốn học sinh đạt điểm sàn xem đáp án ngay sau khi nộp.
                  </p>
                </div>
              </div>
            )}

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showSolutionsAfterSubmit}
                onChange={(e) => setShowSolutionsAfterSubmit(e.target.checked)}
                disabled={!allowAnswerReview}
                className="w-4 h-4 rounded text-blue-600 disabled:opacity-50"
              />
              <span className={`font-semibold ${allowAnswerReview ? 'text-slate-800' : 'text-slate-400'}`}>
                Hiển thị kèm hướng dẫn giải chi tiết (khi đủ điều kiện xem đáp án)
              </span>
            </label>
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-bold shadow-md shadow-blue-500/20 flex items-center gap-2"
            >
              <Save className="w-4 h-4" />
              <span>{isSaving ? 'Đang lưu cấu hình...' : 'Lưu cấu hình'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
