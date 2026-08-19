import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Avatar } from './Avatar';
import { Badge, Spinner } from './ui';
import { statusMeta, classificationMeta } from '../lib/status';
import { fmtDate, fmtDuration, fmtMinutes, fmtTime } from '../lib/format';
import type { BoardMember } from '../hooks/useLiveStream';

type Tab = 'now' | 'attendance' | 'activity' | 'profile';

export function ProfilePanel({ member, onClose, canViewDetail, orgTz }: { member: BoardMember; onClose: () => void; canViewDetail: boolean; orgTz: string }) {
  const [tab, setTab] = useState<Tab>('now');
  const meta = statusMeta(member.status);

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [onClose]);

  const tabs: Tab[] = canViewDetail ? ['now', 'attendance', 'activity', 'profile'] : ['now', 'profile'];

  return (
    <div className="fixed inset-0 z-40" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <aside
        className="absolute right-0 top-0 h-full w-full max-w-[480px] bg-bg-raised border-l border-border-subtle animate-slideIn flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b border-border-subtle">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <Avatar name={member.name} avatarUrl={member.avatarUrl} status={member.status} size={64} />
              <div>
                <div className="text-h2">{member.name}</div>
                <div className="text-sm text-text-muted">{member.designation ?? '—'}{member.teamName ? ` · ${member.teamName}` : ''}</div>
                <div className="mt-1.5"><Badge colour={meta.colour}>{meta.label}</Badge></div>
              </div>
            </div>
            <button onClick={onClose} className="text-text-muted hover:text-text-primary text-xl leading-none" aria-label="Close">✕</button>
          </div>
          <div className="flex gap-2 mt-4">
            <a href="#" onClick={(e) => e.preventDefault()} className="text-sm text-text-secondary hover:text-accent">Message</a>
            <span className="text-border-strong">·</span>
            <button onClick={() => navigator.clipboard?.writeText(`${location.origin}/members?id=${member.id}`)} className="text-sm text-text-secondary hover:text-accent">Copy link</button>
          </div>
        </div>

        <div className="flex border-b border-border-subtle px-6">
          {tabs.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-3 text-sm capitalize border-b-2 -mb-px transition-colors ${tab === t ? 'border-accent text-text-primary' : 'border-transparent text-text-muted hover:text-text-secondary'}`}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {tab === 'now' && <NowTab member={member} orgTz={orgTz} />}
          {tab === 'attendance' && canViewDetail && <AttendanceTab userId={member.id} />}
          {tab === 'activity' && canViewDetail && <ActivityTab userId={member.id} />}
          {tab === 'profile' && <ProfileTab member={member} />}
        </div>
      </aside>
    </div>
  );
}

function NowTab({ member, orgTz }: { member: BoardMember; orgTz: string }) {
  const showLocal = member.timezone !== orgTz;
  return (
    <div className="space-y-4">
      <Row label="Check-in" value={member.checkInAt ? fmtTime(member.checkInAt, member.timezone) : 'Not checked in'} />
      {showLocal && <Row label="Local time" value={`${fmtTime(new Date().toISOString(), member.timezone)} (${member.timezone})`} />}
      <div>
        <div className="text-caption uppercase text-text-muted mb-1">Current task</div>
        {member.currentTask ? (
          <div className="bg-bg-surface rounded-sm p-3">
            <div className="text-body">{member.currentTask}</div>
            <div className="flex items-center justify-between mt-1">
              <span className="text-sm text-text-muted">{member.client}{member.project ? ` · ${member.project}` : ''}</span>
              {member.currentTaskSeconds != null && <span className="tabular text-status-working">{fmtDuration(member.currentTaskSeconds)}</span>}
            </div>
          </div>
        ) : (
          <p className="text-sm text-text-muted">No active task.</p>
        )}
      </div>
    </div>
  );
}

function AttendanceTab({ userId }: { userId: string }) {
  const from = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);
  const to = new Date().toISOString().slice(0, 10);
  const { data, isLoading } = useQuery({ queryKey: ['user-attendance', userId], queryFn: () => api.get<any[]>(`/users/${userId}/attendance?from=${from}&to=${to}`) });
  if (isLoading) return <Spinner />;
  if (!data?.length) return <p className="text-sm text-text-muted">No attendance in the last 30 days.</p>;
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-caption uppercase text-text-muted text-left">
          <th className="py-2">Date</th><th>In</th><th>Out</th><th>Net</th><th>Status</th>
        </tr>
      </thead>
      <tbody>
        {[...data].reverse().map((d) => {
          const c = classificationMeta(d.classification);
          return (
            <tr key={d.id} className="border-t border-border-subtle">
              <td className="py-2">{fmtDate(d.date)}</td>
              <td className="tabular">{fmtTime(d.firstCheckIn)}</td>
              <td className="tabular">{fmtTime(d.lastCheckOut)}</td>
              <td className="tabular">{fmtMinutes(d.totalWorkedMinutes)}</td>
              <td><span style={{ color: c.colour }}>{c.label}</span>{d.isEdited && <span title="Edited by admin" className="text-accent ml-1">✎</span>}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function ActivityTab({ userId }: { userId: string }) {
  const from = new Date(Date.now() - 7 * 86400_000).toISOString().slice(0, 10);
  const to = new Date().toISOString().slice(0, 10);
  const { data, isLoading } = useQuery({ queryKey: ['user-tasks', userId], queryFn: () => api.get<any[]>(`/users/${userId}/tasks?from=${from}&to=${to}`) });
  if (isLoading) return <Spinner />;
  if (!data?.length) return <p className="text-sm text-text-muted">No tasks in the last 7 days.</p>;
  return (
    <ul className="space-y-3">
      {[...data].reverse().map((t) => (
        <li key={t.id} className="border-l-2 border-border-strong pl-3">
          <div className="text-sm">{t.title}</div>
          <div className="text-caption uppercase text-text-muted flex items-center gap-2">
            <span>{t.state.replace('_', ' ')}</span><span>·</span><span className="tabular">{fmtDuration(t.seconds)}</span>
            {t.client && <><span>·</span><span>{t.client}</span></>}
          </div>
        </li>
      ))}
    </ul>
  );
}

function ProfileTab({ member }: { member: BoardMember }) {
  return (
    <div className="space-y-3">
      <Row label="Team" value={member.teamName ?? '—'} />
      <Row label="Designation" value={member.designation ?? '—'} />
      <Row label="Timezone" value={member.timezone} />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-border-subtle pb-2">
      <span className="text-caption uppercase text-text-muted">{label}</span>
      <span className="text-sm text-text-secondary">{value}</span>
    </div>
  );
}
