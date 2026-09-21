import { createCanvas } from '../../core/sprites';

/*
 * Sprites pre-renderizados de los efectos (destellos, corazones, pétalos).
 * Se generan una sola vez (perezosamente) a resolución fija y alta; al dibujarlos
 * se escalan con drawImage, que es muchísimo más barato que trazar caminos por frame.
 */

/** Traza un corazón centrado en (0,0) con ancho ≈ 2*s (la punta queda abajo). */
export function heartPath(g: CanvasRenderingContext2D, s: number): void {
  g.beginPath();
  g.moveTo(0, s * 0.95);
  g.bezierCurveTo(-s * 0.25, s * 0.7, -s * 1.02, s * 0.25, -s * 0.98, -s * 0.3);
  g.bezierCurveTo(-s * 0.95, -s * 0.82, -s * 0.35, -s * 1.02, 0, -s * 0.52);
  g.bezierCurveTo(s * 0.35, -s * 1.02, s * 0.95, -s * 0.82, s * 0.98, -s * 0.3);
  g.bezierCurveTo(s * 1.02, s * 0.25, s * 0.25, s * 0.7, 0, s * 0.95);
  g.closePath();
}

export interface HeartTint {
  light: string;
  mid: string;
  deep: string;
  rim: string;
}

export const HEART_GOLD: HeartTint = { light: '#fffbe0', mid: '#ffd84a', deep: '#f0a000', rim: '#fff6c8' };
export const HEART_PEACH: HeartTint = { light: '#fff1e2', mid: '#ffc98f', deep: '#f39a5a', rim: '#ffe9d6' };

const heartCache = new Map<HeartTint, HTMLCanvasElement>();

/** Corazón con degradado dorado y un halo suave. Tamaño del sprite: 128 px (el corazón ocupa ~la mitad central). */
export function heartSprite(tint: HeartTint = HEART_GOLD): HTMLCanvasElement {
  const cached = heartCache.get(tint);
  if (cached) return cached;
  const size = 128;
  const { canvas, g } = createCanvas(size, size);
  const s = size * 0.25;
  g.translate(size / 2, size / 2);

  // Halo difuso (shadowBlur solo aquí, al pre-renderizar).
  g.save();
  g.shadowColor = tint.mid;
  g.shadowBlur = size * 0.16;
  g.fillStyle = tint.mid;
  heartPath(g, s);
  g.fill();
  g.restore();

  // Cuerpo: degradado radial con el brillo arriba a la izquierda.
  const body = g.createRadialGradient(-s * 0.35, -s * 0.45, s * 0.05, 0, 0, s * 1.25);
  body.addColorStop(0, tint.light);
  body.addColorStop(0.45, tint.mid);
  body.addColorStop(1, tint.deep);
  g.fillStyle = body;
  heartPath(g, s);
  g.fill();

  // Contorno interior luminoso, muy fino.
  g.save();
  heartPath(g, s);
  g.clip();
  g.strokeStyle = tint.rim;
  g.globalAlpha = 0.55;
  g.lineWidth = s * 0.09;
  heartPath(g, s * 0.97);
  g.stroke();
  // Reflejo en el lóbulo izquierdo.
  g.globalAlpha = 0.7;
  const hi = g.createRadialGradient(-s * 0.5, -s * 0.5, 0, -s * 0.5, -s * 0.5, s * 0.35);
  hi.addColorStop(0, 'rgba(255,255,255,0.9)');
  hi.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = hi;
  g.fillRect(-s, -s, s, s);
  g.restore();

  heartCache.set(tint, canvas);
  return canvas;
}

/** Proporción del sprite de corazón que ocupa el corazón (para dibujarlo a un ancho dado). */
export const HEART_SPRITE_FILL = 0.5;

let sparkleCanvas: HTMLCanvasElement | null = null;

/** Destello de 4 puntas (blanco dorado) con un núcleo brillante. Sprite de 96 px. */
export function sparkleSprite(): HTMLCanvasElement {
  if (sparkleCanvas) return sparkleCanvas;
  const size = 96;
  const { canvas, g } = createCanvas(size, size);
  const c = size / 2;
  const r = size * 0.48;
  g.translate(c, c);

  // Halo.
  const halo = g.createRadialGradient(0, 0, 0, 0, 0, r * 0.5);
  halo.addColorStop(0, 'rgba(255,205,70,0.85)');
  halo.addColorStop(0.35, 'rgba(255,170,30,0.28)');
  halo.addColorStop(1, 'rgba(255,190,60,0)');
  g.fillStyle = halo;
  g.fillRect(-c, -c, size, size);

  // Estrella de 4 puntas con lados cóncavos.
  const star = (len: number, waist: number) => {
    g.beginPath();
    g.moveTo(0, -len);
    g.quadraticCurveTo(waist, -waist, len, 0);
    g.quadraticCurveTo(waist, waist, 0, len);
    g.quadraticCurveTo(-waist, waist, -len, 0);
    g.quadraticCurveTo(-waist, -waist, 0, -len);
    g.closePath();
  };
  const grad = g.createRadialGradient(0, 0, 0, 0, 0, r);
  grad.addColorStop(0, 'rgba(255,255,240,1)');
  grad.addColorStop(0.12, 'rgba(255,236,150,1)');
  grad.addColorStop(0.45, 'rgba(255,200,50,0.85)');
  grad.addColorStop(0.8, 'rgba(255,170,20,0.4)');
  grad.addColorStop(1, 'rgba(255,190,40,0)');
  g.fillStyle = grad;
  star(r, r * 0.1);
  g.fill();
  // Puntas secundarias en diagonal, más cortas.
  g.rotate(Math.PI / 4);
  g.globalAlpha = 0.6;
  star(r * 0.5, r * 0.09);
  g.fill();

  sparkleCanvas = canvas;
  return canvas;
}

