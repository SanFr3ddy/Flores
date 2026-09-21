import { CONFIG } from '../config';
import type { World } from '../core/types';

export interface LetterCallbacks {
  /** Se abrió (true) o cerró (false) la carta; main.ts baja la música mientras se lee. */
  onOpenChange(open: boolean): void;
}

type Attrs = Record<string, string>;

/** Crea un elemento con clase y atributos; el texto siempre va como textContent. */
function h<K extends keyof HTMLElementTagNameMap>(
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

/** Inserta SVG propio (nunca texto del usuario). */
function svg(markup: string): Element {
  const tpl = document.createElement('template');
  tpl.innerHTML = markup.trim();
  const node = tpl.content.firstElementChild;
  if (!node) throw new Error('SVG inválido');
  return node;
}

/** Corazón centrado en (cx, cy) con semiancho s (para sellos de lacre). */
const heartPath = (cx: number, cy: number, s: number): string => {
  const p = (dx: number, dy: number) => `${(cx + dx * s).toFixed(2)} ${(cy + dy * s).toFixed(2)}`;
  return (
    `M${p(0, 0.95)} C${p(-1.25, 0.2)} ${p(-1.05, -0.95)} ${p(-0.5, -0.95)} ` +
    `C${p(-0.2, -0.95)} ${p(-0.03, -0.7)} ${p(0, -0.52)} ` +
    `C${p(0.03, -0.7)} ${p(0.2, -0.95)} ${p(0.5, -0.95)} ` +
    `C${p(1.05, -0.95)} ${p(1.25, 0.2)} ${p(0, 0.95)}Z`
  );
};

/** Icono del botón: sobre dorado con sello de lacre en forma de corazón. */
const ICON_ENVELOPE = `
<svg class="letter-btn-svg" viewBox="0 0 44 32" aria-hidden="true" focusable="false">
  <defs>
    <linearGradient id="lt-gold" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#fff6c4"/>
      <stop offset=".5" stop-color="#ffd21f"/>
      <stop offset="1" stop-color="#e79b00"/>
    </linearGradient>
    <radialGradient id="lt-wax" cx=".38" cy=".32" r=".75">
      <stop offset="0" stop-color="#e2574a"/>
      <stop offset=".6" stop-color="#b3261e"/>
      <stop offset="1" stop-color="#7c140f"/>
    </radialGradient>
  </defs>
  <rect x="2" y="3" width="40" height="26" rx="3.2" fill="rgba(255,214,90,.14)" stroke="url(#lt-gold)" stroke-width="1.6"/>
  <path d="M3.4 27.6 L17 16.5 M40.6 27.6 L27 16.5" stroke="url(#lt-gold)" stroke-width="1.1" stroke-linecap="round" opacity=".55"/>
  <path d="M3.2 4.6 L22 18.2 L40.8 4.6" fill="none" stroke="url(#lt-gold)" stroke-width="1.6" stroke-linejoin="round"/>
  <circle cx="22" cy="18.4" r="5.6" fill="url(#lt-wax)"/>
  <circle cx="22" cy="18.4" r="4.3" fill="none" stroke="#ff9d8a" stroke-width=".5" opacity=".55"/>
  <path d="${heartPath(22, 18.6, 2.5)}" fill="#ffd9a8" opacity=".92"/>
</svg>`;

/** Sobre grande de la animación de apertura (cuerpo, bolsillo y solapa). */
const ENVELOPE_POCKET = `
<svg class="env-pocket-svg" viewBox="0 0 320 200" preserveAspectRatio="none" aria-hidden="true" focusable="false">
  <defs>
    <linearGradient id="env-side" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#eed9a2"/>
      <stop offset="1" stop-color="#f8ebc6"/>
    </linearGradient>
    <linearGradient id="env-side-r" x1="1" y1="0" x2="0" y2="0">
      <stop offset="0" stop-color="#eed9a2"/>
      <stop offset="1" stop-color="#f8ebc6"/>
    </linearGradient>
    <linearGradient id="env-bottom" x1="0" y1="1" x2="0" y2="0">
      <stop offset="0" stop-color="#f3e2b0"/>
      <stop offset="1" stop-color="#fbf1d6"/>
    </linearGradient>
  </defs>
  <path d="M0 0 L160 112 L0 200 Z" fill="url(#env-side)"/>
  <path d="M320 0 L160 112 L320 200 Z" fill="url(#env-side-r)"/>
  <path d="M0 200 L160 96 L320 200 Z" fill="url(#env-bottom)"/>
  <path d="M0 200 L160 96 L320 200" fill="none" stroke="rgba(170,120,30,.35)" stroke-width="1.2"/>
  <path d="M0 0 L148 104 M320 0 L172 104" fill="none" stroke="rgba(170,120,30,.22)" stroke-width="1"/>
</svg>`;

const ENVELOPE_FLAP = `
<svg class="env-flap-svg" viewBox="0 0 320 124" preserveAspectRatio="none" aria-hidden="true" focusable="false">
  <defs>
    <linearGradient id="env-flap-g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#f7e8bd"/>
      <stop offset="1" stop-color="#ead095"/>
    </linearGradient>
  </defs>
  <path d="M0 0 L320 0 L172 116 Q160 125 148 116 Z" fill="url(#env-flap-g)"/>
  <path d="M0 0 L148 116 Q160 125 172 116 L320 0" fill="none" stroke="rgba(170,120,30,.45)" stroke-width="1.3"/>
</svg>`;

const WAX_SEAL = `
<svg class="env-seal-svg" viewBox="0 0 60 60" aria-hidden="true" focusable="false">
  <defs>
    <radialGradient id="seal-g" cx=".36" cy=".3" r=".8">
      <stop offset="0" stop-color="#e8604f"/>
      <stop offset=".55" stop-color="#b3261e"/>
      <stop offset="1" stop-color="#6e110c"/>
    </radialGradient>
  </defs>
  <path d="M30 3 C38 2 41 7 47 9 C54 12 57 18 57 25 C59 32 57 40 52 46 C47 53 40 57 31 57 C22 58 14 55 9 49 C3 43 2 35 3 28 C4 19 8 12 15 7 C19 4 25 3 30 3Z" fill="url(#seal-g)"/>
  <circle cx="30" cy="30" r="19" fill="none" stroke="#ff8f7c" stroke-width="1.2" opacity=".45"/>
  <circle cx="30" cy="30" r="16.5" fill="none" stroke="#5a0c08" stroke-width=".8" opacity=".35"/>
  <path d="${heartPath(30, 31, 9)}" fill="#ffcf9e" opacity=".9"/>
  <path d="${heartPath(30, 31, 9)}" fill="none" stroke="#7a1510" stroke-width=".8" opacity=".4"/>
</svg>`;

/** Flor amarilla prensada (tipo cosmos) sujeta con un trocito de cinta. */
function pressedFlowerSvg(): string {
  const petals: string[] = [];
  const n = 8;
  // Variación fija por pétalo para que se vea hecho a mano
  const vary = [1, 0.92, 1.05, 0.96, 1.02, 0.9, 1.04, 0.97];
  const twist = [0, 4, -3, 2, -4, 3, -2, 5];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * 360 + twist[i];
    const L = 27 * vary[i];
    const W = 9.5 * (0.94 + 0.08 * vary[i]);
    const d =
      `M0 -3 C${-W * 0.9} ${-L * 0.3} ${-W * 1.05} ${-L * 0.82} ${-W * 0.5} ${-L} ` +
      `L${-W * 0.22} ${-L * 0.93} L0 ${-L * 1.01} L${W * 0.24} ${-L * 0.93} L${W * 0.52} ${-L * 0.99} ` +
      `C${W * 1.05} ${-L * 0.8} ${W * 0.9} ${-L * 0.3} 0 -3Z`;
    petals.push(
      `<path d="${d}" transform="rotate(${a.toFixed(1)})" fill="url(#pf-petal)" stroke="#c98a12" stroke-width=".6" stroke-opacity=".5"/>`,
      `<path d="M0 -6 L0 ${(-L * 0.86).toFixed(1)}" transform="rotate(${a.toFixed(1)})" stroke="#d99a16" stroke-width=".7" opacity=".45"/>`,
    );
  }
  const dots: string[] = [];
  for (let i = 0; i < 14; i++) {
    const a = i * 2.39996;
    const r = 1.6 * Math.sqrt(i + 0.5);
    dots.push(`<circle cx="${(Math.cos(a) * r).toFixed(2)}" cy="${(Math.sin(a) * r).toFixed(2)}" r=".9" fill="#3d2206" opacity=".6"/>`);
  }
  return `
<svg class="letter-flower-svg" viewBox="0 0 130 170" aria-hidden="true" focusable="false">
  <defs>
    <radialGradient id="pf-petal" cx="0" cy="0" r="30" gradientUnits="userSpaceOnUse">
      <stop offset=".15" stop-color="#e8a412"/>
      <stop offset=".55" stop-color="#f4c534"/>
      <stop offset="1" stop-color="#f8d65a"/>
    </radialGradient>
    <radialGradient id="pf-center" cx=".4" cy=".35" r=".7">
      <stop offset="0" stop-color="#b3701a"/>
      <stop offset="1" stop-color="#5a3308"/>
    </radialGradient>
  </defs>
  <g opacity=".92">
    <path d="M70 62 C66 92 58 118 40 162" fill="none" stroke="#7b8a3c" stroke-width="2.4" stroke-linecap="round"/>
    <path d="M58 112 C44 104 30 106 22 116 C36 121 48 120 58 112Z" fill="#8c9a48" stroke="#66742c" stroke-width=".6"/>
    <path d="M58 112 C46 112 34 114 24 116" fill="none" stroke="#66742c" stroke-width=".6" opacity=".7"/>
    <path d="M64 96 C76 84 92 84 100 90 C90 98 76 100 64 96Z" fill="#96a44f" stroke="#66742c" stroke-width=".6"/>
    <path d="M48 140 C50 128 57 124 62 124" fill="none" stroke="#7b8a3c" stroke-width="1.5" stroke-linecap="round"/>
    <g transform="translate(62 124) rotate(-20)">
      <path d="M0 0 C-5 -3 -5 -11 0 -15 C5 -11 5 -3 0 0Z" fill="#f0bd2e" stroke="#c98a12" stroke-width=".6"/>
      <path d="M0 0 C-4 -2 -6 -6 -5 -9 M0 0 C4 -2 6 -6 5 -9" fill="none" stroke="#7b8a3c" stroke-width="1.2"/>
    </g>
    <g transform="translate(70 58) rotate(-8)">
      ${petals.join('')}
      <circle r="8.5" fill="url(#pf-center)"/>
      ${dots.join('')}
    </g>
  </g>
  <rect x="30" y="126" width="46" height="15" transform="rotate(-28 53 133)" fill="#fffaf0" opacity=".5"/>
  <rect x="30" y="126" width="46" height="15" transform="rotate(-28 53 133)" fill="none" stroke="#d9c79a" stroke-width=".5" opacity=".6"/>
</svg>`;
}

