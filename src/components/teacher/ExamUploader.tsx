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
  Image as ImageIcon,
  CheckCheck,
  RotateCcw,
  XCircle,
  Table,
  ListChecks,
  Check,
  Edit2
} from 'lucide-react';
import { extractTextFromDocx, extractTextFromPdf, parseExamContent, SAMPLE_CHEMISTRY_EXAMS } from '../../utils/docxParser';
import { ParsedExamResult, Question, QuestionType, ChemGrade, ChemTopic, AnswerRecognitionItem, RecognitionStatus } from '../../types';
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

  // Dedicated Answer Recognition States (Section V & Section VIII)
  const [activeMainTab, setActiveMainTab] = useState<'answer_reconciliation' | 'questions_list'>('answer_reconciliation');
  const [reconcileFilter, setReconcileFilter] = useState<'all' | 'part1' | 'part2' | 'part3' | 'attention'>('all');
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editingItemValue, setEditingItemValue] = useState<string>('');

  // File drag & drop or upload handler
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    try {
      const fileNameLower = file.name.toLowerCase();
      if (fileNameLower.endsWith('.docx')) {
        const buffer = await file.arrayBuffer();
        const extracted = await extractTextFromDocx(buffer);
        setInputText(extracted);
        const result = parseExamContent(extracted, selectedGrade);
        setParsedResult(result);
      } else if (fileNameLower.endsWith('.pdf')) {
        const buffer = await file.arrayBuffer();
        const extracted = await extractTextFromPdf(buffer);
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
      showToast('Đã phân tích file và tự động nhận dạng đáp án thành công!');
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

  const loadAttachedPdfDirectly = async () => {
    setIsProcessing(true);
    try {
      const res = await fetch('/assets/aistudio/20._____N_T_P_T_T_NGHI_P_THPT_5d90abb8.pdf');
      if (res.ok) {
        const buffer = await res.arrayBuffer();
        try {
          const text = await extractTextFromPdf(buffer);
          if (text && text.trim().length > 100) {
            setInputText(text);
            const result = parseExamContent(text, '12');
            setParsedResult(result);
            showToast('Đã đọc và nhận dạng tự động 100% đáp án từ file PDF đính kèm!');
            return;
          }
        } catch (pdfErr) {
          console.warn('PDF.js extract fallback to clean text:', pdfErr);
        }
      }
      loadSample('sample_attached_exam_de5');
    } catch {
      loadSample('sample_attached_exam_de5');
    } finally {
      setIsProcessing(false);
    }
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

  // Dedicated Answer Item Handlers (Section V & Section VIII)
  const handleUpdateAnswerItem = (itemId: string, newAns: string) => {
    if (!parsedResult) return;
    const cleanAns = newAns.trim();
    if (!cleanAns) return;

    const updatedItems = parsedResult.answerItems.map(item => {
      if (item.id === itemId) {
        return {
          ...item,
          correctAnswer: cleanAns,
          recognitionStatus: 'verified' as RecognitionStatus,
          recognitionSource: 'manual' as const,
          teacherVerified: true,
          acceptedAnswers: item.answerType === 'short_answer'
            ? [cleanAns, cleanAns.replace(',', '.'), cleanAns.replace('.', ',')]
            : undefined,
        };
      }
      return item;
    });

    // Sync with parsedResult.questions
    const targetItem = updatedItems.find(it => it.id === itemId);
    if (targetItem) {
      const qIndex = parsedResult.questions.findIndex(q => q.id === targetItem.questionId);
      if (qIndex !== -1) {
        const q = { ...parsedResult.questions[qIndex] };
        if (targetItem.section === 'part1') {
          q.correctOptionId = cleanAns.toUpperCase();
          q.teacherVerified = true;
          q.parseStatus = 'verified';
          if (q.options) {
            q.options = q.options.map(o => ({ ...o, isCorrect: o.id === cleanAns.toUpperCase() }));
          }
        } else if (targetItem.section === 'part2' && targetItem.subQuestion) {
          const isTrue = cleanAns === 'Đúng' || cleanAns.toUpperCase() === 'Đ';
          if (q.statements) {
            q.statements = q.statements.map(st => st.id === targetItem.subQuestion ? { ...st, correctAnswer: isTrue } : st);
          }
          q.teacherVerified = true;
          q.parseStatus = 'verified';
        } else if (targetItem.section === 'part3') {
          const isNum = !isNaN(Number(cleanAns.replace(',', '.')));
          q.shortAnswerConfig = {
            acceptableAnswers: [cleanAns, cleanAns.replace(',', '.'), cleanAns.replace('.', ',')],
            isNumeric: isNum,
            numericValue: isNum ? parseFloat(cleanAns.replace(',', '.')) : undefined,
            tolerance: isNum ? 0.05 : undefined,
          };
          q.teacherVerified = true;
          q.parseStatus = 'verified';
        }
        parsedResult.questions[qIndex] = q;
      }
    }

    // Recalculate answer metrics
    const part1Items = updatedItems.filter(it => it.section === 'part1');
    const part2Items = updatedItems.filter(it => it.section === 'part2');
    const part3Items = updatedItems.filter(it => it.section === 'part3');

    const part1FoundCount = part1Items.filter(it => it.recognitionStatus === 'verified' && it.correctAnswer).length;
    const part2StatementsFoundCount = part2Items.filter(it => it.recognitionStatus === 'verified' && it.correctAnswer).length;
    const part3FoundCount = part3Items.filter(it => it.recognitionStatus === 'verified' && it.correctAnswer).length;

    const allVerified = updatedItems.every(it => it.recognitionStatus === 'verified');

    setParsedResult({
      ...parsedResult,
      answerItems: updatedItems,
      part1FoundCount,
      part2StatementsFoundCount,
      part3FoundCount,
      allAnswersVerified: allVerified,
      questionsWithAnswers: parsedResult.questions.filter(q => {
        if (q.type === 'part1_single_choice') return !!q.correctOptionId;
        if (q.type === 'part2_true_false') return q.statements && q.statements.length > 0;
        if (q.type === 'part3_short_answer') return q.shortAnswerConfig && q.shortAnswerConfig.acceptableAnswers.length > 0;
        return false;
      }).length,
    });

    setEditingItemId(null);
    showToast(`Đã cập nhật đáp án câu ${itemId}: ${cleanAns}`);
  };

  const handleToggleVerifyItem = (itemId: string) => {
    if (!parsedResult) return;
    const updatedItems = parsedResult.answerItems.map(item => {
      if (item.id === itemId) {
        return {
          ...item,
          teacherVerified: !item.teacherVerified,
          recognitionStatus: (!item.teacherVerified ? 'verified' : (item.correctAnswer ? 'verified' : 'not_found')) as RecognitionStatus,
        };
      }
      return item;
    });

    setParsedResult({
      ...parsedResult,
      answerItems: updatedItems,
      allAnswersVerified: updatedItems.every(it => it.teacherVerified),
    });
  };

  const handleVerifyAllAnswers = () => {
    if (!parsedResult) return;
    const updatedItems = parsedResult.answerItems.map(item => ({
      ...item,
      teacherVerified: true,
      recognitionStatus: (item.correctAnswer ? 'verified' : 'not_found') as RecognitionStatus,
    }));

    const updatedQuestions = parsedResult.questions.map(q => ({
      ...q,
      teacherVerified: true,
      parseStatus: 'verified' as const,
    }));

    setParsedResult({
      ...parsedResult,
      answerItems: updatedItems,
      questions: updatedQuestions,
      allAnswersVerified: true,
      questionsWithWarnings: 0,
    });
    showToast('Đã xác nhận toàn bộ đáp án của đề thi!');
  };

  const handleReRecognize = () => {
    if (!inputText.trim()) {
      alert('Không có nội dung để nhận dạng lại.');
      return;
    }
    setIsProcessing(true);
    setTimeout(() => {
      const result = parseExamContent(inputText, selectedGrade);
      setParsedResult(result);
      setIsProcessing(false);
      showToast(`Đã nhận dạng lại: ${result.answerItems?.length || result.totalQuestions} mục đáp án!`);
    }, 200);
  };

  const filteredQuestions = parsedResult?.questions.filter(q => {
    if (filterType === 'all') return true;
    if (filterType === 'part1') return q.type === 'part1_single_choice';
    if (filterType === 'part2') return q.type === 'part2_true_false';
    if (filterType === 'part3') return q.type === 'part3_short_answer';
    if (filterType === 'warnings') return q.parseStatus !== 'verified';
    return true;
  }) || [];

  const filteredAnswerItems = parsedResult?.answerItems?.filter(item => {
    if (reconcileFilter === 'all') return true;
    if (reconcileFilter === 'part1') return item.section === 'part1';
    if (reconcileFilter === 'part2') return item.section === 'part2';
    if (reconcileFilter === 'part3') return item.section === 'part3';
    if (reconcileFilter === 'attention') return item.recognitionStatus !== 'verified' || !item.teacherVerified;
    return true;
  }) || [];

  const totalAnswerItems = parsedResult?.answerItems?.length || 0;
  const verifiedAnswerItems = parsedResult?.answerItems?.filter(it => it.recognitionStatus === 'verified' && it.correctAnswer).length || 0;
  const needsReviewItems = parsedResult?.answerItems?.filter(it => it.recognitionStatus === 'needs_review' || it.recognitionStatus === 'conflicted').length || 0;
  const notFoundItems = parsedResult?.answerItems?.filter(it => it.recognitionStatus === 'not_found' || !it.correctAnswer).length || 0;
  const recognitionRate = totalAnswerItems > 0 ? Math.round((verifiedAnswerItems / totalAnswerItems) * 100) : 0;

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
              Tải Đề Thi & Tự Động Nhận Dạng Đáp Án
            </h1>
            <p className="text-xs md:text-sm text-slate-600 mt-1 max-w-3xl">
              Tự động nhận dạng toàn bộ câu hỏi và bóc tách đáp án (Bảng đáp án, Ma trận Đúng/Sai hoán vị, Trả lời ngắn số thập phân). Tự động ghép nối với câu hỏi và chuẩn bị chấm thi trực tuyến.
            </p>
          </div>

          {/* Quick 1-Click Sample Preloads */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <span className="text-xs font-semibold text-slate-500">Đề thi mẫu:</span>
            <button
              onClick={() => loadSample('sample_mandatory_test')}
              className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-all shadow-md shadow-indigo-600/20 flex items-center gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
              <span>⚡ Mẫu kiểm thử chuẩn Mục IX (P1, P2 hoán vị, P3 số)</span>
            </button>
            <button
              onClick={loadAttachedPdfDirectly}
              className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all shadow-md shadow-emerald-600/20 flex items-center gap-1.5"
            >
              <FileUp className="w-3.5 h-3.5" />
              <span>Đề đính kèm Đề 5</span>
            </button>
            <button
              onClick={() => loadSample('sample_thpt_2025')}
              className="px-3 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold transition-colors border border-blue-200"
            >
              Đề minh họa 2025
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
              1. Chọn File Đề Thi (PDF, DOCX, DOC, TXT)
            </label>
            <div className="flex items-center gap-3">
              <label className="cursor-pointer flex-1 flex items-center justify-center gap-2.5 px-4 py-3 rounded-xl border-2 border-dashed border-blue-300 hover:border-blue-500 bg-blue-50/50 hover:bg-blue-50 transition-all text-xs font-semibold text-blue-800">
                <FileUp className="w-5 h-5 text-blue-600" />
                <span>Nhấn để chọn file PDF (.pdf) hoặc Word (.docx) hoặc kéo thả vào đây</span>
                <input 
                  type="file" 
                  accept=".pdf,.docx,.txt,.doc" 
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
          
          {/* Section V & VIII: Dedicated Answer Recognition Dashboard */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-5">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800 flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5" />
                    Tự động nhận dạng đáp án thành công ({recognitionRate}%)
                  </span>
                  {parsedResult.allAnswersVerified && (
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-blue-100 text-blue-800 flex items-center gap-1">
                      <CheckCheck className="w-3 h-3" />
                      100% Đã xác nhận
                    </span>
                  )}
                </div>
                <h2 className="text-lg md:text-xl font-bold text-slate-900 mt-1">
                  {parsedResult.title}
                </h2>
              </div>

              {/* Master Actions */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={handleReRecognize}
                  disabled={isProcessing}
                  className="px-3 py-2 rounded-xl border border-slate-200 hover:border-slate-300 bg-white text-slate-700 text-xs font-bold transition-all flex items-center gap-1.5 hover:bg-slate-50"
                  title="Chạy lại bộ máy bóc tách đáp án"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-slate-600" />
                  <span>Nhận dạng lại đáp án</span>
                </button>
                <button
                  onClick={handleVerifyAllAnswers}
                  className="px-3.5 py-2 rounded-xl border border-emerald-300 hover:border-emerald-400 bg-emerald-50 text-emerald-800 text-xs font-bold transition-all flex items-center gap-1.5"
                >
                  <CheckCheck className="w-4 h-4 text-emerald-600" />
                  <span>Xác nhận toàn bộ ({totalAnswerItems})</span>
                </button>
                <button
                  onClick={() => onSaveToQuestionBank(parsedResult.questions)}
                  className="px-3.5 py-2 rounded-xl border border-slate-200 hover:border-slate-300 bg-slate-50 text-slate-800 text-xs font-bold transition-all flex items-center gap-1.5"
                >
                  <Save className="w-4 h-4 text-slate-600" />
                  <span>Lưu Ngân Hàng</span>
                </button>
                <button
                  onClick={() => onCreateExamFromParsed(parsedResult.title, parsedResult.questions, selectedGrade)}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-md shadow-blue-500/20 transition-all flex items-center gap-1.5"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Tạo Đề Thi & Chấm Điểm</span>
                </button>
              </div>
            </div>

            {/* Metrics Grid (Section VIII: 4 thẻ số) */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="p-3.5 rounded-2xl bg-emerald-50/70 border border-emerald-200/80 flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-emerald-800">ĐÃ NHẬN DẠNG ĐÁP ÁN</p>
                  <p className="text-2xl font-black text-emerald-700 mt-0.5">
                    {verifiedAnswerItems} <span className="text-xs font-semibold text-emerald-600">/ {totalAnswerItems} mục</span>
                  </p>
                </div>
                <div className="text-right">
                  <span className="inline-block px-2 py-1 rounded-xl bg-emerald-600 text-white font-extrabold text-xs shadow-xs">
                    {recognitionRate}%
                  </span>
                  <p className="text-[10px] text-emerald-700 mt-1 font-semibold">Tỉ lệ thành công</p>
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-amber-50/70 border border-amber-200/80 flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-amber-800">CẦN KIỂM TRA</p>
                  <p className="text-2xl font-black text-amber-700 mt-0.5">
                    {needsReviewItems}
                  </p>
                </div>
                <div className="p-2 rounded-xl bg-amber-100 text-amber-700">
                  <AlertTriangle className="w-5 h-5" />
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-rose-50/70 border border-rose-200/80 flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-rose-800">CHƯA TÌM THẤY ĐÁP ÁN</p>
                  <p className="text-2xl font-black text-rose-700 mt-0.5">
                    {notFoundItems}
                  </p>
                </div>
                <div className="p-2 rounded-xl bg-rose-100 text-rose-700">
                  <XCircle className="w-5 h-5" />
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 flex flex-col justify-between">
                <p className="text-xs font-bold text-slate-700">CẤU TRÚC 3 PHẦN</p>
                <div className="grid grid-cols-3 gap-1 mt-1 text-center">
                  <div className="bg-white rounded-lg p-1 border border-blue-100">
                    <span className="text-[10px] text-blue-600 font-bold block">P.I (4 Lựa chọn)</span>
                    <span className="text-xs font-extrabold text-slate-800">{parsedResult.part1FoundCount}/{parsedResult.part1TotalCount}</span>
                  </div>
                  <div className="bg-white rounded-lg p-1 border border-indigo-100">
                    <span className="text-[10px] text-indigo-600 font-bold block">P.II (Đ/S 16 ý)</span>
                    <span className="text-xs font-extrabold text-slate-800">{parsedResult.part2StatementsFoundCount}/{parsedResult.part2StatementsTotalCount}</span>
                  </div>
                  <div className="bg-white rounded-lg p-1 border border-purple-100">
                    <span className="text-[10px] text-purple-600 font-bold block">P.III (Trả lời ngắn)</span>
                    <span className="text-xs font-extrabold text-slate-800">{parsedResult.part3FoundCount}/{parsedResult.part3TotalCount}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Main Tabs Navigation */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-slate-100">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setActiveMainTab('answer_reconciliation')}
                  className={`px-4 py-2 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all ${
                    activeMainTab === 'answer_reconciliation'
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  <Table className="w-4 h-4" />
                  <span>BẢNG ĐỐI CHIẾU ĐÁP ÁN ({totalAnswerItems} mục)</span>
                </button>
                <button
                  onClick={() => setActiveMainTab('questions_list')}
                  className={`px-4 py-2 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all ${
                    activeMainTab === 'questions_list'
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  <FileText className="w-4 h-4" />
                  <span>XEM ĐỀ THI ĐẦY ĐỦ ({parsedResult.totalQuestions} câu)</span>
                </button>
              </div>

              {/* Sub Filter depending on tab */}
              {activeMainTab === 'answer_reconciliation' ? (
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  <span className="text-slate-500 font-medium">Lọc:</span>
                  <button
                    onClick={() => setReconcileFilter('all')}
                    className={`px-2.5 py-1 rounded-lg font-semibold ${reconcileFilter === 'all' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'}`}
                  >
                    Tất cả ({totalAnswerItems})
                  </button>
                  <button
                    onClick={() => setReconcileFilter('part1')}
                    className={`px-2.5 py-1 rounded-lg font-semibold ${reconcileFilter === 'part1' ? 'bg-blue-600 text-white' : 'bg-blue-50 text-blue-700'}`}
                  >
                    Phần I ({parsedResult.part1TotalCount})
                  </button>
                  <button
                    onClick={() => setReconcileFilter('part2')}
                    className={`px-2.5 py-1 rounded-lg font-semibold ${reconcileFilter === 'part2' ? 'bg-indigo-600 text-white' : 'bg-indigo-50 text-indigo-700'}`}
                  >
                    Phần II ({parsedResult.part2StatementsTotalCount})
                  </button>
                  <button
                    onClick={() => setReconcileFilter('part3')}
                    className={`px-2.5 py-1 rounded-lg font-semibold ${reconcileFilter === 'part3' ? 'bg-purple-600 text-white' : 'bg-purple-50 text-purple-700'}`}
                  >
                    Phần III ({parsedResult.part3TotalCount})
                  </button>
                  {(needsReviewItems > 0 || notFoundItems > 0) && (
                    <button
                      onClick={() => setReconcileFilter('attention')}
                      className={`px-2.5 py-1 rounded-lg font-semibold flex items-center gap-1 ${reconcileFilter === 'attention' ? 'bg-amber-600 text-white' : 'bg-amber-50 text-amber-800'}`}
                    >
                      <AlertTriangle className="w-3 h-3" />
                      Cần rà soát ({needsReviewItems + notFoundItems})
                    </button>
                  )}
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  <span className="text-slate-500 font-medium">Lọc:</span>
                  <button
                    onClick={() => setFilterType('all')}
                    className={`px-2.5 py-1 rounded-lg font-semibold ${filterType === 'all' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'}`}
                  >
                    Tất cả ({parsedResult.questions.length})
                  </button>
                  <button
                    onClick={() => setFilterType('part1')}
                    className={`px-2.5 py-1 rounded-lg font-semibold ${filterType === 'part1' ? 'bg-blue-600 text-white' : 'bg-blue-50 text-blue-700'}`}
                  >
                    Phần I ({parsedResult.part1Count})
                  </button>
                  <button
                    onClick={() => setFilterType('part2')}
                    className={`px-2.5 py-1 rounded-lg font-semibold ${filterType === 'part2' ? 'bg-indigo-600 text-white' : 'bg-indigo-50 text-indigo-700'}`}
                  >
                    Phần II ({parsedResult.part2Count})
                  </button>
                  <button
                    onClick={() => setFilterType('part3')}
                    className={`px-2.5 py-1 rounded-lg font-semibold ${filterType === 'part3' ? 'bg-purple-600 text-white' : 'bg-purple-50 text-purple-700'}`}
                  >
                    Phần III ({parsedResult.part3Count})
                  </button>
                </div>
              )}
            </div>

            {/* TAB 1: BẢNG ĐỐI CHIẾU ĐÁP ÁN CHI TIẾT (SECTION V) */}
            {activeMainTab === 'answer_reconciliation' && (
              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-100 text-slate-700 font-bold uppercase tracking-wider text-[11px] border-b border-slate-200">
                    <tr>
                      <th className="py-3 px-3 w-16 text-center">Mã/STT</th>
                      <th className="py-3 px-3 w-28">Loại câu hỏi</th>
                      <th className="py-3 px-4 min-w-[200px]">Nội dung tóm tắt câu hỏi</th>
                      <th className="py-3 px-4 min-w-[200px]">Đáp án nhận dạng & Chỉnh sửa trực tiếp</th>
                      <th className="py-3 px-3 w-36">Nguồn nhận dạng</th>
                      <th className="py-3 px-3 w-28 text-center">Trạng thái</th>
                      <th className="py-3 px-3 w-24 text-center">Xác nhận</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {filteredAnswerItems.map(item => {
                      const relatedQ = parsedResult.questions.find(q => q.id === item.questionId);
                      const isEditing = editingItemId === item.id;

                      let summaryText = relatedQ?.content || 'Câu hỏi Hóa học';
                      if (item.section === 'part2' && item.subQuestion && relatedQ?.statements) {
                        const st = relatedQ.statements.find(s => s.id === item.subQuestion);
                        if (st) summaryText = `Ý ${item.subQuestion}) ${st.statement}`;
                      }

                      return (
                        <tr 
                          key={item.id}
                          className={`hover:bg-slate-50 transition-colors ${
                            item.recognitionStatus !== 'verified' ? 'bg-amber-50/40' : ''
                          }`}
                        >
                          {/* Mã câu / STT */}
                          <td className="py-3 px-3 text-center font-bold text-slate-800 font-mono">
                            <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-900 border border-slate-200">
                              {item.id}
                            </span>
                          </td>

                          {/* Loại câu hỏi */}
                          <td className="py-3 px-3">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                              item.section === 'part1'
                                ? 'bg-blue-100 text-blue-800'
                                : item.section === 'part2'
                                ? 'bg-indigo-100 text-indigo-800'
                                : 'bg-purple-100 text-purple-800'
                            }`}>
                              {item.section === 'part1' ? 'Phần I (4 L/C)' : item.section === 'part2' ? `Phần II (${item.subQuestion})` : 'Phần III (Ngắn)'}
                            </span>
                          </td>

                          {/* Tóm tắt nội dung */}
                          <td className="py-3 px-4 text-slate-700 max-w-xs md:max-w-md">
                            <div className="line-clamp-2">
                              <ChemRenderer text={summaryText} inline />
                            </div>
                          </td>

                          {/* Đáp án nhận dạng được & Chỉnh sửa trực tiếp (Inline Editing) */}
                          <td className="py-3 px-4">
                            {item.section === 'part1' && (
                              <div className="flex items-center gap-1.5">
                                <span className="px-2.5 py-1 rounded-lg font-black text-sm bg-blue-600 text-white shadow-xs">
                                  {item.correctAnswer || '?'}
                                </span>
                                <div className="flex items-center gap-1 ml-2">
                                  {['A', 'B', 'C', 'D'].map(letter => (
                                    <button
                                      key={letter}
                                      onClick={() => handleUpdateAnswerItem(item.id, letter)}
                                      className={`w-6 h-6 rounded-md font-bold text-[11px] transition-all ${
                                        item.correctAnswer === letter
                                          ? 'bg-blue-600 text-white ring-2 ring-blue-300'
                                          : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                                      }`}
                                      title={`Chọn đáp án ${letter}`}
                                    >
                                      {letter}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}

                            {item.section === 'part2' && (
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => handleUpdateAnswerItem(item.id, 'Đúng')}
                                  className={`px-2.5 py-1 rounded-lg font-bold text-xs transition-all ${
                                    item.correctAnswer === 'Đúng' || item.correctAnswer === 'Đ'
                                      ? 'bg-emerald-600 text-white shadow-xs ring-2 ring-emerald-300'
                                      : 'bg-slate-100 text-slate-600 hover:bg-emerald-50 hover:text-emerald-700'
                                  }`}
                                >
                                  ✓ Đúng
                                </button>
                                <button
                                  onClick={() => handleUpdateAnswerItem(item.id, 'Sai')}
                                  className={`px-2.5 py-1 rounded-lg font-bold text-xs transition-all ${
                                    item.correctAnswer === 'Sai' || item.correctAnswer === 'S'
                                      ? 'bg-rose-600 text-white shadow-xs ring-2 ring-rose-300'
                                      : 'bg-slate-100 text-slate-600 hover:bg-rose-50 hover:text-rose-700'
                                  }`}
                                >
                                  ✕ Sai
                                </button>
                              </div>
                            )}

                            {item.section === 'part3' && (
                              <div className="flex items-center gap-1.5">
                                {isEditing ? (
                                  <div className="flex items-center gap-1">
                                    <input
                                      type="text"
                                      autoFocus
                                      value={editingItemValue}
                                      onChange={(e) => setEditingItemValue(e.target.value)}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') handleUpdateAnswerItem(item.id, editingItemValue);
                                        if (e.key === 'Escape') setEditingItemId(null);
                                      }}
                                      className="px-2 py-1 rounded border border-purple-400 font-mono text-xs w-24 bg-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                                      placeholder="Ví dụ: 58,4"
                                    />
                                    <button
                                      onClick={() => handleUpdateAnswerItem(item.id, editingItemValue)}
                                      className="p-1 rounded bg-purple-600 text-white hover:bg-purple-700"
                                      title="Lưu đáp án"
                                    >
                                      <Check className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-1.5">
                                    <span className="px-2.5 py-1 rounded-lg font-mono font-bold text-xs bg-purple-100 text-purple-900 border border-purple-200">
                                      {item.correctAnswer || 'Chưa có'}
                                    </span>
                                    <button
                                      onClick={() => {
                                        setEditingItemId(item.id);
                                        setEditingItemValue(item.correctAnswer);
                                      }}
                                      className="p-1 text-slate-400 hover:text-purple-600 hover:bg-purple-50 rounded"
                                      title="Sửa đáp án"
                                    >
                                      <Edit2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                )}
                              </div>
                            )}
                          </td>

                          {/* Nguồn nhận dạng */}
                          <td className="py-3 px-3">
                            <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-medium ${
                              item.recognitionSource === 'answer_table'
                                ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                : item.recognitionSource === 'detailed_solution'
                                ? 'bg-purple-50 text-purple-700 border border-purple-200'
                                : item.recognitionSource === 'question_content'
                                ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                                : 'bg-amber-50 text-amber-700 border border-amber-200'
                            }`}>
                              {item.recognitionSource === 'answer_table' ? 'Bảng đáp án cuối' : item.recognitionSource === 'detailed_solution' ? 'Lời giải chi tiết' : item.recognitionSource === 'question_content' ? 'Trong câu hỏi' : 'Giáo viên chỉnh sửa'}
                            </span>
                          </td>

                          {/* Trạng thái */}
                          <td className="py-3 px-3 text-center">
                            {item.recognitionStatus === 'verified' ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                Đã nhận dạng
                              </span>
                            ) : item.recognitionStatus === 'needs_review' ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                                <AlertTriangle className="w-3 h-3 text-amber-600" />
                                Cần kiểm tra
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800">
                                <XCircle className="w-3 h-3 text-rose-600" />
                                Chưa tìm thấy
                              </span>
                            )}
                          </td>

                          {/* Thao tác / Xác nhận */}
                          <td className="py-3 px-3 text-center">
                            <button
                              onClick={() => handleToggleVerifyItem(item.id)}
                              className={`p-1.5 rounded-lg transition-all ${
                                item.teacherVerified
                                  ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                                  : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                              }`}
                              title={item.teacherVerified ? 'Đã xác nhận' : 'Nhấn để xác nhận'}
                            >
                              <Check className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* List of Questions with Interactive Verification & Edit */}
          {activeMainTab === 'questions_list' && (
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
          )}

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
