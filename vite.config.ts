/// <reference types="node" />
import { defineConfig } from 'vite';

// Render define RENDER=true y el puerto en PORT. Si el Start Command quedó como
// "npm run dev", el servidor debe escuchar en 0.0.0.0:$PORT y aceptar su dominio.
const onRender = process.env.RENDER === 'true';
const renderPort = Number(process.env.PORT) || 10000;
const renderServer = onRender ? { host: '0.0.0.0', port: renderPort, strictPort: true, allowedHosts: true as const } : {};

export default defineConfig({
  // Rutas relativas: el build funciona abierto desde cualquier carpeta (p. ej. XAMPP o Render).
  base: './',
  server: {
    // Sin recarga automática: la página no se reinicia sola cada vez que se guarda un archivo.
    // Para ver cambios, recarga la página a mano (F5).
    hmr: false,
    watch: { ignored: ['**/shots/**', '**/dist/**'] },
    ...renderServer,
  },
  preview: {
    ...renderServer,
  },
  build: {
    target: 'es2022',
    assetsInlineLimit: 8192,
  },
});
