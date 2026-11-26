import React, { useEffect, useMemo, useState } from 'react';
import { Exam, ExamShareStatus, Question, User } from '../../types';
import {
  cloneCityExamToPersonalBank,
  cloneCityQuestionToPersonalBank,
  fetchCityExamsForSuperAdmin,
  fetchCityPublicExams,
  fetchCitySharedQuestions,
  reviewExamCityShareByAdmin,
} from '../../services/workspaceService';
import { exportPrintReadyExamWithAnswersDocx } from '../../services/sampleWordTemplateService';
import {
  COGNITIVE_LEVEL_SHORT_LABELS,
  GRADE_LABELS,
  QUESTION_TYPE_SHORT_LABELS,
  getQuestionTopicDisplay,
} from '../../constants/subjects';
import { ChemRenderer } from '../../utils/chemRenderer';
import {
  AlertCircle,
  ArrowRight,
  BookOpen,
  Building2,
  CheckCircle2,
  Clock,
  CopyPlus,
  Database,
  Download,
  Eye,
  FileText,
  Filter,
  Globe,
  RefreshCw,
  School,
  Search,
  ShieldCheck,
  Sparkles,
  User as UserIcon,
  X,
  XCircle,
} from 'lucide-react';

interface CityExamRepositoryProps {
  currentUser: User;
  onExamCloned: (clonedExam: Exam) => void;
  onQuestionCloned?: (clonedQuestion: Question) => void;
  onExamShareStatusChanged?: (
    examId: string,
    nextStatus: ExamShareStatus,
    reviewNote?: string
  ) => void;
  onOpenPersonalExams?: () => void;
  onOpenPersonalQuestionBank?: () => void;
}

type CityRepositoryTab = 'exams' | 'questions';
type AdminExamStatusFilter = 'all' | 'pending_review' | 'city_public';

const TOPIC_DISPLAY_LABELS: Record<string, string> = {
  hoa_dai_cuong: 'Hóa đại cương',
  hoa_vo_co: 'Hóa vô cơ',
  hoa_huu_co: 'Hóa hữu cơ',
  hoa_phan_tich: 'Hóa phân tích',
  hoa_thuc_nghiem: 'Hóa thực nghiệm',
  chuyen_sau_hsg: 'Chuyên sâu & HSG',
  chuyen_de_nang_cao: 'Chuyên đề nâng cao',
};

