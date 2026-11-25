import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Question, Exam, ChemGrade, ChemTopic, Folder, SubjectItem } from '../../types';
import { 
  FileCheck, 
  Sparkles, 
  AlertTriangle, 
  CheckCircle2, 
  Trash2, 
  ArrowLeft,
  ArrowUp,
  ArrowDown,
  Shuffle, 
  Sliders, 
  Percent, 
  Plus, 
  ListOrdered,
  Lock,
  Unlock,
  Eye,
  EyeOff,
  Award,
  BookOpen,
  RefreshCw
} from 'lucide-react';
import { ChemRenderer } from '../../utils/chemRenderer';
import { APP_CONFIG } from '../../constants/brand';
import {
  DEFAULT_GDPT_2018_SUBJECTS,
  DEFAULT_SUBJECT_ID,
  DEFAULT_SUBJECT_NAME,
  QUESTION_TYPE_SHORT_LABELS,
} from '../../constants/subjects';
import { flattenFolderTree, getFolderPathLabel, normalizeFolderId } from '../../utils/folderTree';
import { StorageService } from '../../services/storage';
import { ExamShareModal } from '../common/ExamShareModal';
import { QuestionBankPickerModal, cloneQuestionsForExam } from './QuestionBankPickerModal';
import {
  generateExamCode6,
  generateFallbackExamCode6,
  isValidNewPublicCode,
  normalizeExamCode,
  normalizePublicExamCode,
} from '../../utils/urlHelper';
import { auth, extractAnswerKeyMap, syncExamToFirestore } from '../../services/firebase';
import {
  allocateExamPublicCodeOnServer,
  configureExamSecurityOnServer,
} from '../../services/examSecurityApi';

interface ExamCreatorProps {
  initialTitle?: string;
  initialQuestions?: Question[];
  initialGrade?: ChemGrade;
  initialFolderId?: string | null;
  folders: Folder[];
  bankQuestions?: Question[];
  subjects?: SubjectItem[];
  currentUserId?: string;
  currentUserName?: string;
  currentUserSchool?: string;
  currentUserDepartment?: string;
  onSaveExam: (exam: Exam) => void;
  onCancel: () => void;
}

