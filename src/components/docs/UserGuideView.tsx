import React, { useState } from 'react';
import {
  BookOpenCheck,
  FileUp,
  FilePlus2,
  ShieldCheck,
  QrCode,
  BarChart3,
  CheckCircle2,
  ArrowRight,
  Code,
  Sparkles,
  Download,
  Tag,
  Loader2,
} from 'lucide-react';
import { APP_CONFIG } from '../../constants/brand';
import {
  downloadShortAnswerWordTemplate,
  downloadSingleChoiceWordTemplate,
  downloadStandardChemistryWordTemplate,
  downloadTrueFalseWordTemplate,
} from '../../services/sampleWordTemplateService';

interface UserGuideViewProps {
  onNavigate: (tab: string) => void;
  onOpenSystemDocs: () => void;
}

export const UserGuideView: React.FC<UserGuideViewProps> = ({
  onNavigate,
  onOpenSystemDocs,
}) => {
  const [downloadingKey, setDownloadingKey] = useState<string | null>(null);

  const handleDownloadTemplate = async (key: string, fn: () => Promise<void>) => {
    if (downloadingKey) return;
    setDownloadingKey(key);
    try {
      await fn();
    } catch (err) {
      console.error('Lỗi tải file Word mẫu:', err);
    } finally {
      setDownloadingKey(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Banner */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1.5 min-w-0">
          <p className="text-sm font-semibold text-teal-700">
            Tài liệu vận hành {APP_CONFIG.APP_NAME} · Chuẩn GDPT 2018
          </p>
          <h1 className="text-[26px] sm:text-[30px] font-bold text-slate-900 tracking-tight">
            Hướng dẫn sử dụng QUIZ PRO
          </h1>
          <p className="text-[15px] sm:text-base text-slate-600 max-w-2xl leading-relaxed">
            Quy trình từng bước giúp giáo viên soạn thảo ngân hàng câu hỏi gắn thẻ mức độ, bóc tách đề thi Word/PDF, cấu hình bảo mật phòng thi và thống kê điểm số nhanh chóng.
          </p>
        </div>

        <button
          type="button"
          onClick={onOpenSystemDocs}
          className="px-4 min-h-[44px] rounded-xl border border-slate-300 bg-slate-50 hover:bg-slate-100 text-slate-800 text-[15px] font-semibold flex items-center gap-2 shrink-0 transition-colors whitespace-nowrap"
        >
          <Code className="w-4 h-4 text-teal-600 shrink-0" />
          <span>Hồ sơ kiến trúc kỹ thuật</span>
        </button>
      </div>

      {/* Hướng dẫn soạn thảo Ngân hàng câu hỏi & Gắn thẻ [NB], [TH], [VD], [VDC] */}
      <section className="bg-white border border-blue-200/80 rounded-2xl p-6 shadow-xs space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div className="flex items-start gap-3">
            <div className="w-11 h-11 rounded-xl bg-blue-50 border border-blue-200 text-blue-700 flex items-center justify-center shrink-0">
              <Tag className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900">
                Soạn thảo Ngân hàng câu hỏi &amp; Gắn thẻ mức độ tự động (.docx)
              </h2>
              <p className="text-sm text-slate-600 mt-1">
                Đặt thẻ mức độ ngay sau số thứ tự câu hỏi để trộn nhiều mức độ nhận thức trong cùng 1 file Word. Hệ thống tự nhận diện và làm sạch thẻ trước khi lưu, đồng thời giữ nguyên ký hiệu hóa học như <code className="px-1 py-0.5 rounded bg-slate-100 text-slate-800 font-mono text-xs">[H+]</code>, <code className="px-1 py-0.5 rounded bg-slate-100 text-slate-800 font-mono text-xs">[OH-]</code>, <code className="px-1 py-0.5 rounded bg-slate-100 text-slate-800 font-mono text-xs">[Fe3+]</code>.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onNavigate('question_bank')}
            className="px-4 min-h-[42px] rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold inline-flex items-center gap-2 shrink-0 transition-colors whitespace-nowrap"
          >
            <span>Mở Ngân hàng câu hỏi</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        {/* Bảng ký hiệu 4 thẻ mức độ */}
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-blue-50/70 text-slate-800 border-b border-slate-200">
                <th className="py-2.5 px-4 font-bold">Thẻ chuẩn</th>
                <th className="py-2.5 px-4 font-bold">Thẻ thay thế</th>
                <th className="py-2.5 px-4 font-bold">Mức độ nhận thức</th>
                <th className="py-2.5 px-4 font-bold">Mô tả ngắn &amp; Ví dụ đặt thẻ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              <tr className="bg-white">
                <td className="py-2.5 px-4">
                  <span className="px-2.5 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 font-mono font-bold text-xs">
                    [NB]
                  </span>
                </td>
                <td className="py-2.5 px-4 font-mono text-xs text-slate-600">[M1]</td>
                <td className="py-2.5 px-4 font-semibold text-emerald-700">Nhận biết</td>
                <td className="py-2.5 px-4 text-slate-700">
                  Khái niệm, công thức, tính chất trực tiếp — VD:{' '}
                  <code className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded">
                    Câu 1. [NB] Kim loại nào sau đây có tính dẫn điện tốt nhất?
                  </code>
                </td>
              </tr>
              <tr className="bg-slate-50/40">
                <td className="py-2.5 px-4">
                  <span className="px-2.5 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-200 font-mono font-bold text-xs">
                    [TH]
                  </span>
                </td>
                <td className="py-2.5 px-4 font-mono text-xs text-slate-600">[M2]</td>
                <td className="py-2.5 px-4 font-semibold text-blue-700">Thông hiểu</td>
                <td className="py-2.5 px-4 text-slate-700">
                  Giải thích hiện tượng, so sánh, thí nghiệm — VD:{' '}
                  <code className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded">
                    Câu 2. [TH] Phát biểu nào sau đây đúng khi nói về tính chất hóa học của ester?
                  </code>
                </td>
              </tr>
              <tr className="bg-white">
                <td className="py-2.5 px-4">
                  <span className="px-2.5 py-0.5 rounded-md bg-orange-50 text-orange-700 border border-orange-200 font-mono font-bold text-xs">
                    [VD]
                  </span>
                </td>
                <td className="py-2.5 px-4 font-mono text-xs text-slate-600">[M3]</td>
                <td className="py-2.5 px-4 font-semibold text-orange-700">Vận dụng</td>
                <td className="py-2.5 px-4 text-slate-700">
                  Tính toán theo phản ứng, áp dụng thực tiễn — VD:{' '}
                  <code className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded">
                    Câu 3. [VD] Cho m gam Fe tác dụng hoàn toàn với dung dịch H₂SO₄ loãng dư...
                  </code>
                </td>
              </tr>
              <tr className="bg-slate-50/40">
                <td className="py-2.5 px-4">
                  <span className="px-2.5 py-0.5 rounded-md bg-purple-50 text-purple-700 border border-purple-200 font-mono font-bold text-xs">
                    [VDC]
                  </span>
                </td>
                <td className="py-2.5 px-4 font-mono text-xs text-slate-600">[M4]</td>
                <td className="py-2.5 px-4 font-semibold text-purple-700">Vận dụng cao</td>
                <td className="py-2.5 px-4 text-slate-700">
                  Bài toán tổng hợp, biện luận nhiều bước — VD:{' '}
                  <code className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded">
                    Câu 4. [VDC] Hỗn hợp E gồm hai ester mạch hở X và Y...
                  </code>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Ví dụ minh họa trực quan theo từng dạng câu hỏi */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 text-xs">
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
            <p className="font-bold text-blue-900">1. Trắc nghiệm nhiều lựa chọn (Phần I)</p>
            <div className="font-mono text-[11px] bg-white border border-slate-200 rounded-lg p-2.5 text-slate-700 space-y-1 leading-relaxed">
              <p><strong>Câu 1. [NB]</strong> Kim loại nào sau đây có tính dẫn điện tốt nhất?</p>
              <p>A. Ag. &nbsp; B. Cu. &nbsp; C. Au. &nbsp; D. Al.</p>
              <p className="pt-1"><strong>Câu 2. [VD]</strong> Cho m gam Fe tác dụng hoàn toàn với H₂SO₄ loãng dư...</p>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
            <p className="font-bold text-teal-900">2. Trắc nghiệm Đúng/Sai (Phần II)</p>
            <div className="font-mono text-[11px] bg-white border border-slate-200 rounded-lg p-2.5 text-slate-700 space-y-1 leading-relaxed">
              <p><strong>Câu 1. [TH]</strong> Cho thí nghiệm điều chế ethyl acetate...</p>
              <p>a) Phản ứng ester hóa là thuận nghịch.</p>
              <p>b) H₂SO₄ đặc vừa xúc tác vừa hút nước.</p>
              <p className="text-slate-500 italic">(Gắn 1 thẻ mức độ chung đầu câu lớn)</p>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
            <p className="font-bold text-slate-900">3. Trả lời ngắn / Điền khuyết (Phần III)</p>
            <div className="font-mono text-[11px] bg-white border border-slate-200 rounded-lg p-2.5 text-slate-700 space-y-1 leading-relaxed">
              <p><strong>Câu 1. [NB]</strong> Số nguyên tử C trong ethyl acetate là bao nhiêu?</p>
              <p><strong>Câu 2. [VD]</strong> Đun nóng 8,8 gam ethyl acetate với NaOH dư...</p>
              <p className="text-slate-500 italic">(Bỏ trống thẻ → mặc định Nhận biết)</p>
            </div>
          </div>
        </div>

        {/* Nút tải nhanh các file Word mẫu đã gắn sẵn thẻ */}
        <div className="pt-2 flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold text-slate-700 mr-1">Tải file Word mẫu chuẩn (.docx):</span>
          {(
            [
              {
                key: 'full',
                label: 'Mẫu tổng hợp 3 phần',
                fn: downloadStandardChemistryWordTemplate,
                cls: 'bg-blue-50 border-blue-200 hover:bg-blue-100 text-blue-800',
              },
              {
                key: 'p1',
                label: 'Mẫu Trắc nghiệm (Phần I)',
                fn: downloadSingleChoiceWordTemplate,
                cls: 'bg-white border-teal-200 hover:bg-teal-50 text-teal-800',
              },
              {
                key: 'p2',
                label: 'Mẫu Đúng/Sai (Phần II)',
                fn: downloadTrueFalseWordTemplate,
                cls: 'bg-white border-teal-200 hover:bg-teal-50 text-teal-800',
              },
              {
                key: 'p3',
                label: 'Mẫu Trả lời ngắn (Phần III)',
                fn: downloadShortAnswerWordTemplate,
                cls: 'bg-white border-teal-200 hover:bg-teal-50 text-teal-800',
              },
            ] as const
          ).map((tpl) => (
            <button
              key={tpl.key}
              type="button"
              disabled={downloadingKey !== null}
              onClick={() => void handleDownloadTemplate(tpl.key, tpl.fn)}
              className={`px-3 py-1.5 rounded-lg border text-xs font-semibold inline-flex items-center gap-1.5 transition-colors disabled:opacity-60 ${tpl.cls}`}
            >
              {downloadingKey === tpl.key ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Download className="w-3.5 h-3.5" />
              )}
              <span>{tpl.label}</span>
            </button>
          ))}
        </div>
      </section>

      {/* 4 Core Workflows */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Guide 1: Bóc tách Word/PDF */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs flex flex-col justify-between gap-5">
          <div className="space-y-3">
            <div className="w-11 h-11 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-700 flex items-center justify-center">
              <FileUp className="w-5 h-5" />
            </div>
            <h2 className="text-xl font-bold text-slate-900">
              1. Bóc tách đề thi tự động từ Word / PDF
            </h2>
            <p className="text-[15px] text-slate-600 leading-relaxed">
              Hệ thống tự động nhận dạng 3 phần theo cấu trúc thi mới của Bộ GD&amp;ĐT và bảo toàn công thức hóa học / OMML Equations.
            </p>
            <ul className="space-y-2 text-[15px] text-slate-700 pt-1">
              <li className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0 mt-1" />
                <span>
                  <strong>Phần I (A, B, C, D):</strong> Hỗ trợ cả 4 đáp án trên nhiều dòng hoặc nằm cùng dòng.
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0 mt-1" />
                <span>
                  <strong>Phần II (Đúng/Sai a, b, c, d):</strong> Tự động nhận dạng ma trận Đúng/Sai theo hàng ngang, hàng dọc hoặc bảng.
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0 mt-1" />
                <span>
                  <strong>Phần III (Trả lời ngắn):</strong> Hỗ trợ số âm (ví dụ <code className="font-mono font-semibold text-slate-900">-46</code>), số thập phân dấu phẩy hoặc dấu chấm, cảnh báo nếu vượt quá 4 ký tự.
                </span>
              </li>
            </ul>
          </div>

          <button
            type="button"
            onClick={() => onNavigate('upload_exam')}
            className="w-full min-h-[44px] px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-[15px] font-semibold flex items-center justify-center gap-2 transition-colors"
          >
            <span>Mở module Bóc tách Word/PDF</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        {/* Guide 2: Tạo đề & Ma trận điểm */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs flex flex-col justify-between gap-5">
          <div className="space-y-3">
            <div className="w-11 h-11 rounded-xl bg-teal-50 border border-teal-200 text-teal-700 flex items-center justify-center">
              <FilePlus2 className="w-5 h-5" />
            </div>
            <h2 className="text-xl font-bold text-slate-900">
              2. Tạo đề thi &amp; Cân bằng thang 10,0 điểm
            </h2>
            <p className="text-[15px] text-slate-600 leading-relaxed">
              Chọn câu hỏi từ Ngân hàng hoặc file vừa bóc tách, hệ thống tự động tính điểm theo quy chuẩn Bộ GD&amp;ĐT hoặc chia đều thang 10.
            </p>
            <ul className="space-y-2 text-[15px] text-slate-700 pt-1">
              <li className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0 mt-1" />
                <span>
                  <strong>Phần II chuẩn Bộ GD&amp;ĐT:</strong> Đúng 1 ý = 0,1đ · 2 ý = 0,25đ · 3 ý = 0,5đ · 4 ý = 1,0đ (hoặc chọn chia đều từng ý).
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0 mt-1" />
                <span>
                  <strong>Trộn đề &amp; Trộn đáp án:</strong> Bật/tắt đảo thứ tự câu hỏi và lựa chọn A, B, C, D độc lập cho từng lần thi.
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0 mt-1" />
                <span>
                  <strong>Cân bằng tự động 10,0đ:</strong> Bấm 1 nút để phân bổ tỷ lệ điểm chính xác tuyệt đối 10,00 điểm.
                </span>
              </li>
            </ul>
          </div>

          <button
            type="button"
            onClick={() => onNavigate('create_exam')}
            className="w-full min-h-[44px] px-4 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-[15px] font-semibold flex items-center justify-center gap-2 transition-colors"
          >
            <span>Đi tới Tạo đề thi mới</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        {/* Guide 3: Bảo mật mật khẩu & Mở đáp án theo điểm sàn */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs flex flex-col justify-between gap-5">
          <div className="space-y-3">
            <div className="w-11 h-11 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <h2 className="text-xl font-bold text-slate-900">
              3. Mật khẩu đề thi &amp; Mở đáp án theo điểm sàn
            </h2>
            <p className="text-[15px] text-slate-600 leading-relaxed">
              Bảo vệ đề thi trước khi mở phòng và kiểm soát chặt chẽ điều kiện học sinh được phép xem đáp án chi tiết sau khi nộp bài.
            </p>
            <ul className="space-y-2 text-[15px] text-slate-700 pt-1">
              <li className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0 mt-1" />
                <span>
                  <strong>Mật khẩu đề thi:</strong> Bật công tắc bảo mật, mật khẩu được băm an toàn trên máy chủ và giới hạn 5 lần nhập sai liên tiếp.
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0 mt-1" />
                <span>
                  <strong>Mở đáp án theo điểm sàn:</strong> Chỉ học sinh đạt từ điểm sàn trở lên (ví dụ <span className="tabular-nums font-semibold">≥ 8,0</span> điểm) mới được mở khóa bảng đáp án chi tiết.
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0 mt-1" />
                <span>
                  <strong>Cập nhật trực tiếp:</strong> Có thể bật/tắt mật khẩu hoặc thay đổi điểm sàn bất kỳ lúc nào tại mục Quản lý đề thi.
                </span>
              </li>
            </ul>
          </div>

          <button
            type="button"
            onClick={() => onNavigate('exam_manager')}
            className="w-full min-h-[44px] px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-[15px] font-semibold flex items-center justify-center gap-2 transition-colors"
          >
            <span>Mở Quản lý đề thi</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        {/* Guide 4: Chia sẻ QR & Thống kê kết quả */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs flex flex-col justify-between gap-5">
          <div className="space-y-3">
            <div className="w-11 h-11 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center">
              <QrCode className="w-5 h-5" />
            </div>
            <h2 className="text-xl font-bold text-slate-900">
              4. Chia sẻ mã thi QR &amp; Thống kê Excel
            </h2>
            <p className="text-[15px] text-slate-600 leading-relaxed">
              Phát hành đề thi nhanh qua mã thi, đường dẫn trực tiếp hoặc mã QR cho học sinh quét ngay trên điện thoại và máy tính.
            </p>
            <ul className="space-y-2 text-[15px] text-slate-700 pt-1">
              <li className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0 mt-1" />
                <span>
                  <strong>Link &amp; QR Code:</strong> Mỗi đề thi có đường dẫn dạng <code className="font-mono text-slate-900">?examCode=...</code> hoặc <code className="font-mono text-slate-900">/c/...</code> cố định, dễ chia sẻ qua Zalo/Classroom.
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0 mt-1" />
                <span>
                  <strong>Giao đề theo lớp:</strong> Tạo mã lớp học để học sinh tham gia và xem danh sách bài tập được giao tập trung.
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0 mt-1" />
                <span>
                  <strong>Thống kê &amp; Xuất Excel:</strong> Xem phổ điểm, tỉ lệ trả lời đúng từng câu và tải bảng điểm định dạng <code className="font-mono text-slate-900">.xlsx</code>.
                </span>
              </li>
            </ul>
          </div>

          <button
            type="button"
            onClick={() => onNavigate('exam_results')}
            className="w-full min-h-[44px] px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[15px] font-semibold flex items-center justify-center gap-2 transition-colors"
          >
            <BarChart3 className="w-4 h-4" />
            <span>Xem Kết quả &amp; Thống kê</span>
          </button>
        </div>
      </div>

      {/* Checklist footer note */}
      <div className="bg-slate-900 text-slate-100 rounded-2xl p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-teal-600 text-white flex items-center justify-center shrink-0">
            <BookOpenCheck className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-teal-400 shrink-0" />
              <span>Mẹo chuẩn hóa file Word trước khi tải lên</span>
            </h3>
            <p className="text-sm text-slate-300 mt-1">
              Đặt tiêu đề các phần rõ ràng (Phần I, Phần II, Phần III), đánh số câu kèm thẻ mức độ như <code className="font-mono text-teal-300">Câu 1. [NB]</code>, <code className="font-mono text-teal-300">Câu 2. [TH]</code>, <code className="font-mono text-teal-300">Câu 3. [VD]</code>, <code className="font-mono text-teal-300">Câu 4. [VDC]</code> và đính kèm bảng đáp án ở cuối tài liệu để độ chính xác đạt 100%.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => onNavigate('upload_exam')}
          className="px-4 min-h-[44px] rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-sm font-semibold shrink-0 transition-colors whitespace-nowrap"
        >
          Thử bóc tách ngay
        </button>
      </div>
    </div>
  );
};

