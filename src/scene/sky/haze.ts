import { createCanvas } from '../../core/sprites';
import { Random, clamp01, smoothstep } from '../../core/math';
import type { World } from '../../core/types';
import { bouquetDim, isPortrait } from './layout';

type Noise2D = (x: number, y: number) => number;

/**
 * Fondo estático del cielo: un tinte índigo casi imperceptible arriba y una
 * vía láctea diagonal hecha con ruido. Se pre-renderiza al cambiar de tamaño
 * y cada frame se dibuja con un solo drawImage.
 */
export class Haze {
  private canvas: HTMLCanvasElement | null = null;
  private noise: Noise2D = () => 0;
  private detail: Noise2D = () => 0;
  private ready = false;
  /** Semilla fija para las motas de polvo estelar (misma composición tras resize). */
  private speckSeed = 1;

  init(rng: Random): void {
    this.noise = rng.noise2D();
    this.detail = rng.noise2D();
    this.speckSeed = Math.floor(rng.next() * 1e9);
    this.ready = true;
    this.canvas = null;
  }

  /** Recta central de la banda (en coordenadas normalizadas): de abajo-izquierda a arriba-derecha. */
  static bandAt(u: number, portrait: boolean): number {
    return portrait ? 0.34 - u * 0.3 : 0.5 - u * 0.46;
  }

  resize(world: World): void {
    if (!this.ready) return;
    const W = world.width;
    const H = world.height;
    const portrait = isPortrait(W, H);

    // Ruido a baja resolución (barato) que luego se escala con suavizado.
    const k = 4;
    const lw = Math.ceil(W / k);
    const lh = Math.ceil(H / k);
    const low = createCanvas(lw, lh);
    const img = low.g.createImageData(lw, lh);
    const d = img.data;
    const inv = 1 / Math.max(lw, lh);
    for (let j = 0; j < lh; j++) {
      const v = j / lh;
      for (let i = 0; i < lw; i++) {
        const u = i / lw;
        const nx = i * inv;
        const ny = j * inv;
        // Distancia perpendicular aproximada a la banda.
        const band = Haze.bandAt(u, portrait) + this.noise(nx * 1.3, ny * 1.3) * 0.05;
        const off = (v - band) / (portrait ? 0.12 : 0.13);
        const core = Math.exp(-off * off);
        // Nubes: fbm de 4 octavas.
        let f = 0;
        let amp = 0.5;
        let freq = 3;
        for (let o = 0; o < 4; o++) {
          f += this.noise(nx * freq + 11, ny * freq - 7) * amp;
          amp *= 0.5;
          freq *= 2.1;
        }
        f = f * 0.5 + 0.5;
        // Franjas de polvo oscuro que cortan la banda.
        const lane = smoothstep(0.1, 0.75, Math.abs(this.detail(nx * 5 + 3, ny * 5)));
        let a = core * clamp01(f * 1.35 - 0.2) * (0.45 + 0.55 * lane);
        // Se apaga detrás del ramo (las flores ponen su propia luz).
        a *= bouquetDim(u * W, v * H, W, H) ** 2;
        // Tinte índigo muy tenue en la parte superior.
        const top = (1 - smoothstep(0, 0.42, v)) * 0.55;
        const warm = clamp01(f * 1.6 - 0.6);
        const p = (j * lw + i) * 4;
        // Mezcla violeta frío / marfil tibio; valores muy bajos para que el fondo siga siendo negro.
        d[p] = 7 * top + a * (26 + 22 * warm);
        d[p + 1] = 4 * top + a * (20 + 18 * warm);
        d[p + 2] = 18 * top + a * (44 + 6 * warm);
        d[p + 3] = 255;
      }
    }
    low.g.putImageData(img, 0, 0);

    const full = createCanvas(W, H);
    const g = full.g;
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    g.drawImage(low.canvas, 0, 0, W, H);

    // Polvo estelar: motas diminutas concentradas en la banda (gratis por frame).
    const rng = new Random(this.speckSeed);
    const specks = Math.round(900 * clamp01(Math.sqrt((W * H) / (1440 * 900))) + 250);
    for (let s = 0; s < specks; s++) {
      const u = rng.next();
      const v = Haze.bandAt(u, portrait) + rng.gaussian() * (portrait ? 0.06 : 0.07);
      if (v < 0 || v > 1) continue;
      const x = u * W;
      const y = v * H;
      const r = rng.float(0.3, 0.75);
      const a = rng.float(0.08, 0.38) * bouquetDim(x, y, W, H) ** 2;
      const warm = rng.chance(0.5);
      g.fillStyle = warm ? `rgba(255,240,215,${a})` : `rgba(220,225,255,${a})`;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }
    this.canvas = full.canvas;
  }

  draw(g: CanvasRenderingContext2D, world: World, alpha: number): void {
    if (!this.canvas || alpha <= 0) return;
    g.globalAlpha = alpha;
    // 'lighter' sobre el negro del motor: equivale a pintar, sin oscurecer nada.
    g.globalCompositeOperation = 'lighter';
    g.drawImage(this.canvas, 0, 0, world.width, world.height);
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
  }
}
