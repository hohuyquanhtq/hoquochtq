import React, { useEffect, useMemo, useState } from 'react';
import {
  AdminSchoolQuestionItem,
  AdminSchoolTeacherSummary,
  CognitiveLevel,
  Question,
  QuestionType,
  SubjectItem,
} from '../../types';
import {
  COGNITIVE_LEVEL_SHORT_LABELS,
  DEFAULT_GDPT_2018_SUBJECTS,
  GRADE_LABELS,
  QUESTION_TYPE_SHORT_LABELS,
  getQuestionTopicDisplay,
  resolveQuestionSubject,
} from '../../constants/subjects';
import { ChemRenderer } from '../../utils/chemRenderer';
import { fetchSchoolQuestionBankOnServer } from '../../services/adminQuestionBankApi';
import { buildExamQuestionProvenanceClone } from '../../utils/schoolQuestionBankEngine';
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  CheckSquare,
  ChevronDown,
  ChevronUp,
  Grid,
  ListChecks,
  RefreshCw,
  Search,
  Sparkles,
  Square,
  User as UserIcon,
  Users,
  X,
} from 'lucide-react';

export interface QuestionBankPickerModalProps {
  isOpen: boolean;
  bankQuestions: Question[];
  existingExamQuestionIds: string[];
  subjects?: SubjectItem[];
  defaultSubjectId?: string;
  defaultGrade?: string;
  isAdmin?: boolean;
  currentUserId?: string;
  currentUserName?: string;
  onAddQuestions: (picked: Question[]) => void;
  onClose: () => void;
}

type MatrixGrid = Record<QuestionType, Record<CognitiveLevel, number>>;
type PickerScope = 'personal' | 'school_bank';
type PickerQuestion = Question & {
  ownerUid?: string;
  ownerName?: string;
  ownerEmail?: string;
  resolvedTextbookSeries?: string;
  __scope?: PickerScope;
};

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

export function cloneQuestionsForExam(
  picked: Array<Question & { ownerUid?: string; ownerName?: string; __scope?: PickerScope }>,
  defaultScope: PickerScope = 'personal',
  fallbackOwnerName?: string
): Question[] {
  return picked.map((q) => {
    const scope: PickerScope = q.sourceScope || q.__scope || defaultScope;
    const cloned = buildExamQuestionProvenanceClone(q, scope, fallbackOwnerName);
    // Strip temporary UI-only fields while preserving exam provenance metadata
    const clean = { ...cloned } as Record<string, unknown>;
    delete clean.__scope;
    delete clean.ownerUid;
    delete clean.ownerName;
    delete clean.ownerEmail;
    delete clean.ownerRole;
    delete clean.ownerSchool;
    delete clean.resolvedSubjectId;
    delete clean.resolvedSubjectName;
    delete clean.resolvedTextbookSeries;
    return clean as unknown as Question;
  });
}

