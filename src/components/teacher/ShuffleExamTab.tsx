import React, { useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileArchive,
  FileSpreadsheet,
  FileText,
  FileUp,
  Loader2,
  RefreshCw,
  Shuffle,
  Trash2,
} from 'lucide-react';
import type { Exam, Question } from '../../types';
import { parseDocxExam } from '../../utils/docxParser';
import { ChemRenderer } from '../../utils/chemRenderer';
import {
  formatPart2AnswerCompact,
  generateShuffledExamBundle,
  generateVariantCodes,
  groupQuestionsByGdpt2018Part,
  type ExamHeaderMeta,
  type ShuffledExamBundle,
  type ShuffleOptions,
} from '../../utils/examShuffler';
import {
  downloadConsolidatedAnswerKeyDocx,
  downloadSingleVariantDocx,
  exportShuffledExamBundleAsZip,
} from '../../services/docxExportService';

interface ShuffleExamTabProps {
  exams?: Exam[];
  defaultSchoolName?: string;
}

type PreviewViewTab = 'source' | 'variants' | 'matrix';

const PRESET_COUNTS = [2, 4, 6, 8] as const;
const PRESET_PREFIXES = ['101', '201', '301'] as const;

function stripFileExtension(fileName: string): string {
  return fileName.replace(/\.docx$/i, '').replace(/[_-]+/g, ' ').trim();
}

function getDefaultSchoolYear(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  return m >= 8 ? `Năm học ${y} – ${y + 1}` : `Năm học ${y - 1} – ${y}`;
}

