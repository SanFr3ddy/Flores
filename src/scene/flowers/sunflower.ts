// Girasol: 2-3 anillos de pétalos (Fibonacci), disco chocolate con filotaxis áurea.
import { GOLDEN_ANGLE, TAU, smoothstep, type Random } from '../../core/math';
import type { HeadSpec } from './index';
import {
  applyFacing,
  bloomScale,
  c,
  drawBack,
  drawBud,
  drawCalyx,
  faceAlpha,
  pointedPetal,
  unfurl,
  type Pal,
} from './kit';

interface Ring {
  n: number;
  len: number;
  w: number;
  rot: number;
  tone: number; // 0 = oscuro (fondo) .. 1 = claro
}

export function drawSunflower(
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

  // Parámetros por semilla (siempre en el mismo orden para que sean estables)
  const rc = r * rng.float(0.33, 0.39);
  const big = px > 34;
  const n1 = big ? rng.pick([21, 21, 34] as const) : 13;
  const rot0 = rng.float(0, TAU);
  const lenK = rng.float(0.92, 1.04);
  const rings: Ring[] = [];
  if (px > 48) rings.push({ n: 13, len: (r - rc) * 0.92 * lenK, w: 0, rot: rot0 + 0.11, tone: 0 });
  rings.push({ n: n1, len: (r - rc * 0.9) * lenK, w: 0, rot: rot0, tone: 0.55 });
  rings.push({ n: n1, len: (r - rc * 0.9) * 0.86 * lenK, w: 0, rot: rot0 + Math.PI / n1, tone: 1 });
  for (const ring of rings) ring.w = Math.min(r * 0.2, ((TAU * rc) / ring.n) * (ring.n > 30 ? 1.05 : ring.n > 20 ? 1.3 : 1.05));

  drawBack(g, r, pal, spec.facing, open);

  if (fa > 0.003) {
    g.save();
    applyFacing(g, r, spec.facing);
    const s = bloomScale(open);
    g.scale(s, s);
    g.globalAlpha = base * fa;

    // Brácteas verdes detrás
    drawCalyx(g, r, big ? 13 : 8, r * 0.34 + (r - rc) * 0.35 * smoothstep(0.2, 0.7, open), pal, rot0 + 0.2);

    // Pétalos
    for (let k = 0; k < rings.length; k++) {
      const ring = rings[k] as Ring;
      const grd = g.createRadialGradient(0, 0, rc * 0.8, 0, 0, rc * 0.8 + ring.len);
      if (ring.tone < 0.3) {
        grd.addColorStop(0, c(pal.shadow));
        grd.addColorStop(0.4, c(pal.deep));
        grd.addColorStop(1, c(pal.petal));
      } else {
        grd.addColorStop(0, c(pal.shadow));
        grd.addColorStop(0.18, c(pal.deep));
        grd.addColorStop(0.55, c(pal.petal));
        grd.addColorStop(1, c(ring.tone > 0.8 ? pal.light : pal.lemon));
      }
      const shadowCol = c(pal.shadow);
      const lightCol = c(pal.cream);
      g.strokeStyle = shadowCol;
      g.lineWidth = Math.max(0.35, ring.w * 0.06);
      for (let i = 0; i < ring.n; i++) {
        const jr = rng.float(-1, 1);
        const jl = rng.float(0.86, 1.1);
        const jb = rng.float(-0.5, 0.5);
        const st = rng.float(0, 0.18) * (k === 0 ? 0.5 : 1);
        const tv = rng.float(-0.12, 0.2);
        const tvDark = rng.chance(0.6);
        const u = unfurl(open, st);
        if (u <= 0.001) continue;
        const a = ring.rot + (i / ring.n) * TAU + jr * 0.06;
        const len = ring.len * jl * (0.3 + 0.7 * u);
        const w = ring.w * (0.45 + 0.55 * Math.min(1, u)) * rng.float(0.9, 1.1);
        // Trazo construido en espacio rotado; relleno en espacio de la flor (gradiente radial)
        g.save();
        g.rotate(a);
        g.translate(0, -rc * 0.78);
        g.beginPath();
        pointedPetal(g, len, w, jb * w * 0.5);
        if (px > 26) {
          g.moveTo(0, -len * 0.08);
          g.quadraticCurveTo(jb * w * 0.2, -len * 0.5, jb * w * 0.45, -len * 0.86);
        }
        g.restore();
        g.fillStyle = grd;
        g.fill();
        // variación de tono por pétalo
        if (tv > 0.02) {
          g.globalAlpha = base * fa * tv;
          g.fillStyle = tvDark ? shadowCol : lightCol;
          g.fill();
        }
        g.globalAlpha = base * fa * (ring.tone < 0.3 ? 0.4 : 0.3);
        g.stroke();
        g.globalAlpha = base * fa;
      }
    }

    // Sombra del disco sobre los pétalos
    const sh = g.createRadialGradient(0, 0, rc * 0.9, 0, 0, rc * 1.5);
    sh.addColorStop(0, c(pal.cDark, 0.55));
    sh.addColorStop(1, c(pal.cDark, 0));
    g.fillStyle = sh;
    g.beginPath();
    g.arc(0, 0, rc * 1.5, 0, TAU);
    g.fill();

    drawDisk(g, rc * (0.75 + 0.25 * smoothstep(0.15, 0.8, open)), open, pal, rng, px);
    g.restore();
  }

  g.globalAlpha = base;
  drawBud(g, r, open, pal, pal.petal);
  g.globalAlpha = base;
}

