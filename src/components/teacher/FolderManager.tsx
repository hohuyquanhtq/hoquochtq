import React, { useState } from 'react';
import { Folder, Question, Exam } from '../../types';
import { 
  FolderTree, 
  FolderPlus, 
  Folder as FolderIcon, 
  Trash2, 
  Edit2, 
  FileText, 
  Search, 
  CheckCircle2,
  BookOpen,
  FileCheck
} from 'lucide-react';

interface FolderManagerProps {
  folders: Folder[];
  questions: Question[];
  exams: Exam[];
  onSaveFolders: (folders: Folder[]) => void;
  onNavigateToExam: (examId: string) => void;
}

export const FolderManager: React.FC<FolderManagerProps> = ({
  folders,
  questions,
  exams,
  onSaveFolders,
  onNavigateToExam,
}) => {
  const [selectedFolderId, setSelectedFolderId] = useState<string>(folders[0]?.id || '');
  const [searchTerm, setSearchTerm] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [editingFolder, setEditingFolder] = useState<Folder | null>(null);

  const selectedFolder = folders.find(f => f.id === selectedFolderId) || folders[0];

  const folderQuestions = questions.filter(q => q.folderId === selectedFolder?.id);
  const folderExams = exams.filter(e => e.folderId === selectedFolder?.id);

  const handleCreateFolder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    const newFolder: Folder = {
      id: `f_${Date.now()}`,
      name: newFolderName.trim(),
      authorId: 'teacher_1',
      createdAt: new Date().toISOString(),
      itemCount: 0,
      color: 'blue',
    };
    const updated = [...folders, newFolder];
    onSaveFolders(updated);
    setSelectedFolderId(newFolder.id);
    setNewFolderName('');
    setIsCreating(false);
  };

  const handleUpdateFolder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingFolder || !editingFolder.name.trim()) return;
    const updated = folders.map(f => f.id === editingFolder.id ? editingFolder : f);
    onSaveFolders(updated);
    setEditingFolder(null);
  };

  const handleDeleteFolder = (id: string) => {
    if (confirm('Bạn có chắc muốn xóa thư mục này? Các tài liệu bên trong sẽ được lưu về thư mục mặc định.')) {
      const updated = folders.filter(f => f.id !== id);
      onSaveFolders(updated);
      if (selectedFolderId === id) {
        setSelectedFolderId(updated[0]?.id || '');
      }
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Top Banner */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-blue-600 font-bold text-xs uppercase tracking-wider">
            <FolderTree className="w-4 h-4" />
            <span>Không gian lưu trữ & Tổ chức tài liệu</span>
          </div>
          <h1 className="text-xl md:text-2xl font-extrabold text-slate-900 mt-1">
            Quản Lý Thư Mục & Đề Thi Môn Hóa Học
          </h1>
          <p className="text-xs md:text-sm text-slate-500 mt-1">
            Tổ chức khoa học theo khối lớp chuyên, các kỳ thi HSG Thành phố/Quốc gia và kiểm tra định kỳ.
          </p>
        </div>

        <button
          onClick={() => setIsCreating(true)}
          className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-md shadow-blue-500/20 transition-all flex items-center gap-2 shrink-0"
        >
          <FolderPlus className="w-4 h-4" />
          <span>Tạo thư mục mới</span>
        </button>
      </div>

      {/* Main Folder View: 2 Columns */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        
        {/* Left Column: Folders List */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-600">
              Danh sách thư mục ({folders.length})
            </h2>
          </div>

          <div className="space-y-1.5">
            {folders.map(f => {
              const isActive = f.id === selectedFolderId;
              const qCount = questions.filter(q => q.folderId === f.id).length;
              const eCount = exams.filter(e => e.folderId === f.id).length;
              return (
                <div
                  key={f.id}
                  onClick={() => setSelectedFolderId(f.id)}
                  className={`group p-3 rounded-xl cursor-pointer flex items-center justify-between text-xs transition-all ${
                    isActive
                      ? 'bg-blue-50 text-blue-900 font-bold border border-blue-200 shadow-2xs'
                      : 'hover:bg-slate-50 text-slate-700 border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-2.5 truncate">
                    <FolderIcon className={`w-4 h-4 shrink-0 ${isActive ? 'text-blue-600' : 'text-slate-400 group-hover:text-blue-600'}`} />
                    <span className="truncate">{f.name}</span>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="px-1.5 py-0.5 rounded-md text-[10px] bg-slate-100 text-slate-500 font-medium">
                      {qCount + eCount} mục
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingFolder(f);
                      }}
                      className="p-1 opacity-0 group-hover:opacity-100 hover:text-blue-600 text-slate-400"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteFolder(f.id);
                      }}
                      className="p-1 opacity-0 group-hover:opacity-100 hover:text-rose-600 text-slate-400"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column: Folder Contents */}
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-6">
          <div className="flex items-center justify-between pb-4 border-b border-slate-100">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-blue-600">Nội dung thư mục</span>
              <h2 className="text-lg font-bold text-slate-900 mt-0.5 flex items-center gap-2">
                <FolderIcon className="w-5 h-5 text-blue-600" />
                {selectedFolder?.name}
              </h2>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span>{folderExams.length} đề thi</span>
              <span>•</span>
              <span>{folderQuestions.length} câu hỏi</span>
            </div>
          </div>

          {/* Exams inside this folder */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
              <FileCheck className="w-4 h-4 text-emerald-600" />
              Đề thi trong thư mục
            </h3>
            {folderExams.length === 0 ? (
              <p className="text-xs text-slate-400 italic p-4 bg-slate-50 rounded-xl">Chưa có đề thi nào trong thư mục này.</p>
            ) : (
              <div className="space-y-2">
                {folderExams.map(ex => (
                  <div
                    key={ex.id}
                    className="p-3.5 rounded-xl border border-slate-200 hover:border-blue-300 bg-white flex items-center justify-between gap-3 text-xs"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 bg-blue-100 text-blue-800 font-mono font-bold rounded">
                          {ex.code}
                        </span>
                        <span className="font-bold text-slate-900">{ex.title}</span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-1">
                        ⏱ {ex.durationMinutes} phút • {ex.questions.length} câu hỏi • Thang {ex.totalScore || 10.0}đ
                      </p>
                    </div>
                    <button
                      onClick={() => onNavigateToExam(ex.id)}
                      className="px-3 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-xs"
                    >
                      Mở đề
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Questions inside this folder */}
          <div className="space-y-3 pt-4 border-t border-slate-100">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-indigo-600" />
              Câu hỏi trong thư mục
            </h3>
            {folderQuestions.length === 0 ? (
              <p className="text-xs text-slate-400 italic p-4 bg-slate-50 rounded-xl">Chưa có câu hỏi riêng cho thư mục này.</p>
            ) : (
              <div className="space-y-2">
                {folderQuestions.map(q => (
                  <div
                    key={q.id}
                    className="p-3 rounded-xl border border-slate-100 bg-slate-50 text-xs"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono font-bold text-slate-700">{q.code}</span>
                      <span className="text-[10px] px-1.5 py-0.5 bg-slate-200 text-slate-700 rounded font-bold uppercase">
                        {q.type === 'part1_single_choice' ? 'Phần I' : q.type === 'part2_true_false' ? 'Phần II' : 'Phần III'}
                      </span>
                    </div>
                    <p className="text-slate-800 line-clamp-2">{q.content}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Create Folder Modal */}
      {isCreating && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl border border-slate-200">
            <h3 className="text-base font-bold text-slate-900 mb-3">Tạo thư mục mới</h3>
            <form onSubmit={handleCreateFolder} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Tên thư mục</label>
                <input
                  type="text"
                  required
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  placeholder="Ví dụ: Ôn thi HSG Thành Phố Đợt 2, Lớp 10 Chuyên..."
                  className="w-full p-2.5 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsCreating(false)}
                  className="px-4 py-2 rounded-xl text-slate-600 text-xs font-semibold"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold"
                >
                  Tạo thư mục
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Rename Folder Modal */}
      {editingFolder && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl border border-slate-200">
            <h3 className="text-base font-bold text-slate-900 mb-3">Đổi tên thư mục</h3>
            <form onSubmit={handleUpdateFolder} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Tên thư mục</label>
                <input
                  type="text"
                  required
                  value={editingFolder.name}
                  onChange={(e) => setEditingFolder({ ...editingFolder, name: e.target.value })}
                  className="w-full p-2.5 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingFolder(null)}
                  className="px-4 py-2 rounded-xl text-slate-600 text-xs font-semibold"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold"
                >
                  Lưu thay đổi
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
