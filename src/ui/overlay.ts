import { CONFIG } from '../config';
import type { World } from '../core/types';
import { el, setTextWithEmoji, svgFrom } from './dom';
import { ICON_MUSIC, ICON_REPLAY } from './icons';
import { Intro } from './intro';

export interface OverlayCallbacks {
  /** El usuario abrió el regalo (gesto del usuario: aquí se puede iniciar el audio). */
  onOpen(): void;
  /** Alterna la música; devuelve true si quedó silenciada. */
  onToggleMusic(): boolean;
  /** Reinicia la escena desde cero. */
  onReplay(): void;
}

const T = CONFIG.timeline;
/** El subtítulo aparece un poco después del título. */
const SUBTITLE_DELAY = 1.2;
/** Tras completar el ramo, "¡Tu ramo está completo!" brilla este tiempo y luego se apaga
 *  (antes de que aparezca el sobre en el mismo lugar, a completeAt + letterDelay). */
const HINT_DONE = Math.max(1, T.letterDelay - 1.2);
/** Frases de armado + frases finales, en una sola lista. */
const BUILD = CONFIG.messages.length;
const FINALE = CONFIG.finale.length;

type HintState = 'off' | 'progress' | 'done';
/** Duración de la salida de una frase (ui.css: .msg.is-out). */
const MSG_OUT = 1.1;

/**
 * Capa de interfaz DOM sobre el canvas: pantalla de introducción, título,
 * mensajes, pista y controles. Todo se sincroniza con world.time y solo se
 * toca el DOM cuando se cruza un umbral.
 */
export class Overlay {
  private readonly stage: HTMLDivElement;
  private readonly veil: HTMLDivElement;
  private readonly title: HTMLHeadingElement;
  private readonly subtitle: HTMLParagraphElement;
  private readonly lines: HTMLParagraphElement[] = [];
  private readonly hint: HTMLDivElement;
  private readonly hintText: HTMLSpanElement;
  private readonly hintCount: HTMLSpanElement;
  private readonly hintFill: HTMLSpanElement;
  private readonly controls: HTMLDivElement;
  private readonly musicButton: HTMLButtonElement;
  private intro: Intro | null = null;
  private controlsTimer = 0;

  // Estado cacheado (para no escribir en el DOM cada frame)
  private titleOn = false;
  private subtitleOn = false;
  private msgIndex = -1;
  private hintState: HintState = 'off';
  private hintShown = -1;
  private hintTotal = -1;
  private lastTime = 0;

  constructor(
    private readonly root: HTMLElement,
    private readonly callbacks: OverlayCallbacks,
  ) {
    this.stage = el('div', 'ui-stage');

    this.veil = el('div', 'ui-veil', { 'aria-hidden': 'true' });

    // Título: una capa de resplandor (text-shadow) debajo del texto dorado con degradado
    this.title = el('h1', 'ui-title', { 'aria-label': CONFIG.title });
    this.title.append(
      el('span', 'ui-title-glow', { 'aria-hidden': 'true' }, CONFIG.title),
      el('span', 'ui-title-text', { 'aria-hidden': 'true' }, CONFIG.title),
    );
    this.subtitle = el('p', 'ui-subtitle', {}, CONFIG.subtitle);

    const messages = el('div', 'ui-messages', { 'aria-live': 'polite' });
    [...CONFIG.messages, ...CONFIG.finale].forEach((text, i) => {
      const line = el('p', i === BUILD + FINALE - 1 ? 'msg is-last' : 'msg');
      setTextWithEmoji(line, text);
      line.setAttribute('aria-hidden', 'true');
      this.lines.push(line);
      messages.append(line);
    });

    // Pista con progreso: "Toca la pantalla…  7 / 26" y una barrita dorada
    this.hint = el('div', 'ui-hint', { 'aria-hidden': 'true' });
    const hintRow = el('span', 'ui-hint-row');
    this.hintText = el('span', 'ui-hint-text');
    setTextWithEmoji(this.hintText, CONFIG.hint);
    this.hintCount = el('span', 'ui-hint-count');
    hintRow.append(this.hintText, this.hintCount);
    const bar = el('span', 'ui-hint-bar');
    this.hintFill = el('span', 'ui-hint-fill');
    bar.append(this.hintFill);
    this.hint.append(hintRow, bar);

    // Controles: música y repetir
    this.controls = el('div', 'ui-controls');
    this.musicButton = el('button', 'ui-btn ui-btn--music', {
      type: 'button',
      'aria-label': 'Música',
      'aria-pressed': 'true',
      title: 'Silenciar música',
    });
    this.musicButton.append(svgFrom(ICON_MUSIC));
    this.musicButton.addEventListener('click', () => {
      this.setMusicMuted(this.callbacks.onToggleMusic());
    });

    const replay = el('button', 'ui-btn ui-btn--replay', {
      type: 'button',
      'aria-label': 'Repetir desde el principio',
      title: 'Repetir',
    });
    replay.append(svgFrom(ICON_REPLAY));
    replay.addEventListener('click', () => {
      replay.classList.remove('is-spinning');
      void replay.offsetWidth; // reinicia el giro del icono
      replay.classList.add('is-spinning');
      this.callbacks.onReplay();
    });
    this.controls.append(this.musicButton, replay);

    this.stage.append(this.veil, this.title, this.subtitle, messages, this.hint);
    this.root.append(this.stage, this.controls);
  }

