import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { asyncHandler } from '../middleware/errors.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

export const auditRouter = Router();
auditRouter.use(requireAuth, requireRole('admin'));

/** PRD §4.10: filterable, admin-viewable audit log. */
auditRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const { actor, action, from, to } = req.query as Record<string, string>;
    const where: Record<string, unknown> = { orgId: req.auth!.orgId };
    if (actor) where.actorId = actor;
    if (action) where.action = action;
    if (from && to) where.createdAt = { gte: new Date(from), lte: new Date(to) };
    const logs = await prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, take: 500 });
    // Resolve actor names for display.
    const actorIds = [...new Set(logs.map((l) => l.actorId).filter(Boolean) as string[])];
    const actors = await prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } });
    const nameById = new Map(actors.map((a) => [a.id, a.name]));
    res.json(logs.map((l) => ({ ...l, actorName: l.actorId ? nameById.get(l.actorId) ?? 'Unknown' : 'System' })));
  }),
);
