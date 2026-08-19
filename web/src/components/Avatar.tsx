import { initials, avatarColour } from '../lib/format';
import { statusMeta } from '../lib/status';

interface Props {
  name: string;
  avatarUrl?: string | null;
  status?: string;
  size?: number;
  dimmed?: boolean;
}

/**
 * Avatar with a status ring (PRD F-4.1). Ring style is redundant with colour:
 * solid / dashed / striped / none, so the signal survives greyscale and
 * colour-blindness (PRD §14.2 note 3).
 */
export function Avatar({ name, avatarUrl, status, size = 56, dimmed }: Props) {
  const meta = status ? statusMeta(status) : null;
  const ringWidth = meta?.ring === 'none' ? 0 : status === 'AWAY' ? 2 : 3;
  const pad = ringWidth + 3;
  const inner = size - pad * 2;

  const ringStyle: React.CSSProperties =
    meta && meta.ring !== 'none'
      ? meta.ring === 'dashed'
        ? { border: `${ringWidth}px dashed ${meta.colour}` }
        : meta.ring === 'striped'
          ? { border: `${ringWidth}px solid transparent`, backgroundImage: `repeating-linear-gradient(45deg, ${meta.colour} 0 4px, transparent 4px 8px)`, backgroundClip: 'border-box' }
          : { border: `${ringWidth}px solid ${meta.colour}`, boxShadow: status === 'FOCUS' ? `0 0 10px ${meta.colour}66` : undefined }
      : { border: '1px solid #3A2E2F' };

  const opacity = dimmed || status === 'CHECKED_OUT' ? 0.45 : status === 'AWAY' ? 0.6 : 1;

  return (
    <div
      className="rounded-full flex items-center justify-center shrink-0"
      style={{ width: size, height: size, ...ringStyle }}
    >
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt={name}
          className="rounded-full object-cover"
          style={{ width: inner, height: inner, opacity }}
        />
      ) : (
        <div
          className="rounded-full flex items-center justify-center font-medium text-white"
          style={{ width: inner, height: inner, background: avatarColour(name), fontSize: inner * 0.36, opacity }}
        >
          {initials(name)}
        </div>
      )}
    </div>
  );
}
