import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { asyncHandler } from '../middleware/errors.js';
import { requireAuth, requireRole, clientIp } from '../middleware/auth.js';
import { audit } from '../lib/audit.js';

export const settingsRouter = Router();
settingsRouter.use(requireAuth);

// ---- Work schedules (PRD F-6.1) ----
settingsRouter.get(
  '/schedules',
  asyncHandler(async (req, res) => {
    res.json(await prisma.workSchedule.findMany({ where: { orgId: req.auth!.orgId } }));
  }),
);

settingsRouter.post(
  '/schedules',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        name: z.string().min(1),
        workingDays: z.array(z.number().int().min(0).max(6)).default([1, 2, 3, 4, 5]),
        startTime: z.string().default('10:00'),
        endTime: z.string().default('19:00'),
        requiredHours: z.number().default(8),
        graceMinutes: z.number().int().default(15),
        halfDayThresholdHours: z.number().default(4),
        breakAllowanceMinutes: z.number().int().default(60),
        autoDeductBreakMinutes: z.number().int().default(0),
      })
      .parse(req.body);
    const sched = await prisma.workSchedule.create({
      data: { ...body, workingDays: JSON.stringify(body.workingDays), orgId: req.auth!.orgId },
    });
    await audit({ orgId: req.auth!.orgId, actorId: req.auth!.userId, action: 'create_schedule', entityType: 'schedule', entityId: sched.id, ip: clientIp(req) });
    res.status(201).json(sched);
  }),
);

settingsRouter.patch(
  '/schedules/:id',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        name: z.string().optional(),
        workingDays: z.array(z.number()).optional(),
        startTime: z.string().optional(),
        endTime: z.string().optional(),
        requiredHours: z.number().optional(),
        graceMinutes: z.number().optional(),
        halfDayThresholdHours: z.number().optional(),
        breakAllowanceMinutes: z.number().optional(),
        autoDeductBreakMinutes: z.number().optional(),
      })
      .parse(req.body);
    const data: Record<string, unknown> = { ...body };
    if (body.workingDays) data.workingDays = JSON.stringify(body.workingDays);
    const sched = await prisma.workSchedule.update({ where: { id: req.params.id }, data });
    res.json(sched);
  }),
);

// ---- Holidays (PRD F-6.3) ----
settingsRouter.get(
  '/holidays',
  asyncHandler(async (req, res) => {
    res.json(await prisma.holiday.findMany({ where: { orgId: req.auth!.orgId }, orderBy: { date: 'asc' } }));
  }),
);

settingsRouter.post(
  '/holidays',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const body = z.object({ date: z.string(), name: z.string().min(1), region: z.string().optional() }).parse(req.body);
    const h = await prisma.holiday.create({ data: { ...body, orgId: req.auth!.orgId } });
    res.status(201).json(h);
  }),
);

// ---- Leave types (PRD F-6.4) ----
settingsRouter.get(
  '/leave-types',
  asyncHandler(async (req, res) => {
    res.json(await prisma.leaveType.findMany({ where: { orgId: req.auth!.orgId } }));
  }),
);

settingsRouter.post(
  '/leave-types',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const body = z.object({ name: z.string().min(1), annualQuota: z.number().int().default(0), isPaid: z.boolean().default(true) }).parse(req.body);
    res.status(201).json(await prisma.leaveType.create({ data: { ...body, orgId: req.auth!.orgId } }));
  }),
);

// ---- Teams ----
settingsRouter.get(
  '/teams',
  asyncHandler(async (req, res) => {
    res.json(await prisma.team.findMany({ where: { orgId: req.auth!.orgId } }));
  }),
);

settingsRouter.post(
  '/teams',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const body = z.object({ name: z.string().min(1), leadId: z.string().optional() }).parse(req.body);
    res.status(201).json(await prisma.team.create({ data: { ...body, orgId: req.auth!.orgId } }));
  }),
);
