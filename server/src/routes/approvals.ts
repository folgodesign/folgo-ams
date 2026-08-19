import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { asyncHandler, HttpError } from '../middleware/errors.js';
import { requireAuth, requireRole, clientIp } from '../middleware/auth.js';
import { recomputeAttendanceDay } from '../services/attendance.js';
import { audit } from '../lib/audit.js';

export const approvalsRouter = Router();
approvalsRouter.use(requireAuth, requireRole('lead'));

/** PRD S10: approvals inbox — pending leave + regularisation requests. */
approvalsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const orgId = req.auth!.orgId;
    const leave = await prisma.leaveRequest.findMany({
      where: { status: 'pending', user: { orgId } },
      include: { user: { select: { name: true, avatarUrl: true } }, leaveType: true },
      orderBy: { createdAt: 'desc' },
    });
    const regularisations = await prisma.regularisationRequest.findMany({
      where: { status: 'pending', user: { orgId } },
      include: { user: { select: { name: true, avatarUrl: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ leave, regularisations });
  }),
);

approvalsRouter.post(
  '/leave/:id',
  asyncHandler(async (req, res) => {
    const body = z.object({ decision: z.enum(['approved', 'rejected']), note: z.string().optional() }).parse(req.body);
    const lr = await prisma.leaveRequest.findFirst({ where: { id: req.params.id, user: { orgId: req.auth!.orgId } } });
    if (!lr) throw new HttpError(404, 'not found');
    const updated = await prisma.leaveRequest.update({
      where: { id: lr.id },
      data: { status: body.decision, decidedBy: req.auth!.userId, decidedAt: new Date(), decisionNote: body.note ?? null },
    });
    // Approved leave feeds the timesheet (PRD F-6.4).
    if (body.decision === 'approved') {
      for (let d = new Date(lr.startDate); d <= new Date(lr.endDate); d.setDate(d.getDate() + 1)) {
        const date = d.toISOString().slice(0, 10);
        await prisma.attendanceDay.upsert({ where: { userId_date: { userId: lr.userId, date } }, create: { userId: lr.userId, date, classification: 'leave' }, update: {} });
        await recomputeAttendanceDay(lr.userId, date);
      }
    }
    await audit({ orgId: req.auth!.orgId, actorId: req.auth!.userId, action: `leave_${body.decision}`, entityType: 'leave_request', entityId: lr.id, ip: clientIp(req) });
    res.json(updated);
  }),
);

approvalsRouter.post(
  '/regularisations/:id',
  asyncHandler(async (req, res) => {
    const body = z.object({ decision: z.enum(['approved', 'rejected']) }).parse(req.body);
    const reg = await prisma.regularisationRequest.findFirst({ where: { id: req.params.id, user: { orgId: req.auth!.orgId } } });
    if (!reg) throw new HttpError(404, 'not found');
    await prisma.regularisationRequest.update({ where: { id: reg.id }, data: { status: body.decision, decidedBy: req.auth!.userId, decidedAt: new Date() } });

    if (body.decision === 'approved' && reg.attendanceDayId) {
      const day = await prisma.attendanceDay.findUnique({ where: { id: reg.attendanceDayId }, include: { sessions: { orderBy: { checkInAt: 'asc' } } } });
      if (day && day.sessions.length) {
        if (reg.proposedCheckIn) await prisma.session.update({ where: { id: day.sessions[0].id }, data: { checkInAt: reg.proposedCheckIn } });
        if (reg.proposedCheckOut) await prisma.session.update({ where: { id: day.sessions[day.sessions.length - 1].id }, data: { checkOutAt: reg.proposedCheckOut } });
        await prisma.attendanceDay.update({ where: { id: day.id }, data: { isEdited: true, editedBy: req.auth!.userId, editReason: 'regularisation approved' } });
        await recomputeAttendanceDay(reg.userId, reg.date);
      }
    }
    await audit({ orgId: req.auth!.orgId, actorId: req.auth!.userId, action: `regularisation_${body.decision}`, entityType: 'regularisation', entityId: reg.id, ip: clientIp(req) });
    res.json({ ok: true });
  }),
);
