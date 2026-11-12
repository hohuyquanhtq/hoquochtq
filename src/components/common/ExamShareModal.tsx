import React, { useState, useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import { 
  X, 
  Copy, 
  Check, 
  Share2, 
  Download, 
  Printer, 
  ExternalLink, 
  QrCode, 
  Link as LinkIcon, 
  Sparkles, 
  FileText, 
  Clock, 
  Award,
  AlertCircle,
  ToggleLeft,
  ToggleRight,
  Eye,
  CheckCircle2
} from 'lucide-react';
import { Exam } from '../../types';
import { APP_CONFIG } from '../../constants/brand';
import { getExamDirectUrl, getExamQueryUrl } from '../../utils/urlHelper';

interface ExamShareModalProps {
  isOpen: boolean;
  exam: Exam | null;
  onClose: () => void;
  onTogglePublish?: (examId: string) => void;
}

export const ExamShareModal: React.FC<ExamShareModalProps> = ({
  isOpen,
  exam,
  onClose,
  onTogglePublish,
}) => {
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedAnnouncement, setCopiedAnnouncement] = useState(false);
  const [notificationMsg, setNotificationMsg] = useState<{ type: 'success' | 'info'; text: string } | null>(null);
  
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [qrSvgString, setQrSvgString] = useState<string>('');
  const [isGeneratingQr, setIsGeneratingQr] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<'share' | 'print_preview'>('share');

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const printableRef = useRef<HTMLDivElement>(null);

  // Clean exam code and build direct public URL
  const examCode = (exam?.code || 'HQ50').trim().toUpperCase();
  const directLink = getExamDirectUrl(examCode);
  const queryLink = getExamQueryUrl(examCode);

  const totalQuestionsCount = exam ? (exam.totalQuestions || exam.questions?.length || 0) : 0;

  // Generate QR Code with multiple methods (SVG + Canvas + DataURL) to guarantee 100% success
  useEffect(() => {
    if (!isOpen || !exam) return;

    let isMounted = true;
    setIsGeneratingQr(true);

    const generateQr = async () => {
      try {
        const qrLib = (QRCode as any)?.toDataURL ? QRCode : ((QRCode as any)?.default || QRCode);

        // 1. Generate High-Resolution Black on White Data URL (#000000 on #ffffff)
        if (qrLib.toDataURL) {
          const url = await qrLib.toDataURL(directLink, {
            width: 600,
            margin: 2,
            color: {
              dark: '#000000', // Pure black
              light: '#ffffff', // Pure white
            },
            errorCorrectionLevel: 'H',
          });
          if (isMounted) setQrDataUrl(url);
        }

        // 2. Generate SVG string as lightweight crisp vector fallback
        if (qrLib.toString) {
          const svg = await qrLib.toString(directLink, {
            type: 'svg',
            margin: 2,
            color: {
              dark: '#000000',
              light: '#ffffff',
            },
            errorCorrectionLevel: 'H',
          });
          if (isMounted) setQrSvgString(svg);
        }

        // 3. Render directly to hidden canvas for download operations
        if (canvasRef.current && qrLib.toCanvas) {
          await qrLib.toCanvas(canvasRef.current, directLink, {
            width: 600,
            margin: 2,
            color: {
              dark: '#000000',
              light: '#ffffff',
            },
            errorCorrectionLevel: 'H',
          });
        }
      } catch (err) {
        console.error('Error generating QR code:', err);
      } finally {
        if (isMounted) setIsGeneratingQr(false);
      }
    };

    generateQr();

    return () => {
      isMounted = false;
    };
  }, [isOpen, exam, directLink]);

  if (!isOpen || !exam) return null;

  // Clipboard copy with fallbacks
  const copyToClipboard = async (text: string, type: 'link' | 'code' | 'announcement') => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }

      if (type === 'link') {
        setCopiedLink(true);
        setNotificationMsg({ type: 'success', text: 'Đã sao chép liên kết vào clipboard!' });
        setTimeout(() => setCopiedLink(false), 3000);
      } else if (type === 'code') {
        setCopiedCode(true);
        setNotificationMsg({ type: 'success', text: `Đã sao chép mã bài thi "${examCode}"!` });
        setTimeout(() => setCopiedCode(false), 3000);
      } else {
        setCopiedAnnouncement(true);
        setNotificationMsg({ type: 'success', text: 'Đã sao chép toàn bộ thông báo bài thi cho Zalo / Email!' });
        setTimeout(() => setCopiedAnnouncement(false), 3000);
      }

      setTimeout(() => setNotificationMsg(null), 3500);
    } catch (err) {
      console.warn('Copy error:', err);
      setNotificationMsg({ type: 'info', text: 'Không thể tự động sao chép. Vui lòng chọn và nhấn Ctrl+C!' });
    }
  };

  const getAnnouncementText = () => {
    return `THÔNG BÁO THI TRỰC TUYẾN - ${APP_CONFIG.APP_NAME}

📖 Bài thi: ${exam.title}
🔑 Mã bài thi: ${examCode}
🌐 Link vào thi trực tiếp: ${directLink}
⏱ Thời gian làm bài: ${exam.durationMinutes} phút
📝 Số lượng câu hỏi: ${totalQuestionsCount} câu
🎯 Thang điểm: ${exam.totalScore || 10.0} điểm
👨‍🏫 Giáo viên ra đề: ${exam.authorName || APP_CONFIG.APP_AUTHOR}

Hướng dẫn: Học sinh nhấp vào đường link trên hoặc mở ứng dụng và nhập mã "${examCode}" để làm bài thi.`;
  };

  // Web Share API handler
  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `${APP_CONFIG.APP_NAME} - ${exam.title}`,
          text: `Tham gia bài kiểm tra Hóa học: "${exam.title}" (Mã: ${examCode})`,
          url: directLink,
        });
        setNotificationMsg({ type: 'success', text: 'Đã mở hộp thoại chia sẻ của hệ thống!' });
        setTimeout(() => setNotificationMsg(null), 3000);
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          copyToClipboard(getAnnouncementText(), 'announcement');
        }
      }
    } else {
      copyToClipboard(getAnnouncementText(), 'announcement');
    }
  };

  // Download crisp PNG of QR code
  const handleDownloadQrPng = () => {
    if (!qrDataUrl && !canvasRef.current) {
      alert('Đang tạo mã QR, vui lòng thử lại sau giây lát!');
      return;
    }

    const dataUrl = qrDataUrl || canvasRef.current?.toDataURL('image/png');
    if (!dataUrl) return;

    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = `HQTest_QR_${examCode}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setNotificationMsg({ type: 'success', text: `Đã tải xuống file mã QR: HQTest_QR_${examCode}.png` });
    setTimeout(() => setNotificationMsg(null), 3000);
  };

  // Download entire printable ticket card with title, code, QR, instructions as PNG
  const handleDownloadTicketCardPng = () => {
    const cardCanvas = document.createElement('canvas');
    cardCanvas.width = 900;
    cardCanvas.height = 1100;
    const ctx = cardCanvas.getContext('2d');
    if (!ctx) return;

    // White background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 900, 1100);

    // Header gradient banner
    const grad = ctx.createLinearGradient(0, 0, 900, 0);
    grad.addColorStop(0, '#1d4ed8');
    grad.addColorStop(1, '#4338ca');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 900, 130);

    // Header Brand text
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 36px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(APP_CONFIG.APP_NAME.toUpperCase(), 450, 55);
    ctx.font = '18px sans-serif';
    ctx.fillText('NGÂN HÀNG CÂU HỎI & THI TRẮC NGHIỆM ONLINE (GDPT 2018)', 450, 95);

    // Exam Title
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 28px sans-serif';
    ctx.fillText(exam.title, 450, 190);

    // Code Box
    ctx.fillStyle = '#f1f5f9';
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 2;
    ctx.roundRect(250, 220, 400, 75, 16);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#475569';
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText('MÃ BÀI THI:', 450, 245);
    ctx.fillStyle = '#1d4ed8';
    ctx.font = '900 36px monospace';
    ctx.fillText(examCode, 450, 282);

    // Draw QR Code
    const qrImage = new Image();
    qrImage.onload = () => {
      ctx.drawImage(qrImage, 250, 320, 400, 400);

      // Meta info
      ctx.fillStyle = '#334155';
      ctx.font = '18px sans-serif';
      ctx.fillText(`Thời gian: ${exam.durationMinutes} phút  •  Số câu hỏi: ${totalQuestionsCount} câu  •  Thang điểm: ${exam.totalScore || 10.0}đ`, 450, 760);
      ctx.fillText(`Giáo viên ra đề: ${exam.authorName || APP_CONFIG.APP_AUTHOR}  •  ${APP_CONFIG.APP_SCHOOL}`, 450, 795);

      // Direct Link box
      ctx.fillStyle = '#eff6ff';
      ctx.strokeStyle = '#bfdbfe';
      ctx.roundRect(100, 830, 700, 70, 12);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#1e40af';
      ctx.font = 'bold 14px sans-serif';
      ctx.fillText('ĐƯỜNG DẪN TRUY CẬP TRỰC TIẾP:', 450, 855);
      ctx.font = '16px monospace';
      ctx.fillText(directLink, 450, 882);

      // Footer Instructions
      ctx.fillStyle = '#64748b';
      ctx.font = '15px sans-serif';
      ctx.fillText('1. Dùng điện thoại / máy tính bảng quét mã QR trên hoặc truy cập đường link.', 450, 950);
      ctx.fillText('2. Nhập chính xác Họ tên, Lớp và bấm Bắt đầu làm bài.', 450, 980);
      ctx.fillText('3. Bài làm được tự động lưu và gửi kết quả về cho giáo viên.', 450, 1010);

      const link = document.createElement('a');
      link.href = cardCanvas.toDataURL('image/png');
      link.download = `HQTest_PhieuThi_${examCode}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setNotificationMsg({ type: 'success', text: `Đã tải xuống phiếu thi: HQTest_PhieuThi_${examCode}.png` });
      setTimeout(() => setNotificationMsg(null), 3000);
    };
    qrImage.src = qrDataUrl || canvasRef.current?.toDataURL('image/png') || '';
  };

  // Direct In-App Print Handler
  const handlePrint = () => {
    setActiveTab('print_preview');
    setTimeout(() => {
      window.print();
    }, 250);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      {/* Hidden Canvas for QR operations */}
      <canvas ref={canvasRef} className="hidden" width={600} height={600} />

      <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col my-auto max-h-[92vh]">
        
        {/* Modal Top Header */}
        <div className="bg-gradient-to-r from-blue-700 via-indigo-700 to-blue-800 px-6 py-4 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-white/10 rounded-2xl shadow-inner">
              <QrCode className="w-5 h-5 text-blue-200" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-blue-200 flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5" />
                  Chia Sẻ Bài Thi &amp; Mã QR Học Sinh
                </span>
                <span className="px-2 py-0.5 text-[10px] font-mono font-bold bg-white/20 text-white rounded-md">
                  Mã: {examCode}
                </span>
              </div>
              <h2 className="text-base font-extrabold text-white line-clamp-1 mt-0.5">
                {exam.title}
              </h2>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-white/10 text-white/80 hover:text-white transition-colors"
            title="Đóng cửa sổ"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Status Notification Toast */}
        {notificationMsg && (
          <div className="bg-emerald-50 border-b border-emerald-200 px-6 py-2.5 text-emerald-800 text-xs font-bold flex items-center justify-between shrink-0 animate-in fade-in">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{notificationMsg.text}</span>
            </div>
            <button onClick={() => setNotificationMsg(null)} className="text-emerald-600 hover:text-emerald-900">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-200 px-6 bg-slate-50 shrink-0">
          <button
            onClick={() => setActiveTab('share')}
            className={`py-3 px-4 text-xs font-bold border-b-2 flex items-center gap-2 transition-all ${
              activeTab === 'share'
                ? 'border-blue-600 text-blue-700 bg-white -mb-px'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Share2 className="w-4 h-4" />
            <span>Liên kết &amp; Mã QR</span>
          </button>
          <button
            onClick={() => setActiveTab('print_preview')}
            className={`py-3 px-4 text-xs font-bold border-b-2 flex items-center gap-2 transition-all ${
              activeTab === 'print_preview'
                ? 'border-blue-600 text-blue-700 bg-white -mb-px'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Printer className="w-4 h-4" />
            <span>Xem trước phiếu thi in ấn</span>
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-6 overflow-y-auto space-y-6">

          {activeTab === 'share' ? (
            <>
              {/* SECTION A: THÔNG TIN BÀI THI & TRẠNG THÁI THỰC TẾ */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4.5 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                      MÃ THAM GIA BÀI THI
                    </span>
                    <div className="flex items-center gap-2.5 mt-0.5">
                      <span className="text-3xl font-black font-mono text-blue-700 tracking-wider">
                        {examCode}
                      </span>
                      <button
                        onClick={() => copyToClipboard(examCode, 'code')}
                        className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-600 transition-colors"
                        title="Sao chép mã bài thi"
                      >
                        {copiedCode ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Real-time Status Badge */}
                  <div className="flex flex-col sm:items-end gap-1.5">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      TRẠNG THÁI PHÒNG THI
                    </span>
                    <div className="flex items-center gap-2">
                      <span className={`px-3 py-1 text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-2xs ${
                        exam.isPublished
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                          : 'bg-amber-100 text-amber-800 border border-amber-300'
                      }`}>
                        <span className={`w-2 h-2 rounded-full ${exam.isPublished ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
                        <span>{exam.isPublished ? 'Đang mở (Nhận bài thi)' : 'Chưa mở (Bản nháp / Khóa)'}</span>
                      </span>

                      {onTogglePublish && (
                        <button
                          onClick={() => onTogglePublish(exam.id)}
                          className="px-2.5 py-1 text-xs font-semibold rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 transition-colors"
                          title="Chuyển đổi trạng thái mở hoặc đóng bài thi"
                        >
                          {exam.isPublished ? 'Đóng thi' : 'Mở thi ngay'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600 pt-2 border-t border-slate-200/80">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-blue-600" />
                    <strong>{exam.durationMinutes}</strong> phút
                  </span>
                  <span>•</span>
                  <span className="flex items-center gap-1">
                    <FileText className="w-3.5 h-3.5 text-indigo-600" />
                    <strong>{totalQuestionsCount}</strong> câu hỏi
                  </span>
                  <span>•</span>
                  <span className="flex items-center gap-1">
                    <Award className="w-3.5 h-3.5 text-amber-600" />
                    Thang <strong>{exam.totalScore || 10.0}</strong> điểm
                  </span>
                  <span>•</span>
                  <span>Giáo viên: <strong>{exam.authorName || APP_CONFIG.APP_AUTHOR}</strong></span>
                </div>
              </div>

              {/* SECTION B: CHIA SẺ BẰNG LIÊN KẾT TRỰC TIẾP */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                    <LinkIcon className="w-3.5 h-3.5 text-blue-600" />
                    <span>Đường dẫn truy cập trực tiếp bài thi (Không cần nhập mã)</span>
                  </label>
                  <span className="text-[11px] text-emerald-600 font-bold bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                    URL Thực tế
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={directLink}
                    className="flex-1 p-2.5 rounded-xl border border-slate-300 bg-slate-50 text-xs font-mono text-slate-900 select-all focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                  />
                  <button
                    onClick={() => copyToClipboard(directLink, 'link')}
                    className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 shadow-xs ${
                      copiedLink
                        ? 'bg-emerald-600 text-white shadow-emerald-500/20'
                        : 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-500/20'
                    }`}
                  >
                    {copiedLink ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    <span>{copiedLink ? 'Đã sao chép liên kết!' : 'Sao chép liên kết'}</span>
                  </button>
                </div>

                <div className="flex items-center justify-between text-[11px] text-slate-500">
                  <span>Học sinh mở link này trên điện thoại hoặc máy tính để vào thẳng phòng thi.</span>
                  <a
                    href={directLink}
                    target="_blank"
                    rel="noreferrer"
                    className="text-blue-600 hover:text-blue-800 font-bold flex items-center gap-1 hover:underline"
                  >
                    <span>Mở thử bài thi</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>

              {/* SECTION C: TẠO & HIỂN THỊ MÃ QR CODE */}
              <div className="bg-gradient-to-br from-blue-50/70 via-indigo-50/40 to-slate-50 border border-blue-200/80 rounded-2xl p-5 flex flex-col sm:flex-row items-center gap-6">
                
                {/* QR Code Canvas/Image Box */}
                <div className="bg-white p-3.5 rounded-2xl shadow-md border border-slate-200 shrink-0 text-center">
                  {isGeneratingQr ? (
                    <div className="w-44 h-44 flex flex-col items-center justify-center text-xs text-slate-400 gap-2">
                      <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                      <span>Đang tạo QR...</span>
                    </div>
                  ) : qrDataUrl ? (
                    <img
                      src={qrDataUrl}
                      alt={`QR Code ${examCode}`}
                      className="w-44 h-44 rounded-lg object-contain block mx-auto"
                    />
                  ) : qrSvgString ? (
                    <div
                      className="w-44 h-44 mx-auto flex items-center justify-center"
                      dangerouslySetInnerHTML={{ __html: qrSvgString }}
                    />
                  ) : (
                    <div className="w-44 h-44 flex items-center justify-center text-xs text-rose-500">
                      Không thể tải QR
                    </div>
                  )}

                  {/* Caption underneath QR (Requirement 3C) */}
                  <div className="mt-2 pt-2 border-t border-slate-100">
                    <span className="text-[11px] font-mono font-bold text-slate-900 block">
                      MÃ ĐỀ: {examCode}
                    </span>
                    <span className="text-[10px] text-slate-500 block truncate max-w-[176px]">
                      {exam.title}
                    </span>
                  </div>
                </div>

                {/* QR Description and Actions */}
                <div className="flex-1 space-y-3 text-center sm:text-left">
                  <div>
                    <h4 className="text-sm font-bold text-slate-900 flex items-center justify-center sm:justify-start gap-1.5">
                      <QrCode className="w-4 h-4 text-blue-600" />
                      <span>Mã QR Tham Gia Trực Tuyến</span>
                    </h4>
                    <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                      Mã QR được tạo từ liên kết thực tế. Học sinh chỉ cần mở camera điện thoại hoặc Zalo để quét và vào thi ngay.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 pt-1">
                    {/* Download QR PNG Button */}
                    <button
                      onClick={handleDownloadQrPng}
                      className="px-3.5 py-2 rounded-xl bg-white border border-slate-200 hover:border-blue-400 hover:bg-blue-50/50 text-slate-800 text-xs font-bold shadow-2xs flex items-center gap-1.5 transition-all"
                      title="Tải ảnh mã QR màu đen nền trắng sắc nét"
                    >
                      <Download className="w-3.5 h-3.5 text-blue-600" />
                      <span>Tải mã QR (PNG)</span>
                    </button>

                    {/* Download Full Ticket Card PNG Button */}
                    <button
                      onClick={handleDownloadTicketCardPng}
                      className="px-3.5 py-2 rounded-xl bg-white border border-slate-200 hover:border-indigo-400 hover:bg-indigo-50/50 text-slate-800 text-xs font-bold shadow-2xs flex items-center gap-1.5 transition-all"
                      title="Tải trọn bộ phiếu thi có tiêu đề, mã đề, hướng dẫn và QR"
                    >
                      <FileText className="w-3.5 h-3.5 text-indigo-600" />
                      <span>Tải phiếu thi có QR</span>
                    </button>

                    {/* In mã QR Button */}
                    <button
                      onClick={handlePrint}
                      className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-black text-white text-xs font-bold shadow-2xs flex items-center gap-1.5 transition-all"
                      title="In phiếu thi kèm QR cho học sinh trên lớp"
                    >
                      <Printer className="w-3.5 h-3.5 text-blue-300" />
                      <span>In mã QR</span>
                    </button>
                  </div>
                </div>

              </div>

              {/* ACTION FOOTER */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-slate-100">
                <button
                  onClick={handleNativeShare}
                  className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                    copiedAnnouncement
                      ? 'bg-emerald-600 text-white'
                      : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-900 border border-indigo-200'
                  }`}
                  title="Gửi thông báo làm bài thi qua Zalo, Facebook hoặc Email"
                >
                  <Share2 className="w-4 h-4 text-indigo-600" />
                  <span>{copiedAnnouncement ? 'Đã sao chép tin nhắn Zalo!' : 'Chia sẻ qua Zalo / Email'}</span>
                </button>

                <div className="flex items-center justify-end gap-2">
                  <button
                    onClick={onClose}
                    className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors"
                  >
                    Đóng
                  </button>
                </div>
              </div>
            </>
          ) : (
            /* PRINT PREVIEW TAB */
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-xs text-slate-500">
                  Xem trước bản in phiếu thi cho học sinh. Bạn có thể in trực tiếp hoặc tải ảnh về máy.
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => window.print()}
                    className="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs"
                  >
                    <Printer className="w-4 h-4" />
                    <span>In ngay</span>
                  </button>
                  <button
                    onClick={handleDownloadTicketCardPng}
                    className="px-3.5 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold flex items-center gap-1.5"
                  >
                    <Download className="w-4 h-4 text-blue-600" />
                    <span>Tải ảnh phiếu in</span>
                  </button>
                </div>
              </div>

              {/* Printable Ticket Card Component */}
              <div
                ref={printableRef}
                id="hqtest-printable-ticket"
                className="bg-white border-2 border-slate-300 rounded-3xl p-6 sm:p-8 text-center max-w-lg mx-auto shadow-sm space-y-4"
              >
                <div className="border-b border-slate-200 pb-3">
                  <div className="text-xl font-black text-blue-900 tracking-tight">
                    {APP_CONFIG.APP_NAME}
                  </div>
                  <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mt-0.5">
                    PHIẾU THAM GIA BÀI THI TRỰC TUYẾN (GDPT 2018)
                  </div>
                </div>

                <div>
                  <h3 className="text-base sm:text-lg font-extrabold text-slate-900">
                    {exam.title}
                  </h3>
                  <div className="mt-2 inline-block bg-slate-100 border border-slate-300 rounded-xl px-5 py-2">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                      MÃ THAM GIA:
                    </span>
                    <span className="text-2xl font-black font-mono tracking-widest text-blue-700">
                      {examCode}
                    </span>
                  </div>
                </div>

                <div className="flex justify-center py-2">
                  {qrDataUrl ? (
                    <img
                      src={qrDataUrl}
                      alt="QR Code"
                      className="w-48 h-48 border border-slate-200 p-2 rounded-xl"
                    />
                  ) : (
                    <div className="w-48 h-48 border border-slate-200 flex items-center justify-center text-xs text-slate-400 rounded-xl">
                      Đang nạp mã QR...
                    </div>
                  )}
                </div>

                <div className="text-xs text-slate-600 space-y-1">
                  <p>Thời gian làm bài: <strong>{exam.durationMinutes} phút</strong> • Số lượng: <strong>{totalQuestionsCount} câu</strong></p>
                  <p>Giáo viên: <strong>{exam.authorName || APP_CONFIG.APP_AUTHOR}</strong> • {APP_CONFIG.APP_SCHOOL}</p>
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-xl p-2.5 text-[11px] text-blue-900 font-mono break-all">
                  Đường dẫn: {directLink}
                </div>

                <div className="text-[11px] text-slate-500 text-left pt-2 border-t border-slate-100 space-y-1">
                  <p>1. Dùng điện thoại / máy tính bảng quét mã QR trên hoặc truy cập đường link.</p>
                  <p>2. Nhập chính xác Họ tên, Lớp và bấm "Bắt đầu làm bài".</p>
                  <p>3. Bài thi sẽ tự động chấm điểm và gửi kết quả về cho giáo viên sau khi nộp.</p>
                </div>
              </div>
            </div>
          )}

        </div>

      </div>
    </div>
  );
};
