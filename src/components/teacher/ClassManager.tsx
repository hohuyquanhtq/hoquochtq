import React, { useState } from 'react';
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
} from 'lucide-react';
import { Classroom, ClassEnrollment, Exam, StudentSubmission, User } from '../../types';
import { normalizeExamCode } from '../../utils/urlHelper';

interface ClassManagerProps {
  currentUser: User;
  classes: Classroom[];
  enrollments: ClassEnrollment[];
  exams: Exam[];
  submissions: StudentSubmission[];
  onSaveClass: (cls: Classroom) => Promise<void>;
  onDeleteClass: (cls: Classroom) => Promise<void>;
  onRemoveEnrollment: (enrollmentId: string) => Promise<void>;
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
}) => {
  const [selectedClassId, setSelectedClassId] = useState<string>(classes[0]?.id || '');
  const [isCreating, setIsCreating] = useState(false);
  const [newClassName, setNewClassName] = useState('');
  const [newClassCode, setNewClassCode] = useState(() => generateClassCode());
  const [newDescription, setNewDescription] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const selectedClass = classes.find((c) => c.id === selectedClassId) || classes[0] || null;
  const classStudents = selectedClass
    ? enrollments.filter((en) => en.classId === selectedClass.id)
    : [];

  const handleCopyCode = async (code: string) => {
    try {
      await navigator.clipboard?.writeText(code);
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 2500);
    } catch {
      // ignore clipboard restrictions
    }
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClassName.trim()) return;
    const cleanCode = normalizeExamCode(newClassCode) || generateClassCode();
    if (!/^[A-Z0-9-]{2,32}$/.test(cleanCode)) {
      setFeedback({ type: 'error', text: 'Mã lớp chỉ gồm chữ in hoa, số và dấu gạch ngang (2-32 ký tự).' });
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
      setFeedback({ type: 'success', text: `Đã tạo lớp "${newCls.className}" (Mã lớp: ${newCls.classCode})!` });
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Không thể tạo lớp học.',
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
          <div className="flex items-center gap-2 text-blue-600 font-bold text-xs uppercase tracking-wider">
            <Users className="w-4 h-4" />
            <span>Quản Lý Lớp Học &amp; Danh Sách Học Sinh Riêng</span>
          </div>
          <h1 className="text-xl md:text-2xl font-extrabold text-slate-900 mt-1">
            Lớp Học Của Tôi ({classes.length} lớp)
          </h1>
          <p className="text-xs md:text-sm text-slate-500 mt-1">
            Tạo mã lớp để học sinh tham gia khi đăng ký hoặc trong phòng học sinh, giao bài thi theo lớp và theo dõi kết quả.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setNewClassCode(generateClassCode());
            setIsCreating(true);
          }}
          className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-md shadow-blue-500/20 flex items-center gap-2 shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Tạo lớp học mới</span>
        </button>
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
              Bạn chưa tạo lớp học nào. Nhấn &ldquo;Tạo lớp học mới&rdquo; để cấp mã lớp cho học sinh.
            </p>
          ) : (
            classes.map((cls) => {
              const isSelected = selectedClass?.id === cls.id;
              const studentCount = enrollments.filter((en) => en.classId === cls.id).length;
              return (
                <div
                  key={cls.id}
                  onClick={() => setSelectedClassId(cls.id)}
                  className={`p-3 rounded-xl cursor-pointer border transition-all space-y-1.5 ${
                    isSelected
                      ? 'bg-blue-50 border-blue-200 shadow-2xs'
                      : 'bg-white border-slate-100 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-slate-900 text-xs truncate">{cls.className}</span>
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                        cls.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'
                      }`}
                    >
                      {cls.isActive ? 'Đang mở' : 'Tạm khóa'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-slate-500">
                    <span className="font-mono font-bold text-blue-700">Mã: {cls.classCode}</span>
                    <span>{studentCount} học sinh • {cls.assignedExamCodes.length} đề</span>
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
                    <span className="px-2.5 py-1 rounded-lg bg-blue-100 text-blue-800 font-mono text-xs font-bold">
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
                    onClick={async () => {
                      if (confirm(`Xóa lớp học "${selectedClass.className}" (${selectedClass.classCode})?`)) {
                        await onDeleteClass(selectedClass);
                      }
                    }}
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
                  <BookOpen className="w-4 h-4 text-blue-600" />
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
                            <span className="font-mono text-[11px] font-bold text-blue-700 block">
                              {normCode} {!ex.isPublished && '(Chưa mở)'}
                            </span>
                            <span className="text-xs font-bold truncate block">{ex.title}</span>
                          </div>
                          <span
                            className={`px-2 py-0.5 rounded-md text-[10px] font-bold shrink-0 ${
                              isAssigned ? 'bg-emerald-600 text-white' : 'bg-white border border-slate-300 text-slate-600'
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

              {/* Enrolled Students Roster */}
              <div className="space-y-3 pt-4 border-t border-slate-100">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                  <GraduationCap className="w-4 h-4 text-emerald-600" />
                  <span>Học sinh trong lớp ({classStudents.length})</span>
                </h3>

                {classStudents.length === 0 ? (
                  <div className="p-6 rounded-xl bg-slate-50 border border-slate-200 text-center text-xs text-slate-500">
                    Chưa có học sinh nào tham gia lớp. Hãy gửi mã lớp <strong className="font-mono text-blue-700">{selectedClass.classCode}</strong> cho học sinh!
                  </div>
                ) : (
                  <div className="overflow-x-auto border border-slate-200 rounded-xl">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 text-slate-600 uppercase text-[10px] font-bold border-b border-slate-200">
                        <tr>
                          <th className="py-2.5 px-3">Họ và tên</th>
                          <th className="py-2.5 px-3">Email</th>
                          <th className="py-2.5 px-3 text-center">Số bài đã nộp</th>
                          <th className="py-2.5 px-3 text-center">Ngày tham gia</th>
                          <th className="py-2.5 px-3 text-right">Thao tác</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {classStudents.map((en) => {
                          const stuSubs = submissions.filter(
                            (s) => s.studentId === en.studentId || s.studentName === en.studentName
                          );
                          return (
                            <tr key={en.id} className="hover:bg-slate-50">
                              <td className="py-2.5 px-3 font-bold text-slate-900">{en.studentName}</td>
                              <td className="py-2.5 px-3 font-mono text-slate-600">{en.studentEmail}</td>
                              <td className="py-2.5 px-3 text-center font-bold text-blue-700">{stuSubs.length}</td>
                              <td className="py-2.5 px-3 text-center text-slate-500">
                                {new Date(en.joinedAt).toLocaleDateString('vi-VN')}
                              </td>
                              <td className="py-2.5 px-3 text-right">
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (confirm(`Xóa học sinh "${en.studentName}" khỏi lớp ${selectedClass.className}?`)) {
                                      void onRemoveEnrollment(en.id);
                                    }
                                  }}
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
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl border border-slate-200 space-y-4">
            <h3 className="text-base font-bold text-slate-900">Tạo lớp học mới</h3>
            <form onSubmit={handleCreateSubmit} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Tên lớp học</label>
                <input
                  type="text"
                  required
                  value={newClassName}
                  onChange={(e) => setNewClassName(e.target.value)}
                  placeholder="VD: 12 Hóa 1 - Chuyên Nguyễn Bỉnh Khiêm"
                  className="w-full p-2.5 rounded-xl border border-slate-200 font-semibold"
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
                    className="flex-1 p-2.5 rounded-xl border border-slate-200 font-mono font-bold uppercase text-blue-700 bg-slate-50"
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
                  className="w-full p-2.5 rounded-xl border border-slate-200"
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
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-bold"
                >
                  {isSaving ? 'Đang lưu...' : 'Tạo lớp học'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
