import { useEffect, useRef, useState } from 'react';
import Taro from '@tarojs/taro';
import { Canvas, View } from '@tarojs/components';
import centers from '../../assets/geo/continent-centers.json';
import { GlobeInteraction } from './GlobeInteraction';
import type { GlobeViewport } from './GlobePicker';
import { globePerformance } from './GlobePerformance';
import { GlobeRendererWebGL } from './GlobeRendererWebGL';
import { nearestGeo } from './globeProjection';
import { globeSession } from './globeSession';
import type { GlobeRenderOptions } from './globeRenderer';
import { snapGlobe, type QualityLevel } from './globeState';

interface CanvasSelection { node?: Taro.Canvas; width?: number; height?: number; left?: number; top?: number }
type RendererKind = 'canvas' | 'webgl';
interface TouchPointData { x?: number; y?: number; pageX?: number; pageY?: number }
interface TouchEventData { touches?: ArrayLike<TouchPointData>; changedTouches?: ArrayLike<TouchPointData>; timeStamp?: number }

const qualityForDevice = (): QualityLevel => {
  const level = Taro.getSystemInfoSync().benchmarkLevel ?? 0;
  return level > 0 && level < 8 ? 'low' : level > 20 ? 'high' : 'medium';
};
const pixelRatioFor = (quality: QualityLevel, ratio: number): number =>
  Math.min(ratio || 1, quality === 'high' ? 1.5 : quality === 'medium' ? 1.25 : 1);
const now = (): number => typeof performance !== 'undefined' ? performance.now() : Date.now();
const touchX = (touch: TouchPointData, viewport: GlobeViewport): number => touch.pageX ?? ((touch.x ?? 0) + viewport.left);
const touchY = (touch: TouchPointData, viewport: GlobeViewport): number => touch.pageY ?? ((touch.y ?? 0) + viewport.top);

export interface GlobeCanvasProps {
  active: boolean;
  interactive?: boolean;
  continentCode: string;
  onContinentChange(code: string): void;
  id?: string;
  onCountrySelect?(code: string): void;
  selectedCountryCodes?: string[];
  focusedCountryCode?: string | null;
}

