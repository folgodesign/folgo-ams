import { prisma } from '../lib/prisma.js';
import { secondsBetween } from '../lib/time.js';

/**
 * Close the open interval of a task and fold its elapsed time into the task's
 * accumulated_seconds. Used by pause / complete / switch.
 */
async function closeOpenInterval(taskId: string, at: Date): Promise<number> {
  const open = await prisma.taskInterval.findFirst({
    where: { taskId, endedAt: null },
    orderBy: { startedAt: 'desc' },
  });
  if (!open) return 0;
  const seconds = secondsBetween(open.startedAt, at);
  await prisma.taskInterval.update({ where: { id: open.id }, data: { endedAt: at } });
  const task = await prisma.task.update({
    where: { id: taskId },
    data: { accumulatedSeconds: { increment: seconds } },
  });
  return task.accumulatedSeconds;
}

/**
 * Pause whatever task is currently in progress for a user. PRD §4.3.1:
 * "Starting a new one auto-pauses the current one — no bookkeeping required."
 * Returns the paused task id if any.
 */
export async function pauseCurrentTask(userId: string, at = new Date()): Promise<string | null> {
  const current = await prisma.task.findFirst({
    where: { userId, state: 'in_progress' },
    orderBy: { startedAt: 'desc' },
  });
  if (!current) return null;
  await closeOpenInterval(current.id, at);
  await prisma.task.update({ where: { id: current.id }, data: { state: 'paused' } });
  return current.id;
}

export async function startTask(params: {
  userId: string;
  orgId: string;
  title: string;
  clientId?: string | null;
  projectId?: string | null;
  carriedFromTaskId?: string | null;
  createdVia?: string;
}) {
  const now = new Date();
  // Atomic-in-effect: pause any existing in-progress task before opening a new
  // one, guaranteeing at most one in_progress per user (acceptance §4.3).
  await pauseCurrentTask(params.userId, now);

  const task = await prisma.task.create({
    data: {
      userId: params.userId,
      orgId: params.orgId,
      title: params.title,
      clientId: params.clientId ?? null,
      projectId: params.projectId ?? null,
      carriedFromTaskId: params.carriedFromTaskId ?? null,
      createdVia: params.createdVia ?? 'web',
      state: 'in_progress',
      startedAt: now,
    },
  });
  await prisma.taskInterval.create({ data: { taskId: task.id, startedAt: now } });
  return task;
}

export async function resumeTask(userId: string, taskId: string) {
  const now = new Date();
  await pauseCurrentTask(userId, now);
  const existing = await prisma.task.findUnique({ where: { id: taskId } });
  // Starting an assigned task is its real beginning — stamp startedAt now so
  // its timeline and duration reflect when the employee actually began.
  const data: { state: string; endedAt: null; startedAt?: Date } = { state: 'in_progress', endedAt: null };
  if (existing?.state === 'assigned') data.startedAt = now;
  const task = await prisma.task.update({ where: { id: taskId }, data });
  await prisma.taskInterval.create({ data: { taskId, startedAt: now } });
  return task;
}

/**
 * Admin assigns a task to an employee (state `assigned`). It appears in the
 * employee's list with a Start button but runs no timer until they begin it.
 */
export async function assignTask(params: {
  userId: string;
  orgId: string;
  assignedById: string;
  title: string;
  note?: string | null;
  clientId?: string | null;
  projectId?: string | null;
}) {
  const now = new Date();
  return prisma.task.create({
    data: {
      userId: params.userId,
      orgId: params.orgId,
      title: params.title,
      note: params.note ?? null,
      clientId: params.clientId ?? null,
      projectId: params.projectId ?? null,
      state: 'assigned',
      assignedById: params.assignedById,
      assignedAt: now,
      startedAt: now, // placeholder for ordering; reset to real start on begin
      accumulatedSeconds: 0,
    },
  });
}

export async function transitionTask(
  taskId: string,
  state: 'paused' | 'completed' | 'carried_over' | 'cancelled',
  note?: string,
) {
  const now = new Date();
  await closeOpenInterval(taskId, now);
  return prisma.task.update({
    where: { id: taskId },
    data: {
      state,
      note: note ?? undefined,
      endedAt: state === 'paused' ? null : now,
    },
  });
}

/** Live elapsed seconds for a task, including any currently-open interval. */
export function liveSeconds(task: {
  accumulatedSeconds: number;
  state: string;
  intervals?: { startedAt: Date; endedAt: Date | null }[];
}): number {
  let total = task.accumulatedSeconds;
  const open = task.intervals?.find((i) => i.endedAt === null);
  if (open && task.state === 'in_progress') {
    total += secondsBetween(open.startedAt, new Date());
  }
  return total;
}
