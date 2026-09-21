import type { NoiseFunction3D } from 'simplex-noise';
import { Random, TAU, clamp, damp, smoothstep } from '../core/math';
import { drawGlow, glowSprite } from '../core/sprites';
import type { FlowerAnchor, Layer, SceneEvents, World } from '../core/types';
import {
  HEART_GOLD,
  HEART_PEACH,
  HEART_SPRITE_FILL,
  heartSprite,
  petalSprites,
  sparkleSprite,
  type PetalSpriteSet,
} from './fx/sprites';

/* Límites duros de los pools (nunca crecen). */
const MAX_FIREFLIES = 50;
const MAX_MOTES = 120;
const MAX_PETALS = 60;
const MAX_SPARKS = 280;
const MAX_HEARTS = 32;
const MAX_FLASHES = 16;
const MAX_RINGS = 10;

interface Firefly {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Punto "hogar" normalizado 0..1 alrededor del que deambula (más denso junto al ramo). */
  homeX: number;
  homeY: number;
  period: number;
  offset: number;
  darkF: number;
  darkPh: number;
  size: number;
  speed: number;
  orbit: 1 | -1;
  orbitR: number;
  seed: number;
  /** Brillo calculado en update (0..1). */
  b: number;
}

interface Mote {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  size: number;
  tw: number;
  ph: number;
}

interface Petal {
  on: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  spin: number;
  flip: number;
  flipSpeed: number;
  fall: number;
  sway: number;
  set: number;
  size: number;
  age: number;
}

interface Spark {
  on: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  size: number;
  rot: number;
  spin: number;
  drag: number;
}

interface Heart {
  on: boolean;
  tap: boolean;
  x: number;
  y: number;
  baseX: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  endY: number;
  size: number;
  swayAmp: number;
  swayF: number;
  ph: number;
  peach: boolean;
}

interface Flash {
  on: boolean;
  x: number;
  y: number;
  r: number;
  age: number;
  life: number;
}

interface Ring {
  on: boolean;
  x: number;
  y: number;
  r: number;
  age: number;
  life: number;
}

const fill = <T>(n: number, make: () => T): T[] => Array.from({ length: n }, make);

/** Pulso de una luciérnaga: sube suave, se sostiene, se apaga y descansa a oscuras. */
function blinkShape(u: number): number {
  if (u < 0.2) return smoothstep(0, 0.2, u);
  if (u < 0.38) return 1;
  if (u < 0.72) return 1 - smoothstep(0.38, 0.72, u);
  return 0;
}

/** Partículas: polen, pétalos que caen, luciérnagas, corazones y destellos. */
export class ParticlesLayer implements Layer {
  readonly name = 'particles';

  private rng = new Random(1);
  private noise: NoiseFunction3D = () => 0;
  private unsub: (() => void)[] = [];
  private prevW = 1;
  private prevH = 1;

  private fireflies: Firefly[] = [];
  private fireflyCount = 0;
  private motes: Mote[] = [];
  private moteCount = 0;
  private petals: Petal[] = [];
  private sparks: Spark[] = [];
  private hearts: Heart[] = [];
  private flashes: Flash[] = [];
  private rings: Ring[] = [];

  private petalAcc = 0;
  private nextHeartAt = 12;
  private openCount = 0;

  /* Sprites (se crean al primer init). */
  private petalSet: PetalSpriteSet[] = [];
  private spark: HTMLCanvasElement | null = null;
  private heartGold: HTMLCanvasElement | null = null;
  private heartPeach: HTMLCanvasElement | null = null;
  private readonly fireflyHalo = glowSprite('#e4f25c', 0.18, 128);
  private readonly fireflyCore = glowSprite('#fffce0', 0.14, 64);
  private readonly moteGlow = glowSprite('#ffdf7a', 0.16, 64);
  private readonly warmGlow = glowSprite('#ffc83a', 0.3, 128);
  private readonly flashGlow = glowSprite('#fff0a0', 0.35, 128);

