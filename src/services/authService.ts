import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  updatePassword,
  updateProfile,
  EmailAuthProvider,
  reauthenticateWithCredential,
  sendEmailVerification,
  User as FirebaseUser,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  getDocFromServer,
  setDoc,
  updateDoc,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';
import {
  auth,
  db,
  firebaseInitError,
  getFirebaseProjectInfo,
  stripUndefinedDeep,
  handleFirestoreError,
  OperationType,
} from './firebase';
import {
  User,
  UserRole,
  AccountStatus,
  ClassJoinLookup,
  ClassEnrollment,
} from '../types';
import { normalizeExamCode } from '../utils/urlHelper';

export const EXPECTED_PRIMARY_ADMIN_EMAIL = 'hohuyquanhtq@gmail.com';
const PENDING_PROFILE_STORAGE_KEY = 'hqtest_pending_profile_draft';

export interface PendingProfileDraft {
  uid: string;
  email: string;
  name: string;
  role: 'teacher' | 'student';
  phone?: string;
  school?: string;
  className?: string;
  classCode?: string;
}

export interface RegisterTeacherInput {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
  phone?: string;
  school?: string;
}

export interface RegisterStudentInput {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
  classCode?: string;
  className?: string;
}

export type ProfileErrorCategory =
  | 'profile_not_found'
  | 'read_permission_denied'
  | 'write_permission_denied'
  | 'pending_approval'
  | 'locked'
  | 'rejected'
  | 'project_mismatch'
  | 'network_error'
  | 'unexpected_error';

export interface ProfileDiagnosticError {
  category: ProfileErrorCategory;
  code: string;
  operation: 'GET' | 'CREATE' | 'UPDATE' | 'LIST';
  path: string;
  projectId: string;
  databaseId: string;
  uid?: string;
  userMessage: string;
}

export class ProfileAccessError extends Error {
  public readonly diagnostic: ProfileDiagnosticError;
  constructor(diagnostic: ProfileDiagnosticError) {
    super(diagnostic.userMessage);
    this.name = 'ProfileAccessError';
    this.diagnostic = diagnostic;
  }
}

export interface AuthActionResult {
  success: boolean;
  user?: User;
  warningMessage?: string;
  profileSyncFailed?: boolean;
  verifiedFromServer?: boolean;
  errorMessage?: string;
  errorDiagnostic?: ProfileDiagnosticError;
}

export interface AccountSyncDiagnostic {
  uid: string;
  email: string;
  emailVerified: boolean;
  displayName: string;
  projectId: string;
  databaseId: string;
  projectMismatchSuspected: boolean;
  userDocExists: boolean;
  userDocMissingFields: string[];
  userDocError?: ProfileDiagnosticError;
  adminDocExists: boolean;
  adminDocActive: boolean;
  adminDocError?: string;
  adminDocDiagnostic?: ProfileDiagnosticError;
  hasAdminClaim: boolean;
  hasTrustedAdminAuthority: boolean;
  existingRole?: UserRole;
  existingStatus?: AccountStatus;
  existingName?: string;
}

export interface SyncProfileByUidOptions {
  intendedRole: 'admin' | 'teacher' | 'student';
  name?: string;
  phone?: string;
  school?: string;
  className?: string;
  classCode?: string;
}

