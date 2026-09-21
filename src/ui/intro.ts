import { CONFIG } from '../config';
import { el, seeded, svgFrom } from './dom';
import { sunflowerEmblem } from './icons';

/** Duración total de la salida de la introducción (debe coincidir con ui.css). */
const LEAVE_MS = 1600;

/** Leyenda pequeña bajo el botón. */
const CAPTION = 'Sube el volumen  ♪';

/**
 * Pantalla de introducción: fondo negro que tapa el canvas, estrellitas CSS,
 * emblema de girasol que respira, texto y el botón "Ábrelo" justo en el
 * centro de la pantalla (el resto se acomoda arriba y abajo de él).
 */
export class Intro {
  readonly element: HTMLDivElement;
  private readonly button: HTMLButtonElement;
  private opened = false;
  private timer = 0;

  constructor(private readonly onOpen: () => void) {
    const root = el('div', 'intro', {
      role: 'dialog',
      'aria-modal': 'true',
      'aria-labelledby': 'intro-line',
      'data-interactive': '',
    });

    // Estrellitas titilando (posiciones deterministas)
    const stars = el('div', 'intro-stars', { 'aria-hidden': 'true' });
    const rand = seeded(2109);
    for (let i = 0; i < 46; i++) {
      const s = el('span', 'intro-star');
      s.style.setProperty('--x', `${(rand() * 100).toFixed(2)}%`);
      s.style.setProperty('--y', `${(rand() * 100).toFixed(2)}%`);
      s.style.setProperty('--s', `${(1 + rand() * rand() * 2.2).toFixed(2)}px`);
      s.style.setProperty('--d', `${(-rand() * 6).toFixed(2)}s`);
      s.style.setProperty('--p', `${(3 + rand() * 4).toFixed(2)}s`);
      s.style.setProperty('--o', `${(0.35 + rand() * 0.6).toFixed(2)}`);
      stars.append(s);
    }

    // Resplandor cálido centrado en el botón
    const glow = el('div', 'intro-glow', { 'aria-hidden': 'true' });

    // Bloque superior: emblema + texto (su borde inferior queda sobre el botón)
    const upper = el('div', 'intro-upper');
    const emblem = el('div', 'intro-emblem', { 'aria-hidden': 'true' });
    const emblemInner = el('div', 'intro-emblem-inner');
    emblemInner.append(svgFrom(sunflowerEmblem()));
    emblem.append(emblemInner);
    const text = el('div', 'intro-text');
    text.append(
      el('p', 'intro-kicker', {}, CONFIG.intro.kicker),
      el('h1', 'intro-line', { id: 'intro-line' }, CONFIG.intro.line),
    );
    upper.append(emblem, text);

    // Botón: su centro coincide con el centro exacto del viewport
    const center = el('div', 'intro-center');
    this.button = el('button', 'intro-button', { type: 'button' });
    this.button.append(
      el('span', 'intro-button-label', {}, CONFIG.intro.button),
      el('span', 'intro-button-heart', { 'aria-hidden': 'true' }, '💛'),
    );
    this.button.addEventListener('click', this.handleOpen);
    center.append(this.button);

    const caption = el('p', 'intro-caption', { 'aria-hidden': 'true' }, CAPTION);

    root.append(stars, glow, upper, center, caption);
    this.element = root;
  }

  mount(parent: HTMLElement): void {
    parent.append(this.element);
    // Foco inicial en el botón para poder abrir con Enter / Espacio.
    requestAnimationFrame(() => this.button.focus({ preventScroll: true }));
  }

  /** Quita la introducción al instante. */
  destroy(): void {
    window.clearTimeout(this.timer);
    this.button.removeEventListener('click', this.handleOpen);
    this.element.remove();
  }

  private readonly handleOpen = (): void => {
    if (this.opened) return;
    this.opened = true;
    // Primero el callback: el audio necesita el gesto del usuario.
    this.onOpen();
    this.button.disabled = true;
    this.element.classList.add('is-leaving');
    this.element.setAttribute('aria-hidden', 'true');
    this.timer = window.setTimeout(() => this.destroy(), LEAVE_MS);
  };
}
