import React, { useState, useEffect } from 'react';
import { User } from '../../types';
import {
  Settings,
  UserCircle2,
  KeyRound,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  Code,
  Award,
  Layers,
} from 'lucide-react';
import { updateOwnUserProfile, changeCurrentUserPassword } from '../../services/authService';
import { APP_CONFIG } from '../../constants/brand';

interface SystemSettingsViewProps {
  currentUser: User;
  onProfileUpdated?: (updated: User) => void;
  onOpenSystemDocs: () => void;
  onOpenAdminLegacy?: () => void;
}

export const SystemSettingsView: React.FC<SystemSettingsViewProps> = ({
  currentUser,
  onProfileUpdated,
  onOpenSystemDocs,
  onOpenAdminLegacy,
}) => {
  const [editName, setEditName] = useState(currentUser.name || '');
  const [editSchool, setEditSchool] = useState(currentUser.school || '');
  const [editPhone, setEditPhone] = useState(currentUser.phone || '');
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileFeedback, setProfileFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [isChangingPw, setIsChangingPw] = useState(false);
  const [pwFeedback, setPwFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    setEditName(currentUser.name || '');
    setEditSchool(currentUser.school || '');
    setEditPhone(currentUser.phone || '');
  }, [currentUser]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileFeedback(null);
    setIsSavingProfile(true);
    try {
      const uid = currentUser.uid || currentUser.id;
      const res = await updateOwnUserProfile(uid, {
        name: editName,
        school: editSchool,
        phone: editPhone,
      });
      if (!res.success) {
        setProfileFeedback({ type: 'error', text: res.errorMessage || 'Không thể cập nhật hồ sơ.' });
        return;
      }
      const nextUser: User = res.user || {
        ...currentUser,
        name: editName.trim(),
        school: editSchool.trim() || undefined,
        phone: editPhone.trim() || undefined,
        updatedAt: new Date().toISOString(),
      };
      onProfileUpdated?.(nextUser);
      setProfileFeedback({ type: 'success', text: 'Đã cập nhật thông tin tài khoản lên hệ thống.' });
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwFeedback(null);
    setIsChangingPw(true);
    try {
      const res = await changeCurrentUserPassword(currentPassword, newPassword, confirmPassword);
      if (!res.success) {
        setPwFeedback({ type: 'error', text: res.errorMessage || 'Không thể đổi mật khẩu.' });
        return;
      }
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPwFeedback({ type: 'success', text: 'Đã cập nhật mật khẩu đăng nhập mới.' });
    } finally {
      setIsChangingPw(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-teal-700 font-bold text-xs uppercase tracking-wider">
            <Settings className="w-4 h-4" />
            <span>Cấu hình tài khoản &amp; Môi trường thi</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mt-1">
            Thiết lập hệ thống
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Quản lý hồ sơ giảng dạy, bảo mật mật khẩu và xem thông số chuẩn đề thi GDPT 2018.
          </p>
        </div>

        <button
          type="button"
          onClick={onOpenSystemDocs}
          className="px-4 py-2.5 min-h-[44px] rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-800 text-sm font-semibold flex items-center gap-2 shrink-0 transition-colors"
        >
          <Code className="w-4 h-4 text-teal-600" />
          <span>Hồ sơ kiến trúc hệ thống</span>
        </button>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Profile Form */}
        <form onSubmit={handleSaveProfile} className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4">
          <div className="flex items-center gap-2.5 pb-3 border-b border-slate-100">
            <div className="w-9 h-9 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center">
              <UserCircle2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">Hồ sơ cá nhân</h2>
              <p className="text-xs text-slate-500 font-mono">{currentUser.email}</p>
            </div>
          </div>

          {profileFeedback && (
            <div
              className={`p-3 rounded-xl text-sm font-medium flex items-center gap-2 border ${
                profileFeedback.type === 'success'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-rose-50 border-rose-200 text-rose-800'
              }`}
            >
              {profileFeedback.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0" />
              )}
              <span>{profileFeedback.text}</span>
            </div>
          )}

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Họ và tên hiển thị</label>
            <input
              type="text"
              required
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-600"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Đơn vị công tác / Trường</label>
            <input
              type="text"
              value={editSchool}
              onChange={(e) => setEditSchool(e.target.value)}
              placeholder={APP_CONFIG.APP_SCHOOL}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-600"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Số điện thoại liên hệ</label>
            <input
              type="tel"
              value={editPhone}
              onChange={(e) => setEditPhone(e.target.value)}
              placeholder="09xx xxx xxx"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-600"
            />
          </div>

          <button
            type="submit"
            disabled={isSavingProfile}
            className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white text-sm font-semibold transition-colors shadow-xs"
          >
            {isSavingProfile ? 'Đang lưu thay đổi...' : 'Lưu thông tin hồ sơ'}
          </button>
        </form>

        {/* Password Form */}
        <form onSubmit={handleChangePassword} className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4">
          <div className="flex items-center gap-2.5 pb-3 border-b border-slate-100">
            <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center">
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">Đổi mật khẩu đăng nhập</h2>
              <p className="text-xs text-slate-500">Bảo vệ tài khoản giáo viên / quản trị viên</p>
            </div>
          </div>

          {pwFeedback && (
            <div
              className={`p-3 rounded-xl text-sm font-medium flex items-center gap-2 border ${
                pwFeedback.type === 'success'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-rose-50 border-rose-200 text-rose-800'
              }`}
            >
              {pwFeedback.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0" />
              )}
              <span>{pwFeedback.text}</span>
            </div>
          )}

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Mật khẩu hiện tại</label>
            <div className="relative">
              <input
                type={showPw ? 'text' : 'password'}
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full px-3.5 py-2.5 pr-10 rounded-xl border border-slate-300 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-600"
              />
              <button
                type="button"
                onClick={() => setShowPw(!showPw)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
              >
                {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Mật khẩu mới</label>
            <input
              type={showPw ? 'text' : 'password'}
              required
              minLength={6}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-600"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Xác nhận mật khẩu mới</label>
            <input
              type={showPw ? 'text' : 'password'}
              required
              minLength={6}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-600"
            />
          </div>

          <button
            type="submit"
            disabled={isChangingPw}
            className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white text-sm font-semibold transition-colors shadow-xs"
          >
            {isChangingPw ? 'Đang cập nhật mật khẩu...' : 'Cập nhật mật khẩu'}
          </button>
        </form>
      </div>

      {/* System Standards & Security Policy Reference */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-teal-600" />
            <span>Quy chuẩn hệ thống thi &amp; Bóc tách đề GDPT 2018</span>
          </h2>
          {onOpenAdminLegacy && currentUser.role === 'admin' && (
            <button
              type="button"
              onClick={onOpenAdminLegacy}
              className="px-4 py-2 min-h-[40px] rounded-xl bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200 text-sm font-semibold"
            >
              Mở Bảng kiểm định Admin
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
              <Layers className="w-4 h-4 text-teal-600" />
              <span>Cấu trúc 3 Phần chuẩn</span>
            </div>
            <p className="text-sm text-slate-600">
              Phần I (0,25đ/câu), Phần II Đúng/Sai lũy tiến (0,1 – 0,25 – 0,5 – 1,0đ), Phần III Trả lời ngắn tối đa 4 ký tự.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
              <Award className="w-4 h-4 text-emerald-600" />
              <span>Mở đáp án theo điểm sàn</span>
            </div>
            <p className="text-sm text-slate-600">
              Hỗ trợ cấu hình mật khẩu phòng thi và ngưỡng điểm sàn xem đáp án (mặc định ≥ 8,0 điểm) xác thực qua server.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
              <ShieldCheck className="w-4 h-4 text-indigo-600" />
              <span>Bóc tách DOCX / PDF an toàn</span>
            </div>
            <p className="text-sm text-slate-600">
              Bảo toàn công thức hóa học, OMML LaTeX, cảnh báo PDF dạng scan thiếu lớp văn bản, không tự bịa đáp án.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
