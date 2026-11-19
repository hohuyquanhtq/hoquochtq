import React, { useState, useRef, useEffect } from 'react';
import {
  FileUp,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Save,
  Trash2,
  Edit3,
  Eye,
  Layers,
  FlaskConical,
  RefreshCw,
  CheckCheck,
  XCircle,
  Table,
  ListChecks,
  X,
  FileCode,
  UploadCloud,
  ShieldAlert,
  ChevronDown,
  Play,
  ArrowRight,
  Cpu,
  Check,
  CheckSquare,
  Square,
  Database,
} from 'lucide-react';
import {
  parseDocxExam,
  parsePdfExam,
  parseExamContent,
  reclassifyQuestionType,
  recalculateParsedExamResult,
  SAMPLE_CHEMISTRY_EXAMS,
} from '../../utils/docxParser';
import {
  ParsedExamResult,
  Question,
  QuestionType,
  ChemGrade,
  CognitiveLevel,
  RecognitionStatus,
  SubjectItem,
} from '../../types';
import {
  COGNITIVE_LEVEL_LABELS,
  COGNITIVE_LEVEL_SHORT_LABELS,
  DEFAULT_GDPT_2018_SUBJECTS,
  GRADE_LABELS,
  resolveQuestionSubject,
} from '../../constants/subjects';
import { ChemRenderer } from '../../utils/chemRenderer';
import { ExamAnswerDashboard } from './ExamAnswerDashboard';
import { WordSaveToBankModal } from './WordSaveToBankModal';
import { isolateAnswerBlock, deepScanWithGemini } from '../../utils/answerExtractionEngine';

interface ExamUploaderProps {
  onSaveToQuestionBank?: (questions: Question[]) => void;
  onQuestionsPersistedToBank?: (savedQuestions: Question[], refreshedBank?: Question[]) => void;
  onNavigateToQuestionBank?: () => void;
  subjects?: SubjectItem[];
  existingBankQuestions?: Question[];
  currentUserId?: string;
  onCreateExamFromParsed: (title: string, questions: Question[], grade: ChemGrade) => void;
  onFileParsedRecord?: (record: {
    fileName: string;
    fileType: 'docx' | 'pdf' | 'text';
    examTitle: string;
    totalQuestions: number;
    grade: ChemGrade;
  }) => void;
}

interface SelectedFileInfo {
  name: string;
  size: number;
  type: 'docx' | 'pdf' | 'text';
}

type UploaderViewTab =
  | 'answer_reconciliation'
  | 'part1'
  | 'part2'
  | 'part3'
  | 'all_questions'
  | 'issues';

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function hasMissingAnswer(q: Question): boolean {
  if (q.type === 'part1_single_choice') return !q.correctOptionId;
  if (q.type === 'part2_true_false') return !q.statements || q.statements.length === 0;
  if (q.type === 'part3_short_answer') {
    return !q.shortAnswerConfig || q.shortAnswerConfig.acceptableAnswers.length === 0;
  }
  return false;
}

function yieldToNextFrame(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(() => setTimeout(resolve, 16));
    } else {
      setTimeout(resolve, 16);
    }
  });
}

