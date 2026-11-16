import React, { useState, useEffect } from 'react';
import { User } from '../../types';
import {
  FlaskConical,
  GraduationCap,
  ShieldCheck,
  UserCircle2,
  LogOut,
  LogIn,
  Edit2,
  X,
  KeyRound,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  Menu,
  Code,
} from 'lucide-react';
import { APP_CONFIG, getUserGreeting } from '../../constants/brand';
import { updateOwnUserProfile, changeCurrentUserPassword } from '../../services/authService';

interface HeaderProps {
  currentUser: User | null;
  isGuest?: boolean;
  workspaceMode?: boolean;
  pageTitle?: string;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onOpenMobileMenu?: () => void;
  onOpenSystemDocs: () => void;
  onProfileUpdated?: (updated: User) => void;
  onLogout?: () => void | Promise<void>;
  onRequestAuth?: () => void;
}

const TAB_TITLES: Record<string, string> = {
  dashboard: 'Tổng quan Dashboard',
  upload_exam: 'Tạo đề thi từ Word / PDF',
  create_exam: 'Soạn đề thi & Ma trận',
  exam_manager: 'Kho đề thi & Phòng thi',
  question_bank: 'Ngân hàng câu hỏi',
  folder_manager: 'Thư mục chuyên đề',
  online_exams: 'Bài thi trực tuyến',
  exam_results: 'Kết quả và thống kê',
  class_manager: 'Quản lý học sinh & Lớp học',
  system_settings: 'Thiết lập hệ thống',
  admin_dashboard: 'Quản trị hệ thống',
  admin_users: 'Quản lý học sinh & Tài khoản',
};

