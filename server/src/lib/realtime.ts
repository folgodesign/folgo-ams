import type { Response } from 'express';

/**
 * Lightweight per-org SSE fan-out for the live board (PRD F-4.5). SSE is the
 * PRD-sanctioned alternative to WebSocket and needs no extra dependency. In a
 * multi-instance deployment this would sit behind Redis pub/sub.
 *
 * Each client carries a `full` flag: privileged viewers (lead/admin) get the
 * complete member payload; employees get a redacted one (status + current task
 * only, no attendance signals) so they can't watch others' hours.
 */
type Client = { orgId: string; res: Response; full: boolean };

const clients = new Set<Client>();

export function addClient(orgId: string, res: Response, full: boolean): () => void {
  const client: Client = { orgId, res, full };
  clients.add(client);
  return () => clients.delete(client);
}

/**
 * Publish an event to an org's subscribers. `dataFull` goes to privileged
 * viewers; `dataLimited` (defaults to `dataFull`) goes to employees.
 */
export function publish(orgId: string, event: string, dataFull: unknown, dataLimited?: unknown): void {
  const full = `event: ${event}\ndata: ${JSON.stringify(dataFull)}\n\n`;
  const limited = `event: ${event}\ndata: ${JSON.stringify(dataLimited ?? dataFull)}\n\n`;
  for (const client of clients) {
    if (client.orgId === orgId) {
      try {
        client.res.write(client.full ? full : limited);
      } catch {
        clients.delete(client);
      }
    }
  }
}
