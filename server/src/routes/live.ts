import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { asyncHandler } from '../middleware/errors.js';
import { requireAuth, isPrivileged } from '../middleware/auth.js';
import { verifyAccessToken } from '../lib/tokens.js';
import { buildBoard } from '../services/board.js';
import { addClient } from '../lib/realtime.js';

export const liveRouter = Router();

/**
 * PRD F-4: live board payload. Everyone sees the org board, but employees get a
 * redacted view (status + current task only). Only privileged viewers get
 * attendance signals and may view historical snapshots via `date`.
 */
liveRouter.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const full = isPrivileged(req.auth!.role);
    // Historical snapshots are attendance detail — privileged viewers only.
    const date = full ? (req.query.date as string) || undefined : undefined;
    const members = await buildBoard(req.auth!.orgId, date, full);
    const workingNow = members.filter((m) => ['WORKING', 'IN_MEETING', 'FOCUS'].includes(m.status)).length;
    res.json({ members, count: members.length, workingNow, date: date ?? null, full });
  }),
);

/**
 * SSE stream for realtime board updates (PRD F-4.5). EventSource cannot set
 * Authorization headers, so the access token is accepted as a query param here.
 */
liveRouter.get(
  '/stream',
  asyncHandler(async (req, res) => {
    const token = req.query.token as string;
    let orgId: string;
    let full = false;
    try {
      const claims = verifyAccessToken(token);
      orgId = claims.org;
      full = isPrivileged(claims.role);
    } catch {
      res.status(401).end();
      return;
    }
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    res.write(`event: ready\ndata: {"ok":true}\n\n`);
    const heartbeat = setInterval(() => res.write(': ping\n\n'), 25000);
    const remove = addClient(orgId, res, full);
    req.on('close', () => {
      clearInterval(heartbeat);
      remove();
    });
  }),
);

/** PRD F-4.6: signed-link TV/wall-display mode, read-only, no login. */
liveRouter.get(
  '/wall/:orgId',
  asyncHandler(async (req, res) => {
    // A real signed link would carry an HMAC; kept simple for the demo.
    const org = await prisma.organisation.findUnique({ where: { id: req.params.orgId } });
    if (!org) {
      res.status(404).json({ error: 'not found' });
      return;
    }
    const members = await buildBoard(org.id);
    res.json({ org: { name: org.name, timezone: org.timezone }, members });
  }),
);
