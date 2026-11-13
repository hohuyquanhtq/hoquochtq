import React from 'react';
import { StudentSubmission, Exam } from '../../types';
import { 
  Award, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  ArrowLeft, 
  Share2, 
  FileText, 
  AlertCircle,
  HelpCircle,
  ShieldCheck,
  FlaskConical
} from 'lucide-react';
import { ChemRenderer } from '../../utils/chemRenderer';

interface ExamResultViewProps {
  submission: StudentSubmission;
  exam?: Exam;
  onBackToHome: () => void;
}

export const ExamResultView: React.FC<ExamResultViewProps> = ({
  submission,
  exam,
  onBackToHome,
}) => {
  const showScore = exam ? !!exam.showScoreAfterSubmit : true;
  const showAnswers = exam ? !!exam.showAnswersAfterSubmit : false;
  const showSolutions = exam ? !!exam.showSolutionsAfterSubmit : false;

  let scoreColor = 'text-blue-700 bg-blue-50 border-blue-200';
  let badgeTitle = 'Đạt Yêu Cầu';
  if (submission.totalScore >= 9.0) {
    scoreColor = 'text-emerald-700 bg-emerald-50 border-emerald-300';
    badgeTitle = 'Xuất Sắc';
  } else if (submission.totalScore >= 8.0) {
    scoreColor = 'text-indigo-700 bg-indigo-50 border-indigo-200';
    badgeTitle = 'Học Lực Giỏi';
  } else if (submission.totalScore < 5.0) {
    scoreColor = 'text-rose-700 bg-rose-50 border-rose-200';
    badgeTitle = 'Cần Cố Gắng Thêm';
  }

  const durationMins = Math.floor(submission.durationSeconds / 60);
  const durationSecs = submission.durationSeconds % 60;

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      
      {/* Top Navigation */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBackToHome}
          className="px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-2 shadow-2xs transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Quay lại trang học sinh</span>
        </button>

        <span className="text-xs text-slate-500 font-mono">
          Mã bài thi: {submission.examCode}
        </span>
      </div>

      {/* Hero Score Card */}
      <div className={`p-6 sm:p-8 rounded-3xl border-2 text-center shadow-lg ${scoreColor} space-y-4`}>
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/80 backdrop-blur-xs text-xs font-bold shadow-2xs">
          <Award className="w-4 h-4" />
          <span>{showScore && showAnswers ? `Kết quả thi trực tuyến • ${badgeTitle}` : 'Đã ghi nhận bài làm trực tuyến'}</span>
        </div>

        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900">
            {submission.studentName}
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 mt-1">
            Lớp: {submission.studentClass} • {submission.examTitle}
          </p>
        </div>

        {/* Big Score Display */}
        {showScore && showAnswers ? (
          <>
            <div className="py-2">
              <span className="text-5xl sm:text-6xl font-black tracking-tight text-slate-900">
                {submission.totalScore.toFixed(2)}
              </span>
              <span className="text-xl font-bold text-slate-500"> / 10.0</span>
            </div>

            {/* Detailed Breakdown Pill Row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-2xl mx-auto text-xs">
              <div className="p-3 bg-white/90 rounded-2xl border border-slate-200/60 shadow-2xs">
                <p className="text-[10px] text-slate-500 font-medium">Phần I (Trắc nghiệm)</p>
                <p className="text-base font-extrabold text-blue-700 mt-0.5">{submission.part1Score.toFixed(2)}đ</p>
              </div>
              <div className="p-3 bg-white/90 rounded-2xl border border-slate-200/60 shadow-2xs">
                <p className="text-[10px] text-slate-500 font-medium">Phần II (Đúng / Sai)</p>
                <p className="text-base font-extrabold text-indigo-700 mt-0.5">{submission.part2Score.toFixed(2)}đ</p>
              </div>
              <div className="p-3 bg-white/90 rounded-2xl border border-slate-200/60 shadow-2xs">
                <p className="text-[10px] text-slate-500 font-medium">Phần III (Trả lời ngắn)</p>
                <p className="text-base font-extrabold text-purple-700 mt-0.5">{submission.part3Score.toFixed(2)}đ</p>
              </div>
              <div className="p-3 bg-white/90 rounded-2xl border border-slate-200/60 shadow-2xs">
                <p className="text-[10px] text-slate-500 font-medium">Thời gian làm</p>
                <p className="text-base font-extrabold text-slate-800 mt-0.5">{durationMins}p {durationSecs}s</p>
              </div>
            </div>
          </>
        ) : (
          <div className="p-4 bg-white/90 rounded-2xl border border-slate-200/80 max-w-xl mx-auto text-xs text-slate-700 font-medium">
            Bài làm của bạn đã được lưu an toàn lúc {new Date(submission.submittedAt).toLocaleTimeString('vi-VN')} (Thời gian làm: {durationMins}p {durationSecs}s).
          </div>
        )}
      </div>

      {/* Answer withholding notice */}
      {!showAnswers && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl text-amber-900 text-xs flex items-center gap-3">
          <ShieldCheck className="w-5 h-5 text-amber-600 shrink-0" />
          <span>
            Đáp án đúng và lời giải chi tiết hiện được bảo mật theo thiết lập của giáo viên. Giáo viên sẽ chấm và công bố kết quả theo lịch.
          </span>
        </div>
      )}

      {/* Review Section */}
      {showAnswers && exam?.questions && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <FileText className="w-5 h-5 text-blue-600" />
              Chi tiết câu trả lời &amp; Hướng dẫn giải
            </h2>
            <span className="text-xs text-slate-500">
              Đúng {submission.correctQuestionsCount} / {exam.questions.length} câu
            </span>
          </div>

          <div className="space-y-4">
            {exam.questions.map((q, idx) => {
              const studentAns = submission.answers[q.id];
              let isQuestionCorrect = false;

              if (q.type === 'part1_single_choice') {
                isQuestionCorrect = studentAns?.selectedOptionId === q.correctOptionId;
              } else if (q.type === 'part2_true_false') {
                const countCorrectStmts = q.statements?.filter(
                  st => studentAns?.selectedStatements?.[st.id] === st.correctAnswer
                ).length || 0;
                isQuestionCorrect = countCorrectStmts === (q.statements?.length || 4);
              } else if (q.type === 'part3_short_answer') {
                const val = (studentAns?.textAnswer || '').trim().toLowerCase();
                isQuestionCorrect = (q.shortAnswerConfig?.acceptableAnswers || []).some(
                  a => a.toLowerCase() === val || a.replace(',', '.') === val.replace(',', '.')
                );
              }

              return (
                <div
                  key={q.id}
                  className={`bg-white border rounded-2xl p-5 shadow-xs space-y-3 ${
                    isQuestionCorrect ? 'border-emerald-200' : 'border-rose-200'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`w-6 h-6 rounded-lg text-xs font-bold flex items-center justify-center ${
                        isQuestionCorrect ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'
                      }`}>
                        {idx + 1}
                      </span>
                      <span className="font-mono text-xs font-bold text-slate-600">Câu {idx + 1}</span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded uppercase bg-slate-100 text-slate-700">
                        {q.type === 'part1_single_choice' ? 'Phần I' : q.type === 'part2_true_false' ? 'Phần II' : 'Phần III'}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 text-xs font-bold">
                      {isQuestionCorrect ? (
                        <span className="text-emerald-700 flex items-center gap-1">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Đúng
                        </span>
                      ) : (
                        <span className="text-rose-700 flex items-center gap-1">
                          <XCircle className="w-4 h-4 text-rose-600" /> Chưa đúng
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Question Content */}
                  <div className="text-sm font-medium text-slate-900 leading-relaxed">
                    <ChemRenderer text={q.content} />
                  </div>

                  {/* Part I Options with Choice Verification */}
                  {q.type === 'part1_single_choice' && q.options && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs pt-1">
                      {q.options.map((opt) => {
                        const isStudentChoice = studentAns?.selectedOptionId === opt.id;
                        const isCorrectKey = q.correctOptionId === opt.id;

                        let style = 'bg-slate-50 border-slate-200 text-slate-700';
                        if (isCorrectKey) {
                          style = 'bg-emerald-50 border-emerald-400 font-bold text-emerald-900';
                        } else if (isStudentChoice && !isCorrectKey) {
                          style = 'bg-rose-50 border-rose-300 text-rose-800 line-through';
                        }

                        return (
                          <div key={opt.id} className={`p-2.5 rounded-xl border flex items-start gap-2 ${style}`}>
                            <span className="font-bold">{opt.id}.</span>
                            <div className="flex-1">
                              <ChemRenderer text={opt.text} />
                            </div>
                            {isCorrectKey && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-200 text-emerald-900 font-bold">
                                Đáp án đúng
                              </span>
                            )}
                            {isStudentChoice && !isCorrectKey && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-200 text-rose-900 font-bold">
                                Bạn chọn
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Part II Statements Review */}
                  {q.type === 'part2_true_false' && q.statements && (
                    <div className="space-y-1.5 pt-1 text-xs">
                      {q.statements.map((stmt) => {
                        const studentVal = studentAns?.selectedStatements?.[stmt.id];
                        const isStmtCorrect = studentVal === stmt.correctAnswer;
                        return (
                          <div
                            key={stmt.id}
                            className={`p-2.5 rounded-xl border flex items-center justify-between gap-3 ${
                              isStmtCorrect ? 'bg-emerald-50/50 border-emerald-200' : 'bg-rose-50/50 border-rose-200'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-indigo-700">{stmt.id})</span>
                              <span><ChemRenderer text={stmt.statement} /></span>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="text-[11px] text-slate-500">
                                Bạn chọn: <b>{studentVal !== undefined ? (studentVal ? 'Đúng' : 'Sai') : 'Bỏ trống'}</b>
                              </span>
                              <span className={`px-2 py-0.5 rounded font-bold text-[10px] ${
                                stmt.correctAnswer ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                              }`}>
                                Đáp án: {stmt.correctAnswer ? 'Đúng' : 'Sai'}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Part III Short Answer Review */}
                  {q.type === 'part3_short_answer' && q.shortAnswerConfig && (
                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <span className="text-slate-500">Câu trả lời của bạn: </span>
                        <b className="font-mono text-slate-900 text-sm">{studentAns?.textAnswer || '(Chưa nhập)'}</b>
                      </div>
                      <div>
                        <span className="text-slate-500">Đáp án chuẩn: </span>
                        <b className="font-mono text-purple-700 text-sm bg-purple-100 px-2 py-0.5 rounded">
                          {q.shortAnswerConfig.acceptableAnswers.join(' / ')}
                        </b>
                      </div>
                    </div>
                  )}

                  {/* Chemistry Explanation */}
                  {showSolutions && q.explanation && (
                    <div className="mt-3 p-3.5 rounded-xl bg-blue-50/80 border border-blue-100 text-blue-950 text-xs">
                      <p className="font-bold text-blue-900 flex items-center gap-1.5 mb-1">
                        <FlaskConical className="w-4 h-4 text-blue-600" />
                        <span>Lời giải & Phương trình hóa học:</span>
                      </p>
                      <ChemRenderer text={q.explanation} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Back Button */}
      <div className="text-center pt-4">
        <button
          onClick={onBackToHome}
          className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-md shadow-blue-500/20"
        >
          Hoàn tất xem bài thi & Trở về trang chính
        </button>
      </div>

    </div>
  );
};
