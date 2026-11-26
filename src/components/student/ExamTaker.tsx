import React, { useState, useEffect, useMemo, useRef } from 'react';
import confetti from 'canvas-confetti';
import { Exam, StudentAnswer, StudentSubmission } from '../../types';
import {
  Clock,
  Flag,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Send,
  ShieldAlert,
  LayoutGrid,
} from 'lucide-react';
import { ChemRenderer } from '../../utils/chemRenderer';
import { gradeSubmission } from '../../utils/gradingEngine';
import {
  groupExamQuestionsBySection,
  getQuestionProgress,
  SHORT_PART_BADGES,
} from '../../utils/examSectionGrouping';
import { ExamQuestionNavigator } from './ExamQuestionNavigator';

interface ExamTakerProps {
  exam: Exam;
  studentName: string;
  studentClass: string;
  onFinishExam: (submission: StudentSubmission) => void;
  onExitWithoutSave: () => void;
}

type FontScale = 'sm' | 'md' | 'lg';

const FONT_SCALE_STORAGE_KEY = 'hqtest_exam_font_scale';

const FONT_SCALE_ORDER: FontScale[] = ['sm', 'md', 'lg'];

const FONT_SCALE_STYLES: Record<
  FontScale,
  {
    label: string;
    stem: string;
    option: string;
    statement: string;
    input: string;
  }
> = {
  sm: {
    label: '16px',
    stem: 'text-base leading-relaxed',
    option: 'text-base leading-relaxed',
    statement: 'text-base leading-relaxed',
    input: 'text-base',
  },
  md: {
    label: '18px',
    stem: 'text-lg leading-relaxed',
    option: 'text-base leading-relaxed',
    statement: 'text-base leading-relaxed',
    input: 'text-lg',
  },
  lg: {
    label: '20px',
    stem: 'text-xl leading-loose',
    option: 'text-lg leading-relaxed',
    statement: 'text-lg leading-relaxed',
    input: 'text-xl',
  },
};

