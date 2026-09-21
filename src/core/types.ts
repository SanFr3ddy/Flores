import type { EventBus } from './events';
import type { Random } from './math';

export interface Vec2 {
  x: number;
  y: number;
}

export interface Pointer {
  /** Posición en píxeles CSS. */
  x: number;
  y: number;
  /** El puntero está sobre la escena (o hubo un toque reciente). */
  active: boolean;
  /** Botón / dedo presionado. */
  down: boolean;
}

export type FlowerKind = 'sunflower' | 'daisy' | 'tulip' | 'cosmos' | 'blossom';

/**
 * Cabeza de flor publicada por el jardín en cada frame para que otras capas
 * (mariposas, pétalos que caen, luciérnagas) puedan interactuar con ella.
 */
export interface FlowerAnchor {
  id: number;
  kind: FlowerKind;
  /** Centro actual de la cabeza (incluye el balanceo del viento), px CSS. */
  x: number;
  y: number;
  /** Radio visual de la flor totalmente abierta, px CSS. */
  radius: number;
  /** Progreso de apertura 0..1. */
  open: number;
  /** 0 = fila trasera, 1 = fila delantera. */
  depth: number;
  /** Ángulo actual de la cabeza en radianes (0 = mirando hacia arriba). */
  angle: number;
}

/**
 * Progreso del ramo. Lo escribe GardenLayer; la UI, el cielo, la carta y las
 * partículas lo leen para saber cuándo celebrar.
 */
export interface BouquetState {
  /** Flores del ramo ya agregadas (incluye las que crecen solas al inicio). */
  count: number;
  /** Flores necesarias para completar el ramo (0 hasta que el jardín lo decide). */
  total: number;
  /** world.time en que se completó (se abrió la última flor), o null si aún no. */
  completeAt: number | null;
}

export interface SceneEvents {
  /** Toque/clic sobre la escena (no sobre botones de la UI). */
  tap: { x: number; y: number };
  /** Una flor terminó de abrirse. */
  bloom: { x: number; y: number; radius: number; kind: FlowerKind };
  /** Pasó una estrella fugaz. */
  shootingStar: { x: number; y: number };
  /** La constelación de corazón terminó de formarse. */
  constellation: { x: number; y: number };
  /** Se agregó una flor al ramo (por toque o sola). */
  flowerAdded: { x: number; y: number; count: number; total: number };
  /** El ramo quedó completo (x, y = centro del ramo). Se emite una sola vez por escena. */
  bouquetComplete: { x: number; y: number };
  /** La escena se reinició (botón "repetir"). */
  restart: Record<string, never>;
}

export interface World {
  /** Tamaño del viewport en px CSS. */
  width: number;
  height: number;
  /** devicePixelRatio efectivo (máx. 2). El contexto ya viene escalado: dibuja en px CSS. */
  dpr: number;
  /** Segundos de escena desde que empezó la animación (afectado por ?speed). */
  time: number;
  /** Factor de tamaño ~1 en escritorio 1440x900, ~0.5 en móvil. Multiplica tamaños por esto. */
  scale: number;
  /** Línea del suelo (y en px CSS). Los tallos nacen aquí o un poco más abajo. */
  groundY: number;
  /** Multiplicador de densidad de partículas 0.35..1 (pantallas pequeñas / reduced-motion). */
  quality: number;
  /** prefers-reduced-motion activo. */
  reducedMotion: boolean;
  pointer: Pointer;
  /** Generador aleatorio con semilla (?seed=N) para composiciones reproducibles. */
  rng: Random;
  events: EventBus<SceneEvents>;
  /** Cabezas de flor actuales. Las escribe GardenLayer cada frame; el resto solo las lee. */
  flowers: FlowerAnchor[];
  /** Progreso del ramo que se arma tocando la pantalla. Lo escribe GardenLayer. */
  bouquet: BouquetState;
  /**
   * Viento horizontal en (x, y) para el instante actual, aprox. -1..1.
   * Suave y continuo; cada capa lo multiplica por su propia amplitud.
   */
  wind(x: number, y: number): number;
}

/**
 * Una capa de la escena. El motor llama, en orden:
 *   init() al empezar y al reiniciar (debe reiniciar TODO el estado),
 *   resize() tras init() y cada vez que cambia el viewport,
 *   update(dt) + draw() en cada frame.
 * dt está en segundos, ya escalado y acotado a <= 1/20; puede ser 0 (escena en pausa).
 */
export interface Layer {
  readonly name: string;
  init(world: World): void;
  resize(world: World): void;
  update(dt: number, world: World): void;
  draw(g: CanvasRenderingContext2D, world: World): void;
}
