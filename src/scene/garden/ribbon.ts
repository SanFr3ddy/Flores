import { createCanvas, glowSprite } from '../../core/sprites';
import { clamp01, lerp, mixColor } from '../../core/math';

const SATIN_LIGHT = '#f7e0a0';
const SATIN = '#d8a940';
const SATIN_DARK = '#9c6f1c';
const SHADE_STEPS = 16;
const TAIL_SEGS = 18;

/** Rampa de color del satín: 0 = sombra, 1 = brillo. */
const SHADES: string[] = [];
for (let i = 0; i < SHADE_STEPS; i++) {
  const t = i / (SHADE_STEPS - 1);
  SHADES.push(t < 0.6 ? mixColor(SATIN_DARK, SATIN, t / 0.6) : mixColor(SATIN, SATIN_LIGHT, (t - 0.6) / 0.4));
}
const shade = (t: number): string => SHADES[Math.round(clamp01(t) * (SHADE_STEPS - 1))]!;

function satinGradient(g: CanvasRenderingContext2D, x0: number, x1: number): CanvasGradient {
  const gr = g.createLinearGradient(x0, 0, x1, 0);
  gr.addColorStop(0, SATIN_DARK);
  gr.addColorStop(0.18, SATIN);
  gr.addColorStop(0.4, SATIN_LIGHT);
  gr.addColorStop(0.55, '#ecc868');
  gr.addColorStop(0.8, SATIN);
  gr.addColorStop(1, SATIN_DARK);
  return gr;
}

/**
 * Listón de satín dorado: envoltura del manojo, dos colas que se mecen con el viento
 * y el moño (dos lazadas) que se abre al completar el ramo. Las partes fijas se pre-renderizan.
 */
export class Ribbon {
  private wrap: HTMLCanvasElement | null = null;
  private bow: HTMLCanvasElement | null = null;
  private knot: HTMLCanvasElement | null = null;
  private shine: { canvas: HTMLCanvasElement; g: CanvasRenderingContext2D } | null = null;
  private shineGrad: CanvasGradient | null = null;
  private dpr = 1;
  /** Ancho del manojo en px CSS. */
  private bw = 20;
  private wrapW = 36;
  private wrapH = 18;
  private bowW = 80;
  private bowH = 50;
  private knotW = 12;
  private knotH = 14;
  // Puntos de las colas (reutilizados).
  private readonly lx = new Float32Array(TAIL_SEGS + 1);
  private readonly ly = new Float32Array(TAIL_SEGS + 1);
  private readonly rx = new Float32Array(TAIL_SEGS + 1);
  private readonly ry = new Float32Array(TAIL_SEGS + 1);
  private readonly sh = new Float32Array(TAIL_SEGS + 1);

  resize(bundleW: number, dpr: number): void {
    this.dpr = dpr;
    this.bw = bundleW;
    this.wrapW = bundleW * 1.75;
    this.wrapH = bundleW * 0.95;
    this.bowW = bundleW * 4.4;
    this.bowH = bundleW * 2.3;
    this.knotW = bundleW * 0.62;
    this.knotH = bundleW * 0.78;
    this.wrap = this.renderWrap();
    this.bow = this.renderBow();
    this.knot = this.renderKnot();
    const sw = Math.ceil(this.bowW * dpr);
    const shh = Math.ceil(this.bowH * dpr);
    this.shine = createCanvas(sw, shh);
    const gr = this.shine.g.createLinearGradient(-sw * 0.25, 0, sw * 0.25, 0);
    gr.addColorStop(0, 'rgba(255,248,220,0)');
    gr.addColorStop(0.5, 'rgba(255,248,220,0.85)');
    gr.addColorStop(1, 'rgba(255,248,220,0)');
    this.shineGrad = gr;
  }

  private renderWrap(): HTMLCanvasElement {
    const d = this.dpr;
    const W = this.wrapW;
    const H = this.wrapH;
    const pad = 2;
    const { canvas, g } = createCanvas((W + pad * 2) * d, (H * 1.5 + pad * 2) * d);
    g.scale(d, d);
    g.translate(pad + W / 2, pad + H * 0.75);
    const c = H * 0.18; // curvatura (el listón rodea un cilindro)
    const band = (y0: number, y1: number, w: number) => {
      const p = new Path2D();
      p.moveTo(-w / 2, y0);
      p.quadraticCurveTo(0, y0 + c * 2, w / 2, y0);
      p.lineTo(w / 2, y1);
      p.quadraticCurveTo(0, y1 + c * 2, -w / 2, y1);
      p.closePath();
      return p;
    };
    const main = band(-H / 2, H / 2, W);
    g.fillStyle = satinGradient(g, -W / 2, W / 2);
    g.fill(main);
    // Vueltas del listón: bandas diagonales más oscuras.
    g.save();
    g.clip(main);
    g.strokeStyle = 'rgba(110,70,15,0.28)';
    g.lineWidth = Math.max(0.8, H * 0.05);
    for (let i = -2; i <= 2; i++) {
      g.beginPath();
      g.moveTo(-W / 2 + i * W * 0.28, H * 0.7);
      g.lineTo(-W / 2 + i * W * 0.28 + W * 0.45, -H * 0.7);
      g.stroke();
    }
    // Brillo del borde superior.
    g.strokeStyle = 'rgba(255,245,210,0.7)';
    g.lineWidth = Math.max(0.8, H * 0.07);
    g.beginPath();
    g.moveTo(-W / 2, -H / 2 + H * 0.08);
    g.quadraticCurveTo(0, -H / 2 + c * 2 + H * 0.08, W / 2, -H / 2 + H * 0.08);
    g.stroke();
    g.restore();
    return canvas;
  }

