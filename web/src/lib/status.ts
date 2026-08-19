// Status metadata — colours from PRD §14.2, with redundant ring encoding
// (solid / dashed / striped / none) so the board reads in greyscale too.

export type Status =
  | 'WORKING'
  | 'IN_MEETING'
  | 'FOCUS'
  | 'ON_BREAK'
  | 'AWAY'
  | 'CHECKED_OUT'
  | 'ON_LEAVE';

export interface StatusMeta {
  label: string;
  colour: string;
  ring: 'solid' | 'dashed' | 'striped' | 'none';
  countsAsWork: boolean;
}

export const STATUS: Record<Status, StatusMeta> = {
  WORKING: { label: 'Working', colour: '#3DD68C', ring: 'solid', countsAsWork: true },
  IN_MEETING: { label: 'In meeting', colour: '#5B9DFF', ring: 'solid', countsAsWork: true },
  FOCUS: { label: 'Focus', colour: '#B08CFF', ring: 'solid', countsAsWork: true },
  ON_BREAK: { label: 'On break', colour: '#F5C542', ring: 'dashed', countsAsWork: false },
  AWAY: { label: 'Away', colour: '#8A817C', ring: 'solid', countsAsWork: false },
  CHECKED_OUT: { label: 'Checked out', colour: '#524244', ring: 'none', countsAsWork: false },
  ON_LEAVE: { label: 'On leave', colour: '#6B8A9E', ring: 'striped', countsAsWork: false },
};

export function statusMeta(status: string): StatusMeta {
  return STATUS[status as Status] ?? STATUS.CHECKED_OUT;
}

// Availability statuses an employee can pick (PRD F-3.3).
export const SELECTABLE_STATUSES: Status[] = ['WORKING', 'IN_MEETING', 'FOCUS', 'AWAY', 'ON_BREAK'];

// Day classifications (PRD F-6.2) with display colour.
export const CLASSIFICATION: Record<string, { label: string; colour: string }> = {
  present: { label: 'Present', colour: '#3DD68C' },
  late: { label: 'Late', colour: '#F5C542' },
  half_day: { label: 'Half-day', colour: '#5B9DFF' },
  short: { label: 'Short day', colour: '#B08CFF' },
  absent: { label: 'Absent', colour: '#C94B1D' },
  leave: { label: 'Leave', colour: '#6B8A9E' },
  holiday: { label: 'Holiday', colour: '#7D7570' },
  weekly_off: { label: 'Weekly off', colour: '#524244' },
};

export function classificationMeta(c: string) {
  return CLASSIFICATION[c] ?? { label: c, colour: '#7D7570' };
}