export function isValidEmailFormat(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export function classifyFirestoreOperationError(
  error: unknown,
  operation: 'GET' | 'CREATE' | 'UPDATE' | 'LIST',
  path: string,
  uid?: string
): ProfileDiagnosticError {
  const errObj = error as { code?: string; message?: string } | undefined;
  const code = (errObj?.code || 'unknown').toLowerCase();
  const rawMessage = (errObj?.message || String(error || '')).toLowerCase();
  const projectInfo = getFirebaseProjectInfo();

  let category: ProfileErrorCategory = 'unexpected_error';
  let userMessage = `Đã xảy ra lỗi không mong muốn khi ${operation} ${path} (mã lỗi: ${code}).`;

  if (
    projectInfo.projectMismatchSuspected ||
    (code.includes('not-found') && rawMessage.includes('database')) ||
    code.includes('app-not-authorized') ||
    code.includes('invalid-api-key') ||
    (code.includes('failed-precondition') && rawMessage.includes('project'))
  ) {
    category = 'project_mismatch';
    userMessage = `Firebase có thể đang kết nối nhầm Project hoặc sai Database ID (hiện tại: Project "${projectInfo.projectId}", DB "${projectInfo.databaseId}", mã lỗi: ${code}).`;
  } else if (
    code.includes('network-request-failed') ||
    code.includes('unavailable') ||
    code.includes('deadline-exceeded') ||
    rawMessage.includes('network') ||
    rawMessage.includes('failed to fetch') ||
    rawMessage.includes('offline')
  ) {
    category = 'network_error';
    userMessage = `Lỗi kết nối mạng tới máy chủ Firebase Firestore khi thực hiện ${operation} ${path} (mã lỗi: ${code}). Vui lòng kiểm tra Internet và thử lại.`;
  } else if (
    code.includes('permission-denied') ||
    rawMessage.includes('missing or insufficient permissions')
  ) {
    if (operation === 'GET' || operation === 'LIST') {
      category = 'read_permission_denied';
      userMessage = `Không đủ quyền đọc hồ sơ (${operation} ${path}, mã lỗi: ${code}). Vui lòng kiểm tra Firestore Security Rules hoặc trạng thái tài khoản.`;
    } else {
      category = 'write_permission_denied';
      userMessage = `Không đủ quyền ghi hồ sơ (${operation} ${path}, mã lỗi: ${code}). Nếu đang đồng bộ tài khoản Admin, cần tạo trước document admins/${uid || '{uid}'} hoặc Admin Custom Claim trên Firebase.`;
    }
  }

  const diagnostic: ProfileDiagnosticError = {
    category,
    code,
    operation,
    path,
    projectId: projectInfo.projectId,
    databaseId: projectInfo.databaseId,
    uid,
    userMessage,
  };

  console.error('[HQTest Firestore Diagnostic]', {
    category: diagnostic.category,
    code: diagnostic.code,
    operation: diagnostic.operation,
    path: diagnostic.path,
    projectId: diagnostic.projectId,
    databaseId: diagnostic.databaseId,
    uid: diagnostic.uid,
    message: errObj?.message || String(error || ''),
  });

  return diagnostic;
}

export function mapFirebaseAuthError(error: unknown): string {
  if (error instanceof ProfileAccessError) {
    return error.diagnostic.userMessage;
  }

  const errObj = error as { code?: string; message?: string } | undefined;
  const code = (errObj?.code || '').toLowerCase();
  const rawMessage = (errObj?.message || String(error || '')).toLowerCase();

  if (code.includes('email-already-in-use')) {
    return 'Email này đã được đăng ký trước đó. Vui lòng đăng nhập hoặc sử dụng chức năng Quên mật khẩu.';
  }
  if (code.includes('invalid-email')) {
    return 'Địa chỉ email không hợp lệ. Vui lòng kiểm tra lại định dạng email.';
  }
  if (code.includes('weak-password')) {
    return 'Mật khẩu quá yếu. Vui lòng sử dụng mật khẩu có ít nhất 8 ký tự.';
  }
  if (code.includes('invalid-credential') || code.includes('invalid-login-credentials')) {
    return 'Email hoặc mật khẩu không chính xác. Vui lòng kiểm tra lại.';
  }
  if (code.includes('user-not-found')) {
    return 'Tài khoản với email này không tồn tại trong hệ thống.';
  }
  if (code.includes('wrong-password')) {
    return 'Mật khẩu chưa chính xác. Vui lòng thử lại.';
  }
  if (code.includes('user-disabled')) {
    return 'Tài khoản đã bị vô hiệu hóa bởi Quản trị viên.';
  }
  if (code.includes('too-many-requests')) {
    return 'Bạn đã thử quá nhiều lần. Vui lòng đợi vài phút rồi thử lại.';
  }
  if (code.includes('requires-recent-login')) {
    return 'Phiên đăng nhập đã cũ. Vui lòng nhập mật khẩu hiện tại hoặc đăng nhập lại để tiếp tục.';
  }
  if (code.includes('operation-not-allowed')) {
    return 'Phương thức đăng nhập Email/Mật khẩu chưa được bật trong Firebase Console (Authentication → Sign-in method).';
  }
  if (
    code.includes('network-request-failed') ||
    code.includes('unavailable') ||
    rawMessage.includes('network') ||
    rawMessage.includes('failed to fetch') ||
    rawMessage.includes('offline')
  ) {
    return 'Lỗi kết nối mạng tới máy chủ Firebase. Vui lòng kiểm tra Internet và thử lại.';
  }
  if (code.includes('permission-denied') || rawMessage.includes('missing or insufficient permissions')) {
    return 'Thao tác Firestore bị từ chối (permission-denied). Vui lòng kiểm tra Firestore Security Rules và quyền tài khoản.';
  }

  return errObj?.message || 'Đã xảy ra lỗi xác thực không mong muốn. Vui lòng thử lại.';
}

function savePendingDraft(draft: PendingProfileDraft): void {
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      // Security: NEVER store password in storage!
      window.sessionStorage.setItem(PENDING_PROFILE_STORAGE_KEY, JSON.stringify(draft));
    }
  } catch {
    // ignore storage errors
  }
}

export function loadPendingDraft(uid?: string): PendingProfileDraft | null {
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      const raw = window.sessionStorage.getItem(PENDING_PROFILE_STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as PendingProfileDraft;
      if (uid && parsed.uid !== uid) return null;
      return parsed;
    }
  } catch {
    // ignore
  }
  return null;
}

export function clearPendingDraft(): void {
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      window.sessionStorage.removeItem(PENDING_PROFILE_STORAGE_KEY);
    }
  } catch {
    // ignore
  }
}

