import { prisma } from '../lib/prisma.js';
import { localDate, localMinutes, localWeekday, parseHHMM, minutesBetween } from '../lib/time.js';

/**
 * Recompute the cached AttendanceDay aggregate for a user+date from its
 * underlying sessions and breaks (PRD §5: "Daily aggregates are recomputed
 * whenever an underlying session or break changes"). All arithmetic is
 * server-side (acceptance criteria §4.5).
 */
export async function recomputeAttendanceDay(userId: string, date: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { workSchedule: true, org: true },
  });
  if (!user) return;
  const tz = user.timezone || user.org.timezone;

  const sessions = await prisma.session.findMany({
    where: { userId, attendanceDay: { date } },
    include: { breaks: true },
    orderBy: { checkInAt: 'asc' },
  });

  let workedMinutes = 0;
  let breakMinutes = 0;
  let firstCheckIn: Date | null = null;
  let lastCheckOut: Date | null = null;

  for (const s of sessions) {
    const end = s.checkOutAt ?? new Date();
    const gross = minutesBetween(s.checkInAt, end);
    let sessionBreak = 0;
    for (const b of s.breaks) {
      sessionBreak += minutesBetween(b.startedAt, b.endedAt ?? new Date());
    }
    // Optional fixed lunch auto-deduct (PRD F-2.3).
    const autoDeduct = user.workSchedule?.autoDeductBreakMinutes ?? 0;
    const effectiveBreak = Math.max(sessionBreak, autoDeduct);
    workedMinutes += Math.max(0, gross - effectiveBreak);
    breakMinutes += effectiveBreak;
    if (!firstCheckIn) firstCheckIn = s.checkInAt;
    if (s.checkOutAt) lastCheckOut = s.checkOutAt;
  }

  const classification = classifyDay({
    date,
    tz,
    workedMinutes,
    firstCheckIn,
    schedule: user.workSchedule,
    hasLeave: await hasApprovedLeave(userId, date),
    isHoliday: await isHolidayOrOff(user.orgId, date, tz, user.workSchedule),
  });

  const requiredMinutes = (user.workSchedule?.requiredHours ?? 8) * 60;
  const overtimeThreshold = 30; // minutes over required before flagging OT
  const overtimeMinutes =
    workedMinutes > requiredMinutes + overtimeThreshold ? workedMinutes - requiredMinutes : 0;

  const existing = await prisma.attendanceDay.findUnique({ where: { userId_date: { userId, date } } });
  await prisma.attendanceDay.update({
    where: { userId_date: { userId, date } },
    data: {
      firstCheckIn,
      lastCheckOut,
      totalWorkedMinutes: workedMinutes,
      totalBreakMinutes: breakMinutes,
      overtimeMinutes,
      // Never overwrite an admin-edited classification silently.
      classification: existing?.isEdited ? existing.classification : classification,
    },
  });
}

async function hasApprovedLeave(userId: string, date: string): Promise<boolean> {
  const leave = await prisma.leaveRequest.findFirst({
    where: { userId, status: 'approved', startDate: { lte: date }, endDate: { gte: date } },
  });
  return !!leave;
}

async function isHolidayOrOff(
  orgId: string,
  date: string,
  tz: string,
  schedule: { workingDays: string } | null,
): Promise<boolean> {
  const holiday = await prisma.holiday.findFirst({ where: { orgId, date } });
  if (holiday) return true;
  const weekday = localWeekday(new Date(`${date}T12:00:00Z`), tz);
  const workingDays: number[] = schedule ? JSON.parse(schedule.workingDays) : [1, 2, 3, 4, 5];
  return !workingDays.includes(weekday);
}

interface ClassifyInput {
  date: string;
  tz: string;
  workedMinutes: number;
  firstCheckIn: Date | null;
  schedule: {
    startTime: string;
    requiredHours: number;
    graceMinutes: number;
    halfDayThresholdHours: number;
  } | null;
  hasLeave: boolean;
  isHoliday: boolean;
}

/** PRD F-6.2 automatic day classification table. */
export function classifyDay(input: ClassifyInput): string {
  if (input.hasLeave) return 'leave';
  if (input.isHoliday) return input.firstCheckIn ? 'present' : 'weekly_off';

  const required = (input.schedule?.requiredHours ?? 8) * 60;
  const halfDay = (input.schedule?.halfDayThresholdHours ?? 4) * 60;
  const grace = input.schedule?.graceMinutes ?? 15;
  const startMin = parseHHMM(input.schedule?.startTime ?? '10:00');

  if (!input.firstCheckIn) return 'absent';

  const worked = input.workedMinutes;
  const arrivalMin = localMinutes(input.firstCheckIn, input.tz);
  const late = arrivalMin > startMin + grace;

  if (worked >= required) return late ? 'late' : 'present';
  if (worked >= halfDay) return 'half_day';
  if (worked > 0) return 'short';
  return late ? 'late' : 'present';
}

/** Ensure an AttendanceDay row exists for user+date and return it. */
export async function ensureAttendanceDay(userId: string, date: string) {
  return prisma.attendanceDay.upsert({
    where: { userId_date: { userId, date } },
    create: { userId, date },
    update: {},
  });
}

export function dateForUser(instant: Date, tz: string): string {
  return localDate(instant, tz);
}
