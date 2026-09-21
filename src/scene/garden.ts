import { CONFIG, DEBUG } from '../config';
import { clamp, clamp01, ease, progress, smoothstep, type Random } from '../core/math';
import { glowSprite } from '../core/sprites';
import type { FlowerAnchor, FlowerKind, Layer, World } from '../core/types';
import { clearFlowerCache, drawFlowerGlow, drawFlowerHead, type HeadSpec } from './flowers/index';
import { DOME_CY, DOME_H, DOME_RY, designBouquet, type LeafDef, type Row, type SlotDef, type SprigDef } from './garden/layout';
import { Ribbon } from './garden/ribbon';
import { drawLeaf, leafSprites } from './garden/sprites';

const P = CONFIG.palette;
const TL = CONFIG.timeline;
const B = CONFIG.bouquet;
const SEED_STAGGER = 0.6;
const STEM_SEGS = 16;
const SPRIG_SEGS = 12;
const DIE_TIME = 1.5;
const MAX_EXTRA_ALIVE = B.maxExtra + 6;

/** Curva cúbica con puntos base (resize) y actuales (update). */
class Curve {
  // Base en px (sin balanceo).
  x0 = 0;
  y0 = 0;
  bx1 = 0;
  by1 = 0;
  bx2 = 0;
  by2 = 0;
  bx3 = 0;
  by3 = 0;
  // Actuales (con balanceo).
  x1 = 0;
  y1 = 0;
  x2 = 0;
  y2 = 0;
  x3 = 0;
  y3 = 0;

  px(t: number): number {
    const u = 1 - t;
    return u * u * u * this.x0 + 3 * u * u * t * this.x1 + 3 * u * t * t * this.x2 + t * t * t * this.x3;
  }
  py(t: number): number {
    const u = 1 - t;
    return u * u * u * this.y0 + 3 * u * u * t * this.y1 + 3 * u * t * t * this.y2 + t * t * t * this.y3;
  }
  tx(t: number): number {
    const u = 1 - t;
    return 3 * u * u * (this.x1 - this.x0) + 6 * u * t * (this.x2 - this.x1) + 3 * t * t * (this.x3 - this.x2);
  }
  ty(t: number): number {
    const u = 1 - t;
    return 3 * u * u * (this.y1 - this.y0) + 6 * u * t * (this.y2 - this.y1) + 3 * t * t * (this.y3 - this.y2);
  }
}

class Sprig {
  readonly curve = new Curve();
  start = Infinity;
  grow = 0;
  constructor(
    readonly def: SprigDef,
    readonly phase: number,
  ) {}
}

class Slot {
  readonly curve = new Curve();
  readonly spec: HeadSpec;
  readonly anchor: FlowerAnchor;
  readonly sprig: Sprig | null;
  active = false;
  start = 0;
  growDur = 2.4;
  openDur = 1.6;
  bloomed = false;
  /** Solo extras: momento en que empieza a desaparecer (-1 = no). */
  dieAt = -1;
  // Geometría px.
  rPx = 10;
  stemW = 3;
  endX = 0;
  endY = 0;
  // Estado actual.
  grow = 0;
  open = 0;
  vis = 1;
  hx = 0;
  hy = 0;
  ang = 0;
  springX = 0;
  springV = 0;

  constructor(
    readonly def: SlotDef,
    readonly id: number,
    readonly extra: boolean,
    phase: number,
  ) {
    this.spec = { kind: def.kind, radius: 10, seed: def.seed, depth: def.depth, facing: def.facing };
    this.anchor = { id, kind: def.kind, x: 0, y: 0, radius: 10, open: 0, depth: def.depth, angle: 0 };
    this.sprig = def.sprig ? new Sprig(def.sprig, phase) : null;
  }
}

/** Ramo que se arma tocando la pantalla: tallos, hojas, follaje, listón y crecimiento. */
export class GardenLayer implements Layer {
  readonly name = 'garden';

  private rng!: Random;
  private slots: Slot[] = [];
  private extras: Slot[] = [];
  private base: Sprig[] = [];
  private rows: Slot[][] = [[], [], []];
  private unsubTap: (() => void) | null = null;
  private ribbon = new Ribbon();
  private seeds = 0;
  private nextAuto = Infinity;
  private completeAt: number | null = null;
  private nextId = 0;

