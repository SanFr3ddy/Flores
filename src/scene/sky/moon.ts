import { smoothstep, type Random } from '../../core/math';
import { createCanvas, drawGlow, glowSprite } from '../../core/sprites';
import type { World } from '../../core/types';
import { moonLayout } from './layout';

interface Mare {
  x: number;
  y: number;
  r: number;
  a: number;
}

/**
 * Luna creciente pequeña: disco marfil con mares tenues, terminador suave y
 * luz cenicienta en la parte oscura. Se pre-renderiza en resize().
 */
export class Moon {
  x = 0;
  y = 0;
  r = 20;
  private sprite: HTMLCanvasElement | null = null;
  private maria: Mare[] = [];
  private craters: Mare[] = [];
  private phase = 0;

  init(rng: Random): void {
    this.sprite = null;
    // Posiciones de los mares en unidades del radio (se reutilizan en cada resize).
    this.maria = [];
    for (let i = 0; i < 9; i++) {
      const a = rng.float(0, Math.PI * 2);
      const d = Math.sqrt(rng.next()) * 0.7;
      this.maria.push({ x: Math.cos(a) * d, y: Math.sin(a) * d, r: rng.float(0.12, 0.34), a: rng.float(0.05, 0.13) });
    }
    // Cráteres diminutos: textura fina sobre la parte iluminada.
    this.craters = [];
    for (let i = 0; i < 16; i++) {
      const a = rng.float(0, Math.PI * 2);
      const d = Math.sqrt(rng.next()) * 0.85;
      this.craters.push({ x: Math.cos(a) * d, y: Math.sin(a) * d, r: rng.float(0.04, 0.1), a: rng.float(0.05, 0.12) });
    }
    this.phase = rng.float(0, Math.PI * 2);
  }

  resize(world: World): void {
    const lay = moonLayout(world.width, world.height);
    this.r = lay.r;
    this.x = lay.x;
    this.y = lay.y;

    const dpr = world.dpr;
    const R = this.r * dpr;
    const pad = 3 * dpr;
    const size = (R + pad) * 2;
    const { canvas, g } = createCanvas(size, size);
    const c = size / 2;

    // 1) Disco iluminado con oscurecimiento del limbo.
    const body = g.createRadialGradient(c + R * 0.25, c - R * 0.2, 0, c, c, R);
    body.addColorStop(0, '#fffcf0');
    body.addColorStop(0.55, '#fbf0d2');
    body.addColorStop(0.9, '#ecd9a8');
    body.addColorStop(1, '#d8bf8a');
    g.fillStyle = body;
    g.beginPath();
    g.arc(c, c, R, 0, Math.PI * 2);
    g.fill();

    // 2) Mares: manchas grisáceas muy suaves.
    g.globalCompositeOperation = 'source-atop';
    for (const m of this.maria) {
      const mx = c + m.x * R;
      const my = c + m.y * R;
      const mr = m.r * R;
      const grad = g.createRadialGradient(mx, my, 0, mx, my, mr);
      grad.addColorStop(0, `rgba(120,105,80,${m.a})`);
      grad.addColorStop(1, 'rgba(120,105,80,0)');
      g.fillStyle = grad;
      g.fillRect(mx - mr, my - mr, mr * 2, mr * 2);
    }
    // Cráteres: sombra suave con un borde claro del lado de la luz.
    for (const k of this.craters) {
      const kx = c + k.x * R;
      const ky = c + k.y * R;
      const kr = Math.max(0.8, k.r * R);
      g.fillStyle = `rgba(150,132,110,${k.a})`;
      g.beginPath();
      g.arc(kx, ky, kr, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = `rgba(255,250,232,${k.a * 0.9})`;
      g.beginPath();
      g.arc(kx + kr * 0.25, ky + kr * 0.2, kr * 0.75, 0, Math.PI * 2);
      g.fill();
    }

    // 3) Sombra: disco desplazado con borde difuso (terminador suave).
    g.globalCompositeOperation = 'destination-out';
    const sx = c - R * 0.52;
    const sy = c - R * 0.3;
    const shadow = g.createRadialGradient(sx, sy, R * 0.9, sx, sy, R * 1.08);
    shadow.addColorStop(0, 'rgba(0,0,0,1)');
    shadow.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = shadow;
    g.fillRect(0, 0, size, size);

    // 4) Luz cenicienta: el resto del disco apenas visible.
    g.globalCompositeOperation = 'destination-over';
    g.fillStyle = 'rgba(130,132,160,0.08)';
    g.beginPath();
    g.arc(c, c, R * 0.985, 0, Math.PI * 2);
    g.fill();
    g.globalCompositeOperation = 'source-over';

    this.sprite = canvas;
  }

  draw(g: CanvasRenderingContext2D, world: World, ox: number, oy: number): void {
    if (!this.sprite) return;
    const appear = smoothstep(1, 4, world.time);
    if (appear <= 0) return;
    const x = this.x + ox;
    const y = this.y + oy;
    const r = this.r;
    const breathe = world.reducedMotion ? 1 : 1 + 0.05 * Math.sin(world.time * 0.4 + this.phase);

    // El disco tapa las estrellas y la bruma que quedan detrás.
    g.globalAlpha = 0.94 * appear;
    g.fillStyle = '#010103';
    g.beginPath();
    g.arc(x, y, r * 0.99, 0, Math.PI * 2);
    g.fill();
    g.globalAlpha = 1;

    // Halo: dos capas aditivas desplazadas hacia el lado iluminado.
    g.globalCompositeOperation = 'lighter';
    const hx = x + r * 0.3;
    const hy = y + r * 0.15;
    drawGlow(g, glowSprite('#ffe7b8', 0.12, 128), hx, hy, r * 7 * breathe, 0.16 * appear);
    drawGlow(g, glowSprite('#fff1d2', 0.3, 64), hx, hy, r * 2.4, 0.18 * appear);
    g.globalCompositeOperation = 'source-over';

    const s = this.sprite;
    const size = s.width / world.dpr;
    g.globalAlpha = appear;
    g.drawImage(s, x - size / 2, y - size / 2, size, size);
    // Segunda pasada aditiva: el creciente brilla sobre el negro sin quemarse.
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = 0.35 * appear;
    g.drawImage(s, x - size / 2, y - size / 2, size, size);
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
  }
}
