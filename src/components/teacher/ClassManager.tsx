import React, { useMemo, useState } from 'react';
import {
  Users,
  Plus,
  Copy,
  Check,
  Trash2,
  BookOpen,
  UserMinus,
  CheckCircle2,
  AlertCircle,
  Lock,
  Unlock,
  GraduationCap,
  RefreshCw,
  UserPlus,
  Sparkles,
  Award,
  Database,
} from 'lucide-react';
import { Classroom, ClassEnrollment, Exam, StudentSubmission, User } from '../../types';
import { normalizeExamCode } from '../../utils/urlHelper';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { getHubFirebaseInfo } from '../../services/firebase';

interface ClassManagerProps {
  currentUser: User;
  classes: Classroom[];
  enrollments: ClassEnrollment[];
  exams: Exam[];
  submissions: StudentSubmission[];
  onSaveClass: (cls: Classroom) => Promise<void>;
  onDeleteClass: (cls: Classroom) => Promise<void>;
  onRemoveEnrollment: (enrollmentId: string, hubProfileDocId?: string) => Promise<void>;
  onRefreshHub?: () => Promise<void>;
  onAddHubStudent?: (params: {
    classCode: string;
    classId: string;
    className: string;
    stt: number;
    studentName: string;
    studentEmail?: string;
    studentUid?: string;
  }) => Promise<void>;
}

function generateClassCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'L';
  for (let i = 0; i < 5; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export const ClassManager: React.FC<ClassManagerProps> = ({
  currentUser,
  classes,
  enrollments,
  exams,
  submissions,
  onSaveClass,
  onDeleteClass,
  onRemoveEnrollment,
  onRefreshHub,
  onAddHubStudent,
}) => {
  const [selectedClassId, setSelectedClassId] = useState<string>(classes[0]?.id || '');
  const [isCreating, setIsCreating] = useState(false);
  const [newClassName, setNewClassName] = useState('');
  const [newClassCode, setNewClassCode] = useState(() => generateClassCode());
  const [newDescription, setNewDescription] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isRefreshingHub, setIsRefreshingHub] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Add student to hub_learning_profiles modal state
  const [isAddingStudent, setIsAddingStudent] = useState(false);
  const [studentStt, setStudentStt] = useState('1');
  const [studentName, setStudentName] = useState('');
  const [studentEmail, setStudentEmail] = useState('');
  const [studentUidInput, setStudentUidInput] = useState('');

  // In-app ConfirmDialog state (replaces window.confirm)
  const [pendingDeleteClass, setPendingDeleteClass] = useState<Classroom | null>(null);
  const [pendingDeleteEnrollment, setPendingDeleteEnrollment] = useState<ClassEnrollment | null>(null);

  const hubInfo = useMemo(() => getHubFirebaseInfo(), []);
  const selectedClass = classes.find((c) => c.id === selectedClassId) || classes[0] || null;

  const getStudentsForClass = (cls: Classroom): ClassEnrollment[] => {
    const normCode = normalizeExamCode(cls.classCode);
    const matched = enrollments.filter(
      (en) => en.classId === cls.id || (normCode && normalizeExamCode(en.classCode) === normCode)
    );
    return [...matched].sort((a, b) => {
      const sttA = typeof a.stt === 'number' && a.stt > 0 ? a.stt : Number.MAX_SAFE_INTEGER;
      const sttB = typeof b.stt === 'number' && b.stt > 0 ? b.stt : Number.MAX_SAFE_INTEGER;
      if (sttA !== sttB) return sttA - sttB;
      return (a.studentName || '').localeCompare(b.studentName || '', 'vi');
    });
  };

  const classStudents = useMemo(
    () => (selectedClass ? getStudentsForClass(selectedClass) : []),
    [selectedClass, enrollments]
  );

  const nextSuggestedStt = useMemo(() => {
    const maxStt = classStudents.reduce(
      (max, st) => (typeof st.stt === 'number' && st.stt > max ? st.stt : max),
      0
    );
    return String(maxStt + 1);
  }, [classStudents]);

  const handleCopyCode = async (code: string) => {
    try {
      await navigator.clipboard?.writeText(code);
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 2500);
    } catch {
      // ignore clipboard restrictions
    }
  };

  const handleRefreshHubClick = async () => {
    if (!onRefreshHub || isRefreshingHub) return;
    setIsRefreshingHub(true);
    setFeedback(null);
    try {
      await onRefreshHub();
      setFeedback({
        type: 'success',
        text: `Đã đồng bộ danh sách lớp (hub_classes) và hồ sơ học sinh (hub_learning_profiles) từ dbHub (${hubInfo.projectId}).`,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Không thể đồng bộ dữ liệu từ dbHub.',
      });
    } finally {
      setIsRefreshingHub(false);
    }
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClassName.trim()) return;
    const cleanCode = normalizeExamCode(newClassCode) || generateClassCode();
    if (!/^[A-Z0-9-]{2,32}$/.test(cleanCode)) {
      setFeedback({
        type: 'error',
        text: 'Mã lớp chỉ gồm chữ in hoa, số và dấu gạch ngang (2-32 ký tự).',
      });
      return;
    }

    setIsSaving(true);
    setFeedback(null);
    const nowIso = new Date().toISOString();
    const newCls: Classroom = {
      id: `cls_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      ownerId: currentUser.uid || currentUser.id,
      teacherName: currentUser.name,
      school: currentUser.school,
      className: newClassName.trim(),
      classCode: cleanCode,
      description: newDescription.trim() || undefined,
      assignedExamCodes: [],
      isActive: true,
      source: 'hub',
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    try {
      await onSaveClass(newCls);
      setSelectedClassId(newCls.id);
      setNewClassName('');
      setNewDescription('');
      setNewClassCode(generateClassCode());
      setIsCreating(false);
      setFeedback({
        type: 'success',
        text: `Đã tạo lớp "${newCls.className}" (Mã lớp: ${newCls.classCode}) và đồng bộ tới hub_classes!`,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Không thể tạo lớp học.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddStudentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClass || !onAddHubStudent) return;
    const parsedStt = Number.parseInt(studentStt, 10);
    if (!Number.isFinite(parsedStt) || parsedStt <= 0) {
      setFeedback({ type: 'error', text: 'STT học sinh phải là số nguyên dương (1, 2, 3...).' });
      return;
    }
    if (!studentName.trim()) {
      setFeedback({ type: 'error', text: 'Vui lòng nhập họ và tên học sinh.' });
      return;
    }

    setIsSaving(true);
    setFeedback(null);
    try {
      await onAddHubStudent({
        classCode: selectedClass.classCode,
        classId: selectedClass.id,
        className: selectedClass.className,
        stt: parsedStt,
        studentName: studentName.trim(),
        studentEmail: studentEmail.trim() || undefined,
        studentUid: studentUidInput.trim() || undefined,
      });
      setStudentName('');
      setStudentEmail('');
      setStudentUidInput('');
      setIsAddingStudent(false);
      setFeedback({
        type: 'success',
        text: `Đã lưu hồ sơ học sinh #${parsedStt} (${selectedClass.classCode}_${parsedStt}) vào hub_learning_profiles.`,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Không thể lưu hồ sơ học sinh lên dbHub.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleExamAssignment = async (cls: Classroom, examCode: string) => {
    const clean = normalizeExamCode(examCode);
    if (!clean) return;
    const hasExam = cls.assignedExamCodes.includes(clean);
    const nextCodes = hasExam
      ? cls.assignedExamCodes.filter((c) => c !== clean)
      : [...cls.assignedExamCodes, clean];

    setIsSaving(true);
    try {
      await onSaveClass({
        ...cls,
        assignedExamCodes: nextCodes,
        updatedAt: new Date().toISOString(),
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Không thể cập nhật bài thi giao cho lớp.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleActive = async (cls: Classroom) => {
    setIsSaving(true);
    try {
      await onSaveClass({
        ...cls,
        isActive: !cls.isActive,
        updatedAt: new Date().toISOString(),
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2 text-emerald-700 font-bold text-xs uppercase tracking-wider">
            <Users className="w-4 h-4" />
            <span>Quản Lý Lớp Học &amp; Hồ Sơ Học Sinh Dùng Chung</span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-700 text-[10px] font-bold normal-case tracking-normal">
              <Database className="w-3 h-3" />
              dbHub · {hubInfo.projectId}
            </span>
          </div>
          <h1 className="text-xl md:text-2xl font-extrabold text-slate-900 mt-1">
            Lớp Học Của Tôi ({classes.length} lớp)
          </h1>
          <p className="text-xs md:text-sm text-slate-500 mt-1">
            Đồng bộ trực tiếp từ <code className="font-mono text-slate-700">hub_classes</code> và danh sách học sinh{' '}
            <code className="font-mono text-slate-700">hub_learning_profiles</code> (sắp xếp theo STT tăng dần).
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {onRefreshHub && (
            <button
              type="button"
              disabled={isRefreshingHub}
              onClick={() => void handleRefreshHubClick()}
              className="px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-60 text-slate-700 text-xs font-bold flex items-center gap-1.5 transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-emerald-600 ${isRefreshingHub ? 'animate-spin' : ''}`} />
              <span>{isRefreshingHub ? 'Đang đồng bộ...' : 'Đồng bộ Hub'}</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setNewClassCode(generateClassCode());
              setIsCreating(true);
            }}
            className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm flex items-center gap-2 transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Tạo lớp học mới</span>
          </button>
        </div>
      </div>

      {feedback && (
        <div
          className={`p-3.5 rounded-2xl border text-xs font-semibold flex items-center gap-2 ${
            feedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          )}
          <span>{feedback.text}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Left: Classes List */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs space-y-2.5">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-600 pb-2 border-b border-slate-100">
            Danh sách lớp ({classes.length})
          </h2>

          {classes.length === 0 ? (
            <p className="text-xs text-slate-400 italic py-6 text-center">
              Chưa có lớp học nào thuộc tài khoản này trong <code className="font-mono">hub_classes</code>. Nhấn &ldquo;Tạo lớp học mới&rdquo; để bắt đầu.
            </p>
          ) : (
            classes.map((cls) => {
              const isSelected = selectedClass?.id === cls.id;
              const studentCount = getStudentsForClass(cls).length;
              return (
                <div
                  key={cls.id}
                  onClick={() => setSelectedClassId(cls.id)}
                  className={`p-3 rounded-xl cursor-pointer border transition-all space-y-1.5 ${
                    isSelected
                      ? 'bg-emerald-50/70 border-emerald-300 shadow-2xs'
                      : 'bg-white border-slate-100 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-slate-900 text-xs truncate">{cls.className}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      {cls.source === 'hub' && (
                        <span className="px-1.5 py-0.5 rounded bg-amber-50 border border-amber-200 text-amber-700 text-[9px] font-bold">
                          Hub
                        </span>
                      )}
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          cls.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'
                        }`}
                      >
                        {cls.isActive ? 'Đang mở' : 'Tạm khóa'}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-slate-500">
                    <span className="font-mono font-bold text-sky-700">Mã: {cls.classCode}</span>
                    <span>
                      {studentCount} học sinh • {cls.assignedExamCodes.length} đề
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Right: Selected Class Workspace */}
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-6">
          {!selectedClass ? (
            <div className="py-12 text-center text-slate-400 text-xs">
              Chọn một lớp ở bên trái hoặc tạo lớp học mới để bắt đầu quản lý.
            </div>
          ) : (
            <>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="px-2.5 py-1 rounded-lg bg-sky-50 border border-sky-200 text-sky-800 font-mono text-xs font-bold">
                      Mã lớp: {selectedClass.classCode}
                    </span>
                    <button
                      type="button"
                      onClick={() => void handleCopyCode(selectedClass.classCode)}
                      className="px-2 py-1 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-700 flex items-center gap-1"
                    >
                      {copiedCode === selectedClass.classCode ? (
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                      <span>{copiedCode === selectedClass.classCode ? 'Đã chép' : 'Chép mã'}</span>
                    </button>
                  </div>
                  <h2 className="text-lg font-extrabold text-slate-900 mt-1.5">
                    {selectedClass.className}
                  </h2>
                  {selectedClass.description && (
                    <p className="text-xs text-slate-500 mt-0.5">{selectedClass.description}</p>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={() => void handleToggleActive(selectedClass)}
                    className="px-3 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-xs font-bold text-slate-700 flex items-center gap-1.5"
                  >
                    {selectedClass.isActive ? (
                      <>
                        <Lock className="w-3.5 h-3.5 text-amber-600" />
                        <span>Khóa nhận HS</span>
                      </>
                    ) : (
                      <>
                        <Unlock className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Mở nhận HS</span>
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={() => setPendingDeleteClass(selectedClass)}
                    className="p-2 rounded-xl border border-rose-200 text-rose-600 hover:bg-rose-50"
                    title="Xóa lớp học"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Assigned Exams */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-emerald-600" />
                  <span>Giao bài thi cho lớp này ({selectedClass.assignedExamCodes.length} đề)</span>
                </h3>
                {exams.length === 0 ? (
                  <p className="text-xs text-slate-400 italic p-3 bg-slate-50 rounded-xl">
                    Bạn chưa có đề thi nào trong không gian cá nhân để giao cho lớp.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {exams.map((ex) => {
                      const normCode = normalizeExamCode(ex.code);
                      const isAssigned = selectedClass.assignedExamCodes.includes(normCode);
                      return (
                        <button
                          key={ex.id}
                          type="button"
                          disabled={isSaving}
                          onClick={() => void handleToggleExamAssignment(selectedClass, normCode)}
                          className={`p-3 rounded-xl border text-left transition-all flex items-start justify-between gap-2 ${
                            isAssigned
                              ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
                              : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                          }`}
                        >
                          <div className="min-w-0">
                            <span className="font-mono text-[11px] font-bold text-sky-700 block">
                              {normCode} {!ex.isPublished && '(Chưa mở)'}
                            </span>
                            <span className="text-xs font-bold truncate block">{ex.title}</span>
                          </div>
                          <span
                            className={`px-2 py-0.5 rounded-md text-[10px] font-bold shrink-0 ${
                              isAssigned
                                ? 'bg-emerald-600 text-white'
                                : 'bg-white border border-slate-300 text-slate-600'
                            }`}
                          >
                            {isAssigned ? 'Đã giao' : 'Giao đề'}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Enrolled Students Roster (Sorted ascending by STT from hub_learning_profiles) */}
              <div className="space-y-3 pt-4 border-t border-slate-100">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                    <GraduationCap className="w-4 h-4 text-emerald-600" />
                    <span>Học sinh trong lớp ({classStudents.length}) — Sắp xếp theo STT</span>
                  </h3>
                  {onAddHubStudent && (
                    <button
                      type="button"
                      onClick={() => {
                        setStudentStt(nextSuggestedStt);
                        setIsAddingStudent(true);
                      }}
                      className="px-3 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-800 text-xs font-bold flex items-center gap-1.5 transition-colors"
                    >
                      <UserPlus className="w-3.5 h-3.5" />
                      <span>Thêm HS (Hub)</span>
                    </button>
                  )}
                </div>

                {classStudents.length === 0 ? (
                  <div className="p-6 rounded-xl bg-slate-50 border border-slate-200 text-center text-xs text-slate-500">
                    Chưa có học sinh nào trong <code className="font-mono">hub_learning_profiles</code> cho mã lớp{' '}
                    <strong className="font-mono text-sky-700">{selectedClass.classCode}</strong>.
                  </div>
                ) : (
                  <div className="overflow-x-auto border border-slate-200 rounded-xl">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 text-slate-600 uppercase text-[10px] font-bold border-b border-slate-200">
                        <tr>
                          <th className="py-2.5 px-3 text-center w-14">STT</th>
                          <th className="py-2.5 px-3">Họ và tên</th>
                          <th className="py-2.5 px-3">Email / Hồ sơ</th>
                          <th className="py-2.5 px-3 text-center">XP</th>
                          <th className="py-2.5 px-3 text-center">Kết quả / Huy hiệu</th>
                          <th className="py-2.5 px-3 text-right">Thao tác</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {classStudents.map((en, idx) => {
                          const stuSubs = submissions.filter(
                            (s) =>
                              (en.studentUid && s.studentId === en.studentUid) ||
                              s.studentId === en.studentId ||
                              s.studentName === en.studentName
                          );
                          const hubTestsCount = Array.isArray(en.testResults) ? en.testResults.length : 0;
                          const badgeCount = Array.isArray(en.badges) ? en.badges.length : 0;
                          const totalTestsDisplay = Math.max(stuSubs.length, hubTestsCount);

                          return (
                            <tr key={en.id} className="hover:bg-slate-50/80">
                              <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-700">
                                {typeof en.stt === 'number' && en.stt > 0 ? en.stt : idx + 1}
                              </td>
                              <td className="py-2.5 px-3">
                                <div className="font-bold text-slate-900">{en.studentName}</div>
                                {en.hubProfileDocId && (
                                  <span className="font-mono text-[10px] text-slate-400">
                                    {en.hubProfileDocId}
                                  </span>
                                )}
                              </td>
                              <td className="py-2.5 px-3 font-mono text-[11px] text-slate-600">
                                <div>{en.studentEmail || 'Chưa gắn email'}</div>
                                {en.studentUid && (
                                  <div className="text-[10px] text-emerald-700">
                                    UID: {en.studentUid.slice(0, 12)}…
                                  </div>
                                )}
                              </td>
                              <td className="py-2.5 px-3 text-center">
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-700 font-bold text-[11px]">
                                  <Sparkles className="w-3 h-3" />
                                  {en.xp ?? 0}
                                </span>
                              </td>
                              <td className="py-2.5 px-3 text-center">
                                <div className="flex items-center justify-center gap-2">
                                  <span className="font-bold text-sky-700">{totalTestsDisplay} bài</span>
                                  {badgeCount > 0 && (
                                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 font-bold text-[10px]">
                                      <Award className="w-3 h-3" />
                                      {badgeCount}
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="py-2.5 px-3 text-right">
                                <button
                                  type="button"
                                  onClick={() => setPendingDeleteEnrollment(en)}
                                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                                  title="Xóa khỏi lớp"
                                >
                                  <UserMinus className="w-4 h-4" />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Create Class Modal */}
      {isCreating && (
        <div className="fixed inset-0 z-[60] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl border border-slate-200 space-y-4">
            <h3 className="text-base font-bold text-slate-900">Tạo lớp học mới (đồng bộ hub_classes)</h3>
            <form onSubmit={handleCreateSubmit} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Tên lớp học</label>
                <input
                  type="text"
                  required
                  value={newClassName}
                  onChange={(e) => setNewClassName(e.target.value)}
                  placeholder="VD: 12 Hóa 1 - Chuyên Nguyễn Bỉnh Khiêm"
                  className="w-full p-2.5 rounded-xl border border-slate-200 font-semibold focus:border-emerald-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Mã tham gia lớp</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    required
                    value={newClassCode}
                    onChange={(e) => setNewClassCode(e.target.value.toUpperCase())}
                    className="flex-1 p-2.5 rounded-xl border border-slate-200 font-mono font-bold uppercase text-sky-700 bg-slate-50 focus:border-emerald-500 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setNewClassCode(generateClassCode())}
                    className="px-3 py-2 rounded-xl border border-slate-200 hover:bg-slate-100 font-semibold"
                  >
                    Đổi mã
                  </button>
                </div>
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Mô tả (tùy chọn)</label>
                <input
                  type="text"
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="Nhóm ôn thi THPT Quốc gia 2026..."
                  className="w-full p-2.5 rounded-xl border border-slate-200 focus:border-emerald-500 focus:outline-none"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsCreating(false)}
                  className="px-4 py-2 rounded-xl text-slate-600 font-semibold"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-bold"
                >
                  {isSaving ? 'Đang lưu...' : 'Tạo lớp học'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Student to hub_learning_profiles Modal */}
      {isAddingStudent && selectedClass && (
        <div className="fixed inset-0 z-[60] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl border border-slate-200 space-y-4">
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Thêm hồ sơ học sinh vào lớp {selectedClass.className}
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Lưu trực tiếp tại{' '}
                <code className="font-mono text-emerald-700">
                  hub_learning_profiles/{selectedClass.classCode}_{studentStt || '?'}
                </code>
              </p>
            </div>
            <form onSubmit={handleAddStudentSubmit} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-3 gap-2.5">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">STT *</label>
                  <input
                    type="number"
                    min={1}
                    max={999}
                    required
                    value={studentStt}
                    onChange={(e) => setStudentStt(e.target.value)}
                    className="w-full p-2.5 rounded-xl border border-slate-200 font-mono font-bold text-center"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block font-bold text-slate-700 mb-1">Họ và tên học sinh *</label>
                  <input
                    type="text"
                    required
                    value={studentName}
                    onChange={(e) => setStudentName(e.target.value)}
                    placeholder="Nguyễn Minh Khôi"
                    className="w-full p-2.5 rounded-xl border border-slate-200 font-semibold"
                  />
                </div>
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Email học sinh (tùy chọn)</label>
                <input
                  type="email"
                  value={studentEmail}
                  onChange={(e) => setStudentEmail(e.target.value)}
                  placeholder="hocsinh@gmail.com"
                  className="w-full p-2.5 rounded-xl border border-slate-200"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  studentUid Firebase (tùy chọn — tự động gắn khi HS liên kết)
                </label>
                <input
                  type="text"
                  value={studentUidInput}
                  onChange={(e) => setStudentUidInput(e.target.value)}
                  placeholder="UID tài khoản đăng nhập của học sinh"
                  className="w-full p-2.5 rounded-xl border border-slate-200 font-mono"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddingStudent(false)}
                  className="px-4 py-2 rounded-xl text-slate-600 font-semibold"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-bold"
                >
                  {isSaving ? 'Đang lưu...' : 'Lưu vào dbHub'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirm Delete Class */}
      <ConfirmDialog
        isOpen={!!pendingDeleteClass}
        title="Xóa lớp học"
        message={
          pendingDeleteClass
            ? `Bạn có chắc muốn xóa lớp "${pendingDeleteClass.className}" (${pendingDeleteClass.classCode}) khỏi danh sách lớp?`
            : ''
        }
        confirmLabel="Xóa lớp"
        variant="danger"
        onCancel={() => setPendingDeleteClass(null)}
        onConfirm={() => {
          const target = pendingDeleteClass;
          setPendingDeleteClass(null);
          if (target) void onDeleteClass(target);
        }}
      />

      {/* Confirm Remove Student */}
      <ConfirmDialog
        isOpen={!!pendingDeleteEnrollment}
        title="Xóa học sinh khỏi lớp"
        message={
          pendingDeleteEnrollment && selectedClass
            ? `Xóa học sinh "${pendingDeleteEnrollment.studentName}" khỏi lớp ${selectedClass.className}?`
            : ''
        }
        confirmLabel="Xóa học sinh"
        variant="danger"
        onCancel={() => setPendingDeleteEnrollment(null)}
        onConfirm={() => {
          const target = pendingDeleteEnrollment;
          setPendingDeleteEnrollment(null);
          if (target) void onRemoveEnrollment(target.id, target.hubProfileDocId);
        }}
      />
    </div>
  );
};