  // Marco del ramo (px CSS).
  private cx = 0;
  private top = 0;
  private sx = 1;
  private sy = 1;
  private s = 1;
  private k = 1;
  private tieX = 0;
  private tieY = 0;
  private endY = 0;
  private bundleW = 20;
  private cosA = 1;
  private sinA = 0;
  private sway = 0;

  // Buffers reutilizados para el polígono del tallo.
  private readonly lx = new Float32Array(STEM_SEGS + 1);
  private readonly ly = new Float32Array(STEM_SEGS + 1);
  private readonly rx = new Float32Array(STEM_SEGS + 1);
  private readonly ry = new Float32Array(STEM_SEGS + 1);

  init(world: World): void {
    this.rng = world.rng.fork();
    const phone = Math.min(world.width, world.height) < 600;
    const n = phone ? B.totalPhone : B.totalLarge;
    this.seeds = Math.min(B.seedFlowers, n);
    const design = designBouquet(this.rng, n, this.seeds, phone);
    this.nextId = 0;
    this.slots = design.slots.map((d) => new Slot(d, this.nextId++, false, this.rng.float(0, 6.28)));
    this.base = design.base.map((d) => {
      const sp = new Sprig(d, this.rng.float(0, 6.28));
      sp.start = TL.ribbon + d.delay;
      return sp;
    });
    this.extras = [];
    this.rebuildRows();
    this.completeAt = null;
    this.nextAuto = TL.stemsStart + (this.seeds - 1) * SEED_STAGGER + B.autoAfter;

    world.bouquet.total = n;
    world.bouquet.count = 0;
    world.bouquet.completeAt = null;
    world.flowers.length = 0;

    this.unsubTap?.();
    this.unsubTap = world.events.on('tap', (e) => this.onTap(e.x, e.y, world));
  }

  resize(world: World): void {
    const W = world.width;
    const H = world.height;
    const portrait = H >= W;
    const lowLand = !portrait && H < 500;
    let halfW: number;
    let top: number;
    let bottom: number;
    if (portrait) {
      halfW = W * 0.46;
      top = H * 0.33;
      bottom = H * 0.7;
      this.tieY = H * 0.78;
      this.endY = H * 0.86;
    } else if (lowLand) {
      halfW = W * 0.25;
      top = H * 0.3;
      bottom = H * 0.72;
      this.tieY = H * 0.79;
      this.endY = H * 0.87;
    } else {
      halfW = Math.min(W * 0.44, 820) / 2;
      top = H * 0.3;
      bottom = H * 0.7;
      this.tieY = H * 0.79;
      this.endY = H * 0.87;
    }
    this.cx = W / 2;
    this.tieX = W / 2;
    this.sx = halfW;
    // Evita un domo demasiado estirado en vertical (celular vertical): se ancla abajo.
    this.sy = Math.min((bottom - top) / DOME_H, halfW * 1.3);
    this.top = bottom - this.sy * DOME_H;
    this.s = Math.min(this.sx, this.sy);
    this.k = this.s / 300;
    this.bundleW = clamp(this.s * 0.13, 14, 46);
    for (const sl of this.slots) this.layoutSlot(sl);
    for (const sl of this.extras) this.layoutSlot(sl);
    for (const sp of this.base) this.layoutSprig(sp);
    this.ribbon.resize(this.bundleW, world.dpr);
    clearFlowerCache();
  }

  private mapX(u: number): number {
    return this.cx + u * this.sx;
  }
  private mapY(v: number): number {
    return this.top + v * this.sy;
  }

  private setCurve(c: Curve, off: number, hx: number, hy: number, bend: number): void {
    c.x0 = this.tieX + off * this.bundleW * 0.42;
    c.y0 = this.tieY;
    const dy = this.tieY - hy;
    c.bx1 = c.x0 + (hx - c.x0) * 0.04;
    c.by1 = this.tieY - dy * 0.38;
    c.bx2 = hx - (hx - c.x0) * 0.22 + bend * this.sx * 0.35;
    c.by2 = hy + dy * 0.34;
    c.bx3 = hx;
    c.by3 = hy;
  }

