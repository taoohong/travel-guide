import { useEffect, type PropsWithChildren } from 'react';
import './app.scss';
import { clientApi } from './api/client';
import { useAccountStore } from './stores/accountStore';

export default function App({ children }: PropsWithChildren) {
  const userId = useAccountStore((state) => state.profile?.id ?? null);
  useEffect(() => { if (userId) void clientApi.user.recordFirstUse().catch(() => {}); }, [userId]);
  return children;
}