  init(world: World): void {
    for (const off of this.unsub) off();
    this.rng = world.rng.fork();
    this.noise = this.rng.noise3D();
    this.prevW = world.width;
    this.prevH = world.height;
    this.petalSet = petalSprites();
    this.spark = sparkleSprite();
    this.heartGold = heartSprite(HEART_GOLD);
    this.heartPeach = heartSprite(HEART_PEACH);

    const rng = this.rng;
    const W = world.width;
    const H = world.height;

    this.fireflies = fill(MAX_FIREFLIES, () => {
      // La mayoría rondan el ramo (centro); el resto se reparte por toda la pantalla.
      const near = rng.chance(0.6);
      const homeX = near ? clamp(0.5 + rng.gaussian() * 0.17, 0.04, 0.96) : rng.float(0.04, 0.96);
      const homeY = near ? clamp(0.52 + rng.gaussian() * 0.14, 0.12, 0.9) : rng.float(0.1, 0.94);
      return {
        x: homeX * W + rng.gaussian() * W * 0.04,
        y: homeY * H + rng.gaussian() * H * 0.04,
        vx: 0,
        vy: 0,
        homeX,
        homeY,
        period: rng.float(2.6, 6.2),
        offset: rng.float(0, 20),
        darkF: rng.float(0.05, 0.16),
        darkPh: rng.float(0, TAU),
        size: rng.float(0.7, 1.25),
        speed: rng.float(10, 24),
        orbit: rng.sign(),
        orbitR: rng.float(45, 110),
        seed: rng.float(0, 100),
        b: 0,
      };
    });

    this.motes = fill(MAX_MOTES, () => ({ x: 0, y: 0, vx: 0, vy: 0, age: 0, life: 0, size: 1, tw: 1, ph: 0 }));
    for (const m of this.motes) {
      this.spawnMote(m, world);
      m.age = rng.float(0, m.life); // escalonados para que no nazcan todos juntos
    }

    this.petals = fill(MAX_PETALS, () => ({
      on: false, x: 0, y: 0, vx: 0, vy: 0, rot: 0, spin: 0, flip: 0, flipSpeed: 0, fall: 0,
      sway: 0, set: 0, size: 0, age: 0,
    }));
    this.sparks = fill(MAX_SPARKS, () => ({
      on: false, x: 0, y: 0, vx: 0, vy: 0, age: 0, life: 1, size: 1, rot: 0, spin: 0, drag: 0,
    }));
    this.hearts = fill(MAX_HEARTS, () => ({
      on: false, tap: false, x: 0, y: 0, baseX: 0, vx: 0, vy: 0, age: 0, life: 1, endY: 0, size: 1,
      swayAmp: 0, swayF: 0, ph: 0, peach: false,
    }));
    this.flashes = fill(MAX_FLASHES, () => ({ on: false, x: 0, y: 0, r: 0, age: 0, life: 1 }));
    this.rings = fill(MAX_RINGS, () => ({ on: false, x: 0, y: 0, r: 0, age: 0, life: 1 }));

    this.petalAcc = 0;
    this.nextHeartAt = 12 + rng.float(0, 1.5);
    this.openCount = 0;

    this.unsub = [
      world.events.on('bloom', (e) => this.onBloom(e, world)),
      world.events.on('tap', (e) => this.onTap(e, world)),
    ];
  }

  resize(world: World): void {
    // Re-escala posiciones sin reiniciar nada.
    const sx = world.width / Math.max(1, this.prevW);
    const sy = world.height / Math.max(1, this.prevH);
    this.prevW = world.width;
    this.prevH = world.height;
    if (sx !== 1 || sy !== 1) {
      const move = (p: { x: number; y: number }) => {
        p.x *= sx;
        p.y *= sy;
      };
      this.fireflies.forEach(move);
      this.motes.forEach(move);
      this.petals.forEach(move);
      this.sparks.forEach(move);
      this.flashes.forEach(move);
      this.rings.forEach(move);
      for (const h of this.hearts) {
        move(h);
        h.baseX *= sx;
        h.endY *= sy;
      }
    }
    const q = world.quality;
    this.fireflyCount = clamp(Math.round(48 * q), 18, MAX_FIREFLIES);
    this.moteCount = clamp(Math.round(110 * q), 40, MAX_MOTES);
    if (world.reducedMotion) {
      this.fireflyCount = Math.round(this.fireflyCount * 0.6);
      this.moteCount = Math.round(this.moteCount * 0.5);
    }
  }

