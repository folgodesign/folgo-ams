import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { config } from './lib/config.js';
import { errorHandler } from './middleware/errors.js';
import { authRouter } from './routes/auth.js';
import { meRouter } from './routes/me.js';
import { liveRouter } from './routes/live.js';
import { usersRouter } from './routes/users.js';
import { settingsRouter } from './routes/settings.js';
import { clientsRouter, projectsRouter } from './routes/clients.js';
import { activityRouter, taskSearchRouter } from './routes/activity.js';
import { attendanceRouter } from './routes/attendance.js';
import { reportsRouter } from './routes/reports.js';
import { approvalsRouter } from './routes/approvals.js';
import { auditRouter } from './routes/audit.js';

export function createApp() {
  const app = express();
  app.use(cors({ origin: config.webOrigin, credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  // All API routes live under /api so a single service can also serve the
  // built frontend from the same origin (keeps the auth cookie same-site).
  const api = express.Router();

  // PRD §11: health endpoint is monitored specifically.
  api.get('/health', (_req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

  api.use('/auth', authRouter);
  api.use('/me', meRouter);
  api.use('/live', liveRouter);
  api.use('/users', usersRouter);
  api.use('/settings', settingsRouter);
  api.use('/clients', clientsRouter);
  api.use('/projects', projectsRouter);
  api.use('/activity', activityRouter);
  api.use('/tasks', taskSearchRouter);
  api.use('/attendance', attendanceRouter);
  api.use('/reports', reportsRouter);
  api.use('/approvals', approvalsRouter);
  api.use('/audit-log', auditRouter);

  app.use('/api', api);
  // Bare /health too, for platform health checks that hit the root path.
  app.get('/health', (_req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

  // In production, serve the built React app and fall back to index.html for
  // client-side routes. WEB_DIST_PATH lets the container point at the build.
  const webDist =
    process.env.WEB_DIST_PATH ||
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../web/dist');
  if (config.isProd && fs.existsSync(webDist)) {
    app.use(express.static(webDist));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api')) return next();
      res.sendFile(path.join(webDist, 'index.html'));
    });
  }

  app.use(errorHandler);
  return app;
}
