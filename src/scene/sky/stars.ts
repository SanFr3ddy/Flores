import { clamp, lerp, smoothstep, type Random } from '../../core/math';
import { drawGlow, glowSprite } from '../../core/sprites';
import type { World } from '../../core/types';
import { Haze } from './haze';
import { bouquetDim, heartLayout, isPortrait, moonLayout } from './layout';
import { STAR_TINTS, starDot, starFlare } from './sprites';

interface Star {
  /** Posición normalizada 0..1. */
  u: number;
  v: number;
  /** 0 = lejana, 1 = media, 2 = cercana (más parallax). */
  depth: number;
  r: number;
  tint: number;
  alpha: number;
  amp: number;
  s1: number;
  s2: number;
  p1: number;
  p2: number;
  /** Aparición escalonada. */
  delay: number;
  fade: number;
  bright: boolean;
  /** Atenuación estática por cercanía al ramo (se recalcula en resize). */
  dim: number;
}

/** Desplazamiento de parallax máximo por capa (px a escala 1). */
const PARALLAX = [1.5, 3.5, 7] as const;

/** Zona que el cielo deja libre de estrellas brillantes (título y mensajes). */
const inTextZone = (u: number, v: number) => Math.abs(u - 0.5) < 0.3 && v > 0.04 && v < 0.3;
/** Zona del ramo (cabezas y haz de tallos), donde no van estrellas brillantes. */
const inBouquet = (u: number, v: number) => Math.abs(u - 0.5) < 0.3 && v > 0.26 && v < 0.9;

/** ¿Cae (u, v) sobre la luna o la constelación? Ahí no van estrellas brillantes. */
function nearFeature(u: number, v: number, world: World): boolean {
  const W = world.width;
  const H = world.height;
  const m = moonLayout(W, H);
  const h = heartLayout(W, H);
  const x = u * W;
  const y = v * H;
  if (Math.hypot(x - m.x, y - m.y) < m.r * 5) return true;
  return Math.abs(x - h.u * W) < h.half * 1.6 && Math.abs(y - h.v * H) < h.half * 1.5;
}

export class StarField {
  private stars: Star[] = [];
  private sprites: HTMLCanvasElement[] = [];
  /** Parallax suavizado, -1..1. */
  private px = 0;
  private py = 0;
  private readonly ox = [0, 0, 0];
  private readonly oy = [0, 0, 0];

  init(rng: Random, world: World): void {
    this.sprites = STAR_TINTS.map((t) => starDot(t));
    this.px = 0;
    this.py = 0;
    const portrait = isPortrait(world.width, world.height);
    const total = Math.round(clamp(470 * world.quality, 250, 450));
    const stars: Star[] = [];
    for (let i = 0; i < total; i++) {
      const roll = rng.next();
      const depth = roll < 0.62 ? 0 : roll < 0.9 ? 1 : 2;
      let u = rng.next();
      // Más densas arriba, pero repartidas por todo el cielo (no hay pasto abajo).
      let v = rng.next() ** 1.35 * 0.97;
      // Parte de las lejanas se agrupa sobre la vía láctea.
      if (depth === 0 && rng.chance(0.28)) {
        u = rng.next();
        v = Haze.bandAt(u, portrait) + rng.gaussian() * 0.05;
        if (v < 0.01) v = rng.float(0.01, 0.3);
      }
      const tintRoll = rng.next();
      const tint = tintRoll < 0.45 ? 0 : tintRoll < 0.72 ? 3 : tintRoll < 0.9 ? 1 : 2;
      stars.push({
        u,
        v,
        depth,
        r: depth === 0 ? rng.float(0.45, 0.9) : depth === 1 ? rng.float(0.8, 1.3) : rng.float(1.2, 1.9),
        tint,
        alpha: depth === 0 ? rng.float(0.25, 0.6) : depth === 1 ? rng.float(0.45, 0.8) : rng.float(0.65, 0.95),
        amp: rng.float(0.15, 0.55),
        s1: rng.float(0.5, 2.1),
        s2: rng.float(0.13, 0.6),
        p1: rng.float(0, Math.PI * 2),
        p2: rng.float(0, Math.PI * 2),
        delay: rng.float(0.05, 2.3),
        fade: rng.float(0.7, 1.5),
        bright: false,
        dim: 1,
      });
    }
    // Un puñado de estrellas brillantes con halo y destello.
    const brightCount = Math.round(lerp(5, 9, world.quality));
    for (let i = 0; i < brightCount; i++) {
      let u = 0;
      let v = 0;
      for (let tries = 0; tries < 20; tries++) {
        u = rng.float(0.04, 0.96);
        v = rng.float(0.03, 0.5);
        if (!inTextZone(u, v) && !inBouquet(u, v) && !nearFeature(u, v, world)) break;
      }
      stars.push({
        u,
        v,
        depth: 2,
        r: rng.float(1.5, 2.2),
        tint: rng.pick([0, 1, 3, 2]),
        alpha: rng.float(0.85, 1),
        amp: rng.float(0.2, 0.4),
        s1: rng.float(0.4, 1.2),
        s2: rng.float(0.1, 0.35),
        p1: rng.float(0, Math.PI * 2),
        p2: rng.float(0, Math.PI * 2),
        delay: rng.float(0.2, 1.4),
        fade: rng.float(1, 1.8),
        bright: true,
        dim: 1,
      });
    }
    this.stars = stars;
  }

