import type { NoiseFunction3D } from 'simplex-noise';
import { Random, TAU, clamp, damp } from '../core/math';
import { drawGlow, glowSprite } from '../core/sprites';
import type { FlowerAnchor, Layer, World } from '../core/types';
import { BUTTERFLY_TINTS, butterflySprite, type ButterflySprite } from './fx/butterfly';

const MAX_BUTTERFLIES = 5;

type Mode = 'hidden' | 'wander' | 'loop' | 'seek' | 'rest';

interface Butterfly {
  mode: Mode;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Rumbo del cuerpo (0 = cabeza hacia arriba). */
  heading: number;
  /** Ángulo de deambular (dirección deseada). */
  wanderA: number;
  flap: number;
  flapHz: number;
  /** Apertura visual de las alas 0..1 (proyección desde arriba). */
  open: number;
  span: number;
  speed: number;
  seed: number;
  sprite: number;
  enterAt: number;
  /** Cuándo decidir el siguiente comportamiento. */
  decideAt: number;
  targetId: number;
  /** Punto de aterrizaje relativo a la cabeza de la flor (en radios). */
  landDx: number;
  landDy: number;
  restUntil: number;
  seekSince: number;
  loopA: number;
  loopDir: 1 | -1;
  /** Fundido de entrada 0..1. */
  alpha: number;
}

/** Mariposas doradas que revolotean y se posan en las flores. */
export class ButterflyLayer implements Layer {
  readonly name = 'butterflies';

  private rng = new Random(1);
  private noise: NoiseFunction3D = () => 0;
  private flies: Butterfly[] = [];
  private count = 3;
  private prevW = 1;
  private prevH = 1;
  private lastPx = 0;
  private lastPy = 0;
  /** world.time en que las mariposas pueden empezar a entrar. */
  private gateAt = Infinity;
  private sprites: ButterflySprite[] = [];
  private readonly glow = glowSprite('#ffc83a', 0.3, 128);

  init(world: World): void {
    this.rng = world.rng.fork();
    this.noise = this.rng.noise3D();
    this.sprites = BUTTERFLY_TINTS.map((t) => butterflySprite(t));
    this.prevW = world.width;
    this.prevH = world.height;
    this.lastPx = world.pointer.x;
    this.lastPy = world.pointer.y;
    const rng = this.rng;
    // Entradas escalonadas (segundos después de que se abre la "puerta": ramo >= 6 flores o t >= 14).
    const slots = [0, 1.7, 3.6, 5.4, 7.2];
    this.gateAt = Infinity;
    this.flies = [];
    for (let i = 0; i < MAX_BUTTERFLIES; i++) {
      this.flies.push({
        mode: 'hidden',
        x: -100,
        y: -100,
        vx: 0,
        vy: 0,
        heading: 0,
        wanderA: 0,
        flap: rng.float(0, TAU),
        flapHz: rng.float(5, 7),
        open: 1,
        span: rng.float(26, 38),
        speed: rng.float(70, 100),
        seed: rng.float(0, 100),
        sprite: i % this.sprites.length,
        enterAt: (slots[i] ?? 7) + rng.float(0, 0.6),
        decideAt: 0,
        targetId: -1,
        landDx: 0,
        landDy: 0,
        restUntil: 0,
        seekSince: 0,
        loopA: 0,
        loopDir: rng.sign(),
        alpha: 0,
      });
    }
  }

  resize(world: World): void {
    const sx = world.width / Math.max(1, this.prevW);
    const sy = world.height / Math.max(1, this.prevH);
    this.prevW = world.width;
    this.prevH = world.height;
    for (const b of this.flies) {
      if (b.mode === 'hidden') continue;
      b.x *= sx;
      b.y *= sy;
    }
    // 3-5 en pantallas grandes, al menos 2 en las pequeñas.
    const small = Math.min(world.width, world.height) < 520;
    this.count = clamp(Math.round(2 + 3 * world.quality), small ? 2 : 3, MAX_BUTTERFLIES);
    if (small) this.count = Math.min(this.count, 3);
    if (world.reducedMotion) this.count = Math.max(2, this.count - 1);
  }

