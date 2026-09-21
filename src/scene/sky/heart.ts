import { CONFIG } from '../../config';
import { clamp, clamp01, ease, lerp, smoothstep, type Random } from '../../core/math';
import { createCanvas, drawGlow, glowSprite } from '../../core/sprites';
import type { World } from '../../core/types';
import { heartLayout } from './layout';
import { STAR_TINTS, starDot, starFlare } from './sprites';

interface HeartStar {
  /** Punto destino en unidades del corazón (ancho = 2). */
  hx: number;
  hy: number;
  /** Posición inicial dispersa, normalizada a la pantalla. */
  su: number;
  sv: number;
  /** Curvatura del trayecto (desvío perpendicular, en px a escala 1). */
  bend: number;
  delay: number;
  r: number;
  tint: number;
  appear: number;
  s1: number;
  p1: number;
  /** Algunas estrellas destellan un poco más una vez formado el corazón. */
  special: boolean;
}

/** Duraciones (s) relativas al inicio de la constelación. */
const GLIDE = 2.2;
const GLIDE_SPREAD = 0.8;
const LINES_AT = 3.1;
const LINES_DUR = 2.0;
const DONE_AT = LINES_AT + LINES_DUR;

/** Curva paramétrica clásica del corazón (y hacia abajo). */
const heartX = (t: number) => 16 * Math.sin(t) ** 3;
const heartY = (t: number) => -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));

/**
 * Constelación de corazón: estrellas que se reúnen, líneas doradas que se
 * trazan desde la hendidura hasta la punta y un brillo que "respira".
 */
export class HeartConstellation {
  private stars: HeartStar[] = [];
  private emitted = false;
  private sprites: HTMLCanvasElement[] = [];
  private glow: HTMLCanvasElement | null = null;
  /** Centro (px) y semiancho (px) actuales. */
  cx = 0;
  cy = 0;
  size = 60;
  private glowPad = 1;
  /** Centro vertical de la curva (unidades de la fórmula) para centrar la figura. */
  private midY = 0;

  init(rng: Random, world: World): void {
    this.emitted = false;
    this.glow = null;
    this.sprites = STAR_TINTS.map((t) => starDot(t));
    const count = world.quality > 0.7 ? 32 : 28;

    // Muestreo uniforme por longitud de arco empezando en la hendidura (t = 0).
    const steps = 720;
    const len: number[] = [0];
    let px = heartX(0);
    let py = heartY(0);
    for (let i = 1; i <= steps; i++) {
      const t = (i / steps) * Math.PI * 2;
      const x = heartX(t);
      const y = heartY(t);
      len.push(len[i - 1]! + Math.hypot(x - px, y - py));
      px = x;
      py = y;
    }
    const total = len[steps]!;
    // Límites para centrar la figura.
    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < steps; i++) {
      const y = heartY((i / steps) * Math.PI * 2);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    const midY = (minY + maxY) / 2;
    this.midY = midY;

    const layout = heartLayout(world.width, world.height);
    const stars: HeartStar[] = [];
    let j = 0;
    for (let k = 0; k < count; k++) {
      const target = (k / count) * total;
      while (j < steps && len[j + 1]! < target) j++;
      const f = (target - len[j]!) / Math.max(1e-6, len[j + 1]! - len[j]!);
      const t = ((j + f) / steps) * Math.PI * 2;
      // Posición de partida: dispersa por el cielo alrededor del corazón.
      const su = clamp(layout.u + rng.gaussian() * 0.2, 0.03, 0.97);
      const sv = clamp(layout.v + rng.gaussian() * 0.12, 0.03, layout.portrait ? 0.95 : 0.6);
      stars.push({
        hx: heartX(t) / 16,
        hy: (heartY(t) - midY) / 16,
        su,
        sv,
        bend: rng.float(-60, 60),
        delay: rng.float(0, GLIDE_SPREAD),
        r: rng.float(1.2, 1.8),
        tint: rng.pick([0, 1, 1, 3]),
        appear: rng.float(0.4, 2.6),
        s1: rng.float(0.6, 1.6),
        p1: rng.float(0, Math.PI * 2),
        special: false,
      });
    }
    // Unas cuantas destellan más.
    for (let i = 0; i < 5; i++) rng.pick(stars).special = true;
    // La punta y la hendidura, siempre protagonistas.
    stars[0]!.special = true;
    stars[count >> 1]!.special = true;
    this.stars = stars;
  }

