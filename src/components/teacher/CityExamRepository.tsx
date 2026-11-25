import React, { useEffect, useMemo, useState } from 'react';
import { Exam, User } from '../../types';
import {
  cloneCityExamToPersonalBank,
  fetchCityPublicExams,
} from '../../services/workspaceService';
import { exportPrintReadyExamWithAnswersDocx } from '../../services/sampleWordTemplateService';
import { GRADE_LABELS, QUESTION_TYPE_SHORT_LABELS } from '../../constants/subjects';
import { ChemRenderer } from '../../utils/chemRenderer';
import {
  AlertCircle,
  ArrowRight,
  BookOpen,
  Building2,
  CheckCircle2,
  Clock,
  CopyPlus,
  Download,
  Eye,
  Filter,
  Globe,
  RefreshCw,
  School,
  Search,
  Sparkles,
  X,
} from 'lucide-react';

interface CityExamRepositoryProps {
  currentUser: User;
  onExamCloned: (clonedExam: Exam) => void;
  onOpenPersonalExams?: () => void;
}

const TOPIC_DISPLAY_LABELS: Record<string, string> = {
  hoa_dai_cuong: 'Hóa đại cương',
  hoa_vo_co: 'Hóa vô cơ',
  hoa_huu_co: 'Hóa hữu cơ',
  hoa_phan_tich: 'Hóa phân tích',
  chuyen_de_nang_cao: 'Chuyên đề nâng cao',
};

export const CityExamRepository: React.FC<CityExamRepositoryProps> = ({
  currentUser,
  onExamCloned,
  onOpenPersonalExams,
}) => {
  const [cityExams, setCityExams] = useState<Exam[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [lastClonedTitle, setLastClonedTitle] = useState<string | null>(null);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [gradeFilter, setGradeFilter] = useState<string>('all');
  const [topicFilter, setTopicFilter] = useState<string>('all');
  const [schoolFilter, setSchoolFilter] = useState<string>('all');

  // Action states
  const [previewExam, setPreviewExam] = useState<Exam | null>(null);
  const [cloningExamId, setCloningExamId] = useState<string | null>(null);
  const [exportingWordId, setExportingWordId] = useState<string | null>(null);

  const loadCityExams = async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const list = await fetchCityPublicExams();
      setCityExams(list);
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'Không thể tải danh sách Kho đề Thành phố. Vui lòng thử lại.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadCityExams();
  }, []);

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
  }, [cityExams, gradeFilter, topicFilter, schoolFilter, searchTerm]);

  const totalCityQuestions = useMemo(
    () => cityExams.reduce((sum, ex) => sum + (ex.questions?.length || 0), 0),
    [cityExams]
  );

  const handleCloneExam = async (exam: Exam) => {
    setCloningExamId(exam.id);
    setErrorMsg(null);
    try {
      const cloned = await cloneCityExamToPersonalBank(exam, currentUser);
      onExamCloned(cloned);
      setLastClonedTitle(cloned.title);
      setToastMsg(`Đã nhân bản "${exam.title}" về Kho đề cá nhân của bạn!`);
      setTimeout(() => setToastMsg(null), 5000);
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
      setToastMsg(`Đã tải file Word (.docx) đề "${exam.title}" kèm bảng đáp án.`);
      setTimeout(() => setToastMsg(null), 3500);
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Không thể xuất file Word cho đề thi này.'
      );
    } finally {
      setExportingWordId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-emerald-700 font-bold text-xs uppercase tracking-wider">
              <Globe className="w-4 h-4 shrink-0" />
              <span>Kho học liệu dùng chung có kiểm duyệt · TP. Đà Nẵng</span>
            </div>
            <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
              Kho đề thi Hóa học Thành phố (GDPT 2018)
            </h1>
            <p className="text-sm text-slate-600 max-w-3xl">
              Tập hợp các đề kiểm tra 3 dạng thức đã được Super Admin kiểm duyệt chất lượng chuyên môn từ giáo viên các trường THPT. Thầy/Cô có thể xem trước, tải bản in Word (.docx) hoặc nhân bản về kho cá nhân để giao bài cho lớp mình.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <div className="px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-right tabular-nums">
              <p className="text-[11px] font-semibold text-slate-500">Đề đã kiểm duyệt</p>
              <p className="text-lg font-extrabold text-slate-900">
                {cityExams.length} đề · {totalCityQuestions} câu
              </p>
            </div>
            <button
              type="button"
              onClick={() => void loadCityExams()}
              disabled={isLoading}
              className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold inline-flex items-center gap-1.5"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              <span>Làm mới</span>
            </button>
          </div>
        </div>

        {/* Filter Bar */}
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
          {lastClonedTitle && onOpenPersonalExams && (
            <button
              type="button"
              onClick={onOpenPersonalExams}
              className="px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold inline-flex items-center gap-1"
            >
              <span>Mở Kho đề cá nhân</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {/* Exam Cards List */}
      {isLoading ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center text-sm text-slate-500">
          Đang tải danh sách Kho đề Thành phố...
        </div>
      ) : filteredExams.length === 0 ? (
        <div className="bg-white border border-dashed border-slate-300 rounded-2xl p-12 text-center space-y-2">
          <Filter className="w-8 h-8 text-slate-300 mx-auto" />
          <p className="text-sm font-bold text-slate-700">
            {cityExams.length === 0
              ? 'Hiện chưa có đề thi nào được duyệt công khai lên Kho Thành phố.'
              : 'Không tìm thấy đề thi nào khớp với bộ lọc đang chọn.'}
          </p>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Giáo viên có thể chọn nút <strong>&quot;Đề xuất Kho TP&quot;</strong> ở từng đề trong mục <strong>Quản lý Đề thi</strong> để gửi Super Admin kiểm duyệt và chia sẻ toàn thành phố.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filteredExams.map((exam) => {
            const p1 = exam.questions.filter((q) => q.type === 'part1_single_choice').length;
            const p2 = exam.questions.filter((q) => q.type === 'part2_true_false').length;
            const p3 = exam.questions.filter((q) => q.type === 'part3_short_answer').length;
            const isCloning = cloningExamId === exam.id;
            const isExporting = exportingWordId === exam.id;

            return (
              <div
                key={exam.id}
                className="bg-white border border-slate-200 hover:border-indigo-300 rounded-2xl p-5 shadow-xs transition-colors flex flex-col justify-between gap-4"
              >
                <div className="space-y-2.5">
                  <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold">
                    <span className="px-2.5 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200 inline-flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" />
                      Đã kiểm duyệt TP
                    </span>
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
                      <span>· Tác giả: <strong>{exam.authorName}</strong></span>
                      {exam.cityApprovedAt && (
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
                  <span>Xem trước đề thi từ Kho Thành phố</span>
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

            <div className="px-6 py-3.5 bg-white border-t border-slate-200 flex items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-2 text-xs text-slate-600">
                <BookOpen className="w-4 h-4 text-indigo-600" />
                <span className="tabular-nums">
                  {previewExam.questions.length} câu · {previewExam.durationMinutes} phút
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPreviewExam(null)}
                  className="px-4 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold"
                >
                  Đóng
                </button>
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
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
