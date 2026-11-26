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
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  Dices,
  Grid,
  ListChecks,
  Loader2,
  Plus,
  Scale,
  Search,
  SlidersHorizontal,
  Sparkles,
  Square,
  Trash2,
  Wand2,
  X,
  Zap,
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

type LevelCounts = Record<CognitiveLevel, number>;

interface TopicMatrixRow {
  id: string;
  topic: string;
  type: QuestionType;
  counts: LevelCounts;
}

interface FlexibleLessonOption {
  key: string;
  label: string;
  chapterName?: string;
  lessonId?: string;
  availableCount: number;
  totalCount: number;
  levelAvailable: LevelCounts;
}

interface LessonValidationError {
  lessonKey: string;
  lessonLabel: string;
  level: CognitiveLevel;
  requested: number;
  available: number;
}

type MatrixGrid = Record<QuestionType, LevelCounts>;
type FlexiblePartFilter = 'all' | 'part1_single_choice' | 'part2_true_false' | 'part3_short_answer';
type FlexiblePickMethod = 'random' | 'manual';

const LEVELS: CognitiveLevel[] = ['nhan_biet', 'thong_hieu', 'van_dung', 'van_dung_cao'];
const LEVEL_TAG_LABELS: Record<CognitiveLevel, string> = {
  nhan_biet: 'Nhận biết',
  thong_hieu: 'Thông hiểu',
  van_dung: 'Vận dụng',
  van_dung_cao: 'Vận dụng cao',
};
const LEVEL_CODE_LABELS: Record<CognitiveLevel, string> = {
  nhan_biet: 'NB',
  thong_hieu: 'TH',
  van_dung: 'VD',
  van_dung_cao: 'VDC',
};
const TYPES: QuestionType[] = ['part1_single_choice', 'part2_true_false', 'part3_short_answer'];

