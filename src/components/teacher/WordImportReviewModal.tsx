'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  CheckSquare,
  ChevronDown,
  ChevronUp,
  Copy,
  Edit3,
  FileText,
  Filter,
  Loader2,
  Save,
  SlidersHorizontal,
  Square,
  Trash2,
  X,
  XCircle,
} from 'lucide-react';
import {
  ChemGrade,
  CognitiveLevel,
  CurriculumGrade,
  CurriculumLesson,
  ParsedExamResult,
  Question,
  QuestionType,
  SubjectItem,
} from '../../types';
import {
  COGNITIVE_LEVEL_SHORT_LABELS,
  DEFAULT_SUBJECT_ID,
  DEFAULT_SUBJECT_NAME,
  GRADE_LABELS,
  QUESTION_TYPE_SHORT_LABELS,
  generateQuestionCode,
  getQuestionTopicDisplay,
  resolveQuestionSubject,
} from '../../constants/subjects';
import { ChemRenderer } from '../../utils/chemRenderer';
import { reclassifyQuestionType } from '../../utils/docxParser';
import {
  analyzeWordImportDuplicates,
  DuplicateCheckStatus,
} from '../../utils/questionDuplicateCheck';
import {
  CurriculumCascadeSelector,
  CurriculumSelectionValue,
} from './CurriculumCascadeSelector';
import {
  fetchCurriculumLessonsBySubjectGrade,
  filterAndGroupCurriculumLessons,
} from '../../services/curriculumService';

export interface InheritedQuestionBankMetadata {
  subjectId: string;
  subjectName: string;
  grade: ChemGrade;
  chapterId: string;
  chapterName: string;
  lessonId: string;
  lessonName: string;
  lessonTopic: string;
  defaultQuestionType: QuestionType | '';
  level: CognitiveLevel;
}

export interface WordBatchSaveResult {
  savedCount: number;
  skippedDuplicateCount: number;
  firestoreSynced: boolean;
  error?: string;
}

interface WordImportReviewModalProps {
  isOpen: boolean;
  fileName: string;
  fileSize: number;
  parsedResult: ParsedExamResult;
  parsedQuestionsCount?: number;
  inheritedMetadata: InheritedQuestionBankMetadata;
  existingQuestions: Question[];
  subjects: SubjectItem[];
  currentUserId?: string;
  onConfirmSave: (questionsToSave: Question[]) => Promise<WordBatchSaveResult>;
  onClose: () => void;
}

type ReviewFilterMode = 'all' | 'valid' | 'duplicate' | 'missing_answer';

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function hasMissingAnswer(q: Question): boolean {
  if (q.type === 'part1_single_choice') return !q.correctOptionId;
  if (q.type === 'part1_multiple_choice') {
    return !q.correctOptionIds || q.correctOptionIds.length === 0;
  }
  if (q.type === 'part2_true_false') {
    return !q.statements || q.statements.length === 0;
  }
  if (q.type === 'part3_short_answer') {
    return !q.shortAnswerConfig || q.shortAnswerConfig.acceptableAnswers.length === 0;
  }
  return false;
}

function safeReclassifyQuestion(q: Question, targetType: QuestionType): Question {
  if (targetType === 'part1_multiple_choice') {
    const base = reclassifyQuestionType(q, 'part1_single_choice');
    const existingIds =
      q.correctOptionIds && q.correctOptionIds.length > 0
        ? q.correctOptionIds
        : base.correctOptionId
        ? [base.correctOptionId]
        : [];
    const options = (base.options || []).map((opt) => ({
      ...opt,
      isCorrect: existingIds.includes(opt.id),
    }));
    return {
      ...base,
      type: 'part1_multiple_choice',
      options,
      correctOptionIds: existingIds,
      correctOptionId: existingIds[0],
    };
  }
  return reclassifyQuestionType(q, targetType);
}

interface PerQuestionEditorProps {
  question: Question;
  subjects: SubjectItem[];
  onChange: (patch: Partial<Question>) => void;
}