  private renderBow(): HTMLCanvasElement {
    const d = this.dpr;
    const W = this.bowW;
    const H = this.bowH;
    const { canvas, g } = createCanvas(W * d, H * d);
    g.scale(d, d);
    g.translate(W / 2, H / 2);
    const L = W * 0.47;
    for (const side of [-1, 1] as const) {
      const loop = new Path2D();
      loop.moveTo(0, 0);
      loop.bezierCurveTo(side * L * 0.35, -H * 0.62, side * L * 1.02, -H * 0.5, side * L * 0.98, -H * 0.02);
      loop.bezierCurveTo(side * L * 0.95, H * 0.3, side * L * 0.45, H * 0.2, 0, 0);
      const gr = g.createLinearGradient(0, -H * 0.4, side * L, H * 0.25);
      gr.addColorStop(0, SATIN_DARK);
      gr.addColorStop(0.3, SATIN);
      gr.addColorStop(0.5, '#efcf7c');
      gr.addColorStop(0.75, SATIN);
      gr.addColorStop(1, SATIN_DARK);
      g.fillStyle = gr;
      g.fill(loop);
      // Hueco interior de la lazada (sombra) para dar volumen.
      g.save();
      g.clip(loop);
      const hole = g.createRadialGradient(side * L * 0.55, -H * 0.05, 0, side * L * 0.55, -H * 0.05, L * 0.42);
      hole.addColorStop(0, 'rgba(70,40,5,0.75)');
      hole.addColorStop(0.6, 'rgba(90,55,10,0.35)');
      hole.addColorStop(1, 'rgba(90,55,10,0)');
      g.fillStyle = hole;
      g.beginPath();
      g.ellipse(side * L * 0.6, -H * 0.02, L * 0.34, H * 0.2, side * 0.25, 0, Math.PI * 2);
      g.fill();
      g.restore();
      // Reflejo del satín a lo largo del borde superior.
      g.strokeStyle = 'rgba(255,248,220,0.75)';
      g.lineWidth = Math.max(0.8, H * 0.035);
      g.beginPath();
      g.moveTo(side * L * 0.1, -H * 0.12);
      g.bezierCurveTo(side * L * 0.38, -H * 0.5, side * L * 0.85, -H * 0.4, side * L * 0.92, -H * 0.1);
      g.stroke();
      g.strokeStyle = 'rgba(110,70,15,0.5)';
      g.lineWidth = Math.max(0.6, H * 0.02);
      g.stroke(loop);
    }
    return canvas;
  }

  private renderKnot(): HTMLCanvasElement {
    const d = this.dpr;
    const W = this.knotW;
    const H = this.knotH;
    const { canvas, g } = createCanvas((W + 2) * d, (H + 2) * d);
    g.scale(d, d);
    g.translate(1 + W / 2, 1 + H / 2);
    const p = new Path2D();
    p.roundRect(-W / 2, -H / 2, W, H, W * 0.35);
    g.fillStyle = satinGradient(g, -W / 2, W / 2);
    g.fill(p);
    g.strokeStyle = 'rgba(100,62,12,0.6)';
    g.lineWidth = Math.max(0.6, W * 0.06);
    g.stroke(p);
    g.fillStyle = 'rgba(255,248,220,0.55)';
    g.fillRect(-W * 0.22, -H * 0.36, W * 0.16, H * 0.7);
    return canvas;
  }

