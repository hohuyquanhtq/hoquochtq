import React, { useState } from 'react';
import { X, Layers, Database, GitBranch, Cpu, Shield, CheckCircle2, FileText, FlaskConical, ExternalLink } from 'lucide-react';
import { APP_CONFIG } from '../../constants/brand';

interface SystemDesignModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SystemDesignModal: React.FC<SystemDesignModalProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<'architecture' | 'database' | 'functional' | 'chemistry' | 'roadmap'>('architecture');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-5xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center">
              <FlaskConical className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Hồ Sơ Thiết Kế Kỹ Thuật &amp; Kiến Trúc Hệ Thống {APP_CONFIG.APP_NAME}</h2>
              <p className="text-xs text-slate-300">{APP_CONFIG.APP_DESCRIPTION} • Tác giả: {APP_CONFIG.APP_AUTHOR} – {APP_CONFIG.APP_SCHOOL}</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-200 bg-slate-50 px-6 gap-2 pt-2">
          <button
            onClick={() => setActiveTab('architecture')}
            className={`px-4 py-2 text-xs font-bold rounded-t-lg transition-colors flex items-center gap-1.5 ${
              activeTab === 'architecture'
                ? 'bg-white text-blue-600 border-t-2 border-blue-600 border-x border-slate-200 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Layers className="w-4 h-4" /> 1. Kiến Trúc & Công Nghệ
          </button>
          <button
            onClick={() => setActiveTab('functional')}
            className={`px-4 py-2 text-xs font-bold rounded-t-lg transition-colors flex items-center gap-1.5 ${
              activeTab === 'functional'
                ? 'bg-white text-blue-600 border-t-2 border-blue-600 border-x border-slate-200 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <GitBranch className="w-4 h-4" /> 2. Sơ Đồ Chức Năng
          </button>
          <button
            onClick={() => setActiveTab('database')}
            className={`px-4 py-2 text-xs font-bold rounded-t-lg transition-colors flex items-center gap-1.5 ${
              activeTab === 'database'
                ? 'bg-white text-blue-600 border-t-2 border-blue-600 border-x border-slate-200 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Database className="w-4 h-4" /> 3. Thiết Kế Cơ Sở Dữ Liệu (ERD)
          </button>
          <button
            onClick={() => setActiveTab('chemistry')}
            className={`px-4 py-2 text-xs font-bold rounded-t-lg transition-colors flex items-center gap-1.5 ${
              activeTab === 'chemistry'
                ? 'bg-white text-blue-600 border-t-2 border-blue-600 border-x border-slate-200 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Cpu className="w-4 h-4" /> 4. Cơ Chế Xử Lý Hóa Học & Parser
          </button>
          <button
            onClick={() => setActiveTab('roadmap')}
            className={`px-4 py-2 text-xs font-bold rounded-t-lg transition-colors flex items-center gap-1.5 ${
              activeTab === 'roadmap'
                ? 'bg-white text-blue-600 border-t-2 border-blue-600 border-x border-slate-200 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <CheckCircle2 className="w-4 h-4" /> 5. Kế Hoạch 7 Bước Triển Khai
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6 text-sm text-slate-700">
          
          {activeTab === 'architecture' && (
            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                <h3 className="font-bold text-blue-900 text-base mb-1">Mô Hình Kiến Trúc Hệ Thống (3-Tier Scalable Architecture)</h3>
                <p className="text-xs text-blue-800">
                  Hệ thống được thiết kế theo chuẩn EdTech hiện đại: Phân tách rõ ràng giữa Trình diễn (React + Tailwind), Xử lý dịch vụ (Node/Express + Chemistry Engine + Gemini Flash AI), và Lưu trữ chuẩn hóa (PostgreSQL / Supabase / Local Storage sync).
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="border border-slate-200 rounded-xl p-4 bg-white shadow-xs">
                  <span className="text-[11px] font-bold uppercase text-blue-600 tracking-wider">Frontend Tier</span>
                  <h4 className="font-bold text-slate-900 mt-1">Giao Diện & Tương Tác Trực Tuyến</h4>
                  <ul className="mt-2 space-y-1.5 text-xs text-slate-600 list-disc list-inside">
                    <li>React 19 + TypeScript + Vite siêu tốc</li>
                    <li>Tailwind CSS v4 (Modern Blue / Clean Palette)</li>
                    <li>KaTeX Engine render công thức hóa học & toán học</li>
                    <li>Chống gian lận: Cảnh báo rời tab, full-screen lock</li>
                    <li>Tự động lưu bài theo giây & khôi phục khi mất mạng</li>
                  </ul>
                </div>

                <div className="border border-slate-200 rounded-xl p-4 bg-white shadow-xs">
                  <span className="text-[11px] font-bold uppercase text-indigo-600 tracking-wider">Business & AI Engine</span>
                  <h4 className="font-bold text-slate-900 mt-1">Động Cơ Xử Lý Hóa Học Chuyên Biệt</h4>
                  <ul className="mt-2 space-y-1.5 text-xs text-slate-600 list-disc list-inside">
                    <li>Bộ phân tích DOCX & Regex bóc tách 3 dạng câu hỏi</li>
                    <li>Bảo toàn nguyên vẹn chỉ số dưới $H_2SO_4$, mũi tên $\rightleftharpoons$, $\rightarrow$</li>
                    <li>Chấm điểm tự động theo chuẩn Quy chế Bộ GD&ĐT</li>
                    <li>Thuật toán cân bằng ma trận điểm = đúng 10.0 điểm</li>
                    <li>Tích hợp Gemini 2.5 Flash sinh lời giải & hỗ trợ nhận dạng</li>
                  </ul>
                </div>

                <div className="border border-slate-200 rounded-xl p-4 bg-white shadow-xs">
                  <span className="text-[11px] font-bold uppercase text-emerald-600 tracking-wider">Persistence Tier</span>
                  <h4 className="font-bold text-slate-900 mt-1">Dữ Liệu & Bảo Mật RBAC</h4>
                  <ul className="mt-2 space-y-1.5 text-xs text-slate-600 list-disc list-inside">
                    <li>Phân quyền 3 vai trò: Admin, Teacher, Student</li>
                    <li>Bảo vệ chống lộ đáp án trước khi thi xong</li>
                    <li>Xuất bảng điểm Excel .xlsx chuẩn hóa</li>
                    <li>Cơ chế Sao lưu / Khôi phục toàn bộ hệ thống (JSON dump)</li>
                  </ul>
                </div>
              </div>

              <div className="border border-slate-200 rounded-xl p-4 bg-slate-50">
                <h4 className="font-bold text-slate-800 mb-2">Quy Trình Hoạt Động Của Một Đề Thi</h4>
                <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
                  <span className="px-3 py-1.5 bg-blue-100 text-blue-800 rounded-lg">1. Upload DOCX / PDF</span>
                  <span>→</span>
                  <span className="px-3 py-1.5 bg-indigo-100 text-indigo-800 rounded-lg">2. Bóc tách & Nhận dạng 3 Phần</span>
                  <span>→</span>
                  <span className="px-3 py-1.5 bg-amber-100 text-amber-800 rounded-lg">3. Giáo viên kiểm tra & Sửa</span>
                  <span>→</span>
                  <span className="px-3 py-1.5 bg-purple-100 text-purple-800 rounded-lg">4. Phân phối thang 10.0đ</span>
                  <span>→</span>
                  <span className="px-3 py-1.5 bg-emerald-100 text-emerald-800 rounded-lg">5. Phát sinh Mã Thi Online</span>
                  <span>→</span>
                  <span className="px-3 py-1.5 bg-cyan-100 text-cyan-800 rounded-lg">6. Học sinh làm bài & Chấm tức thì</span>
                  <span>→</span>
                  <span className="px-3 py-1.5 bg-rose-100 text-rose-800 rounded-lg">7. Xuất Bảng Điểm Excel</span>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'functional' && (
            <div className="space-y-4">
              <h3 className="font-bold text-slate-900 text-base">Sơ Đồ Phân Quyền & Chức Năng 3 Cấp Độ</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                  <div className="flex items-center gap-2 text-purple-700 font-bold mb-2">
                    <Shield className="w-4 h-4" /> QUẢN TRỊ VIÊN (ADMIN)
                  </div>
                  <ul className="text-xs space-y-1.5 text-slate-600 list-disc list-inside">
                    <li>Quản lý danh sách tài khoản Giáo viên & Học sinh</li>
                    <li>Quản lý cấu hình môn học & hệ thống trường</li>
                    <li>Theo dõi toàn bộ bài thi và số lượt truy cập</li>
                    <li>Sao lưu (Backup) toàn bộ cơ sở dữ liệu hệ thống</li>
                    <li>Khôi phục (Restore) dữ liệu từ file sao lưu JSON</li>
                  </ul>
                </div>

                <div className="p-4 bg-blue-50/60 rounded-xl border border-blue-200">
                  <div className="flex items-center gap-2 text-blue-700 font-bold mb-2">
                    <FlaskConical className="w-4 h-4" /> GIÁO VIÊN (TEACHER)
                  </div>
                  <ul className="text-xs space-y-1.5 text-slate-600 list-disc list-inside">
                    <li>Quản lý cây thư mục theo khối lớp (10, 11, 12, Chuyên, HSG)</li>
                    <li>Tải lên & Nhận dạng đề thi từ file DOCX/Text</li>
                    <li>Kiểm duyệt câu hỏi, chỉnh sửa đáp án, thêm ảnh thí nghiệm</li>
                    <li>Quản lý Ngân hàng câu hỏi (tìm kiếm, lọc theo mức độ)</li>
                    <li>Tạo đề thi tự động / thủ công (ràng buộc chuẩn 10.0đ)</li>
                    <li>Tạo mã phòng thi, link thi, đảo đề & đảo phương án</li>
                    <li>Theo dõi thí sinh nộp bài thời gian thực & Xuất Excel</li>
                  </ul>
                </div>

                <div className="p-4 bg-emerald-50/60 rounded-xl border border-emerald-200">
                  <div className="flex items-center gap-2 text-emerald-700 font-bold mb-2">
                    <CheckCircle2 className="w-4 h-4" /> HỌC SINH (STUDENT)
                  </div>
                  <ul className="text-xs space-y-1.5 text-slate-600 list-disc list-inside">
                    <li>Đăng nhập nhanh: Họ tên + Lớp + Mã thi</li>
                    <li>Giao diện thi trực tuyến chuẩn: Đồng hồ đếm ngược, danh sách câu</li>
                    <li>Đánh dấu cờ (flag) câu cần xem lại</li>
                    <li>Tự động lưu trạng thái (khi rớt mạng phục hồi ngay)</li>
                    <li>Tự động nộp bài khi hết giờ</li>
                    <li>Xem điểm và xem lời giải chi tiết (nếu giáo viên cho phép)</li>
                    <li>Bảo mật: Không gửi đáp án về client khi đang thi</li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'database' && (
            <div className="space-y-4">
              <h3 className="font-bold text-slate-900 text-base">Mô Hình Quan Hệ Dữ Liệu Thực Thể (Relational Schema)</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
                <div className="p-3 bg-slate-900 text-slate-200 rounded-xl">
                  <p className="text-blue-400 font-bold mb-1">TABLE users</p>
                  <p>id: UUID (PK)</p>
                  <p>name: VARCHAR(255)</p>
                  <p>email: VARCHAR(255) UNIQUE</p>
                  <p>role: ENUM ('admin', 'teacher', 'student')</p>
                  <p>class_name: VARCHAR(50)</p>
                  <p>created_at: TIMESTAMP</p>
                </div>

                <div className="p-3 bg-slate-900 text-slate-200 rounded-xl">
                  <p className="text-emerald-400 font-bold mb-1">TABLE folders</p>
                  <p>id: UUID (PK)</p>
                  <p>name: VARCHAR(255)</p>
                  <p>parent_id: UUID (FK → folders.id)</p>
                  <p>grade: ENUM ('10', '11', '12', 'chuyen_hsg')</p>
                  <p>author_id: UUID (FK → users.id)</p>
                </div>

                <div className="p-3 bg-slate-900 text-slate-200 rounded-xl">
                  <p className="text-amber-400 font-bold mb-1">TABLE questions</p>
                  <p>id: UUID (PK)</p>
                  <p>code: VARCHAR(50)</p>
                  <p>type: ENUM ('part1_single_choice', 'part2_true_false', 'part3_short_answer')</p>
                  <p>content: TEXT (Hóa học, LaTeX, công thức)</p>
                  <p>options: JSONB (Dành cho Phần I)</p>
                  <p>statements: JSONB (Dành cho Phần II)</p>
                  <p>short_answer_config: JSONB (Dành cho Phần III)</p>
                  <p>image_url: TEXT</p>
                  <p>explanation: TEXT</p>
                  <p>grade: VARCHAR(20), topic: VARCHAR(50), level: VARCHAR(30)</p>
                </div>

                <div className="p-3 bg-slate-900 text-slate-200 rounded-xl">
                  <p className="text-cyan-400 font-bold mb-1">TABLE exams & submissions</p>
                  <p>exams.id: UUID (PK)</p>
                  <p>exams.code: VARCHAR(20) UNIQUE (Mã thi)</p>
                  <p>exams.rules: JSONB (Quy tắc tính điểm 10.0)</p>
                  <p>exams.questions: JSONB (Danh sách câu hỏi)</p>
                  <p>-----------------------------------</p>
                  <p>submissions.id: UUID (PK)</p>
                  <p>submissions.exam_id: UUID (FK → exams.id)</p>
                  <p>submissions.student_id: UUID (FK → users.id)</p>
                  <p>submissions.answers: JSONB</p>
                  <p>submissions.part1_score, part2_score, part3_score, total_score: FLOAT</p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'chemistry' && (
            <div className="space-y-4">
              <h3 className="font-bold text-slate-900 text-base">Cơ Chế Xử Lý Công Thức Hóa Học & Bộ Parser</h3>
              
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl space-y-2 text-xs">
                <p className="font-bold text-blue-900">Bảo Toàn Ký Hiệu Hóa Học Chuẩn Quốc Tế:</p>
                <div className="grid grid-cols-2 gap-2 text-slate-700">
                  <div>• Chỉ số dưới: H₂SO₄, Fe₂(SO₄)₃, KMnO₄</div>
                  <div>• Điện tích ion: Fe³⁺, Cu²⁺, SO₄²⁻, [Al(OH)₄]⁻</div>
                  <div>• Mũi tên phản ứng 1 chiều: → (t°, xt)</div>
                  <div>• Mũi tên thuận nghịch cân bằng: ⇌</div>
                  <div>• Ký hiệu khí bay lên (↑), kết tủa (↓)</div>
                  <div>• Biến thiên Enthalpy: ΔᵣH°₂₉₈, độ pH, Ka, Kb</div>
                </div>
              </div>

              <div className="border border-slate-200 rounded-xl p-4 bg-white text-xs space-y-2">
                <h4 className="font-bold text-slate-900">3 Dạng Câu Hỏi Theo Định Dạng Mới Của Bộ GD&ĐT:</h4>
                <div className="space-y-2">
                  <div className="p-2 bg-slate-50 rounded-lg">
                    <span className="font-bold text-blue-700">Phần I (4 lựa chọn):</span> Bóc tách tự động A, B, C, D ngay cả khi nằm cùng 1 dòng hoặc xuống dòng. Phát hiện đáp án từ bảng đáp án hoặc ký hiệu gạch chân / in đậm.
                  </div>
                  <div className="p-2 bg-slate-50 rounded-lg">
                    <span className="font-bold text-indigo-700">Phần II (Đúng - Sai 4 ý a,b,c,d):</span> Chấm điểm theo thang tích lũy chuẩn Bộ: Đúng 1 ý = 0.1đ; Đúng 2 ý = 0.25đ; Đúng 3 ý = 0.50đ; Đúng 4 ý = 1.00đ.
                  </div>
                  <div className="p-2 bg-slate-50 rounded-lg">
                    <span className="font-bold text-emerald-700">Phần III (Trả lời ngắn):</span> Nhận dạng số học, hỗ trợ cả dấu phẩy (12,5) và dấu chấm (12.5), cho phép cấu hình sai số $\pm \epsilon$ (sai số thực nghiệm).
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'roadmap' && (
            <div className="space-y-3">
              <h3 className="font-bold text-slate-900 text-base">Kế Hoạch Phát Triển 7 Bước Hoàn Thiện</h3>
              
              <div className="space-y-2 text-xs">
                {[
                  { step: 'Bước 1: Phân tích & Thiết kế', desc: 'Sơ đồ chức năng, DB schema, kiến trúc 3 tier, giao diện UX/UI Hóa học.', done: true },
                  { step: 'Bước 2: Nền tảng phân quyền & Giao diện', desc: 'Đăng nhập phân quyền Admin / Giáo viên / Học sinh, Dashboard thống kê.', done: true },
                  { step: 'Bước 3: Bộ parser & Tải đề thông minh', desc: 'Hỗ trợ DOCX / Text, nhận dạng 3 phần, màn hình kiểm tra sửa câu hỏi trước khi lưu.', done: true },
                  { step: 'Bước 4: Ngân hàng câu hỏi & Quản lý thư mục', desc: 'Phân loại Khối 10, 11, 12, Chuyên Hóa; tìm kiếm đa chiều; cây thư mục.', done: true },
                  { step: 'Bước 5: Tạo đề thi nhanh & Cân đối 10 điểm', desc: 'Chọn câu từ ngân hàng, khóa tổng điểm 10.0đ bắt buộc, tạo mã đề, đảo phương án.', done: true },
                  { step: 'Bước 6: Phòng thi trực tuyến cho học sinh', desc: 'Đồng hồ đếm ngược, tự động lưu câu trả lời, bảo mật giấu đáp án, tự động nộp bài.', done: true },
                  { step: 'Bước 7: Chấm điểm, Thống kê & Xuất Excel', desc: 'Báo cáo phổ điểm, phân tích câu sai nhiều, xuất file Excel .xlsx chuẩn giáo dục.', done: true },
                ].map((item, i) => (
                  <div key={i} className="flex items-start gap-3 p-2.5 rounded-lg border border-slate-200 bg-slate-50">
                    <div className="w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center shrink-0 font-bold text-xs">
                      ✓
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-900">{item.step}</h4>
                      <p className="text-slate-600">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-slate-100 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span className="text-xs text-slate-600">
            {APP_CONFIG.APP_NAME} v{APP_CONFIG.APP_VERSION} – Tác giả: <strong className="text-slate-800">{APP_CONFIG.APP_AUTHOR}</strong> ({APP_CONFIG.APP_SCHOOL})
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-blue-600 text-white font-bold text-xs rounded-xl hover:bg-blue-700 transition-colors"
          >
            Đóng & Bắt đầu sử dụng
          </button>
        </div>

      </div>
    </div>
  );
};
