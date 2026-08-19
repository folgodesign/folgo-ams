import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { config } from '../lib/config.js';
import {
  hashPassword,
  verifyPassword,
  hashToken,
  isPasswordBreached,
} from '../lib/crypto.js';
import {
  signAccessToken,
  issueRefreshToken,
  rotateRefreshToken,
  revokeAllUserTokens,
  refreshCookieOptions,
} from '../lib/tokens.js';
import { asyncHandler, HttpError } from '../middleware/errors.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { clientIp } from '../middleware/auth.js';
import { audit } from '../lib/audit.js';

export const authRouter = Router();

function accessTtlSeconds() {
  return config.accessTokenTtlMin * 60;
}

async function issueSession(res: import('express').Response, user: { id: string; orgId: string; role: string }) {
  const access = signAccessToken({ sub: user.id, org: user.orgId, role: user.role });
  const refresh = await issueRefreshToken(user.id);
  res.cookie('folgo_refresh', refresh, refreshCookieOptions(true));
  return { access, expiresIn: accessTtlSeconds() };
}

/** PRD F-1.7: one-time bootstrap wizard creates the first Super Admin. */
authRouter.post(
  '/bootstrap',
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        secret: z.string(),
        orgName: z.string().min(1),
        name: z.string().min(1),
        email: z.string().email(),
        password: z.string().min(12),
        timezone: z.string().default('Asia/Kolkata'),
      })
      .parse(req.body);

    if (body.secret !== config.bootstrapSecret) throw new HttpError(403, 'invalid bootstrap secret');

    const existing = await prisma.organisation.findFirst({ where: { bootstrapped: true } });
    if (existing) throw new HttpError(409, 'already bootstrapped', 'already_bootstrapped');

    if (await isPasswordBreached(body.password)) {
      throw new HttpError(400, 'password found in known breaches', 'password_breached');
    }

    const org = await prisma.organisation.create({
      data: { name: body.orgName, timezone: body.timezone, bootstrapped: true },
    });
    // A sensible default schedule so classification works out of the box.
    const schedule = await prisma.workSchedule.create({
      data: { orgId: org.id, name: 'Standard 10–7' },
    });
    const user = await prisma.user.create({
      data: {
        orgId: org.id,
        name: body.name,
        email: body.email.toLowerCase(),
        role: 'super_admin',
        status: 'active',
        passwordHash: await hashPassword(body.password),
        workScheduleId: schedule.id,
        timezone: body.timezone,
        consentVersion: config.consentVersion,
        consentAt: new Date(),
      },
    });
    await audit({ orgId: org.id, actorId: user.id, action: 'bootstrap', entityType: 'org', entityId: org.id, ip: clientIp(req) });

    const tokens = await issueSession(res, user);
    res.status(201).json({ ...tokens, user: publicUser(user) });
  }),
);

authRouter.get(
  '/bootstrap-status',
  asyncHandler(async (_req, res) => {
    const existing = await prisma.organisation.findFirst({ where: { bootstrapped: true } });
    res.json({ bootstrapped: !!existing });
  }),
);

const loginLimiter = rateLimit({
  windowMs: 15 * 60_000,
  max: 5,
  keyFn: (req) => `login:${clientIp(req)}:${(req.body?.email ?? '').toLowerCase()}`,
});

authRouter.post(
  '/login',
  loginLimiter,
  asyncHandler(async (req, res) => {
    const body = z.object({ email: z.string().email(), password: z.string() }).parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: body.email.toLowerCase() } });

    // Identical response whether or not the account exists / is active
    // (PRD F-1.4: the form must not become a directory enumerator).
    const invalid = new HttpError(401, 'invalid email or password', 'invalid_credentials');
    if (!user || !user.passwordHash || user.status !== 'active') {
      // Still run a hash verify to keep timing uniform-ish.
      await verifyPassword('$argon2id$v=19$m=65536,t=3,p=4$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', body.password);
      throw invalid;
    }
    if (!(await verifyPassword(user.passwordHash, body.password))) throw invalid;

    const tokens = await issueSession(res, user);
    await audit({ orgId: user.orgId, actorId: user.id, action: 'login', entityType: 'user', entityId: user.id, ip: clientIp(req) });
    res.json({ ...tokens, user: publicUser(user) });
  }),
);

