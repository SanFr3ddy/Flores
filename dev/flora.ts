// Galería de cabezas de flor en distintos grados de apertura (solo desarrollo).
// Abrir con: node scripts/shot.mjs --path=dev/flora.html --name=flora
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
const opens = [0, 0.15, 0.35, 0.6, 0.85, 1];
const params = new URLSearchParams(location.search);
const time = Number(params.get('time') ?? 3);

g.setTransform(dpr, 0, 0, dpr, 0, 0);
g.fillStyle = '#000';
g.fillRect(0, 0, W, H);
const cw = W / opens.length;
const ch = H / kinds.length;
kinds.forEach((kind, row) => {
  opens.forEach((open, col) => {
    const spec: HeadSpec = {
      kind,
      radius: Math.min(cw, ch) * (kind === 'sunflower' ? 0.36 : kind === 'blossom' ? 0.22 : 0.3),
      seed: 1234 + row * 17 + col,
      depth: col % 2 === 0 ? 1 : 0.5,
      facing: col === opens.length - 1 ? 0.8 : 1,
    };
    g.save();
    g.translate(cw * (col + 0.5), ch * (row + 0.5));
    drawFlowerGlow(g, spec, open, time);
    drawFlowerHead(g, spec, open, time, dpr);
    g.restore();
  });
});
