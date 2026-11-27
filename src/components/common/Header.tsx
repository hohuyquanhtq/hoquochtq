import React, { useState, useEffect, useRef } from 'react';
import { User } from '../../types';
import {
  FlaskConical,
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
  Bell,
  Phone,
  MessageCircle,
} from 'lucide-react';
import { APP_CONFIG, getUserGreeting } from '../../constants/brand';
import { isSuperAdminUser } from '../../constants/superAdmin';
import { updateOwnUserProfile, changeCurrentUserPassword } from '../../services/authService';
import { HQNavbar } from './HQNavbar';

export interface HeaderNotificationItem {
  id: string;
  title: string;
  subtitle?: string;
  targetTab?: string;
}

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
  notificationCount?: number;
  notifications?: HeaderNotificationItem[];
}

const TAB_TITLES: Record<string, string> = {
  dashboard: 'Tổng quan Dashboard',
  upload_exam: 'Bóc tách đề thi từ Word / PDF',
  shuffle_exam: 'Xáo đề thi & Xuất file Word',
  create_exam: 'Tạo đề thi & Ma trận điểm',
  exam_manager: 'Quản lý đề thi',
  question_bank: 'Ngân hàng câu hỏi',
  city_exam_bank: 'Kho đề Thành phố · Học liệu dùng chung',
  city_admin_panel: 'Quản trị Cấp Thành phố · Duyệt giáo viên & Học liệu',
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
  notificationCount = 0,
  notifications = [],
}) => {
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [modalTab, setModalTab] = useState<'profile' | 'password'>('profile');
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const notifContainerRef = useRef<HTMLDivElement | null>(null);

  // Profile fields
  const [editName, setEditName] = useState(currentUser?.name || '');
  const [editSchool, setEditSchool] = useState(currentUser?.school || '');
  const [editDepartment, setEditDepartment] = useState(currentUser?.department || 'Tổ Hóa học');
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
    setEditDepartment(currentUser?.department || 'Tổ Hóa học');
    setEditClass(currentUser?.className || '');
    setEditPhone(currentUser?.phone || '');
  }, [currentUser]);

  useEffect(() => {
    if (!isNotificationOpen) return;
    const handleOutsideClick = (event: MouseEvent) => {
      if (notifContainerRef.current && !notifContainerRef.current.contains(event.target as Node)) {
        setIsNotificationOpen(false);
      }
    };
    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsNotificationOpen(false);
    };
    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [isNotificationOpen]);

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
        department: editDepartment,
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
        department: editDepartment.trim() || undefined,
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

  const isCurrentSuperAdmin = isSuperAdminUser(currentUser);

  const homeTab =
    isGuest || !currentUser
      ? 'exam_landing'
      : currentUser.role === 'student'
      ? 'student_home'
      : isCurrentSuperAdmin
      ? 'admin_dashboard'
      : 'dashboard';

  const resolvedTitle = pageTitle || TAB_TITLES[activeTab] || 'QUIZ PRO';
  const roleBadgeLabel =
    isCurrentSuperAdmin
      ? 'Super Admin'
      : currentUser?.role === 'teacher'
      ? 'Giáo viên'
      : 'Học sinh';

  return (
    <>
      {!workspaceMode ? (
        <HQNavbar
          currentUser={currentUser}
          isGuest={isGuest}
          activeTab={activeTab}
          onSelectTab={setActiveTab}
          onOpenProfile={handleOpenProfile}
          onLogout={onLogout}
          onRequestAuth={onRequestAuth}
          versionBadge="v2.0"
        />
      ) : (
        /* === FIXED HEADER (H-16, Z-50): Phong thủy Đen ánh xanh - Lục bảo - Vàng hổ phách === */
        <header className="fixed top-0 left-0 right-0 z-50 h-16 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 transition-colors">
          <div className="h-full px-4 sm:px-6 flex items-center justify-between gap-3 sm:gap-5">
            {/* Cánh trái: Nút menu mobile + Logo Hóa học "HQTest PRO / Chương trình GDPT 2018" + Tiêu đề trang */}
            <div className="flex items-center gap-2.5 sm:gap-3.5 min-w-0 flex-1">
              {onOpenMobileMenu && (
                <button
                  type="button"
                  onClick={onOpenMobileMenu}
                  aria-label="Mở menu điều hướng"
                  className="lg:hidden h-9 w-9 flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0 transition-colors"
                >
                  <Menu className="w-5 h-5" />
                </button>
              )}

              <button
                type="button"
                onClick={() => setActiveTab(homeTab)}
                title="HQTest PRO - Chương trình GDPT 2018 · Về trang tổng quan"
                className="flex items-center gap-2.5 shrink-0 group focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 rounded-xl text-left"
              >
                <div className="relative w-9 h-9 rounded-xl bg-emerald-600 group-hover:bg-emerald-700 text-white flex items-center justify-center shrink-0 shadow-sm ring-1 ring-emerald-500/30 transition-colors">
                  <FlaskConical className="w-5 h-5" />
                  <span
                    aria-hidden="true"
                    className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-amber-500 ring-2 ring-white dark:ring-slate-900"
                  />
                </div>
                <div className="leading-tight min-w-0">
                  <div className="text-sm sm:text-[15px] font-extrabold tracking-tight text-slate-900 dark:text-white whitespace-nowrap flex items-center gap-1">
                    <span>HQTest</span>
                    <span className="text-emerald-600 dark:text-emerald-400">PRO</span>
                  </div>
                  <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap">
                    Chương trình GDPT 2018
                  </div>
                </div>
              </button>

              <span
                aria-hidden="true"
                className="hidden md:block h-6 w-px bg-slate-200 dark:bg-slate-700 shrink-0"
              />

              <h2 className="hidden md:block text-sm lg:text-[15px] font-semibold text-slate-700 dark:text-slate-200 tracking-tight truncate min-w-0">
                {resolvedTitle}
              </h2>
            </div>

            {/* Cánh phải: Chuông thông báo + Tên & Trường + Badge vai trò (Emerald / Amber) + Sửa hồ sơ + Đăng xuất */}
            <div className="flex items-center gap-2 sm:gap-3 shrink-0">
              {isGuest || !currentUser ? (
                <button
                  type="button"
                  onClick={onRequestAuth}
                  className="px-4 h-9 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold shadow-xs flex items-center gap-2 transition-colors whitespace-nowrap shrink-0"
                >
                  <LogIn className="w-4 h-4 shrink-0" />
                  <span>Đăng nhập</span>
                </button>
              ) : (
                <div className="flex items-center gap-2 sm:gap-3">
                  {/* Biểu tượng chuông thông báo kèm chấm đỏ trạng thái */}
                  <div className="relative" ref={notifContainerRef}>
                    <button
                      type="button"
                      onClick={() => setIsNotificationOpen((prev) => !prev)}
                      aria-label="Thông báo hệ thống"
                      aria-expanded={isNotificationOpen}
                      title="Thông báo"
                      className="relative w-9 h-9 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white flex items-center justify-center transition-colors shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40"
                    >
                      <Bell className="w-4 h-4" />
                      {notificationCount > 0 ? (
                        <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold leading-none flex items-center justify-center ring-2 ring-white dark:ring-slate-900 tabular-nums">
                          {notificationCount > 9 ? '9+' : notificationCount}
                        </span>
                      ) : (
                        <span
                          aria-hidden="true"
                          className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-rose-500 ring-2 ring-white dark:ring-slate-900"
                        />
                      )}
                    </button>

                    {isNotificationOpen && (
                      <div className="absolute right-0 top-full mt-2 w-72 sm:w-80 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xl overflow-hidden z-[60]">
                        <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-800 dark:text-slate-100">
                            Thông báo ({notificationCount})
                          </span>
                          <button
                            type="button"
                            onClick={() => setIsNotificationOpen(false)}
                            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                            aria-label="Đóng thông báo"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                          {notifications.length === 0 ? (
                            <div className="px-4 py-6 text-center text-xs text-slate-500 dark:text-slate-400">
                              Hiện chưa có thông báo mới.
                            </div>
                          ) : (
                            notifications.map((item) => (
                              <button
                                key={item.id}
                                type="button"
                                onClick={() => {
                                  setIsNotificationOpen(false);
                                  if (item.targetTab) setActiveTab(item.targetTab);
                                }}
                                className="w-full px-4 py-3 text-left hover:bg-emerald-50/50 dark:hover:bg-slate-800/70 transition-colors"
                              >
                                <p className="text-xs font-semibold text-slate-800 dark:text-slate-100 line-clamp-1">
                                  {item.title}
                                </p>
                                {item.subtitle && (
                                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">
                                    {item.subtitle}
                                  </p>
                                )}
                              </button>
                            ))
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Khối thông tin tài khoản: Tên giáo viên & Trường trực thuộc ở dòng dưới */}
                  <div className="hidden sm:flex flex-col items-end text-right leading-tight min-w-0">
                    <span className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate max-w-[170px] lg:max-w-[230px]">
                      {currentUser.name || currentUser.email}
                    </span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate max-w-[180px] lg:max-w-[260px]">
                      {currentUser.school || APP_CONFIG.APP_SCHOOL}
                    </span>
                  </div>

                  {/* Badge vai trò phân biệt: Giáo viên (Emerald) | Super Admin (Amber vàng quyền lực) */}
                  <span
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold whitespace-nowrap shrink-0 border ${
                      isCurrentSuperAdmin
                        ? 'bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-700'
                        : 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800'
                    }`}
                  >
                    {isCurrentSuperAdmin && (
                      <ShieldCheck className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                    )}
                    <span>{roleBadgeLabel}</span>
                  </span>

                  <div
                    className="hidden sm:block h-6 w-px bg-slate-200 dark:bg-slate-700 shrink-0"
                    aria-hidden="true"
                  />

                  {/* Nút sửa thông tin cá nhân (icon bút) và nút Đăng xuất */}
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={handleOpenProfile}
                      title="Chỉnh sửa hồ sơ cá nhân & Đổi mật khẩu"
                      aria-label="Chỉnh sửa hồ sơ cá nhân"
                      className="w-9 h-9 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-emerald-50 dark:hover:bg-slate-700 hover:border-emerald-200 text-slate-600 dark:text-slate-300 hover:text-emerald-700 dark:hover:text-emerald-400 flex items-center justify-center transition-colors shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>

                    {onLogout && (
                      <button
                        type="button"
                        onClick={() => void onLogout()}
                        title="Đăng xuất khỏi tài khoản"
                        aria-label="Đăng xuất"
                        className="h-9 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-rose-50 dark:hover:bg-rose-950/50 hover:border-rose-200 dark:hover:border-rose-800 text-slate-600 dark:text-slate-300 hover:text-rose-600 dark:hover:text-rose-400 text-xs sm:text-sm font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/30"
                      >
                        <LogOut className="w-4 h-4 shrink-0" />
                        <span className="hidden md:inline">Đăng xuất</span>
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>
      )}

      {/* Profile & Change Password Modal */}
      {isProfileModalOpen && currentUser && (
        <div className="fixed inset-0 z-[60] bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden">
            <div className="px-5 py-4 bg-[#0F172A] text-white flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <UserCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
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
                        Tổ chuyên môn
                      </label>
                      <input
                        type="text"
                        value={editDepartment}
                        onChange={(e) => setEditDepartment(e.target.value)}
                        placeholder="Tổ Hóa học"
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
    </>
  );
};

/* === FIXED FOOTER (H-10, Z-40): Cố định đáy màn hình cho trang Giáo viên & Quản trị === */
export const WorkspaceFooter: React.FC = () => (
  <footer className="fixed bottom-0 left-0 right-0 z-40 h-10 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 transition-colors">
    <div className="h-full px-4 sm:px-6 flex items-center justify-between gap-3 text-[11px] sm:text-xs text-slate-600 dark:text-slate-400">
      {/* Cánh trái: Thông tin tác giả & đơn vị */}
      <p
        className="truncate min-w-0 font-medium text-slate-600 dark:text-slate-300"
        title="Tác giả: Thầy Hồ Ngọc Quốc • Trường THPT chuyên Nguyễn Bỉnh Khiêm"
      >
        Tác giả:{' '}
        <strong className="font-semibold text-slate-800 dark:text-slate-100">
          Thầy Hồ Ngọc Quốc
        </strong>{' '}
        • Trường THPT chuyên Nguyễn Bỉnh Khiêm
      </p>

      {/* Cánh phải: Cụm liên hệ kỹ thuật dạng link click được (Hotline & Zalo) */}
      <div className="flex items-center gap-2.5 sm:gap-3 shrink-0 whitespace-nowrap">
        <a
          href="tel:0814211334"
          className="inline-flex items-center gap-1 font-semibold text-emerald-700 dark:text-emerald-400 hover:text-emerald-800 hover:underline underline-offset-2 transition-colors tabular-nums"
          title="Gọi Điện thoại / Hotline hỗ trợ kỹ thuật"
        >
          <Phone className="w-3.5 h-3.5 shrink-0" />
          <span className="hidden md:inline text-slate-500 dark:text-slate-400 font-normal">
            Hotline:
          </span>
          <span>0814.211.334</span>
        </a>

        <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">
          •
        </span>

        <a
          href="https://zalo.me/0917180981"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 font-semibold text-sky-600 dark:text-sky-400 hover:text-sky-700 hover:underline underline-offset-2 transition-colors tabular-nums"
          title="Nhắn Zalo hỗ trợ kỹ thuật"
        >
          <MessageCircle className="w-3.5 h-3.5 shrink-0" />
          <span>Zalo: 0917.18.09.81</span>
        </a>
      </div>
    </div>
  </footer>
);
