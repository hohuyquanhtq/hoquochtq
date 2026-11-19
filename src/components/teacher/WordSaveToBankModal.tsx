import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  CheckSquare,
  ChevronDown,
  ChevronUp,
  Database,
  FileText,
  Layers,
  Loader2,
  RefreshCw,
  Save,
  ShieldAlert,
  SlidersHorizontal,
  Square,
  X,
  XCircle,
} from 'lucide-react';
import {
  ChemGrade,
  CognitiveLevel,
  CurriculumLesson,
  Question,
  QuestionType,
  SubjectItem,
} from '../../types';
import {
  COGNITIVE_LEVEL_LABELS,
  COGNITIVE_LEVEL_SHORT_LABELS,
  DEFAULT_GDPT_2018_SUBJECTS,
  DEFAULT_SUBJECT_ID,
  DEFAULT_SUBJECT_NAME,
  PRIMARY_QUESTION_TYPES,
  QUESTION_TYPE_LABELS,
  QUESTION_TYPE_SHORT_LABELS,
  resolveQuestionDifficulty,
  resolveQuestionSubject,
  resolveQuestionType,
} from '../../constants/subjects';
import { auth } from '../../services/firebase';
import {
  createNewQuestionInFirestoreStrict,
  fetchTeacherQuestionsFromFirestore,
} from '../../services/workspaceService';
import { fetchCurriculumConfigFromFirestore } from '../../services/curriculumService';
import {
  CurriculumCascadeSelector,
  CurriculumSelectionValue,
} from './CurriculumCascadeSelector';
import {
  detectWordDuplicateQuestions,
  DuplicateMatchInfo,
  PerQuestionClassification,
  persistWordQuestionsToBank,
  WordBankClassificationInput,
  WordBankSaveResult,
} from '../../utils/wordQuestionBankSaver';
import { ChemRenderer } from '../../utils/chemRenderer';

export interface WordSaveToBankModalProps {
  isOpen: boolean;
  questionsToSave: Question[];
  existingBankQuestions: Question[];
  subjects: SubjectItem[];
  defaultGrade: ChemGrade;
  defaultSubjectId?: string;
  defaultQuestionType?: QuestionType;
  defaultDifficulty?: CognitiveLevel;
  sourceFileName?: string;
  currentUserId?: string;
  onClose: () => void;
  onQuestionsPersisted: (
    savedQuestions: Question[],
    refreshedBank?: Question[],
    savedSourceIds?: string[]
  ) => void;
  onNavigateToQuestionBank: () => void;
  onReviewUnsavedQuestions?: (unsavedQuestionIds: string[]) => void;
}

const PROGRESS_WIDTH_CLASSES = [
  'w-0',
  'w-[10%]',
  'w-[20%]',
  'w-[30%]',
  'w-[40%]',
  'w-[50%]',
  'w-[60%]',
  'w-[70%]',
  'w-[80%]',
  'w-[90%]',
  'w-full',
];

function getProgressWidthClass(done: number, total: number): string {
  if (total <= 0) return 'w-0';
  const bucket = Math.min(10, Math.max(0, Math.round((done / total) * 10)));
  return PROGRESS_WIDTH_CLASSES[bucket] || 'w-0';
}

function formatDefaultSourceLabel(fileName?: string): string {
  if (!fileName) return 'Import từ Word/PDF';
  if (/\.pdf$/i.test(fileName)) return `Import từ PDF: ${fileName}`;
  return `Import từ Word: ${fileName}`;
}

function buildInitialPerQuestionMeta(
  questions: Question[],
  subjects: SubjectItem[],
  defaultGrade: ChemGrade
): Record<string, CurriculumSelectionValue> {
  const map: Record<string, CurriculumSelectionValue> = {};
  const fallbackGrade: ChemGrade =
    defaultGrade === '10' || defaultGrade === '11' || defaultGrade === '12' ? defaultGrade : '12';

  for (const q of questions) {
    const resolvedSub = resolveQuestionSubject(q, subjects);
    const resolvedGrade: ChemGrade =
      q.grade === '10' || q.grade === '11' || q.grade === '12' || q.grade === 'chuyen_hsg'
        ? q.grade
        : fallbackGrade;
    map[q.id] = {
      subjectId: q.subjectId || resolvedSub.id,
      subjectName: q.subjectName || resolvedSub.name,
      grade: resolvedGrade,
      textbookSeries: q.textbookSeries || '',
      chapterId: q.chapterId || '',
      chapterName: q.chapterName || '',
      lessonId: q.lessonId || '',
      lessonName: q.lessonName || q.lessonTopic || '',
    };
  }
  return map;
}

