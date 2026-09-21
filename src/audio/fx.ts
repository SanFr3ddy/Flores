/**
 * Efectos sueltos que acompañan a la escena: campanita (flor que se abre,
 * toque) y destello ascendente (estrella fugaz, constelación). Separados de
 * Music para poder renderizarlos también en un OfflineAudioContext.
 */
import type { Random } from '../core/math';
import type { Sequencer } from './sequencer';
import type { Synth } from './synth';
import { CHIME_NOTES, nearestWithPc } from './theory';

export const clampPan = (p: number): number => (Number.isFinite(p) ? Math.max(-1, Math.min(1, p)) : 0);

/** Campanita aguda que armoniza con el acorde que suena. Devuelve cuándo termina. */
export function playChime(synth: Synth, seq: Sequencer, rng: Random, time: number, pan: number, intensity: number): number {
  const chord = seq.chordAt(time);
  let midi = rng.pick(CHIME_NOTES);
  // Prefiere notas del acorde para que siempre suene consonante
  if (rng.chance(0.65)) {
    const candidate = nearestWithPc(rng.pick(chord.tones), midi);
    if (candidate >= 84 && candidate <= 100) midi = candidate;
  }
  const k = Math.max(0.1, Math.min(1.2, Number.isFinite(intensity) ? intensity : 1));
  return synth.bell(time, midi, {
    velocity: (0.3 + 0.12 * rng.next()) * k,
    pan: clampPan(pan),
    reverb: 0.55,
    delay: 0.3,
    dry: 0.8,
    decay: 1.4,
    bright: 0.85,
  });
}

/** Glissando suave y ascendente de campanitas (pentatónica), muy mojado de reverb. */
export function playShimmer(synth: Synth, rng: Random, time: number, pan: number, gain = 1): void {
  const count = 7;
  const startIdx = rng.int(0, 2);
  const p = clampPan(pan);
  for (let i = 0; i < count; i++) {
    const idx = startIdx + i;
    const midi = (CHIME_NOTES[idx % CHIME_NOTES.length] ?? 84) + (idx >= CHIME_NOTES.length ? 12 : 0);
    const tail = i / (count - 1);
    synth.bell(time + i * 0.035 + rng.next() * 0.008, Math.min(103, midi), {
      velocity: (0.13 + 0.07 * Math.sin(Math.PI * tail)) * gain,
      pan: clampPan(p + (tail - 0.5) * 0.5),
      reverb: 0.95,
      delay: 0.25,
      dry: 0.35,
      decay: 1.2,
      bright: 0.9,
    });
  }
}
