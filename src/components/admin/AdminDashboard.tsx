import React, { useState, useEffect, useCallback } from 'react';
import { User, UserRole, AccountStatus, Question, Exam, StudentSubmission, Folder } from '../../types';
import {
  ShieldCheck,
  Users,
  Download,
  RefreshCw,
  CheckCircle2,
  FileCheck,
  BookOpen,
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
} from 'lucide-react';
import { StorageService } from '../../services/storage';
import { APP_CONFIG } from '../../constants/brand';
import {
  fetchAllUsersForAdmin,
  updateUserAccountByAdmin,
  fetchCloudAuditDataForAdmin,
  assignLegacyRecordToTeacher,
} from '../../services/workspaceService';

interface AdminDashboardProps {
  currentUser: User;
  questions: Question[];
  exams: Exam[];
  submissions: StudentSubmission[];
  folders: Folder[];
  onDataResetOrRestored: () => void;
}

type UserFilterTab = 'all' | 'pending' | 'active' | 'locked' | 'rejected' | 'teacher' | 'student';

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  currentUser,
  questions,
  exams,
  submissions,
  folders,
  onDataResetOrRestored,
}) => {
  const [usersList, setUsersList] = useState<User[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(true);
  const [filterTab, setFilterTab] = useState<UserFilterTab>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [busyUid, setBusyUid] = useState<string | null>(null);

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

    setBusyUid(targetUid);
    try {
      await updateUserAccountByAdmin(targetUid, adminUid, { status: nextStatus });
      setUsersList((prev) =>
        prev.map((item) =>
          (item.uid || item.id) === targetUid ? { ...item, status: nextStatus } : item
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

  const handleSaveEditedUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    const targetUid = editingUser.uid || editingUser.id;
    setBusyUid(targetUid);
    try {
      await updateUserAccountByAdmin(targetUid, adminUid, {
        name: editingUser.name,
        role: editingUser.role,
        status: editingUser.status,
        school: editingUser.school,
        className: editingUser.className,
        phone: editingUser.phone,
      });
      setUsersList((prev) =>
        prev.map((u) => ((u.uid || u.id) === targetUid ? editingUser : u))
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

  return (
    <div className="space-y-6">
      {statusMsg && (
        <div
          className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl shadow-xl flex items-center gap-2 text-xs font-semibold ${
            statusMsg.type === 'success' ? 'bg-slate-900 text-white' : 'bg-rose-700 text-white'
          }`}
        >
          {statusMsg.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-200" />
          )}
          <span>{statusMsg.text}</span>
        </div>
      )}

      {/* Top Banner */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-purple-600 font-bold text-xs uppercase tracking-wider">
            <ShieldCheck className="w-4 h-4" />
            <span>Trung Tâm Quản Trị &amp; Phê Duyệt Tài Khoản (Super Admin)</span>
          </div>
          <h1 className="text-xl md:text-2xl font-extrabold text-slate-900 mt-1">
            Quản Trị Hệ Thống {APP_CONFIG.APP_NAME}
          </h1>
          <p className="text-xs md:text-sm text-slate-500 mt-1">
            Duyệt tài khoản Giáo viên mới, phân quyền, khóa/mở khóa người dùng và quản lý phân bổ dữ liệu hệ thống.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => void loadAdminData()}
            disabled={isLoadingUsers}
            className="px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold flex items-center gap-1.5"
          >
            <RefreshCw className={`w-4 h-4 text-blue-600 ${isLoadingUsers ? 'animate-spin' : ''}`} />
            <span>Làm mới</span>
          </button>

          <button
            type="button"
            onClick={handleBackup}
            className="px-3.5 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold shadow-xs flex items-center gap-1.5"
          >
            <Download className="w-4 h-4" />
            <span>Xuất Backup JSON</span>
          </button>
        </div>
      </div>

      {/* Resource Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-slate-500 font-medium">Chờ duyệt giáo viên</p>
            <p className="text-xl font-bold text-slate-900">{pendingCount} tài khoản</p>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center font-bold">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-slate-500 font-medium">Tổng tài khoản Cloud</p>
            <p className="text-xl font-bold text-slate-900">{usersList.length} tài khoản</p>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
            <FileCheck className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-slate-500 font-medium">Đề thi trên Cloud</p>
            <p className="text-xl font-bold text-slate-900">{cloudAudit.allExams.length} đề</p>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
            <BookOpen className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-slate-500 font-medium">Bài nộp trên Cloud</p>
            <p className="text-xl font-bold text-slate-900">{cloudAudit.allSubmissions.length} bài</p>
          </div>
        </div>
      </div>

      {/* Users Management Table */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
        <div className="p-5 border-b border-slate-100 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-purple-600" />
              <span>Quản lý &amp; Phê duyệt tài khoản ({filteredUsers.length}/{usersList.length})</span>
            </h2>

            <div className="relative w-full md:w-72">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Tìm theo tên, email, trường, lớp..."
                className="w-full pl-8 pr-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5 text-xs">
            {[
              { id: 'all', label: `Tất cả (${usersList.length})` },
              { id: 'pending', label: `Chờ duyệt (${pendingCount})` },
              { id: 'active', label: `Đang hoạt động (${usersList.filter((u) => u.status === 'active').length})` },
              { id: 'locked', label: `Bị khóa (${usersList.filter((u) => u.status === 'locked').length})` },
              { id: 'rejected', label: `Từ chối (${usersList.filter((u) => u.status === 'rejected').length})` },
              { id: 'teacher', label: `Giáo viên (${usersList.filter((u) => u.role === 'teacher').length})` },
              { id: 'student', label: `Học sinh (${usersList.filter((u) => u.role === 'student').length})` },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilterTab(tab.id as UserFilterTab)}
                className={`px-3 py-1.5 rounded-xl font-bold transition-colors ${
                  filterTab === tab.id
                    ? 'bg-purple-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 uppercase text-[10px] font-bold border-b border-slate-200">
              <tr>
                <th className="py-3 px-4">Người dùng</th>
                <th className="py-3 px-4">Email</th>
                <th className="py-3 px-4">Vai trò</th>
                <th className="py-3 px-4">Đơn vị / Lớp</th>
                <th className="py-3 px-4 text-center">Trạng thái</th>
                <th className="py-3 px-4 text-right">Thao tác quản trị</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoadingUsers ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">
                    Đang tải danh sách tài khoản từ Firestore...
                  </td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400 italic">
                    Không có tài khoản nào phù hợp bộ lọc.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((u) => {
                  const uid = u.uid || u.id;
                  const isSelf = uid === adminUid;
                  const isBusy = busyUid === uid;
                  return (
                    <tr key={uid} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3 px-4">
                        <p className="font-bold text-slate-900">{u.name}</p>
                        {u.phone && <p className="text-[11px] text-slate-500">{u.phone}</p>}
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-700">{u.email}</td>
                      <td className="py-3 px-4">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                            u.role === 'admin'
                              ? 'bg-purple-100 text-purple-800'
                              : u.role === 'teacher'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-emerald-100 text-emerald-800'
                          }`}
                        >
                          {u.role === 'admin' ? 'Admin' : u.role === 'teacher' ? 'Giáo viên' : 'Học sinh'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-600">{u.school || u.className || '—'}</td>
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                            u.status === 'active'
                              ? 'bg-emerald-100 text-emerald-800'
                              : u.status === 'pending'
                              ? 'bg-amber-100 text-amber-800'
                              : u.status === 'locked'
                              ? 'bg-rose-100 text-rose-800'
                              : 'bg-slate-200 text-slate-700'
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
                      <td className="py-3 px-4 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          {u.status === 'pending' && (
                            <>
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => void handleStatusChange(u, 'active')}
                                className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold flex items-center gap-1"
                              >
                                <Check className="w-3.5 h-3.5" />
                                <span>Duyệt</span>
                              </button>
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => void handleStatusChange(u, 'rejected')}
                                className="px-2.5 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-[11px] font-bold flex items-center gap-1"
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
                              className="px-2.5 py-1 rounded-lg border border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-800 text-[11px] font-bold flex items-center gap-1"
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
                              className="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-bold flex items-center gap-1"
                            >
                              <Unlock className="w-3.5 h-3.5" />
                              <span>Mở khóa</span>
                            </button>
                          )}

                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => setEditingUser({ ...u })}
                            className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-600"
                            title="Sửa thông tin & phân quyền"
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
      </div>

      {/* Legacy Unowned Data Audit & Manual Teacher Allocation */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Database className="w-4 h-4 text-blue-600" />
              <span>Kiểm tra &amp; Phân bổ Dữ liệu Legacy (Chưa gắn chủ sở hữu)</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Dữ liệu cũ tạo trước khi nâng cấp tài khoản không bao giờ bị gán bừa. Admin có thể kiểm tra và phân bổ đích danh cho một Giáo viên đã duyệt.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={selectedTeacherUidForLegacy}
              onChange={(e) => setSelectedTeacherUidForLegacy(e.target.value)}
              className="px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold bg-slate-50"
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

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-900">1. Dữ liệu Legacy trên trình duyệt này</span>
              <FolderTree className="w-4 h-4 text-blue-600" />
            </div>
            <p className="text-slate-600">
              Đề thi: <strong>{localLegacy.exams.length}</strong> • Câu hỏi: <strong>{localLegacy.questions.length}</strong> • Thư mục: <strong>{localLegacy.folders.length}</strong> • Bài nộp: <strong>{localLegacy.submissions.length}</strong>
            </p>
            <button
              type="button"
              disabled={isAssigningLegacy || !selectedTeacherUidForLegacy}
              onClick={() => void handleAssignLegacyData('local')}
              className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold"
            >
              Gán dữ liệu trình duyệt cho Giáo viên đã chọn
            </button>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-900">2. Dữ liệu Cloud chưa gắn Teacher UID hợp lệ</span>
              <Database className="w-4 h-4 text-indigo-600" />
            </div>
            <p className="text-slate-600">
              Đề thi: <strong>{cloudLegacyExams.length}</strong> • Câu hỏi: <strong>{cloudLegacyQuestions.length}</strong> • Thư mục: <strong>{cloudLegacyFolders.length}</strong> • Bài nộp: <strong>{cloudLegacySubmissions.length}</strong>
            </p>
            <button
              type="button"
              disabled={isAssigningLegacy || !selectedTeacherUidForLegacy}
              onClick={() => void handleAssignLegacyData('cloud')}
              className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold"
            >
              Phân bổ dữ liệu Cloud cho Giáo viên đã chọn
            </button>
          </div>
        </div>
      </div>

      {/* Edit User Modal */}
      {editingUser && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl border border-slate-200 space-y-4">
            <h3 className="text-base font-bold text-slate-900">Chỉnh sửa tài khoản ({editingUser.email})</h3>
            <form onSubmit={handleSaveEditedUser} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Họ và tên</label>
                <input
                  type="text"
                  required
                  value={editingUser.name}
                  onChange={(e) => setEditingUser({ ...editingUser, name: e.target.value })}
                  className="w-full p-2.5 rounded-xl border border-slate-200 font-semibold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Vai trò</label>
                  <select
                    value={editingUser.role}
                    disabled={(editingUser.uid || editingUser.id) === adminUid}
                    onChange={(e) => setEditingUser({ ...editingUser, role: e.target.value as UserRole })}
                    className="w-full p-2.5 rounded-xl border border-slate-200 bg-white font-semibold"
                  >
                    <option value="teacher">Giáo viên</option>
                    <option value="student">Học sinh</option>
                    <option value="admin">Quản trị viên</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Trạng thái</label>
                  <select
                    value={editingUser.status || 'active'}
                    disabled={(editingUser.uid || editingUser.id) === adminUid}
                    onChange={(e) =>
                      setEditingUser({ ...editingUser, status: e.target.value as AccountStatus })
                    }
                    className="w-full p-2.5 rounded-xl border border-slate-200 bg-white font-semibold"
                  >
                    <option value="active">Hoạt động</option>
                    <option value="pending">Chờ duyệt</option>
                    <option value="locked">Khóa</option>
                    <option value="rejected">Từ chối</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Trường / Lớp</label>
                <input
                  type="text"
                  value={editingUser.role === 'student' ? editingUser.className || '' : editingUser.school || ''}
                  onChange={(e) =>
                    setEditingUser(
                      editingUser.role === 'student'
                        ? { ...editingUser, className: e.target.value }
                        : { ...editingUser, school: e.target.value }
                    )
                  }
                  className="w-full p-2.5 rounded-xl border border-slate-200"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="px-4 py-2 rounded-xl text-slate-600 font-semibold"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={busyUid === (editingUser.uid || editingUser.id)}
                  className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold"
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