async function enrollStudentByClassCodeInternal(
  studentUid: string,
  studentName: string,
  studentEmail: string,
  rawClassCode: string
): Promise<{ joined: boolean; className?: string; warning?: string }> {
  const code = normalizeExamCode(rawClassCode);
  if (!code || !/^[A-Z0-9-]+$/.test(code)) {
    return {
      joined: false,
      warning: `Mã lớp "${rawClassCode}" không đúng định dạng (chỉ gồm chữ in hoa, số và dấu gạch ngang). Tài khoản đã tạo thành công, bạn có thể tham gia lớp sau trong trang Học sinh.`,
    };
  }

  try {
    const joinSnap = await getDoc(doc(db, 'classJoinCodes', code));
    if (!joinSnap.exists()) {
      return {
        joined: false,
        warning: `Không tìm thấy lớp học có mã "${code}". Tài khoản đã được tạo, bạn có thể nhập lại mã lớp sau khi đăng nhập.`,
      };
    }

    const lookup = joinSnap.data() as ClassJoinLookup;
    if (!lookup.isActive) {
      return {
        joined: false,
        warning: `Lớp học "${lookup.className}" (${code}) hiện đang tạm khóa nhận học sinh mới.`,
      };
    }

    const enrollmentId = `${lookup.classId}_${studentUid}`;
    const nowIso = new Date().toISOString();
    const enrollmentPayload: ClassEnrollment & { serverJoinedAt: unknown } = {
      id: enrollmentId,
      classId: lookup.classId,
      classCode: lookup.classCode,
      className: lookup.className,
      teacherId: lookup.teacherId,
      teacherName: lookup.teacherName,
      studentId: studentUid,
      studentName: studentName.slice(0, 150),
      studentEmail: studentEmail.slice(0, 200),
      studentClassName: lookup.className.slice(0, 80),
      joinedAt: nowIso,
      serverJoinedAt: serverTimestamp(),
    };

    await setDoc(doc(db, 'classEnrollments', enrollmentId), stripUndefinedDeep(enrollmentPayload));
    return { joined: true, className: lookup.className };
  } catch (err) {
    console.warn('[HQTest Auth] Could not enroll in class code during signup:', err);
    return {
      joined: false,
      warning: `Tài khoản đã được tạo thành công nhưng chưa thể tự động vào lớp "${code}". Bạn có thể vào lớp trong mục Học sinh.`,
    };
  }
}

export async function createOrSyncUserProfileDoc(
  fbUser: FirebaseUser,
  draft: Omit<PendingProfileDraft, 'uid' | 'email'>
): Promise<{ user: User; warningMessage?: string }> {
  const nowIso = new Date().toISOString();
  const safeRole: 'teacher' | 'student' = draft.role === 'teacher' ? 'teacher' : 'student';
  const initialStatus: AccountStatus = safeRole === 'teacher' ? 'pending' : 'active';
  const email = (fbUser.email || '').trim().toLowerCase();

  let resolvedClassName = (draft.className || '').trim();
  let warningMessage: string | undefined;

  const userPayload = stripUndefinedDeep({
    uid: fbUser.uid,
    email,
    name: draft.name.trim().slice(0, 150) || email.split('@')[0] || 'Người dùng HQTest',
    role: safeRole,
    status: initialStatus,
    ...(draft.phone?.trim() ? { phone: draft.phone.trim().slice(0, 32) } : {}),
    ...(draft.school?.trim() ? { school: draft.school.trim().slice(0, 200) } : {}),
    ...(resolvedClassName ? { className: resolvedClassName.slice(0, 80) } : {}),
    createdAt: nowIso,
    updatedAt: nowIso,
    serverCreatedAt: serverTimestamp(),
    serverUpdatedAt: serverTimestamp(),
  });

  await setDoc(doc(db, 'users', fbUser.uid), userPayload);

  if (safeRole === 'student' && draft.classCode?.trim()) {
    const enrollRes = await enrollStudentByClassCodeInternal(
      fbUser.uid,
      userPayload.name,
      email,
      draft.classCode.trim()
    );
    if (enrollRes.joined && enrollRes.className) {
      resolvedClassName = enrollRes.className;
      await updateDoc(doc(db, 'users', fbUser.uid), {
        className: resolvedClassName.slice(0, 80),
        updatedAt: new Date().toISOString(),
        serverUpdatedAt: serverTimestamp(),
      }).catch(() => {});
    } else if (enrollRes.warning) {
      warningMessage = enrollRes.warning;
    }
  }

  clearPendingDraft();

  return {
    user: {
      id: fbUser.uid,
      uid: fbUser.uid,
      name: userPayload.name,
      email,
      role: safeRole,
      status: initialStatus,
      phone: userPayload.phone,
      school: userPayload.school,
      className: resolvedClassName || userPayload.className,
      createdAt: nowIso,
      updatedAt: nowIso,
    },
    warningMessage,
  };
}

function toIsoString(val: unknown): string | undefined {
  if (!val) return undefined;
  if (typeof val === 'string') return val.trim() || undefined;
  if (val instanceof Date) return isNaN(val.getTime()) ? undefined : val.toISOString();
  if (typeof val === 'object') {
    const maybeTs = val as { toDate?: () => Date; seconds?: number };
    if (typeof maybeTs.toDate === 'function') {
      const d = maybeTs.toDate();
      return isNaN(d.getTime()) ? undefined : d.toISOString();
    }
    if (typeof maybeTs.seconds === 'number') {
      const d = new Date(maybeTs.seconds * 1000);
      return isNaN(d.getTime()) ? undefined : d.toISOString();
    }
  }
  return undefined;
}

function parseUserDoc(
  uid: string,
  fbUser: FirebaseUser,
  raw: Record<string, unknown>,
  hasTrustedAdminAuthority: boolean
): User {
  const role: UserRole = hasTrustedAdminAuthority
    ? 'admin'
    : ((raw.role as UserRole) || 'student');
  const status: AccountStatus = hasTrustedAdminAuthority
    ? 'active'
    : ((raw.status as AccountStatus) || (role === 'teacher' ? 'pending' : 'active'));

  const cleanEmail = String(raw.email || fbUser.email || '').trim().toLowerCase();
  const cleanName =
    String(raw.name || fbUser.displayName || '').trim() ||
    cleanEmail.split('@')[0] ||
    'Người dùng HQTest';

  return {
    id: uid,
    uid,
    email: cleanEmail,
    name: cleanName,
    role,
    status,
    phone: typeof raw.phone === 'string' ? raw.phone : undefined,
    school: typeof raw.school === 'string' ? raw.school : undefined,
    className: typeof raw.className === 'string' ? raw.className : undefined,
    approvedBy: typeof raw.approvedBy === 'string' ? raw.approvedBy : undefined,
    approvedAt: toIsoString(raw.approvedAt),
    createdAt: toIsoString(raw.createdAt) || new Date().toISOString(),
    updatedAt: toIsoString(raw.updatedAt),
  };
}

