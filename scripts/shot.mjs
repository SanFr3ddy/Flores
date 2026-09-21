// Capturas automáticas de la escena con Chrome headless (playwright-core).
//
// Uso:
//   node scripts/shot.mjs --t=3,8,14 --size=1440x900,390x844 --name=prueba
//   node scripts/shot.mjs --t=20 --fps            (mide FPS en vez de capturar)
//   node scripts/shot.mjs --t=0 --intro           (captura la pantalla de introducción)
//
// Opciones:
//   --t=LISTA        segundos de escena a capturar (se adelanta con ?t=N&hold)
//   --size=LISTA     tamaños de viewport AxB (por defecto 1440x900)
//   --name=PREFIJO   prefijo del archivo en shots/
//   --seed=N         semilla de composición
//   --wait=MS        espera antes de capturar (por defecto 1600)
//   --live           no congela el tiempo (la escena sigue animándose durante la espera)
//   --intro          no salta la introducción
//   --fps            mide FPS durante 4 s en cada t y tamaño (sin captura)
//   --query=STR      parámetros extra para la URL (p. ej. "para=Luz")
//   --path=RUTA      página a abrir (p. ej. dev/flora.html); por defecto index.html
import { mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, ...v] = a.replace(/^--/, '').split('=');
    return [k, v.length ? v.join('=') : true];
  }),
);

const times = String(args.t ?? '8').split(',').map(Number);
const sizes = String(args.size ?? '1440x900')
  .split(',')
  .map((s) => s.split('x').map(Number));
const name = String(args.name ?? 'shot');
const wait = Number(args.wait ?? 1600);
const outDir = resolve(root, 'shots');
mkdirSync(outDir, { recursive: true });

const server = await createServer({
  root,
  logLevel: 'error',
  server: { port: 5300 + Math.floor(Math.random() * 600), strictPort: false, host: '127.0.0.1' },
});
await server.listen();
const base = server.resolvedUrls?.local?.[0] ?? 'http://127.0.0.1:5300/';

const browser = await chromium.launch({ channel: 'chrome', headless: true });
let failures = 0;

try {
  for (const [width, height] of sizes) {
    const context = await browser.newContext({
      viewport: { width, height },
      deviceScaleFactor: width < 700 ? 2 : 1,
      hasTouch: width < 700,
      isMobile: width < 700,
    });
    for (const t of times) {
      const page = await context.newPage();
      const problems = [];
      page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
      page.on('console', (m) => {
        if (m.type() === 'error' || m.type() === 'warning') problems.push(`console.${m.type()}: ${m.text()}`);
      });
      const q = new URLSearchParams();
      if (!args.intro) q.set('auto', '');
      q.set('mute', '');
      if (t > 0) q.set('t', String(t));
      if (!args.live && !args.fps && !args.intro) q.set('hold', '');
      if (args.seed) q.set('seed', String(args.seed));
      const extra = args.query ? `&${args.query}` : '';
      const path = args.path ? String(args.path).replace(/^\//, '') : '';
      const url = `${base}${path}?${q.toString().replace(/=(&|$)/g, '$1')}${extra}`;
      await page.goto(url, { waitUntil: 'networkidle' }).catch(() => page.goto(url, { waitUntil: 'load' }));
      await page.evaluate(() => document.fonts?.ready).catch(() => {});
      if (args.fps) {
        await page.waitForTimeout(800);
        const stats = await page.evaluate(
          () =>
            new Promise((done) => {
              const deltas = [];
              let last = performance.now();
              const start = last;
              const tick = (now) => {
                deltas.push(now - last);
                last = now;
                if (now - start < 4000) requestAnimationFrame(tick);
                else {
                  deltas.sort((a, b) => a - b);
                  const avg = deltas.reduce((s, d) => s + d, 0) / deltas.length;
                  done({ fps: 1000 / avg, p95: deltas[Math.floor(deltas.length * 0.95)], frames: deltas.length });
                }
              };
              requestAnimationFrame(tick);
            }),
        );
        console.log(
          `FPS ${width}x${height} t=${t}: ${stats.fps.toFixed(1)} fps, p95 ${stats.p95.toFixed(1)} ms (${stats.frames} frames, headless/software)`,
        );
      } else {
        await page.waitForTimeout(wait);
        const file = resolve(outDir, `${name}-${width}x${height}-t${t}.png`);
        await page.screenshot({ path: file });
        console.log(`captura: ${file}`);
      }
      for (const p of problems) {
        failures++;
        console.log(`  ⚠ ${p}`);
      }
      await page.close();
    }
    await context.close();
  }
} finally {
  await browser.close();
  await server.close();
}
if (failures) console.log(`${failures} problema(s) en consola.`);
