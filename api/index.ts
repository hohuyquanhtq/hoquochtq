import type { IncomingMessage, ServerResponse } from 'node:http';
import { createExamApiHandlers, type ApiRequest, type ApiResponse } from '../server/examApiHandlers.ts';
import { createPublicExamLinkHandlers } from '../server/publicExamLinkHandler.ts';
import { createCurriculumImportHandlers } from '../server/curriculumImportHandler.ts';
import { handleSetAdminClaims } from '../server/adminClaimsHandler.ts';
import {
  checkFirebaseAdminHealth,
  EXPECTED_FIREBASE_PROJECT_ID,
  EXPECTED_FIRESTORE_DATABASE_ID,
  isFirebaseAdminReady,
} from '../server/firebaseAdmin.ts';
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

const examHandlers = createExamApiHandlers();
const publicLinkHandlers = createPublicExamLinkHandlers();
const curriculumImportHandlers = createCurriculumImportHandlers();

const ROUTE_TABLE: Record<string, (req: ApiRequest) => Promise<ApiResponse>> = {
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

function sendJson(res: ServerlessRes, statusCode: number, body: Record<string, unknown>, isHead = false): void {
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
  if (method === 'OPTIONS') {
    res.setHeader('Allow', 'GET, POST, HEAD, OPTIONS');
    res.statusCode = 204;
    res.end();
    return;
  }

  const routePath = resolveApiRoutePath(req);

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
        projectId: EXPECTED_FIREBASE_PROJECT_ID,
        databaseId: EXPECTED_FIRESTORE_DATABASE_ID,
        adminConfigured: isFirebaseAdminReady(),
      },
      method === 'HEAD'
    );
    return;
  }

  if (routePath === '/api/health/firebase-admin') {
    if (method !== 'GET' && method !== 'HEAD') {
      res.setHeader('Allow', 'GET, HEAD, OPTIONS');
      sendJson(res, 405, { code: 'API_ROUTE_ERROR', error: 'Method Not Allowed' });
      return;
    }
    const health = await checkFirebaseAdminHealth();
    const statusCode =
      health.adminInitialized &&
      health.projectIdMatched &&
      health.firestoreConnected &&
      health.databaseIdMatched
        ? 200
        : 503;
    sendJson(res, statusCode, health as unknown as Record<string, unknown>, method === 'HEAD');
    return;
  }

  const matchedHandler = ROUTE_TABLE[routePath];
  if (!matchedHandler) {
    sendJson(res, 404, {
      code: 'API_ROUTE_ERROR',
      error: `Không tìm thấy API endpoint ${routePath}.`,
    });
    return;
  }

  const adapted = createVercelHandler(matchedHandler);
  await adapted(req, res);
}
