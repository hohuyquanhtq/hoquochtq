import React, { useEffect, useMemo, useState } from 'react';
import {
  CognitiveLevel,
  CurriculumGrade,
  CurriculumLesson,
  Question,
  QuestionType,
  SubjectItem,
} from '../../types';
import {
  COGNITIVE_LEVEL_SHORT_LABELS,
  DEFAULT_GDPT_2018_SUBJECTS,
  GRADE_LABELS,
  QUESTION_TYPE_SHORT_LABELS,
  getQuestionTopicDisplay,
  resolveQuestionSubject,
} from '../../constants/subjects';
import { fetchCurriculumLessonsBySubjectGrade } from '../../services/curriculumService';
import { ChemRenderer } from '../../utils/chemRenderer';
import {
  AlertCircle,
  BookOpen,
  Check,
  CheckCircle2,
  CheckSquare,
  Dices,
  Grid,
  Layers,
  ListChecks,
  Loader2,
  Plus,
  Search,
  Shuffle,
  SlidersHorizontal,
  Sparkles,
  Square,
  Trash2,
  Wand2,
  X,
} from 'lucide-react';

export type ExamPickerTab = 'matrix' | 'flexible';

export interface QuestionBankPickerModalProps {
  isOpen: boolean;
  bankQuestions: Question[];
  existingExamQuestionIds: string[];
  subjects?: SubjectItem[];
  defaultSubjectId?: string;
  defaultGrade?: string;
  initialTab?: ExamPickerTab;
  onAddQuestions: (picked: Question[]) => void;
  onClose: () => void;
}

interface TopicMatrixRow {
  id: string;
  topic: string;
  type: QuestionType;
  counts: Record<CognitiveLevel, number>;
}

interface FlexibleLessonOption {
  key: string;
  label: string;
  chapterName?: string;
  lessonId?: string;
  availableCount: number;
  totalCount: number;
}

type MatrixGrid = Record<QuestionType, Record<CognitiveLevel, number>>;
type FlexiblePartFilter = 'all' | 'part1_single_choice' | 'part2_true_false' | 'part3_short_answer';
type FlexiblePickMethod = 'random' | 'manual';

const LEVELS: CognitiveLevel[] = ['nhan_biet', 'thong_hieu', 'van_dung', 'van_dung_cao'];
const LEVEL_TAG_LABELS: Record<CognitiveLevel, string> = {
  nhan_biet: 'Nhận biết',
  thong_hieu: 'Thông hiểu',
  van_dung: 'Vận dụng',
  van_dung_cao: 'Vận dụng cao',
};
const TYPES: QuestionType[] = ['part1_single_choice', 'part2_true_false', 'part3_short_answer'];

export function shuffleQuestionsList<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = copy[i];
    copy[i] = copy[j];
    copy[j] = tmp;
  }
  return copy;
}

function createEmptyMatrix(): MatrixGrid {
  return {
    part1_single_choice: { nhan_biet: 0, thong_hieu: 0, van_dung: 0, van_dung_cao: 0 },
    part1_multiple_choice: { nhan_biet: 0, thong_hieu: 0, van_dung: 0, van_dung_cao: 0 },
    part2_true_false: { nhan_biet: 0, thong_hieu: 0, van_dung: 0, van_dung_cao: 0 },
    part3_short_answer: { nhan_biet: 0, thong_hieu: 0, van_dung: 0, van_dung_cao: 0 },
  };
}

function matchesPartFilter(qType: QuestionType, partFilter: FlexiblePartFilter): boolean {
  if (partFilter === 'all') return true;
  if (partFilter === 'part1_single_choice') {
    return qType === 'part1_single_choice' || qType === 'part1_multiple_choice';
  }
  return qType === partFilter;
}

