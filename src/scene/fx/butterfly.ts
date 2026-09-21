import { createCanvas } from '../../core/sprites';

/*
 * Sprites de mariposa vista desde arriba. Se pre-renderiza el ala DERECHA
 * (anterior + posterior) con la raíz en el borde izquierdo del sprite; el ala
 * izquierda es el mismo sprite reflejado. El aleteo es solo una escala en X.
 * Unidades de diseño: media envergadura = 100.
 */

export interface ButterflyTint {
  root: string;
  mid: string;
  outer: string;
  edge: string;
  vein: string;
  spot: string;
}

export const BUTTERFLY_TINTS: readonly ButterflyTint[] = [
  { root: '#ffe680', mid: '#ffc21f', outer: '#f09400', edge: '#5a2c00', vein: 'rgba(110,52,0,0.5)', spot: '#fff8d8' },
  { root: '#fff8c4', mid: '#ffdc4a', outer: '#f5b000', edge: '#6a3a02', vein: 'rgba(120,64,0,0.45)', spot: '#fffbe6' },
  { root: '#ffe9a8', mid: '#ffb830', outer: '#e07800', edge: '#4a2000', vein: 'rgba(100,40,0,0.5)', spot: '#ffeccc' },
];

export interface ButterflySprite {
  wing: HTMLCanvasElement;
  body: HTMLCanvasElement;
  /** Unidades de diseño → px del sprite. */
  k: number;
  /** Posición de la raíz del ala dentro del sprite (px del sprite). */
  wingOx: number;
  wingOy: number;
  bodyOx: number;
  bodyOy: number;
}

const K = 1.3; // resolución: 1 unidad = 1.3 px de sprite (media envergadura ≈ 130 px)
const cache = new Map<ButterflyTint, ButterflySprite>();

function forewing(g: CanvasRenderingContext2D): void {
  g.beginPath();
  g.moveTo(3, -6);
  g.bezierCurveTo(18, -40, 56, -80, 90, -76);
  g.bezierCurveTo(104, -74, 102, -58, 96, -44);
  g.bezierCurveTo(88, -24, 74, -8, 52, -2);
  g.bezierCurveTo(32, 3, 14, 4, 3, 2);
  g.closePath();
}

function hindwing(g: CanvasRenderingContext2D): void {
  g.beginPath();
  g.moveTo(3, 0);
  g.bezierCurveTo(26, -2, 62, 2, 72, 20);
  g.bezierCurveTo(80, 36, 66, 58, 48, 64);
  g.bezierCurveTo(38, 68, 30, 78, 22, 76);
  g.bezierCurveTo(12, 70, 6, 46, 3, 20);
  g.closePath();
}

function paintWing(g: CanvasRenderingContext2D, tint: ButterflyTint, shape: (g: CanvasRenderingContext2D) => void, tip: [number, number]): void {
  const grad = g.createRadialGradient(0, 0, 4, tip[0] * 0.5, tip[1] * 0.5, 105);
  grad.addColorStop(0, tint.root);
  grad.addColorStop(0.35, tint.mid);
  grad.addColorStop(0.8, tint.outer);
  grad.addColorStop(1, tint.edge);
  g.fillStyle = grad;
  shape(g);
  g.fill();

  g.save();
  shape(g);
  g.clip();
  // Borde oscuro (banda marginal) para dar definición.
  g.strokeStyle = tint.edge;
  g.globalAlpha = 0.85;
  g.lineWidth = 9;
  shape(g);
  g.stroke();
  g.globalAlpha = 1;
  // Nervaduras desde la raíz.
  g.strokeStyle = tint.vein;
  g.lineWidth = 1.3;
  const n = 6;
  for (let i = 0; i < n; i++) {
    const a = Math.atan2(tip[1], tip[0]) + (i - (n - 1) / 2) * 0.28;
    g.beginPath();
    g.moveTo(2, 0);
    g.quadraticCurveTo(Math.cos(a + 0.1) * 45, Math.sin(a + 0.1) * 45, Math.cos(a) * 110, Math.sin(a) * 110);
    g.stroke();
  }
  // Brillo satinado cerca de la raíz.
  const sheen = g.createRadialGradient(10, 0, 0, 10, 0, 40);
  sheen.addColorStop(0, 'rgba(255,255,235,0.45)');
  sheen.addColorStop(1, 'rgba(255,255,235,0)');
  g.fillStyle = sheen;
  g.fillRect(-10, -90, 120, 180);
  g.restore();
}

