// Cosmos amarillo: 8 pétalos anchos con la punta dentada, líneas radiales finas y estambres naranjas.
import { TAU, smoothstep, type Random } from '../../core/math';
import type { HeadSpec } from './index';
import { applyFacing, bloomScale, c, drawBack, drawBud, drawCalyx, faceAlpha, unfurl, type Pal } from './kit';

/** Pétalo en abanico con tres muescas en la punta (desde (0,0) hacia -y). */
function notchedPetal(g: CanvasRenderingContext2D, len: number, w: number, bend: number, notch: number): void {
  const n = notch * len;
  g.moveTo(0, 0);
  g.bezierCurveTo(w * 0.35, -len * 0.12, w * 1.05, -len * 0.45, w * 0.95 + bend, -len * 0.88);
  g.quadraticCurveTo(w * 0.78 + bend, -len * 0.99, w * 0.5 + bend, -len + n * 0.2);
  g.quadraticCurveTo(w * 0.4 + bend, -len + n, w * 0.25 + bend, -len + n * 0.1);
  g.quadraticCurveTo(w * 0.12 + bend, -len - n * 0.5, bend, -len + n * 0.9);
  g.quadraticCurveTo(-w * 0.12 + bend, -len - n * 0.5, -w * 0.25 + bend, -len + n * 0.1);
  g.quadraticCurveTo(-w * 0.4 + bend, -len + n, -w * 0.5 + bend, -len + n * 0.2);
  g.quadraticCurveTo(-w * 0.78 + bend, -len * 0.99, -w * 0.95 + bend, -len * 0.88);
  g.bezierCurveTo(-w * 1.05, -len * 0.45, -w * 0.35, -len * 0.12, 0, 0);
}

export function drawCosmos(
  g: CanvasRenderingContext2D,
  spec: HeadSpec,
  open: number,
  pal: Pal,
  rng: Random,
  px: number,
): void {
  const r = spec.radius;
  const fa = faceAlpha(open);
  const base = g.globalAlpha;
  const n = 8;
  const rot0 = rng.float(0, TAU);
  const rc = r * 0.2;
  const len = r * 0.94;
  const w = r * rng.float(0.27, 0.31);

  drawBack(g, r, pal, spec.facing, open);

  if (fa > 0.003) {
    g.save();
    applyFacing(g, r, spec.facing);
    const s = bloomScale(open);
    g.scale(s, s);
    g.globalAlpha = base * fa;
    drawCalyx(g, r, 8, r * 0.36 * smoothstep(0.1, 0.5, open) + r * 0.15, pal, rot0 + 0.39);

    const grd = g.createRadialGradient(0, 0, 0, 0, 0, len);
    grd.addColorStop(0, c(pal.shadow));
    grd.addColorStop(0.2, c(pal.deep));
    grd.addColorStop(0.45, c(pal.petal));
    grd.addColorStop(1, c(pal.lemon));
    g.lineWidth = Math.max(0.3, r * 0.008);

    // Orden de dibujo alterno: pares primero (debajo), impares encima
    for (let pass = 0; pass < 2; pass++) {
      for (let i = pass; i < n; i += 2) {
        const pr = new Randomish(spec.seed * 31 + i);
        const jl = pr.f(0.9, 1.06);
        const jb = pr.f(-0.12, 0.12) * w;
        const ja = pr.f(-0.07, 0.07);
        const st = pr.f(0, 0.2);
        const u = unfurl(open, st);
        if (u <= 0.001) continue;
        const a = rot0 + (i / n) * TAU + ja;
        const L = len * jl * (0.3 + 0.7 * u);
        const W = w * (0.35 + 0.65 * Math.min(1, u)) * pr.f(0.9, 1.08);
        g.save();
        g.rotate(a);
        g.beginPath();
        notchedPetal(g, L, W, jb, 0.06);
        g.restore();
        g.fillStyle = grd;
        g.fill();
        g.strokeStyle = c(pal.shadow, pass === 0 ? 0.7 : 0.55);
        g.stroke();
        // líneas radiales finas
        if (px > 24 && u > 0.5) {
          g.save();
          g.rotate(a);
          g.beginPath();
          const lines = px > 50 ? 7 : 4;
          for (let k = 0; k < lines; k++) {
            const t = (k / (lines - 1)) * 2 - 1;
            g.moveTo(t * W * 0.12, -L * 0.18);
            g.quadraticCurveTo(t * W * 0.6 + jb * 0.4, -L * 0.55, t * W * 0.72 + jb, -L * 0.86);
          }
          g.restore();
          g.strokeStyle = c(pal.deep, 0.45);
          g.stroke();
        }
      }
    }

    // Centro: disco y estambres
    const cr = rc * (0.7 + 0.3 * smoothstep(0.2, 0.8, open));
    const dome = g.createRadialGradient(-cr * 0.3, -cr * 0.3, 0, 0, 0, cr);
    dome.addColorStop(0, c(pal.petal));
    dome.addColorStop(0.5, c(pal.orange));
    dome.addColorStop(1, c(pal.shadow));
    g.fillStyle = dome;
    g.beginPath();
    g.arc(0, 0, cr, 0, TAU);
    g.fill();
    const st = Math.max(10, Math.min(28, Math.round(px * 0.5)));
    g.fillStyle = c(pal.cDark, 0.8);
    g.beginPath();
    for (let k = 0; k < st; k++) {
      const a = (k / st) * TAU + rot0;
      const rr = cr * (0.55 + (k % 3) * 0.14);
      const d = cr * 0.1;
      g.moveTo(Math.cos(a) * rr + d, Math.sin(a) * rr);
      g.arc(Math.cos(a) * rr, Math.sin(a) * rr, d, 0, TAU);
    }
    g.fill();
    g.fillStyle = c(pal.light);
    g.beginPath();
    for (let k = 0; k < st; k += 2) {
      const a = (k / st) * TAU + rot0 + 0.1;
      const rr = cr * (0.6 + (k % 3) * 0.14);
      const d = cr * 0.07;
      g.moveTo(Math.cos(a) * rr - d * 0.5 + d, Math.sin(a) * rr - d * 0.5);
      g.arc(Math.cos(a) * rr - d * 0.5, Math.sin(a) * rr - d * 0.5, d, 0, TAU);
    }
    g.fill();
    g.restore();
  }
  g.globalAlpha = base;
  drawBud(g, r * 0.85, open, pal, pal.petal);
  g.globalAlpha = base;
}

/** Mini generador por pétalo (evita depender del orden de dibujo). */
class Randomish {
  private s: number;
  constructor(seed: number) {
    this.s = (seed | 0) ^ 0x9e3779b9;
  }
  f(min: number, max: number): number {
    this.s = Math.imul(this.s ^ (this.s >>> 15), 0x2c1b3c6d);
    this.s = Math.imul(this.s ^ (this.s >>> 12), 0x297a2d39);
    this.s ^= this.s >>> 15;
    return min + (max - min) * ((this.s >>> 0) / 4294967296);
  }
}