  /* ---------------------------------------------------------------- */
  /* Update                                                            */
  /* ---------------------------------------------------------------- */

  update(dt: number, world: World): void {
    if (dt <= 0) return;
    this.openCount = 0;
    for (const f of world.flowers) if (f.open >= 0.98) this.openCount++;

    this.updateFireflies(dt, world);
    this.updateMotes(dt, world);
    this.updatePetals(dt, world);
    this.updateHearts(dt, world);
    this.updateBursts(dt, world);
  }

  private updateFireflies(dt: number, world: World): void {
    const { width: W, height: H, scale: S, time: t, pointer } = world;
    const slow = world.reducedMotion ? 0.55 : 1;
    const reach = 250 * S;
    for (let i = 0; i < this.fireflyCount; i++) {
      const f = this.fireflies[i] as Firefly;
      // Campo de flujo suave (ruido 3D) + una atracción débil hacia su punto hogar.
      const a = this.noise(f.x * 0.0021, f.y * 0.0021, t * 0.05 + f.seed) * Math.PI * 1.6 + f.seed;
      const sp = f.speed * S * slow;
      let tx = Math.cos(a) * sp;
      let ty = Math.sin(a) * sp * 0.75;
      tx += clamp((f.homeX * W - f.x) * 0.05, -sp * 0.8, sp * 0.8);
      ty += clamp((f.homeY * H - f.y) * 0.08, -sp * 0.8, sp * 0.8);
      // Bordes suaves.
      const m = 40 * S;
      if (f.x < m) tx += (m - f.x) * 0.5;
      else if (f.x > W - m) tx -= (f.x - (W - m)) * 0.5;
      if (f.y > H - m) ty -= (f.y - (H - m)) * 0.5;
      // Se acercan al puntero y orbitan despacio.
      if (pointer.active) {
        const dx = f.x - pointer.x;
        const dy = f.y - pointer.y;
        const d = Math.hypot(dx, dy);
        if (d < reach && d > 0.001) {
          const w = smoothstep(reach, reach * 0.45, d);
          const nx = dx / d;
          const ny = dy / d;
          const r = f.orbitR * S;
          const tang = sp * 2.2;
          const ox = -ny * f.orbit * tang - nx * (d - r) * 0.9;
          const oy = nx * f.orbit * tang - ny * (d - r) * 0.9;
          tx += (ox - tx) * w;
          ty += (oy - ty) * w;
        }
      }
      f.vx = damp(f.vx, tx, 1.4, dt);
      f.vy = damp(f.vy, ty, 1.4, dt);
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      if (f.x < -60) f.x = W + 40;
      else if (f.x > W + 60) f.x = -40;
      f.y = clamp(f.y, H * 0.06, H - 6);

      // Pulso propio + periodos de oscuridad ocasionales.
      const period = f.period * (world.reducedMotion ? 1.6 : 1);
      const u = (((t + f.offset) / period) % 1 + 1) % 1;
      const gate = smoothstep(
        -0.45,
        0.1,
        Math.sin(t * f.darkF * TAU + f.darkPh) + 0.5 * Math.sin(t * f.darkF * 5.3 + f.darkPh * 1.7),
      );
      f.b = (0.05 + 0.95 * blinkShape(u)) * gate;
    }
  }

  private spawnMote(m: Mote, world: World): void {
    const rng = this.rng;
    const S = world.scale;
    const fl = this.pickFlower(world, 0.6);
    if (fl && rng.chance(0.75)) {
      m.x = fl.x + rng.gaussian() * fl.radius * 0.6;
      m.y = fl.y + rng.gaussian() * fl.radius * 0.45;
    } else {
      // Sin flores abiertas: una nube suave alrededor del centro del ramo.
      m.x = world.width * (0.5 + rng.gaussian() * 0.2);
      m.y = world.height * (0.55 + rng.gaussian() * 0.14);
    }
    m.vx = rng.float(-4, 4) * S;
    m.vy = -rng.float(4, 13) * S;
    m.age = 0;
    m.life = rng.float(4, 9);
    m.size = rng.float(0.6, 1.6);
    m.tw = rng.float(1.5, 5);
    m.ph = rng.float(0, TAU);
  }

