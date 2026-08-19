import type { Request, Response, NextFunction } from 'express';

/**
 * Simple in-memory sliding-window limiter. PRD F-1.4: auth endpoints limited to
 * 5 failed attempts / 15 min, keyed on both account and IP. In production this
 * belongs in Redis; the interface stays the same.
 */
interface Bucket {
  hits: number[];
}
const store = new Map<string, Bucket>();

export function rateLimit(opts: { windowMs: number; max: number; keyFn: (req: Request) => string }) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const key = opts.keyFn(req);
    const now = Date.now();
    const bucket = store.get(key) ?? { hits: [] };
    bucket.hits = bucket.hits.filter((t) => now - t < opts.windowMs);
    if (bucket.hits.length >= opts.max) {
      const retryMs = opts.windowMs - (now - bucket.hits[0]);
      res.setHeader('Retry-After', Math.ceil(retryMs / 1000));
      res.status(429).json({ error: 'too_many_requests' });
      return;
    }
    bucket.hits.push(now);
    store.set(key, bucket);
    next();
  };
}
