import { describe, it, expect } from 'vitest';
import { hashToken, generateToken } from './crypto.js';

describe('token hashing (PRD F-1.2 / F-1.4)', () => {
  it('produces a stable non-reversible hash', () => {
    const raw = generateToken();
    expect(hashToken(raw)).toBe(hashToken(raw));
    expect(hashToken(raw)).not.toContain(raw);
    expect(hashToken(raw)).toHaveLength(64); // sha256 hex
  });

  it('generates distinct 32-byte tokens', () => {
    const a = generateToken();
    const b = generateToken();
    expect(a).not.toBe(b);
    // base64url of 32 bytes ~ 43 chars
    expect(a.length).toBeGreaterThanOrEqual(43);
  });
});
