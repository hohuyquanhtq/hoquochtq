import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  BookOpen,
  Check,
  ChevronDown,
  Layers,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';
import {
  ChemGrade,
  CurriculumConfig,
  CurriculumGrade,
  CurriculumLesson,
  SubjectItem,
} from '../../types';
import { CURRICULUM_GRADES } from '../../constants/subjects';
import {
  fetchCurriculumConfigFromFirestore,
  fetchCurriculumLessonsBySubjectGrade,
  filterAndGroupCurriculumLessons,
} from '../../services/curriculumService';

export interface CurriculumSelectionValue {
  subjectId: string;
  subjectName: string;
  grade: ChemGrade | '';
  textbookSeries?: string;
  chapterId: string;
  chapterName: string;
  lessonId: string;
  lessonName: string;
}

export interface CurriculumCascadeSelectorProps {
  value: CurriculumSelectionValue;
  subjects: SubjectItem[];
  legacyLessonTopic?: string;
  /**
   * When true, the Lesson dropdown is locked until a Chapter is explicitly chosen
   * and ONLY lists lessons belonging to the selected Chapter.
   */
  requireChapterBeforeLesson?: boolean;
  /**
   * When true, switching Subject keeps the currently selected valid Grade (10/11/12)
   * and immediately reloads Chapters & Lessons for (newSubject, currentGrade).
   */
  preserveGradeOnSubjectChange?: boolean;
  /** Optional compact density for per-question inline editors. */
  compact?: boolean;
  onChange: (next: CurriculumSelectionValue, meta?: { lessonsCount: number }) => void;
  onLessonsLoaded?: (lessons: CurriculumLesson[]) => void;
  onLoadingChange?: (isLoading: boolean) => void;
  onRequestAddSubject?: () => void;
  isAddingSubjectOpen?: boolean;
}