  private layoutSlot(sl: Slot): void {
    const d = sl.def;
    const hx = this.mapX(d.u);
    const hy = this.mapY(d.v);
    this.setCurve(sl.curve, d.off, hx, hy, d.bend);
    sl.rPx = d.r * this.s;
    sl.spec.radius = sl.rPx;
    sl.anchor.radius = sl.rPx;
    sl.stemW = Math.max(1.3, (1.5 + d.r * 15) * this.k);
    sl.endX = sl.curve.x0 + d.off * this.bundleW * 0.32;
    sl.endY = this.endY - Math.abs(d.off) * this.bundleW * 0.25 - ((d.seed % 7) / 7) * this.bundleW * 0.2;
    if (sl.sprig) this.layoutSprig(sl.sprig);
  }

  private layoutSprig(sp: Sprig): void {
    const d = sp.def;
    this.setCurve(sp.curve, d.off, this.mapX(d.u), this.mapY(d.v), d.bend);
  }

  private rebuildRows(): void {
    for (const r of this.rows) r.length = 0;
    for (const sl of this.extras) this.rows[sl.def.row]!.push(sl);
    for (const sl of this.slots) this.rows[sl.def.row]!.push(sl);
    for (const r of this.rows) r.sort((a, b) => a.def.v - b.def.v);
  }

  /* ---------------------------------------------------------------- */
  /* Activación                                                        */
  /* ---------------------------------------------------------------- */

  private activate(sl: Slot, time: number, grow: number, open: number, world: World): void {
    if (sl.active) return;
    sl.active = true;
    sl.start = time;
    sl.growDur = grow;
    sl.openDur = open;
    if (sl.sprig) sl.sprig.start = time + sl.sprig.def.delay;
    if (!sl.extra) world.bouquet.count++;
    world.events.emit('flowerAdded', {
      x: sl.curve.bx3,
      y: sl.curve.by3,
      count: world.bouquet.count,
      total: world.bouquet.total,
    });
  }

  private onTap(x: number, y: number, world: World): void {
    const t = world.time;
    if (this.completeAt !== null) {
      this.addExtra(x, y, world);
      return;
    }
    let best: Slot | null = null;
    let bestD = Infinity;
    for (let pass = 0; pass < 2 && !best; pass++) {
      for (let i = 0; i < this.slots.length; i++) {
        const sl = this.slots[i]!;
        if (sl.active || (pass === 0 && i < this.seeds)) continue;
        const d = Math.hypot(sl.curve.bx3 - x, sl.curve.by3 - y);
        if (d < bestD - 0.5) {
          bestD = d;
          best = sl;
        }
      }
    }
    if (!best) return;
    this.activate(best, t, 1.3, 1.1, world);
    this.nextAuto = t + B.autoAfter;
  }

  private addExtra(x: number, y: number, world: World): void {
    const rng = this.rng;
    const kinds: FlowerKind[] = ['daisy', 'cosmos', 'tulip', 'blossom'];
    const kind = rng.pick(kinds);
    const r =
      kind === 'daisy' || kind === 'cosmos' ? rng.float(0.09, 0.12) : kind === 'tulip' ? rng.float(0.07, 0.09) : rng.float(0.055, 0.075);
    const tu = (x - this.cx) / this.sx;
    const tv = (y - this.top) / this.sy;
    let th = Math.atan2((tv - DOME_CY) / DOME_RY, tu);
    if (Math.sin(th) > 0.25) th = Math.cos(th) >= 0 ? Math.asin(0.25) : Math.PI - Math.asin(0.25);
    th += rng.float(-0.12, 0.12);
    const u = clamp(Math.cos(th) * (1 - r) * 0.98, -1 + r, 1 - r);
    const v = clamp(DOME_CY + Math.sin(th) * (DOME_RY - r * 0.6) * 1.02, r * 0.7, DOME_H);
    const leaves: LeafDef[] = [{ t: rng.float(0.4, 0.65), side: rng.sign(), len: rng.float(0.07, 0.1), ang: rng.float(0.5, 0.8) }];
    const def: SlotDef = {
      u,
      v,
      r,
      kind,
      hero: false,
      depth: 0.15,
      row: 0 as Row,
      facing: rng.float(0.62, 0.8),
      lean: u * 0.4,
      off: clamp(u * 0.8, -1, 1),
      bend: rng.float(-0.1, 0.1),
      leaves,
      sprig: null,
      seed: rng.int(1, 1e9),
    };
    const sl = new Slot(def, this.nextId++, true, rng.float(0, 6.28));
    this.layoutSlot(sl);
    this.extras.push(sl);
    // Las más viejas se despiden con gracia.
    let alive = 0;
    for (const e of this.extras) if (e.dieAt < 0) alive++;
    for (const e of this.extras) {
      if (alive <= B.maxExtra) break;
      if (e.dieAt < 0) {
        e.dieAt = world.time;
        alive--;
      }
    }
    while (this.extras.length > MAX_EXTRA_ALIVE) this.extras.shift();
    this.rebuildRows();
    this.activate(sl, world.time, 1.3, 1.1, world);
  }