export const WordSaveToBankModal: React.FC<WordSaveToBankModalProps> = ({
  isOpen,
  questionsToSave,
  existingBankQuestions,
  subjects = DEFAULT_GDPT_2018_SUBJECTS,
  defaultGrade,
  defaultSubjectId,
  defaultQuestionType,
  defaultDifficulty,
  sourceFileName,
  currentUserId,
  onClose,
  onQuestionsPersisted,
  onNavigateToQuestionBank,
  onReviewUnsavedQuestions,
}) => {
  const initialSubject = useMemo(() => {
    const firstWithSub = questionsToSave.find((q) => q.subjectId);
    if (firstWithSub?.subjectId) {
      const matched = subjects.find((s) => s.id === firstWithSub.subjectId);
      if (matched) return matched;
    }
    if (defaultSubjectId) {
      const matchedDefault = subjects.find((s) => s.id === defaultSubjectId);
      if (matchedDefault) return matchedDefault;
    }
    return (
      subjects.find((s) => s.id === DEFAULT_SUBJECT_ID) ||
      subjects[0] || {
        id: DEFAULT_SUBJECT_ID,
        name: DEFAULT_SUBJECT_NAME,
      }
    );
  }, [questionsToSave, subjects, defaultSubjectId]);

  const initialGrade: ChemGrade = useMemo(() => {
    const firstGrade = questionsToSave[0]?.grade;
    if (firstGrade === '10' || firstGrade === '11' || firstGrade === '12') {
      return firstGrade;
    }
    return defaultGrade === '10' || defaultGrade === '11' || defaultGrade === '12'
      ? defaultGrade
      : '12';
  }, [questionsToSave, defaultGrade]);

  // Primary configuration option: apply batch metadata to all questions (default: true)
  const [applyToAll, setApplyToAll] = useState<boolean>(true);

  // Batch classification state (used when applyToAll === true)
  const [curriculumValue, setCurriculumValue] = useState<CurriculumSelectionValue>(() => ({
    subjectId: initialSubject.id,
    subjectName: initialSubject.name,
    grade: initialGrade,
    textbookSeries: '',
    chapterId: questionsToSave[0]?.chapterId || '',
    chapterName: questionsToSave[0]?.chapterName || '',
    lessonId: questionsToSave[0]?.lessonId || '',
    lessonName: questionsToSave[0]?.lessonName || '',
  }));

  // Per-question classification state (used when applyToAll === false)
  const [perQuestionMeta, setPerQuestionMeta] = useState<Record<string, CurriculumSelectionValue>>(
    () => buildInitialPerQuestionMeta(questionsToSave, subjects, defaultGrade)
  );
  // Individual per-question Question Type & Difficulty overrides (honored in BOTH batch & individual modes)
  const [perQuestionTypeLevel, setPerQuestionTypeLevel] = useState<
    Record<string, { questionType?: QuestionType; difficulty?: CognitiveLevel }>
  >({});
  const [expandedQuestionId, setExpandedQuestionId] = useState<string | null>(null);

  const [loadedLessons, setLoadedLessons] = useState<CurriculumLesson[]>([]);
  const [isCatalogLoading, setIsCatalogLoading] = useState<boolean>(false);
  const [schoolTextbookSeries, setSchoolTextbookSeries] = useState<string>('');
  const [showAdvancedOptions, setShowAdvancedOptions] = useState<boolean>(false);
  // Question Type is ALWAYS placed BEFORE Difficulty; default mode keeps auto-detected per-question types
  const [typeMode, setTypeMode] = useState<'keep_per_question' | 'apply_all'>('keep_per_question');
  const [defaultType, setDefaultType] = useState<QuestionType>(
    defaultQuestionType || 'part1_single_choice'
  );
  const [levelMode, setLevelMode] = useState<'keep_per_question' | 'apply_all'>('keep_per_question');
  const [defaultLevel, setDefaultLevel] = useState<CognitiveLevel>(
    defaultDifficulty || 'nhan_biet'
  );
  const [sourceLabel, setSourceLabel] = useState<string>(() =>
    formatDefaultSourceLabel(sourceFileName)
  );
  const [skipDuplicates, setSkipDuplicates] = useState<boolean>(true);

  // Per-question inclusion inside confirmation modal
  const [checkedIds, setCheckedIds] = useState<Set<string>>(
    () => new Set(questionsToSave.map((q) => q.id))
  );
  const [showCandidateList, setShowCandidateList] = useState<boolean>(false);
  const [showDuplicatePreview, setShowDuplicatePreview] = useState<boolean>(false);

  // Live Firestore bank sync for accurate pre-save duplicate checking
  const [liveBankQuestions, setLiveBankQuestions] = useState<Question[]>(existingBankQuestions);
  const [isCheckingDuplicates, setIsCheckingDuplicates] = useState<boolean>(false);
  const [checkError, setCheckError] = useState<string | null>(null);

  // Save execution & result state + synchronous ref lock to prevent rapid double-click duplicates
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const saveInFlightRef = useRef<boolean>(false);
  const [progress, setProgress] = useState<{ done: number; total: number; currentCode: string }>({
    done: 0,
    total: 0,
    currentCode: '',
  });
  const [validationError, setValidationError] = useState<string | null>(null);
  const [saveResult, setSaveResult] = useState<WordBankSaveResult | null>(null);

  // Reset modal state whenever opened with new selection
  useEffect(() => {
    if (!isOpen) return;
    setApplyToAll(true);
    setExpandedQuestionId(null);
    setShowAdvancedOptions(false);
    setTypeMode('keep_per_question');
    setDefaultType(defaultQuestionType || 'part1_single_choice');
    setLevelMode('keep_per_question');
    setDefaultLevel(defaultDifficulty || 'nhan_biet');
    setPerQuestionTypeLevel({});
    setCheckedIds(new Set(questionsToSave.map((q) => q.id)));
    setSaveResult(null);
    setValidationError(null);
    setCheckError(null);
    setIsSaving(false);
    saveInFlightRef.current = false;
    setProgress({ done: 0, total: 0, currentCode: '' });
    setSourceLabel(formatDefaultSourceLabel(sourceFileName));

    setCurriculumValue({
      subjectId: initialSubject.id,
      subjectName: initialSubject.name,
      grade: initialGrade,
      textbookSeries: questionsToSave[0]?.textbookSeries || '',
      chapterId: questionsToSave[0]?.chapterId || '',
      chapterName: questionsToSave[0]?.chapterName || '',
      lessonId: questionsToSave[0]?.lessonId || '',
      lessonName: questionsToSave[0]?.lessonName || '',
    });

    setPerQuestionMeta(buildInitialPerQuestionMeta(questionsToSave, subjects, defaultGrade));

    let active = true;
    void fetchCurriculumConfigFromFirestore().then((cfg) => {
      if (active && cfg?.textbookSeries) {
        setSchoolTextbookSeries(cfg.textbookSeries);
        setCurriculumValue((prev) => ({
          ...prev,
          textbookSeries: prev.textbookSeries || cfg.textbookSeries,
        }));
      }
    });

    // Pull latest questions directly from Firestore so duplicate detection is authoritative
    const uid = auth.currentUser?.uid || currentUserId;
    if (uid && auth.currentUser) {
      setIsCheckingDuplicates(true);
      void fetchTeacherQuestionsFromFirestore(uid)
        .then((fresh) => {
          if (active) setLiveBankQuestions(fresh);
        })
        .catch((err) => {
          if (active) {
            setLiveBankQuestions(existingBankQuestions);
            setCheckError(
              err instanceof Error
                ? err.message
                : 'Không thể tải danh sách câu hỏi mới nhất từ Firestore để kiểm tra trùng.'
            );
          }
        })
        .finally(() => {
          if (active) setIsCheckingDuplicates(false);
        });
    } else {
      setLiveBankQuestions(existingBankQuestions);
    }

    return () => {
      active = false;
    };
  }, [
    isOpen,
    questionsToSave,
    sourceFileName,
    initialSubject,
    initialGrade,
    currentUserId,
    existingBankQuestions,
    subjects,
    defaultGrade,
    defaultQuestionType,
    defaultDifficulty,
  ]);

  const activeCandidates = useMemo(
    () => questionsToSave.filter((q) => checkedIds.has(q.id)),
    [questionsToSave, checkedIds]
  );

  const duplicateMap: Map<string, DuplicateMatchInfo> = useMemo(
    () => detectWordDuplicateQuestions(activeCandidates, liveBankQuestions),
    [activeCandidates, liveBankQuestions]
  );

  const duplicateCandidates = useMemo(
    () => activeCandidates.filter((q) => duplicateMap.get(q.id)?.isDuplicate),
    [activeCandidates, duplicateMap]
  );

  const netNewCount = activeCandidates.length - duplicateCandidates.length;

  // Compute strict validity state for the Confirm button
  const formValidationStatus = useMemo((): { valid: boolean; reason: string | null } => {
    if (activeCandidates.length === 0) {
      return {
        valid: false,
        reason: 'Vui lòng chọn ít nhất 1 câu hỏi để lưu vào ngân hàng.',
      };
    }

    if (applyToAll) {
      if (!curriculumValue.subjectId) {
        return { valid: false, reason: 'Vui lòng chọn Môn học.' };
      }
      if (
        curriculumValue.grade !== '10' &&
        curriculumValue.grade !== '11' &&
        curriculumValue.grade !== '12'
      ) {
        return { valid: false, reason: 'Vui lòng chọn Khối lớp (Lớp 10, 11 hoặc 12).' };
      }
      if (isCatalogLoading) {
        return {
          valid: false,
          reason: 'Đang tải danh mục chương và bài học từ Firestore...',
        };
      }
      if (loadedLessons.length > 0) {
        if (!curriculumValue.chapterId) {
          return { valid: false, reason: 'Vui lòng chọn Chương / Chủ đề.' };
        }
        if (!curriculumValue.lessonId) {
          return { valid: false, reason: 'Vui lòng chọn Bài học thuộc chương đã chọn.' };
        }
        const belongsToChapter = loadedLessons.some(
          (l) =>
            l.chapterId === curriculumValue.chapterId &&
            (l.lessonId === curriculumValue.lessonId || l.id === curriculumValue.lessonId)
        );
        if (!belongsToChapter) {
          return {
            valid: false,
            reason: 'Bài học đang chọn không thuộc Chương / Chủ đề hiện tại. Vui lòng chọn lại.',
          };
        }
      }
      return { valid: true, reason: null };
    }

    // Per-question mode: verify each selected question has a valid subject & grade
    for (let idx = 0; idx < activeCandidates.length; idx++) {
      const q = activeCandidates[idx];
      const meta = perQuestionMeta[q.id];
      const subId = meta?.subjectId || q.subjectId;
      const grade = meta?.grade || q.grade;
      if (!subId) {
        return {
          valid: false,
          reason: `Câu ${q.code || idx + 1} chưa có Môn học. Vui lòng cấu hình riêng cho câu này.`,
        };
      }
      if (!grade) {
        return {
          valid: false,
          reason: `Câu ${q.code || idx + 1} chưa có Khối lớp. Vui lòng cấu hình riêng cho câu này.`,
        };
      }
    }

    return { valid: true, reason: null };
  }, [
    activeCandidates,
    applyToAll,
    curriculumValue,
    isCatalogLoading,
    loadedLessons,
    perQuestionMeta,
  ]);

  const toggleCandidate = (id: string) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handlePerQuestionMetaChange = (qId: string, nextVal: CurriculumSelectionValue) => {
    setPerQuestionMeta((prev) => ({
      ...prev,
      [qId]: nextVal,
    }));
  };

  const getEffectiveQuestionType = (q: Question): QuestionType => {
    const override = perQuestionTypeLevel[q.id]?.questionType;
    if (override) return override;
    if (typeMode === 'apply_all') return defaultType;
    const base = resolveQuestionType(q);
    return base === 'part1_multiple_choice' ? 'part1_single_choice' : base;
  };

  const getEffectiveQuestionDifficulty = (q: Question): CognitiveLevel => {
    const override = perQuestionTypeLevel[q.id]?.difficulty;
    if (override) return override;
    if (levelMode === 'apply_all') return defaultLevel;
    return resolveQuestionDifficulty(q);
  };

  const handlePerQuestionTypeChange = (qId: string, nextType: QuestionType) => {
    setPerQuestionTypeLevel((prev) => ({
      ...prev,
      [qId]: { ...prev[qId], questionType: nextType },
    }));
  };

  const handlePerQuestionDifficultyChange = (qId: string, nextDiff: CognitiveLevel) => {
    setPerQuestionTypeLevel((prev) => ({
      ...prev,
      [qId]: { ...prev[qId], difficulty: nextDiff },
    }));
  };

  const handleConfirmSave = async () => {
    // Synchronous re-entrancy lock so rapid repeated clicks NEVER duplicate Firestore writes
    if (saveInFlightRef.current || isSaving) return;
    setValidationError(null);

    if (!formValidationStatus.valid) {
      setValidationError(
        formValidationStatus.reason || 'Vui lòng điền đầy đủ thông tin phân loại bắt buộc.'
      );
      return;
    }

    const uid = auth.currentUser?.uid || '';
    if (!uid) {
      setValidationError(
        'Chưa phát hiện phiên đăng nhập Firebase Authentication hợp lệ. Vui lòng đăng nhập lại rồi thử lưu.'
      );
      return;
    }

    saveInFlightRef.current = true;
    setIsSaving(true);
    setProgress({ done: 0, total: activeCandidates.length, currentCode: '' });

    // Build per-question metadata map (merging individual questionType/difficulty overrides in BOTH modes)
    const perQuestionEntries: Array<[string, Partial<PerQuestionClassification>]> = [];
    for (const q of activeCandidates) {
      const m = perQuestionMeta[q.id];
      const tlOverride = perQuestionTypeLevel[q.id];
      if (!applyToAll) {
        perQuestionEntries.push([
          q.id,
          {
            subjectId: m?.subjectId || q.subjectId || DEFAULT_SUBJECT_ID,
            subjectName: m?.subjectName || q.subjectName || DEFAULT_SUBJECT_NAME,
            grade: (m?.grade || q.grade || '12') as ChemGrade,
            textbookSeries: m?.textbookSeries || q.textbookSeries || undefined,
            chapterId: m?.chapterId || undefined,
            chapterName: m?.chapterName || undefined,
            lessonId: m?.lessonId || undefined,
            lessonName: m?.lessonName || undefined,
            ...(tlOverride?.questionType ? { questionType: tlOverride.questionType } : {}),
            ...(tlOverride?.difficulty ? { difficulty: tlOverride.difficulty } : {}),
          },
        ]);
      } else if (tlOverride?.questionType || tlOverride?.difficulty) {
        perQuestionEntries.push([
          q.id,
          {
            ...(tlOverride.questionType ? { questionType: tlOverride.questionType } : {}),
            ...(tlOverride.difficulty ? { difficulty: tlOverride.difficulty } : {}),
          },
        ]);
      }
    }
    const perQuestionPayload: Record<string, Partial<PerQuestionClassification>> | undefined =
      perQuestionEntries.length > 0 ? Object.fromEntries(perQuestionEntries) : undefined;

    const classification: WordBankClassificationInput = {
      applyToAll,
      subjectId: curriculumValue.subjectId || DEFAULT_SUBJECT_ID,
      subjectName: curriculumValue.subjectName || DEFAULT_SUBJECT_NAME,
      grade: (curriculumValue.grade || initialGrade) as ChemGrade,
      textbookSeries: curriculumValue.textbookSeries || schoolTextbookSeries || undefined,
      chapterId: curriculumValue.chapterId || undefined,
      chapterName: curriculumValue.chapterName || undefined,
      lessonId: curriculumValue.lessonId || undefined,
      lessonName: curriculumValue.lessonName || undefined,
      perQuestionMetadata: perQuestionPayload,
      levelMode,
      defaultLevel,
      typeMode,
      defaultType,
      sourceLabel: sourceLabel.trim() || formatDefaultSourceLabel(sourceFileName),
      skipDuplicates,
    };

    try {
      const result = await persistWordQuestionsToBank({
        selectedQuestions: activeCandidates,
        classification,
        adapter: {
          getCurrentUid: () => auth.currentUser?.uid || null,
          fetchExistingTeacherQuestions: (teacherUid) =>
            fetchTeacherQuestionsFromFirestore(teacherUid),
          createQuestion: (q, ownerId) => createNewQuestionInFirestoreStrict(q, ownerId),
        },
        onProgress: (done, total, currentCode) => {
          setProgress({ done, total, currentCode });
        },
      });

      setSaveResult(result);

      if (result.savedQuestions.length > 0) {
        // Re-fetch real persisted documents from Firestore to keep local state 100% in sync
        let refreshed: Question[] | undefined;
        try {
          refreshed = await fetchTeacherQuestionsFromFirestore(uid);
          setLiveBankQuestions(refreshed);
        } catch {
          // Parent will merge savedQuestions cleanly
        }
        onQuestionsPersisted(result.savedQuestions, refreshed, result.savedSourceIds);
      }
    } catch (err) {
      setValidationError(
        err instanceof Error
          ? err.message
          : 'Đã xảy ra lỗi không mong muốn khi ghi dữ liệu vào Firestore.'
      );
    } finally {
      saveInFlightRef.current = false;
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  const unsavedIds = saveResult
    ? [
        ...saveResult.skippedDuplicates.map((s) => s.question.id),
        ...saveResult.failedItems.map((f) => f.question.id),
      ]
    : [];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="word-save-bank-modal-title"
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/65 backdrop-blur-xs flex items-center justify-center p-4"
    >
      <div className="bg-white w-full max-w-3xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-teal-600/20 border border-teal-400/40 flex items-center justify-center text-teal-300 shrink-0">
              <Database className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 id="word-save-bank-modal-title" className="font-bold text-base tracking-tight truncate">
                {saveResult
                  ? 'KẾT QUẢ LƯU VÀO NGÂN HÀNG CÂU HỎI'
                  : 'CẤU HÌNH LƯU VÀO NGÂN HÀNG CÂU HỎI'}
              </h3>
              <p className="text-xs text-slate-300 truncate">
                {saveResult
                  ? `Collection Firestore: /questions · Đã xử lý ${saveResult.totalSelected} câu hỏi`
                  : `Chuẩn bị lưu ${activeCandidates.length} / ${questionsToSave.length} câu hỏi sau khi bạn xác nhận`}
              </p>
            </div>
          </div>

          <button
            type="button"
            disabled={isSaving}
            onClick={onClose}
            aria-label="Đóng hộp thoại"
            className="p-2 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 disabled:opacity-40"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-5">
          {/* VIEW 1: RESULT SUMMARY */}
          {saveResult ? (
            <div className="space-y-5">
              {/* Top status banner */}
              <div
                className={`p-4 rounded-2xl border flex items-start gap-3 ${
                  saveResult.failedItems.length > 0 && saveResult.savedQuestions.length === 0
                    ? 'bg-rose-50 border-rose-200 text-rose-900'
                    : saveResult.failedItems.length > 0 || saveResult.skippedDuplicates.length > 0
                    ? 'bg-amber-50 border-amber-200 text-amber-900'
                    : 'bg-emerald-50 border-emerald-200 text-emerald-900'
                }`}
              >
                {saveResult.failedItems.length > 0 && saveResult.savedQuestions.length === 0 ? (
                  <XCircle className="w-6 h-6 text-rose-600 shrink-0 mt-0.5" />
                ) : saveResult.failedItems.length > 0 ? (
                  <AlertTriangle className="w-6 h-6 text-amber-600 shrink-0 mt-0.5" />
                ) : (
                  <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0 mt-0.5" />
                )}
                <div className="space-y-1">
                  <p className="text-base font-bold">
                    {saveResult.savedQuestions.length > 0 && saveResult.failedItems.length === 0
                      ? `Đã lưu thành công ${saveResult.savedQuestions.length} câu hỏi vào Ngân hàng!`
                      : saveResult.savedQuestions.length > 0 && saveResult.failedItems.length > 0
                      ? `Lưu một phần: ${saveResult.savedQuestions.length} câu thành công, ${saveResult.failedItems.length} câu thất bại.`
                      : saveResult.failedItems.length > 0
                      ? 'Không lưu được câu hỏi vào Firestore — vui lòng kiểm tra chi tiết lỗi bên dưới.'
                      : 'Tất cả câu hỏi được chọn đều đã tồn tại trong Ngân hàng câu hỏi.'}
                  </p>
                  <p className="text-xs opacity-90">
                    Dữ liệu lưu thành công đã được ghi trực tiếp vào collection{' '}
                    <code className="font-mono font-semibold">/questions</code> gắn với tài khoản giáo viên hiện tại và giữ nguyên dữ liệu gốc của lượt bóc tách.
                  </p>
                </div>
              </div>

              {/* 4 KPI Result Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 tabular-nums">
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                  <p className="text-xs font-semibold text-slate-600">Tổng số câu được chọn</p>
                  <p className="text-2xl font-bold text-slate-900 mt-1">
                    {saveResult.totalSelected}
                  </p>
                </div>
                <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200">
                  <p className="text-xs font-semibold text-emerald-800">Lưu thành công</p>
                  <p className="text-2xl font-bold text-emerald-700 mt-1">
                    {saveResult.savedQuestions.length}
                  </p>
                </div>
                <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200">
                  <p className="text-xs font-semibold text-amber-800">Bỏ qua do trùng</p>
                  <p className="text-2xl font-bold text-amber-700 mt-1">
                    {saveResult.skippedDuplicates.length}
                  </p>
                </div>
                <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200">
                  <p className="text-xs font-semibold text-rose-800">Lưu thất bại</p>
                  <p className="text-2xl font-bold text-rose-700 mt-1">
                    {saveResult.failedItems.length}
                  </p>
                </div>
              </div>

              {/* Failed items details */}
              {saveResult.failedItems.length > 0 && (
                <div className="rounded-xl border border-rose-200 bg-rose-50/60 overflow-hidden">
                  <div className="px-4 py-2.5 bg-rose-100/80 border-b border-rose-200 flex items-center gap-2 text-xs font-bold text-rose-900">
                    <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />
                    <span>Chi tiết {saveResult.failedItems.length} câu lưu thất bại</span>
                  </div>
                  <div className="divide-y divide-rose-200/70 max-h-52 overflow-y-auto">
                    {saveResult.failedItems.map((item, idx) => (
                      <div key={`${item.question.id}_${idx}`} className="p-3 text-xs space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold text-slate-900 font-mono">
                            {item.question.code}
                          </span>
                          <span className="text-[11px] font-semibold text-rose-700">Thất bại</span>
                        </div>
                        <p className="text-slate-700 line-clamp-2">{item.question.content}</p>
                        <p className="text-rose-800 font-semibold">Lỗi: {item.error}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Skipped duplicates details */}
              {saveResult.skippedDuplicates.length > 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50/50 overflow-hidden">
                  <div className="px-4 py-2.5 bg-amber-100/70 border-b border-amber-200 flex items-center gap-2 text-xs font-bold text-amber-900">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>
                      {saveResult.skippedDuplicates.length} câu hỏi bị bỏ qua do đã tồn tại (không ghi đè câu cũ)
                    </span>
                  </div>
                  <div className="divide-y divide-amber-200/60 max-h-52 overflow-y-auto">
                    {saveResult.skippedDuplicates.map((item, idx) => (
                      <div key={`${item.question.id}_${idx}`} className="p-3 text-xs space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold text-slate-900 font-mono">
                            {item.question.code}
                          </span>
                          {item.matchedQuestionCode && (
                            <span className="text-[11px] font-semibold text-amber-800">
                              Trùng mã: {item.matchedQuestionCode}
                            </span>
                          )}
                        </div>
                        <p className="text-slate-700 line-clamp-2">{item.question.content}</p>
                        <p className="text-amber-900">{item.reason}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Saved summary confirmation */}
              {saveResult.savedQuestions.length > 0 && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-3.5 text-xs text-emerald-900 space-y-1.5">
                  <p className="font-bold flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>
                      Đã ghi thành công {saveResult.savedQuestions.length} câu hỏi mới vào Ngân hàng của bạn
                    </span>
                  </p>
                  {applyToAll ? (
                    <p className="text-emerald-800">
                      Phân loại áp dụng: <strong>{curriculumValue.subjectName}</strong> · Lớp{' '}
                      <strong>{curriculumValue.grade}</strong>
                      {curriculumValue.chapterName ? ` · ${curriculumValue.chapterName}` : ''}
                      {curriculumValue.lessonName ? ` · ${curriculumValue.lessonName}` : ''}
                    </p>
                  ) : (
                    <p className="text-emerald-800">
                      Đã lưu theo cấu hình metadata riêng của từng câu hỏi (không ghi đè đồng loạt).
                    </p>
                  )}
                </div>
              )}
            </div>
          ) : (
            /* VIEW 2: CONFIGURATION FORM */
            <div className="space-y-5">
              {/* Primary Option Checkbox (Section 2E) */}
              <label className="flex items-start gap-3 p-4 rounded-2xl bg-teal-50/70 border border-teal-200 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={applyToAll}
                  disabled={isSaving}
                  onChange={(e) => {
                    setApplyToAll(e.target.checked);
                    setValidationError(null);
                  }}
                  className="mt-0.5 w-4 h-4 rounded border-teal-400 text-teal-600 focus:ring-teal-500"
                />
                <div className="space-y-0.5">
                  <span className="text-sm font-bold text-slate-900 block">
                    Áp dụng đồng loạt cho toàn bộ câu hỏi trong lượt bóc tách này
                  </span>
                  <span className="text-xs text-slate-600 block">
                    {applyToAll
                      ? 'Môn học, Khối lớp, Chương và Bài học chọn bên dưới sẽ được gán đồng loạt cho tất cả câu hỏi đang lưu.'
                      : 'Chế độ phân loại riêng: Hệ thống giữ nguyên metadata đã gán cho từng câu hoặc cho phép cấu hình riêng từng câu bên dưới (không tự động ghi đè đồng loạt).'}
                  </span>
                </div>
              </label>

              {/* MODE A: Apply to all questions */}
              {applyToAll ? (
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                      <BookOpen className="w-4 h-4 text-teal-600 shrink-0" />
                      <span>Phân loại câu hỏi (Môn học · Khối lớp · Chương / Chủ đề · Bài học)</span>
                    </h4>
                    {loadedLessons.length > 0 && !isCatalogLoading && (
                      <span className="text-[11px] font-semibold text-teal-700 tabular-nums">
                        {loadedLessons.length} bài học từ Firestore
                      </span>
                    )}
                  </div>

                  <CurriculumCascadeSelector
                    value={curriculumValue}
                    subjects={subjects}
                    requireChapterBeforeLesson
                    preserveGradeOnSubjectChange
                    onChange={(next) => {
                      setCurriculumValue(next);
                      setValidationError(null);
                    }}
                    onLoadingChange={(loading) => setIsCatalogLoading(loading)}
                    onLessonsLoaded={(loaded: CurriculumLesson[]) => {
                      setLoadedLessons(loaded);
                      if (loaded.length > 0) {
                        setCurriculumValue((prev) => {
                          // Verify any previously carried chapter/lesson still belongs to the freshly loaded catalog
                          const validChapter = loaded.some((l) => l.chapterId === prev.chapterId);
                          const validLesson =
                            validChapter &&
                            loaded.some(
                              (l) =>
                                l.chapterId === prev.chapterId &&
                                (l.lessonId === prev.lessonId || l.id === prev.lessonId)
                            );
                          return {
                            ...prev,
                            textbookSeries:
                              prev.textbookSeries || loaded[0].textbookSeries || schoolTextbookSeries,
                            chapterId: validChapter ? prev.chapterId : '',
                            chapterName: validChapter ? prev.chapterName : '',
                            lessonId: validLesson ? prev.lessonId : '',
                            lessonName: validLesson ? prev.lessonName : '',
                          };
                        });
                      }
                    }}
                  />
                </div>
              ) : (
                /* MODE B: Individual per-question metadata configuration */
                <div className="rounded-2xl border border-slate-200 bg-slate-50/70 overflow-hidden">
                  <div className="px-4 py-3 bg-slate-100/80 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Layers className="w-4 h-4 text-teal-600 shrink-0" />
                      <h4 className="text-sm font-bold text-slate-900">
                        Cấu hình phân loại riêng cho từng câu hỏi ({activeCandidates.length} câu đang chọn)
                      </h4>
                    </div>
                    <span className="text-[11px] font-semibold text-slate-600">
                      Giữ nguyên metadata riêng từng câu · Không tự động gán đồng loạt
                    </span>
                  </div>

                  <div className="divide-y divide-slate-200 max-h-[360px] overflow-y-auto bg-white">
                    {questionsToSave.map((q, idx) => {
                      const isChecked = checkedIds.has(q.id);
                      const isExpanded = expandedQuestionId === q.id;
                      const meta = perQuestionMeta[q.id] || {
                        subjectId: q.subjectId || initialSubject.id,
                        subjectName: q.subjectName || initialSubject.name,
                        grade: q.grade || initialGrade,
                        chapterId: q.chapterId || '',
                        chapterName: q.chapterName || '',
                        lessonId: q.lessonId || '',
                        lessonName: q.lessonName || q.lessonTopic || '',
                      };
                      const dup = duplicateMap.get(q.id);

                      return (
                        <div
                          key={q.id}
                          className={`p-3.5 transition-colors ${
                            isChecked ? 'bg-white' : 'bg-slate-50/70 opacity-60'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div
                              onClick={() => toggleCandidate(q.id)}
                              className="flex items-start gap-2.5 min-w-0 flex-1 cursor-pointer"
                            >
                              <div className="mt-0.5 text-teal-600 shrink-0">
                                {isChecked ? (
                                  <CheckSquare className="w-4 h-4" />
                                ) : (
                                  <Square className="w-4 h-4 text-slate-400" />
                                )}
                              </div>
                              <div className="min-w-0 flex-1 space-y-1">
                                <div className="flex flex-wrap items-center gap-2 text-xs">
                                  <span className="font-bold text-slate-900">Câu {idx + 1}</span>
                                  <span className="font-mono text-slate-500">{q.code}</span>
                                  <span className="text-teal-700 font-semibold">
                                    {QUESTION_TYPE_SHORT_LABELS[getEffectiveQuestionType(q)]}
                                  </span>
                                  <span className="text-slate-500 font-semibold">
                                    · {COGNITIVE_LEVEL_SHORT_LABELS[getEffectiveQuestionDifficulty(q)]}
                                  </span>
                                  {dup?.isDuplicate && (
                                    <span className="text-amber-700 font-bold">
                                      · Trùng ({dup.matchedQuestionCode})
                                    </span>
                                  )}
                                </div>
                                <div className="text-xs text-slate-700 line-clamp-1">
                                  <ChemRenderer text={q.content} inline />
                                </div>
                                <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-600">
                                  <span className="font-semibold text-slate-800">
                                    {meta.subjectName || 'Chưa chọn môn'}
                                  </span>
                                  <span>·</span>
                                  <span className="font-semibold text-slate-800">
                                    {meta.grade ? `Lớp ${meta.grade}` : 'Chưa chọn lớp'}
                                  </span>
                                  {meta.chapterName && (
                                    <>
                                      <span>·</span>
                                      <span className="truncate max-w-[200px]">{meta.chapterName}</span>
                                    </>
                                  )}
                                  {meta.lessonName && (
                                    <>
                                      <span>·</span>
                                      <span className="text-teal-700 font-medium truncate max-w-[220px]">
                                        {meta.lessonName}
                                      </span>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>

                            <button
                              type="button"
                              disabled={!isChecked || isSaving}
                              onClick={() =>
                                setExpandedQuestionId((prev) => (prev === q.id ? null : q.id))
                              }
                              className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 inline-flex items-center gap-1 shrink-0 disabled:opacity-40"
                            >
                              <span>{isExpanded ? 'Thu gọn' : 'Cấu hình riêng'}</span>
                              {isExpanded ? (
                                <ChevronUp className="w-3.5 h-3.5" />
                              ) : (
                                <ChevronDown className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>

                          {isExpanded && isChecked && (
                            <div className="mt-3 pt-3 border-t border-slate-100 pl-6 space-y-3">
                              <CurriculumCascadeSelector
                                value={meta}
                                subjects={subjects}
                                requireChapterBeforeLesson
                                preserveGradeOnSubjectChange
                                compact
                                onChange={(nextVal) => handlePerQuestionMetaChange(q.id, nextVal)}
                              />
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                <div>
                                  <label className="block text-[11px] font-bold text-slate-600 mb-1">
                                    4. Dạng câu hỏi (riêng câu này)
                                  </label>
                                  <select
                                    value={getEffectiveQuestionType(q)}
                                    onChange={(e) =>
                                      handlePerQuestionTypeChange(
                                        q.id,
                                        e.target.value as QuestionType
                                      )
                                    }
                                    className="w-full min-h-[34px] px-2.5 py-1 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-800"
                                  >
                                    {PRIMARY_QUESTION_TYPES.map((qt) => (
                                      <option key={qt.id} value={qt.id}>
                                        {qt.label}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                                <div>
                                  <label className="block text-[11px] font-bold text-slate-600 mb-1">
                                    5. Mức độ nhận thức (riêng câu này)
                                  </label>
                                  <select
                                    value={getEffectiveQuestionDifficulty(q)}
                                    onChange={(e) =>
                                      handlePerQuestionDifficultyChange(
                                        q.id,
                                        e.target.value as CognitiveLevel
                                      )
                                    }
                                    className="w-full min-h-[34px] px-2.5 py-1 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-800"
                                  >
                                    {(Object.keys(COGNITIVE_LEVEL_LABELS) as CognitiveLevel[]).map(
                                      (lvl) => (
                                        <option key={lvl} value={lvl}>
                                          {COGNITIVE_LEVEL_LABELS[lvl]}
                                        </option>
                                      )
                                    )}
                                  </select>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Primary Classification Group 4 & 5: Dạng câu hỏi (TRƯỚC) -> Mức độ nhận thức */}
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <SlidersHorizontal className="w-4 h-4 text-teal-600 shrink-0" />
                    <span>4. Dạng câu hỏi &amp; 5. Mức độ nhận thức</span>
                  </h4>
                  <span className="text-[11px] text-slate-500">
                    Có thể điều chỉnh riêng từng câu ở danh sách bên dưới
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* 4. Dạng câu hỏi — ALWAYS BEFORE Mức độ */}
                  <div className="space-y-2">
                    <label className="block text-xs font-bold text-slate-700">
                      4. Dạng câu hỏi
                    </label>
                    <select
                      value={typeMode}
                      disabled={isSaving}
                      onChange={(e) =>
                        setTypeMode(e.target.value as 'keep_per_question' | 'apply_all')
                      }
                      className="w-full min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-300 bg-white text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500"
                    >
                      <option value="keep_per_question">
                        Giữ nguyên dạng AI nhận diện cho từng câu (Khuyên dùng)
                      </option>
                      <option value="apply_all">
                        Áp dụng cùng 1 dạng câu hỏi cho các câu chưa chỉnh riêng
                      </option>
                    </select>
                    {typeMode === 'apply_all' && (
                      <select
                        value={defaultType}
                        disabled={isSaving}
                        onChange={(e) => setDefaultType(e.target.value as QuestionType)}
                        className="w-full min-h-[38px] px-3 py-1.5 rounded-xl border border-teal-300 bg-teal-50/40 text-xs font-bold text-teal-900 focus:outline-none focus:ring-2 focus:ring-teal-500"
                      >
                        {PRIMARY_QUESTION_TYPES.map((qt) => (
                          <option key={qt.id} value={qt.id}>
                            {qt.label}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>

                  {/* 5. Mức độ nhận thức */}
                  <div className="space-y-2">
                    <label className="block text-xs font-bold text-slate-700">
                      5. Mức độ nhận thức
                    </label>
                    <select
                      value={levelMode}
                      disabled={isSaving}
                      onChange={(e) =>
                        setLevelMode(e.target.value as 'keep_per_question' | 'apply_all')
                      }
                      className="w-full min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-300 bg-white text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500"
                    >
                      <option value="keep_per_question">
                        Giữ nguyên mức độ từng câu đã nhận diện / chỉnh sửa
                      </option>
                      <option value="apply_all">
                        Áp dụng cùng 1 mức độ cho các câu chưa chỉnh riêng
                      </option>
                    </select>
                    {levelMode === 'apply_all' && (
                      <select
                        value={defaultLevel}
                        disabled={isSaving}
                        onChange={(e) => setDefaultLevel(e.target.value as CognitiveLevel)}
                        className="w-full min-h-[38px] px-3 py-1.5 rounded-xl border border-teal-300 bg-teal-50/40 text-xs font-bold text-teal-900 focus:outline-none focus:ring-2 focus:ring-teal-500"
                      >
                        {(Object.keys(COGNITIVE_LEVEL_LABELS) as CognitiveLevel[]).map((lvl) => (
                          <option key={lvl} value={lvl}>
                            {COGNITIVE_LEVEL_LABELS[lvl]}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>
              </div>

              {/* Duplicate Detection Status */}
              <div
                className={`p-4 rounded-2xl border space-y-2.5 ${
                  duplicateCandidates.length > 0
                    ? 'bg-amber-50/80 border-amber-300'
                    : 'bg-emerald-50/60 border-emerald-200'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-bold">
                    {isCheckingDuplicates ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin text-teal-600 shrink-0" />
                        <span className="text-slate-700">
                          Đang đối chiếu câu hỏi trùng với Firestore...
                        </span>
                      </>
                    ) : duplicateCandidates.length > 0 ? (
                      <>
                        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                        <span className="text-amber-900">
                          Phát hiện {duplicateCandidates.length} câu hỏi trùng lặp (còn{' '}
                          {netNewCount} câu mới sẽ được lưu)
                        </span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span className="text-emerald-900">
                          Không phát hiện câu trùng lặp · Sẵn sàng lưu {activeCandidates.length} câu hỏi vào Ngân hàng
                        </span>
                      </>
                    )}
                  </div>

                  {duplicateCandidates.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowDuplicatePreview((prev) => !prev)}
                      className="text-xs font-semibold text-amber-900 underline inline-flex items-center gap-1"
                    >
                      <span>{showDuplicatePreview ? 'Ẩn danh sách trùng' : 'Xem câu bị trùng'}</span>
                      {showDuplicatePreview ? (
                        <ChevronUp className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5" />
                      )}
                    </button>
                  )}
                </div>

                {checkError && (
                  <p className="text-xs text-rose-700 font-medium flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{checkError}</span>
                  </p>
                )}

                <label className="flex items-start gap-2.5 text-xs text-slate-800 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={skipDuplicates}
                    disabled={isSaving}
                    onChange={(e) => setSkipDuplicates(e.target.checked)}
                    className="mt-0.5 w-4 h-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                  />
                  <span>
                    <strong>Tự động bỏ qua câu hỏi trùng</strong> (so sánh nội dung, công thức hóa học/toán, phương án/mệnh đề và hình ảnh; không ghi đè câu cũ).
                  </span>
                </label>

                {showDuplicatePreview && duplicateCandidates.length > 0 && (
                  <div className="rounded-xl bg-white border border-amber-200 divide-y divide-amber-100 max-h-40 overflow-y-auto">
                    {duplicateCandidates.map((q) => {
                      const info = duplicateMap.get(q.id);
                      return (
                        <div key={q.id} className="p-2.5 text-xs space-y-0.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono font-bold text-slate-900">{q.code}</span>
                            {info?.matchedQuestionCode && (
                              <span className="text-[11px] font-semibold text-amber-800">
                                Đã có: {info.matchedQuestionCode}
                              </span>
                            )}
                          </div>
                          <p className="text-slate-600 line-clamp-1">{q.content}</p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Optional Collapsible Advanced Settings (Source) */}
              <div className="border border-slate-200 rounded-2xl overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowAdvancedOptions((prev) => !prev)}
                  className="w-full px-4 py-3 bg-slate-50 hover:bg-slate-100/80 flex items-center justify-between text-xs font-bold text-slate-800 transition-colors"
                >
                  <span className="inline-flex items-center gap-2">
                    <FileText className="w-3.5 h-3.5 text-teal-600" />
                    <span>Tùy chọn bổ sung (Nguồn gốc tài liệu)</span>
                  </span>
                  {showAdvancedOptions ? (
                    <ChevronUp className="w-4 h-4 text-slate-500" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-slate-500" />
                  )}
                </button>

                {showAdvancedOptions && (
                  <div className="p-4 bg-white space-y-3 border-t border-slate-200">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">
                        Nguồn gốc câu hỏi (Source)
                      </label>
                      <div className="relative">
                        <FileText className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          value={sourceLabel}
                          onChange={(e) => setSourceLabel(e.target.value)}
                          placeholder="Import từ Word/PDF"
                          className="w-full min-h-[38px] pl-8 pr-3 py-1.5 rounded-xl border border-slate-300 bg-white text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Collapsible Candidate Checklist & Individual Type/Difficulty Override when applyToAll === true */}
              {applyToAll && (
                <div className="border border-slate-200 rounded-2xl overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setShowCandidateList((prev) => !prev)}
                    className="w-full px-4 py-3 bg-slate-50 hover:bg-slate-100/80 flex items-center justify-between text-xs font-bold text-slate-800 transition-colors"
                  >
                    <span>
                      Danh sách câu hỏi sẽ lưu &amp; điều chỉnh dạng/mức độ từng câu ({activeCandidates.length} / {questionsToSave.length} câu đang chọn)
                    </span>
                    {showCandidateList ? (
                      <ChevronUp className="w-4 h-4 text-slate-500" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-slate-500" />
                    )}
                  </button>

                  {showCandidateList && (
                    <div className="divide-y divide-slate-100 max-h-64 overflow-y-auto bg-white">
                      {questionsToSave.map((q, idx) => {
                        const isChecked = checkedIds.has(q.id);
                        const dup = duplicateMap.get(q.id);
                        const effType = getEffectiveQuestionType(q);
                        const effDiff = getEffectiveQuestionDifficulty(q);
                        return (
                          <div
                            key={q.id}
                            className={`px-4 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs ${
                              isChecked ? 'bg-white' : 'bg-slate-50/70 opacity-60'
                            }`}
                          >
                            <div
                              onClick={() => toggleCandidate(q.id)}
                              className="flex items-start gap-2.5 min-w-0 flex-1 cursor-pointer"
                            >
                              <div className="mt-0.5 text-teal-600 shrink-0">
                                {isChecked ? (
                                  <CheckSquare className="w-4 h-4" />
                                ) : (
                                  <Square className="w-4 h-4 text-slate-400" />
                                )}
                              </div>
                              <div className="min-w-0 flex-1 space-y-0.5">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="font-bold text-slate-900">Câu {idx + 1}</span>
                                  <span className="font-mono text-slate-500">{q.code}</span>
                                  {dup?.isDuplicate && (
                                    <span className="text-amber-700 font-bold">
                                      · Trùng ({dup.matchedQuestionCode})
                                    </span>
                                  )}
                                </div>
                                <div className="text-slate-700 line-clamp-1">
                                  <ChemRenderer text={q.content} inline />
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5 pl-6 sm:pl-0 shrink-0">
                              <select
                                value={effType}
                                disabled={!isChecked || isSaving}
                                onClick={(e) => e.stopPropagation()}
                                onChange={(e) =>
                                  handlePerQuestionTypeChange(q.id, e.target.value as QuestionType)
                                }
                                title="Chỉnh dạng câu hỏi riêng cho câu này"
                                className="min-h-[30px] px-2 py-1 rounded-lg border border-slate-300 bg-slate-50 text-[11px] font-semibold text-slate-800 max-w-[165px]"
                              >
                                {PRIMARY_QUESTION_TYPES.map((qt) => (
                                  <option key={qt.id} value={qt.id}>
                                    {qt.shortLabel}
                                  </option>
                                ))}
                              </select>
                              <select
                                value={effDiff}
                                disabled={!isChecked || isSaving}
                                onClick={(e) => e.stopPropagation()}
                                onChange={(e) =>
                                  handlePerQuestionDifficultyChange(
                                    q.id,
                                    e.target.value as CognitiveLevel
                                  )
                                }
                                title="Chỉnh mức độ riêng cho câu này"
                                className="min-h-[30px] px-2 py-1 rounded-lg border border-slate-300 bg-slate-50 text-[11px] font-semibold text-slate-800"
                              >
                                {(Object.keys(COGNITIVE_LEVEL_LABELS) as CognitiveLevel[]).map(
                                  (lvl) => (
                                    <option key={lvl} value={lvl}>
                                      {COGNITIVE_LEVEL_SHORT_LABELS[lvl]}
                                    </option>
                                  )
                                )}
                              </select>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Validation Error / Missing Required Fields Notice */}
              {(validationError || (!formValidationStatus.valid && !isSaving)) && (
                <div
                  className={`p-3.5 rounded-xl border text-xs font-semibold flex items-start gap-2 ${
                    validationError
                      ? 'bg-rose-50 border-rose-200 text-rose-800'
                      : 'bg-amber-50 border-amber-200 text-amber-900'
                  }`}
                >
                  <AlertCircle
                    className={`w-4 h-4 shrink-0 mt-0.5 ${
                      validationError ? 'text-rose-600' : 'text-amber-600'
                    }`}
                  />
                  <span>{validationError || formValidationStatus.reason}</span>
                </div>
              )}

              {/* Saving Progress Bar */}
              {isSaving && (
                <div className="p-4 rounded-xl bg-teal-50 border border-teal-200 space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold text-teal-900 tabular-nums">
                    <span className="inline-flex items-center gap-2">
                      <RefreshCw className="w-4 h-4 animate-spin text-teal-600" />
                      <span>
                        Đang ghi dữ liệu vào Firestore ({progress.currentCode || '...'})
                      </span>
                    </span>
                    <span>
                      {progress.done} / {progress.total} câu
                    </span>
                  </div>
                  <div className="w-full h-2.5 bg-teal-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full bg-teal-600 rounded-full transition-all duration-200 ${getProgressWidthClass(
                        progress.done,
                        progress.total
                      )}`}
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
          {saveResult ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 min-h-[42px] rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-sm font-semibold"
                >
                  Đóng &amp; tiếp tục
                </button>
                {unsavedIds.length > 0 && onReviewUnsavedQuestions && (
                  <button
                    type="button"
                    onClick={() => {
                      onReviewUnsavedQuestions(unsavedIds);
                      onClose();
                    }}
                    className="px-4 min-h-[42px] rounded-xl border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900 text-sm font-semibold"
                  >
                    Xem lại {unsavedIds.length} câu chưa lưu
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={() => {
                  onClose();
                  onNavigateToQuestionBank();
                }}
                className="px-5 min-h-[44px] rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold shadow-xs inline-flex items-center gap-2"
              >
                <span>Xem ngân hàng câu hỏi</span>
                <ArrowRight className="w-4 h-4 shrink-0" />
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                disabled={isSaving}
                onClick={onClose}
                className="px-4 min-h-[42px] rounded-xl border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 text-sm font-semibold disabled:opacity-50"
              >
                Hủy
              </button>

              <button
                type="button"
                disabled={isSaving || !formValidationStatus.valid}
                onClick={() => void handleConfirmSave()}
                className="px-5 min-h-[44px] rounded-xl bg-teal-600 hover:bg-teal-700 disabled:bg-slate-300 disabled:text-slate-500 disabled:cursor-not-allowed text-white text-sm font-semibold shadow-xs inline-flex items-center gap-2 transition-colors"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                    <span>Đang lưu vào Ngân hàng...</span>
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 shrink-0" />
                    <span>Xác nhận lưu vào Ngân hàng</span>
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
