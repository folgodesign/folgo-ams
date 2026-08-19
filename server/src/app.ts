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

  // PRD §11: /health is monitored specifically.
  app.get('/health', (_req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

  app.use('/auth', authRouter);
  app.use('/me', meRouter);
  app.use('/live', liveRouter);
  app.use('/users', usersRouter);
  app.use('/settings', settingsRouter);
  app.use('/clients', clientsRouter);
  app.use('/projects', projectsRouter);
  app.use('/activity', activityRouter);
  app.use('/tasks', taskSearchRouter);
  app.use('/attendance', attendanceRouter);
  app.use('/reports', reportsRouter);
  app.use('/approvals', approvalsRouter);
  app.use('/audit-log', auditRouter);

  app.use(errorHandler);
  return app;
}
