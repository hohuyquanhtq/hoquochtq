import type { IncomingMessage, ServerResponse } from 'node:http';
import { createExamApiHandlers, type ApiRequest, type ApiResponse } from '../server/examApiHandlers.ts';
import { createPublicExamLinkHandlers } from '../server/publicExamLinkHandler.ts';
import { createCurriculumImportHandlers } from '../server/curriculumImportHandler.ts';
import { handleSetAdminClaims } from '../server/adminClaimsHandler.ts';
import {
  FIREBASE_PROJECT_ID,
  FIRESTORE_DATABASE_ID,
  checkFirebaseAdminHealth,
  getFirebaseEnvCheck,
  isAdminReady,
  sanitizeSensitiveLogText,
} from '../lib/firebase-admin.ts';
import { createVercelHandler } from '../server/vercelAdapter.ts';

type ServerlessReq = IncomingMessage & {
  body?: unknown;
  ip?: string;
  query?: Record<string, string | string[] | undefined>;
};

type ServerlessRes = ServerResponse & {
  status?: (code: number) => ServerlessRes;
  json?: (body: unknown) => void;
};

let cachedRouteTable: Record<string, (req: ApiRequest) => Promise<ApiResponse>> | null = null;

/**
 * Lazily instantiates API route handlers on the first non-health request.
 * Ensures zero eager initialization during Vercel serverless module evaluation.
 */
function getRouteTable(): Record<string, (req: ApiRequest) => Promise<ApiResponse>> {
  if (cachedRouteTable) {
    return cachedRouteTable;
  }

  const examHandlers = createExamApiHandlers();
  const publicLinkHandlers = createPublicExamLinkHandlers();
  const curriculumImportHandlers = createCurriculumImportHandlers();

  cachedRouteTable = {
    '/api/exams/allocate-public-code': publicLinkHandlers.handleAllocatePublicCode,
    '/api/exams/sync-link-status': publicLinkHandlers.handleSyncPublicExamLinkStatus,
    '/api/exams/security/configure': examHandlers.handleConfigureExamSecurity,
    '/api/exams/verify-password': examHandlers.handleVerifyExamPassword,
    '/api/exams/access-questions': examHandlers.handleAccessExamQuestions,
    '/api/exams/submit-and-grade': examHandlers.handleSubmitAndGradeExam,
    '/api/exams/request-answer-review': examHandlers.handleRequestAnswerReview,
    '/api/submissions/teacher-detail': examHandlers.handleGetTeacherSubmissionDetail,
    '/api/admin/set-claims': handleSetAdminClaims,
    '/api/admin/curriculum/import': curriculumImportHandlers.handleImportCurriculum,
    '/api/admin/curriculum/import-history': curriculumImportHandlers.handleGetCurriculumImportHistory,
  };

  return cachedRouteTable;
}

/**
 * Resolves the normalized `/api/...` route path from either:
 * 1. Vercel rewrite query parameter (`?__path=exams/allocate-public-code`), or
 * 2. Direct `req.url` pathname (`/api/exams/allocate-public-code`).
 */
export function resolveApiRoutePath(req: ServerlessReq): string {
  const rawUrl = req.url || '/api';
  let pathname = '';
  let queryPathParam = '';

  try {
    const parsed = new URL(rawUrl, 'http://localhost');
    pathname = parsed.pathname;
    queryPathParam = parsed.searchParams.get('__path') || '';
  } catch {
    pathname = rawUrl.split('?')[0] || '/api';
  }

  if (!queryPathParam && req.query && req.query.__path !== undefined) {
    const rawParam = req.query.__path;
    queryPathParam = Array.isArray(rawParam) ? rawParam.join('/') : String(rawParam || '');
  }

  let resolved: string;
  if (queryPathParam.trim()) {
    const cleanSubpath = queryPathParam.trim().replace(/^\/+/, '');
    resolved = cleanSubpath.startsWith('api/') ? `/${cleanSubpath}` : `/api/${cleanSubpath}`;
  } else {
    resolved = pathname;
  }

  const normalized = resolved.replace(/\/+$/, '') || '/api';
  return normalized;
}

