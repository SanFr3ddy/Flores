import type { NoiseFunction3D } from 'simplex-noise';
import { Random, TAU, clamp, damp, smoothstep } from '../core/math';
import { drawGlow, glowSprite } from '../core/sprites';
import type { FlowerAnchor, Layer, SceneEvents, World } from '../core/types';
import { Pool } from './fx/pool';
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
/** Pétalos: 60 de ambiente como máximo + margen para la lluvia de la celebración. */
const MAX_PETALS = 120;
const MAX_AMBIENT_PETALS = 60;
const MAX_SPARKS = 420;
const MAX_HEARTS = 44;
const MAX_FLASHES = 16;
const MAX_RINGS = 12;
const MAX_TRAILS = 10;

/** Posición del nudo del listón (fracción del viewport), de donde nacen las flores nuevas. */
const TIE_X = 0.5;
const TIE_Y = 0.78;

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
  /** Pétalo de la celebración (no cuenta para el límite de ambiente). */
  burst: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  spin: number;
  flip: number;
  flipSpeed: number;
  fall: number;
  drag: number;
  sway: number;
  set: number;
  size: number;
  /** Edad en s; negativa = aún esperando su turno (invisible, quieto). */
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
  a: number;
  age: number;
  life: number;
}

interface Ring {
  on: boolean;
  x: number;
  y: number;
  r: number;
  w: number;
  age: number;
  life: number;
}

/** Estela de destellos que sube del nudo del listón a la flor nueva. */
interface Trail {
  on: boolean;
  x0: number;
  y0: number;
  cx: number;
  cy: number;
  x1: number;
  y1: number;
  x: number;
  y: number;
  age: number;
  life: number;
  acc: number;
}

const fill = <T>(n: number, make: () => T): T[] => Array.from({ length: n }, make);

/** Pulso de una luciérnaga: sube suave, se sostiene, se apaga y descansa a oscuras. */
function blinkShape(u: number): number {
  if (u < 0.2) return smoothstep(0, 0.2, u);
  if (u < 0.38) return 1;
  if (u < 0.72) return 1 - smoothstep(0.38, 0.72, u);
  return 0;
}