export const ExamCreator: React.FC<ExamCreatorProps> = ({
  initialTitle = 'Đề kiểm tra mới',
  initialQuestions = [],
  initialGrade = '12',
  initialFolderId = '',
  folders,
  bankQuestions = [],
  subjects = DEFAULT_GDPT_2018_SUBJECTS,
  currentUserId,
  currentUserName,
  currentUserSchool,
  currentUserDepartment,
  onSaveExam,
  onCancel,
}) => {
  const [title, setTitle] = useState(initialTitle);
  const [description, setDescription] = useState('');
  const [code, setCode] = useState(() => generateExamCode6());
  const [subjectId, setSubjectId] = useState<string>(DEFAULT_SUBJECT_ID);
  const [grade, setGrade] = useState<ChemGrade>(initialGrade);
  const [topic, setTopic] = useState<ChemTopic>('hoa_huu_co');
  const [durationMinutes, setDurationMinutes] = useState(45);
  const [selectedFolderId, setSelectedFolderId] = useState<string>(initialFolderId || '');
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [pickerInitialTab, setPickerInitialTab] = useState<'manual' | 'matrix'>('manual');

  const [questions, setQuestions] = useState<Question[]>(() =>
    cloneQuestionsForExam(initialQuestions)
  );

  useEffect(() => {
    setSelectedFolderId(initialFolderId || '');
  }, [initialFolderId]);

  const flatFolderOptions = useMemo(() => flattenFolderTree(folders), [folders]);

  // Scoring rules
  const [part1Score, setPart1Score] = useState(0.25);
  const [part2Model, setPart2Model] = useState<'standard_moet' | 'custom_per_statement'>('standard_moet');
  const [part2CustomScore, setPart2CustomScore] = useState(0.25);
  const [part3Score, setPart3Score] = useState(0.25);

  // Online options
  const [shuffleQuestions, setShuffleQuestions] = useState(true);
  const [shuffleOptions, setShuffleOptions] = useState(true);
  const [maxAttempts, setMaxAttempts] = useState(1);
  const [showScoreAfterSubmit, setShowScoreAfterSubmit] = useState(true);
  const [showSolutionsAfterSubmit, setShowSolutionsAfterSubmit] = useState(true);

  // Bảo mật đề thi & Điều kiện xem đáp án
  const [requiresPassword, setRequiresPassword] = useState(false);
  const [examPassword, setExamPassword] = useState('');
  const [confirmExamPassword, setConfirmExamPassword] = useState('');
  const [showExamPassword, setShowExamPassword] = useState(false);

  const [allowAnswerReview, setAllowAnswerReview] = useState(true);
  const [answerReviewMinScore, setAnswerReviewMinScore] = useState<string>('8.0');
  const [answerReviewEnabledAtLocal, setAnswerReviewEnabledAtLocal] = useState('');
  const [isSavingExam, setIsSavingExam] = useState(false);

  // Question counts
  const p1Count = questions.filter(q => q.type === 'part1_single_choice').length;
  const p2Count = questions.filter(q => q.type === 'part2_true_false').length;
  const p3Count = questions.filter(q => q.type === 'part3_short_answer').length;

  // Calculate current total score
  const calculateTotalScore = (): number => {
    const p1Total = p1Count * part1Score;
    let p2Total = 0;
    if (part2Model === 'standard_moet') {
      p2Total = p2Count * 1.0; // In MOET model, 1 question max = 1.0 point
    } else {
      p2Total = p2Count * 4 * part2CustomScore;
    }
    const p3Total = p3Count * part3Score;
    return Math.round((p1Total + p2Total + p3Total) * 100) / 100;
  };

  const currentTotal = calculateTotalScore();
  const isScoreExactly10 = Math.abs(currentTotal - 10.0) < 0.01;

  // Auto-Balancer function to fit exactly 10.0 points
  const handleAutoBalanceScore = () => {
    if (questions.length === 0) return;

    // If matches standard MOET structure: 18 Part I, 4 Part II, 6 Part III
    if (p1Count === 18 && p2Count === 4 && p3Count === 6) {
      setPart1Score(0.25); // 18 * 0.25 = 4.5
      setPart2Model('standard_moet'); // 4 * 1.0 = 4.0
      setPart3Score(0.25); // 6 * 0.25 = 1.5 => Total = 10.0
      return;
    }

    // Dynamic balancing:
    const nonP2Total = p1Count + p3Count;
    if (p2Count > 0 && (nonP2Total === 0 || p2Count > 10 || part2Model === 'custom_per_statement')) {
      // Scale across all parts smoothly
      if (nonP2Total === 0) {
        setPart2Model('custom_per_statement');
        setPart2CustomScore(Math.round((10.0 / (p2Count * 4)) * 1000) / 1000);
        return;
      }
      const p2Budget = Math.min(4.0, p2Count * 1.0);
      setPart2Model('custom_per_statement');
      setPart2CustomScore(Math.round((p2Budget / (p2Count * 4)) * 1000) / 1000);
      const remaining = 10.0 - p2Budget;
      const perQuestionBase = Math.floor((remaining / nonP2Total) * 100) / 100;
      setPart1Score(perQuestionBase);
      setPart3Score(perQuestionBase);
      const diff = 10.0 - (p1Count * perQuestionBase + p2Budget + p3Count * perQuestionBase);
      if (p3Count > 0 && Math.abs(diff) > 0.001) {
        setPart3Score(Math.round((perQuestionBase + diff / p3Count) * 100) / 100);
      }
      return;
    }

    const p2Budget = p2Count * 1.0;
    const remainingForP1andP3 = 10.0 - p2Budget;

    if (nonP2Total > 0) {
      const perQuestionBase = Math.floor((remainingForP1andP3 / nonP2Total) * 100) / 100;
      setPart1Score(perQuestionBase);
      setPart3Score(perQuestionBase);

      const current = p1Count * perQuestionBase + p2Budget + p3Count * perQuestionBase;
      const diff = 10.0 - current;
      if (p3Count > 0 && Math.abs(diff) > 0.001) {
        setPart3Score(Math.round((perQuestionBase + diff / p3Count) * 100) / 100);
      }
    }
  };

  const [createdExamForShare, setCreatedExamForShare] = useState<Exam | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const pendingDraftRef = useRef<{
    examId: string;
    code: string;
    publicCode?: string;
    inputCodeSnapshot: string;
  } | null>(null);

  const handleRemoveQuestion = (id: string) => {
    setQuestions((prev) => prev.filter((q) => q.id !== id));
  };

  const handleMoveQuestion = (index: number, direction: 'up' | 'down') => {
    setQuestions((prev) => {
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= prev.length) return prev;
      const copy = [...prev];
      const temp = copy[index];
      copy[index] = copy[targetIndex];
      copy[targetIndex] = temp;
      return copy;
    });
  };

  const handleSave = async () => {
    setFormError(null);
    if (!title.trim()) {
      setFormError('Vui lòng nhập tiêu đề đề thi!');
      return;
    }
    if (questions.length === 0) {
      setFormError('Đề thi cần có ít nhất 1 câu hỏi!');
      return;
    }

    if (requiresPassword) {
      if (examPassword.length < 6) {
        setFormError('Mật khẩu đề thi phải có ít nhất 6 ký tự!');
        return;
      }
      if (examPassword !== confirmExamPassword) {
        setFormError('Mật khẩu xác nhận không khớp. Vui lòng kiểm tra lại!');
        return;
      }
    }

    const parsedMinScore = Number(answerReviewMinScore.replace(',', '.'));
    if (!Number.isFinite(parsedMinScore) || parsedMinScore < 0 || parsedMinScore > 10) {
      setFormError('Điểm sàn xem đáp án phải nằm trong khoảng từ 0.0 đến 10.0 điểm!');
      return;
    }
    const cleanMinScore = Math.round(parsedMinScore * 100) / 100;

    let enabledAtIso: string | null = null;
    if (answerReviewEnabledAtLocal.trim()) {
      const ms = Date.parse(answerReviewEnabledAtLocal.trim());
      if (!Number.isFinite(ms)) {
        setFormError('Thời điểm bắt đầu mở đáp án không hợp lệ!');
        return;
      }
      enabledAtIso = new Date(ms).toISOString();
    }

    let finalPart1Score = part1Score;
    let finalPart2Model = part2Model;
    let finalPart2Custom = part2CustomScore;
    let finalPart3Score = part3Score;

    // Auto-balance if score is not exactly 10.0
    if (!isScoreExactly10) {
      const nonP2 = p1Count + p3Count;
      let p2Budget =
        finalPart2Model === 'standard_moet'
          ? p2Count * 1.0
          : p2Count * 4 * finalPart2Custom;

      if (p2Count > 0 && (nonP2 === 0 || p2Budget >= 10.0)) {
        finalPart2Model = 'custom_per_statement';
        p2Budget = nonP2 === 0 ? 10.0 : Math.min(4.0, p2Count * 1.0);
        finalPart2Custom = Math.round((p2Budget / (p2Count * 4)) * 1000) / 1000;
      }

      const remaining = Math.max(0, 10.0 - p2Budget);
      if (nonP2 > 0) {
        const base = Math.floor((remaining / nonP2) * 100) / 100;
        finalPart1Score = base;
        finalPart3Score = base;
        const diff = 10.0 - (p1Count * base + p2Budget + p3Count * base);
        if (p3Count > 0 && Math.abs(diff) > 0.001) {
          finalPart3Score = Math.round((base + diff / p3Count) * 100) / 100;
        }
      }
    }

    // Reuse pending draft identity on retry so partial failures NEVER create duplicate exams
    const rawInputCode = code.trim();
    const canReusePending =
      pendingDraftRef.current && pendingDraftRef.current.inputCodeSnapshot === rawInputCode;

    let cleanCode = canReusePending
      ? pendingDraftRef.current!.code
      : normalizePublicExamCode(rawInputCode) || normalizeExamCode(rawInputCode) || generateExamCode6();
    if (!cleanCode) {
      cleanCode = generateExamCode6();
    }

    const examId = canReusePending
      ? pendingDraftRef.current!.examId
      : `exam_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

    if (!canReusePending) {
      const existingExams = StorageService.getExams(currentUserId || auth.currentUser?.uid);
      const isConflict = (candidate: string) =>
        existingExams.some(
          (e) =>
            e.id !== examId &&
            (normalizeExamCode(e.code) === candidate ||
              normalizePublicExamCode(e.publicCode) === candidate ||
              normalizePublicExamCode(e.shortId) === candidate)
        );
      let attempts = 0;
      while (isConflict(cleanCode) && attempts < 10) {
        cleanCode = generateExamCode6();
        attempts += 1;
      }
      pendingDraftRef.current = { examId, code: cleanCode, inputCodeSnapshot: rawInputCode };
    }

    const ownerId = currentUserId || auth.currentUser?.uid || 'teacher_1';
    const actorUid = auth.currentUser?.uid || ownerId;
    const resolvedAuthorName = currentUserName || auth.currentUser?.displayName || APP_CONFIG.APP_AUTHOR;
    const nowIso = new Date().toISOString();
    const normalizedTargetFolderId = normalizeFolderId(selectedFolderId);

    const selectedSubject =
      subjects.find((s) => s.id === subjectId) || {
        id: DEFAULT_SUBJECT_ID,
        name: DEFAULT_SUBJECT_NAME,
      };

    const baseExam: Exam = {
      id: examId,
      examId,
      title: title.trim(),
      ...(description.trim() ? { description: description.trim() } : {}),
      code: cleanCode,
      subjectId: selectedSubject.id,
      subjectName: selectedSubject.name,
      grade,
      topic,
      folderId: normalizedTargetFolderId,
      durationMinutes,
      totalQuestions: questions.length,
      totalScore: 10.0,
      questions,
      rules: {
        part1ScorePerQuestion: finalPart1Score,
        part2GradingModel: finalPart2Model,
        part2CustomScorePerStatement: finalPart2Custom,
        part3ScorePerQuestion: finalPart3Score,
        totalTargetScore: 10.0,
      },
      shuffleQuestions,
      shuffleOptions,
      isPublished: true,
      maxAttempts,
      showScoreAfterSubmit,
      showAnswersAfterSubmit: allowAnswerReview,
      showSolutionsAfterSubmit,
      allowReviewLater: true,
      requiresPassword,
      passwordUpdatedAt: requiresPassword ? nowIso : null,
      allowAnswerReview,
      answerReviewMinScore: cleanMinScore,
      answerReviewEnabledAt: enabledAtIso,
      ownerId,
      authorId: ownerId,
      createdBy: actorUid,
      updatedBy: actorUid,
      authorName: resolvedAuthorName,
      ...(currentUserSchool ? { authorSchool: currentUserSchool } : {}),
      ...(currentUserDepartment ? { authorDepartment: currentUserDepartment } : {}),
      share_status: 'private',
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    setIsSavingExam(true);
    try {
      if (!auth.currentUser) {
        setFormError(
          'Bạn cần đăng nhập tài khoản Giáo viên để tạo đề thi và cấp đường dẫn 6 ký tự.'
        );
        return;
      }

      // Prefer reserving the exact 6-character code entered/generated in UI so code === publicCode === shortId === slug
      const preferredPublicCode =
        pendingDraftRef.current?.publicCode ??
        (isValidNewPublicCode(cleanCode) ? cleanCode : null);

      const resolveClientFallbackCode = (): string => {
        const localExams = StorageService.getExams(currentUserId || auth.currentUser?.uid);
        const hasLocalConflict = (candidate: string) =>
          localExams.some(
            (e) =>
              e.id !== examId &&
              (normalizeExamCode(e.code) === candidate ||
                normalizePublicExamCode(e.publicCode) === candidate ||
                normalizePublicExamCode(e.shortId) === candidate)
          );

        if (preferredPublicCode && isValidNewPublicCode(preferredPublicCode) && !hasLocalConflict(preferredPublicCode)) {
          return preferredPublicCode;
        }
        for (let attempt = 0; attempt < 5; attempt++) {
          const candidate = generateExamCode6();
          if (!hasLocalConflict(candidate)) return candidate;
        }
        return generateFallbackExamCode6();
      };

      let allocatedPublicCode = '';
      let usedFallbackAllocation = false;
      try {
        const allocRes = await allocateExamPublicCodeOnServer({
          examId,
          examCode: cleanCode,
          isPublished: true,
          existingPublicCode: preferredPublicCode,
        });
        if (allocRes.ok && allocRes.publicCode) {
          allocatedPublicCode = allocRes.publicCode;
          usedFallbackAllocation = Boolean(allocRes.fallback);
          if (allocRes.fallback) {
            console.warn(
              '[ExamCreator] Server used fallback 6-char publicCode:',
              allocatedPublicCode,
              allocRes.warning || ''
            );
          }
        } else {
          console.warn(
            '[ExamCreator] API /api/exams/allocate-public-code failed, falling back to local 6-char code:',
            allocRes.error || allocRes.code
          );
          allocatedPublicCode = resolveClientFallbackCode();
          usedFallbackAllocation = true;
        }
      } catch (allocErr) {
        console.warn(
          '[ExamCreator] Exception calling /api/exams/allocate-public-code, falling back to local 6-char code:',
          allocErr
        );
        allocatedPublicCode = resolveClientFallbackCode();
        usedFallbackAllocation = true;
      }

      const finalUnifiedCode = allocatedPublicCode;

      if (pendingDraftRef.current) {
        pendingDraftRef.current.publicCode = finalUnifiedCode;
        pendingDraftRef.current.code = finalUnifiedCode;
      }

      // If server resolved a collision with a different 6-char code, ensure examLinks/{code}.examCode is also synchronized
      if (!usedFallbackAllocation && normalizeExamCode(cleanCode) !== finalUnifiedCode) {
        await allocateExamPublicCodeOnServer({
          examId,
          examCode: finalUnifiedCode,
          isPublished: true,
          existingPublicCode: finalUnifiedCode,
        }).catch(() => undefined);
      }

      const unifiedExamBase: Exam = {
        ...baseExam,
        code: finalUnifiedCode,
        publicCode: finalUnifiedCode,
        shortId: finalUnifiedCode,
        slug: `/${finalUnifiedCode}`,
      };

      let passwordUpdatedAt: string | null = unifiedExamBase.passwordUpdatedAt ?? null;
      const secRes = await configureExamSecurityOnServer({
        examCode: finalUnifiedCode,
        examId,
        requiresPassword,
        passwordAction: requiresPassword ? 'set' : 'clear',
        ...(requiresPassword ? { password: examPassword } : {}),
        allowAnswerReview,
        answerReviewMinScore: cleanMinScore,
        answerReviewEnabledAt: enabledAtIso,
        showScoreAfterSubmit,
        showSolutionsAfterSubmit,
        isPublished: true,
        maxAttempts,
        rules: unifiedExamBase.rules,
        questions: questions.map((q) => ({
          id: q.id,
          type: q.type,
          ...(Array.isArray(q.statements) ? { statementIds: q.statements.map((s) => s.id) } : {}),
        })),
        answerMap: extractAnswerKeyMap(unifiedExamBase),
        patchMetadataDocs: false,
      });

      if (!secRes.ok) {
        if (requiresPassword) {
          setFormError(
            secRes.error ||
              'Không thể lưu cấu hình mật khẩu đề thi lên máy chủ. Vui lòng kiểm tra kết nối và thử lại!'
          );
          return;
        }
        console.warn('Background server security setup warning:', secRes.error);
      } else if (secRes.passwordUpdatedAt !== undefined) {
        passwordUpdatedAt = secRes.passwordUpdatedAt;
      }

      const newExam: Exam = {
        ...unifiedExamBase,
        passwordUpdatedAt: requiresPassword ? passwordUpdatedAt : null,
      };
      setCode(finalUnifiedCode);

      // 1. Sync exam projections to Cloud Firestore BEFORE localStorage so failed Firestore commit never leaves duplicate local drafts
      await syncExamToFirestore(newExam, ownerId);

      // 2. Guaranteed local persistence with verified readback (NEVER contains plaintext password)
      const savedSuccess = StorageService.addExam(newExam, ownerId);
      if (!savedSuccess) {
        setFormError(
          '[EXAM_SAVE_ERROR] Không thể lưu đề thi vào bộ nhớ trình duyệt. Vui lòng kiểm tra dung lượng lưu trữ và thử lại!'
        );
        return;
      }

      pendingDraftRef.current = null;

      // Clear plaintext password from component state immediately after hashing on server
      setExamPassword('');
      setConfirmExamPassword('');

      // 3. Notify parent state
      onSaveExam(newExam);

      // 4. Immediately show the Share & QR Code modal
      setCreatedExamForShare(newExam);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Không thể đồng bộ đề thi lên Firestore. Vui lòng thử lại!';
      setFormError(msg.startsWith('[') ? msg : `[EXAM_SAVE_ERROR] ${msg}`);
    } finally {
      setIsSavingExam(false);
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Top Header */}
      {formError && (
        <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{formError}</span>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={onCancel}
            className="p-2 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-600 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-2 text-blue-600 font-bold text-xs uppercase tracking-wider">
              <FileCheck className="w-4 h-4" />
              <span>Thiết lập & Cân đối ma trận đề thi</span>
            </div>
            <h1 className="text-xl md:text-2xl font-extrabold text-slate-900 mt-1">
              Tạo & Cấu Hình Đề Thi Trực Tuyến
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onCancel}
            className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 font-bold text-xs hover:bg-slate-50 transition-colors"
          >
            Hủy
          </button>
          <button
            onClick={() => void handleSave()}
            disabled={isSavingExam}
            className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-bold text-xs shadow-md shadow-blue-500/20 transition-all flex items-center gap-2"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>{isSavingExam ? 'Đang lưu & Mã hóa...' : 'Lưu & Mở Phòng Thi Ngay'}</span>
          </button>
        </div>
      </div>

      {/* Grid: 2 Columns */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column: Exam Basic Info & Score Balancing (1 Col) */}
        <div className="space-y-5">
          
          {/* Basic Config Card */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
              <Sliders className="w-4 h-4 text-blue-600" />
              Thông tin đề thi
            </h2>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Tiêu đề đề thi</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="VD: Kiểm tra giữa kì 1..."
                className="w-full p-2.5 rounded-xl border border-slate-200 text-xs font-semibold focus:ring-2 focus:ring-teal-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Mô tả đề thi (tùy chọn)
              </label>
              <textarea
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Ghi chú phạm vi kiến thức, hướng dẫn chung cho thí sinh..."
                className="w-full p-2.5 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-teal-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Mã phòng thi (6 ký tự)
                </label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    maxLength={6}
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                    placeholder="VD: NFKELZ"
                    className="w-full p-2.5 rounded-xl border border-slate-200 text-xs font-mono font-bold uppercase tracking-wider bg-slate-50 text-blue-700"
                  />
                  <button
                    type="button"
                    onClick={() => setCode(generateExamCode6())}
                    className="p-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 hover:text-blue-700 transition-colors shrink-0"
                    title="Tạo mã phòng thi 6 ký tự ngẫu nhiên mới"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  Đồng bộ trực tiếp với link ngắn <span className="font-mono font-semibold text-teal-700">/{code || '••••••'}</span>
                </p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Thời gian (phút)</label>
                <input
                  type="number"
                  min={5}
                  max={180}
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(Number(e.target.value))}
                  className="w-full p-2.5 rounded-xl border border-slate-200 text-xs font-bold"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Môn học</label>
                <select
                  value={subjectId}
                  onChange={(e) => setSubjectId(e.target.value)}
                  className="w-full p-2 rounded-xl border border-slate-200 text-xs font-medium bg-white"
                >
                  {subjects.map((sub) => (
                    <option key={sub.id} value={sub.id}>
                      {sub.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Khối lớp</label>
                <select
                  value={grade}
                  onChange={(e) => setGrade(e.target.value as ChemGrade)}
                  className="w-full p-2 rounded-xl border border-slate-200 text-xs font-medium bg-white"
                >
                  <option value="12">Lớp 12 THPT</option>
                  <option value="11">Lớp 11 THPT</option>
                  <option value="10">Lớp 10 THPT</option>
                  <option value="chuyen_hsg">Chuyên &amp; HSG</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Lưu vào thư mục</label>
              <select
                value={selectedFolderId}
                onChange={(e) => setSelectedFolderId(e.target.value)}
                className="w-full p-2 rounded-xl border border-slate-200 text-xs font-medium bg-white"
              >
                <option value="">Đề thi (Thư mục gốc)</option>
                {flatFolderOptions.map((item) => (
                  <option key={item.folder.id} value={item.folder.id}>
                    {'\u00A0'.repeat(item.depth * 3)}
                    {item.depth > 0 ? '↳ ' : ''}
                    {item.folder.name}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-teal-700 font-medium mt-1 truncate">
                Vị trí lưu: {getFolderPathLabel(selectedFolderId || null, folders)}
              </p>
            </div>
          </div>

          {/* CRITICAL SCORE BALANCER (Thang điểm 10.0 bắt buộc) */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                <Percent className="w-4 h-4 text-emerald-600" />
                Phân phối thang điểm 10.0
              </h2>
              <button
                type="button"
                onClick={handleAutoBalanceScore}
                className="px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-[11px] font-bold flex items-center gap-1 transition-colors border border-emerald-200"
              >
                <Sparkles className="w-3 h-3" />
                Tự động cân đối 10đ
              </button>
            </div>

            {/* Score Total Badge with Compulsory 10-point warning */}
            <div className={`p-3.5 rounded-xl border text-center transition-all ${
              isScoreExactly10 
                ? 'bg-emerald-50 border-emerald-300 text-emerald-900' 
                : 'bg-amber-50 border-amber-300 text-amber-900'
            }`}>
              <div className="flex items-center justify-center gap-1.5 font-bold text-sm">
                {isScoreExactly10 ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>Tổng điểm: 10.0 / 10.0 điểm (Đạt chuẩn)</span>
                  </>
                ) : (
                  <>
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                    <span>Tổng điểm: {currentTotal} / 10.0 điểm (Chưa đúng 10đ)</span>
                  </>
                )}
              </div>
              {!isScoreExactly10 && (
                <p className="text-[11px] text-amber-700 mt-1">
                  Yêu cầu bắt buộc: Tổng điểm của đề thi phải bằng 10.0 điểm. Hãy nhấn nút "Tự động cân đối" ở trên.
                </p>
              )}
            </div>

            {/* Part I scoring config */}
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5 text-xs">
              <div className="flex justify-between font-semibold text-slate-700">
                <span>Phần I: 4 lựa chọn ({p1Count} câu)</span>
                <span className="font-bold text-blue-700">{(p1Count * part1Score).toFixed(2)}đ</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-slate-500">Điểm mỗi câu:</span>
                <input
                  type="number"
                  step="0.05"
                  min="0"
                  max="5"
                  value={part1Score}
                  onChange={(e) => setPart1Score(Number(e.target.value))}
                  className="w-20 p-1 rounded-md border border-slate-300 font-bold text-center bg-white"
                />
                <span className="text-slate-500">điểm</span>
              </div>
            </div>

            {/* Part II scoring config */}
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5 text-xs">
              <div className="flex justify-between font-semibold text-slate-700">
                <span>Phần II: Đúng/Sai ({p2Count} câu)</span>
                <span className="font-bold text-indigo-700">
                  {(part2Model === 'standard_moet' ? p2Count * 1.0 : p2Count * 4 * part2CustomScore).toFixed(2)}đ
                </span>
              </div>
              <select
                value={part2Model}
                onChange={(e) => setPart2Model(e.target.value as any)}
                className="w-full p-1.5 rounded-md border border-slate-300 font-medium bg-white text-xs"
              >
                <option value="standard_moet">Chuẩn Bộ GD&ĐT (1 ý=0.1; 2 ý=0.25; 3 ý=0.5; 4 ý=1.0đ)</option>
                <option value="custom_per_statement">Chia đều điểm từng mệnh đề a, b, c, d</option>
              </select>
              {part2Model === 'custom_per_statement' && (
                <div className="flex items-center gap-2 pt-1">
                  <span className="text-slate-500">Điểm mỗi ý (a/b/c/d):</span>
                  <input
                    type="number"
                    step="0.05"
                    min="0"
                    max="2.5"
                    value={part2CustomScore}
                    onChange={(e) => setPart2CustomScore(Number(e.target.value))}
                    className="w-20 p-1 rounded-md border border-slate-300 font-bold text-center bg-white"
                  />
                  <span className="text-slate-500">điểm</span>
                </div>
              )}
            </div>

            {/* Part III scoring config */}
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5 text-xs">
              <div className="flex justify-between font-semibold text-slate-700">
                <span>Phần III: Trả lời ngắn ({p3Count} câu)</span>
                <span className="font-bold text-purple-700">{(p3Count * part3Score).toFixed(2)}đ</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-slate-500">Điểm mỗi câu:</span>
                <input
                  type="number"
                  step="0.05"
                  min="0"
                  max="5"
                  value={part3Score}
                  onChange={(e) => setPart3Score(Number(e.target.value))}
                  className="w-20 p-1 rounded-md border border-slate-300 font-bold text-center bg-white"
                />
                <span className="text-slate-500">điểm</span>
              </div>
            </div>
          </div>

          {/* BẢO MẬT ĐỀ THI */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                {requiresPassword ? (
                  <Lock className="w-4 h-4 text-amber-600" />
                ) : (
                  <Unlock className="w-4 h-4 text-emerald-600" />
                )}
                <span>Bảo mật đề thi</span>
              </h2>
              <span
                className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                  requiresPassword ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
                }`}
              >
                {requiresPassword ? 'Có mật khẩu' : 'Không mật khẩu'}
              </span>
            </div>

            <div className="grid grid-cols-1 gap-2">
              <label className="flex items-center gap-2 cursor-pointer p-2 rounded-xl border border-slate-200 hover:bg-slate-50">
                <input
                  type="radio"
                  name="examPasswordMode"
                  checked={!requiresPassword}
                  onChange={() => {
                    setRequiresPassword(false);
                    setExamPassword('');
                    setConfirmExamPassword('');
                  }}
                  className="text-blue-600"
                />
                <span className="font-semibold text-slate-700">Không sử dụng mật khẩu</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer p-2 rounded-xl border border-slate-200 hover:bg-slate-50">
                <input
                  type="radio"
                  name="examPasswordMode"
                  checked={requiresPassword}
                  onChange={() => setRequiresPassword(true)}
                  className="text-amber-600"
                />
                <span className="font-semibold text-slate-700">Yêu cầu mật khẩu khi vào thi</span>
              </label>
            </div>

            {requiresPassword && (
              <div className="space-y-2.5 pt-1 border-t border-slate-100">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Mật khẩu đề thi (tối thiểu 6 ký tự)
                  </label>
                  <div className="relative">
                    <input
                      type={showExamPassword ? 'text' : 'password'}
                      value={examPassword}
                      onChange={(e) => setExamPassword(e.target.value)}
                      placeholder="Nhập mật khẩu..."
                      className="w-full p-2.5 pr-9 rounded-xl border border-slate-300 bg-slate-50 text-xs font-semibold focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowExamPassword((v) => !v)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                      title={showExamPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                    >
                      {showExamPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Xác nhận mật khẩu
                  </label>
                  <input
                    type={showExamPassword ? 'text' : 'password'}
                    value={confirmExamPassword}
                    onChange={(e) => setConfirmExamPassword(e.target.value)}
                    placeholder="Nhập lại mật khẩu..."
                    className="w-full p-2.5 rounded-xl border border-slate-300 bg-slate-50 text-xs font-semibold focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <p className="text-[11px] text-slate-500 leading-relaxed">
                  Học sinh mở link/mã đề sẽ phải đăng nhập và nhập đúng mật khẩu này mới được tải câu hỏi.
                </p>
              </div>
            )}
          </div>

          {/* ĐIỀU KIỆN XEM ĐÁP ÁN */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-3 text-xs">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
              <Award className="w-4 h-4 text-indigo-600" />
              <span>Điều kiện xem đáp án</span>
            </h2>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showScoreAfterSubmit}
                onChange={(e) => setShowScoreAfterSubmit(e.target.checked)}
                className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
              />
              <span className="font-medium text-slate-700">Hiển thị điểm ngay sau khi nộp bài</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={allowAnswerReview}
                onChange={(e) => setAllowAnswerReview(e.target.checked)}
                className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
              />
              <span className="font-semibold text-slate-800">
                Cho phép học sinh xem đáp án sau khi nộp bài
              </span>
            </label>

            {allowAnswerReview && (
              <div className="space-y-2.5 p-3 rounded-xl bg-indigo-50/60 border border-indigo-100">
                <div>
                  <label className="block text-[11px] font-bold text-indigo-950 mb-1">
                    Điểm sàn tối thiểu để xem đáp án (0.0 – 10.0)
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max="10"
                      value={answerReviewMinScore}
                      onChange={(e) => setAnswerReviewMinScore(e.target.value)}
                      className="w-24 p-2 rounded-lg border border-indigo-200 bg-white font-extrabold text-indigo-700 text-center"
                    />
                    <span className="text-[11px] text-indigo-900">
                      điểm (≥ {Number(answerReviewMinScore.replace(',', '.') || 0).toFixed(1)}đ mới mở)
                    </span>
                  </div>
                </div>

                <div>
                  <label className="flex items-center justify-between text-[11px] font-semibold text-slate-700 mb-1">
                    <span>Thời điểm bắt đầu cho phép xem đáp án (tùy chọn)</span>
                    {answerReviewEnabledAtLocal && (
                      <button
                        type="button"
                        onClick={() => setAnswerReviewEnabledAtLocal('')}
                        className="text-[10px] text-blue-600 hover:underline font-bold"
                      >
                        Xóa
                      </button>
                    )}
                  </label>
                  <input
                    type="datetime-local"
                    value={answerReviewEnabledAtLocal}
                    onChange={(e) => setAnswerReviewEnabledAtLocal(e.target.value)}
                    className="w-full p-2 rounded-lg border border-slate-200 bg-white text-xs"
                  />
                </div>
              </div>
            )}

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showSolutionsAfterSubmit}
                onChange={(e) => setShowSolutionsAfterSubmit(e.target.checked)}
                disabled={!allowAnswerReview}
                className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 disabled:opacity-50"
              />
              <span className={`font-medium ${allowAnswerReview ? 'text-slate-700' : 'text-slate-400'}`}>
                Hiển thị hướng dẫn giải chi tiết (khi đạt điểm sàn)
              </span>
            </label>
          </div>

          {/* Test Permissions & Anti-cheat Options */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-3 text-xs">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
              <Shuffle className="w-4 h-4 text-purple-600" />
              Thiết lập phòng thi trực tuyến
            </h2>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={shuffleQuestions}
                onChange={(e) => setShuffleQuestions(e.target.checked)}
                className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
              />
              <span className="font-medium text-slate-700">Đảo thứ tự câu hỏi giữa các thí sinh</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={shuffleOptions}
                onChange={(e) => setShuffleOptions(e.target.checked)}
                className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
              />
              <span className="font-medium text-slate-700">Đảo thứ tự phương án A, B, C, D</span>
            </label>
          </div>
        </div>

        {/* Right Column: Questions in Exam (2 Cols) */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <ListOrdered className="w-5 h-5 text-teal-600" />
                <span className="tabular-nums">Danh sách câu hỏi trong đề ({questions.length} câu)</span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
                Phần I: {p1Count} câu · Phần II: {p2Count} câu · Phần III: {p3Count} câu
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setPickerInitialTab('matrix');
                  setIsPickerOpen(true);
                }}
                className="min-h-[38px] px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors shadow-xs"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Tạo đề tự động theo Ma trận</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setPickerInitialTab('manual');
                  setIsPickerOpen(true);
                }}
                className="min-h-[38px] px-3.5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors shadow-xs"
              >
                <BookOpen className="w-3.5 h-3.5" />
                <span>Chọn từ Ngân hàng</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  const shuffled = [...questions].sort(() => Math.random() - 0.5);
                  setQuestions(shuffled);
                }}
                className="min-h-[38px] px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1.5"
              >
                <Shuffle className="w-3.5 h-3.5" />
                <span>Đảo thứ tự</span>
              </button>
            </div>
          </div>

          {/* List */}
          <div className="space-y-3">
            {questions.length === 0 ? (
              <div className="bg-white border border-dashed border-slate-300 rounded-2xl p-12 text-center space-y-3">
                <p className="text-slate-600 text-sm font-medium">
                  Chưa có câu hỏi nào trong đề thi này.
                </p>
                <p className="text-slate-500 text-xs">
                  Bốc câu hỏi ngẫu nhiên theo Ma trận GDPT 2018 (Chuyên đề × Mức độ) hoặc chọn thủ công từ Ngân hàng.
                </p>
                <div className="flex flex-wrap items-center justify-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      setPickerInitialTab('matrix');
                      setIsPickerOpen(true);
                    }}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold"
                  >
                    <Sparkles className="w-4 h-4" />
                    <span>Tạo đề tự động theo Ma trận</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPickerInitialTab('manual');
                      setIsPickerOpen(true);
                    }}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Chọn thủ công ({bankQuestions.length} câu)</span>
                  </button>
                </div>
              </div>
            ) : (
              questions.map((q, idx) => (
                <div
                  key={q.id}
                  className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs text-xs space-y-2 hover:border-teal-200 transition-colors"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="w-6 h-6 rounded-lg bg-slate-100 text-slate-800 font-bold flex items-center justify-center text-xs tabular-nums">
                        {idx + 1}
                      </span>
                      <span className="font-mono font-bold text-slate-700">{q.code}</span>
                      <span className="text-slate-400">·</span>
                      <span className="font-semibold text-teal-700">
                        {QUESTION_TYPE_SHORT_LABELS[q.type]}
                      </span>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        disabled={idx === 0}
                        onClick={() => handleMoveQuestion(idx, 'up')}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 disabled:opacity-30"
                        title="Di chuyển lên"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={idx === questions.length - 1}
                        onClick={() => handleMoveQuestion(idx, 'down')}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 disabled:opacity-30"
                        title="Di chuyển xuống"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemoveQuestion(q.id)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                        title="Gỡ câu này khỏi đề thi"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="text-slate-900 font-medium leading-relaxed">
                    <ChemRenderer text={q.content} />
                  </div>

                  {q.type === 'part1_single_choice' && q.options && (
                    <div className="grid grid-cols-2 gap-1.5 pt-1">
                      {q.options.map(o => (
                        <div
                          key={o.id}
                          className={`p-1.5 rounded-lg border text-[11px] flex items-center gap-1.5 ${
                            o.id === q.correctOptionId ? 'bg-emerald-50 border-emerald-300 font-semibold text-emerald-900' : 'bg-slate-50 border-slate-200 text-slate-600'
                          }`}
                        >
                          <span className="font-bold">{o.id}.</span>
                          <span className="flex-1 break-words"><ChemRenderer text={o.text} inline /></span>
                        </div>
                      ))}
                    </div>
                  )}

                  {q.type === 'part2_true_false' && q.statements && (
                    <div className="space-y-1 pt-1">
                      {q.statements.map(s => (
                        <div key={s.id} className="p-1.5 rounded-lg bg-slate-50 border border-slate-200 text-[11px] flex justify-between items-center">
                          <span><b>{s.id})</b> <ChemRenderer text={s.statement} inline /></span>
                          <span className={`px-1.5 py-0.5 rounded font-bold text-[10px] ${s.correctAnswer ? 'text-emerald-700 bg-emerald-100' : 'text-rose-700 bg-rose-100'}`}>
                            {s.correctAnswer ? 'Đúng' : 'Sai'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

      </div>

      {/* Question Bank & Matrix Picker Modal */}
      <QuestionBankPickerModal
        isOpen={isPickerOpen}
        bankQuestions={bankQuestions}
        existingExamQuestionIds={questions.map((q) => q.id)}
        subjects={subjects}
        defaultSubjectId={subjectId}
        defaultGrade={grade}
        initialTab={pickerInitialTab}
        onAddQuestions={(picked) => {
          setQuestions((prev) => [...prev, ...picked]);
        }}
        onClose={() => setIsPickerOpen(false)}
      />

      {/* Share Modal upon Successful Exam Creation */}
      <ExamShareModal
        isOpen={!!createdExamForShare}
        exam={createdExamForShare}
        onClose={() => {
          setCreatedExamForShare(null);
          onCancel(); // Return to manager
        }}
      />

    </div>
  );
};
