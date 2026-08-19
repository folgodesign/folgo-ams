import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { asyncHandler, HttpError } from '../middleware/errors.js';
import { requireAuth, clientIp } from '../middleware/auth.js';
import { publicUser } from './auth.js';
import {
  ensureAttendanceDay,
  recomputeAttendanceDay,
  dateForUser,
} from '../services/attendance.js';
import { startTask, transitionTask, resumeTask, pauseCurrentTask, liveSeconds } from '../services/tasks.js';
import { setStatus, publishMember } from '../services/status.js';
import { audit } from '../lib/audit.js';

export const meRouter = Router();
meRouter.use(requireAuth);

const VALID_STATUS = ['WORKING', 'ON_BREAK', 'IN_MEETING', 'FOCUS', 'AWAY', 'CHECKED_OUT'] as const;

async function loadUser(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { org: true, team: true, workSchedule: true },
  });
  if (!user) throw new HttpError(404, 'user not found');
  return user;
}

function userTz(user: { timezone: string | null; org: { timezone: string } }) {
  return user.timezone || user.org.timezone;
}

meRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const user = await loadUser(req.auth!.userId);
    res.json({
      ...publicUser(user),
      phone: user.phone,
      employeeCode: user.employeeCode,
      teamName: user.team?.name ?? null,
      dateJoined: user.dateJoined,
      workSchedule: user.workSchedule,
      orgName: user.org.name,
      orgTimezone: user.org.timezone,
    });
  }),
);

meRouter.patch(
  '/',
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        name: z.string().min(1).optional(),
        phone: z.string().optional(),
        avatarUrl: z.string().url().optional(),
        timezone: z.string().optional(),
      })
      .parse(req.body);
    const user = await prisma.user.update({ where: { id: req.auth!.userId }, data: body });
    res.json(publicUser(user));
  }),
);

/** PRD /me/today — current session, status, timers, today's tasks. */
meRouter.get(
  '/today',
  asyncHandler(async (req, res) => {
    const user = await loadUser(req.auth!.userId);
    const tz = userTz(user);
    const date = dateForUser(new Date(), tz);

    const openSession = await prisma.session.findFirst({
      where: { userId: user.id, checkOutAt: null },
      include: { breaks: { where: { endedAt: null } } },
      orderBy: { checkInAt: 'desc' },
    });
    const attendanceDay = await prisma.attendanceDay.findUnique({
      where: { userId_date: { userId: user.id, date } },
    });
    const status = await prisma.statusUpdate.findFirst({
      where: { userId: user.id, endedAt: null },
      orderBy: { startedAt: 'desc' },
    });
    const currentTask = await prisma.task.findFirst({
      where: { userId: user.id, state: 'in_progress' },
      include: { intervals: true, client: true, project: true },
      orderBy: { startedAt: 'desc' },
    });
    const todaysTasks = await prisma.task.findMany({
      where: { userId: user.id, startedAt: { gte: new Date(`${date}T00:00:00`) } },
      include: { intervals: true, client: true, project: true },
      orderBy: { startedAt: 'asc' },
    });

    res.json({
      date,
      timezone: tz,
      checkedIn: !!openSession,
      onBreak: (openSession?.breaks.length ?? 0) > 0,
      session: openSession
        ? { id: openSession.id, checkInAt: openSession.checkInAt, openBreakId: openSession.breaks[0]?.id ?? null }
        : null,
      status: status?.status ?? 'CHECKED_OUT',
      backInMinutes: status?.backInMinutes ?? null,
      workedMinutes: attendanceDay?.totalWorkedMinutes ?? 0,
      breakMinutes: attendanceDay?.totalBreakMinutes ?? 0,
      firstCheckIn: attendanceDay?.firstCheckIn ?? null,
      currentTask: currentTask
        ? { id: currentTask.id, title: currentTask.title, seconds: liveSeconds(currentTask), client: currentTask.client?.name ?? null, project: currentTask.project?.name ?? null }
        : null,
      tasks: todaysTasks.map((t) => ({
        id: t.id,
        title: t.title,
        state: t.state,
        seconds: liveSeconds(t),
        client: t.client?.name ?? null,
        project: t.project?.name ?? null,
        startedAt: t.startedAt,
        endedAt: t.endedAt,
      })),
    });
  }),
);

