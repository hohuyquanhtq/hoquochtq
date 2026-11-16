import type { ApiRequest, ApiResponse } from './examApiHandlers.ts';
import {
  classifyFirestoreError,
  formatFirebaseAdminErrorMessage,
  getFirebaseAdminState,
  logFirebaseAdminEvent,
  sanitizeSensitiveLogText,
} from './firebaseAdmin.ts';

export const ALLOWED_INITIAL_ADMIN_EMAIL = 'hohuyquanhtq@gmail.com';

function extractBearerToken(headers: ApiRequest['headers']): string | null {
  const rawAuth = headers.authorization ?? headers.Authorization;
  const headerValue = Array.isArray(rawAuth) ? rawAuth[0] : rawAuth;
  if (typeof headerValue !== 'string') return null;

  const match = headerValue.trim().match(/^Bearer\s+(.+)$/i);
  if (!match || !match[1]) return null;
  const token = match[1].trim();
  return token.length > 0 ? token : null;
}

function hasForbiddenPrivilegeParams(body: unknown): boolean {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return false;
  }
  const obj = body as Record<string, unknown>;
  return (
    'uid' in obj ||
    'targetUid' in obj ||
    'userId' in obj ||
    'role' in obj ||
    'admin' in obj ||
    'claims' in obj
  );
}

/**
 * POST /api/admin/set-claims
 *
 * Grants Firebase Custom Claims { admin: true, role: "admin" } ONLY when:
 * 1. Request method is POST.
 * 2. Request does not supply an arbitrary UID/role in body.
 * 3. Server has INITIAL_ADMIN_UID and FIREBASE_SERVICE_ACCOUNT configured.
 * 4. Authorization Bearer contains a valid Firebase ID Token verified by Admin SDK.
 * 5. Decoded UID === INITIAL_ADMIN_UID.
 * 6. Account email === hohuyquanhtq@gmail.com.
 * 7. Firestore document admins/{uid} exists with role == "admin" and isActive == true.
 */