  /* ---------------------------------------------------------------- */

  /** Tamaño efectivo (no dejamos que se vuelvan diminutas en el móvil). */
  private unit(world: World): number {
    return Math.max(world.scale, 0.72);
  }

  private findFlower(world: World, id: number): FlowerAnchor | null {
    if (id < 0) return null;
    for (const f of world.flowers) if (f.id === id) return f;
    return null;
  }

  /** Elige una flor abierta libre, prefiriendo la fila delantera. */
  private pickTarget(world: World, self: Butterfly): FlowerAnchor | null {
    let best: FlowerAnchor | null = null;
    let bestScore = -1;
    const H = world.height;
    for (const f of world.flowers) {
      if (f.open < 0.95 || f.id === self.targetId) continue;
      if (f.y < H * 0.28 || f.y > H * 0.9) continue;
      let taken = false;
      for (let i = 0; i < this.count; i++) {
        const o = this.flies[i] as Butterfly;
        if (o !== self && o.targetId === f.id && (o.mode === 'seek' || o.mode === 'rest')) taken = true;
      }
      if (taken) continue;
      const score = f.depth * 0.9 + Math.min(1, f.radius / (40 * world.scale)) * 0.3 + this.rng.next() * 0.8;
      if (score > bestScore) {
        bestScore = score;
        best = f;
      }
    }
    return best;
  }

  private decide(b: Butterfly, world: World): void {
    const t = world.time;
    const rng = this.rng;
    const target = rng.chance(0.72) ? this.pickTarget(world, b) : null;
    if (target) {
      b.mode = 'seek';
      b.targetId = target.id;
      b.seekSince = t;
      // Se posa un poco hacia el centro de la cabeza.
      b.landDx = rng.float(-0.18, 0.18);
      b.landDy = rng.float(-0.2, 0.05);
    } else if (rng.chance(0.55)) {
      b.mode = 'loop';
      b.targetId = -1;
      const cx = world.width * 0.5;
      const cy = world.height * 0.52;
      b.loopA = Math.atan2((b.y - cy) / world.height, (b.x - cx) / world.width);
      b.loopDir = rng.sign();
      b.decideAt = t + rng.float(4, 8);
    } else {
      b.mode = 'wander';
      b.targetId = -1;
      b.decideAt = t + rng.float(2.5, 5);
    }
  }

  private takeOff(b: Butterfly, world: World): void {
    const S = this.unit(world);
    b.mode = 'wander';
    b.targetId = -1;
    b.vy = -this.rng.float(50, 80) * S;
    b.vx = this.rng.float(-40, 40) * S;
    b.wanderA = -Math.PI / 2 + this.rng.float(-1, 1);
    b.decideAt = world.time + this.rng.float(1.8, 4);
  }

