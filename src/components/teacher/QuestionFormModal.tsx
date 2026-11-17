import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChemGrade,
  ChemTopic,
  CognitiveLevel,
  MultipleChoiceOption,
  Question,
  QuestionType,
  SubjectItem,
  TrueFalseStatement,
} from '../../types';
import {
  CHEM_TOPIC_LABELS,
  DEFAULT_SUBJECT_ID,
  DEFAULT_SUBJECT_NAME,
  generateQuestionCode,
  resolveQuestionSubject,
  slugifySubjectId,
} from '../../constants/subjects';
import { ChemRenderer } from '../../utils/chemRenderer';
import { Eye, EyeOff, Image as ImageIcon, Plus, Sparkles, X } from 'lucide-react';

export interface QuestionFormModalProps {
  isOpen: boolean;
  mode: 'add' | 'edit';
  initialQuestion?: Question | null;
  subjects: SubjectItem[];
  existingQuestions: Question[];
  currentUserId?: string;
  onAddSubject?: (subject: SubjectItem) => void;
  onSave: (question: Question) => void;
  onClose: () => void;
}

const FORMULA_SNIPPETS: { label: string; snippet: string; title: string }[] = [
  { label: 'Chỉ số dưới ₂', snippet: '_{2}', title: 'Chèn chỉ số dưới dạng H_{2}O hoặc nhập thẳng H2O' },
  { label: 'Số mũ / Ion ²⁺', snippet: '^{2+}', title: 'Chèn số mũ hoặc điện tích ion' },
  { label: '→', snippet: ' → ', title: 'Mũi tên phản ứng một chiều' },
  { label: '⇌', snippet: ' ⇌ ', title: 'Mũi tên phản ứng thuận nghịch' },
  { label: '↑', snippet: '↑', title: 'Ký hiệu chất khí bay lên' },
  { label: '↓', snippet: '↓', title: 'Ký hiệu kết tủa' },
  { label: '$LaTeX$', snippet: '$\\frac{a}{b}$', title: 'Chèn công thức toán/hóa LaTeX ($...$)' },
  { label: '√', snippet: '$\\sqrt{x}$', title: 'Căn bậc hai LaTeX' },
];

