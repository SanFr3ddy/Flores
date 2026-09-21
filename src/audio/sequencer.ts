/**
 * Secuenciador: recorre la partitura compás a compás y programa las voces
 * con un poco de anticipación. Cada vuelta añade variaciones con semilla
 * (adornos, cambios de octava, silencios, ecos) para que no canse.
 */
import type { Rng, Synth } from './synth';
import {
  BAR,
  BEAT,
  CHORDS,
  SONG,
  nearestWithPc,
  scaleStep,
  type Chord,
} from './theory';

/** Evento listo para sonar (se reutilizan: pool fijo). */
interface NoteEvent {
  time: number;
  kind: 0 | 1 | 2; // 0 campana, 1 pad, 2 bajo
  midi: number;
  vel: number;
  pan: number;
  dur: number;
  reverb: number;
  bright: number;
  notes: number[];
}

/** Estilos de acompañamiento de la caja musical (por frase). */
const Accomp = {
  Waltz: 0, // tiempos 2 y 3
  Flow: 1, // corcheas arpegiadas
  Sparse: 2, // una sola nota en el tiempo 2
} as const;
type Accomp = (typeof Accomp)[keyof typeof Accomp];

const POOL_SIZE = 64;

export class Sequencer {
  /** Compás actual dentro de la canción (0..31) y número de vuelta. */
  private bar = 0;
  private loop = 0;
  private nextBarTime = 0;
  private readonly queue: NoteEvent[] = [];
  private readonly pool: NoteEvent[] = [];
  /** Acorde que suena y desde cuándo (para las campanitas externas). */
  private chordNow: Chord = CHORDS.C;
  private chordNext: Chord = CHORDS.C;
  private chordNextAt = 0;
  // Decisiones por frase
  private accomp: Accomp = Accomp.Waltz;
  private octave = 0;

  constructor(
    private readonly synth: Synth,
    private readonly rng: Rng,
  ) {
    for (let i = 0; i < POOL_SIZE; i++) {
      this.pool.push({ time: 0, kind: 0, midi: 0, vel: 0, pan: 0, dur: 0, reverb: 0, bright: 0, notes: [] });
    }
  }

  /** Empieza desde el compás `bar` (y vuelta `loop`) en el instante `time`. */
  reset(time: number, bar = 0, loop = 0): void {
    while (this.queue.length) this.release(this.queue.pop());
    this.bar = bar % SONG.length;
    this.loop = loop;
    this.nextBarTime = time;
    this.chordNow = SONG[this.bar]?.chord ?? CHORDS.C;
    this.chordNext = this.chordNow;
    this.chordNextAt = time;
  }

  /** Acorde que suena en `time` (aproximado, basta para elegir campanitas). */
  chordAt(time: number): Chord {
    return time >= this.chordNextAt ? this.chordNext : this.chordNow;
  }

  /** Programa todo lo que ocurra antes de `until`. Descarta lo que ya pasó. */
  pump(until: number, now: number): void {
    // Si el reloj se atrasó mucho (pestaña congelada), se re-sincroniza.
    if (this.nextBarTime < now - 1) this.nextBarTime = now + 0.1;
    while (this.nextBarTime < until) this.composeBar();
    // Orden por tiempo: la cola es pequeña, basta inserción simple al componer.
    while (this.queue.length) {
      const e = this.queue[0];
      if (!e || e.time >= until) break;
      this.queue.shift();
      if (e.time >= now - 0.03) this.play(e);
      this.release(e);
    }
  }

  private take(): NoteEvent {
    const e = this.pool.pop();
    if (e) return e;
    return { time: 0, kind: 0, midi: 0, vel: 0, pan: 0, dur: 0, reverb: 0, bright: 0, notes: [] };
  }

  private release(e: NoteEvent | undefined): void {
    if (e && this.pool.length < POOL_SIZE) this.pool.push(e);
  }

  private push(e: NoteEvent): void {
    // Inserción ordenada (la cola rara vez supera ~20 eventos)
    let i = this.queue.length;
    while (i > 0 && (this.queue[i - 1]?.time ?? 0) > e.time) i--;
    this.queue.splice(i, 0, e);
  }

  private bellEvent(time: number, midi: number, vel: number, pan: number, reverb: number, bright: number): void {
    const e = this.take();
    e.kind = 0;
    e.time = time;
    e.midi = midi;
    e.vel = vel;
    e.pan = pan;
    e.dur = 0;
    e.reverb = reverb;
    e.bright = bright;
    this.push(e);
  }

  private jitter(amount: number): number {
    return (this.rng.next() * 2 - 1) * amount;
  }

  /** Decide el carácter de la frase que empieza (cada 4 compases). */
  private planPhrase(): void {
    const phrase = Math.floor(this.bar / 4);
    const r = this.rng;
    if (this.loop === 0) {
      // Primera vuelta: presentación sencilla y clara
      this.accomp = phrase === 0 ? Accomp.Sparse : phrase % 2 === 0 ? Accomp.Waltz : Accomp.Flow;
      this.octave = 0;
      return;
    }
    const a = r.next();
    this.accomp = a < 0.4 ? Accomp.Flow : a < 0.8 ? Accomp.Waltz : Accomp.Sparse;
    const o = r.next();
    // A veces la frase sube una octava (más cristalina) o baja (más íntima)
    this.octave = o < 0.14 ? 12 : o < 0.24 ? -12 : 0;
  }