async function readTrustedAdminStatus(fbUser: FirebaseUser): Promise<{
  adminDocExists: boolean;
  adminDocActive: boolean;
  adminDocError?: string;
  adminDocDiagnostic?: ProfileDiagnosticError;
  hasAdminClaim: boolean;
}> {
  let hasAdminClaim = false;
  try {
    const tokenRes = await fbUser.getIdTokenResult();
    hasAdminClaim =
      tokenRes.claims?.admin === true ||
      tokenRes.claims?.role === 'admin';
  } catch {
    hasAdminClaim = false;
  }

  let adminDocExists = false;
  let adminDocActive = false;
  let adminDocError: string | undefined;
  let adminDocDiagnostic: ProfileDiagnosticError | undefined;

  const adminPath = `admins/${fbUser.uid}`;
  try {
    const adminRef = doc(db, 'admins', fbUser.uid);
    const adminSnap = await getDocFromServer(adminRef).catch((serverErr) => {
      const code = ((serverErr as { code?: string })?.code || '').toLowerCase();
      if (code.includes('unavailable')) {
        return getDoc(adminRef);
      }
      throw serverErr;
    });
    adminDocExists = adminSnap.exists();
    if (adminSnap.exists()) {
      const data = adminSnap.data() as Record<string, unknown>;
      const isRoleOk = !('role' in data) || data.role === 'admin';
      const isActiveOk = !('active' in data) || data.active === true;
      adminDocActive = isRoleOk && isActiveOk;
    }
  } catch (err) {
    adminDocDiagnostic = classifyFirestoreOperationError(err, 'GET', adminPath, fbUser.uid);
    adminDocError = adminDocDiagnostic.userMessage;
  }

  return { adminDocExists, adminDocActive, adminDocError, adminDocDiagnostic, hasAdminClaim };
}

export async function inspectAccountSyncStatus(
  fbUser: FirebaseUser,
  forceTokenRefresh = false
): Promise<AccountSyncDiagnostic> {
  if (forceTokenRefresh) {
    await fbUser.reload().catch(() => {});
    await fbUser.getIdToken(true).catch(() => {});
  }

  const projectInfo = getFirebaseProjectInfo();
  const userPath = `users/${fbUser.uid}`;

  let userSnapExists = false;
  let raw: Record<string, unknown> | null = null;
  let userDocError: ProfileDiagnosticError | undefined;

  try {
    const userRef = doc(db, 'users', fbUser.uid);
    const userSnap = await getDocFromServer(userRef).catch((serverErr) => {
      const code = ((serverErr as { code?: string })?.code || '').toLowerCase();
      if (code.includes('unavailable')) {
        return getDoc(userRef);
      }
      throw serverErr;
    });
    userSnapExists = userSnap.exists();
    raw = userSnap.exists() ? (userSnap.data() as Record<string, unknown>) : null;
  } catch (err) {
    userDocError = classifyFirestoreOperationError(err, 'GET', userPath, fbUser.uid);
  }

  const adminInfo = await readTrustedAdminStatus(fbUser);

  const requiredFields = [
    'uid',
    'email',
    'role',
    'status',
    'createdAt',
    'updatedAt',
  ];
  const userDocMissingFields = raw
    ? requiredFields.filter((field) => raw![field] === undefined || raw![field] === null || raw![field] === '')
    : requiredFields;

  const existingRole = typeof raw?.role === 'string' ? (raw.role as UserRole) : undefined;
  const existingStatus = typeof raw?.status === 'string' ? (raw.status as AccountStatus) : undefined;
  const existingName = typeof raw?.name === 'string' ? raw.name : undefined;

  const hasTrustedAdminAuthority =
    adminInfo.adminDocActive ||
    adminInfo.hasAdminClaim ||
    (existingRole === 'admin' && existingStatus === 'active');

  return {
    uid: fbUser.uid,
    email: (fbUser.email || '').trim().toLowerCase(),
    emailVerified: Boolean(fbUser.emailVerified),
    displayName: (fbUser.displayName || '').trim(),
    projectId: projectInfo.projectId,
    databaseId: projectInfo.databaseId,
    projectMismatchSuspected: projectInfo.projectMismatchSuspected,
    userDocExists: userSnapExists,
    userDocMissingFields,
    userDocError,
    adminDocExists: adminInfo.adminDocExists,
    adminDocActive: adminInfo.adminDocActive,
    adminDocError: adminInfo.adminDocError,
    adminDocDiagnostic: adminInfo.adminDocDiagnostic,
    hasAdminClaim: adminInfo.hasAdminClaim,
    hasTrustedAdminAuthority,
    existingRole,
    existingStatus,
    existingName,
  };
}