export const ExamUploader: React.FC<ExamUploaderProps> = ({
  onSaveToQuestionBank,
  onQuestionsPersistedToBank,
  onNavigateToQuestionBank,
  subjects = DEFAULT_GDPT_2018_SUBJECTS,
  existingBankQuestions = [],
  currentUserId,
  onCreateExamFromParsed,
  onFileParsedRecord,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const step1Ref = useRef<HTMLElement>(null);
  const step2Ref = useRef<HTMLElement>(null);
  const step3Ref = useRef<HTMLElement>(null);
  const step4Ref = useRef<HTMLElement>(null);

  const [inputText, setInputText] = useState('');
  const [selectedGrade, setSelectedGrade] = useState<ChemGrade>('12');
  const [selectedFile, setSelectedFile] = useState<SelectedFileInfo | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [analysisStage, setAnalysisStage] = useState<string>('');
  const [analysisProgress, setAnalysisProgress] = useState<number>(0);
  const [parseError, setParseError] = useState<string | null>(null);
  const [parsedResult, setParsedResult] = useState<ParsedExamResult | null>(null);

  // Preview, selection & save-to-bank states
  const [showPreviewPanel, setShowPreviewPanel] = useState(false);
  const [activeViewTab, setActiveViewTab] = useState<UploaderViewTab>('answer_reconciliation');
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [notification, setNotification] = useState<string | null>(null);
  const [showSourceSnippetModal, setShowSourceSnippetModal] = useState(false);
  const [isDeepScanning, setIsDeepScanning] = useState(false);
  const [pendingActionNotice, setPendingActionNotice] = useState<'bank' | 'exam' | null>(null);

  // Per-question selection for saving to Firestore Question Bank
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<Set<string>>(new Set());
  const [savedToBankSourceIds, setSavedToBankSourceIds] = useState<Set<string>>(new Set());
  const [saveModalQuestions, setSaveModalQuestions] = useState<Question[] | null>(null);
  const [unsavedOnlyFilterIds, setUnsavedOnlyFilterIds] = useState<Set<string> | null>(null);

  // Keep selectedQuestionIds synced when parsedResult changes (select all on fresh parse; prune deleted IDs)
  const parsedQuestionSignature = parsedResult?.questions.map((q) => q.id).join('|') || '';
  const prevParsedSignatureRef = useRef<string>('');
  useEffect(() => {
    if (!parsedResult) {
      setSelectedQuestionIds(new Set());
      setSavedToBankSourceIds(new Set());
      setUnsavedOnlyFilterIds(null);
      prevParsedSignatureRef.current = '';
      return;
    }
    const allIds = parsedResult.questions.map((q) => q.id);
    const idSet = new Set(allIds);
    const prevIds = prevParsedSignatureRef.current
      ? prevParsedSignatureRef.current.split('|').filter(Boolean)
      : [];
    const hasOverlap = prevIds.some((id) => idSet.has(id));
    if (!hasOverlap) {
      // Freshly parsed document -> select all valid questions by default
      setSelectedQuestionIds(new Set(allIds));
      setSavedToBankSourceIds(new Set());
      setUnsavedOnlyFilterIds(null);
    } else {
      // Deletion or update within same document -> preserve existing selection
      setSelectedQuestionIds((prev) => new Set(Array.from(prev).filter((id) => idSet.has(id))));
    }
    prevParsedSignatureRef.current = parsedQuestionSignature;
  }, [parsedQuestionSignature, parsedResult]);

  const showToast = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3500);
  };

  const scrollToSection = (ref: React.RefObject<HTMLElement | null>) => {
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const processUploadedFile = async (file: File) => {
    const fileNameLower = file.name.toLowerCase();
    setParseError(null);
    setIsProcessing(true);
    setPendingActionNotice(null);
    setAnalysisProgress(15);
    setAnalysisStage(`Đang đọc tệp "${file.name}" (${formatFileSize(file.size)})...`);

    try {
      await yieldToNextFrame();

      if (fileNameLower.endsWith('.docx')) {
        setSelectedFile({ name: file.name, size: file.size, type: 'docx' });
        setAnalysisProgress(45);
        setAnalysisStage('Đang giải nén cấu trúc Word (.docx) & công thức OMML...');
        await yieldToNextFrame();

        const buffer = await file.arrayBuffer();
        setAnalysisProgress(75);
        setAnalysisStage('Đang phân loại câu hỏi Phần I, II, III và đối chiếu đáp án...');
        await yieldToNextFrame();

        const { text, result } = await parseDocxExam(buffer, selectedGrade);
        setInputText(text);
        setParsedResult(result);
        setActiveViewTab(result.totalQuestions > 0 ? 'answer_reconciliation' : 'all_questions');
        setAnalysisProgress(100);
        setAnalysisStage(`Hoàn tất phân tích ${result.totalQuestions} câu hỏi từ file Word.`);
        onFileParsedRecord?.({
          fileName: file.name,
          fileType: 'docx',
          examTitle: result.title,
          totalQuestions: result.totalQuestions,
          grade: selectedGrade,
        });
        showToast(`Đã đọc file Word và nhận dạng ${result.totalQuestions} câu hỏi!`);
      } else if (fileNameLower.endsWith('.pdf')) {
        setSelectedFile({ name: file.name, size: file.size, type: 'pdf' });
        setAnalysisProgress(45);
        setAnalysisStage('Đang trích xuất lớp văn bản từ từng trang PDF...');
        await yieldToNextFrame();

        const buffer = await file.arrayBuffer();
        setAnalysisProgress(75);
        setAnalysisStage('Đang bóc tách câu hỏi trắc nghiệm & bảng đáp án PDF...');
        await yieldToNextFrame();

        const { text, pdfMeta, result } = await parsePdfExam(buffer, selectedGrade);
        setInputText(text);
        setParsedResult(result);
        setActiveViewTab(result.totalQuestions > 0 ? 'answer_reconciliation' : 'all_questions');
        setAnalysisProgress(100);

        if (pdfMeta.isLikelyScanned || text.trim().length < 30) {
          setShowPreviewPanel(true);
          setAnalysisStage('PDF thiếu lớp văn bản (PDF dạng ảnh/scan).');
          setParseError(
            pdfMeta.warning ||
              'PDF có ít hoặc không có lớp văn bản (PDF scan/ảnh). Hệ thống không tự thay thế dữ liệu mẫu; vui lòng kiểm tra bản xem trước hoặc dán nội dung text chuẩn.'
          );
        } else {
          setAnalysisStage(`Hoàn tất bóc tách ${pdfMeta.pageCount} trang PDF (${result.totalQuestions} câu hỏi).`);
          onFileParsedRecord?.({
            fileName: file.name,
            fileType: 'pdf',
            examTitle: result.title,
            totalQuestions: result.totalQuestions,
            grade: selectedGrade,
          });
          showToast(`Đã bóc tách PDF (${pdfMeta.pageCount} trang) — ${result.totalQuestions} câu hỏi!`);
        }
      } else if (
        fileNameLower.endsWith('.txt') ||
        fileNameLower.endsWith('.md') ||
        fileNameLower.endsWith('.csv')
      ) {
        setSelectedFile({ name: file.name, size: file.size, type: 'text' });
        setAnalysisProgress(50);
        setAnalysisStage('Đang đọc văn bản & nhận dạng cấu trúc câu hỏi...');
        await yieldToNextFrame();

        const text = await file.text();
        setInputText(text);
        const result = parseExamContent(text, selectedGrade);
        setParsedResult(result);
        setActiveViewTab('answer_reconciliation');
        setAnalysisProgress(100);
        setAnalysisStage(`Hoàn tất phân tích ${result.totalQuestions} câu hỏi.`);
        onFileParsedRecord?.({
          fileName: file.name,
          fileType: 'text',
          examTitle: result.title,
          totalQuestions: result.totalQuestions,
          grade: selectedGrade,
        });
        showToast(`Đã phân tích văn bản đề thi (${result.totalQuestions} câu hỏi)!`);
      } else {
        setAnalysisProgress(0);
        setAnalysisStage('');
        setParseError(
          'Định dạng tệp chưa được hỗ trợ trực tiếp. Vui lòng chọn file .docx, .pdf, .txt, .md hoặc .csv (nếu là .doc cũ hãy lưu lại thành .docx).'
        );
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Lỗi không xác định khi đọc file đề thi.';
      setAnalysisProgress(0);
      setAnalysisStage('Phân tích thất bại.');
      setParseError(msg);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await processUploadedFile(file);
    e.target.value = '';
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      await processUploadedFile(file);
    }
  };

  const handleClearFile = () => {
    setSelectedFile(null);
    setInputText('');
    setParsedResult(null);
    setParseError(null);
    setAnalysisProgress(0);
    setAnalysisStage('');
    setPendingActionNotice(null);
    setShowPreviewPanel(false);
  };

  const handleParseRawText = async () => {
    if (!inputText.trim()) {
      setParseError('Vui lòng tải file đề thi (.docx, .pdf, .txt) hoặc dán nội dung đề thi vào khung xem trước.');
      setShowPreviewPanel(true);
      return;
    }
    setParseError(null);
    setIsProcessing(true);
    setAnalysisProgress(45);
    setAnalysisStage('Đang phân tích lại cấu trúc câu hỏi & bảng đáp án...');
    try {
      await yieldToNextFrame();
      const result = parseExamContent(inputText, selectedGrade, {
        selectedAnswerCandidateId: parsedResult?.selectedAnswerCandidateId,
        pdfMeta: parsedResult?.pdfMeta,
        extractedTables: parsedResult?.extractedTables,
      });
      setParsedResult(result);
      setAnalysisProgress(100);
      setAnalysisStage(`Hoàn tất bóc tách ${result.totalQuestions} câu hỏi.`);
      showToast(`Đã bóc tách thành công ${result.totalQuestions} câu hỏi!`);
    } finally {
      setIsProcessing(false);
    }
  };

  const loadSample = async (sampleId: string) => {
    const sample = SAMPLE_CHEMISTRY_EXAMS.find((s) => s.id === sampleId) || SAMPLE_CHEMISTRY_EXAMS[0];
    if (!sample) return;
    setParseError(null);
    setIsProcessing(true);
    setAnalysisProgress(50);
    setAnalysisStage(`Đang nạp đề mẫu "${sample.name}"...`);
    await yieldToNextFrame();

    setSelectedFile({
      name: `${sample.name}.txt`,
      size: new Blob([sample.content]).size,
      type: 'text',
    });
    setInputText(sample.content);
    setSelectedGrade(sample.grade);
    const result = parseExamContent(sample.content, sample.grade);
    setParsedResult(result);
    setActiveViewTab('answer_reconciliation');
    setAnalysisProgress(100);
    setAnalysisStage(`Đã phân tích ${result.totalQuestions} câu hỏi từ đề mẫu.`);
    setIsProcessing(false);
    showToast(`Đã nạp đề mẫu: ${sample.name}`);
  };

  const loadAssetFileDirectly = async (url: string, name: string, type: 'docx' | 'pdf') => {
    setIsProcessing(true);
    setParseError(null);
    setAnalysisProgress(35);
    setAnalysisStage(`Đang tải và đọc tệp mẫu "${name}"...`);
    try {
      await yieldToNextFrame();
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`Không tìm thấy tệp mẫu tại ${url}`);
      }
      const buffer = await res.arrayBuffer();
      setSelectedFile({ name, size: buffer.byteLength, type });
      setAnalysisProgress(70);
      setAnalysisStage(`Đang phân tích cấu trúc ${type.toUpperCase()}...`);
      await yieldToNextFrame();

      if (type === 'docx') {
        const { text, result } = await parseDocxExam(buffer, '12');
        setInputText(text);
        setParsedResult(result);
        setActiveViewTab('answer_reconciliation');
        setAnalysisProgress(100);
        setAnalysisStage(`Hoàn tất bóc tách ${result.totalQuestions} câu hỏi từ ${name}.`);
        showToast(`Đã bóc tách file Word mẫu ${name} (${result.totalQuestions} câu)!`);
      } else {
        const { text, pdfMeta, result } = await parsePdfExam(buffer, '12');
        setInputText(text);
        setParsedResult(result);
        setActiveViewTab('answer_reconciliation');
        setAnalysisProgress(100);
        if (pdfMeta.isLikelyScanned) {
          setAnalysisStage('PDF mẫu là dạng ảnh scan.');
          setParseError(pdfMeta.warning || 'PDF dạng ảnh scan.');
        } else {
          setAnalysisStage(`Hoàn tất bóc tách ${result.totalQuestions} câu hỏi từ ${name}.`);
          showToast(`Đã bóc tách file PDF mẫu ${name} (${result.totalQuestions} câu)!`);
        }
      }
    } catch (err: unknown) {
      setAnalysisProgress(0);
      setAnalysisStage('Không thể đọc tệp mẫu.');
      setParseError(err instanceof Error ? err.message : `Không thể đọc tệp ${name}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSelectAnswerCandidate = (candidateId: string) => {
    if (!parsedResult || !inputText.trim()) return;
    const result = parseExamContent(inputText, selectedGrade, {
      selectedAnswerCandidateId: candidateId,
      pdfMeta: parsedResult.pdfMeta,
      extractedTables: parsedResult.extractedTables,
    });
    setParsedResult({
      ...result,
      selectedAnswerCandidateId: candidateId,
      answerMappingConfirmed: true,
    });
    setPendingActionNotice(null);
    showToast('Đã áp dụng bảng đáp án đã chọn cho đề thi!');
  };

  const handleConfirmAnswerMapping = () => {
    if (!parsedResult) return;
    setParsedResult({
      ...parsedResult,
      answerMappingConfirmed: true,
    });
    setPendingActionNotice(null);
    showToast('Đã xác nhận bảng đáp án sử dụng cho đề thi!');
  };

  const handleDeepScan = async () => {
    if (!inputText.trim() || !parsedResult) {
      setParseError('Không có nội dung đề thi để quét sâu.');
      return;
    }
    setIsDeepScanning(true);
    try {
      const { answerSectionText } = isolateAnswerBlock(inputText);
      const aiRes = await deepScanWithGemini(answerSectionText);

      let newlyFound = 0;
      const updated = parsedResult.answerItems.map((item) => {
        if (!item.correctAnswer) {
          if (item.section === 'part1') {
            const p1 = aiRes.aiPart1.find((i) => i.questionNumber === item.questionNumber);
            if (p1) {
              newlyFound++;
              return {
                ...item,
                correctAnswer: p1.correctAnswer,
                recognitionStatus: 'verified' as RecognitionStatus,
                recognitionSource: 'gemini_ai' as const,
              };
            }
          } else if (item.section === 'part2') {
            const p2 = aiRes.aiPart2.find(
              (i) => i.questionNumber === item.questionNumber && i.subQuestion === item.subQuestion
            );
            if (p2) {
              newlyFound++;
              return {
                ...item,
                correctAnswer: p2.correctAnswer,
                recognitionStatus: 'verified' as RecognitionStatus,
                recognitionSource: 'gemini_ai' as const,
              };
            }
          } else if (item.section === 'part3') {
            const p3 = aiRes.aiPart3.find((i) => i.questionNumber === item.questionNumber);
            if (p3) {
              newlyFound++;
              return {
                ...item,
                correctAnswer: p3.correctAnswer,
                recognitionStatus: 'verified' as RecognitionStatus,
                recognitionSource: 'gemini_ai' as const,
              };
            }
          }
        }
        return item;
      });

      setParsedResult({
        ...parsedResult,
        answerItems: updated,
      });
      showToast(
        newlyFound > 0
          ? `AI đã tìm bổ sung thêm ${newlyFound} đáp án!`
          : 'Bộ máy thuật toán đã nhận diện đầy đủ đáp án hiện có!'
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      showToast('Quét sâu hoàn tất' + (msg ? `: ${msg}` : '.'));
    } finally {
      setIsDeepScanning(false);
    }
  };

  // Question editing actions
  const handleDeleteQuestion = (qId: string) => {
    if (!parsedResult) return;
    const updated = parsedResult.questions.filter((q) => q.id !== qId);
    setParsedResult(recalculateParsedExamResult(parsedResult, updated));
  };

  const handleUpdateQuestion = (updated: Question) => {
    if (!parsedResult) return;
    const list = parsedResult.questions.map((q) => (q.id === updated.id ? updated : q));
    setParsedResult(recalculateParsedExamResult(parsedResult, list));
    setEditingQuestion(null);
    showToast('Đã cập nhật câu hỏi!');
  };

  const handleChangeSectionType = (sectionId: string, newType: QuestionType) => {
    if (!parsedResult) return;
    const updatedQuestions = parsedResult.questions.map((q) =>
      q.sectionId === sectionId && q.type !== newType ? reclassifyQuestionType(q, newType) : q
    );
    const updatedSections = (parsedResult.detectedSections || []).map((sec) =>
      sec.id === sectionId
        ? {
            ...sec,
            detectedType: newType,
            teacherConfirmed: true,
            needsConfirmation: false,
            warning: undefined,
          }
        : sec
    );
    setParsedResult(recalculateParsedExamResult(parsedResult, updatedQuestions, updatedSections));
    setPendingActionNotice(null);
    showToast('Đã cập nhật loại câu hỏi cho phần vừa chọn!');
  };

  const handleConfirmAllSections = () => {
    if (!parsedResult) return;
    const updatedSections = (parsedResult.detectedSections || []).map((sec) => ({
      ...sec,
      teacherConfirmed: true,
      needsConfirmation: false,
    }));
    setParsedResult(
      recalculateParsedExamResult(parsedResult, parsedResult.questions, updatedSections, true)
    );
    setPendingActionNotice(null);
    showToast('Đã xác nhận cấu trúc các phần của đề thi!');
  };

  const handleMoveQuestionType = (qId: string, newType: QuestionType) => {
    if (!parsedResult) return;
    const targetQ = parsedResult.questions.find((q) => q.id === qId);
    if (!targetQ || targetQ.type === newType) return;
    const reclassified = reclassifyQuestionType(targetQ, newType);
    const updatedQuestions = parsedResult.questions.map((q) => (q.id === qId ? reclassified : q));
    setParsedResult(recalculateParsedExamResult(parsedResult, updatedQuestions));
    const label =
      newType === 'part1_single_choice'
        ? 'Phần I (4 lựa chọn)'
        : newType === 'part2_true_false'
        ? 'Phần II (Đúng/Sai)'
        : 'Phần III (Trả lời ngắn)';
    showToast(`Đã chuyển câu hỏi sang ${label}`);
  };

  const getBlockingErrors = (): string | null => {
    if (!parsedResult) return 'Chưa có dữ liệu đề thi được phân tích.';
    if (parsedResult.totalQuestions === 0) {
      return 'Chưa nhận diện được câu hỏi nào trong tài liệu. Vui lòng kiểm tra lại định dạng hoặc khung Xem trước.';
    }
    const structuralErrors = parsedResult.questions.filter((q) => q.parseStatus === 'error');
    if (structuralErrors.length > 0) {
      return `Còn ${structuralErrors.length} câu hỏi bị "Lỗi cấu trúc". Vui lòng mở tab "Cần kiểm tra / Lỗi" để sửa hoặc xóa trước khi lưu.`;
    }
    if (parsedResult.hasAmbiguousSections && !parsedResult.sectionsConfirmed) {
      return 'Vui lòng kiểm tra và bấm "Xác nhận cấu trúc các phần" trước khi lưu đề thi.';
    }
    if (parsedResult.hasAmbiguousAnswerMapping && !parsedResult.answerMappingConfirmed) {
      return 'Phát hiện nhiều bảng đáp án / mã đề khác nhau. Vui lòng chọn và xác nhận bảng đáp án đang dùng trước khi lưu.';
    }
    return null;
  };

  const toggleSelectQuestion = (qId: string) => {
    setSelectedQuestionIds((prev) => {
      const next = new Set(prev);
      if (next.has(qId)) next.delete(qId);
      else next.add(qId);
      return next;
    });
  };

  const handleSelectAllQuestions = () => {
    if (!parsedResult) return;
    setSelectedQuestionIds(new Set(parsedResult.questions.map((q) => q.id)));
  };

  const handleDeselectAllQuestions = () => {
    setSelectedQuestionIds(new Set());
  };

  const handleSelectOnlyUnsavedQuestions = () => {
    if (!parsedResult) return;
    const remaining = parsedResult.questions
      .filter((q) => !savedToBankSourceIds.has(q.id))
      .map((q) => q.id);
    setSelectedQuestionIds(new Set(remaining));
    showToast(`Đã chọn ${remaining.length} câu chưa lưu vào ngân hàng.`);
  };

  const openSaveBankModalForQuestions = (targetQuestions: Question[]) => {
    if (!parsedResult || parsedResult.totalQuestions === 0) {
      showToast('Chưa có câu hỏi nào được bóc tách để lưu.');
      return;
    }
    if (targetQuestions.length === 0) {
      showToast('Vui lòng chọn ít nhất 1 câu hỏi trước khi lưu vào ngân hàng.');
      return;
    }
    const hardErrors = targetQuestions.filter(
      (q) => q.parseStatus === 'error' || !q.content?.trim()
    );
    if (hardErrors.length > 0) {
      setPendingActionNotice('bank');
      setActiveViewTab('issues');
      showToast(
        `Có ${hardErrors.length} câu trong danh sách đang chọn bị lỗi cấu trúc hoặc trống nội dung. Vui lòng chỉnh sửa hoặc bỏ chọn trước khi lưu.`
      );
      return;
    }
    setPendingActionNotice(null);
    setSaveModalQuestions(targetQuestions);
  };

  const handleGuardedSaveBank = () => {
    if (!parsedResult) return;
    const chosen = parsedResult.questions.filter((q) => selectedQuestionIds.has(q.id));
    openSaveBankModalForQuestions(chosen.length > 0 ? chosen : parsedResult.questions);
  };

  const handleSaveSelectedToBank = () => {
    if (!parsedResult) return;
    const chosen = parsedResult.questions.filter((q) => selectedQuestionIds.has(q.id));
    openSaveBankModalForQuestions(chosen);
  };

  const handleSaveAllToBank = () => {
    if (!parsedResult) return;
    openSaveBankModalForQuestions(parsedResult.questions);
  };

  const handleGuardedCreateExam = () => {
    if (!parsedResult) return;
    const blockReason = getBlockingErrors();
    if (blockReason) {
      setPendingActionNotice('exam');
      if (parsedResult.questions.some((q) => q.parseStatus === 'error')) {
        setActiveViewTab('issues');
      }
      showToast(blockReason);
      return;
    }
    const secTitleMap = new Map<string, string>();
    for (const sec of parsedResult.detectedSections || []) {
      if (sec.id && sec.rawTitle) secTitleMap.set(sec.id, sec.rawTitle);
    }
    const enrichedQuestions = parsedResult.questions.map((q) =>
      q.sectionId && !q.sectionTitle && secTitleMap.has(q.sectionId)
        ? { ...q, sectionTitle: secTitleMap.get(q.sectionId) }
        : q
    );
    onCreateExamFromParsed(parsedResult.title, enrichedQuestions, selectedGrade);
  };

  // Dedicated Answer Item Handlers
  const handleUpdateAnswerItem = (itemId: string, newAns: string) => {
    if (!parsedResult) return;
    const cleanAns = newAns.trim();
    if (!cleanAns) return;

    const updatedItems = parsedResult.answerItems.map((item) => {
      if (item.id === itemId) {
        const compactLen = cleanAns.replace(/\s+/g, '').length;
        const lengthIssue =
          item.section === 'part3' && compactLen > 4
            ? [`Đáp án Phần III "${cleanAns}" vượt quá 4 ký tự theo quy chuẩn thi THPT (${compactLen} ký tự).`]
            : undefined;
        return {
          ...item,
          correctAnswer: cleanAns,
          recognitionStatus: (lengthIssue ? 'needs_review' : 'verified') as RecognitionStatus,
          recognitionSource: 'manual' as const,
          teacherVerified: true,
          validationIssues: lengthIssue,
          acceptedAnswers:
            item.answerType === 'short_answer'
              ? Array.from(new Set([cleanAns, cleanAns.replace(',', '.'), cleanAns.replace('.', ',')]))
              : undefined,
        };
      }
      return item;
    });

    const targetItem = updatedItems.find((it) => it.id === itemId);
    const updatedQuestions = parsedResult.questions.map((origQ) => {
      if (!targetItem || origQ.id !== targetItem.questionId) return origQ;
      const q = { ...origQ };
      if (targetItem.section === 'part1') {
        q.correctOptionId = cleanAns.toUpperCase();
        q.teacherVerified = true;
        q.parseStatus = q.options && q.options.length >= 2 ? 'verified' : 'error';
        if (q.options) {
          q.options = q.options.map((o) => ({ ...o, isCorrect: o.id === cleanAns.toUpperCase() }));
        }
      } else if (targetItem.section === 'part2' && targetItem.subQuestion) {
        const isTrue = cleanAns === 'Đúng' || cleanAns.toUpperCase() === 'Đ';
        if (q.statements) {
          q.statements = q.statements.map((st) =>
            st.id === targetItem.subQuestion ? { ...st, correctAnswer: isTrue } : st
          );
        }
        q.teacherVerified = true;
        q.parseStatus = q.statements && q.statements.length >= 2 ? 'verified' : 'error';
      } else if (targetItem.section === 'part3') {
        const isNum = !isNaN(Number(cleanAns.replace(',', '.')));
        const compactLen = cleanAns.replace(/\s+/g, '').length;
        q.shortAnswerConfig = {
          acceptableAnswers: Array.from(
            new Set([cleanAns, cleanAns.replace(',', '.'), cleanAns.replace('.', ',')])
          ),
          isNumeric: isNum,
          numericValue: isNum ? parseFloat(cleanAns.replace(',', '.')) : undefined,
          tolerance: isNum ? 0.05 : undefined,
        };
        q.teacherVerified = true;
        if (compactLen > 4) {
          q.parseStatus = 'needs_review';
          q.parseWarning = `Đáp án Phần III (${cleanAns}) dài ${compactLen} ký tự, vượt quá giới hạn tối đa 4 ký tự.`;
        } else {
          q.parseStatus = 'verified';
          q.parseWarning = undefined;
        }
      }
      return q;
    });

    const part1Items = updatedItems.filter((it) => it.section === 'part1');
    const part2Items = updatedItems.filter((it) => it.section === 'part2');
    const part3Items = updatedItems.filter((it) => it.section === 'part3');

    const part1FoundCount = part1Items.filter((it) => it.recognitionStatus === 'verified' && it.correctAnswer).length;
    const part2StatementsFoundCount = part2Items.filter(
      (it) => it.recognitionStatus === 'verified' && it.correctAnswer
    ).length;
    const part3FoundCount = part3Items.filter((it) => it.recognitionStatus === 'verified' && it.correctAnswer).length;

    const allVerified = updatedItems.every((it) => it.recognitionStatus === 'verified');
    const part3LengthWarningsCount = updatedItems.filter(
      (it) => it.section === 'part3' && it.correctAnswer && it.correctAnswer.replace(/\s+/g, '').length > 4
    ).length;

    setParsedResult({
      ...parsedResult,
      questions: updatedQuestions,
      answerItems: updatedItems,
      part1FoundCount,
      part2StatementsFoundCount,
      part3FoundCount,
      allAnswersVerified: allVerified,
      part3LengthWarningsCount,
      questionsWithWarnings: updatedQuestions.filter((q) => q.parseStatus !== 'verified').length,
      questionsWithAnswers: updatedQuestions.filter((q) => !hasMissingAnswer(q)).length,
    });

    showToast(`Đã cập nhật đáp án mục ${itemId}: ${cleanAns}`);
  };

  const handleToggleVerifyItem = (itemId: string) => {
    if (!parsedResult) return;
    const updatedItems = parsedResult.answerItems.map((item) => {
      if (item.id === itemId) {
        return {
          ...item,
          teacherVerified: !item.teacherVerified,
          recognitionStatus: (!item.teacherVerified
            ? item.correctAnswer
              ? 'verified'
              : 'not_found'
            : item.correctAnswer
            ? 'verified'
            : 'not_found') as RecognitionStatus,
        };
      }
      return item;
    });

    setParsedResult({
      ...parsedResult,
      answerItems: updatedItems,
      allAnswersVerified: updatedItems.every((it) => it.teacherVerified),
    });
  };

  const handleVerifyAllAnswers = () => {
    if (!parsedResult) return;
    const updatedItems = parsedResult.answerItems.map((item) => ({
      ...item,
      teacherVerified: true,
      recognitionStatus: (item.correctAnswer ? 'verified' : 'not_found') as RecognitionStatus,
    }));

    const updatedQuestions = parsedResult.questions.map((q) => ({
      ...q,
      teacherVerified: true,
      parseStatus: q.parseStatus === 'error' ? ('error' as const) : ('verified' as const),
    }));

    setParsedResult({
      ...parsedResult,
      answerItems: updatedItems,
      questions: updatedQuestions,
      allAnswersVerified: true,
      questionsWithWarnings: updatedQuestions.filter((q) => q.parseStatus !== 'verified').length,
    });
    showToast('Đã xác nhận toàn bộ đáp án hiện có!');
  };

  const handleReRecognize = async () => {
    if (!inputText.trim()) {
      setParseError('Không có nội dung đề thi để nhận dạng lại.');
      return;
    }
    setIsProcessing(true);
    setAnalysisProgress(45);
    setAnalysisStage('Đang quét lại toàn bộ đáp án và câu hỏi...');
    try {
      await yieldToNextFrame();
      const result = parseExamContent(inputText, selectedGrade, {
        selectedAnswerCandidateId: parsedResult?.selectedAnswerCandidateId,
        pdfMeta: parsedResult?.pdfMeta,
        extractedTables: parsedResult?.extractedTables,
      });
      setParsedResult(result);
      setAnalysisProgress(100);
      setAnalysisStage(`Đã quét lại ${result.answerItems?.length || result.totalQuestions} mục đáp án.`);
      showToast(`Đã quét lại: ${result.answerItems?.length || result.totalQuestions} mục đáp án!`);
    } finally {
      setIsProcessing(false);
    }
  };

  // Derived metrics & Step statuses
  const totalAnswerItems = parsedResult?.answerItems?.length || 0;
  const verifiedAnswerItems =
    parsedResult?.answerItems?.filter((it) => it.recognitionStatus === 'verified' && it.correctAnswer).length || 0;
  const recognitionRate = totalAnswerItems > 0 ? Math.round((verifiedAnswerItems / totalAnswerItems) * 100) : 0;

  const issueQuestions =
    parsedResult?.questions.filter((q) => q.parseStatus !== 'verified' || hasMissingAnswer(q)) || [];
  const structuralErrorCount =
    parsedResult?.questions.filter((q) => q.parseStatus === 'error').length || 0;

  const displayedQuestions =
    parsedResult?.questions.filter((q) => {
      if (unsavedOnlyFilterIds && !unsavedOnlyFilterIds.has(q.id)) return false;
      if (activeViewTab === 'part1') return q.type === 'part1_single_choice';
      if (activeViewTab === 'part2') return q.type === 'part2_true_false';
      if (activeViewTab === 'part3') return q.type === 'part3_short_answer';
      if (activeViewTab === 'issues') return q.parseStatus !== 'verified' || hasMissingAnswer(q);
      return true;
    }) || [];

  const selectedCount = parsedResult
    ? parsedResult.questions.filter((q) => selectedQuestionIds.has(q.id)).length
    : 0;

  const getQuestionStatusBadge = (q: Question) => {
    if (q.parseStatus === 'error') {
      return {
        label: 'Lỗi cấu trúc',
        className: 'bg-rose-50 text-rose-800 border-rose-200',
        icon: XCircle,
      };
    }
    if (hasMissingAnswer(q)) {
      return {
        label: 'Thiếu đáp án',
        className: 'bg-amber-50 text-amber-800 border-amber-200',
        icon: AlertTriangle,
      };
    }
    if (q.parseStatus === 'needs_review') {
      return {
        label: 'Cần kiểm tra',
        className: 'bg-amber-50 text-amber-800 border-amber-200',
        icon: AlertTriangle,
      };
    }
    return {
      label: 'Đã nhận diện',
      className: 'bg-emerald-50 text-emerald-800 border-emerald-200',
      icon: CheckCircle2,
    };
  };

  const step1Done = Boolean(selectedFile || inputText.trim().length > 0);
  const step2Done = Boolean(parsedResult && !isProcessing && !parseError);
  const step3Ready = Boolean(parsedResult && parsedResult.totalQuestions > 0);
  const step4Ready = Boolean(parsedResult && !getBlockingErrors());

  const currentStep = !step1Done
    ? 1
    : isProcessing || parseError || !parsedResult
    ? 2
    : !step4Ready
    ? 3
    : 4;

  const stepsMeta = [
    {
      num: 1,
      title: 'Bước 1: Tải file đề thi',
      desc: selectedFile ? selectedFile.name : 'DOCX, PDF hoặc văn bản',
      done: step1Done,
      targetRef: step1Ref,
    },
    {
      num: 2,
      title: 'Bước 2: Phân tích & bóc tách',
      desc: isProcessing
        ? 'Đang xử lý...'
        : parseError
        ? 'Cần kiểm tra lỗi'
        : parsedResult
        ? `Đã tách ${parsedResult.totalQuestions} câu`
        : 'Chờ dữ liệu đầu vào',
      done: step2Done,
      targetRef: step2Ref,
    },
    {
      num: 3,
      title: 'Bước 3: Kiểm tra nội dung',
      desc: parsedResult ? '3 dạng câu hỏi & đáp án' : 'Rà soát câu hỏi',
      done: step3Ready && structuralErrorCount === 0,
      targetRef: step3Ref,
    },
    {
      num: 4,
      title: 'Bước 4: Hoàn tất & Lưu',
      desc: step4Ready ? 'Sẵn sàng lưu đề' : 'Xác nhận lưu đề thi',
      done: step4Ready,
      targetRef: step4Ref,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {notification && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white px-4 py-3 rounded-xl shadow-xl flex items-center gap-2.5 text-sm font-semibold max-w-md">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{notification}</span>
        </div>
      )}

      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.docx,.txt,.doc,.md,.csv"
        onChange={handleFileInputChange}
        className="hidden"
      />

      {/* Page Intro & 4-Step Workflow Stepper */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <p className="text-sm font-semibold text-teal-700 flex items-center gap-2">
              <FlaskConical className="w-4 h-4 shrink-0" />
              <span>Quy trình bóc tách đề thi tự động · Chuẩn GDPT 2018</span>
            </p>
            <h1 className="text-[26px] sm:text-[30px] font-bold text-slate-900 tracking-tight">
              Bóc tách đề thi từ Word / PDF
            </h1>
            <p className="text-[15px] sm:text-base text-slate-600 max-w-3xl">
              Hỗ trợ file Word (.docx kèm OMML Equation), file PDF có lớp văn bản, bảng đáp án ngang/dọc, ma trận Đúng/Sai và đáp án Trả lời ngắn.
            </p>
          </div>

          <div className="w-full sm:w-56 shrink-0">
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">
              Khối lớp áp dụng
            </label>
            <select
              value={selectedGrade}
              onChange={(e) => setSelectedGrade(e.target.value as ChemGrade)}
              className="w-full min-h-[44px] text-[15px] font-semibold px-3.5 py-2 rounded-xl border border-slate-300 bg-slate-50 text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-600"
            >
              <option value="12">Lớp 12 THPT</option>
              <option value="11">Lớp 11 THPT</option>
              <option value="10">Lớp 10 THPT</option>
              <option value="chuyen_hsg">Chuyên &amp; HSG</option>
            </select>
          </div>
        </div>

        {/* 4-Step Stepper Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 pt-2">
          {stepsMeta.map((step) => {
            const isCurrent = currentStep === step.num;
            return (
              <button
                key={step.num}
                type="button"
                onClick={() => scrollToSection(step.targetRef)}
                className={`text-left p-3.5 rounded-xl border transition-colors flex items-center gap-3 min-w-0 ${
                  isCurrent
                    ? 'bg-teal-50/70 border-teal-500'
                    : step.done
                    ? 'bg-emerald-50/50 border-emerald-200 hover:border-emerald-300'
                    : 'bg-slate-50 border-slate-200 hover:border-slate-300'
                }`}
              >
                <div
                  className={`w-9 h-9 rounded-lg flex items-center justify-center font-bold text-sm shrink-0 tabular-nums ${
                    step.done && !isCurrent
                      ? 'bg-emerald-600 text-white'
                      : isCurrent
                      ? 'bg-teal-600 text-white'
                      : 'bg-slate-200 text-slate-700'
                  }`}
                >
                  {step.done && !isCurrent ? <Check className="w-4 h-4" /> : step.num}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-900 truncate">{step.title}</p>
                  <p className="text-[13px] text-slate-600 truncate">{step.desc}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ===================================================================== */}
      {/* BƯỚC 1: TẢI FILE ĐỀ THI                                               */}
      {/* ===================================================================== */}
      <section
        ref={step1Ref}
        className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-5"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-slate-900">
              Bước 1: Tải file đề thi
            </h2>
            <p className="text-[15px] text-slate-600 mt-0.5">
              Định dạng hỗ trợ: <strong className="text-slate-800">.docx</strong> (Word chuẩn), <strong className="text-slate-800">.pdf</strong> (có lớp văn bản), <strong className="text-slate-800">.txt / .md / .csv</strong>.
            </p>
          </div>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isProcessing}
            className="min-h-[44px] px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white text-[15px] font-semibold shadow-xs transition-colors flex items-center gap-2 shrink-0 whitespace-nowrap"
          >
            <FileUp className="w-4 h-4 shrink-0" />
            <span>Chọn file từ máy tính</span>
          </button>
        </div>

        {/* Drag & Drop Zone */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              fileInputRef.current?.click();
            }
          }}
          className={`cursor-pointer rounded-2xl border-2 border-dashed p-6 sm:p-8 text-center transition-colors ${
            isDragging
              ? 'border-teal-600 bg-teal-50'
              : 'border-slate-300 hover:border-teal-500 bg-slate-50/70 hover:bg-teal-50/30'
          }`}
        >
          <div className="w-12 h-12 rounded-2xl bg-teal-100 text-teal-700 flex items-center justify-center mx-auto mb-3">
            {isProcessing ? (
              <RefreshCw className="w-6 h-6 animate-spin" />
            ) : (
              <UploadCloud className="w-6 h-6" />
            )}
          </div>
          <p className="text-base sm:text-lg font-bold text-slate-900">
            {isProcessing
              ? 'Đang tiếp nhận và phân tích tài liệu...'
              : 'Kéo thả file đề thi (.docx, .pdf, .txt) vào đây hoặc bấm để chọn tệp'}
          </p>
          <p className="text-sm text-slate-600 mt-1">
            Giữ nguyên công thức hóa học, chỉ số trên/dưới, mũi tên phản ứng và phương trình OMML.
          </p>
        </div>

        {/* Selected File Metadata & Status */}
        {selectedFile && (
          <div className="p-4 rounded-xl bg-teal-50/70 border border-teal-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-11 h-11 rounded-xl bg-white border border-teal-200 text-teal-700 flex items-center justify-center shrink-0">
                <FileText className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <p className="text-[15px] font-bold text-slate-900 truncate">{selectedFile.name}</p>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-slate-700 mt-0.5 tabular-nums">
                  <span className="font-bold text-teal-800 uppercase">{selectedFile.type}</span>
                  <span aria-hidden="true">·</span>
                  <span>Dung lượng: {formatFileSize(selectedFile.size)}</span>
                  <span aria-hidden="true">·</span>
                  <span>
                    Trạng thái:{' '}
                    <strong className={parseError ? 'text-rose-700' : isProcessing ? 'text-amber-700' : 'text-emerald-700'}>
                      {isProcessing ? 'Đang tải & phân tích' : parseError ? 'Có cảnh báo đọc tệp' : 'Đã tải lên thành công'}
                    </strong>
                  </span>
                  {parsedResult?.pdfMeta && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>
                        {parsedResult.pdfMeta.pagesWithText}/{parsedResult.pdfMeta.pageCount} trang có chữ
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={handleClearFile}
              className="px-4 min-h-[42px] rounded-xl bg-white hover:bg-rose-50 text-slate-700 hover:text-rose-700 border border-slate-200 hover:border-rose-200 text-sm font-semibold flex items-center gap-1.5 shrink-0 transition-colors whitespace-nowrap"
            >
              <Trash2 className="w-4 h-4 shrink-0" />
              <span>Xóa / Chọn lại</span>
            </button>
          </div>
        )}

        {/* Collapsible Optional Sample Loaders */}
        <details className="border-t border-slate-100 pt-3">
          <summary className="cursor-pointer select-none text-sm font-semibold text-slate-600 hover:text-teal-700 flex items-center gap-2">
            <ChevronDown className="w-4 h-4 shrink-0" />
            <span>Nạp đề mẫu kiểm thử nhanh (tùy chọn)</span>
          </summary>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void loadSample('sample_docx_horizontal')}
              className="px-3.5 min-h-[40px] rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-[13px] font-semibold border border-slate-200"
            >
              Mẫu 1: Đề chuẩn bảng ngang (34 mục)
            </button>
            <button
              type="button"
              onClick={() => void loadSample('sample_mandatory_test')}
              className="px-3.5 min-h-[40px] rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-[13px] font-semibold border border-slate-200"
            >
              Mẫu 2: Ma trận Đúng/Sai &amp; Thập phân
            </button>
            <button
              type="button"
              onClick={() => void loadSample('sample_attached_exam_de5')}
              className="px-3.5 min-h-[40px] rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-[13px] font-semibold border border-slate-200"
            >
              Mẫu 3: Đề số 5 (21 câu, 27 mục)
            </button>
            <button
              type="button"
              onClick={() =>
                void loadAssetFileDirectly(
                  '/assets/test_chem_3parts.docx',
                  'test_chem_3parts.docx',
                  'docx'
                )
              }
              className="px-3.5 min-h-[40px] rounded-xl bg-teal-50 hover:bg-teal-100 text-teal-800 text-[13px] font-semibold border border-teal-200"
            >
              File DOCX 3 Phần mẫu
            </button>
            <button
              type="button"
              onClick={() =>
                void loadAssetFileDirectly(
                  '/assets/test_chem_equations.docx',
                  'test_chem_equations.docx',
                  'docx'
                )
              }
              className="px-3.5 min-h-[40px] rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-800 text-[13px] font-semibold border border-indigo-200"
            >
              File DOCX OMML Equations mẫu
            </button>
            <button
              type="button"
              onClick={() =>
                void loadAssetFileDirectly(
                  '/assets/aistudio/nhan_dien_dap_an_016105c6.pdf',
                  'nhan_dien_dap_an.pdf',
                  'pdf'
                )
              }
              className="px-3.5 min-h-[40px] rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-[13px] font-semibold border border-emerald-200"
            >
              File PDF mẫu
            </button>
          </div>
        </details>
      </section>

      {/* ===================================================================== */}
      {/* BƯỚC 2: PHÂN TÍCH VÀ BÓC TÁCH                                         */}
      {/* ===================================================================== */}
      <section
        ref={step2Ref}
        className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4"
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <Cpu className="w-5 h-5 text-indigo-600 shrink-0" />
              <span>Bước 2: Phân tích và bóc tách</span>
            </h2>
            <p className="text-[15px] text-slate-600 mt-0.5">
              Theo dõi tiến trình tách câu hỏi, bảng đáp án và chỉnh sửa văn bản trích xuất nếu cần.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => setShowPreviewPanel((prev) => !prev)}
              className={`min-h-[44px] px-4 py-2 rounded-xl border text-[15px] font-semibold transition-colors flex items-center gap-2 whitespace-nowrap ${
                showPreviewPanel
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white hover:bg-slate-50 text-slate-800 border-slate-300'
              }`}
            >
              <Eye className="w-4 h-4 shrink-0" />
              <span>{showPreviewPanel ? 'Ẩn văn bản thô' : 'Xem trước văn bản'}</span>
            </button>

            <button
              type="button"
              onClick={() => void handleParseRawText()}
              disabled={isProcessing}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-[15px] font-semibold shadow-xs transition-colors flex items-center gap-2 whitespace-nowrap"
            >
              {isProcessing ? (
                <RefreshCw className="w-4 h-4 animate-spin shrink-0" />
              ) : (
                <Play className="w-4 h-4 shrink-0" />
              )}
              <span>{isProcessing ? 'Đang phân tích...' : 'Phân tích đề'}</span>
            </button>
          </div>
        </div>

        {/* Progress Bar & Status Message */}
        {(isProcessing || analysisProgress > 0 || parsedResult) && (
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="font-semibold text-slate-800 flex items-center gap-2">
                {isProcessing ? (
                  <RefreshCw className="w-4 h-4 text-teal-600 animate-spin shrink-0" />
                ) : parseError ? (
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                )}
                <span>
                  {analysisStage ||
                    (parsedResult
                      ? `Đã phân tích ${parsedResult.totalQuestions} câu hỏi và ${totalAnswerItems} mục đáp án.`
                      : 'Sẵn sàng phân tích')}
                </span>
              </span>
              <span className="font-mono font-bold text-slate-700 tabular-nums">
                {analysisProgress}%
              </span>
            </div>
            <div className="w-full h-2.5 bg-slate-200 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-[width] duration-200 ${
                  parseError ? 'bg-rose-500' : isProcessing ? 'bg-teal-600' : 'bg-emerald-600'
                }`}
                style={{ width: `${Math.max(0, Math.min(100, analysisProgress))}%` }}
              />
            </div>
          </div>
        )}

        {/* Specific Error Notice */}
        {parseError && (
          <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-[15px] flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-bold">Không thể đọc hoàn chỉnh tài liệu</p>
              <p className="text-rose-800 leading-relaxed">{parseError}</p>
            </div>
          </div>
        )}

        {/* Raw Text & Detected Tables Preview Drawer */}
        {showPreviewPanel && (
          <div className="border-t border-slate-200 pt-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <FileText className="w-4 h-4 text-teal-600 shrink-0" />
                <span className="tabular-nums">
                  Xem trước &amp; Chỉnh sửa văn bản thô ({inputText.length.toLocaleString('vi-VN')} ký tự)
                </span>
              </h3>
              <button
                type="button"
                onClick={() => void handleParseRawText()}
                className="px-4 min-h-[40px] rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold"
              >
                Áp dụng &amp; Bóc tách lại
              </button>
            </div>

            <textarea
              rows={8}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Nội dung văn bản trích xuất từ Word / PDF sẽ hiển thị tại đây. Bạn cũng có thể dán trực tiếp văn bản đề thi (Phần I, Phần II, Phần III) rồi bấm Phân tích đề..."
              className="w-full p-3.5 font-mono text-xs sm:text-sm leading-relaxed rounded-xl border border-slate-300 bg-slate-50 text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-600"
            />

            {parsedResult?.extractedTables && parsedResult.extractedTables.length > 0 && (
              <div className="space-y-2">
                <p className="text-[13px] font-bold text-slate-700">
                  Bảng biểu phát hiện trong tài liệu ({parsedResult.extractedTables.length} bảng)
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {parsedResult.extractedTables.slice(0, 6).map((tbl) => (
                    <div
                      key={tbl.id}
                      className="p-3 rounded-xl border border-slate-200 bg-slate-50 text-xs overflow-x-auto"
                    >
                      <div className="font-bold text-slate-800 mb-1.5 flex items-center justify-between gap-2">
                        <span className="truncate">{tbl.surroundingHeader || `Bảng (${tbl.id})`}</span>
                        <span className="text-slate-500 shrink-0 tabular-nums">{tbl.rows.length} dòng</span>
                      </div>
                      <table className="w-full border-collapse text-xs bg-white rounded overflow-hidden">
                        <tbody>
                          {tbl.rows.slice(0, 4).map((row, rIdx) => (
                            <tr key={rIdx} className="border-b border-slate-100 last:border-0">
                              {row.slice(0, 8).map((cell, cIdx) => (
                                <td
                                  key={cIdx}
                                  className="px-2 py-1 border-r border-slate-100 last:border-0 text-slate-700"
                                >
                                  {cell}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* ===================================================================== */}
      {/* BƯỚC 3: KIỂM TRA NỘI DUNG                                             */}
      {/* ===================================================================== */}
      {parsedResult && (
        <>
          <section ref={step3Ref} className="space-y-5">
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-5">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-bold text-slate-900">
                    Bước 3: Kiểm tra nội dung câu hỏi &amp; đáp án
                  </h2>
                  <p className="text-[15px] text-slate-600 mt-0.5">
                    Tên đề nhận diện: <strong className="text-slate-900">{parsedResult.title}</strong> ·{' '}
                    <span className="tabular-nums font-semibold text-teal-700">
                      Nhận diện đáp án {recognitionRate}% ({verifiedAnswerItems}/{totalAnswerItems} mục)
                    </span>
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  {parsedResult.allAnswersVerified && structuralErrorCount === 0 && (
                    <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-700">
                      <CheckCheck className="w-4 h-4 shrink-0" />
                      <span>Đầy đủ đáp án</span>
                    </span>
                  )}
                  {(parsedResult.part3LengthWarningsCount ?? 0) > 0 && (
                    <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-amber-700">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      <span>{parsedResult.part3LengthWarningsCount} đáp án Phần III vượt 4 ký tự</span>
                    </span>
                  )}
                </div>
              </div>

              {/* Category Summary Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 tabular-nums">
                <button
                  type="button"
                  onClick={() => setActiveViewTab('part1')}
                  className={`text-left p-3.5 rounded-xl border transition-colors ${
                    activeViewTab === 'part1'
                      ? 'bg-teal-50 border-teal-500'
                      : 'bg-slate-50 border-slate-200 hover:border-teal-300'
                  }`}
                >
                  <p className="text-[13px] font-semibold text-teal-800">Phần I (4 lựa chọn A,B,C,D)</p>
                  <p className="text-2xl font-bold text-slate-900 mt-1">{parsedResult.part1Count} câu</p>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveViewTab('part2')}
                  className={`text-left p-3.5 rounded-xl border transition-colors ${
                    activeViewTab === 'part2'
                      ? 'bg-indigo-50 border-indigo-500'
                      : 'bg-slate-50 border-slate-200 hover:border-indigo-300'
                  }`}
                >
                  <p className="text-[13px] font-semibold text-indigo-800">Phần II (Đúng/Sai a,b,c,d)</p>
                  <p className="text-2xl font-bold text-slate-900 mt-1">
                    {parsedResult.part2Count} câu{' '}
                    <span className="text-sm font-medium text-indigo-700">
                      ({parsedResult.part2StatementsCount ?? parsedResult.part2Count * 4} ý)
                    </span>
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveViewTab('part3')}
                  className={`text-left p-3.5 rounded-xl border transition-colors ${
                    activeViewTab === 'part3'
                      ? 'bg-slate-200/70 border-slate-600'
                      : 'bg-slate-50 border-slate-200 hover:border-slate-400'
                  }`}
                >
                  <p className="text-[13px] font-semibold text-slate-700">Phần III (Trả lời ngắn)</p>
                  <p className="text-2xl font-bold text-slate-900 mt-1">{parsedResult.part3Count} câu</p>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveViewTab('answer_reconciliation')}
                  className={`text-left p-3.5 rounded-xl border transition-colors ${
                    activeViewTab === 'answer_reconciliation'
                      ? 'bg-emerald-50 border-emerald-500'
                      : 'bg-slate-50 border-slate-200 hover:border-emerald-300'
                  }`}
                >
                  <p className="text-[13px] font-semibold text-emerald-800">Đáp án đã nhận diện</p>
                  <p className="text-2xl font-bold text-emerald-700 mt-1">
                    {verifiedAnswerItems}
                    <span className="text-sm font-medium text-slate-600 ml-1">/ {totalAnswerItems}</span>
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveViewTab(issueQuestions.length > 0 ? 'issues' : 'all_questions')}
                  className={`text-left p-3.5 rounded-xl border transition-colors col-span-2 sm:col-span-1 ${
                    issueQuestions.length > 0
                      ? 'bg-amber-50 border-amber-300 hover:border-amber-500'
                      : 'bg-slate-50 border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <p
                    className={`text-[13px] font-semibold ${
                      issueQuestions.length > 0 ? 'text-amber-800' : 'text-slate-600'
                    }`}
                  >
                    Cần kiểm tra / Lỗi
                  </p>
                  <p
                    className={`text-2xl font-bold mt-1 ${
                      structuralErrorCount > 0
                        ? 'text-rose-700'
                        : issueQuestions.length > 0
                        ? 'text-amber-700'
                        : 'text-slate-900'
                    }`}
                  >
                    {issueQuestions.length}
                  </p>
                </button>
              </div>
            </div>

            {/* Ambiguous Multi-Table / Variant Code Confirmation Panel */}
            {parsedResult.answerTableCandidates && parsedResult.answerTableCandidates.length > 1 && (
              <div
                className={`rounded-2xl border p-5 shadow-xs space-y-3 ${
                  parsedResult.hasAmbiguousAnswerMapping && !parsedResult.answerMappingConfirmed
                    ? 'bg-amber-50 border-amber-300'
                    : 'bg-white border-slate-200'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                      <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
                      <span>
                        Phát hiện nhiều bảng đáp án / Mã đề ({parsedResult.answerTableCandidates.length} bảng ứng viên)
                      </span>
                    </h3>
                    <p className="text-sm text-slate-700 mt-0.5">
                      Chọn đúng mã đề hoặc bảng đáp án tương ứng với nội dung câu hỏi để đảm bảo không lệch đáp án.
                    </p>
                  </div>

                  {!parsedResult.answerMappingConfirmed ? (
                    <button
                      type="button"
                      onClick={handleConfirmAnswerMapping}
                      className="min-h-[42px] px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold shrink-0"
                    >
                      Xác nhận bảng đáp án đang dùng
                    </button>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-sm font-bold text-emerald-700 shrink-0">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Đã xác nhận bảng đáp án</span>
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {parsedResult.answerTableCandidates.map((cand) => {
                    const isSelected = parsedResult.selectedAnswerCandidateId === cand.id;
                    return (
                      <button
                        key={cand.id}
                        type="button"
                        onClick={() => handleSelectAnswerCandidate(cand.id)}
                        className={`text-left p-3.5 rounded-xl border transition-colors space-y-1.5 ${
                          isSelected
                            ? 'bg-teal-50 border-teal-500 ring-2 ring-teal-200'
                            : 'bg-white border-slate-200 hover:border-teal-300'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-bold text-slate-900">{cand.label}</span>
                          <span className="text-xs font-bold text-slate-600 tabular-nums">
                            {cand.itemCount} mục
                          </span>
                        </div>
                        {cand.questionRange && (
                          <p className="text-[13px] font-semibold text-teal-700">{cand.questionRange}</p>
                        )}
                        <p className="text-xs font-mono text-slate-600 line-clamp-2">{cand.previewText}</p>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Detected Sections & Confirmation Panel */}
            <div
              className={`rounded-2xl border p-5 shadow-xs space-y-3 ${
                parsedResult.hasAmbiguousSections && !parsedResult.sectionsConfirmed
                  ? 'bg-amber-50 border-amber-300'
                  : 'bg-white border-slate-200'
              }`}
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <span className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Layers className="w-4 h-4 text-teal-600 shrink-0" />
                  <span>Cấu trúc các phần đã nhận diện</span>
                </span>

                <div className="flex items-center gap-2 shrink-0">
                  {parsedResult.hasAmbiguousSections && !parsedResult.sectionsConfirmed ? (
                    <button
                      type="button"
                      onClick={handleConfirmAllSections}
                      className="min-h-[42px] px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold flex items-center gap-1.5"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Xác nhận cấu trúc các phần</span>
                    </button>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-700">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Đã xác nhận cấu trúc</span>
                    </span>
                  )}
                </div>
              </div>

              {parsedResult.equationWarnings && parsedResult.equationWarnings.length > 0 && (
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-sm space-y-1">
                  <div className="font-bold flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>Lưu ý khi đọc Word Equation ({parsedResult.equationWarnings.length} cảnh báo):</span>
                  </div>
                  <ul className="list-disc list-inside space-y-0.5 text-[13px] text-amber-800">
                    {parsedResult.equationWarnings.slice(0, 4).map((w, idx) => (
                      <li key={idx}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}

              {pendingActionNotice && getBlockingErrors() && (
                <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-sm flex items-center gap-2.5">
                  <ShieldAlert className="w-5 h-5 text-rose-600 shrink-0" />
                  <span className="font-semibold">{getBlockingErrors()}</span>
                </div>
              )}

              {parsedResult.detectedSections && parsedResult.detectedSections.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {parsedResult.detectedSections.map((sec) => (
                    <div
                      key={sec.id}
                      className={`p-3.5 rounded-xl border text-sm flex flex-col justify-between gap-2.5 ${
                        sec.needsConfirmation && !sec.teacherConfirmed
                          ? 'bg-white border-amber-400 ring-1 ring-amber-200'
                          : 'bg-slate-50 border-slate-200'
                      }`}
                    >
                      <div className="space-y-1">
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-bold text-slate-900 line-clamp-2" title={sec.rawTitle}>
                            {sec.rawTitle}
                          </span>
                          <span className="text-[13px] font-bold text-slate-700 shrink-0 tabular-nums">
                            {sec.questionCount} câu{sec.statementCount > 0 ? ` / ${sec.statementCount} ý` : ''}
                          </span>
                        </div>
                        {sec.warning && <p className="text-[13px] text-amber-800">{sec.warning}</p>}
                      </div>

                      <div className="flex items-center gap-2 pt-2 border-t border-slate-200/70">
                        <span className="text-[13px] font-semibold text-slate-600 shrink-0">Loại phần:</span>
                        <select
                          value={sec.detectedType}
                          onChange={(e) => handleChangeSectionType(sec.id, e.target.value as QuestionType)}
                          className="flex-1 text-sm font-semibold px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-600"
                        >
                          <option value="part1_single_choice">Phần I: 4 lựa chọn (A,B,C,D)</option>
                          <option value="part2_true_false">Phần II: Đúng / Sai (a,b,c,d)</option>
                          <option value="part3_short_answer">Phần III: Trả lời ngắn</option>
                        </select>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Dedicated Content Filter Tabs */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setActiveViewTab('answer_reconciliation')}
                className={`min-h-[42px] px-4 py-2 rounded-xl text-sm font-semibold flex items-center gap-2 transition-colors whitespace-nowrap ${
                  activeViewTab === 'answer_reconciliation'
                    ? 'bg-teal-600 text-white shadow-xs'
                    : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                <Table className="w-4 h-4 shrink-0" />
                <span>Bảng đối chiếu đáp án ({totalAnswerItems})</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveViewTab('part1')}
                className={`min-h-[42px] px-4 py-2 rounded-xl text-sm font-semibold transition-colors whitespace-nowrap ${
                  activeViewTab === 'part1'
                    ? 'bg-teal-600 text-white shadow-xs'
                    : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                Trắc nghiệm A,B,C,D ({parsedResult.part1Count})
              </button>

              <button
                type="button"
                onClick={() => setActiveViewTab('part2')}
                className={`min-h-[42px] px-4 py-2 rounded-xl text-sm font-semibold transition-colors whitespace-nowrap ${
                  activeViewTab === 'part2'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                Đúng / Sai a,b,c,d ({parsedResult.part2Count})
              </button>

              <button
                type="button"
                onClick={() => setActiveViewTab('part3')}
                className={`min-h-[42px] px-4 py-2 rounded-xl text-sm font-semibold transition-colors whitespace-nowrap ${
                  activeViewTab === 'part3'
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                Trả lời ngắn ({parsedResult.part3Count})
              </button>

              <button
                type="button"
                onClick={() => setActiveViewTab('all_questions')}
                className={`min-h-[42px] px-4 py-2 rounded-xl text-sm font-semibold flex items-center gap-2 transition-colors whitespace-nowrap ${
                  activeViewTab === 'all_questions'
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                <ListChecks className="w-4 h-4 shrink-0" />
                <span>Tất cả câu hỏi ({parsedResult.totalQuestions})</span>
              </button>

              {issueQuestions.length > 0 && (
                <button
                  type="button"
                  onClick={() => setActiveViewTab('issues')}
                  className={`min-h-[42px] px-4 py-2 rounded-xl text-sm font-semibold flex items-center gap-2 transition-colors whitespace-nowrap ${
                    activeViewTab === 'issues'
                      ? 'bg-amber-600 text-white shadow-xs'
                      : 'bg-amber-50 border border-amber-300 text-amber-900 hover:bg-amber-100'
                  }`}
                >
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>Cần kiểm tra / Lỗi ({issueQuestions.length})</span>
                </button>
              )}
            </div>

            {/* Selection & Save-to-Bank Action Bar */}
            <div className="bg-white border border-teal-200 rounded-2xl p-4 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-bold text-slate-900 tabular-nums mr-1">
                  Chọn lưu ngân hàng:{' '}
                  <span className="text-teal-700">
                    {selectedCount} / {parsedResult.totalQuestions} câu
                  </span>
                </span>
                <button
                  type="button"
                  onClick={handleSelectAllQuestions}
                  className="px-3 min-h-[36px] rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-semibold text-slate-800 inline-flex items-center gap-1.5"
                >
                  <CheckSquare className="w-3.5 h-3.5 text-teal-600" />
                  <span>Chọn tất cả</span>
                </button>
                <button
                  type="button"
                  onClick={handleDeselectAllQuestions}
                  className="px-3 min-h-[36px] rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-semibold text-slate-700 inline-flex items-center gap-1.5"
                >
                  <Square className="w-3.5 h-3.5 text-slate-400" />
                  <span>Bỏ chọn tất cả</span>
                </button>
                {savedToBankSourceIds.size > 0 && (
                  <button
                    type="button"
                    onClick={handleSelectOnlyUnsavedQuestions}
                    className="px-3 min-h-[36px] rounded-xl border border-teal-200 bg-teal-50 hover:bg-teal-100 text-xs font-semibold text-teal-900 inline-flex items-center gap-1.5"
                  >
                    <Database className="w-3.5 h-3.5 text-teal-700" />
                    <span>
                      Chỉ chọn câu chưa lưu ({parsedResult.totalQuestions - savedToBankSourceIds.size})
                    </span>
                  </button>
                )}
                {activeViewTab === 'answer_reconciliation' && (
                  <button
                    type="button"
                    onClick={() => setActiveViewTab('all_questions')}
                    className="px-3 min-h-[36px] rounded-xl border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-xs font-semibold text-indigo-800"
                  >
                    Mở danh sách chọn từng câu
                  </button>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  disabled={selectedCount === 0}
                  onClick={handleSaveSelectedToBank}
                  className="px-4 min-h-[40px] rounded-xl bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-xs sm:text-sm font-semibold shadow-xs inline-flex items-center gap-1.5 whitespace-nowrap"
                >
                  <Save className="w-4 h-4 shrink-0" />
                  <span>Lưu các câu đã chọn ({selectedCount})</span>
                </button>
                <button
                  type="button"
                  onClick={handleSaveAllToBank}
                  className="px-4 min-h-[40px] rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-900 text-xs sm:text-sm font-semibold inline-flex items-center gap-1.5 whitespace-nowrap"
                >
                  <Database className="w-4 h-4 text-teal-600 shrink-0" />
                  <span>Lưu toàn bộ ({parsedResult.totalQuestions})</span>
                </button>
              </div>
            </div>

            {unsavedOnlyFilterIds && (
              <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-xs sm:text-sm flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>
                    Đang lọc hiển thị {unsavedOnlyFilterIds.size} câu chưa được lưu (bỏ qua do trùng hoặc bị lỗi) để bạn rà soát và chỉnh sửa.
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => setUnsavedOnlyFilterIds(null)}
                  className="px-3 py-1.5 rounded-lg bg-white border border-amber-300 text-xs font-bold text-amber-900 hover:bg-amber-100"
                >
                  Hiện lại tất cả câu hỏi
                </button>
              </div>
            )}

            {/* Tab Content: 3-Table Dashboard or Question List */}
            {activeViewTab === 'answer_reconciliation' ? (
              <ExamAnswerDashboard
                parsedResult={parsedResult}
                onUpdateAnswerItem={handleUpdateAnswerItem}
                onToggleVerifyItem={handleToggleVerifyItem}
                onVerifyAll={handleVerifyAllAnswers}
                onReRecognize={() => void handleReRecognize()}
                onDeepScan={() => void handleDeepScan()}
                onViewSnippet={() => setShowSourceSnippetModal(true)}
                isDeepScanning={isDeepScanning}
              />
            ) : (
              <div className="space-y-3">
                {displayedQuestions.length === 0 ? (
                  <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center text-[15px] text-slate-600">
                    Không có câu hỏi nào trong mục này.
                  </div>
                ) : (
                  displayedQuestions.map((q, index) => {
                    const statusBadge = getQuestionStatusBadge(q);
                    const StatusIcon = statusBadge.icon;
                    const isSelectedForBank = selectedQuestionIds.has(q.id);
                    const isAlreadySavedToBank = savedToBankSourceIds.has(q.id);
                    const subMeta = resolveQuestionSubject(q, subjects);
                    return (
                      <div
                        key={q.id}
                        className={`bg-white border rounded-2xl p-5 shadow-xs transition-colors ${
                          q.parseStatus === 'error'
                            ? 'border-rose-300 ring-2 ring-rose-100'
                            : isSelectedForBank
                            ? 'border-teal-300 ring-1 ring-teal-100'
                            : q.parseStatus === 'needs_review' || hasMissingAnswer(q)
                            ? 'border-amber-300 ring-1 ring-amber-100'
                            : 'border-slate-200'
                        }`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm">
                            <button
                              type="button"
                              onClick={() => toggleSelectQuestion(q.id)}
                              aria-label={isSelectedForBank ? `Bỏ chọn Câu ${index + 1}` : `Chọn lưu Câu ${index + 1}`}
                              className="inline-flex items-center gap-1.5 text-left font-bold text-slate-900 hover:text-teal-700"
                            >
                              {isSelectedForBank ? (
                                <CheckSquare className="w-4.5 h-4.5 text-teal-600 shrink-0" />
                              ) : (
                                <Square className="w-4.5 h-4.5 text-slate-400 shrink-0" />
                              )}
                              <span className="tabular-nums">Câu {index + 1}</span>
                            </button>
                            <span aria-hidden="true" className="text-slate-300">·</span>
                            <span className="font-mono text-[13px] text-slate-500">{q.code}</span>
                            <span aria-hidden="true" className="text-slate-300">·</span>
                            <span className="font-semibold text-teal-700">
                              {q.type === 'part1_single_choice'
                                ? 'Phần I (4 lựa chọn)'
                                : q.type === 'part2_true_false'
                                ? 'Phần II (Đúng / Sai)'
                                : 'Phần III (Trả lời ngắn)'}
                            </span>
                            <span aria-hidden="true" className="text-slate-300">·</span>
                            <span className="text-xs font-semibold text-slate-600">
                              {COGNITIVE_LEVEL_SHORT_LABELS[q.level] || q.level}
                            </span>
                            <span aria-hidden="true" className="text-slate-300">·</span>
                            <span className="text-xs text-slate-600">
                              {subMeta.name} · {GRADE_LABELS[q.grade] || `Lớp ${q.grade}`}
                            </span>
                            {(q.chapterName || q.lessonName || q.lessonTopic) && (
                              <>
                                <span aria-hidden="true" className="text-slate-300">·</span>
                                <span className="text-xs text-slate-600 truncate max-w-xs">
                                  {[q.chapterName, q.lessonName || q.lessonTopic].filter(Boolean).join(' / ')}
                                </span>
                              </>
                            )}
                            <span aria-hidden="true" className="text-slate-300">·</span>
                            <span
                              className={`text-[13px] font-semibold px-2.5 py-0.5 rounded-lg border inline-flex items-center gap-1 ${statusBadge.className}`}
                            >
                              <StatusIcon className="w-3.5 h-3.5 shrink-0" />
                              <span>{statusBadge.label}</span>
                            </span>
                            {isAlreadySavedToBank && (
                              <span className="text-xs font-bold px-2.5 py-0.5 rounded-lg bg-emerald-100 text-emerald-800 border border-emerald-200 inline-flex items-center gap-1">
                                <Database className="w-3 h-3 shrink-0" />
                                <span>Đã lưu vào NH</span>
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            <select
                              value={q.type}
                              onChange={(e) => handleMoveQuestionType(q.id, e.target.value as QuestionType)}
                              title="Chuyển câu hỏi sang phần khác"
                              className="text-sm font-semibold px-3 min-h-[38px] rounded-xl border border-slate-300 bg-slate-50 text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-600"
                            >
                              <option value="part1_single_choice">Phần I (4 L/C)</option>
                              <option value="part2_true_false">Phần II (Đ/S)</option>
                              <option value="part3_short_answer">Phần III (Ngắn)</option>
                            </select>
                            <button
                              type="button"
                              onClick={() => setEditingQuestion({ ...q })}
                              className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-xl text-slate-600 hover:text-teal-700 hover:bg-teal-50 border border-slate-200 transition-colors"
                              title="Chỉnh sửa câu hỏi & đáp án"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteQuestion(q.id)}
                              className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-xl text-slate-600 hover:text-rose-600 hover:bg-rose-50 border border-slate-200 transition-colors"
                              title="Xóa câu này"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        {q.parseWarning && (
                          <div className="mb-3 px-3.5 py-2.5 rounded-xl bg-amber-50 border border-amber-200 text-sm font-medium text-amber-900 flex items-start gap-2">
                            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                            <span>{q.parseWarning}</span>
                          </div>
                        )}

                        <div className="text-[15px] sm:text-base text-slate-900 font-medium my-2 leading-relaxed">
                          <ChemRenderer text={q.content} />
                        </div>

                        {q.equationWarnings && q.equationWarnings.length > 0 && (
                          <div className="mb-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-[13px] text-amber-800 flex items-start gap-2">
                            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                            <span>{q.equationWarnings.join(' ')}</span>
                          </div>
                        )}

                        {q.type === 'part1_single_choice' && q.options && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mt-3 pt-3 border-t border-slate-100">
                            {q.options.map((opt) => {
                              const isCorrect = opt.id === q.correctOptionId;
                              return (
                                <div
                                  key={opt.id}
                                  className={`p-3 rounded-xl border text-[15px] flex items-start gap-2.5 ${
                                    isCorrect
                                      ? 'border-emerald-500 bg-emerald-50/80 font-semibold text-emerald-900'
                                      : 'border-slate-200 bg-slate-50 text-slate-700'
                                  }`}
                                >
                                  <span
                                    className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-xs font-bold ${
                                      isCorrect ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-700'
                                    }`}
                                  >
                                    {opt.id}
                                  </span>
                                  <div className="flex-1 min-w-0">
                                    <ChemRenderer text={opt.text} />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {q.type === 'part2_true_false' && q.statements && (
                          <div className="space-y-2 mt-3 pt-3 border-t border-slate-100">
                            {q.statements.map((stmt) => (
                              <div
                                key={stmt.id}
                                className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-[15px] flex items-center justify-between gap-3"
                              >
                                <div className="flex items-start gap-2 min-w-0">
                                  <span className="font-bold text-indigo-700 shrink-0">{stmt.id})</span>
                                  <span className="min-w-0">
                                    <ChemRenderer text={stmt.statement} />
                                  </span>
                                </div>
                                <span
                                  className={`px-2.5 py-1 rounded-lg text-xs font-bold shrink-0 ${
                                    stmt.correctAnswer
                                      ? 'bg-emerald-100 text-emerald-800'
                                      : 'bg-rose-100 text-rose-800'
                                  }`}
                                >
                                  {stmt.correctAnswer ? 'Đúng' : 'Sai'}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}

                        {q.type === 'part3_short_answer' && q.shortAnswerConfig && (
                          <div className="mt-3 pt-3 border-t border-slate-100 text-[15px] flex flex-wrap items-center gap-2.5">
                            <span className="font-semibold text-slate-700">Đáp án chấp nhận:</span>
                            {q.shortAnswerConfig.acceptableAnswers.length > 0 ? (
                              q.shortAnswerConfig.acceptableAnswers.map((ans, idx) => (
                                <span
                                  key={idx}
                                  className="px-3 py-1 bg-indigo-50 text-indigo-900 border border-indigo-200 font-mono font-bold rounded-lg text-sm"
                                >
                                  {ans}
                                </span>
                              ))
                            ) : (
                              <span className="text-sm font-semibold text-amber-700">Chưa có đáp án</span>
                            )}
                          </div>
                        )}

                        {q.explanation && (
                          <div className="mt-3 p-3.5 rounded-xl bg-slate-50 text-slate-700 text-sm border border-slate-200">
                            <span className="font-bold text-slate-900">Hướng dẫn giải: </span>
                            <ChemRenderer text={q.explanation} inline />
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </section>

          {/* ================================================================= */}
          {/* BƯỚC 4: HOÀN TẤT & XÁC NHẬN LƯU ĐỀ THI                            */}
          {/* ================================================================= */}
          <section
            ref={step4Ref}
            className="bg-slate-900 text-slate-100 rounded-2xl p-6 shadow-sm space-y-5"
          >
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="space-y-1">
                <h2 className="text-xl font-bold text-white">
                  Bước 4: Hoàn tất &amp; Lưu đề thi
                </h2>
                <p className="text-[15px] text-slate-300">
                  Kiểm tra tổng số câu hỏi theo từng dạng trước khi lưu đề thi và cấu hình phòng thi trực tuyến.
                </p>
              </div>
              <div className="flex items-center gap-2 text-sm font-semibold tabular-nums">
                {getBlockingErrors() ? (
                  <span className="text-amber-300 flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>Còn mục cần kiểm tra trước khi lưu</span>
                  </span>
                ) : (
                  <span className="text-emerald-300 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>Đề thi đã sẵn sàng lưu</span>
                  </span>
                )}
              </div>
            </div>

            {/* Summary Numbers */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 tabular-nums">
              <div className="p-4 rounded-xl bg-slate-800 border border-slate-700">
                <p className="text-[13px] text-slate-300">Tổng câu đã bóc tách</p>
                <p className="text-2xl font-bold text-white mt-1">{parsedResult.totalQuestions} câu</p>
              </div>
              <div className="p-4 rounded-xl bg-slate-800 border border-slate-700">
                <p className="text-[13px] text-slate-300">Phần I (4 lựa chọn)</p>
                <p className="text-2xl font-bold text-teal-300 mt-1">{parsedResult.part1Count} câu</p>
              </div>
              <div className="p-4 rounded-xl bg-slate-800 border border-slate-700">
                <p className="text-[13px] text-slate-300">Phần II (Đúng/Sai)</p>
                <p className="text-2xl font-bold text-indigo-300 mt-1">
                  {parsedResult.part2Count} câu{' '}
                  <span className="text-sm font-normal text-slate-300">
                    ({parsedResult.part2StatementsCount ?? parsedResult.part2Count * 4} ý)
                  </span>
                </p>
              </div>
              <div className="p-4 rounded-xl bg-slate-800 border border-slate-700">
                <p className="text-[13px] text-slate-300">Phần III (Trả lời ngắn)</p>
                <p className="text-2xl font-bold text-emerald-300 mt-1">{parsedResult.part3Count} câu</p>
              </div>
            </div>

            {getBlockingErrors() && (
              <div className="p-3.5 rounded-xl bg-amber-500/15 border border-amber-400/40 text-amber-200 text-sm flex items-start gap-2.5">
                <AlertTriangle className="w-5 h-5 text-amber-300 shrink-0 mt-0.5" />
                <span>{getBlockingErrors()}</span>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => scrollToSection(step3Ref)}
                className="min-h-[44px] px-4 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-semibold transition-colors whitespace-nowrap"
              >
                Quay lại kiểm tra câu hỏi
              </button>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handleGuardedSaveBank}
                  className="min-h-[46px] px-5 rounded-xl border border-teal-500/60 bg-slate-800 hover:bg-slate-700 text-white text-[15px] font-semibold transition-colors flex items-center gap-2 whitespace-nowrap"
                >
                  <Save className="w-4 h-4 shrink-0 text-teal-400" />
                  <span>
                    Lưu vào Ngân hàng câu hỏi (
                    {selectedCount > 0 ? `${selectedCount} câu đã chọn` : `${parsedResult.totalQuestions} câu`})
                  </span>
                </button>

                <button
                  type="button"
                  onClick={handleGuardedCreateExam}
                  className="min-h-[46px] px-5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-[15px] font-semibold shadow-sm transition-colors flex items-center gap-2 whitespace-nowrap"
                >
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>Xác nhận lưu đề thi</span>
                  <ArrowRight className="w-4 h-4 shrink-0" />
                </button>
              </div>
            </div>
          </section>
        </>
      )}

      {/* Edit Question Modal */}
      {editingQuestion && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
              <h3 className="font-bold text-base">Chỉnh Sửa Câu Hỏi &amp; Đáp Án ({editingQuestion.code})</h3>
              <button
                type="button"
                onClick={() => setEditingQuestion(null)}
                className="p-2 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1 space-y-4 text-sm">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Dạng câu hỏi</label>
                  <select
                    value={editingQuestion.type}
                    onChange={(e) =>
                      setEditingQuestion(reclassifyQuestionType(editingQuestion, e.target.value as QuestionType))
                    }
                    className="w-full p-2.5 rounded-xl border border-slate-300 font-semibold text-sm bg-slate-50 focus:ring-2 focus:ring-teal-600 focus:outline-none"
                  >
                    <option value="part1_single_choice">Phần I: Trắc nghiệm 4 lựa chọn (A, B, C, D)</option>
                    <option value="part2_true_false">Phần II: Trắc nghiệm Đúng / Sai (a, b, c, d)</option>
                    <option value="part3_short_answer">Phần III: Trả lời ngắn</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Mức độ nhận thức</label>
                  <select
                    value={editingQuestion.level}
                    onChange={(e) =>
                      setEditingQuestion({ ...editingQuestion, level: e.target.value as CognitiveLevel })
                    }
                    className="w-full p-2.5 rounded-xl border border-slate-300 font-semibold text-sm bg-slate-50 focus:ring-2 focus:ring-teal-600 focus:outline-none"
                  >
                    {(Object.keys(COGNITIVE_LEVEL_LABELS) as CognitiveLevel[]).map((lvl) => (
                      <option key={lvl} value={lvl}>
                        {COGNITIVE_LEVEL_LABELS[lvl]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Môn học</label>
                  <select
                    value={editingQuestion.subjectId || resolveQuestionSubject(editingQuestion, subjects).id}
                    onChange={(e) => {
                      const matched = subjects.find((s) => s.id === e.target.value);
                      setEditingQuestion({
                        ...editingQuestion,
                        subjectId: e.target.value,
                        subjectName: matched?.name || editingQuestion.subjectName,
                      });
                    }}
                    className="w-full p-2.5 rounded-xl border border-slate-300 font-semibold text-sm bg-slate-50 focus:ring-2 focus:ring-teal-600 focus:outline-none"
                  >
                    {subjects.map((sub) => (
                      <option key={sub.id} value={sub.id}>
                        {sub.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Khối lớp</label>
                  <select
                    value={editingQuestion.grade}
                    onChange={(e) =>
                      setEditingQuestion({ ...editingQuestion, grade: e.target.value as ChemGrade })
                    }
                    className="w-full p-2.5 rounded-xl border border-slate-300 font-semibold text-sm bg-slate-50 focus:ring-2 focus:ring-teal-600 focus:outline-none"
                  >
                    <option value="10">Lớp 10</option>
                    <option value="11">Lớp 11</option>
                    <option value="12">Lớp 12</option>
                    <option value="chuyen_hsg">Chuyên &amp; HSG</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Chương (tùy chọn riêng câu)</label>
                  <input
                    type="text"
                    value={editingQuestion.chapterName || ''}
                    onChange={(e) => setEditingQuestion({ ...editingQuestion, chapterName: e.target.value })}
                    placeholder="Có thể chọn chung khi lưu vào ngân hàng"
                    className="w-full p-2.5 rounded-xl border border-slate-300 text-sm"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Bài học / Chủ đề</label>
                  <input
                    type="text"
                    value={editingQuestion.lessonName || editingQuestion.lessonTopic || ''}
                    onChange={(e) =>
                      setEditingQuestion({
                        ...editingQuestion,
                        lessonName: e.target.value,
                        lessonTopic: e.target.value,
                      })
                    }
                    placeholder="Có thể chọn theo Cascading Dropdown khi lưu"
                    className="w-full p-2.5 rounded-xl border border-slate-300 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Nội dung câu hỏi (hỗ trợ công thức hóa học, LaTeX)
                </label>
                <textarea
                  rows={4}
                  value={editingQuestion.content}
                  onChange={(e) => setEditingQuestion({ ...editingQuestion, content: e.target.value })}
                  className="w-full p-3 rounded-xl border border-slate-300 font-sans text-sm focus:ring-2 focus:ring-teal-600 focus:outline-none"
                />
              </div>

              {editingQuestion.type === 'part1_single_choice' && (
                <div className="space-y-2">
                  <label className="block font-bold text-slate-700">Các phương án &amp; Đáp án đúng:</label>
                  {editingQuestion.options?.map((opt, i) => (
                    <div key={opt.id} className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="correct_opt"
                        checked={editingQuestion.correctOptionId === opt.id}
                        onChange={() =>
                          setEditingQuestion({
                            ...editingQuestion,
                            correctOptionId: opt.id,
                            parseStatus: 'verified',
                            parseWarning: undefined,
                          })
                        }
                        className="w-4 h-4 text-teal-600 focus:ring-teal-600 cursor-pointer"
                      />
                      <span className="font-bold text-slate-700 w-5">{opt.id}.</span>
                      <input
                        type="text"
                        value={opt.text}
                        onChange={(e) => {
                          const newOpts = [...(editingQuestion.options || [])];
                          newOpts[i] = { ...newOpts[i], text: e.target.value };
                          setEditingQuestion({ ...editingQuestion, options: newOpts });
                        }}
                        className="flex-1 p-2 rounded-lg border border-slate-300 text-sm"
                      />
                    </div>
                  ))}
                </div>
              )}

              {editingQuestion.type === 'part2_true_false' && (
                <div className="space-y-2">
                  <label className="block font-bold text-slate-700">Các mệnh đề Đúng / Sai:</label>
                  {editingQuestion.statements?.map((stmt, i) => (
                    <div key={stmt.id} className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                      <span className="font-bold text-indigo-700 w-5">{stmt.id})</span>
                      <input
                        type="text"
                        value={stmt.statement}
                        onChange={(e) => {
                          const newStmts = [...(editingQuestion.statements || [])];
                          newStmts[i] = { ...newStmts[i], statement: e.target.value };
                          setEditingQuestion({ ...editingQuestion, statements: newStmts });
                        }}
                        className="flex-1 p-2 rounded-lg border border-slate-300 text-sm bg-white"
                      />
                      <select
                        value={stmt.correctAnswer ? 'true' : 'false'}
                        onChange={(e) => {
                          const newStmts = [...(editingQuestion.statements || [])];
                          newStmts[i] = { ...newStmts[i], correctAnswer: e.target.value === 'true' };
                          setEditingQuestion({ ...editingQuestion, statements: newStmts });
                        }}
                        className="p-2 rounded-lg border border-slate-300 text-sm font-bold bg-white"
                      >
                        <option value="true">Đúng</option>
                        <option value="false">Sai</option>
                      </select>
                    </div>
                  ))}
                </div>
              )}

              {editingQuestion.type === 'part3_short_answer' && (
                <div className="space-y-2">
                  <label className="block font-bold text-slate-700">
                    Đáp án chấp nhận (tối đa 4 ký tự chuẩn GDPT 2018, cách nhau bởi dấu chấm phẩy `;`):
                  </label>
                  <input
                    type="text"
                    value={editingQuestion.shortAnswerConfig?.acceptableAnswers.join('; ') || ''}
                    onChange={(e) => {
                      const list = e.target.value
                        .split(';')
                        .map((s) => s.trim())
                        .filter(Boolean);
                      const firstCompactLen = (list[0] || '').replace(/\s+/g, '').length;
                      setEditingQuestion({
                        ...editingQuestion,
                        shortAnswerConfig: {
                          acceptableAnswers: list,
                          isNumeric: !isNaN(Number(list[0]?.replace(',', '.'))),
                          numericValue: parseFloat(list[0]?.replace(',', '.') || '0'),
                          tolerance: 0.05,
                        },
                        parseStatus:
                          list.length === 0 || firstCompactLen > 4 ? 'needs_review' : 'verified',
                        parseWarning:
                          firstCompactLen > 4
                            ? `Đáp án Phần III dài ${firstCompactLen} ký tự (> 4 ký tự).`
                            : undefined,
                      });
                    }}
                    placeholder="Ví dụ: 58,4; 58.4"
                    className="w-full p-2.5 rounded-xl border border-slate-300 text-sm font-mono"
                  />
                </div>
              )}

              <div>
                <label className="block font-bold text-slate-700 mb-1">Hướng dẫn giải chi tiết</label>
                <textarea
                  rows={2}
                  value={editingQuestion.explanation || ''}
                  onChange={(e) => setEditingQuestion({ ...editingQuestion, explanation: e.target.value })}
                  placeholder="Nhập phương trình hóa học hoặc lời giải thích..."
                  className="w-full p-2.5 rounded-xl border border-slate-300 text-sm"
                />
              </div>
            </div>

            <div className="px-6 py-3.5 bg-slate-100 border-t border-slate-200 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingQuestion(null)}
                className="px-4 min-h-[42px] rounded-xl text-slate-700 hover:bg-slate-200 text-sm font-semibold"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={() => handleUpdateQuestion(editingQuestion)}
                className="px-4 min-h-[42px] rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold shadow-xs"
              >
                Lưu thay đổi
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Source Snippet Modal */}
      {showSourceSnippetModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[85vh] flex flex-col shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between p-4 border-b border-slate-200 bg-slate-50 rounded-t-2xl">
              <div className="flex items-center gap-2">
                <FileCode className="w-5 h-5 text-teal-600" />
                <h3 className="font-bold text-base text-slate-900">
                  Trích Đoạn Nguồn Bảng Đáp Án (Answer Key Snippet)
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowSourceSnippetModal(false)}
                className="p-2 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto space-y-4 text-xs font-mono">
              <div>
                <span className="font-bold text-slate-700 uppercase tracking-wide block mb-1.5">
                  1. Khối văn bản đáp án được khoanh vùng:
                </span>
                <pre className="p-3.5 bg-slate-900 text-emerald-400 rounded-xl overflow-x-auto whitespace-pre-wrap leading-relaxed max-h-60">
                  {isolateAnswerBlock(inputText).answerSectionText || 'Không phát hiện khối đáp án riêng biệt.'}
                </pre>
              </div>

              {isolateAnswerBlock(inputText).solutionsText && (
                <div>
                  <span className="font-bold text-slate-700 uppercase tracking-wide block mb-1.5">
                    2. Khối lời giải chi tiết:
                  </span>
                  <pre className="p-3.5 bg-slate-900 text-teal-300 rounded-xl overflow-x-auto whitespace-pre-wrap leading-relaxed max-h-60">
                    {isolateAnswerBlock(inputText).solutionsText}
                  </pre>
                </div>
              )}
            </div>

            <div className="p-3.5 border-t border-slate-200 flex justify-between items-center bg-slate-50 rounded-b-2xl">
              <span className="text-xs text-slate-500">HQTest Answer Extraction Engine · GDPT 2018</span>
              <button
                type="button"
                onClick={() => setShowSourceSnippetModal(false)}
                className="px-4 min-h-[42px] bg-slate-900 text-white rounded-xl font-semibold text-sm hover:bg-slate-800"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Word Save-to-Question-Bank Confirmation & Firestore Persistence Modal */}
      <WordSaveToBankModal
        isOpen={Boolean(saveModalQuestions && saveModalQuestions.length > 0)}
        questionsToSave={saveModalQuestions || []}
        existingBankQuestions={existingBankQuestions}
        subjects={subjects}
        defaultGrade={selectedGrade}
        sourceFileName={selectedFile?.name}
        currentUserId={currentUserId}
        onClose={() => setSaveModalQuestions(null)}
        onQuestionsPersisted={(savedList, refreshedBank, savedSourceIds) => {
          if (savedSourceIds && savedSourceIds.length > 0) {
            setSavedToBankSourceIds((prev) => {
              const next = new Set(prev);
              savedSourceIds.forEach((sid) => next.add(sid));
              return next;
            });
          }
          if (onQuestionsPersistedToBank) {
            onQuestionsPersistedToBank(savedList, refreshedBank);
          } else if (onSaveToQuestionBank && savedList.length > 0) {
            onSaveToQuestionBank(savedList);
          }
          showToast(`Đã ghi thành công ${savedList.length} câu hỏi vào Ngân hàng Firestore!`);
        }}
        onNavigateToQuestionBank={() => {
          onNavigateToQuestionBank?.();
        }}
        onReviewUnsavedQuestions={(unsavedIds) => {
          setUnsavedOnlyFilterIds(new Set(unsavedIds));
          setSelectedQuestionIds(new Set(unsavedIds));
          setActiveViewTab('all_questions');
          scrollToSection(step3Ref);
        }}
      />
    </div>
  );
};
