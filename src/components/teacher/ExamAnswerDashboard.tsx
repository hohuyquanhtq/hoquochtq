import React, { useState } from 'react';
import { 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  Sparkles, 
  RotateCcw, 
  CheckCheck, 
  Eye, 
  Check, 
  Edit2, 
  Bot, 
  Grid3X3, 
  ListFilter,
  Info,
  CheckSquare,
  HelpCircle
} from 'lucide-react';
import { ParsedExamResult, AnswerRecognitionItem, RecognitionStatus, Question } from '../../types';
import { ChemRenderer } from '../../utils/chemRenderer';

interface ExamAnswerDashboardProps {
  parsedResult: ParsedExamResult;
  onUpdateAnswerItem: (itemId: string, newAns: string) => void;
  onToggleVerifyItem: (itemId: string) => void;
  onVerifyAll: () => void;
  onReRecognize: () => void;
  onDeepScan: () => void;
  onViewSnippet: () => void;
  isDeepScanning?: boolean;
}

export const ExamAnswerDashboard: React.FC<ExamAnswerDashboardProps> = ({
  parsedResult,
  onUpdateAnswerItem,
  onToggleVerifyItem,
  onVerifyAll,
  onReRecognize,
  onDeepScan,
  onViewSnippet,
  isDeepScanning = false,
}) => {
  const [selectedSectionTab, setSelectedSectionTab] = useState<'all' | 'part1' | 'part2' | 'part3' | 'issues'>('all');
  const [part2DisplayMode, setPart2DisplayMode] = useState<'matrix' | 'list'>('matrix');
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editingItemValue, setEditingItemValue] = useState<string>('');

  const answerItems = parsedResult.answerItems || [];
  const part1Items = answerItems.filter(it => it.section === 'part1');
  const part2Items = answerItems.filter(it => it.section === 'part2');
  const part3Items = answerItems.filter(it => it.section === 'part3');

  const totalCount = answerItems.length;
  const verifiedCount = answerItems.filter(it => it.recognitionStatus === 'verified' && it.correctAnswer).length;
  const needsReviewCount = answerItems.filter(it => it.recognitionStatus === 'needs_review' || it.recognitionStatus === 'conflicted').length;
  const notFoundCount = answerItems.filter(it => it.recognitionStatus === 'not_found' || !it.correctAnswer).length;
  const successPercent = totalCount > 0 ? Math.round((verifiedCount / totalCount) * 100) : 100;

  // Filter items with issues
  const attentionItems = answerItems.filter(it => it.recognitionStatus !== 'verified' || !it.teacherVerified || (it.validationIssues && it.validationIssues.length > 0));

  // Build matrix for Part II: Map questionNumber -> subQuestion ('a','b','c','d') -> item
  const part2QuestionsMap = new Map<number, Map<string, AnswerRecognitionItem>>();
  part2Items.forEach(item => {
    if (!part2QuestionsMap.has(item.questionNumber)) {
      part2QuestionsMap.set(item.questionNumber, new Map());
    }
    if (item.subQuestion) {
      part2QuestionsMap.get(item.questionNumber)!.set(item.subQuestion, item);
    }
  });

  const part2QuestionNumbers = Array.from(part2QuestionsMap.keys()).sort((a, b) => a - b);
  const subLetters: ('a' | 'b' | 'c' | 'd')[] = ['a', 'b', 'c', 'd'];

  return (
    <div className="space-y-6">
      
      {/* 1. TOP METRICS & ACTIONS BAR */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800 flex items-center gap-1.5 shadow-xs">
                <Sparkles className="w-4 h-4 text-emerald-600" />
                Bộ Nhận Dạng Đáp Án HQTest 2.0 (GDPT 2018)
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-800">
                Độ chính xác: {successPercent}%
              </span>
            </div>
            <h2 className="text-xl font-black text-slate-900 mt-1">
              Bảng Đối Chiếu & Nhận Dạng Đáp Án Tự Động
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Phân tách độc lập 3 phần đề thi, kiểm định logic ma trận hoán vị và đối soát lời giải chi tiết
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={onReRecognize}
              className="px-3 py-2 rounded-xl border border-slate-200 hover:border-slate-300 bg-white text-slate-700 text-xs font-bold transition-all flex items-center gap-1.5 hover:bg-slate-50"
              title="Chạy lại bộ máy bóc tách thuật toán"
            >
              <RotateCcw className="w-3.5 h-3.5 text-slate-600" />
              <span>⚡ Quét lại đáp án</span>
            </button>

            <button
              onClick={onDeepScan}
              disabled={isDeepScanning}
              className="px-3 py-2 rounded-xl border border-purple-200 hover:border-purple-300 bg-purple-50 text-purple-800 text-xs font-bold transition-all flex items-center gap-1.5 hover:bg-purple-100 disabled:opacity-50"
              title="Quét sâu bằng Gemini AI cho các dạng bảng phức tạp"
            >
              <Bot className={`w-4 h-4 text-purple-600 ${isDeepScanning ? 'animate-spin' : ''}`} />
              <span>{isDeepScanning ? 'Đang quét sâu...' : '🤖 Quét sâu AI'}</span>
            </button>

            <button
              onClick={onViewSnippet}
              className="px-3 py-2 rounded-xl border border-slate-200 hover:border-slate-300 bg-white text-slate-700 text-xs font-bold transition-all flex items-center gap-1.5 hover:bg-slate-50"
              title="Xem văn bản đáp án trích xuất từ tài liệu gốc"
            >
              <Eye className="w-3.5 h-3.5 text-slate-600" />
              <span>👁️ Xem trích đoạn nguồn</span>
            </button>

            <button
              onClick={onVerifyAll}
              className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm shadow-emerald-500/20"
            >
              <CheckCheck className="w-4 h-4 text-emerald-200" />
              <span>✓ Xác nhận toàn bộ ({totalCount})</span>
            </button>
          </div>
        </div>

        {/* 4 Metrics Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 pt-2">
          {/* Card 1: Verified */}
          <div className="p-3.5 rounded-2xl bg-emerald-50/70 border border-emerald-200/80 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold text-emerald-800 uppercase tracking-wide">Đã nhận dạng đúng</p>
              <p className="text-2xl font-black text-emerald-700 mt-0.5">
                {verifiedCount} <span className="text-xs font-semibold text-emerald-600">/ {totalCount} mục</span>
              </p>
            </div>
            <div className="p-2 rounded-xl bg-emerald-100 text-emerald-700">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </div>

          {/* Card 2: Needs Review */}
          <div className="p-3.5 rounded-2xl bg-amber-50/70 border border-amber-200/80 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold text-amber-800 uppercase tracking-wide">Cần kiểm tra lại</p>
              <p className="text-2xl font-black text-amber-700 mt-0.5">
                {needsReviewCount}
              </p>
            </div>
            <div className="p-2 rounded-xl bg-amber-100 text-amber-700">
              <AlertTriangle className="w-5 h-5" />
            </div>
          </div>

          {/* Card 3: Not Found */}
          <div className="p-3.5 rounded-2xl bg-rose-50/70 border border-rose-200/80 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold text-rose-800 uppercase tracking-wide">Chưa tìm thấy</p>
              <p className="text-2xl font-black text-rose-700 mt-0.5">
                {notFoundCount}
              </p>
            </div>
            <div className="p-2 rounded-xl bg-rose-100 text-rose-700">
              <XCircle className="w-5 h-5" />
            </div>
          </div>

          {/* Card 4: Structure Summary */}
          <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 flex flex-col justify-between">
            <p className="text-[11px] font-bold text-slate-700 uppercase tracking-wide">Cấu trúc 3 Phần GDPT 2018</p>
            <div className="grid grid-cols-3 gap-1 mt-1 text-center">
              <div className="bg-white rounded-lg p-1 border border-blue-100 shadow-2xs">
                <span className="text-[10px] text-blue-600 font-bold block">P.I (4 L/C)</span>
                <span className="text-xs font-black text-slate-800">{part1Items.length}</span>
              </div>
              <div className="bg-white rounded-lg p-1 border border-indigo-100 shadow-2xs">
                <span className="text-[10px] text-indigo-600 font-bold block">P.II (Đ/S)</span>
                <span className="text-xs font-black text-slate-800">{part2Items.length}</span>
              </div>
              <div className="bg-white rounded-lg p-1 border border-purple-100 shadow-2xs">
                <span className="text-[10px] text-purple-600 font-bold block">P.III (Ngắn)</span>
                <span className="text-xs font-black text-slate-800">{part3Items.length}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Section View Tabs */}
        <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-100 text-xs">
          <span className="text-slate-500 font-semibold mr-1">Xem bảng:</span>
          <button
            onClick={() => setSelectedSectionTab('all')}
            className={`px-3 py-1.5 rounded-xl font-bold transition-all ${
              selectedSectionTab === 'all'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            Đồng thời 3 Bảng ({totalCount} mục)
          </button>
          <button
            onClick={() => setSelectedSectionTab('part1')}
            className={`px-3 py-1.5 rounded-xl font-bold transition-all ${
              selectedSectionTab === 'part1'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
            }`}
          >
            Bảng 1: Trắc nghiệm 4 lựa chọn ({part1Items.length} câu)
          </button>
          <button
            onClick={() => setSelectedSectionTab('part2')}
            className={`px-3 py-1.5 rounded-xl font-bold transition-all ${
              selectedSectionTab === 'part2'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
            }`}
          >
            Bảng 2: Trắc nghiệm Đúng / Sai ({part2Items.length} ý)
          </button>
          <button
            onClick={() => setSelectedSectionTab('part3')}
            className={`px-3 py-1.5 rounded-xl font-bold transition-all ${
              selectedSectionTab === 'part3'
                ? 'bg-purple-600 text-white shadow-xs'
                : 'bg-purple-50 text-purple-700 hover:bg-purple-100'
            }`}
          >
            Bảng 3: Trắc nghiệm Trả lời ngắn ({part3Items.length} câu)
          </button>
          {attentionItems.length > 0 && (
            <button
              onClick={() => setSelectedSectionTab('issues')}
              className={`px-3 py-1.5 rounded-xl font-bold transition-all flex items-center gap-1 ${
                selectedSectionTab === 'issues'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'bg-amber-50 text-amber-800 hover:bg-amber-100'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>Cần rà soát ({attentionItems.length})</span>
            </button>
          )}
        </div>
      </div>

      {/* 2. BẢNG 1: TRẮC NGHIỆM 4 LỰA CHỌN (PHẦN I) */}
      {(selectedSectionTab === 'all' || selectedSectionTab === 'part1' || selectedSectionTab === 'issues') && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-blue-600"></span>
              <h3 className="text-base font-extrabold text-slate-900">
                BẢNG 1: TRẮC NGHIỆM 4 PHƯƠNG ÁN LỰA CHỌN (PHẦN I)
              </h3>
              <span className="px-2 py-0.5 rounded-md text-xs font-bold bg-blue-50 text-blue-700">
                {part1Items.filter(it => it.correctAnswer).length} / {part1Items.length} câu
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Nhấn trực tiếp vào nút A, B, C, D để đổi đáp án 1 chạm
            </p>
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-100 text-slate-700 font-bold uppercase tracking-wider text-[11px] border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-3 w-16 text-center">Câu</th>
                  <th className="py-2.5 px-4 min-w-[200px]">Tóm tắt nội dung câu hỏi</th>
                  <th className="py-2.5 px-4 min-w-[170px] text-center">Đáp án & Chỉnh sửa 1 chạm</th>
                  <th className="py-2.5 px-3 w-36">Nguồn trích xuất</th>
                  <th className="py-2.5 px-4 min-w-[150px]">Đối soát lời giải chi tiết</th>
                  <th className="py-2.5 px-3 w-28 text-center">Trạng thái</th>
                  <th className="py-2.5 px-3 w-20 text-center">Xác nhận</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {part1Items.map(item => {
                  const relatedQ = parsedResult.questions.find(q => q.id === item.questionId);
                  const isVerified = item.recognitionStatus === 'verified' && item.correctAnswer;
                  const isConflict = item.validationIssues && item.validationIssues.some(iss => iss.includes('lời giải chi tiết'));

                  return (
                    <tr 
                      key={item.id} 
                      className={`hover:bg-slate-50 transition-colors ${
                        isConflict ? 'bg-amber-50/40' : (!isVerified ? 'bg-rose-50/30' : '')
                      }`}
                    >
                      {/* Câu */}
                      <td className="py-2.5 px-3 text-center font-bold font-mono">
                        <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-900 border border-blue-200">
                          Câu {item.questionNumber}
                        </span>
                      </td>

                      {/* Tóm tắt nội dung */}
                      <td className="py-2.5 px-4 text-slate-700 max-w-xs md:max-w-md">
                        <div className="line-clamp-2">
                          <ChemRenderer text={relatedQ?.content || 'Câu hỏi trắc nghiệm'} inline />
                        </div>
                      </td>

                      {/* Đáp án & Nút chọn 1 chạm A, B, C, D */}
                      <td className="py-2.5 px-4 text-center">
                        <div className="inline-flex items-center gap-1.5">
                          {['A', 'B', 'C', 'D'].map(letter => {
                            const isSelected = item.correctAnswer === letter;
                            return (
                              <button
                                key={letter}
                                onClick={() => onUpdateAnswerItem(item.id, letter)}
                                className={`w-7 h-7 rounded-lg font-black text-xs transition-all ${
                                  isSelected
                                    ? 'bg-blue-600 text-white shadow-xs ring-2 ring-blue-300'
                                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                                }`}
                                title={`Chọn đáp án ${letter}`}
                              >
                                {letter}
                              </button>
                            );
                          })}
                        </div>
                      </td>

                      {/* Nguồn trích xuất */}
                      <td className="py-2.5 px-3">
                        <span className="inline-block px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                          {item.recognitionSource === 'answer_table' ? 'Bảng đáp án cuối' : item.recognitionSource === 'detailed_solution' ? 'Lời giải chi tiết' : item.recognitionSource === 'gemini_ai' ? 'Quét sâu AI' : 'Thủ công'}
                        </span>
                      </td>

                      {/* Đối soát lời giải chi tiết */}
                      <td className="py-2.5 px-4">
                        {item.notes ? (
                          <span className={`inline-flex items-center gap-1 text-[11px] font-semibold ${
                            isConflict ? 'text-amber-800 bg-amber-100/70 px-2 py-0.5 rounded' : 'text-slate-600'
                          }`}>
                            <Info className="w-3.5 h-3.5 shrink-0" />
                            <span className="truncate max-w-[200px]" title={item.notes}>{item.notes}</span>
                          </span>
                        ) : relatedQ?.explanation ? (
                          <span className="text-[11px] text-emerald-700 font-medium truncate max-w-[180px] block" title={relatedQ.explanation}>
                            ✓ Có lời giải chi tiết
                          </span>
                        ) : (
                          <span className="text-[11px] text-slate-400 italic">Không có</span>
                        )}
                      </td>

                      {/* Trạng thái */}
                      <td className="py-2.5 px-3 text-center">
                        {isVerified ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            Xác thực
                          </span>
                        ) : isConflict ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                            <AlertTriangle className="w-3 h-3 text-amber-600" />
                            Lệch giải
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800">
                            <XCircle className="w-3 h-3 text-rose-600" />
                            Thiếu
                          </span>
                        )}
                      </td>

                      {/* Xác nhận */}
                      <td className="py-2.5 px-3 text-center">
                        <button
                          onClick={() => onToggleVerifyItem(item.id)}
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
        </div>
      )}

      {/* 3. BẢNG 2: TRẮC NGHIỆM ĐÚNG / SAI (PHẦN II - MA TRẬN GDPT 2018) */}
      {(selectedSectionTab === 'all' || selectedSectionTab === 'part2' || selectedSectionTab === 'issues') && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-indigo-600"></span>
              <h3 className="text-base font-extrabold text-slate-900">
                BẢNG 2: TRẮC NGHIỆM ĐÚNG / SAI (PHẦN II - MA TRẬN CHUẨN BỘ GD&ĐT)
              </h3>
              <span className="px-2 py-0.5 rounded-md text-xs font-bold bg-indigo-50 text-indigo-700">
                {part2Items.filter(it => it.correctAnswer).length} / {part2Items.length} ý
              </span>
            </div>

            {/* View Mode Toggle: Grid vs List */}
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs font-bold">
              <button
                onClick={() => setPart2DisplayMode('matrix')}
                className={`px-3 py-1 rounded-lg flex items-center gap-1 transition-all ${
                  part2DisplayMode === 'matrix' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Grid3X3 className="w-3.5 h-3.5" />
                <span>Ma trận lưới 2D</span>
              </button>
              <button
                onClick={() => setPart2DisplayMode('list')}
                className={`px-3 py-1 rounded-lg flex items-center gap-1 transition-all ${
                  part2DisplayMode === 'list' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <ListFilter className="w-3.5 h-3.5" />
                <span>Danh sách chi tiết</span>
              </button>
            </div>
          </div>

          {/* MODE 1: MA TRẬN HOÁN VỊ LƯỚI 2D (GDPT 2018 STANDARD) */}
          {part2DisplayMode === 'matrix' ? (
            <div className="space-y-2">
              <div className="overflow-x-auto border border-slate-200 rounded-xl bg-slate-50/50">
                <table className="w-full text-center text-xs border-collapse">
                  <thead>
                    <tr className="bg-indigo-50 text-indigo-900 font-extrabold border-b border-indigo-200">
                      <th className="py-3 px-4 w-28 text-left uppercase tracking-wider text-[11px]">
                        Lệnh hỏi / Câu
                      </th>
                      {part2QuestionNumbers.map(qNum => (
                        <th key={qNum} className="py-3 px-6 font-mono text-sm border-l border-indigo-200">
                          Câu {qNum}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {subLetters.map(sub => (
                      <tr key={sub} className="hover:bg-slate-50 transition-colors">
                        {/* Sub Row Label */}
                        <td className="py-3.5 px-4 text-left font-black text-sm text-slate-800 bg-slate-50/80 font-mono">
                          Ý {sub})
                        </td>

                        {/* Cells for each question */}
                        {part2QuestionNumbers.map(qNum => {
                          const item = part2QuestionsMap.get(qNum)?.get(sub);
                          if (!item) {
                            return (
                              <td key={qNum} className="py-3.5 px-6 border-l border-slate-200 text-slate-400 italic">
                                Thiếu
                              </td>
                            );
                          }

                          const isTrue = item.correctAnswer === 'Đúng' || item.correctAnswer === 'Đ';
                          const isFalse = item.correctAnswer === 'Sai' || item.correctAnswer === 'S';

                          return (
                            <td key={qNum} className="py-3.5 px-6 border-l border-slate-200">
                              <div className="inline-flex items-center gap-1.5 p-1 rounded-xl bg-slate-100 border border-slate-200 shadow-2xs">
                                <button
                                  onClick={() => onUpdateAnswerItem(item.id, 'Đúng')}
                                  className={`px-3 py-1 rounded-lg font-extrabold text-xs transition-all ${
                                    isTrue
                                      ? 'bg-emerald-600 text-white shadow-xs ring-2 ring-emerald-300'
                                      : 'text-slate-600 hover:text-emerald-700 hover:bg-emerald-50'
                                  }`}
                                  title="Chọn Đúng"
                                >
                                  ✓ Đ
                                </button>
                                <button
                                  onClick={() => onUpdateAnswerItem(item.id, 'Sai')}
                                  className={`px-3 py-1 rounded-lg font-extrabold text-xs transition-all ${
                                    isFalse
                                      ? 'bg-rose-600 text-white shadow-xs ring-2 ring-rose-300'
                                      : 'text-slate-600 hover:text-rose-700 hover:bg-rose-50'
                                  }`}
                                  title="Chọn Sai"
                                >
                                  ✕ S
                                </button>
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-[11px] text-slate-500 italic text-right">
                * Cấu trúc ma trận lưới GDPT 2018 bảo đảm không bị đảo ngược giữa hàng câu hỏi và cột lệnh hỏi.
              </p>
            </div>
          ) : (
            /* MODE 2: DANH SÁCH CHI TIẾT TỪNG CÂU VÀ LỆNH HỎI */
            <div className="space-y-3">
              {part2QuestionNumbers.map(qNum => {
                const relatedQ = parsedResult.questions.find(q => q.code?.includes(`P2_C${qNum}`) || q.content?.includes(`Câu ${qNum}`));
                return (
                  <div key={qNum} className="border border-slate-200 rounded-xl p-4 bg-slate-50/40 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-extrabold text-sm text-indigo-900">
                        Câu {qNum} (Phần II - Đúng / Sai)
                      </span>
                      <span className="text-xs text-slate-500">
                        {relatedQ?.content ? relatedQ.content.slice(0, 80) + '...' : ''}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {subLetters.map(sub => {
                        const item = part2QuestionsMap.get(qNum)?.get(sub);
                        const stmtObj = relatedQ?.statements?.find(s => s.id === sub);
                        const isTrue = item?.correctAnswer === 'Đúng' || item?.correctAnswer === 'Đ';
                        const isFalse = item?.correctAnswer === 'Sai' || item?.correctAnswer === 'S';

                        return (
                          <div 
                            key={sub}
                            className="bg-white p-2.5 rounded-lg border border-slate-200 flex items-center justify-between gap-3 shadow-2xs"
                          >
                            <div className="flex items-start gap-2 min-w-0">
                              <span className="font-bold text-xs font-mono text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded">
                                {sub})
                              </span>
                              <span className="text-xs text-slate-700 line-clamp-2">
                                {stmtObj?.statement || `Lệnh hỏi ý ${sub}`}
                              </span>
                            </div>

                            {item && (
                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  onClick={() => onUpdateAnswerItem(item.id, 'Đúng')}
                                  className={`px-2.5 py-1 rounded text-xs font-bold transition-all ${
                                    isTrue ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-emerald-50'
                                  }`}
                                >
                                  Đúng
                                </button>
                                <button
                                  onClick={() => onUpdateAnswerItem(item.id, 'Sai')}
                                  className={`px-2.5 py-1 rounded text-xs font-bold transition-all ${
                                    isFalse ? 'bg-rose-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-rose-50'
                                  }`}
                                >
                                  Sai
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 4. BẢNG 3: TRẮC NGHIỆM TRẢ LỜI NGẮN (PHẦN III - GIỮ NGUYÊN SỐ THỰC CHÍNH XÁC) */}
      {(selectedSectionTab === 'all' || selectedSectionTab === 'part3' || selectedSectionTab === 'issues') && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-purple-600"></span>
              <h3 className="text-base font-extrabold text-slate-900">
                BẢNG 3: TRẮC NGHIỆM TRẢ LỜI NGẮN (PHẦN III - BẢO LƯU SỐ THẬP PHÂN CHÍNH XÁC)
              </h3>
              <span className="px-2 py-0.5 rounded-md text-xs font-bold bg-purple-50 text-purple-700">
                {part3Items.filter(it => it.correctAnswer).length} / {part3Items.length} câu
              </span>
            </div>
            <p className="text-xs text-purple-700 font-semibold">
              Bảo lưu nguyên vẹn số thập phân (dấu phẩy , hoặc chấm .), số nguyên, âm, không làm tròn
            </p>
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-100 text-slate-700 font-bold uppercase tracking-wider text-[11px] border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-3 w-16 text-center">Câu</th>
                  <th className="py-2.5 px-4 min-w-[200px]">Tóm tắt nội dung câu hỏi</th>
                  <th className="py-2.5 px-4 min-w-[180px]">Đáp án số thực & Chỉnh sửa trực tiếp</th>
                  <th className="py-2.5 px-3 min-w-[160px]">Các phương án chấp nhận</th>
                  <th className="py-2.5 px-3 w-24 text-center">Dung sai</th>
                  <th className="py-2.5 px-3 w-32">Nguồn trích xuất</th>
                  <th className="py-2.5 px-3 w-28 text-center">Trạng thái</th>
                  <th className="py-2.5 px-3 w-20 text-center">Xác nhận</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {part3Items.map(item => {
                  const relatedQ = parsedResult.questions.find(q => q.id === item.questionId);
                  const isEditing = editingItemId === item.id;
                  const isVerified = item.recognitionStatus === 'verified' && item.correctAnswer;

                  return (
                    <tr 
                      key={item.id} 
                      className={`hover:bg-slate-50 transition-colors ${
                        !isVerified ? 'bg-rose-50/30' : ''
                      }`}
                    >
                      {/* Câu */}
                      <td className="py-2.5 px-3 text-center font-bold font-mono">
                        <span className="px-2 py-0.5 rounded bg-purple-50 text-purple-900 border border-purple-200">
                          Câu {item.questionNumber}
                        </span>
                      </td>

                      {/* Tóm tắt */}
                      <td className="py-2.5 px-4 text-slate-700 max-w-xs md:max-w-md">
                        <div className="line-clamp-2">
                          <ChemRenderer text={relatedQ?.content || 'Câu hỏi trả lời ngắn'} inline />
                        </div>
                      </td>

                      {/* Đáp án số & Chỉnh sửa trực tiếp */}
                      <td className="py-2.5 px-4">
                        {isEditing ? (
                          <div className="flex items-center gap-1.5">
                            <input
                              type="text"
                              autoFocus
                              value={editingItemValue}
                              onChange={(e) => setEditingItemValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  onUpdateAnswerItem(item.id, editingItemValue);
                                  setEditingItemId(null);
                                }
                                if (e.key === 'Escape') setEditingItemId(null);
                              }}
                              className="px-2.5 py-1.5 rounded-lg border-2 border-purple-500 font-mono font-bold text-sm w-28 bg-white focus:outline-none shadow-xs"
                              placeholder="VD: 58,4"
                            />
                            <button
                              onClick={() => {
                                onUpdateAnswerItem(item.id, editingItemValue);
                                setEditingItemId(null);
                              }}
                              className="p-1.5 rounded-lg bg-purple-600 text-white hover:bg-purple-700 shadow-xs"
                              title="Lưu đáp án"
                            >
                              <Check className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <span className="px-3 py-1 rounded-xl font-mono font-black text-sm bg-purple-100 text-purple-900 border border-purple-200 shadow-2xs">
                              {item.correctAnswer || 'Chưa có'}
                            </span>
                            <button
                              onClick={() => {
                                setEditingItemId(item.id);
                                setEditingItemValue(item.correctAnswer);
                              }}
                              className="p-1.5 text-slate-400 hover:text-purple-700 hover:bg-purple-50 rounded-lg transition-colors"
                              title="Sửa đáp án nhanh"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </td>

                      {/* Các dạng chấp nhận */}
                      <td className="py-2.5 px-3">
                        <div className="flex flex-wrap gap-1">
                          {item.acceptedAnswers && item.acceptedAnswers.length > 0 ? (
                            item.acceptedAnswers.slice(0, 3).map((acc, idx) => (
                              <span key={idx} className="font-mono text-[11px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-700 border border-slate-200">
                                {acc}
                              </span>
                            ))
                          ) : (
                            <span className="font-mono text-[11px] text-slate-400">-</span>
                          )}
                        </div>
                      </td>

                      {/* Dung sai */}
                      <td className="py-2.5 px-3 text-center font-mono text-[11px] text-slate-600">
                        ±0.05
                      </td>

                      {/* Nguồn */}
                      <td className="py-2.5 px-3">
                        <span className="inline-block px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                          {item.recognitionSource === 'answer_table' ? 'Bảng đáp án cuối' : item.recognitionSource === 'detailed_solution' ? 'Kết luận lời giải' : 'Thủ công'}
                        </span>
                      </td>

                      {/* Trạng thái */}
                      <td className="py-2.5 px-3 text-center">
                        {isVerified ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            Chính xác
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800">
                            <XCircle className="w-3 h-3 text-rose-600" />
                            Chưa có
                          </span>
                        )}
                      </td>

                      {/* Xác nhận */}
                      <td className="py-2.5 px-3 text-center">
                        <button
                          onClick={() => onToggleVerifyItem(item.id)}
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
        </div>
      )}

    </div>
  );
};