export const CityExamRepository: React.FC<CityExamRepositoryProps> = ({
  currentUser,
  onExamCloned,
  onQuestionCloned,
  onExamShareStatusChanged,
  onOpenPersonalExams,
  onOpenPersonalQuestionBank,
}) => {
  const isSuperAdmin = currentUser.role === 'admin';
  const adminUid = currentUser.uid || currentUser.id;

  const [activeTab, setActiveTab] = useState<CityRepositoryTab>('exams');
  const [adminStatusFilter, setAdminStatusFilter] = useState<AdminExamStatusFilter>('all');

  // City Exams state
  const [cityExams, setCityExams] = useState<Exam[]>([]);
  const [isLoadingExams, setIsLoadingExams] = useState(true);

  // City Shared Questions state (isSharedCity == true)
  const [cityQuestions, setCityQuestions] = useState<Question[]>([]);
  const [isLoadingQuestions, setIsLoadingQuestions] = useState(true);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [toastAction, setToastAction] = useState<'exams' | 'questions' | null>(null);

  // Exam Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [gradeFilter, setGradeFilter] = useState<string>('all');
  const [topicFilter, setTopicFilter] = useState<string>('all');
  const [schoolFilter, setSchoolFilter] = useState<string>('all');

  // Question Filters
  const [questionSearchTerm, setQuestionSearchTerm] = useState('');
  const [questionGradeFilter, setQuestionGradeFilter] = useState<string>('all');
  const [questionTypeFilter, setQuestionTypeFilter] = useState<string>('all');
  const [questionLevelFilter, setQuestionLevelFilter] = useState<string>('all');

  // Action states
  const [previewExam, setPreviewExam] = useState<Exam | null>(null);
  const [cloningExamId, setCloningExamId] = useState<string | null>(null);
  const [exportingWordId, setExportingWordId] = useState<string | null>(null);
  const [cloningQuestionId, setCloningQuestionId] = useState<string | null>(null);
  const [reviewingExamId, setReviewingExamId] = useState<string | null>(null);
  const [rejectTargetExam, setRejectTargetExam] = useState<Exam | null>(null);
  const [rejectReason, setRejectReason] = useState<string>('');
  const [expandedExplanationIds, setExpandedExplanationIds] = useState<Set<string>>(new Set());

  const showToast = (msg: string, action: 'exams' | 'questions' | null = null) => {
    setToastMsg(msg);
    setToastAction(action);
    window.setTimeout(() => {
      setToastMsg((prev) => (prev === msg ? null : prev));
    }, 5000);
  };

  const loadRepositoryData = async () => {
    setIsLoadingExams(true);
    setIsLoadingQuestions(true);
    setErrorMsg(null);

    const errors: string[] = [];

    const [examsRes, questionsRes] = await Promise.allSettled([
      isSuperAdmin ? fetchCityExamsForSuperAdmin() : fetchCityPublicExams(),
      fetchCitySharedQuestions(),
    ]);

    if (examsRes.status === 'fulfilled') {
      setCityExams(examsRes.value);
    } else {
      errors.push(
        examsRes.reason instanceof Error
          ? examsRes.reason.message
          : 'Không thể tải danh sách Đề thi hoàn chỉnh.'
      );
    }

    if (questionsRes.status === 'fulfilled') {
      setCityQuestions(questionsRes.value);
    } else {
      errors.push(
        questionsRes.reason instanceof Error
          ? questionsRes.reason.message
          : 'Không thể tải Ngân hàng câu hỏi đóng góp.'
      );
    }

    if (errors.length > 0) {
      setErrorMsg(errors.join(' '));
    }

    setIsLoadingExams(false);
    setIsLoadingQuestions(false);
  };

  useEffect(() => {
    void loadRepositoryData();
  }, [isSuperAdmin]);

  const pendingExamsCount = useMemo(
    () => cityExams.filter((ex) => ex.share_status === 'pending_review').length,
    [cityExams]
  );

  const approvedExamsCount = useMemo(
    () => cityExams.filter((ex) => ex.share_status === 'city_public').length,
    [cityExams]
  );

  const availableSchools = useMemo(() => {
    const set = new Set<string>();
    cityExams.forEach((ex) => {
      if (ex.authorSchool?.trim()) set.add(ex.authorSchool.trim());
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'vi'));
  }, [cityExams]);

  const availableTopics = useMemo(() => {
    const set = new Set<string>();
    cityExams.forEach((ex) => {
      if (ex.topic) set.add(ex.topic);
    });
    return Array.from(set);
  }, [cityExams]);

  const filteredExams = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return cityExams.filter((ex) => {
      if (isSuperAdmin) {
        if (adminStatusFilter !== 'all' && ex.share_status !== adminStatusFilter) return false;
      } else {
        if (ex.share_status !== 'city_public') return false;
      }
      if (gradeFilter !== 'all' && ex.grade !== gradeFilter) return false;
      if (topicFilter !== 'all' && ex.topic !== topicFilter) return false;
      if (schoolFilter !== 'all' && (ex.authorSchool || '').trim() !== schoolFilter) return false;
      if (term) {
        const hay = [
          ex.title,
          ex.description || '',
          ex.authorName || '',
          ex.authorSchool || '',
          ex.authorDepartment || '',
        ]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
  }, [
    cityExams,
    isSuperAdmin,
    adminStatusFilter,
    gradeFilter,
    topicFilter,
    schoolFilter,
    searchTerm,
  ]);

  const filteredQuestions = useMemo(() => {
    const term = questionSearchTerm.trim().toLowerCase();
    return cityQuestions.filter((q) => {
      if (questionGradeFilter !== 'all' && q.grade !== questionGradeFilter) return false;
      if (questionTypeFilter !== 'all' && q.type !== questionTypeFilter) return false;
      if (questionLevelFilter !== 'all' && q.level !== questionLevelFilter) return false;
      if (term) {
        const hay = [
          q.code || '',
          q.content || '',
          q.subjectName || '',
          q.chapterName || '',
          q.lessonName || '',
          q.lessonTopic || '',
          q.authorName || '',
          q.authorSchool || '',
          q.source || '',
        ]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
  }, [
    cityQuestions,
    questionGradeFilter,
    questionTypeFilter,
    questionLevelFilter,
    questionSearchTerm,
  ]);

  const totalCityExamQuestions = useMemo(
    () => filteredExams.reduce((sum, ex) => sum + (ex.questions?.length || 0), 0),
    [filteredExams]
  );

  const handleApproveExam = async (exam: Exam) => {
    if (!isSuperAdmin || reviewingExamId === exam.id) return;
    setReviewingExamId(exam.id);
    setErrorMsg(null);
    const nowIso = new Date().toISOString();
    const note = 'Đã kiểm duyệt chuẩn GDPT 2018.';
    try {
      await reviewExamCityShareByAdmin(exam.id, adminUid, 'approve', note);
      setCityExams((prev) =>
        prev.map((item) =>
          item.id === exam.id
            ? {
                ...item,
                share_status: 'city_public',
                cityApprovedBy: adminUid,
                cityApprovedAt: nowIso,
                cityReviewNote: note,
                updatedAt: nowIso,
              }
            : item
        )
      );
      setPreviewExam((prev) =>
        prev && prev.id === exam.id
          ? {
              ...prev,
              share_status: 'city_public',
              cityApprovedBy: adminUid,
              cityApprovedAt: nowIso,
              cityReviewNote: note,
            }
          : prev
      );
      onExamShareStatusChanged?.(exam.id, 'city_public', note);
      showToast(`Đã duyệt công khai đề "${exam.title}" lên Kho đề Thành phố!`);
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'Không thể duyệt công khai đề thi. Vui lòng thử lại.'
      );
    } finally {
      setReviewingExamId(null);
    }
  };

  const handleConfirmRejectExam = async () => {
    if (!isSuperAdmin || !rejectTargetExam || reviewingExamId === rejectTargetExam.id) return;
    const exam = rejectTargetExam;
    const note =
      rejectReason.trim() || 'Chưa đạt yêu cầu kiểm duyệt — vui lòng chỉnh sửa và gửi lại.';
    setReviewingExamId(exam.id);
    setErrorMsg(null);
    try {
      await reviewExamCityShareByAdmin(exam.id, adminUid, 'reject', note);
      setCityExams((prev) => prev.filter((item) => item.id !== exam.id));
      if (previewExam?.id === exam.id) {
        setPreviewExam(null);
      }
      onExamShareStatusChanged?.(exam.id, 'private', note);
      setRejectTargetExam(null);
      setRejectReason('');
      showToast(`Đã từ chối và trả lại đề "${exam.title}" cho giáo viên tác giả.`);
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'Không thể từ chối đề thi này. Vui lòng thử lại.'
      );
    } finally {
      setReviewingExamId(null);
    }
  };

  const handleCloneExam = async (exam: Exam) => {
    setCloningExamId(exam.id);
    setErrorMsg(null);
    try {
      const cloned = await cloneCityExamToPersonalBank(exam, currentUser);
      onExamCloned(cloned);
      showToast(`Đã nhân bản "${exam.title}" về Kho đề cá nhân của bạn!`, 'exams');
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'Không thể nhân bản đề thi về kho cá nhân. Vui lòng thử lại.'
      );
    } finally {
      setCloningExamId(null);
    }
  };

  const handleExportWord = async (exam: Exam) => {
    setExportingWordId(exam.id);
    try {
      await exportPrintReadyExamWithAnswersDocx(exam, exam.authorSchool || currentUser.school);
      showToast(`Đã tải file Word (.docx) đề "${exam.title}" kèm bảng đáp án.`);
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Không thể xuất file Word cho đề thi này.'
      );
    } finally {
      setExportingWordId(null);
    }
  };

  const handleCloneQuestion = async (question: Question) => {
    setCloningQuestionId(question.id);
    setErrorMsg(null);
    try {
      const cloned = await cloneCityQuestionToPersonalBank(question, currentUser);
      onQuestionCloned?.(cloned);
      showToast(
        `Đã lưu câu hỏi "${question.code}" về Ngân hàng câu hỏi cá nhân của bạn!`,
        'questions'
      );
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'Không thể lưu câu hỏi về Ngân hàng cá nhân. Vui lòng thử lại.'
      );
    } finally {
      setCloningQuestionId(null);
    }
  };

  const toggleExplanation = (id: string) => {
    setExpandedExplanationIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const isRefreshing = isLoadingExams || isLoadingQuestions;

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2 text-teal-700 font-bold text-xs uppercase tracking-wider">
              <Globe className="w-4 h-4 shrink-0" />
              <span>Kho học liệu dùng chung · TP. Đà Nẵng</span>
              {isSuperAdmin && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-800 normal-case tracking-normal text-[11px]">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  Chế độ kiểm duyệt Super Admin
                </span>
              )}
            </div>
            <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
              Kho đề &amp; Ngân hàng câu hỏi Thành phố (GDPT 2018)
            </h1>
            <p className="text-sm text-slate-600 max-w-3xl">
              {isSuperAdmin
                ? 'Kiểm duyệt các đề thi giáo viên đề xuất chia sẻ lên Kho Thành phố, quản lý đề đã công khai và khai thác ngân hàng câu hỏi đóng góp toàn thành phố.'
                : 'Khai thác các đề kiểm tra hoàn chỉnh đã được kiểm duyệt và ngân hàng câu hỏi do giáo viên toàn thành phố đóng góp để tải bản in Word hoặc lưu về kho cá nhân.'}
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <div className="px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-right tabular-nums">
              <p className="text-[11px] font-semibold text-slate-500">
                {isSuperAdmin ? 'Tổng đề & câu Kho TP' : 'Tổng học liệu Kho TP'}
              </p>
              <p className="text-base sm:text-lg font-extrabold text-slate-900">
                {isSuperAdmin
                  ? `${approvedExamsCount} đã duyệt · ${pendingExamsCount} chờ duyệt`
                  : `${approvedExamsCount} đề · ${cityQuestions.length} câu đóng góp`}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void loadRepositoryData()}
              disabled={isRefreshing}
              className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold inline-flex items-center gap-1.5"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span>Làm mới</span>
            </button>
          </div>
        </div>

        {/* 2-Tab Switcher */}
        <div
          role="tablist"
          aria-label="Chuyển đổi danh mục Kho Thành phố"
          className="flex flex-wrap items-center gap-2 pt-3 border-t border-slate-100"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'exams'}
            onClick={() => setActiveTab('exams')}
            className={`min-h-[42px] px-4 py-2 rounded-xl text-xs sm:text-sm font-bold inline-flex items-center gap-2 transition-colors ${
              activeTab === 'exams'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'bg-slate-100 hover:bg-slate-200/80 text-slate-700'
            }`}
          >
            <FileText className="w-4 h-4 shrink-0" />
            <span>Đề thi hoàn chỉnh</span>
            <span
              className={`px-2 py-0.5 rounded-md text-[11px] font-extrabold tabular-nums ${
                activeTab === 'exams'
                  ? 'bg-white/20 text-white'
                  : 'bg-white text-slate-700 border border-slate-200'
              }`}
            >
              {cityExams.length}
            </span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'questions'}
            onClick={() => setActiveTab('questions')}
            className={`min-h-[42px] px-4 py-2 rounded-xl text-xs sm:text-sm font-bold inline-flex items-center gap-2 transition-colors ${
              activeTab === 'questions'
                ? 'bg-teal-600 text-white shadow-xs'
                : 'bg-slate-100 hover:bg-slate-200/80 text-slate-700'
            }`}
          >
            <Database className="w-4 h-4 shrink-0" />
            <span>Ngân hàng câu hỏi đóng góp</span>
            <span
              className={`px-2 py-0.5 rounded-md text-[11px] font-extrabold tabular-nums ${
                activeTab === 'questions'
                  ? 'bg-white/20 text-white'
                  : 'bg-white text-teal-700 border border-teal-200'
              }`}
            >
              {cityQuestions.length}
            </span>
          </button>
        </div>

        {/* Super Admin Sub-Tabs for Exam Moderation (Only visible to Super Admin in Tab 1) */}
        {activeTab === 'exams' && isSuperAdmin && (
          <div
            role="tablist"
            aria-label="Bộ lọc trạng thái kiểm duyệt đề thi"
            className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100"
          >
            <span className="text-xs font-bold text-slate-500 mr-1">Trạng thái duyệt:</span>
            <button
              type="button"
              role="tab"
              aria-selected={adminStatusFilter === 'all'}
              onClick={() => setAdminStatusFilter('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 border transition-colors ${
                adminStatusFilter === 'all'
                  ? 'bg-slate-900 border-slate-900 text-white'
                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              <span>Tất cả</span>
              <span
                className={`px-1.5 py-0.5 rounded text-[11px] tabular-nums ${
                  adminStatusFilter === 'all'
                    ? 'bg-white/20 text-white'
                    : 'bg-slate-100 text-slate-700'
                }`}
              >
                {cityExams.length}
              </span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={adminStatusFilter === 'pending_review'}
              onClick={() => setAdminStatusFilter('pending_review')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 border transition-colors ${
                adminStatusFilter === 'pending_review'
                  ? 'bg-amber-600 border-amber-600 text-white'
                  : 'bg-amber-50/70 border-amber-200 text-amber-800 hover:bg-amber-100'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>Chờ kiểm duyệt</span>
              <span
                className={`px-1.5 py-0.5 rounded text-[11px] tabular-nums ${
                  adminStatusFilter === 'pending_review'
                    ? 'bg-white/20 text-white'
                    : 'bg-amber-200/70 text-amber-900'
                }`}
              >
                {pendingExamsCount}
              </span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={adminStatusFilter === 'city_public'}
              onClick={() => setAdminStatusFilter('city_public')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 border transition-colors ${
                adminStatusFilter === 'city_public'
                  ? 'bg-emerald-600 border-emerald-600 text-white'
                  : 'bg-emerald-50/70 border-emerald-200 text-emerald-800 hover:bg-emerald-100'
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Đã duyệt công khai</span>
              <span
                className={`px-1.5 py-0.5 rounded text-[11px] tabular-nums ${
                  adminStatusFilter === 'city_public'
                    ? 'bg-white/20 text-white'
                    : 'bg-emerald-200/70 text-emerald-900'
                }`}
              >
                {approvedExamsCount}
              </span>
            </button>
          </div>
        )}

        {/* Filter Bar per Active Tab */}
        {activeTab === 'exams' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2 border-t border-slate-100">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Tìm tên đề, tác giả, trường..."
                className="w-full min-h-[40px] pl-9 pr-3 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <select
              value={gradeFilter}
              onChange={(e) => setGradeFilter(e.target.value)}
              className="min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700"
            >
              <option value="all">Tất cả khối lớp</option>
              <option value="12">Lớp 12 THPT</option>
              <option value="11">Lớp 11 THPT</option>
              <option value="10">Lớp 10 THPT</option>
              <option value="chuyen_hsg">Chuyên &amp; HSG</option>
            </select>

            <select
              value={topicFilter}
              onChange={(e) => setTopicFilter(e.target.value)}
              className="min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700"
            >
              <option value="all">Tất cả chuyên đề</option>
              {availableTopics.map((tp) => (
                <option key={tp} value={tp}>
                  {TOPIC_DISPLAY_LABELS[tp] || tp}
                </option>
              ))}
            </select>

            <select
              value={schoolFilter}
              onChange={(e) => setSchoolFilter(e.target.value)}
              className="min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700"
            >
              <option value="all">Tất cả trường tác giả ({availableSchools.length})</option>
              {availableSchools.map((sch) => (
                <option key={sch} value={sch}>
                  {sch}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2 border-t border-slate-100">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={questionSearchTerm}
                onChange={(e) => setQuestionSearchTerm(e.target.value)}
                placeholder="Tìm nội dung, mã câu, bài học, trường..."
                className="w-full min-h-[40px] pl-9 pr-3 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white text-xs font-medium focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>

            <select
              value={questionGradeFilter}
              onChange={(e) => setQuestionGradeFilter(e.target.value)}
              className="min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700"
            >
              <option value="all">Tất cả khối lớp</option>
              <option value="12">Lớp 12 THPT</option>
              <option value="11">Lớp 11 THPT</option>
              <option value="10">Lớp 10 THPT</option>
              <option value="chuyen_hsg">Chuyên &amp; HSG</option>
            </select>

            <select
              value={questionTypeFilter}
              onChange={(e) => setQuestionTypeFilter(e.target.value)}
              className="min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700"
            >
              <option value="all">Tất cả dạng câu hỏi</option>
              <option value="part1_single_choice">Phần I · 4 lựa chọn</option>
              <option value="part2_true_false">Phần II · Đúng / Sai</option>
              <option value="part3_short_answer">Phần III · Trả lời ngắn</option>
            </select>

            <select
              value={questionLevelFilter}
              onChange={(e) => setQuestionLevelFilter(e.target.value)}
              className="min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700"
            >
              <option value="all">Tất cả mức độ nhận thức</option>
              <option value="nhan_biet">Nhận biết</option>
              <option value="thong_hieu">Thông hiểu</option>
              <option value="van_dung">Vận dụng</option>
              <option value="van_dung_cao">Vận dụng cao</option>
            </select>
          </div>
        )}
      </div>

      {/* Banners */}
      {errorMsg && (
        <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {toastMsg && (
        <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-semibold flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{toastMsg}</span>
          </div>
          {toastAction === 'exams' && onOpenPersonalExams && (
            <button
              type="button"
              onClick={onOpenPersonalExams}
              className="px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold inline-flex items-center gap-1"
            >
              <span>Mở Kho đề cá nhân</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
          {toastAction === 'questions' && onOpenPersonalQuestionBank && (
            <button
              type="button"
              onClick={onOpenPersonalQuestionBank}
              className="px-3 py-1.5 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-xs font-bold inline-flex items-center gap-1"
            >
              <span>Mở Ngân hàng cá nhân</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {/* TAB 1: ĐỀ THI HOÀN CHỈNH */}
      {activeTab === 'exams' && (
        <>
          {isLoadingExams ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center text-sm text-slate-500">
              Đang tải danh sách Đề thi hoàn chỉnh...
            </div>
          ) : filteredExams.length === 0 ? (
            <div className="bg-white border border-dashed border-slate-300 rounded-2xl p-12 text-center space-y-2">
              <Filter className="w-8 h-8 text-slate-300 mx-auto" />
              <p className="text-sm font-bold text-slate-700">
                {isSuperAdmin && adminStatusFilter === 'pending_review'
                  ? 'Hiện không có đề thi nào đang chờ kiểm duyệt.'
                  : cityExams.length === 0
                  ? 'Hiện chưa có đề thi nào trong Kho đề Thành phố.'
                  : 'Không tìm thấy đề thi nào khớp với bộ lọc đang chọn.'}
              </p>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Giáo viên có thể chọn nút <strong>&quot;Đề xuất Kho TP&quot;</strong> ở từng đề trong mục <strong>Quản lý Đề thi</strong> để gửi Super Admin kiểm duyệt và chia sẻ toàn thành phố.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="text-xs text-slate-500 font-medium tabular-nums">
                Hiển thị <strong>{filteredExams.length}</strong> / {cityExams.length} đề thi ({totalCityExamQuestions} câu hỏi).
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {filteredExams.map((exam) => {
                  const p1 = exam.questions.filter((q) => q.type === 'part1_single_choice').length;
                  const p2 = exam.questions.filter((q) => q.type === 'part2_true_false').length;
                  const p3 = exam.questions.filter((q) => q.type === 'part3_short_answer').length;
                  const isPending = exam.share_status === 'pending_review';
                  const isCloning = cloningExamId === exam.id;
                  const isExporting = exportingWordId === exam.id;
                  const isReviewing = reviewingExamId === exam.id;

                  return (
                    <div
                      key={exam.id}
                      className={`bg-white border rounded-2xl p-5 shadow-xs transition-colors flex flex-col justify-between gap-4 ${
                        isPending
                          ? 'border-amber-300 hover:border-amber-400 bg-amber-50/15'
                          : 'border-slate-200 hover:border-indigo-300'
                      }`}
                    >
                      <div className="space-y-2.5">
                        <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold">
                          {isPending ? (
                            <span className="px-2.5 py-0.5 rounded-md bg-amber-100 text-amber-900 border border-amber-300 inline-flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              Chờ kiểm duyệt
                            </span>
                          ) : (
                            <span className="px-2.5 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200 inline-flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" />
                              Đã duyệt công khai
                            </span>
                          )}
                          <span className="px-2.5 py-0.5 rounded-md bg-indigo-50 text-indigo-800 border border-indigo-200">
                            {GRADE_LABELS[exam.grade] || `Lớp ${exam.grade}`}
                          </span>
                          <span className="px-2.5 py-0.5 rounded-md bg-slate-100 text-slate-700">
                            {exam.topic ? TOPIC_DISPLAY_LABELS[exam.topic] || exam.topic : 'Hóa học'}
                          </span>
                        </div>

                        <h3 className="text-base font-extrabold text-slate-900 leading-snug">
                          {exam.title}
                        </h3>

                        {exam.description && (
                          <p className="text-xs text-slate-600 line-clamp-2">{exam.description}</p>
                        )}

                        {/* Author Attribution */}
                        <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 text-xs space-y-1">
                          <div className="flex items-center gap-1.5 font-bold text-slate-800">
                            <School className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                            <span>{exam.authorSchool || 'Trường THPT tham gia hệ thống'}</span>
                          </div>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-slate-600">
                            <span className="inline-flex items-center gap-1">
                              <Building2 className="w-3 h-3 text-slate-400" />
                              {exam.authorDepartment || 'Tổ Hóa học'}
                            </span>
                            <span>
                              · Tác giả: <strong>{exam.authorName}</strong>
                            </span>
                            {isPending && exam.shareRequestedAt && (
                              <span className="text-amber-700 font-semibold">
                                · Đề xuất:{' '}
                                {new Date(exam.shareRequestedAt).toLocaleDateString('vi-VN')}
                              </span>
                            )}
                            {!isPending && exam.cityApprovedAt && (
                              <span>
                                · Duyệt: {new Date(exam.cityApprovedAt).toLocaleDateString('vi-VN')}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Structure Metrics */}
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600 tabular-nums">
                          <span className="inline-flex items-center gap-1 font-semibold text-slate-800">
                            <Clock className="w-3.5 h-3.5 text-slate-400" />
                            {exam.durationMinutes} phút
                          </span>
                          <span>· Tổng {exam.questions.length} câu</span>
                          <span>· P.I: {p1}</span>
                          <span>· P.II: {p2}</span>
                          <span>· P.III: {p3}</span>
                        </div>
                      </div>

                      {/* Super Admin Quick Moderation Bar for Pending Exams */}
                      {isSuperAdmin && isPending && (
                        <div className="pt-3 border-t border-amber-200/80 flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            disabled={isReviewing}
                            onClick={() => void handleApproveExam(exam)}
                            className="flex-1 min-h-[38px] px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-xs font-bold inline-flex items-center justify-center gap-1.5 shadow-xs transition-colors"
                          >
                            <CheckCircle2 className="w-4 h-4 shrink-0" />
                            <span>{isReviewing ? 'Đang duyệt...' : 'Duyệt công khai'}</span>
                          </button>
                          <button
                            type="button"
                            disabled={isReviewing}
                            onClick={() => {
                              setRejectTargetExam(exam);
                              setRejectReason('');
                            }}
                            className="flex-1 min-h-[38px] px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-60 text-white text-xs font-bold inline-flex items-center justify-center gap-1.5 shadow-xs transition-colors"
                          >
                            <XCircle className="w-4 h-4 shrink-0" />
                            <span>Từ chối / Trả lại</span>
                          </button>
                        </div>
                      )}

                      <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setPreviewExam(exam)}
                            className="min-h-[36px] px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold inline-flex items-center gap-1.5"
                          >
                            <Eye className="w-3.5 h-3.5 text-indigo-600" />
                            <span>Xem trước</span>
                          </button>
                          <button
                            type="button"
                            disabled={isExporting}
                            onClick={() => void handleExportWord(exam)}
                            className="min-h-[36px] px-3 py-1.5 rounded-xl border border-indigo-200 bg-indigo-50/70 hover:bg-indigo-100 disabled:opacity-60 text-indigo-800 text-xs font-bold inline-flex items-center gap-1.5"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>{isExporting ? 'Đang xuất...' : 'Tải Word'}</span>
                          </button>
                        </div>

                        <button
                          type="button"
                          disabled={isCloning}
                          onClick={() => void handleCloneExam(exam)}
                          className="min-h-[36px] px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-xs font-bold inline-flex items-center gap-1.5 shadow-xs"
                        >
                          <CopyPlus className="w-3.5 h-3.5" />
                          <span>{isCloning ? 'Đang nhân bản...' : 'Nhân bản về kho cá nhân'}</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {/* TAB 2: NGÂN HÀNG CÂU HỎI ĐÓNG GÓP (isSharedCity == true) */}
      {activeTab === 'questions' && (
        <>
          {isLoadingQuestions ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center text-sm text-slate-500">
              Đang tải Ngân hàng câu hỏi đóng góp từ Kho Thành phố...
            </div>
          ) : filteredQuestions.length === 0 ? (
            <div className="bg-white border border-dashed border-slate-300 rounded-2xl p-12 text-center space-y-2">
              <Database className="w-8 h-8 text-slate-300 mx-auto" />
              <p className="text-sm font-bold text-slate-700">
                {cityQuestions.length === 0
                  ? 'Chưa có câu hỏi nào được chia sẻ lên Ngân hàng câu hỏi đóng góp.'
                  : 'Không tìm thấy câu hỏi nào khớp với bộ lọc đang chọn.'}
              </p>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Thầy/Cô có thể mở mục <strong>Ngân hàng câu hỏi</strong> và bật nút gạt{' '}
                <strong className="text-teal-700">&quot;Kho TP&quot;</strong> ở từng câu hỏi để đóng góp ngay vào kho dùng chung toàn thành phố.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="text-xs text-slate-500 font-medium tabular-nums">
                Hiển thị <strong>{filteredQuestions.length}</strong> / {cityQuestions.length} câu hỏi đóng góp vào Kho Thành phố.
              </div>

              <div className="space-y-3">
                {filteredQuestions.map((q) => {
                  const isCloningQ = cloningQuestionId === q.id;
                  const topicLabel = getQuestionTopicDisplay(q);
                  const isExplanationOpen = expandedExplanationIds.has(q.id);
                  const isOwnQuestion =
                    q.ownerId === (currentUser.uid || currentUser.id) ||
                    q.authorId === (currentUser.uid || currentUser.id);

                  return (
                    <div
                      key={q.id}
                      className="bg-white border border-slate-200 hover:border-teal-300 rounded-2xl p-5 shadow-xs transition-colors space-y-3"
                    >
                      {/* Top Metadata Row */}
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                        <div className="space-y-1.5 min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5 text-xs">
                            <span className="px-2 py-0.5 rounded-md bg-teal-50 text-teal-800 border border-teal-200 font-bold text-[11px] inline-flex items-center gap-1">
                              <Globe className="w-3 h-3" />
                              Kho TP
                            </span>
                            <span className="font-mono font-bold text-slate-900">{q.code}</span>
                            <span className="text-slate-300">·</span>
                            <span className="font-semibold text-teal-700">
                              {q.subjectName || 'Hóa học'}
                            </span>
                            <span className="text-slate-300">·</span>
                            <span className="font-medium text-slate-700">
                              {GRADE_LABELS[q.grade] || `Lớp ${q.grade}`}
                            </span>
                            {q.chapterName && (
                              <>
                                <span className="text-slate-300">·</span>
                                <span className="text-slate-500">{q.chapterName}</span>
                              </>
                            )}
                            <span className="text-slate-300">·</span>
                            <span className="font-medium text-slate-800">{topicLabel}</span>
                            <span className="text-slate-300">·</span>
                            <span className="font-semibold text-indigo-700">
                              {QUESTION_TYPE_SHORT_LABELS[q.type]}
                            </span>
                            <span className="text-slate-300">·</span>
                            <span className="font-semibold text-slate-600">
                              {COGNITIVE_LEVEL_SHORT_LABELS[q.level]}
                            </span>
                          </div>

                          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-slate-500">
                            {(q.authorName || q.authorSchool) && (
                              <span className="inline-flex items-center gap-1 text-slate-600 font-medium">
                                <UserIcon className="w-3 h-3 text-teal-600" />
                                {q.authorName || 'Giáo viên đóng góp'}
                                {q.authorSchool ? ` · ${q.authorSchool}` : ''}
                              </span>
                            )}
                            {q.source && <span>Nguồn: {q.source}</span>}
                            {q.updatedAt && (
                              <span>
                                Cập nhật: {new Date(q.updatedAt).toLocaleDateString('vi-VN')}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {q.explanation && (
                            <button
                              type="button"
                              onClick={() => toggleExplanation(q.id)}
                              className="min-h-[34px] px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold transition-colors"
                            >
                              {isExplanationOpen ? 'Ẩn lời giải' : 'Xem lời giải'}
                            </button>
                          )}
                          <button
                            type="button"
                            disabled={isCloningQ}
                            onClick={() => void handleCloneQuestion(q)}
                            className="min-h-[34px] px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white text-xs font-bold inline-flex items-center gap-1.5 shadow-xs transition-colors"
                          >
                            <CopyPlus className="w-3.5 h-3.5" />
                            <span>
                              {isCloningQ
                                ? 'Đang lưu...'
                                : isOwnQuestion
                                ? 'Tạo bản sao cá nhân'
                                : 'Lưu về kho cá nhân'}
                            </span>
                          </button>
                        </div>
                      </div>

                      {/* Question Content */}
                      <div className="text-sm font-medium text-slate-900 leading-relaxed">
                        <ChemRenderer text={q.content} />
                      </div>

                      {/* Options / Statements / Short Answer */}
                      {(q.type === 'part1_single_choice' || q.type === 'part1_multiple_choice') &&
                        q.options && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2.5 border-t border-slate-100">
                            {q.options.map((opt) => {
                              const isCorrect =
                                opt.id === q.correctOptionId ||
                                (q.correctOptionIds || []).includes(opt.id);
                              return (
                                <div
                                  key={opt.id}
                                  className={`p-2.5 rounded-xl border text-xs flex items-start gap-2 ${
                                    isCorrect
                                      ? 'border-emerald-400 bg-emerald-50/70 font-semibold text-emerald-950'
                                      : 'border-slate-200 bg-slate-50 text-slate-700'
                                  }`}
                                >
                                  <span
                                    className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 font-bold ${
                                      isCorrect
                                        ? 'bg-emerald-600 text-white'
                                        : 'bg-slate-200 text-slate-700'
                                    }`}
                                  >
                                    {opt.id}
                                  </span>
                                  <div className="flex-1 min-w-0 break-words">
                                    <ChemRenderer text={opt.text} inline />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}

                      {q.type === 'part2_true_false' && q.statements && (
                        <div className="space-y-1.5 pt-2.5 border-t border-slate-100">
                          {q.statements.map((stmt) => (
                            <div
                              key={stmt.id}
                              className="p-2 rounded-lg bg-slate-50 border border-slate-200 text-xs flex items-center justify-between gap-3"
                            >
                              <div className="flex items-start gap-2 min-w-0">
                                <span className="font-bold text-indigo-700 shrink-0">
                                  {stmt.id})
                                </span>
                                <span className="min-w-0 break-words">
                                  <ChemRenderer text={stmt.statement} inline />
                                </span>
                              </div>
                              <span
                                className={`px-2 py-0.5 rounded text-[11px] font-bold shrink-0 ${
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
                        <div className="pt-2.5 border-t border-slate-100 text-xs flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-slate-700">Đáp án:</span>
                          <span className="px-2.5 py-1 bg-emerald-50 border border-emerald-200 text-emerald-900 font-mono font-bold rounded-lg">
                            {q.shortAnswerConfig.acceptableAnswers.join(' / ')}
                          </span>
                        </div>
                      )}

                      {isExplanationOpen && q.explanation && (
                        <div className="p-3 rounded-xl bg-indigo-50/60 border border-indigo-200/80 text-xs text-slate-800 space-y-1">
                          <div className="font-bold text-indigo-900 flex items-center gap-1.5">
                            <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                            <span>Lời giải / Hướng dẫn</span>
                          </div>
                          <div className="leading-relaxed">
                            <ChemRenderer text={q.explanation} />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {/* Reject Exam Modal for Super Admin */}
      {rejectTargetExam && isSuperAdmin && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="reject-city-exam-title"
        >
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-lg w-full overflow-hidden">
            <div className="px-5 py-4 bg-rose-50 border-b border-rose-200 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-rose-900">
                <XCircle className="w-5 h-5 text-rose-600 shrink-0" />
                <h3 id="reject-city-exam-title" className="text-sm font-extrabold">
                  Từ chối / Trả lại đề thi chờ duyệt
                </h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setRejectTargetExam(null);
                  setRejectReason('');
                }}
                className="p-1 rounded-lg text-rose-700 hover:bg-rose-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-3 text-xs">
              <p className="text-slate-700 leading-relaxed">
                Đề thi <strong className="text-slate-900">&quot;{rejectTargetExam.title}&quot;</strong>{' '}
                (tác giả: <strong>{rejectTargetExam.authorName}</strong>) sẽ được gỡ cờ chờ duyệt và trả về kho cá nhân.
              </p>
              <div>
                <label className="block font-bold text-slate-700 mb-1.5">
                  Ghi chú phản hồi cho giáo viên (tùy chọn)
                </label>
                <textarea
                  rows={3}
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="VD: Vui lòng bổ sung đáp án Phần III hoặc rà soát lại công thức hóa học ở câu 12..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
              </div>
            </div>

            <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2">
              <button
                type="button"
                disabled={reviewingExamId === rejectTargetExam.id}
                onClick={() => {
                  setRejectTargetExam(null);
                  setRejectReason('');
                }}
                className="px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold"
              >
                Hủy
              </button>
              <button
                type="button"
                disabled={reviewingExamId === rejectTargetExam.id}
                onClick={() => void handleConfirmRejectExam()}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-60 text-white text-xs font-bold inline-flex items-center gap-1.5"
              >
                <XCircle className="w-4 h-4" />
                <span>
                  {reviewingExamId === rejectTargetExam.id
                    ? 'Đang xử lý...'
                    : 'Xác nhận Từ chối / Trả lại'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Read-only Full Exam Preview Modal */}
      {previewExam && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden">
            <div className="px-6 py-4 bg-slate-900 text-white flex items-start justify-between gap-4 shrink-0">
              <div>
                <div className="flex items-center gap-2 text-emerald-400 text-[11px] font-bold uppercase tracking-wider">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>
                    {previewExam.share_status === 'pending_review'
                      ? 'Kiểm duyệt đề thi chờ duyệt Kho Thành phố'
                      : 'Xem trước đề thi từ Kho Thành phố'}
                  </span>
                </div>
                <h3 className="text-base font-extrabold mt-0.5">{previewExam.title}</h3>
                <p className="text-xs text-slate-300 mt-0.5">
                  Tác giả: {previewExam.authorName} · {previewExam.authorDepartment || 'Tổ Hóa học'} ·{' '}
                  {previewExam.authorSchool || 'THPT Đà Nẵng'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPreviewExam(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-3 bg-slate-50">
              {previewExam.questions.map((q, idx) => (
                <div
                  key={q.id || idx}
                  className="bg-white rounded-xl border border-slate-200 p-4 space-y-2 text-xs"
                >
                  <div className="flex items-center gap-2 font-bold text-slate-700">
                    <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-900">
                      Câu {idx + 1}
                    </span>
                    <span className="text-indigo-700">
                      {QUESTION_TYPE_SHORT_LABELS[q.type]}
                    </span>
                  </div>
                  <div className="text-slate-900 font-medium leading-relaxed">
                    <ChemRenderer text={q.content} />
                  </div>
                  {q.type === 'part1_single_choice' && q.options && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-1">
                      {q.options.map((o) => (
                        <div
                          key={o.id}
                          className={`px-2.5 py-1.5 rounded-lg border ${
                            o.id === q.correctOptionId
                              ? 'bg-emerald-50 border-emerald-300 font-semibold text-emerald-900'
                              : 'bg-slate-50 border-slate-200 text-slate-700'
                          }`}
                        >
                          <strong>{o.id}.</strong> <ChemRenderer text={o.text} inline />
                        </div>
                      ))}
                    </div>
                  )}
                  {q.type === 'part2_true_false' && q.statements && (
                    <div className="space-y-1 pt-1">
                      {q.statements.map((st) => (
                        <div
                          key={st.id}
                          className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-200"
                        >
                          <span>
                            <strong>{st.id})</strong> <ChemRenderer text={st.statement} inline />
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold shrink-0 ${
                              st.correctAnswer
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-rose-100 text-rose-800'
                            }`}
                          >
                            {st.correctAnswer ? 'Đúng' : 'Sai'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  {q.type === 'part3_short_answer' && (
                    <div className="text-[11px] font-semibold text-indigo-800 bg-indigo-50 px-2.5 py-1.5 rounded-lg inline-block">
                      Đáp án trả lời ngắn:{' '}
                      {q.shortAnswerConfig?.acceptableAnswers?.join(' hoặc ') || '—'}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="px-6 py-3.5 bg-white border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-2 text-xs text-slate-600">
                <BookOpen className="w-4 h-4 text-indigo-600" />
                <span className="tabular-nums">
                  {previewExam.questions.length} câu · {previewExam.durationMinutes} phút
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPreviewExam(null)}
                  className="px-4 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold"
                >
                  Đóng
                </button>
                {isSuperAdmin && previewExam.share_status === 'pending_review' ? (
                  <>
                    <button
                      type="button"
                      disabled={reviewingExamId === previewExam.id}
                      onClick={() => {
                        setRejectTargetExam(previewExam);
                        setRejectReason('');
                      }}
                      className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-60 text-white text-xs font-bold inline-flex items-center gap-1.5"
                    >
                      <XCircle className="w-4 h-4" />
                      <span>Từ chối / Trả lại</span>
                    </button>
                    <button
                      type="button"
                      disabled={reviewingExamId === previewExam.id}
                      onClick={() => void handleApproveExam(previewExam)}
                      className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-xs font-bold inline-flex items-center gap-1.5"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Duyệt công khai</span>
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    disabled={cloningExamId === previewExam.id}
                    onClick={async () => {
                      await handleCloneExam(previewExam);
                      setPreviewExam(null);
                    }}
                    className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-xs font-bold inline-flex items-center gap-1.5"
                  >
                    <CopyPlus className="w-4 h-4" />
                    <span>Nhân bản về kho cá nhân</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
