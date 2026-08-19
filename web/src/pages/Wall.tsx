import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { BASE } from '../lib/api';
import { Avatar } from '../components/Avatar';
import { Wordmark } from '../components/Logo';
import { statusMeta } from '../lib/status';
import { fmtDuration, secondsSince } from '../lib/format';
import { useTick } from '../hooks/useTick';
import type { BoardMember } from '../hooks/useLiveStream';

/**
 * PRD F-4.6 TV / wall-display mode: full-screen, chrome-free, read-only,
 * accessed via a signed link so it needs no login on the display device.
 */
export function WallPage() {
  const { orgId } = useParams();
  const [data, setData] = useState<{ org: { name: string }; members: BoardMember[] } | null>(null);
  useTick(1000);

  useEffect(() => {
    const load = () => fetch(`${BASE}/live/wall/${orgId}`).then((r) => r.json()).then(setData).catch(() => {});
    load();
    const id = setInterval(load, 15000);
    return () => clearInterval(id);
  }, [orgId]);

  if (!data) return <div className="h-screen grid place-items-center bg-bg-base text-text-muted">Loading wall…</div>;

  const working = data.members.filter((m) => statusMeta(m.status).countsAsWork);
  const rest = data.members.filter((m) => !statusMeta(m.status).countsAsWork);
  const ordered = [...working, ...rest];

  return (
    <div className="min-h-screen bg-bg-base p-8">
      <div className="folgo-gradient rounded-lg px-8 py-6 mb-8 flex items-center justify-between">
        <Wordmark className="text-display text-white" />
        <div className="text-right text-white">
          <div className="text-h1">{data.org.name}</div>
          <div className="text-white/70">{working.length} working now · {data.members.length} members</div>
        </div>
      </div>
      <div className="grid gap-6 grid-cols-[repeat(auto-fill,minmax(300px,1fr))]">
        {ordered.map((m) => {
          const meta = statusMeta(m.status);
          return (
            <div key={m.id} className="bg-bg-surface border border-border-subtle rounded-lg p-6 flex items-center gap-5">
              <Avatar name={m.name} avatarUrl={m.avatarUrl} status={m.status} size={80} />
              <div className="min-w-0">
                <div className="text-h2">{m.name}</div>
                <div className="text-lg uppercase tracking-wide" style={{ color: meta.colour }}>{meta.label}</div>
                <div className="text-text-muted truncate mt-1">{m.currentTask ?? 'No active task'}</div>
                {meta.countsAsWork && m.statusSince && (
                  <div className="tabular text-text-secondary mt-1">{fmtDuration(secondsSince(m.statusSince))}</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
