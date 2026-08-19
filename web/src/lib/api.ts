// Thin API client. The access token lives in memory only (never localStorage);
// the refresh token is an httpOnly cookie the browser sends automatically.
// A 401 triggers exactly one transparent refresh + retry.

const BASE = '/api';

let accessToken: string | null = null;
let onAuthLost: (() => void) | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}
export function getAccessToken() {
  return accessToken;
}
export function setOnAuthLost(fn: () => void) {
  onAuthLost = fn;
}

export class ApiError extends Error {
  constructor(public status: number, public code: string, message?: string) {
    super(message ?? code);
  }
}

async function refresh(): Promise<boolean> {
  const res = await fetch(`${BASE}/auth/refresh`, { method: 'POST', credentials: 'include' });
  if (!res.ok) return false;
  const data = await res.json();
  accessToken = data.access;
  return true;
}

async function raw(path: string, init: RequestInit, retry = true): Promise<Response> {
  const headers = new Headers(init.headers);
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const res = await fetch(`${BASE}${path}`, { ...init, headers, credentials: 'include' });
  if (res.status === 401 && retry) {
    if (await refresh()) return raw(path, init, false);
    onAuthLost?.();
  }
  return res;
}

async function parse<T>(res: Response): Promise<T> {
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new ApiError(res.status, data?.error ?? 'error', data?.message);
  return data as T;
}

export const api = {
  get: <T>(path: string) => raw(path, { method: 'GET' }).then((r) => parse<T>(r)),
  post: <T>(path: string, body?: unknown) =>
    raw(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }).then((r) => parse<T>(r)),
  patch: <T>(path: string, body?: unknown) =>
    raw(path, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined }).then((r) => parse<T>(r)),
  del: <T>(path: string) => raw(path, { method: 'DELETE' }).then((r) => parse<T>(r)),
  // For CSV/JSON downloads.
  download: async (path: string, filename: string) => {
    const res = await raw(path, { method: 'GET' });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  },
};

export { refresh, BASE };
