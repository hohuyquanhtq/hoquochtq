import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ApiRequest, ApiResponse } from './examApiHandlers.ts';

type ServerlessReq = IncomingMessage & {
  body?: unknown;
  ip?: string;
  query?: Record<string, string | string[] | undefined>;
};

type ServerlessRes = ServerResponse & {
  status?: (code: number) => ServerlessRes;
  json?: (body: unknown) => void;
};

function parseQueryParams(req: ServerlessReq): Record<string, string | string[] | undefined> {
  const merged: Record<string, string | string[] | undefined> = {};
  if (req.url) {
    try {
      const parsed = new URL(req.url, 'http://localhost');
      parsed.searchParams.forEach((val, key) => {
        if (key === '__path') return;
        const existing = merged[key];
        if (existing === undefined) {
          merged[key] = val;
        } else if (Array.isArray(existing)) {
          existing.push(val);
        } else {
          merged[key] = [existing, val];
        }
      });
    } catch {
      // ignore malformed URL
    }
  }
  if (req.query && typeof req.query === 'object') {
    for (const [k, v] of Object.entries(req.query)) {
      if (k === '__path') continue;
      if (merged[k] === undefined && v !== undefined) {
        merged[k] = v;
      }
    }
  }
  return merged;
}

async function parseRequestBody(req: ServerlessReq): Promise<unknown> {
  const method = (req.method || 'GET').toUpperCase();
  if (method === 'GET' || method === 'HEAD') {
    return {};
  }
  if (req.body !== undefined) {
    if (typeof req.body === 'string') {
      try {
        return JSON.parse(req.body);
      } catch {
        return {};
      }
    }
    return req.body;
  }

  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer | string) => {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8').trim();
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        resolve({});
      }
    });
    req.on('error', () => resolve({}));
  });
}

export function createVercelHandler(handler: (req: ApiRequest) => Promise<ApiResponse>) {
  return async function vercelHandler(req: ServerlessReq, res: ServerlessRes): Promise<void> {
    if ((req.method || '').toUpperCase() === 'OPTIONS') {
      res.setHeader('Allow', 'GET, POST, HEAD, OPTIONS');
      res.statusCode = 204;
      res.end();
      return;
    }

    try {
      const body = await parseRequestBody(req);
      const query = parseQueryParams(req);
      const forwarded = req.headers['x-forwarded-for'];
      const ip =
        typeof forwarded === 'string'
          ? forwarded.split(',')[0]?.trim()
          : Array.isArray(forwarded)
          ? forwarded[0]
          : req.ip || req.socket?.remoteAddress || '';

      const result = await handler({
        method: (req.method || 'GET').toUpperCase(),
        headers: req.headers,
        body,
        query,
        url: req.url,
        ip,
      });

      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      res.setHeader('Pragma', 'no-cache');
      if (result.status === 405) {
        res.setHeader('Allow', 'GET, POST, OPTIONS');
      }
      if (typeof res.status === 'function' && typeof res.json === 'function') {
        res.status(result.status);
        res.json(result.body);
        return;
      }
      res.statusCode = result.status;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify(result.body));
    } catch (err) {
      const timestamp = new Date().toISOString();
      const rawMsg = err instanceof Error ? err.message : 'Internal server error';
      const errorType = err instanceof Error ? err.name || 'Error' : typeof err;
      console.error(
        JSON.stringify({
          scope: 'HQTest_API',
          timestamp,
          api: req.url || 'unknown',
          errorStage: 'vercel_adapter_catch',
          errorType,
          errorCode: 'UNKNOWN_ERROR',
          message: rawMsg.replace(/-----BEGIN[^-]*PRIVATE KEY-----[\s\S]*?-----END[^-]*PRIVATE KEY-----/gi, '[REDACTED_PRIVATE_KEY]').slice(0, 400),
        })
      );
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(
        JSON.stringify({
          error: `Lỗi máy chủ (${errorType}): vui lòng kiểm tra /api/health/firebase-admin và Vercel Function Logs.`,
          code: 'UNKNOWN_ERROR',
          errorStage: 'vercel_adapter_catch',
          stage: 'vercel_adapter_catch',
          timestamp,
        })
      );
    }
  };
}
