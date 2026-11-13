import React, { useState } from 'react';
import {
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
  ArrowLeft,
  RefreshCw,
  SearchX,
  Lock,
  CalendarClock,
  WifiOff,
  AlertTriangle,
} from 'lucide-react';
import { Exam, User } from '../../types';
import { APP_CONFIG } from '../../constants/brand';

export type ExamLandingStatus =
  | 'loading'
  | 'found'
  | 'not_found'
  | 'not_published'
  | 'not_started'
  | 'expired'
  | 'unauthorized'
  | 'network_error'
  | 'firebase_not_initialized'
  | 'unexpected_error';

interface ExamJoinLandingProps {
  exam: Exam | null;
  examCode?: string;
  status?: ExamLandingStatus;
  statusMessage?: string;
  currentUser?: User | null;
  onStartExam: (exam: Exam, studentName: string, studentClass: string) => void;
  onRetryLookup?: () => void;
  onBackToHome: () => void;
}

export const ExamJoinLanding: React.FC<ExamJoinLandingProps> = ({
  exam,
  examCode,
  status = 'found',
  statusMessage,
  currentUser,
  onStartExam,
  onRetryLookup,
  onBackToHome,
}) => {
  const [studentName, setStudentName] = useState(currentUser?.name || '');
  const [studentClass, setStudentClass] = useState(currentUser?.className || '12 Hóa 1');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (status === 'loading') {
    return (
      <div className="max-w-2xl mx-auto py-12 px-4">
        <div className="bg-white border border-slate-200 rounded-3xl shadow-lg p-10 text-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto">
            <RefreshCw className="w-6 h-6 animate-spin" />
          </div>
          <h2 className="text-lg font-extrabold text-slate-900">
            Đang tải thông tin bài thi {examCode ? `(${examCode})` : ''}...
          </h2>
          <p className="text-xs text-slate-500">
            Hệ thống đang kiểm tra mã đề, trạng thái phòng thi và chuẩn bị dữ liệu cho bạn.
          </p>
        </div>
      </div>
    );
  }

  if (status !== 'found' || !exam) {
    const isLocked = status === 'not_published';
    const isSchedule = status === 'not_started' || status === 'expired';
    const isUnauthorized = status === 'unauthorized';
    const isNetwork = status === 'network_error';
    const isUnexpected = status === 'unexpected_error' || status === 'firebase_not_initialized';
    const displayCode = exam?.code || examCode || 'N/A';

    const titleText =
      status === 'not_published'
        ? 'Phòng thi đang tạm đóng'
        : status === 'not_started'
        ? 'Bài thi chưa đến giờ mở'
        : status === 'expired'
        ? 'Bài thi đã kết thúc'
        : status === 'unauthorized'
        ? 'Không đủ quyền truy cập'
        : status === 'network_error'
        ? 'Lỗi kết nối máy chủ'
        : status === 'firebase_not_initialized'
        ? 'Firestore chưa khởi tạo'
        : status === 'unexpected_error'
        ? 'Lỗi hệ thống'
        : 'Không tìm thấy mã bài thi';

    const defaultDetail =
      status === 'unauthorized'
        ? 'Bạn không có quyền truy cập phòng thi này hoặc bài thi chưa được mở công khai.'
        : status === 'network_error'
        ? 'Không thể kết nối tới máy chủ để tải dữ liệu bài thi. Vui lòng kiểm tra kết nối mạng và thử lại.'
        : status === 'firebase_not_initialized'
        ? 'Dịch vụ cơ sở dữ liệu Firestore chưa được khởi tạo sẵn sàng. Vui lòng kiểm tra cấu hình hoặc tải lại trang.'
        : status === 'unexpected_error'
        ? 'Hệ thống gặp sự cố không mong muốn khi tải thông tin bài thi. Vui lòng thử tải lại.'
        : `Không tìm thấy bài thi với mã "${displayCode}".`;

    return (
      <div className="max-w-2xl mx-auto py-8 px-4 space-y-5">
        <button
          type="button"
          onClick={onBackToHome}
          className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-blue-600 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Quay về trang chủ {APP_CONFIG.APP_NAME}</span>
        </button>

        <div className="bg-white border border-slate-200 rounded-3xl shadow-xl overflow-hidden">
          <div className="bg-gradient-to-r from-slate-800 to-slate-900 p-6 text-white flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-white/10 flex items-center justify-center shrink-0">
                {isLocked ? (
                  <Lock className="w-6 h-6 text-amber-300" />
                ) : isSchedule ? (
                  <CalendarClock className="w-6 h-6 text-amber-300" />
                ) : isUnauthorized ? (
                  <ShieldAlert className="w-6 h-6 text-rose-300" />
                ) : isNetwork ? (
                  <WifiOff className="w-6 h-6 text-amber-300" />
                ) : isUnexpected ? (
                  <AlertTriangle className="w-6 h-6 text-rose-300" />
                ) : (
                  <SearchX className="w-6 h-6 text-rose-300" />
                )}
              </div>
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-300 block">
                  {APP_CONFIG.APP_NAME} • TRẠNG THÁI PHÒNG THI
                </span>
                <h1 className="text-lg sm:text-xl font-extrabold text-white mt-0.5">
                  {titleText}
                </h1>
              </div>
            </div>

            {displayCode !== 'N/A' && (
              <div className="bg-white/10 border border-white/20 px-3.5 py-2 rounded-xl text-center shrink-0">
                <span className="text-[10px] font-bold text-slate-300 block">MÃ ĐỀ</span>
                <span className="font-mono font-black text-base text-white">{displayCode}</span>
              </div>
            )}
          </div>

          <div className="p-6 sm:p-8 space-y-5">
            {exam?.title && (
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200">
                <p className="text-xs text-slate-500 font-semibold">Tên bài thi:</p>
                <p className="text-sm font-bold text-slate-900 mt-0.5">{exam.title}</p>
                {exam.authorName && (
                  <p className="text-xs text-slate-500 mt-1">Giáo viên: {exam.authorName}</p>
                )}
              </div>
            )}

            <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs sm:text-sm font-medium flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-bold">
                  {statusMessage || defaultDetail}
                </p>
                {(status === 'not_found' || status === 'unauthorized') && (
                  <p className="text-xs text-amber-800 leading-relaxed">
                    Nếu giáo viên vừa mới tạo đề thi trên thiết bị khác, vui lòng kiểm tra lại mã đề hoặc nhờ giáo viên bấm &ldquo;Đồng bộ Cloud&rdquo; (đồng thời bật công tắc Mở phòng thi) trong mục Quản lý bài thi / Chia sẻ &amp; QR.
                  </p>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2.5 pt-2">
              {onRetryLookup && (
                <button
                  type="button"
                  onClick={onRetryLookup}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold flex items-center gap-1.5 transition-colors"
                >
                  <RefreshCw className="w-4 h-4 text-blue-600" />
                  <span>Thử tải lại</span>
                </button>
              )}
              <button
                type="button"
                onClick={onBackToHome}
                className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-md shadow-blue-500/20 transition-colors"
              >
                Quay về trang chủ
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const safeQuestions = Array.isArray(exam.questions) ? exam.questions : [];
  const hasQuestions = safeQuestions.length > 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasQuestions) {
      setErrorMsg('Đề thi này hiện chưa có câu hỏi nào. Vui lòng liên hệ giáo viên kiểm tra lại.');
      return;
    }

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

  // Count question types safely
  const p1Count = safeQuestions.filter((q) => q?.type === 'part1_single_choice').length;
  const p2Count = safeQuestions.filter((q) => q?.type === 'part2_true_false').length;
  const p3Count = safeQuestions.filter((q) => q?.type === 'part3_short_answer').length;

  return (
    <div className="max-w-3xl mx-auto py-6 px-4 space-y-6">
      {/* Top Navigation */}
      <button
        type="button"
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
                {exam.title || `Bài thi ${exam.code || examCode || ''}`}
              </h1>
              <p className="text-xs text-blue-200 mt-1">
                Giáo viên ra đề: <strong className="text-white">{exam.authorName || 'Giáo viên'}</strong> • {APP_CONFIG.APP_SCHOOL}
              </p>
            </div>

            <div className="bg-white/15 backdrop-blur-xs border border-white/20 px-4 py-2.5 rounded-2xl text-center self-start md:self-auto shrink-0">
              <span className="text-[10px] font-bold uppercase tracking-wider text-blue-200 block">
                MÃ BÀI THI
              </span>
              <span className="text-2xl font-black font-mono tracking-widest text-white">
                {exam.code || examCode || 'N/A'}
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

          {!exam.isPublished && (
            <div className="p-4 bg-amber-50 border border-amber-300 text-amber-900 rounded-2xl flex items-center gap-3 text-xs font-semibold">
              <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
              <div>
                <p className="font-bold">Phòng thi đang tạm khóa hoặc chưa mở</p>
                <p className="text-amber-700 mt-0.5">
                  Giáo viên chưa mở phòng thi cho mã &ldquo;{exam.code}&rdquo;. Vui lòng liên hệ giáo viên để biết thời gian mở phòng!
                </p>
              </div>
            </div>
          )}

          {exam.isPublished && !hasQuestions && (
            <div className="p-4 bg-rose-50 border border-rose-200 text-rose-900 rounded-2xl flex items-center gap-3 text-xs font-semibold">
              <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
              <div>
                <p className="font-bold">Đề thi chưa có câu hỏi</p>
                <p className="text-rose-700 mt-0.5">
                  Dữ liệu câu hỏi của mã &ldquo;{exam.code}&rdquo; hiện đang trống. Vui lòng báo lại cho giáo viên để cập nhật đề thi.
                </p>
              </div>
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
                <p className="text-base font-extrabold text-slate-900">{exam.durationMinutes || 45} phút</p>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-indigo-50/60 border border-indigo-100 flex items-center gap-3">
              <div className="p-2.5 bg-indigo-100 rounded-xl text-indigo-700">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[11px] text-slate-500 font-medium">Số câu hỏi</p>
                <p className="text-base font-extrabold text-slate-900">{exam.totalQuestions || safeQuestions.length} câu</p>
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
                <p className="text-base font-extrabold text-slate-900">
                  {[p1Count > 0, p2Count > 0, p3Count > 0].filter(Boolean).length || 1} Phần thi
                </p>
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
              <span>Hệ thống giám sát chuyển tab/cửa sổ. Hãy tập trung làm bài và nhấn &ldquo;Nộp bài&rdquo; khi hoàn thành.</span>
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
              disabled={!exam.isPublished || !hasQuestions}
              className={`w-full py-4 text-white font-extrabold text-sm rounded-2xl shadow-lg transition-all flex items-center justify-center gap-2 ${
                exam.isPublished && hasQuestions
                  ? 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-blue-500/25 cursor-pointer'
                  : 'bg-slate-400 cursor-not-allowed shadow-none opacity-80'
              }`}
            >
              <Play className="w-5 h-5 fill-white" />
              <span>
                {!exam.isPublished
                  ? 'PHÒNG THI ĐANG TẠM KHÓA'
                  : !hasQuestions
                  ? 'ĐỀ THI CHƯA CÓ CÂU HỎI'
                  : `BẮT ĐẦU LÀM BÀI THI (${exam.durationMinutes || 45} PHÚT)`}
              </span>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

