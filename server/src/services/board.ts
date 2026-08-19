import { prisma } from '../lib/prisma.js';
import { liveSeconds } from './tasks.js';
import { dateForUser } from './attendance.js';

/** Current live status for a user, derived from their latest status update. */
export async function currentStatus(userId: string): Promise<{ status: string; since: Date | null }> {
  const open = await prisma.statusUpdate.findFirst({
    where: { userId, endedAt: null },
    orderBy: { startedAt: 'desc' },
  });
  if (open) return { status: open.status, since: open.startedAt };
  return { status: 'CHECKED_OUT', since: null };
}

export interface BoardMember {
  id: string;
  name: string;
  avatarUrl: string | null;
  designation: string | null;
  teamId: string | null;
  teamName: string | null;
  timezone: string;
  status: string;
  statusSince: string | null;
  currentTask: string | null;
  currentTaskSeconds: number | null;
  client: string | null;
  project: string | null;
  checkInAt: string | null;
}

/**
 * Build the live-board payload for an org (PRD F-4.1..F-4.3). `date` selects a
 * historical snapshot; defaults to today. When `full` is false (employee
 * viewer), attendance signals — check-in time and status elapsed — are stripped
 * so employees see only status + current active work, never others' hours.
 */
export async function buildBoard(orgId: string, date?: string, full = true): Promise<BoardMember[]> {
  const org = await prisma.organisation.findUnique({ where: { id: orgId } });
  const users = await prisma.user.findMany({
    where: { orgId, status: { in: ['active', 'deactivated'] } },
    include: { team: true },
    orderBy: { name: 'asc' },
  });

  const members: BoardMember[] = [];
  for (const u of users) {
    const tz = u.timezone || org?.timezone || 'Asia/Kolkata';
    const day = date ?? dateForUser(new Date(), tz);

    const attendanceDay = await prisma.attendanceDay.findUnique({
      where: { userId_date: { userId: u.id, date: day } },
    });

    const status = date ? { status: 'CHECKED_OUT', since: null } : await currentStatus(u.id);

    const task = await prisma.task.findFirst({
      where: { userId: u.id, state: 'in_progress' },
      include: { intervals: true, client: true, project: true },
      orderBy: { startedAt: 'desc' },
    });

    members.push({
      id: u.id,
      name: u.name,
      avatarUrl: u.avatarUrl,
      designation: u.designation,
      teamId: u.teamId,
      teamName: u.team?.name ?? null,
      timezone: tz,
      status: u.status === 'deactivated' ? 'CHECKED_OUT' : status.status,
      statusSince: full && status.since ? status.since.toISOString() : null,
      currentTask: task?.title ?? null,
      currentTaskSeconds: task ? liveSeconds(task) : null,
      client: task?.client?.name ?? null,
      project: task?.project?.name ?? null,
      checkInAt: full && attendanceDay?.firstCheckIn ? attendanceDay.firstCheckIn.toISOString() : null,
    });
  }
  return members;
}
