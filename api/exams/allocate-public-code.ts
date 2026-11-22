import type { IncomingMessage, ServerResponse } from 'node:http';
import { createPublicExamLinkHandlers } from '../../server/publicExamLinkHandler.ts';
import { createVercelHandler } from '../../server/vercelAdapter.ts';

type ServerlessReq = IncomingMessage & {
  body?: unknown;
  ip?: string;
  query?: Record<string, string | string[] | undefined>;
};

type ServerlessRes = ServerResponse & {
  status?: (code: number) => ServerlessRes;
  json?: (body: unknown) => void;
};

let cachedHandler: ((req: ServerlessReq, res: ServerlessRes) => Promise<void>) | null = null;

export default async function handler(req: ServerlessReq, res: ServerlessRes): Promise<void> {
  if (!cachedHandler) {
    const handlers = createPublicExamLinkHandlers();
    cachedHandler = createVercelHandler(handlers.handleAllocatePublicCode);
  }
  await cachedHandler(req, res);
}
