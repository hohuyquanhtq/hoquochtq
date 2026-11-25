import React, { useState, useEffect, useCallback } from 'react';
import {
  User,
  UserRole,
  AccountStatus,
  PilotGroup,
  Question,
  Exam,
  StudentSubmission,
  Folder,
} from '../../types';
import {
  ShieldCheck,
  Users,
  Download,
  RefreshCw,
  CheckCircle2,
  FileCheck,
  BookOpen,
  BookMarked,
  FolderTree,
  Search,
  Lock,
  Unlock,
  Check,
  XCircle,
  Edit3,
  Database,
  AlertCircle,
  UserCheck,
  Clock,
  Globe,
  BarChart3,
  Eye,
  X,
  School,
  Building2,
} from 'lucide-react';
import { StorageService } from '../../services/storage';
import { APP_CONFIG } from '../../constants/brand';
import {
  DANANG_HIGH_SCHOOLS,
  DEFAULT_TEACHER_DEPARTMENTS,
  PILOT_GROUP_META,
  resolvePilotGroup,
} from '../../constants/danangSchools';
import { GRADE_LABELS, QUESTION_TYPE_SHORT_LABELS } from '../../constants/subjects';
import { ChemRenderer } from '../../utils/chemRenderer';
import {
  fetchAllUsersForAdmin,
  updateUserAccountByAdmin,
  fetchCloudAuditDataForAdmin,
  assignLegacyRecordToTeacher,
  reviewExamCityShareByAdmin,
} from '../../services/workspaceService';
import { SystemEvidenceDashboard } from './SystemEvidenceDashboard';

interface AdminDashboardProps {
  currentUser: User;
  questions: Question[];
  exams: Exam[];
  submissions: StudentSubmission[];
  folders: Folder[];
  sectionFocus?: 'overview' | 'users';
  onNavigate?: (tab: string) => void;
  onDataResetOrRestored: () => void;
}