  resize(world: World): void {
    const layout = heartLayout(world.width, world.height);
    this.cx = layout.u * world.width;
    this.cy = layout.v * world.height;
    this.size = layout.half;

    // Brillo del contorno pre-renderizado (shadowBlur solo aquí, una vez).
    const dpr = world.dpr;
    const S = this.size * dpr;
    const pad = 1.7;
    this.glowPad = pad;
    const dim = S * 2 * pad;
    const { canvas, g } = createCanvas(dim, dim);
    const c = dim / 2;
    g.translate(c, c);
    g.beginPath();
    for (let i = 0; i <= 200; i++) {
      const t = (i / 200) * Math.PI * 2;
      const x = (heartX(t) / 16) * S;
      const y = ((heartY(t) - this.midY) / 16) * S;
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.closePath();
    // Interior muy tenue.
    const fill = g.createRadialGradient(0, S * 0.1, 0, 0, S * 0.1, S * 1.1);
    fill.addColorStop(0, 'rgba(255,196,80,0.10)');
    fill.addColorStop(1, 'rgba(255,170,60,0.02)');
    g.fillStyle = fill;
    g.fill();
    // Contorno difuso.
    g.shadowColor = 'rgba(255,200,90,0.9)';
    g.shadowBlur = 14 * dpr;
    g.strokeStyle = 'rgba(255,214,120,0.35)';
    g.lineWidth = 2.5 * dpr;
    g.stroke();
    g.shadowBlur = 28 * dpr;
    g.strokeStyle = 'rgba(255,190,80,0.18)';
    g.lineWidth = 4 * dpr;
    g.stroke();
    this.glow = canvas;
  }

  update(world: World): void {
    const T = world.time - CONFIG.timeline.constellation;
    if (!this.emitted && T >= DONE_AT) {
      this.emitted = true;
      world.events.emit('constellation', { x: this.cx, y: this.cy });
    }
  }

  draw(g: CanvasRenderingContext2D, world: World, ox: number, oy: number): void {
    const t = world.time;
    const T = t - CONFIG.timeline.constellation;
    const W = world.width;
    const H = world.height;
    const motion = world.reducedMotion ? 0.4 : 1;
    const formed = smoothstep(DONE_AT - 0.6, DONE_AT + 2.5, T);
    // Respiración suave una vez formado.
    const breath = Math.sin(T * 1.15 * motion);
    const scale = this.size * (1 + 0.022 * breath * formed);
    const cx = this.cx + ox;
    const cy = this.cy + oy;
    const sizeK = 0.72 + 0.28 * world.scale;

    g.globalCompositeOperation = 'lighter';

    // 1) Brillo del corazón completo.
    if (this.glow && formed > 0) {
      const a = formed * (0.75 + 0.25 * breath);
      drawGlow(g, glowSprite('#ffc862', 0.2, 128), cx, cy, scale * 2.4, 0.07 * a);
      const d = scale * 2 * this.glowPad;
      g.globalAlpha = a;
      g.drawImage(this.glow, cx - d / 2, cy - d / 2, d, d);
      g.globalAlpha = 1;
    }

    // 2) Líneas doradas trazadas de la hendidura a la punta por ambos lados.
    const n = this.stars.length;
    const half = n >> 1;
    const q = clamp01((T - LINES_AT) / LINES_DUR);
    if (q > 0) {
      const drawn = ease.inOutSine(q) * half;
      const lineA = (0.5 + 0.2 * formed * (0.5 + 0.5 * breath)) * clamp01(q * 4);
      const gap = 3.2 * sizeK;
      for (let pass = 0; pass < 2; pass++) {
        g.beginPath();
        for (let side = 0; side < 2; side++) {
          for (let k = 0; k < half; k++) {
            if (k >= drawn) break;
            const i0 = side === 0 ? k : (n - k) % n;
            const i1 = side === 0 ? k + 1 : n - k - 1;
            const a = this.stars[i0]!;
            const b = this.stars[i1]!;
            const ax = cx + a.hx * scale;
            const ay = cy + a.hy * scale;
            let bx = cx + b.hx * scale;
            let by = cy + b.hy * scale;
            const segLen = Math.hypot(bx - ax, by - ay);
            if (segLen < gap * 2.5) continue;
            const ux = (bx - ax) / segLen;
            const uy = (by - ay) / segLen;
            // Segmento parcial para el tramo que se está dibujando.
            const partial = Math.min(1, drawn - k);
            const endLen = gap + (segLen - gap * 2) * partial;
            bx = ax + ux * endLen;
            by = ay + uy * endLen;
            g.moveTo(ax + ux * gap, ay + uy * gap);
            g.lineTo(bx, by);
          }
        }
        if (pass === 0) {
          g.strokeStyle = `rgba(255,190,80,${0.14 * lineA})`;
          g.lineWidth = 3.2 * sizeK;
        } else {
          g.strokeStyle = `rgba(255,228,160,${0.75 * lineA})`;
          g.lineWidth = 0.9 * sizeK;
        }
        g.lineCap = 'round';
        g.stroke();
      }
    }

    // 3) Estrellas: dispersas antes, planean hacia su lugar y luego brillan.
    const gold = glowSprite('#ffd36a', 0.16, 64);
    const flare = starFlare();
    for (let i = 0; i < n; i++) {
      const s = this.stars[i]!;
      const appear = smoothstep(s.appear, s.appear + 1.2, t);
      if (appear <= 0) continue;
      const k = ease.inOutCubic(clamp01((T - s.delay) / GLIDE));
      const sx = s.su * W;
      const sy = s.sv * H;
      const tx = cx + s.hx * scale;
      const ty = cy + s.hy * scale;
      // Trayecto curvo: desvío perpendicular máximo a mitad de camino.
      const dx = tx - sx;
      const dy = ty - sy;
      const dl = Math.hypot(dx, dy) || 1;
      const arc = Math.sin(k * Math.PI) * s.bend * world.scale;
      const x = lerp(sx, tx, k) + (-dy / dl) * arc;
      const y = lerp(sy, ty, k) + (dx / dl) * arc;

      const tw = 0.78 + 0.22 * Math.sin(t * s.s1 * motion + s.p1);
      // Destello ocasional y suave (sin parpadeos bruscos).
      const peak = s.special ? Math.max(0, Math.sin(T * 0.45 * motion + s.p1 * 3)) ** 10 * formed : 0;
      const gathered = smoothstep(0.6, 1, k);
      const a = appear * lerp(0.55, 1, gathered) * tw;
      const r = s.r * sizeK * (1 + 0.25 * gathered + 0.5 * peak);
      const size = r * 8;
      g.globalAlpha = a;
      g.drawImage(this.sprites[s.tint]!, x - size / 2, y - size / 2, size, size);
      drawGlow(g, gold, x, y, r * (5 + 3 * formed), a * (0.12 + 0.3 * gathered * (0.6 + 0.4 * formed) + 0.4 * peak));
      if (peak > 0.02) {
        const fl = r * 10 * (0.6 + 0.4 * peak);
        g.globalAlpha = peak * 0.7;
        g.drawImage(flare, x - fl, y - fl, fl * 2, fl * 2);
      }
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
  }
}
