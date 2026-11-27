import React, { useState, useEffect, useMemo } from 'react';
import { User, Exam, StudentSubmission, ClassEnrollment, HubLearningProfile } from '../../types';
import {
  GraduationCap,
  Play,
  Clock,
  Award,
  FileText,
  FlaskConical,
  QrCode,
  Users,
  PlusCircle,
  CheckCircle2,
  AlertCircle,
  BookOpen,
  Lock,
  Sparkles,
  Trophy,
  Link2,
  Zap,
} from 'lucide-react';
import { getUserGreeting, APP_CONFIG } from '../../constants/brand';
import { StorageService } from '../../services/storage';
import { ExamShareModal } from '../common/ExamShareModal';
import { normalizeExamCode } from '../../utils/urlHelper';
import { sanitizeExamForStudent } from '../../services/firebase';
import { HubSyncOutcome } from '../../services/hubService';

export interface StudentAssignedExamItem {
  exam: Exam;
  classCode: string;
  className: string;
  ownerId: string;
}

interface PlaygroundQuestion {
  id: string;
  prompt: string;
  options: string[];
  correctIndex: number;
}

const PLAYGROUND_CHALLENGES: {
  code: string;
  title: string;
  xpReward: number;
  badge: { id: string; name: string; icon: string };
  questions: PlaygroundQuestion[];
}[] = [
  {
    code: 'SANCHOI_HOA12',
    title: 'Thử thách Sân chơi: Ester – Lipid & Kim loại',
    xpReward: 50,
    badge: { id: 'badge_alchemist', name: 'Nhà Giả Kim', icon: '⚗️' },
    questions: [
      {
        id: 'pg1',
        prompt: 'Công thức phân tử của ethyl acetate là gì?',
        options: ['CH₃COOCH₃', 'CH₃COOC₂H₅', 'HCOOC₂H₅', 'C₂H₅COOCH₃'],
        correctIndex: 1,
      },
      {
        id: 'pg2',
        prompt: 'Kim loại nào sau đây dẫn điện tốt nhất trong điều kiện thường?',
        options: ['Cu', 'Au', 'Ag', 'Al'],
        correctIndex: 2,
      },
      {
        id: 'pg3',
        prompt: 'Phản ứng thủy phân ester trong môi trường kiềm được gọi là phản ứng gì?',
        options: ['Ester hóa', 'Xà phòng hóa', 'Trùng hợp', 'Cracking'],
        correctIndex: 1,
      },
    ],
  },
  {
    code: 'SANCHOI_TOCDO',
    title: 'Tia chớp Nguyên tử & Liên kết hóa học',
    xpReward: 40,
    badge: { id: 'badge_lightning', name: 'Tia Chớp Hóa Học', icon: '⚡' },
    questions: [
      {
        id: 'pg4',
        prompt: 'Số hiệu nguyên tử của nguyên tố Carbon (C) là bao nhiêu?',
        options: ['6', '8', '12', '14'],
        correctIndex: 0,
      },
      {
        id: 'pg5',
        prompt: 'Liên kết trong phân tử NaCl thuộc loại liên kết nào?',
        options: ['Cộng hóa trị không cực', 'Liên kết hydrogen', 'Liên kết ion', 'Liên kết kim loại'],
        correctIndex: 2,
      },
      {
        id: 'pg6',
        prompt: 'Dung dịch có pH < 7 ở 25°C có môi trường nào?',
        options: ['Base', 'Trung tính', 'Acid', 'Lưỡng tính'],
        correctIndex: 2,
      },
    ],
  },
];

interface StudentHomeProps {
  currentUser: User;
  exams?: Exam[];
  submissions: StudentSubmission[];
  enrollments?: ClassEnrollment[];
  assignedExams?: StudentAssignedExamItem[];
  hubProfiles?: HubLearningProfile[];
  lastHubSyncNotice?: string | null;
  onJoinClassByCode?: (code: string) => Promise<{ success: boolean; errorMessage?: string }>;
  onLinkHubProfile?: (classCode: string, stt: number) => Promise<{ success: boolean; message: string }>;
  onAwardPlaygroundReward?: (params: {
    activityCode: string;
    activityTitle: string;
    score: number;
    maxScore: number;
    xpReward: number;
    badge?: { id: string; name: string; icon?: string };
  }) => Promise<HubSyncOutcome>;
  onStartExam: (exam: Exam, studentName: string, studentClass: string, ownerId?: string) => void;
  onOpenExamLanding?: (examCode: string) => void;
  onReviewSubmission: (sub: StudentSubmission) => void;
}

