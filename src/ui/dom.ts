/** Utilidades mínimas para construir DOM sin frameworks. */

type Attrs = Record<string, string>;

/** Crea un elemento con clase, atributos y texto (siempre como textContent, nunca HTML). */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = '',
  attrs: Attrs = {},
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Inserta un SVG estático (solo marcado propio, nunca texto del usuario). */
export function svgFrom(markup: string): SVGSVGElement {
  const tpl = document.createElement('template');
  tpl.innerHTML = markup.trim();
  const node = tpl.content.firstElementChild;
  if (!(node instanceof SVGSVGElement)) throw new Error('SVG inválido');
  return node;
}

const EMOJI = /(\p{Extended_Pictographic}️?)/u;

/**
 * Escribe un texto separando los emojis en <span class="emoji"> para poder
 * animarlos (latido) sin tocar el resto de la línea.
 */
export function setTextWithEmoji(target: HTMLElement, text: string): void {
  target.textContent = '';
  for (const part of text.split(EMOJI)) {
    if (!part) continue;
    if (EMOJI.test(part)) target.append(el('span', 'emoji', { 'aria-hidden': 'true' }, part));
    else target.append(document.createTextNode(part));
  }
}

/** Pseudoaleatorio determinista para la decoración (misma intro en cada carga). */
export function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
