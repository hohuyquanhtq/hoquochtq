import React, { useState } from 'react';
import { 
  Question, 
  QuestionType, 
  CognitiveLevel, 
  ChemGrade, 
  ChemTopic, 
  Folder 
} from '../../types';
import { 
  BookOpen, 
  Search, 
  Filter, 
  Plus, 
  Trash2, 
  Edit3, 
  Sparkles, 
  CheckSquare, 
  Square, 
  ArrowRight,
  FlaskConical,
  FolderTree,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { ChemRenderer } from '../../utils/chemRenderer';
import { generateAiChemistryExplanation } from '../../services/geminiService';

interface QuestionBankProps {
  questions: Question[];
  folders: Folder[];
  onAddQuestion: (q: Question) => void;
  onUpdateQuestion: (q: Question) => void;
  onDeleteQuestion: (id: string) => void;
  onCreateExamFromSelected: (selectedQuestions: Question[]) => void;
}

export const QuestionBank: React.FC<QuestionBankProps> = ({
  questions,
  folders,
  onAddQuestion,
  onUpdateQuestion,
  onDeleteQuestion,
  onCreateExamFromSelected,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [gradeFilter, setGradeFilter] = useState<string>('all');
  const [topicFilter, setTopicFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [levelFilter, setLevelFilter] = useState<string>('all');
  
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [aiLoadingId, setAiLoadingId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Filter questions
  const filtered = questions.filter(q => {
    if (gradeFilter !== 'all' && q.grade !== gradeFilter) return false;
    if (topicFilter !== 'all' && q.topic !== topicFilter) return false;
    if (typeFilter !== 'all' && q.type !== typeFilter) return false;
    if (levelFilter !== 'all' && q.level !== levelFilter) return false;
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      const matchContent = q.content.toLowerCase().includes(term);
      const matchCode = q.code.toLowerCase().includes(term);
      const matchSource = q.source?.toLowerCase().includes(term);
      if (!matchContent && !matchCode && !matchSource) return false;
    }
    return true;
  });

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const selectAllFiltered = () => {
    if (selectedIds.size === filtered.length && filtered.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map(q => q.id)));
    }
  };

  const handleAiExplain = async (q: Question) => {
    setAiLoadingId(q.id);
    try {
      const exp = await generateAiChemistryExplanation(q);
      const updated = { ...q, explanation: exp };
      onUpdateQuestion(updated);
      showToast('Đã tạo giải thích hóa học thành công!');
    } catch {
      showToast('Không thể tạo lời giải AI lúc này.');
    } finally {
      setAiLoadingId(null);
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Toast */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white px-4 py-2.5 rounded-xl shadow-xl flex items-center gap-2 text-xs font-semibold animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Banner & Actions */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-indigo-600 font-bold text-xs uppercase tracking-wider">
            <BookOpen className="w-4 h-4" />
            <span>Kho Tri Thức Hóa Học THPT & Chuyên</span>
          </div>
          <h1 className="text-xl md:text-2xl font-extrabold text-slate-900 mt-1">
            Ngân Hàng Câu Hỏi Hóa Học ({questions.length} câu)
          </h1>
          <p className="text-xs md:text-sm text-slate-500 mt-1">
            Lưu trữ, phân loại theo chương trình Giáo dục phổ thông mới & Bồi dưỡng HSG Quốc Gia.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {selectedIds.size > 0 && (
            <button
              onClick={() => {
                const chosen = questions.filter(q => selectedIds.has(q.id));
                onCreateExamFromSelected(chosen);
              }}
              className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-md shadow-blue-500/20 transition-all flex items-center gap-1.5"
            >
              <FlaskConical className="w-4 h-4" />
              <span>Tạo đề từ {selectedIds.size} câu đã chọn</span>
            </button>
          )}

          <button
            onClick={() => setIsAddModalOpen(true)}
            className="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-black text-white text-xs font-bold shadow-xs transition-all flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>Thêm câu hỏi mới</span>
          </button>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs space-y-3">
        {/* Search Input */}
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Tìm kiếm theo từ khóa, công thức hóa học, mã câu hỏi (VD: ethylamine, H2SO4, pH, pin điện hóa)..."
            className="w-full pl-10 pr-4 py-2.5 text-xs font-medium rounded-xl border border-slate-200 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Dropdown Filters */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
          {/* Grade */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">Khối lớp:</label>
            <select
              value={gradeFilter}
              onChange={(e) => setGradeFilter(e.target.value)}
              className="w-full p-2 rounded-xl border border-slate-200 bg-white font-medium"
            >
              <option value="all">Tất cả các khối</option>
              <option value="12">Lớp 12 THPT</option>
              <option value="11">Lớp 11 THPT</option>
              <option value="10">Lớp 10 THPT</option>
              <option value="chuyen_hsg">Chuyên Hóa & HSG</option>
            </select>
          </div>

          {/* Topic */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">Chủ đề:</label>
            <select
              value={topicFilter}
              onChange={(e) => setTopicFilter(e.target.value)}
              className="w-full p-2 rounded-xl border border-slate-200 bg-white font-medium"
            >
              <option value="all">Tất cả chủ đề</option>
              <option value="hoa_dai_cuong">Hóa học đại cương</option>
              <option value="hoa_vo_co">Hóa vô cơ</option>
              <option value="hoa_huu_co">Hóa hữu cơ</option>
              <option value="hoa_thuc_nghiem">Hóa học thực nghiệm</option>
              <option value="chuyen_sau_hsg">Bồi dưỡng HSG Chuyên</option>
            </select>
          </div>

          {/* Type */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">Dạng câu hỏi:</label>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="w-full p-2 rounded-xl border border-slate-200 bg-white font-medium"
            >
              <option value="all">Tất cả 3 dạng</option>
              <option value="part1_single_choice">Phần I: 4 lựa chọn</option>
              <option value="part2_true_false">Phần II: Đúng - Sai 4 ý</option>
              <option value="part3_short_answer">Phần III: Trả lời ngắn</option>
            </select>
          </div>

          {/* Level */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">Mức độ nhận thức:</label>
            <select
              value={levelFilter}
              onChange={(e) => setLevelFilter(e.target.value)}
              className="w-full p-2 rounded-xl border border-slate-200 bg-white font-medium"
            >
              <option value="all">Tất cả mức độ</option>
              <option value="nhan_biet">Nhận biết</option>
              <option value="thong_hieu">Thông hiểu</option>
              <option value="van_dung">Vận dụng</option>
              <option value="van_dung_cao">Vận dụng cao</option>
            </select>
          </div>
        </div>

        {/* Selection Stats Bar */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
          <div className="flex items-center gap-2">
            <button
              onClick={selectAllFiltered}
              className="text-slate-600 hover:text-slate-900 font-semibold flex items-center gap-1.5"
            >
              {selectedIds.size > 0 && selectedIds.size === filtered.length ? (
                <CheckSquare className="w-4 h-4 text-blue-600" />
              ) : (
                <Square className="w-4 h-4 text-slate-400" />
              )}
              <span>Chọn tất cả ({filtered.length} câu tìm thấy)</span>
            </button>
            {selectedIds.size > 0 && (
              <span className="text-blue-600 font-bold">
                (Đã chọn {selectedIds.size} câu)
              </span>
            )}
          </div>

          {(gradeFilter !== 'all' || topicFilter !== 'all' || typeFilter !== 'all' || levelFilter !== 'all' || searchTerm) && (
            <button
              onClick={() => {
                setGradeFilter('all');
                setTopicFilter('all');
                setTypeFilter('all');
                setLevelFilter('all');
                setSearchTerm('');
              }}
              className="text-blue-600 hover:underline font-semibold"
            >
              Xóa bộ lọc
            </button>
          )}
        </div>
      </div>

      {/* Questions List */}
      <div className="space-y-3.5">
        {filtered.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center">
            <BookOpen className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <h3 className="text-base font-bold text-slate-800">Không tìm thấy câu hỏi phù hợp</h3>
            <p className="text-xs text-slate-500 mt-1">Hãy thử thay đổi từ khóa tìm kiếm hoặc điều chỉnh bộ lọc.</p>
          </div>
        ) : (
          filtered.map((q, idx) => {
            const isSelected = selectedIds.has(q.id);
            return (
              <div
                key={q.id}
                className={`bg-white border rounded-2xl p-5 shadow-xs transition-all ${
                  isSelected ? 'border-blue-400 ring-2 ring-blue-100' : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                {/* Card Top Row */}
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <button
                      onClick={() => toggleSelect(q.id)}
                      className="text-slate-400 hover:text-blue-600 focus:outline-none"
                    >
                      {isSelected ? (
                        <CheckSquare className="w-4 h-4 text-blue-600" />
                      ) : (
                        <Square className="w-4 h-4 text-slate-300" />
                      )}
                    </button>
                    <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-800">
                      {q.code}
                    </span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md uppercase ${
                      q.type === 'part1_single_choice'
                        ? 'bg-blue-100 text-blue-800'
                        : q.type === 'part2_true_false'
                        ? 'bg-indigo-100 text-indigo-800'
                        : 'bg-purple-100 text-purple-800'
                    }`}>
                      {q.type === 'part1_single_choice' ? 'Phần I' : q.type === 'part2_true_false' ? 'Phần II' : 'Phần III'}
                    </span>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-slate-100 text-slate-600">
                      {q.grade === 'chuyen_hsg' ? 'Chuyên & HSG' : `Khối ${q.grade}`}
                    </span>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200/60">
                      {q.level === 'nhan_biet' ? 'Nhận biết' : q.level === 'thong_hieu' ? 'Thông hiểu' : q.level === 'van_dung' ? 'Vận dụng' : 'Vận dụng cao'}
                    </span>
                    {q.source && (
                      <span className="text-[10px] text-slate-400">
                        Nguồn: {q.source}
                      </span>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => handleAiExplain(q)}
                      disabled={aiLoadingId === q.id}
                      title="Sử dụng Gemini AI để tạo lời giải chi tiết"
                      className="px-2 py-1 rounded-lg text-xs font-bold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 transition-colors flex items-center gap-1"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">AI Giải</span>
                    </button>
                    <button
                      onClick={() => setEditingQuestion({ ...q })}
                      title="Chỉnh sửa câu hỏi"
                      className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`Bạn có chắc muốn xóa câu hỏi ${q.code}?`)) {
                          onDeleteQuestion(q.id);
                          showToast('Đã xóa câu hỏi!');
                        }
                      }}
                      title="Xóa câu hỏi"
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Content */}
                <div className="text-sm font-medium text-slate-900 leading-relaxed mb-3">
                  <ChemRenderer text={q.content} />
                </div>

                {/* Part I Options */}
                {q.type === 'part1_single_choice' && q.options && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-slate-100">
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
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Part II Statements */}
                {q.type === 'part2_true_false' && q.statements && (
                  <div className="space-y-1.5 pt-2 border-t border-slate-100">
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

                {/* Part III Short Answer */}
                {q.type === 'part3_short_answer' && q.shortAnswerConfig && (
                  <div className="pt-2 border-t border-slate-100 text-xs flex items-center gap-2">
                    <span className="font-semibold text-purple-900">Đáp án chuẩn:</span>
                    <span className="px-2.5 py-1 bg-purple-100 text-purple-900 font-mono font-bold rounded-lg">
                      {q.shortAnswerConfig.acceptableAnswers.join(' / ')}
                    </span>
                    {q.shortAnswerConfig.unit && (
                      <span className="text-slate-500">({q.shortAnswerConfig.unit})</span>
                    )}
                  </div>
                )}

                {/* Explanation */}
                {q.explanation && (
                  <div className="mt-3 p-3 rounded-xl bg-blue-50/70 border border-blue-100 text-blue-900 text-xs">
                    <span className="font-bold">Hướng dẫn giải: </span>
                    <ChemRenderer text={q.explanation} inline />
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Edit Question Modal */}
      {editingQuestion && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
              <h3 className="font-bold text-sm">Chỉnh Sửa Câu Hỏi ({editingQuestion.code})</h3>
              <button onClick={() => setEditingQuestion(null)} className="text-slate-400 hover:text-white">✕</button>
            </div>
            <div className="p-6 overflow-y-auto flex-1 space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Nội dung câu hỏi</label>
                <textarea
                  rows={4}
                  value={editingQuestion.content}
                  onChange={(e) => setEditingQuestion({ ...editingQuestion, content: e.target.value })}
                  className="w-full p-2.5 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {editingQuestion.type === 'part1_single_choice' && (
                <div className="space-y-2">
                  <label className="block font-bold text-slate-700">Các phương án & Đáp án đúng:</label>
                  {editingQuestion.options?.map((opt, i) => (
                    <div key={opt.id} className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="correct_opt_edit"
                        checked={editingQuestion.correctOptionId === opt.id}
                        onChange={() => setEditingQuestion({ ...editingQuestion, correctOptionId: opt.id })}
                        className="w-4 h-4 text-blue-600"
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

              <div>
                <label className="block font-bold text-slate-700 mb-1">Hướng dẫn giải chi tiết</label>
                <textarea
                  rows={3}
                  value={editingQuestion.explanation || ''}
                  onChange={(e) => setEditingQuestion({ ...editingQuestion, explanation: e.target.value })}
                  className="w-full p-2.5 rounded-xl border border-slate-300 text-xs"
                />
              </div>
            </div>
            <div className="px-6 py-3 bg-slate-100 border-t border-slate-200 flex justify-end gap-2">
              <button
                onClick={() => setEditingQuestion(null)}
                className="px-4 py-2 rounded-xl text-slate-600 text-xs font-semibold"
              >
                Hủy
              </button>
              <button
                onClick={() => {
                  onUpdateQuestion(editingQuestion);
                  setEditingQuestion(null);
                  showToast('Đã lưu cập nhật câu hỏi!');
                }}
                className="px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold"
              >
                Lưu
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add New Question Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
              <h3 className="font-bold text-sm">Thêm Câu Hỏi Mới Vào Ngân Hàng</h3>
              <button onClick={() => setIsAddModalOpen(false)} className="text-slate-400 hover:text-white">✕</button>
            </div>
            
            <form onSubmit={(e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const content = (form.elements.namedItem('content') as HTMLTextAreaElement).value;
              const qType = (form.elements.namedItem('type') as HTMLSelectElement).value as QuestionType;
              const grade = (form.elements.namedItem('grade') as HTMLSelectElement).value as ChemGrade;
              const topic = (form.elements.namedItem('topic') as HTMLSelectElement).value as ChemTopic;
              const level = (form.elements.namedItem('level') as HTMLSelectElement).value as CognitiveLevel;
              const optA = (form.elements.namedItem('optA') as HTMLInputElement)?.value || '';
              const optB = (form.elements.namedItem('optB') as HTMLInputElement)?.value || '';
              const optC = (form.elements.namedItem('optC') as HTMLInputElement)?.value || '';
              const optD = (form.elements.namedItem('optD') as HTMLInputElement)?.value || '';
              const correctOpt = (form.elements.namedItem('correctOpt') as HTMLSelectElement)?.value || 'A';
              const explanation = (form.elements.namedItem('explanation') as HTMLTextAreaElement)?.value || '';

              const newQ: Question = {
                id: `q_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
                code: `H_${grade}_${Math.floor(100 + Math.random() * 900)}`,
                content,
                type: qType,
                grade,
                topic,
                level,
                options: qType === 'part1_single_choice' ? [
                  { id: 'A', text: optA, isCorrect: correctOpt === 'A' },
                  { id: 'B', text: optB, isCorrect: correctOpt === 'B' },
                  { id: 'C', text: optC, isCorrect: correctOpt === 'C' },
                  { id: 'D', text: optD, isCorrect: correctOpt === 'D' },
                ] : undefined,
                correctOptionId: qType === 'part1_single_choice' ? correctOpt : undefined,
                explanation,
                authorId: 'teacher_curr',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                parseStatus: 'verified',
              };

              onAddQuestion(newQ);
              setIsAddModalOpen(false);
              showToast('Đã thêm câu hỏi vào Ngân hàng!');
            }} className="p-6 overflow-y-auto flex-1 space-y-4 text-xs">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Khối lớp</label>
                  <select name="grade" className="w-full p-2 rounded-xl border border-slate-300">
                    <option value="12">Lớp 12 THPT</option>
                    <option value="11">Lớp 11 THPT</option>
                    <option value="10">Lớp 10 THPT</option>
                    <option value="chuyen_hsg">Chuyên & HSG</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Chủ đề</label>
                  <select name="topic" className="w-full p-2 rounded-xl border border-slate-300">
                    <option value="hoa_dai_cuong">Hóa đại cương</option>
                    <option value="hoa_vo_co">Hóa vô cơ</option>
                    <option value="hoa_huu_co">Hóa hữu cơ</option>
                    <option value="hoa_thuc_nghiem">Hóa thực nghiệm</option>
                    <option value="chuyen_sau_hsg">Chuyên sâu HSG</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Mức độ</label>
                  <select name="level" className="w-full p-2 rounded-xl border border-slate-300">
                    <option value="nhan_biet">Nhận biết</option>
                    <option value="thong_hieu">Thông hiểu</option>
                    <option value="van_dung">Vận dụng</option>
                    <option value="van_dung_cao">Vận dụng cao</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Dạng câu hỏi</label>
                <select name="type" className="w-full p-2 rounded-xl border border-slate-300">
                  <option value="part1_single_choice">Phần I: Trắc nghiệm 4 lựa chọn (A, B, C, D)</option>
                  <option value="part2_true_false">Phần II: Đúng - Sai 4 ý</option>
                  <option value="part3_short_answer">Phần III: Trả lời ngắn</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Nội dung câu hỏi</label>
                <textarea
                  name="content"
                  required
                  rows={3}
                  placeholder="Nhập nội dung câu hỏi, công thức hóa học (VD: Cho 5,4g Al tác dụng với HCl)..."
                  className="w-full p-2.5 rounded-xl border border-slate-300"
                />
              </div>

              <div className="space-y-2">
                <label className="block font-bold text-slate-700">Các phương án A, B, C, D:</label>
                <div className="grid grid-cols-2 gap-2">
                  <input name="optA" placeholder="Phương án A" className="p-2 rounded-lg border border-slate-300" />
                  <input name="optB" placeholder="Phương án B" className="p-2 rounded-lg border border-slate-300" />
                  <input name="optC" placeholder="Phương án C" className="p-2 rounded-lg border border-slate-300" />
                  <input name="optD" placeholder="Phương án D" className="p-2 rounded-lg border border-slate-300" />
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <span className="font-bold text-slate-700">Đáp án đúng:</span>
                  <select name="correctOpt" className="p-1.5 rounded-lg border border-slate-300 font-bold">
                    <option value="A">A</option>
                    <option value="B">B</option>
                    <option value="C">C</option>
                    <option value="D">D</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Hướng dẫn giải</label>
                <textarea
                  name="explanation"
                  rows={2}
                  placeholder="Phương trình hóa học, giải thích chi tiết..."
                  className="w-full p-2.5 rounded-xl border border-slate-300"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-slate-600 font-semibold"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold"
                >
                  Thêm vào ngân hàng
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
