import React, { useMemo, useState } from 'react';
import { CognitiveLevel, Question, QuestionType, SubjectItem } from '../../types';
import {
  COGNITIVE_LEVEL_SHORT_LABELS,
  DEFAULT_GDPT_2018_SUBJECTS,
  GRADE_LABELS,
  QUESTION_TYPE_SHORT_LABELS,
  getQuestionTopicDisplay,
  resolveQuestionSubject,
} from '../../constants/subjects';
import { ChemRenderer } from '../../utils/chemRenderer';
import {
  AlertCircle,
  CheckCircle2,
  CheckSquare,
  Grid,
  ListChecks,
  Search,
  Sparkles,
  Square,
  X,
} from 'lucide-react';

export interface QuestionBankPickerModalProps {
  isOpen: boolean;
  bankQuestions: Question[];
  existingExamQuestionIds: string[];
  subjects?: SubjectItem[];
  defaultSubjectId?: string;
  defaultGrade?: string;
  onAddQuestions: (picked: Question[]) => void;
  onClose: () => void;
}

type MatrixGrid = Record<QuestionType, Record<CognitiveLevel, number>>;

const LEVELS: CognitiveLevel[] = ['nhan_biet', 'thong_hieu', 'van_dung', 'van_dung_cao'];
const TYPES: QuestionType[] = ['part1_single_choice', 'part2_true_false', 'part3_short_answer'];

function createEmptyMatrix(): MatrixGrid {
  return {
    part1_single_choice: { nhan_biet: 0, thong_hieu: 0, van_dung: 0, van_dung_cao: 0 },
    part1_multiple_choice: { nhan_biet: 0, thong_hieu: 0, van_dung: 0, van_dung_cao: 0 },
    part2_true_false: { nhan_biet: 0, thong_hieu: 0, van_dung: 0, van_dung_cao: 0 },
    part3_short_answer: { nhan_biet: 0, thong_hieu: 0, van_dung: 0, van_dung_cao: 0 },
  };
}