  /** Muestra la pantalla de introducción; al pulsar el botón llama a onOpen(). */
  showIntro(): void {
    this.intro?.destroy();
    this.controls.classList.remove('is-on');
    this.intro = new Intro(() => {
      this.callbacks.onOpen();
      window.clearTimeout(this.controlsTimer);
      this.controlsTimer = window.setTimeout(() => this.controls.classList.add('is-on'), 1400);
    });
    this.intro.mount(this.root);
  }

  /** Oculta la introducción sin animación (modo ?auto). */
  skipIntro(): void {
    this.intro?.destroy();
    this.intro = null;
    this.controls.classList.add('is-on');
  }

  /** Sincroniza título, mensajes y pista con el tiempo de escena. Se llama cada frame. */
  update(world: World): void {
    const t = world.time;
    // El tiempo retrocedió sin reset() explícito: la escena se reinició.
    if (t + 0.5 < this.lastTime) this.reset();
    this.lastTime = t;

    const titleOn = t >= T.title;
    if (titleOn !== this.titleOn) {
      this.titleOn = titleOn;
      this.toggleAnimated(this.title, titleOn, t - T.title);
      this.veil.classList.toggle('is-on', titleOn);
    }

    const subOn = t >= T.title + SUBTITLE_DELAY;
    if (subOn !== this.subtitleOn) {
      this.subtitleOn = subOn;
      this.toggleAnimated(this.subtitle, subOn, t - T.title - SUBTITLE_DELAY);
    }

    const done = world.bouquet.completeAt;
    const [idx, start] = messageAt(t, done);
    if (idx !== this.msgIndex) this.showMessage(idx, t - start);

    this.updateHint(world, t, done);
  }

  /** Vuelve el texto al estado inicial (botón "repetir"). */
  reset(): void {
    this.stage.classList.add('is-instant');
    for (const node of [this.title, this.subtitle, ...this.lines]) {
      node.classList.remove('is-in', 'is-out', 'is-on');
      node.style.removeProperty('--d');
    }
    for (const line of this.lines) line.setAttribute('aria-hidden', 'true');
    this.veil.classList.remove('is-on');
    this.hint.classList.remove('is-on', 'is-done', 'is-pop');
    this.hintText.textContent = '';
    setTextWithEmoji(this.hintText, CONFIG.hint);
    this.hintCount.textContent = '';
    this.hintFill.style.transform = 'scaleX(0)';
    void this.stage.offsetWidth; // aplica el estado oculto sin transición
    this.stage.classList.remove('is-instant');

    this.titleOn = false;
    this.subtitleOn = false;
    this.msgIndex = -1;
    this.hintState = 'off';
    this.hintShown = -1;
    this.hintTotal = -1;
    this.lastTime = 0;
  }

