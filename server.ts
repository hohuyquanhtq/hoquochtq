import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { createExamApiHandlers } from './server/examApiHandlers.ts';
import { createPublicExamLinkHandlers } from './server/publicExamLinkHandler.ts';
import { handleSetAdminClaims } from './server/adminClaimsHandler.ts';
import { checkFirebaseAdminHealth } from './server/firebaseAdmin.ts';
import { hasServiceAccountConfigured, resolveServerFirebaseConfig } from './server/firebaseServerAuth.ts';

const PORT = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production';

async function startServer() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '4mb' }));

  const handlers = createExamApiHandlers();
  const publicLinkHandlers = createPublicExamLinkHandlers();

  const wrapExpress =
    (fn: (req: { method?: string; headers: express.Request['headers']; body?: unknown; ip?: string }) => Promise<{ status: number; body: Record<string, unknown> }>) =>
    async (req: express.Request, res: express.Response) => {
      try {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
        res.setHeader('Pragma', 'no-cache');
        const out = await fn({
          method: req.method,
          headers: req.headers,
          body: req.body,
          ip: req.ip,
        });
        res.status(out.status).json(out.body);
      } catch (err) {
        const timestamp = new Date().toISOString();
        const rawMsg = err instanceof Error ? err.message : 'Internal server error';
        const errorType = err instanceof Error ? err.name || 'Error' : typeof err;
        console.error(
          JSON.stringify({
            scope: 'HQTest_API',
            timestamp,
            api: req.originalUrl || req.url,
            errorStage: 'express_wrapper_catch',
            errorType,
            errorCode: 'UNKNOWN_ERROR',
            message: rawMsg.slice(0, 400),
          })
        );
        res.status(500).json({
          error: `Lỗi máy chủ (${errorType}): vui lòng kiểm tra /api/health/firebase-admin.`,
          code: 'UNKNOWN_ERROR',
          errorStage: 'express_wrapper_catch',
          stage: 'express_wrapper_catch',
          timestamp,
        });
      }
    };

  app.get('/api/health', (_req, res) => {
    const cfg = resolveServerFirebaseConfig();
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.json({
      ok: true,
      projectId: cfg.projectId,
      databaseId: cfg.databaseId,
      adminConfigured: hasServiceAccountConfigured(),
    });
  });

  app.get('/api/health/firebase-admin', async (_req, res) => {
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
    res.status(statusCode).json(health);
  });

  app.all('/api/admin/set-claims', wrapExpress(handleSetAdminClaims));
  app.post('/api/exams/security/configure', wrapExpress(handlers.handleConfigureExamSecurity));
  app.post('/api/exams/verify-password', wrapExpress(handlers.handleVerifyExamPassword));
  app.post('/api/exams/access-questions', wrapExpress(handlers.handleAccessExamQuestions));
  app.post('/api/exams/submit-and-grade', wrapExpress(handlers.handleSubmitAndGradeExam));
  app.post('/api/exams/request-answer-review', wrapExpress(handlers.handleRequestAnswerReview));
  app.post('/api/exams/allocate-public-code', wrapExpress(publicLinkHandlers.handleAllocatePublicCode));
  app.post('/api/exams/sync-link-status', wrapExpress(publicLinkHandlers.handleSyncPublicExamLinkStatus));

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir, { index: false }));
    app.use((_req, res) => {
      const indexFile = path.join(distDir, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build output not found. Run npm run build first.');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[HQTest Server] Listening on http://0.0.0.0:${PORT} (${isProduction ? 'production' : 'development'})`);
  });
}

startServer().catch((err) => {
  console.error('[HQTest Server] Failed to start:', err);
  process.exit(1);
});