export async function fetchUserProfileFromFirestore(
  fbUser: FirebaseUser,
  forceServer = false
): Promise<User | null> {
  if (firebaseInitError || !fbUser?.uid) return null;

  const userPath = `users/${fbUser.uid}`;
  const userRef = doc(db, 'users', fbUser.uid);

  let userSnap;
  try {
    userSnap = forceServer ? await getDocFromServer(userRef) : await getDoc(userRef);
  } catch (err) {
    const diag = classifyFirestoreOperationError(err, 'GET', userPath, fbUser.uid);
    throw new ProfileAccessError(diag);
  }

  const adminInfo = await readTrustedAdminStatus(fbUser);

  if (!userSnap.exists()) {
    return null;
  }

  const raw = userSnap.data() as Record<string, unknown>;
  const hasTrustedAdminAuthority = adminInfo.adminDocActive || adminInfo.hasAdminClaim;

  // Require core identity/RBAC fields (supports Console Timestamp createdAt & optional name)
  const hasRequiredCore =
    typeof raw.uid === 'string' &&
    raw.uid.trim().length > 0 &&
    typeof raw.email === 'string' &&
    raw.email.trim().length > 0 &&
    typeof raw.role === 'string' &&
    typeof raw.status === 'string';

  if (!hasRequiredCore) {
    return null;
  }

  // If user holds trusted server admin authority but their users/{uid} still says student/teacher,
  // route to profile sync so users/{uid} is properly reconciled to admin/active on Firestore.
  if (hasTrustedAdminAuthority && (raw.role !== 'admin' || raw.status !== 'active')) {
    return null;
  }

  return parseUserDoc(fbUser.uid, fbUser, raw, hasTrustedAdminAuthority);
}

export async function syncUserProfileByUid(
  fbUser: FirebaseUser,
  options: SyncProfileByUidOptions
): Promise<AuthActionResult> {
  if (firebaseInitError || !fbUser?.uid) {
    return { success: false, errorMessage: 'Firebase chưa được khởi tạo hoặc chưa có phiên đăng nhập.' };
  }

  const uid = (auth.currentUser || fbUser).uid;
  const userPath = `users/${uid}`;
  let currentOp: 'GET' | 'CREATE' | 'UPDATE' = 'GET';

  try {
    // 1. Refresh Auth user and force-refresh ID token so claims & email_verified reflect immediately
    await fbUser.reload().catch(() => {});
    await fbUser.getIdToken(true).catch(() => {});

    const currentFbUser = auth.currentUser || fbUser;
    const cleanEmail = (currentFbUser.email || '').trim().toLowerCase();
    if (!currentFbUser.uid || !cleanEmail) {
      return { success: false, errorMessage: 'Không xác định được UID hoặc Email từ Firebase Auth.' };
    }

    const userRef = doc(db, 'users', currentFbUser.uid);

    // 2. Inspect live Firestore documents & claims from server
    currentOp = 'GET';
    const [existingSnap, adminInfo] = await Promise.all([
      getDocFromServer(userRef),
      readTrustedAdminStatus(currentFbUser),
    ]);

    const existingRaw = existingSnap.exists() ? (existingSnap.data() as Record<string, unknown>) : null;
    const existingIsActiveAdmin =
      existingRaw?.role === 'admin' && existingRaw?.status === 'active';
    const hasTrustedAdminAuthority =
      adminInfo.adminDocActive || adminInfo.hasAdminClaim || existingIsActiveAdmin;

    const nowIso = new Date().toISOString();
    let warningMessage: string | undefined;

    if (existingSnap.exists() && existingRaw) {
      // 3A. Preserve all existing valid fields; only update missing/required fields via updateDoc (never overwrite whole doc)
      if (options.intendedRole === 'admin' && !hasTrustedAdminAuthority) {
        return {
          success: false,
          errorMessage:
            `Tài khoản ${cleanEmail} (UID: ${currentFbUser.uid}) chưa được xác nhận quyền Admin hợp lệ trên máy chủ (chưa có document admins/${currentFbUser.uid} hoặc Admin Custom Claim).`,
        };
      }

      const existingName = typeof existingRaw.name === 'string' ? existingRaw.name.trim() : '';
      const candidateName = existingName || options.name?.trim() || currentFbUser.displayName?.trim() || '';
      if (candidateName.length < 2) {
        return {
          success: false,
          errorMessage: 'Hồ sơ hiện tại còn thiếu Họ và tên. Vui lòng nhập Họ và tên (ít nhất 2 ký tự) để hoàn tất đồng bộ.',
        };
      }

      const patchPayload: Record<string, unknown> = {
        updatedAt: nowIso,
        serverUpdatedAt: serverTimestamp(),
      };

      if (!existingRaw.uid) patchPayload.uid = currentFbUser.uid;
      if (!existingRaw.email) patchPayload.email = cleanEmail;
      if (!existingName) patchPayload.name = candidateName.slice(0, 150);
      if (!existingRaw.createdAt) patchPayload.createdAt = nowIso;
      if (!existingRaw.serverCreatedAt) patchPayload.serverCreatedAt = serverTimestamp();

      if (hasTrustedAdminAuthority) {
        if (existingRaw.role !== 'admin') patchPayload.role = 'admin';
        if (existingRaw.status !== 'active') patchPayload.status = 'active';
      }

      if (!existingRaw.school && options.school?.trim()) {
        patchPayload.school = options.school.trim().slice(0, 200);
      }
      if (!existingRaw.phone && options.phone?.trim()) {
        patchPayload.phone = options.phone.trim().slice(0, 32);
      }
      if (!existingRaw.className && options.className?.trim()) {
        patchPayload.className = options.className.trim().slice(0, 80);
      }

      currentOp = 'UPDATE';
      await updateDoc(userRef, stripUndefinedDeep(patchPayload));
    } else {
      // 3B. Document users/{uid} does not exist yet
      if (options.intendedRole === 'admin' || hasTrustedAdminAuthority) {
        // Security: NEVER create an admin profile from client without trusted server marker/claim!
        if (!hasTrustedAdminAuthority) {
          return {
            success: false,
            errorMessage:
              `Không thể tự cấp quyền Admin từ trình duyệt: Tài khoản ${cleanEmail} (UID: ${currentFbUser.uid}) chưa có document admins/${currentFbUser.uid} hoặc Admin Custom Claim trên Firebase. Vui lòng thiết lập admins/${currentFbUser.uid} trên Firebase Console hoặc chạy script Admin SDK rồi bấm "Đồng bộ hồ sơ" lại.`,
          };
        }

        const confirmedName = options.name?.trim() || currentFbUser.displayName?.trim() || '';
        if (confirmedName.length < 2) {
          return {
            success: false,
            errorMessage:
              'Vui lòng nhập Họ và tên xác nhận (ít nhất 2 ký tự) trước khi đồng bộ hồ sơ Admin.',
          };
        }

        const adminProfilePayload = stripUndefinedDeep({
          uid: currentFbUser.uid,
          email: cleanEmail,
          name: confirmedName.slice(0, 150),
          role: 'admin' as const,
          status: 'active' as const,
          ...(options.phone?.trim() ? { phone: options.phone.trim().slice(0, 32) } : {}),
          ...(options.school?.trim() ? { school: options.school.trim().slice(0, 200) } : {}),
          createdAt: nowIso,
          updatedAt: nowIso,
          serverCreatedAt: serverTimestamp(),
          serverUpdatedAt: serverTimestamp(),
        });

        currentOp = 'CREATE';
        await setDoc(userRef, adminProfilePayload);
      } else {
        const cleanName = options.name?.trim() || currentFbUser.displayName?.trim() || '';
        if (cleanName.length < 2) {
          return {
            success: false,
            errorMessage: 'Vui lòng nhập đầy đủ Họ và tên (ít nhất 2 ký tự) trước khi đồng bộ hồ sơ.',
          };
        }

        currentOp = 'CREATE';
        const created = await createOrSyncUserProfileDoc(currentFbUser, {
          name: cleanName,
          role: options.intendedRole === 'teacher' ? 'teacher' : 'student',
          phone: options.phone?.trim(),
          school: options.school?.trim(),
          className: options.className?.trim(),
          classCode: options.classCode?.trim(),
        });
        warningMessage = created.warningMessage;
      }
    }

    // 4. Mandatory verification: read back directly from Firestore server
    currentOp = 'GET';
    const verifySnap = await getDocFromServer(userRef);
    if (!verifySnap.exists()) {
      return {
        success: false,
        errorMessage: `Đã gửi lệnh ghi nhưng không đọc lại được document ${userPath} từ máy chủ Firestore.`,
      };
    }

    const verifiedRaw = verifySnap.data() as Record<string, unknown>;
    const verifiedUser = parseUserDoc(currentFbUser.uid, currentFbUser, verifiedRaw, hasTrustedAdminAuthority);

    if (options.intendedRole === 'admin' && (verifiedUser.role !== 'admin' || verifiedUser.status !== 'active')) {
      return {
        success: false,
        errorMessage: 'Đồng bộ không đạt quyền Admin hợp lệ trên Firestore.',
      };
    }

    clearPendingDraft();

    return {
      success: true,
      user: verifiedUser,
      verifiedFromServer: true,
      warningMessage,
    };
  } catch (err) {
    const diag = classifyFirestoreOperationError(err, currentOp, userPath, uid);
    try {
      handleFirestoreError(err, OperationType.WRITE, userPath);
    } catch {
      // handled cleanly via diag below
    }
    return {
      success: false,
      errorMessage: diag.userMessage,
      errorDiagnostic: diag,
    };
  }
}

