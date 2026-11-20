import React, { useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  History,
  Loader2,
  RefreshCw,
  ShieldAlert,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  CurriculumConfig,
  CurriculumImportMode,
  CurriculumLesson,
  SubjectItem,
} from '../../types';
import {
  downloadCurriculumTemplateExcel,
  executeCurriculumImportOnServer,
  parseCurriculumExcelOrCsvFile,
  type CurriculumImportExecutionResult,
  type CurriculumImportProgress,
  type ParsedCurriculumSpreadsheet,
} from '../../services/curriculumService';
import { planCurriculumImport } from '../../utils/curriculumImportEngine';

interface CurriculumImportModalProps {
  isOpen: boolean;
  subjects: SubjectItem[];
  existingLessons: CurriculumLesson[];
  curriculumConfig: CurriculumConfig | null;
  configuredTextbooks: string[];
  defaultTextbookYear: string;
  adminUid: string;
  onClose: () => void;
  onImportSuccess: () => Promise<void> | void;
  onOpenHistory: () => void;
}

type WizardStep = 'upload' | 'preview' | 'importing' | 'result';
type PreviewTab = 'valid' | 'errors' | 'duplicates' | 'missing';

export const CurriculumImportModal: React.FC<CurriculumImportModalProps> = ({
  isOpen,
  subjects,
  existingLessons,
  curriculumConfig,
  configuredTextbooks,
  defaultTextbookYear,
  adminUid,
  onClose,
  onImportSuccess,
  onOpenHistory,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [step, setStep] = useState<WizardStep>('upload');
  const [mode, setMode] = useState<CurriculumImportMode>('append');
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [isParsing, setIsParsing] = useState<boolean>(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedCurriculumSpreadsheet | null>(null);

  const [activeTab, setActiveTab] = useState<PreviewTab>('valid');
  const [allowSkipInvalidRows, setAllowSkipInvalidRows] = useState<boolean>(false);
  const [confirmDeleteMissing, setConfirmDeleteMissing] = useState<boolean>(false);
  const [selectedMissingIds, setSelectedMissingIds] = useState<Record<string, boolean>>({});

  const [progress, setProgress] = useState<CurriculumImportProgress>({
    percent: 0,
    processedRows: 0,
    totalRows: 0,
    currentBatch: 0,
    totalBatches: 1,
    statusText: '',
  });
  const [importError, setImportError] = useState<string | null>(null);
  const [result, setResult] = useState<CurriculumImportExecutionResult | null>(null);

  const importPlan = useMemo(() => {
    if (!parsed) return null;
    return planCurriculumImport(parsed.validation.validRows, existingLessons, mode, adminUid);
  }, [parsed, existingLessons, mode, adminUid]);

  const selectedMissingIdList = useMemo(() => {
    if (!importPlan) return [];
    return importPlan.missingInFile
      .filter((item) => selectedMissingIds[item.id] === true)
      .map((item) => item.id);
  }, [importPlan, selectedMissingIds]);

  if (!isOpen) return null;

  const resetWizard = () => {
    setStep('upload');
    setParseError(null);
    setParsed(null);
    setActiveTab('valid');
    setAllowSkipInvalidRows(false);
    setConfirmDeleteMissing(false);
    setSelectedMissingIds({});
    setImportError(null);
    setResult(null);
    setProgress({
      percent: 0,
      processedRows: 0,
      totalRows: 0,
      currentBatch: 0,
      totalBatches: 1,
      statusText: '',
    });
  };

  const handleCloseModal = () => {
    if (step === 'importing') return;
    resetWizard();
    onClose();
  };

  const handleProcessFile = async (file: File) => {
    setParseError(null);
    setImportError(null);
    setIsParsing(true);
    try {
      const parsedFile = await parseCurriculumExcelOrCsvFile(file, {
        subjects,
        configuredTextbooks,
        defaultTextbookYear,
      });
      setParsed(parsedFile);
      setAllowSkipInvalidRows(false);
      setConfirmDeleteMissing(false);
      setSelectedMissingIds({});

      if (parsedFile.validation.errors.length > 0) {
        setActiveTab('errors');
      } else if (parsedFile.validation.duplicates.length > 0) {
        setActiveTab('duplicates');
      } else {
        setActiveTab('valid');
      }
      setStep('preview');
    } catch (err) {
      setParseError(
        err instanceof Error
          ? err.message
          : 'Không thể đọc tệp Excel/CSV. Vui lòng kiểm tra lại định dạng tệp.'
      );
    } finally {
      setIsParsing(false);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) {
      void handleProcessFile(file);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      void handleProcessFile(file);
    }
  };

  const hasValidationIssues =
    Boolean(parsed) &&
    ((parsed?.validation.errors.length || 0) > 0 || (parsed?.validation.duplicates.length || 0) > 0);

  const canStartImport =
    Boolean(parsed) &&
    (parsed?.validation.validRows.length || 0) > 0 &&
    (!hasValidationIssues || allowSkipInvalidRows);

  const getProgressWidthClass = (pct: number): string => {
    const clamped = Math.max(5, Math.min(100, pct));
    if (clamped >= 100) return 'w-full';
    if (clamped >= 90) return 'w-11/12';
    if (clamped >= 80) return 'w-5/6';
    if (clamped >= 70) return 'w-3/4';
    if (clamped >= 60) return 'w-2/3';
    if (clamped >= 50) return 'w-1/2';
    if (clamped >= 40) return 'w-2/5';
    if (clamped >= 30) return 'w-1/3';
    if (clamped >= 20) return 'w-1/5';
    return 'w-1/12';
  };

  const handleToggleAllMissing = (checked: boolean) => {
    if (!importPlan) return;
    const next: Record<string, boolean> = {};
    if (checked) {
      importPlan.missingInFile.forEach((item) => {
        next[item.id] = true;
      });
    }
    setSelectedMissingIds(next);
  };

  const handleExecuteImport = async () => {
    if (!parsed || !importPlan || !canStartImport) return;
    setImportError(null);
    setStep('importing');

    try {
      const stats = parsed.validation.stats;
      const execResult = await executeCurriculumImportOnServer(
        {
          fileName: parsed.fileName,
          mode,
          validRows: parsed.validation.validRows,
          subjects,
          configuredTextbooks,
          defaultTextbookYear,
          confirmDeleteMissing: mode === 'sync' && confirmDeleteMissing && selectedMissingIdList.length > 0,
          confirmedDeleteIds:
            mode === 'sync' && confirmDeleteMissing ? selectedMissingIdList : [],
          clientErrorCount: stats.errorRowsCount,
          clientDuplicateCount: stats.duplicateRowsCount,
          statsSummary: {
            subjectsCount: stats.totalSubjects,
            gradesCount: stats.totalGrades,
            chaptersCount: stats.totalChapters,
            lessonsCount: stats.totalLessons,
            textbooks: stats.detectedTextbooks,
          },
        },
        (p) => setProgress(p)
      );

      setResult(execResult);
      setStep('result');
      await onImportSuccess();
    } catch (err) {
      setImportError(
        err instanceof Error
          ? err.message
          : 'Không thể hoàn tất quá trình import dữ liệu lên Firestore.'
      );
      setStep('preview');
    }
  };

  const stepLabels: Array<{ id: WizardStep; num: string; label: string }> = [
    { id: 'upload', num: '1', label: 'Tải file' },
    { id: 'preview', num: '2', label: 'Preview & Kiểm tra' },
    { id: 'importing', num: '3', label: 'Import dữ liệu' },
    { id: 'result', num: '4', label: 'Kết quả' },
  ];

  const stepOrder: WizardStep[] = ['upload', 'preview', 'importing', 'result'];
  const currentStepIdx = stepOrder.indexOf(step);

  const stats = parsed?.validation.stats;

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/65 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Import Excel/CSV Danh mục Chương và Bài học SGK"
    >
      <div className="bg-white w-full max-w-5xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between gap-4 shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-teal-300 text-[11px] font-bold uppercase tracking-wider">
              <FileSpreadsheet className="w-4 h-4 shrink-0" />
              <span>Nhập hàng loạt Danh mục Chương &amp; Bài học SGK</span>
            </div>
            <h2 className="text-base font-bold mt-0.5 truncate">
              {parsed ? `Tệp đang xử lý: ${parsed.fileName}` : 'Import dữ liệu từ Excel (.xlsx) / CSV (.csv)'}
            </h2>
          </div>

          <button
            type="button"
            disabled={step === 'importing'}
            onClick={handleCloseModal}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-40"
            aria-label="Đóng cửa sổ import"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Stepper */}
        <div className="px-6 py-3 bg-slate-50 border-b border-slate-200 shrink-0">
          <div className="grid grid-cols-4 gap-2">
            {stepLabels.map((item, idx) => {
              const isDone = idx < currentStepIdx;
              const isCurrent = idx === currentStepIdx;
              return (
                <div
                  key={item.id}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold ${
                    isCurrent
                      ? 'bg-teal-600 text-white'
                      : isDone
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                      : 'bg-white text-slate-400 border border-slate-200'
                  }`}
                >
                  <span className="tabular-nums font-bold">{item.num}.</span>
                  <span className="truncate">{item.label}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.csv"
          onChange={handleFileInputChange}
          className="hidden"
        />

        {/* Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-5 text-xs">
          {/* STEP 1: UPLOAD */}
          {step === 'upload' && (
            <div className="space-y-5">
              {/* Mode selection */}
              <div className="space-y-2">
                <p className="font-bold text-slate-800 text-xs uppercase tracking-wide">
                  Chọn chế độ Import
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setMode('append')}
                    className={`p-4 rounded-xl border text-left transition-colors ${
                      mode === 'append'
                        ? 'border-teal-600 bg-teal-50/70 ring-1 ring-teal-600'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-slate-900 text-sm">
                        Chế độ 1: Bổ sung dữ liệu
                      </span>
                      <span
                        className={`text-[11px] font-bold ${
                          mode === 'append' ? 'text-teal-700' : 'text-slate-400'
                        }`}
                      >
                        {mode === 'append' ? 'Đang chọn' : 'Khuyên dùng'}
                      </span>
                    </div>
                    <p className="text-slate-600 mt-1 leading-relaxed">
                      Chỉ thêm các chương và bài học chưa có trong hệ thống. Không ghi đè, không tạo trùng lặp và không xóa dữ liệu đang tồn tại.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setMode('sync')}
                    className={`p-4 rounded-xl border text-left transition-colors ${
                      mode === 'sync'
                        ? 'border-blue-600 bg-blue-50/70 ring-1 ring-blue-600'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-slate-900 text-sm">
                        Chế độ 2: Đồng bộ dữ liệu
                      </span>
                      <span
                        className={`text-[11px] font-bold ${
                          mode === 'sync' ? 'text-blue-700' : 'text-slate-400'
                        }`}
                      >
                        {mode === 'sync' ? 'Đang chọn' : 'Cập nhật tên/thứ tự'}
                      </span>
                    </div>
                    <p className="text-slate-600 mt-1 leading-relaxed">
                      Cập nhật tên chương, tên bài học và thứ tự theo mã định danh ổn định. Không tự động xóa dữ liệu cũ — nếu có mục thiếu trong file, hệ thống sẽ cảnh báo và yêu cầu xác nhận riêng.
                    </p>
                  </button>
                </div>
              </div>

              {/* Dropzone */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                className={`rounded-2xl border-2 border-dashed p-8 text-center transition-colors ${
                  isDragging
                    ? 'border-teal-500 bg-teal-50/60'
                    : 'border-slate-300 bg-slate-50/60 hover:border-teal-400'
                }`}
              >
                {isParsing ? (
                  <div className="space-y-2 py-4">
                    <Loader2 className="w-8 h-8 animate-spin text-teal-600 mx-auto" />
                    <p className="font-bold text-slate-800 text-sm">
                      Đang phân tích cấu trúc và kiểm tra dữ liệu tệp...
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="w-12 h-12 rounded-2xl bg-teal-100 text-teal-700 flex items-center justify-center mx-auto">
                      <Upload className="w-6 h-6" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm font-bold text-slate-900">
                        Kéo thả tệp Excel (.xlsx) hoặc CSV (.csv) vào đây
                      </p>
                      <p className="text-xs text-slate-500">
                        Hỗ trợ nhập đồng thời nhiều môn học, nhiều khối lớp (10, 11, 12) và nhiều bộ sách giáo khoa trong cùng một tệp.
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="min-h-[40px] px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-semibold inline-flex items-center gap-2"
                      >
                        <Upload className="w-4 h-4" />
                        <span>Chọn tệp từ máy tính</span>
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          downloadCurriculumTemplateExcel(subjects, {
                            textbookSeries: curriculumConfig?.textbookSeries || '',
                            textbookYear: defaultTextbookYear,
                          })
                        }
                        className="min-h-[40px] px-4 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-semibold inline-flex items-center gap-2"
                      >
                        <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                        <span>Tải file Excel mẫu</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {parseError && (
                <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
                  <span className="font-semibold">{parseError}</span>
                </div>
              )}

              {/* Expected 7-column specification */}
              <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-2">
                <p className="font-bold text-slate-800">
                  Cấu trúc 7 cột chuẩn trong file Excel / CSV mẫu:
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-[11px]">
                    <thead>
                      <tr className="bg-slate-100 text-slate-700">
                        <th className="py-1.5 px-2.5 font-bold">Subject</th>
                        <th className="py-1.5 px-2.5 font-bold">Grade</th>
                        <th className="py-1.5 px-2.5 font-bold">Textbook</th>
                        <th className="py-1.5 px-2.5 font-bold">ChapterOrder</th>
                        <th className="py-1.5 px-2.5 font-bold">ChapterName</th>
                        <th className="py-1.5 px-2.5 font-bold">LessonOrder</th>
                        <th className="py-1.5 px-2.5 font-bold">LessonName</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-t border-slate-200 text-slate-600">
                        <td className="py-1.5 px-2.5">Hóa học</td>
                        <td className="py-1.5 px-2.5 tabular-nums">10</td>
                        <td className="py-1.5 px-2.5">Kết nối tri thức với cuộc sống</td>
                        <td className="py-1.5 px-2.5 tabular-nums">1</td>
                        <td className="py-1.5 px-2.5">Chương 1: Cấu tạo nguyên tử</td>
                        <td className="py-1.5 px-2.5 tabular-nums">1</td>
                        <td className="py-1.5 px-2.5">Bài 1: Thành phần của nguyên tử</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: PREVIEW & VALIDATION */}
          {step === 'preview' && parsed && stats && importPlan && (
            <div className="space-y-4">
              {importError && (
                <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
                  <span className="font-semibold">{importError}</span>
                </div>
              )}

              {parsed.validation.missingRequiredHeaders.length > 0 && (
                <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
                  <div>
                    <p className="font-bold">
                      Tệp thiếu các cột bắt buộc: {parsed.validation.missingRequiredHeaders.join(', ')}
                    </p>
                    <p className="text-[11px] mt-0.5">
                      Vui lòng tải file Excel mẫu chuẩn 7 cột và điền đúng tiêu đề cột trước khi import.
                    </p>
                  </div>
                </div>
              )}

              {/* Mode switch + re-upload */}
              <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold text-slate-700">Chế độ import:</span>
                  <button
                    type="button"
                    onClick={() => {
                      setMode('append');
                      setConfirmDeleteMissing(false);
                    }}
                    className={`px-3 py-1.5 rounded-lg font-semibold transition-colors ${
                      mode === 'append'
                        ? 'bg-teal-600 text-white'
                        : 'bg-white border border-slate-200 text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Chế độ 1: Bổ sung dữ liệu
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode('sync')}
                    className={`px-3 py-1.5 rounded-lg font-semibold transition-colors ${
                      mode === 'sync'
                        ? 'bg-blue-600 text-white'
                        : 'bg-white border border-slate-200 text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Chế độ 2: Đồng bộ dữ liệu
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3 py-1.5 rounded-lg bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 font-semibold inline-flex items-center gap-1.5"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Chọn file khác</span>
                </button>
              </div>

              {/* 7 Mandatory Statistics Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5">
                <div className="p-3 rounded-xl border border-slate-200 bg-white">
                  <p className="text-[11px] text-slate-500">Tổng số môn học</p>
                  <p className="text-lg font-bold text-slate-900 tabular-nums mt-0.5">
                    {stats.totalSubjects}
                  </p>
                </div>
                <div className="p-3 rounded-xl border border-slate-200 bg-white">
                  <p className="text-[11px] text-slate-500">Tổng số lớp</p>
                  <p className="text-lg font-bold text-slate-900 tabular-nums mt-0.5">
                    {stats.totalGrades}
                  </p>
                </div>
                <div className="p-3 rounded-xl border border-slate-200 bg-white">
                  <p className="text-[11px] text-slate-500">Tổng số chương</p>
                  <p className="text-lg font-bold text-slate-900 tabular-nums mt-0.5">
                    {stats.totalChapters}
                  </p>
                </div>
                <div className="p-3 rounded-xl border border-slate-200 bg-white">
                  <p className="text-[11px] text-slate-500">Tổng số bài học</p>
                  <p className="text-lg font-bold text-slate-900 tabular-nums mt-0.5">
                    {stats.totalLessons}
                  </p>
                </div>
                <div className="p-3 rounded-xl border border-emerald-200 bg-emerald-50/70">
                  <p className="text-[11px] text-emerald-800 font-medium">Số dòng hợp lệ</p>
                  <p className="text-lg font-bold text-emerald-900 tabular-nums mt-0.5">
                    {stats.validRowsCount}
                  </p>
                </div>
                <div
                  className={`p-3 rounded-xl border ${
                    stats.errorRowsCount > 0
                      ? 'border-rose-200 bg-rose-50/70'
                      : 'border-slate-200 bg-white'
                  }`}
                >
                  <p
                    className={`text-[11px] font-medium ${
                      stats.errorRowsCount > 0 ? 'text-rose-800' : 'text-slate-500'
                    }`}
                  >
                    Số dòng lỗi
                  </p>
                  <p
                    className={`text-lg font-bold tabular-nums mt-0.5 ${
                      stats.errorRowsCount > 0 ? 'text-rose-700' : 'text-slate-900'
                    }`}
                  >
                    {stats.errorRowsCount}
                  </p>
                </div>
                <div
                  className={`p-3 rounded-xl border ${
                    stats.duplicateRowsCount > 0
                      ? 'border-amber-200 bg-amber-50/70'
                      : 'border-slate-200 bg-white'
                  }`}
                >
                  <p
                    className={`text-[11px] font-medium ${
                      stats.duplicateRowsCount > 0 ? 'text-amber-800' : 'text-slate-500'
                    }`}
                  >
                    Dữ liệu trùng lặp
                  </p>
                  <p
                    className={`text-lg font-bold tabular-nums mt-0.5 ${
                      stats.duplicateRowsCount > 0 ? 'text-amber-800' : 'text-slate-900'
                    }`}
                  >
                    {stats.duplicateRowsCount}
                  </p>
                </div>
              </div>

              {/* Execution Diff Strip */}
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-2.5 rounded-xl bg-slate-900 text-white text-xs">
                <span className="font-semibold text-slate-300">Dự kiến ghi Firestore:</span>
                <span className="tabular-nums font-bold text-emerald-400">
                  + {importPlan.toAdd.length} thêm mới
                </span>
                <span className="tabular-nums font-bold text-sky-400">
                  ~ {importPlan.toUpdate.length} cập nhật
                </span>
                <span className="tabular-nums font-semibold text-slate-300">
                  {importPlan.skipped.length} bỏ qua (đã khớp/đã có)
                </span>
                {mode === 'sync' && importPlan.missingInFile.length > 0 && (
                  <span className="tabular-nums font-bold text-amber-300">
                    {importPlan.missingInFile.length} bài cũ không có trong file (được giữ nguyên)
                  </span>
                )}
                {stats.detectedTextbooks.length > 0 && (
                  <span className="text-slate-400 ml-auto truncate">
                    Bộ sách: {stats.detectedTextbooks.join(', ')}
                  </span>
                )}
              </div>

              {/* Error / Duplicate Protection Warning */}
              {hasValidationIssues && (
                <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 space-y-2.5">
                  <div className="flex items-start gap-2.5 text-rose-900">
                    <ShieldAlert className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <p className="font-bold">
                        Phát hiện {stats.errorRowsCount} dòng lỗi và {stats.duplicateRowsCount} dòng trùng lặp trong file.
                      </p>
                      <p className="text-rose-800">
                        Hệ thống <strong>tuyệt đối không ghi</strong> các dòng lỗi hoặc dòng trùng lên Firestore. Bạn nên sửa lại file và tải lên lại, hoặc chỉ xác nhận nhập các dòng hợp lệ.
                      </p>
                    </div>
                  </div>
                  {stats.validRowsCount > 0 && (
                    <label className="inline-flex items-start gap-2 cursor-pointer text-rose-900 font-semibold pt-1">
                      <input
                        type="checkbox"
                        checked={allowSkipInvalidRows}
                        onChange={(e) => setAllowSkipInvalidRows(e.target.checked)}
                        className="mt-0.5 rounded border-rose-400 text-rose-600 focus:ring-rose-500"
                      />
                      <span>
                        Tôi đã kiểm tra danh sách lỗi/trùng lặp và xác nhận chỉ import{' '}
                        {stats.validRowsCount} dòng hợp lệ (bỏ qua toàn bộ{' '}
                        {stats.errorRowsCount + stats.duplicateRowsCount} dòng lỗi/trùng).
                      </span>
                    </label>
                  )}
                </div>
              )}

              {/* Preview Tabs */}
              <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-200 pb-2">
                <button
                  type="button"
                  onClick={() => setActiveTab('valid')}
                  className={`px-3 py-1.5 rounded-lg font-semibold tabular-nums ${
                    activeTab === 'valid'
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  Xem trước dữ liệu ({importPlan.items.length})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('errors')}
                  className={`px-3 py-1.5 rounded-lg font-semibold tabular-nums ${
                    activeTab === 'errors'
                      ? 'bg-rose-600 text-white'
                      : stats.errorRowsCount > 0
                      ? 'text-rose-700 bg-rose-50 hover:bg-rose-100'
                      : 'text-slate-500 hover:bg-slate-100'
                  }`}
                >
                  Dòng lỗi ({stats.errorRowsCount})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('duplicates')}
                  className={`px-3 py-1.5 rounded-lg font-semibold tabular-nums ${
                    activeTab === 'duplicates'
                      ? 'bg-amber-600 text-white'
                      : stats.duplicateRowsCount > 0
                      ? 'text-amber-800 bg-amber-50 hover:bg-amber-100'
                      : 'text-slate-500 hover:bg-slate-100'
                  }`}
                >
                  Trùng lặp ({stats.duplicateRowsCount})
                </button>
                {mode === 'sync' && importPlan.missingInFile.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setActiveTab('missing')}
                    className={`px-3 py-1.5 rounded-lg font-semibold tabular-nums ${
                      activeTab === 'missing'
                        ? 'bg-amber-700 text-white'
                        : 'text-amber-900 bg-amber-100 hover:bg-amber-200'
                    }`}
                  >
                    Cảnh báo thiếu trong file ({importPlan.missingInFile.length})
                  </button>
                )}
              </div>

              {/* TAB: VALID PREVIEW */}
              {activeTab === 'valid' && (
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  {importPlan.items.length === 0 ? (
                    <div className="p-8 text-center text-slate-500">
                      Không có dòng hợp lệ nào để hiển thị.
                    </div>
                  ) : (
                    <div className="overflow-x-auto max-h-72 overflow-y-auto">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 text-slate-600 z-10">
                          <tr>
                            <th className="py-2 px-3">Dòng</th>
                            <th className="py-2 px-3">Môn học</th>
                            <th className="py-2 px-3">Lớp</th>
                            <th className="py-2 px-3">Bộ sách</th>
                            <th className="py-2 px-3">Chương</th>
                            <th className="py-2 px-3">Bài học</th>
                            <th className="py-2 px-3">Thao tác</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {importPlan.items.slice(0, 150).map((item) => (
                            <tr key={`${item.rowNumber}_${item.lesson.id}`} className="hover:bg-slate-50/70">
                              <td className="py-2 px-3 font-mono text-slate-500 tabular-nums">
                                {item.rowNumber}
                              </td>
                              <td className="py-2 px-3 font-medium text-slate-900">
                                {item.lesson.subjectName}
                              </td>
                              <td className="py-2 px-3 tabular-nums">{item.lesson.grade}</td>
                              <td className="py-2 px-3 text-slate-600">{item.lesson.textbookSeries}</td>
                              <td className="py-2 px-3 text-slate-700">
                                <span className="font-mono text-[11px] text-slate-400 mr-1">
                                  #{item.lesson.chapterOrder}
                                </span>
                                {item.lesson.chapterName}
                              </td>
                              <td className="py-2 px-3 font-semibold text-slate-900">
                                <span className="font-mono text-[11px] text-slate-400 mr-1">
                                  #{item.lesson.lessonOrder}
                                </span>
                                {item.lesson.lessonName}
                              </td>
                              <td className="py-2 px-3 whitespace-nowrap">
                                {item.action === 'add' ? (
                                  <span className="font-bold text-emerald-700">Thêm mới</span>
                                ) : item.action === 'update' ? (
                                  <span className="font-bold text-blue-700">Cập nhật</span>
                                ) : (
                                  <span className="font-medium text-slate-500">Bỏ qua</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {importPlan.items.length > 150 && (
                        <div className="px-4 py-2 bg-slate-50 border-t border-slate-200 text-[11px] text-slate-500 text-center">
                          Đang hiển thị 150 / {importPlan.items.length} dòng hợp lệ đầu tiên. Toàn bộ{' '}
                          {importPlan.items.length} dòng hợp lệ sẽ được xử lý khi nhấn Xác nhận Import.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* TAB: ERRORS */}
              {activeTab === 'errors' && (
                <div className="border border-rose-200 rounded-xl overflow-hidden">
                  {parsed.validation.errors.length === 0 ? (
                    <div className="p-8 text-center text-emerald-700 font-semibold">
                      Không phát hiện dòng lỗi định dạng nào trong file.
                    </div>
                  ) : (
                    <div className="max-h-72 overflow-y-auto divide-y divide-rose-100">
                      {parsed.validation.errors.map((err, i) => (
                        <div key={`${err.rowNumber}_${i}`} className="px-4 py-2.5 bg-white space-y-0.5">
                          <div className="text-rose-800">
                            <strong className="font-mono">Dòng {err.rowNumber}:</strong> {err.message}
                          </div>
                          {err.rawSummary && (
                            <p className="text-[11px] text-slate-500 truncate">{err.rawSummary}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* TAB: DUPLICATES */}
              {activeTab === 'duplicates' && (
                <div className="border border-amber-200 rounded-xl overflow-hidden">
                  {parsed.validation.duplicates.length === 0 ? (
                    <div className="p-8 text-center text-emerald-700 font-semibold">
                      Không phát hiện dữ liệu trùng lặp nội bộ trong file.
                    </div>
                  ) : (
                    <div className="max-h-72 overflow-y-auto divide-y divide-amber-100">
                      {parsed.validation.duplicates.map((dup, i) => (
                        <div key={`${dup.rowNumber}_${i}`} className="px-4 py-2.5 bg-white space-y-0.5">
                          <div className="text-amber-900">
                            <strong className="font-mono">Dòng {dup.rowNumber}:</strong> {dup.message}
                          </div>
                          {dup.rawSummary && (
                            <p className="text-[11px] text-slate-500 truncate">{dup.rawSummary}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* TAB: MISSING IN FILE (SYNC MODE WARNING) */}
              {activeTab === 'missing' && mode === 'sync' && importPlan.missingInFile.length > 0 && (
                <div className="border border-amber-300 rounded-xl overflow-hidden bg-amber-50/40">
                  <div className="px-4 py-3 bg-amber-100/80 border-b border-amber-200 space-y-2">
                    <div className="flex items-start gap-2 text-amber-950">
                      <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-bold">
                          Cảnh báo: Có {importPlan.missingInFile.length} bài học đang tồn tại trên hệ thống nhưng không xuất hiện trong file đồng bộ.
                        </p>
                        <p className="text-[11px] text-amber-900 mt-0.5">
                          Hệ thống <strong>không tự động xóa</strong> các dữ liệu này để bảo vệ câu hỏi và đề thi cũ. Nếu bạn thực sự muốn xóa bớt các mục thừa, hãy chọn cụ thể từng mục và đánh dấu xác nhận riêng bên dưới.
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                      <label className="inline-flex items-center gap-2 font-semibold text-amber-950 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={confirmDeleteMissing}
                          onChange={(e) => setConfirmDeleteMissing(e.target.checked)}
                          className="rounded border-amber-500 text-rose-600 focus:ring-rose-500"
                        />
                        <span>
                          Xác nhận riêng: Cho phép xóa các bài học đã đánh dấu bên dưới ({selectedMissingIdList.length} mục)
                        </span>
                      </label>

                      {confirmDeleteMissing && (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleToggleAllMissing(true)}
                            className="text-[11px] font-semibold text-amber-900 underline"
                          >
                            Chọn tất cả
                          </button>
                          <button
                            type="button"
                            onClick={() => handleToggleAllMissing(false)}
                            className="text-[11px] font-semibold text-slate-600 underline"
                          >
                            Bỏ chọn tất cả
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="max-h-60 overflow-y-auto divide-y divide-amber-100 bg-white">
                    {importPlan.missingInFile.map((item) => (
                      <label
                        key={item.id}
                        className="px-4 py-2 flex items-center justify-between gap-3 cursor-pointer hover:bg-amber-50/40"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <input
                            type="checkbox"
                            disabled={!confirmDeleteMissing}
                            checked={selectedMissingIds[item.id] === true}
                            onChange={(e) =>
                              setSelectedMissingIds((prev) => ({
                                ...prev,
                                [item.id]: e.target.checked,
                              }))
                            }
                            className="rounded border-slate-300 text-rose-600 disabled:opacity-40"
                          />
                          <div className="min-w-0">
                            <p className="font-semibold text-slate-900 truncate">
                              {item.lessonName}
                            </p>
                            <p className="text-[11px] text-slate-500 truncate">
                              {item.subjectName} · Lớp {item.grade} · {item.textbookSeries} · {item.chapterName}
                            </p>
                          </div>
                        </div>
                        {confirmDeleteMissing && selectedMissingIds[item.id] && (
                          <span className="text-[11px] font-bold text-rose-700 inline-flex items-center gap-1 shrink-0">
                            <Trash2 className="w-3.5 h-3.5" />
                            Sẽ xóa
                          </span>
                        )}
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* STEP 3: IMPORTING WITH PROGRESS BAR */}
          {step === 'importing' && (
            <div className="py-10 px-4 max-w-xl mx-auto text-center space-y-5">
              <Loader2 className="w-10 h-10 animate-spin text-teal-600 mx-auto" />
              <div className="space-y-1">
                <h3 className="text-base font-bold text-slate-900">
                  Đang ghi dữ liệu danh mục lên Firestore...
                </h3>
                <p className="text-xs text-slate-600">{progress.statusText}</p>
              </div>

              <div className="space-y-2">
                <div
                  role="progressbar"
                  aria-valuenow={progress.percent}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  className="w-full h-3 rounded-full bg-slate-200 overflow-hidden"
                >
                  <div
                    className={`h-full bg-teal-600 transition-all duration-300 ${getProgressWidthClass(
                      progress.percent
                    )}`}
                  />
                </div>
                <div className="flex items-center justify-between text-[11px] font-semibold text-slate-600 tabular-nums">
                  <span>
                    Đã xử lý: {progress.processedRows} / {progress.totalRows} bài học
                  </span>
                  <span>
                    Đợt {progress.currentBatch} / {progress.totalBatches} · {progress.percent}%
                  </span>
                </div>
              </div>

              <p className="text-[11px] text-slate-500">
                Vui lòng không đóng cửa sổ cho đến khi quá trình ghi batch hoàn tất.
              </p>
            </div>
          )}

          {/* STEP 4: RESULT SUMMARY */}
          {step === 'result' && result && (
            <div className="py-4 space-y-5">
              <div className="p-5 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-start gap-3">
                <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-base font-bold text-emerald-950">
                    Import danh mục Chương &amp; Bài học SGK thành công
                  </h3>
                  <p className="text-xs text-emerald-800 mt-1">
                    Dữ liệu đã được lưu đúng chuẩn vào Firestore và sẵn sàng hiển thị ngay trong Cascading Dropdown của tài khoản Giáo viên.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <div className="p-4 rounded-xl border border-emerald-200 bg-white">
                  <p className="text-[11px] text-slate-500">Đã thêm mới</p>
                  <p className="text-2xl font-bold text-emerald-700 tabular-nums mt-1">
                    +{result.addedCount}
                  </p>
                </div>
                <div className="p-4 rounded-xl border border-blue-200 bg-white">
                  <p className="text-[11px] text-slate-500">Đã cập nhật</p>
                  <p className="text-2xl font-bold text-blue-700 tabular-nums mt-1">
                    {result.updatedCount}
                  </p>
                </div>
                <div className="p-4 rounded-xl border border-slate-200 bg-white">
                  <p className="text-[11px] text-slate-500">Bỏ qua / Giữ nguyên</p>
                  <p className="text-2xl font-bold text-slate-700 tabular-nums mt-1">
                    {result.skippedCount}
                  </p>
                </div>
                <div className="p-4 rounded-xl border border-slate-200 bg-white">
                  <p className="text-[11px] text-slate-500">Đã xóa theo xác nhận</p>
                  <p className="text-2xl font-bold text-slate-700 tabular-nums mt-1">
                    {result.deletedCount}
                  </p>
                </div>
                <div className="p-4 rounded-xl border border-slate-200 bg-white">
                  <p className="text-[11px] text-slate-500">Dòng lỗi/trùng bỏ qua</p>
                  <p className="text-2xl font-bold text-rose-700 tabular-nums mt-1">
                    {result.errorCount + result.duplicateCount}
                  </p>
                </div>
              </div>

              {result.log && (
                <div className="px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-[11px] text-slate-600 flex flex-wrap items-center justify-between gap-2">
                  <span>
                    Đã ghi nhật ký Import: <strong className="text-slate-900">{result.log.fileName}</strong>{' '}
                    ({result.mode === 'sync' ? 'Chế độ Đồng bộ' : 'Chế độ Bổ sung'})
                  </span>
                  <span className="font-mono text-slate-500">Mã nhật ký: {result.log.id}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div>
            {step === 'preview' && (
              <button
                type="button"
                onClick={resetWizard}
                className="px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold"
              >
                Quay lại chọn file
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {step === 'upload' && (
              <button
                type="button"
                onClick={handleCloseModal}
                className="px-4 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 text-xs font-semibold"
              >
                Đóng
              </button>
            )}

            {step === 'preview' && (
              <>
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="px-4 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 text-xs font-semibold"
                >
                  Hủy
                </button>
                <button
                  type="button"
                  disabled={!canStartImport}
                  onClick={() => void handleExecuteImport()}
                  className="min-h-[40px] px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-xs font-semibold inline-flex items-center gap-1.5"
                >
                  <Upload className="w-4 h-4" />
                  <span>
                    Xác nhận Import ({parsed?.validation.validRows.length || 0} bài hợp lệ)
                  </span>
                </button>
              </>
            )}

            {step === 'result' && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    handleCloseModal();
                    onOpenHistory();
                  }}
                  className="px-4 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold inline-flex items-center gap-1.5"
                >
                  <History className="w-4 h-4" />
                  <span>Xem lịch sử Import</span>
                </button>
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="px-5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold"
                >
                  Hoàn tất
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
