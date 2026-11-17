import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  BookMarked,
  CheckCircle2,
  Download,
  Edit3,
  Eye,
  EyeOff,
  FileSpreadsheet,
  Layers,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  CurriculumConfig,
  CurriculumGrade,
  CurriculumLesson,
  CurriculumStatus,
  SubjectItem,
  User,
} from '../../types';
import {
  CURRICULUM_GRADES,
  DEFAULT_GDPT_2018_SUBJECTS,
  TEXTBOOK_SERIES_OPTIONS,
} from '../../constants/subjects';
import {
  CurriculumImportParseResult,
  deleteCurriculumLessonFromFirestore,
  downloadCurriculumTemplateExcel,
  exportCurriculumCatalogExcel,
  fetchAllCurriculumLessonsForAdmin,
  fetchCurriculumConfigFromFirestore,
  filterAndGroupCurriculumLessons,
  generateChapterId,
  parseCurriculumImportFile,
  saveCurriculumConfigToFirestore,
  saveCurriculumLessonsBatchToFirestore,
  saveCurriculumLessonToFirestore,
} from '../../services/curriculumService';
import { ConfirmDialog } from '../common/ConfirmDialog';

interface CurriculumCatalogManagerProps {
  currentUser: User;
  subjects?: SubjectItem[];
}

