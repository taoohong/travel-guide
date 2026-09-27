import { create } from 'zustand';
import type { GuideSummary } from '@travel-guide/api-client';

interface AttractionState { countryCode: string | null; items: GuideSummary[]; loading: boolean; error: string | null;
  start(country: string): void; show(country: string, items: GuideSummary[]): void; fail(message: string): void }
export const useAttractionStore = create<AttractionState>((set) => ({ countryCode: null, items: [], loading: false, error: null,
  start: (countryCode) => set({ countryCode, loading: true, error: null }),
  show: (countryCode, items) => set({ countryCode, items, loading: false, error: null }),
  fail: (error) => set({ loading: false, error }),
}));
