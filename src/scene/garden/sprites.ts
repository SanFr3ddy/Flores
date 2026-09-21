import { CONFIG } from '../../config';
import { createCanvas } from '../../core/sprites';

/** Sprite de hoja: la base está en (0, h/2) y la hoja apunta hacia +x. */
export interface LeafSprite {
  canvas: HTMLCanvasElement;
  w: number;
  h: number;
}

const P = CONFIG.palette;
let cache: { leaf: LeafSprite; round: LeafSprite; leaflet: LeafSprite } | null = null;

function makeLeaf(w: number, h: number, dark: string, mid: string, light: string, rib: string, round: boolean): LeafSprite {
  const { canvas, g } = createCanvas(w, h);
  const cy = h / 2;
  const path = new Path2D();
  if (round) {
    // Hoja de eucalipto: peciolo corto + lámina casi redonda.
    const cx = w * 0.6;
    path.moveTo(1, cy);
    path.lineTo(w * 0.2, cy);
    path.ellipse(cx, cy, w * 0.38, h * 0.42, 0, Math.PI, Math.PI * 3);
    path.lineTo(1, cy);
  } else {
    path.moveTo(1, cy);
    path.bezierCurveTo(w * 0.28, cy - h * 0.52, w * 0.72, cy - h * 0.42, w - 1, cy);
    path.bezierCurveTo(w * 0.72, cy + h * 0.4, w * 0.3, cy + h * 0.5, 1, cy);
  }
  const grad = g.createLinearGradient(0, 0, w, 0);
  grad.addColorStop(0, dark);
  grad.addColorStop(0.55, mid);
  grad.addColorStop(1, light);
  g.fillStyle = grad;
  g.fill(path);
  // Mitad inferior en sombra (volumen).
  g.save();
  g.clip(path);
  g.fillStyle = 'rgba(0,0,0,0.28)';
  g.fillRect(0, cy, w, h);
  // Brillo cálido en el borde superior.
  const hi = g.createLinearGradient(0, 0, 0, cy);
  hi.addColorStop(0, 'rgba(255,230,150,0.22)');
  hi.addColorStop(1, 'rgba(255,230,150,0)');
  g.fillStyle = hi;
  g.fillRect(0, 0, w, cy);
  g.restore();
  // Nervadura central.
  g.strokeStyle = rib;
  g.lineWidth = Math.max(1, h * 0.05);
  g.beginPath();
  g.moveTo(2, cy);
  g.quadraticCurveTo(w * 0.5, cy - h * 0.04, w * (round ? 0.85 : 0.93), cy);
  g.stroke();
  return { canvas, w, h };
}

export function leafSprites(): { leaf: LeafSprite; round: LeafSprite; leaflet: LeafSprite } {
  if (!cache) {
    cache = {
      leaf: makeLeaf(160, 56, P.stemDark, P.leaf, P.leafLight, 'rgba(190,235,150,0.45)', false),
      round: makeLeaf(72, 56, '#2f5a4a', '#5f8f78', '#9cc2ab', 'rgba(210,235,215,0.35)', true),
      leaflet: makeLeaf(72, 22, P.stemDark, P.leaf, P.leafLight, 'rgba(190,235,150,0.35)', false),
    };
  }
  return cache;
}

/**
 * Dibuja un sprite de hoja con la base en (x, y), apuntando en `ang`, con largo `len` (px CSS).
 * Usa setTransform directo (sin save/restore); quien llama restablece la transformación.
 */
export function drawLeaf(
  g: CanvasRenderingContext2D,
  s: LeafSprite,
  x: number,
  y: number,
  ang: number,
  len: number,
  dpr: number,
): void {
  if (len <= 0.3) return;
  const sc = (len / s.w) * dpr;
  const c = Math.cos(ang) * sc;
  const sn = Math.sin(ang) * sc;
  g.setTransform(c, sn, -sn, c, x * dpr, y * dpr);
  g.drawImage(s.canvas, 0, -s.h / 2);
}
