import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { createExamApiHandlers } from './server/examApiHandlers.ts';
import { createPublicExamLinkHandlers } from './server/publicExamLinkHandler.ts';
import { createCurriculumImportHandlers } from './server/curriculumImportHandler.ts';
import { handleSetAdminClaims } from './server/adminClaimsHandler.ts';
import {
  checkFirebaseAdminHealth,
  getFirebaseEnvCheck,
  sanitizeSensitiveLogText,
} from './lib/firebase-admin.ts';
import { hasServiceAccountConfigured, resolveServerFirebaseConfig } from './server/firebaseServerAuth.ts';

const PORT = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production';

async function startServer() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '4mb' }));

  const handlers = createExamApiHandlers();
  const publicLinkHandlers = createPublicExamLinkHandlers();
  const curriculumImportHandlers = createCurriculumImportHandlers();

  const wrapExpress =
    (
      fn: (req: {
        method?: string;
        headers: express.Request['headers'];
        body?: unknown;
        query?: Record<string, string | string[] | undefined>;
        url?: string;
        ip?: string;
      }) => Promise<{ status: number; body: Record<string, unknown> }>
    ) =>
    async (req: express.Request, res: express.Response) => {
      if ((req.method || '').toUpperCase() === 'OPTIONS') {
        res.setHeader('Allow', 'GET, POST, HEAD, OPTIONS');
        res.status(204).end();
        return;
      }
      try {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
        res.setHeader('Pragma', 'no-cache');
        const normalizedQuery: Record<string, string | string[] | undefined> = {};
        for (const [k, v] of Object.entries(req.query || {})) {
          if (typeof v === 'string') {
            normalizedQuery[k] = v;
          } else if (Array.isArray(v)) {
            normalizedQuery[k] = v.map((item) => String(item));
          }
        }
        const out = await fn({
          method: (req.method || 'GET').toUpperCase(),
          headers: req.headers,
          body: req.body,
          query: normalizedQuery,
          url: req.originalUrl || req.url,
          ip: req.ip,
        });
        if (out.status === 405) {
          res.setHeader('Allow', 'GET, POST, OPTIONS');
        }
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
    try {
      const cfg = resolveServerFirebaseConfig();
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      res.json({
        ok: true,
        projectId: cfg.projectId,
        databaseId: cfg.databaseId,
        adminConfigured: hasServiceAccountConfigured(),
      });
    } catch (err) {
      const cfg = resolveServerFirebaseConfig();
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      res.status(200).json({
        ok: false,
        projectId: cfg.projectId,
        databaseId: cfg.databaseId,
        adminConfigured: false,
        message: err instanceof Error ? sanitizeSensitiveLogText(err.message) : 'Health check error',
      });
    }
  });

  app.get('/api/health/firebase-admin', async (_req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    try {
      const health = await checkFirebaseAdminHealth();
      res.status(200).json(health);
    } catch (err) {
      const safeMsg =
        err instanceof Error
          ? sanitizeSensitiveLogText(err.message)
          : 'Unexpected runtime error in /api/health/firebase-admin';
      res.status(200).json({
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
        errorStage: 'express_health_catch',
        timestamp: new Date().toISOString(),
      });
    }
  });

  app.all('/api/admin/set-claims', wrapExpress(handleSetAdminClaims));
  app.all('/api/admin/curriculum/import', wrapExpress(curriculumImportHandlers.handleImportCurriculum));
  app.all('/api/admin/curriculum/import-history', wrapExpress(curriculumImportHandlers.handleGetCurriculumImportHistory));
  app.all('/api/exams/security/configure', wrapExpress(handlers.handleConfigureExamSecurity));
  app.all('/api/exams/verify-password', wrapExpress(handlers.handleVerifyExamPassword));
  app.all('/api/exams/access-questions', wrapExpress(handlers.handleAccessExamQuestions));
  app.all('/api/exams/submit-and-grade', wrapExpress(handlers.handleSubmitAndGradeExam));
  app.all('/api/exams/request-answer-review', wrapExpress(handlers.handleRequestAnswerReview));
  app.all('/api/submissions/teacher-detail', wrapExpress(handlers.handleGetTeacherSubmissionDetail));
  app.all('/api/exams/allocate-public-code', wrapExpress(publicLinkHandlers.handleAllocatePublicCode));
  app.all('/api/exams/sync-link-status', wrapExpress(publicLinkHandlers.handleSyncPublicExamLinkStatus));
  app.use('/api', (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.status(404).json({
      code: 'API_ROUTE_ERROR',
      error: `Không tìm thấy API endpoint ${req.originalUrl || req.url}.`,
    });
  });

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
