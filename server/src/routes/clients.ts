import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { asyncHandler } from '../middleware/errors.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

export const clientsRouter = Router();
clientsRouter.use(requireAuth);

clientsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json(await prisma.client.findMany({ where: { orgId: req.auth!.orgId, isActive: true }, orderBy: { name: 'asc' } }));
  }),
);

clientsRouter.post(
  '/',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const body = z.object({ name: z.string().min(1), colour: z.string().optional() }).parse(req.body);
    res.status(201).json(await prisma.client.create({ data: { name: body.name, colour: body.colour ?? '#EB5E29', orgId: req.auth!.orgId } }));
  }),
);

export const projectsRouter = Router();
projectsRouter.use(requireAuth);

projectsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const where: Record<string, unknown> = { orgId: req.auth!.orgId, isActive: true };
    if (req.query.client) where.clientId = req.query.client as string;
    res.json(await prisma.project.findMany({ where, include: { client: true }, orderBy: { name: 'asc' } }));
  }),
);

projectsRouter.post(
  '/',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const body = z.object({ name: z.string().min(1), clientId: z.string().optional(), colour: z.string().optional() }).parse(req.body);
    res.status(201).json(
      await prisma.project.create({ data: { name: body.name, clientId: body.clientId ?? null, colour: body.colour ?? '#5B9DFF', orgId: req.auth!.orgId } }),
    );
  }),
);
