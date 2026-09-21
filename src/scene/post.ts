import { createCanvas } from '../core/sprites';
import type { Layer, World } from '../core/types';

/** Viñeta suave sobre toda la escena (pre-renderizada al cambiar el tamaño). */
export class PostLayer implements Layer {
  readonly name = 'post';
  private vignette: HTMLCanvasElement | null = null;

  init(): void {}

  resize(world: World): void {
    const w = Math.max(1, Math.round(world.width / 4));
    const h = Math.max(1, Math.round(world.height / 4));
    const { canvas, g } = createCanvas(w, h);
    const r = Math.hypot(w, h) / 2;
    const grad = g.createRadialGradient(w / 2, h * 0.55, r * 0.45, w / 2, h * 0.55, r * 1.05);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.55)');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    this.vignette = canvas;
  }

  update(): void {}

  draw(g: CanvasRenderingContext2D, world: World): void {
    if (this.vignette) g.drawImage(this.vignette, 0, 0, world.width, world.height);
  }
}
