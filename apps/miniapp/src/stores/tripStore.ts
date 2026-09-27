import { create } from 'zustand';
import type { ClientTrip } from '@travel-guide/api-client';

interface TripState { currentTrip: ClientTrip | null; trips: ClientTrip[]; initialized: boolean; loading: boolean; error: string | null;
  start(): void; show(trip: ClientTrip | null, trips?: ClientTrip[]): void; fail(message: string): void }
export const useTripStore = create<TripState>((set) => ({ currentTrip: null, initialized: false, loading: false, error: null,
  trips: [],
  start: () => set({ loading: true, error: null }),
  show: (currentTrip, trips) => set((state) => ({ currentTrip, trips: trips ?? state.trips, initialized: true, loading: false, error: null })),
  fail: (error) => set({ initialized: true, loading: false, error }),
}));