export const Header: React.FC<HeaderProps> = ({
  currentUser,
  isGuest = false,
  workspaceMode = false,
  pageTitle,
  activeTab,
  setActiveTab,
  onOpenMobileMenu,
  onOpenSystemDocs,
  onProfileUpdated,
  onLogout,
  onRequestAuth,
}) => {
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [modalTab, setModalTab] = useState<'profile' | 'password'>('profile');

  // Profile fields
  const [editName, setEditName] = useState(currentUser?.name || '');
  const [editSchool, setEditSchool] = useState(currentUser?.school || '');
  const [editClass, setEditClass] = useState(currentUser?.className || '');
  const [editPhone, setEditPhone] = useState(currentUser?.phone || '');
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileFeedback, setProfileFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Change password fields
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordFeedback, setPasswordFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    setEditName(currentUser?.name || '');
    setEditSchool(currentUser?.school || '');
    setEditClass(currentUser?.className || '');
    setEditPhone(currentUser?.phone || '');
  }, [currentUser]);

  const handleOpenProfile = () => {
    setModalTab('profile');
    setProfileFeedback(null);
    setPasswordFeedback(null);
    setIsProfileModalOpen(true);
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    setProfileFeedback(null);
    setIsSavingProfile(true);
    try {
      const uid = currentUser.uid || currentUser.id;
      const res = await updateOwnUserProfile(uid, {
        name: editName,
        phone: editPhone,
        school: editSchool,
        className: editClass,
      });

      if (!res.success) {
        setProfileFeedback({ type: 'error', text: res.errorMessage || 'Không thể cập nhật hồ sơ.' });
        return;
      }

      const nextUser: User = res.user || {
        ...currentUser,
        name: editName.trim(),
        phone: editPhone.trim() || undefined,
        school: editSchool.trim() || undefined,
        className: editClass.trim() || undefined,
        updatedAt: new Date().toISOString(),
      };
      onProfileUpdated?.(nextUser);
      setProfileFeedback({ type: 'success', text: 'Đã cập nhật hồ sơ cá nhân lên hệ thống.' });
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordFeedback(null);
    setIsChangingPassword(true);
    try {
      const res = await changeCurrentUserPassword(currentPassword, newPassword, confirmNewPassword);
      if (!res.success) {
        setPasswordFeedback({
          type: 'error',
          text: res.errorMessage || 'Không thể đổi mật khẩu. Vui lòng kiểm tra lại.',
        });
        return;
      }
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      setPasswordFeedback({ type: 'success', text: 'Đã đổi mật khẩu thành công!' });
    } finally {
      setIsChangingPassword(false);
    }
  };

  const homeTab =
    isGuest || !currentUser
      ? 'exam_landing'
      : currentUser.role === 'student'
      ? 'student_home'
      : currentUser.role === 'admin'
      ? 'admin_dashboard'
      : 'dashboard';

  const resolvedTitle = pageTitle || TAB_TITLES[activeTab] || 'QUIZ PRO';

  return (
    <header className="shrink-0 min-h-[68px] z-30 bg-white border-b border-slate-200">
      <div className={workspaceMode ? 'h-[68px] px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-4' : 'max-w-7xl mx-auto h-[68px] px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-4'}>
        {/* Left: Workspace Page Title + Mobile Menu Trigger OR Guest/Student Brand */}
        {workspaceMode ? (
          <div className="flex items-center gap-3 min-w-0">
            {onOpenMobileMenu && (
              <button
                type="button"
                onClick={onOpenMobileMenu}
                aria-label="Mở menu điều hướng"
                className="lg:hidden p-2 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-100 shrink-0"
              >
                <Menu className="w-5 h-5" />
              </button>
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                <h2 className="text-base sm:text-lg font-bold text-slate-900 truncate">
                  {resolvedTitle}
                </h2>
                {currentUser && (
                  <span className="hidden sm:inline-flex px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-xs font-semibold shrink-0">
                    {currentUser.role === 'admin' ? 'Quản trị viên' : 'Giáo viên'}
                  </span>
                )}
              </div>
              {currentUser?.name && (
                <p className="text-xs text-slate-500 truncate hidden md:block">
                  Tài khoản: <span className="font-semibold text-slate-700">{currentUser.name}</span>
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setActiveTab(homeTab)}
              className="flex items-center gap-2.5 text-left group focus:outline-none shrink-0"
            >
              <div className="w-10 h-10 rounded-xl bg-teal-600 flex items-center justify-center text-white shadow-xs group-hover:bg-teal-700 transition-colors">
                <FlaskConical className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-extrabold text-xl tracking-tight text-slate-900">
                    QUIZ <span className="text-teal-700">PRO</span>
                  </span>
                  <span className="px-2 py-0.5 text-xs font-bold bg-teal-50 text-teal-800 border border-teal-200 rounded-md hidden sm:inline-block">
                    {APP_CONFIG.APP_NAME}
                  </span>
                </div>
                <p className="text-xs text-slate-500 font-medium hidden sm:block">
                  {APP_CONFIG.APP_DESCRIPTION}
                </p>
              </div>
            </button>

            {!isGuest && currentUser?.role === 'student' && (
              <button
                type="button"
                onClick={() => setActiveTab('student_home')}
                className={`hidden md:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-semibold transition-colors ${
                  activeTab === 'student_home'
                    ? 'bg-teal-50 text-teal-800 border border-teal-200'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <GraduationCap className="w-4 h-4" />
                <span>Phòng thi &amp; Lớp học</span>
              </button>
            )}
          </div>
        )}

        {/* Right: Prominent Author & School Unit Badge + Account Controls */}
        <div className="flex items-center gap-3 shrink-0">
          {/* Author Identity & Unit Badge (Always visible at top-right, never hidden in dropdown) */}
          <div className="hidden md:flex flex-col items-end text-right leading-tight">
            <span className="text-[18px] font-bold text-slate-900 tracking-tight whitespace-nowrap">
              {APP_CONFIG.APP_AUTHOR}
            </span>
            <span className="mt-0.5 inline-flex items-center px-2.5 py-0.5 rounded-md bg-teal-50 text-teal-800 border border-teal-200 text-[11px] font-bold tracking-wide whitespace-nowrap">
              TRƯỜNG THPT CHUYÊN NGUYỄN BỈNH KHIÊM | TỔ HÓA HỌC
            </span>
          </div>

          {!workspaceMode && (
            <button
              type="button"
              onClick={onOpenSystemDocs}
              title="Hồ sơ kiến trúc hệ thống"
              className="hidden sm:inline-flex items-center gap-1.5 px-3 min-h-[40px] rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-sm font-semibold transition-colors"
            >
              <Code className="w-4 h-4 text-teal-600" />
              <span className="hidden lg:inline">Kiến trúc</span>
            </button>
          )}

          {isGuest || !currentUser ? (
            <button
              type="button"
              onClick={onRequestAuth}
              className="px-4 min-h-[40px] rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold shadow-xs flex items-center gap-2 transition-colors"
            >
              <LogIn className="w-4 h-4" />
              <span>Đăng nhập</span>
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleOpenProfile}
                title="Hồ sơ cá nhân & Đổi mật khẩu"
                className="flex items-center gap-2 px-2.5 min-h-[40px] rounded-xl border border-slate-200 hover:border-teal-300 hover:bg-teal-50/40 transition-all text-left group"
              >
                <div className="w-7 h-7 rounded-lg bg-teal-100 text-teal-800 flex items-center justify-center shrink-0">
                  {currentUser.role === 'admin' ? (
                    <ShieldCheck className="w-4 h-4" />
                  ) : currentUser.role === 'student' ? (
                    <GraduationCap className="w-4 h-4" />
                  ) : (
                    <UserCircle2 className="w-4 h-4" />
                  )}
                </div>
                <span className="hidden sm:inline text-sm font-semibold text-slate-800 max-w-[120px] truncate">
                  {currentUser.name || currentUser.email}
                </span>
                <Edit2 className="w-3.5 h-3.5 text-slate-400 group-hover:text-teal-700 shrink-0" />
              </button>

              {onLogout && (
                <button
                  type="button"
                  onClick={() => void onLogout()}
                  title="Đăng xuất khỏi tài khoản"
                  className="px-3 min-h-[40px] rounded-xl border border-slate-200 hover:border-rose-200 hover:bg-rose-50 text-slate-700 hover:text-rose-700 text-sm font-semibold flex items-center gap-1.5 transition-colors"
                >
                  <LogOut className="w-4 h-4 shrink-0" />
                  <span className="hidden sm:inline">Đăng xuất</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Compact Author Strip on Mobile (< md) */}
      <div className="md:hidden bg-teal-50/80 border-b border-teal-200/80 px-4 py-1 flex items-center justify-between gap-2 text-xs">
        <span className="font-bold text-slate-900 truncate">{APP_CONFIG.APP_AUTHOR}</span>
        <span className="font-bold text-teal-800 truncate">THPT CHUYÊN NBK | TỔ HÓA HỌC</span>
      </div>

      {/* Profile & Change Password Modal */}
      {isProfileModalOpen && currentUser && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95">
            <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <UserCircle2 className="w-5 h-5 text-blue-400" />
                <div>
                  <h3 className="font-bold text-sm">Tài khoản &amp; Bảo mật</h3>
                  <p className="text-[11px] text-slate-400 font-mono">{currentUser.email}</p>
                </div>
              </div>
              <button
                onClick={() => setIsProfileModalOpen(false)}
                className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Tabs */}
            <div className="grid grid-cols-2 border-b border-slate-200 bg-slate-50 text-xs font-bold">
              <button
                type="button"
                onClick={() => setModalTab('profile')}
                className={`py-2.5 flex items-center justify-center gap-1.5 border-b-2 transition-colors ${
                  modalTab === 'profile'
                    ? 'border-blue-600 text-blue-700 bg-white'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <Edit2 className="w-3.5 h-3.5" />
                <span>Hồ sơ cá nhân</span>
              </button>
              <button
                type="button"
                onClick={() => setModalTab('password')}
                className={`py-2.5 flex items-center justify-center gap-1.5 border-b-2 transition-colors ${
                  modalTab === 'password'
                    ? 'border-blue-600 text-blue-700 bg-white'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <KeyRound className="w-3.5 h-3.5" />
                <span>Đổi mật khẩu</span>
              </button>
            </div>

            {modalTab === 'profile' ? (
              <form onSubmit={handleSaveProfile} className="p-5 space-y-4">
                {profileFeedback && (
                  <div
                    className={`p-2.5 rounded-xl border text-xs font-semibold flex items-start gap-2 ${
                      profileFeedback.type === 'success'
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                        : 'bg-rose-50 border-rose-200 text-rose-800'
                    }`}
                  >
                    {profileFeedback.type === 'success' ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                    )}
                    <span>{profileFeedback.text}</span>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Họ và tên
                  </label>
                  <input
                    type="text"
                    required
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {currentUser.role === 'student' ? (
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                      Lớp học
                    </label>
                    <input
                      type="text"
                      value={editClass}
                      onChange={(e) => setEditClass(e.target.value)}
                      placeholder="Ví dụ: 12 Hóa 1"
                      className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                ) : (
                  <>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                        Trường / Đơn vị công tác
                      </label>
                      <input
                        type="text"
                        value={editSchool}
                        onChange={(e) => setEditSchool(e.target.value)}
                        className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                        Số điện thoại
                      </label>
                      <input
                        type="text"
                        value={editPhone}
                        onChange={(e) => setEditPhone(e.target.value)}
                        placeholder="09xx xxx xxx"
                        className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </>
                )}

                <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-xl space-y-1">
                  <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider block">
                    Lời chào hiển thị:
                  </span>
                  <p className="text-sm font-extrabold text-blue-900">
                    "{getUserGreeting(currentUser, editName)}"
                  </p>
                </div>

                <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100">
                  {onLogout ? (
                    <button
                      type="button"
                      onClick={() => {
                        setIsProfileModalOpen(false);
                        void onLogout();
                      }}
                      className="px-3 py-2 rounded-xl border border-rose-200 text-rose-700 hover:bg-rose-50 text-xs font-bold flex items-center gap-1"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>Đăng xuất</span>
                    </button>
                  ) : (
                    <span />
                  )}

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setIsProfileModalOpen(false)}
                      className="px-3 py-2 rounded-xl border border-slate-200 text-slate-600 text-xs font-semibold hover:bg-slate-50"
                    >
                      Đóng
                    </button>
                    <button
                      type="submit"
                      disabled={isSavingProfile}
                      className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-xs font-bold shadow-md shadow-blue-500/20"
                    >
                      {isSavingProfile ? 'Đang lưu...' : 'Lưu thay đổi'}
                    </button>
                  </div>
                </div>
              </form>
            ) : (
              <form onSubmit={handleChangePassword} className="p-5 space-y-4">
                {passwordFeedback && (
                  <div
                    className={`p-2.5 rounded-xl border text-xs font-semibold flex items-start gap-2 ${
                      passwordFeedback.type === 'success'
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                        : 'bg-rose-50 border-rose-200 text-rose-800'
                    }`}
                  >
                    {passwordFeedback.type === 'success' ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                    )}
                    <span>{passwordFeedback.text}</span>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Mật khẩu hiện tại
                  </label>
                  <div className="relative">
                    <input
                      type={showCurrentPw ? 'text' : 'password'}
                      required
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="Nhập mật khẩu đang dùng"
                      className="w-full px-3 py-2 pr-9 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowCurrentPw((v) => !v)}
                      className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-700"
                    >
                      {showCurrentPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Mật khẩu mới (tối thiểu 8 ký tự)
                  </label>
                  <div className="relative">
                    <input
                      type={showNewPw ? 'text' : 'password'}
                      required
                      minLength={8}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Nhập mật khẩu mới"
                      className="w-full px-3 py-2 pr-9 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPw((v) => !v)}
                      className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-700"
                    >
                      {showNewPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Xác nhận mật khẩu mới
                  </label>
                  <input
                    type={showNewPw ? 'text' : 'password'}
                    required
                    minLength={8}
                    value={confirmNewPassword}
                    onChange={(e) => setConfirmNewPassword(e.target.value)}
                    placeholder="Nhập lại mật khẩu mới"
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setIsProfileModalOpen(false)}
                    className="px-3 py-2 rounded-xl border border-slate-200 text-slate-600 text-xs font-semibold hover:bg-slate-50"
                  >
                    Đóng
                  </button>
                  <button
                    type="submit"
                    disabled={isChangingPassword}
                    className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-xs font-bold shadow-md shadow-blue-500/20"
                  >
                    {isChangingPassword ? 'Đang cập nhật...' : 'Cập nhật mật khẩu'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </header>
  );
};