export function cloneQuestionsForExam(picked: Question[]): Question[] {
  return picked.map((q) => {
    const copy = structuredClone(q);
    // Keep reference to bank origin ID inside a safe fresh exam-local question ID
    // while retaining the code so teachers can recognize where it came from.
    return {
      ...copy,
      id: `${q.id}__ex_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    };
  });
}

export function pickQuestionsByMatrix(params: {
  pool: Question[];
  matrix: MatrixGrid;
  excludeOriginalIds?: Set<string>;
}): { picked: Question[]; shortages: string[] } {
  const { pool, matrix, excludeOriginalIds = new Set() } = params;
  const usedIds = new Set<string>(excludeOriginalIds);
  const picked: Question[] = [];
  const shortages: string[] = [];

  for (const qType of TYPES) {
    for (const lvl of LEVELS) {
      const targetCount = Math.max(0, Math.floor(matrix[qType]?.[lvl] || 0));
      if (targetCount === 0) continue;

      const candidates = pool.filter(
        (q) => q.type === qType && q.level === lvl && !usedIds.has(q.id)
      );
      const shuffled = [...candidates].sort(() => Math.random() - 0.5);
      const chosen = shuffled.slice(0, targetCount);

      chosen.forEach((c) => {
        usedIds.add(c.id);
        picked.push(c);
      });

      if (chosen.length < targetCount) {
        shortages.push(
          `${QUESTION_TYPE_SHORT_LABELS[qType]} - ${COGNITIVE_LEVEL_SHORT_LABELS[lvl]}: cần ${targetCount}, có ${chosen.length}`
        );
      }
    }
  }

  return { picked, shortages };
}

export const QuestionBankPickerModal: React.FC<QuestionBankPickerModalProps> = ({
  isOpen,
  bankQuestions,
  existingExamQuestionIds,
  subjects = DEFAULT_GDPT_2018_SUBJECTS,
  defaultSubjectId = 'all',
  defaultGrade = 'all',
  onAddQuestions,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<'manual' | 'matrix'>('manual');
  const [searchTerm, setSearchTerm] = useState('');
  const [subjectFilter, setSubjectFilter] = useState<string>(defaultSubjectId || 'all');
  const [gradeFilter, setGradeFilter] = useState<string>(defaultGrade || 'all');
  const [topicFilter, setTopicFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [levelFilter, setLevelFilter] = useState<string>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [matrix, setMatrix] = useState<MatrixGrid>(() => createEmptyMatrix());
  const [matrixWarning, setMatrixWarning] = useState<string | null>(null);

  // Track original bank IDs already in exam (strips `__ex_...` suffix if cloned before)
  const alreadyInExamBaseIds = useMemo(() => {
    const set = new Set<string>();
    existingExamQuestionIds.forEach((id) => {
      set.add(id);
      const base = id.split('__ex_')[0];
      if (base) set.add(base);
    });
    return set;
  }, [existingExamQuestionIds]);

  const availableTopics = useMemo(() => {
    const set = new Set<string>();
    bankQuestions.forEach((q) => {
      const sub = resolveQuestionSubject(q, subjects);
      if (subjectFilter !== 'all' && sub.id !== subjectFilter) return;
      if (gradeFilter !== 'all' && q.grade !== gradeFilter) return;
      set.add(getQuestionTopicDisplay(q));
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'vi'));
  }, [bankQuestions, subjects, subjectFilter, gradeFilter]);

  const scopedPool = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return bankQuestions.filter((q) => {
      const sub = resolveQuestionSubject(q, subjects);
      if (subjectFilter !== 'all' && sub.id !== subjectFilter) return false;
      if (gradeFilter !== 'all' && q.grade !== gradeFilter) return false;
      if (topicFilter !== 'all' && getQuestionTopicDisplay(q) !== topicFilter) return false;
      if (activeTab === 'manual') {
        if (typeFilter !== 'all' && q.type !== typeFilter) return false;
        if (levelFilter !== 'all' && q.level !== levelFilter) return false;
        if (term) {
          const hit =
            q.content.toLowerCase().includes(term) ||
            q.code.toLowerCase().includes(term) ||
            getQuestionTopicDisplay(q).toLowerCase().includes(term);
          if (!hit) return false;
        }
      }
      return true;
    });
  }, [
    bankQuestions,
    subjects,
    subjectFilter,
    gradeFilter,
    topicFilter,
    typeFilter,
    levelFilter,
    searchTerm,
    activeTab,
  ]);

  // Available counts per (type x level) excluding questions already in exam
  const availableMatrixCounts = useMemo(() => {
    const counts = createEmptyMatrix();
    scopedPool.forEach((q) => {
      if (alreadyInExamBaseIds.has(q.id)) return;
      if (counts[q.type] && typeof counts[q.type][q.level] === 'number') {
        counts[q.type][q.level] += 1;
      }
    });
    return counts;
  }, [scopedPool, alreadyInExamBaseIds]);

  const totalMatrixRequested = useMemo(() => {
    let total = 0;
    TYPES.forEach((t) => LEVELS.forEach((l) => (total += matrix[t][l] || 0)));
    return total;
  }, [matrix]);

  if (!isOpen) return null;

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const handleConfirmManual = () => {
    const chosen = bankQuestions.filter((q) => selectedIds.has(q.id));
    if (chosen.length === 0) return;
    onAddQuestions(cloneQuestionsForExam(chosen));
    setSelectedIds(new Set());
    onClose();
  };

  const handleConfirmMatrix = () => {
    setMatrixWarning(null);
    if (totalMatrixRequested <= 0) {
      setMatrixWarning('Vui lòng nhập số lượng ít nhất 1 câu hỏi vào bảng ma trận.');
      return;
    }
    const { picked, shortages } = pickQuestionsByMatrix({
      pool: scopedPool,
      matrix,
      excludeOriginalIds: alreadyInExamBaseIds,
    });
    if (picked.length === 0) {
      setMatrixWarning(
        'Không có câu hỏi khả dụng phù hợp với điều kiện ma trận và bộ lọc hiện tại.'
      );
      return;
    }
    onAddQuestions(cloneQuestionsForExam(picked));
    if (shortages.length > 0) {
      // Still close after adding? Let's inform teacher cleanly before closing or stay if 0.
      setMatrixWarning(
        `Đã thêm ${picked.length} câu vào đề. Một số ô thiếu câu hỏi trong ngân hàng: ${shortages.join('; ')}`
      );
      setMatrix(createEmptyMatrix());
      return;
    }
    setMatrix(createEmptyMatrix());
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-white w-full max-w-5xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div>
            <h3 className="font-bold text-base">Chọn câu hỏi từ Ngân hàng câu hỏi</h3>
            <p className="text-xs text-slate-300 mt-0.5">
              Các câu được thêm vào đề thi dưới dạng bản sao độc lập (không làm thay đổi ngân hàng gốc)
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng cửa sổ chọn câu hỏi"
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode Tabs */}
        <div className="px-6 pt-4 pb-3 border-b border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setActiveTab('manual');
                setMatrixWarning(null);
              }}
              className={`min-h-[38px] px-4 py-1.5 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition-colors ${
                activeTab === 'manual'
                  ? 'bg-teal-600 text-white shadow-xs'
                  : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
              }`}
            >
              <ListChecks className="w-4 h-4" />
              <span>Chọn câu hỏi thủ công</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('matrix');
                setMatrixWarning(null);
              }}
              className={`min-h-[38px] px-4 py-1.5 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition-colors ${
                activeTab === 'matrix'
                  ? 'bg-teal-600 text-white shadow-xs'
                  : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
              }`}
            >
              <Grid className="w-4 h-4" />
              <span>Bốc câu hỏi theo Ma trận</span>
            </button>
          </div>

          <span className="text-xs font-semibold text-slate-600 tabular-nums">
            Nguồn khả dụng: {scopedPool.length} câu
          </span>
        </div>

        {/* Shared Pool Filters */}
        <div className="px-6 py-3.5 border-b border-slate-200 bg-white space-y-2.5 shrink-0 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
            <select
              value={subjectFilter}
              onChange={(e) => {
                setSubjectFilter(e.target.value);
                setTopicFilter('all');
              }}
              className="min-h-[36px] px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white font-medium"
            >
              <option value="all">Tất cả môn học</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>

            <select
              value={gradeFilter}
              onChange={(e) => {
                setGradeFilter(e.target.value);
                setTopicFilter('all');
              }}
              className="min-h-[36px] px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white font-medium"
            >
              <option value="all">Tất cả khối lớp</option>
              <option value="10">Lớp 10</option>
              <option value="11">Lớp 11</option>
              <option value="12">Lớp 12</option>
              <option value="chuyen_hsg">Chuyên &amp; HSG</option>
            </select>

            <select
              value={topicFilter}
              onChange={(e) => setTopicFilter(e.target.value)}
              className="min-h-[36px] px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white font-medium"
            >
              <option value="all">Tất cả chủ đề</option>
              {availableTopics.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>

            {activeTab === 'manual' && (
              <>
                <select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                  className="min-h-[36px] px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white font-medium"
                >
                  <option value="all">Tất cả dạng</option>
                  <option value="part1_single_choice">Phần I (4 lựa chọn)</option>
                  <option value="part2_true_false">Phần II (Đúng/Sai)</option>
                  <option value="part3_short_answer">Phần III (Trả lời ngắn)</option>
                </select>

                <select
                  value={levelFilter}
                  onChange={(e) => setLevelFilter(e.target.value)}
                  className="min-h-[36px] px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white font-medium"
                >
                  <option value="all">Tất cả mức độ</option>
                  <option value="nhan_biet">Biết</option>
                  <option value="thong_hieu">Hiểu</option>
                  <option value="van_dung">Vận dụng</option>
                  <option value="van_dung_cao">Vận dụng cao</option>
                </select>
              </>
            )}
          </div>

          {activeTab === 'manual' && (
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Tìm nhanh theo nội dung, mã câu hỏi hoặc chủ đề..."
                className="w-full min-h-[38px] pl-9 pr-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'manual' ? (
            <div className="space-y-3">
              {scopedPool.length === 0 ? (
                <div className="py-12 text-center text-sm text-slate-500 border border-dashed border-slate-200 rounded-2xl">
                  Không có câu hỏi nào phù hợp với bộ lọc đang chọn.
                </div>
              ) : (
                scopedPool.map((q) => {
                  const isChecked = selectedIds.has(q.id);
                  const isAlreadyInExam = alreadyInExamBaseIds.has(q.id);
                  const sub = resolveQuestionSubject(q, subjects);

                  return (
                    <div
                      key={q.id}
                      onClick={() => toggleSelect(q.id)}
                      className={`p-4 rounded-xl border cursor-pointer transition-colors ${
                        isChecked
                          ? 'border-teal-500 bg-teal-50/40'
                          : 'border-slate-200 hover:border-slate-300 bg-white'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 shrink-0">
                          {isChecked ? (
                            <CheckSquare className="w-4 h-4 text-teal-600" />
                          ) : (
                            <Square className="w-4 h-4 text-slate-300" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0 space-y-1.5">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                            <span className="font-mono font-bold text-slate-900">{q.code}</span>
                            <span className="text-slate-300">·</span>
                            <span className="font-semibold text-teal-700">{sub.name}</span>
                            <span className="text-slate-300">·</span>
                            <span className="text-slate-700">{GRADE_LABELS[q.grade]}</span>
                            <span className="text-slate-300">·</span>
                            <span className="text-slate-600">{getQuestionTopicDisplay(q)}</span>
                            <span className="text-slate-300">·</span>
                            <span className="font-semibold text-slate-800">
                              {QUESTION_TYPE_SHORT_LABELS[q.type]}
                            </span>
                            <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold">
                              {COGNITIVE_LEVEL_SHORT_LABELS[q.level]}
                            </span>
                            {isAlreadyInExam && (
                              <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 font-semibold">
                                Đã có trong đề
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-slate-800 leading-relaxed line-clamp-3">
                            <ChemRenderer text={q.content} />
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {matrixWarning && (
                <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-semibold flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <span>{matrixWarning}</span>
                </div>
              )}

              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 leading-relaxed">
                Nhập số lượng câu hỏi cần bốc ngẫu nhiên cho từng dạng bài và mức độ nhận thức từ bộ lọc ở trên. Hệ thống tự động loại trừ các câu đã có sẵn trong đề thi hiện tại.
              </div>

              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-xs text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 font-bold">
                      <th className="py-3 px-4">Dạng câu hỏi</th>
                      {LEVELS.map((lvl) => (
                        <th key={lvl} className="py-3 px-3 text-center">
                          {COGNITIVE_LEVEL_SHORT_LABELS[lvl]}
                        </th>
                      ))}
                      <th className="py-3 px-4 text-right">Tổng theo dạng</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {TYPES.map((qType) => {
                      const rowSum = LEVELS.reduce((sum, l) => sum + (matrix[qType][l] || 0), 0);
                      return (
                        <tr key={qType} className="hover:bg-slate-50/70">
                          <td className="py-3 px-4 font-semibold text-slate-900">
                            {QUESTION_TYPE_SHORT_LABELS[qType]}
                          </td>
                          {LEVELS.map((lvl) => {
                            const maxAvail = availableMatrixCounts[qType][lvl];
                            const val = matrix[qType][lvl];
                            return (
                              <td key={lvl} className="py-3 px-3 text-center">
                                <div className="inline-flex flex-col items-center gap-1">
                                  <input
                                    type="number"
                                    min={0}
                                    max={maxAvail}
                                    value={val}
                                    onChange={(e) => {
                                      const n = Math.max(0, Math.floor(Number(e.target.value) || 0));
                                      setMatrix((prev) => ({
                                        ...prev,
                                        [qType]: {
                                          ...prev[qType],
                                          [lvl]: n,
                                        },
                                      }));
                                    }}
                                    className={`w-16 min-h-[36px] px-2 py-1 rounded-lg border text-center font-bold tabular-nums ${
                                      val > maxAvail
                                        ? 'border-amber-400 bg-amber-50 text-amber-900'
                                        : 'border-slate-300 bg-white text-slate-900'
                                    }`}
                                  />
                                  <span className="text-[11px] text-slate-500 tabular-nums">
                                    Có sẵn: {maxAvail}
                                  </span>
                                </div>
                              </td>
                            );
                          })}
                          <td className="py-3 px-4 text-right font-bold text-slate-900 tabular-nums">
                            {rowSum} câu
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setMatrix(createEmptyMatrix())}
                  className="text-slate-600 hover:text-slate-900 font-semibold"
                >
                  Đặt lại ma trận về 0
                </button>
                <span className="font-bold text-teal-800 tabular-nums">
                  Tổng số câu sẽ bốc thêm: {totalMatrixRequested} câu
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3 shrink-0">
          <span className="text-xs text-slate-600 tabular-nums">
            {activeTab === 'manual'
              ? `Đã chọn ${selectedIds.size} câu hỏi`
              : `Tổng ma trận: ${totalMatrixRequested} câu`}
          </span>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[40px] px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold"
            >
              Đóng
            </button>
            {activeTab === 'manual' ? (
              <button
                type="button"
                disabled={selectedIds.size === 0}
                onClick={handleConfirmManual}
                className="min-h-[40px] px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-xs font-semibold inline-flex items-center gap-1.5"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Thêm {selectedIds.size} câu vào đề</span>
              </button>
            ) : (
              <button
                type="button"
                disabled={totalMatrixRequested === 0}
                onClick={handleConfirmMatrix}
                className="min-h-[40px] px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-xs font-semibold inline-flex items-center gap-1.5"
              >
                <Sparkles className="w-4 h-4" />
                <span>Bốc ngẫu nhiên theo ma trận</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
