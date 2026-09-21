import type { FlowerKind } from '../../core/types';
import { clamp, clamp01, smoothstep, type Random } from '../../core/math';

/*
 * Diseño del ramo en coordenadas canónicas:
 *   u ∈ [-1, 1]  horizontal (incluye el radio de la cabeza),
 *   v ∈ [0, DOME_H] vertical (0 = arriba),
 *   r            radio en las mismas unidades.
 * El jardín las convierte a px en resize(), así el ramo se re-acomoda sin reiniciarse.
 */
export const DOME_CY = 0.6;
export const DOME_RY = 0.6;
export const DOME_H = 1.2;

export type Row = 0 | 1 | 2;
export type SprigType = 'euca' | 'fern' | 'blade';

export interface LeafDef {
  /** Posición a lo largo del tallo 0..1. */
  t: number;
  side: 1 | -1;
  /** Largo canónico. */
  len: number;
  /** Separación respecto del tallo (rad). */
  ang: number;
}

export interface SprigDef {
  type: SprigType;
  /** Punta del ramito (canónico). */
  u: number;
  v: number;
  /** Desplazamiento en el manojo -1..1. */
  off: number;
  bend: number;
  /** Número de hojitas. */
  count: number;
  /** Tamaño de las hojitas (canónico). */
  size: number;
  /** Retraso respecto de su flor (s). */
  delay: number;
}

export interface SlotDef {
  u: number;
  v: number;
  r: number;
  kind: FlowerKind;
  hero: boolean;
  depth: number;
  row: Row;
  facing: number;
  /** Inclinación extra de la cabeza hacia afuera (rad). */
  lean: number;
  off: number;
  bend: number;
  leaves: LeafDef[];
  sprig: SprigDef | null;
  seed: number;
}

/** Distancia elíptica normalizada al centro del domo (1 = borde). */
export function domeDist(u: number, v: number): number {
  return Math.hypot(u, (v - DOME_CY) / DOME_RY);
}

function radiusFor(kind: FlowerKind, rng: Random): number {
  switch (kind) {
    case 'sunflower':
      return rng.float(0.19, 0.235);
    case 'daisy':
      return rng.float(0.1, 0.13);
    case 'cosmos':
      return rng.float(0.095, 0.125);
    case 'tulip':
      return rng.float(0.075, 0.095);
    default:
      return rng.float(0.058, 0.08);
  }
}

/** Mantiene el centro dentro del domo encogido por el radio. */
function constrain(p: { u: number; v: number; r: number }): void {
  const ax = 1 - p.r;
  const ay = DOME_RY - p.r * 0.75;
  const nx = p.u / ax;
  const ny = (p.v - DOME_CY) / ay;
  const e = Math.hypot(nx, ny);
  if (e > 1) {
    p.u /= e;
    p.v = DOME_CY + (p.v - DOME_CY) / e;
  }
  // El fondo del ramo se estrecha hacia el lazo: nada muy abajo en los costados.
  const maxV = DOME_H - p.r * 0.8 - Math.abs(p.u) * 0.25;
  if (p.v > maxV) p.v = maxV;
  if (p.v < p.r * 0.8) p.v = p.r * 0.8;
}

export interface BouquetDesign {
  slots: SlotDef[];
  /** Ramitos de follaje que salen con el listón (no son flores). */
  base: SprigDef[];
}

