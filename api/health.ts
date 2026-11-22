import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  FIREBASE_PROJECT_ID,
  FIRESTORE_DATABASE_ID,
  isAdminReady,
  sanitizeSensitiveLogText,
} from '../lib/firebase-admin.ts';

type ServerlessRes = ServerResponse & {
  status?: (code: number) => ServerlessRes;
  json?: (body: unknown) => void;
};

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

export default function handler(req: IncomingMessage, res: ServerlessRes): void {
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
      sendJson(res, 405, { error: 'Method Not Allowed' });
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
  } catch (err) {
    const safeMsg = err instanceof Error ? sanitizeSensitiveLogText(err.message) : 'Health check error';
    sendJson(
      res,
      200,
      {
        ok: false,
        projectId: FIREBASE_PROJECT_ID,
        databaseId: FIRESTORE_DATABASE_ID,
        adminConfigured: false,
        message: safeMsg,
      },
      method === 'HEAD'
    );
  }
}