  private updateMotes(dt: number, world: World): void {
    const S = world.scale;
    for (let i = 0; i < this.moteCount; i++) {
      const m = this.motes[i] as Mote;
      m.age += dt;
      if (m.age >= m.life || m.y < -10) {
        this.spawnMote(m, world);
        continue;
      }
      const wind = world.wind(m.x, m.y);
      m.vx = damp(m.vx, wind * 16 * S + Math.sin(m.age * 0.9 + m.ph) * 4 * S, 1.2, dt);
      m.x += m.vx * dt;
      m.y += m.vy * dt;
    }
  }

  /** Flor abierta al azar (o null). */
  private pickFlower(world: World, minOpen: number): FlowerAnchor | null {
    const list = world.flowers;
    if (list.length === 0) return null;
    for (let k = 0; k < 6; k++) {
      const f = list[Math.floor(this.rng.next() * list.length)] as FlowerAnchor;
      if (f.open >= minOpen) return f;
    }
    return null;
  }

  private spawnPetal(world: World, fromTop: boolean): void {
    const p = this.petals.find((q) => !q.on);
    if (!p) return;
    const rng = this.rng;
    const S = world.scale;
    if (fromTop) {
      p.x = rng.float(0.05, 0.95) * world.width;
      p.y = -20;
      p.vx = 0;
      p.vy = 10 * S;
    } else {
      const fl = this.pickFlower(world, 0.98);
      if (!fl) return;
      const a = rng.float(0, TAU);
      p.x = fl.x + Math.cos(a) * fl.radius * 0.75;
      p.y = fl.y + Math.sin(a) * fl.radius * 0.5;
      p.vx = Math.cos(a) * 10 * S;
      p.vy = rng.float(-6, 4) * S;
    }
    p.on = true;
    p.rot = rng.float(0, TAU);
    p.spin = rng.float(-1.4, 1.4);
    p.flip = rng.float(0, TAU);
    p.flipSpeed = rng.float(1.8, 4.2) * rng.sign() * (world.reducedMotion ? 0.5 : 1);
    p.fall = rng.float(16, 32) * S * (world.reducedMotion ? 0.7 : 1);
    p.sway = rng.float(0, TAU);
    p.set = rng.int(0, this.petalSet.length - 1);
    p.size = rng.float(9, 16) * S;
    p.age = 0;
  }

  private updatePetals(dt: number, world: World): void {
    const S = world.scale;
    // Ritmo de desprendimiento según cuántas flores están abiertas.
    if (this.openCount > 0) {
      const rate = 0.85 * world.quality * Math.min(1, this.openCount / 6) * (world.reducedMotion ? 0.5 : 1);
      this.petalAcc += rate * dt;
      while (this.petalAcc >= 1) {
        this.petalAcc -= 1;
        this.spawnPetal(world, false);
      }
    }
    if (world.time > 12 && this.rng.chance(0.035 * dt)) this.spawnPetal(world, true);

    for (const p of this.petals) {
      if (!p.on) continue;
      p.age += dt;
      p.flip += p.flipSpeed * dt;
      const c = Math.abs(Math.cos(p.flip));
      // De plano cae más lento; de canto, más rápido.
      p.vy = damp(p.vy, p.fall * (0.5 + 0.7 * (1 - c)), 1.8, dt);
      const wind = world.wind(p.x, p.y);
      p.vx = damp(p.vx, wind * 42 * S + Math.sin(p.flip * 0.5 + p.sway) * 16 * S, 1.3, dt);
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += (p.spin + p.vx * 0.01 / S) * dt;
      // Se desvanece antes de llegar al borde inferior (ver draw).
      if (p.y > world.height * 0.97 || p.x < -80 || p.x > world.width + 80) p.on = false;
    }
  }