export function cloneQuestionsForExam(picked: Question[]): Question[] {
  return picked.map((q) => {
    const copy = structuredClone(q);
    return {
      ...copy,
      id: `${q.id}__ex_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    };
  });
}

export function pickQuestionsByMatrix(params: {
  pool: Question[];
  matrix: MatrixGrid;
  excludeOriginalIds?: Set<string>;
}): { picked: Question[]; shortages: string[] } {
  const { pool, matrix, excludeOriginalIds = new Set() } = params;
  const usedIds = new Set<string>(excludeOriginalIds);
  const picked: Question[] = [];
  const shortages: string[] = [];

  for (const qType of TYPES) {
    for (const lvl of LEVELS) {
      const targetCount = Math.max(0, Math.floor(matrix[qType]?.[lvl] || 0));
      if (targetCount === 0) continue;

      const candidates = pool.filter(
        (q) =>
          (qType === 'part1_single_choice'
            ? q.type === 'part1_single_choice' || q.type === 'part1_multiple_choice'
            : q.type === qType) &&
          q.level === lvl &&
          !usedIds.has(q.id)
      );
      const chosen = shuffleQuestionsList(candidates).slice(0, targetCount);

      chosen.forEach((c) => {
        usedIds.add(c.id);
        picked.push(c);
      });

      if (chosen.length < targetCount) {
        shortages.push(
          `${QUESTION_TYPE_SHORT_LABELS[qType]} - ${COGNITIVE_LEVEL_SHORT_LABELS[lvl]}: cần ${targetCount}, có ${chosen.length}`
        );
      }
    }
  }

  return { picked, shortages };
}

export const QuestionBankPickerModal: React.FC<QuestionBankPickerModalProps> = ({
  isOpen,
  bankQuestions,
  existingExamQuestionIds,
  subjects = DEFAULT_GDPT_2018_SUBJECTS,
  defaultSubjectId = 'all',
  defaultGrade = 'all',
  initialTab = 'matrix',
  onAddQuestions,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<ExamPickerTab>(initialTab);

  // Shared subject / grade scope
  const [subjectFilter, setSubjectFilter] = useState<string>(defaultSubjectId || 'all');
  const [gradeFilter, setGradeFilter] = useState<string>(defaultGrade || 'all');

  // --- MODE A: Matrix GDPT 2018 ---
  const [matrixMode, setMatrixMode] = useState<'overall' | 'by_topic'>('overall');
  const [matrixTopicFilter, setMatrixTopicFilter] = useState<string>('all');
  const [matrix, setMatrix] = useState<MatrixGrid>(() => createEmptyMatrix());
  const [topicRows, setTopicRows] = useState<TopicMatrixRow[]>([]);
  const [matrixWarning, setMatrixWarning] = useState<string | null>(null);

  // --- MODE B: Flexible by Lessons & Cognitive Levels ---
  const [catalogLessons, setCatalogLessons] = useState<CurriculumLesson[]>([]);
  const [isLoadingLessons, setIsLoadingLessons] = useState<boolean>(false);
  const [lessonSearchTerm, setLessonSearchTerm] = useState('');
  const [selectedLessonKeys, setSelectedLessonKeys] = useState<Set<string>>(new Set());
  const [hasInitializedLessonsForScope, setHasInitializedLessonsForScope] = useState<string>('');
  const [selectedLevels, setSelectedLevels] = useState<Set<CognitiveLevel>>(
    () => new Set(LEVELS)
  );
  const [partFilter, setPartFilter] = useState<FlexiblePartFilter>('all');
  const [pickMethod, setPickMethod] = useState<FlexiblePickMethod>('random');
  const [randomCountInput, setRandomCountInput] = useState<string>('10');
  const [manualSearchTerm, setManualSearchTerm] = useState('');
  const [manualSelectedIds, setManualSelectedIds] = useState<Set<string>>(new Set());
  const [flexibleFeedback, setFlexibleFeedback] = useState<string | null>(null);

  // Sync defaults when opening modal
  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
      setSubjectFilter(defaultSubjectId || 'all');
      setGradeFilter(defaultGrade || 'all');
      setMatrixTopicFilter('all');
      setMatrixWarning(null);
      setFlexibleFeedback(null);
      setManualSelectedIds(new Set());
      setHasInitializedLessonsForScope('');
    }
  }, [isOpen, initialTab, defaultSubjectId, defaultGrade]);

  // Fetch official GDPT 2018 curriculum lessons for selected subject + grade (10/11/12)
  useEffect(() => {
    if (!isOpen) return;
    const isCurriculumGrade =
      gradeFilter === '10' || gradeFilter === '11' || gradeFilter === '12';
    if (!isCurriculumGrade || subjectFilter === 'all') {
      setCatalogLessons([]);
      setIsLoadingLessons(false);
      return;
    }

    let cancelled = false;
    setIsLoadingLessons(true);
    fetchCurriculumLessonsBySubjectGrade(subjectFilter, gradeFilter as CurriculumGrade)
      .then((lessons) => {
        if (!cancelled) setCatalogLessons(lessons);
      })
      .catch(() => {
        if (!cancelled) setCatalogLessons([]);
      })
      .finally(() => {
        if (!cancelled) setIsLoadingLessons(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, subjectFilter, gradeFilter]);

  // Track original bank IDs already in exam (strips `__ex_...` suffix)
  const alreadyInExamBaseIds = useMemo(() => {
    const set = new Set<string>();
    existingExamQuestionIds.forEach((id) => {
      set.add(id);
      const base = id.split('__ex_')[0];
      if (base) set.add(base);
    });
    return set;
  }, [existingExamQuestionIds]);

  // Base questions scoped by Subject + Grade
  const subjectGradePool = useMemo(() => {
    return bankQuestions.filter((q) => {
      const sub = resolveQuestionSubject(q, subjects);
      if (subjectFilter !== 'all' && sub.id !== subjectFilter) return false;
      if (gradeFilter !== 'all' && q.grade !== gradeFilter) return false;
      return true;
    });
  }, [bankQuestions, subjects, subjectFilter, gradeFilter]);

  // Topics available for Mode A (Matrix)
  const availableTopics = useMemo(() => {
    const set = new Set<string>();
    subjectGradePool.forEach((q) => {
      set.add(getQuestionTopicDisplay(q));
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'vi'));
  }, [subjectGradePool]);

  const matrixScopedPool = useMemo(() => {
    if (matrixTopicFilter === 'all') return subjectGradePool;
    return subjectGradePool.filter((q) => getQuestionTopicDisplay(q) === matrixTopicFilter);
  }, [subjectGradePool, matrixTopicFilter]);

  const availableMatrixCounts = useMemo(() => {
    const counts = createEmptyMatrix();
    matrixScopedPool.forEach((q) => {
      if (alreadyInExamBaseIds.has(q.id)) return;
      const bucketType: QuestionType =
        q.type === 'part1_multiple_choice' ? 'part1_single_choice' : q.type;
      if (counts[bucketType] && typeof counts[bucketType][q.level] === 'number') {
        counts[bucketType][q.level] += 1;
      }
    });
    return counts;
  }, [matrixScopedPool, alreadyInExamBaseIds]);

  const totalMatrixRequested = useMemo(() => {
    if (matrixMode === 'by_topic') {
      return topicRows.reduce(
        (sum, row) => sum + LEVELS.reduce((rowSum, l) => rowSum + (row.counts[l] || 0), 0),
        0
      );
    }
    let total = 0;
    TYPES.forEach((t) => LEVELS.forEach((l) => (total += matrix[t][l] || 0)));
    return total;
  }, [matrix, matrixMode, topicRows]);

  const countAvailableForTopicCell = (
    topic: string,
    qType: QuestionType,
    lvl: CognitiveLevel
  ): number => {
    return subjectGradePool.filter((q) => {
      if (alreadyInExamBaseIds.has(q.id)) return false;
      if (topic !== 'all' && getQuestionTopicDisplay(q) !== topic) return false;
      const matchesType =
        qType === 'part1_single_choice'
          ? q.type === 'part1_single_choice' || q.type === 'part1_multiple_choice'
          : q.type === qType;
      return matchesType && q.level === lvl;
    }).length;
  };

  // --- MODE B: Resolve each question's canonical Lesson Key & build Lesson Multi-select list ---
  const { flexibleLessonOptions, questionToLessonKeyMap } = useMemo(() => {
    const optionMap = new Map<string, FlexibleLessonOption>();
    const catalogById = new Map<string, string>();
    const catalogByName = new Map<string, string>();

    // 1. Seed from official curriculum lessons for the selected grade
    catalogLessons.forEach((lesson) => {
      const lid = (lesson.lessonId || lesson.id || '').trim();
      const label = (lesson.lessonName || '').trim();
      if (!label) return;
      const key = lid ? `lid:${lid}` : `name:${label.toLowerCase()}`;
      if (!optionMap.has(key)) {
        optionMap.set(key, {
          key,
          label,
          chapterName: lesson.chapterName?.trim() || undefined,
          lessonId: lid || undefined,
          availableCount: 0,
          totalCount: 0,
        });
      }
      if (lid) catalogById.set(lid, key);
      catalogByName.set(label.toLowerCase(), key);
    });

    // 2. Map every question in subjectGradePool to its lesson option (creating fallback options for custom/legacy topics)
    const qMap = new Map<string, string>();
    subjectGradePool.forEach((q) => {
      const qLid = (q.lessonId || '').trim();
      const qLabel = getQuestionTopicDisplay(q).trim();
      let resolvedKey =
        (qLid && catalogById.get(qLid)) ||
        catalogByName.get(qLabel.toLowerCase()) ||
        (qLid ? `lid:${qLid}` : `name:${qLabel.toLowerCase()}`);

      if (!optionMap.has(resolvedKey)) {
        optionMap.set(resolvedKey, {
          key: resolvedKey,
          label: qLabel || 'Chủ đề chung',
          chapterName: q.chapterName?.trim() || undefined,
          lessonId: qLid || undefined,
          availableCount: 0,
          totalCount: 0,
        });
      }

      const entry = optionMap.get(resolvedKey)!;
      entry.totalCount += 1;
      if (!alreadyInExamBaseIds.has(q.id)) {
        entry.availableCount += 1;
      }
      qMap.set(q.id, resolvedKey);
    });

    // Keep official catalog lessons first (in syllabus order), then bank-derived sorted alphabetically
    const ordered = Array.from(optionMap.values());
    return {
      flexibleLessonOptions: ordered,
      questionToLessonKeyMap: qMap,
    };
  }, [catalogLessons, subjectGradePool, alreadyInExamBaseIds]);

  // Auto-select all lessons when scope changes so teacher sees live matched questions immediately
  const scopeKey = `${subjectFilter}::${gradeFilter}::${catalogLessons.length}`;
  useEffect(() => {
    if (!isOpen) return;
    if (isLoadingLessons) return;
    if (hasInitializedLessonsForScope === scopeKey) return;
    const allKeys = new Set(flexibleLessonOptions.map((opt) => opt.key));
    setSelectedLessonKeys(allKeys);
    setManualSelectedIds(new Set());
    setHasInitializedLessonsForScope(scopeKey);
  }, [isOpen, isLoadingLessons, scopeKey, hasInitializedLessonsForScope, flexibleLessonOptions]);

  const visibleLessonOptions = useMemo(() => {
    const term = lessonSearchTerm.trim().toLowerCase();
    if (!term) return flexibleLessonOptions;
    return flexibleLessonOptions.filter(
      (opt) =>
        opt.label.toLowerCase().includes(term) ||
        (opt.chapterName || '').toLowerCase().includes(term)
    );
  }, [flexibleLessonOptions, lessonSearchTerm]);

  // Questions matching selected Lessons + Levels + Part (excluding questions already in exam)
  const flexibleMatchedAll = useMemo(() => {
    if (selectedLessonKeys.size === 0 || selectedLevels.size === 0) return [];
    return subjectGradePool.filter((q) => {
      const lessonKey = questionToLessonKeyMap.get(q.id);
      if (!lessonKey || !selectedLessonKeys.has(lessonKey)) return false;
      if (!selectedLevels.has(q.level)) return false;
      if (!matchesPartFilter(q.type, partFilter)) return false;
      return true;
    });
  }, [subjectGradePool, questionToLessonKeyMap, selectedLessonKeys, selectedLevels, partFilter]);

  const flexibleAvailablePool = useMemo(
    () => flexibleMatchedAll.filter((q) => !alreadyInExamBaseIds.has(q.id)),
    [flexibleMatchedAll, alreadyInExamBaseIds]
  );

  // Per-level counts (respecting current lesson & part filter, excluding already-in-exam)
  const flexibleLevelCounts = useMemo(() => {
    const map: Record<CognitiveLevel, number> = {
      nhan_biet: 0,
      thong_hieu: 0,
      van_dung: 0,
      van_dung_cao: 0,
    };
    if (selectedLessonKeys.size === 0) return map;
    subjectGradePool.forEach((q) => {
      if (alreadyInExamBaseIds.has(q.id)) return;
      const lessonKey = questionToLessonKeyMap.get(q.id);
      if (!lessonKey || !selectedLessonKeys.has(lessonKey)) return;
      if (!matchesPartFilter(q.type, partFilter)) return;
      if (typeof map[q.level] === 'number') {
        map[q.level] += 1;
      }
    });
    return map;
  }, [subjectGradePool, alreadyInExamBaseIds, questionToLessonKeyMap, selectedLessonKeys, partFilter]);

  // Per-part counts (respecting current lesson & level filter, excluding already-in-exam)
  const flexiblePartCounts = useMemo(() => {
    const counts = {
      all: 0,
      part1_single_choice: 0,
      part2_true_false: 0,
      part3_short_answer: 0,
    };
    if (selectedLessonKeys.size === 0 || selectedLevels.size === 0) return counts;
    subjectGradePool.forEach((q) => {
      if (alreadyInExamBaseIds.has(q.id)) return;
      const lessonKey = questionToLessonKeyMap.get(q.id);
      if (!lessonKey || !selectedLessonKeys.has(lessonKey)) return;
      if (!selectedLevels.has(q.level)) return;
      counts.all += 1;
      if (q.type === 'part1_single_choice' || q.type === 'part1_multiple_choice') {
        counts.part1_single_choice += 1;
      } else if (q.type === 'part2_true_false') {
        counts.part2_true_false += 1;
      } else if (q.type === 'part3_short_answer') {
        counts.part3_short_answer += 1;
      }
    });
    return counts;
  }, [subjectGradePool, alreadyInExamBaseIds, questionToLessonKeyMap, selectedLessonKeys, selectedLevels]);

  // Manual list filtered by search inside Mode B
  const manualDisplayedQuestions = useMemo(() => {
    const term = manualSearchTerm.trim().toLowerCase();
    if (!term) return flexibleMatchedAll;
    return flexibleMatchedAll.filter((q) => {
      const hay = [
        q.code || '',
        q.content || '',
        q.chapterName || '',
        getQuestionTopicDisplay(q),
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(term);
    });
  }, [flexibleMatchedAll, manualSearchTerm]);

  const manualSelectedInMatched = useMemo(() => {
    const matchedIds = new Set(flexibleMatchedAll.map((q) => q.id));
    return Array.from(manualSelectedIds).filter((id) => matchedIds.has(id));
  }, [flexibleMatchedAll, manualSelectedIds]);

  const parsedRandomCount = useMemo(() => {
    const n = Math.floor(Number(randomCountInput) || 0);
    return Math.max(0, n);
  }, [randomCountInput]);

  if (!isOpen) return null;

  // --- Handlers: Mode A (Matrix) ---
  const handleApplyStandard2018Preset = () => {
    setMatrixMode('overall');
    setMatrixWarning(null);
    const preset: MatrixGrid = {
      part1_single_choice: {
        nhan_biet: Math.min(8, availableMatrixCounts.part1_single_choice.nhan_biet),
        thong_hieu: Math.min(6, availableMatrixCounts.part1_single_choice.thong_hieu),
        van_dung: Math.min(4, availableMatrixCounts.part1_single_choice.van_dung),
        van_dung_cao: 0,
      },
      part1_multiple_choice: { nhan_biet: 0, thong_hieu: 0, van_dung: 0, van_dung_cao: 0 },
      part2_true_false: {
        nhan_biet: Math.min(1, availableMatrixCounts.part2_true_false.nhan_biet),
        thong_hieu: Math.min(2, availableMatrixCounts.part2_true_false.thong_hieu),
        van_dung: Math.min(1, availableMatrixCounts.part2_true_false.van_dung),
        van_dung_cao: 0,
      },
      part3_short_answer: {
        nhan_biet: 0,
        thong_hieu: Math.min(2, availableMatrixCounts.part3_short_answer.thong_hieu),
        van_dung: Math.min(3, availableMatrixCounts.part3_short_answer.van_dung),
        van_dung_cao: Math.min(1, availableMatrixCounts.part3_short_answer.van_dung_cao),
      },
    };
    const totalPreset = TYPES.reduce(
      (s, t) => s + LEVELS.reduce((rs, l) => rs + preset[t][l], 0),
      0
    );
    if (totalPreset === 0) {
      setMatrixWarning(
        'Ngân hàng theo bộ lọc hiện tại chưa đủ câu hỏi cho mẫu GDPT 2018. Hãy mở rộng bộ lọc Khối lớp / Chủ đề hoặc nhập trực tiếp.'
      );
      return;
    }
    setMatrix(preset);
  };

  const handleAddTopicRow = () => {
    const defaultTopic = availableTopics[0] || 'all';
    setTopicRows((prev) => [
      ...prev,
      {
        id: `trow_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
        topic: defaultTopic,
        type: 'part1_single_choice',
        counts: { nhan_biet: 1, thong_hieu: 1, van_dung: 0, van_dung_cao: 0 },
      },
    ]);
  };

  const handleConfirmMatrix = () => {
    setMatrixWarning(null);
    if (totalMatrixRequested <= 0) {
      setMatrixWarning('Vui lòng nhập số lượng ít nhất 1 câu hỏi vào bảng ma trận.');
      return;
    }

    if (matrixMode === 'by_topic') {
      const usedIds = new Set<string>(alreadyInExamBaseIds);
      const picked: Question[] = [];
      const shortages: string[] = [];

      for (const row of topicRows) {
        for (const lvl of LEVELS) {
          const target = Math.max(0, Math.floor(row.counts[lvl] || 0));
          if (target === 0) continue;
          const candidates = subjectGradePool.filter((q) => {
            if (usedIds.has(q.id)) return false;
            if (row.topic !== 'all' && getQuestionTopicDisplay(q) !== row.topic) return false;
            const matchesType =
              row.type === 'part1_single_choice'
                ? q.type === 'part1_single_choice' || q.type === 'part1_multiple_choice'
                : q.type === row.type;
            return matchesType && q.level === lvl;
          });
          const chosen = shuffleQuestionsList(candidates).slice(0, target);
          chosen.forEach((c) => {
            usedIds.add(c.id);
            picked.push(c);
          });
          if (chosen.length < target) {
            shortages.push(
              `${row.topic === 'all' ? 'Tất cả chủ đề' : row.topic} · ${QUESTION_TYPE_SHORT_LABELS[row.type]} · ${COGNITIVE_LEVEL_SHORT_LABELS[lvl]}: cần ${target}, có ${chosen.length}`
            );
          }
        }
      }

      if (picked.length === 0) {
        setMatrixWarning('Không có câu hỏi khả dụng phù hợp với các dòng ma trận chuyên đề hiện tại.');
        return;
      }

      onAddQuestions(cloneQuestionsForExam(picked));
      if (shortages.length > 0) {
        setMatrixWarning(
          `Đã thêm ${picked.length} câu vào đề. Một số dòng thiếu câu trong ngân hàng: ${shortages.join('; ')}`
        );
        return;
      }
      setTopicRows([]);
      onClose();
      return;
    }

    const { picked, shortages } = pickQuestionsByMatrix({
      pool: matrixScopedPool,
      matrix,
      excludeOriginalIds: alreadyInExamBaseIds,
    });
    if (picked.length === 0) {
      setMatrixWarning(
        'Không có câu hỏi khả dụng phù hợp với điều kiện ma trận và bộ lọc hiện tại.'
      );
      return;
    }
    onAddQuestions(cloneQuestionsForExam(picked));
    if (shortages.length > 0) {
      setMatrixWarning(
        `Đã thêm ${picked.length} câu vào đề. Một số ô thiếu câu hỏi trong ngân hàng: ${shortages.join('; ')}`
      );
      setMatrix(createEmptyMatrix());
      return;
    }
    setMatrix(createEmptyMatrix());
    onClose();
  };

  // --- Handlers: Mode B (Flexible by Lessons & Levels) ---
  const toggleLessonKey = (key: string) => {
    setFlexibleFeedback(null);
    setSelectedLessonKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleSelectAllLessons = () => {
    setFlexibleFeedback(null);
    setSelectedLessonKeys(new Set(flexibleLessonOptions.map((opt) => opt.key)));
  };

  const handleClearAllLessons = () => {
    setFlexibleFeedback(null);
    setSelectedLessonKeys(new Set());
  };

  const toggleLevelTag = (lvl: CognitiveLevel) => {
    setFlexibleFeedback(null);
    setSelectedLevels((prev) => {
      const next = new Set(prev);
      if (next.has(lvl)) next.delete(lvl);
      else next.add(lvl);
      return next;
    });
  };

  const toggleManualSelect = (id: string) => {
    setFlexibleFeedback(null);
    setManualSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectAllManualDisplayed = () => {
    setManualSelectedIds((prev) => {
      const next = new Set(prev);
      manualDisplayedQuestions.forEach((q) => {
        if (!alreadyInExamBaseIds.has(q.id)) {
          next.add(q.id);
        }
      });
      return next;
    });
  };

  const handleClearAllManualSelected = () => {
    setManualSelectedIds(new Set());
  };

  const handleConfirmFlexibleRandom = () => {
    setFlexibleFeedback(null);
    if (flexibleAvailablePool.length === 0) {
      setFlexibleFeedback(
        'Không có câu hỏi khả dụng nào phù hợp với bài học, mức độ và dạng câu hỏi đang chọn.'
      );
      return;
    }
    if (parsedRandomCount <= 0) {
      setFlexibleFeedback('Vui lòng nhập số lượng câu hỏi muốn bốc (tối thiểu 1 câu).');
      return;
    }
    const countToTake = Math.min(parsedRandomCount, flexibleAvailablePool.length);
    const chosen = shuffleQuestionsList(flexibleAvailablePool).slice(0, countToTake);
    onAddQuestions(cloneQuestionsForExam(chosen));
    onClose();
  };

  const handleConfirmFlexibleManual = () => {
    setFlexibleFeedback(null);
    const idSet = new Set(manualSelectedInMatched);
    const chosen = flexibleMatchedAll.filter((q) => idSet.has(q.id));
    if (chosen.length === 0) {
      setFlexibleFeedback('Vui lòng tích chọn ít nhất 1 câu hỏi trong danh sách.');
      return;
    }
    onAddQuestions(cloneQuestionsForExam(chosen));
    setManualSelectedIds(new Set());
    onClose();
  };

  const alreadyInExamMatchedCount = flexibleMatchedAll.length - flexibleAvailablePool.length;
  const effectiveRandomCount = Math.min(parsedRandomCount, flexibleAvailablePool.length);

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="exam-picker-modal-title"
    >
      <div className="bg-white w-full max-w-5xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between gap-4 shrink-0">
          <div>
            <h3 id="exam-picker-modal-title" className="font-extrabold text-base">
              Thêm Câu Hỏi Vào Đề Thi Từ Ngân Hàng
            </h3>
            <p className="text-xs text-slate-300 mt-0.5">
              Hỗ trợ 2 chế độ: Ma trận chuẩn GDPT 2018 hoặc chọn linh hoạt theo Bài học &amp; Mức độ nhận thức
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng cửa sổ chọn câu hỏi"
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Top 2-Mode Switcher */}
        <div
          role="tablist"
          aria-label="Chế độ tạo đề thi"
          className="px-6 pt-4 pb-3 border-b border-slate-200 bg-slate-50 flex flex-col lg:flex-row lg:items-center justify-between gap-3 shrink-0"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 flex-1">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'matrix'}
              onClick={() => {
                setActiveTab('matrix');
                setMatrixWarning(null);
                setFlexibleFeedback(null);
              }}
              className={`text-left px-4 py-2.5 rounded-xl border transition-all flex items-start gap-2.5 ${
                activeTab === 'matrix'
                  ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm'
                  : 'bg-white border-slate-200 text-slate-700 hover:border-indigo-300 hover:bg-indigo-50/40'
              }`}
            >
              <Grid
                className={`w-4 h-4 shrink-0 mt-0.5 ${
                  activeTab === 'matrix' ? 'text-indigo-100' : 'text-indigo-600'
                }`}
              />
              <div className="min-w-0">
                <div className="text-xs font-extrabold leading-snug">
                  Tạo theo Ma trận chuẩn GDPT 2018
                </div>
                <div
                  className={`text-[11px] mt-0.5 ${
                    activeTab === 'matrix' ? 'text-indigo-100' : 'text-slate-500'
                  }`}
                >
                  Cân đối Phần I, II, III theo 4 mức độ nhận thức
                </div>
              </div>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'flexible'}
              onClick={() => {
                setActiveTab('flexible');
                setMatrixWarning(null);
                setFlexibleFeedback(null);
              }}
              className={`text-left px-4 py-2.5 rounded-xl border transition-all flex items-start gap-2.5 ${
                activeTab === 'flexible'
                  ? 'bg-teal-600 border-teal-600 text-white shadow-sm'
                  : 'bg-white border-slate-200 text-slate-700 hover:border-teal-300 hover:bg-teal-50/40'
              }`}
            >
              <SlidersHorizontal
                className={`w-4 h-4 shrink-0 mt-0.5 ${
                  activeTab === 'flexible' ? 'text-teal-100' : 'text-teal-600'
                }`}
              />
              <div className="min-w-0">
                <div className="text-xs font-extrabold leading-snug">
                  Tạo linh hoạt theo Bài học &amp; Mức độ
                </div>
                <div
                  className={`text-[11px] mt-0.5 ${
                    activeTab === 'flexible' ? 'text-teal-100' : 'text-slate-500'
                  }`}
                >
                  Dành cho bài luyện tập, kiểm tra 15 phút &amp; chuyên đề
                </div>
              </div>
            </button>
          </div>

          <div className="flex items-center gap-2 shrink-0 text-xs">
            <select
              value={subjectFilter}
              onChange={(e) => {
                setSubjectFilter(e.target.value);
                setMatrixTopicFilter('all');
                setHasInitializedLessonsForScope('');
              }}
              aria-label="Chọn môn học"
              className="min-h-[38px] px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white font-semibold text-slate-700"
            >
              <option value="all">Tất cả môn học</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>

            <select
              value={gradeFilter}
              onChange={(e) => {
                setGradeFilter(e.target.value);
                setMatrixTopicFilter('all');
                setHasInitializedLessonsForScope('');
              }}
              aria-label="Chọn khối lớp"
              className="min-h-[38px] px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white font-semibold text-slate-700"
            >
              <option value="all">Tất cả khối lớp</option>
              <option value="12">Lớp 12</option>
              <option value="11">Lớp 11</option>
              <option value="10">Lớp 10</option>
              <option value="chuyen_hsg">Chuyên &amp; HSG</option>
            </select>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'matrix' ? (
            /* ==================== MODE A: MATRIX GDPT 2018 ==================== */
            <div className="space-y-4">
              {matrixWarning && (
                <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-semibold flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <span>{matrixWarning}</span>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2.5 p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setMatrixMode('overall');
                      setMatrixWarning(null);
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                      matrixMode === 'overall'
                        ? 'bg-slate-900 text-white'
                        : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    Ma trận tổng hợp (3 Phần × 4 Mức độ)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMatrixMode('by_topic');
                      setMatrixWarning(null);
                      if (topicRows.length === 0) {
                        handleAddTopicRow();
                      }
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                      matrixMode === 'by_topic'
                        ? 'bg-slate-900 text-white'
                        : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    Ma trận chi tiết theo Chuyên đề
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {matrixMode === 'overall' && (
                    <select
                      value={matrixTopicFilter}
                      onChange={(e) => setMatrixTopicFilter(e.target.value)}
                      className="min-h-[34px] px-2.5 py-1 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700"
                    >
                      <option value="all">Tất cả bài học/chủ đề ({subjectGradePool.length} câu)</option>
                      {availableTopics.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  )}

                  <button
                    type="button"
                    onClick={handleApplyStandard2018Preset}
                    className="px-3 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-800 text-xs font-bold inline-flex items-center gap-1.5"
                  >
                    <Wand2 className="w-3.5 h-3.5" />
                    <span>Áp dụng mẫu chuẩn GDPT 2018 (18-4-6)</span>
                  </button>
                </div>
              </div>

              {matrixMode === 'overall' ? (
                <>
                  <div className="p-3.5 rounded-xl bg-indigo-50/50 border border-indigo-100 text-xs text-slate-700 leading-relaxed">
                    Nhập số lượng câu hỏi cần bốc ngẫu nhiên cho từng dạng bài (Phần I, II, III) và mức độ nhận thức (Biết / Hiểu / Vận dụng / VDC). Hệ thống tự động loại trừ các câu đã có sẵn trong đề thi.
                  </div>

                  <div className="overflow-x-auto border border-slate-200 rounded-xl">
                    <table className="w-full text-xs text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 font-bold">
                          <th className="py-3 px-4">Dạng câu hỏi</th>
                          {LEVELS.map((lvl) => (
                            <th key={lvl} className="py-3 px-3 text-center">
                              {LEVEL_TAG_LABELS[lvl]}
                            </th>
                          ))}
                          <th className="py-3 px-4 text-right">Tổng theo dạng</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {TYPES.map((qType) => {
                          const rowSum = LEVELS.reduce((sum, l) => sum + (matrix[qType][l] || 0), 0);
                          return (
                            <tr key={qType} className="hover:bg-slate-50/70">
                              <td className="py-3 px-4 font-semibold text-slate-900">
                                {QUESTION_TYPE_SHORT_LABELS[qType]}
                              </td>
                              {LEVELS.map((lvl) => {
                                const maxAvail = availableMatrixCounts[qType][lvl];
                                const val = matrix[qType][lvl];
                                return (
                                  <td key={lvl} className="py-3 px-3 text-center">
                                    <div className="inline-flex flex-col items-center gap-1">
                                      <input
                                        type="number"
                                        min={0}
                                        max={maxAvail}
                                        value={val}
                                        onChange={(e) => {
                                          const n = Math.max(0, Math.floor(Number(e.target.value) || 0));
                                          setMatrix((prev) => ({
                                            ...prev,
                                            [qType]: {
                                              ...prev[qType],
                                              [lvl]: n,
                                            },
                                          }));
                                        }}
                                        className={`w-16 min-h-[36px] px-2 py-1 rounded-lg border text-center font-bold tabular-nums ${
                                          val > maxAvail
                                            ? 'border-amber-400 bg-amber-50 text-amber-900'
                                            : 'border-slate-300 bg-white text-slate-900'
                                        }`}
                                      />
                                      <span className="text-[11px] text-slate-500 tabular-nums">
                                        Có sẵn: {maxAvail}
                                      </span>
                                    </div>
                                  </td>
                                );
                              })}
                              <td className="py-3 px-4 text-right font-bold text-slate-900 tabular-nums">
                                {rowSum} câu
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => setMatrix(createEmptyMatrix())}
                      className="text-slate-600 hover:text-slate-900 font-semibold"
                    >
                      Đặt lại ma trận về 0
                    </button>
                    <span className="font-bold text-indigo-800 tabular-nums">
                      Tổng số câu sẽ bốc thêm: {totalMatrixRequested} câu
                    </span>
                  </div>
                </>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-slate-600">
                      Thiết lập nhiều dòng ma trận theo từng <strong>Chuyên đề / Bài học</strong> và <strong>Dạng câu hỏi</strong> (Phần I, II, III) kết hợp mức độ nhận thức.
                    </p>
                    <button
                      type="button"
                      onClick={handleAddTopicRow}
                      className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold inline-flex items-center gap-1 shrink-0"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Thêm dòng chuyên đề</span>
                    </button>
                  </div>

                  <div className="overflow-x-auto border border-slate-200 rounded-xl">
                    <table className="w-full text-xs text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 font-bold">
                          <th className="py-2.5 px-3 min-w-[180px]">Chuyên đề / Bài học</th>
                          <th className="py-2.5 px-3 min-w-[140px]">Dạng câu hỏi</th>
                          {LEVELS.map((lvl) => (
                            <th key={lvl} className="py-2.5 px-2 text-center">
                              {COGNITIVE_LEVEL_SHORT_LABELS[lvl]}
                            </th>
                          ))}
                          <th className="py-2.5 px-2 text-center">Xóa</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {topicRows.map((row) => (
                          <tr key={row.id} className="hover:bg-slate-50/70">
                            <td className="py-2.5 px-3">
                              <select
                                value={row.topic}
                                onChange={(e) =>
                                  setTopicRows((prev) =>
                                    prev.map((r) =>
                                      r.id === row.id ? { ...r, topic: e.target.value } : r
                                    )
                                  )
                                }
                                className="w-full px-2 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-medium"
                              >
                                <option value="all">Tất cả chuyên đề</option>
                                {availableTopics.map((t) => (
                                  <option key={t} value={t}>
                                    {t}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="py-2.5 px-3">
                              <select
                                value={row.type}
                                onChange={(e) =>
                                  setTopicRows((prev) =>
                                    prev.map((r) =>
                                      r.id === row.id
                                        ? { ...r, type: e.target.value as QuestionType }
                                        : r
                                    )
                                  )
                                }
                                className="w-full px-2 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-medium"
                              >
                                {TYPES.map((t) => (
                                  <option key={t} value={t}>
                                    {QUESTION_TYPE_SHORT_LABELS[t]}
                                  </option>
                                ))}
                              </select>
                            </td>
                            {LEVELS.map((lvl) => {
                              const avail = countAvailableForTopicCell(row.topic, row.type, lvl);
                              const val = row.counts[lvl] || 0;
                              return (
                                <td key={lvl} className="py-2.5 px-2 text-center">
                                  <div className="inline-flex flex-col items-center gap-0.5">
                                    <input
                                      type="number"
                                      min={0}
                                      max={avail}
                                      value={val}
                                      onChange={(e) => {
                                        const n = Math.max(0, Math.floor(Number(e.target.value) || 0));
                                        setTopicRows((prev) =>
                                          prev.map((r) =>
                                            r.id === row.id
                                              ? { ...r, counts: { ...r.counts, [lvl]: n } }
                                              : r
                                          )
                                        );
                                      }}
                                      className={`w-14 px-1.5 py-1 rounded-lg border text-center font-bold tabular-nums ${
                                        val > avail
                                          ? 'border-amber-400 bg-amber-50 text-amber-900'
                                          : 'border-slate-300 bg-white text-slate-900'
                                      }`}
                                    />
                                    <span className="text-[10px] text-slate-500 tabular-nums">
                                      /{avail}
                                    </span>
                                  </div>
                                </td>
                              );
                            })}
                            <td className="py-2.5 px-2 text-center">
                              <button
                                type="button"
                                onClick={() =>
                                  setTopicRows((prev) => prev.filter((r) => r.id !== row.id))
                                }
                                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                                title="Xóa dòng ma trận"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <button
                      type="button"
                      onClick={() => setTopicRows([])}
                      className="text-slate-600 hover:text-slate-900 font-semibold"
                    >
                      Xóa tất cả dòng
                    </button>
                    <span className="font-bold text-indigo-800 tabular-nums">
                      Tổng số câu sẽ bốc thêm: {totalMatrixRequested} câu
                    </span>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* ==================== MODE B: FLEXIBLE BY LESSONS & LEVELS ==================== */
            <div className="space-y-5">
              {flexibleFeedback && (
                <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-semibold flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <span>{flexibleFeedback}</span>
                </div>
              )}

              {/* Step 1: Multi-select Lessons Panel */}
              <div className="border border-slate-200 rounded-2xl bg-white overflow-hidden">
                <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-teal-600 shrink-0" />
                    <span className="text-xs font-extrabold text-slate-900">
                      1. Chọn Bài học / Chủ đề ({gradeFilter === 'all' ? 'Tất cả khối' : GRADE_LABELS[gradeFilter as keyof typeof GRADE_LABELS] || `Lớp ${gradeFilter}`})
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-teal-50 border border-teal-200 text-teal-800 text-[11px] font-bold tabular-nums">
                      Đã chọn {selectedLessonKeys.size}/{flexibleLessonOptions.length}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {flexibleLessonOptions.length > 6 && (
                      <div className="relative">
                        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          value={lessonSearchTerm}
                          onChange={(e) => setLessonSearchTerm(e.target.value)}
                          placeholder="Lọc tên bài học..."
                          className="w-44 pl-7 pr-2.5 py-1 rounded-lg border border-slate-200 bg-white text-[11px] focus:outline-none focus:ring-2 focus:ring-teal-500"
                        />
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={handleSelectAllLessons}
                      disabled={flexibleLessonOptions.length === 0}
                      className="px-2.5 py-1 rounded-lg bg-teal-50 hover:bg-teal-100 border border-teal-200 text-teal-800 text-[11px] font-bold disabled:opacity-50 transition-colors"
                    >
                      Chọn tất cả
                    </button>
                    <button
                      type="button"
                      onClick={handleClearAllLessons}
                      disabled={selectedLessonKeys.size === 0}
                      className="px-2.5 py-1 rounded-lg bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 text-[11px] font-bold disabled:opacity-50 transition-colors"
                    >
                      Bỏ chọn
                    </button>
                  </div>
                </div>

                <div className="p-3.5 max-h-48 overflow-y-auto">
                  {isLoadingLessons ? (
                    <div className="py-6 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin text-teal-600" />
                      <span>Đang tải danh mục bài học chuẩn GDPT 2018...</span>
                    </div>
                  ) : visibleLessonOptions.length === 0 ? (
                    <div className="py-6 text-center text-xs text-slate-500">
                      Không tìm thấy bài học/chủ đề nào cho bộ lọc Môn học &amp; Khối lớp hiện tại.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {visibleLessonOptions.map((opt) => {
                        const checked = selectedLessonKeys.has(opt.key);
                        return (
                          <label
                            key={opt.key}
                            className={`flex items-start justify-between gap-2.5 p-2.5 rounded-xl border cursor-pointer transition-colors ${
                              checked
                                ? 'border-teal-500 bg-teal-50/50'
                                : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/60'
                            }`}
                          >
                            <div className="flex items-start gap-2 min-w-0">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleLessonKey(opt.key)}
                                className="mt-0.5 w-4 h-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500 shrink-0 cursor-pointer"
                              />
                              <div className="min-w-0">
                                <div className="text-xs font-semibold text-slate-900 leading-snug break-words">
                                  {opt.label}
                                </div>
                                {opt.chapterName && (
                                  <div className="text-[11px] text-slate-500 truncate mt-0.5">
                                    {opt.chapterName}
                                  </div>
                                )}
                              </div>
                            </div>
                            <span
                              className={`px-2 py-0.5 rounded-md text-[11px] font-bold shrink-0 tabular-nums ${
                                opt.availableCount > 0
                                  ? 'bg-slate-100 text-slate-700'
                                  : 'bg-slate-50 text-slate-400'
                              }`}
                            >
                              {opt.availableCount} câu
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Step 2 & Step 3: Cognitive Levels Multi-select Tags + Question Type Filter */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Cognitive Levels Multi-select Tags */}
                <div className="border border-slate-200 rounded-2xl p-4 bg-white space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-extrabold text-slate-900 flex items-center gap-1.5">
                      <Layers className="w-4 h-4 text-indigo-600" />
                      <span>2. Mức độ nhận thức (chọn nhiều)</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setFlexibleFeedback(null);
                        if (selectedLevels.size === LEVELS.length) {
                          setSelectedLevels(new Set());
                        } else {
                          setSelectedLevels(new Set(LEVELS));
                        }
                      }}
                      className="text-[11px] font-bold text-indigo-700 hover:underline"
                    >
                      {selectedLevels.size === LEVELS.length ? 'Bỏ chọn hết' : 'Chọn cả 4 mức'}
                    </button>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {LEVELS.map((lvl) => {
                      const active = selectedLevels.has(lvl);
                      const count = flexibleLevelCounts[lvl];
                      return (
                        <button
                          key={lvl}
                          type="button"
                          onClick={() => toggleLevelTag(lvl)}
                          aria-pressed={active}
                          className={`px-3 py-2 rounded-xl border text-xs font-bold inline-flex items-center gap-1.5 transition-all ${
                            active
                              ? 'bg-indigo-600 border-indigo-600 text-white shadow-xs'
                              : 'bg-slate-50 border-slate-200 text-slate-700 hover:border-indigo-300 hover:bg-indigo-50/40'
                          }`}
                        >
                          {active && <Check className="w-3.5 h-3.5 shrink-0" />}
                          <span>{LEVEL_TAG_LABELS[lvl]}</span>
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-extrabold tabular-nums ${
                              active ? 'bg-white/20 text-white' : 'bg-white text-slate-600 border border-slate-200'
                            }`}
                          >
                            {count}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Question Type Filter */}
                <div className="border border-slate-200 rounded-2xl p-4 bg-white space-y-2.5">
                  <span className="text-xs font-extrabold text-slate-900 flex items-center gap-1.5">
                    <ListChecks className="w-4 h-4 text-teal-600" />
                    <span>3. Dạng câu hỏi</span>
                  </span>

                  <div className="grid grid-cols-2 gap-2">
                    {(
                      [
                        { id: 'all', label: 'Cả 3 phần', count: flexiblePartCounts.all },
                        {
                          id: 'part1_single_choice',
                          label: 'Phần I (4 lựa chọn)',
                          count: flexiblePartCounts.part1_single_choice,
                        },
                        {
                          id: 'part2_true_false',
                          label: 'Phần II (Đúng/Sai)',
                          count: flexiblePartCounts.part2_true_false,
                        },
                        {
                          id: 'part3_short_answer',
                          label: 'Phần III (Trả lời ngắn)',
                          count: flexiblePartCounts.part3_short_answer,
                        },
                      ] as const
                    ).map((opt) => {
                      const active = partFilter === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => {
                            setPartFilter(opt.id);
                            setFlexibleFeedback(null);
                          }}
                          className={`px-3 py-2 rounded-xl border text-xs font-bold flex items-center justify-between gap-2 transition-all ${
                            active
                              ? 'bg-teal-600 border-teal-600 text-white shadow-xs'
                              : 'bg-slate-50 border-slate-200 text-slate-700 hover:border-teal-300 hover:bg-teal-50/40'
                          }`}
                        >
                          <span className="truncate">{opt.label}</span>
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-extrabold shrink-0 tabular-nums ${
                              active ? 'bg-white/20 text-white' : 'bg-white text-slate-600 border border-slate-200'
                            }`}
                          >
                            {opt.count}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Real-time Counter Banner */}
              <div
                className={`rounded-2xl border p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                  flexibleAvailablePool.length > 0
                    ? 'bg-emerald-50/70 border-emerald-200'
                    : 'bg-amber-50/70 border-amber-200'
                }`}
              >
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2 text-sm font-extrabold text-slate-900 tabular-nums">
                    <Sparkles
                      className={`w-4 h-4 shrink-0 ${
                        flexibleAvailablePool.length > 0 ? 'text-emerald-600' : 'text-amber-600'
                      }`}
                    />
                    <span>
                      Tìm thấy{' '}
                      <span
                        className={
                          flexibleAvailablePool.length > 0 ? 'text-emerald-700' : 'text-amber-700'
                        }
                      >
                        {flexibleAvailablePool.length}
                      </span>{' '}
                      câu hỏi phù hợp
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 tabular-nums">
                    Phần I: <strong>{flexiblePartCounts.part1_single_choice}</strong> · Phần II:{' '}
                    <strong>{flexiblePartCounts.part2_true_false}</strong> · Phần III:{' '}
                    <strong>{flexiblePartCounts.part3_short_answer}</strong>
                    {alreadyInExamMatchedCount > 0 && (
                      <span className="text-amber-800 ml-2">
                        (đã loại trừ {alreadyInExamMatchedCount} câu có sẵn trong đề)
                      </span>
                    )}
                  </p>
                </div>

                {/* Pick Method Toggle: Random N vs Manual */}
                <div className="flex items-center gap-1.5 bg-white p-1 rounded-xl border border-slate-200 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setPickMethod('random');
                      setFlexibleFeedback(null);
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 transition-colors ${
                      pickMethod === 'random'
                        ? 'bg-teal-600 text-white shadow-xs'
                        : 'text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <Dices className="w-3.5 h-3.5" />
                    <span>Bốc ngẫu nhiên [N] câu</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPickMethod('manual');
                      setFlexibleFeedback(null);
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 transition-colors ${
                      pickMethod === 'manual'
                        ? 'bg-teal-600 text-white shadow-xs'
                        : 'text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <CheckSquare className="w-3.5 h-3.5" />
                    <span>Chọn thủ công từ danh sách</span>
                  </button>
                </div>
              </div>

              {/* Pick Method Body */}
              {pickMethod === 'random' ? (
                <div className="border border-slate-200 rounded-2xl p-5 bg-slate-50/70 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="space-y-1">
                      <h4 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                        <Shuffle className="w-4 h-4 text-teal-600" />
                        <span>Bốc ngẫu nhiên vào đề thi</span>
                      </h4>
                      <p className="text-xs text-slate-600">
                        Nhập số lượng câu hỏi muốn lấy. Hệ thống sẽ xáo trộn ngẫu nhiên và bốc từ{' '}
                        <strong className="tabular-nums">{flexibleAvailablePool.length}</strong> câu hỏi khả dụng.
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <label htmlFor="flexible-random-n" className="text-xs font-bold text-slate-700">
                        Số lượng (N):
                      </label>
                      <input
                        id="flexible-random-n"
                        type="number"
                        min={1}
                        max={Math.max(1, flexibleAvailablePool.length)}
                        value={randomCountInput}
                        onChange={(e) => {
                          setRandomCountInput(e.target.value);
                          setFlexibleFeedback(null);
                        }}
                        className="w-24 min-h-[40px] px-3 py-1.5 rounded-xl border border-slate-300 bg-white text-center text-sm font-extrabold text-teal-800 tabular-nums focus:outline-none focus:ring-2 focus:ring-teal-500"
                      />
                      <span className="text-xs font-semibold text-slate-500 tabular-nums">
                        / {flexibleAvailablePool.length} câu
                      </span>
                    </div>
                  </div>

                  {/* Quick N presets */}
                  {flexibleAvailablePool.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-200/80">
                      <span className="text-[11px] font-semibold text-slate-500">Chọn nhanh:</span>
                      {[5, 10, 15, 20, 30, 40]
                        .filter((n) => n < flexibleAvailablePool.length)
                        .map((n) => (
                          <button
                            key={n}
                            type="button"
                            onClick={() => setRandomCountInput(String(n))}
                            className={`px-2.5 py-1 rounded-lg border text-xs font-bold tabular-nums transition-colors ${
                              parsedRandomCount === n
                                ? 'bg-teal-600 border-teal-600 text-white'
                                : 'bg-white border-slate-200 text-slate-700 hover:border-teal-300'
                            }`}
                          >
                            {n} câu
                          </button>
                        ))}
                      <button
                        type="button"
                        onClick={() => setRandomCountInput(String(flexibleAvailablePool.length))}
                        className={`px-2.5 py-1 rounded-lg border text-xs font-bold tabular-nums transition-colors ${
                          parsedRandomCount === flexibleAvailablePool.length
                            ? 'bg-teal-600 border-teal-600 text-white'
                            : 'bg-white border-slate-200 text-slate-700 hover:border-teal-300'
                        }`}
                      >
                        Lấy tất cả ({flexibleAvailablePool.length} câu)
                      </button>
                    </div>
                  )}

                  {parsedRandomCount > flexibleAvailablePool.length && flexibleAvailablePool.length > 0 && (
                    <p className="text-xs text-amber-800 font-semibold">
                      Số lượng nhập ({parsedRandomCount}) vượt quá số câu khả dụng — hệ thống sẽ bốc tối đa{' '}
                      <strong>{flexibleAvailablePool.length} câu</strong>.
                    </p>
                  )}
                </div>
              ) : (
                /* Option 2: Manual Selection from Filtered List */
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="relative flex-1 min-w-[220px]">
                      <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        value={manualSearchTerm}
                        onChange={(e) => setManualSearchTerm(e.target.value)}
                        placeholder="Tìm kiếm nhanh trong các câu đã lọc (nội dung, mã câu, bài học)..."
                        className="w-full min-h-[38px] pl-9 pr-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white text-xs focus:outline-none focus:ring-2 focus:ring-teal-500"
                      />
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={handleSelectAllManualDisplayed}
                        disabled={flexibleAvailablePool.length === 0}
                        className="px-3 py-1.5 rounded-lg bg-teal-50 hover:bg-teal-100 border border-teal-200 text-teal-800 text-xs font-bold disabled:opacity-50"
                      >
                        Chọn tất cả câu hợp lệ
                      </button>
                      <button
                        type="button"
                        onClick={handleClearAllManualSelected}
                        disabled={manualSelectedInMatched.length === 0}
                        className="px-3 py-1.5 rounded-lg bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-bold disabled:opacity-50"
                      >
                        Bỏ chọn ({manualSelectedInMatched.length})
                      </button>
                    </div>
                  </div>

                  {manualDisplayedQuestions.length === 0 ? (
                    <div className="py-10 text-center text-xs text-slate-500 border border-dashed border-slate-200 rounded-2xl">
                      Không có câu hỏi nào khớp với bộ lọc bài học, mức độ và dạng câu hỏi hiện tại.
                    </div>
                  ) : (
                    <div className="space-y-2.5 max-h-[340px] overflow-y-auto pr-1">
                      {manualDisplayedQuestions.map((q) => {
                        const isChecked = manualSelectedIds.has(q.id);
                        const isAlreadyInExam = alreadyInExamBaseIds.has(q.id);
                        return (
                          <div
                            key={q.id}
                            onClick={() => toggleManualSelect(q.id)}
                            className={`p-3.5 rounded-xl border cursor-pointer transition-colors ${
                              isChecked
                                ? 'border-teal-500 bg-teal-50/40'
                                : 'border-slate-200 hover:border-slate-300 bg-white'
                            }`}
                          >
                            <div className="flex items-start gap-3">
                              <div className="mt-0.5 shrink-0">
                                {isChecked ? (
                                  <CheckSquare className="w-4 h-4 text-teal-600" />
                                ) : (
                                  <Square className="w-4 h-4 text-slate-300" />
                                )}
                              </div>
                              <div className="flex-1 min-w-0 space-y-1.5">
                                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                                  <span className="font-mono font-bold text-slate-900">{q.code}</span>
                                  <span className="text-slate-300">·</span>
                                  <span className="font-semibold text-teal-700">
                                    {getQuestionTopicDisplay(q)}
                                  </span>
                                  <span className="text-slate-300">·</span>
                                  <span className="font-semibold text-slate-800">
                                    {QUESTION_TYPE_SHORT_LABELS[q.type]}
                                  </span>
                                  <span className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-800 font-semibold text-[11px]">
                                    {LEVEL_TAG_LABELS[q.level]}
                                  </span>
                                  {isAlreadyInExam && (
                                    <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 font-semibold text-[11px]">
                                      Đã có trong đề
                                    </span>
                                  )}
                                </div>
                                <div className="text-xs text-slate-800 leading-relaxed line-clamp-3">
                                  <ChemRenderer text={q.content} />
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <span className="text-xs font-semibold text-slate-600 tabular-nums">
            {activeTab === 'matrix'
              ? `Tổng ma trận sẽ bốc: ${totalMatrixRequested} câu`
              : pickMethod === 'random'
              ? `Phù hợp: ${flexibleAvailablePool.length} câu · Sẽ bốc ngẫu nhiên: ${effectiveRandomCount} câu`
              : `Phù hợp: ${flexibleAvailablePool.length} câu · Đã chọn thủ công: ${manualSelectedInMatched.length} câu`}
          </span>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[40px] px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold"
            >
              Đóng
            </button>

            {activeTab === 'matrix' ? (
              <button
                type="button"
                disabled={totalMatrixRequested === 0}
                onClick={handleConfirmMatrix}
                className="min-h-[40px] px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold inline-flex items-center gap-1.5 shadow-xs"
              >
                <Sparkles className="w-4 h-4" />
                <span>Bốc ngẫu nhiên theo ma trận ({totalMatrixRequested} câu)</span>
              </button>
            ) : pickMethod === 'random' ? (
              <button
                type="button"
                disabled={effectiveRandomCount === 0}
                onClick={handleConfirmFlexibleRandom}
                className="min-h-[40px] px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-xs font-bold inline-flex items-center gap-1.5 shadow-xs"
              >
                <Dices className="w-4 h-4" />
                <span>Bốc ngẫu nhiên {effectiveRandomCount} câu vào đề</span>
              </button>
            ) : (
              <button
                type="button"
                disabled={manualSelectedInMatched.length === 0}
                onClick={handleConfirmFlexibleManual}
                className="min-h-[40px] px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-xs font-bold inline-flex items-center gap-1.5 shadow-xs"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Thêm {manualSelectedInMatched.length} câu đã chọn vào đề</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
