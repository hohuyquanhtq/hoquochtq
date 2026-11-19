import React, { useEffect, useMemo, useState } from 'react';
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
  DEFAULT_GDPT_2018_SUBJECTS,
  DEFAULT_SUBJECT_ID,
  DEFAULT_SUBJECT_NAME,
  QUESTION_TYPE_SHORT_LABELS,
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

export const WordSaveToBankModal: React.FC<WordSaveToBankModalProps> = ({
  isOpen,
  questionsToSave,
  existingBankQuestions,
  subjects = DEFAULT_GDPT_2018_SUBJECTS,
  defaultGrade,
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
    return (
      subjects.find((s) => s.id === DEFAULT_SUBJECT_ID) ||
      subjects[0] || {
        id: DEFAULT_SUBJECT_ID,
        name: DEFAULT_SUBJECT_NAME,
      }
    );
  }, [questionsToSave, subjects]);

  const initialGrade: ChemGrade = useMemo(() => {
    const firstGrade = questionsToSave[0]?.grade;
    if (firstGrade === '10' || firstGrade === '11' || firstGrade === '12') {
      return firstGrade;
    }
    return defaultGrade === '10' || defaultGrade === '11' || defaultGrade === '12'
      ? defaultGrade
      : '12';
  }, [questionsToSave, defaultGrade]);

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

  const [loadedLessonsCount, setLoadedLessonsCount] = useState<number>(0);
  const [schoolTextbookSeries, setSchoolTextbookSeries] = useState<string>('');
  const [levelMode, setLevelMode] = useState<'keep_per_question' | 'apply_all'>('keep_per_question');
  const [defaultLevel, setDefaultLevel] = useState<CognitiveLevel>('nhan_biet');
  const [typeMode, setTypeMode] = useState<'keep_per_question' | 'apply_all'>('keep_per_question');
  const [defaultType, setDefaultType] = useState<QuestionType>('part1_single_choice');
  const [sourceLabel, setSourceLabel] = useState<string>(
    sourceFileName ? `Import từ Word: ${sourceFileName}` : 'Import từ Word (.docx)'
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

  // Save execution & result state
  const [isSaving, setIsSaving] = useState<boolean>(false);
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
    setCheckedIds(new Set(questionsToSave.map((q) => q.id)));
    setSaveResult(null);
    setValidationError(null);
    setCheckError(null);
    setIsSaving(false);
    setProgress({ done: 0, total: 0, currentCode: '' });
    setSourceLabel(
      sourceFileName ? `Import từ Word: ${sourceFileName}` : 'Import từ Word (.docx)'
    );
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
  }, [isOpen, questionsToSave, sourceFileName, initialSubject, initialGrade, currentUserId, existingBankQuestions]);

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

  const toggleCandidate = (id: string) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleConfirmSave = async () => {
    setValidationError(null);

    if (activeCandidates.length === 0) {
      setValidationError('Vui lòng chọn ít nhất 1 câu hỏi để lưu vào ngân hàng.');
      return;
    }
    if (!curriculumValue.subjectId) {
      setValidationError('Vui lòng chọn Môn học trước khi lưu.');
      return;
    }
    if (!curriculumValue.grade) {
      setValidationError('Vui lòng chọn Khối lớp (10, 11 hoặc 12) trước khi lưu.');
      return;
    }

    const uid = auth.currentUser?.uid || '';
    if (!uid) {
      setValidationError(
        'Chưa phát hiện phiên đăng nhập Firebase Authentication hợp lệ. Vui lòng đăng nhập lại rồi thử lưu.'
      );
      return;
    }

    setIsSaving(true);
    setProgress({ done: 0, total: activeCandidates.length, currentCode: '' });

    const classification: WordBankClassificationInput = {
      subjectId: curriculumValue.subjectId,
      subjectName: curriculumValue.subjectName || DEFAULT_SUBJECT_NAME,
      grade: curriculumValue.grade as ChemGrade,
      textbookSeries: curriculumValue.textbookSeries || schoolTextbookSeries || undefined,
      chapterId: curriculumValue.chapterId || undefined,
      chapterName: curriculumValue.chapterName || undefined,
      lessonId: curriculumValue.lessonId || undefined,
      lessonName: curriculumValue.lessonName || undefined,
      levelMode,
      defaultLevel,
      typeMode,
      defaultType,
      sourceLabel: sourceLabel.trim() || 'Import từ Word (.docx)',
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
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/65 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-3xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-teal-600/20 border border-teal-400/40 flex items-center justify-center text-teal-300 shrink-0">
              <Database className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-base truncate">
                {saveResult
                  ? 'Kết quả lưu câu hỏi vào Ngân hàng Firestore'
                  : 'Xác nhận thông tin lưu vào Ngân hàng câu hỏi'}
              </h3>
              <p className="text-xs text-slate-300 truncate">
                {saveResult
                  ? `Collection Firestore: /questions · Đã xử lý ${saveResult.totalSelected} câu hỏi`
                  : `Đang chuẩn bị lưu ${activeCandidates.length} / ${questionsToSave.length} câu hỏi trực tiếp vào Firestore`}
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
                    {saveResult.savedQuestions.length > 0
                      ? 'Đã hoàn tất lưu câu hỏi vào Firestore!'
                      : saveResult.failedItems.length > 0
                      ? 'Không lưu được câu hỏi vào Firestore — vui lòng kiểm tra chi tiết lỗi bên dưới.'
                      : 'Tất cả câu hỏi được chọn đều đã tồn tại trong Ngân hàng câu hỏi.'}
                  </p>
                  <p className="text-xs opacity-90">
                    Dữ liệu lưu thành công đã được ghi trực tiếp vào collection{' '}
                    <code className="font-mono font-semibold">/questions</code> gắn với tài khoản giáo viên hiện tại và sẽ giữ nguyên khi tải lại trang hoặc đăng nhập lại.
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
                  <p className="text-xs font-semibold text-rose-800">Lỗi ghi Firestore</p>
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

              {/* Saved sample confirmation */}
              {saveResult.savedQuestions.length > 0 && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-3.5 text-xs text-emerald-900 space-y-1.5">
                  <p className="font-bold flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>
                      Đã ghi thành công {saveResult.savedQuestions.length} câu hỏi mới vào Ngân hàng của bạn
                    </span>
                  </p>
                  <p className="text-emerald-800">
                    Môn: <strong>{curriculumValue.subjectName}</strong> · Lớp:{' '}
                    <strong>{curriculumValue.grade}</strong>
                    {curriculumValue.chapterName ? ` · ${curriculumValue.chapterName}` : ''}
                    {curriculumValue.lessonName ? ` · ${curriculumValue.lessonName}` : ''}
                  </p>
                </div>
              )}
            </div>
          ) : (
            /* VIEW 2: CLASSIFICATION & PRE-SAVE CONFIRMATION */
            <div className="space-y-5">
              {/* Step A: Cascading Curriculum Classification */}
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3.5">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-teal-600 shrink-0" />
                    <span>1. Phân loại chương trình SGK (Môn · Lớp · Bộ sách · Chương · Bài học)</span>
                  </h4>
                  {loadedLessonsCount > 0 && (
                    <span className="text-[11px] font-semibold text-teal-700 tabular-nums">
                      {loadedLessonsCount} bài học SGK
                    </span>
                  )}
                </div>

                <CurriculumCascadeSelector
                  value={curriculumValue}
                  subjects={subjects}
                  onChange={(next) => setCurriculumValue(next)}
                  onLessonsLoaded={(loaded: CurriculumLesson[]) => {
                    setLoadedLessonsCount(loaded.length);
                    if (loaded.length > 0 && !curriculumValue.textbookSeries) {
                      setCurriculumValue((prev) => ({
                        ...prev,
                        textbookSeries: prev.textbookSeries || loaded[0].textbookSeries || schoolTextbookSeries,
                      }));
                    }
                  }}
                />

                {/* Explicit Textbook Series override/display if needed */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Bộ sách giáo khoa áp dụng
                    </label>
                    <input
                      type="text"
                      value={curriculumValue.textbookSeries || ''}
                      onChange={(e) =>
                        setCurriculumValue((prev) => ({
                          ...prev,
                          textbookSeries: e.target.value,
                        }))
                      }
                      placeholder={
                        schoolTextbookSeries || 'Ví dụ: Kết nối tri thức, Chân trời sáng tạo, Cánh diều'
                      }
                      className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500"
                    />
                  </div>

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
                        placeholder="Import từ Word (.docx)"
                        className="w-full min-h-[40px] pl-8 pr-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Step B: Cognitive Level & Question Type Settings */}
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3.5">
                <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Layers className="w-4 h-4 text-teal-600 shrink-0" />
                  <span>2. Mức độ nhận thức &amp; Dạng câu hỏi</span>
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="block text-xs font-bold text-slate-700">
                      Mức độ nhận thức
                    </label>
                    <select
                      value={levelMode}
                      onChange={(e) =>
                        setLevelMode(e.target.value as 'keep_per_question' | 'apply_all')
                      }
                      className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500"
                    >
                      <option value="keep_per_question">
                        Giữ nguyên mức độ từng câu đã nhận diện / chỉnh sửa
                      </option>
                      <option value="apply_all">
                        Áp dụng cùng 1 mức độ cho toàn bộ câu đang lưu
                      </option>
                    </select>
                    {levelMode === 'apply_all' && (
                      <select
                        value={defaultLevel}
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

                  <div className="space-y-2">
                    <label className="block text-xs font-bold text-slate-700">Dạng câu hỏi</label>
                    <select
                      value={typeMode}
                      onChange={(e) =>
                        setTypeMode(e.target.value as 'keep_per_question' | 'apply_all')
                      }
                      className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500"
                    >
                      <option value="keep_per_question">
                        Giữ nguyên dạng câu hỏi đã bóc tách (Phần I, II, III)
                      </option>
                      <option value="apply_all">
                        Ghi đè dạng câu hỏi cho toàn bộ danh sách
                      </option>
                    </select>
                    {typeMode === 'apply_all' && (
                      <select
                        value={defaultType}
                        onChange={(e) => setDefaultType(e.target.value as QuestionType)}
                        className="w-full min-h-[38px] px-3 py-1.5 rounded-xl border border-teal-300 bg-teal-50/40 text-xs font-bold text-teal-900 focus:outline-none focus:ring-2 focus:ring-teal-500"
                      >
                        {(Object.keys(QUESTION_TYPE_SHORT_LABELS) as QuestionType[]).map((qt) => (
                          <option key={qt} value={qt}>
                            {QUESTION_TYPE_SHORT_LABELS[qt]}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>
              </div>

              {/* Step C: Duplicate Detection Banner */}
              <div
                className={`p-4 rounded-2xl border space-y-3 ${
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
                          Không phát hiện câu trùng lặp · Sẵn sàng lưu {activeCandidates.length} câu hỏi mới vào Firestore
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
                    onChange={(e) => setSkipDuplicates(e.target.checked)}
                    className="mt-0.5 w-4 h-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                  />
                  <span>
                    <strong>Tự động bỏ qua câu hỏi trùng</strong> (so sánh cả nội dung, công thức hóa học/toán, phương án/mệnh đề và hình ảnh; tuyệt đối không tự ghi đè câu hỏi cũ).
                  </span>
                </label>

                {showDuplicatePreview && duplicateCandidates.length > 0 && (
                  <div className="rounded-xl bg-white border border-amber-200 divide-y divide-amber-100 max-h-44 overflow-y-auto">
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

              {/* Step D: Collapsible Candidate Checklist */}
              <div className="border border-slate-200 rounded-2xl overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowCandidateList((prev) => !prev)}
                  className="w-full px-4 py-3 bg-slate-50 hover:bg-slate-100/80 flex items-center justify-between text-xs font-bold text-slate-800 transition-colors"
                >
                  <span>
                    Danh sách câu hỏi sẽ lưu ({activeCandidates.length} / {questionsToSave.length} câu đang chọn)
                  </span>
                  {showCandidateList ? (
                    <ChevronUp className="w-4 h-4 text-slate-500" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-slate-500" />
                  )}
                </button>

                {showCandidateList && (
                  <div className="divide-y divide-slate-100 max-h-56 overflow-y-auto bg-white">
                    {questionsToSave.map((q, idx) => {
                      const isChecked = checkedIds.has(q.id);
                      const dup = duplicateMap.get(q.id);
                      return (
                        <div
                          key={q.id}
                          onClick={() => toggleCandidate(q.id)}
                          className={`px-4 py-2.5 flex items-start gap-3 cursor-pointer text-xs hover:bg-slate-50 ${
                            isChecked ? 'bg-white' : 'bg-slate-50/70 opacity-60'
                          }`}
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
                              <span className="text-teal-700 font-semibold">
                                {QUESTION_TYPE_SHORT_LABELS[q.type]}
                              </span>
                              {dup?.isDuplicate && (
                                <span className="text-amber-700 font-bold">
                                  · Trùng ({dup.matchedQuestionCode})
                                </span>
                              )}
                            </div>
                            <div className="text-slate-700 line-clamp-2">
                              <ChemRenderer text={q.content} inline />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Validation Error */}
              {validationError && (
                <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <span>{validationError}</span>
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
                className="px-4 min-h-[42px] rounded-xl text-slate-700 hover:bg-slate-200 text-sm font-semibold disabled:opacity-50"
              >
                Hủy bỏ
              </button>

              <button
                type="button"
                disabled={isSaving || activeCandidates.length === 0}
                onClick={() => void handleConfirmSave()}
                className="px-5 min-h-[44px] rounded-xl bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white text-sm font-semibold shadow-xs inline-flex items-center gap-2"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                    <span>Đang lưu vào Firestore...</span>
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 shrink-0" />
                    <span>
                      Xác nhận lưu {activeCandidates.length} câu vào Ngân hàng
                    </span>
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
