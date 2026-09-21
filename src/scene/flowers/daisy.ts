// Margarita amarilla: 13-21 pétalos finos color limón y centro naranja abombado.
import { GOLDEN_ANGLE, TAU, smoothstep, type Random } from '../../core/math';
import type { HeadSpec } from './index';
import { applyFacing, bloomScale, c, drawBack, drawBud, drawCalyx, faceAlpha, roundPetal, unfurl, type Pal } from './kit';

export function drawDaisy(
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
  const n = px > 22 ? rng.pick([13, 21, 21] as const) : 13;
  const rc = r * rng.float(0.24, 0.29);
  const rot0 = rng.float(0, TAU);
  const len = r - rc * 0.55;
  const w = Math.min(r * 0.12, ((TAU * rc) / n) * 0.62);

  drawBack(g, r, pal, spec.facing, open);

  if (fa > 0.003) {
    g.save();
    applyFacing(g, r, spec.facing);
    const s = bloomScale(open);
    g.scale(s, s);
    g.globalAlpha = base * fa;
    drawCalyx(g, r, 10, r * 0.3 + r * 0.1 * smoothstep(0.2, 0.6, open), pal, rot0);

    const grd = g.createRadialGradient(0, 0, rc * 0.6, 0, 0, rc * 0.6 + len);
    grd.addColorStop(0, c(pal.deep));
    grd.addColorStop(0.3, c(pal.petal));
    grd.addColorStop(0.75, c(pal.lemon));
    grd.addColorStop(1, c(pal.cream));
    const grdB = g.createRadialGradient(0, 0, rc * 0.6, 0, 0, rc * 0.6 + len);
    grdB.addColorStop(0, c(pal.shadow));
    grdB.addColorStop(0.35, c(pal.deep));
    grdB.addColorStop(1, c(pal.petal));
    g.strokeStyle = c(pal.deep);
    g.lineWidth = Math.max(0.3, w * 0.1);

    // Dos capas: la trasera desplazada medio paso y algo más corta
    for (let layer = 0; layer < 2; layer++) {
      const cnt = n;
      const fill = layer === 0 ? grdB : grd;
      for (let i = 0; i < cnt; i++) {
        const jl = rng.float(0.88, 1.08);
        const jb = rng.float(-0.6, 0.6);
        const ja = rng.float(-0.05, 0.05);
        const st = rng.float(0, 0.2);
        const u = unfurl(open, st);
        if (u <= 0.001) continue;
        const a = rot0 + ((i + (layer === 0 ? 0.5 : 0)) / cnt) * TAU + ja;
        const L = len * jl * (layer === 0 ? 0.92 : 1) * (0.28 + 0.72 * u);
        const W = w * (0.5 + 0.5 * Math.min(1, u)) * rng.float(0.88, 1.12);
        g.save();
        g.rotate(a);
        g.translate(0, -rc * 0.7);
        g.beginPath();
        roundPetal(g, L, W, jb * W);
        if (px > 30) {
          g.moveTo(0, -L * 0.1);
          g.lineTo(jb * W * 0.7, -L * 0.85);
        }
        g.restore();
        g.fillStyle = fill;
        g.fill();
        g.globalAlpha = base * fa * (layer === 0 ? 0.4 : 0.22);
        g.stroke();
        g.globalAlpha = base * fa;
      }
    }

    // Centro abombado
    const cr = rc * (0.8 + 0.2 * smoothstep(0.2, 0.8, open));
    const sh = g.createRadialGradient(0, cr * 0.15, cr * 0.8, 0, cr * 0.15, cr * 1.45);
    sh.addColorStop(0, c(pal.shadow, 0.5));
    sh.addColorStop(1, c(pal.shadow, 0));
    g.fillStyle = sh;
    g.beginPath();
    g.arc(0, cr * 0.15, cr * 1.45, 0, TAU);
    g.fill();
    const dome = g.createRadialGradient(-cr * 0.3, -cr * 0.35, cr * 0.05, 0, 0, cr);
    dome.addColorStop(0, c(pal.petal));
    dome.addColorStop(0.45, c(pal.orange));
    dome.addColorStop(1, c(pal.shadow));
    g.fillStyle = dome;
    g.beginPath();
    g.arc(0, 0, cr, 0, TAU);
    g.fill();
    if (px > 16) {
      const N = Math.min(110, Math.max(24, Math.round(px * 1.4)));
      const cc = (cr * 0.9) / Math.sqrt(N);
      g.fillStyle = c(pal.shadow, 0.55);
      g.beginPath();
      for (let k = 0; k < N; k++) {
        const a = k * GOLDEN_ANGLE;
        const rr = cc * Math.sqrt(k + 0.5);
        const d = cc * 0.28;
        g.moveTo(Math.cos(a) * rr + d, Math.sin(a) * rr);
        g.arc(Math.cos(a) * rr, Math.sin(a) * rr, d, 0, TAU);
      }
      g.fill();
      g.fillStyle = c(pal.light, 0.7);
      g.beginPath();
      for (let k = 0; k < N; k += 2) {
        const a = k * GOLDEN_ANGLE;
        const rr = cc * Math.sqrt(k + 0.5);
        const x = Math.cos(a) * rr;
        const y = Math.sin(a) * rr;
        if (x + y > 0) continue; // solo la mitad iluminada
        const d = cc * 0.2;
        g.moveTo(x - cc * 0.15 + d, y - cc * 0.15);
        g.arc(x - cc * 0.15, y - cc * 0.15, d, 0, TAU);
      }
      g.fill();
    }
    g.restore();
  }
  g.globalAlpha = base;
  drawBud(g, r * 0.9, open, pal, pal.lemon);
  g.globalAlpha = base;
}