/** PRD F-2.1 check in. */
meRouter.post(
  '/check-in',
  asyncHandler(async (req, res) => {
    const body = z.object({ first_task_title: z.string().max(140).optional() }).parse(req.body);
    const user = await loadUser(req.auth!.userId);
    const tz = userTz(user);
    const now = new Date();
    const date = dateForUser(now, tz);

    const open = await prisma.session.findFirst({ where: { userId: user.id, checkOutAt: null } });
    if (open) {
      // Idempotent double-tap within 5s → same session (acceptance §4.2).
      if (now.getTime() - open.checkInAt.getTime() < 5000) {
        res.json({ ok: true, sessionId: open.id, deduped: true });
        return;
      }
      throw new HttpError(409, 'already checked in', 'already_checked_in');
    }

    const day = await ensureAttendanceDay(user.id, date);
    const session = await prisma.session.create({
      data: {
        userId: user.id,
        attendanceDayId: day.id,
        checkInAt: now,
        checkInIp: clientIp(req),
        device: (req.headers['user-agent'] ?? '').slice(0, 200),
      },
    });
    await setStatus(user.id, 'WORKING', { sessionId: session.id });

    if (body.first_task_title?.trim()) {
      await startTask({ userId: user.id, orgId: user.orgId, title: body.first_task_title.trim() });
    }
    await recomputeAttendanceDay(user.id, date);
    await audit({ orgId: user.orgId, actorId: user.id, action: 'check_in', entityType: 'session', entityId: session.id, ip: clientIp(req) });
    await publishMember(user.orgId, user.id);
    res.status(201).json({ ok: true, sessionId: session.id, checkInAt: now });
  }),
);

/** PRD F-2.2 check out. */
meRouter.post(
  '/check-out',
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        note: z.string().max(500).optional(),
        resolve_open_tasks: z
          .array(z.object({ taskId: z.string(), action: z.enum(['completed', 'carried_over', 'paused']) }))
          .optional(),
      })
      .parse(req.body);
    const user = await loadUser(req.auth!.userId);
    const tz = userTz(user);
    const now = new Date();

    const session = await prisma.session.findFirst({
      where: { userId: user.id, checkOutAt: null },
      include: { breaks: { where: { endedAt: null } } },
      orderBy: { checkInAt: 'desc' },
    });
    if (!session) throw new HttpError(409, 'not checked in', 'not_checked_in');

    // Close any open break first.
    for (const b of session.breaks) {
      await prisma.break.update({ where: { id: b.id }, data: { endedAt: now } });
    }

    // Resolve open tasks per the end-of-day prompt.
    for (const r of body.resolve_open_tasks ?? []) {
      await transitionTask(r.taskId, r.action);
    }
    // Anything still in progress gets carried over by default.
    await pauseCurrentTask(user.id, now).then(async (id) => {
      if (id) await prisma.task.update({ where: { id }, data: { state: 'carried_over', endedAt: now } });
    });

    await prisma.session.update({
      where: { id: session.id },
      data: { checkOutAt: now, checkOutIp: clientIp(req), note: body.note ?? null },
    });
    await setStatus(user.id, 'CHECKED_OUT', { sessionId: session.id });

    const date = dateForUser(session.checkInAt, tz);
    await recomputeAttendanceDay(user.id, date);
    const day = await prisma.attendanceDay.findUnique({ where: { userId_date: { userId: user.id, date } } });
    await audit({ orgId: user.orgId, actorId: user.id, action: 'check_out', entityType: 'session', entityId: session.id, ip: clientIp(req) });
    await publishMember(user.orgId, user.id);
    res.json({
      ok: true,
      checkOutAt: now,
      workedMinutes: day?.totalWorkedMinutes ?? 0,
      breakMinutes: day?.totalBreakMinutes ?? 0,
    });
  }),
);

/** PRD F-2.3 breaks. */
meRouter.post(
  '/breaks',
  asyncHandler(async (req, res) => {
    const body = z.object({ type: z.enum(['lunch', 'short', 'personal']).default('short') }).parse(req.body);
    const user = await loadUser(req.auth!.userId);
    const session = await prisma.session.findFirst({ where: { userId: user.id, checkOutAt: null } });
    if (!session) throw new HttpError(409, 'not checked in', 'not_checked_in');
    const open = await prisma.break.findFirst({ where: { sessionId: session.id, endedAt: null } });
    if (open) throw new HttpError(409, 'already on break', 'already_on_break');

    const brk = await prisma.break.create({ data: { sessionId: session.id, type: body.type } });
    await setStatus(user.id, 'ON_BREAK', { sessionId: session.id });
    await publishMember(user.orgId, user.id);
    res.status(201).json({ ok: true, breakId: brk.id });
  }),
);

meRouter.patch(
  '/breaks/:id',
  asyncHandler(async (req, res) => {
    const user = await loadUser(req.auth!.userId);
    const brk = await prisma.break.findUnique({ where: { id: req.params.id }, include: { session: true } });
    if (!brk || brk.session.userId !== user.id) throw new HttpError(404, 'break not found');
    if (brk.endedAt) throw new HttpError(409, 'break already ended', 'break_ended');
    await prisma.break.update({ where: { id: brk.id }, data: { endedAt: new Date() } });
    await setStatus(user.id, 'WORKING', { sessionId: brk.sessionId });
    const date = dateForUser(brk.session.checkInAt, userTz(user));
    await recomputeAttendanceDay(user.id, date);
    await publishMember(user.orgId, user.id);
    res.json({ ok: true });
  }),
);