  /** Compone y encola un compás completo. */
  private composeBar(): void {
    const t0 = this.nextBarTime;
    const barData = SONG[this.bar] ?? SONG[0];
    if (!barData) return;
    if (this.bar % 4 === 0) this.planPhrase();
    const { chord, melody } = barData;
    const r = this.rng;
    const varied = this.loop > 0;
    const endOfSection = this.bar === 15 || this.bar === 31;

    this.chordNow = this.chordNext;
    this.chordNext = chord;
    this.chordNextAt = t0;

    // Pad y bajo
    const pad = this.take();
    pad.kind = 1;
    pad.time = t0;
    pad.dur = BAR * 0.98;
    pad.vel = 1;
    pad.notes.length = 0;
    for (const pc of chord.tones) pad.notes.push(nearestWithPc(pc, 60));
    this.push(pad);

    const bass = this.take();
    bass.kind = 2;
    bass.time = t0 + this.jitter(0.004);
    bass.midi = nearestWithPc(chord.root, 43);
    bass.vel = 0.85 + this.jitter(0.1);
    bass.dur = BAR * 0.8;
    this.push(bass);

    // Melodía
    let octave = this.octave;
    for (const n of melody) {
      const m = n.midi + octave;
      if (m > 100 || m < 67) octave = 0;
    }
    for (let i = 0; i < melody.length; i++) {
      const n = melody[i];
      if (!n) continue;
      const first = i === 0;
      const last = i === melody.length - 1;
      // Silencio ocasional en notas de paso (nunca la primera ni la última)
      if (varied && !first && !last && n.len <= 0.5 && r.next() < 0.08) continue;
      const midi = n.midi + octave;
      const time = t0 + n.beat * BEAT + this.jitter(0.006);
      // Acento natural del 3/4: el primer tiempo pesa más
      const accent = n.beat === 0 ? 1 : n.beat % 1 === 0 ? 0.86 : 0.74;
      const vel = (0.62 + 0.14 * r.next()) * accent * (n.len >= 1.5 ? 1.05 : 1);
      const pan = this.jitter(0.12);
      this.bellEvent(time, midi, vel, pan, 0.35, 0.55);

      // Adorno: nota de gracia que cae hacia la principal
      if (varied && n.len >= 1 && r.next() < 0.14) {
        const grace = scaleStep(midi, r.next() < 0.6 ? 1 : -1);
        this.bellEvent(time - 0.07, grace, vel * 0.5, pan, 0.35, 0.5);
      }
      // Eco suave en notas largas: una nota del acorde, más arriba
      if (n.len >= 1.5 && (varied ? r.next() < 0.35 : endOfSection)) {
        const pc = chord.tones[1 + Math.floor(r.next() * (chord.tones.length - 1))] ?? chord.root;
        const echo = Math.min(100, nearestWithPc(pc, midi + 7));
        this.bellEvent(time + BEAT * (n.len >= 3 ? 1.5 : 1), echo, vel * 0.42, -pan * 2, 0.55, 0.7);
      }
    }

    // Acompañamiento de caja musical en registro medio
    const low = [...chord.tones].map((pc) => nearestWithPc(pc, 62)).sort((a, b) => a - b);
    const root = nearestWithPc(chord.root, 55);
    const v = 0.26;
    switch (this.accomp) {
      case Accomp.Waltz: {
        const hi = low.slice(-2);
        for (const beat of [1, 2]) {
          for (const m of hi) this.bellEvent(t0 + beat * BEAT + this.jitter(0.008), m, v * (beat === 1 ? 1 : 0.85), -0.3, 0.3, 0.2);
        }
        break;
      }
      case Accomp.Flow: {
        // Arpegio ascendente-descendente en corcheas
        const a = low[0] ?? root;
        const b = low[1] ?? a + 4;
        const c = low[2] ?? a + 7;
        for (let k = 0; k < 6; k++) {
          const m = k === 0 ? root : k === 1 ? b : k === 2 ? c : k === 3 ? a + 12 : k === 4 ? c : b;
          this.bellEvent(t0 + k * BEAT * 0.5 + this.jitter(0.007), m, v * (k === 0 ? 0.95 : 0.7), k % 2 ? 0.3 : -0.3, 0.3, 0.2);
        }
        break;
      }
      case Accomp.Sparse: {
        const m = low[low.length - 1] ?? root + 7;
        this.bellEvent(t0 + BEAT + this.jitter(0.008), m, v * 0.9, -0.25, 0.4, 0.2);
        break;
      }
    }

    // Avanza
    this.nextBarTime += BAR;
    this.bar++;
    if (this.bar >= SONG.length) {
      this.bar = 0;
      this.loop++;
    }
  }

  private play(e: NoteEvent): void {
    const s = this.synth;
    if (e.kind === 0) {
      s.bell(e.time, e.midi, { velocity: e.vel, pan: e.pan, reverb: e.reverb, delay: e.midi > 76 ? 0.14 : 0, bright: e.bright });
    } else if (e.kind === 1) {
      s.pad(e.time, e.notes, e.dur, 0.028);
    } else {
      s.bass(e.time, e.midi, 0.2 * e.vel, e.dur);
    }
  }
}