/** Disco central: domo chocolate, anillo de flósculos naranjas y semillas en espiral. */
function drawDisk(g: CanvasRenderingContext2D, rc: number, open: number, pal: Pal, rng: Random, px: number): void {
  const base = g.globalAlpha;
  const dome = g.createRadialGradient(-rc * 0.25, -rc * 0.3, rc * 0.1, 0, 0, rc);
  dome.addColorStop(0, c(pal.cLight));
  dome.addColorStop(0.55, c(pal.center));
  dome.addColorStop(1, c(pal.cDark));
  g.fillStyle = dome;
  g.beginPath();
  g.arc(0, 0, rc, 0, TAU);
  g.fill();

  // Anillo de flósculos (naranja-dorado) en el borde
  const ringN = Math.max(12, Math.min(64, Math.round(px * 0.9)));
  g.fillStyle = c(pal.orange, 0.9);
  g.beginPath();
  const fr = rc * (px > 30 ? 0.075 : 0.11);
  for (let i = 0; i < ringN; i++) {
    const a = (i / ringN) * TAU + rng.float(-0.05, 0.05);
    const rr = rc * (0.9 + (i % 2) * 0.07);
    const x = Math.cos(a) * rr;
    const y = Math.sin(a) * rr;
    g.moveTo(x + fr, y);
    g.arc(x, y, fr, 0, TAU);
  }
  g.fill();

  // Semillas: r = c·sqrt(n), ángulo áureo
  const full = Math.max(30, Math.min(300, Math.round(px * px * 0.06)));
  const N = open >= 0.85 ? full : Math.round(full * 0.45);
  const cc = (rc * 0.84) / Math.sqrt(N);
  const dot = cc * (open >= 0.85 ? 0.52 : 0.62);
  const bands: [number, number, string][] = [
    [0, 0.22, c(pal.olive)],
    [0.22, 0.7, c(pal.cDark)],
    [0.7, 1.01, c(pal.shadow, 0.85)],
  ];
  for (const [lo, hi, col] of bands) {
    g.fillStyle = col;
    g.beginPath();
    const i0 = Math.floor(lo * N);
    const i1 = Math.min(N, Math.floor(hi * N));
    for (let n = i0; n < i1; n++) {
      const a = n * GOLDEN_ANGLE;
      const rr = cc * Math.sqrt(n + 0.5);
      const x = Math.cos(a) * rr;
      const y = Math.sin(a) * rr;
      const d = dot * (0.7 + 0.3 * (rr / rc));
      g.moveTo(x + d, y);
      g.arc(x, y, d, 0, TAU);
    }
    g.fill();
  }
  // Puntitos claros entre semillas (textura)
  if (px > 40) {
    g.fillStyle = c(pal.cLight, 0.55);
    g.beginPath();
    for (let n = 0; n < N; n += 3) {
      const a = n * GOLDEN_ANGLE + 0.08;
      const rr = cc * Math.sqrt(n + 0.5) + cc * 0.3;
      g.rect(Math.cos(a) * rr, Math.sin(a) * rr, dot * 0.5, dot * 0.5);
    }
    g.fill();
  }
  // Brillo suave
  const hl = g.createRadialGradient(-rc * 0.32, -rc * 0.38, 0, -rc * 0.32, -rc * 0.38, rc * 0.75);
  hl.addColorStop(0, c(pal.cream, 0.2));
  hl.addColorStop(1, c(pal.cream, 0));
  g.fillStyle = hl;
  g.beginPath();
  g.arc(0, 0, rc, 0, TAU);
  g.fill();
  g.globalAlpha = base;
}