  private spawnHeart(world: World, tap: boolean, x: number, y: number): Heart | null {
    const h = this.hearts.find((q) => !q.on);
    if (!h) return null;
    const rng = this.rng;
    const S = world.scale;
    h.on = true;
    h.tap = tap;
    h.x = x;
    h.y = y;
    h.baseX = x;
    h.age = 0;
    h.ph = rng.float(0, TAU);
    h.peach = rng.chance(tap ? 0.25 : 0.15);
    if (tap) {
      h.vx = rng.float(-35, 35) * S;
      h.vy = -rng.float(35, 70) * S;
      h.life = rng.float(1.8, 2.6);
      h.size = rng.float(6, 10) * S;
      h.swayAmp = rng.float(4, 9) * S;
      h.swayF = rng.float(1.2, 2);
      h.endY = -1e4;
    } else {
      h.vx = 0;
      h.vy = -rng.float(28, 40) * S;
      h.life = 30;
      h.size = rng.float(9, 14) * S;
      h.swayAmp = rng.float(10, 22) * S;
      h.swayF = rng.float(0.6, 1.1);
      // Se apagan antes de la franja de mensajes (~19-27 % de la altura).
      h.endY = world.height * rng.float(0.29, 0.33);
      h.y = Math.max(y, h.endY + world.height * 0.16);
    }
    return h;
  }

  private updateHearts(dt: number, world: World): void {
    const t = world.time;
    if (t >= this.nextHeartAt) {
      this.nextHeartAt = t + this.rng.float(2.5, 4) * (world.reducedMotion ? 1.6 : 1);
      // Nacen del ramo: de una flor abierta (preferiblemente delantera) o del centro.
      let fl: FlowerAnchor | null = null;
      for (let k = 0; k < 4; k++) {
        const c = this.pickFlower(world, 0.95);
        if (c && (!fl || c.depth > fl.depth)) fl = c;
      }
      const x = fl ? fl.x : world.width * this.rng.float(0.4, 0.6);
      const y = fl ? fl.y - fl.radius * 0.6 : world.height * 0.5;
      this.spawnHeart(world, false, x, y);
    }
    for (const h of this.hearts) {
      if (!h.on) continue;
      h.age += dt;
      if (h.tap) {
        h.vx = damp(h.vx, 0, 1.6, dt);
        h.vy = damp(h.vy, -22 * world.scale, 1.2, dt);
        h.baseX += h.vx * dt;
      }
      h.y += h.vy * dt;
      h.x = h.baseX + Math.sin(h.age * h.swayF * TAU * 0.5 + h.ph) * h.swayAmp;
      if (h.age >= h.life || (!h.tap && h.y <= h.endY)) h.on = false;
    }
  }

  private updateBursts(dt: number, world: World): void {
    const lift = 8 * world.scale;
    for (const s of this.sparks) {
      if (!s.on) continue;
      s.age += dt;
      if (s.age >= s.life) {
        s.on = false;
        continue;
      }
      const k = Math.exp(-s.drag * dt);
      s.vx *= k;
      s.vy = s.vy * k - lift * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.rot += s.spin * dt;
    }
    for (const f of this.flashes) {
      if (!f.on) continue;
      f.age += dt;
      if (f.age >= f.life) f.on = false;
    }
    for (const r of this.rings) {
      if (!r.on) continue;
      r.age += dt;
      if (r.age >= r.life) r.on = false;
    }
  }

  /* ---------------------------------------------------------------- */
  /* Eventos                                                           */
  /* ---------------------------------------------------------------- */

  private emitSpark(x: number, y: number, vx: number, vy: number, size: number, life: number, drag: number): void {
    const s = this.sparks.find((q) => !q.on);
    if (!s) return;
    s.on = true;
    s.x = x;
    s.y = y;
    s.vx = vx;
    s.vy = vy;
    s.size = size;
    s.life = life;
    s.age = 0;
    s.drag = drag;
    s.rot = this.rng.float(-0.3, 0.3);
    s.spin = this.rng.float(-1.5, 1.5);
  }

