import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  EXPECTED_FIREBASE_PROJECT_ID,
  EXPECTED_FIRESTORE_DATABASE_ID,
  isFirebaseAdminReady,
} from '../server/firebaseAdmin.ts';

type ServerlessRes = ServerResponse & {
  status?: (code: number) => ServerlessRes;
  json?: (body: unknown) => void;
};

export default function handler(req: IncomingMessage, res: ServerlessRes): void {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: 'Method Not Allowed' }));
    return;
  }

  const payload = {
    ok: true,
    projectId: EXPECTED_FIREBASE_PROJECT_ID,
    databaseId: EXPECTED_FIRESTORE_DATABASE_ID,
    adminConfigured: isFirebaseAdminReady(),
  };

  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');

  if (typeof res.status === 'function' && typeof res.json === 'function') {
    res.status(200);
    res.json(payload);
    return;
  }

  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(req.method === 'HEAD' ? undefined : JSON.stringify(payload));
}
