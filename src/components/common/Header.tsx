import React, { useState, useEffect } from 'react';
import { User, UserRole } from '../../types';
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
  Edit2,
  X,
  Check,
  Sparkles,
  Cloud
} from 'lucide-react';

import { APP_CONFIG, getUserGreeting } from '../../constants/brand';

interface HeaderProps {
  currentUser: User;
  onSwitchUser: (role: UserRole) => void;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onOpenSystemDocs: () => void;
  onOpenQuickExamModal?: () => void;
  onUpdateUser?: (updated: User) => void;
  cloudUserEmail?: string | null;
  onCloudSignIn?: () => void;
  onCloudSignOut?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentUser,
  onSwitchUser,
  activeTab,
  setActiveTab,
  onOpenSystemDocs,
  onUpdateUser,
  cloudUserEmail,
  onCloudSignIn,
  onCloudSignOut,
}) => {
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [editName, setEditName] = useState(currentUser.name || '');
  const [editSchool, setEditSchool] = useState(currentUser.school || '');
  const [editClass, setEditClass] = useState(currentUser.className || '');

  // Synchronize when active user changes
  useEffect(() => {
    setEditName(currentUser.name || '');
    setEditSchool(currentUser.school || '');
    setEditClass(currentUser.className || '');
  }, [currentUser]);

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    if (onUpdateUser) {
      onUpdateUser({
        ...currentUser,
        name: editName.trim(),
        school: editSchool.trim(),
        className: editClass.trim(),
      });
    }
    setIsProfileModalOpen(false);
  };
  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          
          {/* Logo & Brand */}
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setActiveTab(currentUser.role === 'student' ? 'student_home' : 'dashboard')}
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

          {/* Navigation for Teacher */}
          {currentUser.role === 'teacher' && (
            <nav className="hidden lg:flex items-center gap-1">
              <button
                onClick={() => setActiveTab('dashboard')}
                className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors flex items-center gap-1.5 ${
                  activeTab === 'dashboard'
                    ? 'bg-blue-50 text-blue-700 border border-blue-200/60'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <Layers className="w-4 h-4" />
                Tổng quan
              </button>
              <button
                onClick={() => setActiveTab('upload_exam')}
                className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors flex items-center gap-1.5 ${
                  activeTab === 'upload_exam'
                    ? 'bg-blue-50 text-blue-700 border border-blue-200/60'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <FileText className="w-4 h-4" />
                Tải & Nhận dạng đề
              </button>
              <button
                onClick={() => setActiveTab('question_bank')}
                className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors flex items-center gap-1.5 ${
                  activeTab === 'question_bank'
                    ? 'bg-blue-50 text-blue-700 border border-blue-200/60'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <BookOpen className="w-4 h-4" />
                Ngân hàng câu hỏi
              </button>
              <button
                onClick={() => setActiveTab('folder_manager')}
                className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors flex items-center gap-1.5 ${
                  activeTab === 'folder_manager'
                    ? 'bg-blue-50 text-blue-700 border border-blue-200/60'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <FolderTree className="w-4 h-4" />
                Thư mục
              </button>
              <button
                onClick={() => setActiveTab('exam_manager')}
                className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors flex items-center gap-1.5 ${
                  activeTab === 'exam_manager'
                    ? 'bg-blue-50 text-blue-700 border border-blue-200/60'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <FileCheck className="w-4 h-4" />
                Đề & Phòng thi
              </button>
              <button
                onClick={() => setActiveTab('exam_results')}
                className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors flex items-center gap-1.5 ${
                  activeTab === 'exam_results'
                    ? 'bg-blue-50 text-blue-700 border border-blue-200/60'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <BarChart3 className="w-4 h-4" />
                Thống kê & Điểm
              </button>
            </nav>
          )}

          {/* Navigation for Student */}
          {currentUser.role === 'student' && (
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
                Phòng thi & Lịch sử bài làm
              </button>
            </nav>
          )}

          {/* User Role Switcher & System Spec modal button */}
          <div className="flex items-center gap-2.5">
            {/* Cloud Sync Status (Teacher / Admin) */}
            {currentUser.role !== 'student' && (onCloudSignIn || onCloudSignOut) && (
              cloudUserEmail ? (
                <button
                  onClick={onCloudSignOut}
                  title={`Đã đồng bộ Cloud: ${cloudUserEmail}. Nhấn để đăng xuất Cloud`}
                  className="hidden md:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 text-xs font-semibold transition-colors"
                >
                  <Cloud className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Cloud Sync</span>
                </button>
              ) : (
                <button
                  onClick={onCloudSignIn}
                  title="Đăng nhập Google để đồng bộ đề thi & nhận bài làm học sinh từ mọi thiết bị"
                  className="hidden md:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 text-xs font-semibold transition-colors"
                >
                  <Cloud className="w-3.5 h-3.5 text-blue-600" />
                  <span>Đồng bộ Cloud</span>
                </button>
              )
            )}

            {/* System Architecture Button */}
            <button
              onClick={onOpenSystemDocs}
              title="Xem Sơ đồ kiến trúc & Thiết kế kỹ thuật"
              className="hidden md:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 hover:border-slate-300 bg-slate-50 text-slate-700 hover:text-slate-900 text-xs font-semibold shadow-2xs transition-colors"
            >
              <Code className="w-3.5 h-3.5 text-blue-600" />
              <span>Kiến trúc & Sơ đồ</span>
            </button>

            {/* Quick Role Switcher Pill */}
            <div className="flex items-center bg-slate-100 p-0.5 rounded-xl border border-slate-200 text-xs font-medium">
              <button
                onClick={() => onSwitchUser('teacher')}
                className={`px-2.5 py-1 rounded-lg transition-all ${
                  currentUser.role === 'teacher'
                    ? 'bg-white text-blue-700 font-bold shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Giáo viên
              </button>
              <button
                onClick={() => onSwitchUser('student')}
                className={`px-2.5 py-1 rounded-lg transition-all ${
                  currentUser.role === 'student'
                    ? 'bg-white text-blue-700 font-bold shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Học sinh
              </button>
              <button
                onClick={() => onSwitchUser('admin')}
                className={`px-2.5 py-1 rounded-lg transition-all ${
                  currentUser.role === 'admin'
                    ? 'bg-white text-purple-700 font-bold shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Admin
              </button>
            </div>

            {/* Profile Avatar & Name */}
            <button
              onClick={() => setIsProfileModalOpen(true)}
              title="Nhấn để đổi tên hồ sơ & kiểm tra lời chào động"
              className="flex items-center gap-2 pl-2 border-l border-slate-200 hover:opacity-80 transition-opacity text-left group"
            >
              <div className="w-8 h-8 rounded-full bg-blue-100 border border-blue-200 flex items-center justify-center text-blue-700 font-bold text-xs group-hover:scale-105 transition-transform">
                {currentUser.role === 'teacher' ? <FlaskConical className="w-4 h-4" /> : currentUser.role === 'admin' ? <ShieldCheck className="w-4 h-4" /> : <GraduationCap className="w-4 h-4" />}
              </div>
              <div className="hidden xl:block text-left text-xs">
                <p className="font-semibold text-slate-800 leading-tight truncate max-w-[120px] flex items-center gap-1">
                  <span>{currentUser.name || '(Chưa đặt tên)'}</span>
                  <Edit2 className="w-2.5 h-2.5 text-slate-400 group-hover:text-blue-600" />
                </p>
                <p className="text-slate-500 text-[10px]">
                  {currentUser.role === 'teacher' ? 'Giáo viên' : currentUser.role === 'admin' ? 'Quản trị viên' : `Học sinh: ${currentUser.className || 'Lớp 12'}`}
                </p>
              </div>
            </button>

          </div>

        </div>
      </div>

      {/* Profile Edit Modal */}
      {isProfileModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95">
            <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <UserCircle2 className="w-5 h-5 text-blue-400" />
                <h3 className="font-bold text-sm">Hồ Sơ Người Dùng & Lời Chào</h3>
              </div>
              <button 
                onClick={() => setIsProfileModalOpen(false)}
                className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveProfile} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Họ và tên người dùng
                </label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="Nhập họ và tên (ví dụ: Hồ Ngọc Quốc, Nguyễn Thị Lan...)"
                  className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {currentUser.role === 'student' ? (
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Lớp học
                  </label>
                  <input
                    type="text"
                    value={editClass}
                    onChange={(e) => setEditClass(e.target.value)}
                    placeholder="Ví dụ: 12 Hóa 1, 10 Chuyên..."
                    className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Trường / Cơ quan công tác
                  </label>
                  <input
                    type="text"
                    value={editSchool}
                    onChange={(e) => setEditSchool(e.target.value)}
                    placeholder="Ví dụ: Trường THPT chuyên Nguyễn Bỉnh Khiêm, Tp. Đà Nẵng..."
                    className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              )}

              {/* Dynamic Greeting Live Preview */}
              <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-xl space-y-1">
                <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider block">
                  Xem trước lời chào động theo vai trò ({currentUser.role === 'teacher' ? 'Giáo viên' : currentUser.role === 'student' ? 'Học sinh' : 'Admin'}):
                </span>
                <p className="text-sm font-extrabold text-blue-900">
                  "{getUserGreeting(currentUser, editName)}"
                </p>
                <p className="text-[11px] text-blue-600">
                  Hệ thống tự động cập nhật lời chào này trên trang chủ ngay khi bạn lưu.
                </p>
              </div>

              {/* Author & System Info */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-600 space-y-0.5">
                <p className="font-bold text-slate-800">{APP_CONFIG.APP_NAME} – {APP_CONFIG.APP_DESCRIPTION}</p>
                <p>Tác giả: <strong>{APP_CONFIG.APP_AUTHOR}</strong></p>
                <p>{APP_CONFIG.APP_SCHOOL}</p>
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
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-md shadow-blue-500/20"
                >
                  Lưu thay đổi
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </header>
  );
};
