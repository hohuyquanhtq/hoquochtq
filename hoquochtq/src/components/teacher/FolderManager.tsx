import React, { useMemo, useState } from 'react';
import { Folder, Question, Exam } from '../../types';
import {
  FolderTree,
  FolderPlus,
  Folder as FolderIcon,
  FolderOpen,
  FolderInput,
  Trash2,
  Edit2,
  ChevronRight,
  ChevronDown,
  BookOpen,
  FileCheck,
  Plus,
} from 'lucide-react';
import { ChemRenderer } from '../../utils/chemRenderer';
import {
  FolderTreeNode,
  buildFolderTree,
  canMoveFolder,
  flattenFolderTree,
  getFolderAncestors,
  normalizeParentId,
} from '../../utils/folderTree';
import { ConfirmDialog } from '../common/ConfirmDialog';

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
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(folders[0]?.id || null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [creatingParentId, setCreatingParentId] = useState<string | null | undefined>(undefined);
  const [newFolderName, setNewFolderName] = useState('');
  const [editingFolder, setEditingFolder] = useState<Folder | null>(null);
  const [movingFolder, setMovingFolder] = useState<Folder | null>(null);
  const [moveTargetId, setMoveTargetId] = useState<string>('');
  const [deletingFolder, setDeletingFolder] = useState<Folder | null>(null);

  const treeNodes = useMemo(() => buildFolderTree(folders, exams), [folders, exams]);
  const flatFolders = useMemo(() => flattenFolderTree(folders, exams), [folders, exams]);
  const selectedFolder = folders.find((f) => f.id === selectedFolderId) || null;
  const breadcrumbs = useMemo(
    () => getFolderAncestors(selectedFolderId, folders),
    [selectedFolderId, folders]
  );

  const folderQuestions = questions.filter((q) => (q.folderId || null) === selectedFolderId);
  const folderExams = exams.filter((e) => (e.folderId || null) === selectedFolderId);

  const handleCreateFolder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim() || creatingParentId === undefined) return;
    const nowIso = new Date().toISOString();
    const newFolder: Folder = {
      id: `f_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      name: newFolderName.trim(),
      parentId: creatingParentId,
      authorId: 'teacher_1',
      createdAt: nowIso,
      updatedAt: nowIso,
      itemCount: 0,
      color: 'teal',
    };
    onSaveFolders([...folders, newFolder]);
    if (creatingParentId) {
      setExpandedIds((prev) => new Set(prev).add(creatingParentId));
    }
    setSelectedFolderId(newFolder.id);
    setNewFolderName('');
    setCreatingParentId(undefined);
  };

  const handleUpdateFolder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingFolder || !editingFolder.name.trim()) return;
    const nowIso = new Date().toISOString();
    onSaveFolders(
      folders.map((f) =>
        f.id === editingFolder.id ? { ...editingFolder, updatedAt: nowIso } : f
      )
    );
    setEditingFolder(null);
  };

  const handleConfirmMove = (e: React.FormEvent) => {
    e.preventDefault();
    if (!movingFolder) return;
    const nextParent = moveTargetId ? moveTargetId : null;
    if (!canMoveFolder(movingFolder.id, nextParent, folders)) return;
    const nowIso = new Date().toISOString();
    onSaveFolders(
      folders.map((f) =>
        f.id === movingFolder.id ? { ...f, parentId: nextParent, updatedAt: nowIso } : f
      )
    );
    setMovingFolder(null);
  };

  const handleConfirmDelete = () => {
    if (!deletingFolder) return;
    const parentOfDeleted = normalizeParentId(deletingFolder.parentId);
    const nowIso = new Date().toISOString();
    const updated = folders
      .filter((f) => f.id !== deletingFolder.id)
      .map((f) =>
        normalizeParentId(f.parentId) === deletingFolder.id
          ? { ...f, parentId: parentOfDeleted, updatedAt: nowIso }
          : f
      );
    onSaveFolders(updated);
    if (selectedFolderId === deletingFolder.id) {
      setSelectedFolderId(parentOfDeleted);
    }
    setDeletingFolder(null);
  };

  const renderTree = (nodes: FolderTreeNode[], depth: number): React.ReactNode =>
    nodes.map((node) => {
      const isActive = node.folder.id === selectedFolderId;
      const isExpanded = expandedIds.has(node.folder.id);
      const hasChildren = node.children.length > 0;
      return (
        <div key={node.folder.id}>
          <div
            onClick={() => setSelectedFolderId(node.folder.id)}
            style={{ paddingLeft: `${8 + depth * 14}px` }}
            className={`group pr-2 py-2 rounded-xl cursor-pointer flex items-center justify-between text-xs transition-colors ${
              isActive
                ? 'bg-teal-50 text-teal-900 font-semibold border border-teal-200'
                : 'hover:bg-slate-50 text-slate-700 border border-transparent'
            }`}
          >
            <div className="flex items-center gap-1.5 min-w-0 flex-1">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setExpandedIds((prev) => {
                    const next = new Set(prev);
                    if (next.has(node.folder.id)) next.delete(node.folder.id);
                    else next.add(node.folder.id);
                    return next;
                  });
                }}
                className={`w-5 h-5 flex items-center justify-center rounded ${
                  hasChildren ? 'text-slate-500 hover:bg-slate-200' : 'opacity-0 pointer-events-none'
                }`}
              >
                {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              </button>
              {isActive ? (
                <FolderOpen className="w-4 h-4 text-teal-600 shrink-0" />
              ) : (
                <FolderIcon className="w-4 h-4 text-amber-500 shrink-0" />
              )}
              <span className="truncate">{node.folder.name}</span>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <span className="text-[11px] text-slate-500 tabular-nums px-1">
                {node.recursiveExamCount}
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setCreatingParentId(node.folder.id);
                }}
                className="p-1 opacity-0 group-hover:opacity-100 hover:text-teal-700 text-slate-400"
                title="Tạo thư mục con"
              >
                <Plus className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setEditingFolder(node.folder);
                }}
                className="p-1 opacity-0 group-hover:opacity-100 hover:text-blue-600 text-slate-400"
                title="Đổi tên"
              >
                <Edit2 className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setMovingFolder(node.folder);
                  setMoveTargetId(normalizeParentId(node.folder.parentId) || '');
                }}
                className="p-1 opacity-0 group-hover:opacity-100 hover:text-teal-700 text-slate-400"
                title="Di chuyển"
              >
                <FolderInput className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setDeletingFolder(node.folder);
                }}
                className="p-1 opacity-0 group-hover:opacity-100 hover:text-rose-600 text-slate-400"
                title="Xóa"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          </div>
          {hasChildren && isExpanded && <div>{renderTree(node.children, depth + 1)}</div>}
        </div>
      );
    });

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-teal-700 font-bold text-xs uppercase tracking-wider">
            <FolderTree className="w-4 h-4" />
            <span>Cây thư mục &amp; Tổ chức học liệu</span>
          </div>
          <h1 className="text-xl md:text-2xl font-bold text-slate-900 mt-1">
            Quản Lý Cây Thư Mục ({folders.length} thư mục)
          </h1>
          <p className="text-xs md:text-sm text-slate-600 mt-1">
            Phân cấp nhiều tầng theo khối lớp, chuyên đề và các kỳ kiểm tra.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setCreatingParentId(selectedFolderId)}
          className="min-h-[42px] px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold shadow-xs inline-flex items-center gap-2 shrink-0"
        >
          <FolderPlus className="w-4 h-4" />
          <span>{selectedFolderId ? '+ Tạo thư mục con' : '+ Tạo thư mục mới'}</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs space-y-2">
          <div
            onClick={() => setSelectedFolderId(null)}
            className={`px-3 py-2 rounded-xl cursor-pointer text-xs font-semibold flex items-center justify-between ${
              selectedFolderId === null
                ? 'bg-teal-600 text-white'
                : 'text-slate-700 hover:bg-slate-100'
            }`}
          >
            <span>Thư mục gốc</span>
            <span className="tabular-nums">{folders.length}</span>
          </div>
          {renderTree(treeNodes, 0)}
        </div>

        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-4 border-b border-slate-100">
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <button
                type="button"
                onClick={() => setSelectedFolderId(null)}
                className="font-semibold text-slate-600 hover:text-slate-900"
              >
                Gốc
              </button>
              {breadcrumbs.map((b) => (
                <React.Fragment key={b.id}>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                  <button
                    type="button"
                    onClick={() => setSelectedFolderId(b.id)}
                    className="font-semibold text-teal-700 hover:underline"
                  >
                    {b.name}
                  </button>
                </React.Fragment>
              ))}
            </div>
            <div className="text-xs text-slate-500 tabular-nums">
              {folderExams.length} đề thi · {folderQuestions.length} câu hỏi
            </div>
          </div>

          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <FolderIcon className="w-5 h-5 text-amber-500" />
            <span>{selectedFolder?.name || 'Thư mục gốc'}</span>
          </h2>

          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-2">
              <FileCheck className="w-4 h-4 text-emerald-600" />
              Đề thi trong thư mục ({folderExams.length})
            </h3>
            {folderExams.length === 0 ? (
              <p className="text-xs text-slate-400 p-4 bg-slate-50 rounded-xl">
                Chưa có đề thi nào trong thư mục này.
              </p>
            ) : (
              folderExams.map((ex) => (
                <div
                  key={ex.id}
                  className="p-3.5 rounded-xl border border-slate-200 hover:border-teal-300 flex items-center justify-between gap-3 text-xs"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 bg-slate-100 text-slate-800 font-mono font-bold rounded">
                        {ex.code}
                      </span>
                      <span className="font-bold text-slate-900">{ex.title}</span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1 tabular-nums">
                      {ex.durationMinutes} phút · {ex.questions.length} câu · Thang {ex.totalScore || 10}đ
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onNavigateToExam(ex.id)}
                    className="px-3 py-1.5 rounded-lg bg-teal-50 hover:bg-teal-100 text-teal-800 font-semibold"
                  >
                    Xem kết quả
                  </button>
                </div>
              ))
            )}
          </div>

          <div className="space-y-3 pt-4 border-t border-slate-100">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-indigo-600" />
              Câu hỏi gắn thư mục ({folderQuestions.length})
            </h3>
            {folderQuestions.length === 0 ? (
              <p className="text-xs text-slate-400 p-4 bg-slate-50 rounded-xl">
                Chưa có câu hỏi riêng nào gắn với thư mục này.
              </p>
            ) : (
              folderQuestions.map((q) => (
                <div key={q.id} className="p-3 rounded-xl border border-slate-100 bg-slate-50 text-xs">
                  <span className="font-mono font-bold text-slate-700 mr-2">{q.code}</span>
                  <ChemRenderer text={q.content} inline />
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Create Modal */}
      {creatingParentId !== undefined && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl border border-slate-200">
            <h3 className="text-base font-bold text-slate-900 mb-3">
              {creatingParentId ? 'Tạo thư mục con' : 'Tạo thư mục mới'}
            </h3>
            <form onSubmit={handleCreateFolder} className="space-y-4">
              <input
                type="text"
                required
                autoFocus
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder="Nhập tên thư mục..."
                className="w-full p-2.5 rounded-xl border border-slate-300 text-xs"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setCreatingParentId(undefined)}
                  className="px-4 py-2 rounded-xl text-slate-600 text-xs font-semibold"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-teal-600 text-white text-xs font-semibold"
                >
                  Tạo
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Rename Modal */}
      {editingFolder && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl border border-slate-200">
            <h3 className="text-base font-bold text-slate-900 mb-3">Đổi tên thư mục</h3>
            <form onSubmit={handleUpdateFolder} className="space-y-4">
              <input
                type="text"
                required
                value={editingFolder.name}
                onChange={(e) => setEditingFolder({ ...editingFolder, name: e.target.value })}
                className="w-full p-2.5 rounded-xl border border-slate-300 text-xs"
              />
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
                  className="px-4 py-2 rounded-xl bg-teal-600 text-white text-xs font-semibold"
                >
                  Lưu
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Move Modal */}
      {movingFolder && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl border border-slate-200">
            <h3 className="text-base font-bold text-slate-900 mb-3">
              Di chuyển thư mục &quot;{movingFolder.name}&quot;
            </h3>
            <form onSubmit={handleConfirmMove} className="space-y-4 text-xs">
              <select
                value={moveTargetId}
                onChange={(e) => setMoveTargetId(e.target.value)}
                className="w-full p-2.5 rounded-xl border border-slate-300 bg-white"
              >
                <option value="">Thư mục gốc</option>
                {flatFolders
                  .filter((item) => canMoveFolder(movingFolder.id, item.folder.id, folders))
                  .map((item) => (
                    <option key={item.folder.id} value={item.folder.id}>
                      {'\u00A0'.repeat(item.depth * 3)}
                      {item.depth > 0 ? '↳ ' : ''}
                      {item.folder.name}
                    </option>
                  ))}
              </select>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setMovingFolder(null)}
                  className="px-4 py-2 rounded-xl text-slate-600 font-semibold"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-teal-600 text-white font-semibold"
                >
                  Di chuyển
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={!!deletingFolder}
        title={`Xóa thư mục "${deletingFolder?.name || ''}"?`}
        message="Các thư mục con sẽ được chuyển lên thư mục cha để tránh mất dữ liệu."
        confirmLabel="Xóa thư mục"
        variant="warning"
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeletingFolder(null)}
      />
    </div>
  );
};