export const CurriculumCascadeSelector: React.FC<CurriculumCascadeSelectorProps> = ({
  value,
  subjects,
  legacyLessonTopic,
  requireChapterBeforeLesson = false,
  preserveGradeOnSubjectChange = false,
  compact = false,
  onChange,
  onLessonsLoaded,
  onLoadingChange,
  onRequestAddSubject,
  isAddingSubjectOpen,
}) => {
  const [lessons, setLessons] = useState<CurriculumLesson[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [curriculumConfig, setCurriculumConfig] = useState<CurriculumConfig | null>(null);
  const [selectedTextbook, setSelectedTextbook] = useState<string>('all');

  // Searchable dropdown states (Subject, Chapter, Lesson)
  const [isSubjectDropdownOpen, setIsSubjectDropdownOpen] = useState<boolean>(false);
  const [subjectSearch, setSubjectSearch] = useState<string>('');
  const [isChapterDropdownOpen, setIsChapterDropdownOpen] = useState<boolean>(false);
  const [chapterSearch, setChapterSearch] = useState<string>('');
  const [isLessonDropdownOpen, setIsLessonDropdownOpen] = useState<boolean>(false);
  const [lessonSearch, setLessonSearch] = useState<string>('');

  const subjectDropdownRef = useRef<HTMLDivElement | null>(null);
  const chapterDropdownRef = useRef<HTMLDivElement | null>(null);
  const lessonDropdownRef = useRef<HTMLDivElement | null>(null);
  const fetchTokenRef = useRef<number>(0);

  // Load approved textbook series configuration once
  useEffect(() => {
    let active = true;
    void fetchCurriculumConfigFromFirestore().then((cfg) => {
      if (active) setCurriculumConfig(cfg);
    });
    return () => {
      active = false;
    };
  }, []);

  // Close open searchable dropdown popovers on outside click or Escape
  useEffect(() => {
    if (!isSubjectDropdownOpen && !isChapterDropdownOpen && !isLessonDropdownOpen) return;
    const handleClickOutside = (ev: MouseEvent) => {
      const target = ev.target as Node;
      if (
        isSubjectDropdownOpen &&
        subjectDropdownRef.current &&
        !subjectDropdownRef.current.contains(target)
      ) {
        setIsSubjectDropdownOpen(false);
      }
      if (
        isChapterDropdownOpen &&
        chapterDropdownRef.current &&
        !chapterDropdownRef.current.contains(target)
      ) {
        setIsChapterDropdownOpen(false);
      }
      if (
        isLessonDropdownOpen &&
        lessonDropdownRef.current &&
        !lessonDropdownRef.current.contains(target)
      ) {
        setIsLessonDropdownOpen(false);
      }
    };
    const handleKeyDown = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') {
        setIsSubjectDropdownOpen(false);
        setIsChapterDropdownOpen(false);
        setIsLessonDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isSubjectDropdownOpen, isChapterDropdownOpen, isLessonDropdownOpen]);

  const isStandardGrade =
    value.grade === '10' || value.grade === '11' || value.grade === '12';

  const loadLessons = async (forceRefresh = false) => {
    const requestToken = ++fetchTokenRef.current;

    if (!value.subjectId || !isStandardGrade) {
      setLessons([]);
      setLoadError(null);
      setIsLoading(false);
      onLoadingChange?.(false);
      onLessonsLoaded?.([]);
      return;
    }

    setIsLoading(true);
    onLoadingChange?.(true);
    setLoadError(null);
    try {
      const loaded = await fetchCurriculumLessonsBySubjectGrade(
        value.subjectId,
        value.grade as CurriculumGrade,
        { includeInactive: false, forceRefresh }
      );
      if (requestToken !== fetchTokenRef.current) return;
      setLessons(loaded);
      onLessonsLoaded?.(loaded);
    } catch (err) {
      if (requestToken !== fetchTokenRef.current) return;
      setLoadError(
        err instanceof Error
          ? err.message
          : 'Không thể tải danh mục bài học từ Firestore.'
      );
      setLessons([]);
      onLessonsLoaded?.([]);
    } finally {
      if (requestToken === fetchTokenRef.current) {
        setIsLoading(false);
        onLoadingChange?.(false);
      }
    }
  };

  useEffect(() => {
    setIsChapterDropdownOpen(false);
    setIsLessonDropdownOpen(false);
    setChapterSearch('');
    setLessonSearch('');
    setSelectedTextbook('all');
    void loadLessons(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.subjectId, value.grade]);

  const availableTextbooks = useMemo(
    () => Array.from(new Set(lessons.map((l) => l.textbookSeries).filter(Boolean))),
    [lessons]
  );

  // When multiple textbooks exist for this Subject + Grade, default to the selected lesson's textbook or school's configured textbook
  useEffect(() => {
    if (availableTextbooks.length <= 1) {
      setSelectedTextbook('all');
      return;
    }
    if (value.lessonId) {
      const currentLesson = lessons.find(
        (l) => l.lessonId === value.lessonId || l.id === value.lessonId
      );
      if (
        currentLesson?.textbookSeries &&
        availableTextbooks.includes(currentLesson.textbookSeries)
      ) {
        setSelectedTextbook(currentLesson.textbookSeries);
        return;
      }
    }
    if (
      selectedTextbook === 'all' &&
      curriculumConfig?.textbookSeries &&
      availableTextbooks.includes(curriculumConfig.textbookSeries)
    ) {
      setSelectedTextbook(curriculumConfig.textbookSeries);
    }
  }, [availableTextbooks, curriculumConfig?.textbookSeries, lessons, value.lessonId, selectedTextbook]);

  const { chapters, lessons: scopedLessons } = useMemo(
    () =>
      filterAndGroupCurriculumLessons(lessons, {
        includeInactive: false,
        textbookSeries: availableTextbooks.length > 1 ? selectedTextbook : undefined,
      }),
    [lessons, availableTextbooks.length, selectedTextbook]
  );

  const filteredSubjects = useMemo(() => {
    const q = subjectSearch.trim().toLowerCase();
    if (!q) return subjects;
    return subjects.filter(
      (sub) =>
        sub.name.toLowerCase().includes(q) ||
        (sub.shortName || '').toLowerCase().includes(q) ||
        sub.id.toLowerCase().includes(q)
    );
  }, [subjects, subjectSearch]);

  const filteredChapters = useMemo(() => {
    const q = chapterSearch.trim().toLowerCase();
    if (!q) return chapters;
    return chapters.filter((ch) => ch.chapterName.toLowerCase().includes(q));
  }, [chapters, chapterSearch]);

  const filteredByChapterAndSearch = useMemo(() => {
    // When requireChapterBeforeLesson is true, never return lessons if no chapter is chosen
    if (requireChapterBeforeLesson && !value.chapterId) {
      return { lessons: [], chapters: [] };
    }
    return filterAndGroupCurriculumLessons(lessons, {
      includeInactive: false,
      textbookSeries: availableTextbooks.length > 1 ? selectedTextbook : undefined,
      chapterId: value.chapterId || undefined,
      searchTerm: lessonSearch,
    });
  }, [
    requireChapterBeforeLesson,
    lessons,
    availableTextbooks.length,
    selectedTextbook,
    value.chapterId,
    lessonSearch,
  ]);

  const selectedSubjectObj = useMemo(
    () => subjects.find((s) => s.id === value.subjectId),
    [subjects, value.subjectId]
  );

  const selectedChapterObj = useMemo(
    () => chapters.find((c) => c.chapterId === value.chapterId),
    [chapters, value.chapterId]
  );

  const handleSubjectChange = (nextSubId: string) => {
    const found = subjects.find((s) => s.id === nextSubId);
    setIsSubjectDropdownOpen(false);
    setIsChapterDropdownOpen(false);
    setIsLessonDropdownOpen(false);
    setSubjectSearch('');
    setChapterSearch('');
    setLessonSearch('');

    const preservedGrade: ChemGrade | '' =
      preserveGradeOnSubjectChange &&
      (value.grade === '10' || value.grade === '11' || value.grade === '12')
        ? value.grade
        : '';

    // Always clear dependent chapter and lesson immediately when subject changes
    onChange({
      subjectId: nextSubId,
      subjectName: found?.name || '',
      grade: nextSubId ? preservedGrade : '',
      textbookSeries: curriculumConfig?.textbookSeries || '',
      chapterId: '',
      chapterName: '',
      lessonId: '',
      lessonName: '',
    });
  };

  const handleGradeChange = (nextGradeRaw: string) => {
    const nextGrade = nextGradeRaw as ChemGrade | '';
    setIsChapterDropdownOpen(false);
    setIsLessonDropdownOpen(false);
    setChapterSearch('');
    setLessonSearch('');
    // Always clear dependent chapter and lesson immediately when grade changes
    onChange({
      ...value,
      grade: nextGrade,
      textbookSeries: curriculumConfig?.textbookSeries || '',
      chapterId: '',
      chapterName: '',
      lessonId: '',
      lessonName: '',
    });
  };

  const handleChapterChange = (nextChapterId: string) => {
    setIsChapterDropdownOpen(false);
    setIsLessonDropdownOpen(false);
    setChapterSearch('');
    setLessonSearch('');

    if (!nextChapterId) {
      onChange({
        ...value,
        chapterId: '',
        chapterName: '',
        lessonId: '',
        lessonName: '',
      });
      return;
    }

    const ch = chapters.find((c) => c.chapterId === nextChapterId);
    const keepLesson =
      !requireChapterBeforeLesson &&
      Boolean(ch?.lessons.some((l) => l.lessonId === value.lessonId));
    const chapterTextbook =
      ch?.lessons[0]?.textbookSeries ||
      value.textbookSeries ||
      curriculumConfig?.textbookSeries ||
      '';

    onChange({
      ...value,
      textbookSeries: chapterTextbook,
      chapterId: nextChapterId,
      chapterName: ch?.chapterName || '',
      lessonId: keepLesson ? value.lessonId : '',
      lessonName: keepLesson ? value.lessonName : '',
    });
  };

  const handleSelectLesson = (lesson: CurriculumLesson) => {
    // Guard: if a chapter is strictly required, never accept a lesson from a different chapter
    if (requireChapterBeforeLesson && value.chapterId && lesson.chapterId !== value.chapterId) {
      return;
    }
    onChange({
      ...value,
      textbookSeries:
        lesson.textbookSeries ||
        value.textbookSeries ||
        curriculumConfig?.textbookSeries ||
        '',
      chapterId: lesson.chapterId,
      chapterName: lesson.chapterName,
      lessonId: lesson.lessonId,
      lessonName: lesson.lessonName,
    });
    setIsLessonDropdownOpen(false);
    setLessonSearch('');
  };

  const hasSubject = Boolean(value.subjectId);
  const hasGrade = Boolean(value.grade);
  const hasChapter = Boolean(value.chapterId);
  const canPickChapter = hasSubject && hasGrade && !isLoading && chapters.length > 0;
  const canPickLesson = requireChapterBeforeLesson
    ? canPickChapter && hasChapter && filteredByChapterAndSearch.lessons.length > 0
    : hasSubject && hasGrade && !isLoading && lessons.length > 0;

  const fieldHeightClass = compact ? 'min-h-[36px] py-1.5' : 'min-h-[40px] py-2';
  const gridGapClass = compact ? 'gap-3' : 'gap-4';

  return (
    <div className={compact ? 'space-y-3' : 'space-y-4'}>
      {/* 1. Môn học (searchable) + 2. Khối lớp */}
      <div className={`grid grid-cols-1 sm:grid-cols-2 ${gridGapClass}`}>
        <div ref={subjectDropdownRef} className="relative">
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-bold text-slate-700">1. Môn học *</label>
            {onRequestAddSubject && (
              <button
                type="button"
                onClick={onRequestAddSubject}
                className="text-xs font-semibold text-teal-700 hover:text-teal-900 inline-flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{isAddingSubjectOpen ? 'Đóng' : 'Thêm môn mới'}</span>
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => {
              setIsSubjectDropdownOpen((prev) => !prev);
              setIsChapterDropdownOpen(false);
              setIsLessonDropdownOpen(false);
            }}
            aria-haspopup="listbox"
            aria-expanded={isSubjectDropdownOpen}
            aria-label="Chọn môn học"
            className={`w-full ${fieldHeightClass} px-3 rounded-xl border text-left text-xs flex items-center justify-between gap-2 transition-colors ${
              value.subjectId
                ? 'border-teal-400 bg-white text-slate-900 font-semibold hover:border-teal-500'
                : 'border-slate-300 bg-white text-slate-500 font-medium hover:border-slate-400'
            }`}
          >
            <span className="truncate">
              {selectedSubjectObj?.name || value.subjectName || '-- Chọn môn học --'}
            </span>
            <ChevronDown
              className={`w-4 h-4 shrink-0 transition-transform ${
                isSubjectDropdownOpen ? 'rotate-180 text-teal-600' : 'text-slate-400'
              }`}
            />
          </button>

          {isSubjectDropdownOpen && (
            <div
              role="listbox"
              aria-label="Danh sách môn học"
              className="absolute left-0 right-0 mt-1.5 z-50 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden"
            >
              {subjects.length > 6 && (
                <div className="p-2 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
                  <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <input
                    type="text"
                    autoFocus
                    value={subjectSearch}
                    onChange={(e) => setSubjectSearch(e.target.value)}
                    placeholder="Tìm nhanh môn học..."
                    className="flex-1 bg-transparent text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none"
                  />
                  {subjectSearch && (
                    <button
                      type="button"
                      onClick={() => setSubjectSearch('')}
                      className="p-0.5 text-slate-400 hover:text-slate-700"
                      aria-label="Xóa từ khóa tìm môn học"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              )}

              <div className="max-h-60 overflow-y-auto py-1">
                {filteredSubjects.length === 0 ? (
                  <div className="p-3 text-center text-xs text-slate-500">
                    Không tìm thấy môn học phù hợp "{subjectSearch}".
                  </div>
                ) : (
                  filteredSubjects.map((sub) => {
                    const isSelected = value.subjectId === sub.id;
                    return (
                      <button
                        key={sub.id}
                        type="button"
                        onClick={() => handleSubjectChange(sub.id)}
                        className={`w-full px-3.5 py-2 text-left text-xs flex items-center justify-between gap-2 transition-colors ${
                          isSelected
                            ? 'bg-teal-50 text-teal-900 font-bold'
                            : 'text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <span className="truncate">{sub.name}</span>
                        {isSelected && <Check className="w-3.5 h-3.5 text-teal-600 shrink-0" />}
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1.5">
            2. Khối lớp *
          </label>
          <select
            value={value.grade}
            disabled={!hasSubject}
            onChange={(e) => handleGradeChange(e.target.value)}
            aria-label="Chọn khối lớp"
            className={`w-full ${fieldHeightClass} px-3 rounded-xl border border-slate-300 bg-white text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed`}
          >
            <option value="">
              {hasSubject ? '-- Chọn khối lớp --' : 'Vui lòng chọn môn học trước'}
            </option>
            {CURRICULUM_GRADES.map((g) => (
              <option key={g.id} value={g.id}>
                {g.label}
              </option>
            ))}
            {value.grade === 'chuyen_hsg' && (
              <option value="chuyen_hsg">Chuyên &amp; HSG (dữ liệu cũ)</option>
            )}
          </select>
        </div>
      </div>

      {/* Optional Textbook Selector when >1 textbook series exists for selected Subject + Grade */}
      {availableTextbooks.length > 1 && (
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1.5">
            Bộ sách giáo khoa ({availableTextbooks.length} bộ sách khả dụng)
          </label>
          <select
            value={selectedTextbook}
            onChange={(e) => {
              const nextTb = e.target.value;
              setSelectedTextbook(nextTb);
              setIsChapterDropdownOpen(false);
              setIsLessonDropdownOpen(false);
              setChapterSearch('');
              setLessonSearch('');
              onChange({
                ...value,
                textbookSeries: nextTb === 'all' ? '' : nextTb,
                chapterId: '',
                chapterName: '',
                lessonId: '',
                lessonName: '',
              });
            }}
            aria-label="Chọn bộ sách giáo khoa"
            className={`w-full ${fieldHeightClass} px-3 rounded-xl border border-slate-300 bg-white text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500`}
          >
            <option value="all">-- Tất cả bộ sách ({availableTextbooks.length}) --</option>
            {availableTextbooks.map((tb) => (
              <option key={tb} value={tb}>
                {tb}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* 3. Chương/Chủ đề (searchable) + 4. Bài học (searchable, strictly scoped to Chapter) */}
      <div className={`grid grid-cols-1 sm:grid-cols-2 ${gridGapClass}`}>
        <div ref={chapterDropdownRef} className="relative">
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-bold text-slate-700">
              3. Chương / Chủ đề {requireChapterBeforeLesson && chapters.length > 0 ? '*' : ''}
            </label>
            {isLoading && (
              <span className="text-[11px] font-medium text-teal-700 inline-flex items-center gap-1">
                <Loader2 className="w-3 h-3 animate-spin" />
                Đang tải...
              </span>
            )}
          </div>

          <button
            type="button"
            disabled={!canPickChapter}
            onClick={() => {
              setIsChapterDropdownOpen((prev) => !prev);
              setIsSubjectDropdownOpen(false);
              setIsLessonDropdownOpen(false);
            }}
            aria-haspopup="listbox"
            aria-expanded={isChapterDropdownOpen}
            aria-label="Chọn chương hoặc chủ đề"
            className={`w-full ${fieldHeightClass} px-3 rounded-xl border text-left text-xs flex items-center justify-between gap-2 transition-colors ${
              !canPickChapter
                ? 'border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed'
                : value.chapterId
                ? 'border-teal-400 bg-white text-slate-900 font-semibold hover:border-teal-500'
                : 'border-slate-300 bg-white text-slate-600 font-medium hover:border-slate-400'
            }`}
          >
            <span className="truncate">
              {!hasSubject || !hasGrade
                ? 'Chọn môn và khối lớp trước'
                : isLoading
                ? 'Đang tải danh sách chương...'
                : chapters.length === 0
                ? 'Chưa có danh mục chương'
                : selectedChapterObj
                ? `${selectedChapterObj.chapterName} (${selectedChapterObj.lessons.length} bài)`
                : value.chapterName || `-- Chọn chương / chủ đề (${chapters.length}) --`}
            </span>
            <ChevronDown
              className={`w-4 h-4 shrink-0 transition-transform ${
                isChapterDropdownOpen ? 'rotate-180 text-teal-600' : 'text-slate-400'
              }`}
            />
          </button>

          {isChapterDropdownOpen && canPickChapter && (
            <div
              role="listbox"
              aria-label="Danh sách chương hoặc chủ đề"
              className="absolute left-0 right-0 mt-1.5 z-40 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden"
            >
              {chapters.length > 5 && (
                <div className="p-2 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
                  <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <input
                    type="text"
                    autoFocus
                    value={chapterSearch}
                    onChange={(e) => setChapterSearch(e.target.value)}
                    placeholder="Tìm nhanh chương / chủ đề..."
                    className="flex-1 bg-transparent text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none"
                  />
                  {chapterSearch && (
                    <button
                      type="button"
                      onClick={() => setChapterSearch('')}
                      className="p-0.5 text-slate-400 hover:text-slate-700"
                      aria-label="Xóa từ khóa tìm chương"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              )}

              <div className="max-h-60 overflow-y-auto py-1">
                {!requireChapterBeforeLesson && (
                  <button
                    type="button"
                    onClick={() => handleChapterChange('')}
                    className={`w-full px-3.5 py-2 text-left text-xs flex items-center justify-between gap-2 transition-colors ${
                      !value.chapterId
                        ? 'bg-teal-50 text-teal-900 font-bold'
                        : 'text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <span>-- Tất cả chương ({chapters.length}) --</span>
                    {!value.chapterId && <Check className="w-3.5 h-3.5 text-teal-600 shrink-0" />}
                  </button>
                )}

                {filteredChapters.length === 0 ? (
                  <div className="p-3 text-center text-xs text-slate-500">
                    Không tìm thấy chương phù hợp "{chapterSearch}".
                  </div>
                ) : (
                  filteredChapters.map((ch) => {
                    const isSelected = value.chapterId === ch.chapterId;
                    return (
                      <button
                        key={ch.chapterId}
                        type="button"
                        onClick={() => handleChapterChange(ch.chapterId)}
                        className={`w-full px-3.5 py-2 text-left text-xs flex items-center justify-between gap-2 transition-colors ${
                          isSelected
                            ? 'bg-teal-50 text-teal-900 font-bold'
                            : 'text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <span className="truncate">
                          {ch.chapterName}{' '}
                          <span className="text-slate-400 font-normal">
                            ({ch.lessons.length} bài)
                          </span>
                        </span>
                        {isSelected && <Check className="w-3.5 h-3.5 text-teal-600 shrink-0" />}
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>

        <div ref={lessonDropdownRef} className="relative">
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-bold text-slate-700">
              4. Bài học {lessons.length > 0 ? '*' : ''}
            </label>
            {isLoading && (
              <span className="text-[11px] font-medium text-teal-700 inline-flex items-center gap-1">
                <Loader2 className="w-3 h-3 animate-spin" />
                Đang tải...
              </span>
            )}
          </div>

          <button
            type="button"
            disabled={!canPickLesson}
            onClick={() => {
              setIsLessonDropdownOpen((prev) => !prev);
              setIsSubjectDropdownOpen(false);
              setIsChapterDropdownOpen(false);
            }}
            aria-haspopup="listbox"
            aria-expanded={isLessonDropdownOpen}
            aria-label="Chọn bài học"
            className={`w-full ${fieldHeightClass} px-3 rounded-xl border text-left text-xs flex items-center justify-between gap-2 transition-colors ${
              !canPickLesson
                ? 'border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed'
                : value.lessonId
                ? 'border-teal-400 bg-white text-slate-900 font-semibold hover:border-teal-500'
                : 'border-slate-300 bg-white text-slate-600 font-medium hover:border-slate-400'
            }`}
          >
            <span className="truncate">
              {!hasSubject
                ? 'Khóa: Chọn môn học trước'
                : !hasGrade
                ? 'Khóa: Chọn khối lớp trước'
                : isLoading
                ? 'Đang tải danh sách bài học...'
                : lessons.length === 0
                ? 'Chưa có danh mục bài học'
                : requireChapterBeforeLesson && !hasChapter
                ? 'Chọn chương / chủ đề trước'
                : value.lessonName || '-- Chọn bài học thuộc chương --'}
            </span>
            <ChevronDown
              className={`w-4 h-4 shrink-0 transition-transform ${
                isLessonDropdownOpen ? 'rotate-180 text-teal-600' : 'text-slate-400'
              }`}
            />
          </button>

          {/* Searchable Grouped Lesson Popover */}
          {isLessonDropdownOpen && canPickLesson && (
            <div
              role="listbox"
              aria-label="Danh sách bài học theo chương"
              className="absolute left-0 right-0 mt-1.5 z-40 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden"
            >
              <div className="p-2 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
                <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <input
                  type="text"
                  autoFocus
                  value={lessonSearch}
                  onChange={(e) => setLessonSearch(e.target.value)}
                  placeholder="Tìm nhanh bài học..."
                  className="flex-1 bg-transparent text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none"
                />
                {lessonSearch && (
                  <button
                    type="button"
                    onClick={() => setLessonSearch('')}
                    className="p-0.5 text-slate-400 hover:text-slate-700"
                    aria-label="Xóa từ khóa tìm bài học"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <div className="max-h-64 overflow-y-auto divide-y divide-slate-100">
                {filteredByChapterAndSearch.chapters.length === 0 ? (
                  <div className="p-4 text-center text-xs text-slate-500">
                    Không tìm thấy bài học phù hợp từ khóa "{lessonSearch}".
                  </div>
                ) : (
                  filteredByChapterAndSearch.chapters.map((ch) => (
                    <div key={ch.chapterId} className="py-1">
                      <div className="px-3 py-1.5 bg-slate-50/90 text-[11px] font-bold text-slate-600 flex items-center gap-1.5 sticky top-0">
                        <Layers className="w-3 h-3 text-teal-600 shrink-0" />
                        <span className="truncate">{ch.chapterName}</span>
                      </div>
                      <div className="py-0.5">
                        {ch.lessons.map((lesson) => {
                          const isSelected = value.lessonId === lesson.lessonId;
                          return (
                            <button
                              key={lesson.id}
                              type="button"
                              onClick={() => handleSelectLesson(lesson)}
                              className={`w-full px-3.5 py-2 text-left text-xs flex items-center justify-between gap-2 transition-colors ${
                                isSelected
                                  ? 'bg-teal-50 text-teal-900 font-bold'
                                  : 'text-slate-700 hover:bg-slate-50'
                              }`}
                            >
                              <span className="truncate">{lesson.lessonName}</span>
                              {isSelected && (
                                <Check className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Contextual Status / Textbook Attribution / Empty Catalog Notice */}
      {hasSubject && hasGrade && (
        <div className="text-xs">
          {loadError ? (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{loadError}</span>
              </span>
              <button
                type="button"
                onClick={() => void loadLessons(true)}
                className="px-2.5 py-1 rounded-lg bg-white border border-rose-200 font-semibold text-rose-700 hover:bg-rose-100 inline-flex items-center gap-1 shrink-0"
              >
                <RefreshCw className="w-3 h-3" />
                Thử lại
              </button>
            </div>
          ) : isLoading ? (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-teal-50/70 border border-teal-200 text-teal-800 text-[11px] font-medium">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-teal-600 shrink-0" />
              <span>
                Đang tải danh mục chương &amp; bài học từ Firestore cho{' '}
                <strong>{selectedSubjectObj?.name || value.subjectName || 'môn đã chọn'}</strong> ·{' '}
                <strong>Lớp {value.grade}</strong>...
              </span>
            </div>
          ) : lessons.length === 0 ? (
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <p className="font-semibold">
                  Chưa có dữ liệu chương / bài học tương ứng cho{' '}
                  {selectedSubjectObj?.name || value.subjectName || 'môn này'} ·{' '}
                  {value.grade === 'chuyen_hsg' ? 'Chuyên & HSG' : `Lớp ${value.grade}`}.
                </p>
                <p className="text-[11px] text-amber-800">
                  {curriculumConfig?.textbookSeries
                    ? `Bộ sách đang cấu hình: ${curriculumConfig.textbookSeries} (${curriculumConfig.textbookYear}). `
                    : 'Nhà trường chưa cấu hình bộ sách giáo khoa thống nhất. '}
                  Quản trị viên cần nhập danh mục chương &amp; bài học chuẩn tại mục{' '}
                  <strong>Danh mục bài học</strong> trong trang Quản trị.
                </p>
              </div>
            </div>
          ) : scopedLessons.length > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-[11px] text-slate-600">
              <span className="inline-flex items-center gap-1.5">
                <BookOpen className="w-3.5 h-3.5 text-teal-600" />
                <span>
                  Bộ sách:{' '}
                  <strong className="text-slate-800">
                    {availableTextbooks.length > 1 && selectedTextbook === 'all'
                      ? availableTextbooks.join(', ')
                      : scopedLessons[0].textbookSeries}
                  </strong>{' '}
                  · Năm áp dụng:{' '}
                  <strong className="text-slate-800">{scopedLessons[0].textbookYear}</strong>
                </span>
              </span>
              <span className="tabular-nums text-slate-500">
                {chapters.length} chương · {scopedLessons.length} bài học khả dụng
              </span>
            </div>
          ) : null}

          {!value.lessonId && legacyLessonTopic && (
            <p className="mt-1.5 text-[11px] text-slate-600 px-1">
              Phân loại cũ (chưa gắn mã bài SGK):{' '}
              <strong className="text-slate-800">{legacyLessonTopic}</strong>
            </p>
          )}
        </div>
      )}
    </div>
  );
};