/** PRD F-3.3 status selector. */
meRouter.post(
  '/status',
  asyncHandler(async (req, res) => {
    const body = z
      .object({ status: z.enum(VALID_STATUS), back_in_minutes: z.number().int().positive().optional() })
      .parse(req.body);
    const user = await loadUser(req.auth!.userId);
    const session = await prisma.session.findFirst({ where: { userId: user.id, checkOutAt: null } });
    await setStatus(user.id, body.status, { sessionId: session?.id ?? null, backInMinutes: body.back_in_minutes ?? null });
    await publishMember(user.orgId, user.id);
    res.json({ ok: true });
  }),
);

// ---- Task log (PRD §4.3) ----

meRouter.post(
  '/tasks',
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        title: z.string().min(1).max(140),
        client_id: z.string().optional(),
        project_id: z.string().optional(),
        carried_from_task_id: z.string().optional(),
      })
      .parse(req.body);
    const user = await loadUser(req.auth!.userId);
    const task = await startTask({
      userId: user.id,
      orgId: user.orgId,
      title: body.title.trim(),
      clientId: body.client_id ?? null,
      projectId: body.project_id ?? null,
      carriedFromTaskId: body.carried_from_task_id ?? null,
    });
    await publishMember(user.orgId, user.id);
    res.status(201).json({ id: task.id, title: task.title, state: task.state, seconds: 0 });
  }),
);

meRouter.patch(
  '/tasks/:id',
  asyncHandler(async (req, res) => {
    const body = z
      .object({ state: z.enum(['paused', 'completed', 'carried_over', 'cancelled', 'in_progress']), note: z.string().max(280).optional() })
      .parse(req.body);
    const user = await loadUser(req.auth!.userId);
    const task = await prisma.task.findUnique({ where: { id: req.params.id } });
    if (!task || task.userId !== user.id) throw new HttpError(404, 'task not found');

    const updated =
      body.state === 'in_progress'
        ? await resumeTask(user.id, task.id)
        : await transitionTask(task.id, body.state, body.note);
    await publishMember(user.orgId, user.id);
    res.json({ id: updated.id, state: updated.state, seconds: liveSeconds({ ...updated, intervals: [] }) });
  }),
);

meRouter.get(
  '/tasks',
  asyncHandler(async (req, res) => {
    const user = await loadUser(req.auth!.userId);
    const { date, from, to } = req.query as Record<string, string>;
    const where: Record<string, unknown> = { userId: user.id };
    if (date) where.startedAt = { gte: new Date(`${date}T00:00:00`), lt: new Date(`${date}T23:59:59`) };
    else if (from && to) where.startedAt = { gte: new Date(`${from}T00:00:00`), lte: new Date(`${to}T23:59:59`) };
    const tasks = await prisma.task.findMany({
      where,
      include: { intervals: true, client: true, project: true },
      orderBy: { startedAt: 'desc' },
    });
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
      })),
    );
  }),
);

/** PRD F-3.1: recent + carried-over tasks for one-tap restart. */
meRouter.get(
  '/tasks/suggestions',
  asyncHandler(async (req, res) => {
    const user = await loadUser(req.auth!.userId);
    const carried = await prisma.task.findMany({
      where: { userId: user.id, state: 'carried_over' },
      orderBy: { startedAt: 'desc' },
      take: 5,
    });
    const recent = await prisma.task.findMany({
      where: { userId: user.id, state: { in: ['completed', 'paused'] } },
      orderBy: { startedAt: 'desc' },
      take: 5,
    });
    const seen = new Set<string>();
    const suggestions = [...carried, ...recent]
      .filter((t) => (seen.has(t.title) ? false : (seen.add(t.title), true)))
      .slice(0, 8)
      .map((t) => ({ title: t.title, clientId: t.clientId, projectId: t.projectId, carriedFrom: t.state === 'carried_over' ? t.id : null }));
    res.json(suggestions);
  }),
);

/** PRD F-3.4 end-of-day summary. */
meRouter.post(
  '/daily-summary',
  asyncHandler(async (req, res) => {
    const body = z.object({ date: z.string(), note: z.string().max(1000).optional(), confirmed: z.boolean().default(true) }).parse(req.body);
    const user = await loadUser(req.auth!.userId);
    const summary = await prisma.dailySummary.upsert({
      where: { userId_date: { userId: user.id, date: body.date } },
      create: { userId: user.id, date: body.date, note: body.note ?? null, confirmedAt: body.confirmed ? new Date() : null },
      update: { note: body.note ?? null, confirmedAt: body.confirmed ? new Date() : null },
    });
    res.json({ ok: true, id: summary.id });
  }),
);