  /* ---------------------------------------------------------------- */
  /* Actualización                                                     */
  /* ---------------------------------------------------------------- */

  update(dt: number, world: World): void {
    const t = world.time;
    const n = this.slots.length;

    // Semillas, modo ?ramo y relleno automático (deterministas).
    for (let i = 0; i < n; i++) {
      const sl = this.slots[i]!;
      if (sl.active) continue;
      if (i < this.seeds) {
        const at = TL.stemsStart + i * SEED_STAGGER;
        if (t >= at) this.activate(sl, at, 2.6, 1.7, world);
      } else if (DEBUG.ramo) {
        const at = TL.stemsStart + (TL.stemsSpread * i) / Math.max(1, n - 1);
        if (t >= at) this.activate(sl, at, 2.4, 1.6, world);
      }
    }
    if (!DEBUG.ramo && B.autoFill) {
      while (t >= this.nextAuto) {
        const free = this.slots.find((s) => !s.active);
        if (!free) {
          this.nextAuto = Infinity;
          break;
        }
        this.activate(free, this.nextAuto, 2, 1.4, world);
        this.nextAuto += B.autoEvery;
      }
    }

    // Balanceo conjunto alrededor del lazo.
    const reduced = world.reducedMotion;
    const motion = reduced ? 0.3 : 1;
    const domeY = this.mapY(DOME_CY);
    this.sway = (world.wind(this.cx, domeY) * 0.022 + Math.sin(t * 0.37) * 0.01) * motion;
    this.cosA = Math.cos(this.sway);
    this.sinA = Math.sin(this.sway);

    world.flowers.length = 0;
    let allBloomed = n > 0;
    const heightRange = Math.max(1, this.tieY - this.top);
    const amp = 9 * this.k * motion;

    const upd = (sl: Slot) => {
      const c = sl.curve;
      if (!sl.active) {
        sl.grow = 0;
        sl.open = 0;
        return;
      }
      sl.grow = ease.inOutSine(progress(t, sl.start, sl.growDur));
      sl.open = ease.inOutSine(progress(t, sl.start + sl.growDur, sl.openDur));
      sl.vis = sl.dieAt >= 0 ? 1 - ease.inOutSine(progress(t, sl.dieAt, DIE_TIME)) : 1;
      // Resorte amortiguado: la cabeza sigue al viento con retraso.
      const lenF = clamp01((this.tieY - c.by3) / heightRange);
      const target = world.wind(c.bx3, c.by3) * amp * lenF;
      if (dt > 0) {
        const acc = 16 * (target - sl.springX) - 4.5 * sl.springV;
        sl.springV += acc * dt;
        sl.springX += sl.springV * dt;
      }
      const idle = Math.sin(t * 1.1 + sl.def.seed) * 1.2 * this.k * motion;
      const ox = sl.springX + idle;
      this.rot(c.bx1, c.by1, 0.35, c, 1);
      this.rot(c.bx2, c.by2, 0.75, c, 2);
      this.rot(c.bx3, c.by3, 1, c, 3);
      c.x2 += ox * 0.45;
      c.x3 += ox;
      c.y3 += Math.abs(ox) * 0.08;
      const g = Math.max(0.001, sl.grow);
      sl.hx = c.px(g);
      sl.hy = c.py(g);
      let ang = Math.atan2(c.tx(g), -c.ty(g));
      ang += sl.def.lean * smoothstep(0.6, 1, sl.grow);
      if (sl.def.kind === 'sunflower') ang += Math.sin(t * 0.6 + sl.def.seed * 0.1) * 0.05 * motion;
      sl.ang = ang;

      if (sl.open >= 1 && !sl.bloomed) {
        sl.bloomed = true;
        world.events.emit('bloom', { x: sl.hx, y: sl.hy, radius: sl.rPx, kind: sl.def.kind });
      }
      if (sl.grow > 0.02 && sl.vis > 0.01) {
        const a = sl.anchor;
        a.x = sl.hx;
        a.y = sl.hy;
        a.open = sl.open;
        a.angle = ang;
        a.radius = sl.rPx * sl.vis;
        world.flowers.push(a);
      }
    };
    for (const sl of this.slots) {
      upd(sl);
      if (!sl.bloomed) allBloomed = false;
    }
    for (let i = this.extras.length - 1; i >= 0; i--) {
      const sl = this.extras[i]!;
      upd(sl);
      if (sl.dieAt >= 0 && t > sl.dieAt + DIE_TIME) {
        this.extras.splice(i, 1);
        this.rebuildRows();
      }
    }
    const sprigUpd = (sp: Sprig, depthF: number) => {
      const c = sp.curve;
      sp.grow = sp.start === Infinity ? 0 : ease.inOutSine(progress(t, sp.start, 2.2));
      if (sp.grow <= 0) return;
      this.rot(c.bx1, c.by1, 0.35, c, 1);
      this.rot(c.bx2, c.by2, 0.75, c, 2);
      this.rot(c.bx3, c.by3, 1, c, 3);
      const w = world.wind(c.bx3, c.by3) * 6 * this.k * motion * depthF + Math.sin(t * 0.9 + sp.phase) * 1.5 * this.k * motion;
      c.x2 += w * 0.5;
      c.x3 += w;
    };
    for (const sp of this.base) sprigUpd(sp, 1);
    for (const sl of this.slots) if (sl.sprig) sprigUpd(sl.sprig, 1);
    for (const sl of this.extras) if (sl.sprig) sprigUpd(sl.sprig, 1);

    if (this.completeAt === null && allBloomed) {
      this.completeAt = t;
      world.bouquet.completeAt = t;
      this.nextAuto = Infinity;
      world.events.emit('bouquetComplete', { x: this.cx, y: domeY });
    }
  }

