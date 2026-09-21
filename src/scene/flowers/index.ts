import type { FlowerKind } from '../../core/types';

/** Descripción de una cabeza de flor. El jardín la crea una vez por flor. */
export interface HeadSpec {
  kind: FlowerKind;
  /** Radio de la cabeza totalmente abierta, px CSS. */
  radius: number;
  /** Semilla entera por flor (variación de pétalos, tonos, etc.). */
  seed: number;
  /** 0 = fila trasera (más tenue), 1 = fila delantera (más brillante). */
  depth: number;
  /** 1 = mira de frente; ~0.6 = vista algo inclinada (achatada en Y). */
  facing: number;
}

/**
 * Dibuja la cabeza centrada en (0,0) del transform actual; "arriba" es -y.
 * El tallo llega por debajo, a (0, 0) — la cabeza se dibuja encima del tallo.
 * open: 0 = capullo cerrado, 1 = flor abierta. time: segundos de escena (brillos sutiles).
 * pixelRatio: dpr del canvas (para cachear sprites nítidos).
 * No debe dejar modificado el estado del contexto.
 * (STUB: placeholder pendiente de implementar)
 */
export function drawFlowerHead(
  g: CanvasRenderingContext2D,
  spec: HeadSpec,
  open: number,
  _time: number,
  _pixelRatio: number,
): void {
  g.save();
  g.fillStyle = open < 0.05 ? '#3f7a2a' : '#ffd21f';
  g.beginPath();
  g.ellipse(0, 0, spec.radius * Math.max(0.15, open), spec.radius * Math.max(0.15, open) * spec.facing, 0, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

/**
 * Brillo aditivo cálido detrás de la cabeza. El jardín lo dibuja antes de la cabeza,
 * con el mismo transform. (STUB)
 */
export function drawFlowerGlow(
  _g: CanvasRenderingContext2D,
  _spec: HeadSpec,
  _open: number,
  _time: number,
): void {}

/** Libera sprites cacheados (el jardín lo llama en resize). */
export function clearFlowerCache(): void {}
