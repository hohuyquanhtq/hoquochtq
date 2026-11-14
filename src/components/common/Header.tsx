import React, { useState, useEffect } from 'react';
import { User } from '../../types';
import {
  FlaskConical,
  GraduationCap,
  ShieldCheck,
  UserCircle2,
  Layers,
  BookOpen,
  FileCheck,
  BarChart3,
  FileText,
  Code,
  FolderTree,
  LogOut,
  LogIn,
  Edit2,
  X,
  Users,
  KeyRound,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { APP_CONFIG, getUserGreeting } from '../../constants/brand';
import { updateOwnUserProfile, changeCurrentUserPassword } from '../../services/authService';

interface HeaderProps {
  currentUser: User | null;
  isGuest?: boolean;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onOpenSystemDocs: () => void;
  onProfileUpdated?: (updated: User) => void;
  onLogout?: () => void | Promise<void>;
  onRequestAuth?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentUser,
  isGuest = false,
  activeTab,
  setActiveTab,
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

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-2">
          {/* Logo & Brand */}
          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={() => setActiveTab(homeTab)}
              className="flex items-center gap-2.5 text-left group focus:outline-none"
            >
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-700 to-indigo-500 flex items-center justify-center text-white shadow-md shadow-blue-500/20 group-hover:scale-105 transition-transform">
                <FlaskConical className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-extrabold text-xl tracking-tight text-slate-900 group-hover:text-blue-600 transition-colors">
                    HQ<span className="text-blue-600">Test</span>
                  </span>
                  <span className="px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-blue-100 text-blue-800 rounded-md">
                    Trực Tuyến
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 font-medium hidden sm:block">
                  {APP_CONFIG.APP_DESCRIPTION}
                </p>
              </div>
            </button>
          </div>

          {/* Navigation for Authenticated Teacher */}
          {!isGuest && currentUser?.role === 'teacher' && (
            <nav className="hidden lg:flex items-center gap-1">
              <button
                onClick={() => setActiveTab('dashboard')}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                  activeTab === 'dashboard'
                    ? 'bg-blue-50 text-blue-700 border border-blue-200/60'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                Tổng quan
              </button>
              <button
                onClick={() => setActiveTab('upload_exam')}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                  activeTab === 'upload_exam'
                    ? 'bg-blue-50 text-blue-700 border border-blue-200/60'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                Tải đề
              </button>
              <button
                onClick={() => setActiveTab('question_bank')}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                  activeTab === 'question_bank'
                    ? 'bg-blue-50 text-blue-700 border border-blue-200/60'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <BookOpen className="w-3.5 h-3.5" />
                Câu hỏi
              </button>
              <button
                onClick={() => setActiveTab('folder_manager')}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                  activeTab === 'folder_manager'
                    ? 'bg-blue-50 text-blue-700 border border-blue-200/60'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <FolderTree className="w-3.5 h-3.5" />
                Thư mục
              </button>
              <button
                onClick={() => setActiveTab('exam_manager')}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                  activeTab === 'exam_manager' || activeTab === 'create_exam'
                    ? 'bg-blue-50 text-blue-700 border border-blue-200/60'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <FileCheck className="w-3.5 h-3.5" />
                Đề thi
              </button>
              <button
                onClick={() => setActiveTab('class_manager')}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                  activeTab === 'class_manager'
                    ? 'bg-blue-50 text-blue-700 border border-blue-200/60'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                Lớp học
              </button>
              <button
                onClick={() => setActiveTab('exam_results')}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                  activeTab === 'exam_results'
                    ? 'bg-blue-50 text-blue-700 border border-blue-200/60'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <BarChart3 className="w-3.5 h-3.5" />
                Điểm thi
              </button>
            </nav>
          )}

          {/* Navigation for Authenticated Student */}
          {!isGuest && currentUser?.role === 'student' && (
            <nav className="hidden sm:flex items-center gap-2">
              <button
                onClick={() => setActiveTab('student_home')}
                className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors flex items-center gap-1.5 ${
                  activeTab === 'student_home'
                    ? 'bg-blue-50 text-blue-700 border border-blue-200/60'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <GraduationCap className="w-4 h-4" />
                Phòng thi &amp; Lớp học
              </button>
            </nav>
          )}

          {/* Navigation for Authenticated Admin */}
          {!isGuest && currentUser?.role === 'admin' && (
            <nav className="hidden sm:flex items-center gap-2">
              <button
                onClick={() => setActiveTab('admin_dashboard')}
                className="px-3 py-1.5 rounded-lg text-sm font-semibold bg-purple-50 text-purple-800 border border-purple-200 flex items-center gap-1.5"
              >
                <ShieldCheck className="w-4 h-4" />
                Quản trị tài khoản &amp; Hệ thống
              </button>
            </nav>
          )}

          {/* Right Action Controls */}
          <div className="flex items-center gap-2">
            {/* System Architecture Button */}
            <button
              onClick={onOpenSystemDocs}
              title="Xem Sơ đồ kiến trúc & Thiết kế kỹ thuật"
              className="hidden md:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 hover:border-slate-300 bg-slate-50 text-slate-700 hover:text-slate-900 text-xs font-semibold shadow-2xs transition-colors"
            >
              <Code className="w-3.5 h-3.5 text-blue-600" />
              <span>Kiến trúc</span>
            </button>

            {isGuest || !currentUser ? (
              <button
                type="button"
                onClick={onRequestAuth}
                className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs flex items-center gap-1.5 transition-colors"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>Đăng nhập / Đăng ký</span>
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handleOpenProfile}
                  title="Hồ sơ cá nhân & Đổi mật khẩu"
                  className="flex items-center gap-2 pl-2 pr-2.5 py-1 rounded-xl border border-slate-200 hover:border-blue-300 hover:bg-blue-50/40 transition-all text-left group"
                >
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ${
                      currentUser.role === 'teacher'
                        ? 'bg-blue-100 text-blue-700'
                        : currentUser.role === 'admin'
                        ? 'bg-purple-100 text-purple-700'
                        : 'bg-emerald-100 text-emerald-700'
                    }`}
                  >
                    {currentUser.role === 'teacher' ? (
                      <FlaskConical className="w-4 h-4" />
                    ) : currentUser.role === 'admin' ? (
                      <ShieldCheck className="w-4 h-4" />
                    ) : (
                      <GraduationCap className="w-4 h-4" />
                    )}
                  </div>
                  <div className="hidden sm:block text-left text-xs">
                    <p className="font-bold text-slate-800 leading-tight truncate max-w-[140px] flex items-center gap-1">
                      <span>{currentUser.name || currentUser.email}</span>
                      <Edit2 className="w-2.5 h-2.5 text-slate-400 group-hover:text-blue-600" />
                    </p>
                    <p className="text-slate-500 text-[10px] font-medium">
                      {currentUser.role === 'teacher'
                        ? 'Giáo viên'
                        : currentUser.role === 'admin'
                        ? 'Quản trị viên'
                        : `Học sinh${currentUser.className ? ` • ${currentUser.className}` : ''}`}
                    </p>
                  </div>
                </button>

                {onLogout && (
                  <button
                    type="button"
                    onClick={() => void onLogout()}
                    title="Đăng xuất khỏi tài khoản"
                    className="px-2.5 py-2 rounded-xl border border-slate-200 hover:border-rose-200 hover:bg-rose-50 text-slate-600 hover:text-rose-700 text-xs font-bold flex items-center gap-1 transition-colors"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span className="hidden md:inline">Đăng xuất</span>
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Compact Mobile Navigation for Authenticated Teacher */}
        {!isGuest && currentUser?.role === 'teacher' && (
          <nav className="flex lg:hidden items-center gap-1 overflow-x-auto pb-2 pt-0.5 text-xs">
            {[
              { id: 'dashboard', label: 'Tổng quan' },
              { id: 'upload_exam', label: 'Tải đề' },
              { id: 'question_bank', label: 'Câu hỏi' },
              { id: 'folder_manager', label: 'Thư mục' },
              { id: 'exam_manager', label: 'Đề thi' },
              { id: 'class_manager', label: 'Lớp học' },
              { id: 'exam_results', label: 'Điểm thi' },
            ].map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`px-2.5 py-1 rounded-lg font-semibold whitespace-nowrap ${
                  activeTab === item.id
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>
        )}
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