/* ------------------------------------------------------------------ */
/* Pétalos                                                             */
/* ------------------------------------------------------------------ */

export interface PetalSpriteSet {
  front: HTMLCanvasElement;
  back: HTMLCanvasElement;
  /** Relación alto/ancho del pétalo. */
  aspect: number;
}

const PETAL_TINTS: readonly (readonly [string, string, string])[] = [
  // base, medio, punta
  ['#f2a100', '#ffd21f', '#fff27a'],
  ['#e89200', '#ffc21a', '#ffe46a'],
  ['#f5b400', '#ffe04a', '#fff7b0'],
  ['#d98200', '#ffb81c', '#ffd65a'],
];

let petalSets: PetalSpriteSet[] | null = null;

function drawPetal(
  g: CanvasRenderingContext2D,
  w: number,
  h: number,
  shape: number,
  colors: readonly [string, string, string],
  back: boolean,
): void {
  // Pétalo vertical: base abajo (estrecha), punta arriba (redondeada con una muesca leve).
  const hw = w * 0.5;
  const path = () => {
    g.beginPath();
    g.moveTo(0, h * 0.5);
    g.bezierCurveTo(-hw * 0.55, h * 0.3, -hw * (1.02 + shape * 0.1), -h * 0.05, -hw * 0.8, -h * 0.34);
    g.bezierCurveTo(-hw * 0.6, -h * 0.48, -hw * 0.2, -h * 0.5, 0, -h * (0.45 - shape * 0.04));
    g.bezierCurveTo(hw * 0.2, -h * 0.5, hw * 0.6, -h * 0.48, hw * 0.8, -h * 0.34);
    g.bezierCurveTo(hw * (1.02 + shape * 0.1), -h * 0.05, hw * 0.55, h * 0.3, 0, h * 0.5);
    g.closePath();
  };
  const grad = g.createLinearGradient(0, h * 0.5, 0, -h * 0.5);
  grad.addColorStop(0, colors[0]);
  grad.addColorStop(0.45, colors[1]);
  grad.addColorStop(1, colors[2]);
  g.fillStyle = grad;
  path();
  g.fill();

  g.save();
  path();
  g.clip();
  // Oscurece los bordes para dar volumen.
  const edge = g.createRadialGradient(0, -h * 0.05, hw * 0.3, 0, -h * 0.05, hw * 1.3);
  edge.addColorStop(0, 'rgba(120,60,0,0)');
  edge.addColorStop(1, back ? 'rgba(110,55,0,0.55)' : 'rgba(150,75,0,0.35)');
  g.fillStyle = edge;
  g.fillRect(-w, -h, w * 2, h * 2);
  // Nervaduras finas.
  g.strokeStyle = back ? 'rgba(150,80,0,0.35)' : 'rgba(200,110,0,0.28)';
  g.lineWidth = Math.max(1, w * 0.025);
  for (let i = -2; i <= 2; i++) {
    g.beginPath();
    g.moveTo(0, h * 0.48);
    g.quadraticCurveTo(i * hw * 0.25, 0, i * hw * 0.38, -h * 0.4);
    g.stroke();
  }
  // Brillo satinado en el frente.
  if (!back) {
    const sheen = g.createLinearGradient(-hw, 0, hw, 0);
    sheen.addColorStop(0, 'rgba(255,255,230,0)');
    sheen.addColorStop(0.35, 'rgba(255,255,230,0.28)');
    sheen.addColorStop(0.55, 'rgba(255,255,230,0)');
    g.fillStyle = sheen;
    g.fillRect(-w, -h, w * 2, h * 2);
  } else {
    g.fillStyle = 'rgba(90,45,0,0.18)';
    g.fillRect(-w, -h, w * 2, h * 2);
  }
  g.restore();
}

/** Juegos de sprites de pétalo (frente/reverso) en varios tonos y formas. */
export function petalSprites(): PetalSpriteSet[] {
  if (petalSets) return petalSets;
  const sets: PetalSpriteSet[] = [];
  const shapes = [0, 1, 0.5, -0.4];
  for (let i = 0; i < PETAL_TINTS.length; i++) {
    const colors = PETAL_TINTS[i] as readonly [string, string, string];
    const aspect = i % 2 === 0 ? 2.1 : 1.6;
    const w = 44;
    const h = w * aspect;
    const make = (back: boolean) => {
      const { canvas, g } = createCanvas(w + 4, h + 4);
      g.translate((w + 4) / 2, (h + 4) / 2);
      drawPetal(g, w, h, shapes[i] ?? 0, colors, back);
      return canvas;
    };
    sets.push({ front: make(false), back: make(true), aspect });
  }
  petalSets = sets;
  return sets;
}
