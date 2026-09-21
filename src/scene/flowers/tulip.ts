// Tulipán de perfil: copa de 3-4 pétalos, rubor naranja en la base y brillo satinado.
import { TAU, lerp, smoothstep, type Random } from '../../core/math';
import type { HeadSpec } from './index';
import { c, unfurl, type Pal } from './kit';
import type { RGB } from '../../core/math';

function mix(a: RGB, b: RGB, t: number): RGB {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

/**
 * Pétalo de copa: base (x0, by), punta en (tx, ty), semiancho w.
 * flare > 0 abre la punta hacia afuera.
 */
function cupPetal(
  g: CanvasRenderingContext2D,
  x0: number,
  by: number,
  w: number,
  h: number,
  tx: number,
  flare: number,
): void {
  const ty = by - h;
  g.moveTo(x0 - w * 0.08, by);
  g.bezierCurveTo(x0 - w * 1.25, by - h * 0.02, x0 - w * 1.1 - flare * 0.3, by - h * 0.72, tx - w * 0.25 - flare * 0.2, ty + h * 0.06);
  g.quadraticCurveTo(tx, ty - h * 0.04, tx + w * 0.25 + flare * 0.2, ty + h * 0.06);
  g.bezierCurveTo(x0 + w * 1.1 + flare * 0.3, by - h * 0.72, x0 + w * 1.25, by - h * 0.02, x0 + w * 0.08, by);
  g.closePath();
}

export function drawTulip(
  g: CanvasRenderingContext2D,
  spec: HeadSpec,
  open: number,
  pal: Pal,
  rng: Random,
  px: number,
): void {
  const r = spec.radius;
  const base = g.globalAlpha;
  const lean = rng.float(-0.12, 0.12);
  const four = rng.chance(0.5);
  const hK = rng.float(0.95, 1.1);

  // Crecimiento del capullo y cambio de color verde -> amarillo
  const grow = 0.55 + 0.45 * smoothstep(0, 0.6, open);
  const col = smoothstep(0.05, 0.5, open);
  const loosen = unfurl(open, 0.02); // con rebote
  const h = r * 1.35 * hK * grow;
  const w = r * 0.4 * (0.72 + 0.28 * smoothstep(0, 0.5, open));
  const by = r * 0.5;
  const flare = w * 0.6 * Math.max(0, loosen);
  const spread = w * 0.32 * Math.max(0, loosen);

  const tipC = mix(pal.sepalLight, pal.light, col);
  const midC = mix(pal.sepal, pal.petal, col);
  const baseC = mix(pal.sepalDark, pal.orange, col);

  g.save();
  g.rotate(lean);
  const grad = (dark: number): CanvasGradient => {
    const gr = g.createLinearGradient(0, by, 0, by - h);
    gr.addColorStop(0, c(mix(baseC, pal.shadow, dark)));
    gr.addColorStop(0.35, c(mix(midC, pal.deep, dark * 0.8)));
    gr.addColorStop(1, c(mix(tipC, midC, dark)));
    return gr;
  };

  // Pétalos traseros
  g.fillStyle = grad(0.45);
  g.beginPath();
  cupPetal(g, -w * 0.35, by, w * 0.8, h * 0.97, -w * 0.45 - spread, flare);
  cupPetal(g, w * 0.35, by, w * 0.8, h * 0.97, w * 0.45 + spread, flare);
  g.fill();
  if (four) {
    g.fillStyle = grad(0.3);
    g.beginPath();
    cupPetal(g, 0, by, w * 0.7, h * 1.02, 0, flare * 0.3);
    g.fill();
  }

  // Interior visible cuando se abre
  if (loosen > 0.2) {
    const ia = smoothstep(0.2, 0.9, loosen);
    const ig = g.createRadialGradient(0, by - h * 0.75, 0, 0, by - h * 0.75, w * 1.2);
    ig.addColorStop(0, c(pal.shadow, 0.9 * ia));
    ig.addColorStop(1, c(pal.deep, 0));
    g.fillStyle = ig;
    g.beginPath();
    g.ellipse(0, by - h * 0.8, w * 0.9 + spread, h * 0.12, 0, 0, TAU);
    g.fill();
  }

  // Pétalos delanteros laterales
  g.fillStyle = grad(0.18);
  g.beginPath();
  cupPetal(g, -w * 0.55, by, w * 0.75, h * 0.9, -w * 0.75 - spread * 1.4, flare * 1.2);
  g.fill();
  g.beginPath();
  cupPetal(g, w * 0.55, by, w * 0.75, h * 0.9, w * 0.75 + spread * 1.4, flare * 1.2);
  g.fill();

  // Pétalo frontal
  g.fillStyle = grad(0);
  g.beginPath();
  cupPetal(g, 0, by + h * 0.02, w * 0.85, h * 0.93, spread * 0.1, flare * 0.6);
  g.fill();
  g.strokeStyle = c(pal.shadow, 0.35);
  g.lineWidth = Math.max(0.4, r * 0.015);
  g.stroke();

  // Brillo satinado del pétalo frontal
  if (px > 12) {
    const hl = g.createLinearGradient(-w * 0.5, 0, w * 0.3, 0);
    hl.addColorStop(0, c(pal.cream, 0));
    hl.addColorStop(0.5, c(pal.cream, 0.35 * (0.4 + 0.6 * col)));
    hl.addColorStop(1, c(pal.cream, 0));
    g.fillStyle = hl;
    g.beginPath();
    g.moveTo(-w * 0.35, by - h * 0.18);
    g.quadraticCurveTo(-w * 0.62, by - h * 0.55, -w * 0.2, by - h * 0.85);
    g.quadraticCurveTo(-w * 0.28, by - h * 0.5, -w * 0.1, by - h * 0.2);
    g.closePath();
    g.fill();
    // nervio central
    g.strokeStyle = c(pal.deep, 0.35 * col);
    g.beginPath();
    g.moveTo(0, by - h * 0.05);
    g.quadraticCurveTo(w * 0.08, by - h * 0.5, spread * 0.1, by - h * 0.86);
    g.stroke();
  }

  // Receptáculo verde
  g.fillStyle = c(pal.sepalDark);
  g.beginPath();
  g.ellipse(0, by + r * 0.03, w * 0.34, r * 0.08, 0, 0, TAU);
  g.fill();
  g.restore();
  g.globalAlpha = base;
}