const ICON_CLOSE = `
<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
  <path d="M6 6 L18 18 M18 6 L6 18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
</svg>`;

/** Duraciones (ms) de las animaciones; deben coincidir con letter.css. */
const CLOSE_MS = 420;
const CLOSE_MS_REDUCED = 260;
/** Momento (s) en que el papel ya está desplegado y empieza a "escribirse". */
const INK_START = 1.35;
const INK_START_REDUCED = 0.25;

/**
 * Botón con sobre (abajo al centro) que aparece cuando el ramo está completo
 * (world.bouquet.completeAt + CONFIG.timeline.letterDelay) y abre
 * la carta de CONFIG.letter en un diálogo modal: el sobre se abre, la hoja sale
 * y se despliega, y los párrafos aparecen uno tras otro como tinta fresca.
 */
export class Letter {
  private open = false;
  private shown = false;
  private lastTime = 0;
  private closeTimer = 0;
  private revealTimer = 0;
  private readonly launch: HTMLDivElement;
  private readonly button: HTMLButtonElement;
  private readonly dialog: HTMLDialogElement;
  private readonly card: HTMLElement;
  private readonly scroller: HTMLDivElement;
  private readonly lines: HTMLElement[] = [];
  private readonly reduceQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

  constructor(
    private readonly root: HTMLElement,
    private readonly callbacks: LetterCallbacks,
  ) {
    const L = CONFIG.letter;

    // --- Botón del sobre ---------------------------------------------
    this.launch = h('div', 'letter-launch');
    const float = h('div', 'letter-float');
    this.button = h('button', 'letter-btn', {
      type: 'button',
      'aria-haspopup': 'dialog',
      'aria-label': `Abrir la carta: ${L.button}`,
      tabindex: '-1',
    });
    const icon = h('span', 'letter-btn-icon');
    icon.append(svg(ICON_ENVELOPE));
    this.button.append(
      h('span', 'letter-btn-shine', { 'aria-hidden': 'true' }),
      icon,
      h('span', 'letter-btn-label', {}, L.button),
    );
    // Destellos que titilan alrededor del botón
    const sparks = h('span', 'letter-sparks', { 'aria-hidden': 'true' });
    for (let i = 0; i < 4; i++) sparks.append(h('i', `letter-spark s${i}`));
    float.append(h('span', 'letter-halo', { 'aria-hidden': 'true' }), sparks, this.button);
    this.launch.append(float);
    this.button.addEventListener('click', () => this.show());

    // --- Diálogo con la carta ------------------------------------------
    this.dialog = h('dialog', 'letter-dialog', { 'aria-labelledby': 'letter-greeting' });
    const veil = h('div', 'letter-veil', { 'aria-hidden': 'true' });
    const stage = h('div', 'letter-stage');

    const env = h('div', 'letter-env', { 'aria-hidden': 'true' });
    const envBack = h('div', 'env-back');
    const envPaper = h('div', 'env-paper');
    envPaper.append(h('i', 'env-paper-line'), h('i', 'env-paper-line'), h('i', 'env-paper-line'));
    const envPocket = h('div', 'env-pocket');
    envPocket.append(svg(ENVELOPE_POCKET));
    const envFlap = h('div', 'env-flap');
    envFlap.append(svg(ENVELOPE_FLAP));
    const seal = h('div', 'env-seal');
    seal.append(svg(WAX_SEAL));
    envFlap.append(seal);
    env.append(envBack, envPaper, envPocket, envFlap);

    this.card = h('article', 'letter-card');
    this.scroller = h('div', 'letter-scroll', { tabindex: '0', role: 'document' });
    const body = h('div', 'letter-body');
    const flower = h('div', 'letter-flower', { 'aria-hidden': 'true' });
    flower.append(svg(pressedFlowerSvg()));
    const greeting = h('h2', 'letter-greeting letter-ink', { id: 'letter-greeting' }, L.greeting);
    this.lines.push(greeting);
    body.append(flower, greeting);
    for (const text of L.paragraphs) {
      const p = h('p', 'letter-p letter-ink', {}, text);
      this.lines.push(p);
      body.append(p);
    }
    const sign = h('div', 'letter-sign');
    const closing = h('p', 'letter-closing letter-ink', {}, L.closing);
    const signature = h('p', 'letter-signature letter-ink', {}, L.signature);
    this.lines.push(closing, signature);
    sign.append(closing, signature);
    body.append(sign);
    this.scroller.append(body);
    this.card.append(this.scroller);
    stage.append(env, this.card);

    const close = h('button', 'letter-close', { type: 'button', 'aria-label': 'Cerrar carta', title: 'Cerrar' });
    close.append(svg(ICON_CLOSE));
    close.addEventListener('click', () => this.hide());

    this.dialog.append(veil, stage, close);

    // Esc: cierre animado (si el navegador lo fuerza, 'close' termina el trabajo)
    this.dialog.addEventListener('cancel', (e) => {
      e.preventDefault();
      this.hide();
    });
    this.dialog.addEventListener('close', () => this.finishClose());
    // Clic fuera de la hoja (velo, escenario vacío) → cerrar
    this.dialog.addEventListener('click', (e) => {
      const target = e.target;
      if (!(target instanceof Node)) return;
      if (this.card.contains(target) || close.contains(target)) return;
      this.hide();
    });
    // Ningún toque dentro de la carta debe llegar a la escena
    this.dialog.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.scroller.addEventListener('scroll', () => this.updateScrollFades(), { passive: true });

    this.root.append(this.launch, this.dialog);
  }

