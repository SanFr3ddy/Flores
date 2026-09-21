/** Iconos y emblema en SVG en línea (marcado estático). */

const ICON_ATTRS =
  'xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="22" height="22" fill="none" ' +
  'stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"';

/** Nota musical; la raya (.icon-slash) solo se ve en silencio. */
export const ICON_MUSIC = `<svg ${ICON_ATTRS}>
  <path d="M9 18V5.5l11-2.2V16"/>
  <circle cx="6.2" cy="18" r="2.8"/>
  <circle cx="17.2" cy="16" r="2.8"/>
  <path class="icon-slash" d="M3.5 3.5l17 17"/>
</svg>`;

/** Flecha circular (repetir). */
export const ICON_REPLAY = `<svg ${ICON_ATTRS}>
  <path d="M3.6 12a8.4 8.4 0 1 0 2.46-5.94L3.6 8.5"/>
  <path d="M3.6 3.8v4.7h4.7"/>
</svg>`;

/**
 * Emblema de girasol para la introducción: dos coronas de pétalos con
 * degradado, disco con semillas en espiral áurea y halo cálido.
 */
export function sunflowerEmblem(): string {
  const petal = 'M0 -20 C 8 -34, 9 -56, 0 -76 C -9 -56, -8 -34, 0 -20 Z';
  const back: string[] = [];
  const front: string[] = [];
  const n = 16;
  for (let i = 0; i < n; i++) {
    const a = (360 / n) * i;
    back.push(`<path d="${petal}" transform="rotate(${(a + 360 / n / 2).toFixed(2)}) scale(1.02 0.92)"/>`);
    front.push(`<path d="${petal}" transform="rotate(${a.toFixed(2)}) scale(0.92 0.86)"/>`);
  }
  // Semillas en espiral de Fibonacci
  const seeds: string[] = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  const count = 70;
  for (let i = 1; i <= count; i++) {
    const r = 22 * Math.sqrt(i / count);
    const t = i * golden;
    const size = 0.9 + (i / count) * 0.9;
    seeds.push(
      `<circle cx="${(Math.cos(t) * r).toFixed(2)}" cy="${(Math.sin(t) * r).toFixed(2)}" r="${size.toFixed(2)}"/>`,
    );
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-100 -100 200 200" aria-hidden="true" focusable="false">
  <defs>
    <radialGradient id="fa-halo">
      <stop offset="0" stop-color="#ffd84a" stop-opacity="0.55"/>
      <stop offset="0.45" stop-color="#ffb347" stop-opacity="0.16"/>
      <stop offset="1" stop-color="#ffb347" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="fa-petal-back" gradientUnits="userSpaceOnUse" x1="0" y1="-20" x2="0" y2="-76">
      <stop offset="0" stop-color="#c26e00"/>
      <stop offset="0.6" stop-color="#f5a300"/>
      <stop offset="1" stop-color="#ffc93a"/>
    </linearGradient>
    <linearGradient id="fa-petal" gradientUnits="userSpaceOnUse" x1="0" y1="-20" x2="0" y2="-76">
      <stop offset="0" stop-color="#f5a300"/>
      <stop offset="0.45" stop-color="#ffd21f"/>
      <stop offset="1" stop-color="#fff27a"/>
    </linearGradient>
    <radialGradient id="fa-disc" cx="0.42" cy="0.38" r="0.7">
      <stop offset="0" stop-color="#7a4a10"/>
      <stop offset="0.6" stop-color="#4a2a07"/>
      <stop offset="1" stop-color="#2a1703"/>
    </radialGradient>
  </defs>
  <circle class="emblem-halo" r="100" fill="url(#fa-halo)"/>
  <g class="emblem-petals">
    <g fill="url(#fa-petal-back)" opacity="0.9">${back.join('')}</g>
    <g fill="url(#fa-petal)">${front.join('')}</g>
  </g>
  <circle r="25" fill="url(#fa-disc)" stroke="#f5a300" stroke-opacity="0.35" stroke-width="1.2"/>
  <g fill="#e0a526" fill-opacity="0.75">${seeds.join('')}</g>
  <circle r="25" fill="none" stroke="#ffd84a" stroke-opacity="0.18" stroke-width="3"/>
</svg>`;
}
