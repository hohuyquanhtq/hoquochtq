import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  Clock,
  FileSpreadsheet,
  History,
  Loader2,
  RefreshCw,
  X,
} from 'lucide-react';
import { CurriculumImportLog } from '../../types';
import { fetchCurriculumImportHistory } from '../../services/curriculumService';

interface CurriculumImportHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

function formatVietnameseDateTime(iso: string): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export const CurriculumImportHistoryModal: React.FC<CurriculumImportHistoryModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [logs, setLogs] = useState<CurriculumImportLog[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const loadHistory = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const items = await fetchCurriculumImportHistory();
      setLogs(items);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Không thể tải lịch sử import danh mục từ hệ thống.'
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      void loadHistory();
    }
  }, [isOpen, loadHistory]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/65 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Lịch sử Import danh mục Chương và Bài học SGK"
    >
      <div className="bg-white w-full max-w-5xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[88vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between gap-4 shrink-0">
          <div>
            <div className="flex items-center gap-2 text-teal-300 text-[11px] font-bold uppercase tracking-wider">
              <History className="w-4 h-4" />
              <span>Nhật ký Import Danh mục SGK</span>
            </div>
            <h2 className="text-base font-bold mt-0.5">
              Lịch sử Import Excel / CSV của Quản trị viên
            </h2>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={isLoading}
              onClick={() => void loadHistory()}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold inline-flex items-center gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span>Làm mới</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              aria-label="Đóng lịch sử import"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto flex-1 text-xs">
          {error ? (
            <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span className="font-semibold">{error}</span>
            </div>
          ) : isLoading ? (
            <div className="py-12 text-center text-slate-500 space-y-2">
              <Loader2 className="w-7 h-7 animate-spin text-teal-600 mx-auto" />
              <p>Đang tải nhật ký import từ Firestore...</p>
            </div>
          ) : logs.length === 0 ? (
            <div className="py-12 text-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 space-y-2">
              <Clock className="w-8 h-8 text-slate-300 mx-auto" />
              <p className="text-sm font-bold text-slate-800">Chưa có lượt import nào được ghi nhận</p>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Mỗi lần Admin thực hiện Import Excel / CSV, hệ thống sẽ tự động lưu tên file, người thực hiện, chế độ import và chi tiết số lượng thêm mới, cập nhật, bỏ qua và lỗi.
              </p>
            </div>
          ) : (
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                      <th className="py-2.5 px-3 font-bold">Thời gian</th>
                      <th className="py-2.5 px-3 font-bold">Tên file &amp; Bộ sách</th>
                      <th className="py-2.5 px-3 font-bold">Người thực hiện</th>
                      <th className="py-2.5 px-3 font-bold">Chế độ</th>
                      <th className="py-2.5 px-3 font-bold">Quy mô tệp</th>
                      <th className="py-2.5 px-3 font-bold">Kết quả ghi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {logs.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-50/60 align-top">
                        <td className="py-3 px-3 whitespace-nowrap tabular-nums text-slate-600">
                          {formatVietnameseDateTime(log.importedAt)}
                        </td>
                        <td className="py-3 px-3 max-w-[240px]">
                          <div className="flex items-start gap-1.5 font-semibold text-slate-900">
                            <FileSpreadsheet className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                            <span className="break-all">{log.fileName}</span>
                          </div>
                          {log.textbooks && log.textbooks.length > 0 && (
                            <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                              {log.textbooks.join(', ')}
                            </p>
                          )}
                        </td>
                        <td className="py-3 px-3">
                          <p className="font-semibold text-slate-900">{log.actorName || 'Admin'}</p>
                          {log.actorEmail && (
                            <p className="text-[11px] text-slate-500">{log.actorEmail}</p>
                          )}
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap">
                          <span
                            className={`font-bold ${
                              log.mode === 'sync' ? 'text-blue-700' : 'text-teal-700'
                            }`}
                          >
                            {log.mode === 'sync' ? 'Đồng bộ' : 'Bổ sung'}
                          </span>
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap tabular-nums text-slate-700">
                          <div>
                            {log.subjectsCount} môn · {log.gradesCount} lớp
                          </div>
                          <div className="text-[11px] text-slate-500">
                            {log.chaptersCount} chương · {log.lessonsCount} bài
                          </div>
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap tabular-nums">
                          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
                            <span className="font-bold text-emerald-700">+{log.addedCount} mới</span>
                            {log.updatedCount > 0 && (
                              <span className="font-bold text-blue-700">~{log.updatedCount} sửa</span>
                            )}
                            {log.skippedCount > 0 && (
                              <span className="text-slate-500">{log.skippedCount} bỏ qua</span>
                            )}
                            {log.deletedCount > 0 && (
                              <span className="font-semibold text-amber-700">
                                -{log.deletedCount} xóa
                              </span>
                            )}
                          </div>
                          {(log.errorCount > 0 || log.duplicateCount > 0) && (
                            <div className="text-[11px] text-rose-700 mt-0.5">
                              Lỗi: {log.errorCount} · Trùng: {log.duplicateCount}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};
