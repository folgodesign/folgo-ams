import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { asyncHandler, HttpError } from '../middleware/errors.js';
import { requireAuth, requireRole, clientIp } from '../middleware/auth.js';
import { recomputeAttendanceDay } from '../services/attendance.js';
import { audit } from '../lib/audit.js';

export const attendanceRouter = Router();
attendanceRouter.use(requireAuth);

/**
 * PRD F-5.3: admin correction of a day's check-in/out times. Requires a reason,
 * writes before/after to the audit log, and marks the record edited. Validation
 * blocks check-out earlier than check-in (acceptance §4.5).
 */
attendanceRouter.patch(
  '/:dayId',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        checkIn: z.string().datetime().optional(),
        checkOut: z.string().datetime().optional(),
        classification: z.string().optional(),
        reason: z.string().min(1),
      })
      .parse(req.body);

    const day = await prisma.attendanceDay.findFirst({
      where: { id: req.params.dayId, user: { orgId: req.auth!.orgId } },
      include: { sessions: { orderBy: { checkInAt: 'asc' } } },
    });
    if (!day) throw new HttpError(404, 'record not found');

    const checkIn = body.checkIn ? new Date(body.checkIn) : day.firstCheckIn;
    const checkOut = body.checkOut ? new Date(body.checkOut) : day.lastCheckOut;
    if (checkIn && checkOut && checkOut < checkIn) {
      throw new HttpError(400, 'check-out cannot be earlier than check-in', 'invalid_times');
    }

    const before = { firstCheckIn: day.firstCheckIn, lastCheckOut: day.lastCheckOut, classification: day.classification };

    // Apply edits to the first/last session so recompute reflects them.
    if (body.checkIn && day.sessions[0]) {
      await prisma.session.update({ where: { id: day.sessions[0].id }, data: { checkInAt: new Date(body.checkIn) } });
    }
    if (body.checkOut && day.sessions.length) {
      await prisma.session.update({ where: { id: day.sessions[day.sessions.length - 1].id }, data: { checkOutAt: new Date(body.checkOut) } });
    }

    await recomputeAttendanceDay(day.userId, day.date);
    const updated = await prisma.attendanceDay.update({
      where: { id: day.id },
      data: {
        classification: body.classification ?? undefined,
        isEdited: true,
        editedBy: req.auth!.userId,
        editReason: body.reason,
      },
    });
    await audit({
      orgId: req.auth!.orgId,
      actorId: req.auth!.userId,
      action: 'edit_attendance',
      entityType: 'attendance_day',
      entityId: day.id,
      before,
      after: { firstCheckIn: updated.firstCheckIn, lastCheckOut: updated.lastCheckOut, classification: updated.classification, reason: body.reason },
      ip: clientIp(req),
    });
    res.json(updated);
  }),
);

/** PRD F-5.2: team timesheet matrix (employees × days for a month). */
attendanceRouter.get(
  '/team/timesheet',
  requireRole('lead'),
  asyncHandler(async (req, res) => {
    const month = z.string().regex(/^\d{4}-\d{2}$/).parse((req.query.month as string) ?? new Date().toISOString().slice(0, 7));
    const users = await prisma.user.findMany({ where: { orgId: req.auth!.orgId, status: 'active' }, orderBy: { name: 'asc' } });
    const days = await prisma.attendanceDay.findMany({ where: { userId: { in: users.map((u) => u.id) }, date: { startsWith: month } } });
    res.json({
      month,
      users: users.map((u) => ({ id: u.id, name: u.name, avatarUrl: u.avatarUrl })),
      records: days.map((d) => ({ id: d.id, userId: d.userId, date: d.date, workedMinutes: d.totalWorkedMinutes, classification: d.classification, isEdited: d.isEdited })),
    });
  }),
);
