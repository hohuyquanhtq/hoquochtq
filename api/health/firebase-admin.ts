import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  checkFirebaseAdminHealth,
  getFirebaseEnvCheck,
  sanitizeSensitiveLogText,
} from '../../lib/firebase-admin.ts';

type ServerlessRes = ServerResponse & {
  status?: (code: number) => ServerlessRes;
  json?: (body: unknown) => void;
};

function sendJsonResponse(
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

export default async function handler(
  req: IncomingMessage,
  res: ServerlessRes
): Promise<void> {
  const method = (req.method || 'GET').toUpperCase();

  try {
    if (method === 'OPTIONS') {
      res.setHeader('Allow', 'GET, HEAD, OPTIONS');
      res.statusCode = 204;
      res.end();
      return;
    }

    if (method !== 'GET' && method !== 'HEAD') {
      res.setHeader('Allow', 'GET, HEAD, OPTIONS');
      sendJsonResponse(res, 405, {
        status: 'CONFIGURATION_ERROR',
        code: 'API_ROUTE_ERROR',
        message: 'Method Not Allowed',
      });
      return;
    }

    const health = await checkFirebaseAdminHealth();
    sendJsonResponse(
      res,
      200,
      health as unknown as Record<string, unknown>,
      method === 'HEAD'
    );
  } catch (err) {
    const safeMsg =
      err instanceof Error
        ? sanitizeSensitiveLogText(err.message)
        : 'Unexpected runtime error in /api/health/firebase-admin';

    sendJsonResponse(
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
        errorStage: 'route_handler_catch',
        timestamp: new Date().toISOString(),
      },
      method === 'HEAD'
    );
  }
}
