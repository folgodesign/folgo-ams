import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { config } from './config.js';
import { prisma } from './prisma.js';
import { generateToken, hashToken } from './crypto.js';

export interface AccessClaims {
  sub: string; // user id
  org: string; // org id
  role: string;
}

export function signAccessToken(claims: AccessClaims): string {
  return jwt.sign(claims, config.jwtAccessSecret, {
    expiresIn: `${config.accessTokenTtlMin}m`,
  });
}

export function verifyAccessToken(token: string): AccessClaims {
  return jwt.verify(token, config.jwtAccessSecret) as AccessClaims;
}

/**
 * Issue a refresh token in a token family (PRD F-1.4). Returns the raw token
 * to set as a cookie; only its hash is persisted.
 */
export async function issueRefreshToken(userId: string, familyId?: string): Promise<string> {
  const raw = generateToken();
  const expiresAt = new Date(Date.now() + config.refreshTokenTtlDays * 86400_000);
  await prisma.refreshToken.create({
    data: {
      userId,
      familyId: familyId ?? crypto.randomUUID(),
      tokenHash: hashToken(raw),
      expiresAt,
    },
  });
  return raw;
}

/**
 * Rotate a refresh token. Reuse detection: if a token that was already spent
 * (usedAt set) or revoked is replayed, the whole family is revoked and null is
 * returned, forcing re-authentication.
 */
export async function rotateRefreshToken(
  raw: string,
): Promise<{ userId: string; token: string } | null> {
  const record = await prisma.refreshToken.findUnique({ where: { tokenHash: hashToken(raw) } });
  if (!record) return null;

  const spentOrRevoked = record.usedAt || record.revokedAt || record.expiresAt < new Date();
  if (spentOrRevoked) {
    // Reuse of a spent token => stolen. Revoke the entire family.
    await prisma.refreshToken.updateMany({
      where: { familyId: record.familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return null;
  }

  await prisma.refreshToken.update({ where: { id: record.id }, data: { usedAt: new Date() } });
  const next = await issueRefreshToken(record.userId, record.familyId);
  return { userId: record.userId, token: next };
}

export async function revokeAllUserTokens(userId: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export function refreshCookieOptions(remember = true) {
  return {
    httpOnly: true,
    secure: config.isProd,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: (remember ? config.refreshTokenTtlDays : 1) * 86400_000,
  };
}
