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
  Award
} from 'lucide-react';
import { Exam } from '../../types';
import { APP_CONFIG } from '../../constants/brand';

interface ExamShareModalProps {
  isOpen: boolean;
  exam: Exam | null;
  onClose: () => void;
}

export const ExamShareModal: React.FC<ExamShareModalProps> = ({
  isOpen,
  exam,
  onClose,
}) => {
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedAnnouncement, setCopiedAnnouncement] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [shareSuccess, setShareSuccess] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  if (!isOpen || !exam) return null;

  // Build actual direct URLs
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://hqtest.edu.vn';
  const directLink = `${origin}/c/${exam.code}`;
  const queryFallbackLink = `${origin}/?exam=${exam.code}`;

  // Generate QR code data URL
  useEffect(() => {
    let isMounted = true;
    QRCode.toDataURL(directLink, {
      width: 320,
      margin: 2,
      color: {
        dark: '#1e3a8a', // Deep Blue
        light: '#ffffff',
      },
      errorCorrectionLevel: 'H',
    })
      .then((url) => {
        if (isMounted) setQrDataUrl(url);
      })
      .catch((err) => {
        console.error('QR code generation error:', err);
      });

    return () => {
      isMounted = false;
    };
  }, [directLink]);

  const copyToClipboard = async (text: string, type: 'link' | 'code' | 'announcement') => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        // Fallback for older browsers
        const textarea = document.createElement('textarea');
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }

      if (type === 'link') {
        setCopiedLink(true);
        setTimeout(() => setCopiedLink(false), 2500);
      } else if (type === 'code') {
        setCopiedCode(true);
        setTimeout(() => setCopiedCode(false), 2500);
      } else {
        setCopiedAnnouncement(true);
        setTimeout(() => setCopiedAnnouncement(false), 2500);
      }
    } catch (err) {
      console.warn('Copy error:', err);
    }
  };

  const getAnnouncementText = () => {
    return `THÔNG BÁO LÀM BÀI THI ${APP_CONFIG.APP_NAME}

Tên bài thi: ${exam.title}
Mã bài thi: ${exam.code}
Link tham gia trực tiếp: ${directLink}
Thời gian làm bài: ${exam.durationMinutes} phút
Số lượng câu hỏi: ${exam.totalQuestions} câu
Thang điểm: ${exam.totalScore || 10.0} điểm

Các em học sinh truy cập link trên hoặc quét mã QR để bắt đầu làm bài!`;
  };

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Bài thi: ${exam.title}`,
          text: `Tham gia bài thi Hóa học trên ${APP_CONFIG.APP_NAME} (Mã: ${exam.code})`,
          url: directLink,
        });
        setShareSuccess('Đã gửi thông báo chia sẻ!');
        setTimeout(() => setShareSuccess(null), 3000);
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          copyToClipboard(getAnnouncementText(), 'announcement');
        }
      }
    } else {
      copyToClipboard(getAnnouncementText(), 'announcement');
    }
  };

  const handleDownloadQr = () => {
    if (!qrDataUrl) return;
    const a = document.createElement('a');
    a.href = qrDataUrl;
    a.download = `HQTest_QR_${exam.code}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Vui lòng cho phép popup để in mã QR bài thi.');
      return;
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>HQTest - In Mã Bài Thi ${exam.code}</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
              padding: 40px;
              color: #0f172a;
              text-align: center;
            }
            .card {
              max-width: 500px;
              margin: 0 auto;
              border: 3px solid #1e3a8a;
              border-radius: 20px;
              padding: 30px;
            }
            .brand {
              font-size: 24px;
              font-weight: 800;
              color: #1e3a8a;
              margin-bottom: 8px;
            }
            .title {
              font-size: 18px;
              font-weight: 700;
              margin: 12px 0;
            }
            .code-box {
              background: #f1f5f9;
              padding: 12px 24px;
              border-radius: 12px;
              display: inline-block;
              font-size: 32px;
              font-weight: 900;
              letter-spacing: 4px;
              color: #1d4ed8;
              margin: 15px 0;
            }
            .qr-img {
              width: 240px;
              height: 240px;
              margin: 10px auto;
            }
            .meta {
              font-size: 13px;
              color: #475569;
              margin-top: 15px;
              line-height: 1.6;
            }
            .link {
              font-size: 12px;
              color: #2563eb;
              word-break: break-all;
              margin-top: 10px;
            }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="brand">${APP_CONFIG.APP_NAME}</div>
            <div style="font-size: 12px; color: #64748b; text-transform: uppercase; font-weight: bold;">PHIẾU THAM GIA BÀI THI TRỰC TUYẾN</div>
            <div class="title">${exam.title}</div>
            <div>Mã bài thi:</div>
            <div class="code-box">${exam.code}</div>
            <div>
              <img class="qr-img" src="${qrDataUrl}" alt="QR Code" />
            </div>
            <div class="meta">
              Thời gian làm bài: <strong>${exam.durationMinutes} phút</strong> • Số câu: <strong>${exam.totalQuestions} câu</strong><br/>
              Giáo viên ra đề: <strong>${exam.authorName}</strong>
            </div>
            <div class="link">Đường dẫn: ${directLink}</div>
          </div>
          <script>
            window.onload = function() {
              window.print();
            }
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-xl rounded-3xl shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-700 via-indigo-700 to-blue-800 px-6 py-4 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-white/10 rounded-xl">
              <Share2 className="w-5 h-5 text-blue-200" />
            </div>
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-blue-200 flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5" />
                Chia Sẻ Phòng Thi Học Sinh
              </span>
              <h2 className="text-base font-extrabold text-white line-clamp-1">
                {exam.title}
              </h2>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-white/10 text-white/80 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-6">
          
          {shareSuccess && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold rounded-xl flex items-center gap-2">
              <Check className="w-4 h-4 text-emerald-600" />
              <span>{shareSuccess}</span>
            </div>
          )}

          {/* 1. Large Exam Code Section */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                MÃ BÀI THI CHO HỌC SINH
              </p>
              <p className="text-3xl font-black font-mono text-blue-700 tracking-wider mt-0.5">
                {exam.code}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                ⏱ {exam.durationMinutes} phút • 📝 {exam.totalQuestions} câu • {exam.isPublished ? '🟢 Đang mở thi' : '⚪ Đã đóng'}
              </p>
            </div>

            <button
              onClick={() => copyToClipboard(exam.code, 'code')}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 shrink-0 ${
                copiedCode 
                  ? 'bg-emerald-600 text-white shadow-xs' 
                  : 'bg-white border border-slate-300 hover:border-blue-500 text-slate-800 shadow-xs'
              }`}
            >
              {copiedCode ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4 text-slate-600" />}
              <span>{copiedCode ? 'Đã sao chép mã!' : 'Sao chép mã'}</span>
            </button>
          </div>

          {/* 2. Direct Link Section */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
              <LinkIcon className="w-3.5 h-3.5 text-blue-600" />
              <span>Đường dẫn truy cập trực tiếp (Không cần nhập mã)</span>
            </label>
            
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={directLink}
                className="flex-1 p-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-mono text-slate-800 select-all focus:outline-none"
              />
              <button
                onClick={() => copyToClipboard(directLink, 'link')}
                className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 ${
                  copiedLink
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-blue-600 hover:bg-blue-700 text-white shadow-sm shadow-blue-500/20'
                }`}
              >
                {copiedLink ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                <span>{copiedLink ? 'Đã chép link!' : 'Sao chép link'}</span>
              </button>
            </div>
            <p className="text-[11px] text-slate-500">
              Học sinh nhấp vào link này sẽ được đưa thẳng vào phòng thi, tự động nhận diện mã <strong>{exam.code}</strong>.
            </p>
          </div>

          {/* 3. QR Code Section */}
          <div className="bg-gradient-to-b from-blue-50/50 to-indigo-50/50 border border-blue-100 rounded-2xl p-5 flex flex-col sm:flex-row items-center gap-5">
            <div className="bg-white p-3 rounded-2xl shadow-sm border border-blue-100 shrink-0">
              {qrDataUrl ? (
                <img 
                  src={qrDataUrl} 
                  alt={`QR Code ${exam.code}`} 
                  className="w-36 h-36 rounded-lg object-contain" 
                />
              ) : (
                <div className="w-36 h-36 flex items-center justify-center text-xs text-slate-400">
                  Đang tạo QR...
                </div>
              )}
            </div>

            <div className="flex-1 space-y-3 text-center sm:text-left">
              <div>
                <h4 className="text-sm font-bold text-slate-900 flex items-center justify-center sm:justify-start gap-1.5">
                  <QrCode className="w-4 h-4 text-blue-600" />
                  <span>Mã QR Tham Gia Bài Thi</span>
                </h4>
                <p className="text-xs text-slate-600 mt-1">
                  Học sinh dùng điện thoại hoặc máy tính bảng quét mã để vào thi ngay mà không cần gõ bàn phím.
                </p>
              </div>

              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                <button
                  onClick={handleDownloadQr}
                  className="px-3 py-1.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-2xs flex items-center gap-1.5 transition-colors"
                >
                  <Download className="w-3.5 h-3.5 text-blue-600" />
                  <span>Tải ảnh QR (.png)</span>
                </button>

                <button
                  onClick={handlePrint}
                  className="px-3 py-1.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-2xs flex items-center gap-1.5 transition-colors"
                >
                  <Printer className="w-3.5 h-3.5 text-indigo-600" />
                  <span>In phiếu QR</span>
                </button>
              </div>
            </div>
          </div>

          {/* 4. Action Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-slate-100">
            <button
              onClick={handleNativeShare}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                copiedAnnouncement
                  ? 'bg-emerald-600 text-white'
                  : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-900 border border-indigo-200'
              }`}
            >
              <Share2 className="w-4 h-4 text-indigo-600" />
              <span>{copiedAnnouncement ? 'Đã sao chép thông báo Zalo!' : 'Gửi thông báo qua Zalo / Email'}</span>
            </button>

            <div className="flex items-center justify-end gap-2">
              <a
                href={directLink}
                target="_blank"
                rel="noreferrer"
                className="px-3 py-2 rounded-xl text-xs font-bold text-slate-600 hover:text-blue-700 hover:bg-slate-50 transition-colors flex items-center gap-1"
              >
                <span>Mở thử link</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>

              <button
                onClick={onClose}
                className="px-4 py-2 bg-slate-900 hover:bg-black text-white text-xs font-bold rounded-xl transition-colors"
              >
                Đóng
              </button>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
};
