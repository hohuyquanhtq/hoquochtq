import React from 'react';
import {
  LayoutDashboard,
  FilePlus2,
  FileUp,
  FolderKanban,
  Database,
  Globe,
  BarChart3,
  Users,
  BookOpenCheck,
  BookMarked,
  Settings,
  FlaskConical,
  X,
  PanelLeftClose,
  PanelLeftOpen,
  Shuffle,
} from 'lucide-react';
import { APP_CONFIG } from '../../constants/brand';
import { UserRole } from '../../types';

export interface WorkspaceSidebarProps {
  activeTab: string;
  userRole: UserRole;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
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

interface SidebarNavGroup {
  title: string;
  items: SidebarNavItem[];
}

export const WorkspaceSidebar: React.FC<WorkspaceSidebarProps> = ({
  activeTab,
  userRole,
  isCollapsed = false,
  onToggleCollapse,
  onSelectTab,
  onOpenSystemDocs,
  isMobileOpen,
  onCloseMobile,
}) => {
  const navGroups: SidebarNavGroup[] = [
    {
      title: 'Tổng quan & Soạn đề',
      items: [
        {
          id: userRole === 'admin' ? 'admin_dashboard' : 'dashboard',
          label: 'Tổng quan',
          matchTabs: userRole === 'admin' ? ['admin_dashboard', 'dashboard'] : ['dashboard'],
          icon: LayoutDashboard,
        },
        {
          id: 'create_exam',
          label: 'Tạo đề thi',
          matchTabs: ['create_exam'],
          icon: FilePlus2,
        },
        {
          id: 'upload_exam',
          label: 'Bóc tách Word/PDF',
          matchTabs: ['upload_exam'],
          icon: FileUp,
        },
        {
          id: 'shuffle_exam',
          label: 'Trộn & Xáo Đề Thi',
          matchTabs: ['shuffle_exam'],
          icon: Shuffle,
        },
      ],
    },
    {
      title: 'Quản lý & Tổ chức thi',
      items: [
        {
          id: 'exam_manager',
          label: 'Đề thi (Thư mục)',
          matchTabs: ['exam_manager', 'folder_manager'],
          icon: FolderKanban,
        },
        {
          id: 'question_bank',
          label: 'Ngân hàng câu hỏi',
          matchTabs: ['question_bank'],
          icon: Database,
        },
        ...(userRole === 'admin'
          ? [
              {
                id: 'admin_curriculum',
                label: 'Danh mục bài học',
                matchTabs: ['admin_curriculum'],
                icon: BookMarked,
              },
            ]
          : []),
        {
          id: 'online_exams',
          label: 'Bài thi trực tuyến',
          matchTabs: ['online_exams'],
          icon: Globe,
        },
        {
          id: 'exam_results',
          label: 'Kết quả & Thống kê',
          matchTabs: ['exam_results', 'teacher_submission_review'],
          icon: BarChart3,
        },
        {
          id: userRole === 'admin' ? 'admin_users' : 'class_manager',
          label: userRole === 'admin' ? 'Quản lý tài khoản' : 'Lớp học & Học sinh',
          matchTabs: userRole === 'admin' ? ['admin_users'] : ['class_manager'],
          icon: Users,
        },
      ],
    },
    {
      title: 'Hỗ trợ & Hệ thống',
      items: [
        {
          id: 'user_guide',
          label: 'Hướng dẫn sử dụng',
          matchTabs: ['user_guide'],
          icon: BookOpenCheck,
        },
        {
          id: 'system_settings',
          label: 'Cài đặt hệ thống',
          matchTabs: ['system_settings'],
          icon: Settings,
        },
      ],
    },
  ];

  const handleNavClick = (tabId: string) => {
    onSelectTab(tabId);
    onCloseMobile();
  };

  const renderSidebarContent = (collapsedMode: boolean) => (
    <div className="h-full flex flex-col bg-slate-900 text-slate-100 border-r border-slate-800 select-none">
      {/* Brand Header */}
      <div
        className={`h-[70px] shrink-0 border-b border-slate-800 flex items-center ${
          collapsedMode ? 'justify-center px-2' : 'justify-between px-4'
        } gap-2`}
      >
        <button
          type="button"
          onClick={() => handleNavClick(userRole === 'admin' ? 'admin_dashboard' : 'dashboard')}
          title="QUIZ PRO - Trang tổng quan"
          className={`flex items-center gap-3 text-left min-w-0 group focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 rounded-xl ${
            collapsedMode ? 'justify-center p-1' : 'flex-1'
          }`}
        >
          <div className="w-10 h-10 rounded-xl bg-teal-600 text-white flex items-center justify-center shrink-0 shadow-sm group-hover:bg-teal-500 transition-colors">
            <FlaskConical className="w-5 h-5" />
          </div>
          {!collapsedMode && (
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-xl font-extrabold tracking-tight text-white whitespace-nowrap">
                  QUIZ <span className="text-teal-400">PRO</span>
                </span>
              </div>
              <p className="text-[13px] font-medium text-slate-400 truncate">
                {APP_CONFIG.APP_NAME} · GDPT 2018
              </p>
            </div>
          )}
        </button>

        {/* Mobile Drawer Close */}
        <button
          type="button"
          onClick={onCloseMobile}
          aria-label="Đóng menu điều hướng"
          className="lg:hidden min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Desktop Collapse Toggle */}
        {!collapsedMode && onToggleCollapse && (
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-label="Thu gọn thanh điều hướng"
            title="Thu gọn sidebar"
            className="hidden lg:flex min-h-[38px] min-w-[38px] items-center justify-center rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white transition-colors shrink-0"
          >
            <PanelLeftClose className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Expand button when collapsed */}
      {collapsedMode && onToggleCollapse && (
        <div className="hidden lg:flex justify-center pt-3 px-2">
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-label="Mở rộng thanh điều hướng"
            title="Mở rộng sidebar"
            className="w-full min-h-[40px] flex items-center justify-center rounded-xl text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
          >
            <PanelLeftOpen className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* Navigation Groups */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5" aria-label="Điều hướng chính">
        {navGroups.map((group) => (
          <div key={group.title} className="space-y-1.5">
            {!collapsedMode && (
              <p className="px-3 pb-1 text-[13px] font-semibold text-slate-400 truncate">
                {group.title}
              </p>
            )}
            <div className="space-y-1">
              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive = item.matchTabs.includes(activeTab);
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleNavClick(item.id)}
                    title={collapsedMode ? item.label : undefined}
                    aria-current={isActive ? 'page' : undefined}
                    className={`w-full flex items-center ${
                      collapsedMode ? 'justify-center px-2' : 'gap-3 px-3.5'
                    } min-h-[44px] py-2.5 rounded-xl text-[15px] transition-colors text-left min-w-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 ${
                      isActive
                        ? 'bg-teal-600 text-white font-semibold shadow-sm'
                        : 'text-slate-300 font-medium hover:bg-slate-800 hover:text-white'
                    }`}
                  >
                    <Icon
                      className={`w-5 h-5 shrink-0 ${
                        isActive ? 'text-white' : 'text-slate-400'
                      }`}
                    />
                    {!collapsedMode && (
                      <span className="truncate min-w-0 whitespace-nowrap">{item.label}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Sidebar Footer */}
      <div className="p-3 border-t border-slate-800 space-y-2.5 shrink-0 bg-slate-900">
        <button
          type="button"
          onClick={() => {
            onOpenSystemDocs();
            onCloseMobile();
          }}
          title={collapsedMode ? 'Kiến trúc kỹ thuật hệ thống' : undefined}
          className={`w-full flex items-center ${
            collapsedMode ? 'justify-center px-2' : 'gap-2.5 px-3.5'
          } min-h-[42px] rounded-xl border border-slate-700 bg-slate-800/80 hover:bg-slate-800 hover:border-teal-500/60 text-slate-200 hover:text-white text-sm font-medium transition-colors`}
        >
          <FlaskConical className="w-4 h-4 text-teal-400 shrink-0" />
          {!collapsedMode && <span className="truncate whitespace-nowrap">Kiến trúc kỹ thuật</span>}
        </button>

        {!collapsedMode && (
          <div className="px-2 flex items-center justify-between text-[13px] text-slate-400">
            <span>{APP_CONFIG.APP_NAME}</span>
            <span className="tabular-nums">v{APP_CONFIG.APP_VERSION}</span>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Fixed Sidebar (264px expanded / 76px collapsed) */}
      <aside
        className={`hidden lg:block shrink-0 h-full transition-[width] duration-200 ease-out ${
          isCollapsed ? 'w-[76px]' : 'w-[264px]'
        }`}
      >
        {renderSidebarContent(isCollapsed)}
      </aside>

      {/* Mobile / Tablet Slide-over Drawer */}
      {isMobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <div className="relative z-10 w-[272px] max-w-[85vw] h-full shadow-2xl">
            {renderSidebarContent(false)}
          </div>
        </div>
      )}
    </>
  );
};
