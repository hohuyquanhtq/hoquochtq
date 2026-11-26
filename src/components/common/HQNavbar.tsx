import React, { useState, useEffect, useRef } from 'react';
import {
  GraduationCap,
  BookOpen,
  FileUp,
  HelpCircle,
  Layers,
  Sun,
  Moon,
  ChevronDown,
  FolderKanban,
  SlidersHorizontal,
  UserCog,
  LogOut,
  LogIn,
  Menu,
  X,
} from 'lucide-react';
import { User } from '../../types';
import { isSuperAdminUser } from '../../constants/superAdmin';

export interface HQNavItem {
  id: string;
  label: string;
  matchTabs: string[];
  icon: React.ComponentType<{ className?: string }>;
}

export interface HQNavbarProps {
  currentUser: User | null;
  isGuest?: boolean;
  activeTab: string;
  onSelectTab: (tab: string) => void;
  onOpenProfile?: () => void;
  onLogout?: () => void | Promise<void>;
  onRequestAuth?: () => void;
  versionBadge?: string;
}

const THEME_STORAGE_KEY = 'hqtest_theme';

export const HQ_NAV_ITEMS: HQNavItem[] = [
  {
    id: 'exam_manager',
    label: 'Ngân hàng đề',
    matchTabs: ['exam_manager', 'question_bank', 'folder_manager'],
    icon: Layers,
  },
  {
    id: 'online_exams',
    label: 'Luyện tập',
    matchTabs: ['online_exams', 'student_home', 'exam_landing'],
    icon: BookOpen,
  },
  {
    id: 'upload_exam',
    label: 'Tạo đề từ Word (.docx)',
    matchTabs: ['upload_exam', 'create_exam', 'shuffle_exam'],
    icon: FileUp,
  },
  {
    id: 'user_guide',
    label: 'Hướng dẫn',
    matchTabs: ['user_guide'],
    icon: HelpCircle,
  },
];

function getInitials(name?: string, email?: string): string {
  const source = (name || email || 'HQ').trim();
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}

