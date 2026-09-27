import { describe, expect, it } from 'vitest';
import { activeIndex, mainTabs, tabTransform } from '../src/pages/dashboard/shell';
import { geoRepository } from '../src/features/map/geoRepository';

describe('Dashboard shell', () => {
  it('旅行是默认 Tab，三个主 Tab 对应常驻横向 Pane', () => {
    expect(mainTabs).toEqual(['travel', 'plan', 'profile']);
    expect(mainTabs[0]).toBe('travel');
    expect(mainTabs.map(activeIndex)).toEqual([0, 1, 2]);
    expect(mainTabs.map(tabTransform)).toEqual([
      'translate3d(-0vw, 0, 0)', 'translate3d(-100vw, 0, 0)', 'translate3d(-200vw, 0, 0)',
    ]);
  });
  it('本地地理元数据无需网络即可读取', () => {
    const geo = geoRepository.load();
    expect(geo.continents.some((item) => item.code === 'AS')).toBe(true);
    expect(geo.countries.map((item) => item.code)).toEqual(['JP', 'KR', 'FR']);
  });
});
