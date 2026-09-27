import { normalizeLongitude, type GeoPoint } from './globeProjection';

export type QualityLevel = 'high' | 'medium' | 'low';

export interface GlobeState {
  longitude: number;
  latitude: number;
  velocityX: number;
  velocityY: number;
  dragging: boolean;
  autoRotate: boolean;
  moving: boolean;
  active: boolean;
  snapTarget: GeoPoint | null;
}

const MAX_PITCH = 65;
const STOP_SPEED = 1.8;
const INERTIA_DAMPING = 4.1;

export const initialGlobeState = (longitude = 105, latitude = 18): GlobeState => ({
  longitude,
  latitude,
  velocityX: 0,
  velocityY: 0,
  dragging: false,
  autoRotate: false,
  moving: false,
  active: true,
  snapTarget: null,
});

export function startDrag(state: GlobeState): GlobeState {
  state.dragging = true;
  state.autoRotate = false;
  state.velocityX = 0;
  state.velocityY = 0;
  state.snapTarget = null;
  state.moving = state.active;
  return state;
}

export function dragGlobe(state: GlobeState, deltaX: number, deltaY: number, elapsedMs: number): GlobeState {
  const scale = 0.32;
  state.longitude = normalizeLongitude(state.longitude - deltaX * scale);
  const nextPitch = state.latitude + deltaY * scale;
  state.latitude = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, nextPitch));
  const elapsedSeconds = Math.max(0.008, elapsedMs / 1000);
  state.velocityX = Math.max(-720, Math.min(720, -deltaX * scale / elapsedSeconds));
  state.velocityY = nextPitch === state.latitude ? Math.max(-720, Math.min(720, deltaY * scale / elapsedSeconds)) : 0;
  state.moving = state.active;
  return state;
}

export function endDrag(state: GlobeState): GlobeState {
  state.dragging = false;
  state.moving = state.active && (Math.abs(state.velocityX) > STOP_SPEED || Math.abs(state.velocityY) > STOP_SPEED
    || Boolean(state.snapTarget));
  return state;
}

export function snapGlobe(state: GlobeState, target: GeoPoint): GlobeState {
  state.snapTarget = target;
  state.moving = state.active;
  return state;
}

export function setGlobeActive(state: GlobeState, active: boolean): GlobeState {
  state.active = active;
  if (!active) state.dragging = false;
  state.moving = active && (state.dragging || Math.abs(state.velocityX) > STOP_SPEED
    || Math.abs(state.velocityY) > STOP_SPEED || Boolean(state.snapTarget));
  return state;
}

/** Advance in place; velocity is measured in degrees per second. */
export function advanceGlobe(state: GlobeState, frameMs: number): GlobeState {
  if (!state.active) {
    state.moving = false;
    return state;
  }
  if (state.dragging) {
    state.moving = true;
    return state;
  }

  const seconds = Math.min(0.064, Math.max(0, frameMs / 1000));
  if (state.snapTarget) {
    const targetLongitude = normalizeLongitude(state.snapTarget.longitude);
    const longitudeDelta = normalizeLongitude(targetLongitude - state.longitude);
    const latitudeTarget = state.snapTarget.latitude;
    const latitudeDelta = latitudeTarget - state.latitude;
    if (Math.abs(longitudeDelta) < 0.08 && Math.abs(latitudeDelta) < 0.08) {
      state.longitude = targetLongitude;
      state.latitude = latitudeTarget;
      state.snapTarget = null;
      state.velocityX = 0;
      state.velocityY = 0;
      state.moving = false;
      return state;
    }
    const amount = 1 - Math.exp(-6.4 * seconds);
    state.longitude = normalizeLongitude(state.longitude + longitudeDelta * amount);
    state.latitude += latitudeDelta * amount;
    state.moving = true;
    return state;
  }

  if (Math.abs(state.velocityX) > STOP_SPEED || Math.abs(state.velocityY) > STOP_SPEED) {
    state.longitude = normalizeLongitude(state.longitude + state.velocityX * seconds);
    const nextPitch = state.latitude + state.velocityY * seconds;
    state.latitude = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, nextPitch));
    if (nextPitch !== state.latitude) state.velocityY = 0;
    const damping = Math.exp(-INERTIA_DAMPING * seconds);
    state.velocityX *= damping;
    state.velocityY *= damping;
    state.moving = Math.abs(state.velocityX) > STOP_SPEED || Math.abs(state.velocityY) > STOP_SPEED;
    if (!state.moving) state.velocityX = state.velocityY = 0;
    return state;
  }

  if (state.autoRotate) {
    state.longitude = normalizeLongitude(state.longitude + 1.5 * seconds);
    state.moving = true;
  } else {
    state.velocityX = state.velocityY = 0;
    state.moving = false;
  }
  return state;
}
