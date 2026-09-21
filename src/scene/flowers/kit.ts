// Utilidades compartidas por todas las cabezas de flor: paleta por profundidad,
// curvas de apertura, formas de pétalo, capullo y sépalos.
import { CONFIG } from '../../config';
import { clamp01, ease, hexToRgb, smoothstep, TAU, type RGB } from '../../core/math';

/** Paleta ya sombreada para una profundidad concreta (tuplas RGB). */
export interface Pal {
  light: RGB;
  petal: RGB;
  deep: RGB;
  shadow: RGB;
  lemon: RGB;
  cream: RGB;
  cDark: RGB;
  center: RGB;
  cLight: RGB;
  orange: RGB;
  olive: RGB;
  sepal: RGB;
  sepalLight: RGB;
  sepalDark: RGB;
}

/** Color CSS de una tupla con alfa. */
export function c(t: RGB, a = 1): string {
  return a >= 1 ? `rgb(${t[0] | 0},${t[1] | 0},${t[2] | 0})` : `rgba(${t[0] | 0},${t[1] | 0},${t[2] | 0},${a < 0 ? 0 : a})`;
}

/** Oscurece y desatura según profundidad (0 = fila trasera). */
function shade(hex: string, d: number): RGB {
  const [r, g, b] = hexToRgb(hex);
  const k = 0.78 + 0.22 * d;
  const s = 0.14 * (1 - d);
  const lum = 0.3 * r + 0.59 * g + 0.11 * b;
  return [(r + (lum - r) * s) * k, (g + (lum - g) * s) * k, (b + (lum - b) * s) * k * 0.96];
}

const palCache = new Map<number, Pal>();

export function paletteFor(depth: number): Pal {
  const key = Math.round(clamp01(depth) * 10);
  const hit = palCache.get(key);
  if (hit) return hit;
  const d = key / 10;
  const p = CONFIG.palette;
  const pal: Pal = {
    light: shade(p.petalLight, d),
    petal: shade(p.petal, d),
    deep: shade(p.petalDeep, d),
    shadow: shade(p.petalShadow, d),
    lemon: shade('#fff06a', d),
    cream: shade('#fffbd6', d),
    cDark: shade(p.centerDark, d),
    center: shade(p.center, d),
    cLight: shade(p.centerLight, d),
    orange: shade('#ff8a12', d),
    olive: shade('#3b3a0c', d),
    sepal: shade(p.stem, d),
    sepalLight: shade(p.stemLight, d),
    sepalDark: shade(p.stemDark, d),
  };
  palCache.set(key, pal);
  return pal;
}

/* ---------------- Curvas de apertura ---------------- */

/** Escala global de la cabeza mientras abre. */
export const bloomScale = (open: number): number => 0.42 + 0.58 * ease.outQuad(clamp01(open / 0.95));

/** Opacidad de la cara de la flor (se funde con el capullo). */
export const faceAlpha = (open: number): number => smoothstep(0.1, 0.27, open);

/** Opacidad del capullo cerrado. */
export const budAlpha = (open: number): number => 1 - smoothstep(0.17, 0.31, open);

/**
 * Despliegue de un pétalo con retraso `stagger` (0..0.2) y rebote suave.
 * Llega exactamente a 1 cuando open = 1.
 */
export function unfurl(open: number, stagger: number): number {
  const u = clamp01((open - 0.18 - stagger) / 0.62);
  if (u <= 0) return 0;
  // curva suave con un pequeño rebote (~4 %) antes de asentarse
  return ease.inOutQuad(u) + 0.13 * Math.sin(Math.PI * u ** 1.5);
}

/* ---------------- Formas ---------------- */

/** Pétalo puntiagudo desde (0,0) hacia -y. w = semiancho, bend = curvatura lateral de la punta. */
export function pointedPetal(g: CanvasRenderingContext2D, len: number, w: number, bend: number): void {
  g.moveTo(0, 0);
  g.bezierCurveTo(w * 0.7, -len * 0.1, w * 1.05 + bend * 0.5, -len * 0.55, bend, -len);
  g.bezierCurveTo(-w * 1.05 + bend * 0.5, -len * 0.55, -w * 0.7, -len * 0.1, 0, 0);
}

/** Pétalo alargado de punta redondeada (margarita). */
export function roundPetal(g: CanvasRenderingContext2D, len: number, w: number, bend: number): void {
  g.moveTo(0, 0);
  g.bezierCurveTo(w * 0.9, -len * 0.08, w * 1.1 + bend * 0.4, -len * 0.8, bend + w * 0.35, -len * 0.99);
  g.quadraticCurveTo(bend, -len * 1.03, bend - w * 0.35, -len * 0.99);
  g.bezierCurveTo(-w * 1.1 + bend * 0.4, -len * 0.8, -w * 0.9, -len * 0.08, 0, 0);
}

/** Lágrima (capullo) con base en (0, by) y punta hacia arriba. */
export function teardrop(g: CanvasRenderingContext2D, by: number, w: number, h: number): void {
  g.moveTo(0, by);
  g.bezierCurveTo(w * 1.25, by, w * 0.95, by - h * 0.62, 0, by - h);
  g.bezierCurveTo(-w * 0.95, by - h * 0.62, -w * 1.25, by, 0, by);
}