export const StudentHome: React.FC<StudentHomeProps> = ({
  currentUser,
  exams = [],
  submissions,
  enrollments = [],
  assignedExams = [],
  hubProfiles = [],
  lastHubSyncNotice = null,
  onJoinClassByCode,
  onLinkHubProfile,
  onAwardPlaygroundReward,
  onStartExam,
  onOpenExamLanding,
  onReviewSubmission,
}) => {
  const [examCode, setExamCode] = useState('');
  const [name, setName] = useState(currentUser.name || '');
  const [className, setClassName] = useState(currentUser.className || '');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [shareExam, setShareExam] = useState<Exam | null>(null);

  // Join classroom state
  const [joinClassCode, setJoinClassCode] = useState('');
  const [isJoiningClass, setIsJoiningClass] = useState(false);
  const [classFeedback, setClassFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Hub profile link & Sân chơi state
  const [linkClassCode, setLinkClassCode] = useState(enrollments[0]?.classCode || '');
  const [linkStt, setLinkStt] = useState('');
  const [isLinkingHub, setIsLinkingHub] = useState(false);
  const [hubFeedback, setHubFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [activeChallengeIdx, setActiveChallengeIdx] = useState<number | null>(null);
  const [challengeAnswers, setChallengeAnswers] = useState<Record<string, number>>({});
  const [isSubmittingChallenge, setIsSubmittingChallenge] = useState(false);

  const primaryHubProfile = hubProfiles[0] || null;
  const totalHubXp = useMemo(
    () => hubProfiles.reduce((sum, p) => sum + (p.xp || 0), 0),
    [hubProfiles]
  );
  const earnedBadges = useMemo(() => {
    const map = new Map<string, { id: string; name: string; icon?: string }>();
    hubProfiles.forEach((p) => {
      (p.badges || []).forEach((b) => {
        if (!map.has(b.id)) map.set(b.id, b);
      });
    });
    return Array.from(map.values());
  }, [hubProfiles]);

  useEffect(() => {
    setName(currentUser.name || '');
    setClassName(currentUser.className || (enrollments[0]?.className || ''));
  }, [currentUser, enrollments]);

  const currentUid = currentUser.uid || currentUser.id;

  const builtInPublicExams = useMemo(() => StorageService.getBuiltInPublicExams(), []);
  const customActiveExams = useMemo(() => {
    const seenCodes = new Set(assignedExams.map((a) => normalizeExamCode(a.exam.code)));
    return exams.filter((e) => e.isPublished && !seenCodes.has(normalizeExamCode(e.code)));
  }, [exams, assignedExams]);

  const practiceExams = useMemo(() => {
    const assignedCodes = new Set(assignedExams.map((a) => normalizeExamCode(a.exam.code)));
    const combined = [...customActiveExams, ...builtInPublicExams.filter((b) => !assignedCodes.has(normalizeExamCode(b.code)))];
    return combined;
  }, [customActiveExams, builtInPublicExams, assignedExams]);

  const mySubmissions = useMemo(
    () => submissions.filter((s) => s.studentId === currentUid),
    [submissions, currentUid]
  );

  const handleJoinByCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    const resolvedClass = className.trim() || enrollments[0]?.className || 'Tự do';
    if (!name.trim() || !examCode.trim()) {
      setErrorMsg('Vui lòng nhập đầy đủ Họ tên và Mã bài thi!');
      return;
    }

    const cleanCode = normalizeExamCode(examCode);
    setIsLookingUp(true);
    try {
      const result = await StorageService.checkExamStatusAsync(cleanCode);

      if (result.status === 'not_found' || !result.exam) {
        setErrorMsg(`Không tìm thấy bài thi với mã "${cleanCode}". Vui lòng kiểm tra lại mã do giáo viên cung cấp!`);
        return;
      }

      if (result.status === 'not_published') {
        setErrorMsg(`Bài thi "${result.exam.title}" (Mã: ${cleanCode}) hiện đang ở trạng thái Bản nháp hoặc đã được giáo viên đóng phòng thi.`);
        return;
      }

      if (result.status === 'not_started') {
        setErrorMsg(result.message || 'Bài thi chưa đến thời gian mở.');
        return;
      }

      if (result.status === 'expired') {
        setErrorMsg(result.message || 'Bài thi đã kết thúc thời hạn làm bài.');
        return;
      }

      if (result.status === 'password_required') {
        if (onOpenExamLanding) {
          onOpenExamLanding(cleanCode);
        } else {
          setErrorMsg(result.message || 'Bài thi yêu cầu mật khẩu do giáo viên cung cấp.');
        }
        return;
      }

      if (result.status !== 'found') {
        setErrorMsg(result.message || 'Không thể mở bài thi lúc này. Vui lòng thử lại.');
        return;
      }

      onStartExam(result.exam, name.trim(), resolvedClass, result.ownerId);
    } finally {
      setIsLookingUp(false);
    }
  };

  const handleJoinClassSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onJoinClassByCode) return;
    setClassFeedback(null);
    const clean = normalizeExamCode(joinClassCode);
    if (!clean) {
      setClassFeedback({ type: 'error', text: 'Vui lòng nhập mã lớp học do giáo viên cung cấp.' });
      return;
    }

    setIsJoiningClass(true);
    try {
      const res = await onJoinClassByCode(clean);
      if (!res.success) {
        setClassFeedback({ type: 'error', text: res.errorMessage || 'Không thể tham gia lớp học.' });
        return;
      }
      setJoinClassCode('');
      setClassFeedback({ type: 'success', text: `Đã tham gia lớp học mã "${clean}" thành công!` });
    } finally {
      setIsJoiningClass(false);
    }
  };

  const handleLinkHubSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onLinkHubProfile) return;
    const cleanCode = normalizeExamCode(linkClassCode);
    const parsedStt = Number.parseInt(linkStt, 10);
    if (!cleanCode || !Number.isFinite(parsedStt) || parsedStt <= 0) {
      setHubFeedback({
        type: 'error',
        text: 'Vui lòng nhập đầy đủ Mã lớp và STT học sinh (số nguyên dương).',
      });
      return;
    }
    setIsLinkingHub(true);
    setHubFeedback(null);
    try {
      const res = await onLinkHubProfile(cleanCode, parsedStt);
      setHubFeedback({ type: res.success ? 'success' : 'error', text: res.message });
      if (res.success) {
        setLinkStt('');
      }
    } finally {
      setIsLinkingHub(false);
    }
  };

  const handleSubmitPlaygroundChallenge = async () => {
    if (activeChallengeIdx === null || !onAwardPlaygroundReward) return;
    const challenge = PLAYGROUND_CHALLENGES[activeChallengeIdx];
    if (!challenge) return;

    const correctCount = challenge.questions.reduce(
      (acc, q) => acc + (challengeAnswers[q.id] === q.correctIndex ? 1 : 0),
      0
    );
    const maxScore = 10;
    const score = Number(((correctCount / challenge.questions.length) * maxScore).toFixed(2));
    const earnedXp = Math.max(10, Math.round((correctCount / challenge.questions.length) * challenge.xpReward));
    const unlockedBadge = correctCount >= 2 ? challenge.badge : undefined;

    setIsSubmittingChallenge(true);
    setHubFeedback(null);
    try {
      const outcome = await onAwardPlaygroundReward({
        activityCode: challenge.code,
        activityTitle: challenge.title,
        score,
        maxScore,
        xpReward: earnedXp,
        badge: unlockedBadge,
      });

      if (outcome.synced) {
        setHubFeedback({
          type: 'success',
          text: `Hoàn thành "${challenge.title}" (${correctCount}/${challenge.questions.length} câu đúng)! Đã cộng +${outcome.xpEarned} XP${
            unlockedBadge ? ` & nhận huy hiệu "${unlockedBadge.name}"` : ''
          } trực tiếp vào hub_learning_profiles/${outcome.profileDocId}.`,
        });
      } else {
        setHubFeedback({
          type: 'error',
          text: `Đạt ${correctCount}/${challenge.questions.length} câu đúng (+${earnedXp} XP), nhưng chưa đồng bộ Hub: ${
            outcome.error || 'Vui lòng liên kết Mã lớp + STT ở trên.'
          }`,
        });
      }
      setActiveChallengeIdx(null);
      setChallengeAnswers({});
    } finally {
      setIsSubmittingChallenge(false);
    }
  };

  return (
    <div className="space-y-6">
      {lastHubSyncNotice && (
        <div className="p-3.5 rounded-2xl border bg-emerald-50 border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{lastHubSyncNotice}</span>
        </div>
      )}
      {/* Top Banner & Quick Join Card */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Welcome Text */}
        <div className="lg:col-span-2 bg-gradient-to-r from-blue-700 to-indigo-800 rounded-2xl p-6 md:p-8 text-white shadow-xl flex flex-col justify-between">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 text-blue-200 text-xs font-semibold mb-3">
              <FlaskConical className="w-3.5 h-3.5" />
              <span>{APP_CONFIG.APP_NAME} – Không Gian Học Tập &amp; Phòng Thi Học Sinh</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">
              {getUserGreeting(currentUser, name)}
            </h1>
            <p className="mt-2 text-sm text-blue-100 max-w-xl leading-relaxed">
              Tham gia lớp học bằng mã lớp của giáo viên để nhận đề thi được giao, hoặc nhập trực tiếp mã bài thi để vào làm bài ngay.
            </p>
          </div>

          <div className="mt-6 grid grid-cols-3 gap-4 text-xs text-blue-200 border-t border-white/10 pt-4">
            <div>
              <p className="font-bold text-lg text-white">{enrollments.length}</p>
              <p>Lớp đã tham gia</p>
            </div>
            <div>
              <p className="font-bold text-lg text-white">{assignedExams.length}</p>
              <p>Bài được giao</p>
            </div>
            <div>
              <p className="font-bold text-lg text-white">{mySubmissions.length}</p>
              <p>Bài đã nộp</p>
            </div>
          </div>
        </div>

        {/* Quick Join Form */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs flex flex-col justify-between">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-800 flex items-center gap-2 mb-3">
              <GraduationCap className="w-4 h-4 text-blue-600" />
              Vào phòng thi bằng mã đề
            </h2>

            {errorMsg && (
              <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium mb-3">
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleJoinByCode} className="space-y-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Họ và tên thí sinh</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Nguyễn Văn A"
                  className="w-full p-2.5 rounded-xl border border-slate-200 text-xs font-semibold focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Lớp</label>
                <input
                  type="text"
                  value={className}
                  onChange={(e) => setClassName(e.target.value)}
                  placeholder="12 Hóa 1"
                  className="w-full p-2.5 rounded-xl border border-slate-200 text-xs font-semibold focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Mã đề thi hoặc mã 6 ký tự (VD: HQ50 hoặc H7K9P2)</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    required
                    value={examCode}
                    onChange={(e) => setExamCode(e.target.value.toUpperCase())}
                    placeholder="VD: HQ50 hoặc H7K9P2"
                    className="flex-1 p-2.5 rounded-xl border border-slate-200 text-xs font-mono font-bold uppercase focus:ring-2 focus:ring-blue-500 bg-slate-50 text-blue-800"
                  />
                  <button
                    type="button"
                    onClick={() => setExamCode('HQ50')}
                    className="px-2.5 py-1 text-[11px] font-bold bg-blue-100 hover:bg-blue-200 text-blue-800 rounded-xl transition-colors shrink-0"
                    title="Nạp nhanh mã đề chuẩn HQ50"
                  >
                    HQ50
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isLookingUp}
                className="w-full mt-2 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-bold text-xs rounded-xl shadow-md shadow-blue-500/20 transition-all flex items-center justify-center gap-2"
              >
                <Play className="w-4 h-4" />
                <span>{isLookingUp ? 'Đang tìm bài thi...' : 'Bắt đầu làm bài thi'}</span>
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* My Classes & Join Class Section */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Users className="w-4 h-4 text-blue-600" />
              <span>Lớp học của tôi ({enrollments.length})</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Nhập mã lớp học do giáo viên cung cấp để xem bài tập và đề kiểm tra được giao riêng cho lớp.
            </p>
          </div>

          {onJoinClassByCode && (
            <form onSubmit={handleJoinClassSubmit} className="flex items-center gap-2">
              <input
                type="text"
                value={joinClassCode}
                onChange={(e) => setJoinClassCode(e.target.value.toUpperCase())}
                placeholder="Nhập mã lớp (VD: L8X2K9)"
                className="px-3 py-2 rounded-xl border border-slate-300 bg-slate-50 text-xs font-mono font-bold uppercase focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="submit"
                disabled={isJoiningClass}
                className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-black disabled:opacity-60 text-white text-xs font-bold flex items-center gap-1.5 shrink-0"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                <span>{isJoiningClass ? 'Đang tham gia...' : 'Tham gia lớp'}</span>
              </button>
            </form>
          )}
        </div>

        {classFeedback && (
          <div
            className={`p-3 rounded-xl border text-xs font-semibold flex items-center gap-2 ${
              classFeedback.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-rose-50 border-rose-200 text-rose-800'
            }`}
          >
            {classFeedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span>{classFeedback.text}</span>
          </div>
        )}

        {enrollments.length === 0 ? (
          <div className="p-4 rounded-xl bg-slate-50 border border-dashed border-slate-200 text-xs text-slate-500 text-center">
            Bạn chưa tham gia lớp học nào. Hãy hỏi giáo viên Mã lớp để tham gia hoặc làm các bài kiểm tra tự luyện bên dưới.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {enrollments.map((en) => (
              <div key={en.id} className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-slate-900 text-xs truncate">{en.className}</span>
                  <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-800 font-mono font-bold text-[10px]">
                    {en.classCode}
                  </span>
                </div>
                <p className="text-[11px] text-slate-600">Giáo viên: {en.teacherName}</p>
                <p className="text-[10px] text-slate-400">
                  Tham gia: {new Date(en.joinedAt).toLocaleDateString('vi-VN')}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Shared Hub Learning Profile & Sân chơi Hóa học (dbHub -> hub_learning_profiles/${classCode}_${stt}) */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Trophy className="w-4 h-4 text-amber-500" />
              <span>Hồ sơ Hub &amp; Sân chơi Hóa học (XP / Huy hiệu)</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Điểm kiểm tra Ngân hàng đề và điểm thưởng Sân chơi được ghi vào{' '}
              <code className="font-mono text-slate-700">testResults</code> và cộng dồn{' '}
              <code className="font-mono text-slate-700">xp</code> tại{' '}
              <code className="font-mono text-emerald-700">
                {primaryHubProfile
                  ? `hub_learning_profiles/${primaryHubProfile.id}`
                  : 'hub_learning_profiles/${classCode}_${stt}'}
              </code>
              .
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-xs font-extrabold">
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              {totalHubXp} XP
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold">
              <Award className="w-3.5 h-3.5 text-emerald-600" />
              {earnedBadges.length} huy hiệu
            </span>
            {primaryHubProfile && (
              <span className="px-2.5 py-1.5 rounded-full bg-slate-100 text-slate-700 font-mono text-[11px] font-bold">
                STT #{primaryHubProfile.stt} · {primaryHubProfile.classCode}
              </span>
            )}
          </div>
        </div>

        {hubFeedback && (
          <div
            className={`p-3 rounded-xl border text-xs font-semibold flex items-center gap-2 ${
              hubFeedback.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-rose-50 border-rose-200 text-rose-800'
            }`}
          >
            {hubFeedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span>{hubFeedback.text}</span>
          </div>
        )}

        {!primaryHubProfile && onLinkHubProfile && (
          <form
            onSubmit={handleLinkHubSubmit}
            className="p-3.5 rounded-xl bg-amber-50/70 border border-amber-200 flex flex-col sm:flex-row sm:items-center gap-2.5"
          >
            <div className="flex items-center gap-2 text-xs text-amber-900 font-semibold flex-1">
              <Link2 className="w-4 h-4 text-amber-600 shrink-0" />
              <span>Liên kết tài khoản với hồ sơ lớp (Mã lớp + STT) để tự động cộng XP về Hub:</span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={linkClassCode}
                onChange={(e) => setLinkClassCode(e.target.value.toUpperCase())}
                placeholder="Mã lớp (VD: 12H1)"
                className="w-32 px-2.5 py-1.5 rounded-lg border border-amber-300 bg-white text-xs font-mono font-bold uppercase"
              />
              <input
                type="number"
                min={1}
                max={999}
                value={linkStt}
                onChange={(e) => setLinkStt(e.target.value)}
                placeholder="STT"
                className="w-20 px-2.5 py-1.5 rounded-lg border border-amber-300 bg-white text-xs font-mono font-bold text-center"
              />
              <button
                type="submit"
                disabled={isLinkingHub}
                className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-xs font-bold shrink-0"
              >
                {isLinkingHub ? 'Đang gắn...' : 'Liên kết Hub'}
              </button>
            </div>
          </form>
        )}

        {earnedBadges.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {earnedBadges.map((b) => (
              <span
                key={b.id}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-bold"
              >
                <span>{b.icon || '🏅'}</span>
                <span>{b.name}</span>
              </span>
            ))}
          </div>
        )}

        {onAwardPlaygroundReward && (
          <div className="space-y-3 pt-1">
            {activeChallengeIdx === null ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {PLAYGROUND_CHALLENGES.map((ch, idx) => (
                  <div
                    key={ch.code}
                    className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-3 hover:border-emerald-300 transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 text-[11px] font-bold text-amber-700">
                        <Zap className="w-3.5 h-3.5" />
                        <span>+{ch.xpReward} XP • Huy hiệu {ch.badge.icon} {ch.badge.name}</span>
                      </div>
                      <p className="text-xs font-bold text-slate-900 mt-1 truncate">{ch.title}</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">{ch.questions.length} câu hỏi nhanh</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveChallengeIdx(idx);
                        setChallengeAnswers({});
                        setHubFeedback(null);
                      }}
                      className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shrink-0 transition-colors"
                    >
                      Chơi ngay
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-slate-50 border border-emerald-200 space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <span className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider">
                      Sân chơi Hóa học
                    </span>
                    <h3 className="text-sm font-bold text-slate-900">
                      {PLAYGROUND_CHALLENGES[activeChallengeIdx].title}
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveChallengeIdx(null)}
                    className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-600 hover:bg-slate-100"
                  >
                    Đóng
                  </button>
                </div>

                <div className="space-y-3">
                  {PLAYGROUND_CHALLENGES[activeChallengeIdx].questions.map((q, qIdx) => (
                    <div key={q.id} className="p-3 rounded-xl bg-white border border-slate-200 space-y-2">
                      <p className="text-xs font-bold text-slate-900">
                        Câu {qIdx + 1}: {q.prompt}
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {q.options.map((opt, optIdx) => {
                          const selected = challengeAnswers[q.id] === optIdx;
                          return (
                            <button
                              key={optIdx}
                              type="button"
                              onClick={() =>
                                setChallengeAnswers((prev) => ({ ...prev, [q.id]: optIdx }))
                              }
                              className={`px-3 py-2 rounded-lg border text-left text-xs font-semibold transition-colors ${
                                selected
                                  ? 'bg-emerald-600 border-emerald-600 text-white'
                                  : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-emerald-50'
                              }`}
                            >
                              {String.fromCharCode(65 + optIdx)}. {opt}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    disabled={isSubmittingChallenge}
                    onClick={() => void handleSubmitPlaygroundChallenge()}
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-xs font-bold flex items-center gap-1.5"
                  >
                    <Trophy className="w-3.5 h-3.5" />
                    <span>{isSubmittingChallenge ? 'Đang ghi điểm Hub...' : 'Hoàn thành & Nhận XP'}</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Assigned Exams in Joined Classes */}
      {assignedExams.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-indigo-600" />
            <span>Bài thi được giao theo lớp ({assignedExams.length})</span>
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {assignedExams.map(({ exam, classCode, className: clsName, ownerId }) => (
              <div
                key={`${classCode}_${exam.id}`}
                className="bg-white border-2 border-indigo-100 rounded-2xl p-5 shadow-xs hover:border-indigo-300 transition-all flex flex-col justify-between gap-4"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <span className="px-2.5 py-0.5 rounded-md bg-indigo-100 text-indigo-800 font-bold text-[11px]">
                      Lớp: {clsName} ({classCode})
                    </span>
                    <span className="px-2.5 py-0.5 rounded-md bg-blue-100 text-blue-800 font-mono font-bold text-xs">
                      {exam.code}
                    </span>
                    {exam.requiresPassword && (
                      <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 text-[11px] font-bold inline-flex items-center gap-1">
                        <Lock className="w-3 h-3" />
                        <span>Có mật khẩu</span>
                      </span>
                    )}
                  </div>

                  <h3 className="font-bold text-slate-900 text-sm">{exam.title}</h3>

                  <div className="flex items-center gap-4 text-xs text-slate-500 mt-2">
                    <span>⏱ {exam.durationMinutes} phút</span>
                    <span>📝 {exam.totalQuestions || exam.questions.length} câu</span>
                    <span>🎯 Thang {exam.totalScore || 10.0} điểm</span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                  <span className="text-[11px] text-slate-500">Giáo viên: {exam.authorName}</span>
                  <button
                    onClick={() => {
                      if ((exam.requiresPassword || exam.questions.length === 0) && onOpenExamLanding) {
                        onOpenExamLanding(exam.code);
                        return;
                      }
                      onStartExam(
                        sanitizeExamForStudent(exam),
                        name.trim() || currentUser.name,
                        className.trim() || clsName,
                        ownerId
                      );
                    }}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors flex items-center gap-1.5"
                  >
                    {exam.requiresPassword ? <Lock className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                    <span>{exam.requiresPassword ? 'Nhập mật khẩu & Làm bài' : 'Làm bài được giao'}</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Public Sample / Practice Exams */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Clock className="w-4 h-4 text-emerald-600" />
            <span>Đề thi mẫu &amp; Tự luyện Hóa học ({practiceExams.length})</span>
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {practiceExams.map((exam) => (
            <div
              key={exam.id}
              className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs hover:border-blue-300 transition-all flex flex-col justify-between gap-4"
            >
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="px-2.5 py-0.5 rounded-md bg-blue-100 text-blue-800 font-mono font-bold text-xs">
                    {exam.code}
                  </span>
                  <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 text-[11px] font-bold">
                    Đang mở
                  </span>
                  <span className="text-xs text-slate-400">
                    Khối {exam.grade === 'chuyen_hsg' ? 'Chuyên & HSG' : `Lớp ${exam.grade}`}
                  </span>
                </div>

                <h3 className="font-bold text-slate-900 text-sm">{exam.title}</h3>

                <div className="flex items-center gap-4 text-xs text-slate-500 mt-2">
                  <span>⏱ {exam.durationMinutes} phút</span>
                  <span>📝 {exam.questions.length} câu</span>
                  <span>🎯 Thang {exam.totalScore || 10.0} điểm</span>
                </div>
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                <span className="text-[11px] text-slate-500">Giáo viên: {exam.authorName}</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShareExam(exam)}
                    className="p-2 border border-slate-200 hover:bg-slate-100 rounded-xl text-slate-600 transition-colors"
                    title="Lấy link & mã QR"
                  >
                    <QrCode className="w-3.5 h-3.5 text-blue-600" />
                  </button>
                  <button
                    onClick={() =>
                      onStartExam(
                        sanitizeExamForStudent(exam),
                        name.trim() || currentUser.name,
                        className.trim() || enrollments[0]?.className || 'Tự do',
                        exam.ownerId
                      )
                    }
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors flex items-center gap-1.5"
                  >
                    <Play className="w-3.5 h-3.5" />
                    <span>Vào thi ngay</span>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* History of Past Submissions */}
      <div className="space-y-4 pt-2">
        <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
          <Award className="w-4 h-4 text-indigo-600" />
          Lịch sử bài làm cá nhân ({mySubmissions.length})
        </h2>

        {mySubmissions.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-slate-400 text-xs italic">
            Bạn chưa hoàn thành bài thi nào. Hãy tham gia bài thi được giao hoặc đề tự luyện ở trên!
          </div>
        ) : (
          <div className="space-y-3">
            {mySubmissions.map((sub) => (
              <div
                key={sub.id}
                className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-blue-50 text-blue-700">
                      {sub.examCode}
                    </span>
                    <span className="font-bold text-slate-900 text-sm">{sub.examTitle}</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    Nộp bài lúc {new Date(sub.submittedAt).toLocaleTimeString('vi-VN')} ngày{' '}
                    {new Date(sub.submittedAt).toLocaleDateString('vi-VN')} • Thời gian làm:{' '}
                    {Math.floor(sub.durationSeconds / 60)} phút {sub.durationSeconds % 60} giây
                  </p>
                </div>

                <div className="flex items-center gap-4 self-end sm:self-center shrink-0">
                  <div className="text-right">
                    <p className="text-lg font-extrabold text-blue-700">
                      {sub.totalScore.toFixed(2)} <span className="text-xs font-normal text-slate-400">/10</span>
                    </p>
                    <p className="text-[10px] text-slate-500">
                      Phần I: {sub.part1Score} | Phần II: {sub.part2Score} | Phần III: {sub.part3Score}
                    </p>
                  </div>

                  <button
                    onClick={() => onReviewSubmission(sub)}
                    className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-black text-white text-xs font-bold transition-colors flex items-center gap-1.5"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>Xem lại bài</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Share & QR Modal */}
      <ExamShareModal isOpen={!!shareExam} exam={shareExam} onClose={() => setShareExam(null)} />
    </div>
  );
};