  /** Refleja el estado de la música en el botón. */
  setMusicMuted(muted: boolean): void {
    this.musicButton.classList.toggle('is-muted', muted);
    this.musicButton.setAttribute('aria-pressed', String(!muted));
    this.musicButton.title = muted ? 'Activar música' : 'Silenciar música';
  }

  /* ---------------------------------------------------------------- */

  /**
   * Activa la animación CSS de entrada. Si ya pasó tiempo desde el umbral
   * (adelanto con ?t=), usa un retraso negativo para saltar al punto exacto.
   */
  private toggleAnimated(node: HTMLElement, on: boolean, elapsed: number): void {
    if (on) {
      node.style.setProperty('--d', elapsed > 0.1 ? `${(-elapsed).toFixed(2)}s` : '0s');
      node.classList.add('is-on');
    } else {
      node.classList.remove('is-on');
      node.style.removeProperty('--d');
    }
  }

  /** Pista inferior: progreso del ramo y, al completarlo, un brillo antes de apagarse. */
  private updateHint(world: World, t: number, done: number | null): void {
    const { count, total } = world.bouquet;
    let state: HintState = 'off';
    if (total > 0 && t >= T.hint) {
      if (done === null) state = 'progress';
      else if (t < done + HINT_DONE) state = 'done';
    }

    if (state !== this.hintState) {
      const prev = this.hintState;
      this.hintState = state;
      this.hint.classList.toggle('is-on', state !== 'off');
      if (state === 'done') {
        setTextWithEmoji(this.hintText, CONFIG.hintDone);
        this.hint.classList.add('is-done');
      } else if (state === 'progress') {
        if (prev === 'done' || this.hint.classList.contains('is-done')) setTextWithEmoji(this.hintText, CONFIG.hint);
        this.hint.classList.remove('is-done');
      }
      // al apagarse desde 'done' conserva el texto final mientras se desvanece
    }

    if (state === 'off') return;
    const shown = Math.min(count, total);
    if (shown !== this.hintShown || total !== this.hintTotal) {
      const grew = this.hintShown >= 0 && shown > this.hintShown;
      this.hintShown = shown;
      this.hintTotal = total;
      this.hintCount.textContent = `${shown} / ${total}`;
      this.hintFill.style.transform = `scaleX(${(shown / total).toFixed(4)})`;
      if (grew && !world.reducedMotion) {
        this.hint.classList.remove('is-pop');
        void this.hint.offsetWidth; // reinicia el "pop"
        this.hint.classList.add('is-pop');
      }
    }
  }

  private showMessage(idx: number, elapsed: number): void {
    const prev = this.msgIndex;
    this.msgIndex = idx;

    this.lines.forEach((line, i) => {
      if (i === idx) {
        line.style.setProperty('--d', elapsed > 0.1 ? `${(-elapsed).toFixed(2)}s` : '0s');
        line.classList.remove('is-out');
        line.classList.add('is-in');
        line.removeAttribute('aria-hidden');
      } else if (i === prev && idx > prev && elapsed >= 0 && elapsed < MSG_OUT) {
        // Sale flotando hacia arriba mientras entra la siguiente
        line.style.setProperty('--d', `${(-Math.max(0, elapsed)).toFixed(2)}s`);
        line.classList.remove('is-in');
        line.classList.add('is-out');
        line.setAttribute('aria-hidden', 'true');
      } else {
        line.classList.remove('is-in', 'is-out');
        line.setAttribute('aria-hidden', 'true');
      }
    });
  }
}

/**
 * Frase visible en el instante t y el momento en que empezó.
 * Antes de completar: frases de armado (la última espera). Después: frases finales.
 */
function messageAt(t: number, done: number | null): [number, number] {
  if (done !== null) {
    const f0 = done + T.finaleDelay;
    if (t >= f0) {
      const j = Math.min(FINALE - 1, Math.floor((t - f0) / T.finaleInterval));
      return [BUILD + j, f0 + j * T.finaleInterval];
    }
  }
  if (t < T.messagesStart) return [-1, 0];
  const i = Math.min(BUILD - 1, Math.floor((t - T.messagesStart) / T.messageInterval));
  return [i, T.messagesStart + i * T.messageInterval];
}
