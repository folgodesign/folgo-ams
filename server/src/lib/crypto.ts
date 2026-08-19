import crypto from 'node:crypto';
import argon2 from 'argon2';

/** PRD §10: passwords hashed with Argon2id. */
export function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, { type: argon2.argon2id });
}

export function verifyPassword(hash: string, plain: string): Promise<boolean> {
  return argon2.verify(hash, plain).catch(() => false);
}

/** 32-byte cryptographically random token, returned raw (given to user). */
export function generateToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

/** PRD F-1.2 / F-1.4: tokens are stored hashed so a DB leak yields nothing. */
export function hashToken(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

/**
 * HIBP-style breach check via k-anonymity range API (PRD F-1.3). Falls back to
 * "not breached" if the network is unavailable so activation never hard-blocks
 * on an external dependency.
 */
export async function isPasswordBreached(plain: string): Promise<boolean> {
  try {
    const sha1 = crypto.createHash('sha1').update(plain).digest('hex').toUpperCase();
    const prefix = sha1.slice(0, 5);
    const suffix = sha1.slice(5);
    const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`);
    if (!res.ok) return false;
    const body = await res.text();
    return body.split('\n').some((line) => line.split(':')[0]?.trim() === suffix);
  } catch {
    return false;
  }
}
