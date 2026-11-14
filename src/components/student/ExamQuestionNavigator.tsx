import React from 'react';
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Flag,
  LayoutGrid,
} from 'lucide-react';
import { QuestionType, StudentAnswer } from '../../types';
import {
  ExamSectionGroup,
  getQuestionProgress,
  getSectionProgressSummary,
} from '../../utils/examSectionGrouping';

interface ExamQuestionNavigatorProps {
  sections: ExamSectionGroup[];
  answers: Record<string, StudentAnswer>;
  currentIndex: number;
  totalQuestions: number;
  totalCompleted: number;
  totalPartial: number;
  collapsedSections: Record<string, boolean>;
  onToggleSectionCollapse: (sectionKey: string) => void;
  onSelectQuestion: (index: number) => void;
  onRequestSubmit?: () => void;
  onRequestExit?: () => void;
  showActions?: boolean;
}

const SECTION_ACCENTS: Record<
  QuestionType,
  { headerBg: string; badgeText: string; dot: string }
> = {
  part1_single_choice: {
    headerBg: 'bg-blue-50/70 border-blue-100',
    badgeText: 'text-blue-700',
    dot: 'bg-blue-600',
  },
  part2_true_false: {
    headerBg: 'bg-indigo-50/70 border-indigo-100',
    badgeText: 'text-indigo-700',
    dot: 'bg-indigo-600',
  },
  part3_short_answer: {
    headerBg: 'bg-purple-50/70 border-purple-100',
    badgeText: 'text-purple-700',
    dot: 'bg-purple-600',
  },
};

