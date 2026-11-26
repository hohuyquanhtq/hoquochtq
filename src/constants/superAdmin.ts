import type { AccountStatus, UserRole } from '../types';

/**
 * Danh sách email Super Admin mặc định đồng bộ với hệ sinh thái HTQ Chemistry Hub.
 */
export const DEFAULT_SUPER_ADMIN_EMAILS = [
  'hohuyquanhtq@gmail.com',
  'hochivienhtq@gmail.com',
] as const;

export const EXPECTED_PRIMARY_ADMIN_EMAIL = DEFAULT_SUPER_ADMIN_EMAILS[0];

export function normalizeEmail(email?: string | null): string {
  return (email || '').trim().toLowerCase();
}

export function isDefaultSuperAdminEmail(email?: string | null): boolean {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;
  return (DEFAULT_SUPER_ADMIN_EMAILS as readonly string[]).includes(normalized);
}

export function isSuperAdminRole(role?: UserRole | string | null): boolean {
  return role === 'super_admin' || role === 'admin';
}

export function isTeacherOrAdminRole(role?: UserRole | string | null): boolean {
  return role === 'teacher' || isSuperAdminRole(role);
}

export function isSuperAdminUser(
  user?: { role?: UserRole | string | null; email?: string | null } | null
): boolean {
  if (!user) return false;
  return isSuperAdminRole(user.role) || isDefaultSuperAdminEmail(user.email);
}

export function isApprovedAccountStatus(status?: AccountStatus | string | null): boolean {
  return status === 'approved' || status === 'active';
}
