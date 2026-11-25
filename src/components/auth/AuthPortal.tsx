import React, { useState, useEffect, useCallback } from 'react';
import {
  FlaskConical,
  Mail,
  Lock,
  Eye,
  EyeOff,
  UserPlus,
  LogIn,
  GraduationCap,
  KeyRound,
  AlertCircle,
  CheckCircle2,
  Clock,
  ShieldAlert,
  ShieldCheck,
  RefreshCw,
  LogOut,
  ArrowLeft,
  School,
  Phone,
  Hash,
  Play,
  Download,
  BookOpen,
  Building2,
  X,
} from 'lucide-react';
import { APP_CONFIG } from '../../constants/brand';
import {
  DANANG_HIGH_SCHOOLS,
  DEFAULT_TEACHER_DEPARTMENTS,
  PILOT_GROUP_META,
  resolvePilotGroup,
} from '../../constants/danangSchools';
import { downloadStandardChemistryWordTemplate } from '../../services/sampleWordTemplateService';
import { ChemRenderer } from '../../utils/chemRenderer';
import { useAuth } from '../../contexts/AuthContext';
import { auth } from '../../services/firebase';
import {
  loginWithEmailPassword,
  registerTeacherAccount,
  registerStudentAccount,
  requestPasswordReset,
  sendVerificationEmailToCurrentUser,
  inspectAccountSyncStatus,
  EXPECTED_PRIMARY_ADMIN_EMAIL,
  AccountSyncDiagnostic,
  ProfileDiagnosticError,
} from '../../services/authService';
import { normalizeExamCode } from '../../utils/urlHelper';

type AuthViewMode = 'login' | 'register_teacher' | 'register_student' | 'forgot_password';

interface AuthPortalProps {
  onQuickExamCodeLookup?: (code: string) => void;
}

