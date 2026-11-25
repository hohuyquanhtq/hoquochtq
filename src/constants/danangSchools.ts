import type { PilotGroup, ExamShareStatus, TeacherApprovalStatus } from '../types';

/**
 * Danh sách gợi ý các trường THPT trên địa bàn TP. Đà Nẵng (bao gồm trường chuyên và công lập/tư thục).
 * Giáo viên có thể chọn nhanh từ danh sách hoặc nhập tự do tên trường khác.
 */
export const DANANG_HIGH_SCHOOLS: string[] = [
  'THPT chuyên Nguyễn Bỉnh Khiêm',
  'THPT chuyên Lê Quý Đôn',
  'THPT Phan Châu Trinh',
  'THPT Hòa Vang',
  'THPT Hoàng Hoa Thám',
  'THPT Thái Phiên',
  'THPT Trần Phú',
  'THPT Ngũ Hành Sơn',
  'THPT Nguyễn Trãi',
  'THPT Thanh Khê',
  'THPT Nguyễn Thượng Hiền',
  'THPT Sơn Trà',
  'THPT Liên Chiểu',
  'THPT Cẩm Lệ',
  'THPT Ông Ích Khiêm',
  'THPT Phạm Phú Thứ',
  'THPT Tôn Thất Tùng',
  'THPT Võ Chí Công',
  'THPT Nguyễn Văn Thoại',
  'THPT Nguyễn Hiền',
  'THPT Phan Thành Tài',
  'THPT Herman Gmeiner Đà Nẵng',
  'THPT FPT Đà Nẵng',
  'THPT Sky-Line Đà Nẵng',
];

export const DEFAULT_TEACHER_DEPARTMENTS: string[] = [
  'Tổ Hóa học',
  'Tổ Hóa - Sinh',
  'Tổ Khoa học Tự nhiên',
  'Tổ Vật lí - Hóa học',
  'Tổ Chuyên môn THPT',
];

export const PILOT_GROUP_META: Record<
  PilotGroup,
  {
    label: string;
    shortLabel: string;
    description: string;
    badgeClass: string;
  }
> = {
  host_school: {
    label: 'Trường chủ trì',
    shortLabel: 'Chủ trì',
    description: 'Đơn vị xây dựng, kiểm định học liệu gốc và triển khai nòng cốt.',
    badgeClass: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  },
  expanded_pilot: {
    label: 'Trường thử nghiệm mở rộng',
    shortLabel: 'Thử nghiệm mở rộng',
    description: 'Các trường THPT trên địa bàn tham gia thực nghiệm mở rộng cấp thành phố.',
    badgeClass: 'bg-teal-50 text-teal-700 border-teal-200',
  },
  standard: {
    label: 'Đại trà',
    shortLabel: 'Đại trà',
    description: 'Tài khoản giáo viên tham gia sử dụng và khai thác học liệu dùng chung.',
    badgeClass: 'bg-slate-100 text-slate-700 border-slate-200',
  },
};

export const APPROVAL_STATUS_META: Record<
  TeacherApprovalStatus,
  {
    label: string;
    badgeClass: string;
  }
> = {
  pending: {
    label: 'Chờ phê duyệt',
    badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
  },
  approved: {
    label: 'Đã phê duyệt',
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  rejected: {
    label: 'Từ chối',
    badgeClass: 'bg-rose-50 text-rose-700 border-rose-200',
  },
};

export const EXAM_SHARE_STATUS_META: Record<
  ExamShareStatus,
  {
    label: string;
    shortLabel: string;
    badgeClass: string;
  }
> = {
  private: {
    label: 'Kho cá nhân',
    shortLabel: 'Cá nhân',
    badgeClass: 'bg-slate-100 text-slate-600 border-slate-200',
  },
  pending_review: {
    label: 'Chờ duyệt Kho Thành phố',
    shortLabel: 'Chờ duyệt TP',
    badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
  },
  city_public: {
    label: 'Công khai · Kho Thành phố',
    shortLabel: 'Kho Thành phố',
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
};

export function resolvePilotGroup(
  groupOrUser?: string | { pilot_group?: string } | null
): PilotGroup {
  const group =
    typeof groupOrUser === 'string'
      ? groupOrUser
      : groupOrUser?.pilot_group;
  if (group === 'host_school' || group === 'expanded_pilot' || group === 'standard') {
    return group;
  }
  return 'standard';
}

export function resolveExamShareStatus(status?: string): ExamShareStatus {
  if (status === 'pending_review' || status === 'city_public' || status === 'private') {
    return status;
  }
  return 'private';
}

export function resolveTeacherApprovalStatus(
  approvalStatus?: string,
  accountStatus?: string
): TeacherApprovalStatus {
  if (approvalStatus === 'approved' || approvalStatus === 'pending' || approvalStatus === 'rejected') {
    return approvalStatus;
  }
  if (accountStatus === 'active') return 'approved';
  if (accountStatus === 'rejected') return 'rejected';
  return 'pending';
}

export function resolveApprovalStatus(
  user?: { approval_status?: string; status?: string } | null
): TeacherApprovalStatus {
  return resolveTeacherApprovalStatus(user?.approval_status, user?.status);
}