export function GlobeCanvas({ active, interactive = true, continentCode, onContinentChange, id = 'travel-globe', onCountrySelect,
  selectedCountryCodes = [], focusedCountryCode }: GlobeCanvasProps) {
  globePerformance.reactRender('canvas');
  const canvas2d = useRef<Taro.Canvas>();
  const context = useRef<CanvasRenderingContext2D>();
  const canvasRenderer = useRef<typeof import('./globeRenderer').renderGlobe>();
  const webglRenderer = useRef<GlobeRendererWebGL>();
  const viewport = useRef<GlobeViewport>({ width: 0, height: 0, left: 0, top: 0 });
  const quality = useRef<QualityLevel>('medium');
  const pixelRatio = useRef(1);
  const interaction = useRef<GlobeInteraction>();
  if (!interaction.current) interaction.current = new GlobeInteraction(globeSession.get(), active);
  const [rendererKind, setRendererKind] = useState<RendererKind>('canvas');
  const rendererKindRef = useRef<RendererKind>('canvas');
  const frameId = useRef<number>();
  const lastFrame = useRef(0);
  const renderPending = useRef(false);
  const zoom = useRef(1);
  const targetZoom = useRef(continentCode ? 1.38 : 1);
  const zoomAnimating = useRef(false);
  const selected = useRef(continentCode);
  const needsContinentSnap = useRef(false);
  const selectedCountries = useRef(selectedCountryCodes);
  const focusedCountry = useRef(focusedCountryCode);
  const activeRef = useRef(active);
  const interactiveRef = useRef(interactive);
  const onContinentChangeRef = useRef(onContinentChange);
  const onCountrySelectRef = useRef(onCountrySelect);
  const renderOptions = useRef<GlobeRenderOptions>();

  selectedCountries.current = selectedCountryCodes;
  focusedCountry.current = focusedCountryCode;
  activeRef.current = active;
  interactiveRef.current = interactive;
  onContinentChangeRef.current = onContinentChange;
  onCountrySelectRef.current = onCountrySelect;

  const paint = (state: GlobeInteraction) => {
    const webgl = webglRenderer.current;
    if (rendererKindRef.current === 'webgl' && webgl) {
      globePerformance.draw();
      webgl.render(state.state, zoom.current);
      return 0;
    }
    const ctx = context.current;
    const options = renderOptions.current;
    const renderer = canvasRenderer.current;
    if (!ctx || !options || !renderer) return 0;
    options.rotation = state.state;
    options.activeContinent = selected.current;
    options.quality = quality.current;
    options.selectedCountryCodes = selectedCountries.current;
    options.focusedCountryCode = focusedCountry.current;
    options.zoom = zoom.current;
    globePerformance.draw();
    return renderer(ctx, options);
  };

  const scheduleFrame = (force = false) => {
    if (force) renderPending.current = true;
    const node = canvas2d.current;
    if (!node || frameId.current !== undefined || !activeRef.current) return;
    const state = interaction.current;
    if (!renderPending.current && !zoomAnimating.current && !state?.needsFrame) return;
    frameId.current = node.requestAnimationFrame(frame);
  };

  const chooseNearestContinent = () => {
    const state = interaction.current;
    if (!state) return;
    const nearest = nearestGeo({ longitude: state.longitude, latitude: state.latitude }, centers);
    if (!nearest || nearest.code === selected.current) return;
    selected.current = nearest.code;
    onContinentChangeRef.current(nearest.code);
    webglRenderer.current?.setVisualState(nearest.code, selectedCountries.current, focusedCountry.current);
    targetZoom.current = 1.38;
    zoomAnimating.current = true;
    snapGlobe(state.state, nearest);
  };

  const frame = (time = now()) => {
    frameId.current = undefined;
    const state = interaction.current;
    if (!state || !activeRef.current) return;
    const elapsed = lastFrame.current ? Math.max(1, time - lastFrame.current) : 16.67;
    lastFrame.current = time;
    const frameStarted = now();
    state.advance(elapsed);
    const zoomDelta = targetZoom.current - zoom.current;
    if (Math.abs(zoomDelta) < 0.003) { zoom.current = targetZoom.current; zoomAnimating.current = false; }
    else {
      zoom.current += zoomDelta * (1 - Math.exp(-8 * Math.min(elapsed, 64) / 1000));
      zoomAnimating.current = true;
    }
    const renderStarted = now();
    const polygonMs = paint(state);
    const renderCpuMs = now() - renderStarted;
    globePerformance.frame(elapsed, now() - frameStarted, renderCpuMs, polygonMs, state.isDragging,
      rendererKindRef.current);
    renderPending.current = false;

    if (!state.isMoving && !state.isDragging && needsContinentSnap.current) {
      needsContinentSnap.current = false;
      chooseNearestContinent();
    }
    if (!state.isMoving && !zoomAnimating.current && !renderPending.current) {
      globeSession.set(state.longitude, state.latitude);
      lastFrame.current = 0;
      globePerformance.finishInteraction();
    }
    scheduleFrame();
  };

  useEffect(() => {
    let disposed = false;
    quality.current = qualityForDevice();
    const ratio = pixelRatioFor(quality.current, Taro.getSystemInfoSync().pixelRatio || 1);
    pixelRatio.current = ratio;
    Taro.nextTick(() => {
      if (disposed) return;
      const query = Taro.createSelectorQuery();
      query.select(`#${id}-2d`).fields({ node: true, size: true, rect: true });
      query.select(`#${id}-webgl`).fields({ node: true, size: true, rect: true });
      query.exec((results) => {
        const fallback = results[0] as CanvasSelection | undefined;
        const webgl = results[1] as CanvasSelection | undefined;
        if (!fallback?.node || !fallback.width || !fallback.height) return;
        canvas2d.current = fallback.node;
        viewport.current.width = fallback.width;
        viewport.current.height = fallback.height;
        viewport.current.left = fallback.left ?? 0;
        viewport.current.top = fallback.top ?? 0;
        const startCanvasFallback = async () => {
          const module = await import('./globeRenderer');
          if (disposed) return;
          fallback.node!.width = Math.round(fallback.width! * ratio);
          fallback.node!.height = Math.round(fallback.height! * ratio);
          const ctx = fallback.node!.getContext('2d') as unknown as CanvasRenderingContext2D;
          if (!ctx) throw new Error('当前设备不可用 Canvas 2D');
          ctx.scale(ratio, ratio);
          context.current = ctx;
          canvasRenderer.current = module.renderGlobe;
          renderOptions.current = { ...viewport.current, rotation: interaction.current!.state,
            activeContinent: selected.current, quality: quality.current, selectedCountryCodes: selectedCountries.current,
            focusedCountryCode: focusedCountry.current, zoom: zoom.current };
          rendererKindRef.current = 'canvas';
          setRendererKind('canvas');
          scheduleFrame(true);
        };

        if (webgl?.node) {
          void GlobeRendererWebGL.create(webgl.node, fallback.width, fallback.height, quality.current,
            Taro.getSystemInfoSync().pixelRatio || 1).then((renderer) => {
            if (disposed) { renderer.dispose(); return; }
            webglRenderer.current = renderer;
            renderer.setVisualState(selected.current, selectedCountries.current, focusedCountry.current);
            rendererKindRef.current = 'webgl';
            setRendererKind('webgl');
            scheduleFrame(true);
          }).catch((error: unknown) => {
            if (disposed) return;
            console.warn('[globe] WebGL unavailable; using optimized Canvas fallback', error);
            void startCanvasFallback().catch((fallbackError: unknown) => {
              console.error('[globe] Canvas fallback unavailable', fallbackError);
            });
          });
        } else void startCanvasFallback().catch((error: unknown) => {
          console.error('[globe] Canvas fallback unavailable', error);
        });
      });
    });
    return () => {
      disposed = true;
      if (frameId.current !== undefined) canvas2d.current?.cancelAnimationFrame(frameId.current);
      frameId.current = undefined;
      globePerformance.finishInteraction();
      const state = interaction.current;
      if (state) globeSession.set(state.longitude, state.latitude);
      webglRenderer.current?.dispose();
      webglRenderer.current = undefined;
    };
  }, []);

  useEffect(() => {
    if (selected.current === continentCode) return;
    globePerformance.beginInteraction();
    selected.current = continentCode;
    targetZoom.current = continentCode ? 1.38 : 1;
    const target = centers.find((item) => item.code === continentCode);
    const state = interaction.current;
    if (target && state) snapGlobe(state.state, target);
    zoomAnimating.current = Math.abs(targetZoom.current - zoom.current) >= 0.003;
    webglRenderer.current?.setVisualState(continentCode, selectedCountries.current, focusedCountry.current);
    scheduleFrame(true);
  }, [continentCode]);

  useEffect(() => {
    webglRenderer.current?.setVisualState(continentCode, selectedCountryCodes, focusedCountryCode);
    scheduleFrame(true);
  }, [selectedCountryCodes, focusedCountryCode]);

  useEffect(() => {
    const state = interaction.current;
    if (!state) return;
    state.setActive(active);
    if (!active) {
      if (frameId.current !== undefined) canvas2d.current?.cancelAnimationFrame(frameId.current);
      frameId.current = undefined;
      globePerformance.finishInteraction();
      globeSession.set(state.longitude, state.latitude);
    } else {
      scheduleFrame(true);
    }
  }, [active]);

  const eventTime = (event: TouchEventData): number => event.timeStamp || now();
  const onTouchStart = (event: TouchEventData) => {
    if (!activeRef.current || !interactiveRef.current) return;
    const touch = event.touches?.[0];
    if (!touch || !interaction.current) return;
    globePerformance.beginInteraction();
    needsContinentSnap.current = false;
    interaction.current.begin(touchX(touch, viewport.current), touchY(touch, viewport.current), eventTime(event));
  };
  const onTouchMove = (event: TouchEventData) => {
    if (!activeRef.current || !interactiveRef.current) return;
    const touch = event.touches?.[0];
    if (!touch || !interaction.current) return;
    interaction.current.move(touchX(touch, viewport.current), touchY(touch, viewport.current), eventTime(event));
    globePerformance.touchMove();
    scheduleFrame();
  };
  const onTouchEnd = (event: TouchEventData, cancelled = false) => {
    if (!activeRef.current || !interactiveRef.current) return;
    const touch = event.changedTouches?.[0] ?? event.touches?.[0];
    const state = interaction.current;
    if (!state) return;
    const x = touch ? touchX(touch, viewport.current) : state.tapX;
    const y = touch ? touchY(touch, viewport.current) : state.tapY;
    const isTap = state.end(x, y, eventTime(event));
    if (isTap && !cancelled) {
      const longitude = state.longitude;
      const latitude = state.latitude;
      const zoomAtTap = zoom.current;
      const query = Taro.createSelectorQuery();
      query.select(`#${id}-2d`).fields({ size: true, rect: true });
      query.exec((results) => {
        const rect = results[0] as CanvasSelection | undefined;
        if (rect?.width && rect.height) {
          viewport.current.width = rect.width;
          viewport.current.height = rect.height;
          viewport.current.left = rect.left ?? viewport.current.left;
          viewport.current.top = rect.top ?? viewport.current.top;
        }
        void import('./GlobePicker').then(({ pickCountryAt }) => {
          const started = now();
          const code = pickCountryAt(x, y, viewport.current, { longitude, latitude }, zoomAtTap);
          globePerformance.pick(now() - started);
          if (code) onCountrySelectRef.current?.(code);
          globePerformance.finishInteraction();
        }).catch((error: unknown) => {
          console.warn('[globe] Country picker unavailable', error);
          globePerformance.finishInteraction();
        });
      });
    } else if (!isTap || cancelled) needsContinentSnap.current = true;
    scheduleFrame(!isTap || cancelled);
  };

  return <View className="globe-render-surface" onTouchStart={onTouchStart} onTouchMove={onTouchMove}
    onTouchEnd={onTouchEnd} onTouchCancel={(event) => onTouchEnd(event, true)} catchMove>
    <Canvas id={`${id}-2d`} type="2d" className="globe-canvas globe-canvas-2d"
      style={{ opacity: rendererKind === 'webgl' ? 0 : 1 }} disableScroll />
    <Canvas id={`${id}-webgl`} type="webgl" className="globe-canvas globe-canvas-webgl"
      style={{ opacity: rendererKind === 'webgl' ? 1 : 0 }} disableScroll />
  </View>;
}
