import type { IncomingMessage, ServerResponse } from 'node:http';
import { checkFirebaseAdminHealth } from '../../server/firebaseAdmin.ts';

type ServerlessRes = ServerResponse & {
  status?: (code: number) => ServerlessRes;
  json?: (body: unknown) => void;
};

export default async function handler(
  req: IncomingMessage,
  res: ServerlessRes
): Promise<void> {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: 'Method Not Allowed' }));
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

  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');

  if (typeof res.status === 'function' && typeof res.json === 'function') {
    res.status(statusCode);
    res.json(health);
    return;
  }

  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(req.method === 'HEAD' ? undefined : JSON.stringify(health));
}
