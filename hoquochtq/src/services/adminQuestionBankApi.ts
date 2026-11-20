import { auth } from './firebase';
import type {
  AdminQuestionAuditLog,
  AdminQuestionBankFilterParams,
  AdminQuestionBankResponse,
  Question,
} from '../types';

async function getBearerAuthHeaders(): Promise<Record<string, string>> {
  const user = auth?.currentUser;
  if (!user) {
    throw new Error('Bạn chưa đăng nhập phiên Quản trị viên Firebase.');
  }
  const token = await user.getIdToken();
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

export async function fetchSchoolQuestionBankOnServer(
  filters: AdminQuestionBankFilterParams = {}
): Promise<AdminQuestionBankResponse> {
  const headers = await getBearerAuthHeaders();
  const res = await fetch('/api/admin/question-bank', {
    method: 'POST',
    headers,
    body: JSON.stringify(filters),
  });
  const data = (await res.json().catch(() => ({}))) as Partial<AdminQuestionBankResponse> & {
    ok?: boolean;
    error?: string;
    code?: string;
  };
  if (!res.ok || !data.ok) {
    throw new Error(data.error || `Không thể tải Ngân hàng câu hỏi toàn trường (HTTP ${res.status}).`);
  }
  return {
    items: data.items || [],
    totalFiltered: data.totalFiltered || 0,
    page: data.page || 1,
    pageSize: data.pageSize || 20,
    totalPages: data.totalPages || 1,
    stats: data.stats!,
    teachers: data.teachers || [],
    filterOptions: data.filterOptions || {
      subjects: [],
      grades: [],
      textbookSeries: [],
      chapters: [],
      lessons: [],
    },
  };
}

export async function copyTeacherQuestionToAdminBankOnServer(questionId: string): Promise<{
  copiedQuestion: Question;
  auditLogId: string;
  message: string;
}> {
  const headers = await getBearerAuthHeaders();
  const res = await fetch('/api/admin/question-bank/action', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      action: 'copy_to_admin',
      questionId,
    }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    copiedQuestion?: Question;
    auditLogId?: string;
    message?: string;
    error?: string;
  };
  if (!res.ok || !data.ok || !data.copiedQuestion) {
    throw new Error(data.error || `Không thể sao chép câu hỏi sang ngân hàng Admin (HTTP ${res.status}).`);
  }
  return {
    copiedQuestion: data.copiedQuestion,
    auditLogId: data.auditLogId || '',
    message: data.message || 'Đã sao chép câu hỏi vào ngân hàng riêng của Admin.',
  };
}

export async function editOriginalTeacherQuestionOnServer(params: {
  questionId: string;
  reason: string;
  updates: Partial<Question>;
}): Promise<{
  updatedQuestion: Question;
  auditLogId: string;
  message: string;
}> {
  const headers = await getBearerAuthHeaders();
  const res = await fetch('/api/admin/question-bank/action', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      action: 'edit_original',
      questionId: params.questionId,
      confirmOriginalMutation: true,
      reason: params.reason,
      updates: params.updates,
    }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    updatedQuestion?: Question;
    auditLogId?: string;
    message?: string;
    error?: string;
  };
  if (!res.ok || !data.ok || !data.updatedQuestion) {
    throw new Error(data.error || `Không thể cập nhật câu hỏi gốc (HTTP ${res.status}).`);
  }
  return {
    updatedQuestion: data.updatedQuestion,
    auditLogId: data.auditLogId || '',
    message: data.message || 'Đã cập nhật câu hỏi gốc và ghi nhật ký.',
  };
}

export async function deleteOriginalTeacherQuestionOnServer(params: {
  questionId: string;
  reason: string;
}): Promise<{
  deletedQuestionId: string;
  auditLogId: string;
  message: string;
}> {
  const headers = await getBearerAuthHeaders();
  const res = await fetch('/api/admin/question-bank/action', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      action: 'delete_original',
      questionId: params.questionId,
      confirmOriginalMutation: true,
      reason: params.reason,
    }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    deletedQuestionId?: string;
    auditLogId?: string;
    message?: string;
    error?: string;
  };
  if (!res.ok || !data.ok) {
    throw new Error(data.error || `Không thể xóa câu hỏi gốc (HTTP ${res.status}).`);
  }
  return {
    deletedQuestionId: data.deletedQuestionId || params.questionId,
    auditLogId: data.auditLogId || '',
    message: data.message || 'Đã xóa câu hỏi gốc và ghi nhật ký.',
  };
}

export async function fetchAdminQuestionAuditLogsOnServer(): Promise<AdminQuestionAuditLog[]> {
  const headers = await getBearerAuthHeaders();
  const res = await fetch('/api/admin/question-bank/audit-logs', {
    method: 'POST',
    headers,
    body: JSON.stringify({}),
  });
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    logs?: AdminQuestionAuditLog[];
    error?: string;
  };
  if (!res.ok || !data.ok) {
    throw new Error(data.error || `Không thể tải nhật ký kiểm duyệt câu hỏi (HTTP ${res.status}).`);
  }
  return data.logs || [];
}
