// Galería de cabezas de flor en distintos grados de apertura (solo desarrollo).
// Abrir con: node scripts/shot.mjs --path=dev/flora.html --name=flora
//   ?time=7   varía el tiempo (respiración del brillo)
//   ?big      vista de detalle: cada tipo grande, inclinado, trasero y en miniatura
//   ?seed=N   semilla base
import { drawFlowerGlow, drawFlowerHead, type HeadSpec } from '../src/scene/flowers';
import type { FlowerKind } from '../src/core/types';

const canvas = document.querySelector<HTMLCanvasElement>('#c')!;
const g = canvas.getContext('2d')!;
const dpr = Math.min(2, devicePixelRatio || 1);
const W = innerWidth;
const H = innerHeight;
canvas.width = W * dpr;
canvas.height = H * dpr;
canvas.style.width = `${W}px`;
canvas.style.height = `${H}px`;

const kinds: FlowerKind[] = ['sunflower', 'daisy', 'cosmos', 'tulip', 'blossom'];
const params = new URLSearchParams(location.search);
const time = Number(params.get('time') ?? 3);
const seed0 = Number(params.get('seed') ?? 1234);

g.setTransform(dpr, 0, 0, dpr, 0, 0);
g.fillStyle = '#000';
g.fillRect(0, 0, W, H);

function draw(x: number, y: number, spec: HeadSpec, open: number): void {
  g.save();
  g.translate(x, y);
  drawFlowerGlow(g, spec, open, time);
  drawFlowerHead(g, spec, open, time, dpr);
  g.restore();
}

if (params.has('big')) {
  // Fila 1: grandes de frente. Fila 2: inclinadas (0.55) y traseras. Fila 3: miniaturas.
  const cw = W / kinds.length;
  kinds.forEach((kind, i) => {
    const x = cw * (i + 0.5);
    draw(x, H * 0.24, { kind, radius: Math.min(cw * 0.4, H * 0.19), seed: seed0 + i, depth: 1, facing: 1 }, 1);
    draw(x - cw * 0.22, H * 0.62, { kind, radius: Math.min(cw * 0.18, 60), seed: seed0 + i + 50, depth: 1, facing: 0.55 }, 1);
    draw(x + cw * 0.22, H * 0.62, { kind, radius: Math.min(cw * 0.18, 60), seed: seed0 + i + 90, depth: 0, facing: 0.8 }, 1);
    [10, 14, 20].forEach((rad, k) =>
      draw(x + (k - 1) * cw * 0.26, H * 0.88, { kind, radius: rad, seed: seed0 + i + k * 7, depth: 0.7, facing: 0.9 }, 1),
    );
  });
} else {
  const opens = (params.get('opens') ?? '0,0.15,0.35,0.6,0.85,1').split(',').map(Number);
  const cw = W / opens.length;
  const ch = H / kinds.length;
  kinds.forEach((kind, row) => {
    opens.forEach((open, col) => {
      const spec: HeadSpec = {
        kind,
        radius: Math.min(cw, ch) * (kind === 'blossom' ? 0.34 : 0.36),
        seed: seed0 + row * 17,
        depth: 1,
        facing: 1,
      };
      draw(cw * (col + 0.5), ch * (row + 0.5), spec, open);
    });
  });
}
