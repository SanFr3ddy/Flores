import { clamp, lerp, smoothstep } from '../../core/math';

/** Retrato: la pantalla es claramente más alta que ancha. */
export const isPortrait = (w: number, h: number): boolean => h > w * 1.1;

/**
 * Cuánto se deja ver el cielo en (x, y) px: ~0.2 dentro del resplandor del ramo
 * central, 1 lejos de él. Así las flores dominan y las estrellas no compiten.
 */
export function bouquetDim(x: number, y: number, w: number, h: number): number {
  const portrait = isPortrait(w, h);
  // Cúpula de cabezas (según el contrato de maquetación v2).
  const rx = portrait ? w * 0.5 : Math.min(w * 0.25, 440);
  const ry = h * (portrait ? 0.22 : 0.25);
  const dx = (x - w * 0.5) / rx;
  const dy = (y - h * 0.5) / ry;
  const d = Math.sqrt(dx * dx + dy * dy);
  // Haz de tallos y lazo, estrecho, hasta ~87%.
  const sx = (x - w * 0.5) / (portrait ? w * 0.16 : Math.min(w * 0.08, 140));
  const sy = (y - h * 0.8) / (h * 0.1);
  const ds = Math.sqrt(sx * sx + sy * sy);
  const k = Math.min(smoothstep(0.55, 1.25, d), smoothstep(0.5, 1.3, ds));
  return lerp(0.18, 1, k);
}

/** Posición y tamaño (semiancho) de la luna en px. */
export function moonLayout(w: number, h: number): { x: number; y: number; r: number } {
  if (isPortrait(w, h)) {
    // Arriba a la izquierda, diminuta: libre del título centrado y de los controles (arriba a la derecha).
    const r = clamp(Math.min(w, h) * 0.026, 8, 12);
    return { x: Math.max(r * 3, w * 0.1), y: Math.max(r * 3.2, h * 0.046), r };
  }
  const r = clamp(Math.min(w, h) * 0.024, 12, 26);
  return { x: w * 0.86, y: h * 0.12, r };
}

/** Centro normalizado y semiancho (px) de la constelación de corazón. */
export function heartLayout(w: number, h: number): { u: number; v: number; half: number; portrait: boolean } {
  const m = Math.min(w, h);
  if (isPortrait(w, h)) {
    // Abajo a la izquierda, junto al haz de tallos: lejos de textos, controles y cabezas.
    return { u: 0.19, v: 0.8, half: clamp(m * 0.085, 26, 46), portrait: true };
  }
  // A la izquierda del ramo, arriba. El corazón mide ~0.2·min de ancho.
  return { u: 0.15, v: 0.3, half: clamp(m * 0.1, 44, 120), portrait: false };
}
