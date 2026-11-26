import React, { useMemo } from 'react';
import * as XLSX from 'xlsx';
import { Exam, PilotGroup, Question, StudentSubmission, User } from '../../types';
import {
  PILOT_GROUP_META,
  resolveApprovalStatus,
  resolvePilotGroup,
} from '../../constants/danangSchools';
import { GRADE_LABELS } from '../../constants/subjects';
import { isSuperAdminRole } from '../../constants/superAdmin';
import {
  BarChart3,
  BookOpen,
  Building2,
  Download,
  FileSpreadsheet,
  Globe,
  GraduationCap,
  School,
  Users,
} from 'lucide-react';

interface SystemEvidenceDashboardProps {
  users: User[];
  allExams: Exam[];
  allQuestions: Question[];
  allSubmissions: StudentSubmission[];
}

interface SchoolStatsRow {
  school: string;
  pilotGroup: PilotGroup;
  approvedTeachers: number;
  pendingTeachers: number;
  examsCreated: number;
  cityPublicExams: number;
  submissionsCount: number;
}

export const SystemEvidenceDashboard: React.FC<SystemEvidenceDashboardProps> = ({
  users,
  allExams,
  allQuestions,
  allSubmissions,
}) => {
  const teacherAccounts = useMemo(
    () => users.filter((u) => u.role === 'teacher' || isSuperAdminRole(u.role)),
    [users]
  );

  const approvedTeachers = useMemo(
    () =>
      teacherAccounts.filter(
        (u) => isSuperAdminRole(u.role) || resolveApprovalStatus(u) === 'approved'
      ),
    [teacherAccounts]
  );

  const pendingTeachersCount = useMemo(
    () =>
      users.filter(
        (u) => u.role === 'teacher' && resolveApprovalStatus(u) === 'pending'
      ).length,
    [users]
  );

  const cityPublicExams = useMemo(
    () => allExams.filter((e) => e.share_status === 'city_public'),
    [allExams]
  );

  const cityPublicQuestionsCount = useMemo(
    () => cityPublicExams.reduce((sum, e) => sum + (e.questions?.length || 0), 0),
    [cityPublicExams]
  );

  const averageSubmissionScore = useMemo(() => {
    if (allSubmissions.length === 0) return 0;
    const sum = allSubmissions.reduce((acc, s) => acc + (Number(s.totalScore) || 0), 0);
    return Math.round((sum / allSubmissions.length) * 100) / 100;
  }, [allSubmissions]);

  const schoolStats = useMemo<SchoolStatsRow[]>(() => {
    const map = new Map<string, SchoolStatsRow>();
    const ownerToSchool = new Map<string, string>();

    const normalizeSchoolName = (raw?: string) =>
      (raw || '').trim() || 'Chưa cập nhật đơn vị';

    teacherAccounts.forEach((u) => {
      const school = normalizeSchoolName(u.school);
      ownerToSchool.set(u.id, school);

      const existing = map.get(school) || {
        school,
        pilotGroup: resolvePilotGroup(u),
        approvedTeachers: 0,
        pendingTeachers: 0,
        examsCreated: 0,
        cityPublicExams: 0,
        submissionsCount: 0,
      };

      // Prioritize higher pilot group rank for school display: host_school > expanded_pilot > standard
      const currentRank =
        existing.pilotGroup === 'host_school'
          ? 3
          : existing.pilotGroup === 'expanded_pilot'
          ? 2
          : 1;
      const candidateGroup = resolvePilotGroup(u);
      const candidateRank =
        candidateGroup === 'host_school'
          ? 3
          : candidateGroup === 'expanded_pilot'
          ? 2
          : 1;
      if (candidateRank > currentRank) {
        existing.pilotGroup = candidateGroup;
      }

      if (isSuperAdminRole(u.role) || resolveApprovalStatus(u) === 'approved') {
        existing.approvedTeachers += 1;
      } else if (resolveApprovalStatus(u) === 'pending') {
        existing.pendingTeachers += 1;
      }

      map.set(school, existing);
    });

    const examIdToSchool = new Map<string, string>();
    allExams.forEach((ex) => {
      const school = normalizeSchoolName(
        ex.authorSchool || (ex.ownerId ? ownerToSchool.get(ex.ownerId) : undefined)
      );
      examIdToSchool.set(ex.id, school);
      const row = map.get(school) || {
        school,
        pilotGroup: 'standard' as PilotGroup,
        approvedTeachers: 0,
        pendingTeachers: 0,
        examsCreated: 0,
        cityPublicExams: 0,
        submissionsCount: 0,
      };
      row.examsCreated += 1;
      if (ex.share_status === 'city_public') {
        row.cityPublicExams += 1;
      }
      map.set(school, row);
    });

    allSubmissions.forEach((sub) => {
      const school =
        examIdToSchool.get(sub.examId) ||
        (sub.ownerId ? ownerToSchool.get(sub.ownerId) : undefined) ||
        'Chưa cập nhật đơn vị';
      const row = map.get(school);
      if (row) {
        row.submissionsCount += 1;
      }
    });

    return Array.from(map.values()).sort((a, b) => {
      if (b.approvedTeachers !== a.approvedTeachers) {
        return b.approvedTeachers - a.approvedTeachers;
      }
      return b.submissionsCount - a.submissionsCount;
    });
  }, [teacherAccounts, allExams, allSubmissions]);

  const participatingSchoolsCount = useMemo(
    () =>
      schoolStats.filter(
        (s) => s.school !== 'Chưa cập nhật đơn vị' && s.approvedTeachers > 0
      ).length,
    [schoolStats]
  );

  const pilotGroupSummary = useMemo(() => {
    const groups: PilotGroup[] = ['host_school', 'expanded_pilot', 'standard'];
    return groups.map((groupKey) => {
      const groupTeachers = approvedTeachers.filter(
        (u) => resolvePilotGroup(u) === groupKey
      );
      const groupSchools = new Set(
        groupTeachers
          .map((u) => (u.school || '').trim())
          .filter((s) => s.length > 0)
      );
      const groupOwnerIds = new Set(groupTeachers.map((u) => u.id));
      const groupExams = allExams.filter((e) => e.ownerId && groupOwnerIds.has(e.ownerId));
      const groupSubs = allSubmissions.filter(
        (s) => s.ownerId && groupOwnerIds.has(s.ownerId)
      );

      return {
        key: groupKey,
        label: PILOT_GROUP_META[groupKey].label,
        description: PILOT_GROUP_META[groupKey].description,
        badgeClass: PILOT_GROUP_META[groupKey].badgeClass,
        schoolsCount: groupSchools.size,
        teachersCount: groupTeachers.length,
        examsCount: groupExams.length,
        submissionsCount: groupSubs.length,
      };
    });
  }, [approvedTeachers, allExams, allSubmissions]);

  const handleExportEvidenceExcel = () => {
    const wb = XLSX.utils.book_new();
    const generatedAt = new Date().toLocaleString('vi-VN');

    // Sheet 1: Overview Summary
    const overviewRows = [
      { 'Chỉ tiêu minh chứng triển khai': 'Thời điểm xuất báo cáo', 'Giá trị': generatedAt },
      {
        'Chỉ tiêu minh chứng triển khai': 'Tổng số trường THPT tham gia (có GV đã duyệt)',
        'Giá trị': participatingSchoolsCount,
      },
      {
        'Chỉ tiêu minh chứng triển khai': 'Tổng số giáo viên & quản trị đã được phê duyệt',
        'Giá trị': approvedTeachers.length,
      },
      {
        'Chỉ tiêu minh chứng triển khai': 'Số giáo viên đang chờ phê duyệt',
        'Giá trị': pendingTeachersCount,
      },
      {
        'Chỉ tiêu minh chứng triển khai': 'Tổng số đề thi trong Kho đề dùng chung Thành phố',
        'Giá trị': cityPublicExams.length,
      },
      {
        'Chỉ tiêu minh chứng triển khai': 'Tổng số câu hỏi trong Kho đề dùng chung Thành phố',
        'Giá trị': cityPublicQuestionsCount,
      },
      {
        'Chỉ tiêu minh chứng triển khai': 'Tổng số câu hỏi trong Ngân hàng câu hỏi toàn hệ thống',
        'Giá trị': allQuestions.length,
      },
      {
        'Chỉ tiêu minh chứng triển khai': 'Tổng số đề thi đã tạo toàn hệ thống',
        'Giá trị': allExams.length,
      },
      {
        'Chỉ tiêu minh chứng triển khai': 'Tổng số lượt học sinh làm bài thi trực tuyến',
        'Giá trị': allSubmissions.length,
      },
      {
        'Chỉ tiêu minh chứng triển khai': 'Điểm trung bình toàn hệ thống (thang 10)',
        'Giá trị': averageSubmissionScore,
      },
    ];
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(overviewRows),
      '1_Tong_Quan'
    );

    // Sheet 2: School Breakdown
    const schoolRows = schoolStats.map((s, idx) => ({
      STT: idx + 1,
      'Trường THPT': s.school,
      'Nhóm triển khai': PILOT_GROUP_META[s.pilotGroup].label,
      'GV đã duyệt': s.approvedTeachers,
      'GV chờ duyệt': s.pendingTeachers,
      'Số đề đã tạo': s.examsCreated,
      'Đề đóng góp Kho TP': s.cityPublicExams,
      'Lượt HS làm bài': s.submissionsCount,
    }));
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(schoolRows),
      '2_Thong_Ke_Theo_Truong'
    );

    // Sheet 3: Participating Teachers
    const teacherRows = teacherAccounts.map((u, idx) => ({
      STT: idx + 1,
      'Họ và tên': u.name,
      Email: u.email,
      'Trường THPT': u.school || '',
      'Tổ chuyên môn': u.department || 'Tổ Hóa học',
      'Vai trò': isSuperAdminRole(u.role) ? 'Super Admin' : 'Giáo viên',
      'Trạng thái duyệt':
        isSuperAdminRole(u.role)
          ? 'Đã duyệt'
          : resolveApprovalStatus(u) === 'approved'
          ? 'Đã duyệt'
          : resolveApprovalStatus(u) === 'pending'
          ? 'Chờ duyệt'
          : 'Từ chối',
      'Nhóm triển khai': PILOT_GROUP_META[resolvePilotGroup(u)].label,
      'Ngày đăng ký': u.createdAt
        ? new Date(u.createdAt).toLocaleDateString('vi-VN')
        : '',
    }));
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(teacherRows),
      '3_Giao_Vien_Tham_Gia'
    );

    // Sheet 4: City Shared Exam Bank
    const cityExamRows = cityPublicExams.map((ex, idx) => ({
      STT: idx + 1,
      'Tên đề thi': ex.title,
      'Khối lớp': GRADE_LABELS[ex.grade] || ex.grade,
      'Số câu hỏi': ex.questions?.length || 0,
      'Thời lượng (phút)': ex.durationMinutes,
      'Tác giả': ex.authorName,
      'Trường THPT': ex.authorSchool || '',
      'Tổ chuyên môn': ex.authorDepartment || 'Tổ Hóa học',
      'Ngày duyệt công khai': ex.cityApprovedAt
        ? new Date(ex.cityApprovedAt).toLocaleDateString('vi-VN')
        : '',
    }));
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(cityExamRows),
      '4_Kho_De_Thanh_Pho'
    );

    const dateStamp = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `Bao_Cao_Minh_Chung_HQTest_DaNang_${dateStamp}.xlsx`);
  };

  return (
    <div className="space-y-6">
      {/* Header & Excel Export CTA */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-indigo-700 font-bold text-xs uppercase tracking-wider">
            <BarChart3 className="w-4 h-4 shrink-0" />
            <span>Báo cáo minh chứng triển khai · Nghiệm thu đề tài NCKH</span>
          </div>
          <h2 className="text-xl font-extrabold text-slate-900 mt-1">
            Thống kê toàn hệ thống TP. Đà Nẵng
          </h2>
          <p className="text-xs text-slate-600 mt-1">
            Số liệu thời gian thực về mức độ tham gia của các trường THPT, đội ngũ giáo viên, kho học liệu chuẩn GDPT 2018 và lượt học sinh làm bài.
          </p>
        </div>

        <button
          type="button"
          onClick={handleExportEvidenceExcel}
          className="min-h-[44px] px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs inline-flex items-center gap-2 shrink-0"
        >
          <FileSpreadsheet className="w-4 h-4" />
          <span>Xuất báo cáo thống kê Excel (.xlsx)</span>
          <Download className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* 4 Core KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">Trường THPT tham gia</span>
            <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <School className="w-5 h-5" />
            </div>
          </div>
          <p className="text-3xl font-extrabold text-slate-900 tabular-nums">
            {participatingSchoolsCount}
          </p>
          <p className="text-[11px] text-slate-500">
            Đơn vị có giáo viên được phê duyệt trên địa bàn
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">Giáo viên được duyệt</span>
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <Users className="w-5 h-5" />
            </div>
          </div>
          <p className="text-3xl font-extrabold text-slate-900 tabular-nums">
            {approvedTeachers.length}
          </p>
          <p className="text-[11px] text-slate-500 tabular-nums">
            {pendingTeachersCount > 0
              ? `Đang chờ duyệt thêm ${pendingTeachersCount} giáo viên`
              : 'Đã duyệt toàn bộ hồ sơ đăng ký'}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">Kho đề &amp; câu hỏi dùng chung</span>
            <div className="w-9 h-9 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center">
              <Globe className="w-5 h-5" />
            </div>
          </div>
          <p className="text-3xl font-extrabold text-slate-900 tabular-nums">
            {cityPublicExams.length}{' '}
            <span className="text-base font-bold text-slate-500">đề</span>
          </p>
          <p className="text-[11px] text-slate-500 tabular-nums">
            {cityPublicQuestionsCount} câu trong Kho TP · {allQuestions.length} câu toàn ngân hàng
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">Lượt học sinh làm bài</span>
            <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
              <GraduationCap className="w-5 h-5" />
            </div>
          </div>
          <p className="text-3xl font-extrabold text-slate-900 tabular-nums">
            {allSubmissions.length}
          </p>
          <p className="text-[11px] text-slate-500 tabular-nums">
            Điểm TB toàn hệ thống: <strong>{averageSubmissionScore.toFixed(2)}/10</strong>
          </p>
        </div>
      </div>

      {/* Pilot Group Breakdown */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
        <div className="flex items-center gap-2">
          <Building2 className="w-4 h-4 text-indigo-600" />
          <h3 className="text-sm font-extrabold text-slate-900">
            Phân bổ theo Nhóm triển khai thử nghiệm (Pilot Groups)
          </h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {pilotGroupSummary.map((grp) => (
            <div
              key={grp.key}
              className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 space-y-2.5"
            >
              <span
                className={`inline-block px-2.5 py-0.5 rounded-md border text-[11px] font-bold ${grp.badgeClass}`}
              >
                {grp.label}
              </span>
              <p className="text-xs text-slate-600 leading-relaxed">{grp.description}</p>
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-200/70 text-xs tabular-nums">
                <div>
                  <span className="text-slate-500 block text-[11px]">Số trường</span>
                  <strong className="text-slate-900">{grp.schoolsCount}</strong>
                </div>
                <div>
                  <span className="text-slate-500 block text-[11px]">Giáo viên</span>
                  <strong className="text-slate-900">{grp.teachersCount}</strong>
                </div>
                <div>
                  <span className="text-slate-500 block text-[11px]">Đề đã tạo</span>
                  <strong className="text-slate-900">{grp.examsCount}</strong>
                </div>
                <div>
                  <span className="text-slate-500 block text-[11px]">Lượt HS thi</span>
                  <strong className="text-slate-900">{grp.submissionsCount}</strong>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Detailed School-by-School Evidence Table */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-emerald-600" />
            <h3 className="text-sm font-extrabold text-slate-900">
              Bảng tổng hợp theo từng Trường THPT ({schoolStats.length} đơn vị)
            </h3>
          </div>
          <span className="text-xs text-slate-500">
            Dữ liệu đồng bộ trực tiếp vào file Excel nghiệm thu
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                <th className="py-3 px-4">#</th>
                <th className="py-3 px-4">Trường THPT</th>
                <th className="py-3 px-4">Nhóm thử nghiệm</th>
                <th className="py-3 px-3 text-center">GV duyệt</th>
                <th className="py-3 px-3 text-center">GV chờ duyệt</th>
                <th className="py-3 px-3 text-center">Đề đã tạo</th>
                <th className="py-3 px-3 text-center">Đề Kho TP</th>
                <th className="py-3 px-4 text-right">Lượt HS làm bài</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {schoolStats.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-500">
                    Chưa có dữ liệu trường học nào được ghi nhận.
                  </td>
                </tr>
              ) : (
                schoolStats.map((row, idx) => {
                  const meta = PILOT_GROUP_META[row.pilotGroup];
                  return (
                    <tr key={row.school} className="hover:bg-slate-50/70">
                      <td className="py-3 px-4 text-slate-500 tabular-nums">{idx + 1}</td>
                      <td className="py-3 px-4 font-bold text-slate-900">{row.school}</td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-md border text-[11px] font-bold ${meta.badgeClass}`}
                        >
                          {meta.label}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-center font-bold text-emerald-700 tabular-nums">
                        {row.approvedTeachers}
                      </td>
                      <td className="py-3 px-3 text-center font-semibold text-amber-700 tabular-nums">
                        {row.pendingTeachers}
                      </td>
                      <td className="py-3 px-3 text-center font-semibold text-slate-800 tabular-nums">
                        {row.examsCreated}
                      </td>
                      <td className="py-3 px-3 text-center font-bold text-indigo-700 tabular-nums">
                        {row.cityPublicExams}
                      </td>
                      <td className="py-3 px-4 text-right font-extrabold text-slate-900 tabular-nums">
                        {row.submissionsCount}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
