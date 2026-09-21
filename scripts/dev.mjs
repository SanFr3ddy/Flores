// "npm run dev": en local abre Vite; en Render (o si el Start Command quedó como
// "npm run dev") sirve el build de dist/ con server.mjs en 0.0.0.0:$PORT.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const onRender = process.env.RENDER === 'true' || !!process.env.RENDER_SERVICE_ID;

if (onRender && existsSync(join(root, 'dist', 'index.html'))) {
  await import('../server.mjs');
} else {
  const vite = join(root, 'node_modules', 'vite', 'bin', 'vite.js');
  const child = spawn(process.execPath, [vite, ...process.argv.slice(2)], { stdio: 'inherit', cwd: root });
  child.on('exit', (code) => process.exit(code ?? 0));
}
