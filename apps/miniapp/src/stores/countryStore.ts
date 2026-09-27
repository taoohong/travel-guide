import { create } from 'zustand';
import type { ContinentSummary, CountrySummary } from '@travel-guide/api-client';

interface CountryState { continents: ContinentSummary[]; countries: CountrySummary[]; initialized: boolean;
  loading: boolean; error: string | null; offline: boolean;
  start(): void; show(continents: ContinentSummary[], countries: CountrySummary[], offline: boolean): void;
  updateContinents(value: ContinentSummary[]): void; updateCountries(value: CountrySummary[]): void;
  fail(message: string): void; markOffline(): void }
export const useCountryStore = create<CountryState>((set) => ({ continents: [], countries: [], initialized: false,
  loading: false, error: null, offline: false,
  start: () => set({ loading: true, error: null }),
  show: (continents, countries, offline) => set({ continents, countries, offline, initialized: true, loading: false, error: null }),
  updateContinents: (continents) => set({ continents, offline: false }),
  updateCountries: (countries) => set({ countries, offline: false }),
  fail: (error) => set({ error, loading: false, initialized: true }),
  markOffline: () => set({ offline: true }),
}));