  private onBloom(e: SceneEvents['bloom'], world: World): void {
    const rng = this.rng;
    const S = world.scale;
    const big = e.kind === 'sunflower';
    const flash = this.flashes.find((q) => !q.on);
    if (flash) {
      flash.on = true;
      flash.x = e.x;
      flash.y = e.y;
      flash.r = e.radius * (big ? 2.3 : 1.9);
      flash.age = 0;
      flash.life = 0.65;
    }
    const n = Math.round((big ? 16 : rng.int(10, 12)) * (world.reducedMotion ? 0.5 : 1));
    const a0 = rng.float(0, TAU);
    for (let i = 0; i < n; i++) {
      const a = a0 + (i / n) * TAU + rng.float(-0.12, 0.12);
      const r0 = e.radius * 0.55;
      const sp = e.radius * rng.float(1.6, 2.6) * (big ? 1.2 : 1);
      this.emitSpark(
        e.x + Math.cos(a) * r0,
        e.y + Math.sin(a) * r0,
        Math.cos(a) * sp,
        Math.sin(a) * sp,
        rng.float(7, 11) * S * (big ? 1.25 : 1),
        rng.float(0.85, 1.2),
        2.4,
      );
    }
  }

  private onTap(e: SceneEvents['tap'], world: World): void {
    const rng = this.rng;
    const S = world.scale;
    const n = world.reducedMotion ? 7 : 14;
    for (let i = 0; i < n; i++) {
      const a = rng.float(0, TAU);
      const sp = rng.float(40, 130) * S;
      this.emitSpark(e.x, e.y, Math.cos(a) * sp, Math.sin(a) * sp - 20 * S, rng.float(8, 13) * S, rng.float(0.7, 1.2), 2.2);
    }
    const ring = this.rings.find((q) => !q.on);
    if (ring) {
      ring.on = true;
      ring.x = e.x;
      ring.y = e.y;
      ring.r = 75 * S;
      ring.age = 0;
      ring.life = 1.1;
    }
    const hearts = rng.int(3, 6);
    for (let i = 0; i < hearts; i++) this.spawnHeart(world, true, e.x + rng.float(-14, 14) * S, e.y + rng.float(-6, 6) * S);
  }

  /* ---------------------------------------------------------------- */
  /* Draw                                                              */
  /* ---------------------------------------------------------------- */