function sendJson(
  res: ServerlessRes,
  statusCode: number,
  body: Record<string, unknown>,
  isHead = false
): void {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
  if (!isHead && typeof res.status === 'function' && typeof res.json === 'function') {
    res.status(statusCode);
    res.json(body);
    return;
  }
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(isHead ? undefined : JSON.stringify(body));
}

export default async function handler(req: ServerlessReq, res: ServerlessRes): Promise<void> {
  const method = (req.method || 'GET').toUpperCase();
  const routePath = resolveApiRoutePath(req);

  try {
    if (method === 'OPTIONS') {
      res.setHeader('Allow', 'GET, POST, HEAD, OPTIONS');
      res.statusCode = 204;
      res.end();
      return;
    }

    if (routePath === '/api/health') {
      if (method !== 'GET' && method !== 'HEAD') {
        res.setHeader('Allow', 'GET, HEAD, OPTIONS');
        sendJson(res, 405, { code: 'API_ROUTE_ERROR', error: 'Method Not Allowed' });
        return;
      }
      sendJson(
        res,
        200,
        {
          ok: true,
          projectId: FIREBASE_PROJECT_ID,
          databaseId: FIRESTORE_DATABASE_ID,
          adminConfigured: isAdminReady(),
        },
        method === 'HEAD'
      );
      return;
    }

    if (routePath === '/api/health/firebase-admin') {
      if (method !== 'GET' && method !== 'HEAD') {
        res.setHeader('Allow', 'GET, HEAD, OPTIONS');
        sendJson(res, 405, {
          status: 'CONFIGURATION_ERROR',
          code: 'API_ROUTE_ERROR',
          message: 'Method Not Allowed',
        });
        return;
      }

      try {
        const health = await checkFirebaseAdminHealth();
        sendJson(
          res,
          200,
          health as unknown as Record<string, unknown>,
          method === 'HEAD'
        );
      } catch (healthErr) {
        const safeMsg =
          healthErr instanceof Error
            ? sanitizeSensitiveLogText(healthErr.message)
            : 'Unexpected error while checking Firebase Admin health';
        sendJson(
          res,
          200,
          {
            status: 'CONFIGURATION_ERROR',
            message: `Không thể khởi tạo hoặc kiểm tra Firebase Admin SDK: ${safeMsg}`,
            envCheck: getFirebaseEnvCheck(),
            adminInitialized: false,
            projectIdMatched: false,
            firestoreConnected: false,
            databaseIdMatched: false,
            environmentVariablePresent: false,
            activeEnvVar: null,
            errorCode: 'ADMIN_INIT_ERROR',
            errorStage: 'api_index_health_catch',
            timestamp: new Date().toISOString(),
          },
          method === 'HEAD'
        );
      }
      return;
    }

    const routeTable = getRouteTable();
    const matchedHandler = routeTable[routePath];
    if (!matchedHandler) {
      sendJson(res, 404, {
        code: 'API_ROUTE_ERROR',
        error: `Không tìm thấy API endpoint ${routePath}.`,
      });
      return;
    }

    const adapted = createVercelHandler(matchedHandler);
    await adapted(req, res);
  } catch (err) {
    const safeMsg =
      err instanceof Error ? sanitizeSensitiveLogText(err.message) : 'Internal server error';
    const isHealthEndpoint = routePath === '/api/health/firebase-admin';
    sendJson(
      res,
      isHealthEndpoint ? 200 : 500,
      isHealthEndpoint
        ? {
            status: 'CONFIGURATION_ERROR',
            message: `Lỗi máy chủ khi kiểm tra Firebase Admin: ${safeMsg}`,
            envCheck: getFirebaseEnvCheck(),
            adminInitialized: false,
            projectIdMatched: false,
            firestoreConnected: false,
            databaseIdMatched: false,
            environmentVariablePresent: false,
            activeEnvVar: null,
            errorCode: 'ADMIN_INIT_ERROR',
            errorStage: 'api_index_outer_catch',
            timestamp: new Date().toISOString(),
          }
        : {
            code: 'UNKNOWN_ERROR',
            error: `Lỗi máy chủ: ${safeMsg}`,
            timestamp: new Date().toISOString(),
          },
      method === 'HEAD'
    );
  }
}
