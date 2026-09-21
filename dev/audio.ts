/**
 * Banco de pruebas de la música: renderiza ~40 s en un OfflineAudioContext
 * (canción + campanitas + destellos + "duck" de la carta) y mide el resultado.
 * Expone window.__audioStats para leerlo desde un script de Playwright.
 */
import { Random } from '../src/core/math';
import { playChime, playShimmer } from '../src/audio/fx';
import { Sequencer } from '../src/audio/sequencer';
import { Synth, rampGain } from '../src/audio/synth';

const SECONDS = Math.max(10, Number(new URLSearchParams(location.search).get('seconds') ?? 40));
const RATE = 44100;
const STEP = 0.05;
/** Carta abierta entre estos segundos (para medir el duck). */
const DUCK_ON = 26;
const DUCK_OFF = 33;

interface Stats {
  seconds: number;
  peak: number;
  peakDb: number;
  nan: number;
  rmsDb: number[];
  onsets: number;
  onsetsPerSec: number;
  bellCalls: number;
  silentWindows: number[];
  duckRatio: number;
  renderMs: number;
}

const out = document.getElementById('out') as HTMLPreElement;
const playBtn = document.getElementById('play') as HTMLButtonElement;
let rendered: AudioBuffer | null = null;

const db = (v: number): number => (v > 0 ? 20 * Math.log10(v) : -Infinity);

async function render(): Promise<Stats> {
  const t0 = performance.now();
  const seed = Number(new URLSearchParams(location.search).get('seed') ?? 7) >>> 0;
  const rng = new Random(seed);
  const ctx = new OfflineAudioContext(2, Math.ceil(SECONDS * RATE), RATE);
  const synth = new Synth(ctx, rng.fork());
  const seq = new Sequencer(synth, rng.fork());
  const fxRng = rng.fork();

  // Cuenta las notas de campana programadas
  let bellCalls = 0;
  const bell = synth.bell.bind(synth);
  synth.bell = (time, midi, opts) => {
    bellCalls++;
    return bell(time, midi, opts);
  };

  // Fundido de entrada como en la escena
  rampGain(synth.fader.gain, 1, 3, 0);
  seq.reset(0.12);

  // Eventos de la escena: aperturas de flores (5-11 s), toques, estrellas fugaces
  const events: Array<[number, () => void]> = [];
  for (let i = 0; i < 14; i++) {
    const t = 5 + i * 0.45 + fxRng.next() * 0.2;
    events.push([t, () => playChime(synth, seq, fxRng, t, fxRng.next() * 2 - 1, i % 3 === 0 ? 1 : 0.6)]);
  }
  for (const t of [9.3, 18, 24.5, 36]) events.push([t, () => playShimmer(synth, fxRng, t, fxRng.next() * 2 - 1)]);
  for (const t of [14, 14.3, 21.7, 30]) events.push([t, () => playChime(synth, seq, fxRng, t, 0, 0.8)]);
  events.push([DUCK_ON, () => synth.duck(true, DUCK_ON, 0.38)]);
  events.push([DUCK_OFF, () => synth.duck(false, DUCK_OFF, 0.38)]);
  events.sort((a, b) => a[0] - b[0]);

  // Planificador por pasos: se suspende el render cada STEP y se programa lo siguiente,
  // igual que el setInterval real (así la poda de voces ve el tiempo correcto).
  const lookahead = 0.15;
  let ev = 0;
  const pumpAt = (now: number): void => {
    seq.pump(now + lookahead, now);
    while (ev < events.length && (events[ev]?.[0] ?? Infinity) < now + lookahead) {
      events[ev]?.[1]();
      ev++;
    }
  };
  for (let t = STEP; t < SECONDS - STEP; t += STEP) {
    const at = Math.round(t / STEP) * STEP;
    void ctx.suspend(at).then(() => {
      pumpAt(ctx.currentTime);
      void ctx.resume();
    });
  }
  pumpAt(0);
  const buf = await ctx.startRendering();
  rendered = buf;

  // Medidas
  const L = buf.getChannelData(0);
  const R = buf.getChannelData(1);
  let peak = 0;
  let nan = 0;
  const win = 5 * RATE;
  const rmsDb: number[] = [];
  let sum = 0;
  for (let i = 0; i < L.length; i++) {
    const l = L[i] ?? 0;
    const r = R[i] ?? 0;
    if (!Number.isFinite(l) || !Number.isFinite(r)) {
      nan++;
      continue;
    }
    peak = Math.max(peak, Math.abs(l), Math.abs(r));
    sum += (l * l + r * r) / 2;
    if ((i + 1) % win === 0) {
      rmsDb.push(Math.round(db(Math.sqrt(sum / win)) * 10) / 10);
      sum = 0;
    }
  }
  // Ventanas de 1 s casi mudas (< -50 dBFS)
  const silentWindows: number[] = [];
  for (let s = 0; s + RATE <= L.length; s += RATE) {
    let acc = 0;
    for (let i = s; i < s + RATE; i++) acc += (L[i] ?? 0) ** 2;
    if (db(Math.sqrt(acc / RATE)) < -50) silentWindows.push(s / RATE);
  }
  // Ataques: aumento brusco de energía en tramas de 10 ms (sólo como estimación)
  const frame = Math.floor(RATE * 0.01);
  let prev = 0;
  let onsets = 0;
  let refractory = 0;
  for (let s = 0; s + frame <= L.length; s += frame) {
    let acc = 0;
    for (let i = s; i < s + frame; i++) acc += Math.abs(L[i] ?? 0) + Math.abs(R[i] ?? 0);
    const e = acc / frame;
    if (refractory > 0) refractory--;
    else if (e > prev * 1.25 + 0.002) {
      onsets++;
      refractory = 6;
    }
    prev = prev * 0.6 + e * 0.4;
  }
  // Duck: RMS 2 s antes de abrir la carta frente a 2 s con la carta abierta
  const rmsRange = (a: number, b: number): number => {
    let acc = 0;
    const i0 = Math.floor(a * RATE);
    const i1 = Math.floor(b * RATE);
    for (let i = i0; i < i1; i++) acc += (L[i] ?? 0) ** 2 + (R[i] ?? 0) ** 2;
    return Math.sqrt(acc / (2 * (i1 - i0)));
  };
  const duckRatio = rmsRange(DUCK_ON + 2, DUCK_OFF) / rmsRange(DUCK_ON - 5, DUCK_ON);

  return {
    seconds: SECONDS,
    peak: Math.round(peak * 1000) / 1000,
    peakDb: Math.round(db(peak) * 10) / 10,
    nan,
    rmsDb,
    onsets,
    onsetsPerSec: Math.round((onsets / SECONDS) * 100) / 100,
    bellCalls,
    silentWindows,
    duckRatio: Math.round(duckRatio * 1000) / 1000,
    renderMs: Math.round(performance.now() - t0),
  };
}

async function run(): Promise<void> {
  out.textContent = 'Renderizando…';
  try {
    const stats = await render();
    (window as unknown as { __audioStats?: Stats }).__audioStats = stats;
    out.textContent = JSON.stringify(stats, null, 2);
    playBtn.disabled = false;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    (window as unknown as { __audioError?: string }).__audioError = msg;
    out.textContent = `Error: ${msg}`;
  }
}

document.getElementById('render')?.addEventListener('click', () => void run());
playBtn.addEventListener('click', () => {
  if (!rendered) return;
  const ctx = new AudioContext();
  const src = ctx.createBufferSource();
  src.buffer = rendered;
  src.connect(ctx.destination);
  src.start();
});
if (new URLSearchParams(location.search).has('run')) void run();
