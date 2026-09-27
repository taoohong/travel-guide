import { beforeEach, describe, expect, it } from 'vitest';
import { cacheKeys } from '../src/cache/cacheKeys';
import { MemoryStorageAdapter } from '../src/cache/storage';
import { PreferenceService } from '../src/services/preferenceService';
import { defaultPreferences, useUserStore } from '../src/stores/userStore';
import { useVisaStore } from '../src/stores/visaStore';

describe('用户基础设置', () => {
  beforeEach(() => {
    useUserStore.setState({ ...defaultPreferences, hydrated: false, guideDialogOpen: false });
    useVisaStore.getState().clear();
  });
  it('默认 CN 和提示开启；持久化后重新初始化仍恢复', async () => {
    const storage = new MemoryStorageAdapter();
    const preferences = new PreferenceService(storage);
    expect(await preferences.hydrate()).toEqual({ passportRegion: 'CN', showPlanAddGuide: true });
    await preferences.update({ passportRegion: 'SG', showPlanAddGuide: false });
    useUserStore.setState({ ...defaultPreferences, hydrated: false });
    expect(await new PreferenceService(storage).hydrate()).toEqual({ passportRegion: 'SG', showPlanAddGuide: false });
    expect(await storage.get(cacheKeys.preferences)).toEqual({ passportRegion: 'SG', showPlanAddGuide: false });
    await preferences.update({ showPlanAddGuide: true });
    expect(useUserStore.getState().showPlanAddGuide).toBe(true);
  });
  it('确认弹窗仅关闭临时状态；换护照地区清除旧签证展示', async () => {
    const storage = new MemoryStorageAdapter(); const service = new PreferenceService(storage);
    await service.hydrate();
    useUserStore.getState().openGuideDialog();
    useUserStore.getState().dismissGuideDialog();
    expect(useUserStore.getState().showPlanAddGuide).toBe(true);
    expect(await storage.get(cacheKeys.preferences)).toBeNull();
    useVisaStore.getState().start(cacheKeys.visa('CN', 'JP'));
    await service.update({ passportRegion: 'SG' });
    expect(useVisaStore.getState().key).toBeNull();
    expect(useUserStore.getState().passportRegion).toBe('SG');
    await expect(service.update({ passportRegion: 'JPN' })).rejects.toThrow();
  });
});