export const HQNavbar: React.FC<HQNavbarProps> = ({
  currentUser,
  isGuest = false,
  activeTab,
  onSelectTab,
  onOpenProfile,
  onLogout,
  onRequestAuth,
  versionBadge = 'v2.0',
}) => {
  const [isDark, setIsDark] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
      if (stored === 'dark') return true;
      if (stored === 'light') return false;
    } catch {}
    return document.documentElement.classList.contains('dark');
  });

  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  // Sync dark class on <html>
  useEffect(() => {
    const root = document.documentElement;
    if (isDark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, isDark ? 'dark' : 'light');
    } catch {}
  }, [isDark]);

  // Close profile dropdown on outside click or Escape key
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsDropdownOpen(false);
        setIsMobileDrawerOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // Lock body scroll when mobile drawer is open
  useEffect(() => {
    if (!isMobileDrawerOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [isMobileDrawerOpen]);

  const isCurrentSuperAdmin = isSuperAdminUser(currentUser);

  const homeTab =
    isGuest || !currentUser
      ? 'exam_landing'
      : currentUser.role === 'student'
      ? 'student_home'
      : isCurrentSuperAdmin
      ? 'admin_dashboard'
      : 'dashboard';

  const handleNavSelect = (tabId: string) => {
    // Route guests/students to accessible practice entry if clicking teacher-only link
    if ((isGuest || currentUser?.role === 'student') && tabId === 'online_exams') {
      onSelectTab(isGuest ? 'exam_landing' : 'student_home');
    } else {
      onSelectTab(tabId);
    }
    setIsMobileDrawerOpen(false);
  };

  const roleLabel =
    isCurrentSuperAdmin
      ? 'Super Admin'
      : currentUser?.role === 'teacher'
      ? 'Giáo viên'
      : 'Học sinh';

  return (
    <>
      {/* Sticky Translucent Navbar Header (h-16, WCAG AA contrast) */}
      <header className="sticky top-0 z-40 h-16 w-full backdrop-blur-md bg-white/90 dark:bg-slate-900/90 border-b border-slate-200 dark:border-slate-800 transition-colors duration-200">
        <div className="max-w-7xl mx-auto h-full px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-4">
          {/* LEFT ZONE: Brand Identity (Gradient Icon + HQTest + v2.0 badge) */}
          <button
            type="button"
            onClick={() => handleNavSelect(homeTab)}
            className="flex items-center gap-2.5 group shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:ring-offset-2 rounded-xl"
            aria-label="HQTest Trang chủ"
          >
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-slate-900 via-indigo-700 to-blue-600 text-white flex items-center justify-center shadow-sm group-hover:scale-[1.03] transition-transform duration-150">
              <GraduationCap className="w-5 h-5" />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-extrabold tracking-tight text-slate-900 dark:text-white whitespace-nowrap">
                HQ<span className="text-indigo-600 dark:text-indigo-400">Test</span>
              </span>
              <span className="px-1.5 py-0.5 rounded-md text-[11px] font-semibold tracking-wide bg-indigo-50 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300 border border-indigo-200/80 dark:border-indigo-800 whitespace-nowrap">
                {versionBadge}
              </span>
            </div>
          </button>

          {/* CENTER ZONE: Navigation Links (Desktop >= md, clean single-line with active indicator) */}
          <nav
            aria-label="Điều hướng chính HQTest"
            className="hidden md:flex items-center gap-1 lg:gap-2 h-full"
          >
            {HQ_NAV_ITEMS.map((item) => {
              const isActive = item.matchTabs.includes(activeTab);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleNavSelect(item.id)}
                  aria-current={isActive ? 'page' : undefined}
                  className={`relative h-full px-3 lg:px-3.5 inline-flex items-center text-sm whitespace-nowrap shrink-0 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 rounded-lg ${
                    isActive
                      ? 'font-semibold text-indigo-600 dark:text-indigo-400'
                      : 'font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <span>{item.label}</span>
                  {/* Subtle bottom active indicator bar */}
                  <span
                    aria-hidden="true"
                    className={`absolute bottom-0 left-3 right-3 h-0.5 rounded-full transition-opacity duration-200 ${
                      isActive
                        ? 'bg-indigo-600 dark:bg-indigo-400 opacity-100'
                        : 'bg-slate-300 dark:bg-slate-600 opacity-0'
                    }`}
                  />
                </button>
              );
            })}
          </nav>

          {/* RIGHT ZONE: Theme Toggle + User Profile Dropdown + Mobile Hamburger */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {/* Dark / Light Mode Quick Switch */}
            <button
              type="button"
              onClick={() => setIsDark((prev) => !prev)}
              aria-label={isDark ? 'Chuyển sang giao diện Sáng' : 'Chuyển sang giao diện Tối'}
              title={isDark ? 'Chế độ Sáng' : 'Chế độ Tối'}
              className="w-9 h-9 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-700/80 flex items-center justify-center transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600"
            >
              {isDark ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
            </button>

            {/* User / Teacher Profile Dropdown OR Login Button */}
            {isGuest || !currentUser ? (
              <button
                type="button"
                onClick={onRequestAuth}
                className="h-9 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold shadow-xs inline-flex items-center gap-2 transition-colors duration-150 whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:ring-offset-2"
              >
                <LogIn className="w-4 h-4 shrink-0" />
                <span>Đăng nhập</span>
              </button>
            ) : (
              <div className="relative" ref={dropdownRef}>
                <button
                  type="button"
                  onClick={() => setIsDropdownOpen((prev) => !prev)}
                  aria-expanded={isDropdownOpen}
                  aria-haspopup="menu"
                  className="h-10 pl-1.5 pr-2.5 rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/80 hover:border-slate-300 dark:hover:border-slate-600 flex items-center gap-2 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600"
                >
                  {/* Circular Avatar */}
                  <span className="w-7 h-7 rounded-full bg-gradient-to-br from-slate-800 to-indigo-600 text-white text-xs font-bold flex items-center justify-center shrink-0">
                    {getInitials(currentUser.name, currentUser.email)}
                  </span>
                  <span className="hidden sm:inline text-sm font-semibold text-slate-800 dark:text-slate-100 max-w-[130px] truncate whitespace-nowrap">
                    {currentUser.name || currentUser.email}
                  </span>
                  <ChevronDown
                    className={`w-4 h-4 text-slate-400 transition-transform duration-200 shrink-0 ${
                      isDropdownOpen ? 'rotate-180 text-indigo-600 dark:text-indigo-400' : ''
                    }`}
                  />
                </button>

                {/* Dropdown Menu Panel */}
                {isDropdownOpen && (
                  <div
                    role="menu"
                    aria-label="Menu tài khoản"
                    className="absolute right-0 mt-2 w-64 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-lg py-1.5 z-50 origin-top-right"
                  >
                    {/* Profile Summary Header */}
                    <div className="px-4 py-2.5 border-b border-slate-100 dark:border-slate-800">
                      <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                        {currentUser.name || 'Người dùng'}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                        {roleLabel} · {currentUser.email}
                      </p>
                    </div>

                    {/* Menu Items */}
                    <div className="py-1">
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setIsDropdownOpen(false);
                          onSelectTab('exam_manager');
                        }}
                        className="w-full px-4 py-2 text-left text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-indigo-600 dark:hover:text-indigo-400 flex items-center gap-2.5 transition-colors"
                      >
                        <FolderKanban className="w-4 h-4 text-slate-400 shrink-0" />
                        <span>Quản lý đề đã lưu</span>
                      </button>

                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setIsDropdownOpen(false);
                          onSelectTab('system_settings');
                        }}
                        className="w-full px-4 py-2 text-left text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-indigo-600 dark:hover:text-indigo-400 flex items-center gap-2.5 transition-colors"
                      >
                        <SlidersHorizontal className="w-4 h-4 text-slate-400 shrink-0" />
                        <span>Cài đặt chấm thi</span>
                      </button>

                      {onOpenProfile && (
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setIsDropdownOpen(false);
                            onOpenProfile();
                          }}
                          className="w-full px-4 py-2 text-left text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-indigo-600 dark:hover:text-indigo-400 flex items-center gap-2.5 transition-colors"
                        >
                          <UserCog className="w-4 h-4 text-slate-400 shrink-0" />
                          <span>Hồ sơ &amp; Bảo mật</span>
                        </button>
                      )}
                    </div>

                    {onLogout && (
                      <div className="pt-1 border-t border-slate-100 dark:border-slate-800">
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setIsDropdownOpen(false);
                            void onLogout();
                          }}
                          className="w-full px-4 py-2 text-left text-sm font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50 flex items-center gap-2.5 transition-colors"
                        >
                          <LogOut className="w-4 h-4 shrink-0" />
                          <span>Đăng xuất</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Mobile Hamburger Button (< md) */}
            <button
              type="button"
              onClick={() => setIsMobileDrawerOpen(true)}
              aria-label="Mở menu điều hướng"
              aria-expanded={isMobileDrawerOpen}
              className="md:hidden w-10 h-10 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center justify-center transition-colors"
            >
              <Menu className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Slide-Over Drawer (Smooth CSS Transform Transition) */}
      <div
        className={`fixed inset-0 z-50 md:hidden transition-opacity duration-200 ${
          isMobileDrawerOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        aria-hidden={!isMobileDrawerOpen}
      >
        {/* Backdrop */}
        <div
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs"
          onClick={() => setIsMobileDrawerOpen(false)}
        />

        {/* Slide-over Panel */}
        <aside
          aria-label="Menu di động HQTest"
          className={`fixed top-0 right-0 bottom-0 w-72 max-w-[85vw] bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col transition-transform duration-200 ease-out ${
            isMobileDrawerOpen ? 'translate-x-0' : 'translate-x-full'
          }`}
        >
          {/* Drawer Header */}
          <div className="h-16 px-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-slate-900 via-indigo-700 to-blue-600 text-white flex items-center justify-center">
                <GraduationCap className="w-4 h-4" />
              </div>
              <span className="text-base font-extrabold text-slate-900 dark:text-white">
                HQ<span className="text-indigo-600 dark:text-indigo-400">Test</span>
              </span>
              <span className="px-1.5 py-0.5 rounded text-[11px] font-semibold bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300">
                {versionBadge}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setIsMobileDrawerOpen(false)}
              aria-label="Đóng menu"
              className="w-9 h-9 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Drawer Navigation Links */}
          <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
            {HQ_NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = item.matchTabs.includes(activeTab);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleNavSelect(item.id)}
                  className={`w-full min-h-[44px] px-3.5 py-2.5 rounded-xl text-sm flex items-center gap-3 transition-colors ${
                    isActive
                      ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 font-semibold'
                      : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 font-medium'
                  }`}
                >
                  <Icon
                    className={`w-4 h-4 shrink-0 ${
                      isActive ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400'
                    }`}
                  />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Drawer Footer: Quick Account Actions */}
          <div className="p-4 border-t border-slate-200 dark:border-slate-800 space-y-2">
            {currentUser && !isGuest ? (
              <>
                <div className="px-2 pb-2">
                  <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                    {currentUser.name || currentUser.email}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                    {roleLabel} · {currentUser.email}
                  </p>
                </div>
                {onOpenProfile && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsMobileDrawerOpen(false);
                      onOpenProfile();
                    }}
                    className="w-full min-h-[42px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 text-sm font-medium flex items-center gap-2.5 transition-colors"
                  >
                    <UserCog className="w-4 h-4 text-slate-400" />
                    <span>Hồ sơ &amp; Cài đặt</span>
                  </button>
                )}
                {onLogout && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsMobileDrawerOpen(false);
                      void onLogout();
                    }}
                    className="w-full min-h-[42px] px-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-950 text-sm font-semibold flex items-center gap-2.5 transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Đăng xuất</span>
                  </button>
                )}
              </>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setIsMobileDrawerOpen(false);
                  onRequestAuth?.();
                }}
                className="w-full min-h-[44px] px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors"
              >
                <LogIn className="w-4 h-4" />
                <span>Đăng nhập hệ thống</span>
              </button>
            )}
          </div>
        </aside>
      </div>
    </>
  );
};