/** Hoja de sépalo desde (0,0) hacia -y. */
export function sepalLeaf(g: CanvasRenderingContext2D, len: number, w: number): void {
  g.moveTo(0, 0);
  g.bezierCurveTo(w * 1.1, -len * 0.25, w * 0.7, -len * 0.7, 0, -len);
  g.bezierCurveTo(-w * 0.7, -len * 0.7, -w * 1.1, -len * 0.25, 0, 0);
}

/**
 * Capullo verde que se abre: sépalos que se separan dejando ver el amarillo.
 * Se dibuja en coordenadas de la cabeza (sin achatado). Respeta el globalAlpha actual.
 */
export function drawBud(g: CanvasRenderingContext2D, r: number, open: number, pal: Pal, tint: RGB): void {
  const a = budAlpha(open);
  if (a <= 0.003) return;
  const base = g.globalAlpha;
  g.globalAlpha = base * a;
  const peek = smoothstep(0.0, 0.22, open);
  const part = smoothstep(0.02, 0.34, open);
  const by = r * 0.2;
  const h = r * (0.6 + 0.28 * peek);
  const w = r * (0.3 + 0.14 * peek);
  // Corazón amarillo que asoma
  if (peek > 0.01) {
    const gr = g.createLinearGradient(0, by, 0, by - h);
    gr.addColorStop(0, c(pal.deep));
    gr.addColorStop(0.6, c(tint));
    gr.addColorStop(1, c(pal.light));
    g.fillStyle = gr;
    g.beginPath();
    teardrop(g, by, w * 0.95, h);
    g.fill();
  }
  // Sépalos
  const sl = h * (1.02 - 0.3 * part);
  const sgr = g.createLinearGradient(0, by, 0, by - sl);
  sgr.addColorStop(0, c(pal.sepalDark));
  sgr.addColorStop(0.55, c(pal.sepal));
  sgr.addColorStop(1, c(pal.sepalLight));
  g.fillStyle = sgr;
  const order = [-2, 2, -1, 1, 0];
  for (let k = 0; k < order.length; k++) {
    const i = order[k] as number;
    g.save();
    g.translate(0, by);
    g.rotate(i * (0.16 + 0.42 * part));
    g.beginPath();
    sepalLeaf(g, sl * (i === 0 ? 1 : 0.94), w * (i === 0 ? 0.62 : 0.5));
    g.fill();
    g.restore();
  }
  // Brillo lateral
  g.globalAlpha = base * a * 0.35;
  g.strokeStyle = c(pal.sepalLight);
  g.lineWidth = Math.max(0.5, r * 0.03);
  g.beginPath();
  g.moveTo(-w * 0.35, by - h * 0.2);
  g.quadraticCurveTo(-w * 0.45, by - h * 0.6, -w * 0.05, by - h * 0.92);
  g.stroke();
  g.globalAlpha = base;
}

/**
 * Sépalos/brácteas verdes radiales detrás de la cara (visibles al abrir).
 * También dibuja el cáliz desplazado hacia abajo cuando la flor está inclinada.
 */
export function drawCalyx(
  g: CanvasRenderingContext2D,
  r: number,
  n: number,
  len: number,
  pal: Pal,
  rot: number,
): void {
  const gr = g.createRadialGradient(0, 0, r * 0.2, 0, 0, r * 0.2 + len);
  gr.addColorStop(0, c(pal.sepalDark));
  gr.addColorStop(1, c(pal.sepal));
  g.fillStyle = gr;
  g.beginPath();
  for (let i = 0; i < n; i++) {
    const a = rot + (i / n) * TAU;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const w = len * 0.32;
    // hoja apuntando en dirección a
    const bx = ca * r * 0.2;
    const by = sa * r * 0.2;
    const tx = ca * (r * 0.2 + len);
    const ty = sa * (r * 0.2 + len);
    g.moveTo(bx - sa * w, by + ca * w);
    g.quadraticCurveTo(bx + ca * len * 0.6 - sa * w, by + sa * len * 0.6 + ca * w, tx, ty);
    g.quadraticCurveTo(bx + ca * len * 0.6 + sa * w, by + sa * len * 0.6 - ca * w, bx + sa * w, by - ca * w);
    g.closePath();
  }
  g.fill();
}

/** Reverso verde de la cabeza asomando por debajo cuando está inclinada (efecto 3D). */
export function drawBack(g: CanvasRenderingContext2D, r: number, pal: Pal, facing: number, open: number): void {
  const tilt = 1 - facing;
  if (tilt < 0.06) return;
  const s = bloomScale(open) * faceAlpha(open);
  if (s <= 0.01) return;
  const gr = g.createRadialGradient(0, r * tilt * 0.3, 0, 0, r * tilt * 0.3, r * 0.5 * s);
  gr.addColorStop(0, c(pal.sepal));
  gr.addColorStop(1, c(pal.sepalDark));
  g.fillStyle = gr;
  g.beginPath();
  g.ellipse(0, r * tilt * 0.35, r * 0.46 * s, r * 0.46 * s * (0.35 + facing * 0.5), 0, 0, TAU);
  g.fill();
}

/** Aplica la inclinación: desplaza el centro y achata en Y. Hacer save() antes. */
export function applyFacing(g: CanvasRenderingContext2D, r: number, facing: number): void {
  g.translate(0, -(1 - facing) * r * 0.16);
  g.scale(1, facing);
}
