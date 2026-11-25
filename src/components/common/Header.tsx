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
  upload_exam: 'Bóc tách đề thi từ Word / PDF',
  shuffle_exam: 'Xáo đề thi & Xuất file Word',
  create_exam: 'Tạo đề thi & Ma trận điểm',
  exam_manager: 'Quản lý đề thi',
  question_bank: 'Ngân hàng câu hỏi',
  folder_manager: 'Thư mục chuyên đề',
  online_exams: 'Danh sách bài thi trực tuyến',
  exam_results: 'Kết quả và thống kê',
  class_manager: 'Lớp học & Học sinh',
  user_guide: 'Hướng dẫn sử dụng',
  system_settings: 'Cài đặt hệ thống',
  admin_dashboard: 'Tổng quan Quản trị Hệ thống',
  admin_users: 'Quản lý tài khoản & Học sinh',
  admin_curriculum: 'Danh mục bài học SGK',
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
  const roleBadgeLabel =
    currentUser?.role === 'admin'
      ? 'Super Admin'
      : currentUser?.role === 'teacher'
      ? 'Giáo viên'
      : 'Học sinh';

  return (
    <header className="shrink-0 sticky top-0 z-40 bg-white border-b border-slate-200/80">
      <div
        className={
          workspaceMode
            ? 'px-4 sm:px-6 lg:px-8 py-3.5 flex items-center justify-between gap-4 sm:gap-6'
            : 'max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex items-center justify-between gap-4 sm:gap-6'
        }
      >
        {/* Left: Full Page Title (no truncation) OR Guest/Student Brand */}
        {workspaceMode ? (
          <div className="flex items-center gap-3 min-w-0">
            {onOpenMobileMenu && (
              <button
                type="button"
                onClick={onOpenMobileMenu}
                aria-label="Mở menu điều hướng"
                className="lg:hidden min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-100 shrink-0 transition-colors"
              >
                <Menu className="w-5 h-5" />
              </button>
            )}
            <h2 className="text-base sm:text-xl font-bold text-slate-900 tracking-tight leading-snug">
              {resolvedTitle}
            </h2>
          </div>
        ) : (
          <div className="flex items-center gap-4 min-w-0">
            <button
              type="button"
              onClick={() => setActiveTab(homeTab)}
              className="flex items-center gap-3 text-left group focus:outline-none shrink-0"
            >
              <div className="w-10 h-10 rounded-xl bg-emerald-600 flex items-center justify-center text-white shadow-xs group-hover:bg-emerald-700 transition-colors">
                <FlaskConical className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <span className="font-extrabold text-xl tracking-tight text-slate-900 whitespace-nowrap block">
                  QUIZ <span className="text-emerald-700">PRO</span>
                </span>
                <p className="text-xs text-slate-500 font-medium hidden sm:block">
                  {APP_CONFIG.APP_NAME} · {APP_CONFIG.APP_DESCRIPTION}
                </p>
              </div>
            </button>

            {!isGuest && currentUser?.role === 'student' && (
              <button
                type="button"
                onClick={() => setActiveTab('student_home')}
                className={`hidden md:inline-flex items-center gap-2 px-4 min-h-[40px] rounded-xl text-sm font-semibold transition-colors whitespace-nowrap shrink-0 ${
                  activeTab === 'student_home'
                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <GraduationCap className="w-4 h-4 shrink-0" />
                <span>Phòng thi &amp; Lớp học</span>
              </button>
            )}
          </div>
        )}

        {/* Right: Unified Profile Block + Clean Account Controls */}
        <div className="flex items-center gap-3 shrink-0">
          {!workspaceMode && (
            <div className="hidden md:flex flex-col items-end text-right leading-snug pr-3 border-r border-slate-200">
              <span className="text-sm font-semibold text-slate-800 whitespace-nowrap">
                {APP_CONFIG.APP_AUTHOR}
              </span>
              <span className="text-xs text-slate-500 whitespace-nowrap">
                THPT chuyên Nguyễn Bỉnh Khiêm · Hotline/Zalo:{' '}
                <a
                  href="tel:0814211334"
                  className="font-medium text-emerald-700 hover:text-emerald-800 hover:underline underline-offset-2 transition-colors"
                  title="Gọi hỗ trợ kỹ thuật"
                >
                  0814.211.334
                </a>
              </span>
            </div>
          )}

          {!workspaceMode && (
            <button
              type="button"
              onClick={onOpenSystemDocs}
              title="Hồ sơ kiến trúc hệ thống"
              className="hidden sm:inline-flex items-center gap-1.5 px-3.5 min-h-[40px] rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-sm font-medium transition-colors whitespace-nowrap shrink-0"
            >
              <Code className="w-4 h-4 text-emerald-600 shrink-0" />
              <span className="hidden lg:inline">Kiến trúc</span>
            </button>
          )}

          {isGuest || !currentUser ? (
            <button
              type="button"
              onClick={onRequestAuth}
              className="px-4 min-h-[40px] rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold shadow-xs flex items-center gap-2 transition-colors whitespace-nowrap shrink-0"
            >
              <LogIn className="w-4 h-4 shrink-0" />
              <span>Đăng nhập</span>
            </button>
          ) : workspaceMode ? (
            <div className="flex items-center gap-3">
              {/* Single Consolidated Profile Summary (Name + Super Admin badge + School/Hotline subline) */}
              <div className="hidden md:flex flex-col items-end text-right leading-tight">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-slate-800 whitespace-nowrap">
                    {currentUser.name || currentUser.email}
                  </span>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200/80 text-[11px] font-semibold whitespace-nowrap">
                    {currentUser.role === 'admin' && <ShieldCheck className="w-3 h-3 shrink-0" />}
                    <span>{roleBadgeLabel}</span>
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5 whitespace-nowrap">
                  THPT chuyên Nguyễn Bỉnh Khiêm · Hotline/Zalo:{' '}
                  <a
                    href="tel:0814211334"
                    className="font-medium text-slate-600 hover:text-emerald-700 hover:underline underline-offset-2 transition-colors"
                    title="Gọi hỗ trợ kỹ thuật"
                  >
                    0814.211.334
                  </a>
                </p>
              </div>

              <div className="hidden md:block h-7 w-px bg-slate-200" aria-hidden="true" />

              {/* Compact Account Actions: Edit Profile Icon + Subtle Logout */}
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleOpenProfile}
                  title="Chỉnh sửa hồ sơ cá nhân & Đổi mật khẩu"
                  aria-label="Chỉnh sửa hồ sơ cá nhân"
                  className="w-9 h-9 rounded-lg border border-slate-200/90 bg-white hover:bg-slate-50 hover:border-slate-300 text-slate-600 hover:text-slate-900 flex items-center justify-center transition-colors shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40"
                >
                  <Edit2 className="w-4 h-4" />
                </button>

                {onLogout && (
                  <button
                    type="button"
                    onClick={() => void onLogout()}
                    title="Đăng xuất khỏi tài khoản"
                    aria-label="Đăng xuất"
                    className="h-9 px-3 rounded-lg border border-slate-200/90 bg-white hover:bg-rose-50 hover:border-rose-200 text-slate-600 hover:text-rose-600 text-sm font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/30"
                  >
                    <LogOut className="w-4 h-4 shrink-0" />
                    <span className="hidden sm:inline">Đăng xuất</span>
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleOpenProfile}
                title="Hồ sơ cá nhân & Đổi mật khẩu"
                className="flex items-center gap-2 px-3 h-10 rounded-xl border border-slate-200 hover:border-emerald-300 hover:bg-emerald-50/40 transition-colors text-left group shrink-0"
              >
                <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0">
                  {currentUser.role === 'admin' ? (
                    <ShieldCheck className="w-4 h-4" />
                  ) : currentUser.role === 'student' ? (
                    <GraduationCap className="w-4 h-4" />
                  ) : (
                    <UserCircle2 className="w-4 h-4" />
                  )}
                </div>
                <span className="hidden sm:inline text-sm font-semibold text-slate-800 max-w-[140px] truncate whitespace-nowrap">
                  {currentUser.name || currentUser.email}
                </span>
                <Edit2 className="w-3.5 h-3.5 text-slate-400 group-hover:text-emerald-700 shrink-0" />
              </button>

              {onLogout && (
                <button
                  type="button"
                  onClick={() => void onLogout()}
                  title="Đăng xuất khỏi tài khoản"
                  aria-label="Đăng xuất"
                  className="h-10 px-3 rounded-xl border border-slate-200 hover:border-rose-200 hover:bg-rose-50 text-slate-600 hover:text-rose-600 text-sm font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
                >
                  <LogOut className="w-4 h-4 shrink-0" />
                  <span className="hidden sm:inline">Đăng xuất</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Mobile Compact Profile & Hotline Strip (< md) */}
      <div className="md:hidden bg-slate-50/90 border-t border-slate-200/80 px-4 py-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-semibold text-slate-800 truncate">
            {currentUser?.name || APP_CONFIG.APP_AUTHOR}
          </span>
          {currentUser && (
            <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200/80 text-[11px] font-semibold whitespace-nowrap">
              {roleBadgeLabel}
            </span>
          )}
        </div>
        <span className="text-xs text-slate-500">
          THPT chuyên Nguyễn Bỉnh Khiêm ·{' '}
          <a
            href="tel:0814211334"
            className="font-medium text-emerald-700 hover:underline underline-offset-2 whitespace-nowrap"
          >
            0814.211.334
          </a>
        </span>
      </div>

      {/* Profile & Change Password Modal */}
      {isProfileModalOpen && currentUser && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden">
            <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <UserCircle2 className="w-5 h-5 text-teal-400 shrink-0" />
                <div className="min-w-0">
                  <h3 className="font-bold text-base truncate">Tài khoản &amp; Bảo mật</h3>
                  <p className="text-[13px] text-slate-300 font-mono truncate">{currentUser.email}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsProfileModalOpen(false)}
                aria-label="Đóng cửa sổ tài khoản"
                className="p-2 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-white transition-colors shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Tabs */}
            <div className="grid grid-cols-2 border-b border-slate-200 bg-slate-50 text-sm font-semibold">
              <button
                type="button"
                onClick={() => setModalTab('profile')}
                className={`py-3 flex items-center justify-center gap-1.5 border-b-2 transition-colors ${
                  modalTab === 'profile'
                    ? 'border-teal-600 text-teal-700 bg-white'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <Edit2 className="w-4 h-4" />
                <span>Hồ sơ cá nhân</span>
              </button>
              <button
                type="button"
                onClick={() => setModalTab('password')}
                className={`py-3 flex items-center justify-center gap-1.5 border-b-2 transition-colors ${
                  modalTab === 'password'
                    ? 'border-teal-600 text-teal-700 bg-white'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <KeyRound className="w-4 h-4" />
                <span>Đổi mật khẩu</span>
              </button>
            </div>

            {modalTab === 'profile' ? (
              <form onSubmit={handleSaveProfile} className="p-5 space-y-4">
                {profileFeedback && (
                  <div
                    className={`p-3 rounded-xl border text-sm font-medium flex items-start gap-2 ${
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
                  <label className="block text-sm font-semibold text-slate-700 mb-1">
                    Họ và tên
                  </label>
                  <input
                    type="text"
                    required
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm font-medium rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-600"
                  />
                </div>

                {currentUser.role === 'student' ? (
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">
                      Lớp học
                    </label>
                    <input
                      type="text"
                      value={editClass}
                      onChange={(e) => setEditClass(e.target.value)}
                      placeholder="Ví dụ: 12 Hóa 1"
                      className="w-full px-3.5 py-2.5 text-sm font-medium rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-600"
                    />
                  </div>
                ) : (
                  <>
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1">
                        Trường / Đơn vị công tác
                      </label>
                      <input
                        type="text"
                        value={editSchool}
                        onChange={(e) => setEditSchool(e.target.value)}
                        className="w-full px-3.5 py-2.5 text-sm font-medium rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-600"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1">
                        Số điện thoại
                      </label>
                      <input
                        type="text"
                        value={editPhone}
                        onChange={(e) => setEditPhone(e.target.value)}
                        placeholder="09xx xxx xxx"
                        className="w-full px-3.5 py-2.5 text-sm font-medium rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-600"
                      />
                    </div>
                  </>
                )}

                <div className="p-3 bg-teal-50/70 border border-teal-200 rounded-xl space-y-1">
                  <span className="text-[13px] font-semibold text-teal-700 block">
                    Lời chào hiển thị:
                  </span>
                  <p className="text-sm font-bold text-slate-900">
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
                      className="px-3.5 min-h-[42px] rounded-xl border border-rose-200 text-rose-700 hover:bg-rose-50 text-sm font-semibold flex items-center gap-1.5"
                    >
                      <LogOut className="w-4 h-4" />
                      <span>Đăng xuất</span>
                    </button>
                  ) : (
                    <span />
                  )}

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setIsProfileModalOpen(false)}
                      className="px-4 min-h-[42px] rounded-xl border border-slate-200 text-slate-700 text-sm font-semibold hover:bg-slate-50"
                    >
                      Đóng
                    </button>
                    <button
                      type="submit"
                      disabled={isSavingProfile}
                      className="px-4 min-h-[42px] rounded-xl bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white text-sm font-semibold shadow-xs"
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
                    className={`p-3 rounded-xl border text-sm font-medium flex items-start gap-2 ${
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
                  <label className="block text-sm font-semibold text-slate-700 mb-1">
                    Mật khẩu hiện tại
                  </label>
                  <div className="relative">
                    <input
                      type={showCurrentPw ? 'text' : 'password'}
                      required
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="Nhập mật khẩu đang dùng"
                      className="w-full px-3.5 py-2.5 pr-10 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-600"
                    />
                    <button
                      type="button"
                      onClick={() => setShowCurrentPw((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                    >
                      {showCurrentPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">
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
                      className="w-full px-3.5 py-2.5 pr-10 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-600"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPw((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                    >
                      {showNewPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">
                    Xác nhận mật khẩu mới
                  </label>
                  <input
                    type={showNewPw ? 'text' : 'password'}
                    required
                    minLength={8}
                    value={confirmNewPassword}
                    onChange={(e) => setConfirmNewPassword(e.target.value)}
                    placeholder="Nhập lại mật khẩu mới"
                    className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-600"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setIsProfileModalOpen(false)}
                    className="px-4 min-h-[42px] rounded-xl border border-slate-200 text-slate-700 text-sm font-semibold hover:bg-slate-50"
                  >
                    Đóng
                  </button>
                  <button
                    type="submit"
                    disabled={isChangingPassword}
                    className="px-4 min-h-[42px] rounded-xl bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white text-sm font-semibold shadow-xs"
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