export const CurriculumCatalogManager: React.FC<CurriculumCatalogManagerProps> = ({
  currentUser,
  subjects = DEFAULT_GDPT_2018_SUBJECTS,
}) => {
  const adminUid = currentUser.uid || currentUser.id;
  const [config, setConfig] = useState<CurriculumConfig | null>(null);
  const [seriesInput, setSeriesInput] = useState<string>('');
  const [customSeriesInput, setCustomSeriesInput] = useState<string>('');
  const [yearInput, setYearInput] = useState<string>('2025-2026');
  const [schoolInput, setSchoolInput] = useState<string>('');
  const [isSavingConfig, setIsSavingConfig] = useState<boolean>(false);

  const [allLessons, setAllLessons] = useState<CurriculumLesson[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>('hoa_hoc');
  const [selectedGrade, setSelectedGrade] = useState<CurriculumGrade>('10');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [showInactive, setShowInactive] = useState<boolean>(true);

  const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Add / Edit lesson modal
  const [lessonModalMode, setLessonModalMode] = useState<'add' | 'edit' | null>(null);
  const [editingLesson, setEditingLesson] = useState<CurriculumLesson | null>(null);
  const [formChapterName, setFormChapterName] = useState<string>('');
  const [formChapterOrder, setFormChapterOrder] = useState<number>(1);
  const [formLessonName, setFormLessonName] = useState<string>('');
  const [formLessonOrder, setFormLessonOrder] = useState<number>(1);
  const [formSeries, setFormSeries] = useState<string>('');
  const [formYear, setFormYear] = useState<string>('2025-2026');
  const [formStatus, setFormStatus] = useState<CurriculumStatus>('active');
  const [isSavingLesson, setIsSavingLesson] = useState<boolean>(false);
  const [lessonFormError, setLessonFormError] = useState<string | null>(null);

  // Import Excel/CSV modal
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [importPreview, setImportPreview] = useState<CurriculumImportParseResult | null>(null);
  const [importFileName, setImportFileName] = useState<string>('');
  const [isImporting, setIsImporting] = useState<boolean>(false);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<CurriculumLesson | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToast({ text, type });
    setTimeout(() => setToast(null), 4000);
  };

  const activeSeriesValue =
    seriesInput === '__custom__' ? customSeriesInput.trim() : seriesInput.trim();

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [cfg, lessons] = await Promise.all([
        fetchCurriculumConfigFromFirestore(true),
        fetchAllCurriculumLessonsForAdmin(),
      ]);
      setConfig(cfg);
      if (cfg) {
        if (TEXTBOOK_SERIES_OPTIONS.includes(cfg.textbookSeries)) {
          setSeriesInput(cfg.textbookSeries);
          setCustomSeriesInput('');
        } else if (cfg.textbookSeries) {
          setSeriesInput('__custom__');
          setCustomSeriesInput(cfg.textbookSeries);
        }
        setYearInput(cfg.textbookYear || '2025-2026');
        setSchoolInput(cfg.schoolName || currentUser.school || '');
      } else {
        setSchoolInput(currentUser.school || '');
      }
      setAllLessons(lessons);
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Không thể tải danh mục bài học từ Firestore.',
        'error'
      );
    } finally {
      setIsLoading(false);
    }
  }, [currentUser.school]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const subjectLessonCounts = useMemo(() => {
    const map = new Map<string, { total: number; active: number }>();
    allLessons.forEach((l) => {
      const cur = map.get(l.subjectId) || { total: 0, active: 0 };
      cur.total += 1;
      if (l.status === 'active') cur.active += 1;
      map.set(l.subjectId, cur);
    });
    return map;
  }, [allLessons]);

  const gradeCountsForSelectedSubject = useMemo(() => {
    const counts: Record<CurriculumGrade, number> = { '10': 0, '11': 0, '12': 0 };
    allLessons.forEach((l) => {
      if (l.subjectId === selectedSubjectId) {
        counts[l.grade] = (counts[l.grade] || 0) + 1;
      }
    });
    return counts;
  }, [allLessons, selectedSubjectId]);

  const currentSubject = useMemo(
    () => subjects.find((s) => s.id === selectedSubjectId) || subjects[0],
    [subjects, selectedSubjectId]
  );

  const scopedLessons = useMemo(
    () => allLessons.filter((l) => l.subjectId === selectedSubjectId && l.grade === selectedGrade),
    [allLessons, selectedSubjectId, selectedGrade]
  );

  const { chapters: groupedChapters, lessons: visibleLessons } = useMemo(
    () =>
      filterAndGroupCurriculumLessons(scopedLessons, {
        grade: selectedGrade,
        includeInactive: showInactive,
        searchTerm,
      }),
    [scopedLessons, selectedGrade, showInactive, searchTerm]
  );

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSeriesValue) {
      showToast('Vui lòng chọn hoặc nhập tên bộ sách giáo khoa thống nhất của nhà trường.', 'error');
      return;
    }
    setIsSavingConfig(true);
    try {
      const saved = await saveCurriculumConfigToFirestore(
        {
          textbookSeries: activeSeriesValue,
          textbookYear: yearInput.trim() || '2025-2026',
          schoolName: schoolInput.trim() || undefined,
        },
        adminUid
      );
      setConfig(saved);
      showToast(`Đã lưu cấu hình bộ sách "${saved.textbookSeries}" (${saved.textbookYear}).`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Lỗi lưu cấu hình bộ sách.', 'error');
    } finally {
      setIsSavingConfig(false);
    }
  };

  const openAddLessonModal = (prefillChapter?: {
    chapterId: string;
    chapterName: string;
    chapterOrder: number;
    nextLessonOrder: number;
  }) => {
    setLessonFormError(null);
    setEditingLesson(null);
    setLessonModalMode('add');
    if (prefillChapter) {
      setFormChapterName(prefillChapter.chapterName);
      setFormChapterOrder(prefillChapter.chapterOrder);
      setFormLessonOrder(prefillChapter.nextLessonOrder);
    } else {
      setFormChapterName('');
      setFormChapterOrder(groupedChapters.length + 1);
      setFormLessonOrder(scopedLessons.length + 1);
    }
    setFormLessonName('');
    setFormSeries(activeSeriesValue || config?.textbookSeries || '');
    setFormYear(yearInput.trim() || config?.textbookYear || '2025-2026');
    setFormStatus('active');
  };

  const openEditLessonModal = (lesson: CurriculumLesson) => {
    setLessonFormError(null);
    setEditingLesson(lesson);
    setLessonModalMode('edit');
    setFormChapterName(lesson.chapterName);
    setFormChapterOrder(lesson.chapterOrder ?? 1);
    setFormLessonName(lesson.lessonName);
    setFormLessonOrder(lesson.lessonOrder);
    setFormSeries(lesson.textbookSeries);
    setFormYear(lesson.textbookYear);
    setFormStatus(lesson.status);
  };

  const handleSaveLesson = async (e: React.FormEvent) => {
    e.preventDefault();
    setLessonFormError(null);

    const seriesToUse = formSeries.trim() || activeSeriesValue || config?.textbookSeries || '';
    if (!seriesToUse) {
      setLessonFormError('Vui lòng cấu hình hoặc nhập Bộ sách giáo khoa trước khi lưu bài học.');
      return;
    }
    if (!formChapterName.trim()) {
      setLessonFormError('Vui lòng nhập tên Chương / Chủ đề.');
      return;
    }
    if (!formLessonName.trim()) {
      setLessonFormError('Vui lòng nhập tên Bài học.');
      return;
    }

    setIsSavingLesson(true);
    try {
      const chapterChanged =
        editingLesson && editingLesson.chapterName.trim() !== formChapterName.trim();
      const chapterId =
        editingLesson && !chapterChanged
          ? editingLesson.chapterId
          : generateChapterId(currentSubject.id, selectedGrade, formChapterName.trim());

      const saved = await saveCurriculumLessonToFirestore(
        {
          ...(editingLesson ? editingLesson : {}),
          subjectId: currentSubject.id,
          subjectName: currentSubject.name,
          grade: selectedGrade,
          textbookSeries: seriesToUse,
          textbookYear: formYear.trim() || '2025-2026',
          chapterId,
          chapterName: formChapterName.trim(),
          chapterOrder: Math.max(1, Number(formChapterOrder) || 1),
          lessonId: editingLesson?.lessonId,
          lessonName: formLessonName.trim(),
          lessonOrder: Math.max(1, Number(formLessonOrder) || 1),
          status: formStatus,
        },
        adminUid
      );

      setAllLessons((prev) => {
        const exists = prev.some((l) => l.id === saved.id);
        return exists ? prev.map((l) => (l.id === saved.id ? saved : l)) : [...prev, saved];
      });
      setLessonModalMode(null);
      setEditingLesson(null);
      showToast(
        lessonModalMode === 'edit'
          ? `Đã cập nhật bài học "${saved.lessonName}".`
          : `Đã thêm bài học "${saved.lessonName}".`
      );
    } catch (err) {
      setLessonFormError(err instanceof Error ? err.message : 'Không thể lưu bài học.');
    } finally {
      setIsSavingLesson(false);
    }
  };

  const handleToggleStatus = async (lesson: CurriculumLesson) => {
    const nextStatus: CurriculumStatus = lesson.status === 'active' ? 'inactive' : 'active';
    setBusyId(lesson.id);
    try {
      const updated = await saveCurriculumLessonToFirestore(
        { ...lesson, status: nextStatus },
        adminUid
      );
      setAllLessons((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
      showToast(
        nextStatus === 'active'
          ? `Đã kích hoạt lại "${updated.lessonName}".`
          : `Đã ẩn "${updated.lessonName}" khỏi danh sách chọn mới của giáo viên.`
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Không thể đổi trạng thái bài học.', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const handleMoveLessonOrder = async (
    chapterLessons: CurriculumLesson[],
    index: number,
    direction: 'up' | 'down'
  ) => {
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= chapterLessons.length) return;
    const reordered = [...chapterLessons];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(targetIdx, 0, moved);

    const updatedItems = reordered.map((item, idx) => ({
      ...item,
      lessonOrder: idx + 1,
    }));

    setBusyId(moved.id);
    try {
      const saved = await saveCurriculumLessonsBatchToFirestore(updatedItems, adminUid);
      const savedMap = new Map(saved.map((s) => [s.id, s]));
      setAllLessons((prev) => prev.map((l) => savedMap.get(l.id) || l));
      showToast(`Đã cập nhật thứ tự bài học trong "${moved.chapterName}".`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Không thể sắp xếp thứ tự.', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setBusyId(deleteTarget.id);
    try {
      await deleteCurriculumLessonFromFirestore(deleteTarget.id, deleteTarget.subjectId);
      setAllLessons((prev) => prev.filter((l) => l.id !== deleteTarget.id));
      showToast(`Đã xóa bài học "${deleteTarget.lessonName}".`);
      setDeleteTarget(null);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Không thể xóa bài học.', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    try {
      const parsed = await parseCurriculumImportFile(
        file,
        subjects,
        {
          textbookSeries: activeSeriesValue || config?.textbookSeries || '',
          textbookYear: yearInput.trim() || config?.textbookYear || '2025-2026',
        },
        adminUid
      );
      setImportFileName(file.name);
      setImportPreview(parsed);
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Không thể đọc tệp Excel/CSV vừa chọn.',
        'error'
      );
    }
  };

  const handleConfirmImport = async () => {
    if (!importPreview || importPreview.validRows.length === 0) return;
    setIsImporting(true);
    try {
      await saveCurriculumLessonsBatchToFirestore(importPreview.validRows, adminUid);
      await loadData();
      showToast(`Đã nhập thành công ${importPreview.validRows.length} bài học vào Firestore.`);
      setImportPreview(null);
      setImportFileName('');
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Lỗi ghi danh mục bài học vào Firestore.',
        'error'
      );
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="space-y-6">
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl shadow-xl flex items-center gap-2 text-xs font-semibold ${
            toast.type === 'success' ? 'bg-slate-900 text-white' : 'bg-rose-700 text-white'
          }`}
        >
          {toast.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-200 shrink-0" />
          )}
          <span>{toast.text}</span>
        </div>
      )}

      {/* Hidden Excel/CSV file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Page Header */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-teal-700 font-bold text-xs uppercase tracking-wider">
            <BookMarked className="w-4 h-4" />
            <span>Quản trị Chương trình GDPT 2018 · Tập trung trên Firestore</span>
          </div>
          <h1 className="text-xl md:text-2xl font-bold text-slate-900 mt-1">
            Quản lý Danh mục Chương &amp; Bài học SGK
          </h1>
          <p className="text-xs md:text-sm text-slate-600 mt-1">
            Admin cấu hình bộ sách giáo khoa thống nhất của trường và quản lý danh mục bài học chính thức cho tất cả Giáo viên sử dụng qua Cascading Dropdown.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() =>
              downloadCurriculumTemplateExcel(subjects, {
                textbookSeries: activeSeriesValue || config?.textbookSeries || '',
                textbookYear: yearInput || config?.textbookYear || '2025-2026',
              })
            }
            className="min-h-[40px] px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold inline-flex items-center gap-1.5"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            <span>Tải file mẫu Excel</span>
          </button>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="min-h-[40px] px-3.5 py-2 rounded-xl border border-teal-200 bg-teal-50 hover:bg-teal-100 text-teal-800 text-xs font-semibold inline-flex items-center gap-1.5"
          >
            <Upload className="w-4 h-4 text-teal-700" />
            <span>Nhập Excel / CSV</span>
          </button>

          <button
            type="button"
            disabled={allLessons.length === 0}
            onClick={() => exportCurriculumCatalogExcel(allLessons)}
            className="min-h-[40px] px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-50 text-slate-700 text-xs font-semibold inline-flex items-center gap-1.5"
          >
            <Download className="w-4 h-4 text-blue-600" />
            <span>Xuất toàn bộ ({allLessons.length})</span>
          </button>

          <button
            type="button"
            onClick={() => void loadData()}
            disabled={isLoading}
            className="min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold inline-flex items-center gap-1.5"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Làm mới</span>
          </button>
        </div>
      </div>

      {/* School Textbook Series Policy Form */}
      <form
        onSubmit={handleSaveConfig}
        className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
          <div>
            <h2 className="text-sm font-bold text-slate-900">
              1. Bộ sách giáo khoa thống nhất của nhà trường
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Xác định chính xác bộ sách áp dụng để tránh trộn lẫn tên bài giữa các bộ sách khác nhau (Kết nối tri thức, Chân trời sáng tạo, Cánh diều).
            </p>
          </div>
          {config?.textbookSeries && (
            <span className="text-xs font-semibold text-emerald-700">
              Đang áp dụng: {config.textbookSeries} ({config.textbookYear})
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          <div>
            <label className="block font-bold text-slate-700 mb-1.5">Bộ sách giáo khoa *</label>
            <select
              value={seriesInput}
              onChange={(e) => setSeriesInput(e.target.value)}
              className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-slate-300 bg-white font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              <option value="">-- Chọn bộ sách thống nhất --</option>
              {TEXTBOOK_SERIES_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
              <option value="__custom__">Bộ sách / Tài liệu khác (tự nhập)...</option>
            </select>
            {seriesInput === '__custom__' && (
              <input
                type="text"
                value={customSeriesInput}
                onChange={(e) => setCustomSeriesInput(e.target.value)}
                placeholder="Nhập tên bộ sách chuẩn..."
                className="mt-2 w-full min-h-[38px] px-3 py-1.5 rounded-xl border border-teal-300 bg-teal-50/30 font-semibold text-slate-900"
              />
            )}
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1.5">
              Phiên bản / Năm học áp dụng *
            </label>
            <input
              type="text"
              value={yearInput}
              onChange={(e) => setYearInput(e.target.value)}
              placeholder="VD: 2025-2026"
              className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-slate-300 bg-white font-semibold text-slate-800"
            />
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1.5">
              Đơn vị trường học (tùy chọn)
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={schoolInput}
                onChange={(e) => setSchoolInput(e.target.value)}
                placeholder="Tên trường THPT..."
                className="flex-1 min-h-[40px] px-3 py-2 rounded-xl border border-slate-300 bg-white text-slate-800"
              />
              <button
                type="submit"
                disabled={isSavingConfig}
                className="min-h-[40px] px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white font-semibold inline-flex items-center gap-1.5 shrink-0"
              >
                {isSavingConfig ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                <span>Lưu bộ sách</span>
              </button>
            </div>
          </div>
        </div>
      </form>

      {/* Main Split Workspace: Subject List (Left) + Grade/Chapter/Lesson Manager (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left: 17 Subjects */}
        <div className="lg:col-span-4 bg-white border border-slate-200 rounded-2xl p-4 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900">
              2. Môn học ({subjects.length} môn)
            </h2>
            <span className="text-[11px] text-slate-500 tabular-nums">
              {allLessons.length} bài tổng cộng
            </span>
          </div>

          <div className="space-y-1 max-h-[540px] overflow-y-auto pr-1">
            {subjects.map((sub) => {
              const counts = subjectLessonCounts.get(sub.id) || { total: 0, active: 0 };
              const isSelected = sub.id === selectedSubjectId;
              return (
                <button
                  key={sub.id}
                  type="button"
                  onClick={() => setSelectedSubjectId(sub.id)}
                  className={`w-full px-3 py-2.5 rounded-xl text-left text-xs flex items-center justify-between gap-2 transition-colors ${
                    isSelected
                      ? 'bg-teal-600 text-white font-semibold'
                      : 'text-slate-700 hover:bg-slate-100 font-medium'
                  }`}
                >
                  <span className="truncate">{sub.name}</span>
                  <span
                    className={`tabular-nums shrink-0 text-[11px] ${
                      isSelected ? 'text-teal-100' : 'text-slate-400'
                    }`}
                  >
                    {counts.active}/{counts.total}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right: Grade Tabs + Lessons List */}
        <div className="lg:col-span-8 bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                {currentSubject?.name} · Khối {selectedGrade}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
                {groupedChapters.length} chương · {visibleLessons.length} bài học hiển thị
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100">
                {CURRICULUM_GRADES.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => setSelectedGrade(g.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors tabular-nums ${
                      selectedGrade === g.id
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {g.label} ({gradeCountsForSelectedSubject[g.id] || 0})
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => openAddLessonModal()}
                className="min-h-[38px] px-3.5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold inline-flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>Thêm bài học</span>
              </button>
            </div>
          </div>

          {/* Search & Visibility Toolbar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Tìm theo tên chương hoặc tên bài học..."
                className="w-full min-h-[38px] pl-9 pr-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>

            <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600 cursor-pointer shrink-0">
              <input
                type="checkbox"
                checked={showInactive}
                onChange={(e) => setShowInactive(e.target.checked)}
                className="rounded border-slate-300 text-teal-600 focus:ring-teal-500"
              />
              <span>Hiển thị cả bài đang ẩn</span>
            </label>
          </div>

          {/* Chapters & Lessons List */}
          {isLoading ? (
            <div className="py-12 text-center text-xs text-slate-500 space-y-2">
              <Loader2 className="w-6 h-6 animate-spin text-teal-600 mx-auto" />
              <p>Đang tải danh mục chương trình học từ Firestore...</p>
            </div>
          ) : groupedChapters.length === 0 ? (
            <div className="py-12 px-6 text-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 space-y-3">
              <Layers className="w-8 h-8 text-slate-300 mx-auto" />
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-slate-800">
                  Chưa có danh mục bài học cho {currentSubject?.name} · Lớp {selectedGrade}
                </h3>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  Hệ thống không tự suy diễn tên bài học. Vui lòng dùng nút{' '}
                  <strong>Thêm bài học</strong> hoặc <strong>Nhập Excel / CSV</strong> để nạp danh mục chính thức đúng theo bộ sách giáo khoa của trường.
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => openAddLessonModal()}
                  className="px-3.5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold inline-flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Thêm bài học đầu tiên</span>
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold inline-flex items-center gap-1.5"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Nhập từ Excel / CSV</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {groupedChapters.map((ch) => (
                <div
                  key={ch.chapterId}
                  className="border border-slate-200 rounded-xl overflow-hidden"
                >
                  <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="text-xs font-bold text-slate-900 truncate">
                        {ch.chapterName}
                      </h3>
                      <p className="text-[11px] text-slate-500 tabular-nums">
                        Mã chương: {ch.chapterId} · {ch.lessons.length} bài học
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        openAddLessonModal({
                          chapterId: ch.chapterId,
                          chapterName: ch.chapterName,
                          chapterOrder: ch.chapterOrder,
                          nextLessonOrder: ch.lessons.length + 1,
                        })
                      }
                      className="px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 hover:border-teal-400 hover:text-teal-700 text-xs font-semibold inline-flex items-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Thêm bài vào chương</span>
                    </button>
                  </div>

                  <div className="divide-y divide-slate-100">
                    {ch.lessons.map((lesson, idx) => {
                      const isBusy = busyId === lesson.id;
                      const isInactive = lesson.status === 'inactive';
                      return (
                        <div
                          key={lesson.id}
                          className={`px-4 py-2.5 flex items-center justify-between gap-3 text-xs ${
                            isInactive ? 'bg-slate-50/70 opacity-70' : 'bg-white'
                          }`}
                        >
                          <div className="min-w-0 flex-1 space-y-0.5">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-[11px] text-slate-400 tabular-nums shrink-0">
                                #{lesson.lessonOrder}
                              </span>
                              <span className="font-semibold text-slate-900 truncate">
                                {lesson.lessonName}
                              </span>
                              {isInactive && (
                                <span className="text-[11px] font-semibold text-amber-700">
                                  (Đang ẩn)
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-slate-500 truncate">
                              {lesson.textbookSeries} ({lesson.textbookYear}) · Mã: {lesson.lessonId}
                            </p>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              disabled={isBusy || idx === 0}
                              onClick={() => void handleMoveLessonOrder(ch.lessons, idx, 'up')}
                              title="Đẩy lên trước"
                              className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30"
                            >
                              <ArrowUp className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              disabled={isBusy || idx === ch.lessons.length - 1}
                              onClick={() => void handleMoveLessonOrder(ch.lessons, idx, 'down')}
                              title="Đẩy xuống sau"
                              className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30"
                            >
                              <ArrowDown className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => void handleToggleStatus(lesson)}
                              title={isInactive ? 'Hiện lại bài học' : 'Ẩn / ngừng sử dụng bài học'}
                              className="p-1.5 rounded-lg text-slate-500 hover:bg-amber-50 hover:text-amber-700"
                            >
                              {isInactive ? (
                                <Eye className="w-3.5 h-3.5" />
                              ) : (
                                <EyeOff className="w-3.5 h-3.5" />
                              )}
                            </button>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => openEditLessonModal(lesson)}
                              title="Chỉnh sửa bài học"
                              className="p-1.5 rounded-lg text-slate-500 hover:bg-blue-50 hover:text-blue-700"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => setDeleteTarget(lesson)}
                              title="Xóa bài học"
                              className="p-1.5 rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-700"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Add / Edit Lesson Modal */}
      {lessonModalMode && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
              <div>
                <h3 className="font-bold text-sm">
                  {lessonModalMode === 'edit' ? 'Chỉnh sửa bài học' : 'Thêm bài học mới'}
                </h3>
                <p className="text-xs text-slate-300 mt-0.5">
                  {currentSubject?.name} · Lớp {selectedGrade}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setLessonModalMode(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveLesson} className="p-6 space-y-4 text-xs">
              {lessonFormError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 font-semibold">
                  {lessonFormError}
                </div>
              )}

              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="block font-bold text-slate-700 mb-1">
                    Tên Chương / Chủ đề *
                  </label>
                  <input
                    type="text"
                    required
                    value={formChapterName}
                    onChange={(e) => setFormChapterName(e.target.value)}
                    placeholder="VD: Chương 1: Cấu tạo nguyên tử"
                    className="w-full min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Thứ tự chương</label>
                  <input
                    type="number"
                    min={1}
                    max={1000}
                    value={formChapterOrder}
                    onChange={(e) => setFormChapterOrder(Number(e.target.value) || 1)}
                    className="w-full min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-300 tabular-nums"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="block font-bold text-slate-700 mb-1">Tên Bài học *</label>
                  <input
                    type="text"
                    required
                    value={formLessonName}
                    onChange={(e) => setFormLessonName(e.target.value)}
                    placeholder="Nhập đúng tên bài trong SGK..."
                    className="w-full min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Thứ tự bài</label>
                  <input
                    type="number"
                    min={1}
                    max={1000}
                    value={formLessonOrder}
                    onChange={(e) => setFormLessonOrder(Number(e.target.value) || 1)}
                    className="w-full min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-300 tabular-nums"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Bộ sách *</label>
                  <input
                    type="text"
                    required
                    value={formSeries}
                    onChange={(e) => setFormSeries(e.target.value)}
                    placeholder="VD: Kết nối tri thức với cuộc sống"
                    className="w-full min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Năm áp dụng</label>
                  <input
                    type="text"
                    value={formYear}
                    onChange={(e) => setFormYear(e.target.value)}
                    placeholder="2025-2026"
                    className="w-full min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-300"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Trạng thái sử dụng</label>
                <select
                  value={formStatus}
                  onChange={(e) => setFormStatus(e.target.value as CurriculumStatus)}
                  className="w-full min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-300 bg-white font-semibold"
                >
                  <option value="active">Đang sử dụng (hiển thị cho giáo viên)</option>
                  <option value="inactive">Ẩn / Ngừng sử dụng</option>
                </select>
              </div>

              <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setLessonModalMode(null)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 font-semibold"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSavingLesson}
                  className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white font-semibold inline-flex items-center gap-1.5"
                >
                  {isSavingLesson && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>{lessonModalMode === 'edit' ? 'Lưu cập nhật' : 'Thêm bài học'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Excel / CSV Import Preview Modal */}
      {importPreview && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white w-full max-w-3xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[88vh]">
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
              <div>
                <h3 className="font-bold text-sm">
                  Kiểm tra tệp nhập danh mục: {importFileName}
                </h3>
                <p className="text-xs text-slate-300 mt-0.5 tabular-nums">
                  Hợp lệ: {importPreview.validRows.length} dòng · Lỗi:{' '}
                  {importPreview.errors.length} dòng
                </p>
              </div>
              <button
                type="button"
                onClick={() => setImportPreview(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 text-xs flex-1">
              {importPreview.detectedSeries.length > 1 && (
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 font-semibold">
                  Cảnh báo: Tệp nhập có nhiều bộ sách khác nhau (
                  {importPreview.detectedSeries.join(', ')}). Hãy kiểm tra để tránh trộn lẫn tên bài giữa các bộ sách.
                </div>
              )}

              {importPreview.errors.length > 0 && (
                <div className="border border-rose-200 rounded-xl overflow-hidden">
                  <div className="px-3.5 py-2 bg-rose-50 font-bold text-rose-800">
                    Các dòng không hợp lệ ({importPreview.errors.length})
                  </div>
                  <div className="max-h-40 overflow-y-auto divide-y divide-rose-100">
                    {importPreview.errors.map((err, idx) => (
                      <div key={idx} className="px-3.5 py-2 text-rose-700">
                        <strong>Dòng {err.rowNumber}:</strong> {err.message}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {importPreview.validRows.length > 0 && (
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <div className="px-3.5 py-2 bg-slate-50 font-bold text-slate-800">
                    Xem trước dữ liệu hợp lệ ({importPreview.validRows.length} bài)
                  </div>
                  <div className="overflow-x-auto max-h-64 overflow-y-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                          <th className="py-2 px-3">Môn</th>
                          <th className="py-2 px-3">Lớp</th>
                          <th className="py-2 px-3">Chương</th>
                          <th className="py-2 px-3">Bài học</th>
                          <th className="py-2 px-3">Bộ sách</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {importPreview.validRows.slice(0, 50).map((r) => (
                          <tr key={r.id}>
                            <td className="py-1.5 px-3 font-medium">{r.subjectName}</td>
                            <td className="py-1.5 px-3 tabular-nums">{r.grade}</td>
                            <td className="py-1.5 px-3">{r.chapterName}</td>
                            <td className="py-1.5 px-3 font-semibold text-slate-900">
                              {r.lessonName}
                            </td>
                            <td className="py-1.5 px-3 text-slate-500">{r.textbookSeries}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex justify-end gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setImportPreview(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 text-xs font-semibold"
              >
                Đóng
              </button>
              <button
                type="button"
                disabled={isImporting || importPreview.validRows.length === 0}
                onClick={() => void handleConfirmImport()}
                className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-xs font-semibold inline-flex items-center gap-1.5"
              >
                {isImporting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Lưu {importPreview.validRows.length} bài học lên Firestore</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Lesson Dialog */}
      <ConfirmDialog
        isOpen={!!deleteTarget}
        title={`Xóa bài học "${deleteTarget?.lessonName || ''}"?`}
        message="Bài học sẽ bị xóa khỏi danh mục dùng chung. Các câu hỏi cũ đã gắn bài học này vẫn giữ nguyên tên bài đã lưu."
        confirmLabel="Xóa bài học"
        onConfirm={() => void handleConfirmDelete()}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};