  /** Colas del listón: tiras con giro (el satín se ve más angosto y oscuro al voltearse). */
  drawTails(g: CanvasRenderingContext2D, x: number, y: number, len: number, time: number, wind: number, amp: number): void {
    const w = this.bw * 0.46;
    for (const side of [-1, 1] as const) {
      const ex = x + side * len * (side < 0 ? 0.34 : 0.26) + wind * len * 0.12 * amp;
      const ey = y + len * (side < 0 ? 1 : 0.9);
      const cxp = x + side * len * 0.02 + (wind * 0.2 + Math.sin(time * 0.9 + side) * 0.08) * len * amp;
      const cyp = y + len * 0.5;
      const { lx, ly, rx, ry, sh } = this;
      for (let i = 0; i <= TAIL_SEGS; i++) {
        const t = i / TAIL_SEGS;
        const u = 1 - t;
        const px = u * u * x + 2 * u * t * cxp + t * t * ex;
        const py = u * u * y + 2 * u * t * cyp + t * t * ey;
        let tx = 2 * u * (cxp - x) + 2 * t * (ex - cxp);
        let ty = 2 * u * (cyp - y) + 2 * t * (ey - cyp);
        const tl = Math.hypot(tx, ty) || 1;
        tx /= tl;
        ty /= tl;
        const phase = t * 3.1 + time * 0.7 * amp + (side < 0 ? 0.6 : 2.2);
        const cs = Math.cos(phase);
        const half = (w * (0.3 + 0.7 * Math.abs(cs))) / 2;
        lx[i] = px - ty * half;
        ly[i] = py + tx * half;
        rx[i] = px + ty * half;
        ry[i] = py - tx * half;
        sh[i] = 0.2 + 0.8 * (0.5 + 0.5 * cs) * (cs > 0 ? 1 : 0.7);
      }
      for (let i = 0; i < TAIL_SEGS; i++) {
        g.fillStyle = shade((sh[i]! + sh[i + 1]!) / 2);
        g.beginPath();
        g.moveTo(lx[i]!, ly[i]!);
        g.lineTo(rx[i]!, ry[i]!);
        if (i === TAIL_SEGS - 1) {
          // Corte en "cola de golondrina".
          const mx = (lx[i + 1]! + rx[i + 1]!) / 2;
          const my = (ly[i + 1]! + ry[i + 1]!) / 2;
          const bx = (lx[i]! + rx[i]!) / 2;
          const by = (ly[i]! + ry[i]!) / 2;
          g.lineTo(rx[i + 1]!, ry[i + 1]!);
          g.lineTo(lerp(mx, bx, 0.7), lerp(my, by, 0.7));
          g.lineTo(lx[i + 1]!, ly[i + 1]!);
        } else {
          g.lineTo(rx[i + 1]! + (rx[i + 1]! - rx[i]!) * 0.08, ry[i + 1]! + (ry[i + 1]! - ry[i]!) * 0.08);
          g.lineTo(lx[i + 1]! + (lx[i + 1]! - lx[i]!) * 0.08, ly[i + 1]! + (ly[i + 1]! - ly[i]!) * 0.08);
        }
        g.closePath();
        g.fill();
      }
    }
  }

  drawWrap(g: CanvasRenderingContext2D, x: number, y: number, alpha: number): void {
    if (!this.wrap || alpha <= 0) return;
    const d = this.dpr;
    const cw = this.wrap.width / d;
    const ch = this.wrap.height / d;
    g.globalAlpha = alpha;
    g.drawImage(this.wrap, x - cw / 2, y - ch / 2, cw, ch);
    g.globalAlpha = 1;
  }

  /** Moño: `open` 0..~1.1 (outBack), `shimmer` 0..1 posición del destello (o <0 = sin destello). */
  drawBow(g: CanvasRenderingContext2D, x: number, y: number, open: number, sway: number, shimmer: number): void {
    if (!this.bow || !this.knot) return;
    const d = this.dpr;
    if (open > 0.001) {
      const sx = open;
      const sy = 0.35 + 0.65 * Math.min(1.1, open);
      g.save();
      g.translate(x, y);
      g.rotate(sway);
      g.scale(sx, sy);
      g.drawImage(this.bow, -this.bowW / 2, -this.bowH / 2, this.bowW, this.bowH);
      if (shimmer >= 0 && shimmer <= 1 && this.shine && this.shineGrad) {
        const { canvas, g: sg } = this.shine;
        sg.globalCompositeOperation = 'copy';
        sg.drawImage(this.bow, 0, 0);
        sg.globalCompositeOperation = 'source-atop';
        sg.save();
        sg.translate(lerp(-0.3, 1.3, shimmer) * canvas.width, 0);
        sg.fillStyle = this.shineGrad;
        sg.fillRect(-canvas.width * 0.25, 0, canvas.width * 0.5, canvas.height);
        sg.restore();
        g.globalCompositeOperation = 'lighter';
        g.globalAlpha = 0.6;
        g.drawImage(canvas, -this.bowW / 2, -this.bowH / 2, this.bowW, this.bowH);
        g.globalAlpha = 1;
        g.globalCompositeOperation = 'source-over';
      }
      g.restore();
    }
    const kw = this.knot.width / d;
    const kh = this.knot.height / d;
    g.drawImage(this.knot, x - kw / 2, y - kh / 2, kw, kh);
  }

  /** Brillo cálido sobre el nudo. */
  drawGlint(g: CanvasRenderingContext2D, x: number, y: number, alpha: number): void {
    const s = glowSprite('#ffe6a0', 0.3);
    const r = this.bw * 1.6;
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = alpha;
    g.drawImage(s, x - r, y - r, r * 2, r * 2);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
  }

  get wrapHeight(): number {
    return this.wrapH;
  }
}
