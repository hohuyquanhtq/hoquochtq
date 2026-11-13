import React, { useState, useEffect, useRef } from 'react';
import confetti from 'canvas-confetti';
import { Exam, StudentAnswer, Question, StudentSubmission } from '../../types';
import { 
  Clock, 
  Flag, 
  CheckCircle2, 
  AlertCircle, 
  ChevronLeft, 
  ChevronRight, 
  Send, 
  Sparkles,
  ShieldAlert,
  HelpCircle,
  FlaskConical
} from 'lucide-react';
import { ChemRenderer } from '../../utils/chemRenderer';
import { gradeSubmission } from '../../utils/gradingEngine';

interface ExamTakerProps {
  exam: Exam;
  studentName: string;
  studentClass: string;
  onFinishExam: (submission: StudentSubmission) => void;
  onExitWithoutSave: () => void;
}

export const ExamTaker: React.FC<ExamTakerProps> = ({
  exam,
  studentName,
  studentClass,
  onFinishExam,
  onExitWithoutSave,
}) => {
  // Local storage auto-save key
  const storageKey = `chemtest_progress_${exam.id}_${studentName.replace(/\s+/g, '_')}`;

  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, StudentAnswer>>({});
  const [startedAt] = useState<string>(() => new Date().toISOString());
  
  // Timer state (seconds)
  const [timeLeftSeconds, setTimeLeftSeconds] = useState(exam.durationMinutes * 60);
  const [tabSwitchesCount, setTabSwitchesCount] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConfirmSubmit, setShowConfirmSubmit] = useState(false);
  const [showConfirmExit, setShowConfirmExit] = useState(false);

  // Restore saved state from localStorage if available
  useEffect(() => {
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.answers) setAnswers(parsed.answers);
        if (parsed.timeLeftSeconds && parsed.timeLeftSeconds > 5) {
          setTimeLeftSeconds(parsed.timeLeftSeconds);
        }
      } catch {}
    }
  }, [storageKey]);

  // Auto-save answers whenever they change
  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify({
      answers,
      timeLeftSeconds,
      timestamp: Date.now(),
    }));
  }, [answers, timeLeftSeconds, storageKey]);

  // Anti-cheat tab switch monitoring
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        setTabSwitchesCount(prev => prev + 1);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  // Countdown timer
  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeftSeconds(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          handleSubmit(true); // Auto-submit when time expires
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const currentQuestion = exam.questions[currentIndex];
  const currentAnswer = answers[currentQuestion?.id] || {
    questionId: currentQuestion?.id,
    questionType: currentQuestion?.type,
  };

  const handleSelectOption = (optionId: string) => {
    setAnswers(prev => ({
      ...prev,
      [currentQuestion.id]: {
        ...prev[currentQuestion.id],
        questionId: currentQuestion.id,
        questionType: 'part1_single_choice',
        selectedOptionId: optionId,
      },
    }));
  };

  const handleSelectStatement = (statementId: string, value: boolean) => {
    setAnswers(prev => {
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
    setAnswers(prev => ({
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
    setAnswers(prev => ({
      ...prev,
      [questionId]: {
        ...prev[questionId],
        questionId,
        questionType: exam.questions.find(q => q.id === questionId)!.type,
        isMarkedForReview: !prev[questionId]?.isMarkedForReview,
      },
    }));
  };

  const handleSubmit = (autoTimeout = false) => {
    if (isSubmitting) return;
    setIsSubmitting(true);

    // Trigger celebration confetti
    try {
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 }
      });
    } catch {}

    // Clean up local progress
    localStorage.removeItem(storageKey);

    const submission = gradeSubmission(
      exam,
      `st_${Date.now()}`,
      studentName,
      studentClass,
      startedAt,
      answers,
      tabSwitchesCount
    );

    if (autoTimeout) {
      submission.status = 'timed_out';
    }

    onFinishExam(submission);
  };

  // Format countdown mm:ss
  const mins = Math.floor(timeLeftSeconds / 60);
  const secs = timeLeftSeconds % 60;
  const timeFormatted = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  const isUrgent = timeLeftSeconds < 300; // Under 5 mins

  // Count answered questions
  const answeredCount = exam.questions.filter(q => {
    const a = answers[q.id];
    if (!a) return false;
    if (q.type === 'part1_single_choice') return !!a.selectedOptionId;
    if (q.type === 'part2_true_false') return a.selectedStatements && Object.keys(a.selectedStatements).length > 0;
    if (q.type === 'part3_short_answer') return !!a.textAnswer && a.textAnswer.trim().length > 0;
    return false;
  }).length;

  return (
    <div className="max-w-6xl mx-auto space-y-4 pb-12">
      
      {/* Top Test Header Bar */}
      <div className="sticky top-16 z-30 bg-white/95 backdrop-blur-md border border-slate-200 rounded-2xl p-4 shadow-sm flex items-center justify-between gap-4">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600">
            Thí sinh: {studentName} ({studentClass}) • Mã đề: {exam.code}
          </span>
          <h1 className="text-sm sm:text-base font-extrabold text-slate-900 truncate max-w-lg">
            {exam.title}
          </h1>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {/* Tab switches warning badge */}
          {tabSwitchesCount > 0 && (
            <div className="hidden sm:flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold">
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>Rời tab: {tabSwitchesCount}</span>
            </div>
          )}

          {/* Countdown Clock */}
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl font-mono text-sm sm:text-base font-extrabold transition-colors ${
            isUrgent 
              ? 'bg-rose-100 text-rose-700 animate-pulse border border-rose-300' 
              : 'bg-slate-100 text-slate-800 border border-slate-200'
          }`}>
            <Clock className={`w-4 h-4 ${isUrgent ? 'text-rose-600' : 'text-slate-500'}`} />
            <span>{timeFormatted}</span>
          </div>

          {/* Submit Button */}
          <button
            onClick={() => setShowConfirmSubmit(true)}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs sm:text-sm rounded-xl shadow-md shadow-emerald-500/20 transition-all flex items-center gap-1.5"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Nộp bài</span>
          </button>
        </div>
      </div>

      {/* Main Examination Layout: 2 Columns */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
        
        {/* Left Column: Current Question Workspace (3 Cols) */}
        <div className="lg:col-span-3 space-y-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-5">
            
            {/* Question Header & Flag Action */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="w-8 h-8 rounded-xl bg-blue-600 text-white font-extrabold text-sm flex items-center justify-center">
                  {currentIndex + 1}
                </span>
                <span className="font-mono text-xs font-bold text-slate-500">
                  Câu {currentIndex + 1} / {exam.questions.length}
                </span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md uppercase ${
                  currentQuestion.type === 'part1_single_choice'
                    ? 'bg-blue-100 text-blue-800'
                    : currentQuestion.type === 'part2_true_false'
                    ? 'bg-indigo-100 text-indigo-800'
                    : 'bg-purple-100 text-purple-800'
                }`}>
                  {currentQuestion.type === 'part1_single_choice' 
                    ? 'Phần I: 4 Lựa chọn' 
                    : currentQuestion.type === 'part2_true_false' 
                    ? 'Phần II: Đúng - Sai' 
                    : 'Phần III: Trả lời ngắn'}
                </span>
              </div>

              {/* Flag for Review */}
              <button
                onClick={() => toggleFlag(currentQuestion.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                  currentAnswer.isMarkedForReview
                    ? 'bg-amber-100 text-amber-800 border border-amber-300 font-bold'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <Flag className={`w-3.5 h-3.5 ${currentAnswer.isMarkedForReview ? 'fill-amber-500 text-amber-500' : ''}`} />
                <span>{currentAnswer.isMarkedForReview ? 'Đã gắn cờ xem lại' : 'Đánh dấu xem lại'}</span>
              </button>
            </div>

            {/* Question Text with ChemRenderer */}
            <div className="text-base font-semibold text-slate-900 leading-relaxed py-2">
              <ChemRenderer text={currentQuestion.content} />
            </div>

            {/* Image / Diagram if available */}
            {currentQuestion.imageUrl && (
              <div className="my-3 rounded-xl overflow-hidden border border-slate-200 max-w-md">
                <img src={currentQuestion.imageUrl} alt="Sơ đồ thí nghiệm" className="w-full object-contain" />
              </div>
            )}

            {/* Answer Input Area */}
            <div className="pt-2">
              
              {/* Part I: 4-Choice Options */}
              {currentQuestion.type === 'part1_single_choice' && currentQuestion.options && (
                <div className="space-y-2.5">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                    Chọn một đáp án đúng nhất:
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {currentQuestion.options.map((opt) => {
                      const isSelected = currentAnswer.selectedOptionId === opt.id;
                      return (
                        <div
                          key={opt.id}
                          onClick={() => handleSelectOption(opt.id)}
                          className={`p-3.5 rounded-xl border-2 cursor-pointer transition-all flex items-start gap-3 select-none ${
                            isSelected
                              ? 'border-blue-600 bg-blue-50/80 shadow-xs'
                              : 'border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50'
                          }`}
                        >
                          <div className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs shrink-0 transition-colors ${
                            isSelected
                              ? 'bg-blue-600 text-white'
                              : 'bg-slate-100 text-slate-700'
                          }`}>
                            {opt.id}
                          </div>
                          <div className="flex-1 text-xs sm:text-sm font-medium text-slate-900 pt-0.5">
                            <ChemRenderer text={opt.text} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Part II: 4 True/False Statements */}
              {currentQuestion.type === 'part2_true_false' && currentQuestion.statements && (
                <div className="space-y-3">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                    Chọn Đúng hoặc Sai cho mỗi mệnh đề:
                  </p>
                  <div className="space-y-2">
                    {currentQuestion.statements.map((stmt) => {
                      const val = currentAnswer.selectedStatements?.[stmt.id];
                      return (
                        <div
                          key={stmt.id}
                          className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs sm:text-sm"
                        >
                          <div className="flex items-start gap-2.5 flex-1">
                            <span className="font-bold text-indigo-700 shrink-0">{stmt.id})</span>
                            <span className="font-medium text-slate-900">
                              <ChemRenderer text={stmt.statement} />
                            </span>
                          </div>

                          <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                            <button
                              type="button"
                              onClick={() => handleSelectStatement(stmt.id, true)}
                              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                val === true
                                  ? 'bg-emerald-600 text-white shadow-xs'
                                  : 'bg-white text-slate-700 border border-slate-200 hover:bg-emerald-50 hover:border-emerald-300'
                              }`}
                            >
                              Đúng
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSelectStatement(stmt.id, false)}
                              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                val === false
                                  ? 'bg-rose-600 text-white shadow-xs'
                                  : 'bg-white text-slate-700 border border-slate-200 hover:bg-rose-50 hover:border-rose-300'
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
              )}

              {/* Part III: Short Answer */}
              {currentQuestion.type === 'part3_short_answer' && (
                <div className="space-y-3">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                    Điền kết quả tính toán hoặc câu trả lời ngắn:
                  </p>
                  <div className="max-w-md">
                    <input
                      type="text"
                      value={currentAnswer.textAnswer || ''}
                      onChange={(e) => handleTextAnswerChange(e.target.value)}
                      placeholder="Nhập số thập phân (VD: 4 hoặc 6.72 hoặc 6,72)..."
                      className="w-full p-3.5 text-sm font-semibold rounded-xl border-2 border-slate-300 focus:border-blue-600 focus:outline-none bg-slate-50"
                    />
                    <p className="text-[11px] text-slate-500 mt-1.5">
                      Hỗ trợ cả dấu chấm (.) và dấu phẩy (,) thập phân. Hệ thống tự động tính sai số cho phép.
                    </p>
                  </div>
                </div>
              )}

            </div>

            {/* Bottom Nav: Prev / Next */}
            <div className="flex items-center justify-between pt-4 border-t border-slate-100">
              <button
                disabled={currentIndex === 0}
                onClick={() => setCurrentIndex(prev => prev - 1)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 font-semibold text-xs disabled:opacity-40 hover:bg-slate-50 transition-colors flex items-center gap-1.5"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>Câu trước</span>
              </button>

              <span className="text-xs text-slate-500 font-medium">
                Đã làm: <b className="text-blue-600">{answeredCount}</b> / {exam.questions.length} câu
              </span>

              <button
                disabled={currentIndex === exam.questions.length - 1}
                onClick={() => setCurrentIndex(prev => prev + 1)}
                className="px-4 py-2 rounded-xl bg-blue-600 text-white font-semibold text-xs disabled:opacity-40 hover:bg-blue-700 transition-colors flex items-center gap-1.5"
              >
                <span>Câu tiếp theo</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

          </div>
        </div>

        {/* Right Column: Question Navigator Palette (1 Col) */}
        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center justify-between">
              <span>Bảng danh sách câu hỏi</span>
              <span className="text-blue-600">{answeredCount}/{exam.questions.length}</span>
            </h2>

            {/* Color Legend */}
            <div className="grid grid-cols-3 gap-1.5 text-[10px] text-slate-600 border-b border-slate-100 pb-3">
              <div className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded bg-emerald-500" />
                <span>Đã làm</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded bg-amber-400" />
                <span>Đã gắn cờ</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded bg-slate-200" />
                <span>Chưa làm</span>
              </div>
            </div>

            {/* Questions Grid */}
            <div className="grid grid-cols-5 gap-2">
              {exam.questions.map((q, idx) => {
                const ans = answers[q.id];
                const isAnswered = ans && (
                  (q.type === 'part1_single_choice' && !!ans.selectedOptionId) ||
                  (q.type === 'part2_true_false' && ans.selectedStatements && Object.keys(ans.selectedStatements).length > 0) ||
                  (q.type === 'part3_short_answer' && !!ans.textAnswer && ans.textAnswer.trim().length > 0)
                );
                const isFlagged = ans?.isMarkedForReview;
                const isCurrent = idx === currentIndex;

                let btnClass = 'bg-slate-100 text-slate-700 border-slate-200';
                if (isAnswered) {
                  btnClass = 'bg-emerald-500 text-white border-emerald-600 font-bold';
                }
                if (isFlagged) {
                  btnClass = 'bg-amber-400 text-amber-950 border-amber-500 font-bold';
                }
                if (isCurrent) {
                  btnClass += ' ring-2 ring-blue-600 ring-offset-2';
                }

                return (
                  <button
                    key={q.id}
                    onClick={() => setCurrentIndex(idx)}
                    className={`h-9 rounded-xl border text-xs font-semibold flex items-center justify-center transition-all ${btnClass}`}
                  >
                    {idx + 1}
                  </button>
                );
              })}
            </div>

            <div className="pt-3 border-t border-slate-100 space-y-2">
              <button
                onClick={() => setShowConfirmSubmit(true)}
                className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors flex items-center justify-center gap-2"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Nộp bài & Hoàn thành</span>
              </button>
              
              <button
                onClick={() => setShowConfirmExit(true)}
                className="w-full py-1.5 text-slate-500 hover:text-slate-700 text-xs text-center"
              >
                Rời khỏi phòng thi
              </button>
            </div>
          </div>
        </div>

      </div>

      {/* Confirmation Exit Modal */}
      {showConfirmExit && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl border border-slate-200 space-y-4">
            <div className="w-12 h-12 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center mx-auto">
              <AlertCircle className="w-6 h-6" />
            </div>

            <div className="text-center">
              <h3 className="text-lg font-bold text-slate-900">Rời khỏi phòng thi?</h3>
              <p className="text-xs text-slate-600 mt-1">
                Dữ liệu chưa nộp sẽ không được tính điểm. Bạn có chắc muốn thoát?
              </p>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setShowConfirmExit(false)}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-700 text-xs font-bold hover:bg-slate-50"
              >
                Ở lại làm bài
              </button>
              <button
                onClick={onExitWithoutSave}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-md shadow-rose-500/20"
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
            <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
              <Send className="w-6 h-6" />
            </div>

            <div className="text-center">
              <h3 className="text-lg font-bold text-slate-900">Xác nhận nộp bài thi?</h3>
              <p className="text-xs text-slate-600 mt-1">
                Bạn đã hoàn thành <b className="text-emerald-600">{answeredCount}</b> trên tổng số <b>{exam.questions.length}</b> câu hỏi.
              </p>
              {answeredCount < exam.questions.length && (
                <p className="text-xs text-amber-700 bg-amber-50 p-2 rounded-lg mt-2 font-medium">
                  Lưu ý: Vẫn còn {exam.questions.length - answeredCount} câu chưa có câu trả lời.
                </p>
              )}
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setShowConfirmSubmit(false)}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-700 text-xs font-bold hover:bg-slate-50"
              >
                Tiếp tục làm bài
              </button>
              <button
                onClick={() => handleSubmit(false)}
                className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-md shadow-emerald-500/20"
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
