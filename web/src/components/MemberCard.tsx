import { Avatar } from './Avatar';
import { statusMeta } from '../lib/status';
import { fmtDuration, fmtTime, secondsSince } from '../lib/format';
import type { BoardMember } from '../hooks/useLiveStream';

/**
 * Live-board member card (PRD F-4.1), borrowing the Folgo ID-card composition:
 * portrait over a warm surface, name with the surname in Burnt Orange, role in
 * muted grey, status ring around the avatar.
 */
export function MemberCard({ member, onClick, pulse, orgTz, limited }: { member: BoardMember; onClick: () => void; pulse?: boolean; orgTz: string; limited?: boolean }) {
  const meta = statusMeta(member.status);
  const [first, ...rest] = member.name.split(' ');
  const elapsed = member.statusSince ? secondsSince(member.statusSince) : 0;
  const showLocalTime = member.timezone && member.timezone !== orgTz;

  return (
    <button
      onClick={onClick}
      className={`text-left bg-bg-surface border border-border-subtle rounded-lg p-4 hover:bg-bg-hover hover:border-border-strong transition-colors focus:outline-none focus-visible:border-accent ${pulse ? 'animate-pulseBorder' : ''}`}
    >
      <div className="flex items-start gap-3">
        <Avatar name={member.name} avatarUrl={member.avatarUrl} status={member.status} size={56} />
        <div className="min-w-0 flex-1">
          <div className="font-medium leading-tight truncate">
            {first} {rest.length > 0 && <span className="text-accent">{rest.join(' ')}</span>}
          </div>
          <div className="text-sm text-text-muted truncate">{member.designation ?? '—'}</div>
          <div className="mt-1.5 flex items-center gap-1.5">
            <span className="text-caption uppercase" style={{ color: meta.colour }}>{meta.label}</span>
            {meta.countsAsWork && member.statusSince && (
              <span className="text-caption text-text-muted tabular">· {fmtDuration(elapsed)}</span>
            )}
          </div>
        </div>
      </div>

      <div className="mt-3 min-h-[2.5rem]">
        {member.currentTask ? (
          <>
            <div className="text-sm text-text-secondary line-clamp-2">{member.currentTask}</div>
            {member.client && <div className="text-caption uppercase text-text-muted mt-1 truncate">{member.client}{member.project ? ` · ${member.project}` : ''}</div>}
          </>
        ) : (
          <div className="text-sm text-text-muted italic">No active task</div>
        )}
      </div>

      {/* Attendance footer (check-in / local time) is hidden from employees. */}
      {!limited && (
        <div className="mt-3 pt-3 border-t border-border-subtle flex items-center justify-between text-caption uppercase text-text-muted">
          <span>{member.checkInAt ? `In ${fmtTime(member.checkInAt, member.timezone)}` : 'Not in'}</span>
          {showLocalTime && <span className="tabular">{fmtTime(new Date().toISOString(), member.timezone)} local</span>}
        </div>
      )}
    </button>
  );
}
