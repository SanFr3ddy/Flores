import { createCanvas } from '../../core/sprites';
import { rgba } from '../../core/math';

/** Tintes de estrella: blanco cálido, oro pálido, blanco azulado y marfil. */
export const STAR_TINTS = ['#fff3dc', '#ffe6a6', '#dce6ff', '#fffaf0'] as const;

const dotCache = new Map<string, HTMLCanvasElement>();

/**
 * Punto de estrella: núcleo casi blanco y un halo muy corto del tinte.
 * El radio "visual" es ~1/4 del sprite; dibújalo con tamaño = radio * 8.
 */
export function starDot(tint: string): HTMLCanvasElement {
  const cached = dotCache.get(tint);
  if (cached) return cached;
  const size = 32;
  const { canvas, g } = createCanvas(size, size);
  const c = size / 2;
  const grad = g.createRadialGradient(c, c, 0, c, c, c);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.12, rgba(tint, 0.95));
  grad.addColorStop(0.25, rgba(tint, 0.45));
  grad.addColorStop(0.5, rgba(tint, 0.1));
  grad.addColorStop(1, rgba(tint, 0));
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  dotCache.set(tint, canvas);
  return canvas;
}

let flareCache: HTMLCanvasElement | null = null;

/** Destello de difracción de 4 puntas (cruz fina que se desvanece). */
export function starFlare(): HTMLCanvasElement {
  if (flareCache) return flareCache;
  const size = 128;
  const { canvas, g } = createCanvas(size, size);
  const c = size / 2;
  g.globalCompositeOperation = 'lighter';
  const ray = (horizontal: boolean) => {
    const grad = horizontal
      ? g.createLinearGradient(0, c, size, c)
      : g.createLinearGradient(c, 0, c, size);
    grad.addColorStop(0, 'rgba(255,240,210,0)');
    grad.addColorStop(0.35, 'rgba(255,240,210,0.18)');
    grad.addColorStop(0.5, 'rgba(255,250,235,0.95)');
    grad.addColorStop(0.65, 'rgba(255,240,210,0.18)');
    grad.addColorStop(1, 'rgba(255,240,210,0)');
    g.fillStyle = grad;
    // Rayo en forma de rombo muy fino: más ancho en el centro.
    g.beginPath();
    if (horizontal) {
      g.moveTo(0, c);
      g.lineTo(c, c - 1.3);
      g.lineTo(size, c);
      g.lineTo(c, c + 1.3);
    } else {
      g.moveTo(c, 0);
      g.lineTo(c + 1.3, c);
      g.lineTo(c, size);
      g.lineTo(c - 1.3, c);
    }
    g.closePath();
    g.fill();
  };
  ray(true);
  ray(false);
  flareCache = canvas;
  return canvas;
}