export async function loginWithEmailPassword(
  email: string,
  password: string
): Promise<AuthActionResult> {
  if (firebaseInitError) {
    return {
      success: false,
      errorMessage: `Firebase chưa được khởi tạo sẵn sàng (${firebaseInitError}). Vui lòng tải lại trang.`,
    };
  }

  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail || !isValidEmailFormat(cleanEmail)) {
    return { success: false, errorMessage: 'Vui lòng nhập địa chỉ email hợp lệ.' };
  }
  if (!password || password.length < 1) {
    return { success: false, errorMessage: 'Vui lòng nhập mật khẩu.' };
  }

  try {
    const cred = await signInWithEmailAndPassword(auth, cleanEmail, password);
    const profile = await fetchUserProfileFromFirestore(cred.user);

    if (!profile) {
      return {
        success: false,
        profileSyncFailed: true,
        errorMessage:
          'Tài khoản đã xác thực nhưng chưa có hồ sơ người dùng trên Firestore. Vui lòng hoàn tất thông tin hồ sơ để tiếp tục.',
      };
    }

    return { success: true, user: profile };
  } catch (err) {
    if (err instanceof ProfileAccessError) {
      return {
        success: false,
        errorMessage: err.diagnostic.userMessage,
        errorDiagnostic: err.diagnostic,
      };
    }
    return { success: false, errorMessage: mapFirebaseAuthError(err) };
  }
}

