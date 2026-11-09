import React, { useState } from 'react';
import { 
  FileUp, 
  Sparkles, 
  CheckCircle2, 
  AlertTriangle, 
  FileText, 
  Save, 
  Trash2, 
  Plus, 
  Edit3, 
  Eye, 
  ArrowRight,
  Layers,
  HelpCircle,
  FlaskConical,
  RefreshCw,
  Image as ImageIcon
} from 'lucide-react';
import { extractTextFromDocx, parseExamContent, SAMPLE_CHEMISTRY_EXAMS } from '../../utils/docxParser';
import { ParsedExamResult, Question, QuestionType, ChemGrade, ChemTopic } from '../../types';
import { ChemRenderer } from '../../utils/chemRenderer';

interface ExamUploaderProps {
  onSaveToQuestionBank: (questions: Question[]) => void;
  onCreateExamFromParsed: (title: string, questions: Question[], grade: ChemGrade) => void;
}

export const ExamUploader: React.FC<ExamUploaderProps> = ({
  onSaveToQuestionBank,
  onCreateExamFromParsed,
}) => {
  const [inputText, setInputText] = useState('');
  const [selectedGrade, setSelectedGrade] = useState<ChemGrade>('12');
  const [isProcessing, setIsProcessing] = useState(false);
  const [parsedResult, setParsedResult] = useState<ParsedExamResult | null>(null);
  
  // Interactive editing state for post-parse screen
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [filterType, setFilterType] = useState<string>('all');
  const [notification, setNotification] = useState<string | null>(null);

  // File drag & drop or upload handler
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    try {
      if (file.name.endsWith('.docx')) {
        const buffer = await file.arrayBuffer();
        const extracted = await extractTextFromDocx(buffer);
        setInputText(extracted);
        const result = parseExamContent(extracted, selectedGrade);
        setParsedResult(result);
      } else {
        // Plain text, md, etc.
        const text = await file.text();
        setInputText(text);
        const result = parseExamContent(text, selectedGrade);
        setParsedResult(result);
      }
      showToast('Đã phân tích file thành công!');
    } catch (err: any) {
      alert(err.message || 'Lỗi khi đọc file đề thi');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleParseRawText = () => {
    if (!inputText.trim()) {
      alert('Vui lòng dán nội dung đề thi hoặc chọn file đề!');
      return;
    }
    setIsProcessing(true);
    setTimeout(() => {
      const result = parseExamContent(inputText, selectedGrade);
      setParsedResult(result);
      setIsProcessing(false);
      showToast(`Đã nhận dạng thành công ${result.totalQuestions} câu hỏi!`);
    }, 300);
  };

  const loadSample = (sampleId: string) => {
    const sample = SAMPLE_CHEMISTRY_EXAMS.find(s => s.id === sampleId);
    if (!sample) return;
    setInputText(sample.content);
    setSelectedGrade(sample.grade);
    const result = parseExamContent(sample.content, sample.grade);
    setParsedResult(result);
    showToast(`Đã nạp đề mẫu: ${sample.name}`);
  };

  const showToast = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3000);
  };

  // Question editing actions
  const handleDeleteQuestion = (qId: string) => {
    if (!parsedResult) return;
    const updated = parsedResult.questions.filter(q => q.id !== qId);
    recalculateParsedStats(updated);
  };

  const handleUpdateQuestion = (updated: Question) => {
    if (!parsedResult) return;
    const list = parsedResult.questions.map(q => q.id === updated.id ? updated : q);
    recalculateParsedStats(list);
    setEditingQuestion(null);
    showToast('Đã cập nhật câu hỏi!');
  };

  const recalculateParsedStats = (questions: Question[]) => {
    if (!parsedResult) return;
    const part1Count = questions.filter(q => q.type === 'part1_single_choice').length;
    const part2Count = questions.filter(q => q.type === 'part2_true_false').length;
    const part3Count = questions.filter(q => q.type === 'part3_short_answer').length;
    const questionsWithAnswers = questions.filter(q => {
      if (q.type === 'part1_single_choice') return !!q.correctOptionId;
      if (q.type === 'part2_true_false') return q.statements && q.statements.length > 0;
      if (q.type === 'part3_short_answer') return q.shortAnswerConfig && q.shortAnswerConfig.acceptableAnswers.length > 0;
      return false;
    }).length;

    setParsedResult({
      ...parsedResult,
      totalQuestions: questions.length,
      part1Count,
      part2Count,
      part3Count,
      questionsWithAnswers,
      questionsMissingAnswers: questions.length - questionsWithAnswers,
      questionsWithWarnings: questions.filter(q => q.parseStatus !== 'verified').length,
      questions,
    });
  };

  const filteredQuestions = parsedResult?.questions.filter(q => {
    if (filterType === 'all') return true;
    if (filterType === 'part1') return q.type === 'part1_single_choice';
    if (filterType === 'part2') return q.type === 'part2_true_false';
    if (filterType === 'part3') return q.type === 'part3_short_answer';
    if (filterType === 'warnings') return q.parseStatus !== 'verified';
    return true;
  }) || [];

  return (
    <div className="space-y-6">
      
      {/* Toast Notification */}
      {notification && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white px-4 py-2.5 rounded-xl shadow-xl flex items-center gap-2 text-xs font-semibold animate-in fade-in slide-in-from-bottom-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{notification}</span>
        </div>
      )}

      {/* Top Banner & Instructions */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-blue-600 font-bold text-xs uppercase tracking-wider">
              <FlaskConical className="w-4 h-4" />
              <span>Chức năng tạo đề thi nhanh & bóc tách thông minh</span>
            </div>
            <h1 className="text-xl md:text-2xl font-extrabold text-slate-900 mt-1">
              Tải Đề Thi & Nhận Dạng Cấu Trúc Hóa Học
            </h1>
            <p className="text-xs md:text-sm text-slate-600 mt-1 max-w-3xl">
              Hỗ trợ tải lên file Word (.docx), file text hoặc dán trực tiếp. Hệ thống tự động nhận dạng chuẩn 3 phần cấu trúc mới của Bộ GD&amp;ĐT, công thức hóa học (H₂SO₄, Fe³⁺, ⇌, →) và bảng đáp án.
            </p>
          </div>

          {/* Quick 1-Click Sample Preloads */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <span className="text-xs font-semibold text-slate-500">Đề thi mẫu:</span>
            <button
              onClick={() => loadSample('sample_thpt_2025')}
              className="px-3 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold transition-colors border border-blue-200"
            >
              ⚡ Đề minh họa 2025 (Chuẩn 3 Phần)
            </button>
            <button
              onClick={() => loadSample('sample_hsg_olympiad')}
              className="px-3 py-1.5 rounded-lg bg-purple-50 hover:bg-purple-100 text-purple-700 text-xs font-bold transition-colors border border-purple-200"
            >
              ⚡ Đề Đội Tuyển HSG Quốc Gia
            </button>
          </div>
        </div>
      </div>

      {/* Input / Upload Section (Only show if not yet parsed or to change input) */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
          
          {/* File Upload Box */}
          <div className="md:col-span-2">
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
              1. Chọn File Đề Thi (DOCX, DOC, TXT)
            </label>
            <div className="flex items-center gap-3">
              <label className="cursor-pointer flex-1 flex items-center justify-center gap-2.5 px-4 py-3 rounded-xl border-2 border-dashed border-blue-300 hover:border-blue-500 bg-blue-50/50 hover:bg-blue-50 transition-all text-xs font-semibold text-blue-800">
                <FileUp className="w-5 h-5 text-blue-600" />
                <span>Nhấn để chọn file Word (.docx) hoặc kéo thả vào đây</span>
                <input 
                  type="file" 
                  accept=".docx,.txt,.doc" 
                  onChange={handleFileUpload} 
                  className="hidden" 
                />
              </label>

              {/* Grade Selector */}
              <div className="w-40 shrink-0">
                <select
                  value={selectedGrade}
                  onChange={(e) => setSelectedGrade(e.target.value as ChemGrade)}
                  className="w-full text-xs font-semibold px-3 py-3 rounded-xl border border-slate-200 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="12">Lớp 12 THPT</option>
                  <option value="11">Lớp 11 THPT</option>
                  <option value="10">Lớp 10 THPT</option>
                  <option value="chuyen_hsg">Chuyên & HSG</option>
                </select>
              </div>
            </div>
          </div>

          {/* Action Trigger */}
          <div className="flex flex-col justify-end">
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2 invisible">
              Hành động
            </label>
            <button
              onClick={handleParseRawText}
              disabled={isProcessing}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-md shadow-blue-500/20 transition-all flex items-center justify-center gap-2"
            >
              {isProcessing ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Đang bóc tách đề...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Bóc tách & Nhận dạng câu hỏi</span>
                </>
              )}
            </button>
          </div>

        </div>

        {/* Collapsible raw text editor for manual review/pasting */}
        <details className="text-xs border-t border-slate-100 pt-3">
          <summary className="font-semibold text-slate-600 cursor-pointer hover:text-blue-600 flex items-center gap-1.5 select-none">
            <FileText className="w-3.5 h-3.5" />
            <span>Xem hoặc dán trực tiếp nội dung văn bản đề thi ({inputText.length} ký tự)</span>
          </summary>
          <div className="mt-2">
            <textarea
              rows={6}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Dán nội dung đề thi Hóa học tại đây (Phần I: Câu 1, A, B, C, D... Phần II: a, b, c, d... Phần III: Điền đáp án)..."
              className="w-full p-3 font-mono text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50"
            />
          </div>
        </details>
      </div>

      {/* Verification Screen After Parsing (Section IV.4) */}
      {parsedResult && (
        <div className="space-y-4">
          
          {/* Post-parsing Stats Summary Card */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-600">
                  Kết quả phân tích & nhận dạng đề
                </span>
                <h2 className="text-lg font-bold text-slate-900 mt-0.5">
                  {parsedResult.title}
                </h2>
              </div>

              {/* Master Confirmation Buttons */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => onSaveToQuestionBank(parsedResult.questions)}
                  className="px-3.5 py-2 rounded-xl border border-slate-200 hover:border-slate-300 bg-slate-50 text-slate-800 text-xs font-bold transition-all flex items-center gap-1.5"
                >
                  <Save className="w-4 h-4 text-slate-600" />
                  <span>Lưu vào Ngân hàng</span>
                </button>
                <button
                  onClick={() => onCreateExamFromParsed(parsedResult.title, parsedResult.questions, selectedGrade)}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-md shadow-blue-500/20 transition-all flex items-center gap-1.5"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Tạo Đề Thi Trực Tuyến Ngay</span>
                </button>
              </div>
            </div>

            {/* Metrics Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3 text-center">
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                <p className="text-[11px] text-slate-500 font-medium">Tổng số câu</p>
                <p className="text-xl font-extrabold text-slate-900 mt-0.5">{parsedResult.totalQuestions}</p>
              </div>
              <div className="p-2.5 rounded-xl bg-blue-50/70 border border-blue-100">
                <p className="text-[11px] text-blue-700 font-medium">Phần I (4 lựa chọn)</p>
                <p className="text-xl font-extrabold text-blue-700 mt-0.5">{parsedResult.part1Count}</p>
              </div>
              <div className="p-2.5 rounded-xl bg-indigo-50/70 border border-indigo-100">
                <p className="text-[11px] text-indigo-700 font-medium">Phần II (Đúng/Sai)</p>
                <p className="text-xl font-extrabold text-indigo-700 mt-0.5">{parsedResult.part2Count}</p>
              </div>
              <div className="p-2.5 rounded-xl bg-purple-50/70 border border-purple-100">
                <p className="text-[11px] text-purple-700 font-medium">Phần III (Trả lời ngắn)</p>
                <p className="text-xl font-extrabold text-purple-700 mt-0.5">{parsedResult.part3Count}</p>
              </div>
              <div className="p-2.5 rounded-xl bg-emerald-50/70 border border-emerald-100">
                <p className="text-[11px] text-emerald-700 font-medium">Đã có đáp án</p>
                <p className="text-xl font-extrabold text-emerald-700 mt-0.5">{parsedResult.questionsWithAnswers}</p>
              </div>
              <div className="p-2.5 rounded-xl bg-amber-50/70 border border-amber-100">
                <p className="text-[11px] text-amber-700 font-medium">Chưa có đáp án</p>
                <p className="text-xl font-extrabold text-amber-700 mt-0.5">{parsedResult.questionsMissingAnswers}</p>
              </div>
              <div className="p-2.5 rounded-xl bg-rose-50/70 border border-rose-100">
                <p className="text-[11px] text-rose-700 font-medium">Cần kiểm tra</p>
                <p className="text-xl font-extrabold text-rose-700 mt-0.5">{parsedResult.questionsWithWarnings}</p>
              </div>
            </div>

            {/* Filter Pills for parsed questions */}
            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100 text-xs">
              <span className="text-slate-500 font-medium">Lọc xem:</span>
              <button
                onClick={() => setFilterType('all')}
                className={`px-3 py-1 rounded-lg font-semibold transition-colors ${
                  filterType === 'all' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                Tất cả ({parsedResult.questions.length})
              </button>
              <button
                onClick={() => setFilterType('part1')}
                className={`px-3 py-1 rounded-lg font-semibold transition-colors ${
                  filterType === 'part1' ? 'bg-blue-600 text-white' : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
                }`}
              >
                Phần I ({parsedResult.part1Count})
              </button>
              <button
                onClick={() => setFilterType('part2')}
                className={`px-3 py-1 rounded-lg font-semibold transition-colors ${
                  filterType === 'part2' ? 'bg-indigo-600 text-white' : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
                }`}
              >
                Phần II ({parsedResult.part2Count})
              </button>
              <button
                onClick={() => setFilterType('part3')}
                className={`px-3 py-1 rounded-lg font-semibold transition-colors ${
                  filterType === 'part3' ? 'bg-purple-600 text-white' : 'bg-purple-50 text-purple-700 hover:bg-purple-100'
                }`}
              >
                Phần III ({parsedResult.part3Count})
              </button>
              {parsedResult.questionsWithWarnings > 0 && (
                <button
                  onClick={() => setFilterType('warnings')}
                  className={`px-3 py-1 rounded-lg font-semibold transition-colors flex items-center gap-1 ${
                    filterType === 'warnings' ? 'bg-amber-600 text-white' : 'bg-amber-50 text-amber-800 hover:bg-amber-100'
                  }`}
                >
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Cần kiểm tra ({parsedResult.questionsWithWarnings})
                </button>
              )}
            </div>
          </div>

          {/* List of Questions with Interactive Verification & Edit */}
          <div className="space-y-3">
            {filteredQuestions.map((q, index) => (
              <div 
                key={q.id}
                className={`bg-white border rounded-xl p-4 shadow-xs transition-all ${
                  q.parseStatus !== 'verified' ? 'border-amber-300 ring-2 ring-amber-100' : 'border-slate-200'
                }`}
              >
                {/* Question Header */}
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-xs px-2 py-0.5 rounded-md bg-slate-100 text-slate-800">
                      Câu {index + 1}
                    </span>
                    <span className="font-mono text-xs text-slate-500">
                      {q.code}
                    </span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md uppercase ${
                      q.type === 'part1_single_choice'
                        ? 'bg-blue-100 text-blue-800'
                        : q.type === 'part2_true_false'
                        ? 'bg-indigo-100 text-indigo-800'
                        : 'bg-purple-100 text-purple-800'
                    }`}>
                      {q.type === 'part1_single_choice' ? 'Phần I (4 lựa chọn)' : q.type === 'part2_true_false' ? 'Phần II (Đúng - Sai)' : 'Phần III (Trả lời ngắn)'}
                    </span>
                    {q.parseStatus !== 'verified' && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" />
                        {q.parseWarning || 'Cần kiểm tra'}
                      </span>
                    )}
                  </div>

                  {/* Edit / Delete Buttons */}
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setEditingQuestion({ ...q })}
                      className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                      title="Chỉnh sửa câu hỏi & đáp án"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteQuestion(q.id)}
                      className="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                      title="Xóa câu này"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Question Content rendered with ChemRenderer */}
                <div className="text-sm text-slate-900 font-medium my-2">
                  <ChemRenderer text={q.content} />
                </div>

                {/* Render Options for Part I */}
                {q.type === 'part1_single_choice' && q.options && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3 pt-2 border-t border-slate-100">
                    {q.options.map(opt => {
                      const isCorrect = opt.id === q.correctOptionId;
                      return (
                        <div
                          key={opt.id}
                          className={`p-2.5 rounded-xl border text-xs flex items-start gap-2 ${
                            isCorrect 
                              ? 'border-emerald-500 bg-emerald-50/80 font-semibold text-emerald-900' 
                              : 'border-slate-200 bg-slate-50 text-slate-700'
                          }`}
                        >
                          <span className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 font-bold ${
                            isCorrect ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-700'
                          }`}>
                            {opt.id}
                          </span>
                          <div className="flex-1">
                            <ChemRenderer text={opt.text} />
                          </div>
                          {isCorrect && (
                            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">
                              Đáp án
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Render Statements for Part II */}
                {q.type === 'part2_true_false' && q.statements && (
                  <div className="space-y-1.5 mt-3 pt-2 border-t border-slate-100">
                    {q.statements.map(stmt => (
                      <div
                        key={stmt.id}
                        className="p-2 rounded-lg bg-slate-50 border border-slate-200 text-xs flex items-center justify-between gap-3"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-indigo-700">{stmt.id})</span>
                          <span><ChemRenderer text={stmt.statement} /></span>
                        </div>
                        <span className={`px-2 py-0.5 rounded text-[11px] font-bold shrink-0 ${
                          stmt.correctAnswer ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                        }`}>
                          {stmt.correctAnswer ? 'Đúng' : 'Sai'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Render Short Answer Config for Part III */}
                {q.type === 'part3_short_answer' && q.shortAnswerConfig && (
                  <div className="mt-3 pt-2 border-t border-slate-100 text-xs flex items-center gap-3">
                    <span className="font-semibold text-purple-800">Đáp án chấp nhận:</span>
                    <div className="flex flex-wrap gap-1.5">
                      {q.shortAnswerConfig.acceptableAnswers.map((ans, idx) => (
                        <span key={idx} className="px-2 py-0.5 bg-purple-100 text-purple-900 font-mono font-bold rounded">
                          {ans}
                        </span>
                      ))}
                    </div>
                    {q.shortAnswerConfig.tolerance !== undefined && q.shortAnswerConfig.tolerance > 0 && (
                      <span className="text-slate-500 text-[11px]">
                        (Sai số: ±{q.shortAnswerConfig.tolerance})
                      </span>
                    )}
                  </div>
                )}

                {/* Solution if available */}
                {q.explanation && (
                  <div className="mt-2.5 p-2 rounded-lg bg-blue-50/70 text-blue-900 text-xs border border-blue-100">
                    <span className="font-bold">Hướng dẫn giải: </span>
                    <ChemRenderer text={q.explanation} inline />
                  </div>
                )}
              </div>
            ))}
          </div>

        </div>
      )}

      {/* Edit Question Modal */}
      {editingQuestion && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
              <h3 className="font-bold text-sm">Chỉnh Sửa Câu Hỏi & Đáp Án ({editingQuestion.code})</h3>
              <button 
                onClick={() => setEditingQuestion(null)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1 space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Nội dung câu hỏi (hỗ trợ công thức hóa học, LaTeX)</label>
                <textarea
                  rows={4}
                  value={editingQuestion.content}
                  onChange={(e) => setEditingQuestion({ ...editingQuestion, content: e.target.value })}
                  className="w-full p-2.5 rounded-xl border border-slate-300 font-sans text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              {/* Part I Options editor */}
              {editingQuestion.type === 'part1_single_choice' && (
                <div className="space-y-2">
                  <label className="block font-bold text-slate-700">Các phương án & Chọn đáp án đúng:</label>
                  {editingQuestion.options?.map((opt, i) => (
                    <div key={opt.id} className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="correct_opt"
                        checked={editingQuestion.correctOptionId === opt.id}
                        onChange={() => setEditingQuestion({
                          ...editingQuestion,
                          correctOptionId: opt.id,
                          parseStatus: 'verified',
                        })}
                        className="w-4 h-4 text-blue-600 focus:ring-blue-500 cursor-pointer"
                      />
                      <span className="font-bold text-slate-700 w-4">{opt.id}.</span>
                      <input
                        type="text"
                        value={opt.text}
                        onChange={(e) => {
                          const newOpts = [...(editingQuestion.options || [])];
                          newOpts[i].text = e.target.value;
                          setEditingQuestion({ ...editingQuestion, options: newOpts });
                        }}
                        className="flex-1 p-2 rounded-lg border border-slate-300 text-xs"
                      />
                    </div>
                  ))}
                </div>
              )}

              {/* Part II Statements editor */}
              {editingQuestion.type === 'part2_true_false' && (
                <div className="space-y-2">
                  <label className="block font-bold text-slate-700">Các mệnh đề & Thiết lập Đúng/Sai:</label>
                  {editingQuestion.statements?.map((stmt, i) => (
                    <div key={stmt.id} className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 border border-slate-200">
                      <span className="font-bold text-indigo-700 w-4">{stmt.id})</span>
                      <input
                        type="text"
                        value={stmt.statement}
                        onChange={(e) => {
                          const newStmts = [...(editingQuestion.statements || [])];
                          newStmts[i].statement = e.target.value;
                          setEditingQuestion({ ...editingQuestion, statements: newStmts });
                        }}
                        className="flex-1 p-1.5 rounded-md border border-slate-300 text-xs bg-white"
                      />
                      <select
                        value={stmt.correctAnswer ? 'true' : 'false'}
                        onChange={(e) => {
                          const newStmts = [...(editingQuestion.statements || [])];
                          newStmts[i].correctAnswer = e.target.value === 'true';
                          setEditingQuestion({ ...editingQuestion, statements: newStmts });
                        }}
                        className="p-1.5 rounded-md border border-slate-300 text-xs font-bold"
                      >
                        <option value="true">Đúng</option>
                        <option value="false">Sai</option>
                      </select>
                    </div>
                  ))}
                </div>
              )}

              {/* Part III Short Answer editor */}
              {editingQuestion.type === 'part3_short_answer' && (
                <div className="space-y-2">
                  <label className="block font-bold text-slate-700">Đáp án chấp nhận (cách nhau bởi dấu phẩy):</label>
                  <input
                    type="text"
                    value={editingQuestion.shortAnswerConfig?.acceptableAnswers.join(', ') || ''}
                    onChange={(e) => {
                      const list = e.target.value.split(',').map(s => s.trim()).filter(Boolean);
                      setEditingQuestion({
                        ...editingQuestion,
                        shortAnswerConfig: {
                          acceptableAnswers: list,
                          isNumeric: !isNaN(Number(list[0]?.replace(',', '.'))),
                          numericValue: parseFloat(list[0]?.replace(',', '.') || '0'),
                          tolerance: 0.05,
                        },
                        parseStatus: list.length > 0 ? 'verified' : 'needs_review',
                      });
                    }}
                    placeholder="Ví dụ: 4, 4.0, 4,0"
                    className="w-full p-2.5 rounded-xl border border-slate-300 text-xs"
                  />
                </div>
              )}

              {/* Explanation editor */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">Hướng dẫn giải chi tiết</label>
                <textarea
                  rows={2}
                  value={editingQuestion.explanation || ''}
                  onChange={(e) => setEditingQuestion({ ...editingQuestion, explanation: e.target.value })}
                  placeholder="Nhập phương trình hóa học hoặc lời giải thích..."
                  className="w-full p-2.5 rounded-xl border border-slate-300 text-xs"
                />
              </div>
            </div>

            <div className="px-6 py-3 bg-slate-100 border-t border-slate-200 flex justify-end gap-2">
              <button
                onClick={() => setEditingQuestion(null)}
                className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-200 text-xs font-semibold"
              >
                Hủy bỏ
              </button>
              <button
                onClick={() => handleUpdateQuestion(editingQuestion)}
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs"
              >
                Lưu thay đổi
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
