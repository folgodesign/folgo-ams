import type { Response } from 'express';

/**
 * Lightweight per-org SSE fan-out for the live board (PRD F-4.5). SSE is the
 * PRD-sanctioned alternative to WebSocket and needs no extra dependency. In a
 * multi-instance deployment this would sit behind Redis pub/sub.
 */
type Client = { orgId: string; res: Response };

const clients = new Set<Client>();

export function addClient(orgId: string, res: Response): () => void {
  const client: Client = { orgId, res };
  clients.add(client);
  return () => clients.delete(client);
}

export function publish(orgId: string, event: string, data: unknown): void {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of clients) {
    if (client.orgId === orgId) {
      try {
        client.res.write(payload);
      } catch {
        clients.delete(client);
      }
    }
  }
}
