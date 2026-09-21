import { defineConfig } from 'vite';

export default defineConfig({
  // Rutas relativas: el build funciona abierto desde cualquier carpeta (p. ej. XAMPP o Render).
  base: './',
  server: {
    // Sin recarga automática: la página no se reinicia sola cada vez que se guarda un archivo.
    // Para ver cambios, recarga la página a mano (F5).
    hmr: false,
    watch: { ignored: ['**/shots/**', '**/dist/**'] },
  },
  build: {
    target: 'es2022',
    assetsInlineLimit: 8192,
  },
});