export async function registerTeacherAccount(
  input: RegisterTeacherInput
): Promise<AuthActionResult> {
  if (firebaseInitError) {
    return {
      success: false,
      errorMessage: `Firebase chưa sẵn sàng (${firebaseInitError}).`,
    };
  }

  const cleanName = input.name.trim();
  const cleanEmail = input.email.trim().toLowerCase();
  if (cleanName.length < 2) {
    return { success: false, errorMessage: 'Vui lòng nhập đầy đủ Họ và tên (ít nhất 2 ký tự).' };
  }
  if (!isValidEmailFormat(cleanEmail)) {
    return { success: false, errorMessage: 'Địa chỉ email không hợp lệ.' };
  }
  if (input.password.length < 8) {
    return { success: false, errorMessage: 'Mật khẩu phải có ít nhất 8 ký tự.' };
  }
  if (input.password !== input.confirmPassword) {
    return { success: false, errorMessage: 'Mật khẩu xác nhận không khớp.' };
  }

  let createdFbUser: FirebaseUser | null = null;
  try {
    const cred = await createUserWithEmailAndPassword(auth, cleanEmail, input.password);
    createdFbUser = cred.user;
    await updateProfile(cred.user, { displayName: cleanName }).catch(() => {});

    savePendingDraft({
      uid: cred.user.uid,
      email: cleanEmail,
      name: cleanName,
      role: 'teacher',
      phone: input.phone?.trim(),
      school: input.school?.trim(),
    });

    const synced = await createOrSyncUserProfileDoc(cred.user, {
      name: cleanName,
      role: 'teacher',
      phone: input.phone?.trim(),
      school: input.school?.trim(),
    });

    return { success: true, user: synced.user };
  } catch (err) {
    if (createdFbUser) {
      return {
        success: false,
        profileSyncFailed: true,
        errorMessage: `Tài khoản Auth đã được tạo nhưng chưa lưu được hồ sơ giáo viên lên Firestore (${mapFirebaseAuthError(err)}). Nhấn "Thử đồng bộ lại hồ sơ" để hoàn tất mà không cần tạo lại tài khoản.`,
      };
    }
    return { success: false, errorMessage: mapFirebaseAuthError(err) };
  }
}

export async function registerStudentAccount(
  input: RegisterStudentInput
): Promise<AuthActionResult> {
  if (firebaseInitError) {
    return {
      success: false,
      errorMessage: `Firebase chưa sẵn sàng (${firebaseInitError}).`,
    };
  }

  const cleanName = input.name.trim();
  const cleanEmail = input.email.trim().toLowerCase();
  if (cleanName.length < 2) {
    return { success: false, errorMessage: 'Vui lòng nhập đầy đủ Họ và tên (ít nhất 2 ký tự).' };
  }
  if (!isValidEmailFormat(cleanEmail)) {
    return { success: false, errorMessage: 'Địa chỉ email không hợp lệ.' };
  }
  if (input.password.length < 8) {
    return { success: false, errorMessage: 'Mật khẩu phải có ít nhất 8 ký tự.' };
  }
  if (input.password !== input.confirmPassword) {
    return { success: false, errorMessage: 'Mật khẩu xác nhận không khớp.' };
  }

  let createdFbUser: FirebaseUser | null = null;
  try {
    const cred = await createUserWithEmailAndPassword(auth, cleanEmail, input.password);
    createdFbUser = cred.user;
    await updateProfile(cred.user, { displayName: cleanName }).catch(() => {});

    savePendingDraft({
      uid: cred.user.uid,
      email: cleanEmail,
      name: cleanName,
      role: 'student',
      className: input.className?.trim(),
      classCode: input.classCode?.trim(),
    });

    const synced = await createOrSyncUserProfileDoc(cred.user, {
      name: cleanName,
      role: 'student',
      className: input.className?.trim(),
      classCode: input.classCode?.trim(),
    });

    return {
      success: true,
      user: synced.user,
      warningMessage: synced.warningMessage,
    };
  } catch (err) {
    if (createdFbUser) {
      return {
        success: false,
        profileSyncFailed: true,
        errorMessage: `Tài khoản Auth đã tạo nhưng lỗi khi lưu hồ sơ học sinh lên Firestore (${mapFirebaseAuthError(err)}). Vui lòng nhấn "Thử đồng bộ lại hồ sơ".`,
      };
    }
    return { success: false, errorMessage: mapFirebaseAuthError(err) };
  }
}

export async function requestPasswordReset(email: string): Promise<AuthActionResult> {
  if (firebaseInitError) {
    return { success: false, errorMessage: `Firebase chưa sẵn sàng (${firebaseInitError}).` };
  }
  const cleanEmail = email.trim().toLowerCase();
  if (!isValidEmailFormat(cleanEmail)) {
    return { success: false, errorMessage: 'Vui lòng nhập địa chỉ email hợp lệ để nhận liên kết đặt lại mật khẩu.' };
  }
  try {
    await sendPasswordResetEmail(auth, cleanEmail);
    return { success: true };
  } catch (err) {
    return { success: false, errorMessage: mapFirebaseAuthError(err) };
  }
}

export async function changeCurrentUserPassword(
  currentPassword: string,
  newPassword: string,
  confirmNewPassword: string
): Promise<AuthActionResult> {
  if (firebaseInitError || !auth.currentUser || !auth.currentUser.email) {
    return { success: false, errorMessage: 'Bạn chưa đăng nhập hoặc phiên đăng nhập không hợp lệ.' };
  }
  if (!currentPassword) {
    return { success: false, errorMessage: 'Vui lòng nhập mật khẩu hiện tại.' };
  }
  if (newPassword.length < 8) {
    return { success: false, errorMessage: 'Mật khẩu mới phải có ít nhất 8 ký tự.' };
  }
  if (newPassword !== confirmNewPassword) {
    return { success: false, errorMessage: 'Mật khẩu mới và xác nhận mật khẩu không khớp.' };
  }

  try {
    const credential = EmailAuthProvider.credential(auth.currentUser.email, currentPassword);
    await reauthenticateWithCredential(auth.currentUser, credential);
    await updatePassword(auth.currentUser, newPassword);
    return { success: true };
  } catch (err) {
    return { success: false, errorMessage: mapFirebaseAuthError(err) };
  }
}

