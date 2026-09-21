/**
 * Teoría y partitura: acordes, escalas y la canción de cuna original (Do mayor, 3/4).
 * Todo es dato puro; el secuenciador decide cuándo y cómo suena.
 */

/** Tempo de la canción (negras por minuto). */
export const BPM = 70;
export const BEAT = 60 / BPM;
export const BEATS_PER_BAR = 3;
export const BAR = BEAT * BEATS_PER_BAR;

/** Frecuencia de una nota MIDI (A4 = 69 = 440 Hz). */
export const midiToHz = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);

export interface Chord {
  readonly name: string;
  /** Fundamental como clase de altura (0 = Do). */
  readonly root: number;
  /** Clases de altura del acorde (incluye la fundamental). */
  readonly tones: readonly number[];
}

const chord = (name: string, root: number, tones: readonly number[]): Chord => ({ name, root, tones });

export const CHORDS = {
  C: chord('C', 0, [0, 4, 7]),
  Cmaj7: chord('Cmaj7', 0, [0, 4, 7, 11]),
  C7: chord('C7', 0, [0, 4, 7, 10]),
  Dm: chord('Dm', 2, [2, 5, 9]),
  Dm7: chord('Dm7', 2, [2, 5, 9, 0]),
  Em: chord('Em', 4, [4, 7, 11]),
  F: chord('F', 5, [5, 9, 0]),
  Fmaj7: chord('Fmaj7', 5, [5, 9, 0, 4]),
  Fm: chord('Fm', 5, [5, 8, 0]),
  G: chord('G', 7, [7, 11, 2]),
  Gsus: chord('Gsus', 7, [7, 0, 2]),
  G7: chord('G7', 7, [7, 11, 2, 5]),
  Am: chord('Am', 9, [9, 0, 4]),
  Am7: chord('Am7', 9, [9, 0, 4, 7]),
} as const;

/** Escala mayor de Do (clases de altura) y pentatónica para las campanitas. */
export const MAJOR_SCALE: readonly number[] = [0, 2, 4, 5, 7, 9, 11];
/** Pentatónica mayor entre C6 y E7 (registro de las campanitas). */
export const CHIME_NOTES: readonly number[] = [84, 86, 88, 91, 93, 96, 98, 100];

/** Nota de melodía: inicio y duración en negras dentro del compás. */
export interface MelodyNote {
  readonly beat: number;
  readonly midi: number;
  readonly len: number;
}

export interface Bar {
  readonly chord: Chord;
  readonly melody: readonly MelodyNote[];
}

const NOTE_INDEX: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** "Bb5" → 82. */
export function noteToMidi(name: string): number {
  const m = /^([A-G])(b|#)?(-?\d)$/.exec(name);
  if (!m) throw new Error(`Nota inválida: ${name}`);
  const [, letter = 'C', acc, oct = '4'] = m;
  const shift = acc === 'b' ? -1 : acc === '#' ? 1 : 0;
  return 12 * (Number(oct) + 1) + (NOTE_INDEX[letter] ?? 0) + shift;
}

/** Convierte "G5:1.5 E5:.5 r:1" en notas con su tiempo dentro del compás. */
function parseLine(line: string): MelodyNote[] {
  const out: MelodyNote[] = [];
  let beat = 0;
  for (const token of line.trim().split(/\s+/)) {
    const [name = 'r', lenRaw = '1'] = token.split(':');
    const len = Number(lenRaw);
    if (name !== 'r') out.push({ beat, midi: noteToMidi(name), len });
    beat += len;
  }
  return out;
}

/*
 * Partitura original. Frases de 4 compases en pregunta/respuesta.
 * A (16 compases): I-vi-IV-V · I-vi-ii-V · I-V-vi-iii · IV-I-V-I
 * B (16 compases): IV-V-iii-vi · ii-V-I-I7 · IV-iv-I-vi · ii-V-V7-I
 */
const SCORE: ReadonlyArray<readonly [Chord, string]> = [
  // A · frase 1 (pregunta)
  [CHORDS.C, 'G5:1.5 E5:.5 G5:1'],
  [CHORDS.Am, 'A5:1.5 C6:.5 B5:.5 A5:.5'],
  [CHORDS.F, 'A5:1 F5:1 C6:1'],
  [CHORDS.G, 'B5:.5 A5:.5 G5:2'],
  // A · frase 2 (respuesta, semicadencia)
  [CHORDS.C, 'G5:1.5 E5:.5 G5:1'],
  [CHORDS.Am, 'C6:1.5 B5:.5 A5:1'],
  [CHORDS.Dm, 'F5:1 A5:1 D6:1'],
  [CHORDS.G, 'D6:1.5 C6:.5 B5:1'],
  // A · frase 3 (se eleva)
  [CHORDS.C, 'E6:1.5 D6:.5 C6:1'],
  [CHORDS.G, 'D6:1 B5:1 G5:1'],
  [CHORDS.Am, 'C6:1.5 B5:.5 A5:1'],
  [CHORDS.Em, 'G5:1 E5:1 B5:1'],
  // A · frase 4 (cadencia)
  [CHORDS.F, 'A5:1.5 G5:.5 F5:.5 A5:.5'],
  [CHORDS.C, 'G5:1 E6:1 C6:1'],
  [CHORDS.G, 'D6:1.5 B5:.5 G5:.5 B5:.5'],
  [CHORDS.C, 'C6:3'],
  // B · frase 1
  [CHORDS.Fmaj7, 'C6:1 A5:.5 C6:.5 F6:1'],
  [CHORDS.G, 'E6:1 D6:.5 B5:.5 G5:1'],
  [CHORDS.Em, 'G5:1.5 B5:.5 E6:1'],
  [CHORDS.Am7, 'E6:.5 D6:.5 C6:2'],
  // B · frase 2
  [CHORDS.Dm7, 'D6:1 F6:1 E6:.5 D6:.5'],
  [CHORDS.G, 'B5:1.5 C6:.5 D6:1'],
  [CHORDS.C, 'E6:1.5 D6:.5 C6:1'],
  [CHORDS.C7, 'E6:1 C6:.5 Bb5:.5 G5:1'],
  // B · frase 3 (el acorde menor prestado, lo más tierno)
  [CHORDS.F, 'A5:1.5 C6:.5 F6:1'],
  [CHORDS.Fm, 'Ab5:1.5 G5:.5 F5:1'],
  [CHORDS.C, 'E5:1 G5:1 C6:1'],
  [CHORDS.Am, 'E6:1.5 D6:.5 C6:1'],
  // B · frase 4 (vuelta a casa)
  [CHORDS.Dm, 'F5:1 A5:1 D6:1'],
  [CHORDS.Gsus, 'D6:1.5 C6:.5 B5:1'],
  [CHORDS.G7, 'G5:1 B5:1 D6:1'],
  [CHORDS.C, 'C6:3'],
];

export const SONG: readonly Bar[] = SCORE.map(([c, line]) => ({ chord: c, melody: parseLine(line) }));

/** Nota más cercana a `target` cuya clase de altura es `pc`. */
export function nearestWithPc(pc: number, target: number): number {
  const base = target - ((((target - pc) % 12) + 12) % 12);
  return target - base > 6 ? base + 12 : base;
}

/** Siguiente/anterior grado de la escala (para adornos). */
export function scaleStep(midi: number, dir: 1 | -1): number {
  let m = midi + dir;
  while (!MAJOR_SCALE.includes(((m % 12) + 12) % 12)) m += dir;
  return m;
}
