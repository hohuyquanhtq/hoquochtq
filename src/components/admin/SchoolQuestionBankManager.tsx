import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Copy,
  Database,
  Edit3,
  Eye,
  FilePlus2,
  Filter,
  History,
  Layers,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldAlert,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import type {
  AdminQuestionAuditLog,
  AdminQuestionBankFilterParams,
  AdminQuestionBankResponse,
  AdminSchoolQuestionItem,
  CognitiveLevel,
  QuestionType,
  SubjectItem,
  User,
} from '../../types';
import {
  copyTeacherQuestionToAdminBankOnServer,
  deleteOriginalTeacherQuestionOnServer,
  editOriginalTeacherQuestionOnServer,
  fetchAdminQuestionAuditLogsOnServer,
  fetchSchoolQuestionBankOnServer,
} from '../../services/adminQuestionBankApi';
import { ChemRenderer } from '../../utils/chemRenderer';

export interface SchoolQuestionBankManagerProps {
  currentUser: User;
  subjects: SubjectItem[];
  onCreateExamFromQuestions: (questions: AdminSchoolQuestionItem[], suggestedTitle?: string) => void;
  onPersonalBankUpdated: () => Promise<void> | void;
}

const LEVEL_LABELS: Record<CognitiveLevel, string> = {
  nhan_biet: 'Nhận biết',
  thong_hieu: 'Thông hiểu',
  van_dung: 'Vận dụng',
  van_dung_cao: 'Vận dụng cao',
};

const TYPE_LABELS: Record<QuestionType, string> = {
  part1_single_choice: 'Trắc nghiệm nhiều lựa chọn',
  part1_multiple_choice: 'Trắc nghiệm nhiều lựa chọn (nhiều đáp án)',
  part2_true_false: 'Trắc nghiệm đúng/sai',
  part3_short_answer: 'Trắc nghiệm trả lời ngắn',
  essay: 'Tự luận',
};

const GRADE_LABELS: Record<string, string> = {
  '10': 'Lớp 10',
  '11': 'Lớp 11',
  '12': 'Lớp 12',
  chuyen_hsg: 'Chuyên / HSG',
};

