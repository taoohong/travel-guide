import { cacheKeys } from '../cache/cacheKeys';
import type { StorageAdapter } from '../cache/storage';
import { serviceContext } from './context';
import { defaultPreferences, useUserStore, type UserPreferences } from '../stores/userStore';
import { useVisaStore } from '../stores/visaStore';

export class PreferenceService {
  constructor(private readonly storage: StorageAdapter) {}
  async hydrate(): Promise<UserPreferences> {
    const saved = await this.storage.get<Partial<UserPreferences>>(cacheKeys.preferences);
    const value = { passportRegion: typeof saved?.passportRegion === 'string' && /^[A-Z]{2}$/.test(saved.passportRegion) ?
      saved.passportRegion : defaultPreferences.passportRegion,
      showPlanAddGuide: typeof saved?.showPlanAddGuide === 'boolean' ? saved.showPlanAddGuide : defaultPreferences.showPlanAddGuide };
    useUserStore.getState().hydrate(value);
    return value;
  }
  async update(patch: Partial<UserPreferences>): Promise<UserPreferences> {
    if (patch.passportRegion !== undefined && !/^[A-Z]{2}$/.test(patch.passportRegion)) throw new Error('护照地区代码不合法');
    const before = useUserStore.getState();
    const next = { passportRegion: patch.passportRegion ?? before.passportRegion,
      showPlanAddGuide: patch.showPlanAddGuide ?? before.showPlanAddGuide };
    await this.storage.set(cacheKeys.preferences, next);
    useUserStore.getState().hydrate(next);
    if (next.passportRegion !== before.passportRegion) useVisaStore.getState().clear();
    return next;
  }
}
export const preferenceService = new PreferenceService(serviceContext.storage);