  update(dt: number, world: World): void {
    if (dt <= 0) return;
    const { width: W, height: H, time: t, pointer } = world;
    const S = this.unit(world);
    const slow = world.reducedMotion ? 0.7 : 1;

    // Velocidad del puntero (para asustarlas con movimientos bruscos).
    const pvx = (pointer.x - this.lastPx) / dt;
    const pvy = (pointer.y - this.lastPy) / dt;
    this.lastPx = pointer.x;
    this.lastPy = pointer.y;
    const pSpeed = pointer.active ? Math.hypot(pvx, pvy) : 0;
    if (this.gateAt === Infinity && (world.bouquet.count >= 6 || t >= 14)) this.gateAt = t;

    for (let i = 0; i < this.count; i++) {
      const b = this.flies[i] as Butterfly;

      if (b.mode === 'hidden') {
        if (t < this.gateAt + b.enterAt) continue;
        // Entra desde un costado, fuera de pantalla.
        const side = this.rng.sign();
        b.x = side < 0 ? -40 * S : W + 40 * S;
        b.y = H * this.rng.float(0.38, 0.66);
        b.vx = -side * b.speed * S * 0.8;
        b.vy = this.rng.float(-15, 15) * S;
        b.wanderA = side < 0 ? 0 : Math.PI;
        b.heading = Math.atan2(b.vy, b.vx) + Math.PI / 2;
        b.mode = 'wander';
        b.decideAt = t + this.rng.float(2, 3.5);
        b.alpha = 0;
      }
      b.alpha = Math.min(1, b.alpha + dt * 1.5);

      // Huye de un puntero rápido y cercano.
      if (pSpeed > 380) {
        const dx = b.x - pointer.x;
        const dy = b.y - pointer.y;
        const d = Math.hypot(dx, dy);
        const reach = 150 * S;
        if (d < reach && d > 0.001) {
          if (b.mode === 'rest' || b.mode === 'seek') this.takeOff(b, world);
          const k = (1 - d / reach) * 260 * S * dt * 4;
          b.vx += (dx / d) * k;
          b.vy += (dy / d) * k;
        }
      }

      if (b.mode === 'rest') {
        const f = this.findFlower(world, b.targetId);
        if (!f || f.open < 0.9) {
          this.takeOff(b, world);
        } else {
          // Sigue el balanceo de la flor.
          const ca = Math.cos(f.angle);
          const sa = Math.sin(f.angle);
          const lx = b.landDx * f.radius;
          const ly = b.landDy * f.radius;
          const tx = f.x + lx * ca - ly * sa;
          const ty = f.y + lx * sa + ly * ca;
          b.x = damp(b.x, tx, 9, dt);
          b.y = damp(b.y, ty, 9, dt);
          b.vx = 0;
          b.vy = 0;
          b.heading = damp(b.heading, f.angle * 0.7 + Math.sin(t * 0.3 + b.seed) * 0.25, 3, dt);
          // Abre y cierra las alas despacio (~0.4 Hz).
          b.flap += TAU * 0.4 * dt;
          b.open = 0.62 + 0.38 * Math.cos(b.flap);
          if (t >= b.restUntil) this.takeOff(b, world);
          continue;
        }
      }

      // ---- Vuelo: velocidad deseada según el modo ----
      const sp = b.speed * S * slow;
      let dx = 0;
      let dy = 0;
      let arrive = 1;
      if (b.mode === 'seek') {
        const f = this.findFlower(world, b.targetId);
        if (!f || f.open < 0.9 || t - b.seekSince > 12) {
          this.decide(b, world);
        } else {
          const ca = Math.cos(f.angle);
          const sa = Math.sin(f.angle);
          const lx = b.landDx * f.radius;
          const ly = b.landDy * f.radius;
          const tx = f.x + lx * ca - ly * sa;
          const ty = f.y + lx * sa + ly * ca;
          const ex = tx - b.x;
          const ey = ty - b.y;
          const d = Math.hypot(ex, ey);
          if (d < 5 * S) {
            b.mode = 'rest';
            b.restUntil = t + this.rng.float(3, 8);
            b.flap = 0;
            continue;
          }
          // Llega frenando suavemente (y bajando la cabeza hacia la flor).
          const slowR = 130 * S;
          arrive = Math.max(0.18, Math.min(1, d / slowR));
          dx = ex / d;
          dy = ey / d;
        }
      }
      if (b.mode === 'loop') {
        const cx = W * 0.5;
        const cy = H * 0.53;
        const rx = Math.min(W * 0.34, 420 * world.scale + 40);
        const ry = H * 0.2;
        b.loopA += b.loopDir * dt * (sp / Math.max(rx, 1)) * 0.9;
        const tx = cx + Math.cos(b.loopA) * rx + Math.sin(t * 0.7 + b.seed) * 30 * S;
        const ty = cy + Math.sin(b.loopA) * ry;
        const ex = tx - b.x;
        const ey = ty - b.y;
        const d = Math.hypot(ex, ey) || 1;
        dx = ex / d;
        dy = ey / d;
        if (t >= b.decideAt) this.decide(b, world);
      }
      if (b.mode === 'wander') {
        // Giros suaves guiados por ruido.
        b.wanderA += this.noise(b.seed, t * 0.35, 0) * 2.6 * dt;
        dx = Math.cos(b.wanderA);
        dy = Math.sin(b.wanderA);
        if (t >= b.decideAt) this.decide(b, world);
      }

      // Límites suaves: dentro de la pantalla y lejos del título / mensajes.
      const mx = W * 0.07;
      const top = H * 0.3;
      const bottom = H * 0.86;
      let bx = 0;
      let by = 0;
      if (b.x < mx) bx += (mx - b.x) / mx;
      else if (b.x > W - mx) bx -= (b.x - (W - mx)) / mx;
      if (b.y < top) by += (top - b.y) / (H * 0.1);
      else if (b.y > bottom) by -= (b.y - bottom) / (H * 0.08);
      if (b.mode !== 'seek') {
        dx += clamp(bx, -2, 2) * 1.2;
        dy += clamp(by, -2, 2) * 1.2;
        if (b.mode === 'wander' && (bx !== 0 || by !== 0)) {
          // Reorienta el deambular hacia dentro para no pelear con el límite.
          b.wanderA = Math.atan2(dy, dx);
        }
      }
      const dl = Math.hypot(dx, dy) || 1;
      const desiredVx = (dx / dl) * sp * arrive;
      const desiredVy = (dy / dl) * sp * arrive;

      const steer = b.mode === 'seek' ? 3 : 1.8;
      b.vx = damp(b.vx, desiredVx, steer, dt);
      b.vy = damp(b.vy, desiredVy, steer, dt);
      // Pequeño impulso hacia arriba en cada aletazo: vuelo "a saltitos".
      const lift = Math.sin(b.flap) * 34 * S;
      b.x += b.vx * dt;
      b.y += (b.vy - lift * 0.5) * dt;
      b.x = clamp(b.x, -120, W + 120);
      b.y = clamp(b.y, -120, H + 60);

      // El cuerpo sigue la velocidad (cabeza hacia delante).
      const v = Math.hypot(b.vx, b.vy);
      if (v > 4 * S) {
        const target = Math.atan2(b.vy, b.vx) + Math.PI / 2;
        let diff = target - b.heading;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        b.heading += diff * (1 - Math.exp(-4 * dt));
      }

      // Aleteo: rápido en vuelo, más lento al planear cerca de la flor.
      const hz = b.flapHz * (b.mode === 'seek' && arrive < 0.5 ? 0.7 : 1) * (world.reducedMotion ? 0.6 : 1);
      b.flap += TAU * hz * dt;
      const c = 0.5 - 0.5 * Math.cos(b.flap); // 0 = alas planas, 1 = alas arriba
      b.open = Math.cos(c * 1.32);
    }
  }