export async function updateOwnUserProfile(
  uid: string,
  updates: { name: string; phone?: string; school?: string; className?: string }
): Promise<AuthActionResult> {
  if (firebaseInitError || !auth.currentUser || auth.currentUser.uid !== uid) {
    return { success: false, errorMessage: 'Không thể xác thực người dùng để cập nhật hồ sơ.' };
  }

  const cleanName = updates.name.trim();
  if (cleanName.length < 2) {
    return { success: false, errorMessage: 'Họ và tên phải có ít nhất 2 ký tự.' };
  }

  const nowIso = new Date().toISOString();
  try {
    const payload = stripUndefinedDeep({
      name: cleanName.slice(0, 150),
      ...(updates.phone !== undefined ? { phone: updates.phone.trim().slice(0, 32) } : {}),
      ...(updates.school !== undefined ? { school: updates.school.trim().slice(0, 200) } : {}),
      ...(updates.className !== undefined ? { className: updates.className.trim().slice(0, 80) } : {}),
      updatedAt: nowIso,
      serverUpdatedAt: serverTimestamp(),
    });

    await updateDoc(doc(db, 'users', uid), payload);
    await updateProfile(auth.currentUser, { displayName: cleanName }).catch(() => {});
    const refreshed = await fetchUserProfileFromFirestore(auth.currentUser);
    return { success: true, user: refreshed || undefined };
  } catch (err) {
    return { success: false, errorMessage: mapFirebaseAuthError(err) };
  }
}

export async function sendVerificationEmailToCurrentUser(): Promise<AuthActionResult> {
  if (firebaseInitError || !auth?.currentUser) {
    return { success: false, errorMessage: 'Chưa có tài khoản Firebase Auth đang đăng nhập.' };
  }
  if (auth.currentUser.emailVerified) {
    return {
      success: true,
      warningMessage: 'Email của tài khoản này đã được xác minh trước đó.',
    };
  }
  try {
    await sendEmailVerification(auth.currentUser);
    return { success: true };
  } catch (err) {
    return { success: false, errorMessage: mapFirebaseAuthError(err) };
  }
}

export async function reloadAndRefreshCurrentUser(): Promise<{
  success: boolean;
  emailVerified: boolean;
  uid?: string;
  email?: string;
  errorMessage?: string;
}> {
  if (firebaseInitError || !auth?.currentUser) {
    return {
      success: false,
      emailVerified: false,
      errorMessage: 'Không tìm thấy phiên đăng nhập Firebase hiện tại.',
    };
  }
  try {
    await auth.currentUser.reload();
    await auth.currentUser.getIdToken(true);
    const refreshed = auth.currentUser;
    return {
      success: true,
      emailVerified: Boolean(refreshed.emailVerified),
      uid: refreshed.uid,
      email: refreshed.email || '',
    };
  } catch (err) {
    return {
      success: false,
      emailVerified: Boolean(auth.currentUser?.emailVerified),
      uid: auth.currentUser?.uid,
      email: auth.currentUser?.email || '',
      errorMessage: mapFirebaseAuthError(err),
    };
  }
}

export async function logoutAccount(): Promise<void> {
  clearPendingDraft();
  if (firebaseInitError) return;
  await signOut(auth);
}

/**
 * Helper to batch-sync local draft onboarding if needed
 */
export async function joinClassByCode(
  user: User,
  rawClassCode: string
): Promise<{ success: boolean; enrollment?: ClassEnrollment; errorMessage?: string }> {
  if (firebaseInitError || !auth.currentUser) {
    return { success: false, errorMessage: 'Vui lòng đăng nhập để tham gia lớp học.' };
  }
  const code = normalizeExamCode(rawClassCode);
  if (!code || !/^[A-Z0-9-]+$/.test(code)) {
    return { success: false, errorMessage: 'Mã lớp không hợp lệ.' };
  }

  try {
    const joinSnap = await getDoc(doc(db, 'classJoinCodes', code));
    if (!joinSnap.exists()) {
      return { success: false, errorMessage: `Không tìm thấy lớp học với mã "${code}".` };
    }
    const lookup = joinSnap.data() as ClassJoinLookup;
    if (!lookup.isActive) {
      return { success: false, errorMessage: `Lớp học "${lookup.className}" hiện đang tạm khóa ghi danh.` };
    }

    const enrollmentId = `${lookup.classId}_${auth.currentUser.uid}`;
    const nowIso = new Date().toISOString();
    const enrollment: ClassEnrollment = {
      id: enrollmentId,
      classId: lookup.classId,
      classCode: lookup.classCode,
      className: lookup.className,
      teacherId: lookup.teacherId,
      teacherName: lookup.teacherName,
      studentId: auth.currentUser.uid,
      studentName: user.name,
      studentEmail: user.email,
      studentClassName: user.className || lookup.className,
      joinedAt: nowIso,
    };

    const batch = writeBatch(db);
    batch.set(doc(db, 'classEnrollments', enrollmentId), {
      ...stripUndefinedDeep(enrollment),
      serverJoinedAt: serverTimestamp(),
    });
    if (!user.className) {
      batch.update(doc(db, 'users', auth.currentUser.uid), {
        className: lookup.className.slice(0, 80),
        updatedAt: nowIso,
        serverUpdatedAt: serverTimestamp(),
      });
    }
    await batch.commit();

    return { success: true, enrollment };
  } catch (err) {
    return { success: false, errorMessage: mapFirebaseAuthError(err) };
  }
}
