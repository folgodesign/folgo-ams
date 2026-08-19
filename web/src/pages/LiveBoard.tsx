import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useLiveStream, type BoardMember } from '../hooks/useLiveStream';
import { useTick } from '../hooks/useTick';
import { MemberCard } from '../components/MemberCard';
import { ProfilePanel } from '../components/ProfilePanel';
import { Chip, EmptyState, Spinner } from '../components/ui';
import { statusMeta } from '../lib/status';

const STATUS_ORDER = ['WORKING', 'IN_MEETING', 'FOCUS', 'ON_BREAK', 'AWAY', 'CHECKED_OUT', 'ON_LEAVE'];

export function LiveBoardPage() {
  const { user } = useAuth();
  useTick(1000);
  const [members, setMembers] = useState<BoardMember[]>([]);
  const [connected, setConnected] = useState(false);
  const [pulses, setPulses] = useState<Record<string, number>>({});
  const [selected, setSelected] = useState<BoardMember | null>(null);
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [teamFilter, setTeamFilter] = useState<string | null>(null);
  const [grouped, setGrouped] = useState(false);
  const [date, setDate] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['live', date],
    queryFn: () => api.get<{ members: BoardMember[]; count: number; workingNow: number }>(`/live${date ? `?date=${date}` : ''}`),
    refetchInterval: 30000,
  });
  const { data: teams } = useQuery({ queryKey: ['teams'], queryFn: () => api.get<{ id: string; name: string }[]>('/settings/teams') });

  useEffect(() => {
    if (data) setMembers(data.members);
  }, [data]);

  // Realtime merge (only for today's live view).
  useLiveStream(
    !date,
    (upd) => {
      setMembers((prev) => prev.map((m) => (m.id === upd.id ? { ...m, ...upd } : m)));
      setPulses((p) => ({ ...p, [upd.id]: Date.now() }));
      setTimeout(() => setPulses((p) => ({ ...p, [upd.id]: 0 })), 900);
    },
    setConnected,
  );

  const orgTz = user?.timezone ?? 'Asia/Kolkata';

  const filtered = useMemo(() => {
    let list = members.filter((m) => {
      if (q && !m.name.toLowerCase().includes(q.toLowerCase())) return false;
      if (statusFilter && m.status !== statusFilter) return false;
      if (teamFilter && m.teamId !== teamFilter) return false;
      return true;
    });
    list = [...list].sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) || a.name.localeCompare(b.name));
    return list;
  }, [members, q, statusFilter, teamFilter]);

  const workingNow = members.filter((m) => statusMeta(m.status).countsAsWork).length;

  const groups = useMemo(() => {
    if (!grouped) return [{ name: null as string | null, items: filtered }];
    const byTeam = new Map<string, BoardMember[]>();
    for (const m of filtered) {
      const key = m.teamName ?? 'No team';
      byTeam.set(key, [...(byTeam.get(key) ?? []), m]);
    }
    return [...byTeam.entries()].map(([name, items]) => ({ name, items }));
  }, [filtered, grouped]);

  if (isLoading) return <Spinner />;

  return (
    <div className="p-6 lg:p-8">
      <div className="flex items-end justify-between mb-5 flex-wrap gap-3">
        <div>
          <h1 className="text-h1">Live now</h1>
          <p className="text-sm text-text-muted mt-1">
            Members ({members.length}) · <span className="text-status-working">{workingNow} working now</span>
          </p>
        </div>
        <div className="flex items-center gap-3 text-caption uppercase text-text-muted">
          {!date && (
            <span className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${connected ? 'bg-status-working' : 'bg-status-break'}`} />
              {connected ? 'Live' : 'Reconnecting…'}
            </span>
          )}
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="bg-bg-surface border border-border-subtle rounded-sm px-2 py-1 text-text-secondary" />
          {date && <button onClick={() => setDate('')} className="text-accent">Back to live</button>}
        </div>
      </div>

      {/* Filter chip row (mirrors the reference). */}
      <div className="flex flex-wrap items-center gap-2 mb-6">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name…" className="bg-bg-surface border border-border-subtle rounded-sm px-3 py-1.5 text-sm w-44 focus:border-accent" />
        {teams && teams.length > 0 && (
          <>
            {teams.map((t) => (
              <Chip key={t.id} active={teamFilter === t.id} onClick={() => setTeamFilter(teamFilter === t.id ? null : t.id)}>{t.name}</Chip>
            ))}
          </>
        )}
        {['WORKING', 'IN_MEETING', 'FOCUS', 'ON_BREAK'].map((s) => (
          <Chip key={s} active={statusFilter === s} onClick={() => setStatusFilter(statusFilter === s ? null : s)}>{statusMeta(s).label}</Chip>
        ))}
        <Chip active={grouped} onClick={() => setGrouped(!grouped)}>{grouped ? 'Grouped' : 'Group by team'}</Chip>
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="Nobody's checked in yet" hint="When the team starts their day, they'll appear here." />
      ) : (
        groups.map((g) => (
          <div key={g.name ?? 'all'} className="mb-8">
            {g.name && <div className="text-caption uppercase text-text-muted mb-3">{g.name} ({g.items.length})</div>}
            <div className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(240px,1fr))]">
              {g.items.map((m) => (
                <MemberCard key={m.id} member={m} onClick={() => setSelected(m)} pulse={!!pulses[m.id]} orgTz={orgTz} />
              ))}
            </div>
          </div>
        ))
      )}

      {selected && <ProfilePanel member={members.find((m) => m.id === selected.id) ?? selected} onClose={() => setSelected(null)} canViewDetail orgTz={orgTz} />}
    </div>
  );
}