/** Diseña el ramo completo: N ranuras ordenadas para que cualquier ramo parcial se vea equilibrado. */
export function designBouquet(rng: Random, n: number, seeds: number, phone: boolean): BouquetDesign {
  const heroes = n >= 22 ? 5 : 4;
  const rest = n - heroes;
  const kinds: FlowerKind[] = [];
  const nDaisy = Math.round(rest * 0.3);
  const nCosmos = Math.round(rest * 0.22);
  const nTulip = Math.round(rest * 0.24);
  const nBlossom = rest - nDaisy - nCosmos - nTulip;
  for (let i = 0; i < nDaisy; i++) kinds.push('daisy');
  for (let i = 0; i < nCosmos; i++) kinds.push('cosmos');
  for (let i = 0; i < nTulip; i++) kinds.push('tulip');
  for (let i = 0; i < nBlossom; i++) kinds.push('blossom');

  const boost = phone ? 1.22 : 1;
  type P = { u: number; v: number; r: number; kind: FlowerKind; hero: boolean };
  const pts: P[] = [];

  // Héroes (girasoles): uno al centro, dos a los lados y el resto arriba.
  const heroSpots: readonly (readonly [number, number])[] = [
    [0, 0.6],
    [-0.46, 0.76],
    [0.46, 0.76],
    [-0.3, 0.3],
    [0.3, 0.3],
  ];
  for (let i = 0; i < heroes; i++) {
    const r = (i === 0 ? 0.235 : radiusFor('sunflower', rng)) * boost;
    const spot = heroes === 4 && i === 3 ? ([0.02, 0.24] as const) : heroSpots[i]!;
    pts.push({ u: spot[0] + rng.float(-0.03, 0.03), v: spot[1] + rng.float(-0.03, 0.03), r, kind: 'sunflower', hero: true });
  }
  // Resto: muestreo por rechazo dentro del domo.
  for (const kind of kinds) {
    const r = radiusFor(kind, rng) * boost;
    let u = 0;
    let v = DOME_CY;
    for (let k = 0; k < 40; k++) {
      u = rng.float(-1, 1);
      v = rng.float(0, DOME_H);
      if (domeDist(u, v) < 0.95) break;
    }
    pts.push({ u, v, r, kind, hero: false });
  }
  for (const p of pts) constrain(p);

  // Relajación: separa cabezas (las chicas se mueven más); los héroes casi quietos.
  for (let it = 0; it < 260; it++) {
    const pull = it < 150 ? 0.0015 : 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i]!;
      for (let j = i + 1; j < pts.length; j++) {
        const b = pts[j]!;
        const dx = b.u - a.u;
        const dy = b.v - a.v;
        const d = Math.hypot(dx, dy) || 1e-4;
        const min = (a.r + b.r) * 0.86;
        if (d >= min) continue;
        const push = (min - d) / d;
        let wa = (b.r * b.r) / (a.r * a.r + b.r * b.r);
        let wb = 1 - wa;
        if (a.hero && !b.hero) {
          wa *= 0.3;
          wb = 1 - wa;
        } else if (b.hero && !a.hero) {
          wb *= 0.3;
          wa = 1 - wb;
        }
        a.u -= dx * push * wa * 0.5;
        a.v -= dy * push * wa * 0.5;
        b.u += dx * push * wb * 0.5;
        b.v += dy * push * wb * 0.5;
      }
    }
    for (const p of pts) {
      // Leve gravedad hacia el centro para un domo compacto.
      p.u -= p.u * pull;
      p.v -= (p.v - DOME_CY) * pull;
      constrain(p);
    }
  }

  // Evita vecinos del mismo tipo intercambiando dentro de grupos de tamaño parecido.
  const group = (k: FlowerKind) => (k === 'daisy' || k === 'cosmos' ? 1 : k === 'sunflower' ? 0 : 2);
  const badness = (i: number, kind: FlowerKind): number => {
    let s = 0;
    const a = pts[i]!;
    for (let j = 0; j < pts.length; j++) {
      if (j === i) continue;
      const b = pts[j]!;
      if (b.kind !== kind) continue;
      const d = Math.hypot(b.u - a.u, b.v - a.v);
      if (d < (a.r + b.r) * 1.25) s++;
    }
    return s;
  };
  for (let pass = 0; pass < 4; pass++) {
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const a = pts[i]!;
        const b = pts[j]!;
        if (a.kind === b.kind || group(a.kind) !== group(b.kind) || group(a.kind) === 0) continue;
        const before = badness(i, a.kind) + badness(j, b.kind);
        const after = badness(i, b.kind) + badness(j, a.kind);
        if (after < before) {
          const k = a.kind;
          a.kind = b.kind;
          b.kind = k;
        }
      }
    }
  }

  // Orden: primero los héroes centrales (semillas), luego izquierda/derecha de adentro hacia afuera.
  const centerDist = (p: P) => domeDist(p.u, p.v);
  const heroPts = pts.filter((p) => p.hero).sort((a, b) => centerDist(a) - centerDist(b));
  const seedPts = heroPts.slice(0, seeds);
  const seedOrdered = [seedPts[0]!, ...seedPts.slice(1).sort((a, b) => a.u - b.u)].filter(Boolean);
  const others = pts.filter((p) => !seedOrdered.includes(p)).sort((a, b) => centerDist(a) - centerDist(b));
  const left = others.filter((p) => p.u < 0);
  const right = others.filter((p) => p.u >= 0);
  const ordered: P[] = [...seedOrdered];
  let takeLeft = true;
  while (left.length || right.length) {
    const from = (takeLeft && left.length) || !right.length ? left : right;
    ordered.push(from.shift()!);
    takeLeft = !takeLeft;
  }

  const sprigTypes: SprigType[] = ['euca', 'fern', 'blade'];
  const slots: SlotDef[] = ordered.map((p, idx) => {
    const e = domeDist(p.u, p.v);
    const depth = clamp01((p.v - 0.05) / 1.05);
    const row: Row = p.hero ? 1 : depth < 0.4 ? 0 : depth < 0.74 ? 1 : 2;
    const rim = smoothstep(0.45, 0.95, e);
    const facing = clamp(0.96 - rim * 0.36 - (p.v > 1 ? 0.1 : 0) + rng.float(-0.04, 0.04), 0.55, 1);
    const lean = p.u * 0.45 * rim + rng.float(-0.08, 0.08);
    const nLeaves = p.hero ? 2 : p.kind === 'blossom' ? rng.int(0, 1) : rng.int(1, 2);
    const leaves: LeafDef[] = [];
    let side: 1 | -1 = rng.sign();
    for (let k = 0; k < nLeaves; k++) {
      leaves.push({
        t: rng.float(0.32, 0.7),
        side,
        len: (p.hero ? rng.float(0.12, 0.16) : rng.float(0.075, 0.115)) * boost,
        ang: rng.float(0.45, 0.85),
      });
      side = side === 1 ? -1 : 1;
    }
    let sprig: SprigDef | null = null;
    if (rng.chance(idx < seeds ? 0.9 : 0.5)) {
      const du = p.u;
      const dv = (p.v - DOME_CY) / DOME_RY;
      const dl = Math.hypot(du, dv) || 1;
      const reach = p.r + rng.float(0.05, 0.12);
      const su = clamp(p.u + (du / dl) * reach + rng.float(-0.08, 0.08), -1.02, 1.02);
      const sv = clamp(p.v + (dv / dl) * reach * 0.7 - 0.05, -0.04, DOME_H - 0.25);
      const type = rng.pick(sprigTypes);
      sprig = {
        type,
        u: su,
        v: sv,
        off: clamp(su * 0.6 + rng.float(-0.2, 0.2), -1, 1),
        bend: rng.float(-0.12, 0.12),
        count: type === 'fern' ? rng.int(7, 10) : rng.int(4, 6),
        size: rng.float(0.05, 0.07) * boost,
        delay: rng.float(0.1, 0.35),
      };
    }
    return {
      u: p.u,
      v: p.v,
      r: p.r,
      kind: p.kind,
      hero: p.hero,
      depth,
      row,
      facing,
      lean,
      off: clamp(p.u * 0.7 + rng.float(-0.2, 0.2), -1, 1),
      bend: rng.float(-0.14, 0.14),
      leaves,
      sprig,
      seed: rng.int(1, 1e9),
    };
  });

  // Follaje base (sale con el listón): abanico de ramitos por todo el borde.
  const base: SprigDef[] = [];
  const nb = phone ? 5 : 7;
  for (let i = 0; i < nb; i++) {
    const a = Math.PI * (1.08 + (0.84 * i) / (nb - 1)) + rng.float(-0.05, 0.05);
    const e = rng.float(0.8, 0.98);
    const u = clamp(Math.cos(a) * e, -0.98, 0.98);
    const v = clamp(DOME_CY + Math.sin(a) * e * DOME_RY, 0, DOME_H);
    const type = sprigTypes[i % 3]!;
    base.push({
      type,
      u,
      v,
      off: clamp(u * 0.6, -1, 1),
      bend: rng.float(-0.1, 0.1),
      count: type === 'fern' ? rng.int(8, 11) : rng.int(5, 7),
      size: rng.float(0.055, 0.075) * boost,
      delay: 0.15 + i * 0.12,
    });
  }
  return { slots, base };
}