/** PRD acceptance §4.3: employee can export their own full data at any time. */
meRouter.get(
  '/export',
  asyncHandler(async (req, res) => {
    const user = await loadUser(req.auth!.userId);
    const [sessions, tasks, attendance, statusUpdates, summaries] = await Promise.all([
      prisma.session.findMany({ where: { userId: user.id }, include: { breaks: true } }),
      prisma.task.findMany({ where: { userId: user.id }, include: { intervals: true } }),
      prisma.attendanceDay.findMany({ where: { userId: user.id } }),
      prisma.statusUpdate.findMany({ where: { userId: user.id } }),
      prisma.dailySummary.findMany({ where: { userId: user.id } }),
    ]);
    res.setHeader('Content-Disposition', `attachment; filename="folgo-my-data-${user.id}.json"`);
    res.json({ user: publicUser(user), sessions, tasks, attendance, statusUpdates, summaries, exportedAt: new Date() });
  }),
);

/** PRD F-5.1 personal timesheet. */
meRouter.get(
  '/timesheet',
  asyncHandler(async (req, res) => {
    const user = await loadUser(req.auth!.userId);
    const month = z.string().regex(/^\d{4}-\d{2}$/).parse((req.query.month as string) ?? new Date().toISOString().slice(0, 7));
    const days = await prisma.attendanceDay.findMany({
      where: { userId: user.id, date: { startsWith: month } },
      orderBy: { date: 'asc' },
    });
    const totals = days.reduce(
      (acc, d) => {
        acc.workedMinutes += d.totalWorkedMinutes;
        acc.overtimeMinutes += d.overtimeMinutes;
        if (['present', 'late', 'half_day', 'short'].includes(d.classification)) acc.present += 1;
        if (d.classification === 'late') acc.late += 1;
        if (d.classification === 'leave') acc.leaves += 1;
        return acc;
      },
      { workedMinutes: 0, overtimeMinutes: 0, present: 0, late: 0, leaves: 0 },
    );
    res.json({ month, days, totals });
  }),
);

/** PRD F-5.4 regularisation request. */
meRouter.post(
  '/regularisations',
  asyncHandler(async (req, res) => {
    const body = z
      .object({ date: z.string(), proposed_check_in: z.string().datetime().optional(), proposed_check_out: z.string().datetime().optional(), reason: z.string().min(1) })
      .parse(req.body);
    const user = await loadUser(req.auth!.userId);
    const day = await prisma.attendanceDay.findUnique({ where: { userId_date: { userId: user.id, date: body.date } } });
    const reg = await prisma.regularisationRequest.create({
      data: {
        userId: user.id,
        attendanceDayId: day?.id ?? null,
        date: body.date,
        proposedCheckIn: body.proposed_check_in ? new Date(body.proposed_check_in) : null,
        proposedCheckOut: body.proposed_check_out ? new Date(body.proposed_check_out) : null,
        reason: body.reason,
      },
    });
    res.status(201).json({ ok: true, id: reg.id });
  }),
);

meRouter.get(
  '/leave-balance',
  asyncHandler(async (req, res) => {
    const user = await loadUser(req.auth!.userId);
    const types = await prisma.leaveType.findMany({ where: { orgId: user.orgId } });
    const requests = await prisma.leaveRequest.findMany({ where: { userId: user.id, status: 'approved' } });
    const balances = types.map((t) => {
      const used = requests
        .filter((r) => r.leaveTypeId === t.id)
        .reduce((sum, r) => sum + (r.isHalfDay ? 0.5 : dayspan(r.startDate, r.endDate)), 0);
      return { type: t.name, quota: t.annualQuota, used, remaining: t.annualQuota - used };
    });
    res.json(balances);
  }),
);

meRouter.post(
  '/leave-requests',
  asyncHandler(async (req, res) => {
    const body = z
      .object({ leave_type_id: z.string(), start_date: z.string(), end_date: z.string(), is_half_day: z.boolean().default(false), reason: z.string().optional() })
      .parse(req.body);
    const user = await loadUser(req.auth!.userId);
    const lr = await prisma.leaveRequest.create({
      data: {
        userId: user.id,
        leaveTypeId: body.leave_type_id,
        startDate: body.start_date,
        endDate: body.end_date,
        isHalfDay: body.is_half_day,
        reason: body.reason ?? null,
      },
    });
    res.status(201).json({ ok: true, id: lr.id });
  }),
);

function dayspan(start: string, end: string): number {
  return Math.max(1, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 86400_000) + 1);
}
