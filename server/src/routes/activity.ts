import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { asyncHandler } from '../middleware/errors.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { liveSeconds } from '../services/tasks.js';

export const activityRouter = Router();
activityRouter.use(requireAuth);

/** PRD F-3.8: org/team-wide task activity feed. */
activityRouter.get(
  '/',
  requireRole('lead'),
  asyncHandler(async (req, res) => {
    const { team, client, project, from, to, person } = req.query as Record<string, string>;
    const where: Record<string, unknown> = { orgId: req.auth!.orgId };
    if (client) where.clientId = client;
    if (project) where.projectId = project;
    if (person) where.userId = person;
    if (from && to) where.startedAt = { gte: new Date(`${from}T00:00:00`), lte: new Date(`${to}T23:59:59`) };
    const tasks = await prisma.task.findMany({
      where,
      include: { user: { select: { name: true, avatarUrl: true, teamId: true } }, client: true, project: true, intervals: true },
      orderBy: { startedAt: 'desc' },
      take: 200,
    });
    const filtered = team ? tasks.filter((t) => t.user.teamId === team) : tasks;
    res.json(
      filtered.map((t) => ({
        id: t.id,
        userName: t.user.name,
        avatarUrl: t.user.avatarUrl,
        title: t.title,
        state: t.state,
        seconds: liveSeconds(t),
        client: t.client?.name ?? null,
        project: t.project?.name ?? null,
        startedAt: t.startedAt,
        endedAt: t.endedAt,
      })),
    );
  }),
);

/** PRD F-3.9: full-text task search scoped by permission. */
export const taskSearchRouter = Router();
taskSearchRouter.use(requireAuth);
taskSearchRouter.get(
  '/search',
  requireRole('lead'),
  asyncHandler(async (req, res) => {
    const q = (req.query.q as string) ?? '';
    const tasks = await prisma.task.findMany({
      where: {
        orgId: req.auth!.orgId,
        OR: [{ title: { contains: q } }, { note: { contains: q } }],
      },
      include: { user: { select: { name: true } }, client: true, project: true },
      orderBy: { startedAt: 'desc' },
      take: 100,
    });
    res.json(tasks.map((t) => ({ id: t.id, userName: t.user.name, title: t.title, note: t.note, client: t.client?.name ?? null, project: t.project?.name ?? null, startedAt: t.startedAt })));
  }),
);