export const AuthPortal: React.FC<AuthPortalProps> = ({ onQuickExamCodeLookup }) => {
  const {
    authState,
    firebaseUser,
    userProfile,
    authError,
    authDiagnostic,
    pendingDraft,
    refreshProfile,
    retrySyncMissingProfile,
    logout,
  } = useAuth();

  const [mode, setMode] = useState<AuthViewMode>('login');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [errorDiag, setErrorDiag] = useState<ProfileDiagnosticError | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [quickExamCode, setQuickExamCode] = useState('');

  // Login fields
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPass, setShowLoginPass] = useState(false);

  // Forgot password field
  const [resetEmail, setResetEmail] = useState('');

  // Teacher register fields
  const [tName, setTName] = useState('');
  const [tEmail, setTEmail] = useState('');
  const [tPassword, setTPassword] = useState('');
  const [tConfirmPassword, setTConfirmPassword] = useState('');
  const [tPhone, setTPhone] = useState('');
  const [tSchool, setTSchool] = useState('');
  const [tDepartment, setTDepartment] = useState('Tổ Hóa học');
  const [showTPass, setShowTPass] = useState(false);

  // Pending teacher preview & Word sample download states
  const [showPendingExamPreview, setShowPendingExamPreview] = useState(false);
  const [isDownloadingTemplate, setIsDownloadingTemplate] = useState(false);

  // Student register fields
  const [sName, setSName] = useState('');
  const [sEmail, setSEmail] = useState('');
  const [sPassword, setSPassword] = useState('');
  const [sConfirmPassword, setSConfirmPassword] = useState('');
  const [sClassCode, setSClassCode] = useState('');
  const [sClassName, setSClassName] = useState('');
  const [showSPass, setShowSPass] = useState(false);

  // Missing profile recovery fields
  const [recoverName, setRecoverName] = useState(
    pendingDraft?.name || firebaseUser?.displayName || ''
  );
  const [recoverRole, setRecoverRole] = useState<'admin' | 'teacher' | 'student'>(() => {
    if (pendingDraft?.role) return pendingDraft.role;
    return 'student';
  });
  const [recoverSchool, setRecoverSchool] = useState(pendingDraft?.school || '');
  const [recoverClassName, setRecoverClassName] = useState(pendingDraft?.className || '');
  const [recoverClassCode, setRecoverClassCode] = useState(pendingDraft?.classCode || '');

  // Live Auth/Firestore sync diagnostic state
  const [syncDiag, setSyncDiag] = useState<AccountSyncDiagnostic | null>(null);
  const [isCheckingDiag, setIsCheckingDiag] = useState(false);
  const [isSendingVerification, setIsSendingVerification] = useState(false);
  const [isRefreshingAuth, setIsRefreshingAuth] = useState(false);

  const loadSyncDiagnostic = useCallback(async (forceTokenRefresh = false) => {
    const targetUser = auth?.currentUser || firebaseUser;
    if (!targetUser) return;
    setIsCheckingDiag(true);
    try {
      const diag = await inspectAccountSyncStatus(targetUser, forceTokenRefresh);
      setSyncDiag(diag);
      if (diag.hasTrustedAdminAuthority) {
        setRecoverRole('admin');
      }
      setRecoverName((prev) => {
        if (prev.trim()) return prev;
        if (diag.existingName) return diag.existingName;
        if (diag.displayName) return diag.displayName;
        return prev;
      });
    } finally {
      setIsCheckingDiag(false);
    }
  }, [firebaseUser]);

  useEffect(() => {
    if ((authState === 'missing_profile' || authState === 'profile_read_error') && firebaseUser) {
      void loadSyncDiagnostic(false);
    }
  }, [authState, firebaseUser, loadSyncDiagnostic]);

  const clearBanners = () => {
    setErrorMsg(null);
    setErrorDiag(null);
    setSuccessMsg(null);
  };

  // --------------------------------------------------------------------------
  // SPECIAL SESSION STATUS SCREENS (Pending / Locked / Rejected / Recovery)
  // --------------------------------------------------------------------------

  if (authState === 'initializing') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white border border-slate-200 rounded-3xl shadow-lg p-10 max-w-md w-full text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-blue-700 to-indigo-600 text-white flex items-center justify-center mx-auto shadow-md">
            <FlaskConical className="w-7 h-7 animate-pulse" />
          </div>
          <h2 className="text-lg font-extrabold text-slate-900">
            Đang khôi phục phiên đăng nhập {APP_CONFIG.APP_NAME}...
          </h2>
          <p className="text-xs text-slate-500">
            Hệ thống đang xác thực tài khoản và tải không gian làm việc của bạn.
          </p>
        </div>
      </div>
    );
  }

  if (authState === 'firebase_error') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white border border-rose-200 rounded-3xl shadow-lg p-8 max-w-lg w-full text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto">
            <ShieldAlert className="w-7 h-7" />
          </div>
          <h2 className="text-lg font-extrabold text-slate-900">Lỗi kết nối Firebase</h2>
          <p className="text-xs text-slate-600 leading-relaxed">
            {authError || 'Không thể khởi tạo Firebase Authentication / Firestore.'}
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold"
          >
            Tải lại trang
          </button>
        </div>
      </div>
    );
  }

  if (authState === 'profile_read_error') {
    const activeDiag = authDiagnostic || syncDiag?.userDocError || errorDiag;
    const headingByCategory: Record<string, string> = {
      read_permission_denied: 'Không đủ quyền đọc hồ sơ Firestore (Permission denied)',
      write_permission_denied: 'Không đủ quyền ghi hồ sơ Firestore (Permission denied)',
      profile_creation_failed: 'Tạo hồ sơ Firestore thất bại (Profile creation failed)',
      admin_not_initialized: 'Quyền Admin chưa được khởi tạo (Admin role not initialized)',
      authentication_required: 'Yêu cầu xác thực đăng nhập (Authentication required)',
      project_mismatch: 'Sai cấu hình Firebase Project hoặc Database ID',
      network_error: 'Lỗi kết nối mạng tới Firebase Firestore',
    };
    const title =
      (activeDiag?.category && headingByCategory[activeDiag.category]) ||
      'Lỗi truy cập hồ sơ Firestore';

    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white border border-rose-200 rounded-3xl shadow-xl p-7 sm:p-8 max-w-xl w-full space-y-5">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-700 flex items-center justify-center shrink-0">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-rose-700">
                CHẨN ĐOÁN LỖI FIRESTORE
              </span>
              <h2 className="text-base font-extrabold text-slate-900">{title}</h2>
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-xs text-rose-900 space-y-1.5 leading-relaxed">
            <p className="font-bold">{authError || activeDiag?.userMessage || 'Không thể đọc dữ liệu hồ sơ người dùng từ Firestore.'}</p>
            <p className="text-[11px] text-rose-800">
              Hệ thống giữ nguyên phiên Firebase Auth hiện tại ({firebaseUser?.email || 'đã đăng nhập'}) để bạn kiểm tra nguyên nhân thực tế mà không tự ý chuyển hướng hay tạo tài khoản trùng.
            </p>
          </div>

          <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 text-[11px] text-slate-700 space-y-1.5">
            <div className="font-bold text-slate-800 uppercase tracking-wide">Thông số kỹ thuật</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-1">
              <div>
                <span className="text-slate-500">UID Auth:</span>{' '}
                <code className="font-mono bg-slate-200/70 px-1.5 py-0.5 rounded text-[10px]">
                  {firebaseUser?.uid || '—'}
                </code>
              </div>
              <div>
                <span className="text-slate-500">Email Auth:</span>{' '}
                <strong>{firebaseUser?.email || '—'}</strong>
              </div>
              <div>
                <span className="text-slate-500">Project ID:</span>{' '}
                <code className="font-mono bg-slate-200/70 px-1 py-0.5 rounded text-[10px]">
                  {activeDiag?.projectId || syncDiag?.projectId || '—'}
                </code>
              </div>
              <div>
                <span className="text-slate-500">Database ID:</span>{' '}
                <code className="font-mono bg-slate-200/70 px-1 py-0.5 rounded text-[10px]">
                  {activeDiag?.databaseId || syncDiag?.databaseId || '—'}
                </code>
              </div>
              <div>
                <span className="text-slate-500">Thao tác bị lỗi:</span>{' '}
                <code className="font-mono bg-slate-200/70 px-1 py-0.5 rounded text-[10px]">
                  {activeDiag ? `${activeDiag.operation} ${activeDiag.path}` : 'GET users/{uid}'}
                </code>
              </div>
              <div>
                <span className="text-slate-500">Mã lỗi Firebase:</span>{' '}
                <code className="font-mono bg-rose-100 text-rose-800 px-1 py-0.5 rounded text-[10px]">
                  {activeDiag?.code || 'unknown'}
                </code>
              </div>
            </div>
          </div>

          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
              {errorMsg}
            </div>
          )}

          <div className="flex items-center justify-between gap-3 pt-1">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={async () => {
                clearBanners();
                setIsSubmitting(true);
                try {
                  const res = await refreshProfile();
                  await loadSyncDiagnostic(true);
                  if (!res.success && res.errorMessage) {
                    setErrorMsg(res.errorMessage);
                  }
                } finally {
                  setIsSubmitting(false);
                }
              }}
              className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-xs font-bold flex items-center justify-center gap-1.5"
            >
              <RefreshCw className={`w-4 h-4 ${isSubmitting ? 'animate-spin' : ''}`} />
              <span>{isSubmitting ? 'Đang kiểm tra lại...' : 'Thử kiểm tra lại'}</span>
            </button>
            <button
              type="button"
              onClick={() => void logout()}
              className="px-4 py-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold flex items-center gap-1.5"
            >
              <LogOut className="w-4 h-4" />
              <span>Đăng xuất</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (authState === 'pending_approval') {
    const pilotKey = resolvePilotGroup(userProfile);
    const pilotMeta = PILOT_GROUP_META[pilotKey];

    const handleDownloadWordSample = async () => {
      setIsDownloadingTemplate(true);
      try {
        await downloadStandardChemistryWordTemplate();
        setSuccessMsg('Đã tải file Word mẫu chuẩn GDPT 2018 (.docx) thành công.');
      } catch (err) {
        setErrorMsg(
          err instanceof Error ? err.message : 'Không thể tạo file Word mẫu. Vui lòng thử lại.'
        );
      } finally {
        setIsDownloadingTemplate(false);
      }
    };

    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 py-8">
        <div className="bg-white border border-amber-200 rounded-3xl shadow-xl p-6 sm:p-8 max-w-2xl w-full space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                <Clock className="w-6 h-6" />
              </div>
              <div>
                <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-amber-700">
                  TRẠNG THÁI: CHỜ PHÊ DUYỆT (PENDING)
                </span>
                <h2 className="text-lg sm:text-xl font-extrabold text-slate-900 mt-0.5">
                  Tài khoản đang chờ Super Admin phê duyệt tham gia thử nghiệm
                </h2>
              </div>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-amber-50/90 border border-amber-200 text-xs text-amber-950 space-y-2 leading-relaxed">
            <p className="font-bold">
              Xin chào Thầy/Cô {userProfile?.name || firebaseUser?.email} — hồ sơ đăng ký đã được ghi nhận trên hệ thống {APP_CONFIG.APP_NAME}.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 text-[11px]">
              <div className="bg-white/80 rounded-xl px-3 py-2 border border-amber-200/70">
                <span className="text-amber-700 block font-semibold">Trường THPT công tác</span>
                <span className="font-bold text-slate-900">
                  {userProfile?.school || 'Chưa cập nhật'}
                </span>
              </div>
              <div className="bg-white/80 rounded-xl px-3 py-2 border border-amber-200/70">
                <span className="text-amber-700 block font-semibold">Tổ chuyên môn</span>
                <span className="font-bold text-slate-900">
                  {userProfile?.department || 'Tổ Hóa học'}
                </span>
              </div>
              <div className="bg-white/80 rounded-xl px-3 py-2 border border-amber-200/70">
                <span className="text-amber-700 block font-semibold">Nhóm triển khai</span>
                <span className="font-bold text-slate-900">{pilotMeta.label}</span>
              </div>
            </div>
            <p className="text-[11px] text-amber-900 pt-1">
              Trong thời gian chờ Super Admin phê duyệt, các chức năng <strong>Giao bài cho lớp, Xuất bản đề thi trực tuyến và Truy cập Kho đề Thành phố</strong> đang tạm khóa. Thầy/Cô vẫn có thể <strong>tải file Word mẫu chuẩn GDPT 2018</strong> và <strong>xem trước giao diện đề thi 3 dạng thức</strong> ngay bên dưới.
            </p>
          </div>

          {/* Allowed Preview & Template Actions for Pending Teachers */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={handleDownloadWordSample}
              disabled={isDownloadingTemplate}
              className="p-4 rounded-2xl border border-indigo-200 bg-indigo-50/70 hover:bg-indigo-100/70 transition-colors text-left flex items-start gap-3 disabled:opacity-60"
            >
              <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0">
                <Download className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-extrabold text-indigo-950">
                  {isDownloadingTemplate ? 'Đang tạo tệp Word...' : 'Tải file Word mẫu chuẩn (.docx)'}
                </p>
                <p className="text-[11px] text-indigo-800/90 mt-0.5 leading-snug">
                  Cấu trúc 3 phần GDPT 2018 kèm công thức Hóa học &amp; bảng đáp án chuẩn để bóc tách tự động.
                </p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setShowPendingExamPreview((prev) => !prev)}
              className="p-4 rounded-2xl border border-emerald-200 bg-emerald-50/70 hover:bg-emerald-100/70 transition-colors text-left flex items-start gap-3"
            >
              <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
                <BookOpen className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-extrabold text-emerald-950">
                  {showPendingExamPreview
                    ? 'Thu gọn bản xem trước đề thi'
                    : 'Xem trước giao diện đề thi 3 phần'}
                </p>
                <p className="text-[11px] text-emerald-800/90 mt-0.5 leading-snug">
                  Trải nghiệm hiển thị công thức Hóa học, câu Đúng/Sai 4 ý và Trả lời ngắn chuẩn Bộ GD&amp;ĐT.
                </p>
              </div>
            </button>
          </div>

          {/* Interactive Read-Only Preview of GDPT 2018 3-Part Chemistry Exam */}
          {showPendingExamPreview && (
            <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 sm:p-5 space-y-4">
              <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-slate-200">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-700">
                    BẢN XEM TRƯỚC GIAO DIỆN ĐỀ THI HÓA HỌC · GDPT 2018
                  </span>
                  <h3 className="text-sm font-extrabold text-slate-900">
                    Đề minh họa 3 dạng thức (Phần I · Phần II · Phần III)
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowPendingExamPreview(false)}
                  className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-200/70"
                  title="Đóng xem trước"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Part I Sample */}
              <div className="bg-white rounded-xl border border-slate-200 p-3.5 space-y-2">
                <span className="inline-block text-[11px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md">
                  Phần I. Câu trắc nghiệm nhiều phương án lựa chọn (0,25 điểm/câu)
                </span>
                <div className="text-xs text-slate-800 font-semibold">
                  Câu 1. <ChemRenderer text="Thủy phân hoàn toàn ester CH_3COOC_2H_5 trong dung dịch NaOH đun nóng thu được muối có công thức là" />
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs text-slate-700">
                  <div className="px-3 py-1.5 rounded-lg border border-emerald-300 bg-emerald-50 font-semibold">
                    A. <ChemRenderer text="CH_3COONa" />
                  </div>
                  <div className="px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50">
                    B. <ChemRenderer text="C_2H_5COONa" />
                  </div>
                  <div className="px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50">
                    C. <ChemRenderer text="HCOONa" />
                  </div>
                  <div className="px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50">
                    D. <ChemRenderer text="C_2H_5OH" />
                  </div>
                </div>
              </div>

              {/* Part II Sample */}
              <div className="bg-white rounded-xl border border-slate-200 p-3.5 space-y-2">
                <span className="inline-block text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md">
                  Phần II. Câu trắc nghiệm Đúng/Sai (Thang điểm lũy tiến 0,1 → 0,25 → 0,5 → 1,0)
                </span>
                <div className="text-xs text-slate-800 font-semibold">
                  Câu 2. <ChemRenderer text="Xét cân bằng tổng hợp ammonia: N_2(g) + 3H_2(g) ⇌ 2NH_3(g) (Δ_rH°_{298} = -91,8 kJ). Mỗi phát biểu sau đây đúng hay sai?" />
                </div>
                <div className="space-y-1.5 text-xs">
                  {[
                    { id: 'a', text: 'Phản ứng thuận là phản ứng tỏa nhiệt.', val: 'Đúng' },
                    { id: 'b', text: 'Khi tăng áp suất chung của hệ, cân bằng chuyển dịch theo chiều thuận.', val: 'Đúng' },
                    { id: 'c', text: 'Khi tăng nhiệt độ, cân bằng chuyển dịch theo chiều thuận.', val: 'Sai' },
                    { id: 'd', text: 'Chất xúc tác Fe làm tăng tốc độ cả phản ứng thuận và phản ứng nghịch.', val: 'Đúng' },
                  ].map((st) => (
                    <div
                      key={st.id}
                      className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200"
                    >
                      <span className="text-slate-700">
                        <strong>{st.id})</strong> {st.text}
                      </span>
                      <span
                        className={`text-[11px] font-bold px-2 py-0.5 rounded ${
                          st.val === 'Đúng'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        {st.val}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Part III Sample */}
              <div className="bg-white rounded-xl border border-slate-200 p-3.5 space-y-2">
                <span className="inline-block text-[11px] font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-md">
                  Phần III. Câu trắc nghiệm yêu cầu trả lời ngắn (0,25 điểm/câu)
                </span>
                <div className="text-xs text-slate-800 font-semibold">
                  Câu 3. <ChemRenderer text="Lên men hoàn toàn 180 gam glucose (C_6H_{12}O_6) thành ethanol với hiệu suất 80%. Tính khối lượng ethanol (gam) thu được." />
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-slate-500 font-semibold">Ô đáp án số học sinh nhập:</span>
                  <span className="px-3 py-1 rounded-lg border border-indigo-300 bg-indigo-50 font-mono font-bold text-indigo-900">
                    73,6
                  </span>
                </div>
              </div>
            </div>
          )}

          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={async () => {
                clearBanners();
                setIsSubmitting(true);
                await refreshProfile();
                setSuccessMsg('Đã kiểm tra lại trạng thái phê duyệt từ máy chủ.');
                setIsSubmitting(false);
              }}
              disabled={isSubmitting}
              className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-xs font-bold flex items-center gap-1.5"
            >
              <RefreshCw className={`w-4 h-4 ${isSubmitting ? 'animate-spin' : ''}`} />
              <span>Kiểm tra lại trạng thái phê duyệt</span>
            </button>

            <button
              type="button"
              onClick={() => void logout()}
              className="px-4 py-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold flex items-center gap-1.5"
            >
              <LogOut className="w-4 h-4" />
              <span>Đăng xuất</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (authState === 'rejected' || authState === 'locked') {
    const isRejected = authState === 'rejected';
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white border border-rose-200 rounded-3xl shadow-xl p-8 max-w-lg w-full space-y-5 text-center">
          <div className="w-14 h-14 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto">
            <ShieldAlert className="w-7 h-7" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-extrabold text-slate-900">
              {isRejected ? 'Yêu cầu đăng ký chưa được phê duyệt' : 'Tài khoản đang bị tạm khóa'}
            </h2>
            <p className="text-xs text-slate-600 leading-relaxed">
              {isRejected
                ? `Tài khoản ${userProfile?.email || firebaseUser?.email || ''} đã bị Quản trị viên từ chối cấp quyền.`
                : `Tài khoản ${userProfile?.email || firebaseUser?.email || ''} hiện đang bị khóa bởi Quản trị viên. Mọi thao tác truy cập dữ liệu đã tạm ngưng.`}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void logout()}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-black text-white text-xs font-bold"
          >
            <LogOut className="w-4 h-4" />
            <span>Đăng xuất khỏi tài khoản</span>
          </button>
        </div>
      </div>
    );
  }

  if (authState === 'missing_profile') {
    const isEmailVerified = Boolean(syncDiag?.emailVerified ?? firebaseUser?.emailVerified);
    const hasAdminAuthority = Boolean(syncDiag?.hasTrustedAdminAuthority);
    const isExpectedPrimaryAdmin =
      (firebaseUser?.email || '').trim().toLowerCase() === EXPECTED_PRIMARY_ADMIN_EMAIL;

    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white border border-amber-200 rounded-3xl shadow-xl p-7 sm:p-8 max-w-xl w-full space-y-5">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
              <AlertCircle className="w-6 h-6" />
            </div>
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-amber-700">
                CẦN HOÀN TẤT ĐỒNG BỘ HỒ SƠ
              </span>
              <h2 className="text-base font-extrabold text-slate-900">
                {firebaseUser?.email || 'Tài khoản đã xác thực'}
              </h2>
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-xs text-amber-900 space-y-1.5 leading-relaxed">
            <p className="font-bold">
              Tài khoản Firebase Auth đã đăng nhập hợp lệ, nhưng hồ sơ trên Firestore chưa tồn tại hoặc chưa đầy đủ các trường bắt buộc.
            </p>
            <p>
              {authError ||
                'Hệ thống giữ nguyên phiên Auth hiện tại và không tạo tài khoản trùng lặp.'}
            </p>
          </div>

          {syncDiag?.projectMismatchSuspected && (
            <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 text-xs text-rose-800 font-semibold">
              Cảnh báo: Biến môi trường trên Vercel/môi trường chạy có Project ID hoặc Database ID khác với <code className="font-mono">firebase-applet-config.json</code>.
            </div>
          )}

          {/* Live Auth + Firestore Inspection Status */}
          <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 text-[11px] text-slate-700 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-800 uppercase tracking-wide">
                Trạng thái xác thực &amp; Firestore
              </span>
              {isCheckingDiag && (
                <span className="text-blue-600 font-semibold flex items-center gap-1">
                  <RefreshCw className="w-3 h-3 animate-spin" />
                  Đang kiểm tra...
                </span>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-1">
              <div>
                <span className="text-slate-500">UID Auth:</span>{' '}
                <code className="font-mono bg-slate-200/70 px-1.5 py-0.5 rounded text-[10px]">
                  {firebaseUser?.uid || '—'}
                </code>
              </div>
              <div>
                <span className="text-slate-500">Project / DB:</span>{' '}
                <code className="font-mono bg-slate-200/70 px-1 py-0.5 rounded text-[10px]">
                  {syncDiag ? `${syncDiag.projectId} / ${syncDiag.databaseId}` : 'Đang kiểm tra...'}
                </code>
              </div>
              <div>
                <span className="text-slate-500">Hồ sơ users/&#123;uid&#125;:</span>{' '}
                <strong
                  className={
                    syncDiag?.userDocError
                      ? 'text-rose-700'
                      : syncDiag?.userDocExists
                      ? 'text-amber-700'
                      : 'text-rose-700'
                  }
                >
                  {syncDiag
                    ? syncDiag.userDocError
                      ? `Lỗi ${syncDiag.userDocError.code} (${syncDiag.userDocError.operation})`
                      : syncDiag.userDocExists
                      ? `Thiếu: ${syncDiag.userDocMissingFields.join(', ') || 'cần đồng bộ'}`
                      : 'Chưa tồn tại'
                    : 'Đang kiểm tra...'}
                </strong>
              </div>
              <div>
                <span className="text-slate-500">Quyền Admin máy chủ:</span>{' '}
                <strong className={hasAdminAuthority ? 'text-emerald-700' : syncDiag?.adminDocError ? 'text-rose-700' : 'text-slate-600'}>
                  {syncDiag
                    ? hasAdminAuthority
                      ? 'Hợp lệ (admins/{uid})'
                      : syncDiag.adminDocDiagnostic
                      ? `Lỗi ${syncDiag.adminDocDiagnostic.code} tại ${syncDiag.adminDocDiagnostic.path}`
                      : syncDiag.adminDocError
                      ? syncDiag.adminDocError
                      : 'Chưa có admins/{uid}'
                    : 'Đang kiểm tra...'}
                </strong>
              </div>
              <div>
                <span className="text-slate-500">Xác minh email:</span>{' '}
                <strong className={isEmailVerified ? 'text-emerald-700' : 'text-amber-700'}>
                  {isEmailVerified ? 'Đã xác minh' : 'Chưa xác minh'}
                </strong>
              </div>
            </div>
          </div>

          {!hasAdminAuthority && isExpectedPrimaryAdmin && (
            <div className="p-3.5 rounded-2xl bg-indigo-50 border border-indigo-200 text-[11px] text-indigo-950 space-y-2 leading-relaxed">
              <div className="font-bold text-indigo-900 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-indigo-600 shrink-0" />
                <span>Khởi tạo quyền Admin chính một lần trên máy chủ Firebase</span>
              </div>
              <p>
                Vì lý do bảo mật, trình duyệt không được phép tự tạo document <code className="font-mono">admins/{firebaseUser?.uid}</code> hoặc tự gán <code className="font-mono">role: &quot;admin&quot;</code>. Hãy thực hiện 1 trong 2 cách sau:
              </p>
              <ul className="list-disc list-inside space-y-1 text-indigo-900">
                <li>
                  <strong>Cách A (Firebase Console):</strong> Mở Firestore Database{' '}
                  <code className="font-mono bg-white/80 px-1 rounded">{syncDiag?.databaseId || 'ai-studio-chemtest-2d596eaa-de9e-460a-8554-f85091b4622e'}</code> → tạo collection <code className="font-mono">admins</code> → Document ID{' '}
                  <code className="font-mono bg-white/80 px-1 rounded">{firebaseUser?.uid}</code> với{' '}
                  <code className="font-mono">{`{ email, role: "admin", isActive: true }`}</code>.
                </li>
                <li>
                  <strong>Cách B (Admin SDK Script):</strong> Chạy{' '}
                  <code className="font-mono bg-white/80 px-1 rounded">node scripts/restore-admin-profile.mjs</code> cùng Service Account JSON ở máy quản trị.
                </li>
              </ul>
              <button
                type="button"
                disabled={isCheckingDiag}
                onClick={async () => {
                  clearBanners();
                  await refreshProfile();
                  await loadSyncDiagnostic(true);
                }}
                className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-[11px] font-bold inline-flex items-center gap-1.5"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isCheckingDiag ? 'animate-spin' : ''}`} />
                <span>Kiểm tra lại quyền Admin từ máy chủ</span>
              </button>
            </div>
          )}

          {/* Independent Email Verification Section */}
          <div
            className={`p-3.5 rounded-2xl border text-xs space-y-2 ${
              isEmailVerified
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : 'bg-slate-50 border-slate-200 text-slate-800'
            }`}
          >
            {isEmailVerified ? (
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 font-bold text-emerald-800">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Email đã được xác minh ({firebaseUser?.email})</span>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2 font-bold text-slate-900">
                  <Mail className="w-4 h-4 text-blue-600 shrink-0" />
                  <span>Xác minh địa chỉ email</span>
                </div>
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  Email của tài khoản chưa được xác minh trên Firebase Auth. Lưu ý: Xác minh email không tự động cấp quyền Admin; quyền Admin phải được xác lập riêng bằng cơ chế bảo mật (<code className="font-mono">admins/&#123;uid&#125;</code> hoặc Admin Custom Claim).
                </p>
                <div className="flex flex-wrap gap-2 pt-0.5">
                  <button
                    type="button"
                    disabled={isSendingVerification || isRefreshingAuth}
                    onClick={async () => {
                      clearBanners();
                      setIsSendingVerification(true);
                      try {
                        const res = await sendVerificationEmailToCurrentUser();
                        if (res.success) {
                          setSuccessMsg(
                            res.warningMessage ||
                              `Đã gửi email xác minh tới ${firebaseUser?.email || 'hộp thư của bạn'}. Vui lòng kiểm tra Hộp thư đến hoặc Thư rác (Spam).`
                          );
                        } else {
                          setErrorMsg(res.errorMessage || 'Không thể gửi email xác minh.');
                        }
                      } finally {
                        setIsSendingVerification(false);
                      }
                    }}
                    className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-[11px] font-bold flex items-center gap-1.5"
                  >
                    <Mail className="w-3.5 h-3.5" />
                    <span>{isSendingVerification ? 'Đang gửi...' : 'Gửi email xác minh'}</span>
                  </button>
                  <button
                    type="button"
                    disabled={isRefreshingAuth || isSendingVerification}
                    onClick={async () => {
                      clearBanners();
                      setIsRefreshingAuth(true);
                      try {
                        const res = await refreshProfile();
                        await loadSyncDiagnostic(true);
                        if (!res.success && res.errorMessage) {
                          setErrorMsg(res.errorMessage);
                        } else if (res.emailVerified) {
                          setSuccessMsg('Email đã được xác minh và đã làm mới phiên đăng nhập.');
                        } else {
                          setErrorMsg(
                            'Email vẫn chưa được xác minh trên Firebase Auth. Vui lòng mở liên kết trong email trước rồi bấm làm mới lại.'
                          );
                        }
                      } finally {
                        setIsRefreshingAuth(false);
                      }
                    }}
                    className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-60 text-slate-800 text-[11px] font-bold flex items-center gap-1.5"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingAuth ? 'animate-spin' : ''}`} />
                    <span>{isRefreshingAuth ? 'Đang làm mới...' : 'Tôi đã xác minh – Làm mới'}</span>
                  </button>
                </div>
              </>
            )}
          </div>

          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs space-y-1">
              <div className="font-semibold flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
              {errorDiag && (
                <div className="pl-6 text-[11px] font-mono text-rose-700">
                  [{errorDiag.category}] {errorDiag.operation} {errorDiag.path} • code: {errorDiag.code} • project: {errorDiag.projectId}
                </div>
              )}
            </div>
          )}
          {successMsg && (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Dedicated Profile Sync Form */}
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              clearBanners();
              setIsSubmitting(true);
              try {
                const effectiveRole = hasAdminAuthority
                  ? 'admin'
                  : recoverRole === 'teacher'
                  ? 'teacher'
                  : 'student';

                const res = await retrySyncMissingProfile(
                  pendingDraft
                    ? undefined
                    : {
                        intendedRole: effectiveRole,
                        name: recoverName.trim() || undefined,
                        school: recoverSchool.trim() || undefined,
                        className: recoverClassName.trim() || undefined,
                        classCode: recoverClassCode.trim() || undefined,
                      }
                );
                await loadSyncDiagnostic(false);
                if (!res.success) {
                  setErrorMsg(res.errorMessage || 'Chưa thể đồng bộ hồ sơ.');
                  setErrorDiag(res.errorDiagnostic || null);
                } else {
                  setSuccessMsg(res.warningMessage || 'Đồng bộ hồ sơ thành công');
                }
              } finally {
                setIsSubmitting(false);
              }
            }}
            className="space-y-3 pt-1 border-t border-slate-100"
          >
            {hasAdminAuthority && (
              <div className="p-3 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-900 text-xs font-semibold flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                <span>
                  Quyền Admin hợp lệ đã được xác thực trên máy chủ. Nhấn <strong>“Đồng bộ hồ sơ”</strong> để tạo hoặc bổ sung các trường còn thiếu cho <code className="font-mono">users/{firebaseUser?.uid}</code>.
                </span>
              </div>
            )}

            {!pendingDraft && (
              <>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Họ và tên hiển thị{' '}
                    {hasAdminAuthority || syncDiag?.existingName ? (
                      '(tùy chọn / giữ nguyên nếu đã có)'
                    ) : (
                      <span className="text-rose-500">*</span>
                    )}
                  </label>
                  <input
                    type="text"
                    required={!hasAdminAuthority && !syncDiag?.existingName}
                    value={recoverName}
                    onChange={(e) => setRecoverName(e.target.value)}
                    placeholder="Nhập họ và tên của bạn"
                    className="w-full p-2.5 rounded-xl border border-slate-200 text-xs font-semibold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Vai trò hồ sơ</label>
                  <select
                    value={hasAdminAuthority ? 'admin' : recoverRole === 'admin' ? 'student' : recoverRole}
                    disabled={hasAdminAuthority}
                    onChange={(e) => setRecoverRole(e.target.value as 'teacher' | 'student')}
                    className="w-full p-2.5 rounded-xl border border-slate-200 text-xs font-semibold bg-white disabled:bg-slate-100"
                  >
                    {hasAdminAuthority ? (
                      <option value="admin">
                        Quản trị viên (Admin — Đã xác thực admins/&#123;uid&#125; / Claim)
                      </option>
                    ) : (
                      <>
                        <option value="student">Học sinh</option>
                        <option value="teacher">Giáo viên (Chờ Admin duyệt)</option>
                      </>
                    )}
                  </select>
                </div>
                {recoverRole === 'teacher' && !hasAdminAuthority && (
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Trường / Đơn vị (tùy chọn)</label>
                    <input
                      type="text"
                      value={recoverSchool}
                      onChange={(e) => setRecoverSchool(e.target.value)}
                      className="w-full p-2.5 rounded-xl border border-slate-200 text-xs"
                    />
                  </div>
                )}
                {recoverRole === 'student' && !hasAdminAuthority && (
                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Lớp (tùy chọn)</label>
                      <input
                        type="text"
                        value={recoverClassName}
                        onChange={(e) => setRecoverClassName(e.target.value)}
                        placeholder="12 Hóa 1"
                        className="w-full p-2.5 rounded-xl border border-slate-200 text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Mã lớp (tùy chọn)</label>
                      <input
                        type="text"
                        value={recoverClassCode}
                        onChange={(e) => setRecoverClassCode(e.target.value.toUpperCase())}
                        placeholder="VD: 12HOA1"
                        className="w-full p-2.5 rounded-xl border border-slate-200 text-xs font-mono"
                      />
                    </div>
                  </div>
                )}
              </>
            )}

            <div className="flex items-center justify-between gap-3 pt-2">
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-xs font-bold flex items-center justify-center gap-1.5"
              >
                <RefreshCw className={`w-4 h-4 ${isSubmitting ? 'animate-spin' : ''}`} />
                <span>{isSubmitting ? 'Đang đồng bộ hồ sơ...' : 'Đồng bộ hồ sơ'}</span>
              </button>
              <button
                type="button"
                onClick={() => void logout()}
                className="px-4 py-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold"
              >
                Đăng xuất
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // UNAUTHENTICATED LOGIN / REGISTER / FORGOT PASSWORD FORMS (Email/Pass ONLY)
  // --------------------------------------------------------------------------

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    clearBanners();
    setIsSubmitting(true);
    try {
      const res = await loginWithEmailPassword(loginEmail, loginPassword);
      if (!res.success && !res.profileSyncFailed) {
        setErrorMsg(res.errorMessage || 'Đăng nhập thất bại.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleTeacherRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    clearBanners();
    if (!tSchool.trim()) {
      setErrorMsg('Vui lòng chọn hoặc nhập tên Trường THPT công tác.');
      return;
    }
    if (!tDepartment.trim()) {
      setErrorMsg('Vui lòng nhập Tổ chuyên môn.');
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await registerTeacherAccount({
        name: tName,
        email: tEmail,
        password: tPassword,
        confirmPassword: tConfirmPassword,
        phone: tPhone,
        school: tSchool.trim(),
        department: tDepartment.trim(),
      });
      if (!res.success) {
        setErrorMsg(res.errorMessage || 'Không thể đăng ký tài khoản Giáo viên.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStudentRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    clearBanners();
    setIsSubmitting(true);
    try {
      const res = await registerStudentAccount({
        name: sName,
        email: sEmail,
        password: sPassword,
        confirmPassword: sConfirmPassword,
        classCode: sClassCode,
        className: sClassName,
      });
      if (!res.success) {
        setErrorMsg(res.errorMessage || 'Không thể đăng ký tài khoản Học sinh.');
      } else if (res.warningMessage) {
        setSuccessMsg(res.warningMessage);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleForgotPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    clearBanners();
    setIsSubmitting(true);
    try {
      const res = await requestPasswordReset(resetEmail);
      if (res.success) {
        setSuccessMsg(
          `Đã gửi email hướng dẫn đặt lại mật khẩu tới ${resetEmail.trim()}. Vui lòng kiểm tra Hộp thư đến hoặc mục Thư rác (Spam).`
        );
      } else {
        setErrorMsg(res.errorMessage || 'Không thể gửi email đặt lại mật khẩu.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleQuickExamSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const code = normalizeExamCode(quickExamCode);
    if (!code || !onQuickExamCodeLookup) return;
    onQuickExamCodeLookup(code);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl w-full mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Brand & Quick Exam Entry */}
        <div className="lg:col-span-5 space-y-5">
          <div className="bg-gradient-to-br from-blue-700 via-blue-800 to-indigo-900 rounded-3xl p-7 text-white shadow-xl space-y-5">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-white/15 border border-white/20 flex items-center justify-center">
                <FlaskConical className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-black tracking-tight">{APP_CONFIG.APP_NAME}</h1>
                <p className="text-xs text-blue-200 font-medium">{APP_CONFIG.APP_DESCRIPTION}</p>
              </div>
            </div>

            <div className="space-y-2.5 text-xs text-blue-100 leading-relaxed">
              <p className="font-semibold text-white text-sm">
                Không gian làm việc độc lập cho Giáo viên &amp; Học sinh
              </p>
              <ul className="space-y-1.5 list-disc list-inside text-blue-100/90">
                <li>
                  <strong>Giáo viên:</strong> Ngân hàng câu hỏi, đề thi, thư mục, lớp học &amp; thống kê tách biệt hoàn toàn theo từng tài khoản.
                </li>
                <li>
                  <strong>Học sinh:</strong> Quản lý lớp đã tham gia, danh sách bài thi được giao và lịch sử điểm đồng bộ mọi thiết bị.
                </li>
                <li>
                  <strong>Bảo mật:</strong> Xác thực chuẩn Email &amp; Mật khẩu qua Firebase Authentication.
                </li>
              </ul>
            </div>

            <div className="pt-4 border-t border-white/15 text-[11px] text-blue-200">
              <p>Tác giả: <strong className="text-white">{APP_CONFIG.APP_AUTHOR}</strong></p>
              <p>{APP_CONFIG.APP_SCHOOL}</p>
            </div>
          </div>

          {onQuickExamCodeLookup && (
            <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-xs space-y-3">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
                <GraduationCap className="w-4 h-4 text-blue-600" />
                <span>Học sinh làm bài nhanh bằng Mã đề (Không cần tài khoản)</span>
              </div>
              <form onSubmit={handleQuickExamSubmit} className="flex gap-2">
                <input
                  type="text"
                  value={quickExamCode}
                  onChange={(e) => setQuickExamCode(e.target.value.toUpperCase())}
                  placeholder="Nhập mã đề / mã 6 ký tự (VD: HQ50, H7K9P2)..."
                  className="flex-1 px-3 py-2 rounded-xl border border-slate-200 text-xs font-mono font-bold uppercase bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-black text-white text-xs font-bold flex items-center gap-1.5 shrink-0"
                >
                  <Play className="w-3.5 h-3.5" />
                  <span>Vào thi</span>
                </button>
              </form>
            </div>
          )}
        </div>

        {/* Right Auth Forms */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-3xl shadow-xl overflow-hidden">
          {/* Mode Tabs */}
          <div className="grid grid-cols-3 border-b border-slate-200 bg-slate-50 text-xs font-bold">
            <button
              type="button"
              onClick={() => {
                clearBanners();
                setMode('login');
              }}
              className={`py-3.5 px-3 flex items-center justify-center gap-1.5 border-b-2 transition-colors ${
                mode === 'login' || mode === 'forgot_password'
                  ? 'border-blue-600 text-blue-700 bg-white'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <LogIn className="w-4 h-4" />
              <span>Đăng nhập</span>
            </button>
            <button
              type="button"
              onClick={() => {
                clearBanners();
                setMode('register_teacher');
              }}
              className={`py-3.5 px-3 flex items-center justify-center gap-1.5 border-b-2 transition-colors ${
                mode === 'register_teacher'
                  ? 'border-blue-600 text-blue-700 bg-white'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <UserPlus className="w-4 h-4" />
              <span>Đăng ký Giáo viên</span>
            </button>
            <button
              type="button"
              onClick={() => {
                clearBanners();
                setMode('register_student');
              }}
              className={`py-3.5 px-3 flex items-center justify-center gap-1.5 border-b-2 transition-colors ${
                mode === 'register_student'
                  ? 'border-emerald-600 text-emerald-700 bg-white'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <GraduationCap className="w-4 h-4" />
              <span>Đăng ký Học sinh</span>
            </button>
          </div>

          <div className="p-6 sm:p-8 space-y-5">
            {errorMsg && (
              <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
            )}

            {successMsg && (
              <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>{successMsg}</span>
              </div>
            )}

            {/* LOGIN FORM */}
            {mode === 'login' && (
              <form onSubmit={handleLoginSubmit} className="space-y-4">
                <div>
                  <h2 className="text-xl font-extrabold text-slate-900">Đăng nhập tài khoản</h2>
                  <p className="text-xs text-slate-500 mt-1">
                    Sử dụng Email và Mật khẩu đã đăng ký cho Giáo viên, Học sinh hoặc Quản trị viên.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">Email đăng nhập</label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="email"
                      required
                      autoComplete="email"
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      placeholder="name@example.com"
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-bold text-slate-700">Mật khẩu</label>
                    <button
                      type="button"
                      onClick={() => {
                        clearBanners();
                        setResetEmail(loginEmail);
                        setMode('forgot_password');
                      }}
                      className="text-[11px] font-bold text-blue-600 hover:underline"
                    >
                      Quên mật khẩu?
                    </button>
                  </div>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type={showLoginPass ? 'text' : 'password'}
                      required
                      autoComplete="current-password"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowLoginPass((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                      title={showLoginPass ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                    >
                      {showLoginPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-bold text-xs shadow-md shadow-blue-500/20 flex items-center justify-center gap-2 transition-colors"
                >
                  <LogIn className="w-4 h-4" />
                  <span>{isSubmitting ? 'Đang xác thực...' : 'Đăng nhập bằng Email'}</span>
                </button>

                <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                  <span>Chưa có tài khoản?</span>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        clearBanners();
                        setMode('register_teacher');
                      }}
                      className="font-bold text-blue-600 hover:underline"
                    >
                      Đăng ký Giáo viên
                    </button>
                    <span>•</span>
                    <button
                      type="button"
                      onClick={() => {
                        clearBanners();
                        setMode('register_student');
                      }}
                      className="font-bold text-emerald-600 hover:underline"
                    >
                      Đăng ký Học sinh
                    </button>
                  </div>
                </div>
              </form>
            )}

            {/* FORGOT PASSWORD FORM */}
            {mode === 'forgot_password' && (
              <form onSubmit={handleForgotPasswordSubmit} className="space-y-4">
                <button
                  type="button"
                  onClick={() => {
                    clearBanners();
                    setMode('login');
                  }}
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-blue-600"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Quay lại Đăng nhập</span>
                </button>

                <div>
                  <h2 className="text-xl font-extrabold text-slate-900 flex items-center gap-2">
                    <KeyRound className="w-5 h-5 text-blue-600" />
                    <span>Khôi phục mật khẩu</span>
                  </h2>
                  <p className="text-xs text-slate-500 mt-1">
                    Nhập địa chỉ email đã đăng ký, hệ thống sẽ gửi liên kết đặt lại mật khẩu qua Firebase Authentication.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">Email tài khoản</label>
                  <input
                    type="email"
                    required
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    placeholder="name@example.com"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-bold text-xs shadow-md"
                >
                  {isSubmitting ? 'Đang gửi email...' : 'Gửi email đặt lại mật khẩu'}
                </button>
              </form>
            )}

            {/* TEACHER REGISTER FORM */}
            {mode === 'register_teacher' && (
              <form onSubmit={handleTeacherRegisterSubmit} className="space-y-3.5">
                <div>
                  <h2 className="text-xl font-extrabold text-slate-900">Đăng ký tài khoản Giáo viên</h2>
                  <p className="text-xs text-slate-500 mt-1">
                    Sau khi đăng ký, tài khoản ở trạng thái <strong>Chờ duyệt</strong> cho đến khi Quản trị viên phê duyệt để mở khóa không gian giảng dạy.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Họ và tên <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={tName}
                      onChange={(e) => setTName(e.target.value)}
                      placeholder="Thầy/Cô Nguyễn Văn A"
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Email <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="email"
                      required
                      value={tEmail}
                      onChange={(e) => setTEmail(e.target.value)}
                      placeholder="giaovien@truong.edu.vn"
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Mật khẩu (tối thiểu 8 ký tự) <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type={showTPass ? 'text' : 'password'}
                        required
                        minLength={8}
                        value={tPassword}
                        onChange={(e) => setTPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full pl-3 pr-9 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold"
                      />
                      <button
                        type="button"
                        onClick={() => setShowTPass((v) => !v)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400"
                      >
                        {showTPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Xác nhận mật khẩu <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type={showTPass ? 'text' : 'password'}
                      required
                      minLength={8}
                      value={tConfirmPassword}
                      onChange={(e) => setTConfirmPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Trường THPT công tác <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative">
                      <School className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        required
                        list="danang-high-schools-list"
                        value={tSchool}
                        onChange={(e) => setTSchool(e.target.value)}
                        placeholder="Chọn trường TP. Đà Nẵng hoặc nhập thêm..."
                        className="w-full pl-8 pr-3 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <datalist id="danang-high-schools-list">
                        {DANANG_HIGH_SCHOOLS.map((schoolName) => (
                          <option key={schoolName} value={schoolName} />
                        ))}
                      </datalist>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Tổ chuyên môn <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative">
                      <Building2 className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        required
                        list="teacher-departments-list"
                        value={tDepartment}
                        onChange={(e) => setTDepartment(e.target.value)}
                        placeholder="Tổ Hóa học"
                        className="w-full pl-8 pr-3 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <datalist id="teacher-departments-list">
                        {DEFAULT_TEACHER_DEPARTMENTS.map((dept) => (
                          <option key={dept} value={dept} />
                        ))}
                      </datalist>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Số điện thoại liên hệ (tùy chọn)
                  </label>
                  <div className="relative">
                    <Phone className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="tel"
                      value={tPhone}
                      onChange={(e) => setTPhone(e.target.value)}
                      placeholder="09xx xxx xxx"
                      className="w-full pl-8 pr-3 py-2.5 rounded-xl border border-slate-200 text-xs"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-bold text-xs shadow-md shadow-blue-500/20"
                >
                  {isSubmitting ? 'Đang tạo tài khoản...' : 'Đăng ký tài khoản Giáo viên'}
                </button>
              </form>
            )}

            {/* STUDENT REGISTER FORM */}
            {mode === 'register_student' && (
              <form onSubmit={handleStudentRegisterSubmit} className="space-y-3.5">
                <div>
                  <h2 className="text-xl font-extrabold text-slate-900">Đăng ký tài khoản Học sinh</h2>
                  <p className="text-xs text-slate-500 mt-1">
                    Học sinh có thể đăng nhập ngay sau khi tạo tài khoản, tham gia lớp qua Mã lớp (nếu có) hoặc vào thi bằng Mã đề/Link chia sẻ.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Họ và tên <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={sName}
                      onChange={(e) => setSName(e.target.value)}
                      placeholder="Nguyễn Văn An"
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Email <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="email"
                      required
                      value={sEmail}
                      onChange={(e) => setSEmail(e.target.value)}
                      placeholder="hocsinh@example.com"
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Mật khẩu (tối thiểu 8 ký tự) <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type={showSPass ? 'text' : 'password'}
                        required
                        minLength={8}
                        value={sPassword}
                        onChange={(e) => setSPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full pl-3 pr-9 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold"
                      />
                      <button
                        type="button"
                        onClick={() => setShowSPass((v) => !v)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400"
                      >
                        {showSPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Xác nhận mật khẩu <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type={showSPass ? 'text' : 'password'}
                      required
                      minLength={8}
                      value={sConfirmPassword}
                      onChange={(e) => setSConfirmPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Mã lớp (tùy chọn)
                    </label>
                    <div className="relative">
                      <Hash className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={sClassCode}
                        onChange={(e) => setSClassCode(e.target.value.toUpperCase())}
                        placeholder="VD: 12HOA1 (nếu có)"
                        className="w-full pl-8 pr-3 py-2.5 rounded-xl border border-slate-200 text-xs font-mono uppercase"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Tên lớp (tùy chọn)
                    </label>
                    <input
                      type="text"
                      value={sClassName}
                      onChange={(e) => setSClassName(e.target.value)}
                      placeholder="12 Hóa 1"
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-xs"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-bold text-xs shadow-md shadow-emerald-500/20"
                >
                  {isSubmitting ? 'Đang tạo tài khoản...' : 'Đăng ký tài khoản Học sinh'}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
