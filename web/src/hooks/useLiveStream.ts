import { useEffect } from 'react';
import { getAccessToken } from '../lib/api';

export interface BoardMember {
  id: string;
  name: string;
  avatarUrl: string | null;
  designation: string | null;
  teamId: string | null;
  teamName: string | null;
  timezone: string;
  status: string;
  statusSince: string | null;
  currentTask: string | null;
  currentTaskSeconds: number | null;
  client: string | null;
  project: string | null;
  checkInAt: string | null;
}

/**
 * Subscribe to the live board SSE stream (PRD F-4.5). On each `member` event we
 * hand the updated member back so the caller can merge it into board state.
 * EventSource can't set headers, so the access token rides as a query param.
 */
export function useLiveStream(enabled: boolean, onMember: (m: Partial<BoardMember> & { id: string }) => void, onStatus?: (connected: boolean) => void) {
  useEffect(() => {
    if (!enabled) return;
    const token = getAccessToken();
    if (!token) return;
    const es = new EventSource(`/api/live/stream?token=${encodeURIComponent(token)}`);
    es.addEventListener('ready', () => onStatus?.(true));
    es.addEventListener('member', (e) => {
      try {
        onMember(JSON.parse((e as MessageEvent).data));
      } catch {
        /* ignore */
      }
    });
    es.onerror = () => onStatus?.(false);
    return () => es.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);
}
