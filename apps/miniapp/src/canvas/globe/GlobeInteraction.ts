import { advanceGlobe, dragGlobe, endDrag, initialGlobeState, setGlobeActive, startDrag,
  type GlobeState } from './globeState';
import type { Rotation } from './globeProjection';

/** Mutable gesture/runtime state. Touch handlers only replace the latest pointer sample. */
export class GlobeInteraction {
  readonly state: GlobeState;
  private pointerX = 0;
  private pointerY = 0;
  private pointerTime = 0;
  private appliedX = 0;
  private appliedY = 0;
  private appliedTime = 0;
  private pointerDirty = false;
  private gestureDistance = 0;

  constructor(rotation: Rotation, active: boolean) {
    this.state = initialGlobeState(rotation.longitude, rotation.latitude);
    setGlobeActive(this.state, active);
  }

  get longitude(): number { return this.state.longitude; }
  get latitude(): number { return this.state.latitude; }
  get isDragging(): boolean { return this.state.dragging; }
  get isMoving(): boolean { return this.state.moving || this.pointerDirty; }
  get needsFrame(): boolean {
    return this.pointerDirty || (!this.state.dragging && this.state.moving);
  }
  get tapX(): number { return this.pointerX; }
  get tapY(): number { return this.pointerY; }

  begin(x: number, y: number, time: number): void {
    startDrag(this.state);
    this.pointerX = this.appliedX = x;
    this.pointerY = this.appliedY = y;
    this.pointerTime = this.appliedTime = time;
    this.pointerDirty = false;
    this.gestureDistance = 0;
  }

  move(x: number, y: number, time: number): void {
    if (!this.state.dragging) return;
    if (x !== this.pointerX || y !== this.pointerY) this.pointerDirty = true;
    this.pointerX = x;
    this.pointerY = y;
    this.pointerTime = time;
  }

  end(x: number, y: number, time: number): boolean {
    this.move(x, y, time);
    const remainingDistance = Math.abs(this.pointerX - this.appliedX) + Math.abs(this.pointerY - this.appliedY);
    const isTap = this.gestureDistance + remainingDistance < 12;
    endDrag(this.state);
    return isTap;
  }

  advance(frameMs: number): GlobeState {
    if (this.pointerDirty) {
      const deltaX = this.pointerX - this.appliedX;
      const deltaY = this.pointerY - this.appliedY;
      const elapsedMs = Math.max(1, this.pointerTime - this.appliedTime);
      this.gestureDistance += Math.abs(deltaX) + Math.abs(deltaY);
      this.appliedX = this.pointerX;
      this.appliedY = this.pointerY;
      this.appliedTime = this.pointerTime;
      this.pointerDirty = false;
      dragGlobe(this.state, deltaX, deltaY, elapsedMs);
    }
    return advanceGlobe(this.state, frameMs);
  }

  setActive(active: boolean): void {
    setGlobeActive(this.state, active);
    if (!active) this.pointerDirty = false;
  }
}
