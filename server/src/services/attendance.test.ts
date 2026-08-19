import { describe, it, expect } from 'vitest';
import { classifyDay } from './attendance.js';

const schedule = { startTime: '10:00', requiredHours: 8, graceMinutes: 15, halfDayThresholdHours: 4 };
const tz = 'Asia/Kolkata';
// 10:05 IST == 04:35 UTC — within grace.
const onTime = new Date('2026-08-19T04:35:00Z');
// 10:40 IST == 05:10 UTC — past 15-min grace.
const late = new Date('2026-08-19T05:10:00Z');

describe('classifyDay (PRD F-6.2)', () => {
  it('marks a full on-time day Present', () => {
    expect(classifyDay({ date: '2026-08-19', tz, workedMinutes: 8 * 60, firstCheckIn: onTime, schedule, hasLeave: false, isHoliday: false })).toBe('present');
  });

  it('marks a full but late day Late', () => {
    expect(classifyDay({ date: '2026-08-19', tz, workedMinutes: 8 * 60, firstCheckIn: late, schedule, hasLeave: false, isHoliday: false })).toBe('late');
  });

  it('marks between half-day and required as Half-day', () => {
    expect(classifyDay({ date: '2026-08-19', tz, workedMinutes: 5 * 60, firstCheckIn: onTime, schedule, hasLeave: false, isHoliday: false })).toBe('half_day');
  });

  it('marks below half-day threshold as Short', () => {
    expect(classifyDay({ date: '2026-08-19', tz, workedMinutes: 2 * 60, firstCheckIn: onTime, schedule, hasLeave: false, isHoliday: false })).toBe('short');
  });

  it('marks no check-in on a working day Absent', () => {
    expect(classifyDay({ date: '2026-08-19', tz, workedMinutes: 0, firstCheckIn: null, schedule, hasLeave: false, isHoliday: false })).toBe('absent');
  });

  it('approved leave always wins', () => {
    expect(classifyDay({ date: '2026-08-19', tz, workedMinutes: 0, firstCheckIn: null, schedule, hasLeave: true, isHoliday: false })).toBe('leave');
  });

  it('a holiday with no check-in is weekly_off', () => {
    expect(classifyDay({ date: '2026-08-19', tz, workedMinutes: 0, firstCheckIn: null, schedule, hasLeave: false, isHoliday: true })).toBe('weekly_off');
  });
});
