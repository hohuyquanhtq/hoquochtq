import React from 'react';
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
} from 'lucide-react';
import { APP_CONFIG } from '../../constants/brand';

interface UserGuideViewProps {
  onNavigate: (tab: string) => void;
  onOpenSystemDocs: () => void;
}

export const UserGuideView: React.FC<UserGuideViewProps> = ({
  onNavigate,
  onOpenSystemDocs,
}) => {
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
            Quy trình từng bước giúp giáo viên bóc tách đề thi Word/PDF, cấu hình bảo mật phòng thi và thống kê điểm số nhanh chóng.
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
              Đặt tiêu đề các phần rõ ràng (Phần I, Phần II, Phần III), đánh số câu dạng <code className="font-mono text-teal-300">Câu 1.</code> và đính kèm bảng đáp án ở cuối tài liệu để độ chính xác đạt 100%.
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
