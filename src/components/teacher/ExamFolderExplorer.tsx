import React, { useEffect, useMemo, useState } from 'react';
import { Exam, Folder, StudentSubmission, User } from '../../types';
import {
  Award,
  BarChart3,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  Edit3,
  ExternalLink,
  FileCheck,
  Folder as FolderIcon,
  FolderInput,
  FolderOpen,
  FolderPlus,
  Globe,
  Link as LinkIcon,
  Lock,
  PanelLeft,
  Play,
  Plus,
  QrCode,
  Search,
  Send,
  ShieldCheck,
  Trash2,
  Undo2,
  Unlock,
  X,
  ArrowUpDown,
} from 'lucide-react';
import {
  FolderTreeNode,
  SortDirection,
  SortField,
  buildFolderTree,
  canMoveFolder,
  filterDirectExamsInFolder,
  flattenFolderTree,
  getDescendantFolderIds,
  getFolderAncestors,
  getFolderPathLabel,
  normalizeFolderId,
  normalizeParentId,
  sortExams,
  sortFolders,
} from '../../utils/folderTree';
import { GRADE_LABELS } from '../../constants/subjects';
import { EXAM_SHARE_STATUS_META } from '../../constants/danangSchools';
import { getEffectiveAnswerReviewConfig } from '../../services/examSecurityApi';
import {
  getExamShortUrl,
  getUnifiedExamCode,
  normalizeExamCode,
  normalizePublicExamCode,
} from '../../utils/urlHelper';
import { syncExamToFirestore } from '../../services/firebase';
import {
  requestExamCityShare,
  withdrawExamCityShareRequest,
} from '../../services/workspaceService';
import { exportPrintReadyExamWithAnswersDocx } from '../../services/sampleWordTemplateService';
import { ExamShareModal } from '../common/ExamShareModal';
import { ExamSecurityModal } from './ExamSecurityModal';
import { ConfirmDialog } from '../common/ConfirmDialog';

export interface ExamFolderExplorerProps {
  exams: Exam[];
  folders: Folder[];
  submissions: StudentSubmission[];
  currentUserId?: string;
  currentUser?: User | null;
  userRole?: 'admin' | 'teacher';
  mode?: 'all' | 'online';
  activeFolderId?: string | null;
  onActiveFolderChange?: (folderId: string | null) => void;
  autoOpenShareExamId?: string | null;
  onClearAutoOpenShare?: () => void;
  onCreateNew: (folderId?: string | null) => void;
  onOpenResults: (examId: string) => void;
  onTakeExamAsPreview: (exam: Exam) => void;
  onTogglePublish: (examId: string) => void;
  onDeleteExam: (examId: string) => void;
  onExamUpdated?: (updatedExam: Exam) => void;
  onSaveFolders?: (folders: Folder[]) => void;
  onCreateFolder?: (input: { name: string; parentId: string | null; description?: string }) => Promise<void>;
  onRenameFolder?: (folder: Folder, updates: { name: string; description?: string }) => Promise<void>;
  onMoveFolder?: (folder: Folder, targetParentId: string | null) => Promise<void>;
  onDeleteFolder?: (folder: Folder) => Promise<void>;
  onMoveExam?: (
    exam: Exam,
    targetFolderId: string | null,
    updates?: { title?: string; description?: string }
  ) => Promise<void>;
  onShareExam?: (exam: Exam) => void;
}

