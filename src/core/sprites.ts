import { rgba } from './math';

/** Crea un canvas fuera de pantalla de w×h píxeles físicos. */
export function createCanvas(w: number, h: number): { canvas: HTMLCanvasElement; g: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(w));
  canvas.height = Math.max(1, Math.ceil(h));
  const g = canvas.getContext('2d');
  if (!g) throw new Error('Canvas 2D no disponible');
  return { canvas, g };
}

const glowCache = new Map<string, HTMLCanvasElement>();

/**
 * Sprite de brillo radial (pre-renderizado y cacheado). Mucho más barato que shadowBlur.
 * Dibújalo centrado: g.drawImage(s, x - r, y - r, r * 2, r * 2), idealmente con
 * g.globalCompositeOperation = 'lighter' para un brillo aditivo.
 * @param color  color hex del núcleo
 * @param falloff 0..1: cuánto dura el núcleo intenso (0.1 = puntual, 0.5 = difuso)
 */
export function glowSprite(color: string, falloff = 0.25, size = 128): HTMLCanvasElement {
  const key = `${color}|${falloff}|${size}`;
  const cached = glowCache.get(key);
  if (cached) return cached;
  const { canvas, g } = createCanvas(size, size);
  const r = size / 2;
  const grad = g.createRadialGradient(r, r, 0, r, r, r);
  grad.addColorStop(0, rgba(color, 1));
  grad.addColorStop(falloff * 0.5, rgba(color, 0.75));
  grad.addColorStop(falloff, rgba(color, 0.32));
  grad.addColorStop(Math.min(0.99, falloff + (1 - falloff) * 0.45), rgba(color, 0.08));
  grad.addColorStop(1, rgba(color, 0));
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  glowCache.set(key, canvas);
  return canvas;
}

/** Dibuja un sprite de brillo centrado en (x, y) con radio r. */
export function drawGlow(
  g: CanvasRenderingContext2D,
  sprite: HTMLCanvasElement,
  x: number,
  y: number,
  r: number,
  alpha = 1,
): void {
  if (alpha <= 0.002 || r <= 0.1) return;
  const prev = g.globalAlpha;
  g.globalAlpha = prev * Math.min(1, alpha);
  g.drawImage(sprite, x - r, y - r, r * 2, r * 2);
  g.globalAlpha = prev;
}
