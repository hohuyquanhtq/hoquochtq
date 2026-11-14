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
  setDoc,
  updateDoc,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';
import { auth, db, firebaseInitError, stripUndefinedDeep } from './firebase';
import {
  User,
  UserRole,
  AccountStatus,
  ClassJoinLookup,
  ClassEnrollment,
} from '../types';
import { normalizeExamCode } from '../utils/urlHelper';

export const ADMIN_BOOTSTRAP_EMAIL = 'hohuyquanhtq@gmail.com';
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

export interface AuthActionResult {
  success: boolean;
  user?: User;
  warningMessage?: string;
  profileSyncFailed?: boolean;
  errorMessage?: string;
}

export function isValidEmailFormat(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export function mapFirebaseAuthError(error: unknown): string {
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
    return 'Không đủ quyền thực hiện thao tác dữ liệu trên Firestore. Vui lòng kiểm tra trạng thái tài khoản hoặc liên hệ Quản trị viên.';
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

export async function fetchUserProfileFromFirestore(fbUser: FirebaseUser): Promise<User | null> {
  if (firebaseInitError || !fbUser?.uid) return null;

  const userRef = doc(db, 'users', fbUser.uid);
  const adminRef = doc(db, 'admins', fbUser.uid);

  const [userSnap, adminSnap] = await Promise.all([
    getDoc(userRef),
    getDoc(adminRef).catch(() => null),
  ]);

  const hasAdminMarker = Boolean(adminSnap?.exists());
  const isVerifiedBootstrapEmail =
    (fbUser.email || '').trim().toLowerCase() === ADMIN_BOOTSTRAP_EMAIL && fbUser.emailVerified;

  if (userSnap.exists()) {
    const raw = userSnap.data() as Record<string, unknown>;
    const role: UserRole = hasAdminMarker
      ? 'admin'
      : ((raw.role as UserRole) || 'student');
    const status: AccountStatus = hasAdminMarker
      ? 'active'
      : ((raw.status as AccountStatus) || (role === 'teacher' ? 'pending' : 'active'));

    return {
      id: fbUser.uid,
      uid: fbUser.uid,
      email: String(raw.email || fbUser.email || ''),
      name: String(raw.name || fbUser.displayName || 'Người dùng HQTest'),
      role,
      status,
      phone: typeof raw.phone === 'string' ? raw.phone : undefined,
      school: typeof raw.school === 'string' ? raw.school : undefined,
      className: typeof raw.className === 'string' ? raw.className : undefined,
      approvedBy: typeof raw.approvedBy === 'string' ? raw.approvedBy : undefined,
      approvedAt: typeof raw.approvedAt === 'string' ? raw.approvedAt : undefined,
      createdAt: String(raw.createdAt || new Date().toISOString()),
      updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : undefined,
    };
  }

  // Auto-create admin profile doc ONLY if user holds trusted admin marker or verified bootstrap email
  if (hasAdminMarker || isVerifiedBootstrapEmail) {
    const nowIso = new Date().toISOString();
    const adminProfile = {
      uid: fbUser.uid,
      email: (fbUser.email || ADMIN_BOOTSTRAP_EMAIL).toLowerCase(),
      name: fbUser.displayName || 'Quản trị viên HQTest',
      role: 'admin' as const,
      status: 'active' as const,
      school: 'Trường THPT chuyên Nguyễn Bỉnh Khiêm, Tp. Đà Nẵng',
      createdAt: nowIso,
      updatedAt: nowIso,
      serverCreatedAt: serverTimestamp(),
      serverUpdatedAt: serverTimestamp(),
    };
    await setDoc(userRef, adminProfile);
    return {
      id: fbUser.uid,
      uid: fbUser.uid,
      email: adminProfile.email,
      name: adminProfile.name,
      role: 'admin',
      status: 'active',
      school: adminProfile.school,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
  }

  return null;
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

export async function sendVerificationForBootstrapAdmin(): Promise<AuthActionResult> {
  if (!auth.currentUser) {
    return { success: false, errorMessage: 'Chưa có người dùng đăng nhập.' };
  }
  try {
    await sendEmailVerification(auth.currentUser);
    return { success: true };
  } catch (err) {
    return { success: false, errorMessage: mapFirebaseAuthError(err) };
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
