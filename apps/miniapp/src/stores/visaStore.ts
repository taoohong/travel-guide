import { create } from 'zustand';
import type { VisaLookup } from '@travel-guide/api-client';

interface VisaState { key: string | null; result: VisaLookup | null; loading: boolean; error: string | null;
  start(key: string): void; show(key: string, result: VisaLookup): void; fail(message: string): void; clear(): void }
export const useVisaStore = create<VisaState>((set) => ({ key: null, result: null, loading: false, error: null,
  start: (key) => set({ key, loading: true, error: null, result: null }),
  show: (key, result) => set({ key, result, loading: false, error: null }),
  fail: (error) => set({ loading: false, error }),
  clear: () => set({ key: null, result: null, loading: false, error: null }),
}));
