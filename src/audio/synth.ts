/**
 * Síntesis: grafo de efectos (reverb, eco ping-pong, compresor) y voces
 * (campana de caja musical, pad y bajo). Funciona igual en AudioContext
 * y en OfflineAudioContext, así se puede medir sin escuchar.
 */
import { midiToHz } from './theory';

/** Fuente de azar mínima (Random de core/math la cumple). */
export interface Rng {
  next(): number;
}

export interface BellOptions {
  /** 0..1 */
  velocity: number;
  /** -1 izquierda .. 1 derecha */
  pan?: number;
  /** Cantidad enviada a la reverb (0..1). */
  reverb?: number;
  /** Cantidad enviada al eco (0..1). */
  delay?: number;
  /** Nivel de la señal directa (0..1). */
  dry?: number;
  /** Multiplica la duración de las caídas. */
  decay?: number;
  /** Brillo: 0 = parciales altos suaves, 1 = muy brillante. */
  bright?: number;
}

interface Voice {
  end: number;
  out: GainNode;
  oscs: OscillatorNode[];
}

/* Parciales de la caja musical: ligeramente inarmónicos en los agudos. */
const RATIOS = [1, 2, 3.01, 4.16, 5.43, 7.07];
const AMPS = [1, 0.42, 0.24, 0.12, 0.07, 0.05];
const DECAYS = [2.6, 1.5, 0.9, 0.55, 0.35, 0.08]; // T60 aproximado (s) en C5

/** Límite de voces de campana simultáneas (protege la CPU). */
const MAX_VOICES = 32;
/** Tiempo de ataque de la campana (s). */
const ATTACK = 0.003;
/** Nivel de salida de referencia (se calibró midiendo picos en render offline). */
const OUTPUT_LEVEL = 0.58;

export class Synth {
  readonly ctx: BaseAudioContext;
  /** Ganancia para fundidos y silencio (0..1). */
  readonly fader: GainNode;
  /** Ganancia independiente para bajar la música mientras se lee la carta. */
  readonly ducker: GainNode;
  private readonly dryBus: GainNode;
  private readonly reverbBus: GainNode;
  private readonly delayBus: GainNode;
  private readonly padBus: GainNode;
  private readonly voices: Voice[] = [];
  private readonly pads: Voice[] = [];
  private readonly hasPanner: boolean;

  constructor(ctx: BaseAudioContext, private readonly rng: Rng) {
    this.ctx = ctx;
    this.hasPanner = typeof ctx.createStereoPanner === 'function';

    // Salida: filtro suave → compresor → nivel → fader → altavoces
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 7200;
    tone.Q.value = 0.4;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 10;
    comp.ratio.value = 4;
    comp.attack.value = 0.004;
    comp.release.value = 0.25;
    const level = ctx.createGain();
    level.gain.value = OUTPUT_LEVEL;
    this.fader = ctx.createGain();
    this.fader.gain.value = 0;
    this.ducker = ctx.createGain();
    this.ducker.gain.value = 1;
    // El "duck" va en serie con el fader: silencio y carta se combinan sin pisarse
    tone.connect(comp).connect(level).connect(this.fader).connect(this.ducker).connect(ctx.destination);

    this.dryBus = ctx.createGain();
    this.dryBus.connect(tone);

    // Reverb por convolución con respuesta generada (ruido que se apaga ~3.6 s)
    this.reverbBus = ctx.createGain();
    const conv = ctx.createConvolver();
    conv.normalize = true;
    conv.buffer = this.makeImpulse(3.6);
    const reverbReturn = ctx.createGain();
    reverbReturn.gain.value = 0.55;
    const reverbHp = ctx.createBiquadFilter();
    reverbHp.type = 'highpass';
    reverbHp.frequency.value = 180;
    this.reverbBus.connect(reverbHp).connect(conv).connect(reverbReturn).connect(tone);

    // Eco ping-pong con realimentación filtrada
    this.delayBus = ctx.createGain();
    const dl = ctx.createDelay(2);
    const dr = ctx.createDelay(2);
    dl.delayTime.value = 0.64;
    dr.delayTime.value = 0.64;
    const fbL = ctx.createGain();
    const fbR = ctx.createGain();
    fbL.gain.value = 0.38;
    fbR.gain.value = 0.38;
    const damp = ctx.createBiquadFilter();
    damp.type = 'lowpass';
    damp.frequency.value = 2600;
    const merger = ctx.createChannelMerger(2);
    const delayReturn = ctx.createGain();
    delayReturn.gain.value = 0.5;
    this.delayBus.connect(damp).connect(dl);
    dl.connect(fbL).connect(dr);
    dr.connect(fbR).connect(dl);
    dl.connect(merger, 0, 0);
    dr.connect(merger, 0, 1);
    merger.connect(delayReturn).connect(tone);
    delayReturn.connect(this.reverbBus);

    // Pad: paso bajo global ~900 Hz y parte a la reverb
    this.padBus = ctx.createGain();
    const padLp = ctx.createBiquadFilter();
    padLp.type = 'lowpass';
    padLp.frequency.value = 900;
    padLp.Q.value = 0.3;
    const padSend = ctx.createGain();
    padSend.gain.value = 0.5;
    this.padBus.connect(padLp);
    padLp.connect(this.dryBus);
    padLp.connect(padSend).connect(this.reverbBus);
  }