  resize(world: World): void {
    const W = world.width;
    const H = world.height;
    const m = moonLayout(W, H);
    const h = heartLayout(W, H);
    const hx = h.u * W;
    const hy = h.v * H;
    for (const s of this.stars) {
      const x = s.u * W;
      const y = s.v * H;
      // También se apagan un poco hacia el borde inferior.
      let dim = bouquetDim(x, y, W, H) * (1 - 0.35 * smoothstep(0.85, 1, s.v));
      // La luna tapa las estrellas que tiene detrás.
      dim *= smoothstep(m.r * 1.05, m.r * 1.6, Math.hypot(x - m.x, y - m.y));
      // Dentro del corazón el cielo se aquieta para que se lea la figura.
      const hd = Math.hypot((x - hx) / h.half, (y - hy) / (h.half * 0.9));
      dim *= 0.45 + 0.55 * smoothstep(0.6, 1.1, hd);
      s.dim = dim;
    }
  }

  update(dt: number, world: World): void {
    // Parallax amortiguado hacia el puntero (vuelve al centro si no hay puntero).
    const p = world.pointer;
    const on = p.active && !world.reducedMotion;
    const tx = on ? clamp((p.x / world.width) * 2 - 1, -1, 1) : 0;
    const ty = on ? clamp((p.y / world.height) * 2 - 1, -1, 1) : 0;
    const k = 1 - Math.exp(-1.8 * dt);
    this.px += (tx - this.px) * k;
    this.py += (ty - this.py) * k;
  }

  /** Desplazamiento de parallax (px) para una profundidad dada. */
  offset(depth: number, scale: number, out: { x: number; y: number }): void {
    const m = lerp(PARALLAX[0], PARALLAX[2], depth / 2) * scale;
    out.x = -this.px * m;
    out.y = -this.py * m * 0.6;
  }

  draw(g: CanvasRenderingContext2D, world: World): void {
    const t = world.time;
    const W = world.width;
    const H = world.height;
    const sizeK = 0.72 + 0.28 * world.scale;
    const motion = world.reducedMotion ? 0.35 : 1;
    for (let d = 0; d < 3; d++) {
      const m = PARALLAX[d] * world.scale;
      this.ox[d] = -this.px * m;
      this.oy[d] = -this.py * m * 0.6;
    }
    const flare = starFlare();
    const glow = glowSprite('#ffe9b0', 0.18, 64);

    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < this.stars.length; i++) {
      const s = this.stars[i]!;
      const appear = smoothstep(s.delay, s.delay + s.fade, t);
      if (appear <= 0) continue;
      const x = s.u * W + this.ox[s.depth]!;
      const y = s.v * H + this.oy[s.depth]!;
      // Centelleo suave: dos senos a distinta velocidad.
      const w1 = 0.5 + 0.5 * Math.sin(t * s.s1 * motion + s.p1);
      const w2 = 0.6 + 0.4 * Math.sin(t * s.s2 * motion + s.p2);
      const tw = 1 - s.amp * motion * w1 * w2;
      const a = s.alpha * tw * appear * s.dim;
      if (a <= 0.01) continue;
      const r = s.r * sizeK * (0.85 + 0.15 * tw);
      const size = r * 8;
      g.globalAlpha = a;
      g.drawImage(this.sprites[s.tint]!, x - size / 2, y - size / 2, size, size);
      if (s.bright) {
        drawGlow(g, glow, x, y, r * 7, a * 0.35);
        const fl = r * (9 + 5 * tw);
        g.globalAlpha = a * (0.45 + 0.35 * tw);
        g.drawImage(flare, x - fl, y - fl, fl * 2, fl * 2);
      }
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
  }
}
