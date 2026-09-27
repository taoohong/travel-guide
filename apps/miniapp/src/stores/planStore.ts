import { create } from 'zustand';
import type { PlanItem } from '@travel-guide/types';

interface PlanState { tripId: string | null; items: PlanItem[]; loading: boolean; error: string | null;
  start(tripId: string): void; show(tripId: string, items: PlanItem[]): void; upsert(item: PlanItem): void;
  remove(id: string): void; fail(message: string): void; clear(): void }
export const usePlanStore = create<PlanState>((set) => ({ tripId: null, items: [], loading: false, error: null,
  start: (tripId) => set({ tripId, loading: true, error: null }),
  show: (tripId, items) => set({ tripId, items, loading: false, error: null }),
  upsert: (item) => set((state) => ({ tripId: item.tripId, items: [...state.items.filter((row) => row.id !== item.id), item], error: null })),
  remove: (id) => set((state) => ({ items: state.items.filter((item) => item.id !== id), error: null })),
  fail: (error) => set({ loading: false, error }),
  clear: () => set({ tripId: null, items: [], loading: false, error: null }),
}));
