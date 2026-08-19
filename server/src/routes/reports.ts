import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { asyncHandler } from '../middleware/errors.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { audit } from '../lib/audit.js';
import { clientIp } from '../middleware/auth.js';

export const reportsRouter = Router();
reportsRouter.use(requireAuth);

function fmtHours(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${m}m`;
}

/** PRD F-7.1: monthly attendance summary per employee. */
reportsRouter.get(
  '/monthly',
  requireRole('lead'),
  asyncHandler(async (req, res) => {
    const month = z.string().regex(/^\d{4}-\d{2}$/).parse((req.query.month as string) ?? new Date().toISOString().slice(0, 7));
    const users = await prisma.user.findMany({ where: { orgId: req.auth!.orgId, status: 'active' }, orderBy: { name: 'asc' } });
    const rows = [];
    for (const u of users) {
      const days = await prisma.attendanceDay.findMany({ where: { userId: u.id, date: { startsWith: month } } });
      const summary = days.reduce(
        (acc, d) => {
          if (['present', 'late', 'half_day', 'short'].includes(d.classification)) acc.present += 1;
          if (d.classification === 'late') acc.late += 1;
          if (d.classification === 'half_day') acc.halfDays += 1;
          if (d.classification === 'absent') acc.absent += 1;
          if (d.classification === 'leave') acc.leaves += 1;
          acc.totalMinutes += d.totalWorkedMinutes;
          acc.overtimeMinutes += d.overtimeMinutes;
          return acc;
        },
        { present: 0, late: 0, halfDays: 0, absent: 0, leaves: 0, totalMinutes: 0, overtimeMinutes: 0 },
      );
      rows.push({ userId: u.id, name: u.name, employeeCode: u.employeeCode, ...summary, totalHours: fmtHours(summary.totalMinutes), overtime: fmtHours(summary.overtimeMinutes) });
    }
    res.json({ month, rows });
  }),
);

/** PRD F-7.3: admin dashboard widgets. */
reportsRouter.get(
  '/dashboard',
  requireRole('lead'),
  asyncHandler(async (req, res) => {
    const orgId = req.auth!.orgId;
    const org = await prisma.organisation.findUnique({ where: { id: orgId } });
    const tz = org?.timezone ?? 'Asia/Kolkata';
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

    const headcount = await prisma.user.count({ where: { orgId, status: 'active' } });
    const todays = await prisma.attendanceDay.findMany({ where: { user: { orgId }, date: today } });
    const present = todays.filter((d) => ['present', 'late', 'half_day', 'short'].includes(d.classification)).length;
    const late = todays.filter((d) => d.classification === 'late').length;
    const onLeave = todays.filter((d) => d.classification === 'leave').length;

    const workingNow = await prisma.statusUpdate.count({ where: { user: { orgId }, endedAt: null, status: { in: ['WORKING', 'IN_MEETING', 'FOCUS'] } } });

    // Top clients by logged time this month.
    const month = today.slice(0, 7);
    const tasks = await prisma.task.findMany({ where: { orgId, startedAt: { gte: new Date(`${month}-01T00:00:00`) }, clientId: { not: null } }, include: { client: true } });
    const byClient = new Map<string, number>();
    for (const t of tasks) {
      const name = t.client?.name ?? 'Unassigned';
      byClient.set(name, (byClient.get(name) ?? 0) + t.accumulatedSeconds);
    }
    const topClients = [...byClient.entries()].map(([name, s]) => ({ name, hours: +(s / 3600).toFixed(1) })).sort((a, b) => b.hours - a.hours).slice(0, 5);

    res.json({ headcount, present, absent: Math.max(0, headcount - present - onLeave), late, onLeave, workingNow, topClients });
  }),
);

/** PRD F-7.2: CSV export of the monthly summary (payroll handoff). */
reportsRouter.get(
  '/export',
  requireRole('lead'),
  asyncHandler(async (req, res) => {
    const type = (req.query.type as string) ?? 'monthly';
    const month = z.string().regex(/^\d{4}-\d{2}$/).parse((req.query.month as string) ?? new Date().toISOString().slice(0, 7));
    const users = await prisma.user.findMany({ where: { orgId: req.auth!.orgId, status: 'active' }, orderBy: { name: 'asc' } });

    const header = ['Employee', 'Employee Code', 'Present', 'Late', 'Half-days', 'Absent', 'Leaves', 'Total Hours', 'Overtime Hours'];
    const lines = [header.join(',')];
    for (const u of users) {
      const days = await prisma.attendanceDay.findMany({ where: { userId: u.id, date: { startsWith: month } } });
      const s = days.reduce(
        (acc, d) => {
          if (['present', 'late', 'half_day', 'short'].includes(d.classification)) acc.present += 1;
          if (d.classification === 'late') acc.late += 1;
          if (d.classification === 'half_day') acc.half += 1;
          if (d.classification === 'absent') acc.absent += 1;
          if (d.classification === 'leave') acc.leaves += 1;
          acc.min += d.totalWorkedMinutes;
          acc.ot += d.overtimeMinutes;
          return acc;
        },
        { present: 0, late: 0, half: 0, absent: 0, leaves: 0, min: 0, ot: 0 },
      );
      const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
      lines.push([esc(u.name), esc(u.employeeCode ?? ''), s.present, s.late, s.half, s.absent, s.leaves, (s.min / 60).toFixed(2), (s.ot / 60).toFixed(2)].join(','));
    }
    await audit({ orgId: req.auth!.orgId, actorId: req.auth!.userId, action: 'export_report', entityType: 'report', entityId: `${type}:${month}`, ip: clientIp(req) });
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="folgo-${type}-${month}.csv"`);
    res.send(lines.join('\n'));
  }),
);
