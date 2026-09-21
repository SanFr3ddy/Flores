import type { FlowerKind } from '../../core/types';
import { CONFIG } from '../../config';
import { Random, clamp01 } from '../../core/math';
import { createCanvas, glowSprite } from '../../core/sprites';
import { paletteFor } from './kit';
import { drawSunflower } from './sunflower';
import { drawDaisy } from './daisy';
import { drawCosmos } from './cosmos';
import { drawTulip } from './tulip';
import { drawBlossom } from './blossom';

/** Descripción de una cabeza de flor. El jardín la crea una vez por flor. */
export interface HeadSpec {
  kind: FlowerKind;
  /** Radio de la cabeza totalmente abierta, px CSS. */
  radius: number;
  /** Semilla entera por flor (variación de pétalos, tonos, etc.). */
  seed: number;
  /** 0 = fila trasera (más tenue), 1 = fila delantera (más brillante). */
  depth: number;
  /** 1 = mira de frente; ~0.6 = vista algo inclinada (achatada en Y). */
  facing: number;
}

/** Dibujo "en vivo" de una cabeza (sin caché). px = radio en píxeles físicos (nivel de detalle). */
function renderHead(g: CanvasRenderingContext2D, spec: HeadSpec, open: number, px: number): void {
  const pal = paletteFor(spec.depth);
  const rng = new Random(spec.seed * 7919 + 17);
  const s: HeadSpec = spec.facing >= 0.3 && spec.facing <= 1 ? spec : { ...spec, facing: Math.min(1, Math.max(0.3, spec.facing)) };
  switch (spec.kind) {
    case 'sunflower':
      drawSunflower(g, s, open, pal, rng, px);
      break;
    case 'daisy':
      drawDaisy(g, s, open, pal, rng, px);
      break;
    case 'cosmos':
      drawCosmos(g, s, open, pal, rng, px);
      break;
    case 'tulip':
      drawTulip(g, s, open, pal, rng, px);
      break;
    default:
      drawBlossom(g, s, open, pal, rng, px);
  }
}

/* ---------------- Caché de cabezas abiertas (LRU) ---------------- */

interface Sprite {
  canvas: HTMLCanvasElement;
  /** Semi-extensión en px CSS (el sprite va de -ext a +ext). */
  ext: number;
  /** Radio con el que se renderizó. */
  radius: number;
}

const CACHE_MAX = 80;
const cache = new Map<string, Sprite>();

function spriteFor(spec: HeadSpec, pixelRatio: number): Sprite {
  const rad = Math.max(2, Math.round(spec.radius));
  const pr = Math.round(Math.min(3, Math.max(0.5, pixelRatio)) * 4) / 4;
  const key = `${spec.kind}|${spec.seed}|${rad}|${Math.round(spec.depth * 10)}|${Math.round(spec.facing * 20)}|${pr}`;
  const hit = cache.get(key);
  if (hit) {
    // refrescar posición LRU
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  const ext = Math.ceil(rad * 1.32) + 2;
  const size = Math.ceil(ext * 2 * pr);
  const { canvas, g } = createCanvas(size, size);
  g.setTransform(pr, 0, 0, pr, ext * pr, ext * pr);
  renderHead(g, { ...spec, radius: rad }, 1, rad * pr);
  const sprite: Sprite = { canvas, ext, radius: rad };
  cache.set(key, sprite);
  if (cache.size > CACHE_MAX) {
    const first = cache.keys().next().value;
    if (first !== undefined) cache.delete(first);
  }
  return sprite;
}

/**
 * Dibuja la cabeza centrada en (0,0) del transform actual; "arriba" es -y.
 * El tallo llega por debajo, a (0, 0) — la cabeza se dibuja encima del tallo.
 * open: 0 = capullo cerrado, 1 = flor abierta. time: segundos de escena (brillos sutiles).
 * pixelRatio: dpr del canvas (para cachear sprites nítidos).
 * No debe dejar modificado el estado del contexto.
 */
export function drawFlowerHead(
  g: CanvasRenderingContext2D,
  spec: HeadSpec,
  open: number,
  _time: number,
  pixelRatio: number,
): void {
  if (!(spec.radius > 0.5)) return;
  const o = clamp01(Number.isFinite(open) ? open : 0);
  if (o >= 1) {
    const sp = spriteFor(spec, pixelRatio);
    const k = spec.radius / sp.radius;
    const e = sp.ext * k;
    g.drawImage(sp.canvas, -e, -e, e * 2, e * 2);
    return;
  }
  g.save();
  renderHead(g, spec, o, spec.radius * Math.max(0.5, pixelRatio));
  g.restore();
}

/**
 * Brillo aditivo cálido detrás de la cabeza. El jardín lo dibuja antes de la cabeza,
 * con el mismo transform.
 */
export function drawFlowerGlow(g: CanvasRenderingContext2D, spec: HeadSpec, open: number, time: number): void {
  const o = clamp01(Number.isFinite(open) ? open : 0);
  if (o <= 0.05 || !(spec.radius > 0.5)) return;
  const d = clamp01(spec.depth);
  const phase = (spec.seed % 628) / 100;
  const breathe = 1 + 0.1 * Math.sin(time * 1.1 + phase);
  const vis = o * o * (3 - 2 * o);
  const alpha = vis * (0.15 + 0.15 * d) * breathe;
  const R = spec.radius * (1.9 + 0.3 * d) * (0.6 + 0.4 * vis);
  const cy = spec.kind === 'tulip' ? -spec.radius * 0.2 : 0;
  const prevOp = g.globalCompositeOperation;
  const prevA = g.globalAlpha;
  g.globalCompositeOperation = 'lighter';
  g.globalAlpha = prevA * Math.min(1, alpha);
  g.drawImage(glowSprite(CONFIG.palette.warmGlow, 0.22), -R, cy - R, R * 2, R * 2);
  g.globalAlpha = prevA * Math.min(1, alpha * 0.8);
  const r2 = R * 0.55;
  g.drawImage(glowSprite(CONFIG.palette.glow, 0.3), -r2, cy - r2, r2 * 2, r2 * 2);
  g.globalAlpha = prevA;
  g.globalCompositeOperation = prevOp;
}

/** Libera sprites cacheados (el jardín lo llama en resize). */
export function clearFlowerCache(): void {
  cache.clear();
}
