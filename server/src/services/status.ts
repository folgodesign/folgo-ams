import { prisma } from '../lib/prisma.js';
import { publish } from '../lib/realtime.js';
import { currentStatus } from './board.js';
import { liveSeconds } from './tasks.js';

/**
 * Transition a user's live status: close the open StatusUpdate and open a new
 * one. Statuses answer availability, separate from tasks (PRD F-3.3).
 */
export async function setStatus(
  userId: string,
  status: string,
  opts: { sessionId?: string | null; backInMinutes?: number | null; note?: string | null } = {},
) {
  const now = new Date();
  await prisma.statusUpdate.updateMany({
    where: { userId, endedAt: null },
    data: { endedAt: now },
  });
  await prisma.statusUpdate.create({
    data: {
      userId,
      sessionId: opts.sessionId ?? null,
      status,
      backInMinutes: opts.backInMinutes ?? null,
      note: opts.note ?? null,
      startedAt: now,
    },
  });
}

/** Push a single member's fresh state to the org's live board subscribers. */
export async function publishMember(orgId: string, userId: string) {
  const u = await prisma.user.findUnique({ where: { id: userId }, include: { team: true, org: true } });
  if (!u) return;
  const status = await currentStatus(userId);
  const task = await prisma.task.findFirst({
    where: { userId, state: 'in_progress' },
    include: { intervals: true, client: true, project: true },
    orderBy: { startedAt: 'desc' },
  });
  publish(orgId, 'member', {
    id: u.id,
    name: u.name,
    avatarUrl: u.avatarUrl,
    designation: u.designation,
    teamId: u.teamId,
    teamName: u.team?.name ?? null,
    timezone: u.timezone || u.org.timezone,
    status: status.status,
    statusSince: status.since?.toISOString() ?? null,
    currentTask: task?.title ?? null,
    currentTaskSeconds: task ? liveSeconds(task) : null,
    client: task?.client?.name ?? null,
    project: task?.project?.name ?? null,
  });
}
