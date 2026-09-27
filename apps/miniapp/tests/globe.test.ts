import { describe, expect, it } from 'vitest';
import { angularDistance, GLOBE_RADIUS_SCALE, nearestGeo, projectPoint } from '../src/canvas/globe/globeProjection';
import { pickCountry, pickCountryAt, screenToGlobeLocation } from '../src/canvas/globe/GlobePicker';
import { advanceGlobe, dragGlobe, endDrag, initialGlobeState, setGlobeActive, snapGlobe, startDrag } from '../src/canvas/globe/globeState';
import { GlobeInteraction } from '../src/canvas/globe/GlobeInteraction';

describe('Globe 投影', () => {
  it('视口中心在正面，对跖点在背面，旋转会改变可见性', () => {
    expect(projectPoint({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 0 })).toMatchObject({ x: 0, y: 0, visible: true });
    expect(projectPoint({ latitude: 0, longitude: 180 }, { latitude: 0, longitude: 0 }).visible).toBe(false);
    expect(projectPoint({ latitude: 0, longitude: 180 }, { latitude: 0, longitude: 180 }).visible).toBe(true);
  });
  it('选择球面距离最近的大陆，而不是平面经纬度差', () => {
    const values = [{ code: 'AS', latitude: 34, longitude: 105 }, { code: 'EU', latitude: 52, longitude: 13 }];
    expect(nearestGeo({ latitude: 35, longitude: 120 }, values)?.code).toBe('AS');
    expect(angularDistance(values[0]!, values[0]!)).toBeCloseTo(0);
  });
});

describe('Globe 状态机', () => {
  it('空闲时停止动画；拖动后按速度惯性滑行并衰减', () => {
    const resting = advanceGlobe(initialGlobeState(0, 0), 16.67);
    expect(resting.longitude).toBe(0); expect(resting.moving).toBe(false);
    const automaticState = initialGlobeState(0, 0); automaticState.autoRotate = true;
    expect(advanceGlobe(automaticState, 16.67).longitude).toBeGreaterThan(0);
    const startLongitude = automaticState.longitude;
    const touched = startDrag(automaticState); expect(touched.autoRotate).toBe(false);
    const dragged = dragGlobe(touched, 20, -10, 40); expect(dragged.longitude).toBeLessThan(startLongitude);
    const released = endDrag(dragged); const velocity = Math.abs(released.velocityX);
    const inertial = advanceGlobe(released, 16.67);
    expect(Math.abs(inertial.velocityX)).toBeLessThan(velocity); expect(inertial.moving).toBe(true);
  });
  it('柔和吸附后静止；切走 Tab 立即暂停但保留角度', () => {
    let state = snapGlobe({ ...initialGlobeState(0, 0), autoRotate: false, velocityX: 0 }, { latitude: 34, longitude: 105 });
    const first = advanceGlobe(state, 16.67); expect(first.longitude).toBeGreaterThan(0); expect(first.longitude).toBeLessThan(105);
    for (let index = 0; index < 200; index++) state = advanceGlobe(state, 16.67);
    expect(state.moving).toBe(false); expect(state.snapTarget).toBeNull();
    expect(state.latitude).toBeCloseTo(34);
    expect(projectPoint({ latitude: 34, longitude: 105 }, state).x).toBeCloseTo(0);
    expect(projectPoint({ latitude: 34, longitude: 105 }, state).y).toBeCloseTo(0);
    const paused = setGlobeActive({ ...state, longitude: 33, dragging: true }, false);
    expect(paused).toMatchObject({ active: false, moving: false, dragging: false, longitude: 33 });
  });

  it('触摸事件只保留最新坐标；RAF 消费一次并在手指停住时停止循环', () => {
    const interaction = new GlobeInteraction({ longitude: 0, latitude: 0 }, true);
    interaction.begin(100, 100, 0);
    expect(interaction.needsFrame).toBe(false);
    interaction.move(110, 104, 16);
    interaction.move(128, 110, 32);
    expect(interaction.needsFrame).toBe(true);
    expect(interaction.longitude).toBe(0);
    interaction.advance(16.67);
    expect(interaction.longitude).toBeLessThan(0);
    expect(interaction.needsFrame).toBe(false);
    const velocity = Math.abs(interaction.state.velocityX);
    interaction.end(128, 110, 32);
    expect(interaction.needsFrame).toBe(true);
    interaction.advance(16.67);
    expect(Math.abs(interaction.state.velocityX)).toBeLessThan(velocity);
  });
});

describe('Globe 点选', () => {
  const rotation = { longitude: 105, latitude: 18 };
  const viewport = { width: 420, height: 420, left: 15, top: 25 };

  it('屏幕点经球面射线反算后命中本地国家边界', () => {
    const japan = { longitude: 138.25, latitude: 36.2 };
    const projected = projectPoint(japan, rotation, 420 * 0.46 * GLOBE_RADIUS_SCALE);
    const x = viewport.left + viewport.width / 2 + projected.x;
    const y = viewport.top + viewport.height / 2 + projected.y;
    expect(screenToGlobeLocation(x, y, viewport, rotation)).toMatchObject({
      longitude: expect.closeTo(japan.longitude), latitude: expect.closeTo(japan.latitude),
    });
    expect(pickCountryAt(x, y, viewport, rotation)).toBe('JP');
    expect(pickCountry(46.6, 2.2)).toBe('FR');
  });

  it('拒绝球面以外的触点', () => {
    expect(screenToGlobeLocation(viewport.left - 20, viewport.top, viewport, rotation)).toBeNull();
  });
});
