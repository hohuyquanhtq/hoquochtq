import React, { useState } from 'react';
import { User, Question, Exam, StudentSubmission, Folder } from '../../types';
import { 
  ShieldCheck, 
  Users, 
  Database, 
  Download, 
  Upload, 
  RefreshCw, 
  CheckCircle2, 
  AlertTriangle,
  FileCheck,
  BookOpen,
  FolderTree,
  Sliders,
  School
} from 'lucide-react';
import { StorageService, DEFAULT_USERS } from '../../services/storage';

interface AdminDashboardProps {
  questions: Question[];
  exams: Exam[];
  submissions: StudentSubmission[];
  folders: Folder[];
  onDataResetOrRestored: () => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  questions,
  exams,
  submissions,
  folders,
  onDataResetOrRestored,
}) => {
  const [usersList, setUsersList] = useState<User[]>(DEFAULT_USERS);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const showStatus = (msg: string) => {
    setStatusMsg(msg);
    setTimeout(() => setStatusMsg(null), 3000);
  };

  // Export full JSON database
  const handleBackup = () => {
    const jsonStr = StorageService.exportDatabaseJson();
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `CHEMTEST_BACKUP_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showStatus('Đã tải xuống file sao lưu hệ thống thành công!');
  };

  // Restore JSON database
  const handleRestoreFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      const success = StorageService.restoreDatabaseJson(content);
      if (success) {
        onDataResetOrRestored();
        showStatus('Đã khôi phục toàn bộ cơ sở dữ liệu thành công!');
      } else {
        alert('File sao lưu không hợp lệ. Vui lòng kiểm tra lại định dạng JSON!');
      }
    };
    reader.readAsText(file);
  };

  // Reset to default sample dataset
  const handleReset = () => {
    if (confirm('Khôi phục toàn bộ hệ thống về dữ liệu mẫu ban đầu? Tất cả câu hỏi và đề thi mới tạo sẽ được đặt lại.')) {
      StorageService.resetToDefaults();
      onDataResetOrRestored();
      showStatus('Đã thiết lập lại dữ liệu mẫu Hóa học ban đầu!');
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Toast Notification */}
      {statusMsg && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white px-4 py-2.5 rounded-xl shadow-xl flex items-center gap-2 text-xs font-semibold animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{statusMsg}</span>
        </div>
      )}

      {/* Top Banner */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-purple-600 font-bold text-xs uppercase tracking-wider">
            <ShieldCheck className="w-4 h-4" />
            <span>Phân quyền Quản trị viên (Super Admin)</span>
          </div>
          <h1 className="text-xl md:text-2xl font-extrabold text-slate-900 mt-1">
            Trung Tâm Quản Trị Hệ Thống CHEM TEST
          </h1>
          <p className="text-xs md:text-sm text-slate-500 mt-1">
            Quản lý tài khoản giáo viên, học sinh, sao lưu & khôi phục toàn bộ cơ sở dữ liệu.
          </p>
        </div>

        {/* Global DB Actions */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleBackup}
            className="px-3.5 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold shadow-xs transition-colors flex items-center gap-1.5"
          >
            <Download className="w-4 h-4" />
            <span>Sao lưu dữ liệu (Backup)</span>
          </button>
          
          <label className="cursor-pointer px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold transition-colors flex items-center gap-1.5">
            <Upload className="w-4 h-4 text-purple-600" />
            <span>Phục hồi (Restore)</span>
            <input type="file" accept=".json" onChange={handleRestoreFile} className="hidden" />
          </label>

          <button
            onClick={handleReset}
            className="px-3 py-2 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold transition-colors"
            title="Đặt lại toàn bộ về dữ liệu mẫu"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* System Resource Overview */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center font-bold">
            <BookOpen className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-slate-500 font-medium">Ngân hàng câu hỏi</p>
            <p className="text-xl font-bold text-slate-900">{questions.length} câu</p>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
            <FileCheck className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-slate-500 font-medium">Đề thi trong hệ thống</p>
            <p className="text-xl font-bold text-slate-900">{exams.length} đề</p>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
            <FolderTree className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-slate-500 font-medium">Cây thư mục</p>
            <p className="text-xl font-bold text-slate-900">{folders.length} thư mục</p>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-slate-500 font-medium">Lượt thí sinh thi</p>
            <p className="text-xl font-bold text-slate-900">{submissions.length} bài nộp</p>
          </div>
        </div>
      </div>

      {/* Users Management Table */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Users className="w-4 h-4 text-purple-600" />
            Quản lý tài khoản hệ thống ({usersList.length})
          </h2>
          <span className="text-xs text-slate-500">
            Phân quyền: Giáo viên, Học sinh, Quản trị viên
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 uppercase text-[10px] font-bold border-b border-slate-200">
              <tr>
                <th className="py-3 px-4">Tên người dùng</th>
                <th className="py-3 px-4">Email đăng nhập</th>
                <th className="py-3 px-4">Vai trò (Role)</th>
                <th className="py-3 px-4">Đơn vị / Lớp</th>
                <th className="py-3 px-4">Ngày tạo</th>
                <th className="py-3 px-4 text-center">Trạng thái</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {usersList.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50 transition-colors">
                  <td className="py-3 px-4 font-bold text-slate-900">{u.name}</td>
                  <td className="py-3 px-4 font-mono text-slate-600">{u.email}</td>
                  <td className="py-3 px-4">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                      u.role === 'admin'
                        ? 'bg-purple-100 text-purple-800'
                        : u.role === 'teacher'
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-emerald-100 text-emerald-800'
                    }`}>
                      {u.role === 'admin' ? 'Quản trị viên' : u.role === 'teacher' ? 'Giáo viên' : 'Học sinh'}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-slate-600">{u.school || u.className || 'Trường THPT'}</td>
                  <td className="py-3 px-4 text-slate-400">
                    {new Date(u.createdAt).toLocaleDateString('vi-VN')}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 text-[10px] font-bold rounded">
                      Đang hoạt động
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
};