authRouter.post(
  '/refresh',
  asyncHandler(async (req, res) => {
    const raw = req.cookies?.folgo_refresh;
    if (!raw) throw new HttpError(401, 'no refresh token', 'no_refresh');
    const rotated = await rotateRefreshToken(raw);
    if (!rotated) {
      res.clearCookie('folgo_refresh', { path: '/' });
      throw new HttpError(401, 'refresh token invalid or reused', 'refresh_invalid');
    }
    const user = await prisma.user.findUnique({ where: { id: rotated.userId } });
    if (!user || user.status !== 'active') throw new HttpError(401, 'inactive', 'inactive');
    res.cookie('folgo_refresh', rotated.token, refreshCookieOptions(true));
    const access = signAccessToken({ sub: user.id, org: user.orgId, role: user.role });
    res.json({ access, expiresIn: accessTtlSeconds(), user: publicUser(user) });
  }),
);

authRouter.post(
  '/logout',
  asyncHandler(async (req, res) => {
    const raw = req.cookies?.folgo_refresh;
    if (raw) {
      const record = await prisma.refreshToken.findUnique({ where: { tokenHash: hashToken(raw) } });
      if (record) await revokeAllUserTokens(record.userId);
    }
    res.clearCookie('folgo_refresh', { path: '/' });
    res.json({ ok: true });
  }),
);

/** PRD F-1.3: fetch invite details for the activation screen. */
authRouter.get(
  '/invite/:token',
  asyncHandler(async (req, res) => {
    const invite = await prisma.invite.findUnique({
      where: { tokenHash: hashToken(req.params.token) },
      include: { user: { include: { org: true } } },
    });
    if (!invite) throw new HttpError(404, 'invite not found', 'invite_not_found');
    if (invite.usedAt) {
      res.json({ status: 'used' });
      return;
    }
    if (invite.expiresAt < new Date()) {
      res.json({ status: 'expired' });
      return;
    }
    res.json({
      status: 'valid',
      user: { name: invite.user.name, email: invite.user.email, designation: invite.user.designation },
      org: { name: invite.user.org.name },
      consentVersion: config.consentVersion,
    });
  }),
);

/** PRD F-1.3: activate an invited account (email+password fallback path). */
authRouter.post(
  '/activate',
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        token: z.string(),
        password: z.string().min(12),
        phone: z.string().optional(),
        avatarUrl: z.string().url().optional(),
        consentAcknowledged: z.literal(true),
      })
      .parse(req.body);

    const invite = await prisma.invite.findUnique({
      where: { tokenHash: hashToken(body.token) },
      include: { user: true },
    });
    if (!invite || invite.usedAt || invite.expiresAt < new Date()) {
      throw new HttpError(400, 'invite invalid or expired', 'invite_invalid');
    }
    if (await isPasswordBreached(body.password)) {
      throw new HttpError(400, 'password found in known breaches', 'password_breached');
    }

    const user = await prisma.user.update({
      where: { id: invite.userId },
      data: {
        status: 'active',
        passwordHash: await hashPassword(body.password),
        phone: body.phone ?? invite.user.phone,
        avatarUrl: body.avatarUrl ?? invite.user.avatarUrl,
        consentVersion: config.consentVersion,
        consentAt: new Date(),
      },
    });
    await prisma.invite.update({ where: { id: invite.id }, data: { usedAt: new Date() } });
    await audit({ orgId: user.orgId, actorId: user.id, action: 'activate', entityType: 'user', entityId: user.id, ip: clientIp(req) });

    const tokens = await issueSession(res, user);
    res.json({ ...tokens, user: publicUser(user) });
  }),
);

export function publicUser(u: {
  id: string;
  name: string;
  email: string;
  role: string;
  orgId: string;
  avatarUrl?: string | null;
  designation?: string | null;
  teamId?: string | null;
  timezone?: string | null;
}) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    orgId: u.orgId,
    avatarUrl: u.avatarUrl ?? null,
    designation: u.designation ?? null,
    teamId: u.teamId ?? null,
    timezone: u.timezone ?? null,
  };
}