type UserFilterTab = 'all' | 'pending' | 'active' | 'locked' | 'rejected' | 'teacher' | 'student';
type AdminSectionTab = 'teachers_schools' | 'exam_moderation' | 'evidence_stats';

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  currentUser,
  questions,
  exams,
  submissions,
  folders,
  sectionFocus = 'overview',
  onNavigate,
  onDataResetOrRestored,
}) => {
  const [usersList, setUsersList] = useState<User[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(true);
  const [adminSection, setAdminSection] = useState<AdminSectionTab>('teachers_schools');
  const [filterTab, setFilterTab] = useState<UserFilterTab>(
    sectionFocus === 'users' ? 'student' : 'all'
  );
  useEffect(() => {
    setFilterTab(sectionFocus === 'users' ? 'student' : 'all');
    if (sectionFocus === 'users') {
      setAdminSection('teachers_schools');
    }
  }, [sectionFocus]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [busyUid, setBusyUid] = useState<string | null>(null);

  // Moderation state for City Shared Exam Repository
  const [previewModerationExam, setPreviewModerationExam] = useState<Exam | null>(null);
  const [reviewNoteInput, setReviewNoteInput] = useState('');
  const [moderatingExamId, setModeratingExamId] = useState<string | null>(null);

  // Cloud + Local Legacy Audit state
  const [cloudAudit, setCloudAudit] = useState<{
    allExams: Exam[];
    allQuestions: Question[];
    allFolders: Folder[];
    allSubmissions: StudentSubmission[];
  }>({ allExams: [], allQuestions: [], allFolders: [], allSubmissions: [] });
  const [selectedTeacherUidForLegacy, setSelectedTeacherUidForLegacy] = useState('');
  const [isAssigningLegacy, setIsAssigningLegacy] = useState(false);

  const showStatus = (text: string, type: 'success' | 'error' = 'success') => {
    setStatusMsg({ text, type });
    setTimeout(() => setStatusMsg(null), 4000);
  };

  const loadAdminData = useCallback(async () => {
    setIsLoadingUsers(true);
    try {
      const [users, audit] = await Promise.all([
        fetchAllUsersForAdmin(),
        fetchCloudAuditDataForAdmin(),
      ]);
      setUsersList(users);
      setCloudAudit(audit);
      const firstActiveTeacher = users.find((u) => u.role === 'teacher' && u.status === 'active');
      if (firstActiveTeacher && !selectedTeacherUidForLegacy) {
        setSelectedTeacherUidForLegacy(firstActiveTeacher.uid || firstActiveTeacher.id);
      }
    } catch (err) {
      showStatus(
        err instanceof Error ? err.message : 'Không thể tải danh sách tài khoản từ Firestore.',
        'error'
      );
    } finally {
      setIsLoadingUsers(false);
    }
  }, [selectedTeacherUidForLegacy]);

  useEffect(() => {
    void loadAdminData();
  }, [loadAdminData]);

  const adminUid = currentUser.uid || currentUser.id;
  const pendingCount = usersList.filter((u) => u.status === 'pending').length;
  const activeTeachers = usersList.filter((u) => u.role === 'teacher' && u.status === 'active');

  const knownTeacherUids = new Set(usersList.filter((u) => u.role === 'teacher' || u.role === 'admin').map((u) => u.uid || u.id));
  const localLegacy = StorageService.getLegacyUnownedData();

  const cloudLegacyExams = cloudAudit.allExams.filter(
    (e) => !e.ownerId || e.ownerId === 'teacher_1' || !knownTeacherUids.has(e.ownerId)
  );
  const cloudLegacyQuestions = cloudAudit.allQuestions.filter(
    (q) => !q.ownerId || q.ownerId === 'teacher_1' || !knownTeacherUids.has(q.ownerId)
  );
  const cloudLegacyFolders = cloudAudit.allFolders.filter(
    (f) => !f.ownerId || f.ownerId === 'teacher_1' || !knownTeacherUids.has(f.ownerId)
  );
  const cloudLegacySubmissions = cloudAudit.allSubmissions.filter(
    (s) => !s.ownerId || s.ownerId === 'teacher_1' || !knownTeacherUids.has(s.ownerId)
  );

  const filteredUsers = usersList.filter((u) => {
    if (filterTab === 'pending' && u.status !== 'pending') return false;
    if (filterTab === 'active' && u.status !== 'active') return false;
    if (filterTab === 'locked' && u.status !== 'locked') return false;
    if (filterTab === 'rejected' && u.status !== 'rejected') return false;
    if (filterTab === 'teacher' && u.role !== 'teacher') return false;
    if (filterTab === 'student' && u.role !== 'student') return false;

    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      return (
        u.name.toLowerCase().includes(term) ||
        u.email.toLowerCase().includes(term) ||
        (u.school || '').toLowerCase().includes(term) ||
        (u.className || '').toLowerCase().includes(term)
      );
    }
    return true;
  });

  const handleStatusChange = async (user: User, nextStatus: AccountStatus) => {
    const targetUid = user.uid || user.id;
    if (targetUid === adminUid && nextStatus !== 'active') {
      showStatus('Không thể tự khóa tài khoản Quản trị viên đang đăng nhập.', 'error');
      return;
    }

    const nextApprovalStatus =
      nextStatus === 'active'
        ? 'approved'
        : nextStatus === 'pending'
        ? 'pending'
        : 'rejected';

    setBusyUid(targetUid);
    try {
      await updateUserAccountByAdmin(targetUid, adminUid, {
        status: nextStatus,
        approval_status: nextApprovalStatus,
      });
      setUsersList((prev) =>
        prev.map((item) =>
          (item.uid || item.id) === targetUid
            ? { ...item, status: nextStatus, approval_status: nextApprovalStatus }
            : item
        )
      );
      const label =
        nextStatus === 'active'
          ? 'Đã duyệt / mở khóa tài khoản'
          : nextStatus === 'locked'
          ? 'Đã khóa tài khoản'
          : 'Đã từ chối tài khoản';
      showStatus(`${label}: ${user.email}`);
    } catch (err) {
      showStatus(err instanceof Error ? err.message : 'Cập nhật trạng thái thất bại.', 'error');
    } finally {
      setBusyUid(null);
    }
  };

  const handlePilotGroupChange = async (user: User, nextPilotGroup: PilotGroup) => {
    const targetUid = user.uid || user.id;
    setBusyUid(targetUid);
    try {
      await updateUserAccountByAdmin(targetUid, adminUid, { pilot_group: nextPilotGroup });
      setUsersList((prev) =>
        prev.map((item) =>
          (item.uid || item.id) === targetUid ? { ...item, pilot_group: nextPilotGroup } : item
        )
      );
      showStatus(
        `Đã gắn nhóm "${PILOT_GROUP_META[nextPilotGroup].label}" cho ${user.name}`
      );
    } catch (err) {
      showStatus(
        err instanceof Error ? err.message : 'Không thể cập nhật nhóm thử nghiệm.',
        'error'
      );
    } finally {
      setBusyUid(null);
    }
  };

  const handleModerateCityExam = async (
    exam: Exam,
    decision: 'approve' | 'reject',
    note?: string
  ) => {
    setModeratingExamId(exam.id);
    try {
      await reviewExamCityShareByAdmin(exam.id, adminUid, decision, note);
      const nextStatus = decision === 'approve' ? 'city_public' : 'private';
      setCloudAudit((prev) => ({
        ...prev,
        allExams: prev.allExams.map((ex) =>
          ex.id === exam.id
            ? {
                ...ex,
                share_status: nextStatus,
                cityApprovedBy: decision === 'approve' ? adminUid : undefined,
                cityApprovedAt: decision === 'approve' ? new Date().toISOString() : undefined,
                cityReviewNote: note?.trim() || undefined,
              }
            : ex
        ),
      }));
      setPreviewModerationExam(null);
      setReviewNoteInput('');
      showStatus(
        decision === 'approve'
          ? `Đã phê duyệt công khai đề "${exam.title}" lên Kho đề Thành phố!`
          : `Đã từ chối / gỡ đề "${exam.title}" khỏi Kho đề Thành phố.`
      );
    } catch (err) {
      showStatus(
        err instanceof Error ? err.message : 'Không thể cập nhật trạng thái duyệt đề thi.',
        'error'
      );
    } finally {
      setModeratingExamId(null);
    }
  };

  const handleSaveEditedUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    const targetUid = editingUser.uid || editingUser.id;
    setBusyUid(targetUid);
    try {
      const nextApprovalStatus =
        editingUser.status === 'active'
          ? 'approved'
          : editingUser.status === 'pending'
          ? 'pending'
          : 'rejected';
      await updateUserAccountByAdmin(targetUid, adminUid, {
        name: editingUser.name,
        role: editingUser.role,
        status: editingUser.status,
        approval_status: nextApprovalStatus,
        pilot_group: editingUser.pilot_group,
        school: editingUser.school,
        department: editingUser.department,
        className: editingUser.className,
        phone: editingUser.phone,
      });
      setUsersList((prev) =>
        prev.map((u) =>
          (u.uid || u.id) === targetUid
            ? { ...editingUser, approval_status: nextApprovalStatus }
            : u
        )
      );
      setEditingUser(null);
      showStatus(`Đã lưu thông tin & phân quyền cho ${editingUser.email}`);
    } catch (err) {
      showStatus(err instanceof Error ? err.message : 'Không thể lưu chỉnh sửa tài khoản.', 'error');
    } finally {
      setBusyUid(null);
    }
  };

  const handleAssignLegacyData = async (source: 'local' | 'cloud') => {
    const targetTeacher = activeTeachers.find(
      (t) => (t.uid || t.id) === selectedTeacherUidForLegacy
    );
    if (!targetTeacher) {
      showStatus('Vui lòng chọn một Giáo viên đang hoạt động để gán dữ liệu.', 'error');
      return;
    }

    const payload =
      source === 'local'
        ? {
            targetTeacher,
            exams: localLegacy.exams,
            questions: localLegacy.questions,
            folders: localLegacy.folders,
            submissions: localLegacy.submissions,
          }
        : {
            targetTeacher,
            exams: cloudLegacyExams,
            questions: cloudLegacyQuestions,
            folders: cloudLegacyFolders,
            submissions: cloudLegacySubmissions,
          };

    const count =
      (payload.exams?.length || 0) +
      (payload.questions?.length || 0) +
      (payload.folders?.length || 0) +
      (payload.submissions?.length || 0);

    if (count === 0) {
      showStatus('Không có bản ghi legacy nào cần phân bổ trong mục này.', 'error');
      return;
    }

    if (
      !confirm(
        `Xác nhận chuyển ${count} mục dữ liệu chưa gắn chủ sở hữu (${source === 'local' ? 'Trình duyệt cũ' : 'Cloud'}) cho giáo viên "${targetTeacher.name}" (${targetTeacher.email})?`
      )
    ) {
      return;
    }

    setIsAssigningLegacy(true);
    try {
      const assigned = await assignLegacyRecordToTeacher(payload);
      if (source === 'local') {
        StorageService.clearLegacyLocalCache();
      }
      await loadAdminData();
      onDataResetOrRestored();
      showStatus(`Đã gán ${assigned} mục dữ liệu legacy cho giáo viên ${targetTeacher.name}!`);
    } catch (err) {
      showStatus(err instanceof Error ? err.message : 'Lỗi phân bổ dữ liệu legacy.', 'error');
    } finally {
      setIsAssigningLegacy(false);
    }
  };

  const handleBackup = () => {
    const snapshot = {
      version: '2.0',
      exportedAt: new Date().toISOString(),
      users: usersList,
      exams: cloudAudit.allExams.length > 0 ? cloudAudit.allExams : exams,
      questions: cloudAudit.allQuestions.length > 0 ? cloudAudit.allQuestions : questions,
      folders: cloudAudit.allFolders.length > 0 ? cloudAudit.allFolders : folders,
      submissions: cloudAudit.allSubmissions.length > 0 ? cloudAudit.allSubmissions : submissions,
    };
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${APP_CONFIG.APP_NAME}_ADMIN_BACKUP_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showStatus('Đã tải xuống bản sao lưu toàn hệ thống!');
  };

  const activeCount = usersList.filter((u) => u.status === 'active').length;
  const lockedCount = usersList.filter((u) => u.status === 'locked').length;
  const rejectedCount = usersList.filter((u) => u.status === 'rejected').length;
  const teacherCount = usersList.filter((u) => u.role === 'teacher').length;
  const studentCount = usersList.filter((u) => u.role === 'student').length;
  const pendingReviewExams = cloudAudit.allExams.filter(
    (ex) => ex.share_status === 'pending_review'
  );
  const cityPublicExams = cloudAudit.allExams.filter(
    (ex) => ex.share_status === 'city_public'
  );

  const statCards = [
    {
      id: 'pending',
      label: 'Chờ duyệt giáo viên',
      value: pendingCount,
      icon: Clock,
      iconBg: 'bg-amber-50 text-amber-600 ring-1 ring-amber-200/60',
    },
    {
      id: 'users',
      label: 'Tổng tài khoản Cloud',
      value: usersList.length,
      icon: Users,
      iconBg: 'bg-indigo-50 text-indigo-600 ring-1 ring-indigo-200/60',
    },
    {
      id: 'exams',
      label: 'Đề thi trên Cloud',
      value: cloudAudit.allExams.length,
      icon: FileCheck,
      iconBg: 'bg-sky-50 text-sky-600 ring-1 ring-sky-200/60',
    },
    {
      id: 'submissions',
      label: 'Bài nộp trên Cloud',
      value: cloudAudit.allSubmissions.length,
      icon: BookOpen,
      iconBg: 'bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200/60',
    },
  ];

  const filterTabs: { id: UserFilterTab; label: string }[] = [
    { id: 'all', label: `Tất cả (${usersList.length})` },
    { id: 'pending', label: `Chờ duyệt (${pendingCount})` },
    { id: 'active', label: `Đang hoạt động (${activeCount})` },
    { id: 'teacher', label: `Giáo viên (${teacherCount})` },
    { id: 'student', label: `Học sinh (${studentCount})` },
    ...(lockedCount > 0 ? [{ id: 'locked' as UserFilterTab, label: `Bị khóa (${lockedCount})` }] : []),
    ...(rejectedCount > 0 ? [{ id: 'rejected' as UserFilterTab, label: `Từ chối (${rejectedCount})` }] : []),
  ];

  return (
    <div className="space-y-6">
      {/* Toast Feedback */}
      {statusMsg && (
        <div
          role="status"
          className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl shadow-lg flex items-center gap-2.5 text-sm font-medium ${
            statusMsg.type === 'success' ? 'bg-slate-900 text-white' : 'bg-rose-700 text-white'
          }`}
        >
          {statusMsg.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-200 shrink-0" />
          )}
          <span>{statusMsg.text}</span>
        </div>
      )}

      {/* 1. Hero Welcome & Quick Actions Card */}
      <section className="bg-gradient-to-br from-slate-50 via-white to-emerald-50/40 rounded-2xl border border-slate-200/60 shadow-sm p-6 sm:p-7">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-5">
          <div className="space-y-1.5 min-w-0">
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
              <ShieldCheck className="w-4 h-4 shrink-0" />
              <span>Trung tâm Quản trị &amp; Phê duyệt Tài khoản</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Quản Trị Hệ Thống {APP_CONFIG.APP_NAME}
            </h1>
            <p className="text-sm text-slate-500 max-w-2xl leading-relaxed">
              Duyệt tài khoản Giáo viên mới, phân quyền, khóa/mở khóa người dùng và quản lý phân bổ dữ liệu hệ thống.
            </p>
          </div>

          {/* Unified Quick Actions */}
          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            {onNavigate && (
              <button
                type="button"
                onClick={() => onNavigate('exam_manager')}
                className="min-h-[40px] px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold shadow-sm inline-flex items-center gap-2 transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-1"
              >
                <FolderTree className="w-4 h-4 shrink-0" />
                <span>Quản lý Đề thi</span>
              </button>
            )}

            {onNavigate && (
              <button
                type="button"
                onClick={() => onNavigate('admin_curriculum')}
                className="min-h-[40px] px-3.5 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 shadow-2xs text-sm font-medium inline-flex items-center gap-2 transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/50"
              >
                <BookMarked className="w-4 h-4 text-slate-500 shrink-0" />
                <span>Danh mục SGK</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => void loadAdminData()}
              disabled={isLoadingUsers}
              className="min-h-[40px] px-3.5 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 shadow-2xs disabled:opacity-60 text-sm font-medium inline-flex items-center gap-2 transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/50"
            >
              <RefreshCw
                className={`w-4 h-4 text-slate-500 shrink-0 ${isLoadingUsers ? 'animate-spin' : ''}`}
              />
              <span>Làm mới dữ liệu</span>
            </button>

            <button
              type="button"
              onClick={handleBackup}
              className="min-h-[40px] px-3.5 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 shadow-2xs text-sm font-medium inline-flex items-center gap-2 transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/50"
            >
              <Download className="w-4 h-4 text-slate-500 shrink-0" />
              <span>Xuất Backup JSON</span>
            </button>
          </div>
        </div>
      </section>

      {/* 2. Four Responsive Stat Cards */}
      <section aria-label="Thống kê hệ thống" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.id}
              className="bg-white rounded-xl border border-slate-200/80 p-5 shadow-xs hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between gap-3">
                <div
                  className={`w-11 h-11 rounded-full flex items-center justify-center shrink-0 ${card.iconBg}`}
                >
                  <Icon className="w-5 h-5" />
                </div>
              </div>
              <div className="mt-4">
                <p className="text-2xl font-extrabold text-slate-900 tabular-nums tracking-tight">
                  {card.value}
                </p>
                <p className="text-sm font-medium text-slate-500 mt-1">
                  {card.label}
                </p>
              </div>
            </div>
          );
        })}
      </section>

      {/* Super Admin Sub-Navigation Tabs */}
      <nav
        aria-label="Phân hệ quản trị Super Admin"
        className="flex flex-wrap items-center gap-2 bg-white border border-slate-200 rounded-2xl p-2 shadow-2xs"
      >
        <button
          type="button"
          onClick={() => setAdminSection('teachers_schools')}
          className={`min-h-[42px] px-4 py-2 rounded-xl text-sm font-semibold inline-flex items-center gap-2 transition-colors ${
            adminSection === 'teachers_schools'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'text-slate-700 hover:bg-slate-100'
          }`}
        >
          <UserCheck className="w-4 h-4 shrink-0" />
          <span>Quản lý Giáo viên &amp; Trường học</span>
          {pendingCount > 0 && (
            <span className="px-2 py-0.5 rounded-md bg-amber-500 text-white text-xs font-bold tabular-nums">
              {pendingCount}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setAdminSection('exam_moderation')}
          className={`min-h-[42px] px-4 py-2 rounded-xl text-sm font-semibold inline-flex items-center gap-2 transition-colors ${
            adminSection === 'exam_moderation'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'text-slate-700 hover:bg-slate-100'
          }`}
        >
          <Globe className="w-4 h-4 shrink-0" />
          <span>Duyệt đề chia sẻ Kho TP</span>
          {pendingReviewExams.length > 0 && (
            <span className="px-2 py-0.5 rounded-md bg-indigo-600 text-white text-xs font-bold tabular-nums">
              {pendingReviewExams.length}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setAdminSection('evidence_stats')}
          className={`min-h-[42px] px-4 py-2 rounded-xl text-sm font-semibold inline-flex items-center gap-2 transition-colors ${
            adminSection === 'evidence_stats'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'text-slate-700 hover:bg-slate-100'
          }`}
        >
          <BarChart3 className="w-4 h-4 shrink-0" />
          <span>Thống kê hệ thống &amp; Xuất Excel</span>
        </button>
      </nav>

      {/* TAB 3: EVIDENCE STATISTICS DASHBOARD */}
      {adminSection === 'evidence_stats' && (
        <SystemEvidenceDashboard
          users={usersList}
          allExams={cloudAudit.allExams.length > 0 ? cloudAudit.allExams : exams}
          allQuestions={cloudAudit.allQuestions.length > 0 ? cloudAudit.allQuestions : questions}
          allSubmissions={
            cloudAudit.allSubmissions.length > 0 ? cloudAudit.allSubmissions : submissions
          }
        />
      )}

      {/* TAB 2: CITY SHARED EXAM MODERATION */}
      {adminSection === 'exam_moderation' && (
        <div className="space-y-6">
          <section className="bg-white border border-slate-200/80 rounded-2xl shadow-xs overflow-hidden">
            <div className="p-5 sm:p-6 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2">
                  <Clock className="w-5 h-5 text-amber-600 shrink-0" />
                  <span>Đề thi chờ phê duyệt lên Kho Thành phố ({pendingReviewExams.length})</span>
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Kiểm tra chất lượng chuyên môn trước khi xuất bản công khai cho toàn bộ giáo viên TP. Đà Nẵng nhân bản.
                </p>
              </div>
            </div>

            {pendingReviewExams.length === 0 ? (
              <div className="p-10 text-center text-sm text-slate-500">
                Hiện không có đề thi nào đang chờ duyệt chia sẻ lên Kho Thành phố.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {pendingReviewExams.map((ex) => {
                  const isBusy = moderatingExamId === ex.id;
                  return (
                    <div
                      key={ex.id}
                      className="p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 hover:bg-slate-50/70"
                    >
                      <div className="space-y-1.5 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="px-2 py-0.5 rounded bg-amber-50 border border-amber-200 text-amber-800 font-bold">
                            Chờ duyệt Kho TP
                          </span>
                          <span className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-800 font-semibold">
                            {GRADE_LABELS[ex.grade] || `Lớp ${ex.grade}`}
                          </span>
                          <span className="text-slate-500 tabular-nums">
                            {ex.questions.length} câu · {ex.durationMinutes} phút
                          </span>
                        </div>
                        <h3 className="text-base font-bold text-slate-900">{ex.title}</h3>
                        <p className="text-xs text-slate-600 flex flex-wrap items-center gap-x-3 gap-y-1">
                          <span className="inline-flex items-center gap-1 font-semibold text-slate-800">
                            <School className="w-3.5 h-3.5 text-indigo-600" />
                            {ex.authorSchool || 'Chưa rõ trường'}
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <Building2 className="w-3.5 h-3.5 text-slate-400" />
                            {ex.authorDepartment || 'Tổ Hóa học'}
                          </span>
                          <span>GV: {ex.authorName}</span>
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            setPreviewModerationExam(ex);
                            setReviewNoteInput('');
                          }}
                          className="px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold inline-flex items-center gap-1.5"
                        >
                          <Eye className="w-4 h-4 text-indigo-600" />
                          <span>Xem &amp; Duyệt chi tiết</span>
                        </button>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => void handleModerateCityExam(ex, 'approve')}
                          className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-xs font-bold inline-flex items-center gap-1.5"
                        >
                          <Check className="w-4 h-4" />
                          <span>Duyệt công khai</span>
                        </button>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() =>
                            void handleModerateCityExam(
                              ex,
                              'reject',
                              'Đề chưa đáp ứng tiêu chuẩn chia sẻ Kho Thành phố, vui lòng rà soát lại.'
                            )
                          }
                          className="px-3.5 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 disabled:opacity-60 text-rose-700 border border-rose-200 text-xs font-bold inline-flex items-center gap-1.5"
                        >
                          <XCircle className="w-4 h-4" />
                          <span>Từ chối</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Published City Exams Management */}
          <section className="bg-white border border-slate-200/80 rounded-2xl shadow-xs overflow-hidden">
            <div className="p-5 sm:p-6 border-b border-slate-100">
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Globe className="w-5 h-5 text-emerald-600 shrink-0" />
                <span>Đề đang công khai trong Kho Thành phố ({cityPublicExams.length})</span>
              </h2>
            </div>
            {cityPublicExams.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                Chưa có đề thi nào trong Kho đề Thành phố.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {cityPublicExams.map((ex) => (
                  <div
                    key={ex.id}
                    className="p-4 sm:px-6 flex flex-wrap items-center justify-between gap-3 hover:bg-slate-50/70"
                  >
                    <div className="space-y-0.5">
                      <p className="text-sm font-bold text-slate-900">{ex.title}</p>
                      <p className="text-xs text-slate-600">
                        {ex.authorName} · {ex.authorSchool || 'THPT Đà Nẵng'} ·{' '}
                        {GRADE_LABELS[ex.grade] || ex.grade} · {ex.questions.length} câu
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setPreviewModerationExam(ex);
                          setReviewNoteInput(ex.cityReviewNote || '');
                        }}
                        className="px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-semibold inline-flex items-center gap-1"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Xem đề</span>
                      </button>
                      <button
                        type="button"
                        disabled={moderatingExamId === ex.id}
                        onClick={() =>
                          void handleModerateCityExam(
                            ex,
                            'reject',
                            'Super Admin tạm gỡ khỏi Kho đề Thành phố.'
                          )
                        }
                        className="px-3 py-1.5 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-semibold"
                      >
                        Gỡ khỏi Kho TP
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {/* TAB 1: TEACHERS & SCHOOLS + LEGACY DATA */}
      {adminSection === 'teachers_schools' && (
      <>
      {/* 3. Filter Bar & Users Management Table */}
      <section className="bg-white border border-slate-200/80 rounded-2xl shadow-xs overflow-hidden">
        <div className="p-5 sm:p-6 border-b border-slate-100 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-2.5 min-w-0">
              <UserCheck className="w-5 h-5 text-emerald-600 shrink-0" />
              <h2 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
                Quản lý &amp; Phê duyệt tài khoản
              </h2>
              <span className="text-sm font-medium text-slate-400 tabular-nums">
                ({filteredUsers.length}/{usersList.length})
              </span>
            </div>

            {/* Search Input */}
            <div className="relative w-full md:w-80">
              <Search className="w-4 h-4 text-slate-400 pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Tìm theo tên, email, trường, lớp..."
                aria-label="Tìm kiếm tài khoản"
                className="w-full h-10 pl-10 pr-4 text-sm text-slate-800 placeholder:text-slate-400 rounded-xl border border-slate-200 bg-slate-50/70 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/25 focus:border-emerald-500 transition-colors"
              />
            </div>
          </div>

          {/* Interactive Filter Tabs */}
          <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Lọc tài khoản theo trạng thái và vai trò">
            {filterTabs.map((tab) => {
              const isActive = filterTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setFilterTab(tab.id)}
                  className={`rounded-lg text-sm px-3.5 py-1.5 font-medium transition-colors tabular-nums whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/50 ${
                    isActive
                      ? 'bg-slate-900 text-white shadow-2xs'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50/80 text-slate-500 text-xs font-semibold border-b border-slate-200/80">
              <tr>
                <th className="py-3.5 px-5">Người dùng</th>
                <th className="py-3.5 px-5">Email</th>
                <th className="py-3.5 px-5">Vai trò</th>
                <th className="py-3.5 px-5">Trường / Tổ CM / Lớp</th>
                <th className="py-3.5 px-5">Nhóm thử nghiệm</th>
                <th className="py-3.5 px-5 text-center">Trạng thái</th>
                <th className="py-3.5 px-5 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoadingUsers ? (
                Array.from({ length: 4 }).map((_, idx) => (
                  <tr key={idx} className="animate-pulse">
                    <td className="py-4 px-5">
                      <div className="h-4 w-36 bg-slate-200/80 rounded" />
                    </td>
                    <td className="py-4 px-5">
                      <div className="h-4 w-44 bg-slate-100 rounded" />
                    </td>
                    <td className="py-4 px-5">
                      <div className="h-4 w-20 bg-slate-100 rounded" />
                    </td>
                    <td className="py-4 px-5">
                      <div className="h-4 w-32 bg-slate-100 rounded" />
                    </td>
                    <td className="py-4 px-5">
                      <div className="h-4 w-28 bg-slate-100 rounded" />
                    </td>
                    <td className="py-4 px-5">
                      <div className="h-4 w-20 bg-slate-100 rounded mx-auto" />
                    </td>
                    <td className="py-4 px-5">
                      <div className="h-7 w-20 bg-slate-100 rounded ml-auto" />
                    </td>
                  </tr>
                ))
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 px-5 text-center">
                    <p className="text-sm font-medium text-slate-600">
                      Không tìm thấy tài khoản nào phù hợp với bộ lọc hiện tại.
                    </p>
                    {(searchTerm.trim() !== '' || filterTab !== 'all') && (
                      <button
                        type="button"
                        onClick={() => {
                          setSearchTerm('');
                          setFilterTab('all');
                        }}
                        className="mt-3 px-3.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-colors"
                      >
                        Đặt lại bộ lọc
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                filteredUsers.map((u) => {
                  const uid = u.uid || u.id;
                  const isSelf = uid === adminUid;
                  const isBusy = busyUid === uid;
                  const currentPilotGroup = resolvePilotGroup(u);
                  return (
                    <tr key={uid} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3.5 px-5">
                        <p className="font-semibold text-slate-900">{u.name}</p>
                        {u.phone && (
                          <p className="text-xs text-slate-500 tabular-nums mt-0.5">{u.phone}</p>
                        )}
                      </td>
                      <td className="py-3.5 px-5 font-mono text-xs text-slate-600">{u.email}</td>
                      <td className="py-3.5 px-5">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-semibold ${
                            u.role === 'admin'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/70'
                              : u.role === 'teacher'
                              ? 'bg-sky-50 text-sky-700 border border-sky-200/70'
                              : 'bg-slate-100 text-slate-700 border border-slate-200/70'
                          }`}
                        >
                          {u.role === 'admin' ? 'Admin' : u.role === 'teacher' ? 'Giáo viên' : 'Học sinh'}
                        </span>
                      </td>
                      <td className="py-3.5 px-5 text-slate-700">
                        <p className="font-medium text-xs text-slate-800">
                          {u.school || u.className || '—'}
                        </p>
                        {u.role !== 'student' && u.department && (
                          <p className="text-[11px] text-slate-500 mt-0.5">{u.department}</p>
                        )}
                      </td>
                      <td className="py-3.5 px-5">
                        {u.role === 'teacher' || u.role === 'admin' ? (
                          <select
                            aria-label={`Nhóm thử nghiệm của ${u.name}`}
                            disabled={isBusy}
                            value={currentPilotGroup}
                            onChange={(e) =>
                              void handlePilotGroupChange(u, e.target.value as PilotGroup)
                            }
                            className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                          >
                            <option value="host_school">Trường chủ trì</option>
                            <option value="expanded_pilot">Thử nghiệm mở rộng</option>
                            <option value="standard">Đại trà</option>
                          </select>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                      <td className="py-3.5 px-5 text-center">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-semibold ${
                            u.status === 'active'
                              ? 'bg-emerald-50 text-emerald-700'
                              : u.status === 'pending'
                              ? 'bg-amber-50 text-amber-700'
                              : u.status === 'locked'
                              ? 'bg-rose-50 text-rose-700'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {u.status === 'active'
                            ? 'Hoạt động'
                            : u.status === 'pending'
                            ? 'Chờ duyệt'
                            : u.status === 'locked'
                            ? 'Đã khóa'
                            : 'Từ chối'}
                        </span>
                      </td>
                      <td className="py-3.5 px-5 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          {u.status === 'pending' && (
                            <>
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => void handleStatusChange(u, 'active')}
                                className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-semibold inline-flex items-center gap-1 transition-colors whitespace-nowrap"
                              >
                                <Check className="w-3.5 h-3.5" />
                                <span>Duyệt</span>
                              </button>
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => void handleStatusChange(u, 'rejected')}
                                className="px-2.5 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 disabled:opacity-50 text-rose-700 border border-rose-200 text-xs font-semibold inline-flex items-center gap-1 transition-colors whitespace-nowrap"
                              >
                                <XCircle className="w-3.5 h-3.5" />
                                <span>Từ chối</span>
                              </button>
                            </>
                          )}

                          {u.status === 'active' && !isSelf && (
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => void handleStatusChange(u, 'locked')}
                              className="px-2.5 py-1.5 rounded-lg border border-amber-200 bg-amber-50 hover:bg-amber-100 disabled:opacity-50 text-amber-800 text-xs font-semibold inline-flex items-center gap-1 transition-colors whitespace-nowrap"
                            >
                              <Lock className="w-3.5 h-3.5" />
                              <span>Khóa</span>
                            </button>
                          )}

                          {(u.status === 'locked' || u.status === 'rejected') && (
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => void handleStatusChange(u, 'active')}
                              className="px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-semibold inline-flex items-center gap-1 transition-colors whitespace-nowrap"
                            >
                              <Unlock className="w-3.5 h-3.5" />
                              <span>Mở khóa</span>
                            </button>
                          )}

                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => setEditingUser({ ...u })}
                            className="p-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-50 text-slate-600 transition-colors"
                            title="Sửa thông tin & phân quyền"
                            aria-label={`Chỉnh sửa tài khoản ${u.name}`}
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* 4. Legacy Unowned Data Audit & Manual Teacher Allocation */}
      <section className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-xs space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Database className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Kiểm tra &amp; Phân bổ Dữ liệu Legacy</span>
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              Dữ liệu chưa gắn chủ sở hữu được tách biệt an toàn. Admin có thể kiểm tra và phân bổ đích danh cho một Giáo viên đang hoạt động.
            </p>
          </div>

          <div className="shrink-0">
            <select
              value={selectedTeacherUidForLegacy}
              onChange={(e) => setSelectedTeacherUidForLegacy(e.target.value)}
              aria-label="Chọn giáo viên nhận dữ liệu"
              className="w-full md:w-auto h-10 px-3.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-700 bg-slate-50/80 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/25 focus:border-emerald-500"
            >
              <option value="">-- Chọn Giáo viên nhận dữ liệu --</option>
              {activeTeachers.map((t) => (
                <option key={t.uid || t.id} value={t.uid || t.id}>
                  {t.name} ({t.email})
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div className="p-4 rounded-xl bg-slate-50/80 border border-slate-200/80 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-slate-900">1. Dữ liệu Legacy trên trình duyệt này</span>
              <FolderTree className="w-4 h-4 text-slate-500 shrink-0" />
            </div>
            <p className="text-xs sm:text-sm text-slate-600 tabular-nums">
              Đề thi: <strong className="text-slate-900">{localLegacy.exams.length}</strong> · Câu hỏi:{' '}
              <strong className="text-slate-900">{localLegacy.questions.length}</strong> · Thư mục:{' '}
              <strong className="text-slate-900">{localLegacy.folders.length}</strong> · Bài nộp:{' '}
              <strong className="text-slate-900">{localLegacy.submissions.length}</strong>
            </p>
            <button
              type="button"
              disabled={isAssigningLegacy || !selectedTeacherUidForLegacy}
              onClick={() => void handleAssignLegacyData('local')}
              className="px-3.5 py-2 rounded-xl bg-white hover:bg-slate-100 border border-slate-200 disabled:opacity-50 text-slate-800 text-xs font-semibold shadow-2xs transition-colors"
            >
              Gán dữ liệu trình duyệt cho Giáo viên đã chọn
            </button>
          </div>

          <div className="p-4 rounded-xl bg-slate-50/80 border border-slate-200/80 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-slate-900">2. Dữ liệu Cloud chưa gắn Teacher UID hợp lệ</span>
              <Database className="w-4 h-4 text-slate-500 shrink-0" />
            </div>
            <p className="text-xs sm:text-sm text-slate-600 tabular-nums">
              Đề thi: <strong className="text-slate-900">{cloudLegacyExams.length}</strong> · Câu hỏi:{' '}
              <strong className="text-slate-900">{cloudLegacyQuestions.length}</strong> · Thư mục:{' '}
              <strong className="text-slate-900">{cloudLegacyFolders.length}</strong> · Bài nộp:{' '}
              <strong className="text-slate-900">{cloudLegacySubmissions.length}</strong>
            </p>
            <button
              type="button"
              disabled={isAssigningLegacy || !selectedTeacherUidForLegacy}
              onClick={() => void handleAssignLegacyData('cloud')}
              className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-semibold shadow-2xs transition-colors"
            >
              Phân bổ dữ liệu Cloud cho Giáo viên đã chọn
            </button>
          </div>
        </div>
      </section>
      </>
      )}

      {/* Moderation Exam Preview Modal */}
      {previewModerationExam && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden">
            <div className="px-6 py-4 bg-slate-900 text-white flex items-start justify-between gap-4 shrink-0">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-amber-400">
                  KIỂM DUYỆT ĐỀ THI CHIA SẺ KHO THÀNH PHỐ
                </span>
                <h3 className="text-base font-extrabold mt-0.5">
                  {previewModerationExam.title}
                </h3>
                <p className="text-xs text-slate-300 mt-0.5">
                  GV: {previewModerationExam.authorName} ·{' '}
                  {previewModerationExam.authorDepartment || 'Tổ Hóa học'} ·{' '}
                  {previewModerationExam.authorSchool || 'THPT Đà Nẵng'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPreviewModerationExam(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-3 bg-slate-50">
              {previewModerationExam.questions.map((q, idx) => (
                <div
                  key={q.id || idx}
                  className="bg-white rounded-xl border border-slate-200 p-4 space-y-2 text-xs"
                >
                  <div className="flex items-center gap-2 font-bold text-slate-700">
                    <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-900">
                      Câu {idx + 1}
                    </span>
                    <span className="text-indigo-700">
                      {QUESTION_TYPE_SHORT_LABELS[q.type]}
                    </span>
                  </div>
                  <div className="text-slate-900 font-medium leading-relaxed">
                    <ChemRenderer text={q.content} />
                  </div>
                  {q.type === 'part1_single_choice' && q.options && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                      {q.options.map((o) => (
                        <div
                          key={o.id}
                          className={`px-2.5 py-1.5 rounded-lg border ${
                            o.id === q.correctOptionId
                              ? 'bg-emerald-50 border-emerald-300 font-semibold text-emerald-900'
                              : 'bg-slate-50 border-slate-200 text-slate-700'
                          }`}
                        >
                          <strong>{o.id}.</strong> <ChemRenderer text={o.text} inline />
                        </div>
                      ))}
                    </div>
                  )}
                  {q.type === 'part2_true_false' && q.statements && (
                    <div className="space-y-1">
                      {q.statements.map((st) => (
                        <div
                          key={st.id}
                          className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-200"
                        >
                          <span>
                            <strong>{st.id})</strong> <ChemRenderer text={st.statement} inline />
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold shrink-0 ${
                              st.correctAnswer
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-rose-100 text-rose-800'
                            }`}
                          >
                            {st.correctAnswer ? 'Đúng' : 'Sai'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  {q.type === 'part3_short_answer' && (
                    <div className="text-[11px] font-semibold text-indigo-800 bg-indigo-50 px-2.5 py-1.5 rounded-lg inline-block">
                      Đáp án: {q.shortAnswerConfig?.acceptableAnswers?.join(' / ') || '—'}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="px-6 py-4 bg-white border-t border-slate-200 space-y-3 shrink-0">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Ghi chú kiểm duyệt gửi lại giáo viên (tùy chọn)
                </label>
                <input
                  type="text"
                  value={reviewNoteInput}
                  onChange={(e) => setReviewNoteInput(e.target.value)}
                  placeholder="VD: Đề chuẩn ma trận GDPT 2018, đã kiểm tra đáp án..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                />
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setPreviewModerationExam(null)}
                  className="px-4 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold"
                >
                  Đóng
                </button>
                <button
                  type="button"
                  disabled={moderatingExamId === previewModerationExam.id}
                  onClick={() =>
                    void handleModerateCityExam(previewModerationExam, 'reject', reviewNoteInput)
                  }
                  className="px-4 py-2 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold inline-flex items-center gap-1.5"
                >
                  <XCircle className="w-4 h-4" />
                  <span>Từ chối / Gỡ công khai</span>
                </button>
                <button
                  type="button"
                  disabled={moderatingExamId === previewModerationExam.id}
                  onClick={() =>
                    void handleModerateCityExam(previewModerationExam, 'approve', reviewNoteInput)
                  }
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold inline-flex items-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  <span>Phê duyệt lên Kho Thành phố</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {editingUser && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl border border-slate-200 space-y-4">
            <div>
              <h3 className="text-base font-bold text-slate-900">Chỉnh sửa tài khoản</h3>
              <p className="text-xs font-mono text-slate-500 mt-0.5">{editingUser.email}</p>
            </div>
            <form onSubmit={handleSaveEditedUser} className="space-y-3.5 text-sm">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Họ và tên</label>
                <input
                  type="text"
                  required
                  value={editingUser.name}
                  onChange={(e) => setEditingUser({ ...editingUser, name: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/25 focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Vai trò</label>
                  <select
                    value={editingUser.role}
                    disabled={(editingUser.uid || editingUser.id) === adminUid}
                    onChange={(e) => setEditingUser({ ...editingUser, role: e.target.value as UserRole })}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/25 focus:border-emerald-500"
                  >
                    <option value="teacher">Giáo viên</option>
                    <option value="student">Học sinh</option>
                    <option value="admin">Quản trị viên</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Trạng thái</label>
                  <select
                    value={editingUser.status || 'active'}
                    disabled={(editingUser.uid || editingUser.id) === adminUid}
                    onChange={(e) =>
                      setEditingUser({ ...editingUser, status: e.target.value as AccountStatus })
                    }
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/25 focus:border-emerald-500"
                  >
                    <option value="active">Hoạt động (Đã duyệt)</option>
                    <option value="pending">Chờ duyệt</option>
                    <option value="locked">Khóa</option>
                    <option value="rejected">Từ chối</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {editingUser.role === 'student' ? 'Lớp học' : 'Trường THPT công tác'}
                </label>
                <input
                  type="text"
                  list={editingUser.role === 'student' ? undefined : 'admin-edit-schools-list'}
                  value={editingUser.role === 'student' ? editingUser.className || '' : editingUser.school || ''}
                  onChange={(e) =>
                    setEditingUser(
                      editingUser.role === 'student'
                        ? { ...editingUser, className: e.target.value }
                        : { ...editingUser, school: e.target.value }
                    )
                  }
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/25 focus:border-emerald-500"
                />
                <datalist id="admin-edit-schools-list">
                  {DANANG_HIGH_SCHOOLS.map((s) => (
                    <option key={s} value={s} />
                  ))}
                </datalist>
              </div>

              {editingUser.role !== 'student' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Tổ chuyên môn
                    </label>
                    <input
                      type="text"
                      list="admin-edit-depts-list"
                      value={editingUser.department || ''}
                      onChange={(e) =>
                        setEditingUser({ ...editingUser, department: e.target.value })
                      }
                      placeholder="Tổ Hóa học"
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-xs font-medium"
                    />
                    <datalist id="admin-edit-depts-list">
                      {DEFAULT_TEACHER_DEPARTMENTS.map((d) => (
                        <option key={d} value={d} />
                      ))}
                    </datalist>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Nhóm thử nghiệm
                    </label>
                    <select
                      value={resolvePilotGroup(editingUser)}
                      onChange={(e) =>
                        setEditingUser({
                          ...editingUser,
                          pilot_group: e.target.value as PilotGroup,
                        })
                      }
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-xs font-medium"
                    >
                      <option value="host_school">Trường chủ trì</option>
                      <option value="expanded_pilot">Thử nghiệm mở rộng</option>
                      <option value="standard">Đại trà</option>
                    </select>
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 text-sm font-medium transition-colors"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={busyUid === (editingUser.uid || editingUser.id)}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-sm font-semibold shadow-xs transition-colors"
                >
                  Lưu cập nhật
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