function spot(g: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, a: number): void {
  g.globalAlpha = a;
  g.fillStyle = color;
  g.beginPath();
  g.ellipse(x, y, r, r * 0.8, 0.4, 0, Math.PI * 2);
  g.fill();
  g.globalAlpha = 1;
}

/** Sprite de mariposa (ala derecha + cuerpo), cacheado por tono. */
export function butterflySprite(tint: ButterflyTint): ButterflySprite {
  const cached = cache.get(tint);
  if (cached) return cached;

  // Ala: x ∈ [-4, 106], y ∈ [-84, 82] en unidades.
  const ww = 112 * K;
  const wh = 170 * K;
  const wingOx = 5 * K;
  const wingOy = 86 * K;
  const { canvas: wing, g } = createCanvas(ww, wh);
  g.translate(wingOx, wingOy);
  g.scale(K, K);
  // El ala posterior va debajo de la anterior.
  paintWing(g, tint, hindwing, [60, 55]);
  paintWing(g, tint, forewing, [92, -70]);
  // Manchas pálidas en la banda marginal del ala anterior y un ocelo en la posterior.
  spot(g, 88, -64, 3.2, tint.spot, 0.9);
  spot(g, 94, -52, 2.6, tint.spot, 0.85);
  spot(g, 92, -40, 2.1, tint.spot, 0.75);
  spot(g, 76, -62, 2.4, tint.spot, 0.6);
  spot(g, 50, 58, 3, tint.spot, 0.55);
  spot(g, 62, 44, 2.2, tint.spot, 0.5);

  // Cuerpo con antenas curvadas (cabeza hacia -y).
  const bw = 40 * K;
  const bh = 130 * K;
  const bodyOx = bw / 2;
  const bodyOy = 70 * K;
  const { canvas: body, g: b } = createCanvas(bw, bh);
  b.translate(bodyOx, bodyOy);
  b.scale(K, K);
  b.strokeStyle = 'rgba(60,32,6,0.95)';
  b.lineWidth = 1.6;
  b.lineCap = 'round';
  for (const s of [-1, 1]) {
    b.beginPath();
    b.moveTo(s * 1.5, -20);
    b.bezierCurveTo(s * 4, -36, s * 12, -48, s * 16, -54);
    b.bezierCurveTo(s * 18, -57, s * 14, -60, s * 12.5, -57);
    b.stroke();
    b.fillStyle = 'rgba(70,38,6,1)';
    b.beginPath();
    b.arc(s * 15.2, -57, 2.2, 0, Math.PI * 2);
    b.fill();
  }
  const bodyGrad = b.createLinearGradient(-5, 0, 5, 0);
  bodyGrad.addColorStop(0, '#1e0f02');
  bodyGrad.addColorStop(0.45, '#5a3510');
  bodyGrad.addColorStop(1, '#1e0f02');
  b.fillStyle = bodyGrad;
  // Tórax, abdomen y cabeza.
  b.beginPath();
  b.ellipse(0, -6, 5, 12, 0, 0, Math.PI * 2);
  b.fill();
  b.beginPath();
  b.ellipse(0, 22, 3.6, 24, 0, 0, Math.PI * 2);
  b.fill();
  b.beginPath();
  b.arc(0, -19, 4.2, 0, Math.PI * 2);
  b.fill();
  // Vello dorado del tórax.
  b.fillStyle = 'rgba(255,210,110,0.35)';
  b.beginPath();
  b.ellipse(-1, -8, 2, 7, 0, 0, Math.PI * 2);
  b.fill();

  const sprite: ButterflySprite = { wing, body, k: K, wingOx, wingOy, bodyOx, bodyOy };
  cache.set(tint, sprite);
  return sprite;
}
