import React from 'react';
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
  LogOut
} from 'lucide-react';

interface HeaderProps {
  currentUser: User;
  onSwitchUser: (role: UserRole) => void;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onOpenSystemDocs: () => void;
  onOpenQuickExamModal?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentUser,
  onSwitchUser,
  activeTab,
  setActiveTab,
  onOpenSystemDocs,
}) => {
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
                    CHEM<span className="text-blue-600">TEST</span>
                  </span>
                  <span className="px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-blue-100 text-blue-800 rounded-md">
                    THPT & Chuyên
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 font-medium hidden sm:block">
                  Ngân hàng câu hỏi & Thi trắc nghiệm Hóa học online
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
            <div className="flex items-center gap-2 pl-2 border-l border-slate-200">
              <div className="w-8 h-8 rounded-full bg-blue-100 border border-blue-200 flex items-center justify-center text-blue-700 font-bold text-xs">
                {currentUser.role === 'teacher' ? <FlaskConical className="w-4 h-4" /> : currentUser.role === 'admin' ? <ShieldCheck className="w-4 h-4" /> : <GraduationCap className="w-4 h-4" />}
              </div>
              <div className="hidden xl:block text-left text-xs">
                <p className="font-semibold text-slate-800 leading-tight truncate max-w-[120px]">{currentUser.name}</p>
                <p className="text-slate-500 text-[10px]">
                  {currentUser.role === 'teacher' ? 'Giáo viên Hóa' : currentUser.role === 'admin' ? 'Quản trị viên' : `Học sinh: ${currentUser.className || '12 Hóa'}`}
                </p>
              </div>
            </div>

          </div>

        </div>
      </div>
    </header>
  );
};
