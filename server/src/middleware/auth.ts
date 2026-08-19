import type { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../lib/tokens.js';
import { prisma } from '../lib/prisma.js';

export interface AuthContext {
  userId: string;
  orgId: string;
  role: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
  if (!token) {
    res.status(401).json({ error: 'unauthenticated' });
    return;
  }
  try {
    const claims = verifyAccessToken(token);
    req.auth = { userId: claims.sub, orgId: claims.org, role: claims.role };
    // Fire-and-forget last-seen update (presence signal).
    prisma.user.update({ where: { id: claims.sub }, data: { lastSeenAt: new Date() } }).catch(() => {});
    next();
  } catch {
    res.status(401).json({ error: 'token_invalid' });
  }
}

const ROLE_RANK: Record<string, number> = { employee: 0, lead: 1, admin: 2, super_admin: 3 };

/** Role checks are enforced server-side on every endpoint (PRD §10). */
export function requireRole(min: 'lead' | 'admin' | 'super_admin') {
  return (req: Request, res: Response, next: NextFunction): void => {
    const role = req.auth?.role;
    if (!role || (ROLE_RANK[role] ?? -1) < ROLE_RANK[min]) {
      res.status(403).json({ error: 'forbidden' });
      return;
    }
    next();
  };
}

export function clientIp(req: Request): string {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string') return fwd.split(',')[0].trim();
  return req.socket.remoteAddress ?? 'unknown';
}
