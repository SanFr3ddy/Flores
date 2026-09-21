import { EventBus } from './events';
import { Random, clamp } from './math';
import type { Layer, SceneEvents, World } from './types';

export interface EngineOptions {
  seed: number;
  /** Multiplicador de velocidad del tiempo de escena. */
  speed: number;
}

const MAX_DT = 1 / 20;
const WARP_STEP = 1 / 30;

/**
 * Motor de la escena: un único canvas a pantalla completa, bucle con
 * requestAnimationFrame, capas dibujadas en orden y un "mundo" compartido.
 */
export class Engine {
  readonly world: World;
  /** Se llama tras dibujar cada frame (la UI DOM se sincroniza aquí). */
  onFrame: ((world: World) => void) | null = null;

  private readonly g: CanvasRenderingContext2D;
  private readonly layers: Layer[] = [];
  private readonly seed: number;
  private speed: number;
  private running = false;
  private rafId = 0;
  private lastNow = 0;
  private windNoise: (x: number, y: number) => number = () => 0;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    options: EngineOptions,
  ) {
    const g = canvas.getContext('2d', { alpha: false });
    if (!g) throw new Error('Tu navegador no soporta Canvas 2D');
    this.g = g;
    this.seed = options.seed;
    this.speed = options.speed;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const world: World = {
      width: 1,
      height: 1,
      dpr: 1,
      time: 0,
      scale: 1,
      groundY: 1,
      quality: 1,
      reducedMotion,
      pointer: { x: -9999, y: -9999, active: false, down: false },
      rng: new Random(this.seed),
      events: new EventBus<SceneEvents>(),
      flowers: [],
      wind: (x, y) => this.sampleWind(x, y),
    };
    this.world = world;

    this.measure();
    window.addEventListener('resize', this.handleResize);
    document.addEventListener('visibilitychange', this.handleVisibility);
    this.bindPointer();
  }

  add(layer: Layer): this {
    this.layers.push(layer);
    return this;
  }

  get isRunning(): boolean {
    return this.running;
  }

  setSpeed(speed: number): void {
    this.speed = Math.max(0, speed);
  }

  /** Arranca la escena desde cero; `warpTo` simula en silencio hasta ese segundo. */
  start(warpTo = 0): void {
    this.reset();
    if (warpTo > 0) {
      // Simulación rápida sin dibujar para adelantar la escena.
      const steps = Math.ceil(warpTo / WARP_STEP);
      for (let i = 0; i < steps; i++) this.step(Math.min(WARP_STEP, warpTo - this.world.time));
    }
    this.running = true;
    this.lastNow = performance.now();
    cancelAnimationFrame(this.rafId);
    this.rafId = requestAnimationFrame(this.frame);
  }

  /** Reinicia todas las capas y el tiempo (botón "repetir"). */
  restart(): void {
    this.world.events.emit('restart', {});
    this.start(0);
  }

  destroy(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
    window.removeEventListener('resize', this.handleResize);
    document.removeEventListener('visibilitychange', this.handleVisibility);
  }

  /* ---------------------------------------------------------------- */

  private reset(): void {
    const w = this.world;
    w.time = 0;
    w.rng = new Random(this.seed);
    w.flowers.length = 0;
    this.windNoise = w.rng.noise2D();
    for (const layer of this.layers) layer.init(w);
    for (const layer of this.layers) layer.resize(w);
  }

  private step(dt: number): void {
    const w = this.world;
    w.time += dt;
    for (const layer of this.layers) layer.update(dt, w);
  }

  private render(): void {
    const { g, world: w } = this;
    g.setTransform(w.dpr, 0, 0, w.dpr, 0, 0);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = '#000';
    g.fillRect(0, 0, w.width, w.height);
    for (const layer of this.layers) {
      g.save();
      layer.draw(g, w);
      g.restore();
    }
  }

  private frame = (now: number): void => {
    if (!this.running) return;
    const realDt = Math.min(MAX_DT, Math.max(0, (now - this.lastNow) / 1000));
    this.lastNow = now;
    this.step(realDt * this.speed);
    this.render();
    this.onFrame?.(this.world);
    this.rafId = requestAnimationFrame(this.frame);
  };

  private sampleWind(x: number, y: number): number {
    const t = this.world.time;
    const w = this.world;
    // Brisa lenta global + ráfagas que recorren la pantalla de izquierda a derecha.
    const breeze = Math.sin(t * 0.35) * 0.45 + Math.sin(t * 0.13 + 1.7) * 0.25;
    const gust = this.windNoise(x / Math.max(1, w.width) * 1.6 - t * 0.22, y / Math.max(1, w.height) * 0.6 + t * 0.05);
    const pointerPush =
      w.pointer.active && w.pointer.down
        ? clamp(1 - Math.hypot(x - w.pointer.x, y - w.pointer.y) / (240 * w.scale), 0, 1) * Math.sign(x - w.pointer.x)
        : 0;
    return clamp(breeze * 0.6 + gust * 0.55 + pointerPush * 0.8, -1.4, 1.4);
  }

  private measure(): void {
    const w = this.world;
    const width = Math.max(1, window.innerWidth);
    const height = Math.max(1, window.innerHeight);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    w.width = width;
    w.height = height;
    w.dpr = dpr;
    w.scale = clamp(Math.min(width, height * 1.25) / 1000, 0.5, 1.4);
    w.groundY = height - Math.max(18, height * 0.04);
    const area = (width * height) / (1440 * 900);
    w.quality = clamp(Math.sqrt(area), 0.45, 1) * (w.reducedMotion ? 0.6 : 1);
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
  }

  private handleResize = (): void => {
    this.measure();
    for (const layer of this.layers) layer.resize(this.world);
    if (!this.running) return;
    this.render();
  };

  private handleVisibility = (): void => {
    // Al volver a la pestaña evitamos un salto enorme de dt.
    this.lastNow = performance.now();
  };

  private bindPointer(): void {
    const p = this.world.pointer;
    const setPos = (e: PointerEvent) => {
      p.x = e.clientX;
      p.y = e.clientY;
      p.active = true;
    };
    this.canvas.addEventListener('pointermove', setPos);
    this.canvas.addEventListener('pointerdown', (e) => {
      setPos(e);
      p.down = true;
      if (this.running) this.world.events.emit('tap', { x: e.clientX, y: e.clientY });
    });
    const release = () => {
      p.down = false;
    };
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);
    this.canvas.addEventListener('pointerleave', (e) => {
      release();
      if (e.pointerType === 'mouse') p.active = false;
    });
  }
}
