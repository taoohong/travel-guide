import { create } from 'zustand';
import type { VersionState } from '../services/contentVersionService';

interface ContentVersionState extends VersionState { syncing: boolean; setSyncing(value: boolean): void; setResult(value: VersionState): void }
export const useContentVersionStore = create<ContentVersionState>((set) => ({ local: {}, server: {}, changedModules: [],
  failedModules: [], offline: false, syncing: false,
  setSyncing: (syncing) => set({ syncing }), setResult: (value) => set({ ...value, syncing: false }),
}));
