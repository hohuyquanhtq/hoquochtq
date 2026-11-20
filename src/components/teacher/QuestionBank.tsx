import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  CognitiveLevel,
  CurriculumGrade,
  CurriculumLesson,
  Folder,
  ParsedExamResult,
  Question,
  QuestionType,
  SubjectItem,
} from '../../types';
import {
  COGNITIVE_LEVEL_LABELS,
  COGNITIVE_LEVEL_SHORT_LABELS,
  DEFAULT_GDPT_2018_SUBJECTS,
  GRADE_LABELS,
  QUESTION_TYPE_SHORT_LABELS,
  generateQuestionCode,
  getQuestionTopicDisplay,
  resolveQuestionSubject,
} from '../../constants/subjects';
import {
  BarChart3,
  BookOpen,
  CheckCircle2,
  CheckSquare,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Copy,
  Edit3,
  Eye,
  FlaskConical,
  Loader2,
  Plus,
  Search,
  Sparkles,
  Square,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { ChemRenderer } from '../../utils/chemRenderer';
import { parseDocxExam } from '../../utils/docxParser';
import { WordImportReviewModal } from './WordImportReviewModal';
import { generateAiChemistryExplanation } from '../../services/geminiService';
import {
  fetchCurriculumLessonsBySubjectGrade,
  filterAndGroupCurriculumLessons,
} from '../../services/curriculumService';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { QuestionFormModal } from './QuestionFormModal';

interface QuestionBankProps {
  questions: Question[];
  folders: Folder[];
  subjects?: SubjectItem[];
  currentUserId?: string;
  onAddSubject?: (subject: SubjectItem) => void;
  onAddQuestion: (q: Question) => void;
  onUpdateQuestion: (q: Question) => void;
  onDeleteQuestion: (id: string) => void;
  onBulkDeleteQuestions?: (ids: string[]) => void;
  onCreateExamFromSelected: (selectedQuestions: Question[]) => void;
}

export const QuestionBank: React.FC<QuestionBankProps> = ({
  questions,
  subjects = DEFAULT_GDPT_2018_SUBJECTS,
  currentUserId,
  onAddSubject,
  onAddQuestion,
  onUpdateQuestion,
  onDeleteQuestion,
  onBulkDeleteQuestions,
  onCreateExamFromSelected,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [subjectFilter, setSubjectFilter] = useState<string>('all');
  const [gradeFilter, setGradeFilter] = useState<string>('all');
  const [chapterFilter, setChapterFilter] = useState<string>('all');
  const [lessonTopicFilter, setLessonTopicFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [levelFilter, setLevelFilter] = useState<string>('all');

  const [catalogLessons, setCatalogLessons] = useState<CurriculumLesson[]>([]);
  const [isLoadingCatalog, setIsLoadingCatalog] = useState<boolean>(false);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [viewingQuestion, setViewingQuestion] = useState<Question | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<
    | { mode: 'single'; question: Question }
    | { mode: 'bulk'; ids: string[] }
    | null
  >(null);

  const [showStatsPanel, setShowStatsPanel] = useState<boolean>(false);
  const [pageSize, setPageSize] = useState<number>(15);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [aiLoadingId, setAiLoadingId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // States bóc tách Word sử dụng engine chuẩn của hệ thống
  const wordInputRef = useRef<HTMLInputElement | null>(null);
  const [isExtractingWord, setIsExtractingWord] = useState<boolean>(false);
  const [activeWordResult, setActiveWordResult] = useState<ParsedExamResult | null>(null);
  const [activeWordFileName, setActiveWordFileName] = useState<string>('');
  const [activeWordFileSize, setActiveWordFileSize] = useState<number>(0);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3200);
  };

  // Fetch danh mục bài học SGK khi chọn môn & khối lớp chuẩn
  useEffect(() => {
    let active = true;
    const isStdGrade = gradeFilter === '10' || gradeFilter === '11' || gradeFilter === '12';
    if (subjectFilter === 'all' || !isStdGrade) {
      setCatalogLessons([]);
      setIsLoadingCatalog(false);
      return;
    }

    setIsLoadingCatalog(true);
    void fetchCurriculumLessonsBySubjectGrade(
      subjectFilter,
      gradeFilter as CurriculumGrade,
      { includeInactive: false }
    )
      .then((rows) => {
        if (active) setCatalogLessons(rows);
      })
      .catch(() => {
        if (active) setCatalogLessons([]);
      })
      .finally(() => {
        if (active) setIsLoadingCatalog(false);
      });

    return () => {
      active = false;
    };
  }, [subjectFilter, gradeFilter]);

  const groupedCatalog = useMemo(
    () => filterAndGroupCurriculumLessons(catalogLessons, { includeInactive: false }),
    [catalogLessons]
  );

  const questionCountByLesson = useMemo(() => {
    const byId = new Map<string, number>();
    const byLabel = new Map<string, number>();
    questions.forEach((q) => {
      const sub = resolveQuestionSubject(q, subjects);
      if (subjectFilter !== 'all' && sub.id !== subjectFilter) return;
      if (gradeFilter !== 'all' && q.grade !== gradeFilter) return;
      if (q.lessonId) {
        byId.set(q.lessonId, (byId.get(q.lessonId) || 0) + 1);
      }
      const label = getQuestionTopicDisplay(q);
      byLabel.set(label, (byLabel.get(label) || 0) + 1);
    });
    return { byId, byLabel };
  }, [questions, subjects, subjectFilter, gradeFilter]);

  const availableTopicOptions = useMemo(() => {
    const map = new Map<string, number>();
    questions.forEach((q) => {
      const sub = resolveQuestionSubject(q, subjects);
      if (subjectFilter !== 'all' && sub.id !== subjectFilter) return;
      if (gradeFilter !== 'all' && q.grade !== gradeFilter) return;
      if (chapterFilter !== 'all' && q.chapterId !== chapterFilter) return;
      const label = getQuestionTopicDisplay(q);
      map.set(label, (map.get(label) || 0) + 1);
    });
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0], 'vi'));
  }, [questions, subjects, subjectFilter, gradeFilter, chapterFilter]);

  const legacyTopicsOutsideCatalog = useMemo(() => {
    if (catalogLessons.length === 0) return [];
    const catalogIds = new Set(catalogLessons.map((l) => l.lessonId));
    const catalogNames = new Set(catalogLessons.map((l) => l.lessonName.trim().toLowerCase()));
    const map = new Map<string, number>();
    questions.forEach((q) => {
      const sub = resolveQuestionSubject(q, subjects);
      if (subjectFilter !== 'all' && sub.id !== subjectFilter) return;
      if (gradeFilter !== 'all' && q.grade !== gradeFilter) return;
      if (q.lessonId && catalogIds.has(q.lessonId)) return;
      const label = getQuestionTopicDisplay(q);
      if (catalogNames.has(label.trim().toLowerCase())) return;
      map.set(label, (map.get(label) || 0) + 1);
    });
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0], 'vi'));
  }, [catalogLessons, questions, subjects, subjectFilter, gradeFilter]);

  // Bộ lọc danh sách câu hỏi
  const filtered = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return questions.filter((q) => {
      const sub = resolveQuestionSubject(q, subjects);
      if (subjectFilter !== 'all' && sub.id !== subjectFilter) return false;
      if (gradeFilter !== 'all' && q.grade !== gradeFilter) return false;
      if (chapterFilter !== 'all' && q.chapterId !== chapterFilter) return false;
      if (lessonTopicFilter !== 'all') {
        if (lessonTopicFilter.startsWith('lessonId:')) {
          const targetId = lessonTopicFilter.slice(9);
          const matchedLesson = catalogLessons.find((l) => l.lessonId === targetId);
          const matchesId = q.lessonId === targetId;
          const matchesLegacyName =
            Boolean(matchedLesson) &&
            !q.lessonId &&
            getQuestionTopicDisplay(q) === matchedLesson?.lessonName;
          if (!matchesId && !matchesLegacyName) return false;
        } else if (getQuestionTopicDisplay(q) !== lessonTopicFilter) {
          return false;
        }
      }
      if (typeFilter !== 'all' && q.type !== typeFilter) return false;
      if (levelFilter !== 'all' && q.level !== levelFilter) return false;
      if (term) {
        const matchContent = (q.content || '').toLowerCase().includes(term);
        const matchCode = (q.code || '').toLowerCase().includes(term);
        const matchSource = (q.source || '').toLowerCase().includes(term);
        const matchChapter = (q.chapterName || '').toLowerCase().includes(term);
        const matchLesson = (q.lessonName || '').toLowerCase().includes(term);
        const matchLegacyTopic = (q.lessonTopic || '').toLowerCase().includes(term);
        const matchTopic = getQuestionTopicDisplay(q).toLowerCase().includes(term);
        const matchSubject = sub.name.toLowerCase().includes(term);
        if (
          !matchContent &&
          !matchCode &&
          !matchSource &&
          !matchChapter &&
          !matchLesson &&
          !matchLegacyTopic &&
          !matchTopic &&
          !matchSubject
        ) {
          return false;
        }
      }
      return true;
    });
  }, [
    questions,
    subjects,
    subjectFilter,
    gradeFilter,
    chapterFilter,
    lessonTopicFilter,
    catalogLessons,
    typeFilter,
    levelFilter,
    searchTerm,
  ]);

  useEffect(() => {
    setCurrentPage(1);
  }, [
    subjectFilter,
    gradeFilter,
    chapterFilter,
    lessonTopicFilter,
    typeFilter,
    levelFilter,
    searchTerm,
    pageSize,
  ]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedQuestions = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, safePage, pageSize]);

  const stats = useMemo(() => {
    const bySubject = new Map<string, { id: string; name: string; count: number }>();
    const byGrade: Record<string, number> = { '10': 0, '11': 0, '12': 0, chuyen_hsg: 0 };
    const byType: Record<QuestionType, number> = {
      part1_single_choice: 0,
      part1_multiple_choice: 0,
      part2_true_false: 0,
      part3_short_answer: 0,
    };
    const byLevel: Record<CognitiveLevel, number> = {
      nhan_biet: 0,
      thong_hieu: 0,
      van_dung: 0,
      van_dung_cao: 0,
    };
    const byTopic = new Map<
      string,
      {
        label: string;
        total: number;
        nhan_biet: number;
        thong_hieu: number;
        van_dung: number;
        van_dung_cao: number;
      }
    >();

    questions.forEach((q) => {
      const sub = resolveQuestionSubject(q, subjects);
      const curr = bySubject.get(sub.id) || { id: sub.id, name: sub.name, count: 0 };
      curr.count += 1;
      bySubject.set(sub.id, curr);
    });

    filtered.forEach((q) => {
      byGrade[q.grade] = (byGrade[q.grade] || 0) + 1;
      byType[q.type] = (byType[q.type] || 0) + 1;
      byLevel[q.level] = (byLevel[q.level] || 0) + 1;

      const tLabel = getQuestionTopicDisplay(q);
      const entry = byTopic.get(tLabel) || {
        label: tLabel,
        total: 0,
        nhan_biet: 0,
        thong_hieu: 0,
        van_dung: 0,
        van_dung_cao: 0,
      };
      entry.total += 1;
      entry[q.level] = (entry[q.level] || 0) + 1;
      byTopic.set(tLabel, entry);
    });

    return {
      subjectCounts: Array.from(bySubject.values()).sort((a, b) => b.count - a.count),
      byGrade,
      byType,
      byLevel,
      topicBreakdown: Array.from(byTopic.values()).sort((a, b) => b.total - a.total),
    };
  }, [questions, filtered, subjects]);

  const hasActiveFilters =
    subjectFilter !== 'all' ||
    gradeFilter !== 'all' ||
    chapterFilter !== 'all' ||
    lessonTopicFilter !== 'all' ||
    typeFilter !== 'all' ||
    levelFilter !== 'all' ||
    searchTerm.trim().length > 0;

  const clearAllFilters = () => {
    setSubjectFilter('all');
    setGradeFilter('all');
    setChapterFilter('all');
    setLessonTopicFilter('all');
    setTypeFilter('all');
    setLevelFilter('all');
    setSearchTerm('');
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const toggleSelectAllFiltered = () => {
    if (selectedIds.size === filtered.length && filtered.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((q) => q.id)));
    }
  };

  const handleDuplicateQuestion = (q: Question) => {
    const nowIso = new Date().toISOString();
    const sub = resolveQuestionSubject(q, subjects);
    const cloned: Question = {
      ...structuredClone(q),
      id: `q_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      code: generateQuestionCode({
        subjectId: sub.id,
        grade: q.grade,
        type: q.type,
        subjects,
      }),
      subjectId: sub.id,
      subjectName: sub.name,
      ownerId: currentUserId || q.ownerId,
      authorId: currentUserId || q.authorId,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    onAddQuestion(cloned);
    showToast(`Đã nhân bản câu hỏi thành mã ${cloned.code}`);
  };

  const handleAiExplain = async (q: Question) => {
    setAiLoadingId(q.id);
    try {
      const exp = await generateAiChemistryExplanation(q);
      const isErrorNotice =
        exp.startsWith('Lưu ý: Cần thiết lập GEMINI_API_KEY') ||
        exp.startsWith('Đã xảy ra lỗi khi kết nối') ||
        exp.startsWith('Không thể tạo lời giải tự động');
      if (isErrorNotice) {
        showToast(exp);
        return;
      }
      onUpdateQuestion({ ...q, explanation: exp });
      showToast('Đã tạo giải thích chi tiết thành công!');
    } catch {
      showToast('Không thể tạo lời giải AI lúc này.');
    } finally {
      setAiLoadingId(null);
    }
  };

  const handleConfirmDelete = () => {
    if (!deleteTarget) return;
    if (deleteTarget.mode === 'single') {
      onDeleteQuestion(deleteTarget.question.id);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(deleteTarget.question.id);
        return next;
      });
      showToast(`Đã xóa câu hỏi ${deleteTarget.question.code}`);
    } else {
      const ids = deleteTarget.ids;
      if (onBulkDeleteQuestions) {
        onBulkDeleteQuestions(ids);
      } else {
        ids.forEach((id) => onDeleteQuestion(id));
      }
      setSelectedIds(new Set());
      showToast(`Đã xóa ${ids.length} câu hỏi đã chọn`);
    }
    setDeleteTarget(null);
  };

  // --- XỬ LÝ BÓC TÁCH FILE WORD: GHI ĐÈ TRỰC TIẾP METADATA THEO BỘ LỌC NGOÀI ---
  const handleWordFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.docx')) {
      showToast('Vui lòng chọn đúng file Word định dạng .docx.');
      if (wordInputRef.current) wordInputRef.current.value = '';
      return;
    }

    setIsExtractingWord(true);
    try {
      const buffer = await file.arrayBuffer();

      // 1. Xác định chính xác Môn học & Khối lớp từ bộ lọc hiện tại
      const activeSubjectId = subjectFilter !== 'all' ? subjectFilter : (subjects[0]?.id || 'chemistry');
      const activeSubject = subjects.find((s) => s.id === activeSubjectId) || subjects[0];
      const activeGrade = (gradeFilter !== 'all' ? gradeFilter : '11') as CurriculumGrade;

      // 2. Xác định Chương & Bài học đang chọn
      const selectedChapter = groupedCatalog.chapters.find((c) => c.chapterId === chapterFilter);
      let selectedLessonId: string | undefined = undefined;
      let selectedLessonName: string | undefined = undefined;

      if (lessonTopicFilter !== 'all') {
        if (lessonTopicFilter.startsWith('lessonId:')) {
          selectedLessonId = lessonTopicFilter.slice(9);
          const found = catalogLessons.find((l) => l.lessonId === selectedLessonId);
          selectedLessonName = found?.lessonName;
        } else {
          selectedLessonName = lessonTopicFilter;
        }
      }

      // 3. Gọi engine parseDocxExam gốc
      const { result } = await parseDocxExam(buffer, activeGrade as any);

      if (!result.questions || result.questions.length === 0) {
        showToast('Không nhận diện được câu hỏi nào từ file Word.');
        return;
      }

      // 4. ÉP BUỘC ĐỒNG BỘ: Ghi đè toàn bộ Môn, Lớp, Chương, Bài, Mức độ cho từng câu hỏi
      const forcedQuestions = result.questions.map((q) => {
        const finalLevel = levelFilter !== 'all' ? (levelFilter as CognitiveLevel) : (q.level || 'nhan_biet');
        return {
          ...q,
          subjectId: activeSubjectId,
          subjectName: activeSubject.name,
          grade: activeGrade,
          chapterId: chapterFilter !== 'all' ? chapterFilter : q.chapterId,
          chapterName: selectedChapter?.chapterName || q.chapterName,
          lessonId: selectedLessonId || q.lessonId,
          lessonName: selectedLessonName || q.lessonName || 'Bóc tách từ Word',
          lessonTopic: selectedLessonName || q.lessonTopic || 'Bóc tách từ Word',
          level: finalLevel,
          // Tái tạo lại mã câu hỏi đúng theo Môn - Lớp - Dạng chuẩn
          code: generateQuestionCode({
            subjectId: activeSubjectId,
            grade: activeGrade,
            type: q.type,
            subjects,
          }),
        };
      });

      // Gán lại danh sách câu hỏi đã được chuẩn hóa tuyệt đối
      result.questions = forcedQuestions;
      if (result.examMetadata) {
        result.examMetadata.subject = activeSubject.name;
        result.examMetadata.grade = activeGrade as any;
      }

      setActiveWordResult({ ...result });
      setActiveWordFileName(file.name);
      setActiveWordFileSize(file.size);
      showToast(`Đã bóc tách ${result.questions.length} câu theo chuẩn: ${activeSubject.name} · Lớp ${activeGrade}!`);
    } catch (err: any) {
      console.error(err);
      showToast(err.message || 'Lỗi khi đọc file Word.');
    } finally {
      setIsExtractingWord(false);
      if (wordInputRef.current) wordInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-5">
      {/* Input file ẩn phục vụ bóc tách Word */}
      <input
        type="file"
        ref={wordInputRef}
        onChange={handleWordFileChange}
        accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        className="hidden"
      />

      {/* Toast thông báo */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white px-4 py-2.5 rounded-xl shadow-xl flex items-center gap-2 text-xs font-semibold animate-fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-teal-700 font-bold text-xs uppercase tracking-wider">
            <BookOpen className="w-4 h-4" />
            <span>Ngân hàng câu hỏi đa môn · Chương trình GDPT 2018</span>
          </div>
          <h1 className="text-xl md:text-2xl font-bold text-slate-900 mt-1 tabular-nums">
            Ngân hàng câu hỏi ({questions.length} câu)
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Phân loại theo môn học, khối lớp, chủ đề bài học, dạng thức đề thi 2025 và 4 mức độ nhận thức.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => setShowStatsPanel((v) => !v)}
            className={`min-h-[42px] px-4 py-2 rounded-xl border text-xs font-semibold transition-colors inline-flex items-center gap-2 ${
              showStatsPanel
                ? 'bg-slate-900 border-slate-900 text-white'
                : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-700'
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            <span>Thống kê ngân hàng</span>
            {showStatsPanel ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>

          {/* NÚT BÓC TÁCH TỪ FILE WORD: HIỂN THỊ TRỰC QUAN MỨC ĐỘ ĐANG CHỌN */}
          <button
            type="button"
            disabled={isExtractingWord}
            onClick={() => wordInputRef.current?.click()}
            className="min-h-[42px] px-4 py-2 rounded-xl bg-blue-50 border border-blue-200 hover:bg-blue-100 text-blue-700 text-xs font-semibold shadow-xs transition-colors inline-flex items-center gap-2 disabled:opacity-60"
            title={
              levelFilter !== 'all'
                ? `Bóc tách câu hỏi và tự động áp dụng mức độ: ${COGNITIVE_LEVEL_LABELS[levelFilter as CognitiveLevel]}`
                : 'Bóc tách câu hỏi từ Word giữ trọn vẹn công thức Toán/Hóa và xem trước'
            }
          >
            {isExtractingWord ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                <span>Đang xử lý file Word...</span>
              </>
            ) : (
              <>
                <Upload className="w-4 h-4 text-blue-600" />
                <span>
                  Bóc tách từ file Word
                  {levelFilter !== 'all' && (
                    <span className="ml-1 px-1.5 py-0.5 rounded bg-blue-200/70 text-blue-800 text-[10px] font-bold">
                      {COGNITIVE_LEVEL_SHORT_LABELS[levelFilter as CognitiveLevel]}
                    </span>
                  )}
                </span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => setIsAddModalOpen(true)}
            className="min-h-[42px] px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold shadow-xs transition-colors inline-flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>Thêm câu hỏi mới</span>
          </button>
        </div>
      </div>

      {/* Bảng thống kê ngân hàng */}
      {showStatsPanel && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                Tổng hợp phân bố ngân hàng câu hỏi
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Đang hiển thị thống kê chi tiết cho {filtered.length} câu hỏi{' '}
                {hasActiveFilters ? 'theo bộ lọc hiện tại' : 'trên toàn hệ thống'}.
              </p>
            </div>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearAllFilters}
                className="text-xs font-semibold text-teal-700 hover:underline self-start sm:self-center"
              >
                Xem thống kê toàn bộ
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
              <p className="text-xs font-medium text-slate-500">Theo dạng câu hỏi</p>
              <div className="mt-2 space-y-1 text-xs tabular-nums">
                <div className="flex justify-between">
                  <span className="text-slate-700">Phần I (4 lựa chọn)</span>
                  <span className="font-bold text-slate-900">{stats.byType.part1_single_choice}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-700">Phần II (Đúng/Sai)</span>
                  <span className="font-bold text-slate-900">{stats.byType.part2_true_false}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-700">Phần III (Trả lời ngắn)</span>
                  <span className="font-bold text-slate-900">{stats.byType.part3_short_answer}</span>
                </div>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
              <p className="text-xs font-medium text-slate-500">Theo mức độ nhận thức</p>
              <div className="mt-2 space-y-1 text-xs tabular-nums">
                <div className="flex justify-between">
                  <span className="text-slate-700">Biết (Nhận biết)</span>
                  <span className="font-bold text-slate-900">{stats.byLevel.nhan_biet}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-700">Hiểu (Thông hiểu)</span>
                  <span className="font-bold text-slate-900">{stats.byLevel.thong_hieu}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-700">Vận dụng / VDC</span>
                  <span className="font-bold text-slate-900">
                    {stats.byLevel.van_dung} / {stats.byLevel.van_dung_cao}
                  </span>
                </div>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
              <p className="text-xs font-medium text-slate-500">Theo khối lớp</p>
              <div className="mt-2 space-y-1 text-xs tabular-nums">
                {(['10', '11', '12', 'chuyen_hsg'] as const).map((g) => (
                  <div key={g} className="flex justify-between">
                    <span className="text-slate-700">{GRADE_LABELS[g]}</span>
                    <span className="font-bold text-slate-900">{stats.byGrade[g] || 0}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
              <p className="text-xs font-medium text-slate-500">Môn học có câu hỏi</p>
              <div className="mt-2 space-y-1 text-xs tabular-nums max-h-24 overflow-y-auto pr-1">
                {stats.subjectCounts.length === 0 ? (
                  <span className="text-slate-400">Chưa có dữ liệu</span>
                ) : (
                  stats.subjectCounts.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setSubjectFilter(s.id)}
                      className="w-full flex justify-between text-left hover:text-teal-700 transition-colors"
                    >
                      <span className="truncate">{s.name}</span>
                      <span className="font-bold shrink-0 ml-2">{s.count}</span>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Thanh bộ lọc chính */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs space-y-3">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Tìm kiếm theo từ khóa, nội dung, công thức, mã câu hỏi, chương, bài học..."
            className="w-full min-h-[42px] pl-10 pr-4 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2.5 text-xs">
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">Môn học</label>
            <select
              value={subjectFilter}
              onChange={(e) => {
                setSubjectFilter(e.target.value);
                setChapterFilter('all');
                setLessonTopicFilter('all');
              }}
              className="w-full min-h-[38px] px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white font-medium text-slate-800"
            >
              <option value="all">Tất cả môn học</option>
              {subjects.map((sub) => (
                <option key={sub.id} value={sub.id}>
                  {sub.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">Khối lớp</label>
            <select
              value={gradeFilter}
              onChange={(e) => {
                setGradeFilter(e.target.value);
                setChapterFilter('all');
                setLessonTopicFilter('all');
              }}
              className="w-full min-h-[38px] px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white font-medium text-slate-800"
            >
              <option value="all">Tất cả khối lớp</option>
              <option value="10">Lớp 10</option>
              <option value="11">Lớp 11</option>
              <option value="12">Lớp 12</option>
              <option value="chuyen_hsg">Chuyên & HSG</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">
              Chương / Chủ đề
            </label>
            <select
              value={chapterFilter}
              disabled={groupedCatalog.chapters.length === 0}
              onChange={(e) => {
                const nextCh = e.target.value;
                setChapterFilter(nextCh);
                if (nextCh !== 'all' && lessonTopicFilter.startsWith('lessonId:')) {
                  const chosenId = lessonTopicFilter.slice(9);
                  const belongs = catalogLessons.some(
                    (l) => l.lessonId === chosenId && l.chapterId === nextCh
                  );
                  if (!belongs) setLessonTopicFilter('all');
                }
              }}
              className="w-full min-h-[38px] px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white font-medium text-slate-800 disabled:bg-slate-100 disabled:text-slate-400"
            >
              <option value="all">
                {groupedCatalog.chapters.length > 0
                  ? `Tất cả chương (${groupedCatalog.chapters.length})`
                  : 'Tất cả chương'}
              </option>
              {groupedCatalog.chapters.map((ch) => (
                <option key={ch.chapterId} value={ch.chapterId}>
                  {ch.chapterName}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="flex items-center justify-between text-[11px] font-semibold text-slate-500 mb-1">
              <span>Bài học</span>
              {isLoadingCatalog && <Loader2 className="w-3 h-3 animate-spin text-teal-600" />}
            </label>
            <select
              value={lessonTopicFilter}
              onChange={(e) => setLessonTopicFilter(e.target.value)}
              className="w-full min-h-[38px] px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white font-medium text-slate-800"
            >
              <option value="all">Tất cả bài học</option>
              {groupedCatalog.chapters.length > 0 ? (
                <>
                  {groupedCatalog.chapters
                    .filter((ch) => chapterFilter === 'all' || ch.chapterId === chapterFilter)
                    .map((ch) => (
                      <optgroup key={ch.chapterId} label={ch.chapterName}>
                        {ch.lessons.map((lesson) => {
                          const cnt = questionCountByLesson.byId.get(lesson.lessonId) || 0;
                          return (
                            <option key={lesson.id} value={`lessonId:${lesson.lessonId}`}>
                              {lesson.lessonName}
                              {cnt > 0 ? ` (${cnt})` : ''}
                            </option>
                          );
                        })}
                      </optgroup>
                    ))}
                  {legacyTopicsOutsideCatalog.length > 0 && chapterFilter === 'all' && (
                    <optgroup label="Phân loại khác">
                      {legacyTopicsOutsideCatalog.map(([label, count]) => (
                        <option key={label} value={label}>
                          {label} ({count})
                        </option>
                      ))}
                    </optgroup>
                  )}
                </>
              ) : (
                availableTopicOptions.map(([label, count]) => (
                  <option key={label} value={label}>
                    {label} ({count})
                  </option>
                ))
              )}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">
              Dạng câu hỏi
            </label>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="w-full min-h-[38px] px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white font-medium text-slate-800"
            >
              <option value="all">Tất cả 3 dạng</option>
              <option value="part1_single_choice">Phần I · 4 lựa chọn</option>
              <option value="part2_true_false">Phần II · Đúng - Sai 4 ý</option>
              <option value="part3_short_answer">Phần III · Trả lời ngắn</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">
              Mức độ nhận thức
            </label>
            <select
              value={levelFilter}
              onChange={(e) => setLevelFilter(e.target.value)}
              className="w-full min-h-[38px] px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white font-medium text-slate-800"
            >
              <option value="all">Tất cả mức độ</option>
              <option value="nhan_biet">Biết (Nhận biết)</option>
              <option value="thong_hieu">Hiểu (Thông hiểu)</option>
              <option value="van_dung">Vận dụng</option>
              <option value="van_dung_cao">Vận dụng cao</option>
            </select>
          </div>
        </div>

        {/* Thanh chọn nhiều & hành động */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100 text-xs">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={toggleSelectAllFiltered}
              className="text-slate-700 hover:text-slate-950 font-semibold inline-flex items-center gap-1.5"
            >
              {selectedIds.size > 0 && selectedIds.size === filtered.length && filtered.length > 0 ? (
                <CheckSquare className="w-4 h-4 text-teal-600" />
              ) : (
                <Square className="w-4 h-4 text-slate-400" />
              )}
              <span className="tabular-nums">Chọn tất cả ({filtered.length} câu)</span>
            </button>

            {selectedIds.size > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-teal-700 font-bold tabular-nums">
                  Đã chọn {selectedIds.size} câu
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const chosen = questions
                      .filter((q) => selectedIds.has(q.id))
                      .map((q) => structuredClone(q));
                    onCreateExamFromSelected(chosen);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-semibold inline-flex items-center gap-1.5 transition-colors"
                >
                  <FlaskConical className="w-3.5 h-3.5" />
                  <span>Tạo đề từ {selectedIds.size} câu</span>
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteTarget({ mode: 'bulk', ids: Array.from(selectedIds) })}
                  className="px-3 py-1.5 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 font-semibold inline-flex items-center gap-1.5 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Xóa đã chọn</span>
                </button>
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearAllFilters}
                className="text-teal-700 hover:underline font-semibold"
              >
                Xóa bộ lọc
              </button>
            )}
            <div className="flex items-center gap-1.5 text-slate-500">
              <span>Hiển thị:</span>
              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                className="px-2 py-1 rounded-lg border border-slate-200 bg-white text-slate-700 font-semibold"
              >
                <option value={15}>15 / trang</option>
                <option value={25}>25 / trang</option>
                <option value={50}>50 / trang</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Danh sách câu hỏi */}
      <div className="space-y-3">
        {paginatedQuestions.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center">
            <BookOpen className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <h3 className="text-base font-bold text-slate-800">
              {questions.length === 0
                ? 'Ngân hàng câu hỏi đang trống'
                : 'Không tìm thấy câu hỏi phù hợp'}
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Nhấn "Bóc tách từ file Word" để nhập hàng loạt hoặc "Thêm câu hỏi mới" bằng tay.
            </p>
          </div>
        ) : (
          paginatedQuestions.map((q) => {
            const isSelected = selectedIds.has(q.id);
            const sub = resolveQuestionSubject(q, subjects);
            const topicLabel = getQuestionTopicDisplay(q);

            return (
              <div
                key={q.id}
                className={`bg-white border rounded-2xl p-5 shadow-xs transition-colors ${
                  isSelected
                    ? 'border-teal-400 ring-2 ring-teal-100'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-start gap-2.5 min-w-0">
                    <button
                      type="button"
                      onClick={() => toggleSelect(q.id)}
                      className="mt-0.5 text-slate-400 hover:text-teal-600 focus:outline-none shrink-0"
                    >
                      {isSelected ? (
                        <CheckSquare className="w-4 h-4 text-teal-600" />
                      ) : (
                        <Square className="w-4 h-4 text-slate-300" />
                      )}
                    </button>

                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs">
                        <span className="font-mono font-bold text-slate-900">{q.code}</span>
                        <span className="text-slate-300">·</span>
                        <span className="font-semibold text-teal-700">{sub.name}</span>
                        <span className="text-slate-300">·</span>
                        <span className="text-slate-700 font-medium">{GRADE_LABELS[q.grade]}</span>
                        {q.chapterName && (
                          <>
                            <span className="text-slate-300">·</span>
                            <span className="text-slate-500">{q.chapterName}</span>
                          </>
                        )}
                        <span className="text-slate-300">·</span>
                        <span className="text-slate-800 font-medium">{topicLabel}</span>
                        <span className="text-slate-300">·</span>
                        <span className="font-semibold text-slate-800">
                          {QUESTION_TYPE_SHORT_LABELS[q.type]}
                        </span>
                        <span className="text-slate-300">·</span>
                        <span className="font-semibold text-slate-600">
                          {COGNITIVE_LEVEL_SHORT_LABELS[q.level]}
                        </span>
                      </div>
                      {q.source && (
                        <p className="text-[11px] text-slate-400">Nguồn: {q.source}</p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => setViewingQuestion(q)}
                      title="Xem chi tiết câu hỏi"
                      className="p-2 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAiExplain(q)}
                      disabled={aiLoadingId === q.id}
                      title="Tạo lời giải chi tiết bằng Gemini AI"
                      className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 transition-colors inline-flex items-center gap-1 disabled:opacity-60"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">
                        {aiLoadingId === q.id ? 'Đang giải...' : 'AI Giải'}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDuplicateQuestion(q)}
                      title="Nhân bản câu hỏi"
                      className="p-2 rounded-lg text-slate-500 hover:text-teal-700 hover:bg-teal-50 transition-colors"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingQuestion({ ...q })}
                      title="Chỉnh sửa câu hỏi"
                      className="p-2 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget({ mode: 'single', question: q })}
                      title="Xóa câu hỏi"
                      className="p-2 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="text-sm font-medium text-slate-900 leading-relaxed mb-3">
                  <ChemRenderer text={q.content} />
                </div>

                {q.type === 'part1_single_choice' && q.options && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2.5 border-t border-slate-100">
                    {q.options.map((opt) => {
                      const isCorrect = opt.id === q.correctOptionId;
                      return (
                        <div
                          key={opt.id}
                          className={`p-2.5 rounded-xl border text-xs flex items-start gap-2 ${
                            isCorrect
                              ? 'border-emerald-400 bg-emerald-50/70 font-semibold text-emerald-950'
                              : 'border-slate-200 bg-slate-50 text-slate-700'
                          }`}
                        >
                          <span
                            className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 font-bold ${
                              isCorrect
                                ? 'bg-emerald-600 text-white'
                                : 'bg-slate-200 text-slate-700'
                            }`}
                          >
                            {opt.id}
                          </span>
                          <div className="flex-1 min-w-0 break-words">
                            <ChemRenderer text={opt.text} inline />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {q.type === 'part2_true_false' && q.statements && (
                  <div className="space-y-1.5 pt-2.5 border-t border-slate-100">
                    {q.statements.map((stmt) => (
                      <div
                        key={stmt.id}
                        className="p-2 rounded-lg bg-slate-50 border border-slate-200 text-xs flex items-center justify-between gap-3"
                      >
                        <div className="flex items-start gap-2 min-w-0">
                          <span className="font-bold text-indigo-700 shrink-0">{stmt.id})</span>
                          <span className="min-w-0 break-words">
                            <ChemRenderer text={stmt.statement} inline />
                          </span>
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded text-[11px] font-bold shrink-0 ${
                            stmt.correctAnswer
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          {stmt.correctAnswer ? 'Đúng' : 'Sai'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {q.type === 'part3_short_answer' && q.shortAnswerConfig && (
                  <div className="pt-2.5 border-t border-slate-100 text-xs flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-slate-700">Đáp án:</span>
                    <span className="px-2.5 py-1 bg-emerald-50 border border-emerald-200 text-emerald-900 font-mono font-bold rounded-lg">
                      {q.shortAnswerConfig.acceptableAnswers.join(' / ')}
                    </span>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Phân trang */}
      {filtered.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl px-4 py-3 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600">
          <span className="tabular-nums">
            Hiển thị {(safePage - 1) * pageSize + 1}–
            {Math.min(safePage * pageSize, filtered.length)} trên tổng số {filtered.length} câu hỏi
          </span>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={safePage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              className="min-h-[36px] px-3 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 disabled:opacity-40 font-semibold inline-flex items-center gap-1"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Trước</span>
            </button>
            <span className="px-3 font-semibold text-slate-800 tabular-nums">
              Trang {safePage} / {totalPages}
            </span>
            <button
              type="button"
              disabled={safePage >= totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              className="min-h-[36px] px-3 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 disabled:opacity-40 font-semibold inline-flex items-center gap-1"
            >
              <span>Sau</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* MODAL BÓC TÁCH WORD CHUẨN: KẾ THỪA MỨC ĐỘ VÀ BÀI HỌC TỪ BỘ LỌC */}
      {activeWordResult && (
        <WordImportReviewModal
          isOpen={!!activeWordResult}
          fileName={activeWordFileName}
          fileSize={activeWordFileSize}
          parsedResult={activeWordResult}
          parsedQuestionsCount={activeWordResult.questions.length}
          inheritedMetadata={{
            subjectId: subjectFilter !== 'all' ? subjectFilter : subjects[0]?.id || 'chemistry',
            grade: (gradeFilter !== 'all' ? gradeFilter : '11') as any,
            chapterId: chapterFilter !== 'all' ? chapterFilter : undefined,
            lessonId: lessonTopicFilter.startsWith('lessonId:') ? lessonTopicFilter.slice(9) : undefined,
            level: levelFilter !== 'all' ? (levelFilter as CognitiveLevel) : undefined,
          }}
          existingQuestions={questions}
          subjects={subjects}
          currentUserId={currentUserId}
          onConfirmSave={async (questionsToSave) => {
            const activeSubjectId = subjectFilter !== 'all' ? subjectFilter : (subjects[0]?.id || 'chemistry');
            const activeSubject = subjects.find((s) => s.id === activeSubjectId) || subjects[0];
            const activeGrade = (gradeFilter !== 'all' ? gradeFilter : '11') as CurriculumGrade;
            const targetLevel = levelFilter !== 'all' ? (levelFilter as CognitiveLevel) : undefined;

            const selectedChapter = groupedCatalog.chapters.find((c) => c.chapterId === chapterFilter);
            let selectedLessonId: string | undefined = undefined;
            let selectedLessonName: string | undefined = undefined;

            if (lessonTopicFilter !== 'all') {
              if (lessonTopicFilter.startsWith('lessonId:')) {
                selectedLessonId = lessonTopicFilter.slice(9);
                const found = catalogLessons.find((l) => l.lessonId === selectedLessonId);
                selectedLessonName = found?.lessonName;
              } else {
                selectedLessonName = lessonTopicFilter;
              }
            }

            const finalizedQuestions = questionsToSave.map((q) => ({
              ...q,
              subjectId: activeSubjectId,
              subjectName: activeSubject.name,
              grade: activeGrade,
              chapterId: chapterFilter !== 'all' ? chapterFilter : q.chapterId,
              chapterName: selectedChapter?.chapterName || q.chapterName,
              lessonId: selectedLessonId || q.lessonId,
              lessonName: selectedLessonName || q.lessonName || 'Bóc tách từ Word',
              lessonTopic: selectedLessonName || q.lessonTopic || 'Bóc tách từ Word',
              level: targetLevel || q.level || 'nhan_biet',
            }));

            finalizedQuestions.forEach((q) => onAddQuestion(q));
            showToast(`Đã thêm thành công ${finalizedQuestions.length} câu hỏi vào Ngân hàng!`);
            setActiveWordResult(null);
            return { successCount: finalizedQuestions.length, skippedCount: 0 };
          }}
          onClose={() => setActiveWordResult(null)}
        />
      )}

      {/* Modal Thêm câu hỏi thủ công */}
      <QuestionFormModal
        isOpen={isAddModalOpen}
        mode="add"
        subjects={subjects}
        existingQuestions={questions}
        currentUserId={currentUserId}
        onAddSubject={onAddSubject}
        onSave={(newQ) => {
          onAddQuestion(newQ);
          showToast(`Đã thêm câu hỏi ${newQ.code} vào Ngân hàng.`);
        }}
        onClose={() => setIsAddModalOpen(false)}
      />

      {/* Modal Chỉnh sửa câu hỏi */}
      <QuestionFormModal
        isOpen={!!editingQuestion}
        mode="edit"
        initialQuestion={editingQuestion}
        subjects={subjects}
        existingQuestions={questions}
        currentUserId={currentUserId}
        onAddSubject={onAddSubject}
        onSave={(updatedQ) => {
          onUpdateQuestion(updatedQ);
          showToast(`Đã cập nhật câu hỏi ${updatedQ.code}.`);
        }}
        onClose={() => setEditingQuestion(null)}
      />

      {/* Modal Xem chi tiết câu hỏi */}
      {viewingQuestion && (
        <div
          className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
              <div>
                <h3 className="font-bold text-sm">Chi tiết câu hỏi {viewingQuestion.code}</h3>
                <p className="text-xs text-slate-300 mt-0.5">
                  {resolveQuestionSubject(viewingQuestion, subjects).name} ·{' '}
                  {GRADE_LABELS[viewingQuestion.grade]} ·{' '}
                  {viewingQuestion.chapterName ? `${viewingQuestion.chapterName} · ` : ''}
                  {getQuestionTopicDisplay(viewingQuestion)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setViewingQuestion(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto space-y-4 text-sm">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs">
                <div>
                  <span className="text-slate-500 block">Môn học</span>
                  <span className="font-bold text-slate-900">
                    {resolveQuestionSubject(viewingQuestion, subjects).name}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Khối lớp</span>
                  <span className="font-bold text-slate-900">
                    {GRADE_LABELS[viewingQuestion.grade]}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Chương / Chủ đề</span>
                  <span className="font-bold text-slate-900">
                    {viewingQuestion.chapterName || '—'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Bài học</span>
                  <span className="font-bold text-slate-900">
                    {getQuestionTopicDisplay(viewingQuestion)}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Dạng câu hỏi</span>
                  <span className="font-bold text-slate-900">
                    {QUESTION_TYPE_SHORT_LABELS[viewingQuestion.type]}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Mức độ</span>
                  <span className="font-bold text-slate-900">
                    {COGNITIVE_LEVEL_LABELS[viewingQuestion.level]}
                  </span>
                </div>
              </div>

              <div className="text-slate-900 leading-relaxed">
                <ChemRenderer text={viewingQuestion.content} />
              </div>

              {viewingQuestion.imageUrl && (
                <img
                  src={viewingQuestion.imageUrl}
                  alt={`Minh họa ${viewingQuestion.code}`}
                  className="max-h-64 rounded-xl border border-slate-200 object-contain"
                />
              )}

              {viewingQuestion.type === 'part1_single_choice' && viewingQuestion.options && (
                <div className="space-y-2">
                  {viewingQuestion.options.map((opt) => {
                    const isCorrect = opt.id === viewingQuestion.correctOptionId;
                    return (
                      <div
                        key={opt.id}
                        className={`p-3 rounded-xl border text-xs flex items-start gap-2.5 ${
                          isCorrect
                            ? 'bg-emerald-50 border-emerald-400 font-semibold text-emerald-950'
                            : 'bg-slate-50 border-slate-200 text-slate-700'
                        }`}
                      >
                        <span className="font-bold">{opt.id}.</span>
                        <div className="flex-1">
                          <ChemRenderer text={opt.text} inline />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {viewingQuestion.type === 'part2_true_false' && viewingQuestion.statements && (
                <div className="space-y-2">
                  {viewingQuestion.statements.map((s) => (
                    <div
                      key={s.id}
                      className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs flex items-center justify-between gap-3"
                    >
                      <span>
                        <strong>{s.id})</strong> <ChemRenderer text={s.statement} inline />
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded font-bold shrink-0 ${
                          s.correctAnswer
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        {s.correctAnswer ? 'Đúng' : 'Sai'}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {viewingQuestion.type === 'part3_short_answer' &&
                viewingQuestion.shortAnswerConfig && (
                  <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs">
                    <span className="font-bold text-emerald-900">Đáp án chuẩn: </span>
                    <span className="font-mono font-bold text-emerald-950">
                      {viewingQuestion.shortAnswerConfig.acceptableAnswers.join(' / ')}
                    </span>
                  </div>
                )}

              {viewingQuestion.explanation && (
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800">
                  <p className="font-bold text-slate-900 mb-1">Lời giải chi tiết:</p>
                  <ChemRenderer text={viewingQuestion.explanation} />
                </div>
              )}
            </div>
            <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  const target = viewingQuestion;
                  setViewingQuestion(null);
                  setEditingQuestion({ ...target });
                }}
                className="min-h-[38px] px-4 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold"
              >
                Chỉnh sửa câu hỏi này
              </button>
              <button
                type="button"
                onClick={() => setViewingQuestion(null)}
                className="min-h-[38px] px-4 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Xác nhận xóa câu hỏi */}
      <ConfirmDialog
        isOpen={!!deleteTarget}
        title={
          deleteTarget?.mode === 'bulk'
            ? `Xóa ${deleteTarget.ids.length} câu hỏi đã chọn?`
            : `Xóa câu hỏi ${deleteTarget?.question.code || ''}?`
        }
        message={
          deleteTarget?.mode === 'bulk'
            ? `Bạn có chắc muốn xóa ${deleteTarget.ids.length} câu hỏi đang chọn khỏi Ngân hàng?`
            : `Bạn có chắc muốn xóa câu hỏi "${deleteTarget?.question.code}" khỏi Ngân hàng?`
        }
        confirmLabel="Xóa câu hỏi"
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};