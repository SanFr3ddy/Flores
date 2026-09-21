/**
 * Música generativa con Web Audio: canción de cuna original de caja musical
 * sobre un pad muy suave, con reverb y eco. Todo sintetizado, sin archivos.
 */
import { CONFIG, DEBUG } from '../config';
import { Random } from '../core/math';
import { playChime, playShimmer } from './fx';
import { Sequencer } from './sequencer';
import { Synth, rampGain } from './synth';

/** Cada cuánto corre el planificador (ms) y cuánto adelanta (s). */
const TICK_MS = 25;
const LOOKAHEAD = 0.15;
const FADE_IN = 3;
const MUTE_FADE = 0.5;
/** Límites de las campanitas externas. */
const CHIME_MIN_GAP = 0.07;
const CHIME_MAX_FLIGHT = 8;
const SHIMMER_MIN_GAP = 0.4;
/** Volumen relativo mientras la carta está abierta. */
const DUCK_LEVEL = 0.38;

type AudioCtor = typeof AudioContext;

function audioCtor(): AudioCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { AudioContext?: AudioCtor; webkitAudioContext?: AudioCtor };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

export class Music {
  private isMuted = false;
  private isDucked = false;
  private ctx: AudioContext | null = null;
  private synth: Synth | null = null;
  private seq: Sequencer | null = null;
  private readonly rng = new Random((DEBUG.seed ^ 0x5eed) >>> 0);
  private lastChime = -1;
  private readonly chimeEnds: number[] = [];
  private lastShimmer = -1;
  /** Invalida suspensiones/reanudaciones pendientes cuando cambia el estado. */
  private stateToken = 0;
  private restartTimer: number | null = null;

  /** Debe llamarse dentro de un gesto del usuario (clic) para desbloquear el audio. */
  start(): void {
    if (this.ctx) {
      // Algunos navegadores lo dejan suspendido hasta el gesto: reintenta.
      if (!this.isMuted && this.ctx.state === 'suspended' && !document.hidden) void this.ctx.resume().catch(() => {});
      return;
    }
    const Ctor = audioCtor();
    if (!Ctor) return;
    let ctx: AudioContext;
    let synth: Synth;
    try {
      ctx = new Ctor({ latencyHint: 'playback' });
      synth = new Synth(ctx, this.rng.fork(), CONFIG.music.volume);
    } catch {
      return;
    }
    this.ctx = ctx;
    this.synth = synth;
    this.seq = new Sequencer(synth, this.rng.fork());
    this.seq.reset(ctx.currentTime + 0.12);

    if (this.isMuted || document.hidden) {
      void ctx.suspend().catch(() => {});
    } else {
      void ctx.resume().catch(() => {});
      this.fadeTo(1, FADE_IN);
    }

    // El planificador vive lo mismo que la página; no se detiene nunca.
    window.setInterval(() => this.tick(), TICK_MS);
    document.addEventListener('visibilitychange', this.onVisibility);
    this.tick();
  }

  get muted(): boolean {
    return this.isMuted;
  }

  setMuted(muted: boolean): void {
    if (muted === this.isMuted) return;
    this.isMuted = muted;
    const ctx = this.ctx;
    if (!ctx) return;
    const token = ++this.stateToken;
    if (muted) {
      this.fadeTo(0, MUTE_FADE);
      window.setTimeout(() => {
        if (token === this.stateToken && this.isMuted) void ctx.suspend().catch(() => {});
      }, MUTE_FADE * 1000 + 60);
    } else {
      if (document.hidden) return; // se reanudará al volver a la pestaña
      void ctx
        .resume()
        .then(() => {
          if (token !== this.stateToken || this.isMuted) return;
          this.tick();
          this.fadeTo(1, 1.2);
        })
        .catch(() => {});
    }
  }

  /** Alterna silencio; devuelve el nuevo estado (true = silenciado). */
  toggle(): boolean {
    this.setMuted(!this.isMuted);
    return this.isMuted;
  }

  /** Campanita suave (flor que se abre, toque en pantalla). pan: -1 izquierda .. 1 derecha. */
  chime(pan = 0, intensity = 1): void {
    const { ctx, synth, seq } = this;
    if (!ctx || !synth || !seq || this.isMuted || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    if (now - this.lastChime < CHIME_MIN_GAP) return;
    this.pruneChimes(now);
    if (this.chimeEnds.length >= CHIME_MAX_FLIGHT) return;
    this.lastChime = now;
    this.chimeEnds.push(playChime(synth, seq, this.rng, now + 0.01, pan, intensity * CONFIG.music.chimes));
  }

  /** Destello brillante (estrella fugaz, constelación). */
  shimmer(pan = 0): void {
    const { ctx, synth } = this;
    if (!ctx || !synth || this.isMuted || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    if (now - this.lastShimmer < SHIMMER_MIN_GAP) return;
    this.lastShimmer = now;
    playShimmer(synth, this.rng, now + 0.02, pan, CONFIG.music.chimes);
  }

  /** Reinicia la melodía desde el principio. */
  restart(): void {
    const { ctx, synth, seq } = this;
    if (!ctx || !synth || !seq) return;
    if (this.restartTimer !== null) window.clearTimeout(this.restartTimer);
    this.restartTimer = null;
    // La repetición empieza con la carta cerrada
    this.duck(false);
    if (this.isMuted || ctx.state !== 'running') {
      // En silencio: se reinicia directamente, sin fundidos.
      synth.silenceAll(ctx.currentTime);
      seq.reset(ctx.currentTime + 0.12);
      return;
    }
    this.fadeTo(0, 0.4);
    this.restartTimer = window.setTimeout(() => {
      this.restartTimer = null;
      const now = ctx.currentTime;
      synth.silenceAll(now);
      seq.reset(now + 0.25);
      if (!this.isMuted) this.fadeTo(1, 1.5);
    }, 450);
  }

  /**
   * Baja suavemente el volumen mientras se lee la carta (on = true) y lo
   * recupera al cerrarla. Usa su propia ganancia, independiente del silencio.
   */
  duck(on: boolean): void {
    const { ctx, synth } = this;
    if (!ctx || !synth || on === this.isDucked) return;
    this.isDucked = on;
    synth.duck(on, ctx.currentTime, DUCK_LEVEL);
  }

  /* ---------------------------------------------------------------- */

  private tick(): void {
    const { ctx, seq } = this;
    if (!ctx || !seq || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    seq.pump(now + LOOKAHEAD, now);
  }

  private fadeTo(target: number, seconds: number): void {
    const { ctx, synth } = this;
    if (!ctx || !synth) return;
    rampGain(synth.fader.gain, target, seconds, ctx.currentTime);
  }

  private pruneChimes(now: number): void {
    let w = 0;
    for (let i = 0; i < this.chimeEnds.length; i++) {
      const e = this.chimeEnds[i] ?? 0;
      if (e > now) this.chimeEnds[w++] = e;
    }
    this.chimeEnds.length = w;
  }

  private readonly onVisibility = (): void => {
    const ctx = this.ctx;
    if (!ctx) return;
    const token = ++this.stateToken;
    if (document.hidden) {
      void ctx.suspend().catch(() => {});
    } else if (!this.isMuted) {
      void ctx
        .resume()
        .then(() => {
          if (token !== this.stateToken || this.isMuted) return;
          this.tick();
          // Si la pestaña se ocultó a mitad de un fundido, lo termina
          if (this.synth && this.synth.fader.gain.value < 0.99) this.fadeTo(1, 1);
        })
        .catch(() => {});
    }
  };
}