export const ExamTaker: React.FC<ExamTakerProps> = ({
  exam,
  studentName,
  studentClass,
  onFinishExam,
  onExitWithoutSave,
}) => {
  const safeQuestions = Array.isArray(exam?.questions) ? exam.questions : [];
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  // Local storage auto-save key
  const storageKey = `chemtest_progress_${exam?.id || 'unknown'}_${(studentName || 'student').replace(/\s+/g, '_')}`;

  const [fontScale, setFontScale] = useState<FontScale>(() => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const saved = window.localStorage.getItem(FONT_SCALE_STORAGE_KEY);
        if (saved === 'sm' || saved === 'md' || saved === 'lg') {
          return saved;
        }
      }
    } catch {}
    return 'md';
  });

  useEffect(() => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(FONT_SCALE_STORAGE_KEY, fontScale);
      }
    } catch {}
  }, [fontScale]);

  const handleDecreaseFont = () => {
    setFontScale((prev) => {
      const idx = FONT_SCALE_ORDER.indexOf(prev);
      return idx > 0 ? FONT_SCALE_ORDER[idx - 1] : prev;
    });
  };

  const handleIncreaseFont = () => {
    setFontScale((prev) => {
      const idx = FONT_SCALE_ORDER.indexOf(prev);
      return idx < FONT_SCALE_ORDER.length - 1 ? FONT_SCALE_ORDER[idx + 1] : prev;
    });
  };

  const [attemptId] = useState<string>(() => {
    try {
      const saved =
        typeof window !== 'undefined' && window.localStorage
          ? window.localStorage.getItem(storageKey)
          : null;
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed?.attemptId === 'string' && parsed.attemptId.trim()) {
          return parsed.attemptId.trim();
        }
      }
    } catch {}
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return `att_${crypto.randomUUID().replace(/[^a-zA-Z0-9_-]/g, '')}`;
    }
    return `att_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  });

  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, StudentAnswer>>(() => {
    try {
      const saved =
        typeof window !== 'undefined' && window.localStorage
          ? window.localStorage.getItem(storageKey)
          : null;
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed?.answers && typeof parsed.answers === 'object') {
          return parsed.answers as Record<string, StudentAnswer>;
        }
      }
    } catch {}
    return {};
  });
  const [startedAt] = useState<string>(() => {
    try {
      const saved =
        typeof window !== 'undefined' && window.localStorage
          ? window.localStorage.getItem(storageKey)
          : null;
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed?.startedAt === 'string' && parsed.startedAt.trim()) {
          return parsed.startedAt;
        }
      }
    } catch {}
    return new Date().toISOString();
  });

  // Timer state (seconds)
  const [timeLeftSeconds, setTimeLeftSeconds] = useState<number>(() => {
    try {
      const saved =
        typeof window !== 'undefined' && window.localStorage
          ? window.localStorage.getItem(storageKey)
          : null;
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed?.timeLeftSeconds === 'number' && parsed.timeLeftSeconds > 5) {
          return parsed.timeLeftSeconds;
        }
      }
    } catch {}
    return (exam?.durationMinutes || 45) * 60;
  });
  const [tabSwitchesCount, setTabSwitchesCount] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConfirmSubmit, setShowConfirmSubmit] = useState(false);
  const [showConfirmExit, setShowConfirmExit] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Auto-save answers & stable attemptId whenever they change
  useEffect(() => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(
          storageKey,
          JSON.stringify({
            attemptId,
            startedAt,
            answers,
            timeLeftSeconds,
            timestamp: Date.now(),
          })
        );
      }
    } catch {}
  }, [attemptId, startedAt, answers, timeLeftSeconds, storageKey]);

  // Anti-cheat tab switch monitoring
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        setTabSwitchesCount((prev) => prev + 1);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  const handleSubmitRef = useRef<(autoTimeout?: boolean) => void>(() => {});

  // Countdown timer (pure state updater; auto-submit runs in effect below with latest answers)
  useEffect(() => {
    if (safeQuestions.length === 0 || isSubmitting) return;
    const timer = setInterval(() => {
      setTimeLeftSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [safeQuestions.length, isSubmitting]);

  useEffect(() => {
    if (safeQuestions.length > 0 && timeLeftSeconds === 0 && !isSubmitting) {
      handleSubmitRef.current(true);
    }
  }, [safeQuestions.length, timeLeftSeconds, isSubmitting]);

  const safeIndex = safeQuestions.length > 0 ? Math.min(currentIndex, safeQuestions.length - 1) : 0;
  const currentQuestion = safeQuestions[safeIndex];
  const currentAnswer = (currentQuestion && answers[currentQuestion.id]) || {
    questionId: currentQuestion?.id || '',
    questionType: currentQuestion?.type || 'part1_single_choice',
  };

  const handleSelectOption = (optionId: string) => {
    setAnswers((prev) => ({
      ...prev,
      [currentQuestion.id]: {
        ...prev[currentQuestion.id],
        questionId: currentQuestion.id,
        questionType: 'part1_single_choice',
        selectedOptionId: optionId,
      },
    }));
  };

  const handleToggleMultiOption = (optionId: string) => {
    setAnswers((prev) => {
      const existing = Array.isArray(prev[currentQuestion.id]?.selectedOptionIds)
        ? prev[currentQuestion.id].selectedOptionIds!
        : [];
      const nextIds = existing.includes(optionId)
        ? existing.filter((id) => id !== optionId)
        : [...existing, optionId];
      return {
        ...prev,
        [currentQuestion.id]: {
          ...prev[currentQuestion.id],
          questionId: currentQuestion.id,
          questionType: 'part1_multiple_choice',
          selectedOptionIds: nextIds,
          selectedOptionId: nextIds[0],
        },
      };
    });
  };

  const handleSelectStatement = (statementId: string, value: boolean) => {
    setAnswers((prev) => {
      const existing = prev[currentQuestion.id]?.selectedStatements || {};
      return {
        ...prev,
        [currentQuestion.id]: {
          ...prev[currentQuestion.id],
          questionId: currentQuestion.id,
          questionType: 'part2_true_false',
          selectedStatements: {
            ...existing,
            [statementId]: value,
          },
        },
      };
    });
  };

  const handleTextAnswerChange = (text: string) => {
    setAnswers((prev) => ({
      ...prev,
      [currentQuestion.id]: {
        ...prev[currentQuestion.id],
        questionId: currentQuestion.id,
        questionType: 'part3_short_answer',
        textAnswer: text,
      },
    }));
  };

  const toggleFlag = (questionId: string) => {
    const foundQ = safeQuestions.find((q) => q.id === questionId);
    setAnswers((prev) => ({
      ...prev,
      [questionId]: {
        ...prev[questionId],
        questionId,
        questionType: foundQ?.type || 'part1_single_choice',
        isMarkedForReview: !prev[questionId]?.isMarkedForReview,
      },
    }));
  };

  const handleSubmit = (autoTimeout = false) => {
    if (isSubmitting) return;
    setIsSubmitting(true);

    try {
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
      });
    } catch {}

    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem(storageKey);
      }
    } catch {}

    const submission = gradeSubmission(
      exam,
      `st_${Date.now()}`,
      studentName,
      studentClass,
      startedAt,
      answers,
      tabSwitchesCount,
      attemptId
    );

    if (autoTimeout) {
      submission.status = 'timed_out';
    }

    onFinishExam(submission);
  };

  handleSubmitRef.current = handleSubmit;

  // Format countdown mm:ss
  const mins = Math.floor(timeLeftSeconds / 60);
  const secs = timeLeftSeconds % 60;
  const timeFormatted = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  const isUrgent = timeLeftSeconds < 300; // Under 5 mins

  // Group questions strictly from real exam structure without mutating questions or numbering
  const sectionGroups = useMemo(() => groupExamQuestionsBySection(exam), [exam]);

  const questionSectionMap = useMemo(() => {
    const map = new Map<
      string,
      { title: string; partType: ReturnType<typeof groupExamQuestionsBySection>[number]['partType'] }
    >();
    for (const sec of sectionGroups) {
      for (const item of sec.items) {
        map.set(item.question.id, { title: sec.title, partType: sec.partType });
      }
    }
    return map;
  }, [sectionGroups]);

  // Compute strict dynamic completion counts
  const { totalCompleted, totalPartial } = useMemo(() => {
    let completed = 0;
    let partial = 0;
    for (const q of safeQuestions) {
      const prog = getQuestionProgress(q, answers[q.id]);
      if (prog.isCompleted) completed++;
      else if (prog.isPartial) partial++;
    }
    return { totalCompleted: completed, totalPartial: partial };
  }, [safeQuestions, answers]);

  const handleToggleSectionCollapse = (sectionKey: string) => {
    setCollapsedSections((prev) => ({
      ...prev,
      [sectionKey]: !prev[sectionKey],
    }));
  };

  const handleNavigateToQuestion = (index: number, fromMobile = false) => {
    if (index < 0 || index >= safeQuestions.length) return;
    setCurrentIndex(index);
    if (fromMobile) {
      setMobileNavOpen(false);
    }
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const activeTypography = FONT_SCALE_STYLES[fontScale];

  if (!exam || safeQuestions.length === 0 || !currentQuestion) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4 py-12">
        <div className="max-w-lg w-full bg-white border border-slate-200 rounded-2xl shadow-sm p-8 text-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center mx-auto">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-bold text-slate-900">Không thể hiển thị nội dung câu hỏi</h2>
          <p className="text-base text-slate-600 leading-relaxed">
            Đề thi này chưa có câu hỏi hợp lệ hoặc dữ liệu đang được cập nhật. Vui lòng quay lại và kiểm tra lại với giáo viên.
          </p>
          <button
            type="button"
            onClick={onExitWithoutSave}
            className="px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold shadow-xs transition-colors"
          >
            Quay về trang chủ
          </button>
        </div>
      </div>
    );
  }

  const currentSecMeta = questionSectionMap.get(currentQuestion.id);
  const currentPartType = currentSecMeta?.partType || currentQuestion.type;
  const currentSectionLabel = currentSecMeta?.title || SHORT_PART_BADGES[currentPartType];

  // Auto-fit Part I options grid: 1 column if any option has a table or long visible text (ignoring base64 img payloads)
  const hasLongOption = Boolean(
    currentQuestion.options?.some((opt) => {
      const raw = opt.text || '';
      if (/<table\b/i.test(raw) || /^\s*\|.*\|\s*\n\s*\|[\s:|-]+\|/m.test(raw)) return true;
      const visibleLen = raw
        .replace(/<img\b[^>]*\/?>/gi, ' [img] ')
        .replace(/!\[[^\]]*\]\([^)]+\)/g, ' [img] ')
        .replace(/\$[^$]*\$/g, '123456')
        .replace(/<[^>]+>/g, '')
        .trim().length;
      return visibleLen > 68;
    })
  );

  return (
    <div className="h-[100dvh] w-full flex flex-col overflow-hidden bg-slate-50">
      {/* Compact Full-Width Pinned Top Header — flush at top:0, never overlaps questions */}
      <header className="shrink-0 w-full bg-white border-b border-slate-200 shadow-sm z-50 px-4 sm:px-6 py-2 sm:py-2.5">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3 sm:gap-5">
          {/* Left: Exam Title + Student Metadata on clean single-stack */}
          <div className="min-w-0 flex-1">
            <h1
              className="text-sm sm:text-base font-bold text-slate-900 truncate leading-snug"
              title={exam.title}
            >
              {exam.title}
            </h1>
            <div className="flex items-center gap-1.5 text-xs sm:text-sm text-slate-600 truncate leading-tight mt-0.5">
              <span className="font-medium text-teal-700 truncate">{studentName}</span>
              <span aria-hidden="true" className="text-slate-300">·</span>
              <span className="shrink-0">{studentClass}</span>
              <span aria-hidden="true" className="text-slate-300">·</span>
              <span className="font-mono tabular-nums text-slate-700 shrink-0">
                Mã đề {exam.code}
              </span>
            </div>
          </div>

          {/* Right: Font Scale (A- / A+) + Tab Warning + Countdown Clock + Submit CTA */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {/* Quick Font Size Switcher (A- / A+) */}
            <div
              className="hidden sm:inline-flex items-center rounded-lg border border-slate-200 bg-slate-50 p-0.5"
              role="group"
              aria-label="Điều chỉnh cỡ chữ đề thi"
            >
              <button
                type="button"
                onClick={handleDecreaseFont}
                disabled={fontScale === 'sm'}
                title="Thu nhỏ cỡ chữ"
                aria-label="Thu nhỏ cỡ chữ"
                className="px-2 py-1 text-xs font-bold text-slate-700 hover:bg-white hover:text-slate-900 disabled:opacity-40 rounded-md transition-colors whitespace-nowrap"
              >
                A-
              </button>
              <span className="px-1.5 text-xs font-mono tabular-nums text-slate-500 select-none">
                {activeTypography.label}
              </span>
              <button
                type="button"
                onClick={handleIncreaseFont}
                disabled={fontScale === 'lg'}
                title="Phóng to cỡ chữ"
                aria-label="Phóng to cỡ chữ"
                className="px-2 py-1 text-xs font-bold text-slate-700 hover:bg-white hover:text-slate-900 disabled:opacity-40 rounded-md transition-colors whitespace-nowrap"
              >
                A+
              </button>
            </div>

            {/* Tab Switch Warning (only when triggered) */}
            {tabSwitchesCount > 0 && (
              <div
                className="hidden xl:inline-flex items-center gap-1 text-xs font-semibold text-rose-700 whitespace-nowrap"
                title="Số lần chuyển sang cửa sổ/tab khác"
              >
                <ShieldAlert className="w-4 h-4 shrink-0" />
                <span className="tabular-nums">Rời tab: {tabSwitchesCount}</span>
              </div>
            )}

            {/* Countdown Clock */}
            <div
              className={`inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg border font-mono tabular-nums text-sm sm:text-base font-bold transition-colors whitespace-nowrap ${
                isUrgent
                  ? 'bg-rose-50 text-rose-700 border-rose-300'
                  : 'bg-slate-50 text-slate-900 border-slate-200'
              }`}
              aria-live="polite"
              title={isUrgent ? 'Sắp hết thời gian làm bài' : 'Thời gian còn lại'}
            >
              <Clock className={`w-4 h-4 shrink-0 ${isUrgent ? 'text-rose-600' : 'text-teal-600'}`} />
              <span>{timeFormatted}</span>
            </div>

            {/* Primary Submit Button */}
            <button
              type="button"
              onClick={() => setShowConfirmSubmit(true)}
              className="min-h-[38px] sm:min-h-[40px] px-3.5 sm:px-4 py-1.5 sm:py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm rounded-lg shadow-xs transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-1"
            >
              <Send className="w-4 h-4 shrink-0" />
              <span>Nộp bài</span>
            </button>
          </div>
        </div>
      </header>

      {/* Scrollable Exam Workspace — flex-1 overflow-y-auto prevents header overlap completely */}
      <div ref={scrollContainerRef} className="flex-1 min-h-0 overflow-y-auto">
        <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-5 sm:py-6 pb-12 space-y-5">
          {/* Mobile Compact Utility Row: Question Navigator Toggle + A-/A+ Font Controls */}
          <div className="lg:hidden space-y-3">
            <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
              <div className="flex items-center justify-between gap-2 px-3.5 py-2.5 bg-slate-50/70">
                <button
                  type="button"
                  onClick={() => setMobileNavOpen((prev) => !prev)}
                  aria-expanded={mobileNavOpen}
                  className="flex-1 min-w-0 flex items-center gap-2.5 text-left"
                >
                  <div className="w-9 h-9 rounded-lg bg-teal-600 text-white flex items-center justify-center shrink-0">
                    <LayoutGrid className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-900 truncate tabular-nums">
                      Danh sách câu ({totalCompleted}/{safeQuestions.length})
                    </p>
                    <p className="text-xs text-slate-600 truncate">
                      Câu {safeIndex + 1} · {currentSectionLabel}
                    </p>
                  </div>
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700 shrink-0 ml-auto pr-1">
                    <span>{mobileNavOpen ? 'Ẩn' : 'Mở'}</span>
                    {mobileNavOpen ? (
                      <ChevronUp className="w-4 h-4" />
                    ) : (
                      <ChevronDown className="w-4 h-4" />
                    )}
                  </span>
                </button>

                {/* Mobile Font Scale Controls (visible on < sm where top header hides it) */}
                <div
                  className="sm:hidden inline-flex items-center rounded-lg border border-slate-200 bg-white p-0.5 shrink-0"
                  role="group"
                  aria-label="Cỡ chữ"
                >
                  <button
                    type="button"
                    onClick={handleDecreaseFont}
                    disabled={fontScale === 'sm'}
                    className="px-2 py-1 text-xs font-bold text-slate-700 disabled:opacity-40 rounded"
                    aria-label="Thu nhỏ cỡ chữ"
                  >
                    A-
                  </button>
                  <button
                    type="button"
                    onClick={handleIncreaseFont}
                    disabled={fontScale === 'lg'}
                    className="px-2 py-1 text-xs font-bold text-slate-700 disabled:opacity-40 rounded"
                    aria-label="Phóng to cỡ chữ"
                  >
                    A+
                  </button>
                </div>
              </div>

              {mobileNavOpen && (
                <div className="p-2.5 border-t border-slate-200">
                  <ExamQuestionNavigator
                    sections={sectionGroups}
                    answers={answers}
                    currentIndex={safeIndex}
                    totalQuestions={safeQuestions.length}
                    totalCompleted={totalCompleted}
                    totalPartial={totalPartial}
                    collapsedSections={collapsedSections}
                    onToggleSectionCollapse={handleToggleSectionCollapse}
                    onSelectQuestion={(idx) => handleNavigateToQuestion(idx, true)}
                    showActions={false}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Main 2-Column Exam Layout (Auto-fit Desktop & Mobile) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left Column: Current Question Card (8 Cols) */}
            <section className="lg:col-span-8">
              <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-7 shadow-xs space-y-6">
                {/* Question Metadata Header & Flag Action */}
                <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-100">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="w-10 h-10 rounded-xl bg-teal-600 text-white font-bold text-base tabular-nums flex items-center justify-center shrink-0">
                      {safeIndex + 1}
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
                        <span className="font-bold text-slate-900 tabular-nums">
                          Câu {safeIndex + 1} / {safeQuestions.length}
                        </span>
                        <span aria-hidden="true" className="text-slate-300">·</span>
                        <span
                          className="font-medium text-slate-600 truncate max-w-md"
                          title={currentSectionLabel}
                        >
                          {currentSectionLabel}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Flag for Review */}
                  <button
                    type="button"
                    onClick={() => toggleFlag(currentQuestion.id)}
                    className={`min-h-[40px] px-3.5 py-2 rounded-xl text-sm font-semibold inline-flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 ${
                      currentAnswer.isMarkedForReview
                        ? 'bg-amber-50 text-amber-800 border border-amber-300'
                        : 'bg-slate-50 text-slate-700 border border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <Flag
                      className={`w-4 h-4 shrink-0 ${
                        currentAnswer.isMarkedForReview
                          ? 'fill-amber-500 text-amber-600'
                          : 'text-slate-500'
                      }`}
                    />
                    <span>
                      {currentAnswer.isMarkedForReview ? 'Đã đánh dấu xem lại' : 'Đánh dấu xem lại'}
                    </span>
                  </button>
                </div>

                {/* Question Stem (Large, comfortable reading size with ChemRenderer / KaTeX) */}
                <div className={`${activeTypography.stem} font-medium text-slate-900 break-words`}>
                  <ChemRenderer text={currentQuestion.content} />
                </div>

                {/* Diagram / Experiment Image */}
                {currentQuestion.imageUrl && (
                  <div className="my-4 rounded-xl overflow-hidden border border-slate-200 bg-slate-50/50 max-w-xl">
                    <img
                      src={currentQuestion.imageUrl}
                      alt="Hình minh họa câu hỏi"
                      referrerPolicy="no-referrer"
                      className="w-full max-h-[420px] object-contain"
                    />
                  </div>
                )}

                {/* Answer Input Area */}
                <div className="pt-1">
                  {/* Part I: Multiple Choice Options (Single or Multi-select) */}
                  {(currentQuestion.type === 'part1_single_choice' ||
                    currentQuestion.type === 'part1_multiple_choice') &&
                    currentQuestion.options &&
                    (() => {
                      const isMulti = currentQuestion.type === 'part1_multiple_choice';
                      const selectedMulti = Array.isArray(currentAnswer.selectedOptionIds)
                        ? currentAnswer.selectedOptionIds
                        : [];
                      return (
                        <div className="space-y-3">
                          <p className="text-sm font-semibold text-slate-600">
                            {isMulti
                              ? 'Chọn tất cả các phương án đúng:'
                              : 'Chọn một phương án đúng nhất:'}
                          </p>
                          <div
                            className={`grid grid-cols-1 ${
                              hasLongOption ? '' : 'md:grid-cols-2'
                            } gap-3.5`}
                          >
                            {currentQuestion.options.map((opt) => {
                              const isSelected = isMulti
                                ? selectedMulti.includes(opt.id)
                                : currentAnswer.selectedOptionId === opt.id;
                              return (
                                <button
                                  key={opt.id}
                                  type="button"
                                  onClick={() =>
                                    isMulti
                                      ? handleToggleMultiOption(opt.id)
                                      : handleSelectOption(opt.id)
                                  }
                                  aria-pressed={isSelected}
                                  className={`w-full text-left p-4 rounded-xl border-2 transition-colors flex items-start gap-3.5 select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-1 ${
                                    isSelected
                                      ? 'border-teal-600 bg-teal-50/70'
                                      : 'border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50'
                                  }`}
                                >
                                  <span
                                    className={`w-10 h-10 ${
                                      isMulti ? 'rounded-lg' : 'rounded-full'
                                    } flex items-center justify-center font-bold text-base shrink-0 transition-colors ${
                                      isSelected
                                        ? 'bg-teal-600 text-white'
                                        : 'bg-slate-100 text-slate-800 border border-slate-200'
                                    }`}
                                  >
                                    {opt.id}
                                  </span>
                                  <div
                                    className={`flex-1 min-w-0 ${activeTypography.option} font-normal text-slate-900 pt-1.5 break-words`}
                                  >
                                    <ChemRenderer text={opt.text} />
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })()}

                  {/* Part II: 4 True/False Statements */}
                  {currentQuestion.type === 'part2_true_false' &&
                    currentQuestion.statements &&
                    (() => {
                      const p2Prog = getQuestionProgress(currentQuestion, currentAnswer);
                      return (
                        <div className="space-y-3.5">
                          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                            <p className="font-semibold text-slate-600">
                              Chọn Đúng hoặc Sai cho từng ý dưới đây:
                            </p>
                            <span
                              className={`font-semibold tabular-nums ${
                                p2Prog.isCompleted
                                  ? 'text-emerald-700'
                                  : p2Prog.isPartial
                                  ? 'text-sky-700'
                                  : 'text-slate-500'
                              }`}
                            >
                              Đã chọn {p2Prog.answeredUnits}/{p2Prog.totalUnits} ý
                            </span>
                          </div>

                          <div className="space-y-3">
                            {currentQuestion.statements.map((stmt) => {
                              const val = currentAnswer.selectedStatements?.[stmt.id];
                              return (
                                <div
                                  key={stmt.id}
                                  className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                                >
                                  <div className="flex items-start gap-3 flex-1 min-w-0">
                                    <span className="w-9 h-9 rounded-lg bg-white border border-slate-200 text-teal-800 font-bold text-base flex items-center justify-center shrink-0">
                                      {stmt.id}
                                    </span>
                                    <div
                                      className={`flex-1 min-w-0 ${activeTypography.statement} font-normal text-slate-900 pt-1 break-words`}
                                    >
                                      <ChemRenderer text={stmt.statement} />
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                                    <button
                                      type="button"
                                      onClick={() => handleSelectStatement(stmt.id, true)}
                                      aria-pressed={val === true}
                                      className={`min-h-[42px] min-w-[76px] px-4 py-2 rounded-lg text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${
                                        val === true
                                          ? 'bg-emerald-600 text-white shadow-xs'
                                          : 'bg-white text-slate-700 border border-slate-300 hover:bg-emerald-50 hover:border-emerald-400'
                                      }`}
                                    >
                                      Đúng
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleSelectStatement(stmt.id, false)}
                                      aria-pressed={val === false}
                                      className={`min-h-[42px] min-w-[76px] px-4 py-2 rounded-lg text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-600 ${
                                        val === false
                                          ? 'bg-rose-600 text-white shadow-xs'
                                          : 'bg-white text-slate-700 border border-slate-300 hover:bg-rose-50 hover:border-rose-400'
                                      }`}
                                    >
                                      Sai
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })()}

                  {/* Part III: Short Answer */}
                  {currentQuestion.type === 'part3_short_answer' &&
                    (() => {
                      const qProg = getQuestionProgress(currentQuestion, currentAnswer);
                      return (
                        <div className="space-y-3">
                          <label
                            htmlFor={`short-answer-${currentQuestion.id}`}
                            className="block text-sm font-semibold text-slate-700"
                          >
                            Nhập kết quả tính toán hoặc câu trả lời ngắn:
                          </label>
                          <div className="max-w-lg">
                            <input
                              id={`short-answer-${currentQuestion.id}`}
                              type="text"
                              value={currentAnswer.textAnswer || ''}
                              onChange={(e) => handleTextAnswerChange(e.target.value)}
                              placeholder="Nhập đáp án (VD: 4 hoặc 6.72 hoặc 6,72)..."
                              className={`w-full px-4 py-3.5 ${activeTypography.input} font-semibold rounded-xl border-2 focus:outline-none bg-white transition-colors ${
                                qProg.invalidInput
                                  ? 'border-amber-500 focus:border-amber-600'
                                  : 'border-slate-300 focus:border-teal-600'
                              }`}
                            />
                            {qProg.invalidInput ? (
                              <p className="text-sm text-amber-700 font-medium mt-2">
                                Câu này yêu cầu đáp án dạng số hợp lệ (VD: 4, -2.5 hoặc 6,72).
                              </p>
                            ) : (
                              <p className="text-sm text-slate-500 mt-2">
                                Hỗ trợ cả dấu chấm (.) và dấu phẩy (,) thập phân. Hệ thống tự động tính sai số cho phép.
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })()}
                </div>

                {/* Bottom Navigation: Prev / Progress / Next */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-5 border-t border-slate-100">
                  <button
                    type="button"
                    disabled={safeIndex === 0}
                    onClick={() => handleNavigateToQuestion(safeIndex - 1)}
                    className="min-h-[44px] px-4 sm:px-5 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-700 font-semibold text-sm disabled:opacity-40 hover:bg-slate-50 transition-colors inline-flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <ChevronLeft className="w-4 h-4 shrink-0" />
                    <span>Câu trước</span>
                  </button>

                  <span className="text-sm text-slate-600 font-medium tabular-nums">
                    Đã hoàn thành{' '}
                    <strong className="text-teal-700 font-bold">{totalCompleted}</strong> /{' '}
                    {safeQuestions.length} câu
                  </span>

                  <button
                    type="button"
                    disabled={safeIndex === safeQuestions.length - 1}
                    onClick={() => handleNavigateToQuestion(safeIndex + 1)}
                    className="min-h-[44px] px-4 sm:px-5 py-2.5 rounded-xl bg-teal-600 text-white font-semibold text-sm disabled:opacity-40 hover:bg-teal-700 transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shadow-xs"
                  >
                    <span>Câu tiếp theo</span>
                    <ChevronRight className="w-4 h-4 shrink-0" />
                  </button>
                </div>
              </div>
            </section>

            {/* Right Column: Desktop Sticky Grouped Question Navigator (4 Cols) */}
            <aside className="hidden lg:block lg:col-span-4 lg:sticky lg:top-6">
              <div className="max-h-[calc(100dvh-7.5rem)] overflow-y-auto rounded-2xl">
                <ExamQuestionNavigator
                  sections={sectionGroups}
                  answers={answers}
                  currentIndex={safeIndex}
                  totalQuestions={safeQuestions.length}
                  totalCompleted={totalCompleted}
                  totalPartial={totalPartial}
                  collapsedSections={collapsedSections}
                  onToggleSectionCollapse={handleToggleSectionCollapse}
                  onSelectQuestion={(idx) => handleNavigateToQuestion(idx, false)}
                  onRequestSubmit={() => setShowConfirmSubmit(true)}
                  onRequestExit={() => setShowConfirmExit(true)}
                  showActions={true}
                />
              </div>
            </aside>
          </div>
        </div>
      </div>

      {/* Confirmation Exit Modal */}
      {showConfirmExit && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl border border-slate-200 space-y-4">
            <div className="w-12 h-12 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center mx-auto">
              <AlertCircle className="w-6 h-6" />
            </div>

            <div className="text-center space-y-1.5">
              <h3 className="text-lg font-bold text-slate-900">Rời khỏi phòng thi?</h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                Dữ liệu chưa nộp sẽ không được tính điểm. Bạn có chắc muốn thoát?
              </p>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowConfirmExit(false)}
                className="flex-1 min-h-[44px] py-2.5 rounded-xl border border-slate-200 text-slate-700 text-sm font-semibold hover:bg-slate-50 transition-colors"
              >
                Ở lại làm bài
              </button>
              <button
                type="button"
                onClick={onExitWithoutSave}
                className="flex-1 min-h-[44px] py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold shadow-xs transition-colors"
              >
                Rời phòng thi
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Submit Modal */}
      {showConfirmSubmit && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl border border-slate-200 space-y-4">
            <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto">
              <Send className="w-6 h-6" />
            </div>

            <div className="text-center space-y-2">
              <h3 className="text-lg font-bold text-slate-900">Xác nhận nộp bài thi?</h3>
              <p className="text-sm text-slate-600 leading-relaxed tabular-nums">
                Bạn đã hoàn thành đầy đủ{' '}
                <strong className="text-emerald-700">{totalCompleted}</strong> trên tổng số{' '}
                <strong>{safeQuestions.length}</strong> câu hỏi.
              </p>
              {totalCompleted < safeQuestions.length && (
                <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 p-3 rounded-xl font-medium">
                  Lưu ý: Vẫn còn {safeQuestions.length - totalCompleted} câu chưa hoàn thành đầy đủ
                  {totalPartial > 0
                    ? ` (trong đó ${totalPartial} câu Đúng/Sai mới trả lời một phần)`
                    : ''}
                  .
                </p>
              )}
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowConfirmSubmit(false)}
                className="flex-1 min-h-[44px] py-2.5 rounded-xl border border-slate-200 text-slate-700 text-sm font-semibold hover:bg-slate-50 transition-colors"
              >
                Tiếp tục làm bài
              </button>
              <button
                type="button"
                onClick={() => handleSubmit(false)}
                className="flex-1 min-h-[44px] py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold shadow-xs transition-colors"
              >
                Đồng ý nộp bài
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