/** Partículas: polen, pétalos que caen, luciérnagas, corazones, destellos y la celebración. */
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
  private petals = new Pool<Petal>(0, () => ({}) as Petal);
  private sparks = new Pool<Spark>(0, () => ({}) as Spark);
  private hearts = new Pool<Heart>(0, () => ({}) as Heart);
  private flashes = new Pool<Flash>(0, () => ({}) as Flash);
  private rings = new Pool<Ring>(0, () => ({}) as Ring);
  private trails = new Pool<Trail>(0, () => ({}) as Trail);

  private petalAcc = 0;
  private nextHeartAt = Infinity;
  private openCount = 0;
  private ambientPetals = 0;
  /** "Energía" de floraciones recientes: atenúa los destellos cuando florecen muchas juntas. */
  private bloomEnergy = 0;
  /** Celebración del ramo completo. */
  private celebX = 0;
  private celebY = 0;
  private celebR = 0;
  private celebAge = -1;

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
  private readonly celebGlow = glowSprite('#ffc94a', 0.45, 256);

  init(world: World): void {
    for (const off of this.unsub) off();
    this.unsub = [];
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

    this.petals = new Pool<Petal>(MAX_PETALS, () => ({
      on: false, burst: false, x: 0, y: 0, vx: 0, vy: 0, rot: 0, spin: 0, flip: 0, flipSpeed: 0, fall: 0,
      drag: 1.8, sway: 0, set: 0, size: 0, age: 0,
    }));
    this.sparks = new Pool<Spark>(MAX_SPARKS, () => ({
      on: false, x: 0, y: 0, vx: 0, vy: 0, age: 0, life: 1, size: 1, rot: 0, spin: 0, drag: 0,
    }));
    this.hearts = new Pool<Heart>(MAX_HEARTS, () => ({
      on: false, tap: false, x: 0, y: 0, baseX: 0, vx: 0, vy: 0, age: 0, life: 1, endY: 0, size: 1,
      swayAmp: 0, swayF: 0, ph: 0, peach: false,
    }));
    this.flashes = new Pool<Flash>(MAX_FLASHES, () => ({ on: false, x: 0, y: 0, r: 0, a: 0, age: 0, life: 1 }));
    this.rings = new Pool<Ring>(MAX_RINGS, () => ({ on: false, x: 0, y: 0, r: 0, w: 1, age: 0, life: 1 }));
    this.trails = new Pool<Trail>(MAX_TRAILS, () => ({
      on: false, x0: 0, y0: 0, cx: 0, cy: 0, x1: 0, y1: 0, x: 0, y: 0, age: 0, life: 1, acc: 0,
    }));

    this.petalAcc = 0;
    this.nextHeartAt = Infinity;
    this.openCount = 0;
    this.ambientPetals = 0;
    this.bloomEnergy = 0;
    this.celebAge = -1;

    this.unsub = [
      world.events.on('bloom', (e) => this.onBloom(e, world)),
      world.events.on('tap', (e) => this.onTap(e, world)),
      world.events.on('flowerAdded', (e) => this.onFlowerAdded(e, world)),
      world.events.on('bouquetComplete', (e) => this.onComplete(e, world)),
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
      this.petals.items.forEach(move);
      this.sparks.items.forEach(move);
      this.flashes.items.forEach(move);
      this.rings.items.forEach(move);
      for (const h of this.hearts.items) {
        move(h);
        h.baseX *= sx;
        h.endY *= sy;
      }
      for (const tr of this.trails.items) {
        tr.x0 *= sx;
        tr.cx *= sx;
        tr.x1 *= sx;
        tr.y0 *= sy;
        tr.cy *= sy;
        tr.y1 *= sy;
      }
      this.celebX *= sx;
      this.celebY *= sy;
    }
    const q = world.quality;
    this.fireflyCount = clamp(Math.round(50 * q), 26, MAX_FIREFLIES);
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
    this.bloomEnergy *= Math.exp(-dt * 0.7);
    if (this.celebAge >= 0) {
      this.celebAge += dt;
      if (this.celebAge > 6) this.celebAge = -1;
    }

    this.updateFireflies(dt, world);
    this.updateMotes(dt, world);
    this.updatePetals(dt, world);
    this.updateHearts(dt, world);
    this.updateTrails(dt, world);
    this.updateBursts(dt, world);
  }

  private updateFireflies(dt: number, world: World): void {
    const { width: W, height: H, scale: S, time: t, pointer } = world;
    const slow = world.reducedMotion ? 0.55 : 1;
    const reach = 250 * Math.max(S, 0.7);
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
      f.b = 0.1 + 0.9 * blinkShape(u) * gate;
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

  private initPetal(p: Petal, world: World): void {
    const rng = this.rng;
    const S = world.scale;
    p.on = true;
    p.burst = false;
    p.rot = rng.float(0, TAU);
    p.spin = rng.float(-1.4, 1.4);
    p.flip = rng.float(0, TAU);
    p.flipSpeed = rng.float(1.8, 4.2) * rng.sign() * (world.reducedMotion ? 0.5 : 1);
    p.fall = rng.float(16, 32) * S * (world.reducedMotion ? 0.7 : 1);
    p.drag = 1.8;
    p.sway = rng.float(0, TAU);
    p.set = rng.int(0, this.petalSet.length - 1);
    p.size = rng.float(9, 16) * Math.max(S, 0.7);
    p.age = 0;
  }

  private spawnPetal(world: World, fromTop: boolean): void {
    if (this.ambientPetals >= MAX_AMBIENT_PETALS) return;
    const rng = this.rng;
    const S = world.scale;
    let x: number;
    let y: number;
    let vx: number;
    let vy: number;
    if (fromTop) {
      x = rng.float(0.05, 0.95) * world.width;
      y = -20;
      vx = 0;
      vy = 10 * S;
    } else {
      const fl = this.pickFlower(world, 0.98);
      if (!fl) return;
      const a = rng.float(0, TAU);
      x = fl.x + Math.cos(a) * fl.radius * 0.75;
      y = fl.y + Math.sin(a) * fl.radius * 0.5;
      vx = Math.cos(a) * 10 * S;
      vy = rng.float(-6, 4) * S;
    }
    const p = this.petals.free();
    if (!p) return;
    this.initPetal(p, world);
    p.x = x;
    p.y = y;
    p.vx = vx;
    p.vy = vy;
    this.ambientPetals++;
  }

  private updatePetals(dt: number, world: World): void {
    const S = world.scale;
    // Ritmo de desprendimiento (0.5..1.2 por segundo) según cuántas flores están abiertas.
    if (this.openCount > 0) {
      const rate =
        (0.5 + 0.7 * Math.min(1, this.openCount / 20)) *
        world.quality *
        Math.min(1, this.openCount / 4) *
        (world.reducedMotion ? 0.5 : 1);
      this.petalAcc += rate * dt;
      while (this.petalAcc >= 1) {
        this.petalAcc -= 1;
        this.spawnPetal(world, false);
      }
    }
    if (world.bouquet.completeAt !== null && this.rng.chance(0.04 * dt)) this.spawnPetal(world, true);

    let ambient = 0;
    const bottom = world.height * 0.97;
    for (const p of this.petals.items) {
      if (!p.on) continue;
      p.age += dt;
      if (p.age < 0) continue;
      if (!p.burst) ambient++;
      p.flip += p.flipSpeed * dt;
      const c = Math.abs(Math.cos(p.flip));
      // De plano cae más lento; de canto, más rápido.
      p.vy = damp(p.vy, p.fall * (0.5 + 0.7 * (1 - c)), p.drag, dt);
      const wind = world.wind(p.x, p.y);
      p.vx = damp(p.vx, wind * 42 * S + Math.sin(p.flip * 0.5 + p.sway) * 16 * S, p.drag * 0.72, dt);
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += (p.spin + (p.vx * 0.01) / S) * dt;
      // Se desvanece antes de llegar al borde inferior (ver draw).
      if (p.y > bottom || p.x < -80 || p.x > world.width + 80) p.on = false;
    }
    this.ambientPetals = ambient;
  }

  private spawnHeart(world: World, tap: boolean, x: number, y: number): Heart {
    const h = this.hearts.take();
    const rng = this.rng;
    const S = world.scale;
    const U = Math.max(S, 0.62);
    h.on = true;
    h.tap = tap;
    h.x = x;
    h.y = y;
    h.baseX = x;
    h.age = 0;
    h.ph = rng.float(0, TAU);
    h.peach = rng.chance(tap ? 0.25 : 0.15);
    if (tap) {
      h.vx = rng.float(-40, 40) * U;
      h.vy = -rng.float(40, 80) * U;
      h.life = rng.float(1.6, 2.3);
      h.size = rng.float(6, 10) * U;
      h.swayAmp = rng.float(4, 9) * U;
      h.swayF = rng.float(1.2, 2);
      h.endY = -1e4;
    } else {
      h.vx = 0;
      h.vy = -rng.float(28, 40) * U;
      h.life = 30;
      h.size = rng.float(9, 14) * U;
      h.swayAmp = rng.float(10, 22) * U;
      h.swayF = rng.float(0.6, 1.1);
      // Se apagan antes de la franja de mensajes (~17-27 % de la altura).
      h.endY = world.height * rng.float(0.3, 0.33);
      h.y = Math.max(y, h.endY + world.height * 0.14);
    }
    return h;
  }

  private updateHearts(dt: number, world: World): void {
    const t = world.time;
    const done = world.bouquet.completeAt;
    // Corazones que suben del ramo: solo después de completarlo.
    if (done !== null) {
      if (this.nextHeartAt === Infinity) this.nextHeartAt = done + 4.5;
      if (t >= this.nextHeartAt) {
        this.nextHeartAt = t + this.rng.float(2.5, 4) * (world.reducedMotion ? 1.6 : 1);
        // Nacen de lo alto del ramo: la flor abierta más alta de unas cuantas al azar.
        let fl: FlowerAnchor | null = null;
        for (let k = 0; k < 5; k++) {
          const c = this.pickFlower(world, 0.95);
          if (c && (!fl || c.y < fl.y)) fl = c;
        }
        const x = fl ? fl.x : world.width * this.rng.float(0.4, 0.6);
        const y = fl ? fl.y - fl.radius * 0.6 : world.height * 0.45;
        this.spawnHeart(world, false, x, y);
      }
    } else {
      this.nextHeartAt = Infinity;
    }
    for (const h of this.hearts.items) {
      if (!h.on) continue;
      h.age += dt;
      if (h.age < 0) continue;
      if (h.tap) {
        h.vx = damp(h.vx, 0, 1.6, dt);
        h.vy = damp(h.vy, -22 * Math.max(world.scale, 0.62), 1.2, dt);
        h.baseX += h.vx * dt;
      }
      h.y += h.vy * dt;
      h.x = h.baseX + Math.sin(h.age * h.swayF * TAU * 0.5 + h.ph) * h.swayAmp;
      if (h.age >= h.life || (!h.tap && h.y <= h.endY)) h.on = false;
    }
  }

  private updateTrails(dt: number, world: World): void {
    const U = Math.max(world.scale, 0.6);
    const rng = this.rng;
    for (const tr of this.trails.items) {
      if (!tr.on) continue;
      tr.age += dt;
      const p = Math.min(1, tr.age / tr.life);
      const e = 1 - (1 - p) ** 2.2;
      const k = 1 - e;
      tr.x = k * k * tr.x0 + 2 * k * e * tr.cx + e * e * tr.x1;
      tr.y = k * k * tr.y0 + 2 * k * e * tr.cy + e * e * tr.y1;
      tr.acc += dt;
      // Deja un rastro de chispitas mientras sube.
      while (tr.acc > 0.028 && p < 1) {
        tr.acc -= 0.028;
        const s = this.sparks.take();
        this.setSpark(
          s,
          tr.x + rng.float(-3, 3) * U,
          tr.y + rng.float(-3, 3) * U,
          rng.float(-14, 14) * U,
          rng.float(-6, 10) * U,
          rng.float(3.5, 6.5) * U,
          rng.float(0.4, 0.75),
          2.8,
        );
      }
      if (p >= 1) tr.on = false;
    }
  }

  private updateBursts(dt: number, world: World): void {
    const lift = 8 * world.scale;
    for (const s of this.sparks.items) {
      if (!s.on) continue;
      s.age += dt;
      if (s.age < 0) continue;
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
    for (const f of this.flashes.items) {
      if (!f.on) continue;
      f.age += dt;
      if (f.age >= f.life) f.on = false;
    }
    for (const r of this.rings.items) {
      if (!r.on) continue;
      r.age += dt;
      if (r.age >= r.life) r.on = false;
    }
  }

  /* ---------------------------------------------------------------- */
  /* Eventos                                                           */
  /* ---------------------------------------------------------------- */

  private setSpark(s: Spark, x: number, y: number, vx: number, vy: number, size: number, life: number, drag: number): void {
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

  private addFlash(x: number, y: number, r: number, a: number, life: number): void {
    const f = this.flashes.take();
    f.on = true;
    f.x = x;
    f.y = y;
    f.r = r;
    f.a = a;
    f.age = 0;
    f.life = life;
  }

  private addRing(x: number, y: number, r: number, w: number, life: number): void {
    const ring = this.rings.take();
    ring.on = true;
    ring.x = x;
    ring.y = y;
    ring.r = r;
    ring.w = w;
    ring.age = 0;
    ring.life = life;
  }

  private onBloom(e: SceneEvents['bloom'], world: World): void {
    const rng = this.rng;
    const S = world.scale;
    const big = e.kind === 'sunflower';
    // Muchas flores abren en poco espacio: cuantas más recientes, más discreto el destello.
    const k = 1 / (1 + this.bloomEnergy * 0.3);
    this.bloomEnergy += 1;
    this.addFlash(e.x, e.y, e.radius * (big ? 2.1 : 1.8), 0.34 * (0.45 + 0.55 * k), 0.7);
    const n = Math.max(4, Math.round((big ? 12 : 9) * k * (world.reducedMotion ? 0.5 : 1)));
    const a0 = rng.float(0, TAU);
    for (let i = 0; i < n; i++) {
      const a = a0 + (i / n) * TAU + rng.float(-0.15, 0.15);
      const r0 = e.radius * 0.55;
      const sp = e.radius * rng.float(1.4, 2.3) * (big ? 1.15 : 1);
      this.setSpark(
        this.sparks.take(),
        e.x + Math.cos(a) * r0,
        e.y + Math.sin(a) * r0,
        Math.cos(a) * sp,
        Math.sin(a) * sp,
        rng.float(6, 10) * Math.max(S, 0.6) * (big ? 1.2 : 1),
        rng.float(0.8, 1.15),
        2.4,
      );
    }
  }

  private onTap(e: SceneEvents['tap'], world: World): void {
    const rng = this.rng;
    const U = Math.max(world.scale, 0.78);
    const n = world.reducedMotion ? 7 : 14;
    for (let i = 0; i < n; i++) {
      const a = rng.float(0, TAU);
      const sp = rng.float(45, 140) * U;
      this.setSpark(
        this.sparks.take(),
        e.x,
        e.y,
        Math.cos(a) * sp,
        Math.sin(a) * sp - 20 * U,
        rng.float(8, 13) * U,
        rng.float(0.65, 1.1),
        2.2,
      );
    }
    this.addFlash(e.x, e.y, 42 * U, 0.35, 0.45);
    this.addRing(e.x, e.y, 70 * U, 2.2, 1);
    const hearts = world.reducedMotion ? 3 : rng.int(3, 6);
    for (let i = 0; i < hearts; i++) {
      this.spawnHeart(world, true, e.x + rng.float(-14, 14) * U, e.y + rng.float(-6, 6) * U);
    }
  }

  private onFlowerAdded(e: SceneEvents['flowerAdded'], world: World): void {
    const tr = this.trails.take();
    const W = world.width;
    const H = world.height;
    tr.on = true;
    tr.x0 = W * TIE_X;
    tr.y0 = H * TIE_Y;
    tr.x1 = e.x;
    tr.y1 = e.y;
    // Curva suave: el punto de control se desplaza hacia afuera, como un tallo.
    const mx = (tr.x0 + tr.x1) / 2;
    const my = (tr.y0 + tr.y1) / 2;
    tr.cx = mx + (tr.x1 - tr.x0) * 0.35 + this.rng.float(-0.04, 0.04) * W;
    tr.cy = my + (tr.y1 - tr.y0) * 0.1;
    tr.x = tr.x0;
    tr.y = tr.y0;
    tr.age = 0;
    tr.life = this.rng.float(0.55, 0.7);
    tr.acc = 0;
  }

  /** Radio aproximado del ramo (medio ancho de las cabezas actuales). */
  private bouquetRadius(world: World): number {
    let minX = Infinity;
    let maxX = -Infinity;
    for (const f of world.flowers) {
      if (f.x - f.radius < minX) minX = f.x - f.radius;
      if (f.x + f.radius > maxX) maxX = f.x + f.radius;
    }
    const fallback = Math.min(world.width * 0.46, 420);
    return maxX > minX ? clamp((maxX - minX) / 2, 60, 600) : fallback;
  }

  private onComplete(e: SceneEvents['bouquetComplete'], world: World): void {
    const rng = this.rng;
    const U = Math.max(world.scale, 0.62);
    const R = this.bouquetRadius(world);
    const calm = world.reducedMotion;
    this.celebX = e.x;
    this.celebY = e.y;
    this.celebR = R;
    this.celebAge = 0;
    this.addRing(e.x, e.y, R * 0.95, 1.6, 2.2);

    // Lluvia de pétalos: salen hacia afuera/arriba del centro del ramo y caen despacio.
    const nPetals = Math.round((calm ? 18 : 52) * clamp(world.quality + 0.25, 0.7, 1));
    for (let i = 0; i < nPetals; i++) {
      const p = this.petals.take();
      this.initPetal(p, world);
      p.burst = true;
      p.x = e.x + rng.gaussian() * R * 0.28;
      p.y = e.y + rng.gaussian() * R * 0.18;
      const a = -Math.PI / 2 + rng.gaussian() * 0.95;
      const sp = rng.float(140, 360) * U * (calm ? 0.5 : 1);
      p.vx = Math.cos(a) * sp * 1.15;
      p.vy = Math.sin(a) * sp;
      p.drag = rng.float(0.8, 1.2);
      p.size *= rng.float(1, 1.3);
      p.age = -rng.float(0, 0.45);
    }
    // Destellos en abanico.
    const nSparks = calm ? 20 : 60;
    for (let i = 0; i < nSparks; i++) {
      const s = this.sparks.take();
      const a = -Math.PI / 2 + rng.gaussian() * 1.3;
      const sp = rng.float(90, 320) * U;
      this.setSpark(
        s,
        e.x + rng.gaussian() * R * 0.2,
        e.y + rng.gaussian() * R * 0.15,
        Math.cos(a) * sp,
        Math.sin(a) * sp,
        rng.float(7, 13) * U,
        rng.float(1.2, 2.2),
        1.6,
      );
      s.age = -rng.float(0, 0.8);
    }
    // Corazones que suben, escalonados.
    const nHearts = calm ? 5 : rng.int(8, 12);
    for (let i = 0; i < nHearts; i++) {
      const h = this.spawnHeart(world, false, e.x + rng.gaussian() * R * 0.4, e.y - R * rng.float(0, 0.3));
      h.vy *= 1.25;
      h.age = -(0.3 + (i / nHearts) * 2.6 + rng.float(0, 0.25));
    }
  }

  /* ---------------------------------------------------------------- */
  /* Draw                                                              */
  /* ---------------------------------------------------------------- */

  draw(g: CanvasRenderingContext2D, world: World): void {
    const t = world.time;
    const dpr = world.dpr;
    const S = world.scale;

    // Destello grande y suave de la celebración (cálido, detrás del resto de partículas).
    g.globalCompositeOperation = 'lighter';
    if (this.celebAge >= 0) {
      const a = this.celebAge;
      const env = smoothstep(0, 0.35, a) * (1 - smoothstep(0.6, 4.2, a));
      const r = this.celebR * (1.45 + 0.25 * smoothstep(0, 3, a));
      drawGlow(g, this.celebGlow, this.celebX, this.celebY, r, env * (world.reducedMotion ? 0.25 : 0.42));
      drawGlow(g, this.flashGlow, this.celebX, this.celebY, r * 0.55, env * env * 0.3);
    }

    // Polen (aditivo).
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
    const H = world.height;
    for (const p of this.petals.items) {
      if (!p.on || p.age < 0) continue;
      const set = this.petalSet[p.set];
      if (!set) continue;
      const fadeIn = smoothstep(0, p.burst ? 0.15 : 0.35, p.age);
      const fadeOut = 1 - smoothstep(H * 0.8, H * 0.95, p.y);
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
      const FS = Math.max(S, 0.6);
      for (let i = 0; i < this.fireflyCount; i++) {
        const f = this.fireflies[i] as Firefly;
        const b = f.b * ffFade;
        if (b <= 0.01) continue;
        drawGlow(g, this.fireflyHalo, f.x, f.y, (12 + 10 * b) * f.size * FS, b * 0.75);
        drawGlow(g, this.fireflyCore, f.x, f.y, 4.2 * f.size * FS, Math.min(1, b * 1.4));
      }
    }

    // Estelas de flores nuevas: una cabecita luminosa.
    for (const tr of this.trails.items) {
      if (!tr.on) continue;
      const p = tr.age / tr.life;
      const a = smoothstep(0, 0.15, p) * (1 - smoothstep(0.75, 1, p));
      const U = Math.max(S, 0.6);
      drawGlow(g, this.warmGlow, tr.x, tr.y, 16 * U, a * 0.55);
      drawGlow(g, this.fireflyCore, tr.x, tr.y, 5 * U, a);
    }

    // Corazones.
    const pulseScale = 1 / HEART_SPRITE_FILL;
    for (const h of this.hearts.items) {
      if (!h.on || h.age < 0) continue;
      let alpha = smoothstep(0, h.tap ? 0.2 : 0.9, h.age);
      if (h.tap) alpha *= (1 - smoothstep(h.life * 0.5, h.life, h.age)) * smoothstep(H * 0.25, H * 0.33, h.y);
      else alpha *= smoothstep(h.endY, h.endY + H * 0.1, h.y);
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
    for (const f of this.flashes.items) {
      if (!f.on) continue;
      const p = f.age / f.life;
      const a = (p < 0.15 ? p / 0.15 : (1 - (p - 0.15) / 0.85) ** 2) * f.a * flashK;
      drawGlow(g, this.flashGlow, f.x, f.y, f.r * (0.7 + 0.3 * p), a);
    }
    g.strokeStyle = '#ffe9a6';
    for (const r of this.rings.items) {
      if (!r.on) continue;
      const p = r.age / r.life;
      const e = 1 - (1 - p) ** 3;
      g.globalAlpha = (1 - p) ** 1.5 * 0.7;
      g.lineWidth = Math.max(0.6, r.w * (1 - p) * Math.max(S, 0.6));
      g.beginPath();
      g.arc(r.x, r.y, 4 * S + r.r * e, 0, TAU);
      g.stroke();
    }
    g.globalAlpha = 1;
    const spark = this.spark;
    if (spark) {
      for (const s of this.sparks.items) {
        if (!s.on || s.age < 0) continue;
        const p = s.age / s.life;
        // Se apagan encogiéndose (así siguen luminosos y no se ven "sucios").
        const a = (p < 0.1 ? p / 0.1 : 1) * (1 - smoothstep(0.7, 1, p));
        const tw = 0.7 + 0.3 * Math.sin(s.age * 16 + s.rot * 10);
        const d = s.size * 2 * (p < 0.15 ? 0.5 + p / 0.3 : (1 - p) ** 0.8 * 1.15) * tw;
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