  /** Muestra el botón cuando llega su momento. Se llama cada frame (barato). */
  update(world: World): void {
    const t = world.time;
    const done = world.bouquet.completeAt;
    // Solo cuando el ramo está completo (antes no hay carta)
    const due = done === null ? Infinity : done + CONFIG.timeline.letterDelay;
    const shouldShow = t >= due;
    // Salto grande hacia atrás (repetir) o adelante (?t=): cambio sin animación
    const jumped = Math.abs(t - this.lastTime) > 0.5 || t - due > 0.5;
    this.lastTime = t;
    if (shouldShow === this.shown) return;
    this.shown = shouldShow;
    if (!shouldShow) {
      this.setLaunch(false, true);
      if (this.open || this.dialog.open) this.closeNow();
      return;
    }
    this.setLaunch(true, jumped);
  }

  /** Oculta el botón y cierra la carta sin animación (botón "repetir"). */
  reset(): void {
    this.shown = false;
    this.lastTime = 0;
    this.setLaunch(false, true);
    this.closeNow();
  }

  get isOpen(): boolean {
    return this.open;
  }

  // ------------------------------------------------------------------

  private setLaunch(on: boolean, instant: boolean): void {
    const el = this.launch;
    if (instant) el.classList.add('is-instant');
    el.classList.toggle('is-on', on);
    this.button.tabIndex = on ? 0 : -1;
    if (instant) {
      void el.offsetWidth; // aplica el estado sin transición
      el.classList.remove('is-instant');
    }
  }

