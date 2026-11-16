import React from 'react';
import {
  LayoutDashboard,
  FilePlus2,
  FolderKanban,
  Globe,
  BarChart3,
  Users,
  Settings,
  FlaskConical,
  X,
  Code,
} from 'lucide-react';
import { APP_CONFIG } from '../../constants/brand';
import { UserRole } from '../../types';

export interface WorkspaceSidebarProps {
  activeTab: string;
  userRole: UserRole;
  onSelectTab: (tab: string) => void;
  onOpenSystemDocs: () => void;
  isMobileOpen: boolean;
  onCloseMobile: () => void;
}

interface SidebarNavItem {
  id: string;
  label: string;
  matchTabs: string[];
  icon: React.ComponentType<{ className?: string }>;
}

export const WorkspaceSidebar: React.FC<WorkspaceSidebarProps> = ({
  activeTab,
  userRole,
  onSelectTab,
  onOpenSystemDocs,
  isMobileOpen,
  onCloseMobile,
}) => {
  const navItems: SidebarNavItem[] = [
    {
      id: userRole === 'admin' ? 'admin_dashboard' : 'dashboard',
      label: 'Tổng quan Dashboard',
      matchTabs: userRole === 'admin' ? ['admin_dashboard', 'dashboard'] : ['dashboard'],
      icon: LayoutDashboard,
    },
    {
      id: 'upload_exam',
      label: 'Tạo đề thi',
      matchTabs: ['upload_exam', 'create_exam'],
      icon: FilePlus2,
    },
    {
      id: 'exam_manager',
      label: 'Kho đề thi',
      matchTabs: ['exam_manager', 'question_bank', 'folder_manager'],
      icon: FolderKanban,
    },
    {
      id: 'online_exams',
      label: 'Bài thi trực tuyến',
      matchTabs: ['online_exams'],
      icon: Globe,
    },
    {
      id: 'exam_results',
      label: 'Kết quả và thống kê',
      matchTabs: ['exam_results'],
      icon: BarChart3,
    },
    {
      id: userRole === 'admin' ? 'admin_users' : 'class_manager',
      label: 'Quản lý học sinh',
      matchTabs: userRole === 'admin' ? ['admin_users'] : ['class_manager'],
      icon: Users,
    },
    {
      id: 'system_settings',
      label: 'Thiết lập hệ thống',
      matchTabs: ['system_settings'],
      icon: Settings,
    },
  ];

  const handleNavClick = (tabId: string) => {
    onSelectTab(tabId);
    onCloseMobile();
  };

  const renderSidebarContent = () => (
    <div className="h-full flex flex-col bg-white border-r border-slate-200 select-none">
      {/* Brand Header */}
      <div className="h-[68px] shrink-0 px-5 border-b border-slate-200 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => handleNavClick(userRole === 'admin' ? 'admin_dashboard' : 'dashboard')}
          className="flex items-center gap-3 text-left min-w-0 group focus:outline-none"
        >
          <div className="w-10 h-10 rounded-xl bg-teal-600 text-white flex items-center justify-center shrink-0 shadow-xs group-hover:bg-teal-700 transition-colors">
            <FlaskConical className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-xl font-extrabold tracking-tight text-slate-900">
                QUIZ <span className="text-teal-700">PRO</span>
              </span>
            </div>
            <p className="text-xs font-medium text-slate-500 truncate">
              {APP_CONFIG.APP_NAME} • GDPT 2018
            </p>
          </div>
        </button>

        <button
          type="button"
          onClick={onCloseMobile}
          aria-label="Đóng menu điều hướng"
          className="lg:hidden p-2 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Navigation Items (7 Core Menu Items) */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1.5" aria-label="Điều hướng chính">
        <p className="px-3 pb-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">
          Không gian làm việc
        </p>
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = item.matchTabs.includes(activeTab);
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handleNavClick(item.id)}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 min-h-[44px] rounded-xl text-sm transition-all text-left min-w-0 ${
                isActive
                  ? 'bg-teal-50 text-teal-800 font-bold border border-teal-200/90 shadow-2xs'
                  : 'text-slate-700 font-medium hover:bg-slate-100 hover:text-slate-900 border border-transparent'
              }`}
            >
              <Icon
                className={`w-5 h-5 shrink-0 ${
                  isActive ? 'text-teal-700' : 'text-slate-500'
                }`}
              />
              <span className="truncate min-w-0">{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Sidebar Footer */}
      <div className="p-3 border-t border-slate-200 space-y-2 shrink-0 bg-slate-50/70">
        <button
          type="button"
          onClick={() => {
            onOpenSystemDocs();
            onCloseMobile();
          }}
          className="w-full flex items-center gap-2.5 px-3 py-2.5 min-h-[40px] rounded-xl border border-slate-200 bg-white hover:border-teal-300 hover:bg-teal-50/40 text-slate-700 hover:text-teal-800 text-xs font-semibold transition-colors"
        >
          <Code className="w-4 h-4 text-teal-600 shrink-0" />
          <span className="truncate">Kiến trúc &amp; Hướng dẫn</span>
        </button>
        <div className="px-2 flex items-center justify-between text-[11px] text-slate-500 font-medium">
          <span>{APP_CONFIG.APP_NAME} v{APP_CONFIG.APP_VERSION}</span>
          <span>Bộ GD&amp;ĐT</span>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Fixed Sidebar */}
      <aside className="hidden lg:block w-64 shrink-0 h-full">
        {renderSidebarContent()}
      </aside>

      {/* Mobile / Tablet Slide-over Drawer */}
      {isMobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs"
            onClick={onCloseMobile}
          />
          <div className="relative z-10 w-72 max-w-[85vw] h-full shadow-2xl">
            {renderSidebarContent()}
          </div>
        </div>
      )}
    </>
  );
};
