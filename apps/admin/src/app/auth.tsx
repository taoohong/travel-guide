import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { AdminIdentity } from '@travel-guide/api-client';
import { api, tokenStore } from '../services/api';

export type Role = AdminIdentity['role'];
export type Action = 'read' | 'edit' | 'publish' | 'upload';
export function can(role: Role | undefined, action: Action): boolean {
  if (!role) return false;
  if (action === 'read') return true;
  if (role === 'SUPER_ADMIN') return true;
  return action === 'edit' ? role === 'CONTENT_ADMIN' : action === 'publish' ? role === 'REVIEWER' : role === 'REVIEWER' || role === 'CONTENT_ADMIN';
}

interface AuthState { admin: AdminIdentity | null; loading: boolean; login: (username: string, password: string) => Promise<void>; logout: () => void }
const Context = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [admin, setAdmin] = useState<AdminIdentity | null>(null);
  const [loading, setLoading] = useState(Boolean(tokenStore.get()));
  useEffect(() => {
    if (tokenStore.get()) api.auth.me().then(setAdmin).catch(() => tokenStore.clear()).finally(() => setLoading(false));
    const lost = () => { setAdmin(null); setLoading(false); history.replaceState(null, '', '/login'); window.dispatchEvent(new PopStateEvent('popstate')); };
    window.addEventListener('admin-unauthorized', lost);
    return () => window.removeEventListener('admin-unauthorized', lost);
  }, []);
  const login = async (username: string, password: string) => {
    const result = await api.auth.login(username, password);
    tokenStore.set(result.token);
    try { setAdmin(await api.auth.me()); }
    catch (error) { tokenStore.clear(); throw error; }
  };
  const logout = () => { tokenStore.clear(); setAdmin(null); history.replaceState(null, '', '/login'); window.dispatchEvent(new PopStateEvent('popstate')); };
  return <Context.Provider value={{ admin, loading, login, logout }}>{children}</Context.Provider>;
}
export function useAuth(): AuthState {
  const value = useContext(Context);
  if (!value) throw new Error('AuthProvider missing');
  return value;
}