export function pickQuestionsByMatrix(params: {
  pool: PickerQuestion[];
  matrix: MatrixGrid;
  excludeOriginalIds?: Set<string>;
}): { picked: PickerQuestion[]; shortages: string[] } {
  const { pool, matrix, excludeOriginalIds = new Set() } = params;
  const usedIds = new Set<string>(excludeOriginalIds);
  const picked: PickerQuestion[] = [];
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
  isAdmin = false,
  currentUserId,
  currentUserName,
  onAddQuestions,
  onClose,
}) => {
  const [scope, setScope] = useState<PickerScope>('personal');
  const [activeTab, setActiveTab] = useState<'manual' | 'matrix'>('manual');
  const [searchTerm, setSearchTerm] = useState('');
  const [subjectFilter, setSubjectFilter] = useState<string>(defaultSubjectId || 'all');
  const [gradeFilter, setGradeFilter] = useState<string>(defaultGrade || 'all');
  const [textbookFilter, setTextbookFilter] = useState<string>('all');
  const [topicFilter, setTopicFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [levelFilter, setLevelFilter] = useState<string>('all');

  // Admin School-Wide state
  const [schoolQuestions, setSchoolQuestions] = useState<AdminSchoolQuestionItem[]>([]);
  const [schoolTeachers, setSchoolTeachers] = useState<AdminSchoolTeacherSummary[]>([]);
  const [schoolTextbooks, setSchoolTextbooks] = useState<string[]>([]);
  const [selectedTeacherIds, setSelectedTeacherIds] = useState<string[]>([]);
  const [isLoadingSchool, setIsLoadingSchool] = useState(false);
  const [schoolError, setSchoolError] = useState<string | null>(null);
  const [hasLoadedSchool, setHasLoadedSchool] = useState(false);

  // Persisted selection across scope & filter switches so Admin can combine multiple teachers + own bank!
  const [selectedMap, setSelectedMap] = useState<Record<string, PickerQuestion>>({});
  const [expandedPreviewIds, setExpandedPreviewIds] = useState<Set<string>>(new Set());

  const [matrix, setMatrix] = useState<MatrixGrid>(() => createEmptyMatrix());
  const [matrixWarning, setMatrixWarning] = useState<string | null>(null);

  const loadSchoolQuestions = async () => {
    if (!isAdmin) return;
    setIsLoadingSchool(true);
    setSchoolError(null);
    try {
      const res = await fetchSchoolQuestionBankOnServer({ includeAllFiltered: true });
      setSchoolQuestions(res.items || []);
      setSchoolTeachers(res.teachers || []);
      setSchoolTextbooks(res.filterOptions?.textbookSeries || []);
      setHasLoadedSchool(true);
    } catch (err) {
      setSchoolError(
        err instanceof Error ? err.message : 'Không thể tải Ngân hàng câu hỏi toàn trường.'
      );
    } finally {
      setIsLoadingSchool(false);
    }
  };

  useEffect(() => {
    if (isOpen && isAdmin && scope === 'school_bank' && !hasLoadedSchool && !isLoadingSchool) {
      void loadSchoolQuestions();
    }
  }, [isOpen, isAdmin, scope, hasLoadedSchool, isLoadingSchool]);

  // Active source pool based on scope
  const activePool: PickerQuestion[] = useMemo(() => {
    if (isAdmin && scope === 'school_bank') {
      return schoolQuestions.map((q) => ({
        ...q,
        __scope: 'school_bank' as const,
      }));
    }
    return bankQuestions.map((q) => ({
      ...q,
      ownerUid: q.ownerId || q.authorId || currentUserId,
      ownerName: currentUserName || 'Ngân hàng của tôi',
      __scope: 'personal' as const,
    }));
  }, [isAdmin, scope, schoolQuestions, bankQuestions, currentUserId, currentUserName]);

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
    activePool.forEach((q) => {
      const sub = resolveQuestionSubject(q, subjects);
      if (subjectFilter !== 'all' && sub.id !== subjectFilter) return;
      if (gradeFilter !== 'all' && q.grade !== gradeFilter) return;
      if (
        scope === 'school_bank' &&
        selectedTeacherIds.length > 0 &&
        !selectedTeacherIds.includes(q.ownerUid || q.ownerId || q.authorId)
      ) {
        return;
      }
      set.add(getQuestionTopicDisplay(q));
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'vi'));
  }, [activePool, subjects, subjectFilter, gradeFilter, scope, selectedTeacherIds]);

  const scopedPool = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return activePool.filter((q) => {
      if (scope === 'school_bank' && selectedTeacherIds.length > 0) {
        const owner = q.ownerUid || q.ownerId || q.authorId;
        if (!selectedTeacherIds.includes(owner)) return false;
      }
      const sub = resolveQuestionSubject(q, subjects);
      if (subjectFilter !== 'all' && sub.id !== subjectFilter) return false;
      if (gradeFilter !== 'all' && q.grade !== gradeFilter) return false;
      if (scope === 'school_bank' && textbookFilter !== 'all') {
        const tb = q.resolvedTextbookSeries || q.textbookSeries || '';
        if (tb !== textbookFilter) return false;
      }
      if (topicFilter !== 'all' && getQuestionTopicDisplay(q) !== topicFilter) return false;
      if (activeTab === 'manual') {
        if (typeFilter !== 'all' && q.type !== typeFilter) return false;
        if (levelFilter !== 'all' && q.level !== levelFilter) return false;
        if (term) {
          const hit =
            q.content.toLowerCase().includes(term) ||
            q.code.toLowerCase().includes(term) ||
            getQuestionTopicDisplay(q).toLowerCase().includes(term) ||
            (q.ownerName || '').toLowerCase().includes(term) ||
            (q.ownerEmail || '').toLowerCase().includes(term);
          if (!hit) return false;
        }
      }
      return true;
    });
  }, [
    activePool,
    scope,
    selectedTeacherIds,
    subjects,
    subjectFilter,
    gradeFilter,
    textbookFilter,
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

  const selectedList = useMemo(() => Object.values(selectedMap), [selectedMap]);
  const selectedTeacherCount = useMemo(() => {
    const owners = new Set(
      selectedList.map((q) => q.ownerUid || q.ownerId || q.authorId || 'me')
    );
    return owners.size;
  }, [selectedList]);

  if (!isOpen) return null;

  const toggleTeacherFilter = (uid: string) => {
    setSelectedTeacherIds((prev) =>
      prev.includes(uid) ? prev.filter((id) => id !== uid) : [...prev, uid]
    );
  };

  const toggleSelect = (q: PickerQuestion) => {
    setSelectedMap((prev) => {
      const next = { ...prev };
      if (next[q.id]) {
        delete next[q.id];
      } else {
        next[q.id] = q;
      }
      return next;
    });
  };

  const togglePreview = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedPreviewIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleConfirmManual = () => {
    if (selectedList.length === 0) return;
    onAddQuestions(cloneQuestionsForExam(selectedList, scope, currentUserName));
    setSelectedMap({});
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
    onAddQuestions(cloneQuestionsForExam(picked, scope, currentUserName));
    if (shortages.length > 0) {
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
              {isAdmin
                ? 'Super Admin có thể kết hợp câu hỏi từ ngân hàng riêng và từ nhiều giáo viên toàn trường vào cùng một đề thi (không sao chép vào NH riêng, không sửa bản gốc).'
                : 'Các câu được thêm vào đề thi dưới dạng bản sao độc lập (không làm thay đổi ngân hàng gốc).'}
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

        {/* Admin Scope Switcher (Personal vs School-Wide Bank) */}
        {isAdmin && (
          <div className="px-6 py-3 bg-teal-50/70 border-b border-teal-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-teal-900 mr-1">Phạm vi ngân hàng:</span>
              <button
                type="button"
                onClick={() => {
                  setScope('personal');
                  setTopicFilter('all');
                }}
                className={`min-h-[36px] px-3.5 py-1.5 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition-colors ${
                  scope === 'personal'
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50'
                }`}
              >
                <UserIcon className="w-3.5 h-3.5" />
                <span>Ngân hàng câu hỏi của tôi ({bankQuestions.length})</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setScope('school_bank');
                  setTopicFilter('all');
                }}
                className={`min-h-[36px] px-3.5 py-1.5 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition-colors ${
                  scope === 'school_bank'
                    ? 'bg-teal-600 text-white shadow-xs'
                    : 'bg-white border border-teal-300 text-teal-900 hover:bg-teal-50'
                }`}
              >
                <Building2 className="w-3.5 h-3.5" />
                <span>
                  Ngân hàng câu hỏi toàn trường
                  {hasLoadedSchool ? ` (${schoolQuestions.length})` : ''}
                </span>
              </button>
            </div>

            {scope === 'school_bank' && (
              <button
                type="button"
                onClick={() => void loadSchoolQuestions()}
                disabled={isLoadingSchool}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-teal-300 bg-white hover:bg-teal-50 text-teal-800 text-xs font-semibold disabled:opacity-60"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoadingSchool ? 'animate-spin' : ''}`} />
                Làm mới
              </button>
            )}
          </div>
        )}

        {/* Mode Tabs */}
        <div className="px-6 pt-3.5 pb-3 border-b border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-3 shrink-0">
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
            {selectedList.length > 0 && (
              <span className="text-teal-700 ml-2">
                · Đã chọn {selectedList.length} câu ({selectedTeacherCount} nguồn GV)
              </span>
            )}
          </span>
        </div>

        {/* Multi-Teacher Selector (Admin School-Wide Mode ONLY) */}
        {isAdmin && scope === 'school_bank' && schoolTeachers.length > 0 && (
          <div className="px-6 py-3 border-b border-slate-200 bg-white shrink-0 space-y-2">
            <div className="flex items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-1.5 font-bold text-slate-800">
                <Users className="w-3.5 h-3.5 text-teal-600" />
                <span>Chọn một hoặc nhiều giáo viên ({selectedTeacherIds.length === 0 ? 'Đang chọn tất cả' : `Đã lọc ${selectedTeacherIds.length} GV`}):</span>
              </div>
              {selectedTeacherIds.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedTeacherIds([])}
                  className="text-xs font-semibold text-teal-700 hover:underline"
                >
                  Chọn tất cả giáo viên
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
              {schoolTeachers.map((t) => {
                const active = selectedTeacherIds.includes(t.uid);
                return (
                  <button
                    key={t.uid}
                    type="button"
                    onClick={() => toggleTeacherFilter(t.uid)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                      active
                        ? 'bg-teal-600 border-teal-600 text-white'
                        : 'bg-slate-50 border-slate-200 text-slate-700 hover:border-teal-400'
                    }`}
                  >
                    {t.name} <span className="opacity-80 tabular-nums">({t.questionCount})</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Shared Pool Filters */}
        <div className="px-6 py-3.5 border-b border-slate-200 bg-white space-y-2.5 shrink-0 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
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

            {isAdmin && scope === 'school_bank' && (
              <select
                value={textbookFilter}
                onChange={(e) => setTextbookFilter(e.target.value)}
                className="min-h-[36px] px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white font-medium"
              >
                <option value="all">Tất cả bộ sách</option>
                {schoolTextbooks.map((tb) => (
                  <option key={tb} value={tb}>
                    {tb}
                  </option>
                ))}
              </select>
            )}

            <select
              value={topicFilter}
              onChange={(e) => setTopicFilter(e.target.value)}
              className="min-h-[36px] px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white font-medium"
            >
              <option value="all">Tất cả chương / bài học</option>
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
                  <option value="part1_multiple_choice">Phần I (Nhiều lựa chọn)</option>
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
                placeholder={
                  scope === 'school_bank'
                    ? 'Tìm nhanh theo nội dung, mã câu hỏi, chương/bài học hoặc tên giáo viên...'
                    : 'Tìm nhanh theo nội dung, mã câu hỏi hoặc chủ đề...'
                }
                className="w-full min-h-[38px] pl-9 pr-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {schoolError && scope === 'school_bank' && (
            <div className="mb-4 p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{schoolError}</span>
            </div>
          )}

          {isLoadingSchool && scope === 'school_bank' ? (
            <div className="py-12 text-center text-sm text-slate-500">
              Đang tải Ngân hàng câu hỏi toàn trường từ Cloud Firestore...
            </div>
          ) : activeTab === 'manual' ? (
            <div className="space-y-3">
              {scopedPool.length === 0 ? (
                <div className="py-12 text-center text-sm text-slate-500 border border-dashed border-slate-200 rounded-2xl">
                  Không có câu hỏi nào phù hợp với bộ lọc đang chọn.
                </div>
              ) : (
                scopedPool.slice(0, 200).map((q) => {
                  const isChecked = Boolean(selectedMap[q.id]);
                  const isAlreadyInExam = alreadyInExamBaseIds.has(q.id);
                  const isPreviewOpen = expandedPreviewIds.has(q.id);
                  const sub = resolveQuestionSubject(q, subjects);

                  return (
                    <div
                      key={q.id}
                      onClick={() => toggleSelect(q)}
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
                            <Square className="w-4 h-4 text-slate-400" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0 space-y-1.5">
                          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-slate-600">
                              <span className="font-mono font-bold text-slate-900">{q.code}</span>
                              {scope === 'school_bank' && q.ownerName && (
                                <>
                                  <span>·</span>
                                  <span className="font-semibold text-indigo-700">
                                    GV: {q.ownerName}
                                  </span>
                                </>
                              )}
                              <span>·</span>
                              <span className="font-semibold text-teal-700">{sub.name}</span>
                              <span>·</span>
                              <span>{GRADE_LABELS[q.grade] || `Lớp ${q.grade}`}</span>
                              <span>·</span>
                              <span>{QUESTION_TYPE_SHORT_LABELS[q.type]}</span>
                              <span>·</span>
                              <span>{COGNITIVE_LEVEL_SHORT_LABELS[q.level]}</span>
                              {isAlreadyInExam && (
                                <span className="text-amber-700 font-semibold">
                                  · Đã có trong đề
                                </span>
                              )}
                            </div>

                            <button
                              type="button"
                              onClick={(e) => togglePreview(q.id, e)}
                              className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-600 hover:text-teal-700 shrink-0"
                            >
                              {isPreviewOpen ? (
                                <>
                                  <span>Ẩn đáp án</span>
                                  <ChevronUp className="w-3.5 h-3.5" />
                                </>
                              ) : (
                                <>
                                  <span>Xem đáp án</span>
                                  <ChevronDown className="w-3.5 h-3.5" />
                                </>
                              )}
                            </button>
                          </div>

                          <div className="text-sm text-slate-900 leading-relaxed line-clamp-3">
                            <ChemRenderer text={q.content} />
                          </div>

                          <div className="text-xs text-slate-500">
                            {getQuestionTopicDisplay(q)}
                          </div>

                          {isPreviewOpen && (
                            <div
                              onClick={(e) => e.stopPropagation()}
                              className="mt-2 pt-2.5 border-t border-slate-200 space-y-2 text-xs"
                            >
                              {(q.type === 'part1_single_choice' ||
                                q.type === 'part1_multiple_choice') &&
                                q.options && (
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                                    {q.options.map((opt) => {
                                      const isCorr =
                                        opt.isCorrect ||
                                        opt.id === q.correctOptionId ||
                                        (q.correctOptionIds || []).includes(opt.id);
                                      return (
                                        <div
                                          key={opt.id}
                                          className={`p-2 rounded-lg border ${
                                            isCorr
                                              ? 'bg-emerald-50 border-emerald-300 text-emerald-950 font-semibold'
                                              : 'bg-slate-50 border-slate-200 text-slate-700'
                                          }`}
                                        >
                                          <strong>{opt.id}.</strong>{' '}
                                          <ChemRenderer text={opt.text} inline />
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}

                              {q.type === 'part2_true_false' && q.statements && (
                                <div className="space-y-1">
                                  {q.statements.map((st) => (
                                    <div
                                      key={st.id}
                                      className="flex items-center justify-between gap-2 p-2 rounded-lg bg-slate-50 border border-slate-200"
                                    >
                                      <span>
                                        <strong>{st.id})</strong>{' '}
                                        <ChemRenderer text={st.statement} inline />
                                      </span>
                                      <span
                                        className={`font-bold shrink-0 ${
                                          st.correctAnswer ? 'text-emerald-700' : 'text-rose-700'
                                        }`}
                                      >
                                        {st.correctAnswer ? 'Đúng' : 'Sai'}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              )}

                              {q.type === 'part3_short_answer' && q.shortAnswerConfig && (
                                <div className="p-2 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900">
                                  Đáp án:{' '}
                                  <strong>
                                    {(q.shortAnswerConfig.acceptableAnswers || []).join(' ; ') || '—'}
                                  </strong>
                                </div>
                              )}

                              {q.explanation && (
                                <div className="p-2 rounded-lg bg-slate-50 border border-slate-200 text-slate-700">
                                  <span className="font-semibold text-slate-900">Lời giải: </span>
                                  <ChemRenderer text={q.explanation} inline />
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              {scopedPool.length > 200 && (
                <p className="text-center text-xs text-slate-500 pt-2">
                  Đang hiển thị 200 / {scopedPool.length} câu hỏi phù hợp. Hãy dùng bộ lọc hoặc từ khóa để thu hẹp kết quả.
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-teal-50/70 border border-teal-200 text-xs text-teal-900 leading-relaxed">
                Nhập số lượng câu hỏi muốn bốc ngẫu nhiên theo <strong>Dạng câu hỏi × Mức độ nhận thức</strong> từ nguồn đang lọc ({scopedPool.length} câu
                {scope === 'school_bank' && selectedTeacherIds.length > 0
                  ? ` thuộc ${selectedTeacherIds.length} giáo viên đã chọn`
                  : scope === 'school_bank'
                  ? ' từ Ngân hàng toàn trường'
                  : ' từ Ngân hàng của tôi'}
                ). Hệ thống tự động loại trừ các câu đã có trong đề.
              </div>

              {matrixWarning && (
                <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
                  <span>{matrixWarning}</span>
                </div>
              )}

              <div className="overflow-x-auto border border-slate-200 rounded-2xl">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                    <tr>
                      <th className="px-4 py-3 font-bold">Dạng câu hỏi</th>
                      {LEVELS.map((lvl) => (
                        <th key={lvl} className="px-3 py-3 text-center font-bold">
                          {COGNITIVE_LEVEL_SHORT_LABELS[lvl]}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {TYPES.map((qType) => (
                      <tr key={qType} className="hover:bg-slate-50/60">
                        <td className="px-4 py-3 font-semibold text-slate-900">
                          {QUESTION_TYPE_SHORT_LABELS[qType]}
                        </td>
                        {LEVELS.map((lvl) => {
                          const avail = availableMatrixCounts[qType][lvl] || 0;
                          const val = matrix[qType][lvl] || 0;
                          return (
                            <td key={lvl} className="px-3 py-3 text-center">
                              <input
                                type="number"
                                min={0}
                                max={avail}
                                value={val}
                                onChange={(e) => {
                                  const num = Math.max(0, Math.min(avail, Number(e.target.value) || 0));
                                  setMatrix((prev) => ({
                                    ...prev,
                                    [qType]: {
                                      ...prev[qType],
                                      [lvl]: num,
                                    },
                                  }));
                                }}
                                disabled={avail === 0}
                                className="w-16 px-2 py-1.5 text-center rounded-lg border border-slate-300 font-bold tabular-nums disabled:bg-slate-100 disabled:text-slate-400"
                              />
                              <div className="text-[11px] text-slate-500 mt-1 tabular-nums">
                                Khả dụng: {avail}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="text-xs text-slate-600">
            {activeTab === 'manual' ? (
              <span className="tabular-nums">
                Đã chọn <strong className="text-slate-900">{selectedList.length}</strong> câu hỏi
                {selectedList.length > 0 && isAdmin && (
                  <span> từ {selectedTeacherCount} giáo viên/nguồn</span>
                )}
              </span>
            ) : (
              <span className="tabular-nums">
                Tổng yêu cầu bốc ma trận:{' '}
                <strong className="text-slate-900">{totalMatrixRequested}</strong> câu
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {activeTab === 'manual' && selectedList.length > 0 && (
              <button
                type="button"
                onClick={() => setSelectedMap({})}
                className="px-3 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-xs font-semibold text-slate-700"
              >
                Bỏ chọn ({selectedList.length})
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-xs font-semibold text-slate-700"
            >
              Đóng
            </button>

            {activeTab === 'manual' ? (
              <button
                type="button"
                disabled={selectedList.length === 0}
                onClick={handleConfirmManual}
                className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold shadow-xs disabled:opacity-50"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Thêm {selectedList.length} câu vào đề thi</span>
              </button>
            ) : (
              <button
                type="button"
                disabled={totalMatrixRequested === 0}
                onClick={handleConfirmMatrix}
                className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold shadow-xs disabled:opacity-50"
              >
                <Sparkles className="w-4 h-4" />
                <span>Bốc {totalMatrixRequested} câu vào đề thi</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