function createEmptyLevelCounts(): LevelCounts {
  return { nhan_biet: 0, thong_hieu: 0, van_dung: 0, van_dung_cao: 0 };
}

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
    part1_single_choice: createEmptyLevelCounts(),
    part1_multiple_choice: createEmptyLevelCounts(),
    part2_true_false: createEmptyLevelCounts(),
    part3_short_answer: createEmptyLevelCounts(),
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

  // --- MODE B: Flexible by Lessons & Cognitive Levels (Expandable Per-Lesson Config) ---
  const [catalogLessons, setCatalogLessons] = useState<CurriculumLesson[]>([]);
  const [isLoadingLessons, setIsLoadingLessons] = useState<boolean>(false);
  const [lessonSearchTerm, setLessonSearchTerm] = useState('');
  const [selectedLessonKeys, setSelectedLessonKeys] = useState<Set<string>>(new Set());
  const [lessonLevelConfigs, setLessonLevelConfigs] = useState<Record<string, LevelCounts>>({});
  const [bulkConfig, setBulkConfig] = useState<LevelCounts>({
    nhan_biet: 2,
    thong_hieu: 2,
    van_dung: 1,
    van_dung_cao: 0,
  });
  const [hasInitializedLessonsForScope, setHasInitializedLessonsForScope] = useState<string>('');
  const [partFilter, setPartFilter] = useState<FlexiblePartFilter>('all');
  const [pickMethod, setPickMethod] = useState<FlexiblePickMethod>('random');
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
      setLessonLevelConfigs({});
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

  // --- MODE B: Resolve each question's canonical Lesson Key & per-level available counts ---
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
          levelAvailable: createEmptyLevelCounts(),
        });
      }
      if (lid) catalogById.set(lid, key);
      catalogByName.set(label.toLowerCase(), key);
    });

    // 2. Map every question in subjectGradePool to its lesson option (respecting partFilter for counts)
    const qMap = new Map<string, string>();
    subjectGradePool.forEach((q) => {
      const qLid = (q.lessonId || '').trim();
      const qLabel = getQuestionTopicDisplay(q).trim();
      const resolvedKey =
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
          levelAvailable: createEmptyLevelCounts(),
        });
      }

      qMap.set(q.id, resolvedKey);

      if (!matchesPartFilter(q.type, partFilter)) return;
      const entry = optionMap.get(resolvedKey)!;
      entry.totalCount += 1;
      if (!alreadyInExamBaseIds.has(q.id)) {
        entry.availableCount += 1;
        if (typeof entry.levelAvailable[q.level] === 'number') {
          entry.levelAvailable[q.level] += 1;
        }
      }
    });

    const ordered = Array.from(optionMap.values());
    return {
      flexibleLessonOptions: ordered,
      questionToLessonKeyMap: qMap,
    };
  }, [catalogLessons, subjectGradePool, alreadyInExamBaseIds, partFilter]);

  // Reset lesson selections cleanly when subject/grade scope changes
  const scopeKey = `${subjectFilter}::${gradeFilter}::${catalogLessons.length}`;
  useEffect(() => {
    if (!isOpen) return;
    if (isLoadingLessons) return;
    if (hasInitializedLessonsForScope === scopeKey) return;
    // Start collapsed when multiple lessons exist so teacher picks cleanly; auto-expand if only 1 lesson exists
    const initialSelected =
      flexibleLessonOptions.length === 1
        ? new Set([flexibleLessonOptions[0].key])
        : new Set<string>();
    setSelectedLessonKeys(initialSelected);
    setLessonLevelConfigs({});
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

  // Per-part counts across current Subject + Grade (excluding already-in-exam)
  const flexiblePartCounts = useMemo(() => {
    const counts = {
      all: 0,
      part1_single_choice: 0,
      part2_true_false: 0,
      part3_short_answer: 0,
    };
    subjectGradePool.forEach((q) => {
      if (alreadyInExamBaseIds.has(q.id)) return;
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
  }, [subjectGradePool, alreadyInExamBaseIds]);

  // Real-time totals & validation errors across all checked lessons
  const { flexibleTotals, flexibleValidationErrors, validationErrorCellSet } = useMemo(() => {
    const totals: LevelCounts & { total: number } = {
      nhan_biet: 0,
      thong_hieu: 0,
      van_dung: 0,
      van_dung_cao: 0,
      total: 0,
    };
    const errors: LessonValidationError[] = [];
    const cellSet = new Set<string>();

    flexibleLessonOptions.forEach((opt) => {
      if (!selectedLessonKeys.has(opt.key)) return;
      const cfg = lessonLevelConfigs[opt.key] || createEmptyLevelCounts();
      LEVELS.forEach((lvl) => {
        const req = Math.max(0, Math.floor(cfg[lvl] || 0));
        const avail = opt.levelAvailable[lvl] || 0;
        totals[lvl] += req;
        totals.total += req;
        if (req > avail) {
          errors.push({
            lessonKey: opt.key,
            lessonLabel: opt.label,
            level: lvl,
            requested: req,
            available: avail,
          });
          cellSet.add(`${opt.key}::${lvl}`);
        }
      });
    });

    return {
      flexibleTotals: totals,
      flexibleValidationErrors: errors,
      validationErrorCellSet: cellSet,
    };
  }, [flexibleLessonOptions, selectedLessonKeys, lessonLevelConfigs]);

  // Questions matching checked Lessons + Part filter (for Manual Pick option inside Mode B)
  const flexibleMatchedAll = useMemo(() => {
    if (selectedLessonKeys.size === 0) return [];
    return subjectGradePool.filter((q) => {
      const lessonKey = questionToLessonKeyMap.get(q.id);
      if (!lessonKey || !selectedLessonKeys.has(lessonKey)) return false;
      if (!matchesPartFilter(q.type, partFilter)) return false;
      return true;
    });
  }, [subjectGradePool, questionToLessonKeyMap, selectedLessonKeys, partFilter]);

  const flexibleAvailablePool = useMemo(
    () => flexibleMatchedAll.filter((q) => !alreadyInExamBaseIds.has(q.id)),
    [flexibleMatchedAll, alreadyInExamBaseIds]
  );

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

  // --- Handlers: Mode B (Flexible by Lessons & Cognitive Levels) ---
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

  const handleUpdateLessonLevelCount = (
    lessonKey: string,
    lvl: CognitiveLevel,
    rawValue: string
  ) => {
    setFlexibleFeedback(null);
    const parsed = Math.max(0, Math.floor(Number(rawValue) || 0));
    setLessonLevelConfigs((prev) => {
      const existing = prev[lessonKey] || createEmptyLevelCounts();
      return {
        ...prev,
        [lessonKey]: {
          ...existing,
          [lvl]: parsed,
        },
      };
    });
  };

  const handleSelectAllLevelsForLesson = (opt: FlexibleLessonOption) => {
    setFlexibleFeedback(null);
    setLessonLevelConfigs((prev) => ({
      ...prev,
      [opt.key]: {
        nhan_biet: opt.levelAvailable.nhan_biet,
        thong_hieu: opt.levelAvailable.thong_hieu,
        van_dung: opt.levelAvailable.van_dung,
        van_dung_cao: opt.levelAvailable.van_dung_cao,
      },
    }));
  };

  const handleAutoDistributeLesson = (opt: FlexibleLessonOption) => {
    setFlexibleFeedback(null);
    const availableLevels = LEVELS.filter((lvl) => opt.levelAvailable[lvl] > 0);
    if (availableLevels.length === 0) return;

    const currentCfg = lessonLevelConfigs[opt.key] || createEmptyLevelCounts();
    const currentSum = LEVELS.reduce((sum, lvl) => sum + (currentCfg[lvl] || 0), 0);
    const maxTotal = opt.availableCount;

    const targetTotal =
      currentSum > 0 && currentSum <= maxTotal
        ? currentSum
        : Math.min(
            maxTotal,
            Math.max(availableLevels.length, Math.min(8, availableLevels.length * 2))
          );

    const distributed = createEmptyLevelCounts();
    let remaining = targetTotal;
    let madeProgress = true;
    while (remaining > 0 && madeProgress) {
      madeProgress = false;
      for (const lvl of availableLevels) {
        if (remaining <= 0) break;
        if (distributed[lvl] < opt.levelAvailable[lvl]) {
          distributed[lvl] += 1;
          remaining -= 1;
          madeProgress = true;
        }
      }
    }

    setLessonLevelConfigs((prev) => ({
      ...prev,
      [opt.key]: distributed,
    }));
  };

  const handleResetLessonCounts = (lessonKey: string) => {
    setFlexibleFeedback(null);
    setLessonLevelConfigs((prev) => ({
      ...prev,
      [lessonKey]: createEmptyLevelCounts(),
    }));
  };

  const handleApplyBulkConfig = () => {
    setFlexibleFeedback(null);
    if (selectedLessonKeys.size === 0) {
      setFlexibleFeedback(
        'Vui lòng tích chọn ít nhất 1 bài học trước khi áp dụng cấu hình hàng loạt.'
      );
      return;
    }
    setLessonLevelConfigs((prev) => {
      const next = { ...prev };
      selectedLessonKeys.forEach((key) => {
        next[key] = { ...bulkConfig };
      });
      return next;
    });
  };

  const handleClampOverflowToMax = () => {
    setFlexibleFeedback(null);
    const optionByKey = new Map(flexibleLessonOptions.map((o) => [o.key, o]));
    setLessonLevelConfigs((prev) => {
      const next = { ...prev };
      selectedLessonKeys.forEach((key) => {
        const opt = optionByKey.get(key);
        if (!opt) return;
        const cur = next[key] || createEmptyLevelCounts();
        next[key] = {
          nhan_biet: Math.min(cur.nhan_biet || 0, opt.levelAvailable.nhan_biet),
          thong_hieu: Math.min(cur.thong_hieu || 0, opt.levelAvailable.thong_hieu),
          van_dung: Math.min(cur.van_dung || 0, opt.levelAvailable.van_dung),
          van_dung_cao: Math.min(cur.van_dung_cao || 0, opt.levelAvailable.van_dung_cao),
        };
      });
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
    if (selectedLessonKeys.size === 0) {
      setFlexibleFeedback('Vui lòng tích chọn ít nhất 1 bài học để cấu hình số câu cần bốc.');
      return;
    }
    if (flexibleValidationErrors.length > 0) {
      setFlexibleFeedback(
        'Một số bài học có số câu nhập vượt quá số câu hiện có trong ngân hàng. Vui lòng điều chỉnh các ô báo đỏ trước khi bốc.'
      );
      return;
    }
    if (flexibleTotals.total <= 0) {
      setFlexibleFeedback('Vui lòng nhập số lượng ít nhất 1 câu hỏi cho các bài học đã chọn.');
      return;
    }

    const usedIds = new Set<string>(alreadyInExamBaseIds);
    const picked: Question[] = [];

    for (const opt of flexibleLessonOptions) {
      if (!selectedLessonKeys.has(opt.key)) continue;
      const cfg = lessonLevelConfigs[opt.key] || createEmptyLevelCounts();

      for (const lvl of LEVELS) {
        const target = Math.max(0, Math.floor(cfg[lvl] || 0));
        if (target === 0) continue;

        const candidates = subjectGradePool.filter((q) => {
          if (usedIds.has(q.id)) return false;
          if (questionToLessonKeyMap.get(q.id) !== opt.key) return false;
          if (q.level !== lvl) return false;
          if (!matchesPartFilter(q.type, partFilter)) return false;
          return true;
        });

        const chosen = shuffleQuestionsList(candidates).slice(0, target);
        chosen.forEach((c) => {
          usedIds.add(c.id);
          picked.push(c);
        });
      }
    }

    if (picked.length === 0) {
      setFlexibleFeedback('Không tìm thấy câu hỏi khả dụng nào khớp với cấu hình hiện tại.');
      return;
    }

    onAddQuestions(cloneQuestionsForExam(picked));
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

  const hasValidationErrors = flexibleValidationErrors.length > 0;

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
            /* ==================== MODE B: FLEXIBLE BY LESSONS & LEVELS (ACCORDION + BULK CONFIG) ==================== */
            <div className="space-y-4">
              {flexibleFeedback && (
                <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-semibold flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <span>{flexibleFeedback}</span>
                </div>
              )}

              {/* Top Controls Row: Question Type Filter + Pick Method Switcher */}
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-slate-200">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs font-bold text-slate-700 mr-1 inline-flex items-center gap-1.5">
                    <ListChecks className="w-3.5 h-3.5 text-teal-600" />
                    <span>Dạng câu hỏi:</span>
                  </span>
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
                        className={`px-2.5 py-1.5 rounded-lg border text-xs font-semibold whitespace-nowrap inline-flex items-center gap-1.5 transition-colors ${
                          active
                            ? 'bg-teal-600 border-teal-600 text-white'
                            : 'bg-white border-slate-200 text-slate-700 hover:border-teal-300 hover:bg-teal-50/40'
                        }`}
                      >
                        <span>{opt.label}</span>
                        <span
                          className={`text-[11px] font-bold tabular-nums ${
                            active ? 'text-teal-100' : 'text-slate-500'
                          }`}
                        >
                          ({opt.count})
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Pick Method Segmented Switcher */}
                <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 border border-slate-200 shrink-0 self-start lg:self-auto">
                  <button
                    type="button"
                    onClick={() => {
                      setPickMethod('random');
                      setFlexibleFeedback(null);
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap inline-flex items-center gap-1.5 transition-colors ${
                      pickMethod === 'random'
                        ? 'bg-white text-teal-800 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Dices className="w-3.5 h-3.5" />
                    <span>Bốc theo mức độ từng bài</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPickMethod('manual');
                      setFlexibleFeedback(null);
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap inline-flex items-center gap-1.5 transition-colors ${
                      pickMethod === 'manual'
                        ? 'bg-white text-teal-800 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <CheckSquare className="w-3.5 h-3.5" />
                    <span>Chọn thủ công</span>
                  </button>
                </div>
              </div>

              {/* Bulk Quick Config Bar (only shown for per-lesson random configuration) */}
              {pickMethod === 'random' && (
                <div className="rounded-2xl border border-indigo-200 bg-indigo-50/50 p-4 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <h4 className="text-xs font-extrabold text-slate-900 flex items-center gap-1.5">
                        <Zap className="w-4 h-4 text-indigo-600 shrink-0" />
                        <span>Cấu hình nhanh hàng loạt cho tất cả bài đã chọn</span>
                      </h4>
                      <p className="text-[11px] text-slate-600 mt-0.5">
                        Nhập định mức câu hỏi mỗi bài rồi bấm áp dụng để điền nhanh cho toàn bộ bài học đang tích chọn.
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-xs font-semibold text-slate-700 whitespace-nowrap">
                      Mỗi bài lấy:
                    </span>
                    {LEVELS.map((lvl) => (
                      <label
                        key={lvl}
                        className="inline-flex items-center gap-1.5 bg-white px-2.5 py-1.5 rounded-xl border border-slate-200 text-xs"
                      >
                        <input
                          type="number"
                          min={0}
                          max={99}
                          value={bulkConfig[lvl]}
                          onChange={(e) => {
                            const n = Math.max(0, Math.floor(Number(e.target.value) || 0));
                            setBulkConfig((prev) => ({ ...prev, [lvl]: n }));
                          }}
                          aria-label={`Số câu ${LEVEL_TAG_LABELS[lvl]} mỗi bài`}
                          className="w-12 py-0.5 text-center font-extrabold text-indigo-800 tabular-nums border border-slate-200 rounded-lg bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                        <span className="font-bold text-slate-700 whitespace-nowrap">
                          câu {LEVEL_CODE_LABELS[lvl]}
                        </span>
                      </label>
                    ))}

                    <button
                      type="button"
                      onClick={handleApplyBulkConfig}
                      disabled={selectedLessonKeys.size === 0}
                      className="min-h-[36px] px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-45 text-white text-xs font-bold whitespace-nowrap inline-flex items-center gap-1.5 shadow-xs transition-colors"
                    >
                      <Zap className="w-3.5 h-3.5" />
                      <span>
                        Áp dụng cho tất cả bài đã chọn
                        {selectedLessonKeys.size > 0 ? ` (${selectedLessonKeys.size} bài)` : ''}
                      </span>
                    </button>
                  </div>
                </div>
              )}

              {/* Validation Error Summary Banner */}
              {pickMethod === 'random' && hasValidationErrors && (
                <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-300 text-rose-900 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                    <div className="space-y-0.5">
                      <p className="font-bold">
                        Cảnh báo: Có {flexibleValidationErrors.length} mức độ vượt quá số câu hiện có trong ngân hàng!
                      </p>
                      <p className="text-[11px] text-rose-800">
                        {flexibleValidationErrors
                          .slice(0, 3)
                          .map(
                            (e) =>
                              `${e.lessonLabel} (${LEVEL_CODE_LABELS[e.level]}: nhập ${e.requested} / hiện có ${e.available})`
                          )
                          .join(' · ')}
                        {flexibleValidationErrors.length > 3
                          ? ` và ${flexibleValidationErrors.length - 3} mục khác`
                          : ''}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleClampOverflowToMax}
                    className="px-3 py-1.5 rounded-lg bg-white hover:bg-rose-100 border border-rose-300 text-rose-800 text-xs font-bold whitespace-nowrap shrink-0 transition-colors"
                  >
                    Tự điều chỉnh về mức tối đa
                  </button>
                </div>
              )}

              {/* Expandable Lesson Accordion List */}
              <div className="border border-slate-200 rounded-2xl bg-white overflow-hidden">
                <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <BookOpen className="w-4 h-4 text-teal-600 shrink-0" />
                    <span className="text-xs font-extrabold text-slate-900">
                      Danh mục Bài học / Chủ đề (
                      {gradeFilter === 'all'
                        ? 'Tất cả khối'
                        : GRADE_LABELS[gradeFilter as keyof typeof GRADE_LABELS] || `Lớp ${gradeFilter}`}
                      )
                    </span>
                    <span className="text-xs font-semibold text-slate-500 tabular-nums">
                      · Đã chọn {selectedLessonKeys.size}/{flexibleLessonOptions.length} bài
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {flexibleLessonOptions.length > 5 && (
                      <div className="relative">
                        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          value={lessonSearchTerm}
                          onChange={(e) => setLessonSearchTerm(e.target.value)}
                          placeholder="Tìm bài học..."
                          className="w-44 pl-7 pr-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs focus:outline-none focus:ring-2 focus:ring-teal-500"
                        />
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={handleSelectAllLessons}
                      disabled={flexibleLessonOptions.length === 0}
                      className="px-2.5 py-1.5 rounded-lg bg-teal-50 hover:bg-teal-100 border border-teal-200 text-teal-800 text-xs font-bold whitespace-nowrap disabled:opacity-50 transition-colors"
                    >
                      Chọn tất cả
                    </button>
                    <button
                      type="button"
                      onClick={handleClearAllLessons}
                      disabled={selectedLessonKeys.size === 0}
                      className="px-2.5 py-1.5 rounded-lg bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-bold whitespace-nowrap disabled:opacity-50 transition-colors"
                    >
                      Bỏ chọn
                    </button>
                  </div>
                </div>

                <div className="p-3.5 space-y-2.5 max-h-[380px] overflow-y-auto bg-slate-50/40">
                  {isLoadingLessons ? (
                    <div className="py-8 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin text-teal-600" />
                      <span>Đang tải danh mục bài học chuẩn GDPT 2018...</span>
                    </div>
                  ) : visibleLessonOptions.length === 0 ? (
                    <div className="py-8 text-center text-xs text-slate-500">
                      Không tìm thấy bài học/chủ đề nào cho bộ lọc Môn học &amp; Khối lớp hiện tại.
                    </div>
                  ) : (
                    visibleLessonOptions.map((opt) => {
                      const isChecked = selectedLessonKeys.has(opt.key);
                      const cfg = lessonLevelConfigs[opt.key] || createEmptyLevelCounts();
                      const lessonSelectedSum = LEVELS.reduce((sum, l) => sum + (cfg[l] || 0), 0);
                      const lessonHasOverflow = LEVELS.some((lvl) =>
                        validationErrorCellSet.has(`${opt.key}::${lvl}`)
                      );

                      return (
                        <div
                          key={opt.key}
                          className={`rounded-xl border transition-colors ${
                            !isChecked
                              ? 'border-slate-200 bg-white hover:border-slate-300'
                              : lessonHasOverflow && pickMethod === 'random'
                              ? 'border-rose-400 bg-rose-50/30'
                              : 'border-teal-500 bg-white shadow-xs'
                          }`}
                        >
                          {/* Accordion Header Row */}
                          <div className="px-3.5 py-2.5 flex items-center justify-between gap-3">
                            <label className="flex items-start gap-2.5 min-w-0 flex-1 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => toggleLessonKey(opt.key)}
                                className="mt-0.5 w-4 h-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500 shrink-0 cursor-pointer"
                              />
                              <div className="min-w-0 flex-1">
                                <div className="text-xs font-bold text-slate-900 leading-snug break-words flex items-center gap-1.5">
                                  <span>{opt.label}</span>
                                </div>
                                <div className="text-[11px] text-slate-500 mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 tabular-nums">
                                  {opt.chapterName && (
                                    <>
                                      <span className="truncate max-w-[260px]">{opt.chapterName}</span>
                                      <span aria-hidden="true">·</span>
                                    </>
                                  )}
                                  <span>Hiện có: {opt.availableCount} câu</span>
                                  {isChecked && pickMethod === 'random' && (
                                    <>
                                      <span aria-hidden="true">·</span>
                                      <span
                                        className={
                                          lessonHasOverflow
                                            ? 'font-bold text-rose-700'
                                            : lessonSelectedSum > 0
                                            ? 'font-bold text-teal-700'
                                            : 'text-slate-500'
                                        }
                                      >
                                        Đang lấy: {lessonSelectedSum} câu
                                      </span>
                                    </>
                                  )}
                                </div>
                              </div>
                            </label>

                            <button
                              type="button"
                              onClick={() => toggleLessonKey(opt.key)}
                              aria-expanded={isChecked}
                              aria-label={isChecked ? `Thu gọn ${opt.label}` : `Mở rộng ${opt.label}`}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 shrink-0 transition-colors"
                            >
                              {isChecked ? (
                                <ChevronDown className="w-4 h-4 text-teal-600" />
                              ) : (
                                <ChevronRight className="w-4 h-4" />
                              )}
                            </button>
                          </div>

                          {/* Expanded Per-Lesson Cognitive Level Inputs (when checked & in random config mode) */}
                          {isChecked && pickMethod === 'random' && (
                            <div className="px-3.5 pb-3.5 pt-2.5 border-t border-slate-100 bg-slate-50/70 space-y-3 rounded-b-xl">
                              {/* Quick actions row at top of lesson card */}
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <span className="text-[11px] font-semibold text-slate-600">
                                  Phân bổ câu hỏi theo 4 mức độ nhận thức:
                                </span>
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <button
                                    type="button"
                                    disabled={opt.availableCount === 0}
                                    onClick={() => handleSelectAllLevelsForLesson(opt)}
                                    className="px-2.5 py-1 rounded-lg bg-teal-50 hover:bg-teal-100 border border-teal-200 text-teal-800 text-[11px] font-bold whitespace-nowrap disabled:opacity-40 transition-colors"
                                  >
                                    Chọn tất cả mức độ
                                  </button>
                                  <button
                                    type="button"
                                    disabled={opt.availableCount === 0}
                                    onClick={() => handleAutoDistributeLesson(opt)}
                                    className="px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-800 text-[11px] font-bold whitespace-nowrap inline-flex items-center gap-1 disabled:opacity-40 transition-colors"
                                  >
                                    <Scale className="w-3 h-3" />
                                    <span>Tự động phân bổ đều</span>
                                  </button>
                                  {lessonSelectedSum > 0 && (
                                    <button
                                      type="button"
                                      onClick={() => handleResetLessonCounts(opt.key)}
                                      className="px-2 py-1 rounded-lg bg-white hover:bg-slate-100 border border-slate-200 text-slate-600 text-[11px] font-semibold whitespace-nowrap transition-colors"
                                    >
                                      Đặt về 0
                                    </button>
                                  )}
                                </div>
                              </div>

                              {/* 4 Cognitive Level Inputs Grid */}
                              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                                {LEVELS.map((lvl) => {
                                  const avail = opt.levelAvailable[lvl] || 0;
                                  const val = cfg[lvl] || 0;
                                  const isOverflow = val > avail;

                                  return (
                                    <div
                                      key={lvl}
                                      className={`p-2.5 rounded-xl border transition-colors ${
                                        isOverflow
                                          ? 'border-rose-400 bg-rose-50'
                                          : val > 0
                                          ? 'border-teal-300 bg-white'
                                          : 'border-slate-200 bg-white'
                                      }`}
                                    >
                                      <div className="flex items-center justify-between gap-1 mb-1.5">
                                        <span className="text-[11px] font-bold text-slate-800">
                                          {LEVEL_TAG_LABELS[lvl]} ({LEVEL_CODE_LABELS[lvl]})
                                        </span>
                                      </div>

                                      <div className="flex items-center gap-2">
                                        <input
                                          type="number"
                                          min={0}
                                          max={Math.max(avail, val)}
                                          value={val}
                                          onChange={(e) =>
                                            handleUpdateLessonLevelCount(opt.key, lvl, e.target.value)
                                          }
                                          aria-label={`${opt.label} - ${LEVEL_TAG_LABELS[lvl]}`}
                                          className={`w-16 min-h-[34px] px-2 py-1 rounded-lg border text-center text-xs font-extrabold tabular-nums focus:outline-none focus:ring-2 ${
                                            isOverflow
                                              ? 'border-rose-500 bg-white text-rose-800 focus:ring-rose-500'
                                              : 'border-slate-300 bg-slate-50 focus:bg-white text-slate-900 focus:ring-teal-500'
                                          }`}
                                        />
                                        <span
                                          className={`text-[11px] tabular-nums leading-tight ${
                                            isOverflow
                                              ? 'text-rose-700 font-bold'
                                              : avail === 0
                                              ? 'text-slate-400'
                                              : 'text-slate-600'
                                          }`}
                                        >
                                          / (Hiện có: <strong>{avail}</strong> câu)
                                        </span>
                                      </div>

                                      {isOverflow && (
                                        <div className="mt-1.5 flex items-center gap-1 text-[11px] font-bold text-rose-700">
                                          <AlertTriangle className="w-3 h-3 shrink-0" />
                                          <span>Vượt quá ngân hàng ({avail})</span>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Manual Pick Question List (when teacher switches to "Chọn thủ công") */}
              {pickMethod === 'manual' && (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="relative flex-1 min-w-[220px]">
                      <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        value={manualSearchTerm}
                        onChange={(e) => setManualSearchTerm(e.target.value)}
                        placeholder="Tìm kiếm nhanh trong các bài học đã chọn (nội dung, mã câu)..."
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

                  {selectedLessonKeys.size === 0 ? (
                    <div className="py-8 text-center text-xs text-slate-500 border border-dashed border-slate-200 rounded-2xl">
                      Hãy tích chọn ít nhất 1 bài học ở danh sách phía trên để xem và chọn thủ công câu hỏi.
                    </div>
                  ) : manualDisplayedQuestions.length === 0 ? (
                    <div className="py-8 text-center text-xs text-slate-500 border border-dashed border-slate-200 rounded-2xl">
                      Không có câu hỏi nào khớp với bài học và dạng câu hỏi hiện tại.
                    </div>
                  ) : (
                    <div className="space-y-2.5 max-h-[320px] overflow-y-auto pr-1">
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
                                  <span className="text-slate-300">·</span>
                                  <span className="font-semibold text-indigo-700">
                                    {LEVEL_TAG_LABELS[q.level]}
                                  </span>
                                  {isAlreadyInExam && (
                                    <>
                                      <span className="text-slate-300">·</span>
                                      <span className="font-bold text-amber-700">
                                        Đã có trong đề
                                      </span>
                                    </>
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
          <div className="space-y-0.5 min-w-0">
            {activeTab === 'matrix' ? (
              <span className="text-xs font-semibold text-slate-700 tabular-nums">
                Tổng ma trận sẽ bốc: <strong className="text-indigo-700">{totalMatrixRequested}</strong> câu
              </span>
            ) : pickMethod === 'random' ? (
              <>
                <div className="text-xs font-bold text-slate-900 tabular-nums">
                  Tổng số câu chọn:{' '}
                  <span className={hasValidationErrors ? 'text-rose-700' : 'text-teal-700'}>
                    {flexibleTotals.total} câu
                  </span>{' '}
                  <span className="font-semibold text-slate-600">
                    (NB: {flexibleTotals.nhan_biet} · TH: {flexibleTotals.thong_hieu} · VD:{' '}
                    {flexibleTotals.van_dung} · VDC: {flexibleTotals.van_dung_cao})
                  </span>
                </div>
                {hasValidationErrors && (
                  <div className="text-[11px] font-bold text-rose-700 flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    <span>
                      Số câu nhập vượt quá ngân hàng ở {flexibleValidationErrors.length} mục — vui lòng giảm số lượng để mở khóa nút bốc câu hỏi.
                    </span>
                  </div>
                )}
              </>
            ) : (
              <span className="text-xs font-semibold text-slate-700 tabular-nums">
                Phù hợp: {flexibleAvailablePool.length} câu · Đã chọn thủ công:{' '}
                <strong className="text-teal-700">{manualSelectedInMatched.length}</strong> câu
              </span>
            )}
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[40px] px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold whitespace-nowrap"
            >
              Đóng
            </button>

            {activeTab === 'matrix' ? (
              <button
                type="button"
                disabled={totalMatrixRequested === 0}
                onClick={handleConfirmMatrix}
                className="min-h-[40px] px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold whitespace-nowrap inline-flex items-center gap-1.5 shadow-xs"
              >
                <Sparkles className="w-4 h-4" />
                <span>Bốc ngẫu nhiên theo ma trận ({totalMatrixRequested} câu)</span>
              </button>
            ) : pickMethod === 'random' ? (
              <button
                type="button"
                disabled={flexibleTotals.total === 0 || hasValidationErrors}
                onClick={handleConfirmFlexibleRandom}
                className="min-h-[40px] px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 disabled:opacity-45 disabled:cursor-not-allowed text-white text-xs font-bold whitespace-nowrap inline-flex items-center gap-1.5 shadow-xs"
              >
                <Dices className="w-4 h-4" />
                <span>
                  Bốc ngẫu nhiên vào đề
                  {flexibleTotals.total > 0 ? ` (${flexibleTotals.total} câu)` : ''}
                </span>
              </button>
            ) : (
              <button
                type="button"
                disabled={manualSelectedInMatched.length === 0}
                onClick={handleConfirmFlexibleManual}
                className="min-h-[40px] px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-xs font-bold whitespace-nowrap inline-flex items-center gap-1.5 shadow-xs"
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
