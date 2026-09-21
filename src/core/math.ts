import { createNoise2D, createNoise3D, type NoiseFunction2D, type NoiseFunction3D } from 'simplex-noise';
import type { Vec2 } from './types';

export const TAU = Math.PI * 2;
/** Ángulo áureo (≈137.5°): distribución de semillas del girasol. */
export const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

/* ------------------------------------------------------------------ */
/* Aleatoriedad con semilla                                            */
/* ------------------------------------------------------------------ */

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Random {
  readonly next: () => number;

  constructor(seed: number) {
    this.next = mulberry32(seed);
  }

  /** Número en [min, max). */
  float(min = 0, max = 1): number {
    return min + (max - min) * this.next();
  }

  /** Entero en [min, max] (ambos incluidos). */
  int(min: number, max: number): number {
    return Math.floor(this.float(min, max + 1));
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  sign(): 1 | -1 {
    return this.next() < 0.5 ? -1 : 1;
  }

  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.next() * items.length)] as T;
  }

  /** Distribución aproximadamente normal (media 0, desviación 1). */
  gaussian(): number {
    const u = 1 - this.next();
    const v = this.next();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v);
  }

  /** Crea un generador hijo independiente (útil para sub-sistemas). */
  fork(): Random {
    return new Random(Math.floor(this.next() * 4294967296));
  }

  noise2D(): NoiseFunction2D {
    return createNoise2D(this.fork().next);
  }

  noise3D(): NoiseFunction3D {
    return createNoise3D(this.fork().next);
  }
}

/* ------------------------------------------------------------------ */
/* Interpolación y easing                                              */
/* ------------------------------------------------------------------ */

export const clamp = (v: number, min: number, max: number): number => (v < min ? min : v > max ? max : v);
export const clamp01 = (v: number): number => clamp(v, 0, 1);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const invLerp = (a: number, b: number, v: number): number => (a === b ? 0 : (v - a) / (b - a));
/** Mapea v de [a1,b1] a [a2,b2] acotando al rango destino. */
export const remap = (v: number, a1: number, b1: number, a2: number, b2: number): number =>
  lerp(a2, b2, clamp01(invLerp(a1, b1, v)));

export const smoothstep = (edge0: number, edge1: number, x: number): number => {
  const t = clamp01(invLerp(edge0, edge1, x));
  return t * t * (3 - 2 * t);
};

/** Suavizado exponencial independiente del framerate. */
export const damp = (current: number, target: number, lambda: number, dt: number): number =>
  lerp(current, target, 1 - Math.exp(-lambda * dt));

export const ease = {
  linear: (t: number) => t,
  inQuad: (t: number) => t * t,
  outQuad: (t: number) => 1 - (1 - t) * (1 - t),
  inOutQuad: (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2),
  outCubic: (t: number) => 1 - (1 - t) ** 3,
  inOutCubic: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  outQuart: (t: number) => 1 - (1 - t) ** 4,
  outQuint: (t: number) => 1 - (1 - t) ** 5,
  inOutSine: (t: number) => -(Math.cos(Math.PI * t) - 1) / 2,
  outSine: (t: number) => Math.sin((t * Math.PI) / 2),
  outExpo: (t: number) => (t === 1 ? 1 : 1 - 2 ** (-10 * t)),
  outBack: (t: number, s = 1.70158) => 1 + (s + 1) * (t - 1) ** 3 + s * (t - 1) ** 2,
  outElastic: (t: number) =>
    t === 0 || t === 1 ? t : 2 ** (-10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1,
} as const;

/** Progreso 0..1 de una animación que empieza en `start` y dura `duration`. */
export const progress = (time: number, start: number, duration: number): number =>
  duration <= 0 ? (time >= start ? 1 : 0) : clamp01((time - start) / duration);

/* ------------------------------------------------------------------ */
/* Geometría                                                           */
/* ------------------------------------------------------------------ */

export const dist = (ax: number, ay: number, bx: number, by: number): number => Math.hypot(bx - ax, by - ay);

export function quadPoint(p0: Vec2, p1: Vec2, p2: Vec2, t: number, out: Vec2 = { x: 0, y: 0 }): Vec2 {
  const u = 1 - t;
  out.x = u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x;
  out.y = u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y;
  return out;
}

export function cubicPoint(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, t: number, out: Vec2 = { x: 0, y: 0 }): Vec2 {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  out.x = a * p0.x + b * p1.x + c * p2.x + d * p3.x;
  out.y = a * p0.y + b * p1.y + c * p2.y + d * p3.y;
  return out;
}

/** Tangente (no normalizada) de una cúbica en t. */
export function cubicTangent(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, t: number, out: Vec2 = { x: 0, y: 0 }): Vec2 {
  const u = 1 - t;
  out.x = 3 * u * u * (p1.x - p0.x) + 6 * u * t * (p2.x - p1.x) + 3 * t * t * (p3.x - p2.x);
  out.y = 3 * u * u * (p1.y - p0.y) + 6 * u * t * (p2.y - p1.y) + 3 * t * t * (p3.y - p2.y);
  return out;
}

/* ------------------------------------------------------------------ */
/* Color                                                               */
/* ------------------------------------------------------------------ */

export type RGB = readonly [number, number, number];

export function hexToRgb(hex: string): RGB {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgba(color: string | RGB, alpha = 1): string {
  const [r, g, b] = typeof color === 'string' ? hexToRgb(color) : color;
  return `rgba(${r | 0},${g | 0},${b | 0},${clamp01(alpha)})`;
}

/** Mezcla dos colores hex; t=0 → a, t=1 → b. */
export function mixColor(a: string, b: string, t: number, alpha = 1): string {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  return rgba([lerp(ca[0], cb[0], t), lerp(ca[1], cb[1], t), lerp(ca[2], cb[2], t)], alpha);
}
