import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { api, setCsrfToken } from '@/api/client';
import type { AuthUser } from '@/api/types';

interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  can: (permission: string) => boolean;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    try {
      const result = await api<{ user: AuthUser; csrfToken: string }>('/api/auth/me');
      setUser(result.user);
      setCsrfToken(result.csrfToken);
    } catch {
      setUser(null);
      setCsrfToken(null);
    }
  }

  useEffect(() => {
    void refresh().finally(() => setLoading(false));
  }, []);

  const value = useMemo<AuthState>(() => ({
    user,
    loading,
    can(permission: string) {
      if (!user) return false;
      if (user.role === 'admin') return true;
      return user.permissions.includes(permission);
    },
    async login(email: string, password: string) {
      const result = await api<{ user: AuthUser; csrfToken: string }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      setUser(result.user);
      setCsrfToken(result.csrfToken);
    },
    async logout() {
      await api('/api/auth/logout', { method: 'POST' });
      setUser(null);
      setCsrfToken(null);
    },
    refresh,
  }), [user, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('AuthProvider is missing.');
  return value;
}