export const ExamFolderExplorer: React.FC<ExamFolderExplorerProps> = ({
  exams,
  folders,
  submissions,
  currentUserId,
  currentUser,
  userRole,
  mode = 'all',
  activeFolderId: activeFolderIdProp,
  onActiveFolderChange,
  autoOpenShareExamId,
  onClearAutoOpenShare,
  onCreateNew,
  onOpenResults,
  onTakeExamAsPreview,
  onTogglePublish,
  onDeleteExam,
  onExamUpdated,
  onSaveFolders,
  onCreateFolder,
  onRenameFolder,
  onMoveFolder,
  onDeleteFolder,
  onMoveExam,
  onShareExam,
}) => {
  const [internalActiveFolderId, setInternalActiveFolderId] = useState<string | null>(null);
  const currentFolderId =
    activeFolderIdProp !== undefined
      ? normalizeFolderId(activeFolderIdProp)
      : internalActiveFolderId;

  const updateActiveFolderId = (nextId: string | null) => {
    const clean = normalizeFolderId(nextId);
    if (onActiveFolderChange) {
      onActiveFolderChange(clean);
    } else {
      setInternalActiveFolderId(clean);
    }
  };

  const [expandedFolderIds, setExpandedFolderIds] = useState<Set<string>>(new Set());
  const [showMobileTree, setShowMobileTree] = useState<boolean>(false);

  const [searchTerm, setSearchTerm] = useState<string>('');
  const [sortField, setSortField] = useState<SortField>('updatedAt');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [publishFilter, setPublishFilter] = useState<'all' | 'published' | 'closed'>(
    mode === 'online' ? 'published' : 'all'
  );

  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [copiedLinkId, setCopiedLinkId] = useState<string | null>(null);
  const [activeShareExam, setActiveShareExam] = useState<Exam | null>(null);
  const [activeSecurityExam, setActiveSecurityExam] = useState<Exam | null>(null);
  const [exportingWordExamId, setExportingWordExamId] = useState<string | null>(null);
  const [proposingShareExamId, setProposingShareExamId] = useState<string | null>(null);
  const [toastState, setToastState] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Modals state
  const [folderModal, setFolderModal] = useState<
    | { mode: 'create'; parentId: string | null }
    | { mode: 'rename'; folder: Folder }
    | null
  >(null);
  const [folderNameInput, setFolderNameInput] = useState('');
  const [folderDescInput, setFolderDescInput] = useState('');
  const [isSavingFolder, setIsSavingFolder] = useState(false);
  const [folderModalError, setFolderModalError] = useState<string | null>(null);

  const [movingFolder, setMovingFolder] = useState<Folder | null>(null);
  const [moveFolderTargetId, setMoveFolderTargetId] = useState<string>('');
  const [isMovingFolder, setIsMovingFolder] = useState(false);
  const [moveFolderError, setMoveFolderError] = useState<string | null>(null);

  const [deletingFolder, setDeletingFolder] = useState<Folder | null>(null);
  const [deletingExam, setDeletingExam] = useState<Exam | null>(null);

  const [editingExamMeta, setEditingExamMeta] = useState<Exam | null>(null);
  const [examTitleInput, setExamTitleInput] = useState('');
  const [examDescInput, setExamDescInput] = useState('');
  const [examFolderTargetId, setExamFolderTargetId] = useState<string>('');
  const [isSavingMeta, setIsSavingMeta] = useState(false);
  const [metaModalError, setMetaModalError] = useState<string | null>(null);

  useEffect(() => {
    setPublishFilter(mode === 'online' ? 'published' : 'all');
  }, [mode]);

  useEffect(() => {
    if (!autoOpenShareExamId) return;
    const target = exams.find((e) => e.id === autoOpenShareExamId);
    if (target) {
      setActiveShareExam(target);
      onClearAutoOpenShare?.();
    }
  }, [autoOpenShareExamId, exams, onClearAutoOpenShare]);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToastState({ message, type });
    setTimeout(() => setToastState(null), 3500);
  };

  const canManageFolders = Boolean(
    onCreateFolder || onRenameFolder || onMoveFolder || onDeleteFolder || onSaveFolders
  );

  const folderIdSet = useMemo(() => new Set(folders.map((f) => f.id)), [folders]);
  const treeNodes = useMemo(() => buildFolderTree(folders, exams), [folders, exams]);
  const flatFolders = useMemo(() => flattenFolderTree(folders, exams), [folders, exams]);
  const breadcrumbs = useMemo(
    () => getFolderAncestors(currentFolderId, folders),
    [currentFolderId, folders]
  );
  const rootDirectExamCount = useMemo(
    () => filterDirectExamsInFolder(exams, null, folderIdSet).length,
    [exams, folderIdSet]
  );

  // Keep active folder valid and auto-expand its ancestor nodes in the tree
  useEffect(() => {
    if (!currentFolderId) return;
    if (folders.length > 0 && !folderIdSet.has(currentFolderId)) {
      updateActiveFolderId(null);
      return;
    }
    const ancestors = getFolderAncestors(currentFolderId, folders);
    if (ancestors.length > 0) {
      setExpandedFolderIds((prev) => {
        const next = new Set(prev);
        ancestors.forEach((a) => next.add(a.id));
        return next;
      });
    }
  }, [currentFolderId, folders, folderIdSet]);

  const navigateToFolder = (folderId: string | null) => {
    const cleanId = normalizeFolderId(folderId);
    updateActiveFolderId(cleanId);
    setShowMobileTree(false);
    if (cleanId) {
      const ancestors = getFolderAncestors(cleanId, folders);
      setExpandedFolderIds((prev) => {
        const next = new Set(prev);
        ancestors.forEach((a) => next.add(a.id));
        return next;
      });
    }
  };

  const toggleExpand = (folderId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedFolderIds((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  };

  const handleCopyCode = (code: string) => {
    navigator.clipboard?.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2500);
  };

  const handleCopyShortLink = (exam: Exam) => {
    const url = getExamShortUrl(exam);
    navigator.clipboard?.writeText(url);
    setCopiedLinkId(exam.id);
    setTimeout(() => setCopiedLinkId(null), 2500);
  };

  // Determine current visible subfolders & exams
  const isSearching = searchTerm.trim().length > 0;
  const searchLower = searchTerm.trim().toLowerCase();

  const visibleFolders = useMemo(() => {
    const baseList = isSearching
      ? folders.filter((f) => {
          const matchName = f.name.toLowerCase().includes(searchLower);
          const matchDesc = (f.description || '').toLowerCase().includes(searchLower);
          return matchName || matchDesc;
        })
      : folders.filter((f) => {
          const pId = normalizeParentId(f.parentId);
          const effectiveParent = pId && folderIdSet.has(pId) && pId !== f.id ? pId : null;
          return effectiveParent === currentFolderId;
        });
    return sortFolders(baseList, sortField, sortDirection);
  }, [folders, folderIdSet, currentFolderId, isSearching, searchLower, sortField, sortDirection]);

  const visibleExams = useMemo(() => {
    const filteredByStatusAndSearch = exams.filter((ex) => {
      if (publishFilter === 'published' && !ex.isPublished) return false;
      if (publishFilter === 'closed' && ex.isPublished) return false;

      if (isSearching) {
        return (
          ex.title.toLowerCase().includes(searchLower) ||
          ex.code.toLowerCase().includes(searchLower) ||
          (ex.publicCode || '').toLowerCase().includes(searchLower) ||
          (ex.shortId || '').toLowerCase().includes(searchLower) ||
          (ex.slug || '').toLowerCase().includes(searchLower) ||
          (ex.description || '').toLowerCase().includes(searchLower)
        );
      }

      return true;
    });

    const baseList =
      mode === 'all' && !isSearching
        ? filterDirectExamsInFolder(filteredByStatusAndSearch, currentFolderId, folderIdSet)
        : filteredByStatusAndSearch;

    return sortExams(baseList, sortField, sortDirection);
  }, [
    exams,
    folderIdSet,
    currentFolderId,
    mode,
    publishFilter,
    isSearching,
    searchLower,
    sortField,
    sortDirection,
  ]);

  const publishedCount = exams.filter((e) => e.isPublished).length;
  const closedCount = exams.length - publishedCount;

  // --- Folder CRUD Handlers ---
  const openCreateFolderModal = (parentId: string | null) => {
    setFolderNameInput('');
    setFolderDescInput('');
    setFolderModalError(null);
    setFolderModal({ mode: 'create', parentId: normalizeParentId(parentId) });
  };

  const openRenameFolderModal = (folder: Folder) => {
    setFolderNameInput(folder.name);
    setFolderDescInput(folder.description || '');
    setFolderModalError(null);
    setFolderModal({ mode: 'rename', folder });
  };

  const handleSaveFolderModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!folderModal || !canManageFolders) return;
    const cleanName = folderNameInput.trim();
    if (!cleanName) {
      setFolderModalError('Vui lòng nhập tên thư mục.');
      return;
    }

    setFolderModalError(null);
    setIsSavingFolder(true);
    try {
      const nowIso = new Date().toISOString();

      if (folderModal.mode === 'create') {
        const cleanParentId = normalizeParentId(folderModal.parentId);
        if (onCreateFolder) {
          await onCreateFolder({
            name: cleanName,
            parentId: cleanParentId,
            description: folderDescInput.trim() || undefined,
          });
        } else if (onSaveFolders) {
          const newFolder: Folder = {
            id: `f_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
            name: cleanName,
            parentId: cleanParentId,
            ...(folderDescInput.trim() ? { description: folderDescInput.trim() } : {}),
            ownerId: currentUserId,
            authorId: currentUserId || 'teacher_1',
            createdAt: nowIso,
            updatedAt: nowIso,
            itemCount: 0,
          };
          onSaveFolders([...folders, newFolder]);
        }
        if (cleanParentId) {
          setExpandedFolderIds((prev) => new Set(prev).add(cleanParentId));
        }
        showToast(`Đã tạo thư mục "${cleanName}"`);
      } else {
        const cleanDesc = folderDescInput.trim() || undefined;
        if (onRenameFolder) {
          await onRenameFolder(folderModal.folder, {
            name: cleanName,
            description: cleanDesc,
          });
        } else if (onSaveFolders) {
          const updated = folders.map((f) =>
            f.id === folderModal.folder.id
              ? {
                  ...f,
                  name: cleanName,
                  description: cleanDesc,
                  updatedAt: nowIso,
                }
              : f
          );
          onSaveFolders(updated);
        }
        showToast(`Đã cập nhật thư mục "${cleanName}"`);
      }
      setFolderModal(null);
    } catch (err) {
      setFolderModalError(
        err instanceof Error ? err.message : 'Không thể lưu thư mục lên Firestore. Vui lòng thử lại.'
      );
    } finally {
      setIsSavingFolder(false);
    }
  };

  const openMoveFolderModal = (folder: Folder) => {
    setMovingFolder(folder);
    setMoveFolderTargetId(normalizeParentId(folder.parentId) || '');
    setMoveFolderError(null);
  };

  const handleConfirmMoveFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!movingFolder || !canManageFolders) return;
    const nextParent = normalizeParentId(moveFolderTargetId);
    if (!canMoveFolder(movingFolder.id, nextParent, folders)) {
      setMoveFolderError('Không thể di chuyển thư mục vào chính nó hoặc thư mục con của nó.');
      return;
    }

    setMoveFolderError(null);
    setIsMovingFolder(true);
    try {
      if (onMoveFolder) {
        await onMoveFolder(movingFolder, nextParent);
      } else if (onSaveFolders) {
        const nowIso = new Date().toISOString();
        const updated = folders.map((f) =>
          f.id === movingFolder.id ? { ...f, parentId: nextParent, updatedAt: nowIso } : f
        );
        onSaveFolders(updated);
      }
      if (nextParent) {
        setExpandedFolderIds((prev) => new Set(prev).add(nextParent));
      }
      showToast(`Đã di chuyển thư mục "${movingFolder.name}"`);
      setMovingFolder(null);
    } catch (err) {
      setMoveFolderError(
        err instanceof Error ? err.message : 'Không thể di chuyển thư mục. Vui lòng thử lại.'
      );
    } finally {
      setIsMovingFolder(false);
    }
  };

  const handleConfirmDeleteFolder = async () => {
    if (!deletingFolder || !canManageFolders) return;
    const targetFolder = deletingFolder;
    const targetId = targetFolder.id;
    const parentOfDeleted = normalizeParentId(targetFolder.parentId);

    try {
      if (onDeleteFolder) {
        await onDeleteFolder(targetFolder);
      } else if (onSaveFolders) {
        const nowIso = new Date().toISOString();
        const nextFolders = folders
          .filter((f) => f.id !== targetId)
          .map((f) =>
            normalizeParentId(f.parentId) === targetId
              ? { ...f, parentId: parentOfDeleted, updatedAt: nowIso }
              : f
          );

        const affectedExams = exams.filter((ex) => normalizeFolderId(ex.folderId) === targetId);
        for (const ex of affectedExams) {
          const movedExam: Exam = {
            ...ex,
            folderId: parentOfDeleted,
            updatedAt: nowIso,
          };
          await syncExamToFirestore(movedExam, currentUserId);
          onExamUpdated?.(movedExam);
        }
        onSaveFolders(nextFolders);
      }

      if (currentFolderId === targetId) {
        updateActiveFolderId(parentOfDeleted);
      }
      showToast(`Đã xóa thư mục "${targetFolder.name}"`);
      setDeletingFolder(null);
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Không thể xóa thư mục trên Firestore.',
        'error'
      );
      setDeletingFolder(null);
    }
  };

  // --- Exam Meta & Move Folder Handlers ---
  const openEditExamMetaModal = (exam: Exam) => {
    setEditingExamMeta(exam);
    setExamTitleInput(exam.title);
    setExamDescInput(exam.description || '');
    const cleanExistingFolder = normalizeFolderId(exam.folderId);
    setExamFolderTargetId(
      cleanExistingFolder && folderIdSet.has(cleanExistingFolder) ? cleanExistingFolder : ''
    );
    setMetaModalError(null);
  };

  const handleSaveExamMeta = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingExamMeta || !examTitleInput.trim()) return;
    setMetaModalError(null);
    setIsSavingMeta(true);
    try {
      const targetFolder = normalizeFolderId(examFolderTargetId);
      const updates = {
        title: examTitleInput.trim(),
        description: examDescInput.trim(),
      };

      if (onMoveExam) {
        await onMoveExam(editingExamMeta, targetFolder, updates);
      } else {
        const nowIso = new Date().toISOString();
        const updatedExam: Exam = {
          ...editingExamMeta,
          title: updates.title,
          description: updates.description || undefined,
          folderId: targetFolder,
          updatedAt: nowIso,
        };
        await syncExamToFirestore(updatedExam, currentUserId);
        onExamUpdated?.(updatedExam);
      }

      showToast('Đã cập nhật thông tin & vị trí thư mục cho đề thi.');
      setEditingExamMeta(null);
    } catch (err) {
      console.warn('Could not update exam metadata:', err);
      setMetaModalError(
        err instanceof Error
          ? err.message
          : 'Không thể lưu thay đổi lên Cloud Firestore. Vui lòng kiểm tra kết nối và thử lại.'
      );
    } finally {
      setIsSavingMeta(false);
    }
  };

  const renderTreeNodes = (nodes: FolderTreeNode[], depth: number): React.ReactNode =>
    nodes.map((node) => {
      const isSelected = currentFolderId === node.folder.id;
      const isExpanded = expandedFolderIds.has(node.folder.id);
      const hasChildren = node.children.length > 0;

      return (
        <div key={node.folder.id}>
          <div
            onClick={() => navigateToFolder(node.folder.id)}
            style={{ paddingLeft: `${8 + depth * 14}px` }}
            className={`group flex items-center justify-between gap-1.5 pr-2 py-2 rounded-xl cursor-pointer text-xs transition-colors ${
              isSelected
                ? 'bg-teal-50 text-teal-900 font-semibold border border-teal-200'
                : 'text-slate-700 hover:bg-slate-100 border border-transparent'
            }`}
          >
            <div className="flex items-center gap-1.5 min-w-0 flex-1">
              <button
                type="button"
                onClick={(e) => toggleExpand(node.folder.id, e)}
                aria-label={isExpanded ? 'Thu gọn thư mục' : 'Mở rộng thư mục'}
                className={`w-5 h-5 rounded flex items-center justify-center shrink-0 ${
                  hasChildren
                    ? 'text-slate-500 hover:bg-slate-200/70'
                    : 'opacity-0 pointer-events-none'
                }`}
              >
                {isExpanded ? (
                  <ChevronDown className="w-3.5 h-3.5" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5" />
                )}
              </button>
              {isSelected ? (
                <FolderOpen className="w-4 h-4 text-teal-600 shrink-0" />
              ) : (
                <FolderIcon className="w-4 h-4 text-amber-500 shrink-0" />
              )}
              <span className="truncate">{node.folder.name}</span>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <span className="text-[11px] font-semibold text-slate-500 tabular-nums px-1">
                {node.recursiveExamCount}
              </span>
              {canManageFolders && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    openCreateFolderModal(node.folder.id);
                  }}
                  title="Tạo thư mục con"
                  className="p-1 rounded opacity-0 group-hover:opacity-100 text-slate-400 hover:text-teal-700 hover:bg-white"
                >
                  <Plus className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>

          {hasChildren && isExpanded && <div>{renderTreeNodes(node.children, depth + 1)}</div>}
        </div>
      );
    });

  const renderExamCard = (exam: Exam) => {
    const cleanExamCode = normalizeExamCode(exam.code);
    const unifiedCode = getUnifiedExamCode(exam);
    const normalizedPublicCode =
      normalizePublicExamCode(exam.shortId) ||
      normalizePublicExamCode(exam.publicCode) ||
      normalizePublicExamCode(exam.slug) ||
      normalizePublicExamCode(exam.code);
    const examSubs = submissions.filter((s) => {
      if (s.examId === exam.id) return true;
      const subCode = normalizeExamCode(s.examCode);
      const matchesCode =
        (cleanExamCode && subCode === cleanExamCode) ||
        (unifiedCode && subCode === normalizeExamCode(unifiedCode));
      return Boolean(matchesCode && (!s.ownerId || !exam.ownerId || s.ownerId === exam.ownerId));
    });
    const isCopied = copiedCode === unifiedCode;
    const policy = getEffectiveAnswerReviewConfig(exam);
    const qualifiedCount = policy.allowAnswerReview
      ? examSubs.filter(
          (s) => Math.round(s.totalScore * 100) >= Math.round(policy.answerReviewMinScore * 100)
        ).length
      : 0;
    const belowFloorCount = examSubs.length - qualifiedCount;
    const folderLabel = getFolderPathLabel(exam.folderId, folders);
    const shortUrl = getExamShortUrl(exam);

    const shareStatus = exam.share_status || 'private';
    const shareBadgeMeta = EXAM_SHARE_STATUS_META[shareStatus];
    const isExportingThisWord = exportingWordExamId === exam.id;
    const isUpdatingThisShare = proposingShareExamId === exam.id;

    const handleExportExamWord = async () => {
      setExportingWordExamId(exam.id);
      try {
        await exportPrintReadyExamWithAnswersDocx(
          exam,
          exam.authorSchool || currentUser?.school
        );
        showToast(`Đã xuất file Word đề thi "${exam.title}" kèm bảng đáp án!`);
      } catch (err) {
        showToast(
          err instanceof Error ? err.message : 'Không thể xuất file Word cho đề thi này.',
          'error'
        );
      } finally {
        setExportingWordExamId(null);
      }
    };

    const handleToggleCityShareProposal = async () => {
      if (!currentUser) {
        showToast('Cần đăng nhập tài khoản Giáo viên để thao tác chia sẻ Kho Thành phố.', 'error');
        return;
      }
      setProposingShareExamId(exam.id);
      try {
        if (shareStatus === 'pending_review') {
          const updated = await withdrawExamCityShareRequest(exam);
          onExamUpdated?.(updated);
          showToast('Đã thu hồi yêu cầu chia sẻ đề thi lên Kho Thành phố.');
        } else if (shareStatus === 'private') {
          const updated = await requestExamCityShare(exam, currentUser);
          onExamUpdated?.(updated);
          showToast('Đã gửi đề xuất chia sẻ lên Kho đề Thành phố (chờ Super Admin duyệt).');
        }
      } catch (err) {
        showToast(
          err instanceof Error ? err.message : 'Không thể cập nhật trạng thái chia sẻ đề thi.',
          'error'
        );
      } finally {
        setProposingShareExamId(null);
      }
    };

    return (
      <div
        key={exam.id}
        className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs hover:border-teal-300 transition-colors flex flex-col justify-between w-full gap-4"
      >
        {/* Top content block: full 100% card width */}
        <div className="w-full space-y-2.5 min-w-0">
          {/* Top metadata row — clean, scannable, full-width wrap */}
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-xs w-full">
            <span className="px-2.5 py-0.5 font-mono font-bold bg-slate-100 text-slate-800 rounded-md tracking-wider">
              Mã phòng: {unifiedCode}
            </span>
            <button
              type="button"
              onClick={() => onTogglePublish(exam.id)}
              className={`px-2.5 py-0.5 text-[11px] font-bold rounded-md transition-colors inline-flex items-center gap-1.5 ${
                exam.isPublished
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100'
                  : 'bg-slate-100 text-slate-600 border border-slate-200 hover:bg-slate-200'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  exam.isPublished ? 'bg-emerald-500' : 'bg-slate-400'
                }`}
              />
              {exam.isPublished ? 'Đang mở thi' : 'Đã đóng'}
            </button>

            {shareStatus !== 'private' && (
              <span
                className={`px-2.5 py-0.5 text-[11px] font-bold rounded-md border inline-flex items-center gap-1 ${shareBadgeMeta.badgeClass}`}
              >
                <Globe className="w-3 h-3 shrink-0" />
                <span>{shareBadgeMeta.label}</span>
              </span>
            )}

            <span className="inline-flex items-center gap-1 text-slate-600 font-medium">
              {exam.requiresPassword ? (
                <>
                  <Lock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  <span>Có mật khẩu</span>
                </>
              ) : (
                <>
                  <Unlock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span>Không mật khẩu</span>
                </>
              )}
            </span>

            <span className="text-slate-300">·</span>

            <span className="inline-flex items-center gap-1 text-slate-700 font-medium">
              <Award className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
              {policy.allowAnswerReview
                ? `Mở đáp án ≥ ${policy.answerReviewMinScore.toFixed(1)}đ`
                : 'Không mở đáp án'}
            </span>

            <span className="text-slate-300">·</span>

            <span className="text-slate-600 font-medium">
              {GRADE_LABELS[exam.grade] || `Lớp ${exam.grade}`}
            </span>

            {(isSearching || mode === 'online') && (
              <>
                <span className="text-slate-300">·</span>
                <span className="text-teal-700 font-medium truncate max-w-[260px]">
                  {folderLabel}
                </span>
              </>
            )}
          </div>

          {/* Exam Title: full width, natural wrapping */}
          <h3 className="text-base font-bold text-slate-900 leading-snug w-full break-words whitespace-normal">
            {exam.title}
          </h3>

          {exam.description && (
            <p className="text-xs text-slate-600 w-full break-words whitespace-normal line-clamp-2">
              {exam.description}
            </p>
          )}

          {exam.cityReviewNote && shareStatus === 'private' && (
            <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
              <strong>Ghi chú duyệt Kho TP:</strong> {exam.cityReviewNote}
            </p>
          )}

          {normalizedPublicCode && (
            <div className="flex items-center gap-2.5 flex-wrap text-xs w-full">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-teal-50 border border-teal-200 text-teal-800 font-mono font-bold break-all">
                <LinkIcon className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                <span>{shortUrl}</span>
              </span>
              <a
                href={shortUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 font-semibold hover:underline shrink-0"
              >
                <span>Mở link</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 tabular-nums w-full">
            <span>{exam.durationMinutes} phút</span>
            <span>{exam.questions.length} câu hỏi</span>
            <span>Thang {exam.totalScore || 10.0}đ</span>
            <span>{examSubs.length} lượt nộp</span>
            <span>GV: {exam.authorName}</span>
            <span>
              Tạo: {new Date(exam.createdAt).toLocaleDateString('vi-VN')}
            </span>
            <span>
              Cập nhật: {new Date(exam.updatedAt || exam.createdAt).toLocaleDateString('vi-VN')}
            </span>
            {policy.allowAnswerReview && examSubs.length > 0 && (
              <span className="text-indigo-700 font-semibold">
                Đạt sàn: {qualifiedCount} · Chưa đạt: {belowFloorCount}
              </span>
            )}
          </div>
        </div>

        {/* Bottom Actions Toolbar: separated cleanly with top divider */}
        <div className="w-full mt-auto pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
          {/* Quick link & unified 6-char room code copy */}
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => handleCopyShortLink(exam)}
              className="min-h-[36px] px-3 py-1.5 rounded-xl border border-teal-200 bg-teal-50/80 hover:bg-teal-100 text-teal-800 text-xs font-semibold inline-flex items-center gap-1.5"
              title="Sao chép link rút gọn 6 ký tự"
            >
              {copiedLinkId === exam.id ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              ) : (
                <LinkIcon className="w-3.5 h-3.5" />
              )}
              <span className="font-mono">
                {copiedLinkId === exam.id
                  ? 'Đã chép link!'
                  : normalizedPublicCode
                  ? `/${normalizedPublicCode}`
                  : 'Chép link'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => handleCopyCode(unifiedCode)}
              className="min-h-[36px] px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold inline-flex items-center gap-1.5"
              title={`Sao chép mã phòng thi ${unifiedCode}`}
            >
              {isCopied ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
              <span className="font-mono tracking-wider">{isCopied ? 'Đã chép' : unifiedCode}</span>
            </button>
          </div>

          {/* Primary management actions */}
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              disabled={isExportingThisWord}
              onClick={() => void handleExportExamWord()}
              className="min-h-[36px] px-3 py-1.5 rounded-xl border border-indigo-200 bg-indigo-50/80 hover:bg-indigo-100 disabled:opacity-60 text-indigo-800 text-xs font-semibold inline-flex items-center gap-1.5"
              title="Xuất đề thi chuẩn in A4 kèm bảng đáp án (.docx)"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{isExportingThisWord ? 'Đang xuất...' : 'Xuất Word'}</span>
            </button>

            {currentUser && shareStatus === 'private' && (
              <button
                type="button"
                disabled={isUpdatingThisShare}
                onClick={() => void handleToggleCityShareProposal()}
                className="min-h-[36px] px-3 py-1.5 rounded-xl border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 disabled:opacity-60 text-emerald-800 text-xs font-semibold inline-flex items-center gap-1.5"
                title="Đề xuất chia sẻ đề thi này lên Kho đề Thành phố (Super Admin duyệt)"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{isUpdatingThisShare ? 'Đang gửi...' : 'Đề xuất Kho TP'}</span>
              </button>
            )}

            {currentUser && shareStatus === 'pending_review' && (
              <button
                type="button"
                disabled={isUpdatingThisShare}
                onClick={() => void handleToggleCityShareProposal()}
                className="min-h-[36px] px-3 py-1.5 rounded-xl border border-amber-200 bg-amber-50 hover:bg-amber-100 disabled:opacity-60 text-amber-800 text-xs font-semibold inline-flex items-center gap-1.5"
                title="Thu hồi đề xuất chia sẻ lên Kho Thành phố"
              >
                <Undo2 className="w-3.5 h-3.5" />
                <span>{isUpdatingThisShare ? 'Đang xử lý...' : 'Thu hồi đề xuất'}</span>
              </button>
            )}

            {mode === 'all' && (
              <button
                type="button"
                onClick={() => openEditExamMetaModal(exam)}
                className="min-h-[36px] px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold inline-flex items-center gap-1.5"
                title="Sửa tiêu đề, mô tả hoặc di chuyển sang thư mục khác"
              >
                <FolderInput className="w-3.5 h-3.5 text-teal-700" />
                <span>Chuyển / Sửa</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setActiveSecurityExam(exam)}
              className="min-h-[36px] px-3 py-1.5 rounded-xl border border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-800 text-xs font-semibold inline-flex items-center gap-1.5"
              title="Cấu hình mật khẩu & điểm sàn xem đáp án"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Bảo mật</span>
            </button>

            <button
              type="button"
              onClick={() => {
                if (onShareExam) onShareExam(exam);
                else setActiveShareExam(exam);
              }}
              className="min-h-[36px] px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold inline-flex items-center gap-1.5"
            >
              <QrCode className="w-3.5 h-3.5" />
              <span>Chia sẻ</span>
            </button>

            <button
              type="button"
              onClick={() => onTakeExamAsPreview(exam)}
              className="min-h-[36px] px-3 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold inline-flex items-center gap-1.5"
            >
              <Play className="w-3.5 h-3.5 text-blue-600" />
              <span>Thi thử</span>
            </button>

            <button
              type="button"
              onClick={() => onOpenResults(exam.id)}
              className="min-h-[36px] px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-black text-white text-xs font-semibold inline-flex items-center gap-1.5 tabular-nums"
            >
              <BarChart3 className="w-3.5 h-3.5 text-teal-400" />
              <span>Điểm ({examSubs.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setDeletingExam(exam)}
              className="p-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
              title="Xóa đề thi"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-5">
      {toastState && (
        <div
          className={`fixed bottom-6 right-6 z-50 px-4 py-2.5 rounded-xl shadow-xl flex items-center gap-2 text-xs font-semibold ${
            toastState.type === 'error' ? 'bg-rose-700 text-white' : 'bg-slate-900 text-white'
          }`}
        >
          <CheckCircle2
            className={`w-4 h-4 shrink-0 ${
              toastState.type === 'error' ? 'text-rose-200' : 'text-emerald-400'
            }`}
          />
          <span>{toastState.message}</span>
        </div>
      )}

      {/* Top Header Banner */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-teal-700 font-bold text-xs uppercase tracking-wider">
            <FileCheck className="w-4 h-4" />
            <span>
              {mode === 'online'
                ? 'Phòng thi trực tuyến & Mã tham gia'
                : userRole === 'admin'
                ? 'Quản trị Đề thi & Cây thư mục thống nhất'
                : 'Hệ thống quản lý Đề thi theo cây thư mục'}
            </span>
          </div>
          <h1 className="text-xl md:text-2xl font-bold text-slate-900 mt-1 tabular-nums">
            {mode === 'online'
              ? `Bài Thi Trực Tuyến (${publishedCount} đang mở)`
              : `Đề thi & Thư mục (${exams.length} đề thi)`}
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            {mode === 'online'
              ? 'Theo dõi các phòng thi đang mở, liên kết ngắn 6 ký tự, mật khẩu và lượt nộp bài.'
              : 'Tổ chức đề thi nhiều cấp theo khối lớp, chuyên đề, kỳ kiểm tra và tạo đề ngay trong thư mục đang mở.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {mode === 'all' && canManageFolders && (
            <button
              type="button"
              onClick={() => openCreateFolderModal(currentFolderId)}
              className="min-h-[42px] px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold inline-flex items-center gap-1.5"
            >
              <FolderPlus className="w-4 h-4 text-amber-600" />
              <span>{currentFolderId ? '+ Thư mục con' : '+ Tạo thư mục'}</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => onCreateNew(mode === 'all' ? currentFolderId : null)}
            className="min-h-[42px] px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold shadow-xs inline-flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>Tạo đề thi mới</span>
          </button>
        </div>
      </div>

      {/* Main Explorer Layout */}
      <div
        className={
          mode === 'all' ? 'grid grid-cols-1 lg:grid-cols-12 gap-5 items-start' : 'space-y-4'
        }
      >
        {/* LEFT PANEL: Folder Tree (mode === 'all') */}
        {mode === 'all' && (
          <aside className="lg:col-span-4 xl:col-span-3 bg-white border border-slate-200 rounded-2xl p-4 shadow-xs space-y-3">
            <div className="flex items-center justify-between pb-2.5 border-b border-slate-100">
              <button
                type="button"
                onClick={() => setShowMobileTree((v) => !v)}
                className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-700 lg:pointer-events-none"
              >
                <PanelLeft className="w-4 h-4 text-teal-600" />
                <span>Cây thư mục</span>
              </button>
              {canManageFolders && (
                <button
                  type="button"
                  onClick={() => openCreateFolderModal(null)}
                  className="text-xs font-semibold text-teal-700 hover:text-teal-900 inline-flex items-center gap-1"
                  title="Tạo thư mục ở cấp gốc"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Gốc</span>
                </button>
              )}
            </div>

            <div className={`${showMobileTree ? 'block' : 'hidden'} lg:block space-y-1`}>
              {/* Root Node: Đề thi */}
              <div
                onClick={() => navigateToFolder(null)}
                className={`flex items-center justify-between px-3 py-2 rounded-xl cursor-pointer text-xs transition-colors ${
                  currentFolderId === null
                    ? 'bg-teal-600 text-white font-semibold'
                    : 'text-slate-800 hover:bg-slate-100 font-semibold'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <FolderOpen
                    className={`w-4 h-4 shrink-0 ${
                      currentFolderId === null ? 'text-white' : 'text-teal-600'
                    }`}
                  />
                  <span className="truncate">Đề thi (Thư mục gốc)</span>
                </div>
                <span
                  className={`text-[11px] tabular-nums px-1.5 py-0.5 rounded ${
                    currentFolderId === null
                      ? 'bg-teal-700 text-white'
                      : 'bg-slate-100 text-slate-600'
                  }`}
                  title="Số đề thi nằm trực tiếp ở Thư mục gốc"
                >
                  {rootDirectExamCount}
                </span>
              </div>

              {/* Recursive Tree */}
              <div className="pt-1 max-h-[520px] overflow-y-auto pr-0.5 space-y-0.5">
                {treeNodes.length === 0 ? (
                  <p className="text-xs text-slate-400 px-3 py-3">
                    Chưa có thư mục con. Nhấn &quot;+ Tạo thư mục&quot; để bắt đầu sắp xếp.
                  </p>
                ) : (
                  renderTreeNodes(treeNodes, 0)
                )}
              </div>
            </div>
          </aside>
        )}

        {/* RIGHT PANEL: Breadcrumb + Search + Sort + Subfolders + Exams */}
        <section
          className={
            mode === 'all' ? 'lg:col-span-8 xl:col-span-9 space-y-4' : 'space-y-4'
          }
        >
          {/* Explorer Toolbar */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs space-y-3">
            {/* Breadcrumb (mode === 'all') */}
            {mode === 'all' && (
              <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-100">
                <nav
                  aria-label="Breadcrumb thư mục"
                  className="flex flex-wrap items-center gap-1.5 text-xs"
                >
                  <button
                    type="button"
                    onClick={() => navigateToFolder(null)}
                    className={`px-2 py-1 rounded-lg font-semibold transition-colors ${
                      currentFolderId === null
                        ? 'bg-teal-50 text-teal-800'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                    }`}
                  >
                    Đề thi
                  </button>
                  {breadcrumbs.map((bc, idx) => {
                    const isLast = idx === breadcrumbs.length - 1;
                    return (
                      <React.Fragment key={bc.id}>
                        <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <button
                          type="button"
                          onClick={() => navigateToFolder(bc.id)}
                          className={`px-2 py-1 rounded-lg font-semibold transition-colors max-w-[200px] truncate ${
                            isLast
                              ? 'bg-teal-50 text-teal-800'
                              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                          }`}
                        >
                          {bc.name}
                        </button>
                      </React.Fragment>
                    );
                  })}
                </nav>
                <span className="text-[11px] font-medium text-slate-500 truncate">
                  Đang mở: <strong className="text-teal-700">{getFolderPathLabel(currentFolderId, folders)}</strong>
                </span>
              </div>
            )}

            {/* Search & Sort Controls */}
            <div className="flex flex-col md:flex-row gap-2.5 text-xs">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Tìm kiếm thư mục, tên đề thi, mã đề hoặc mã link 6 ký tự..."
                  className="w-full min-h-[38px] pl-9 pr-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={sortField}
                  onChange={(e) => setSortField(e.target.value as SortField)}
                  className="min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-200 bg-white font-medium text-slate-700"
                >
                  <option value="updatedAt">Sắp xếp: Cập nhật</option>
                  <option value="createdAt">Sắp xếp: Ngày tạo</option>
                  <option value="name">Sắp xếp: Tên A-Z</option>
                </select>

                <button
                  type="button"
                  onClick={() =>
                    setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'))
                  }
                  className="min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 font-semibold text-slate-700 inline-flex items-center gap-1"
                  title="Đổi chiều sắp xếp"
                >
                  <ArrowUpDown className="w-3.5 h-3.5" />
                  <span>{sortDirection === 'asc' ? 'Tăng dần' : 'Giảm dần'}</span>
                </button>
              </div>
            </div>

            {/* Publish Status Tabs */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => setPublishFilter('all')}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors tabular-nums ${
                  publishFilter === 'all'
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                Tất cả ({exams.length})
              </button>
              <button
                type="button"
                onClick={() => setPublishFilter('published')}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors tabular-nums ${
                  publishFilter === 'published'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                }`}
              >
                Đang mở thi ({publishedCount})
              </button>
              <button
                type="button"
                onClick={() => setPublishFilter('closed')}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors tabular-nums ${
                  publishFilter === 'closed'
                    ? 'bg-amber-600 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                Đang đóng ({closedCount})
              </button>
            </div>
          </div>

          {/* Subfolders Grid (mode === 'all') */}
          {mode === 'all' && visibleFolders.length > 0 && (
            <div className="space-y-2.5">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 px-1 tabular-nums">
                {isSearching
                  ? `Thư mục khớp tìm kiếm (${visibleFolders.length})`
                  : `Thư mục con (${visibleFolders.length})`}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                {visibleFolders.map((f) => {
                  const descendants = getDescendantFolderIds(f.id, folders);
                  const recursiveCount = exams.filter((ex) => {
                    const cleanFid = normalizeFolderId(ex.folderId);
                    return Boolean(cleanFid && descendants.has(cleanFid));
                  }).length;

                  return (
                    <div
                      key={f.id}
                      onClick={() => navigateToFolder(f.id)}
                      className="group bg-white border border-slate-200 hover:border-teal-400 rounded-2xl p-4 shadow-xs cursor-pointer transition-colors flex items-start justify-between gap-3"
                    >
                      <div className="flex items-start gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200/70 flex items-center justify-center shrink-0">
                          <FolderIcon className="w-5 h-5 text-amber-500" />
                        </div>
                        <div className="min-w-0">
                          <h3 className="text-sm font-bold text-slate-900 truncate group-hover:text-teal-700">
                            {f.name}
                          </h3>
                          {f.description && (
                            <p className="text-xs text-slate-500 truncate mt-0.5">
                              {f.description}
                            </p>
                          )}
                          <p className="text-[11px] text-slate-500 mt-1 tabular-nums">
                            {recursiveCount} đề thi
                          </p>
                        </div>
                      </div>

                      {canManageFolders && (
                        <div
                          className="flex items-center gap-0.5 shrink-0"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            onClick={() => openRenameFolderModal(f)}
                            title="Đổi tên thư mục"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => openMoveFolderModal(f)}
                            title="Di chuyển thư mục"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-teal-700 hover:bg-teal-50"
                          >
                            <FolderInput className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeletingFolder(f)}
                            title="Xóa thư mục"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Exams List */}
          <div className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 tabular-nums">
                {isSearching
                  ? `Đề thi khớp tìm kiếm (${visibleExams.length})`
                  : mode === 'online'
                  ? `Danh sách đề thi (${visibleExams.length})`
                  : `Đề thi trong thư mục này (${visibleExams.length})`}
              </h2>
            </div>

            {visibleExams.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center space-y-3">
                <FileCheck className="w-10 h-10 text-slate-300 mx-auto" />
                <p className="text-sm font-medium text-slate-700">
                  {isSearching
                    ? 'Không tìm thấy đề thi phù hợp với từ khóa.'
                    : 'Chưa có đề thi nào nằm trực tiếp trong thư mục này.'}
                </p>
                {!isSearching && (
                  <button
                    type="button"
                    onClick={() => onCreateNew(mode === 'all' ? currentFolderId : null)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Tạo đề thi trong thư mục này</span>
                  </button>
                )}
              </div>
            ) : (
              visibleExams.map((exam) => renderExamCard(exam))
            )}
          </div>
        </section>
      </div>

      {/* Create / Rename Folder Modal */}
      {folderModal && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between">
              <h3 className="font-bold text-sm">
                {folderModal.mode === 'create'
                  ? folderModal.parentId
                    ? 'Tạo thư mục con mới'
                    : 'Tạo thư mục gốc mới'
                  : 'Đổi tên & Cập nhật thư mục'}
              </h3>
              <button
                type="button"
                disabled={isSavingFolder}
                onClick={() => setFolderModal(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={(e) => void handleSaveFolderModal(e)} className="p-5 space-y-4 text-xs">
              {folderModal.mode === 'create' && (
                <p className="text-slate-500">
                  Vị trí:{' '}
                  <strong className="text-slate-800">
                    {getFolderPathLabel(folderModal.parentId, folders)}
                  </strong>
                </p>
              )}
              {folderModalError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 font-semibold">
                  {folderModalError}
                </div>
              )}
              <div>
                <label className="block font-bold text-slate-700 mb-1">Tên thư mục *</label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={folderNameInput}
                  onChange={(e) => setFolderNameInput(e.target.value)}
                  placeholder="VD: Lớp 12, Kiểm tra Giữa kì 1, Chuyên đề Ester..."
                  className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Mô tả (tùy chọn)</label>
                <textarea
                  rows={2}
                  value={folderDescInput}
                  onChange={(e) => setFolderDescInput(e.target.value)}
                  placeholder="Ghi chú ngắn cho thư mục..."
                  className="w-full p-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  disabled={isSavingFolder}
                  onClick={() => setFolderModal(null)}
                  className="min-h-[38px] px-4 py-1.5 rounded-xl border border-slate-200 text-slate-700 font-semibold"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSavingFolder}
                  className="min-h-[38px] px-4 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white font-semibold"
                >
                  {isSavingFolder
                    ? 'Đang lưu...'
                    : folderModal.mode === 'create'
                    ? 'Tạo thư mục'
                    : 'Lưu thay đổi'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Move Folder Modal */}
      {movingFolder && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between">
              <h3 className="font-bold text-sm">Di chuyển thư mục &quot;{movingFolder.name}&quot;</h3>
              <button
                type="button"
                disabled={isMovingFolder}
                onClick={() => setMovingFolder(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={(e) => void handleConfirmMoveFolder(e)} className="p-5 space-y-4 text-xs">
              {moveFolderError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 font-semibold">
                  {moveFolderError}
                </div>
              )}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Chọn thư mục cha đích
                </label>
                <select
                  value={moveFolderTargetId}
                  onChange={(e) => setMoveFolderTargetId(e.target.value)}
                  className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-slate-300 bg-white font-medium"
                >
                  <option value="">Đề thi (Thư mục gốc)</option>
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
                <p className="text-[11px] text-slate-500 mt-1.5">
                  Hệ thống tự động loại trừ chính thư mục này và các thư mục con của nó để tránh vòng lặp.
                </p>
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  disabled={isMovingFolder}
                  onClick={() => setMovingFolder(null)}
                  className="min-h-[38px] px-4 py-1.5 rounded-xl border border-slate-200 text-slate-700 font-semibold"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isMovingFolder}
                  className="min-h-[38px] px-4 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white font-semibold"
                >
                  {isMovingFolder ? 'Đang chuyển...' : 'Di chuyển'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Exam Metadata & Move Exam Folder Modal */}
      {editingExamMeta && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between">
              <h3 className="font-bold text-sm">
                Cập nhật thông tin &amp; Vị trí đề thi ({editingExamMeta.code})
              </h3>
              <button
                type="button"
                disabled={isSavingMeta}
                onClick={() => setEditingExamMeta(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={(e) => void handleSaveExamMeta(e)} className="p-5 space-y-4 text-xs">
              {metaModalError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 font-semibold">
                  {metaModalError}
                </div>
              )}
              <div>
                <label className="block font-bold text-slate-700 mb-1">Tiêu đề đề thi *</label>
                <input
                  type="text"
                  required
                  value={examTitleInput}
                  onChange={(e) => setExamTitleInput(e.target.value)}
                  className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-slate-300 font-semibold"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Mô tả ngắn</label>
                <textarea
                  rows={2}
                  value={examDescInput}
                  onChange={(e) => setExamDescInput(e.target.value)}
                  placeholder="Ghi chú phạm vi kiến thức..."
                  className="w-full p-2.5 rounded-xl border border-slate-300"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Thư mục lưu trữ</label>
                <select
                  value={examFolderTargetId}
                  onChange={(e) => setExamFolderTargetId(e.target.value)}
                  className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-slate-300 bg-white font-medium"
                >
                  <option value="">Đề thi (Thư mục gốc)</option>
                  {flatFolders.map((item) => (
                    <option key={item.folder.id} value={item.folder.id}>
                      {'\u00A0'.repeat(item.depth * 3)}
                      {item.depth > 0 ? '↳ ' : ''}
                      {item.folder.name}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-500 mt-1.5">
                  Mã đề ({editingExamMeta.code})
                  {normalizePublicExamCode(editingExamMeta.publicCode)
                    ? ` và link rút gọn /${normalizePublicExamCode(editingExamMeta.publicCode)}`
                    : ''}{' '}
                  sẽ được giữ nguyên hoàn toàn khi di chuyển thư mục.
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  disabled={isSavingMeta}
                  onClick={() => setEditingExamMeta(null)}
                  className="min-h-[38px] px-4 py-1.5 rounded-xl border border-slate-200 text-slate-700 font-semibold"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSavingMeta}
                  className="min-h-[38px] px-4 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white font-semibold"
                >
                  {isSavingMeta ? 'Đang lưu...' : 'Lưu cập nhật'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Folder Confirmation */}
      <ConfirmDialog
        isOpen={!!deletingFolder}
        title={`Xóa thư mục "${deletingFolder?.name || ''}"?`}
        message={
          deletingFolder
            ? `Thư mục "${deletingFolder.name}" sẽ bị xóa. Các thư mục con và đề thi nằm trực tiếp bên trong (nếu có) sẽ được tự động đưa ra thư mục cha để đảm bảo không mất dữ liệu hay kết quả thi.`
            : ''
        }
        confirmLabel="Xóa thư mục"
        variant="warning"
        onConfirm={() => void handleConfirmDeleteFolder()}
        onCancel={() => setDeletingFolder(null)}
      />

      {/* Delete Exam Confirmation */}
      <ConfirmDialog
        isOpen={!!deletingExam}
        title={`Xóa đề thi "${deletingExam?.title || ''}"?`}
        message={`Bạn có chắc muốn xóa đề thi "${deletingExam?.title || ''}" (Mã: ${
          deletingExam?.code || ''
        })? Hành động này không thể hoàn tác.`}
        confirmLabel="Xóa đề thi"
        onConfirm={() => {
          if (deletingExam) {
            onDeleteExam(deletingExam.id);
            showToast(`Đã xóa đề thi ${deletingExam.code}`);
          }
          setDeletingExam(null);
        }}
        onCancel={() => setDeletingExam(null)}
      />

      {/* Share & QR Modal */}
      <ExamShareModal
        isOpen={!!activeShareExam}
        exam={
          activeShareExam ? exams.find((e) => e.id === activeShareExam.id) || activeShareExam : null
        }
        onClose={() => setActiveShareExam(null)}
        onTogglePublish={onTogglePublish}
        onExamUpdated={(updatedExam) => {
          onExamUpdated?.(updatedExam);
        }}
      />

      {/* Security & Floor Score Modal */}
      <ExamSecurityModal
        isOpen={!!activeSecurityExam}
        exam={
          activeSecurityExam
            ? exams.find((e) => e.id === activeSecurityExam.id) || activeSecurityExam
            : null
        }
        onClose={() => setActiveSecurityExam(null)}
        onExamUpdated={(updatedExam) => {
          onExamUpdated?.(updatedExam);
        }}
      />
    </div>
  );
};