export const ShuffleExamTab: React.FC<ShuffleExamTabProps> = ({
  exams = [],
  defaultSchoolName = '',
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Source exam state
  const [sourceFileName, setSourceFileName] = useState<string>('');
  const [sourceQuestions, setSourceQuestions] = useState<Question[]>([]);
  const [selectedSystemExamId, setSelectedSystemExamId] = useState<string>('');
  const [isDragging, setIsDragging] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);

  // Exam header print metadata
  const [meta, setMeta] = useState<ExamHeaderMeta>({
    departmentName: 'SỞ GIÁO DỤC VÀ ĐÀO TẠO',
    schoolName: defaultSchoolName || 'TRƯỜNG THPT',
    examTitle: 'ĐỀ KIỂM TRA ĐỊNH KỲ',
    subjectName: 'Hóa học',
    durationMinutes: 50,
    schoolYear: getDefaultSchoolYear(),
  });

  // Shuffle configuration
  const [variantCount, setVariantCount] = useState<number>(4);
  const [codePrefix, setCodePrefix] = useState<string>('101');
  const [shuffleQuestionsInPart, setShuffleQuestionsInPart] = useState<boolean>(true);
  const [shufflePart1Options, setShufflePart1Options] = useState<boolean>(true);
  const [shufflePart2Statements, setShufflePart2Statements] = useState<boolean>(true);

  // Output & Preview state
  const [bundle, setBundle] = useState<ShuffledExamBundle | null>(null);
  const [previewTab, setPreviewTab] = useState<PreviewViewTab>('source');
  const [selectedVariantCode, setSelectedVariantCode] = useState<string>('');
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<{ percent: number; message: string } | null>(
    null
  );
  const [exportNotice, setExportNotice] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const groupedSource = useMemo(
    () => groupQuestionsByGdpt2018Part(sourceQuestions),
    [sourceQuestions]
  );

  const previewCodes = useMemo(
    () => generateVariantCodes(codePrefix, variantCount),
    [codePrefix, variantCount]
  );

  const missingAnswerCount = useMemo(() => {
    let missing = 0;
    for (const q of groupedSource.part1) {
      const hasCorrect =
        Boolean(q.correctOptionId) ||
        (Array.isArray(q.correctOptionIds) && q.correctOptionIds.length > 0) ||
        Boolean(q.options?.some((o) => o.isCorrect));
      if (!hasCorrect) missing += 1;
    }
    for (const q of groupedSource.part2) {
      if (!Array.isArray(q.statements) || q.statements.length === 0) missing += 1;
    }
    for (const q of groupedSource.part3) {
      const hasAns =
        (Array.isArray(q.shortAnswerConfig?.acceptableAnswers) &&
          q.shortAnswerConfig.acceptableAnswers.some((a) => String(a).trim().length > 0)) ||
        typeof q.shortAnswerConfig?.numericValue === 'number';
      if (!hasAns) missing += 1;
    }
    return missing;
  }, [groupedSource]);

  const activeVariant = useMemo(() => {
    if (!bundle || bundle.variants.length === 0) return null;
    return (
      bundle.variants.find((v) => v.variantCode === selectedVariantCode) || bundle.variants[0]
    );
  }, [bundle, selectedVariantCode]);

  const handleLoadDocxFile = async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.docx')) {
      setParseError('Vui lòng chọn tệp Word định dạng .docx hợp lệ.');
      return;
    }

    setIsParsing(true);
    setParseError(null);
    setExportNotice(null);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const { result } = await parseDocxExam(arrayBuffer, '12');

      if (!result.questions || result.questions.length === 0) {
        setParseError(
          'Không nhận diện được câu hỏi nào trong tệp Word. Hãy kiểm tra đề gốc có đúng định dạng Câu 1., Câu 2.,... theo cấu trúc Phần I / II / III.'
        );
        return;
      }

      setSourceQuestions(result.questions);
      setSourceFileName(file.name);
      setSelectedSystemExamId('');
      setBundle(null);
      setPreviewTab('source');

      const inferredTitle = result.title?.trim() || stripFileExtension(file.name);
      if (inferredTitle) {
        setMeta((prev) => ({
          ...prev,
          examTitle: inferredTitle.toUpperCase(),
        }));
      }
    } catch (err) {
      setParseError(
        err instanceof Error
          ? err.message
          : 'Không thể đọc tệp .docx. Vui lòng kiểm tra lại định dạng file.'
      );
    } finally {
      setIsParsing(false);
    }
  };

  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    await handleLoadDocxFile(file);
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      await handleLoadDocxFile(file);
    }
  };

  const handleSelectExistingExam = (examId: string) => {
    setSelectedSystemExamId(examId);
    setParseError(null);
    setExportNotice(null);
    if (!examId) return;

    const found = exams.find((ex) => ex.id === examId);
    if (!found || !Array.isArray(found.questions) || found.questions.length === 0) {
      setParseError('Đề thi được chọn không có câu hỏi nào.');
      return;
    }

    setSourceQuestions(found.questions);
    setSourceFileName(`${found.title} (Đề có sẵn)`);
    setBundle(null);
    setPreviewTab('source');
    setMeta((prev) => ({
      ...prev,
      examTitle: (found.title || prev.examTitle).toUpperCase(),
      subjectName: found.subjectName || prev.subjectName,
      durationMinutes: found.durationMinutes || prev.durationMinutes,
    }));
  };

  const handleClearSource = () => {
    setSourceQuestions([]);
    setSourceFileName('');
    setSelectedSystemExamId('');
    setBundle(null);
    setParseError(null);
    setExportNotice(null);
    setExportProgress(null);
    setPreviewTab('source');
  };

  const buildCurrentShuffleOptions = (): ShuffleOptions => ({
    variantCount: Math.max(1, Math.min(24, Number(variantCount) || 4)),
    codePrefix: codePrefix.trim() || '101',
    shuffleQuestionsInPart,
    shufflePart1Options,
    shufflePart2Statements,
  });

  const handleGeneratePreviewOnly = () => {
    if (sourceQuestions.length === 0) {
      setParseError('Vui lòng tải lên file đề thi .docx hoặc chọn một đề thi trước khi xáo.');
      return;
    }
    setParseError(null);
    setExportNotice(null);
    const nextBundle = generateShuffledExamBundle(
      sourceQuestions,
      meta,
      buildCurrentShuffleOptions()
    );
    setBundle(nextBundle);
    setSelectedVariantCode(nextBundle.variants[0]?.variantCode || '');
    setPreviewTab('matrix');
  };

  const handleShuffleAndExportZip = async () => {
    if (sourceQuestions.length === 0) {
      setParseError('Vui lòng tải lên file đề thi .docx hoặc chọn một đề thi trước khi xuất.');
      return;
    }

    setIsExporting(true);
    setParseError(null);
    setExportNotice(null);
    setExportProgress({ percent: 8, message: 'Đang xáo trộn câu hỏi theo từng phần GDPT 2018...' });

    try {
      const nextBundle = generateShuffledExamBundle(
        sourceQuestions,
        meta,
        buildCurrentShuffleOptions()
      );
      setBundle(nextBundle);
      setSelectedVariantCode(nextBundle.variants[0]?.variantCode || '');

      const result = await exportShuffledExamBundleAsZip(nextBundle, (percent, message) => {
        setExportProgress({ percent, message });
      });

      setPreviewTab('matrix');
      setExportNotice({
        type: 'success',
        message: `Đã tải về gói ${result.fileName} gồm ${nextBundle.variants.length} đề thi (.docx) và 01 bảng đáp án tổng hợp.`,
      });
    } catch (err) {
      console.error('[ShuffleExamTab] Export ZIP error:', err);
      setExportNotice({
        type: 'error',
        message:
          err instanceof Error
            ? `Không thể xuất tệp Word: ${err.message}`
            : 'Đã xảy ra lỗi khi tạo tệp Word (.docx). Vui lòng thử lại.',
      });
    } finally {
      setIsExporting(false);
    }
  };

  const handleDownloadSingleVariant = async (variantCode: string) => {
    if (!bundle) return;
    const target = bundle.variants.find((v) => v.variantCode === variantCode);
    if (!target) return;
    try {
      await downloadSingleVariantDocx(target, bundle.meta);
    } catch (err) {
      setExportNotice({
        type: 'error',
        message:
          err instanceof Error ? err.message : `Không thể tải file De_${variantCode}.docx.`,
      });
    }
  };

  const handleDownloadAnswerMatrix = async () => {
    if (!bundle) return;
    try {
      await downloadConsolidatedAnswerKeyDocx(bundle);
    } catch (err) {
      setExportNotice({
        type: 'error',
        message:
          err instanceof Error ? err.message : 'Không thể tải file Bang_Dap_An_Tong_Hop.docx.',
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Title & Quiet Context Strip */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Xáo đề thi &amp; Xuất file Word
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Trộn đề chuẩn cấu trúc CT GDPT 2018 (Phần I, II, III độc lập) và xuất trọn bộ file
            .docx khổ A4 kèm bảng ma trận đáp án tổng hợp.
          </p>
        </div>

        {sourceQuestions.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 tabular-nums">
            <span className="font-semibold text-slate-900">{sourceQuestions.length} câu</span>
            <span aria-hidden="true">·</span>
            <span>Phần I: {groupedSource.part1.length}</span>
            <span aria-hidden="true">·</span>
            <span>Phần II: {groupedSource.part2.length}</span>
            <span aria-hidden="true">·</span>
            <span>Phần III: {groupedSource.part3.length}</span>
          </div>
        )}
      </div>

      {/* Main 2-Column Workspace */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN: Upload + Print Header + Shuffle Configuration */}
        <div className="xl:col-span-5 space-y-5">
          {/* Step 1: Upload Source DOCX */}
          <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base font-semibold text-slate-900">
                1. Tải đề thi gốc (.docx)
              </h2>
              {sourceQuestions.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearSource}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Xóa đề gốc</span>
                </button>
              )}
            </div>

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
              className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
                isDragging
                  ? 'border-teal-500 bg-teal-50/70'
                  : sourceFileName
                  ? 'border-teal-300 bg-teal-50/30 hover:border-teal-400'
                  : 'border-slate-300 bg-slate-50/60 hover:border-teal-400 hover:bg-slate-50'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".docx"
                onChange={handleFileInputChange}
                className="hidden"
              />

              {isParsing ? (
                <div className="flex flex-col items-center gap-2 py-2">
                  <Loader2 className="w-7 h-7 text-teal-600 animate-spin" />
                  <p className="text-sm font-medium text-slate-800">
                    Đang đọc cấu trúc câu hỏi và bảng đáp án từ file Word...
                  </p>
                </div>
              ) : sourceFileName ? (
                <div className="space-y-1.5">
                  <FileText className="w-7 h-7 text-teal-600 mx-auto" />
                  <p className="text-sm font-semibold text-slate-900 break-words">
                    {sourceFileName}
                  </p>
                  <p className="text-xs text-slate-600 tabular-nums">
                    Đã nhận {sourceQuestions.length} câu hỏi · Nhấn hoặc kéo thả file khác để thay
                    thế
                  </p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <FileUp className="w-7 h-7 text-slate-500 mx-auto" />
                  <p className="text-sm font-semibold text-slate-800">
                    Kéo thả file Word (.docx) vào đây hoặc nhấn để chọn tệp
                  </p>
                  <p className="text-xs text-slate-500">
                    Hỗ trợ đề chuẩn thi 2025: Phần I (4 lựa chọn), Phần II (Đúng/Sai), Phần III
                    (Trả lời ngắn) kèm bảng đáp án
                  </p>
                </div>
              )}
            </div>

            {exams.length > 0 && (
              <div className="pt-1">
                <label
                  htmlFor="shuffle-existing-exam-select"
                  className="block text-xs font-medium text-slate-600 mb-1.5"
                >
                  Hoặc chọn nhanh từ đề đã lưu trong hệ thống
                </label>
                <select
                  id="shuffle-existing-exam-select"
                  value={selectedSystemExamId}
                  onChange={(e) => handleSelectExistingExam(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                >
                  <option value="">-- Chọn đề thi hiện có ({exams.length} đề) --</option>
                  {exams.map((ex) => (
                    <option key={ex.id} value={ex.id}>
                      {ex.title} ({ex.questions?.length || ex.totalQuestions || 0} câu)
                    </option>
                  ))}
                </select>
              </div>
            )}

            {parseError && (
              <div className="flex items-start gap-2.5 p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
                <span>{parseError}</span>
              </div>
            )}

            {sourceQuestions.length > 0 && missingAnswerCount > 0 && (
              <div className="flex items-start gap-2.5 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-xs">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
                <span>
                  Có <strong className="tabular-nums">{missingAnswerCount}</strong> câu hỏi chưa
                  nhận diện được đáp án từ file gốc. Hệ thống vẫn xáo trộn bình thường và đánh dấu{' '}
                  <strong>—</strong> tại các câu này trong bảng đáp án.
                </span>
              </div>
            )}
          </section>

          {/* Step 2: Shuffle Configuration */}
          <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-5">
            <h2 className="text-base font-semibold text-slate-900">2. Cấu hình trộn đề</h2>

            {/* Variant count */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-700">
                Số lượng mã đề cần tạo
              </label>
              <div className="flex flex-wrap items-center gap-2">
                {PRESET_COUNTS.map((cnt) => (
                  <button
                    key={cnt}
                    type="button"
                    onClick={() => setVariantCount(cnt)}
                    className={`px-3.5 py-2 min-h-[40px] rounded-lg text-sm font-semibold tabular-nums border transition-colors ${
                      variantCount === cnt
                        ? 'bg-teal-600 text-white border-teal-600'
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    {cnt} đề
                  </button>
                ))}
                <div className="flex items-center gap-1.5 ml-auto">
                  <span className="text-xs text-slate-500">Tùy chọn:</span>
                  <input
                    type="number"
                    min={1}
                    max={24}
                    value={variantCount}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      setVariantCount(Number.isFinite(val) ? Math.max(1, Math.min(24, val)) : 1);
                    }}
                    aria-label="Số lượng mã đề tùy chỉnh"
                    className="w-16 px-2.5 py-2 text-sm text-center font-semibold tabular-nums border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
              </div>
            </div>

            {/* Code prefix / starting number */}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <label
                  htmlFor="shuffle-code-prefix"
                  className="text-sm font-medium text-slate-700"
                >
                  Tiền tố / Mã đề bắt đầu
                </label>
                <div className="flex items-center gap-1">
                  {PRESET_PREFIXES.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setCodePrefix(p)}
                      className={`px-2 py-1 text-xs font-mono tabular-nums rounded-md border transition-colors ${
                        codePrefix.trim() === p
                          ? 'bg-slate-900 text-white border-slate-900'
                          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              <input
                id="shuffle-code-prefix"
                type="text"
                value={codePrefix}
                onChange={(e) => setCodePrefix(e.target.value)}
                placeholder="Ví dụ: 101, 201 hoặc DE-101"
                className="w-full px-3.5 py-2 text-sm font-mono border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
              />
              <p className="text-xs text-slate-500 font-mono tabular-nums">
                Mã đề sẽ tạo: {previewCodes.join(', ')}
              </p>
            </div>

            {/* Checkboxes */}
            <div className="space-y-2.5 pt-1 border-t border-slate-100">
              <label className="flex items-start gap-3 cursor-pointer py-1">
                <input
                  type="checkbox"
                  checked={shuffleQuestionsInPart}
                  onChange={(e) => setShuffleQuestionsInPart(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                />
                <span className="text-sm text-slate-800">
                  <span className="font-medium">Đảo câu hỏi trong từng phần</span>
                  <span className="block text-xs text-slate-500">
                    Giữ nguyên ranh giới Phần I, Phần II, Phần III — không làm lẫn câu giữa các phần
                  </span>
                </span>
              </label>

              <label className="flex items-start gap-3 cursor-pointer py-1">
                <input
                  type="checkbox"
                  checked={shufflePart1Options}
                  onChange={(e) => setShufflePart1Options(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                />
                <span className="text-sm text-slate-800">
                  <span className="font-medium">Đảo đáp án A, B, C, D (Phần I)</span>
                  <span className="block text-xs text-slate-500">
                    Xáo trộn 4 phương án và tự động cập nhật đúng key đáp án mới
                  </span>
                </span>
              </label>

              <label className="flex items-start gap-3 cursor-pointer py-1">
                <input
                  type="checkbox"
                  checked={shufflePart2Statements}
                  onChange={(e) => setShufflePart2Statements(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                />
                <span className="text-sm text-slate-800">
                  <span className="font-medium">Đảo thứ tự ý a, b, c, d (Phần II)</span>
                  <span className="block text-xs text-slate-500">
                    Đảo 4 mệnh đề con và bảo toàn chính xác trạng thái Đúng / Sai sau khi đảo
                  </span>
                </span>
              </label>
            </div>
          </section>

          {/* Step 3: Word Header Info */}
          <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-3.5">
            <h2 className="text-base font-semibold text-slate-900">
              3. Thông tin đầu đề Word (Khổ A4 · Times New Roman 12pt)
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Đơn vị chủ quản
                </label>
                <input
                  type="text"
                  value={meta.departmentName || ''}
                  onChange={(e) => setMeta({ ...meta, departmentName: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Tên trường / Đơn vị
                </label>
                <input
                  type="text"
                  value={meta.schoolName}
                  onChange={(e) => setMeta({ ...meta, schoolName: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Tên kỳ thi / Bài kiểm tra
                </label>
                <input
                  type="text"
                  value={meta.examTitle}
                  onChange={(e) => setMeta({ ...meta, examTitle: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Môn thi</label>
                <input
                  type="text"
                  value={meta.subjectName}
                  onChange={(e) => setMeta({ ...meta, subjectName: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Thời gian (phút)
                  </label>
                  <input
                    type="number"
                    min={5}
                    max={300}
                    value={meta.durationMinutes}
                    onChange={(e) =>
                      setMeta({
                        ...meta,
                        durationMinutes: Math.max(5, parseInt(e.target.value, 10) || 45),
                      })
                    }
                    className="w-full px-3 py-2 text-sm tabular-nums border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Năm học</label>
                  <input
                    type="text"
                    value={meta.schoolYear}
                    onChange={(e) => setMeta({ ...meta, schoolYear: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
              </div>
            </div>

            {/* Primary CTA & Preview Trigger */}
            <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row gap-2.5">
              <button
                type="button"
                onClick={handleShuffleAndExportZip}
                disabled={isExporting || isParsing || sourceQuestions.length === 0}
                className="flex-1 inline-flex items-center justify-center gap-2 px-5 py-3 min-h-[46px] rounded-xl bg-teal-600 hover:bg-teal-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-semibold text-sm transition-colors whitespace-nowrap"
              >
                {isExporting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Đang tạo &amp; nén file Word...</span>
                  </>
                ) : (
                  <>
                    <FileArchive className="w-4 h-4" />
                    <span>Bắt đầu xáo &amp; Xuất tệp Word</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleGeneratePreviewOnly}
                disabled={isExporting || isParsing || sourceQuestions.length === 0}
                className="inline-flex items-center justify-center gap-2 px-4 py-3 min-h-[46px] rounded-xl border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed text-slate-800 font-semibold text-sm transition-colors whitespace-nowrap"
              >
                <Shuffle className="w-4 h-4" />
                <span>Xáo xem trước</span>
              </button>
            </div>

            {exportProgress && isExporting && (
              <div className="space-y-1.5 pt-1">
                <div className="flex items-center justify-between text-xs text-slate-600">
                  <span>{exportProgress.message}</span>
                  <span className="font-mono tabular-nums">{exportProgress.percent}%</span>
                </div>
                <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-teal-600 transition-all duration-200"
                    style={{ width: `${exportProgress.percent}%` }}
                  />
                </div>
              </div>
            )}

            {exportNotice && (
              <div
                className={`flex items-start gap-2.5 p-3 rounded-lg text-xs border ${
                  exportNotice.type === 'success'
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                    : 'bg-rose-50 border-rose-200 text-rose-800'
                }`}
              >
                {exportNotice.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
                ) : (
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
                )}
                <span>{exportNotice.message}</span>
              </div>
            )}
          </section>
        </div>

        {/* RIGHT COLUMN: Inspection & Live Answer Matrix Preview */}
        <div className="xl:col-span-7 bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col">
          {/* Segmented View Bar */}
          <div className="px-5 py-3.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
              <button
                type="button"
                onClick={() => setPreviewTab('source')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                  previewTab === 'source'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Đề gốc ({sourceQuestions.length})
              </button>
              <button
                type="button"
                onClick={() => setPreviewTab('matrix')}
                disabled={!bundle}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap disabled:opacity-45 ${
                  previewTab === 'matrix'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Ma trận đáp án {bundle ? `(${bundle.variants.length} mã)` : ''}
              </button>
              <button
                type="button"
                onClick={() => setPreviewTab('variants')}
                disabled={!bundle}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap disabled:opacity-45 ${
                  previewTab === 'variants'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Xem từng mã đề
              </button>
            </div>

            {bundle && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleDownloadAnswerMatrix}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-teal-600" />
                  <span>Tải Bảng Đáp Án (.docx)</span>
                </button>
                <button
                  type="button"
                  onClick={handleGeneratePreviewOnly}
                  title="Xáo lại bộ mã đề mới"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Xáo lại</span>
                </button>
              </div>
            )}
          </div>

          {/* Panel Content */}
          <div className="p-5 min-h-[520px] max-h-[780px] overflow-y-auto">
            {/* Empty State */}
            {sourceQuestions.length === 0 ? (
              <div className="h-[440px] flex flex-col items-center justify-center text-center px-6">
                <div className="w-12 h-12 rounded-xl bg-slate-100 text-slate-500 flex items-center justify-center mb-4">
                  <Shuffle className="w-6 h-6" />
                </div>
                <h3 className="text-base font-semibold text-slate-900">
                  Chưa có đề thi gốc để xáo trộn
                </h3>
                <p className="mt-1.5 text-sm text-slate-500 max-w-md">
                  Tải tệp Word (.docx) chuẩn cấu trúc 3 phần ở cột bên trái hoặc chọn một đề đã
                  soạn sẵn để xem phân nhóm câu hỏi và xuất trọn bộ mã đề in khổ A4.
                </p>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="mt-5 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold transition-colors"
                >
                  <FileUp className="w-4 h-4" />
                  <span>Chọn file đề gốc (.docx)</span>
                </button>
              </div>
            ) : previewTab === 'source' ? (
              /* SOURCE QUESTIONS REVIEW */
              <div className="space-y-6">
                {/* Part I Source */}
                {groupedSource.part1.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-baseline justify-between border-b border-slate-200 pb-2">
                      <h3 className="text-sm font-bold text-slate-900">
                        PHẦN I. Trắc nghiệm nhiều phương án lựa chọn
                      </h3>
                      <span className="text-xs text-slate-500 tabular-nums">
                        {groupedSource.part1.length} câu
                      </span>
                    </div>
                    <div className="divide-y divide-slate-100">
                      {groupedSource.part1.map((q, idx) => {
                        const ansKey =
                          q.correctOptionIds && q.correctOptionIds.length > 1
                            ? q.correctOptionIds.join(', ')
                            : q.correctOptionId ||
                              q.options?.find((o) => o.isCorrect)?.id ||
                              '—';
                        return (
                          <div key={q.id || idx} className="py-3 space-y-2">
                            <div className="flex items-start justify-between gap-3">
                              <div className="text-sm text-slate-800 leading-relaxed">
                                <span className="font-semibold text-slate-900 mr-1.5 tabular-nums">
                                  Câu {idx + 1}.
                                </span>
                                <ChemRenderer content={q.content} className="inline" />
                              </div>
                              <span
                                className={`text-xs font-mono font-semibold shrink-0 tabular-nums ${
                                  ansKey === '—' ? 'text-amber-600' : 'text-teal-700'
                                }`}
                              >
                                ĐA: {ansKey}
                              </span>
                            </div>
                            {Array.isArray(q.options) && q.options.length > 0 && (
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 pl-4 text-xs text-slate-700">
                                {q.options.map((opt) => {
                                  const isRight =
                                    Boolean(opt.isCorrect) ||
                                    q.correctOptionId?.toUpperCase() === opt.id.toUpperCase() ||
                                    Boolean(
                                      q.correctOptionIds?.some(
                                        (id) => id.toUpperCase() === opt.id.toUpperCase()
                                      )
                                    );
                                  return (
                                    <div
                                      key={opt.id}
                                      className={isRight ? 'font-semibold text-teal-800' : ''}
                                    >
                                      <span className="mr-1">{opt.id}.</span>
                                      <ChemRenderer content={opt.text} className="inline" />
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Part II Source */}
                {groupedSource.part2.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-baseline justify-between border-b border-slate-200 pb-2">
                      <h3 className="text-sm font-bold text-slate-900">
                        PHẦN II. Trắc nghiệm Đúng / Sai
                      </h3>
                      <span className="text-xs text-slate-500 tabular-nums">
                        {groupedSource.part2.length} câu
                      </span>
                    </div>
                    <div className="divide-y divide-slate-100">
                      {groupedSource.part2.map((q, idx) => (
                        <div key={q.id || idx} className="py-3 space-y-2">
                          <div className="text-sm text-slate-800 leading-relaxed">
                            <span className="font-semibold text-slate-900 mr-1.5 tabular-nums">
                              Câu {idx + 1}.
                            </span>
                            <ChemRenderer content={q.content} className="inline" />
                          </div>
                          {Array.isArray(q.statements) && q.statements.length > 0 && (
                            <div className="space-y-1 pl-4 text-xs text-slate-700">
                              {q.statements.map((st) => (
                                <div
                                  key={st.id}
                                  className="flex items-start justify-between gap-3"
                                >
                                  <div>
                                    <span className="font-semibold mr-1">{st.id})</span>
                                    <ChemRenderer content={st.statement} className="inline" />
                                  </div>
                                  <span
                                    className={`font-mono font-semibold shrink-0 ${
                                      st.correctAnswer ? 'text-emerald-700' : 'text-slate-500'
                                    }`}
                                  >
                                    {st.correctAnswer ? 'Đúng' : 'Sai'}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Part III Source */}
                {groupedSource.part3.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-baseline justify-between border-b border-slate-200 pb-2">
                      <h3 className="text-sm font-bold text-slate-900">
                        PHẦN III. Trắc nghiệm trả lời ngắn
                      </h3>
                      <span className="text-xs text-slate-500 tabular-nums">
                        {groupedSource.part3.length} câu
                      </span>
                    </div>
                    <div className="divide-y divide-slate-100">
                      {groupedSource.part3.map((q, idx) => {
                        const ans =
                          q.shortAnswerConfig?.acceptableAnswers?.[0] ||
                          (typeof q.shortAnswerConfig?.numericValue === 'number'
                            ? String(q.shortAnswerConfig.numericValue)
                            : '—');
                        return (
                          <div
                            key={q.id || idx}
                            className="py-3 flex items-start justify-between gap-3"
                          >
                            <div className="text-sm text-slate-800 leading-relaxed">
                              <span className="font-semibold text-slate-900 mr-1.5 tabular-nums">
                                Câu {idx + 1}.
                              </span>
                              <ChemRenderer content={q.content} className="inline" />
                            </div>
                            <span
                              className={`text-xs font-mono font-semibold shrink-0 tabular-nums ${
                                ans === '—' ? 'text-amber-600' : 'text-teal-700'
                              }`}
                            >
                              ĐA: {ans}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            ) : previewTab === 'matrix' && bundle ? (
              /* CONSOLIDATED ANSWER MATRIX */
              <div className="space-y-6">
                {/* Direct Download Strip per Variant */}
                <div className="flex flex-wrap items-center gap-2 pb-3 border-b border-slate-200">
                  <span className="text-xs font-medium text-slate-600 mr-1">Tải lẻ từng đề:</span>
                  {bundle.variants.map((v) => (
                    <button
                      key={v.variantCode}
                      type="button"
                      onClick={() => handleDownloadSingleVariant(v.variantCode)}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-mono font-semibold text-slate-700 bg-slate-50 hover:bg-teal-50 hover:text-teal-800 border border-slate-200 rounded-lg transition-colors"
                    >
                      <Download className="w-3 h-3" />
                      <span>De_{v.variantCode}.docx</span>
                    </button>
                  ))}
                </div>

                {/* Part I Matrix Table */}
                {bundle.sourceCounts.part1 > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-sm font-bold text-slate-900">
                      Phần I · Ma trận đáp án nhiều lựa chọn ({bundle.sourceCounts.part1} câu)
                    </h3>
                    <div className="overflow-x-auto border border-slate-200 rounded-lg">
                      <table className="w-full text-xs text-center border-collapse">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200 text-slate-700">
                            <th className="py-2.5 px-3 font-semibold text-left border-r border-slate-200">
                              Câu
                            </th>
                            {bundle.variants.map((v) => (
                              <th
                                key={v.variantCode}
                                className="py-2.5 px-3 font-mono font-semibold"
                              >
                                Mã {v.variantCode}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-mono tabular-nums">
                          {Array.from({ length: bundle.sourceCounts.part1 }, (_, i) => i + 1).map(
                            (qNum) => (
                              <tr key={qNum} className="hover:bg-slate-50/70">
                                <td className="py-2 px-3 text-left font-semibold text-slate-700 border-r border-slate-200">
                                  Câu {qNum}
                                </td>
                                {bundle.variants.map((v) => (
                                  <td
                                    key={v.variantCode}
                                    className="py-2 px-3 font-semibold text-slate-900"
                                  >
                                    {v.part1Answers[qNum] || '—'}
                                  </td>
                                ))}
                              </tr>
                            )
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Part II Matrix Table */}
                {bundle.sourceCounts.part2 > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-sm font-bold text-slate-900">
                      Phần II · Ma trận đáp án Đúng / Sai ({bundle.sourceCounts.part2} câu)
                    </h3>
                    <div className="overflow-x-auto border border-slate-200 rounded-lg">
                      <table className="w-full text-xs text-center border-collapse">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200 text-slate-700">
                            <th className="py-2.5 px-3 font-semibold text-left border-r border-slate-200">
                              Câu
                            </th>
                            {bundle.variants.map((v) => (
                              <th
                                key={v.variantCode}
                                className="py-2.5 px-3 font-mono font-semibold"
                              >
                                Mã {v.variantCode}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-mono tabular-nums">
                          {Array.from({ length: bundle.sourceCounts.part2 }, (_, i) => i + 1).map(
                            (qNum) => (
                              <tr key={qNum} className="hover:bg-slate-50/70">
                                <td className="py-2 px-3 text-left font-semibold text-slate-700 border-r border-slate-200">
                                  Câu {qNum}
                                </td>
                                {bundle.variants.map((v) => (
                                  <td key={v.variantCode} className="py-2 px-3 text-slate-900">
                                    {formatPart2AnswerCompact(v.part2Answers[qNum])}
                                  </td>
                                ))}
                              </tr>
                            )
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Part III Matrix Table */}
                {bundle.sourceCounts.part3 > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-sm font-bold text-slate-900">
                      Phần III · Ma trận đáp án Trả lời ngắn ({bundle.sourceCounts.part3} câu)
                    </h3>
                    <div className="overflow-x-auto border border-slate-200 rounded-lg">
                      <table className="w-full text-xs text-center border-collapse">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200 text-slate-700">
                            <th className="py-2.5 px-3 font-semibold text-left border-r border-slate-200">
                              Câu
                            </th>
                            {bundle.variants.map((v) => (
                              <th
                                key={v.variantCode}
                                className="py-2.5 px-3 font-mono font-semibold"
                              >
                                Mã {v.variantCode}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-mono tabular-nums">
                          {Array.from({ length: bundle.sourceCounts.part3 }, (_, i) => i + 1).map(
                            (qNum) => (
                              <tr key={qNum} className="hover:bg-slate-50/70">
                                <td className="py-2 px-3 text-left font-semibold text-slate-700 border-r border-slate-200">
                                  Câu {qNum}
                                </td>
                                {bundle.variants.map((v) => (
                                  <td
                                    key={v.variantCode}
                                    className="py-2 px-3 font-semibold text-slate-900"
                                  >
                                    {v.part3Answers[qNum] || '—'}
                                  </td>
                                ))}
                              </tr>
                            )
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            ) : previewTab === 'variants' && bundle && activeVariant ? (
              /* INDIVIDUAL VARIANT PREVIEW */
              <div className="space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {bundle.variants.map((v) => (
                      <button
                        key={v.variantCode}
                        type="button"
                        onClick={() => setSelectedVariantCode(v.variantCode)}
                        className={`px-3 py-1.5 text-xs font-mono font-semibold rounded-lg border transition-colors ${
                          activeVariant.variantCode === v.variantCode
                            ? 'bg-teal-600 text-white border-teal-600'
                            : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        Mã {v.variantCode}
                      </button>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={() => handleDownloadSingleVariant(activeVariant.variantCode)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-teal-800 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg transition-colors whitespace-nowrap"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Tải De_{activeVariant.variantCode}.docx</span>
                  </button>
                </div>

                {/* Variant Part I */}
                {activeVariant.part1.length > 0 && (
                  <div className="space-y-2.5">
                    <h3 className="text-sm font-bold text-slate-900">
                      PHẦN I. Trắc nghiệm nhiều phương án lựa chọn
                    </h3>
                    <div className="divide-y divide-slate-100">
                      {activeVariant.part1.map((item) => (
                        <div key={item.newNumber} className="py-2.5 space-y-1.5">
                          <div className="flex items-start justify-between gap-3">
                            <div className="text-sm text-slate-800">
                              <span className="font-semibold text-slate-900 mr-1.5 tabular-nums">
                                Câu {item.newNumber}.
                              </span>
                              <ChemRenderer content={item.question.content} className="inline" />
                            </div>
                            <span className="text-xs font-mono text-slate-500 shrink-0 tabular-nums">
                              Gốc #{item.originalPartIndex} · ĐA:{' '}
                              <strong className="text-teal-700">
                                {activeVariant.part1Answers[item.newNumber]}
                              </strong>
                            </span>
                          </div>
                          {item.question.options && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 pl-4 text-xs text-slate-700">
                              {item.question.options.map((opt) => (
                                <div
                                  key={opt.id}
                                  className={opt.isCorrect ? 'font-semibold text-teal-800' : ''}
                                >
                                  <span className="mr-1">{opt.id}.</span>
                                  <ChemRenderer content={opt.text} className="inline" />
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Variant Part II */}
                {activeVariant.part2.length > 0 && (
                  <div className="space-y-2.5">
                    <h3 className="text-sm font-bold text-slate-900">
                      PHẦN II. Trắc nghiệm Đúng / Sai
                    </h3>
                    <div className="divide-y divide-slate-100">
                      {activeVariant.part2.map((item) => (
                        <div key={item.newNumber} className="py-2.5 space-y-1.5">
                          <div className="flex items-start justify-between gap-3">
                            <div className="text-sm text-slate-800">
                              <span className="font-semibold text-slate-900 mr-1.5 tabular-nums">
                                Câu {item.newNumber}.
                              </span>
                              <ChemRenderer content={item.question.content} className="inline" />
                            </div>
                            <span className="text-xs font-mono text-slate-500 shrink-0 tabular-nums">
                              Gốc #{item.originalPartIndex}
                            </span>
                          </div>
                          {item.question.statements && (
                            <div className="space-y-1 pl-4 text-xs text-slate-700">
                              {item.question.statements.map((st) => (
                                <div
                                  key={st.id}
                                  className="flex items-start justify-between gap-3"
                                >
                                  <div>
                                    <span className="font-semibold mr-1">{st.id})</span>
                                    <ChemRenderer content={st.statement} className="inline" />
                                  </div>
                                  <span
                                    className={`font-mono font-semibold shrink-0 ${
                                      st.correctAnswer ? 'text-emerald-700' : 'text-slate-500'
                                    }`}
                                  >
                                    {st.correctAnswer ? 'Đ' : 'S'}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Variant Part III */}
                {activeVariant.part3.length > 0 && (
                  <div className="space-y-2.5">
                    <h3 className="text-sm font-bold text-slate-900">
                      PHẦN III. Trắc nghiệm trả lời ngắn
                    </h3>
                    <div className="divide-y divide-slate-100">
                      {activeVariant.part3.map((item) => (
                        <div
                          key={item.newNumber}
                          className="py-2.5 flex items-start justify-between gap-3"
                        >
                          <div className="text-sm text-slate-800">
                            <span className="font-semibold text-slate-900 mr-1.5 tabular-nums">
                              Câu {item.newNumber}.
                            </span>
                            <ChemRenderer content={item.question.content} className="inline" />
                          </div>
                          <span className="text-xs font-mono text-slate-500 shrink-0 tabular-nums">
                            Gốc #{item.originalPartIndex} · ĐA:{' '}
                            <strong className="text-teal-700">
                              {activeVariant.part3Answers[item.newNumber]}
                            </strong>
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
};