export const QuestionFormModal: React.FC<QuestionFormModalProps> = ({
  isOpen,
  mode,
  initialQuestion,
  subjects,
  existingQuestions,
  currentUserId,
  onAddSubject,
  onSave,
  onClose,
}) => {
  const [subjectId, setSubjectId] = useState<string>(DEFAULT_SUBJECT_ID);
  const [grade, setGrade] = useState<ChemGrade>('12');
  const [topic, setTopic] = useState<ChemTopic>('hoa_dai_cuong');
  const [lessonTopic, setLessonTopic] = useState<string>('');
  const [qType, setQType] = useState<QuestionType>('part1_single_choice');
  const [level, setLevel] = useState<CognitiveLevel>('nhan_biet');
  const [code, setCode] = useState<string>('');
  const [content, setContent] = useState<string>('');
  const [options, setOptions] = useState<MultipleChoiceOption[]>([
    { id: 'A', text: '' },
    { id: 'B', text: '' },
    { id: 'C', text: '' },
    { id: 'D', text: '' },
  ]);
  const [correctOptionId, setCorrectOptionId] = useState<string>('A');
  const [statements, setStatements] = useState<TrueFalseStatement[]>([
    { id: 'a', statement: '', correctAnswer: true },
    { id: 'b', statement: '', correctAnswer: false },
    { id: 'c', statement: '', correctAnswer: true },
    { id: 'd', statement: '', correctAnswer: false },
  ]);
  const [shortAnswersRaw, setShortAnswersRaw] = useState<string>('');
  const [shortTolerance, setShortTolerance] = useState<string>('0.05');
  const [shortUnit, setShortUnit] = useState<string>('');
  const [explanation, setExplanation] = useState<string>('');
  const [imageUrl, setImageUrl] = useState<string>('');
  const [source, setSource] = useState<string>('');
  const [showPreview, setShowPreview] = useState<boolean>(true);
  const [formError, setFormError] = useState<string | null>(null);

  // Inline new subject creation
  const [isAddingSubject, setIsAddingSubject] = useState<boolean>(false);
  const [newSubjectName, setNewSubjectName] = useState<string>('');

  const contentTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setFormError(null);
    setIsAddingSubject(false);
    setNewSubjectName('');

    if (mode === 'edit' && initialQuestion) {
      const resolvedSub = resolveQuestionSubject(initialQuestion, subjects);
      setSubjectId(resolvedSub.id);
      setGrade(initialQuestion.grade || '12');
      setTopic(initialQuestion.topic || 'hoa_dai_cuong');
      setLessonTopic(initialQuestion.lessonTopic || '');
      setQType(initialQuestion.type || 'part1_single_choice');
      setLevel(initialQuestion.level || 'nhan_biet');
      setCode(initialQuestion.code || '');
      setContent(initialQuestion.content || '');
      setOptions(
        initialQuestion.options && initialQuestion.options.length > 0
          ? initialQuestion.options.map((o) => ({ ...o }))
          : [
              { id: 'A', text: '' },
              { id: 'B', text: '' },
              { id: 'C', text: '' },
              { id: 'D', text: '' },
            ]
      );
      setCorrectOptionId(initialQuestion.correctOptionId || 'A');
      setStatements(
        initialQuestion.statements && initialQuestion.statements.length > 0
          ? initialQuestion.statements.map((s) => ({ ...s }))
          : [
              { id: 'a', statement: '', correctAnswer: true },
              { id: 'b', statement: '', correctAnswer: false },
              { id: 'c', statement: '', correctAnswer: true },
              { id: 'd', statement: '', correctAnswer: false },
            ]
      );
      setShortAnswersRaw(initialQuestion.shortAnswerConfig?.acceptableAnswers?.join('; ') || '');
      setShortTolerance(
        initialQuestion.shortAnswerConfig?.tolerance !== undefined
          ? String(initialQuestion.shortAnswerConfig.tolerance)
          : '0.05'
      );
      setShortUnit(initialQuestion.shortAnswerConfig?.unit || '');
      setExplanation(initialQuestion.explanation || '');
      setImageUrl(initialQuestion.imageUrl || '');
      setSource(initialQuestion.source || '');
    } else {
      setSubjectId(DEFAULT_SUBJECT_ID);
      setGrade('12');
      setTopic('hoa_dai_cuong');
      setLessonTopic('');
      setQType('part1_single_choice');
      setLevel('nhan_biet');
      setCode('');
      setContent('');
      setOptions([
        { id: 'A', text: '' },
        { id: 'B', text: '' },
        { id: 'C', text: '' },
        { id: 'D', text: '' },
      ]);
      setCorrectOptionId('A');
      setStatements([
        { id: 'a', statement: '', correctAnswer: true },
        { id: 'b', statement: '', correctAnswer: false },
        { id: 'c', statement: '', correctAnswer: true },
        { id: 'd', statement: '', correctAnswer: false },
      ]);
      setShortAnswersRaw('');
      setShortTolerance('0.05');
      setShortUnit('');
      setExplanation('');
      setImageUrl('');
      setSource('');
    }
  }, [isOpen, mode, initialQuestion, subjects]);

  const lessonTopicSuggestions = useMemo(() => {
    const set = new Set<string>();
    existingQuestions.forEach((q) => {
      const sub = resolveQuestionSubject(q, subjects);
      if (sub.id === subjectId && q.grade === grade) {
        const lt = (q.lessonTopic || '').trim();
        if (lt) set.add(lt);
      }
    });
    // Also add other lesson topics for the same subject if current grade has none yet
    if (set.size === 0) {
      existingQuestions.forEach((q) => {
        const sub = resolveQuestionSubject(q, subjects);
        if (sub.id === subjectId) {
          const lt = (q.lessonTopic || '').trim();
          if (lt) set.add(lt);
        }
      });
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'vi'));
  }, [existingQuestions, subjects, subjectId, grade]);

  if (!isOpen) return null;

  const selectedSubject =
    subjects.find((s) => s.id === subjectId) || {
      id: DEFAULT_SUBJECT_ID,
      name: DEFAULT_SUBJECT_NAME,
    };

  const handleInsertFormulaSnippet = (snippet: string) => {
    const el = contentTextareaRef.current;
    if (!el) {
      setContent((prev) => `${prev}${snippet}`);
      return;
    }
    const start = el.selectionStart ?? content.length;
    const end = el.selectionEnd ?? content.length;
    const next = `${content.slice(0, start)}${snippet}${content.slice(end)}`;
    setContent(next);
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + snippet.length;
      el.setSelectionRange(pos, pos);
    });
  };

  const handleCreateInlineSubject = () => {
    const trimmed = newSubjectName.trim();
    if (!trimmed) return;
    const duplicate = subjects.find((s) => s.name.toLowerCase() === trimmed.toLowerCase());
    if (duplicate) {
      setSubjectId(duplicate.id);
      setIsAddingSubject(false);
      setNewSubjectName('');
      return;
    }
    const nowIso = new Date().toISOString();
    const newId = slugifySubjectId(trimmed);
    const created: SubjectItem = {
      id: newId,
      name: trimmed,
      shortName: trimmed.slice(0, 18),
      codePrefix: newId.replace(/^sub_/, '').toUpperCase().slice(0, 6) || 'MH',
      isDefault: false,
      order: subjects.length + 1,
      ownerId: currentUserId,
      authorId: currentUserId,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    onAddSubject?.(created);
    setSubjectId(created.id);
    setIsAddingSubject(false);
    setNewSubjectName('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!content.trim()) {
      setFormError('Vui lòng nhập nội dung câu hỏi.');
      return;
    }

    if (imageUrl.trim().length > 1000) {
      setFormError('Đường dẫn hình ảnh vượt quá giới hạn 1000 ký tự.');
      return;
    }

    if (qType === 'part1_single_choice') {
      const filled = options.filter((o) => o.text.trim().length > 0);
      if (filled.length < 2) {
        setFormError('Câu hỏi Phần I cần có ít nhất 2 phương án trả lời.');
        return;
      }
    } else if (qType === 'part2_true_false') {
      const emptyStmt = statements.find((s) => !s.statement.trim());
      if (emptyStmt) {
        setFormError(`Vui lòng nhập nội dung cho mệnh đề ${emptyStmt.id}).`);
        return;
      }
    } else if (qType === 'part3_short_answer') {
      const answers = shortAnswersRaw
        .split(';')
        .map((s) => s.trim())
        .filter(Boolean);
      if (answers.length === 0) {
        setFormError('Vui lòng nhập ít nhất một đáp án đúng cho câu trả lời ngắn.');
        return;
      }
    }

    const nowIso = new Date().toISOString();
    const shortList = shortAnswersRaw
      .split(';')
      .map((s) => s.trim())
      .filter(Boolean);
    const firstNum = Number((shortList[0] || '').replace(',', '.'));
    const isShortNum = shortList.length > 0 && !Number.isNaN(firstNum);
    const parsedTolerance = Number(shortTolerance.replace(',', '.'));

    const questionCode =
      code.trim() ||
      (mode === 'edit' && initialQuestion?.code
        ? initialQuestion.code
        : generateQuestionCode({ subjectId: selectedSubject.id, grade, type: qType, subjects }));

    const nextQuestion: Question = {
      ...(mode === 'edit' && initialQuestion ? initialQuestion : {}),
      id:
        mode === 'edit' && initialQuestion
          ? initialQuestion.id
          : `q_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      code: questionCode,
      subjectId: selectedSubject.id,
      subjectName: selectedSubject.name,
      grade,
      topic: selectedSubject.id === 'hoa_hoc' ? topic : 'hoa_dai_cuong',
      lessonTopic: lessonTopic.trim() || undefined,
      type: qType,
      level,
      content: content.trim(),
      options:
        qType === 'part1_single_choice'
          ? options.map((o) => ({
              id: o.id,
              text: o.text.trim(),
              isCorrect: o.id === correctOptionId,
            }))
          : undefined,
      correctOptionId: qType === 'part1_single_choice' ? correctOptionId : undefined,
      statements:
        qType === 'part2_true_false'
          ? statements.map((s) => ({
              id: s.id,
              statement: s.statement.trim(),
              correctAnswer: !!s.correctAnswer,
            }))
          : undefined,
      shortAnswerConfig:
        qType === 'part3_short_answer'
          ? {
              acceptableAnswers: shortList,
              isNumeric: isShortNum,
              numericValue: isShortNum ? firstNum : undefined,
              tolerance: Number.isFinite(parsedTolerance) ? parsedTolerance : 0.05,
              ...(shortUnit.trim() ? { unit: shortUnit.trim() } : {}),
            }
          : undefined,
      explanation: explanation.trim() || undefined,
      imageUrl: imageUrl.trim() || undefined,
      source: source.trim() || undefined,
      ownerId: (mode === 'edit' && initialQuestion?.ownerId) || currentUserId,
      authorId: (mode === 'edit' && initialQuestion?.authorId) || currentUserId || 'teacher_curr',
      createdAt: (mode === 'edit' && initialQuestion?.createdAt) || nowIso,
      updatedAt: nowIso,
      parseStatus: 'verified',
    };

    onSave(nextQuestion);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-white w-full max-w-3xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div>
            <h3 className="font-bold text-base">
              {mode === 'edit'
                ? `Chỉnh sửa câu hỏi (${initialQuestion?.code || ''})`
                : 'Thêm câu hỏi mới vào Ngân hàng'}
            </h3>
            <p className="text-xs text-slate-300 mt-0.5">
              Hỗ trợ chuẩn GDPT 2018 đa môn học, công thức hóa học &amp; toán học KaTeX
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng biểu mẫu câu hỏi"
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto flex-1 space-y-5 text-sm">
          {formError && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold">
              {formError}
            </div>
          )}

          {/* 1. Môn học + 2. Khối lớp */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold text-slate-700">1. Môn học</label>
                {onAddSubject && (
                  <button
                    type="button"
                    onClick={() => setIsAddingSubject((v) => !v)}
                    className="text-xs font-semibold text-teal-700 hover:text-teal-900 inline-flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{isAddingSubject ? 'Đóng' : 'Thêm môn mới'}</span>
                  </button>
                )}
              </div>
              <select
                value={subjectId}
                onChange={(e) => setSubjectId(e.target.value)}
                className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500"
              >
                {subjects.map((sub) => (
                  <option key={sub.id} value={sub.id}>
                    {sub.name}
                  </option>
                ))}
              </select>

              {isAddingSubject && (
                <div className="mt-2 flex items-center gap-2">
                  <input
                    type="text"
                    value={newSubjectName}
                    onChange={(e) => setNewSubjectName(e.target.value)}
                    placeholder="Tên môn học mới (VD: Khoa học tự nhiên)"
                    className="flex-1 px-3 py-2 rounded-xl border border-teal-300 bg-teal-50/40 text-xs focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                  <button
                    type="button"
                    onClick={handleCreateInlineSubject}
                    className="px-3 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold shrink-0"
                  >
                    Lưu môn
                  </button>
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">2. Khối lớp</label>
              <select
                value={grade}
                onChange={(e) => setGrade(e.target.value as ChemGrade)}
                className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500"
              >
                <option value="10">Lớp 10</option>
                <option value="11">Lớp 11</option>
                <option value="12">Lớp 12</option>
                <option value="chuyen_hsg">Chuyên &amp; HSG</option>
              </select>
            </div>
          </div>

          {/* 3. Bài học / Chủ đề (free text + autocomplete suggestions) */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className={selectedSubject.id === 'hoa_hoc' ? 'sm:col-span-2' : 'sm:col-span-3'}>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                3. Bài học / Chủ đề
              </label>
              <input
                type="text"
                list="hq-lesson-topic-suggestions"
                value={lessonTopic}
                onChange={(e) => setLessonTopic(e.target.value)}
                placeholder="VD: Cân bằng hóa học, Ester - Lipid, Hàm số bậc hai, Sóng cơ..."
                className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
              <datalist id="hq-lesson-topic-suggestions">
                {lessonTopicSuggestions.map((item) => (
                  <option key={item} value={item} />
                ))}
              </datalist>
              {lessonTopicSuggestions.length > 0 && (
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] text-slate-500">Gợi ý đã nhập:</span>
                  {lessonTopicSuggestions.slice(0, 6).map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => setLessonTopic(item)}
                      className="text-[11px] px-2 py-0.5 rounded-md bg-slate-100 hover:bg-teal-50 hover:text-teal-800 text-slate-700 transition-colors"
                    >
                      {item}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {selectedSubject.id === 'hoa_hoc' && (
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Phân môn Hóa (tùy chọn)
                </label>
                <select
                  value={topic}
                  onChange={(e) => setTopic(e.target.value as ChemTopic)}
                  className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500"
                >
                  {(Object.keys(CHEM_TOPIC_LABELS) as ChemTopic[]).map((k) => (
                    <option key={k} value={k}>
                      {CHEM_TOPIC_LABELS[k]}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* 4. Dạng câu hỏi + 5. Mức độ nhận thức + Mã câu hỏi */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">4. Dạng câu hỏi</label>
              <select
                value={qType}
                onChange={(e) => setQType(e.target.value as QuestionType)}
                className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500"
              >
                <option value="part1_single_choice">Phần I · 4 lựa chọn (A, B, C, D)</option>
                <option value="part2_true_false">Phần II · Đúng - Sai (4 ý a, b, c, d)</option>
                <option value="part3_short_answer">Phần III · Trả lời ngắn</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                5. Mức độ nhận thức
              </label>
              <select
                value={level}
                onChange={(e) => setLevel(e.target.value as CognitiveLevel)}
                className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500"
              >
                <option value="nhan_biet">Biết (Nhận biết)</option>
                <option value="thong_hieu">Hiểu (Thông hiểu)</option>
                <option value="van_dung">Vận dụng</option>
                <option value="van_dung_cao">Vận dụng cao</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Mã câu hỏi (tự động nếu để trống)
              </label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="VD: HH12_TN_105"
                className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-slate-300 bg-slate-50 font-mono text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
          </div>

          {/* 6. Nội dung câu hỏi + Formula Helper & Live Preview */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="text-xs font-bold text-slate-700">6. Nội dung câu hỏi *</label>
              <button
                type="button"
                onClick={() => setShowPreview((v) => !v)}
                className="text-xs font-semibold text-teal-700 hover:text-teal-900 inline-flex items-center gap-1"
              >
                {showPreview ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                <span>{showPreview ? 'Ẩn xem trước' : 'Xem trước công thức'}</span>
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 p-2 rounded-xl bg-slate-50 border border-slate-200">
              <span className="text-[11px] font-semibold text-slate-500 mr-1 inline-flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-teal-600" />
                Chèn nhanh:
              </span>
              {FORMULA_SNIPPETS.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  title={item.title}
                  onClick={() => handleInsertFormulaSnippet(item.snippet)}
                  className="px-2 py-1 rounded-lg bg-white border border-slate-200 hover:border-teal-400 hover:bg-teal-50 text-[11px] font-semibold text-slate-700 transition-colors"
                >
                  {item.label}
                </button>
              ))}
            </div>

            <textarea
              ref={contentTextareaRef}
              rows={4}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Nhập đề bài... Công thức hóa học như H2SO4, Fe(NO3)3, Al2(SO4)3 hay LaTeX $\frac{1}{2}$ sẽ tự động định dạng đẹp."
              className="w-full p-3 rounded-xl border border-slate-300 text-xs text-slate-900 leading-relaxed focus:outline-none focus:ring-2 focus:ring-teal-500"
            />

            {showPreview && content.trim() && (
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                <p className="text-[11px] font-semibold text-slate-500">Xem trước hiển thị:</p>
                <div className="text-sm text-slate-900">
                  <ChemRenderer text={content} />
                </div>
              </div>
            )}
          </div>

          {/* 7 & 8. Các phương án trả lời & Đáp án đúng */}
          {qType === 'part1_single_choice' && (
            <div className="space-y-3 p-4 rounded-xl bg-slate-50 border border-slate-200">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-700">
                  7 &amp; 8. Các phương án (A, B, C, D) và Đáp án đúng
                </label>
                <span className="text-xs font-bold text-emerald-700">
                  Đáp án đúng: {correctOptionId}
                </span>
              </div>
              <div className="space-y-2">
                {options.map((opt, idx) => {
                  const isCorrect = correctOptionId === opt.id;
                  return (
                    <div key={opt.id} className="flex items-center gap-2.5">
                      <label
                        className={`flex items-center gap-1.5 px-2.5 py-2 rounded-lg border cursor-pointer shrink-0 text-xs font-bold ${
                          isCorrect
                            ? 'bg-emerald-50 border-emerald-400 text-emerald-800'
                            : 'bg-white border-slate-200 text-slate-600'
                        }`}
                        title={`Chọn ${opt.id} là đáp án đúng`}
                      >
                        <input
                          type="radio"
                          name="correct_option_radio"
                          checked={isCorrect}
                          onChange={() => setCorrectOptionId(opt.id)}
                          className="text-emerald-600 focus:ring-emerald-500"
                        />
                        <span>{opt.id}</span>
                      </label>
                      <input
                        type="text"
                        value={opt.text}
                        onChange={(e) => {
                          const next = [...options];
                          next[idx] = { ...next[idx], text: e.target.value };
                          setOptions(next);
                        }}
                        placeholder={`Nội dung phương án ${opt.id}...`}
                        className="flex-1 min-h-[38px] px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500"
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {qType === 'part2_true_false' && (
            <div className="space-y-3 p-4 rounded-xl bg-slate-50 border border-slate-200">
              <label className="block text-xs font-bold text-slate-700">
                7 &amp; 8. Bốn mệnh đề Đúng / Sai (a, b, c, d)
              </label>
              <div className="space-y-2">
                {statements.map((stmt, idx) => (
                  <div key={stmt.id} className="flex items-center gap-2">
                    <span className="font-bold text-indigo-700 w-6 text-center shrink-0">
                      {stmt.id})
                    </span>
                    <input
                      type="text"
                      value={stmt.statement}
                      onChange={(e) => {
                        const next = [...statements];
                        next[idx] = { ...next[idx], statement: e.target.value };
                        setStatements(next);
                      }}
                      placeholder={`Nội dung mệnh đề ${stmt.id})...`}
                      className="flex-1 min-h-[38px] px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs focus:outline-none focus:ring-2 focus:ring-teal-500"
                    />
                    <select
                      value={stmt.correctAnswer ? 'true' : 'false'}
                      onChange={(e) => {
                        const next = [...statements];
                        next[idx] = { ...next[idx], correctAnswer: e.target.value === 'true' };
                        setStatements(next);
                      }}
                      className={`min-h-[38px] px-2.5 py-1.5 rounded-lg border text-xs font-bold ${
                        stmt.correctAnswer
                          ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                          : 'bg-rose-50 border-rose-300 text-rose-800'
                      }`}
                    >
                      <option value="true">Đúng</option>
                      <option value="false">Sai</option>
                    </select>
                  </div>
                ))}
              </div>
            </div>
          )}

          {qType === 'part3_short_answer' && (
            <div className="space-y-3 p-4 rounded-xl bg-slate-50 border border-slate-200">
              <label className="block text-xs font-bold text-slate-700">
                7 &amp; 8. Đáp án câu trả lời ngắn
              </label>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Các giá trị chấp nhận (phân tách bằng dấu `;`, VD: `6,72; 6.72`)
                </label>
                <input
                  type="text"
                  value={shortAnswersRaw}
                  onChange={(e) => setShortAnswersRaw(e.target.value)}
                  placeholder="VD: 6,72; 6.72 hoặc CH3COOH"
                  className="w-full min-h-[38px] px-3 py-1.5 rounded-lg border border-slate-300 bg-white font-mono text-xs focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Sai số cho phép (với đáp án số)
                  </label>
                  <input
                    type="text"
                    value={shortTolerance}
                    onChange={(e) => setShortTolerance(e.target.value)}
                    placeholder="0.05"
                    className="w-full min-h-[38px] px-3 py-1.5 rounded-lg border border-slate-300 bg-white font-mono text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Đơn vị (tùy chọn)
                  </label>
                  <input
                    type="text"
                    value={shortUnit}
                    onChange={(e) => setShortUnit(e.target.value)}
                    placeholder="VD: lít, gam, %"
                    className="w-full min-h-[38px] px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs"
                  />
                </div>
              </div>
            </div>
          )}

          {/* 9. Lời giải / Giải thích */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              9. Lời giải / Giải thích chi tiết
            </label>
            <textarea
              rows={3}
              value={explanation}
              onChange={(e) => setExplanation(e.target.value)}
              placeholder="Nhập hướng dẫn giải, phương trình phản ứng hoặc bước tính..."
              className="w-full p-3 rounded-xl border border-slate-300 text-xs text-slate-800 leading-relaxed focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
            {showPreview && explanation.trim() && (
              <div className="mt-2 p-3 rounded-xl bg-teal-50/50 border border-teal-100 text-xs text-slate-800">
                <ChemRenderer text={explanation} />
              </div>
            )}
          </div>

          {/* 10. Hình ảnh minh họa / Nguồn câu hỏi */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
                <ImageIcon className="w-3.5 h-3.5 text-slate-500" />
                <span>10. Đường dẫn hình ảnh minh họa (URL)</span>
              </label>
              <input
                type="text"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="https://... (tùy chọn)"
                className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
              {imageUrl.trim() && (
                <div className="mt-2 p-2 rounded-xl border border-slate-200 bg-slate-50 text-center">
                  <img
                    src={imageUrl.trim()}
                    alt="Xem trước hình minh họa"
                    className="max-h-32 mx-auto rounded-lg object-contain"
                    onError={(ev) => {
                      (ev.currentTarget as HTMLImageElement).style.display = 'none';
                    }}
                  />
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Nguồn câu hỏi / Sách giáo khoa (tùy chọn)
              </label>
              <input
                type="text"
                value={source}
                onChange={(e) => setSource(e.target.value)}
                placeholder="VD: Đề minh họa BGD, SGK Kết nối tri thức..."
                className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
          </div>

          {/* Footer Actions */}
          <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[42px] px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-colors"
            >
              Hủy
            </button>
            <button
              type="submit"
              className="min-h-[42px] px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold shadow-xs transition-colors"
            >
              {mode === 'edit' ? 'Lưu thay đổi' : 'Thêm vào ngân hàng'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