function formatDateTimeVi(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDateShortVi(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('vi-VN');
}

function getPercentWidthClass(pct: number): string {
  if (pct >= 95) return 'w-full';
  if (pct >= 85) return 'w-11/12';
  if (pct >= 75) return 'w-9/12';
  if (pct >= 65) return 'w-8/12';
  if (pct >= 55) return 'w-7/12';
  if (pct >= 45) return 'w-6/12';
  if (pct >= 35) return 'w-5/12';
  if (pct >= 25) return 'w-4/12';
  if (pct >= 18) return 'w-3/12';
  if (pct >= 10) return 'w-2/12';
  return 'w-1/12';
}

export const SchoolQuestionBankManager: React.FC<SchoolQuestionBankManagerProps> = ({
  currentUser,
  onCreateExamFromQuestions,
  onPersonalBankUpdated,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'stats' | 'questions' | 'audit'>('stats');
  const [bankData, setBankData] = useState<AdminQuestionBankResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);

  // Filter state
  const [selectedTeacherIds, setSelectedTeacherIds] = useState<string[]>([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>('all');
  const [selectedGrade, setSelectedGrade] = useState<string>('all');
  const [selectedTextbook, setSelectedTextbook] = useState<string>('all');
  const [selectedChapter, setSelectedChapter] = useState<string>('all');
  const [selectedLesson, setSelectedLesson] = useState<string>('all');
  const [selectedLevel, setSelectedLevel] = useState<string>('all');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [searchInput, setSearchInput] = useState<string>('');
  const [debouncedSearch, setDebouncedSearch] = useState<string>('');
  const [sortBy, setSortBy] = useState<AdminQuestionBankFilterParams['sortBy']>('updatedAt_desc');
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(20);

  // Stats table search
  const [statsTableSearch, setStatsTableSearch] = useState<string>('');
  const [chapterSearch, setChapterSearch] = useState<string>('');

  // Selection for multi-teacher exam creation
  const [selectedQuestionsMap, setSelectedQuestionsMap] = useState<Record<string, AdminSchoolQuestionItem>>({});

  // Detail modal
  const [viewingQuestion, setViewingQuestion] = useState<AdminSchoolQuestionItem | null>(null);

  // Copy loading
  const [copyingId, setCopyingId] = useState<string | null>(null);

  // Privileged Edit Original modal
  const [editingOriginal, setEditingOriginal] = useState<AdminSchoolQuestionItem | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editExplanation, setEditExplanation] = useState('');
  const [editLevel, setEditLevel] = useState<CognitiveLevel>('nhan_biet');
  const [editChapterName, setEditChapterName] = useState('');
  const [editLessonName, setEditLessonName] = useState('');
  const [editReason, setEditReason] = useState('');
  const [editConfirmed, setEditConfirmed] = useState(false);
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);

  // Privileged Delete Original modal
  const [deletingOriginal, setDeletingOriginal] = useState<AdminSchoolQuestionItem | null>(null);
  const [deleteReason, setDeleteReason] = useState('');
  const [deleteConfirmed, setDeleteConfirmed] = useState(false);
  const [isSubmittingDelete, setIsSubmittingDelete] = useState(false);

  // Audit logs
  const [auditLogs, setAuditLogs] = useState<AdminQuestionAuditLog[]>([]);
  const [isLoadingAudit, setIsLoadingAudit] = useState(false);

  // Debounce keyword search
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
      setPage(1);
    }, 280);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const currentFilters = useMemo<AdminQuestionBankFilterParams>(
    () => ({
      ...(selectedTeacherIds.length > 0 ? { teacherIds: selectedTeacherIds } : {}),
      ...(selectedSubjectId !== 'all' ? { subjectIds: [selectedSubjectId] } : {}),
      ...(selectedGrade !== 'all' ? { grades: [selectedGrade] } : {}),
      ...(selectedTextbook !== 'all' ? { textbookSeries: selectedTextbook } : {}),
      ...(selectedChapter !== 'all' ? { chapter: selectedChapter } : {}),
      ...(selectedLesson !== 'all' ? { lesson: selectedLesson } : {}),
      ...(selectedLevel !== 'all' ? { levels: [selectedLevel as CognitiveLevel] } : {}),
      ...(selectedType !== 'all' ? { types: [selectedType as QuestionType] } : {}),
      ...(dateFrom ? { dateFrom } : {}),
      ...(dateTo ? { dateTo } : {}),
      ...(debouncedSearch ? { search: debouncedSearch } : {}),
      sortBy,
      page,
      pageSize,
    }),
    [
      selectedTeacherIds,
      selectedSubjectId,
      selectedGrade,
      selectedTextbook,
      selectedChapter,
      selectedLesson,
      selectedLevel,
      selectedType,
      dateFrom,
      dateTo,
      debouncedSearch,
      sortBy,
      page,
      pageSize,
    ]
  );

  const loadSchoolBank = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const data = await fetchSchoolQuestionBankOnServer(currentFilters);
      setBankData(data);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Không thể tải Ngân hàng câu hỏi toàn trường.');
    } finally {
      setIsLoading(false);
    }
  }, [currentFilters]);

  useEffect(() => {
    void loadSchoolBank();
  }, [loadSchoolBank]);

  const loadAuditLogs = useCallback(async () => {
    setIsLoadingAudit(true);
    try {
      const logs = await fetchAdminQuestionAuditLogsOnServer();
      setAuditLogs(logs);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Không thể tải nhật ký kiểm duyệt.');
    } finally {
      setIsLoadingAudit(false);
    }
  }, []);

  useEffect(() => {
    if (activeSubTab === 'audit') {
      void loadAuditLogs();
    }
  }, [activeSubTab, loadAuditLogs]);

  const resetAllFilters = () => {
    setSelectedTeacherIds([]);
    setSelectedSubjectId('all');
    setSelectedGrade('all');
    setSelectedTextbook('all');
    setSelectedChapter('all');
    setSelectedLesson('all');
    setSelectedLevel('all');
    setSelectedType('all');
    setDateFrom('');
    setDateTo('');
    setSearchInput('');
    setDebouncedSearch('');
    setSortBy('updatedAt_desc');
    setPage(1);
  };

  const drillDownToQuestions = (preset: {
    teacherUid?: string;
    subjectId?: string;
    grade?: string;
    chapterKey?: string;
    lessonKey?: string;
    level?: CognitiveLevel;
    type?: QuestionType;
  }) => {
    setSelectedTeacherIds(preset.teacherUid ? [preset.teacherUid] : []);
    setSelectedSubjectId(preset.subjectId || 'all');
    setSelectedGrade(preset.grade || 'all');
    setSelectedTextbook('all');
    setSelectedChapter(preset.chapterKey || 'all');
    setSelectedLesson(preset.lessonKey || 'all');
    setSelectedLevel(preset.level || 'all');
    setSelectedType(preset.type || 'all');
    setDateFrom('');
    setDateTo('');
    setSearchInput('');
    setDebouncedSearch('');
    setPage(1);
    setActiveSubTab('questions');
  };

  const availableChapters = useMemo(() => {
    const all = bankData?.filterOptions.chapters || [];
    return all.filter((c) => {
      if (selectedSubjectId !== 'all' && c.subjectId !== selectedSubjectId) return false;
      if (selectedGrade !== 'all' && c.grade !== selectedGrade) return false;
      return true;
    });
  }, [bankData?.filterOptions.chapters, selectedSubjectId, selectedGrade]);

  const availableLessons = useMemo(() => {
    const all = bankData?.filterOptions.lessons || [];
    return all.filter((l) => {
      if (selectedSubjectId !== 'all' && l.subjectId !== selectedSubjectId) return false;
      if (selectedGrade !== 'all' && l.grade !== selectedGrade) return false;
      if (selectedChapter !== 'all' && l.chapterKey !== selectedChapter) return false;
      return true;
    });
  }, [bankData?.filterOptions.lessons, selectedSubjectId, selectedGrade, selectedChapter]);

  const selectedItems = useMemo(
    () => Object.values(selectedQuestionsMap),
    [selectedQuestionsMap]
  );

  const selectedTeachersCount = useMemo(() => {
    return new Set(selectedItems.map((q) => q.ownerUid)).size;
  }, [selectedItems]);

  const toggleSelectQuestion = (item: AdminSchoolQuestionItem) => {
    setSelectedQuestionsMap((prev) => {
      const next = { ...prev };
      if (next[item.id]) {
        delete next[item.id];
      } else {
        next[item.id] = item;
      }
      return next;
    });
  };

  const toggleSelectAllOnPage = () => {
    const pageItems = bankData?.items || [];
    if (pageItems.length === 0) return;
    const allSelected = pageItems.every((it) => Boolean(selectedQuestionsMap[it.id]));
    setSelectedQuestionsMap((prev) => {
      const next = { ...prev };
      if (allSelected) {
        pageItems.forEach((it) => delete next[it.id]);
      } else {
        pageItems.forEach((it) => {
          next[it.id] = it;
        });
      }
      return next;
    });
  };

  const handleCopyToAdminBank = async (item: AdminSchoolQuestionItem) => {
    setCopyingId(item.id);
    setErrorMessage(null);
    setNoticeMessage(null);
    try {
      const res = await copyTeacherQuestionToAdminBankOnServer(item.id);
      setNoticeMessage(
        `${res.message} (Mã bản sao mới: ${res.copiedQuestion.code} — bản gốc của ${item.ownerName} hoàn toàn không thay đổi).`
      );
      await onPersonalBankUpdated();
      await loadSchoolBank();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Không thể sao chép câu hỏi.');
    } finally {
      setCopyingId(null);
    }
  };

  const openEditOriginalModal = (item: AdminSchoolQuestionItem) => {
    setEditingOriginal(item);
    setEditContent(item.content || '');
    setEditExplanation(item.explanation || '');
    setEditLevel(item.level || 'nhan_biet');
    setEditChapterName(item.chapterName || '');
    setEditLessonName(item.lessonName || item.lessonTopic || '');
    setEditReason('');
    setEditConfirmed(false);
  };

  const handleConfirmEditOriginal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingOriginal || !editConfirmed || editReason.trim().length < 5) return;
    setIsSubmittingEdit(true);
    setErrorMessage(null);
    setNoticeMessage(null);
    try {
      const res = await editOriginalTeacherQuestionOnServer({
        questionId: editingOriginal.id,
        reason: editReason.trim(),
        updates: {
          content: editContent.trim(),
          explanation: editExplanation.trim(),
          level: editLevel,
          chapterName: editChapterName.trim(),
          lessonName: editLessonName.trim(),
        },
      });
      setNoticeMessage(`${res.message} (Audit ID: ${res.auditLogId}).`);
      setEditingOriginal(null);
      setViewingQuestion(null);
      await loadSchoolBank();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Không thể chỉnh sửa câu hỏi gốc.');
    } finally {
      setIsSubmittingEdit(false);
    }
  };

  const openDeleteOriginalModal = (item: AdminSchoolQuestionItem) => {
    setDeletingOriginal(item);
    setDeleteReason('');
    setDeleteConfirmed(false);
  };

  const handleConfirmDeleteOriginal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deletingOriginal || !deleteConfirmed || deleteReason.trim().length < 5) return;
    setIsSubmittingDelete(true);
    setErrorMessage(null);
    setNoticeMessage(null);
    try {
      const res = await deleteOriginalTeacherQuestionOnServer({
        questionId: deletingOriginal.id,
        reason: deleteReason.trim(),
      });
      setNoticeMessage(`${res.message} (Audit ID: ${res.auditLogId}).`);
      setSelectedQuestionsMap((prev) => {
        const next = { ...prev };
        delete next[deletingOriginal.id];
        return next;
      });
      setDeletingOriginal(null);
      setViewingQuestion(null);
      await loadSchoolBank();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Không thể xóa câu hỏi gốc.');
    } finally {
      setIsSubmittingDelete(false);
    }
  };

  const stats = bankData?.stats;

  const filteredTsgRows = useMemo(() => {
    const rows = stats?.teacherSubjectGradeRows || [];
    const kw = statsTableSearch.trim().toLowerCase();
    if (!kw) return rows;
    return rows.filter(
      (r) =>
        r.teacherName.toLowerCase().includes(kw) ||
        r.teacherEmail.toLowerCase().includes(kw) ||
        r.subjectName.toLowerCase().includes(kw) ||
        r.grade.toLowerCase().includes(kw)
    );
  }, [stats?.teacherSubjectGradeRows, statsTableSearch]);

  const filteredChapterStats = useMemo(() => {
    const rows = stats?.byChapterLesson || [];
    const kw = chapterSearch.trim().toLowerCase();
    if (!kw) return rows.slice(0, 60);
    return rows
      .filter(
        (r) =>
          r.subjectName.toLowerCase().includes(kw) ||
          r.chapterName.toLowerCase().includes(kw) ||
          r.lessonName.toLowerCase().includes(kw)
      )
      .slice(0, 60);
  }, [stats?.byChapterLesson, chapterSearch]);

  const hasActiveFilters =
    selectedTeacherIds.length > 0 ||
    selectedSubjectId !== 'all' ||
    selectedGrade !== 'all' ||
    selectedTextbook !== 'all' ||
    selectedChapter !== 'all' ||
    selectedLesson !== 'all' ||
    selectedLevel !== 'all' ||
    selectedType !== 'all' ||
    Boolean(dateFrom) ||
    Boolean(dateTo) ||
    Boolean(debouncedSearch);

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-teal-700">
              Quyền Super Admin · Kiểm soát chất lượng toàn trường
            </p>
            <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
              Ngân hàng câu hỏi toàn trường
            </h1>
            <p className="text-sm text-slate-600">
              Quản trị viên <span className="font-semibold text-slate-800">{currentUser.name}</span> có thể xem, thống kê, lọc và kết hợp câu hỏi từ nhiều giáo viên vào cùng một đề thi mà không làm ảnh hưởng dữ liệu gốc.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => void loadSchoolBank()}
              disabled={isLoading}
              className="inline-flex items-center gap-2 px-4 py-2.5 min-h-[44px] rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-sm font-semibold transition-colors disabled:opacity-60"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              Làm mới dữ liệu
            </button>
            {selectedItems.length > 0 && (
              <button
                type="button"
                onClick={() =>
                  onCreateExamFromQuestions(
                    selectedItems,
                    `Đề tổng hợp toàn trường (${selectedItems.length} câu · ${selectedTeachersCount} GV)`
                  )
                }
                className="inline-flex items-center gap-2 px-4 py-2.5 min-h-[44px] rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-sm font-bold shadow-xs transition-colors"
              >
                <FilePlus2 className="w-4 h-4" />
                Tạo đề từ {selectedItems.length} câu đã chọn
              </button>
            )}
          </div>
        </div>

        {/* Sub-tab Switcher */}
        <div className="mt-5 pt-4 border-t border-slate-200 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveSubTab('stats')}
            className={`inline-flex items-center gap-2 px-4 py-2 min-h-[42px] rounded-xl text-sm font-semibold transition-colors ${
              activeSubTab === 'stats'
                ? 'bg-slate-900 text-white'
                : 'text-slate-700 hover:bg-slate-100'
            }`}
          >
            <Layers className="w-4 h-4" />
            Tổng quan &amp; Thống kê toàn trường
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab('questions')}
            className={`inline-flex items-center gap-2 px-4 py-2 min-h-[42px] rounded-xl text-sm font-semibold transition-colors ${
              activeSubTab === 'questions'
                ? 'bg-slate-900 text-white'
                : 'text-slate-700 hover:bg-slate-100'
            }`}
          >
            <Database className="w-4 h-4" />
            Danh sách câu hỏi ({bankData?.totalFiltered ?? 0})
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab('audit')}
            className={`inline-flex items-center gap-2 px-4 py-2 min-h-[42px] rounded-xl text-sm font-semibold transition-colors ${
              activeSubTab === 'audit'
                ? 'bg-slate-900 text-white'
                : 'text-slate-700 hover:bg-slate-100'
            }`}
          >
            <History className="w-4 h-4" />
            Nhật ký quản trị câu hỏi
          </button>
        </div>
      </div>

      {/* Feedback banners */}
      {errorMessage && (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 rounded-xl px-4 py-3 text-sm flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-rose-600 mt-0.5 shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            className="text-rose-700 hover:text-rose-950 font-semibold text-xs shrink-0"
          >
            Đóng
          </button>
        </div>
      )}

      {noticeMessage && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-xl px-4 py-3 text-sm flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
            <span>{noticeMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setNoticeMessage(null)}
            className="text-emerald-700 hover:text-emerald-950 font-semibold text-xs shrink-0"
          >
            Đóng
          </button>
        </div>
      )}

      {/* ==================== TAB 1: STATISTICS DASHBOARD ==================== */}
      {activeSubTab === 'stats' && (
        <div className="space-y-6">
          {/* Top 4 KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-600">Tổng câu hỏi toàn trường</span>
                <Database className="w-5 h-5 text-teal-600" />
              </div>
              <p className="mt-2 text-3xl font-extrabold text-slate-900 tabular-nums">
                {stats ? stats.totalQuestions.toLocaleString('vi-VN') : '—'}
              </p>
              <button
                type="button"
                onClick={() => drillDownToQuestions({})}
                className="mt-2 text-xs font-semibold text-teal-700 hover:text-teal-900"
              >
                Xem toàn bộ câu hỏi →
              </button>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-600">Giáo viên có câu hỏi</span>
                <Users className="w-5 h-5 text-indigo-600" />
              </div>
              <p className="mt-2 text-3xl font-extrabold text-slate-900 tabular-nums">
                {stats ? stats.totalTeachersWithQuestions.toLocaleString('vi-VN') : '—'}
              </p>
              <p className="mt-2 text-xs text-slate-500">
                Tổng hợp từ dữ liệu thật trên Firestore
              </p>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-600">Môn học có dữ liệu</span>
                <BookOpen className="w-5 h-5 text-sky-600" />
              </div>
              <p className="mt-2 text-3xl font-extrabold text-slate-900 tabular-nums">
                {stats ? stats.bySubject.length.toLocaleString('vi-VN') : '—'}
              </p>
              <p className="mt-2 text-xs text-slate-500">
                {stats?.bySubject[0]
                  ? `Nhiều nhất: ${stats.bySubject[0].subjectName} (${stats.bySubject[0].count})`
                  : 'Chưa có câu hỏi'}
              </p>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-600">Chương / Bài học đã phủ</span>
                <Layers className="w-5 h-5 text-amber-600" />
              </div>
              <p className="mt-2 text-3xl font-extrabold text-slate-900 tabular-nums">
                {stats ? stats.byChapterLesson.length.toLocaleString('vi-VN') : '—'}
              </p>
              <p className="mt-2 text-xs text-slate-500">
                Phân bổ chuẩn theo danh mục SGK
              </p>
            </div>
          </div>

          {/* Interactive Teacher x Subject x Grade Summary Table (Required in Section II.2) */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
            <div className="p-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Bảng tổng hợp theo Giáo viên · Môn học · Lớp
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Nhấn trực tiếp vào cột <strong>Số câu hỏi</strong> để lọc và xem toàn bộ câu hỏi của giáo viên theo môn và khối lớp tương ứng.
                </p>
              </div>
              <div className="relative w-full sm:w-72">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={statsTableSearch}
                  onChange={(e) => setStatsTableSearch(e.target.value)}
                  placeholder="Tìm giáo viên, môn học, lớp..."
                  className="w-full pl-9 pr-3 py-2 min-h-[40px] rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600 uppercase">
                  <tr>
                    <th className="px-5 py-3">Giáo viên</th>
                    <th className="px-5 py-3">Môn học</th>
                    <th className="px-5 py-3">Lớp</th>
                    <th className="px-5 py-3 text-right">Số câu hỏi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredTsgRows.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-5 py-8 text-center text-slate-500">
                        {isLoading ? 'Đang tải thống kê từ Firestore...' : 'Không có dữ liệu phù hợp.'}
                      </td>
                    </tr>
                  ) : (
                    filteredTsgRows.map((row) => (
                      <tr
                        key={`${row.teacherUid}_${row.subjectId}_${row.grade}`}
                        className="hover:bg-slate-50/80 transition-colors"
                      >
                        <td className="px-5 py-3">
                          <div className="font-semibold text-slate-900">{row.teacherName}</div>
                          {row.teacherEmail && (
                            <div className="text-xs text-slate-500">{row.teacherEmail}</div>
                          )}
                        </td>
                        <td className="px-5 py-3 font-medium text-slate-800">{row.subjectName}</td>
                        <td className="px-5 py-3 text-slate-700">
                          {GRADE_LABELS[row.grade] || `Lớp ${row.grade}`}
                        </td>
                        <td className="px-5 py-3 text-right">
                          <button
                            type="button"
                            onClick={() =>
                              drillDownToQuestions({
                                teacherUid: row.teacherUid,
                                subjectId: row.subjectId,
                                grade: row.grade,
                              })
                            }
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-50 hover:bg-teal-100 text-teal-800 font-bold tabular-nums transition-colors"
                            title={`Xem ${row.count} câu hỏi môn ${row.subjectName} (${GRADE_LABELS[row.grade] || row.grade}) của ${row.teacherName}`}
                          >
                            <span>{row.count.toLocaleString('vi-VN')}</span>
                            <ChevronRight className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* 4 Breakdown Cards: Subject, Grade, Level, Type */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* By Subject */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-3">
              <h3 className="text-sm font-bold text-slate-900">Phân bổ theo Môn học</h3>
              <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                {(stats?.bySubject || []).map((item) => {
                  const pct = stats?.totalQuestions
                    ? Math.round((item.count / stats.totalQuestions) * 100)
                    : 0;
                  return (
                    <button
                      key={item.subjectId}
                      type="button"
                      onClick={() => drillDownToQuestions({ subjectId: item.subjectId })}
                      className="w-full text-left group space-y-1"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-slate-800 group-hover:text-teal-700">
                          {item.subjectName}
                        </span>
                        <span className="text-slate-600 tabular-nums">
                          <strong className="text-slate-900">{item.count}</strong> ({pct}%)
                        </span>
                      </div>
                      <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full bg-teal-600 rounded-full transition-all ${getPercentWidthClass(pct)}`}
                        />
                      </div>
                    </button>
                  );
                })}
                {(!stats || stats.bySubject.length === 0) && (
                  <p className="text-xs text-slate-500">Chưa có dữ liệu môn học.</p>
                )}
              </div>
            </div>

            {/* By Teacher Total */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-3">
              <h3 className="text-sm font-bold text-slate-900">Tổng số câu hỏi theo từng Giáo viên</h3>
              <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                {(stats?.byTeacher || []).map((t) => {
                  const pct = stats?.totalQuestions
                    ? Math.round((t.questionCount / stats.totalQuestions) * 100)
                    : 0;
                  return (
                    <button
                      key={t.uid}
                      type="button"
                      onClick={() => drillDownToQuestions({ teacherUid: t.uid })}
                      className="w-full text-left group space-y-1"
                    >
                      <div className="flex items-center justify-between text-xs gap-2">
                        <span className="font-semibold text-slate-800 group-hover:text-teal-700 truncate">
                          {t.name}
                          {t.email ? <span className="text-slate-400 font-normal"> · {t.email}</span> : null}
                        </span>
                        <span className="text-slate-600 tabular-nums shrink-0">
                          <strong className="text-slate-900">{t.questionCount}</strong> ({pct}%)
                        </span>
                      </div>
                      <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full bg-indigo-600 rounded-full transition-all ${getPercentWidthClass(pct)}`}
                        />
                      </div>
                    </button>
                  );
                })}
                {(!stats || stats.byTeacher.length === 0) && (
                  <p className="text-xs text-slate-500">Chưa có giáo viên nào tạo câu hỏi.</p>
                )}
              </div>
            </div>

            {/* By Grade & Level */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900 mb-2.5">Phân bổ theo Khối lớp</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {(stats?.byGrade || []).map((g) => (
                    <button
                      key={g.grade}
                      type="button"
                      onClick={() => drillDownToQuestions({ grade: g.grade })}
                      className="p-3 rounded-xl border border-slate-200 hover:border-teal-500 hover:bg-teal-50/40 text-left transition-colors"
                    >
                      <div className="text-xs text-slate-600">
                        {GRADE_LABELS[g.grade] || `Lớp ${g.grade}`}
                      </div>
                      <div className="text-xl font-extrabold text-slate-900 tabular-nums mt-0.5">
                        {g.count}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100">
                <h3 className="text-sm font-bold text-slate-900 mb-2.5">
                  Phân bổ theo Mức độ nhận thức
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {(stats?.byLevel || []).map((lv) => (
                    <button
                      key={lv.level}
                      type="button"
                      onClick={() => drillDownToQuestions({ level: lv.level })}
                      className="p-3 rounded-xl border border-slate-200 hover:border-teal-500 hover:bg-teal-50/40 text-left transition-colors"
                    >
                      <div className="text-xs text-slate-600">{LEVEL_LABELS[lv.level]}</div>
                      <div className="text-xl font-extrabold text-slate-900 tabular-nums mt-0.5">
                        {lv.count}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* By Question Type */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-3">
              <h3 className="text-sm font-bold text-slate-900">Phân bổ theo Dạng câu hỏi</h3>
              <div className="space-y-2.5">
                {(stats?.byType || []).map((tp) => {
                  const pct = stats?.totalQuestions
                    ? Math.round((tp.count / stats.totalQuestions) * 100)
                    : 0;
                  return (
                    <button
                      key={tp.type}
                      type="button"
                      onClick={() => drillDownToQuestions({ type: tp.type })}
                      className="w-full flex items-center justify-between p-3 rounded-xl border border-slate-200 hover:border-teal-500 hover:bg-teal-50/40 transition-colors"
                    >
                      <span className="text-xs font-semibold text-slate-800">
                        {TYPE_LABELS[tp.type]}
                      </span>
                      <span className="text-sm font-extrabold text-slate-900 tabular-nums">
                        {tp.count} <span className="text-xs font-medium text-slate-500">({pct}%)</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* By Chapter & Lesson Breakdown */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
            <div className="p-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Thống kê chi tiết theo Chương &amp; Bài học
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Hiển thị tối đa 60 chương/bài học có số lượng câu hỏi lớn nhất.
                </p>
              </div>
              <div className="relative w-full sm:w-64">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={chapterSearch}
                  onChange={(e) => setChapterSearch(e.target.value)}
                  placeholder="Lọc chương / bài học..."
                  className="w-full pl-9 pr-3 py-2 min-h-[38px] rounded-xl border border-slate-300 text-xs focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
            </div>
            <div className="overflow-x-auto max-h-80">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase sticky top-0">
                  <tr>
                    <th className="px-4 py-2.5">Môn học</th>
                    <th className="px-4 py-2.5">Lớp</th>
                    <th className="px-4 py-2.5">Chương</th>
                    <th className="px-4 py-2.5">Bài học / Chủ đề</th>
                    <th className="px-4 py-2.5 text-right">Số câu</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredChapterStats.map((row) => (
                    <tr
                      key={`${row.subjectId}_${row.grade}_${row.chapterKey}_${row.lessonKey}`}
                      className="hover:bg-slate-50"
                    >
                      <td className="px-4 py-2.5 font-medium text-slate-800">{row.subjectName}</td>
                      <td className="px-4 py-2.5 text-slate-600">
                        {GRADE_LABELS[row.grade] || row.grade}
                      </td>
                      <td className="px-4 py-2.5 text-slate-700">{row.chapterName}</td>
                      <td className="px-4 py-2.5 text-slate-700">{row.lessonName}</td>
                      <td className="px-4 py-2.5 text-right">
                        <button
                          type="button"
                          onClick={() =>
                            drillDownToQuestions({
                              subjectId: row.subjectId,
                              grade: row.grade,
                              chapterKey: row.chapterKey,
                              lessonKey: row.lessonKey,
                            })
                          }
                          className="font-bold text-teal-700 hover:underline tabular-nums"
                        >
                          {row.count}
                        </button>
                      </td>
                    </tr>
                  ))}
                  {filteredChapterStats.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                        Chưa có thống kê chương / bài học phù hợp.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ==================== TAB 2: SCHOOL-WIDE QUESTION LIST ==================== */}
      {activeSubTab === 'questions' && (
        <div className="space-y-4">
          {/* Filter Panel */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
                <Filter className="w-4 h-4 text-teal-600" />
                Bộ lọc tìm kiếm toàn trường
              </div>
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={resetAllFilters}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-700 hover:text-rose-900"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Đặt lại bộ lọc
                </button>
              )}
            </div>

            {/* Row 1: Search + Teacher + Subject + Grade */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Tìm nội dung, mã câu, lời giải, GV..."
                  className="w-full pl-9 pr-3 py-2 min-h-[42px] rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <select
                value={selectedTeacherIds.length === 1 ? selectedTeacherIds[0] : 'all'}
                onChange={(e) => {
                  const val = e.target.value;
                  setSelectedTeacherIds(val === 'all' ? [] : [val]);
                  setPage(1);
                }}
                className="w-full px-3 py-2 min-h-[42px] rounded-xl border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                aria-label="Lọc theo giáo viên"
              >
                <option value="all">Tất cả giáo viên ({bankData?.teachers.length || 0})</option>
                {(bankData?.teachers || []).map((t) => (
                  <option key={t.uid} value={t.uid}>
                    {t.name} ({t.questionCount} câu)
                  </option>
                ))}
              </select>

              <select
                value={selectedSubjectId}
                onChange={(e) => {
                  setSelectedSubjectId(e.target.value);
                  setSelectedChapter('all');
                  setSelectedLesson('all');
                  setPage(1);
                }}
                className="w-full px-3 py-2 min-h-[42px] rounded-xl border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                aria-label="Lọc theo môn học"
              >
                <option value="all">Tất cả môn học</option>
                {(bankData?.filterOptions.subjects || []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>

              <select
                value={selectedGrade}
                onChange={(e) => {
                  setSelectedGrade(e.target.value);
                  setSelectedChapter('all');
                  setSelectedLesson('all');
                  setPage(1);
                }}
                className="w-full px-3 py-2 min-h-[42px] rounded-xl border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                aria-label="Lọc theo khối lớp"
              >
                <option value="all">Tất cả khối lớp</option>
                {(bankData?.filterOptions.grades || ['10', '11', '12', 'chuyen_hsg']).map((g) => (
                  <option key={g} value={g}>
                    {GRADE_LABELS[g] || `Lớp ${g}`}
                  </option>
                ))}
              </select>
            </div>

            {/* Row 2: Textbook + Chapter + Lesson + Level */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
              <select
                value={selectedTextbook}
                onChange={(e) => {
                  setSelectedTextbook(e.target.value);
                  setPage(1);
                }}
                className="w-full px-3 py-2 min-h-[42px] rounded-xl border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                aria-label="Lọc theo bộ sách giáo khoa"
              >
                <option value="all">Tất cả bộ sách SGK</option>
                {(bankData?.filterOptions.textbookSeries || []).map((tb) => (
                  <option key={tb} value={tb}>
                    {tb}
                  </option>
                ))}
              </select>

              <select
                value={selectedChapter}
                onChange={(e) => {
                  setSelectedChapter(e.target.value);
                  setSelectedLesson('all');
                  setPage(1);
                }}
                className="w-full px-3 py-2 min-h-[42px] rounded-xl border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                aria-label="Lọc theo chương"
              >
                <option value="all">Tất cả chương ({availableChapters.length})</option>
                {availableChapters.map((c) => (
                  <option key={`${c.subjectId}_${c.grade}_${c.key}`} value={c.key}>
                    {c.name}
                  </option>
                ))}
              </select>

              <select
                value={selectedLesson}
                onChange={(e) => {
                  setSelectedLesson(e.target.value);
                  setPage(1);
                }}
                className="w-full px-3 py-2 min-h-[42px] rounded-xl border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                aria-label="Lọc theo bài học"
              >
                <option value="all">Tất cả bài học ({availableLessons.length})</option>
                {availableLessons.map((l) => (
                  <option key={`${l.subjectId}_${l.grade}_${l.chapterKey}_${l.key}`} value={l.key}>
                    {l.name}
                  </option>
                ))}
              </select>

              <select
                value={selectedType}
                onChange={(e) => {
                  setSelectedType(e.target.value);
                  setPage(1);
                }}
                className="w-full px-3 py-2 min-h-[42px] rounded-xl border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                aria-label="Lọc theo dạng câu hỏi"
              >
                <option value="all">Tất cả dạng câu hỏi</option>
                <option value="part1_single_choice">Trắc nghiệm nhiều lựa chọn</option>
                <option value="part2_true_false">Trắc nghiệm đúng/sai</option>
                <option value="part3_short_answer">Trắc nghiệm trả lời ngắn</option>
                <option value="essay">Tự luận</option>
              </select>
            </div>

            {/* Row 3: Level + Date From + Date To + Sort */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
              <select
                value={selectedLevel}
                onChange={(e) => {
                  setSelectedLevel(e.target.value);
                  setPage(1);
                }}
                className="w-full px-3 py-2 min-h-[42px] rounded-xl border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                aria-label="Lọc theo mức độ nhận thức"
              >
                <option value="all">Tất cả mức độ nhận thức</option>
                {Object.entries(LEVEL_LABELS).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>

              <div className="flex items-center gap-2">
                <label className="text-xs font-medium text-slate-600 shrink-0">Từ ngày</label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => {
                    setDateFrom(e.target.value);
                    setPage(1);
                  }}
                  className="w-full px-3 py-2 min-h-[42px] rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <div className="flex items-center gap-2">
                <label className="text-xs font-medium text-slate-600 shrink-0">Đến ngày</label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => {
                    setDateTo(e.target.value);
                    setPage(1);
                  }}
                  className="w-full px-3 py-2 min-h-[42px] rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <select
                value={sortBy || 'updatedAt_desc'}
                onChange={(e) => {
                  setSortBy(e.target.value as AdminQuestionBankFilterParams['sortBy']);
                  setPage(1);
                }}
                className="w-full px-3 py-2 min-h-[42px] rounded-xl border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                aria-label="Sắp xếp"
              >
                <option value="updatedAt_desc">Mới cập nhật nhất</option>
                <option value="createdAt_desc">Ngày tạo: Mới → Cũ</option>
                <option value="createdAt_asc">Ngày tạo: Cũ → Mới</option>
                <option value="code_asc">Mã câu hỏi (A → Z)</option>
              </select>
            </div>
          </div>

          {/* Bulk Selection Toolbar */}
          {selectedItems.length > 0 && (
            <div className="bg-slate-900 text-white rounded-2xl px-5 py-3.5 flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm">
                Đã chọn <strong className="tabular-nums">{selectedItems.length}</strong> câu hỏi từ{' '}
                <strong className="tabular-nums">{selectedTeachersCount}</strong> giáo viên.{' '}
                <span className="text-slate-300 text-xs">
                  Câu hỏi đưa vào đề sẽ giữ nguyên nguồn gốc, không chép vào ngân hàng riêng và không sửa bản gốc.
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedQuestionsMap({})}
                  className="px-3 py-2 rounded-xl border border-slate-700 hover:bg-slate-800 text-xs font-semibold"
                >
                  Bỏ chọn
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onCreateExamFromQuestions(
                      selectedItems,
                      `Đề tổng hợp toàn trường (${selectedItems.length} câu · ${selectedTeachersCount} GV)`
                    )
                  }
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 text-xs font-bold"
                >
                  <FilePlus2 className="w-4 h-4" />
                  Tạo đề thi từ các câu đã chọn
                </button>
              </div>
            </div>
          )}

          {/* Question List Table / Cards */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 bg-slate-50/70">
              <div className="flex items-center gap-3">
                <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={
                      (bankData?.items.length || 0) > 0 &&
                      (bankData?.items || []).every((it) => Boolean(selectedQuestionsMap[it.id]))
                    }
                    onChange={toggleSelectAllOnPage}
                    className="w-4 h-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                  />
                  Chọn tất cả trên trang này
                </label>
                <span className="text-xs text-slate-500 tabular-nums">
                  Tìm thấy <strong className="text-slate-900">{bankData?.totalFiltered ?? 0}</strong> câu hỏi
                </span>
              </div>

              <div className="flex items-center gap-2 text-xs text-slate-600">
                <span>Hiển thị:</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value) || 20);
                    setPage(1);
                  }}
                  className="px-2.5 py-1 rounded-lg border border-slate-300 bg-white font-semibold"
                >
                  <option value={20}>20 / trang</option>
                  <option value={50}>50 / trang</option>
                  <option value={100}>100 / trang</option>
                </select>
              </div>
            </div>

            {isLoading ? (
              <div className="p-10 text-center text-sm text-slate-500">
                Đang tải câu hỏi từ Cloud Firestore...
              </div>
            ) : !bankData || bankData.items.length === 0 ? (
              <div className="p-10 text-center space-y-2">
                <p className="text-sm font-semibold text-slate-700">
                  Không có câu hỏi nào khớp với bộ lọc hiện tại.
                </p>
                {hasActiveFilters && (
                  <button
                    type="button"
                    onClick={resetAllFilters}
                    className="text-xs font-semibold text-teal-700 hover:underline"
                  >
                    Xóa toàn bộ bộ lọc
                  </button>
                )}
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {bankData.items.map((item) => {
                  const isChecked = Boolean(selectedQuestionsMap[item.id]);
                  const isOwnAdminQuestion = item.ownerUid === (currentUser.uid || currentUser.id);
                  return (
                    <div
                      key={item.id}
                      className={`p-5 transition-colors ${
                        isChecked ? 'bg-teal-50/40' : 'hover:bg-slate-50/60'
                      }`}
                    >
                      <div className="flex items-start gap-3.5">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleSelectQuestion(item)}
                          aria-label={`Chọn câu hỏi ${item.code}`}
                          className="mt-1 w-4 h-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500 shrink-0"
                        />

                        <div className="flex-1 min-w-0 space-y-2">
                          {/* Metadata line — clean text with dot separators */}
                          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-slate-600">
                              <span className="font-mono font-bold text-slate-900">{item.code}</span>
                              <span>·</span>
                              <span className="font-semibold text-teal-800">
                                GV: {item.ownerName}
                                {isOwnAdminQuestion ? ' (Admin)' : ''}
                              </span>
                              <span>·</span>
                              <span className="font-medium text-slate-800">
                                {item.resolvedSubjectName} · {GRADE_LABELS[item.grade] || `Lớp ${item.grade}`}
                              </span>
                              {item.resolvedTextbookSeries && (
                                <>
                                  <span>·</span>
                                  <span>SGK: {item.resolvedTextbookSeries}</span>
                                </>
                              )}
                              <span>·</span>
                              <span>{LEVEL_LABELS[item.level] || item.level}</span>
                              <span>·</span>
                              <span>{TYPE_LABELS[item.type] || item.type}</span>
                            </div>

                            <span className="text-[11px] text-slate-400 tabular-nums shrink-0">
                              Tạo: {formatDateShortVi(item.createdAt)} · Cập nhật:{' '}
                              {formatDateShortVi(item.updatedAt)}
                            </span>
                          </div>

                          {/* Chapter & Lesson line */}
                          {(item.chapterName || item.lessonName || item.lessonTopic) && (
                            <div className="text-xs text-slate-500">
                              {item.chapterName && <span>Chương: {item.chapterName}</span>}
                              {item.chapterName && (item.lessonName || item.lessonTopic) && (
                                <span className="mx-1.5">→</span>
                              )}
                              {(item.lessonName || item.lessonTopic) && (
                                <span>Bài: {item.lessonName || item.lessonTopic}</span>
                              )}
                            </div>
                          )}

                          {/* Question content preview */}
                          <div className="text-sm text-slate-900 leading-relaxed line-clamp-3">
                            <ChemRenderer text={item.content} />
                          </div>

                          {/* Actions */}
                          <div className="pt-1 flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setViewingQuestion(item)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-semibold"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              Xem chi tiết &amp; Đáp án
                            </button>

                            <button
                              type="button"
                              onClick={() => void handleCopyToAdminBank(item)}
                              disabled={copyingId === item.id}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-teal-200 bg-teal-50/70 hover:bg-teal-100 text-teal-800 text-xs font-semibold disabled:opacity-60"
                            >
                              <Copy className="w-3.5 h-3.5" />
                              {copyingId === item.id ? 'Đang sao chép...' : 'Sao chép về NH riêng'}
                            </button>

                            <button
                              type="button"
                              onClick={() => openEditOriginalModal(item)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber-200 bg-amber-50/60 hover:bg-amber-100 text-amber-900 text-xs font-semibold"
                              title="Chỉnh sửa trực tiếp bản gốc của giáo viên (yêu cầu xác nhận & ghi nhật ký)"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                              Sửa câu gốc
                            </button>

                            <button
                              type="button"
                              onClick={() => openDeleteOriginalModal(item)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rose-200 bg-rose-50/60 hover:bg-rose-100 text-rose-800 text-xs font-semibold"
                              title="Xóa trực tiếp bản gốc của giáo viên (yêu cầu xác nhận & ghi nhật ký)"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              Xóa câu gốc
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Pagination Footer */}
            {bankData && bankData.totalPages > 1 && (
              <div className="px-5 py-3.5 border-t border-slate-200 bg-slate-50/70 flex items-center justify-between gap-3">
                <span className="text-xs text-slate-600 tabular-nums">
                  Trang <strong>{bankData.page}</strong> / {bankData.totalPages} ({bankData.totalFiltered} câu hỏi)
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={bankData.page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold disabled:opacity-50"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                    Trước
                  </button>
                  <button
                    type="button"
                    disabled={bankData.page >= bankData.totalPages}
                    onClick={() => setPage((p) => Math.min(bankData.totalPages, p + 1))}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold disabled:opacity-50"
                  >
                    Sau
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==================== TAB 3: AUDIT LOGS ==================== */}
      {activeSubTab === 'audit' && (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
          <div className="p-5 border-b border-slate-200 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Nhật ký quản trị Ngân hàng câu hỏi toàn trường
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Mọi thao tác sao chép, chỉnh sửa trực tiếp hoặc xóa câu hỏi gốc của giáo viên đều được ghi nhận bất biến trên Firestore.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void loadAuditLogs()}
              disabled={isLoadingAudit}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingAudit ? 'animate-spin' : ''}`} />
              Tải lại
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase">
                <tr>
                  <th className="px-4 py-3">Thời gian</th>
                  <th className="px-4 py-3">Quản trị viên</th>
                  <th className="px-4 py-3">Hành động</th>
                  <th className="px-4 py-3">Câu hỏi &amp; GV sở hữu</th>
                  <th className="px-4 py-3">Lý do &amp; Tóm tắt</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isLoadingAudit ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                      Đang tải nhật ký...
                    </td>
                  </tr>
                ) : auditLogs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                      Chưa có bản ghi nhật ký quản trị câu hỏi nào.
                    </td>
                  </tr>
                ) : (
                  auditLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50/70">
                      <td className="px-4 py-3 whitespace-nowrap text-slate-600 tabular-nums">
                        {formatDateTimeVi(log.createdAt)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-900">{log.actorName}</div>
                        {log.actorEmail && <div className="text-slate-500">{log.actorEmail}</div>}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap font-semibold">
                        {log.action === 'copy_to_admin' && (
                          <span className="text-teal-700">Sao chép về NH Admin</span>
                        )}
                        {log.action === 'edit_original' && (
                          <span className="text-amber-700">Chỉnh sửa câu gốc</span>
                        )}
                        {log.action === 'delete_original' && (
                          <span className="text-rose-700">Xóa câu gốc</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-mono font-bold text-slate-900">{log.questionCode}</div>
                        <div className="text-slate-600">GV: {log.originalOwnerName}</div>
                      </td>
                      <td className="px-4 py-3 max-w-md space-y-1">
                        <div className="font-medium text-slate-900">{log.reason}</div>
                        <div className="text-slate-500 line-clamp-2">{log.beforeSummary}</div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ==================== FULL QUESTION DETAIL MODAL ==================== */}
      {viewingQuestion && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-3xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <span className="font-mono font-bold text-slate-900">{viewingQuestion.code}</span>
                  <span>·</span>
                  <span className="font-semibold text-teal-700">GV: {viewingQuestion.ownerName}</span>
                  {viewingQuestion.ownerEmail && (
                    <>
                      <span>·</span>
                      <span>{viewingQuestion.ownerEmail}</span>
                    </>
                  )}
                </div>
                <h3 className="text-base font-extrabold text-slate-900 mt-0.5">
                  Chi tiết câu hỏi, đáp án &amp; hướng dẫn giải
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setViewingQuestion(null)}
                aria-label="Đóng chi tiết câu hỏi"
                className="p-2 rounded-xl text-slate-500 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-5 text-sm">
              {/* Metadata summary */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl p-4">
                <div>
                  <span className="text-slate-500">Môn học &amp; Lớp:</span>{' '}
                  <strong className="text-slate-900">
                    {viewingQuestion.resolvedSubjectName} ·{' '}
                    {GRADE_LABELS[viewingQuestion.grade] || `Lớp ${viewingQuestion.grade}`}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-500">Bộ sách SGK:</span>{' '}
                  <strong className="text-slate-900">
                    {viewingQuestion.resolvedTextbookSeries || 'Chưa gắn bộ sách'}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-500">Chương:</span>{' '}
                  <strong className="text-slate-900">
                    {viewingQuestion.chapterName || viewingQuestion.topic || '—'}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-500">Bài học / Chủ đề:</span>{' '}
                  <strong className="text-slate-900">
                    {viewingQuestion.lessonName || viewingQuestion.lessonTopic || '—'}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-500">Mức độ &amp; Dạng:</span>{' '}
                  <strong className="text-slate-900">
                    {LEVEL_LABELS[viewingQuestion.level]} · {TYPE_LABELS[viewingQuestion.type]}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-500">Thời gian:</span>{' '}
                  <strong className="text-slate-900 tabular-nums">
                    Tạo {formatDateTimeVi(viewingQuestion.createdAt)} · Sửa{' '}
                    {formatDateTimeVi(viewingQuestion.updatedAt)}
                  </strong>
                </div>
              </div>

              {/* Question Content */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Nội dung câu hỏi
                </h4>
                <div className="p-4 rounded-xl border border-slate-200 bg-white text-slate-900 leading-relaxed">
                  <ChemRenderer text={viewingQuestion.content} />
                </div>
                {viewingQuestion.imageUrl && (
                  <img
                    src={viewingQuestion.imageUrl}
                    alt="Hình minh họa câu hỏi"
                    className="max-h-64 rounded-xl border border-slate-200 object-contain"
                  />
                )}
              </div>

              {/* Answer Key */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Đáp án chuẩn
                </h4>

                {(viewingQuestion.type === 'part1_single_choice' ||
                  viewingQuestion.type === 'part1_multiple_choice') && (
                  <div className="space-y-2">
                    {(viewingQuestion.options || []).map((opt) => {
                      const correctIds =
                        viewingQuestion.correctOptionIds && viewingQuestion.correctOptionIds.length > 0
                          ? viewingQuestion.correctOptionIds
                          : viewingQuestion.correctOptionId
                          ? [viewingQuestion.correctOptionId]
                          : [];
                      const isCorrect = opt.isCorrect || correctIds.includes(opt.id);
                      return (
                        <div
                          key={opt.id}
                          className={`flex items-start gap-3 p-3 rounded-xl border ${
                            isCorrect
                              ? 'border-emerald-300 bg-emerald-50/70 text-emerald-950'
                              : 'border-slate-200 bg-white text-slate-800'
                          }`}
                        >
                          <span
                            className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${
                              isCorrect ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {opt.id}
                          </span>
                          <div className="flex-1 min-w-0">
                            <ChemRenderer text={opt.text} />
                          </div>
                          {isCorrect && (
                            <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 shrink-0">
                              <Check className="w-4 h-4" />
                              Đáp án đúng
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {viewingQuestion.type === 'part2_true_false' && (
                  <div className="space-y-2">
                    {(viewingQuestion.statements || []).map((st) => (
                      <div
                        key={st.id}
                        className="p-3 rounded-xl border border-slate-200 bg-white flex items-start justify-between gap-3"
                      >
                        <div className="flex-1 min-w-0">
                          <span className="font-bold text-slate-900 mr-1.5">{st.id})</span>
                          <ChemRenderer text={st.statement} />
                          {st.explanation && (
                            <p className="text-xs text-slate-500 mt-1">
                              Giải thích: <ChemRenderer text={st.explanation} />
                            </p>
                          )}
                        </div>
                        <span
                          className={`px-2.5 py-1 rounded-lg text-xs font-bold shrink-0 ${
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

                {viewingQuestion.type === 'part3_short_answer' && (
                  <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/70 space-y-1">
                    <div className="text-xs font-semibold text-emerald-900">
                      Các đáp án được chấp nhận:{' '}
                      <strong>
                        {(viewingQuestion.shortAnswerConfig?.acceptableAnswers || []).join(' ; ') || '—'}
                      </strong>
                    </div>
                    {viewingQuestion.shortAnswerConfig?.isNumeric && (
                      <div className="text-xs text-emerald-800">
                        Giá trị số: {viewingQuestion.shortAnswerConfig.numericValue ?? '—'}
                        {viewingQuestion.shortAnswerConfig.tolerance !== undefined
                          ? ` (±${viewingQuestion.shortAnswerConfig.tolerance})`
                          : ''}
                        {viewingQuestion.shortAnswerConfig.unit
                          ? ` · Đơn vị: ${viewingQuestion.shortAnswerConfig.unit}`
                          : ''}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Explanation */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Lời giải chi tiết
                </h4>
                <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 text-slate-800 leading-relaxed">
                  {viewingQuestion.explanation ? (
                    <ChemRenderer text={viewingQuestion.explanation} />
                  ) : (
                    <span className="text-slate-400 italic">Giáo viên chưa nhập lời giải chi tiết.</span>
                  )}
                </div>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    onCreateExamFromQuestions(
                      [viewingQuestion],
                      `Đề thi từ câu hỏi ${viewingQuestion.code}`
                    );
                    setViewingQuestion(null);
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold"
                >
                  <FilePlus2 className="w-4 h-4" />
                  Dùng để tạo đề thi
                </button>
                <button
                  type="button"
                  onClick={() => void handleCopyToAdminBank(viewingQuestion)}
                  disabled={copyingId === viewingQuestion.id}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-teal-300 bg-white hover:bg-teal-50 text-teal-800 text-xs font-bold"
                >
                  <Copy className="w-4 h-4" />
                  Sao chép vào NH riêng của Admin
                </button>
              </div>

              <button
                type="button"
                onClick={() => setViewingQuestion(null)}
                className="px-4 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================== PRIVILEGED EDIT ORIGINAL MODAL ==================== */}
      {editingOriginal && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleConfirmEditOriginal}
            className="bg-white border border-slate-200 rounded-2xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden"
          >
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <ShieldAlert className="w-5 h-5 text-amber-600" />
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">
                    Chỉnh sửa câu hỏi gốc của giáo viên (Ghi nhật ký)
                  </h3>
                  <p className="text-xs text-slate-500">
                    Mã: {editingOriginal.code} · Chủ sở hữu: {editingOriginal.ownerName}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingOriginal(null)}
                className="p-2 rounded-xl text-slate-500 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 text-sm">
              <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-950 leading-relaxed">
                <strong>Cảnh báo thao tác đặc quyền:</strong> Thay đổi này cập nhật trực tiếp bản gốc trong ngân hàng của giáo viên <strong>{editingOriginal.ownerName}</strong> (quyền sở hữu vẫn giữ nguyên thuộc về giáo viên). Nếu bạn chỉ muốn chỉnh sửa để dùng riêng, hãy đóng hộp thoại và chọn <strong>Sao chép về NH riêng</strong>.
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Nội dung câu hỏi
                </label>
                <textarea
                  rows={4}
                  required
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Mức độ nhận thức
                  </label>
                  <select
                    value={editLevel}
                    onChange={(e) => setEditLevel(e.target.value as CognitiveLevel)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm bg-white"
                  >
                    {Object.entries(LEVEL_LABELS).map(([k, label]) => (
                      <option key={k} value={k}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Chương</label>
                  <input
                    type="text"
                    value={editChapterName}
                    onChange={(e) => setEditChapterName(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Bài học</label>
                  <input
                    type="text"
                    value={editLessonName}
                    onChange={(e) => setEditLessonName(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Lời giải chi tiết
                </label>
                <textarea
                  rows={3}
                  value={editExplanation}
                  onChange={(e) => setEditExplanation(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Lý do chỉnh sửa câu hỏi gốc <span className="text-rose-600">*</span> (tối thiểu 5 ký tự)
                </label>
                <input
                  type="text"
                  required
                  minLength={5}
                  value={editReason}
                  onChange={(e) => setEditReason(e.target.value)}
                  placeholder="VD: Chuẩn hóa công thức hóa học / sửa lỗi chính tả theo tổ chuyên môn"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <label className="flex items-start gap-2.5 text-xs text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={editConfirmed}
                  onChange={(e) => setEditConfirmed(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded border-slate-300 text-amber-600"
                />
                <span>
                  Tôi xác nhận muốn chỉnh sửa trực tiếp câu hỏi gốc của giáo viên{' '}
                  <strong>{editingOriginal.ownerName}</strong> và lưu lại lịch sử thao tác.
                </span>
              </label>
            </div>

            <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingOriginal(null)}
                className="px-4 py-2 rounded-xl border border-slate-300 bg-white text-slate-700 text-xs font-semibold"
              >
                Hủy
              </button>
              <button
                type="submit"
                disabled={!editConfirmed || editReason.trim().length < 5 || isSubmittingEdit}
                className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold disabled:opacity-50"
              >
                {isSubmittingEdit ? 'Đang lưu...' : 'Xác nhận lưu câu hỏi gốc'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ==================== PRIVILEGED DELETE ORIGINAL MODAL ==================== */}
      {deletingOriginal && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleConfirmDeleteOriginal}
            className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden"
          >
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <AlertTriangle className="w-5 h-5 text-rose-600" />
                <h3 className="text-base font-extrabold text-slate-900">
                  Xóa câu hỏi gốc của giáo viên
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setDeletingOriginal(null)}
                className="p-2 rounded-xl text-slate-500 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-sm">
              <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-900 leading-relaxed">
                <strong>Cảnh báo không thể hoàn tác:</strong> Bạn đang chuẩn bị xóa vĩnh viễn câu hỏi{' '}
                <strong className="font-mono">{deletingOriginal.code}</strong> khỏi ngân hàng của giáo viên{' '}
                <strong>{deletingOriginal.ownerName}</strong>. Thao tác này sẽ được ghi nhận vào nhật ký kiểm duyệt Admin.
              </div>

              <div className="p-3 rounded-xl border border-slate-200 bg-slate-50 text-xs text-slate-700 line-clamp-3">
                <ChemRenderer text={deletingOriginal.content} />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Lý do xóa câu hỏi gốc <span className="text-rose-600">*</span> (tối thiểu 5 ký tự)
                </label>
                <input
                  type="text"
                  required
                  minLength={5}
                  value={deleteReason}
                  onChange={(e) => setDeleteReason(e.target.value)}
                  placeholder="VD: Câu hỏi trùng lặp / sai kiến thức nghiêm trọng"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
              </div>

              <label className="flex items-start gap-2.5 text-xs text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={deleteConfirmed}
                  onChange={(e) => setDeleteConfirmed(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded border-slate-300 text-rose-600"
                />
                <span>
                  Tôi xác nhận xóa vĩnh viễn câu hỏi gốc này và chịu trách nhiệm lưu nhật ký kiểm duyệt.
                </span>
              </label>
            </div>

            <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeletingOriginal(null)}
                className="px-4 py-2 rounded-xl border border-slate-300 bg-white text-slate-700 text-xs font-semibold"
              >
                Hủy
              </button>
              <button
                type="submit"
                disabled={!deleteConfirmed || deleteReason.trim().length < 5 || isSubmittingDelete}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold disabled:opacity-50"
              >
                {isSubmittingDelete ? 'Đang xóa...' : 'Xác nhận xóa vĩnh viễn'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
