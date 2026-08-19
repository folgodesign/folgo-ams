import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { asyncHandler, HttpError } from '../middleware/errors.js';
import { requireAuth, requireRole, clientIp } from '../middleware/auth.js';
import { generateToken, hashToken } from '../lib/crypto.js';
import { config } from '../lib/config.js';
import { audit } from '../lib/audit.js';
import { revokeAllUserTokens } from '../lib/tokens.js';
import { liveSeconds, assignTask } from '../services/tasks.js';

export const usersRouter = Router();
usersRouter.use(requireAuth);

/** Directory / people list (PRD §4.9). Visible to all roles. */
usersRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const { team, status, q } = req.query as Record<string, string>;
    const where: Record<string, unknown> = { orgId: req.auth!.orgId };
    if (team) where.teamId = team;
    if (status) where.status = status;
    if (q) where.name = { contains: q };
    const users = await prisma.user.findMany({ where, include: { team: true }, orderBy: { name: 'asc' } });
    res.json(
      users.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        avatarUrl: u.avatarUrl,
        designation: u.designation,
        role: u.role,
        teamId: u.teamId,
        teamName: u.team?.name ?? null,
        status: u.status,
        employeeCode: u.employeeCode,
        timezone: u.timezone,
      })),
    );
  }),
);

/** PRD F-1.1 + F-1.2: admin creates an invited account and issues a token. */
usersRouter.post(
  '/invite',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        email: z.string().email(),
        name: z.string().min(1),
        role: z.enum(['employee', 'lead', 'admin', 'super_admin']).default('employee'),
        teamId: z.string().optional(),
        designation: z.string().optional(),
        employeeCode: z.string().optional(),
        managerId: z.string().optional(),
        workScheduleId: z.string().optional(),
        timezone: z.string().optional(),
      })
      .parse(req.body);

    const existing = await prisma.user.findUnique({ where: { email: body.email.toLowerCase() } });
    if (existing) throw new HttpError(409, 'email already exists', 'email_exists');

    const user = await prisma.user.create({
      data: {
        orgId: req.auth!.orgId,
        email: body.email.toLowerCase(),
        name: body.name,
        role: body.role,
        teamId: body.teamId ?? null,
        designation: body.designation ?? null,
        employeeCode: body.employeeCode ?? null,
        managerId: body.managerId ?? null,
        workScheduleId: body.workScheduleId ?? null,
        timezone: body.timezone ?? null,
        status: 'invited',
      },
    });

    const raw = generateToken();
    await prisma.invite.create({
      data: { userId: user.id, tokenHash: hashToken(raw), expiresAt: new Date(Date.now() + 7 * 86400_000) },
    });
    await audit({ orgId: req.auth!.orgId, actorId: req.auth!.userId, action: 'invite_user', entityType: 'user', entityId: user.id, ip: clientIp(req) });

    // In production this link is emailed, never returned. Returned here so the
    // demo works without an email provider configured.
    const activationLink = `${config.appBaseUrl}/activate?token=${raw}`;
    res.status(201).json({ id: user.id, email: user.email, activationLink });
  }),
);

/** Resend an invite — invalidates the prior token (PRD F-1.2). */
usersRouter.post(
  '/:id/resend-invite',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findFirst({ where: { id: req.params.id, orgId: req.auth!.orgId } });
    if (!user) throw new HttpError(404, 'user not found');
    if (user.status !== 'invited') throw new HttpError(409, 'user already active', 'not_invited');
    await prisma.invite.deleteMany({ where: { userId: user.id, usedAt: null } });
    const raw = generateToken();
    await prisma.invite.create({
      data: { userId: user.id, tokenHash: hashToken(raw), expiresAt: new Date(Date.now() + 7 * 86400_000) },
    });
    res.json({ activationLink: `${config.appBaseUrl}/activate?token=${raw}` });
  }),
);

usersRouter.patch(
  '/:id',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        name: z.string().optional(),
        role: z.enum(['employee', 'lead', 'admin', 'super_admin']).optional(),
        teamId: z.string().nullable().optional(),
        designation: z.string().optional(),
        managerId: z.string().nullable().optional(),
        workScheduleId: z.string().nullable().optional(),
        timezone: z.string().nullable().optional(),
        employeeCode: z.string().optional(),
      })
      .parse(req.body);
    const before = await prisma.user.findFirst({ where: { id: req.params.id, orgId: req.auth!.orgId } });
    if (!before) throw new HttpError(404, 'user not found');
    const user = await prisma.user.update({ where: { id: before.id }, data: body });
    await audit({ orgId: req.auth!.orgId, actorId: req.auth!.userId, action: 'update_user', entityType: 'user', entityId: user.id, before, after: user, ip: clientIp(req) });
    res.json({ id: user.id });
  }),
);

/** PRD F-1.6: soft deactivate; auto-close open session; revoke sessions. */
usersRouter.delete(
  '/:id',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findFirst({ where: { id: req.params.id, orgId: req.auth!.orgId } });
    if (!user) throw new HttpError(404, 'user not found');
    const now = new Date();
    await prisma.user.update({ where: { id: user.id }, data: { status: 'deactivated' } });
    await prisma.session.updateMany({ where: { userId: user.id, checkOutAt: null }, data: { checkOutAt: now, autoClosed: true } });
    await revokeAllUserTokens(user.id);
    await audit({ orgId: req.auth!.orgId, actorId: req.auth!.userId, action: 'deactivate_user', entityType: 'user', entityId: user.id, ip: clientIp(req) });
    res.json({ ok: true });
  }),
);