  private get reduced(): boolean {
    return this.reduceQuery.matches;
  }

  /** Abre la carta con la animación del sobre. */
  private show(): void {
    if (this.open) return;
    window.clearTimeout(this.closeTimer);
    const d = this.dialog;
    d.classList.remove('is-open', 'is-closing', 'is-read');
    this.scroller.scrollTop = 0;

    // Escalonado de la "tinta": cartas largas no deben hacerse esperar
    const n = this.lines.length;
    const start = this.reduced ? INK_START_REDUCED : INK_START;
    const step = Math.min(this.reduced ? 0.12 : 0.42, (this.reduced ? 1 : 3.2) / Math.max(1, n - 1));
    this.lines.forEach((line, i) => line.style.setProperty('--d', `${(start + i * step).toFixed(2)}s`));

    if (!d.open) d.showModal();
    void d.offsetWidth; // reinicia las animaciones CSS
    d.classList.add('is-open');
    this.scroller.focus({ preventScroll: true });
    this.open = true;
    this.updateScrollFades();
    // Al terminar la escritura se quitan los retrasos (reabrir/redimensionar no parpadea)
    window.clearTimeout(this.revealTimer);
    this.revealTimer = window.setTimeout(
      () => {
        if (this.open) d.classList.add('is-read');
        this.updateScrollFades();
      },
      (start + (n - 1) * step + 1.3) * 1000,
    );
    this.callbacks.onOpenChange(true);
  }