  /** Rota un punto base alrededor del lazo (fracción del balanceo global) y lo guarda en la curva. */
  private rot(x: number, y: number, f: number, c: Curve, idx: 1 | 2 | 3): void {
    const a = this.sway * f;
    const cs = f === 1 ? this.cosA : Math.cos(a);
    const sn = f === 1 ? this.sinA : Math.sin(a);
    const dx = x - this.tieX;
    const dy = y - this.tieY;
    const nx = this.tieX + dx * cs - dy * sn;
    const ny = this.tieY + dx * sn + dy * cs;
    if (idx === 1) {
      c.x1 = nx;
      c.y1 = ny;
    } else if (idx === 2) {
      c.x2 = nx;
      c.y2 = ny;
    } else {
      c.x3 = nx;
      c.y3 = ny;
    }
  }

  /* ---------------------------------------------------------------- */
  /* Dibujo                                                            */
  /* ---------------------------------------------------------------- */

  draw(g: CanvasRenderingContext2D, world: World): void {
    const t = world.time;
    const dpr = world.dpr;
    const count = world.bouquet.count;
    const total = Math.max(1, world.bouquet.total);
    const ribbonIn = progress(t, TL.ribbon, 0.8);
    if (ribbonIn <= 0) return;

    // Luz cálida detrás del ramo.
    const domeY = this.mapY(DOME_CY);
    const frac = count / total;
    const pulse = this.completeAt !== null ? Math.exp(-(t - this.completeAt) * 1.1) * 0.35 : 0;
    const breathe = 1 + Math.sin(t * 0.8) * 0.04;
    g.globalCompositeOperation = 'lighter';
    const gs = glowSprite(P.warmGlow, 0.35, 256);
    const gr = this.sx * 1.45 * breathe * (1 + pulse * 0.3);
    g.globalAlpha = (0.05 + 0.13 * frac + pulse) * ribbonIn;
    g.drawImage(gs, this.cx - gr, domeY - gr * 0.85, gr * 2, gr * 1.7);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';

    // Follaje del fondo.
    const sprites = leafSprites();
    for (const sp of this.base) this.drawSprig(g, sp, dpr, sprites);
    for (const sl of this.slots) if (sl.sprig) this.drawSprig(g, sl.sprig, dpr, sprites);

    // Filas: atrás → medio → frente.
    for (let r = 0; r < 3; r++) {
      const row = this.rows[r]!;
      const dim = r === 0 ? 0.72 : r === 1 ? 0.88 : 1;
      for (const sl of row) if (sl.active && sl.grow > 0) this.drawStem(g, sl, dim, dpr, sprites);
      for (const sl of row) if (sl.active && sl.grow > 0) this.drawHead(g, sl, t, dpr);
    }

    // Manojo bajo el lazo y listón.
    this.drawLower(g, t);
    const tailIn = ease.outCubic(progress(t, TL.ribbon + 0.1, 1.4));
    const tailLen = (this.endY - this.tieY) * 1.05 + this.bundleW * 0.5;
    const windR = world.wind(this.tieX, this.tieY) * (world.reducedMotion ? 0.3 : 1);
    const ky = this.tieY + this.ribbon.wrapHeight * 0.05;
    g.globalAlpha = ribbonIn;
    if (tailIn > 0) this.ribbon.drawTails(g, this.tieX, ky, tailLen * tailIn, t, windR, world.reducedMotion ? 0.3 : 1);
    this.ribbon.drawWrap(g, this.tieX, this.tieY, ribbonIn);
    let bowOpen = 0;
    let shimmer = -1;
    if (this.completeAt !== null) {
      const since = t - this.completeAt;
      bowOpen = ease.outBack(progress(since, 0, 1));
      const cyc = since - 1.1;
      if (cyc > 0) shimmer = (cyc % 4.5) / 1.3;
    }
    this.ribbon.drawGlint(g, this.tieX, ky, (0.05 + 0.08 * frac + pulse * 0.5) * ribbonIn);
    g.globalAlpha = ribbonIn;
    this.ribbon.drawBow(g, this.tieX, ky, bowOpen, Math.sin(t * 0.8) * 0.03 + this.sway * 0.5, shimmer);
    g.globalAlpha = 1;
  }

