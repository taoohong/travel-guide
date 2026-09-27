import { create } from 'zustand';

export interface UserPreferences { passportRegion: string; showPlanAddGuide: boolean }
export const defaultPreferences: UserPreferences = { passportRegion: 'CN', showPlanAddGuide: true };
interface UserState extends UserPreferences {
  hydrated: boolean; guideDialogOpen: boolean;
  hydrate(value: UserPreferences): void; openGuideDialog(): void; dismissGuideDialog(): void;
}
export const useUserStore = create<UserState>((set) => ({ ...defaultPreferences, hydrated: false, guideDialogOpen: false,
  hydrate: (value) => set({ ...value, hydrated: true }),
  openGuideDialog: () => set({ guideDialogOpen: true }),
  dismissGuideDialog: () => set({ guideDialogOpen: false }),
}));
