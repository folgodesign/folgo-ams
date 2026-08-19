import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, setAccessToken, setOnAuthLost, refresh } from './api';

export interface User {
  id: string;
  name: string;
  email: string;
  role: 'employee' | 'lead' | 'admin' | 'super_admin';
  orgId: string;
  avatarUrl: string | null;
  designation: string | null;
  teamId: string | null;
  timezone: string | null;
}

interface AuthState {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  setSession: (access: string, user: User) => void;
  isAdmin: boolean;
  isLead: boolean;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setOnAuthLost(() => {
      setAccessToken(null);
      setUser(null);
    });
    // Attempt silent refresh on load (returning session).
    (async () => {
      if (await refresh()) {
        try {
          const me = await api.get<User>('/me');
          setUser(me);
        } catch {
          /* ignore */
        }
      }
      setLoading(false);
    })();
  }, []);

  const setSession = (access: string, u: User) => {
    setAccessToken(access);
    setUser(u);
  };

  const login = async (email: string, password: string) => {
    const data = await api.post<{ access: string; user: User }>('/auth/login', { email, password });
    setSession(data.access, data.user);
  };

  const logout = async () => {
    await api.post('/auth/logout').catch(() => {});
    setAccessToken(null);
    setUser(null);
  };

  const roleRank = { employee: 0, lead: 1, admin: 2, super_admin: 3 } as const;
  const rank = user ? roleRank[user.role] : -1;

  return (
    <AuthContext.Provider
      value={{ user, loading, login, logout, setSession, isAdmin: rank >= 2, isLead: rank >= 1 }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
