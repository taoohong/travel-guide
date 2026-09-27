const WINDOW_MS = 1000;
const now = (): number => typeof performance !== 'undefined' ? performance.now() : Date.now();
const rounded = (value: number): number => Math.round(value * 100) / 100;

let windowStarted = 0;
let touchMoveCount = 0;
let rafCount = 0;
let drawCount = 0;
let canvasRenderCount = 0;
let pageRenderCount = 0;
let frameTimeTotal = 0;
let frameTimeMax = 0;
let frameGapTotal = 0;
let renderTimeTotal = 0;
let polygonTimeTotal = 0;
let frameCount = 0;
let dragFrameCount = 0;
let dragFrameTimeTotal = 0;
let dragFrameTimeMax = 0;
let animationFrameCount = 0;
let animationFrameTimeTotal = 0;
let animationFrameTimeMax = 0;
let lastPickMs = 0;
let pickCount = 0;
let lastRenderer: 'webgl' | 'canvas' = 'canvas';
const enabled = process.env.NODE_ENV !== 'production';

function flushIfReady(timestamp: number, force = false): void {
  if (!windowStarted) windowStarted = timestamp;
  const elapsed = Math.max(1, timestamp - windowStarted);
  if (!force && elapsed < WINDOW_MS) return;
  if (enabled) {
    console.info('[globe-diagnostics]', {
      renderer: lastRenderer,
      intervalMs: rounded(elapsed),
      touchmovePerSecond: rounded(touchMoveCount * 1000 / elapsed),
      canvasRafPerSecond: rounded(rafCount * 1000 / elapsed),
      drawPerSecond: rounded(drawCount * 1000 / elapsed),
      globeReactRenderPerSecond: rounded((canvasRenderCount + pageRenderCount) * 1000 / elapsed),
      canvasReactRenderPerSecond: rounded(canvasRenderCount * 1000 / elapsed),
      pageReactRenderPerSecond: rounded(pageRenderCount * 1000 / elapsed),
      fps: rounded(drawCount * 1000 / elapsed),
      averageFrameTimeMs: rounded(frameTimeTotal / Math.max(1, frameCount)),
      maxFrameTimeMs: rounded(frameTimeMax),
      averageFrameIntervalMs: rounded(frameGapTotal / Math.max(1, frameCount)),
      dragFramesPerSecond: rounded(dragFrameCount * 1000 / elapsed),
      dragAverageFrameTimeMs: rounded(dragFrameTimeTotal / Math.max(1, dragFrameCount)),
      dragMaxFrameTimeMs: rounded(dragFrameTimeMax),
      animationFramesPerSecond: rounded(animationFrameCount * 1000 / elapsed),
      animationAverageFrameTimeMs: rounded(animationFrameTimeTotal / Math.max(1, animationFrameCount)),
      animationMaxFrameTimeMs: rounded(animationFrameTimeMax),
      averageRenderTimeMs: rounded(renderTimeTotal / Math.max(1, frameCount)),
      averagePolygonTimeMs: rounded(polygonTimeTotal / Math.max(1, frameCount)),
      countryPickCount: pickCount,
      lastCountryPickMs: rounded(lastPickMs),
    });
  }
  windowStarted = timestamp;
  touchMoveCount = rafCount = drawCount = canvasRenderCount = pageRenderCount = 0;
  frameTimeTotal = frameTimeMax = frameGapTotal = renderTimeTotal = polygonTimeTotal = 0;
  frameCount = dragFrameCount = animationFrameCount = 0;
  dragFrameTimeTotal = dragFrameTimeMax = animationFrameTimeTotal = animationFrameTimeMax = 0;
  pickCount = 0;
}

export const globePerformance = {
  beginInteraction(): void {
    if (!enabled) return;
    windowStarted = now();
    touchMoveCount = rafCount = drawCount = canvasRenderCount = pageRenderCount = 0;
    frameTimeTotal = frameTimeMax = frameGapTotal = renderTimeTotal = polygonTimeTotal = 0;
    frameCount = dragFrameCount = animationFrameCount = 0;
    dragFrameTimeTotal = dragFrameTimeMax = animationFrameTimeTotal = animationFrameTimeMax = 0;
    pickCount = 0;
  },
  finishInteraction(): void {
    if (!enabled || !windowStarted) return;
    if (touchMoveCount || rafCount || drawCount || canvasRenderCount || pageRenderCount || pickCount) {
      flushIfReady(now(), true);
    }
    windowStarted = 0;
  },
  touchMove(): void {
    if (!enabled) return;
    touchMoveCount++;
    flushIfReady(now());
  },
  reactRender(component: 'canvas' | 'page'): void {
    if (!enabled) return;
    if (component === 'canvas') canvasRenderCount++;
    else pageRenderCount++;
    flushIfReady(now());
  },
  draw(): void {
    if (!enabled) return;
    drawCount++;
  },
  frame(gapMs: number, frameWorkMs: number, renderCpuMs: number, polygonMs: number,
    dragging: boolean, renderer: 'webgl' | 'canvas'): void {
    if (!enabled) return;
    const timestamp = now();
    if (!windowStarted) windowStarted = timestamp;
    rafCount++;
    frameCount++;
    frameGapTotal += gapMs;
    frameTimeTotal += frameWorkMs;
    frameTimeMax = Math.max(frameTimeMax, frameWorkMs);
    renderTimeTotal += renderCpuMs;
    polygonTimeTotal += polygonMs;
    if (dragging) {
      dragFrameCount++;
      dragFrameTimeTotal += frameWorkMs;
      dragFrameTimeMax = Math.max(dragFrameTimeMax, frameWorkMs);
    } else {
      animationFrameCount++;
      animationFrameTimeTotal += frameWorkMs;
      animationFrameTimeMax = Math.max(animationFrameTimeMax, frameWorkMs);
    }
    lastRenderer = renderer;
    flushIfReady(timestamp);
  },
  pick(elapsedMs: number): void { if (enabled) { lastPickMs = elapsedMs; pickCount++; } },
};