  /** Respuesta al impulso estéreo: ruido oscurecido con caída exponencial. */
  private makeImpulse(seconds: number): AudioBuffer {
    const rate = this.ctx.sampleRate;
    const len = Math.floor(rate * seconds);
    const buf = this.ctx.createBuffer(2, len, rate);
    const pre = Math.floor(rate * 0.012);
    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch);
      let lp = 0;
      for (let i = pre; i < len; i++) {
        const t = (i - pre) / rate;
        // Más oscura cuanto más tarde (el aire absorbe los agudos)
        const k = 0.55 + 0.4 * Math.min(1, t / seconds);
        lp = lp * k + (this.rng.next() * 2 - 1) * (1 - k);
        const env = Math.exp((-6.9 * t) / seconds) * Math.min(1, t / 0.03);
        data[i] = lp * env * 3;
      }
    }
    return buf;
  }

  /** Quita de la lista las voces que ya terminaron. */
  private prune(now: number): void {
    for (let i = this.voices.length - 1; i >= 0; i--) {
      const v = this.voices[i];
      if (v && v.end < now) this.voices.splice(i, 1);
    }
  }

  /** Apaga rápido la voz más antigua para respetar el límite. */
  private steal(when: number): void {
    const v = this.voices.shift();
    if (!v) return;
    v.out.gain.cancelScheduledValues(when);
    v.out.gain.setTargetAtTime(0, when, 0.015);
    for (const o of v.oscs) {
      try {
        o.stop(when + 0.12);
      } catch {
        /* ya estaba programado antes */
      }
    }
  }

  /** Nodo de salida de una voz: panorama + envíos. Devuelve el punto de entrada. */
  private route(opts: BellOptions, disposables: AudioNode[]): GainNode {
    const ctx = this.ctx;
    const out = ctx.createGain();
    disposables.push(out);
    let tail: AudioNode = out;
    const pan = opts.pan ?? 0;
    if (pan !== 0 && this.hasPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      out.connect(p);
      tail = p;
      disposables.push(p);
    }
    const dry = opts.dry ?? 1;
    if (dry > 0) {
      if (dry === 1) tail.connect(this.dryBus);
      else {
        const g = ctx.createGain();
        g.gain.value = dry;
        tail.connect(g).connect(this.dryBus);
        disposables.push(g);
      }
    }
    const rv = opts.reverb ?? 0;
    if (rv > 0) {
      const g = ctx.createGain();
      g.gain.value = rv;
      tail.connect(g).connect(this.reverbBus);
      disposables.push(g);
    }
    const dy = opts.delay ?? 0;
    if (dy > 0) {
      const g = ctx.createGain();
      g.gain.value = dy;
      tail.connect(g).connect(this.delayBus);
      disposables.push(g);
    }
    return out;
  }

  /** Campana de caja musical: parciales senoidales con caídas exponenciales. */
  bell(time: number, midi: number, opts: BellOptions): number {
    const ctx = this.ctx;
    const now = ctx.currentTime;
    if (time < now) time = now;
    this.prune(now);
    if (this.voices.length >= MAX_VOICES) this.steal(Math.max(now, time - 0.02));

    const disposables: AudioNode[] = [];
    const out = this.route(opts, disposables);
    const vel = Math.max(0.02, Math.min(1, opts.velocity));
    const bright = opts.bright ?? 0.5;
    // Las notas agudas se apagan antes, como en un peine metálico real
    const pitchDecay = Math.pow(2, -(midi - 72) / 24) * (opts.decay ?? 1);
    const detune = (this.rng.next() * 2 - 1) * 5;
    const f0 = midiToHz(midi);
    const nyquist = ctx.sampleRate * 0.45;
    let end = time;
    const oscs: OscillatorNode[] = [];
    // Tocar fuerte también abre el timbre
    const brightness = 0.55 + 0.5 * bright + 0.35 * vel;

    for (let p = 0; p < RATIOS.length; p++) {
      const ratio = RATIOS[p] ?? 1;
      const f = f0 * ratio;
      if (f > nyquist) break;
      let amp = (AMPS[p] ?? 0) * (p === 0 ? 1 : Math.pow(brightness, p * 0.7));
      if (p === RATIOS.length - 1) amp *= bright; // "clic" metálico del ataque
      if (amp < 0.004) continue;
      const t60 = Math.max(0.05, (DECAYS[p] ?? 1) * pitchDecay);
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = f;
      osc.detune.value = detune + (p > 1 ? (this.rng.next() * 2 - 1) * 3 : 0);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, time);
      g.gain.linearRampToValueAtTime(amp * vel, time + ATTACK);
      g.gain.setTargetAtTime(0, time + ATTACK, t60 / 6.9);
      osc.connect(g).connect(out);
      const stop = time + ATTACK + t60 * 1.05;
      osc.start(time);
      osc.stop(stop);
      if (stop > end) end = stop;
      oscs.push(osc);
      disposables.push(g);
    }

    const voice: Voice = { end, out, oscs };
    this.voices.push(voice);
    // Desconecta todo al terminar la última parcial
    const last = oscs[0];
    if (last) {
      last.onended = () => {
        for (const o of oscs) o.disconnect();
        for (const n of disposables) n.disconnect();
      };
    }
    return end;
  }

  /** Acorde sostenido suave (triángulos desafinados), entra y sale despacio. */
  pad(time: number, notes: readonly number[], duration: number, level: number): void {
    const ctx = this.ctx;
    const g = ctx.createGain();
    const attack = Math.min(1.4, duration * 0.45);
    const release = 1.8;
    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(level, time + attack);
    g.gain.setValueAtTime(level, time + duration);
    g.gain.setTargetAtTime(0, time + duration, release / 5);
    g.connect(this.padBus);
    const stop = time + duration + release * 1.1;
    const oscs: OscillatorNode[] = [];
    const now = ctx.currentTime;
    for (let i = this.pads.length - 1; i >= 0; i--) if ((this.pads[i]?.end ?? 0) < now) this.pads.splice(i, 1);
    this.pads.push({ end: stop, out: g, oscs });
    for (const n of notes) {
      for (const cents of [-7, 6]) {
        const o = ctx.createOscillator();
        o.type = 'triangle';
        o.frequency.value = midiToHz(n);
        o.detune.value = cents + (this.rng.next() * 2 - 1) * 2;
        o.connect(g);
        o.start(time);
        o.stop(stop);
        oscs.push(o);
      }
    }
    const first = oscs[0];
    if (first) {
      first.onended = () => {
        for (const o of oscs) o.disconnect();
        g.disconnect();
      };
    }
  }

  /** Bajo senoidal suave en el primer tiempo, con un poco de 2º armónico para altavoces pequeños. */
  bass(time: number, midi: number, velocity: number, duration: number): void {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(velocity, time + 0.03);
    g.gain.setTargetAtTime(velocity * 0.55, time + 0.03, 0.4);
    g.gain.setTargetAtTime(0, time + duration, 0.35);
    g.connect(this.dryBus);
    const stop = time + duration + 1.8;
    const o1 = ctx.createOscillator();
    o1.type = 'sine';
    o1.frequency.value = midiToHz(midi);
    const o2 = ctx.createOscillator();
    o2.type = 'sine';
    o2.frequency.value = midiToHz(midi + 12);
    const g2 = ctx.createGain();
    g2.gain.value = 0.22;
    o1.connect(g);
    o2.connect(g2).connect(g);
    o1.start(time);
    o2.start(time);
    o1.stop(stop);
    o2.stop(stop);
    o1.onended = () => {
      o1.disconnect();
      o2.disconnect();
      g2.disconnect();
      g.disconnect();
    };
  }

  /** Corta todas las campanas activas (reinicio). */
  silenceAll(when: number): void {
    while (this.voices.length) this.steal(when);
    for (const p of this.pads) {
      p.out.gain.cancelScheduledValues(when);
      p.out.gain.setTargetAtTime(0, when, 0.05);
      for (const o of p.oscs) {
        try {
          o.stop(when + 0.4);
        } catch {
          /* ya detenido */
        }
      }
    }
    this.pads.length = 0;
  }

  /** Baja (on) o recupera la música con una rampa suave desde el valor actual. */
  duck(on: boolean, when: number, level = 0.38): void {
    rampGain(this.ducker.gain, on ? level : 1, on ? 0.8 : 1.2, when);
  }

  /** Voces de campana activas (para límites externos). */
  activeVoices(now: number): number {
    this.prune(now);
    return this.voices.length;
  }
}

type HoldableParam = AudioParam & { cancelAndHoldAtTime?: (t: number) => AudioParam };

/**
 * Rampa de ganancia que parte del valor real en `when` (aunque haya otra rampa
 * en curso). Entre valores audibles la curva es exponencial (natural al oído);
 * desde o hacia el silencio es lineal, que no se queda muda al principio.
 */
export function rampGain(param: AudioParam, target: number, seconds: number, when: number): void {
  const p = param as HoldableParam;
  const current = p.value;
  if (typeof p.cancelAndHoldAtTime === 'function') p.cancelAndHoldAtTime(when);
  else {
    p.cancelScheduledValues(when);
    p.setValueAtTime(current, when);
  }
  const end = when + Math.max(0.01, seconds);
  if (target > 0.0001 && current > 0.0001) {
    p.exponentialRampToValueAtTime(target, end);
  } else {
    p.linearRampToValueAtTime(target, end);
  }
}