  draw(g: CanvasRenderingContext2D, world: World): void {
    const t = world.time;
    const dpr = world.dpr;
    const S = world.scale;

    // Polen (aditivo).
    g.globalCompositeOperation = 'lighter';
    const moteFade = smoothstep(2.5, 6, t);
    if (moteFade > 0) {
      for (let i = 0; i < this.moteCount; i++) {
        const m = this.motes[i] as Mote;
        const life = m.age / m.life;
        const a = Math.sin(Math.PI * life) * (0.55 + 0.45 * Math.sin(t * m.tw + m.ph)) * moteFade;
        drawGlow(g, this.moteGlow, m.x, m.y, m.size * 3.2 * S, a * 0.8);
      }
    }

    // Pétalos que caen.
    g.globalCompositeOperation = 'source-over';
    for (const p of this.petals) {
      if (!p.on) continue;
      const set = this.petalSet[p.set];
      if (!set) continue;
      const fadeIn = smoothstep(0, 0.35, p.age);
      const fadeOut = 1 - smoothstep(world.height * 0.8, world.height * 0.95, p.y);
      const alpha = fadeIn * fadeOut;
      if (alpha <= 0.01) continue;
      const c = Math.cos(p.flip);
      const sx = c >= 0 ? Math.max(0.12, c) : Math.min(-0.12, c);
      const sprite = c >= 0 ? set.front : set.back;
      const cr = Math.cos(p.rot);
      const sr = Math.sin(p.rot);
      const h = p.size;
      const w = h / set.aspect;
      g.globalAlpha = alpha;
      g.setTransform(cr * sx * dpr, sr * sx * dpr, -sr * dpr, cr * dpr, p.x * dpr, p.y * dpr);
      g.drawImage(sprite, -w / 2, -h / 2, w, h);
    }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.globalAlpha = 1;

    // Luciérnagas.
    g.globalCompositeOperation = 'lighter';
    const ffFade = smoothstep(4, 7.5, t);
    if (ffFade > 0) {
      for (let i = 0; i < this.fireflyCount; i++) {
        const f = this.fireflies[i] as Firefly;
        const b = f.b * ffFade;
        if (b <= 0.01) continue;
        drawGlow(g, this.fireflyHalo, f.x, f.y, (12 + 10 * b) * f.size * S, b * 0.75);
        drawGlow(g, this.fireflyCore, f.x, f.y, 4.2 * f.size * S, Math.min(1, b * 1.4));
      }
    }

    // Corazones.
    const pulseScale = 1 / HEART_SPRITE_FILL;
    for (const h of this.hearts) {
      if (!h.on) continue;
      let alpha = smoothstep(0, h.tap ? 0.25 : 0.9, h.age);
      if (h.tap) alpha *= 1 - smoothstep(h.life * 0.5, h.life, h.age);
      else alpha *= smoothstep(h.endY, h.endY + world.height * 0.1, h.y);
      if (alpha <= 0.01) continue;
      const beat = 1 + 0.06 * Math.max(0, Math.sin(t * 5.2 + h.ph)) ** 6;
      const s = h.size * beat;
      g.globalCompositeOperation = 'lighter';
      drawGlow(g, this.warmGlow, h.x, h.y, s * 2.8, alpha * 0.4);
      g.globalCompositeOperation = 'source-over';
      const sprite = h.peach ? this.heartPeach : this.heartGold;
      if (!sprite) continue;
      const tilt = Math.cos(h.age * h.swayF * TAU * 0.5 + h.ph) * 0.22;
      const cr = Math.cos(tilt);
      const sr = Math.sin(tilt);
      const d = s * 2 * pulseScale;
      g.globalAlpha = alpha;
      g.setTransform(cr * dpr, sr * dpr, -sr * dpr, cr * dpr, h.x * dpr, h.y * dpr);
      g.drawImage(sprite, -d / 2, -d / 2, d, d);
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.globalAlpha = 1;
    }

    // Destellos, anillos y flashes (aditivos).
    g.globalCompositeOperation = 'lighter';
    const flashK = world.reducedMotion ? 0.35 : 1;
    for (const f of this.flashes) {
      if (!f.on) continue;
      const p = f.age / f.life;
      const a = (p < 0.15 ? p / 0.15 : (1 - (p - 0.15) / 0.85) ** 2) * 0.42 * flashK;
      drawGlow(g, this.flashGlow, f.x, f.y, f.r * (0.7 + 0.3 * p), a);
    }
    for (const r of this.rings) {
      if (!r.on) continue;
      const p = r.age / r.life;
      const e = 1 - (1 - p) ** 3;
      g.globalAlpha = (1 - p) ** 1.5 * 0.7;
      g.strokeStyle = '#ffd86a';
      g.lineWidth = Math.max(0.6, 2.2 * (1 - p)) * S;
      g.beginPath();
      g.arc(r.x, r.y, 4 * S + r.r * e, 0, TAU);
      g.stroke();
    }
    g.globalAlpha = 1;
    const spark = this.spark;
    if (spark) {
      for (const s of this.sparks) {
        if (!s.on) continue;
        const p = s.age / s.life;
        const a = (p < 0.12 ? p / 0.12 : 1) * (1 - p) ** 1.3;
        const tw = 0.75 + 0.25 * Math.sin(s.age * 18 + s.rot * 10);
        const d = s.size * 2 * (0.6 + 0.4 * Math.sin(Math.PI * Math.min(1, p * 1.4))) * tw;
        const cr = Math.cos(s.rot);
        const sr = Math.sin(s.rot);
        g.globalAlpha = a;
        g.setTransform(cr * dpr, sr * dpr, -sr * dpr, cr * dpr, s.x * dpr, s.y * dpr);
        g.drawImage(spark, -d / 2, -d / 2, d, d);
      }
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.globalAlpha = 1;
    }
    g.globalCompositeOperation = 'source-over';
  }
}
