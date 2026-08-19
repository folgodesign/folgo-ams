export function fmtDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  return `${m}m`;
}

export function fmtMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

export function fmtTime(iso: string | null, tz?: string): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: tz,
  }).format(new Date(iso));
}

export function fmtDate(d: string): string {
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', weekday: 'short' }).format(
    new Date(d + 'T12:00:00'),
  );
}

export function secondsSince(iso: string | null): number {
  if (!iso) return 0;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

/** Deterministic warm colour for an initials fallback card (PRD §7.1). */
export function avatarColour(name: string): string {
  const palette = ['#EB5E29', '#C94B1D', '#6B8A9E', '#B08CFF', '#5B9DFF', '#3DD68C', '#F5C542'];
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) & 0xffff;
  return palette[hash % palette.length];
}
