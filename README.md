# Flores amarillas para Andy 🌻

Un ramo de flores amarillas que florece en la noche: estrellas, luciérnagas, mariposas,
una constelación de corazón, música de caja musical y una carta.

Hecho con **Vite + TypeScript + Canvas 2D + Web Audio** (sin archivos de audio ni imágenes).

## Correr en tu computadora

```bash
npm install
npm run dev        # http://localhost:5173
```

La página no se recarga sola al guardar; presiona F5 para ver los cambios.

## Personalizar

Todo está en [`src/config.ts`](src/config.ts):

- `recipient`: el nombre (también se puede cambiar con la URL: `?para=Nombre`).
- `messages`: las frases que aparecen debajo del título.
- `letter`: la carta (saludo, párrafos, despedida y firma).
- `music.volume`: volumen de la música (0 a 1).

## Publicar en Render

**Opción A — Static Site (recomendada, gratis y más rápida):**

1. **New → Static Site** y conecta este repositorio.
2. **Build Command:** `npm ci && npm run build`
3. **Publish Directory:** `dist`

**Opción B — Web Service:**

1. **Build Command:** `npm ci && npm run build`
2. **Start Command:** `npm start` (sirve `dist/` en `0.0.0.0:$PORT` con [`server.mjs`](server.mjs)).

Si el Start Command quedó como `npm run dev`, también funciona, porque en Render el servidor
de Vite escucha en `0.0.0.0:$PORT`, aunque `npm start` es más rápido.

Cada `git push` a `main` vuelve a publicarlo. La versión de Node se toma de `.node-version`.

## Parámetros útiles en la URL

| Parámetro | Qué hace |
| --- | --- |
| `?para=Nombre` | Cambia el nombre |
| `?auto` | Salta la pantalla de inicio |
| `?t=20` | Adelanta la animación a los 20 s |
| `?mute` | Sin música |
