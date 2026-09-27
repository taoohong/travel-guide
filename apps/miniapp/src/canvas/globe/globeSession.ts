import type { Rotation } from './globeProjection';

const rotation: Rotation = { longitude: 105, latitude: 18 };
export const globeSession = {
  get: (): Rotation => ({ ...rotation }),
  set: (longitude: number, latitude: number) => { rotation.longitude = longitude; rotation.latitude = latitude; },
};