  private drawStem(
    g: CanvasRenderingContext2D,
    sl: Slot,
    dim: number,
    dpr: number,
    sprites: ReturnType<typeof leafSprites>,
  ): void {
    const c = sl.curve;
    const gEnd = sl.grow;
    const { lx, ly, rx, ry } = this;
    const w0 = sl.stemW;
    for (let i = 0; i <= STEM_SEGS; i++) {
      const tt = (gEnd * i) / STEM_SEGS;
      const x = c.px(tt);
      const y = c.py(tt);
      let tx = c.tx(tt);
      let ty = c.ty(tt);
      const tl = Math.hypot(tx, ty) || 1;
      tx /= tl;
      ty /= tl;
      const half = (w0 * (1 - 0.42 * tt) * (i === STEM_SEGS && gEnd < 1 ? 0.7 : 1)) / 2;
      lx[i] = x - ty * half;
      ly[i] = y + tx * half;
      rx[i] = x + ty * half;
      ry[i] = y - tx * half;
    }
    g.globalAlpha = dim * sl.vis;
    g.fillStyle = P.stem;
    g.beginPath();
    g.moveTo(lx[0]!, ly[0]!);
    for (let i = 1; i <= STEM_SEGS; i++) g.lineTo(lx[i]!, ly[i]!);
    for (let i = STEM_SEGS; i >= 0; i--) g.lineTo(rx[i]!, ry[i]!);
    g.closePath();
    g.fill();
    // Sombra en un lado y brillo en el otro.
    g.strokeStyle = P.stemDark;
    g.lineWidth = Math.max(0.6, w0 * 0.3);
    g.beginPath();
    g.moveTo(rx[0]!, ry[0]!);
    for (let i = 1; i <= STEM_SEGS; i++) g.lineTo(rx[i]!, ry[i]!);
    g.stroke();
    g.globalAlpha = dim * sl.vis * 0.5;
    g.strokeStyle = P.stemLight;
    g.lineWidth = Math.max(0.5, w0 * 0.22);
    g.beginPath();
    for (let i = 0; i <= STEM_SEGS; i++) {
      const x = lx[i]! * 0.7 + rx[i]! * 0.3;
      const y = ly[i]! * 0.7 + ry[i]! * 0.3;
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();

    // Hojas que se despliegan al pasar la punta.
    g.globalAlpha = dim * sl.vis;
    const leaves = sl.def.leaves;
    for (let i = 0; i < leaves.length; i++) {
      const lf = leaves[i]!;
      if (gEnd <= lf.t) continue;
      const e = clamp01((gEnd - lf.t) / 0.22);
      const sc = ease.outBack(e);
      const x = c.px(lf.t);
      const y = c.py(lf.t);
      const base = Math.atan2(c.ty(lf.t), c.tx(lf.t));
      const ang = base + lf.side * lf.ang * (0.4 + 0.6 * e);
      drawLeaf(g, sprites.leaf, x, y, ang, lf.len * this.s * sc, dpr);
    }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.globalAlpha = 1;
  }

  private drawHead(g: CanvasRenderingContext2D, sl: Slot, t: number, dpr: number): void {
    const bud = smoothstep(0.05, 0.45, sl.grow);
    const sc = bud * sl.vis;
    if (sc <= 0.01) return;
    g.save();
    g.translate(sl.hx, sl.hy);
    g.rotate(sl.ang);
    if (sc < 0.999) g.scale(sc, sc);
    drawFlowerGlow(g, sl.spec, sl.open, t);
    drawFlowerHead(g, sl.spec, sl.open, t, dpr);
    g.restore();
  }

  private drawSprig(g: CanvasRenderingContext2D, sp: Sprig, dpr: number, sprites: ReturnType<typeof leafSprites>): void {
    const gEnd = sp.grow;
    if (gEnd <= 0) return;
    const c = sp.curve;
    const d = sp.def;
    const size = d.size * this.s;
    g.globalAlpha = 0.85;
    if (d.type === 'blade') {
      // Hoja larga y delgada: polígono afilado.
      const { lx, ly, rx, ry } = this;
      const wMax = Math.max(2, size * 0.28);
      for (let i = 0; i <= STEM_SEGS; i++) {
        const tt = (gEnd * i) / STEM_SEGS;
        let tx = c.tx(tt);
        let ty = c.ty(tt);
        const tl = Math.hypot(tx, ty) || 1;
        tx /= tl;
        ty /= tl;
        const prof = tt < 0.3 ? 0.35 + (tt / 0.3) * 0.65 : 1 - ((tt - 0.3) / 0.7) ** 1.4;
        const half = (wMax * Math.max(0.04, prof) * (i === STEM_SEGS ? 0.2 : 1)) / 2;
        const x = c.px(tt);
        const y = c.py(tt);
        lx[i] = x - ty * half;
        ly[i] = y + tx * half;
        rx[i] = x + ty * half;
        ry[i] = y - tx * half;
      }
      g.fillStyle = P.leaf;
      g.beginPath();
      g.moveTo(lx[0]!, ly[0]!);
      for (let i = 1; i <= STEM_SEGS; i++) g.lineTo(lx[i]!, ly[i]!);
      for (let i = STEM_SEGS; i >= 0; i--) g.lineTo(rx[i]!, ry[i]!);
      g.closePath();
      g.fill();
      g.globalAlpha = 0.4;
      g.strokeStyle = P.leafLight;
      g.lineWidth = Math.max(0.5, wMax * 0.18);
      g.beginPath();
      for (let i = 0; i <= STEM_SEGS; i++) {
        const x = lx[i]! * 0.75 + rx[i]! * 0.25;
        const y = ly[i]! * 0.75 + ry[i]! * 0.25;
        if (i === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.stroke();
      g.globalAlpha = 1;
      return;
    }
    // Tallito fino.
    g.strokeStyle = d.type === 'euca' ? '#44685a' : P.stem;
    g.lineWidth = Math.max(0.8, 1.6 * this.k);
    g.beginPath();
    g.moveTo(c.px(0), c.py(0));
    for (let i = 1; i <= SPRIG_SEGS; i++) {
      const tt = (gEnd * i) / SPRIG_SEGS;
      g.lineTo(c.px(tt), c.py(tt));
    }
    g.stroke();
    const n = d.count;
    const spr = d.type === 'euca' ? sprites.round : sprites.leaflet;
    const t0 = d.type === 'euca' ? 0.4 : 0.3;
    for (let i = 0; i < n; i++) {
      const tt = t0 + ((1 - t0) * i) / n;
      if (gEnd <= tt) break;
      const e = clamp01((gEnd - tt) / 0.12);
      const sc = ease.outBack(e);
      const f = i / n;
      const len = size * sc * (d.type === 'euca' ? 1 - 0.4 * f : 1.3 * (1 - 0.6 * f));
      const x = c.px(tt);
      const y = c.py(tt);
      const base = Math.atan2(c.ty(tt), c.tx(tt));
      const spread = d.type === 'euca' ? 1.15 : 0.95;
      const flip = i % 2 === 0 ? 1 : -1;
      drawLeaf(g, spr, x, y, base + spread * flip, len, dpr);
      drawLeaf(g, spr, x, y, base - spread * flip, len * 0.92, dpr);
    }
    if (gEnd > 0.95) {
      const sc = ease.outBack(clamp01((gEnd - 0.95) / 0.05));
      drawLeaf(g, spr, c.px(gEnd), c.py(gEnd), Math.atan2(c.ty(gEnd), c.tx(gEnd)), size * 0.7 * sc, dpr);
    }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.globalAlpha = 1;
  }

  /** Tallos bajo el lazo: se abren un poco y terminan en cortes verde pálido. */
  private drawLower(g: CanvasRenderingContext2D, t: number): void {
    const y0 = this.tieY - this.ribbon.wrapHeight * 0.3;
    const baseIn = ease.outCubic(progress(t, TL.ribbon, 0.7));
    g.lineCap = 'butt';
    const one = (x0: number, x1: number, y1: number, w: number, grow: number) => {
      if (grow <= 0) return;
      const ex = x0 + (x1 - x0) * grow;
      const ey = y0 + (y1 - y0) * grow;
      g.strokeStyle = P.stemDark;
      g.lineWidth = w;
      g.beginPath();
      g.moveTo(x0, y0);
      g.lineTo(ex, ey);
      g.stroke();
      g.strokeStyle = P.stem;
      g.lineWidth = w * 0.5;
      g.beginPath();
      g.moveTo(x0 - w * 0.12, y0);
      g.lineTo(ex - w * 0.12, ey);
      g.stroke();
      if (grow > 0.9) {
        g.fillStyle = '#c9e39a';
        g.beginPath();
        g.ellipse(ex, ey, w * 0.5, w * 0.22, 0, 0, Math.PI * 2);
        g.fill();
      }
    };
    for (const sp of this.base) {
      const x0 = sp.curve.x0;
      one(x0, x0 + sp.def.off * this.bundleW * 0.3, this.endY - Math.abs(sp.def.off) * this.bundleW * 0.3, Math.max(1.2, 2.2 * this.k), baseIn);
    }
    for (const sl of this.slots) {
      if (!sl.active) continue;
      one(sl.curve.x0, sl.endX, sl.endY, sl.stemW * 0.95, ease.outCubic(progress(t, sl.start, 0.5)));
    }
  }
}