/** PRD F-1.6: rehire reactivates the original account. */
usersRouter.post(
  '/:id/reactivate',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findFirst({ where: { id: req.params.id, orgId: req.auth!.orgId } });
    if (!user) throw new HttpError(404, 'user not found');
    await prisma.user.update({ where: { id: user.id }, data: { status: 'active' } });
    await audit({ orgId: req.auth!.orgId, actorId: req.auth!.userId, action: 'reactivate_user', entityType: 'user', entityId: user.id, ip: clientIp(req) });
    res.json({ ok: true });
  }),
);

/**
 * PRD F-4.4 / F-3.6: a user's profile detail — privileged viewers only, and
 * never exposing secret columns (password hash, TOTP secret).
 */
usersRouter.get(
  '/:id',
  requireRole('lead'),
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findFirst({
      where: { id: req.params.id, orgId: req.auth!.orgId },
      include: { team: true, workSchedule: true },
    });
    if (!user) throw new HttpError(404, 'user not found');
    const manager = user.managerId
      ? await prisma.user.findUnique({ where: { id: user.managerId }, select: { name: true } })
      : null;
    const { passwordHash, totpSecret, ...safe } = user;
    res.json({ ...safe, managerName: manager?.name ?? null });
  }),
);

usersRouter.get(
  '/:id/attendance',
  requireRole('lead'),
  asyncHandler(async (req, res) => {
    const { from, to } = req.query as Record<string, string>;
    const where: Record<string, unknown> = { userId: req.params.id };
    if (from && to) where.date = { gte: from, lte: to };
    const days = await prisma.attendanceDay.findMany({ where, include: { sessions: { include: { breaks: true } } }, orderBy: { date: 'asc' } });
    res.json(days);
  }),
);

/** PRD F-3.6/F-3.7: admin view of a person's task log. */
usersRouter.get(
  '/:id/tasks',
  requireRole('lead'),
  asyncHandler(async (req, res) => {
    const { date, from, to } = req.query as Record<string, string>;
    const where: Record<string, unknown> = { userId: req.params.id };
    if (date) where.startedAt = { gte: new Date(`${date}T00:00:00`), lt: new Date(`${date}T23:59:59`) };
    else if (from && to) where.startedAt = { gte: new Date(`${from}T00:00:00`), lte: new Date(`${to}T23:59:59`) };
    const tasks = await prisma.task.findMany({ where, include: { intervals: true, client: true, project: true, comments: true }, orderBy: { startedAt: 'asc' } });
    res.json(
      tasks.map((t) => ({
        id: t.id,
        title: t.title,
        state: t.state,
        seconds: liveSeconds(t),
        client: t.client?.name ?? null,
        project: t.project?.name ?? null,
        startedAt: t.startedAt,
        endedAt: t.endedAt,
        note: t.note,
        comments: t.comments,
      })),
    );
  }),
);

/** Admin assigns a task to an employee; it lands in their list to Start. */
usersRouter.post(
  '/:id/assign-task',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        title: z.string().min(1).max(140),
        note: z.string().max(500).optional(),
        clientId: z.string().optional(),
        projectId: z.string().optional(),
      })
      .parse(req.body);
    const target = await prisma.user.findFirst({ where: { id: req.params.id, orgId: req.auth!.orgId } });
    if (!target) throw new HttpError(404, 'user not found');
    if (target.status !== 'active') throw new HttpError(409, 'user is not active', 'not_active');

    const task = await assignTask({
      userId: target.id,
      orgId: req.auth!.orgId,
      assignedById: req.auth!.userId,
      title: body.title.trim(),
      note: body.note ?? null,
      clientId: body.clientId ?? null,
      projectId: body.projectId ?? null,
    });
    await prisma.notification.create({
      data: { userId: target.id, type: 'task_assigned', payloadJson: JSON.stringify({ taskId: task.id, title: task.title }) },
    });
    await audit({ orgId: req.auth!.orgId, actorId: req.auth!.userId, action: 'assign_task', entityType: 'task', entityId: task.id, after: { userId: target.id, title: task.title }, ip: clientIp(req) });
    res.status(201).json({ id: task.id, title: task.title, state: task.state });
  }),
);

/** PRD F-3.11: admins may comment on a task but never silently edit its text. */
usersRouter.post(
  '/:id/tasks/:taskId/comments',
  requireRole('lead'),
  asyncHandler(async (req, res) => {
    const body = z.object({ body: z.string().min(1) }).parse(req.body);
    const task = await prisma.task.findFirst({ where: { id: req.params.taskId, userId: req.params.id } });
    if (!task) throw new HttpError(404, 'task not found');
    const comment = await prisma.taskComment.create({ data: { taskId: task.id, authorId: req.auth!.userId, body: body.body } });
    res.status(201).json(comment);
  }),
);