export async function handleSetAdminClaims(req: ApiRequest): Promise<ApiResponse> {
  if ((req.method || '').toUpperCase() !== 'POST') {
    return {
      status: 405,
      body: {
        ok: false,
        code: 'METHOD_NOT_ALLOWED',
        error: 'Phương thức không hợp lệ. API chỉ hỗ trợ POST.',
      },
    };
  }

  if (hasForbiddenPrivilegeParams(req.body)) {
    return {
      status: 403,
      body: {
        ok: false,
        code: 'FORBIDDEN_ARBITRARY_UID',
        error:
          'Không cho phép gửi UID hoặc quyền tùy ý trong yêu cầu. Hệ thống chỉ xác thực trực tiếp qua Firebase ID Token.',
      },
    };
  }

  const initialAdminUid = (process.env.INITIAL_ADMIN_UID || '').trim();
  if (!initialAdminUid) {
    logFirebaseAdminEvent({
      api: 'POST /api/admin/set-claims',
      errorStage: 'env_check',
      errorType: 'ConfigError',
      errorCode: 'CONFIG_MISSING',
      message: 'INITIAL_ADMIN_UID environment variable is missing.',
    });
    return {
      status: 500,
      body: {
        ok: false,
        code: 'ADMIN_ENV_MISSING',
        error: 'Thiếu biến môi trường INITIAL_ADMIN_UID trên máy chủ Vercel.',
      },
    };
  }

  const adminState = getFirebaseAdminState(true);
  if (!adminState.initialized || !adminState.auth || !adminState.db) {
    const code = adminState.errorCode || 'ADMIN_INIT_ERROR';
    const message =
      code === 'CONFIG_MISSING'
        ? 'Thiếu biến môi trường FIREBASE_SERVICE_ACCOUNT trên máy chủ Vercel.'
        : formatFirebaseAdminErrorMessage(code, adminState.errorDetail);

    logFirebaseAdminEvent({
      api: 'POST /api/admin/set-claims',
      errorStage: 'admin_sdk_init',
      errorType: 'ConfigError',
      errorCode: code,
      message,
    });

    return {
      status: 500,
      body: {
        ok: false,
        code,
        error: message,
      },
    };
  }

  const idToken = extractBearerToken(req.headers);
  if (!idToken) {
    return {
      status: 401,
      body: {
        ok: false,
        code: 'MISSING_AUTH_TOKEN',
        error: 'Thiếu Firebase ID Token trong header Authorization Bearer.',
      },
    };
  }

  let decodedUid = '';
  let decodedEmail = '';
  try {
    const decoded = await adminState.auth.verifyIdToken(idToken);
    decodedUid = (decoded.uid || '').trim();
    decodedEmail = (decoded.email || '').trim().toLowerCase();
  } catch (err) {
    logFirebaseAdminEvent({
      api: 'POST /api/admin/set-claims',
      errorStage: 'verify_id_token',
      errorType: err instanceof Error ? err.name : 'AuthError',
      errorCode: 'AUTH_ERROR',
      message: err instanceof Error ? err.message : 'ID Token verification failed',
    });
    return {
      status: 401,
      body: {
        ok: false,
        code: 'INVALID_AUTH_TOKEN',
        error: 'Firebase ID Token không hợp lệ hoặc đã hết hạn. Vui lòng đăng nhập lại.',
      },
    };
  }

  if (!decodedUid || decodedUid !== initialAdminUid) {
    return {
      status: 403,
      body: {
        ok: false,
        code: 'UID_NOT_AUTHORIZED',
        error: 'UID tài khoản không khớp INITIAL_ADMIN_UID. Không được phép cấp quyền Admin.',
      },
    };
  }

  let authUserRecord;
  try {
    authUserRecord = await adminState.auth.getUser(decodedUid);
  } catch (err) {
    logFirebaseAdminEvent({
      api: 'POST /api/admin/set-claims',
      errorStage: 'get_auth_user',
      errorType: err instanceof Error ? err.name : 'AuthError',
      errorCode: 'AUTH_ERROR',
      message: err instanceof Error ? err.message : 'Cannot lookup Firebase Auth user',
    });
    return {
      status: 403,
      body: {
        ok: false,
        code: 'AUTH_USER_NOT_FOUND',
        error: 'Không xác minh được tài khoản trên Firebase Authentication.',
      },
    };
  }

  const recordEmail = (authUserRecord.email || '').trim().toLowerCase();
  if (
    decodedEmail !== ALLOWED_INITIAL_ADMIN_EMAIL ||
    recordEmail !== ALLOWED_INITIAL_ADMIN_EMAIL
  ) {
    return {
      status: 403,
      body: {
        ok: false,
        code: 'EMAIL_NOT_AUTHORIZED',
        error: `Email tài khoản không hợp lệ. Chỉ cho phép ${ALLOWED_INITIAL_ADMIN_EMAIL}.`,
      },
    };
  }

  let adminDocSnap;
  try {
    adminDocSnap = await adminState.db.collection('admins').doc(decodedUid).get();
  } catch (err) {
    const dbErrCode = classifyFirestoreError(err);
    logFirebaseAdminEvent({
      api: 'POST /api/admin/set-claims',
      errorStage: 'read_admin_doc',
      errorType: err instanceof Error ? err.name : 'FirestoreError',
      errorCode: dbErrCode,
      message: err instanceof Error ? err.message : 'Failed reading admins/{uid}',
      firestoreStatus: dbErrCode === 'DATABASE_PERMISSION_ERROR' ? 'permission_denied' : 'read_failed',
    });
    return {
      status: 500,
      body: {
        ok: false,
        code: dbErrCode,
        error: 'Không thể kiểm tra document admins/{uid} trên Cloud Firestore.',
      },
    };
  }

  if (!adminDocSnap.exists) {
    return {
      status: 403,
      body: {
        ok: false,
        code: 'ADMIN_DOC_NOT_FOUND',
        error: `Không tìm thấy document admins/${decodedUid} trên Cloud Firestore.`,
      },
    };
  }

  const adminData = (adminDocSnap.data() || {}) as Record<string, unknown>;
  const docEmail =
    typeof adminData.email === 'string' ? adminData.email.trim().toLowerCase() : '';
  if (docEmail && docEmail !== ALLOWED_INITIAL_ADMIN_EMAIL) {
    return {
      status: 403,
      body: {
        ok: false,
        code: 'ADMIN_DOC_EMAIL_MISMATCH',
        error: 'Email trong document admins/{uid} không khớp quản trị viên hợp lệ.',
      },
    };
  }

  if (adminData.role !== 'admin') {
    return {
      status: 403,
      body: {
        ok: false,
        code: 'ADMIN_ROLE_INVALID',
        error: 'Quyền không hợp lệ: trường role trong admins/{uid} không phải "admin".',
      },
    };
  }

  if (adminData.isActive !== true) {
    return {
      status: 403,
      body: {
        ok: false,
        code: 'ADMIN_INACTIVE',
        error: 'Tài khoản quản trị chưa được kích hoạt (isActive != true) trong admins/{uid}.',
      },
    };
  }

  const nextClaims = {
    ...(authUserRecord.customClaims || {}),
    admin: true,
    role: 'admin',
  };

  try {
    await adminState.auth.setCustomUserClaims(decodedUid, nextClaims);
  } catch (err) {
    const safeMsg = sanitizeSensitiveLogText(
      err instanceof Error ? err.message : 'Failed setting custom claims'
    );
    logFirebaseAdminEvent({
      api: 'POST /api/admin/set-claims',
      errorStage: 'set_custom_claims',
      errorType: err instanceof Error ? err.name : 'AuthError',
      errorCode: 'AUTH_ERROR',
      message: safeMsg,
    });
    return {
      status: 500,
      body: {
        ok: false,
        code: 'SET_CLAIMS_FAILED',
        error: 'Không thể thiết lập Custom Claims Admin trên Firebase Authentication.',
      },
    };
  }

  return {
    status: 200,
    body: {
      ok: true,
      success: true,
      uid: decodedUid,
      email: ALLOWED_INITIAL_ADMIN_EMAIL,
      claims: {
        admin: true,
        role: 'admin',
      },
      message: 'Đã thiết lập Firebase Custom Claims Admin thành công.',
    },
  };
}