  draw(g: CanvasRenderingContext2D, world: World): void {
    const S = this.unit(world);
    const t = world.time;
    for (let i = 0; i < this.count; i++) {
      const b = this.flies[i] as Butterfly;
      if (b.mode === 'hidden' || b.alpha <= 0.01) continue;
      const sprite = this.sprites[b.sprite];
      if (!sprite) continue;
      const half = (b.span * S) / 2;
      // Balanceo leve en vuelo.
      const bob = b.mode === 'rest' ? 0 : Math.sin(t * 2.1 + b.seed) * 2.5 * S;
      const x = b.x;
      const y = b.y + bob;

      // Halo cálido.
      g.globalCompositeOperation = 'lighter';
      drawGlow(g, this.glow, x, y, half * 2.2, 0.2 * b.alpha * (0.6 + 0.4 * b.open));
      g.globalCompositeOperation = 'source-over';

      g.save();
      g.globalAlpha = b.alpha;
      g.translate(x, y);
      g.rotate(b.heading);
      const k = half / (100 * sprite.k);
      const ox = Math.max(0.08, b.open);
      // Alas: la posterior (sprite) se escala en X; la izquierda se refleja.
      for (let side = 1; side >= -1; side -= 2) {
        g.save();
        g.scale(side * ox * k, k);
        g.drawImage(sprite.wing, -sprite.wingOx, -sprite.wingOy);
        g.restore();
      }
      g.scale(k, k);
      g.drawImage(sprite.body, -sprite.bodyOx, -sprite.bodyOy);
      g.restore();
    }
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
  }
}
