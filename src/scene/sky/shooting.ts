import { ease, smoothstep, type Random } from '../../core/math';
import { drawGlow, glowSprite } from '../../core/sprites';
import type { World } from '../../core/types';

interface Meteor {
  active: boolean;
  /** Inicio y dirección en px CSS (se fijan al nacer). */
  x0: number;
  y0: number;
  dx: number;
  dy: number;
  /** Distancia total recorrida por la cabeza. */
  length: number;
  tail: number;
  born: number;
  duration: number;
  width: number;
  bright: number;
}

const POOL = 4;
/** Primera estrella fugaz a partir de este segundo. */
const FIRST_AT = 5;

/** Estrellas fugaces ocasionales (a veces en pareja) en la mitad superior del cielo. */
export class ShootingStars {
  private rng: Random | null = null;
  private readonly pool: Meteor[] = [];
  private nextAt = FIRST_AT;
  /** Segunda estrella de una pareja (tiempo absoluto; -1 si no hay). */
  private pairAt = -1;
  private pairDir = 1;

  init(rng: Random): void {
    this.rng = rng;
    this.pool.length = 0;
    for (let i = 0; i < POOL; i++) {
      this.pool.push({ active: false, x0: 0, y0: 0, dx: 0, dy: 0, length: 0, tail: 0, born: 0, duration: 1, width: 1, bright: 1 });
    }
    this.nextAt = FIRST_AT + rng.float(0, 2.5);
    this.pairAt = -1;
  }

  update(world: World): void {
    const rng = this.rng;
    if (!rng) return;
    const t = world.time;
    for (const m of this.pool) if (m.active && t - m.born > m.duration) m.active = false;

    if (t >= this.nextAt) {
      const dir = rng.sign();
      this.spawn(world, dir, false);
      if (!world.reducedMotion && rng.chance(0.22)) {
        this.pairAt = t + rng.float(0.25, 0.7);
        this.pairDir = dir;
      }
      this.nextAt = t + (world.reducedMotion ? rng.float(14, 24) : rng.float(6, 14));
    }
    if (this.pairAt >= 0 && t >= this.pairAt) {
      this.pairAt = -1;
      this.spawn(world, this.pairDir, true);
    }
  }

  private spawn(world: World, dir: number, secondary: boolean): void {
    const rng = this.rng;
    if (!rng) return;
    const m = this.pool.find((p) => !p.active);
    if (!m) return;
    const W = world.width;
    const H = world.height;
    const s = world.scale;
    // Ángulo de caída 18°..38° bajo la horizontal, hacia la izquierda o la derecha.
    const angle = rng.float(0.32, 0.66);
    m.dx = Math.cos(angle) * dir;
    m.dy = Math.sin(angle);
    m.length = Math.min(W, H * 1.4) * rng.float(0.3, 0.48) * (secondary ? 0.75 : 1);
    // Arranca en el lado del que viene, dentro del 5%..30% superior.
    m.x0 = dir > 0 ? W * rng.float(0.05, 0.55) : W * rng.float(0.45, 0.95);
    m.y0 = H * rng.float(0.03, 0.26);
    // Que no baje del 55% de la pantalla.
    const maxLen = (H * 0.55 - m.y0) / m.dy;
    m.length = Math.max(60, Math.min(m.length, maxLen));
    if (secondary) {
      m.x0 += -dir * rng.float(30, 90) * s;
      m.y0 += rng.float(15, 50) * s;
    }
    const speed = (world.reducedMotion ? 520 : 950) * (0.7 + 0.3 * s) * rng.float(0.85, 1.2);
    m.duration = m.length / speed + 0.35;
    m.tail = rng.float(110, 210) * (0.6 + 0.4 * s) * (secondary ? 0.7 : 1);
    m.width = rng.float(1.1, 1.7) * (0.75 + 0.25 * s);
    m.bright = secondary ? 0.6 : rng.float(0.8, 1);
    m.born = world.time;
    m.active = true;
    world.events.emit('shootingStar', { x: m.x0, y: m.y0 });
  }

  draw(g: CanvasRenderingContext2D, world: World): void {
    const t = world.time;
    let any = false;
    for (const m of this.pool) if (m.active) any = true;
    if (!any) return;
    const glow = glowSprite('#fff4d6', 0.15, 64);
    g.globalCompositeOperation = 'lighter';
    for (const m of this.pool) {
      if (!m.active) continue;
      const p = (t - m.born) / m.duration;
      if (p < 0 || p > 1) continue;
      // La cabeza avanza desacelerando un poco; la estela se estira y luego se recoge.
      const travel = ease.outQuad(Math.min(1, p * 1.1)) * m.length;
      const hx = m.x0 + m.dx * travel;
      const hy = m.y0 + m.dy * travel;
      const tailLen = Math.min(travel, m.tail) * (1 - smoothstep(0.75, 1, p) * 0.7);
      const tx = hx - m.dx * tailLen;
      const ty = hy - m.dy * tailLen;
      const life = smoothstep(0, 0.08, p) * (1 - smoothstep(0.6, 1, p)) * m.bright;
      if (life <= 0.005 || tailLen < 1) continue;

      // Normal para la estela ahusada.
      const nx = -m.dy;
      const ny = m.dx;

      // Estela ancha y tenue + núcleo fino y brillante (ambos en forma de cuña).
      for (let pass = 0; pass < 2; pass++) {
        const hw = pass === 0 ? m.width * 2.6 : m.width * 0.7;
        const grad = g.createLinearGradient(hx, hy, tx, ty);
        if (pass === 0) {
          grad.addColorStop(0, `rgba(255,214,120,${0.22 * life})`);
          grad.addColorStop(1, 'rgba(255,190,90,0)');
        } else {
          grad.addColorStop(0, `rgba(255,252,235,${0.95 * life})`);
          grad.addColorStop(0.3, `rgba(255,232,170,${0.45 * life})`);
          grad.addColorStop(1, 'rgba(255,220,140,0)');
        }
        g.fillStyle = grad;
        g.beginPath();
        g.moveTo(hx + nx * hw, hy + ny * hw);
        g.lineTo(tx, ty);
        g.lineTo(hx - nx * hw, hy - ny * hw);
        g.lineTo(hx + m.dx * hw, hy + m.dy * hw);
        g.closePath();
        g.fill();
      }
      drawGlow(g, glow, hx, hy, 14 * (0.6 + 0.4 * world.scale), life * 0.9);
    }
    g.globalCompositeOperation = 'source-over';
  }
}