const PerQuestionQuickEditor: React.FC<PerQuestionEditorProps> = ({
  question,
  subjects,
  onChange,
}) => {
  const [lessons, setLessons] = useState<CurriculumLesson[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const sub = resolveQuestionSubject(question, subjects);
  const isStdGrade =
    question.grade === '10' || question.grade === '11' || question.grade === '12';

  useEffect(() => {
    let active = true;
    if (!sub.id || !isStdGrade) {
      setLessons([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    void fetchCurriculumLessonsBySubjectGrade(sub.id, question.grade as CurriculumGrade, {
      includeInactive: false,
    })
      .then((rows) => {
        if (active) setLessons(rows);
      })
      .catch(() => {
        if (active) setLessons([]);
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [sub.id, question.grade, isStdGrade]);

  const grouped = useMemo(
    () => filterAndGroupCurriculumLessons(lessons, { includeInactive: false }),
    [lessons]
  );

  const handleSubjectChange = (nextSubjectId: string) => {
    const found = subjects.find((s) => s.id === nextSubjectId);
    onChange({
      subjectId: found?.id || nextSubjectId,
      subjectName: found?.name || DEFAULT_SUBJECT_NAME,
      chapterId: undefined,
      chapterName: undefined,
      lessonId: undefined,
      lessonName: undefined,
    });
  };

  const handleGradeChange = (nextGrade: ChemGrade) => {
    onChange({
      grade: nextGrade,
      chapterId: undefined,
      chapterName: undefined,
      lessonId: undefined,
      lessonName: undefined,
    });
  };

  const handleChapterChange = (nextChapterId: string) => {
    if (!nextChapterId) {
      onChange({
        chapterId: undefined,
        chapterName: undefined,
        lessonId: undefined,
        lessonName: undefined,
      });
      return;
    }
    const ch = grouped.chapters.find((c) => c.chapterId === nextChapterId);
    onChange({
      chapterId: ch?.chapterId || nextChapterId,
      chapterName: ch?.chapterName || '',
      lessonId: undefined,
      lessonName: undefined,
    });
  };

  const handleLessonChange = (nextLessonId: string) => {
    if (!nextLessonId) {
      onChange({
        lessonId: undefined,
        lessonName: undefined,
      });
      return;
    }
    const found = lessons.find((l) => l.lessonId === nextLessonId);
    if (found) {
      onChange({
        chapterId: found.chapterId,
        chapterName: found.chapterName,
        lessonId: found.lessonId,
        lessonName: found.lessonName,
        lessonTopic: found.lessonName,
      });
    }
  };

  return (
    <div className="mt-3 p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-3.5 text-xs">
      <div className="flex items-center justify-between">
        <span className="font-bold text-slate-800">
          Chỉnh sửa nhanh nội dung, đáp án &amp; metadata riêng câu này
        </span>
        {isLoading && (
          <span className="inline-flex items-center gap-1 text-[11px] text-teal-700">
            <Loader2 className="w-3 h-3 animate-spin" />
            Đang tải danh mục SGK...
          </span>
        )}
      </div>

      {/* Exact metadata order: 1. Môn học -> 2. Khối lớp -> 3. Chương/Bài học -> 4. Dạng câu hỏi -> 5. Mức độ */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
        <div>
          <label className="block text-[11px] font-semibold text-slate-600 mb-1">
            1. Môn học
          </label>
          <select
            value={sub.id}
            onChange={(e) => handleSubjectChange(e.target.value)}
            className="w-full min-h-[36px] px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-800 font-medium"
          >
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-slate-600 mb-1">
            2. Khối lớp
          </label>
          <select
            value={question.grade}
            onChange={(e) => handleGradeChange(e.target.value as ChemGrade)}
            className="w-full min-h-[36px] px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-800 font-medium"
          >
            <option value="10">Lớp 10</option>
            <option value="11">Lớp 11</option>
            <option value="12">Lớp 12</option>
            <option value="chuyen_hsg">Chuyên &amp; HSG</option>
          </select>
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-slate-600 mb-1">
            3a. Chương / Chủ đề
          </label>
          {grouped.chapters.length > 0 ? (
            <select
              value={question.chapterId || ''}
              onChange={(e) => handleChapterChange(e.target.value)}
              className="w-full min-h-[36px] px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-800 font-medium"
            >
              <option value="">-- Chọn chương --</option>
              {grouped.chapters.map((ch) => (
                <option key={ch.chapterId} value={ch.chapterId}>
                  {ch.chapterName}
                </option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              value={question.chapterName || ''}
              onChange={(e) => onChange({ chapterName: e.target.value })}
              placeholder="Tên chương / chủ đề..."
              className="w-full min-h-[36px] px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-800"
            />
          )}
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-slate-600 mb-1">
            3b. Bài học
          </label>
          {grouped.chapters.length > 0 ? (
            <select
              value={question.lessonId || ''}
              onChange={(e) => handleLessonChange(e.target.value)}
              className="w-full min-h-[36px] px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-800 font-medium"
            >
              <option value="">-- Chọn bài học SGK --</option>
              {grouped.chapters
                .filter((ch) => !question.chapterId || ch.chapterId === question.chapterId)
                .map((ch) => (
                  <optgroup key={ch.chapterId} label={ch.chapterName}>
                    {ch.lessons.map((l) => (
                      <option key={l.id} value={l.lessonId}>
                        {l.lessonName}
                      </option>
                    ))}
                  </optgroup>
                ))}
            </select>
          ) : (
            <input
              type="text"
              value={question.lessonName || question.lessonTopic || ''}
              onChange={(e) =>
                onChange({
                  lessonName: e.target.value,
                  lessonTopic: e.target.value,
                })
              }
              placeholder="Tên bài học / chủ đề..."
              className="w-full min-h-[36px] px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-800"
            />
          )}
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-slate-600 mb-1">
            4. Dạng câu hỏi
          </label>
          <select
            value={question.type}
            onChange={(e) => onChange({ type: e.target.value as QuestionType })}
            className="w-full min-h-[36px] px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-800 font-medium"
          >
            <option value="part1_single_choice">Phần I · 4 lựa chọn (1 đáp án)</option>
            <option value="part1_multiple_choice">Phần I · Nhiều lựa chọn đúng</option>
            <option value="part2_true_false">Phần II · Đúng - Sai 4 ý</option>
            <option value="part3_short_answer">Phần III · Trả lời ngắn</option>
          </select>
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-slate-600 mb-1">
            5. Mức độ nhận thức
          </label>
          <select
            value={question.level}
            onChange={(e) => onChange({ level: e.target.value as CognitiveLevel })}
            className="w-full min-h-[36px] px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-800 font-medium"
          >
            <option value="nhan_biet">Biết (Nhận biết)</option>
            <option value="thong_hieu">Hiểu (Thông hiểu)</option>
            <option value="van_dung">Vận dụng</option>
            <option value="van_dung_cao">Vận dụng cao</option>
          </select>
        </div>
      </div>

      {/* Quick Content Editor (preserves LaTeX / Unicode / chemistry formulas) */}
      <div className="pt-2 border-t border-slate-200/80 space-y-2.5">
        <div>
          <label className="block text-[11px] font-semibold text-slate-600 mb-1">
            Nội dung câu hỏi (giữ nguyên LaTeX $...$, công thức hóa học, chỉ số trên/dưới)
          </label>
          <textarea
            rows={3}
            value={question.content}
            onChange={(e) => onChange({ content: e.target.value })}
            className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-900 text-xs leading-relaxed focus:outline-none focus:ring-2 focus:ring-blue-500/40"
          />
        </div>

        {/* Quick Answer Editor by QuestionType */}
        {(question.type === 'part1_single_choice' ||
          question.type === 'part1_multiple_choice') && (
          <div className="space-y-1.5">
            <label className="block text-[11px] font-semibold text-slate-600">
              Các phương án &amp; Đáp án đúng
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {(question.options && question.options.length > 0
                ? question.options
                : [
                    { id: 'A', text: '' },
                    { id: 'B', text: '' },
                    { id: 'C', text: '' },
                    { id: 'D', text: '' },
                  ]
              ).map((opt, optIdx, arr) => {
                const isSelectedCorrect =
                  question.type === 'part1_multiple_choice'
                    ? (question.correctOptionIds || []).includes(opt.id)
                    : question.correctOptionId === opt.id;
                return (
                  <div key={opt.id} className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        if (question.type === 'part1_multiple_choice') {
                          const curr = new Set(question.correctOptionIds || []);
                          if (curr.has(opt.id)) curr.delete(opt.id);
                          else curr.add(opt.id);
                          const nextIds = Array.from(curr);
                          onChange({
                            correctOptionIds: nextIds,
                            correctOptionId: nextIds[0],
                            options: arr.map((o) => ({
                              ...o,
                              isCorrect: nextIds.includes(o.id),
                            })),
                          });
                        } else {
                          onChange({
                            correctOptionId: opt.id,
                            options: arr.map((o) => ({
                              ...o,
                              isCorrect: o.id === opt.id,
                            })),
                          });
                        }
                      }}
                      title="Đánh dấu đáp án đúng"
                      className={`w-7 h-8 rounded-lg font-bold text-xs shrink-0 border transition-colors ${
                        isSelectedCorrect
                          ? 'bg-emerald-600 border-emerald-600 text-white'
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      {opt.id}
                    </button>
                    <input
                      type="text"
                      value={opt.text}
                      onChange={(e) => {
                        const nextOpts = arr.map((o, i) =>
                          i === optIdx ? { ...o, text: e.target.value } : o
                        );
                        onChange({ options: nextOpts });
                      }}
                      placeholder={`Nội dung phương án ${opt.id}...`}
                      className="flex-1 min-h-[32px] px-2.5 py-1 rounded-lg border border-slate-200 bg-white text-slate-800 text-xs"
                    />
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {question.type === 'part2_true_false' && (
          <div className="space-y-1.5">
            <label className="block text-[11px] font-semibold text-slate-600">
              Các ý Đúng / Sai (a, b, c, d)
            </label>
            {(question.statements && question.statements.length > 0
              ? question.statements
              : [
                  { id: 'a', statement: '', correctAnswer: true },
                  { id: 'b', statement: '', correctAnswer: false },
                  { id: 'c', statement: '', correctAnswer: true },
                  { id: 'd', statement: '', correctAnswer: false },
                ]
            ).map((st, stIdx, arr) => (
              <div key={st.id} className="flex items-center gap-2">
                <span className="font-bold text-slate-700 w-5 shrink-0">{st.id})</span>
                <input
                  type="text"
                  value={st.statement}
                  onChange={(e) => {
                    const nextStmts = arr.map((s, i) =>
                      i === stIdx ? { ...s, statement: e.target.value } : s
                    );
                    onChange({ statements: nextStmts });
                  }}
                  placeholder={`Nội dung ý ${st.id}...`}
                  className="flex-1 min-h-[32px] px-2.5 py-1 rounded-lg border border-slate-200 bg-white text-slate-800 text-xs"
                />
                <button
                  type="button"
                  onClick={() => {
                    const nextStmts = arr.map((s, i) =>
                      i === stIdx
                        ? {
                            ...s,
                            correctAnswer: !s.correctAnswer,
                            explanation: !s.correctAnswer ? 'Đúng' : 'Sai',
                          }
                        : s
                    );
                    onChange({ statements: nextStmts });
                  }}
                  className={`px-2.5 py-1 rounded-lg font-bold text-[11px] shrink-0 transition-colors ${
                    st.correctAnswer
                      ? 'bg-emerald-600 text-white'
                      : 'bg-rose-600 text-white'
                  }`}
                >
                  {st.correctAnswer ? 'Đúng' : 'Sai'}
                </button>
              </div>
            ))}
          </div>
        )}

        {question.type === 'part3_short_answer' && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div className="sm:col-span-2">
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Đáp án chấp nhận (ngăn cách bằng dấu ;)
              </label>
              <input
                type="text"
                value={(question.shortAnswerConfig?.acceptableAnswers || []).join('; ')}
                onChange={(e) => {
                  const parts = e.target.value
                    .split(';')
                    .map((s) => s.trim())
                    .filter(Boolean);
                  const firstNum =
                    parts.length > 0 ? Number(parts[0].replace(',', '.')) : Number.NaN;
                  onChange({
                    shortAnswerConfig: {
                      ...(question.shortAnswerConfig || {
                        acceptableAnswers: [],
                        isNumeric: false,
                      }),
                      acceptableAnswers: parts,
                      isNumeric: Number.isFinite(firstNum),
                      numericValue: Number.isFinite(firstNum) ? firstNum : undefined,
                    },
                  });
                }}
                placeholder="VD: 12,5; 12.5"
                className="w-full min-h-[34px] px-2.5 py-1 rounded-lg border border-slate-200 bg-white text-slate-800 text-xs font-mono"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Đơn vị (nếu có)
              </label>
              <input
                type="text"
                value={question.shortAnswerConfig?.unit || ''}
                onChange={(e) =>
                  onChange({
                    shortAnswerConfig: {
                      ...(question.shortAnswerConfig || {
                        acceptableAnswers: [],
                        isNumeric: false,
                      }),
                      unit: e.target.value.trim() || undefined,
                    },
                  })
                }
                placeholder="VD: g, mol, M..."
                className="w-full min-h-[34px] px-2.5 py-1 rounded-lg border border-slate-200 bg-white text-slate-800 text-xs"
              />
            </div>
          </div>
        )}

        {/* Explanation & optional image URL */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
              Lời giải chi tiết (tùy chọn)
            </label>
            <textarea
              rows={2}
              value={question.explanation || ''}
              onChange={(e) => onChange({ explanation: e.target.value || undefined })}
              placeholder="Hướng dẫn giải chi tiết..."
              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-800 text-xs"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
              URL hình ảnh minh họa (tối đa 1000 ký tự)
            </label>
            <input
              type="text"
              maxLength={1000}
              value={question.imageUrl || ''}
              onChange={(e) => onChange({ imageUrl: e.target.value.trim() || undefined })}
              placeholder="https://..."
              className="w-full min-h-[34px] px-2.5 py-1 rounded-lg border border-slate-200 bg-white text-slate-800 text-xs"
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export const WordImportReviewModal: React.FC<WordImportReviewModalProps> = ({
  isOpen,
  fileName,
  fileSize,
  parsedResult,
  inheritedMetadata,
  existingQuestions,
  subjects,
  currentUserId,
  onConfirmSave,
  onClose,
}) => {
  const defaultSource = useMemo(
    () => fileName.replace(/\.docx$/i, '').trim() || parsedResult.title || 'Import Word',
    [fileName, parsedResult.title]
  );

  // Batch metadata state (strictly ordered: Môn học -> Khối lớp -> Chương/Bài học -> Dạng câu hỏi -> Mức độ)
  const [curriculum, setCurriculum] = useState<CurriculumSelectionValue>({
    subjectId: inheritedMetadata.subjectId || DEFAULT_SUBJECT_ID,
    subjectName: inheritedMetadata.subjectName || DEFAULT_SUBJECT_NAME,
    grade: inheritedMetadata.grade || '12',
    chapterId: inheritedMetadata.chapterId || '',
    chapterName: inheritedMetadata.chapterName || '',
    lessonId: inheritedMetadata.lessonId || '',
    lessonName: inheritedMetadata.lessonName || '',
  });
  const [batchDefaultType, setBatchDefaultType] = useState<QuestionType | ''>(
    inheritedMetadata.defaultQuestionType
  );
  const [batchLevel, setBatchLevel] = useState<CognitiveLevel>(
    inheritedMetadata.level || 'nhan_biet'
  );
  const [batchSource, setBatchSource] = useState<string>(defaultSource);
  const [showBatchPanel, setShowBatchPanel] = useState<boolean>(true);

  // Working copy of extracted questions (deterministic draft IDs, inheriting active QuestionBank metadata)
  const [draftQuestions, setDraftQuestions] = useState<Question[]>(() => {
    return parsedResult.questions.map((rawQ, idx) => {
      let cloned = structuredClone(rawQ);
      const effectiveGrade = inheritedMetadata.grade || cloned.grade || '12';
      const effectiveSubjectId = inheritedMetadata.subjectId || DEFAULT_SUBJECT_ID;
      const effectiveSubjectName = inheritedMetadata.subjectName || DEFAULT_SUBJECT_NAME;

      // Inherit Tab's selected questionType as fallback ONLY when parser left an ambiguous/weak structure
      if (
        inheritedMetadata.defaultQuestionType &&
        inheritedMetadata.defaultQuestionType !== cloned.type
      ) {
        const isWeakPart1 =
          cloned.type === 'part1_single_choice' &&
          (!cloned.options || cloned.options.length < 2);
        const isWeakPart2 =
          cloned.type === 'part2_true_false' &&
          (!cloned.statements || cloned.statements.length < 2);
        if (isWeakPart1 || isWeakPart2) {
          const reclassified = safeReclassifyQuestion(
            cloned,
            inheritedMetadata.defaultQuestionType
          );
          cloned = {
            ...reclassified,
            imageUrl: cloned.imageUrl,
            explanation: cloned.explanation,
          };
        }
      }

      return {
        ...cloned,
        id: `draft_word_${idx}`,
        subjectId: effectiveSubjectId,
        subjectName: effectiveSubjectName,
        grade: effectiveGrade,
        chapterId: inheritedMetadata.chapterId || cloned.chapterId,
        chapterName: inheritedMetadata.chapterName || cloned.chapterName,
        lessonId: inheritedMetadata.lessonId || cloned.lessonId,
        lessonName: inheritedMetadata.lessonName || cloned.lessonName,
        lessonTopic:
          inheritedMetadata.lessonName ||
          inheritedMetadata.lessonTopic ||
          cloned.lessonTopic,
        level: inheritedMetadata.level || cloned.level || 'nhan_biet',
        source: cloned.source || defaultSource,
        ownerId: currentUserId || cloned.ownerId,
        authorId: currentUserId || cloned.authorId || 'teacher',
      };
    });
  });

  const parserWarnings = useMemo<string[]>(() => {
    const list: string[] = [];
    parsedResult.questions.forEach((q, idx) => {
      if (q.parseWarning) {
        list.push(`Câu ${idx + 1}: ${q.parseWarning}`);
      }
      if (Array.isArray(q.equationWarnings) && q.equationWarnings.length > 0) {
        q.equationWarnings.forEach((ew) => list.push(`Câu ${idx + 1} (công thức): ${ew}`));
      }
    });
    return list;
  }, [parsedResult.questions]);

  // Duplicate analysis updated dynamically whenever draftQuestions or existingQuestions change
  const duplicateStatuses = useMemo<DuplicateCheckStatus[]>(
    () => analyzeWordImportDuplicates(draftQuestions, existingQuestions),
    [draftQuestions, existingQuestions]
  );

  // Default selection: select all non-duplicate questions automatically
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => {
    const initialDups = analyzeWordImportDuplicates(
      parsedResult.questions,
      existingQuestions
    );
    const ids = new Set<string>();
    draftQuestions.forEach((q, idx) => {
      if (initialDups[idx]?.kind === 'none') {
        ids.add(q.id);
      }
    });
    return ids;
  });

  const [expandedEditorIds, setExpandedEditorIds] = useState<Set<string>>(new Set());
  const [filterMode, setFilterMode] = useState<ReviewFilterMode>('all');
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveOutcome, setSaveOutcome] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const summary = useMemo(() => {
    let part1 = 0;
    let part2 = 0;
    let part3 = 0;
    let missing = 0;
    let dupBank = 0;
    let dupFile = 0;

    draftQuestions.forEach((q, idx) => {
      if (q.type === 'part1_single_choice' || q.type === 'part1_multiple_choice') part1++;
      else if (q.type === 'part2_true_false') part2++;
      else if (q.type === 'part3_short_answer') part3++;

      if (hasMissingAnswer(q)) missing++;
      const st = duplicateStatuses[idx];
      if (st?.kind === 'in_bank') dupBank++;
      else if (st?.kind === 'in_file') dupFile++;
    });

    return {
      total: draftQuestions.length,
      part1,
      part2,
      part3,
      missing,
      dupBank,
      dupFile,
      dupTotal: dupBank + dupFile,
    };
  }, [draftQuestions, duplicateStatuses]);

  const visibleEntries = useMemo(() => {
    return draftQuestions
      .map((q, idx) => ({
        question: q,
        index: idx,
        dup: duplicateStatuses[idx] || { kind: 'none' as const },
        missingAnswer: hasMissingAnswer(q),
      }))
      .filter((entry) => {
        if (filterMode === 'valid') return entry.dup.kind === 'none';
        if (filterMode === 'duplicate') return entry.dup.kind !== 'none';
        if (filterMode === 'missing_answer') return entry.missingAnswer;
        return true;
      });
  }, [draftQuestions, duplicateStatuses, filterMode]);

  const selectedQuestions = useMemo(
    () => draftQuestions.filter((q) => selectedIds.has(q.id)),
    [draftQuestions, selectedIds]
  );

  const selectedNonDuplicateCount = useMemo(() => {
    let count = 0;
    draftQuestions.forEach((q, idx) => {
      if (selectedIds.has(q.id) && duplicateStatuses[idx]?.kind === 'none') {
        count++;
      }
    });
    return count;
  }, [draftQuestions, selectedIds, duplicateStatuses]);

  const selectedDuplicateCount = selectedQuestions.length - selectedNonDuplicateCount;

  if (!isOpen) return null;

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectAllValid = () => {
    const validIds = draftQuestions
      .filter((_, idx) => duplicateStatuses[idx]?.kind === 'none')
      .map((q) => q.id);
    const allValidSelected =
      validIds.length > 0 && validIds.every((id) => selectedIds.has(id));
    if (allValidSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(validIds));
    }
  };

  const toggleEditor = (id: string) => {
    setExpandedEditorIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleRemoveDraftQuestion = (id: string) => {
    setDraftQuestions((prev) => prev.filter((q) => q.id !== id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const handleUpdateSingleQuestion = (id: string, patch: Partial<Question>) => {
    setDraftQuestions((prev) =>
      prev.map((q) => {
        if (q.id !== id) return q;
        if (patch.type && patch.type !== q.type) {
          // Reuse existing docxParser reclassification logic while preserving all metadata, images, and explanations
          const reclassified = safeReclassifyQuestion(q, patch.type);
          return {
            ...reclassified,
            id: q.id,
            subjectId: patch.subjectId ?? q.subjectId,
            subjectName: patch.subjectName ?? q.subjectName,
            grade: patch.grade ?? q.grade,
            chapterId: patch.chapterId !== undefined ? patch.chapterId : q.chapterId,
            chapterName: patch.chapterName !== undefined ? patch.chapterName : q.chapterName,
            lessonId: patch.lessonId !== undefined ? patch.lessonId : q.lessonId,
            lessonName: patch.lessonName !== undefined ? patch.lessonName : q.lessonName,
            lessonTopic: patch.lessonTopic !== undefined ? patch.lessonTopic : q.lessonTopic,
            level: patch.level ?? q.level,
            imageUrl: q.imageUrl,
            explanation: q.explanation,
            source: q.source,
            ownerId: q.ownerId,
            authorId: q.authorId,
          };
        }
        return {
          ...q,
          ...patch,
          updatedAt: new Date().toISOString(),
        };
      })
    );
  };

  const handleApplyBatchMetadata = (includeQuestionType: boolean) => {
    const targetIds =
      selectedIds.size > 0 ? selectedIds : new Set(draftQuestions.map((q) => q.id));
    const resolvedGrade: ChemGrade = (curriculum.grade || '12') as ChemGrade;

    setDraftQuestions((prev) =>
      prev.map((q) => {
        if (!targetIds.has(q.id)) return q;
        let nextQ: Question = {
          ...q,
          subjectId: curriculum.subjectId || DEFAULT_SUBJECT_ID,
          subjectName: curriculum.subjectName || DEFAULT_SUBJECT_NAME,
          grade: resolvedGrade,
          chapterId: curriculum.chapterId || undefined,
          chapterName: curriculum.chapterName || undefined,
          lessonId: curriculum.lessonId || undefined,
          lessonName: curriculum.lessonName || undefined,
          lessonTopic: curriculum.lessonName || q.lessonTopic,
          level: batchLevel,
          source: batchSource.trim() || defaultSource,
          updatedAt: new Date().toISOString(),
        };

        if (includeQuestionType && batchDefaultType && batchDefaultType !== nextQ.type) {
          const reclassified = safeReclassifyQuestion(nextQ, batchDefaultType);
          nextQ = {
            ...reclassified,
            id: nextQ.id,
            subjectId: nextQ.subjectId,
            subjectName: nextQ.subjectName,
            grade: nextQ.grade,
            chapterId: nextQ.chapterId,
            chapterName: nextQ.chapterName,
            lessonId: nextQ.lessonId,
            lessonName: nextQ.lessonName,
            lessonTopic: nextQ.lessonTopic,
            level: nextQ.level,
            imageUrl: nextQ.imageUrl,
            explanation: nextQ.explanation,
            source: nextQ.source,
            ownerId: nextQ.ownerId,
            authorId: nextQ.authorId,
          };
        }

        return nextQ;
      })
    );
    setSaveOutcome(null);
  };

  const handleConfirmSaveClick = async () => {
    if (isSaving) return;

    // Exclude duplicates strictly to prevent duplicate writes
    const toSaveRaw: Question[] = [];
    let skippedSelectedDuplicates = 0;

    draftQuestions.forEach((q, idx) => {
      if (!selectedIds.has(q.id)) return;
      if (duplicateStatuses[idx]?.kind !== 'none') {
        skippedSelectedDuplicates++;
        return;
      }
      toSaveRaw.push(q);
    });

    if (toSaveRaw.length === 0) {
      setSaveOutcome({
        type: 'error',
        message:
          skippedSelectedDuplicates > 0
            ? 'Tất cả câu hỏi đang chọn đều bị trùng lặp với Ngân hàng hoặc trùng trong file nên không thể lưu trùng.'
            : 'Vui lòng chọn ít nhất 1 câu hỏi hợp lệ để lưu vào Ngân hàng.',
      });
      return;
    }

    setIsSaving(true);
    setSaveOutcome(null);

    try {
      const nowIso = new Date().toISOString();
      const prepared = toSaveRaw.map((q, index) => {
        const sub = resolveQuestionSubject(q, subjects);
        return {
          ...q,
          id: `q_${Date.now()}_${index}_${Math.random().toString(36).slice(2, 7)}`,
          code: generateQuestionCode({
            subjectId: sub.id,
            grade: q.grade,
            type: q.type,
            subjects,
          }),
          subjectId: sub.id,
          subjectName: sub.name,
          lessonTopic: q.lessonName || q.lessonTopic || getQuestionTopicDisplay(q),
          source: q.source || batchSource.trim() || defaultSource,
          ownerId: currentUserId || q.ownerId,
          authorId: currentUserId || q.authorId || 'teacher',
          createdAt: nowIso,
          updatedAt: nowIso,
        };
      });

      const res = await onConfirmSave(prepared);
      if (!res.firestoreSynced || res.error) {
        setSaveOutcome({
          type: 'error',
          message:
            res.error ||
            'Lưu câu hỏi lên Firestore không thành công. Vui lòng kiểm tra kết nối và thử lại.',
        });
        return;
      }

      const totalSkipped = skippedSelectedDuplicates + res.skippedDuplicateCount;
      setSaveOutcome({
        type: 'success',
        message:
          totalSkipped > 0
            ? `Đã lưu thành công ${res.savedCount} câu hỏi vào Ngân hàng (đã bỏ qua ${totalSkipped} câu trùng lặp).`
            : `Đã lưu thành công ${res.savedCount} câu hỏi từ file Word vào Ngân hàng!`,
      });
    } catch (err) {
      setSaveOutcome({
        type: 'error',
        message:
          err instanceof Error
            ? `Lỗi khi lưu câu hỏi: ${err.message}`
            : 'Không thể lưu câu hỏi vào Firestore. Vui lòng thử lại.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/65 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="word-import-review-title"
    >
      <div className="bg-white w-full max-w-5xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-5 sm:px-6 py-4 bg-slate-900 text-white flex items-start justify-between gap-4 shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-blue-300 text-xs font-bold uppercase tracking-wider">
              <FileText className="w-4 h-4 shrink-0" />
              <span>Kiểm tra &amp; Lưu câu hỏi bóc tách từ file Word</span>
            </div>
            <h2
              id="word-import-review-title"
              className="text-base sm:text-lg font-bold text-white mt-1 truncate"
            >
              {fileName}
            </h2>
            <p className="text-xs text-slate-300 mt-0.5 tabular-nums">
              Dung lượng {formatFileSize(fileSize)} · Nhận diện {summary.total} câu (Phần I:{' '}
              {summary.part1} · Phần II: {summary.part2} · Phần III: {summary.part3})
              {summary.dupTotal > 0 ? ` · Trùng lặp: ${summary.dupTotal}` : ''}
            </p>
          </div>
          <button
            type="button"
            disabled={isSaving}
            onClick={onClose}
            aria-label="Đóng cửa sổ"
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-40"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {/* Save outcome feedback banner */}
          {saveOutcome && (
            <div
              className={`p-3.5 rounded-xl border text-xs flex items-start justify-between gap-3 ${
                saveOutcome.type === 'success'
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                  : 'bg-rose-50 border-rose-300 text-rose-900'
              }`}
            >
              <div className="flex items-start gap-2.5">
                {saveOutcome.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                ) : (
                  <XCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                )}
                <div className="font-semibold leading-relaxed">{saveOutcome.message}</div>
              </div>
              {saveOutcome.type === 'success' && (
                <button
                  type="button"
                  onClick={onClose}
                  className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shrink-0"
                >
                  Đóng &amp; Xem Ngân hàng
                </button>
              )}
            </div>
          )}

          {/* Parser warnings if any */}
          {parserWarnings.length > 0 && (
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 space-y-1">
              <div className="font-bold flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>Lưu ý từ bộ máy bóc tách Word ({parserWarnings.length})</span>
              </div>
              <ul className="list-disc pl-5 space-y-0.5 text-[11px] text-amber-800">
                {parserWarnings.slice(0, 4).map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Batch Metadata Inheritance Card */}
          <div className="border border-slate-200 rounded-2xl overflow-hidden bg-slate-50/70">
            <button
              type="button"
              onClick={() => setShowBatchPanel((v) => !v)}
              className="w-full px-4 py-3 bg-white border-b border-slate-200/80 flex items-center justify-between text-left"
            >
              <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
                <SlidersHorizontal className="w-4 h-4 text-blue-600" />
                <span>
                  Metadata kế thừa từ Tab Ngân hàng (Môn học → Khối lớp → Chương/Bài học → Dạng câu hỏi → Mức độ)
                </span>
              </div>
              {showBatchPanel ? (
                <ChevronUp className="w-4 h-4 text-slate-500" />
              ) : (
                <ChevronDown className="w-4 h-4 text-slate-500" />
              )}
            </button>

            {showBatchPanel && (
              <div className="p-4 space-y-3.5 text-xs">
                {/* 1. Môn học -> 2. Khối lớp -> 3. Chương/Bài học */}
                <CurriculumCascadeSelector
                  value={curriculum}
                  subjects={subjects}
                  legacyLessonTopic={inheritedMetadata.lessonTopic}
                  onChange={(next) => setCurriculum(next)}
                />

                {/* 4. Dạng câu hỏi -> 5. Mức độ + Nguồn đề */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      4. Dạng câu hỏi (kế thừa từ bộ lọc)
                    </label>
                    <select
                      value={batchDefaultType}
                      onChange={(e) =>
                        setBatchDefaultType(e.target.value as QuestionType | '')
                      }
                      className="w-full min-h-[38px] px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white font-medium text-slate-800"
                    >
                      <option value="">Giữ nguyên dạng bộ máy bóc tách nhận diện</option>
                      <option value="part1_single_choice">Phần I · 4 lựa chọn (1 đáp án)</option>
                      <option value="part1_multiple_choice">Phần I · Nhiều lựa chọn đúng</option>
                      <option value="part2_true_false">Phần II · Đúng - Sai 4 ý</option>
                      <option value="part3_short_answer">Phần III · Trả lời ngắn</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      5. Mức độ nhận thức mặc định
                    </label>
                    <select
                      value={batchLevel}
                      onChange={(e) => setBatchLevel(e.target.value as CognitiveLevel)}
                      className="w-full min-h-[38px] px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white font-medium text-slate-800"
                    >
                      <option value="nhan_biet">Biết (Nhận biết)</option>
                      <option value="thong_hieu">Hiểu (Thông hiểu)</option>
                      <option value="van_dung">Vận dụng</option>
                      <option value="van_dung_cao">Vận dụng cao</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Nguồn câu hỏi
                    </label>
                    <input
                      type="text"
                      value={batchSource}
                      onChange={(e) => setBatchSource(e.target.value)}
                      placeholder="VD: Đề thi giữa kỳ I..."
                      className="w-full min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-slate-800"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200/80">
                  <p className="text-[11px] text-slate-500">
                    Mọi câu hỏi đã kế thừa tự động metadata đang lọc tại Tab Ngân hàng. Bạn có thể áp dụng hàng loạt hoặc bấm <strong>Sửa metadata</strong> trên từng câu bên dưới.
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleApplyBatchMetadata(false)}
                      className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition-colors"
                    >
                      Áp dụng metadata cho các câu đang chọn
                    </button>
                    {batchDefaultType && (
                      <button
                        type="button"
                        onClick={() => handleApplyBatchMetadata(true)}
                        className="px-3 py-1.5 rounded-lg border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-800 text-xs font-semibold transition-colors"
                      >
                        Đồng bộ cả Dạng câu hỏi ({QUESTION_TYPE_SHORT_LABELS[batchDefaultType]})
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Empty state if parser detected 0 questions */}
          {draftQuestions.length === 0 ? (
            <div className="p-8 rounded-2xl border border-dashed border-slate-300 text-center space-y-2">
              <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto" />
              <p className="text-sm font-bold text-slate-900">
                Không nhận diện được câu hỏi nào từ file Word này
              </p>
              <p className="text-xs text-slate-600 max-w-md mx-auto">
                Hãy kiểm tra lại cấu trúc đề trong file .docx (đánh số dạng &ldquo;Câu 1.&rdquo;, các phương án A/B/C/D hoặc a/b/c/d) và đảm bảo nội dung không phải dạng ảnh chụp.
              </p>
            </div>
          ) : (
            <>
              {/* Filter & selection toolbar */}
              <div className="flex flex-wrap items-center justify-between gap-3 bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-xs">
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={handleSelectAllValid}
                    className="inline-flex items-center gap-1.5 font-semibold text-slate-800 hover:text-blue-700"
                  >
                    {selectedNonDuplicateCount > 0 &&
                    selectedNonDuplicateCount === summary.total - summary.dupTotal ? (
                      <CheckSquare className="w-4 h-4 text-blue-600" />
                    ) : (
                      <Square className="w-4 h-4 text-slate-400" />
                    )}
                    <span className="tabular-nums">
                      Chọn tất cả câu hợp lệ ({summary.total - summary.dupTotal})
                    </span>
                  </button>

                  <span className="text-slate-300">|</span>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <Filter className="w-3.5 h-3.5 text-slate-400" />
                    {(
                      [
                        { id: 'all', label: `Tất cả (${summary.total})` },
                        {
                          id: 'valid',
                          label: `Hợp lệ (${summary.total - summary.dupTotal})`,
                        },
                        {
                          id: 'duplicate',
                          label: `Trùng lặp (${summary.dupTotal})`,
                        },
                        {
                          id: 'missing_answer',
                          label: `Thiếu đáp án (${summary.missing})`,
                        },
                      ] as const
                    ).map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setFilterMode(tab.id)}
                        className={`px-2.5 py-1 rounded-lg font-semibold transition-colors tabular-nums ${
                          filterMode === tab.id
                            ? 'bg-blue-600 text-white'
                            : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                </div>

                <span className="font-bold text-blue-700 tabular-nums">
                  Sẽ lưu: {selectedNonDuplicateCount} câu
                </span>
              </div>

              {/* Question preview list */}
              <div className="space-y-3">
                {visibleEntries.map(({ question: q, index, dup, missingAnswer }) => {
                  const isChecked = selectedIds.has(q.id);
                  const isDup = dup.kind !== 'none';
                  const isEditorOpen = expandedEditorIds.has(q.id);
                  const sub = resolveQuestionSubject(q, subjects);

                  return (
                    <div
                      key={q.id}
                      className={`rounded-2xl border p-4 transition-colors ${
                        isDup
                          ? 'bg-amber-50/40 border-amber-300'
                          : isChecked
                          ? 'bg-white border-blue-200 shadow-xs'
                          : 'bg-slate-50/60 border-slate-200 opacity-75'
                      }`}
                    >
                      {/* Top row */}
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <button
                            type="button"
                            onClick={() => toggleSelect(q.id)}
                            disabled={isDup}
                            title={
                              isDup
                                ? 'Câu hỏi trùng lặp được khóa chọn để tránh lưu trùng'
                                : 'Chọn/bỏ chọn câu hỏi này'
                            }
                            className="inline-flex items-center gap-1.5 font-bold text-slate-900 disabled:opacity-50"
                          >
                            {isChecked && !isDup ? (
                              <CheckSquare className="w-4 h-4 text-blue-600" />
                            ) : (
                              <Square className="w-4 h-4 text-slate-400" />
                            )}
                            <span>Câu {index + 1}</span>
                          </button>

                          <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-semibold">
                            {sub.name}
                          </span>
                          <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-semibold">
                            {GRADE_LABELS[q.grade]}
                          </span>
                          {(q.chapterName || q.lessonName || q.lessonTopic) && (
                            <span className="px-2 py-0.5 rounded-md bg-teal-50 text-teal-800 font-medium max-w-[260px] truncate">
                              {q.chapterName ? `${q.chapterName} · ` : ''}
                              {q.lessonName || q.lessonTopic}
                            </span>
                          )}
                          <span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-800 font-semibold">
                            {QUESTION_TYPE_SHORT_LABELS[q.type]}
                          </span>
                          <span className="px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-800 font-semibold">
                            {COGNITIVE_LEVEL_SHORT_LABELS[q.level]}
                          </span>

                          {dup.kind === 'in_bank' && (
                            <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 font-bold inline-flex items-center gap-1">
                              <Copy className="w-3 h-3" />
                              Đã tồn tại trong ngân hàng ({dup.matchedCode})
                            </span>
                          )}
                          {dup.kind === 'in_file' && (
                            <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 font-bold inline-flex items-center gap-1">
                              <Copy className="w-3 h-3" />
                              Trùng Câu {(dup.matchedIndex ?? 0) + 1} trong file
                            </span>
                          )}
                          {missingAnswer && (
                            <span className="px-2 py-0.5 rounded-md bg-rose-100 text-rose-800 font-semibold inline-flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" />
                              Thiếu đáp án
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => toggleEditor(q.id)}
                            className={`px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition-colors inline-flex items-center gap-1 ${
                              isEditorOpen
                                ? 'bg-blue-600 border-blue-600 text-white'
                                : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-700'
                            }`}
                          >
                            <Edit3 className="w-3 h-3" />
                            <span>{isEditorOpen ? 'Đóng chỉnh sửa' : 'Chỉnh sửa nhanh'}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveDraftQuestion(q.id)}
                            title="Loại bỏ khỏi danh sách nhập"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Stem & formulas/equations/LaTeX preserved */}
                      <div className="mt-3 text-sm text-slate-900 leading-relaxed">
                        <ChemRenderer text={q.content} />
                      </div>

                      {/* Image preserved */}
                      {q.imageUrl && (
                        <div className="mt-2.5">
                          <img
                            src={q.imageUrl}
                            alt={`Hình minh họa Câu ${index + 1}`}
                            className="max-h-52 rounded-xl border border-slate-200 object-contain"
                          />
                        </div>
                      )}

                      {/* Options (Part 1) */}
                      {(q.type === 'part1_single_choice' ||
                        q.type === 'part1_multiple_choice') &&
                        q.options &&
                        q.options.length > 0 && (
                          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {q.options.map((opt) => {
                              const isCorrect =
                                opt.id === q.correctOptionId ||
                                (q.correctOptionIds || []).includes(opt.id) ||
                                Boolean(opt.isCorrect);
                              return (
                                <div
                                  key={opt.id}
                                  className={`px-3 py-2 rounded-xl border text-xs flex items-start gap-2 ${
                                    isCorrect
                                      ? 'bg-emerald-50 border-emerald-400 text-emerald-950 font-semibold'
                                      : 'bg-slate-50 border-slate-200 text-slate-700'
                                  }`}
                                >
                                  <span className="font-bold shrink-0">{opt.id}.</span>
                                  <div className="flex-1 min-w-0">
                                    <ChemRenderer text={opt.text} inline />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}

                      {/* Statements (Part 2) */}
                      {q.type === 'part2_true_false' &&
                        q.statements &&
                        q.statements.length > 0 && (
                          <div className="mt-3 space-y-1.5">
                            {q.statements.map((st) => (
                              <div
                                key={st.id}
                                className="px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs flex items-center justify-between gap-3"
                              >
                                <div className="min-w-0">
                                  <strong className="mr-1">{st.id})</strong>
                                  <ChemRenderer text={st.statement} inline />
                                </div>
                                <span
                                  className={`px-2 py-0.5 rounded font-bold shrink-0 ${
                                    st.correctAnswer
                                      ? 'bg-emerald-100 text-emerald-800'
                                      : 'bg-rose-100 text-rose-800'
                                  }`}
                                >
                                  {st.correctAnswer ? 'Đúng' : 'Sai'}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}

                      {/* Short Answer (Part 3) */}
                      {q.type === 'part3_short_answer' && q.shortAnswerConfig && (
                        <div className="mt-3 px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-200 text-xs">
                          <span className="font-bold text-emerald-900">Đáp án chuẩn: </span>
                          <span className="font-mono font-bold text-emerald-950">
                            {q.shortAnswerConfig.acceptableAnswers.length > 0
                              ? q.shortAnswerConfig.acceptableAnswers.join(' / ')
                              : 'Chưa có đáp án'}
                          </span>
                          {q.shortAnswerConfig.unit && (
                            <span className="ml-1 text-emerald-800">
                              ({q.shortAnswerConfig.unit})
                            </span>
                          )}
                        </div>
                      )}

                      {/* Explanation preserved */}
                      {q.explanation && (
                        <div className="mt-2.5 px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700">
                          <span className="font-bold text-slate-900">Lời giải: </span>
                          <ChemRenderer text={q.explanation} inline />
                        </div>
                      )}

                      {/* Per-question quick content, answer & metadata editor */}
                      {isEditorOpen && (
                        <PerQuestionQuickEditor
                          question={q}
                          subjects={subjects}
                          onChange={(patch) => handleUpdateSingleQuestion(q.id, patch)}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 sm:px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="text-xs text-slate-600 tabular-nums">
            {summary.total > 0 ? (
              <span>
                Đang chọn <strong className="text-slate-900">{selectedNonDuplicateCount}</strong> câu
                hợp lệ để lưu vào collection <code className="px-1 py-0.5 rounded bg-slate-200/70 text-[11px]">questions</code>
                {summary.dupTotal > 0 && (
                  <span className="text-amber-700 font-medium">
                    {' '}
                    · Tự động chặn {summary.dupTotal + selectedDuplicateCount} câu trùng lặp
                  </span>
                )}
              </span>
            ) : (
              <span>Không có câu hỏi nào để lưu.</span>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              disabled={isSaving}
              onClick={onClose}
              className="min-h-[40px] px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold disabled:opacity-50"
            >
              {saveOutcome?.type === 'success' ? 'Đóng' : 'Hủy'}
            </button>

            {saveOutcome?.type !== 'success' && (
              <button
                type="button"
                disabled={isSaving || selectedNonDuplicateCount === 0}
                onClick={() => void handleConfirmSaveClick()}
                className="min-h-[40px] px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold shadow-xs transition-colors inline-flex items-center gap-2"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Đang lưu lên Firestore...</span>
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    <span>Lưu {selectedNonDuplicateCount} câu vào Ngân hàng</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