export const ExamQuestionNavigator: React.FC<ExamQuestionNavigatorProps> = ({
  sections,
  answers,
  currentIndex,
  totalQuestions,
  totalCompleted,
  totalPartial,
  collapsedSections,
  onToggleSectionCollapse,
  onSelectQuestion,
  onRequestSubmit,
  onRequestExit,
  showActions = true,
}) => {
  const hasPart2 = sections.some(s => s.partType === 'part2_true_false');
  const progressPercent =
    totalQuestions > 0 ? Math.round((totalCompleted / totalQuestions) * 100) : 0;

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-xs space-y-4">
      {/* Header + Overall Progress */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xs font-extrabold uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
            <LayoutGrid className="w-3.5 h-3.5 text-blue-600 shrink-0" />
            <span>Điều hướng câu hỏi</span>
          </h2>
          <span className="text-xs font-extrabold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-lg">
            {totalCompleted}/{totalQuestions}
          </span>
        </div>

        <div className="space-y-1">
          <p className="text-[11px] font-semibold text-slate-600">
            Tổng cộng: Đã hoàn thành{' '}
            <span className="font-extrabold text-slate-900">
              {totalCompleted}/{totalQuestions}
            </span>{' '}
            câu
            {totalPartial > 0 && (
              <span className="text-sky-700 font-medium">
                {' '}
                ({totalPartial} câu làm dở)
              </span>
            )}
          </p>
          <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-500 transition-all duration-300 rounded-full"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      </div>

      {/* Status Legend */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[10px] text-slate-600 border-y border-slate-100 py-2.5">
        <div className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded bg-emerald-500 border border-emerald-600 shrink-0" />
          <span>Đã trả lời đủ</span>
        </div>
        {hasPart2 && (
          <div className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded bg-sky-100 border border-sky-400 shrink-0" />
            <span>Chưa hoàn thành</span>
          </div>
        )}
        <div className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded bg-slate-100 border border-slate-300 shrink-0" />
          <span>Chưa làm</span>
        </div>
        <div className="flex items-center gap-1">
          <Flag className="w-2.5 h-2.5 fill-amber-400 text-amber-500 shrink-0" />
          <span>Xem lại</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded bg-white border-2 border-blue-600 shrink-0" />
          <span>Đang xem</span>
        </div>
      </div>

      {/* Section Groups (PHẦN I, PHẦN II, PHẦN III) */}
      <div className="space-y-3">
        {sections.map(section => {
          const isCollapsed = !!collapsedSections[section.key];
          const summary = getSectionProgressSummary(section, answers);
          const accent = SECTION_ACCENTS[section.partType];

          return (
            <div
              key={section.key}
              className="border border-slate-200/90 rounded-xl overflow-hidden bg-white"
            >
              {/* Section Header + Collapse Toggle */}
              <button
                type="button"
                onClick={() => onToggleSectionCollapse(section.key)}
                aria-expanded={!isCollapsed}
                className={`w-full px-3 py-2 text-left flex items-start justify-between gap-2 transition-colors border-b ${
                  isCollapsed ? 'border-transparent' : 'border-slate-100'
                } ${accent.headerBg} hover:brightness-97`}
              >
                <div className="min-w-0 flex-1 space-y-0.5">
                  <div className="flex items-center gap-1.5">
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${accent.dot}`} />
                    <span className="text-[11px] font-extrabold text-slate-900 leading-snug break-words">
                      {section.title}
                    </span>
                  </div>
                  <p className={`text-[10px] font-semibold pl-3 ${accent.badgeText}`}>
                    {summary.label}
                  </p>
                </div>

                <span
                  className="text-slate-500 p-0.5 rounded-md shrink-0 mt-0.5"
                  aria-hidden="true"
                >
                  {isCollapsed ? (
                    <ChevronDown className="w-4 h-4" />
                  ) : (
                    <ChevronUp className="w-4 h-4" />
                  )}
                </span>
              </button>

              {/* Question Number Grid */}
              {!isCollapsed && (
                <div className="p-2.5 grid grid-cols-6 gap-1.5 bg-white">
                  {section.items.map(item => {
                    const ans = answers[item.question.id];
                    const progress = getQuestionProgress(item.question, ans);
                    const isCurrent = item.index === currentIndex;

                    let btnClass =
                      'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200/70';

                    if (progress.isCompleted) {
                      btnClass = progress.isFlagged
                        ? 'bg-emerald-500 text-white border-amber-400 font-bold hover:bg-emerald-600'
                        : 'bg-emerald-500 text-white border-emerald-600 font-bold hover:bg-emerald-600';
                    } else if (progress.isPartial) {
                      btnClass = progress.isFlagged
                        ? 'bg-amber-50 text-amber-900 border-amber-400 font-bold hover:bg-amber-100'
                        : 'bg-sky-50 text-sky-800 border-sky-300 font-semibold hover:bg-sky-100';
                    } else if (progress.isFlagged) {
                      btnClass =
                        'bg-amber-100 text-amber-950 border-amber-400 font-bold hover:bg-amber-200';
                    } else if (isCurrent) {
                      btnClass =
                        'bg-blue-50 text-blue-700 border-blue-500 font-bold';
                    }

                    if (isCurrent) {
                      btnClass += ' ring-2 ring-blue-600 ring-offset-1 shadow-xs';
                    }

                    let statusDesc = 'Chưa làm';
                    if (progress.isCompleted) {
                      statusDesc = 'Đã hoàn thành';
                    } else if (progress.isPartial) {
                      statusDesc = `Chưa hoàn thành (${progress.answeredUnits}/${progress.totalUnits} ý)`;
                    } else if (progress.invalidInput) {
                      statusDesc = 'Chưa hợp lệ';
                    }
                    if (progress.isFlagged) {
                      statusDesc += ' • Đánh dấu xem lại';
                    }

                    return (
                      <button
                        key={item.question.id}
                        type="button"
                        onClick={() => onSelectQuestion(item.index)}
                        title={`Câu ${item.questionNumber} (${section.title}) — ${statusDesc}`}
                        aria-label={`Câu ${item.questionNumber}, ${section.title}, ${statusDesc}`}
                        aria-current={isCurrent ? 'step' : undefined}
                        className={`relative h-9 rounded-lg border text-xs flex items-center justify-center transition-all select-none ${btnClass}`}
                      >
                        <span>{item.questionNumber}</span>

                        {/* Review Flag Indicator */}
                        {progress.isFlagged && (
                          <span
                            className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-amber-400 border border-white flex items-center justify-center shadow-2xs"
                            aria-hidden="true"
                          >
                            <Flag className="w-2 h-2 fill-amber-950 text-amber-950" />
                          </span>
                        )}

                        {/* Partial Part II progress indicator */}
                        {progress.isPartial && (
                          <span
                            className="absolute bottom-0.5 right-0.5 text-[8px] leading-none font-bold text-sky-700"
                            aria-hidden="true"
                          >
                            {progress.answeredUnits}/{progress.totalUnits}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Submit & Exit Action Footer (Sidebar) */}
      {showActions && onRequestSubmit && onRequestExit && (
        <div className="pt-2 border-t border-slate-100 space-y-2">
          <button
            type="button"
            onClick={onRequestSubmit}
            className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors flex items-center justify-center gap-2"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>Nộp bài & Hoàn thành</span>
          </button>

          <button
            type="button"
            onClick={onRequestExit}
            className="w-full py-1.5 text-slate-500 hover:text-slate-700 text-xs text-center"
          >
            Rời khỏi phòng thi
          </button>
        </div>
      )}
    </div>
  );
};