  /** Cierra con una animación breve (la hoja se pliega y se desvanece). */
  private hide(): void {
    const d = this.dialog;
    if (!this.open || d.classList.contains('is-closing')) return;
    d.classList.add('is-closing');
    window.clearTimeout(this.closeTimer);
    this.closeTimer = window.setTimeout(() => {
      if (d.open) d.close();
      else this.finishClose();
    }, this.reduced ? CLOSE_MS_REDUCED : CLOSE_MS);
  }

  /** Cierre inmediato, sin animación ni devolver el foco (reinicio). */
  private closeNow(): void {
    window.clearTimeout(this.closeTimer);
    window.clearTimeout(this.revealTimer);
    const wasOpen = this.open;
    this.open = false;
    this.dialog.classList.remove('is-open', 'is-closing', 'is-read');
    if (this.dialog.open) this.dialog.close();
    if (wasOpen) this.callbacks.onOpenChange(false);
  }

  /** Estado final tras cerrarse el <dialog> (por nosotros o por el navegador). */
  private finishClose(): void {
    window.clearTimeout(this.closeTimer);
    window.clearTimeout(this.revealTimer);
    this.dialog.classList.remove('is-open', 'is-closing', 'is-read');
    if (!this.open) return;
    this.open = false;
    this.callbacks.onOpenChange(false);
    if (this.shown) this.button.focus({ preventScroll: true });
  }

  /** Difumina los bordes del área de lectura solo donde queda texto por ver. */
  private updateScrollFades(): void {
    const s = this.scroller;
    const max = s.scrollHeight - s.clientHeight;
    this.card.classList.toggle('fade-top', s.scrollTop > 4);
    this.card.classList.toggle('fade-bottom', max > 4 && s.scrollTop < max - 4);
  }
}
