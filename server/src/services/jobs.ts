import { prisma } from '../lib/prisma.js';
import { localMinutes } from '../lib/time.js';
import { recomputeAttendanceDay, dateForUser } from './attendance.js';
import { setStatus } from './status.js';

/**
 * Auto-checkout sweep (PRD F-2.5). Runs periodically; for any session still
 * open past the org cutoff (default 23:59 local), close it at the last recorded
 * activity and flag it AUTO_CLOSED. The employee is prompted to confirm on next
 * login (a regularisation opportunity).
 */
export async function autoCheckoutSweep(cutoffMinute = 23 * 60 + 59): Promise<number> {
  const openSessions = await prisma.session.findMany({
    where: { checkOutAt: null },
    include: { user: { include: { org: true } }, breaks: true, statusUpdates: { orderBy: { startedAt: 'desc' }, take: 1 } },
  });
  let closed = 0;
  const now = new Date();
  for (const s of openSessions) {
    const tz = s.user.timezone || s.user.org.timezone;
    if (localMinutes(now, tz) < cutoffMinute) continue;

    // Last activity = latest of last status change / last break end / check-in.
    const lastStatus = s.statusUpdates[0]?.startedAt;
    const lastBreak = s.breaks.map((b) => b.endedAt).filter(Boolean).sort().pop() as Date | undefined;
    const lastActivity = [s.checkInAt, lastStatus, lastBreak].filter(Boolean).sort((a, b) => (a as Date).getTime() - (b as Date).getTime()).pop() as Date;

    await prisma.break.updateMany({ where: { sessionId: s.id, endedAt: null }, data: { endedAt: lastActivity } });
    await prisma.session.update({ where: { id: s.id }, data: { checkOutAt: lastActivity, autoClosed: true } });
    await setStatus(s.userId, 'CHECKED_OUT', { sessionId: s.id });
    await recomputeAttendanceDay(s.userId, dateForUser(s.checkInAt, tz));

    await prisma.notification.create({
      data: { userId: s.userId, type: 'auto_checkout', payloadJson: JSON.stringify({ sessionId: s.id, at: lastActivity }) },
    });
    closed += 1;
  }
  return closed;
}

export function startJobs(): void {
  // Sweep every 10 minutes. A production build would use BullMQ/Celery.
  setInterval(() => {
    autoCheckoutSweep().catch((e) => console.error('auto-checkout sweep failed', e));
  }, 10 * 60_000);
}
