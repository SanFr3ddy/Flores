// "Blossom": ramillete de 5-9 florecitas de cinco pétalos, o pompón de craspedia (según semilla).
import { GOLDEN_ANGLE, TAU, lerp, smoothstep, type Random, type RGB } from '../../core/math';
import type { HeadSpec } from './index';
import { applyFacing, c, drawBack, unfurl, type Pal } from './kit';

function mix(a: RGB, b: RGB, t: number): RGB {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

export function drawBlossom(
  g: CanvasRenderingContext2D,
  spec: HeadSpec,
  open: number,
  pal: Pal,
  rng: Random,
  px: number,
): void {
  if (rng.chance(0.45)) drawPompom(g, spec, open, pal, rng, px);
  else drawCluster(g, spec, open, pal, rng, px);
}

/** Ramillete de florecitas. */
function drawCluster(g: CanvasRenderingContext2D, spec: HeadSpec, open: number, pal: Pal, rng: Random, px: number): void {
  const r = spec.radius;
  const n = rng.int(5, 9);
  const rot0 = rng.float(0, TAU);
  const base = g.globalAlpha;
  drawBack(g, r * 0.8, pal, spec.facing, open);
  g.save();
  applyFacing(g, r, spec.facing);
  const spreadK = 0.6 + 0.4 * smoothstep(0, 0.6, open);

  // Posiciones: una al centro y el resto en anillo (con jitter)
  const pts: { x: number; y: number; fr: number; st: number; rot: number }[] = [];
  for (let i = 0; i < n; i++) {
    const inner = i === 0;
    const a = rot0 + (i / (n - 1)) * TAU + rng.float(-0.25, 0.25);
    const rr = inner ? 0 : r * rng.float(0.5, 0.68) * spreadK;
    pts.push({
      x: Math.cos(a) * rr,
      y: Math.sin(a) * rr,
      fr: r * (inner ? 0.4 : rng.float(0.3, 0.38)),
      st: rng.float(0, 0.2),
      rot: rng.float(0, TAU),
    });
  }
  // Tallitos verdes hacia el centro
  g.strokeStyle = c(pal.sepal);
  g.lineWidth = Math.max(0.6, r * 0.04);
  g.beginPath();
  for (let i = 1; i < n; i++) {
    const p = pts[i]!;
    g.moveTo(0, r * 0.1);
    g.lineTo(p.x * 0.85, p.y * 0.85);
  }
  g.stroke();
  // Las de arriba primero (más lejos), la central al final
  const order = pts.slice(1).sort((a, b) => a.y - b.y);
  order.push(pts[0]!);
  for (const p of order) {
    const u = unfurl(open, p.st);
    g.save();
    g.translate(p.x, p.y);
    drawFloret(g, p.fr, u, open, pal, p.rot, px);
    g.restore();
  }
  g.restore();
  g.globalAlpha = base;
}

/** Florecita de cinco pétalos redondos con centro naranja. */
function drawFloret(g: CanvasRenderingContext2D, fr: number, u: number, open: number, pal: Pal, rot: number, px: number): void {
  // Capullito cuando aún no abre
  const budR = fr * (0.32 + 0.1 * smoothstep(0, 0.3, open));
  if (u < 0.35) {
    const t = smoothstep(0.0, 0.35, open);
    const col = mix(pal.sepal, pal.petal, t);
    const bg = g.createRadialGradient(-budR * 0.3, -budR * 0.4, 0, 0, 0, budR);
    bg.addColorStop(0, c(mix(col, pal.cream, 0.4)));
    bg.addColorStop(1, c(mix(col, pal.sepalDark, 0.4)));
    g.fillStyle = bg;
    g.beginPath();
    g.arc(0, 0, budR, 0, TAU);
    g.fill();
    if (u <= 0.02) return;
  }
  const k = Math.max(0, u);
  const pr = fr * 0.5 * (0.3 + 0.7 * k);
  const off = fr * 0.48 * (0.4 + 0.6 * Math.min(1, k));
  const grd = g.createRadialGradient(0, 0, 0, 0, 0, off + pr);
  grd.addColorStop(0, c(pal.deep));
  grd.addColorStop(0.45, c(pal.petal));
  grd.addColorStop(1, c(pal.light));
  g.fillStyle = grd;
  g.strokeStyle = c(pal.shadow, 0.35);
  g.lineWidth = Math.max(0.3, fr * 0.04);
  for (let i = 0; i < 5; i++) {
    const a = rot + (i / 5) * TAU;
    g.beginPath();
    g.ellipse(Math.cos(a) * off, Math.sin(a) * off, pr, pr * 0.86, a, 0, TAU);
    g.fill();
    if (px > 20) g.stroke();
  }
  const cr = fr * 0.2;
  const cg = g.createRadialGradient(-cr * 0.3, -cr * 0.3, 0, 0, 0, cr);
  cg.addColorStop(0, c(pal.light));
  cg.addColorStop(0.5, c(pal.orange));
  cg.addColorStop(1, c(pal.shadow));
  g.fillStyle = cg;
  g.beginPath();
  g.arc(0, 0, cr, 0, TAU);
  g.fill();
}

/** Pompón de craspedia: esfera dorada de florecitas diminutas. */
function drawPompom(g: CanvasRenderingContext2D, spec: HeadSpec, open: number, pal: Pal, _rng: Random, px: number): void {
  const r = spec.radius;
  const base = g.globalAlpha;
  const grow = 0.5 + 0.5 * smoothstep(0, 0.85, open) + 0.06 * Math.sin(Math.PI * smoothstep(0.55, 1, open));
  const R = r * 0.66 * grow;
  const col = smoothstep(0.05, 0.6, open);
  const bodyC = mix(pal.sepal, pal.petal, col);
  const darkC = mix(pal.sepalDark, pal.shadow, col);
  const lightC = mix(pal.sepalLight, pal.light, col);

  // Esfera base
  const sg = g.createRadialGradient(-R * 0.35, -R * 0.4, R * 0.05, 0, 0, R);
  sg.addColorStop(0, c(lightC));
  sg.addColorStop(0.55, c(bodyC));
  sg.addColorStop(1, c(darkC));
  g.fillStyle = sg;
  g.beginPath();
  g.arc(0, 0, R, 0, TAU);
  g.fill();

  // Florecitas (bultos) en espiral de Fibonacci proyectada en la esfera
  const N = Math.max(20, Math.min(170, Math.round(px * px * 0.1)));
  const bump = (R * 1.9) / Math.sqrt(N);
  const buckets: [number, string][] = [
    [-2, c(darkC, 0.75)],
    [0.1, c(bodyC)],
    [0.55, c(mix(lightC, pal.cream, 0.3 * col))],
  ];
  for (let b = 0; b < buckets.length; b++) {
    const lo = buckets[b]![0];
    const hi = b + 1 < buckets.length ? buckets[b + 1]![0] : 2;
    g.fillStyle = buckets[b]![1];
    g.beginPath();
    for (let i = 0; i < N; i++) {
      // punto en semiesfera frontal
      const z = 1 - (i + 0.5) / N; // 1..0
      const rr = Math.sqrt(1 - z * z);
      const a = i * GOLDEN_ANGLE;
      const nx = Math.cos(a) * rr;
      const ny = Math.sin(a) * rr;
      const light = -nx * 0.5 - ny * 0.6 + z * 0.62;
      if (light < lo || light >= hi) continue;
      const x = nx * R * 0.97;
      const y = ny * R * 0.97;
      const d = bump * 0.42 * (0.55 + 0.45 * z);
      g.moveTo(x + d, y);
      g.arc(x, y, d, 0, TAU);
    }
    g.fill();
  }
  // Brillo
  const hl = g.createRadialGradient(-R * 0.35, -R * 0.42, 0, -R * 0.35, -R * 0.42, R * 0.6);
  hl.addColorStop(0, c(pal.cream, 0.28 * col));
  hl.addColorStop(1, c(pal.cream, 0));
  g.fillStyle = hl;
  g.beginPath();
  g.arc(0, 0, R, 0, TAU);
  g.fill();
  g.globalAlpha = base;
}
