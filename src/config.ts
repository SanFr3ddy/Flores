/**
 * Todo lo personalizable está aquí: nombre, mensajes, colores y tiempos.
 * También se puede cambiar el nombre desde la URL:  index.html?para=Andy
 */
const params = new URLSearchParams(window.location.search);

const numParam = (key: string, fallback: number): number => {
  const raw = params.get(key);
  if (raw === null || raw.trim() === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
};

const recipient = (params.get('para') ?? '').trim().slice(0, 24) || 'Andy';

export const CONFIG = {
  recipient,

  intro: {
    kicker: 'Hoy es 21 de septiembre',
    line: `Tengo algo para ti, ${recipient}`,
    button: 'Ábrelo',
  },

  title: `Para ${recipient}`,
  subtitle: '21 de septiembre',

  /** Frases que aparecen una tras otra mientras se arma el ramo; la última espera al final. */
  messages: [
    'Dicen que el 21 de septiembre se regalan flores…',
    '…para llenar de luz a alguien especial.',
    'Y como no pude elegir una sola flor…',
  ],

  /** Frases que aparecen cuando el ramo queda completo; la última se queda. */
  finale: ['…te traje un ramo entero.', `Que nunca te falte la luz, ${recipient} 💛`],

  /** Pista para armar el ramo (se muestra con el progreso hasta completarlo). */
  hint: 'Toca la pantalla para armar tu ramo 💛',
  /** Pista después de completar el ramo. */
  hintDone: '¡Tu ramo está completo! 🌻',

  /** La carta que se abre con el botón del sobre. ✏️ Escribe aquí tu propia carta. */
  letter: {
    button: 'Tengo una carta para ti',
    greeting: `${recipient}:`,
    paragraphs: [
      'Hoy quería regalarte algo que no se marchitara, así que lo hice con mis propias manos, línea por línea y flor por flor.',
      'Cada una de estas flores es un pedacito de lo que siento cuando pienso en ti: luz, calma y muchas ganas de sonreír.',
      'Gracias por ser como eres y por hacer que los días más comunes se sientan especiales.',
      'Ojalá este ramo te acompañe siempre que necesites un poquito de sol.',
    ],
    closing: 'Con todo mi cariño,',
    signature: '💛',
  },

  palette: {
    background: '#000000',
    petalLight: '#fff27a',
    petal: '#ffd21f',
    petalDeep: '#f5a300',
    petalShadow: '#c26e00',
    centerDark: '#2a1703',
    center: '#4a2a07',
    centerLight: '#7a4a10',
    stemDark: '#1c4a1f',
    stem: '#2f6b2a',
    stemLight: '#5fa84a',
    leaf: '#2d7a32',
    leafLight: '#6cc155',
    glow: '#ffd84a',
    warmGlow: '#ffb347',
    firefly: '#fff3a3',
    star: '#fff8e7',
    text: '#fff6d5',
  },

  /** Momentos clave en segundos de escena (desde que se abre el regalo). */
  timeline: {
    skyFadeIn: 0, // las estrellas aparecen durante ~3 s
    ribbon: 0.3, // aparecen el manojo de tallos y el listón
    stemsStart: 0.5, // las primeras flores crecen solas
    stemsSpread: 3, // con ?ramo: ventana en la que arrancan todos los tallos
    title: 2.5, // aparece "Para Andy"
    hint: 3, // pista "toca la pantalla" (se queda hasta completar el ramo)
    messagesStart: 5, // primera frase
    messageInterval: 4, // segundos por frase
    // Lo siguiente cuenta desde que el ramo queda completo (world.bouquet.completeAt):
    finaleDelay: 0.5, // primera frase final
    finaleInterval: 3.5, // segundos entre frases finales
    constellationDelay: 0.8, // las estrellas forman un corazón
    letterDelay: 2.5, // aparece el botón del sobre con la carta
  },

  /** El ramo se arma tocando la pantalla. */
  bouquet: {
    /** Flores que crecen solas al principio; el resto se agrega con toques. */
    seedFlowers: 3,
    /** Flores necesarias para completar el ramo (pantallas grandes / celulares). */
    totalLarge: 26,
    totalPhone: 17,
    /** Si nadie toca durante `autoAfter` s, se agrega una flor sola cada `autoEvery` s. */
    autoFill: true,
    autoAfter: 6,
    autoEvery: 1.5,
    /** Flores extra que se pueden agregar después de completarlo (las más viejas se van). */
    maxExtra: 10,
  },

  /** Música de fondo: volumen general 0..1 (bajito a propósito) y de las campanitas. */
  music: {
    volume: 0.3,
    chimes: 0.5,
  },
} as const;

/** Parámetros de depuración por URL (útiles para capturas automáticas). */
export const DEBUG = {
  /** ?auto → salta la pantalla de introducción. */
  auto: params.has('auto'),
  /** ?t=12 → adelanta la escena a los 12 s. */
  startAt: Math.max(0, numParam('t', 0)),
  /** ?speed=2 → velocidad de la animación. */
  speed: Math.max(0, numParam('speed', 1)),
  /** ?hold → congela el tiempo tras adelantar (capturas deterministas). */
  hold: params.has('hold'),
  /** ?seed=7 → composición reproducible. */
  seed: Math.floor(numParam('seed', 21092026)),
  /** ?mute → sin música. */
  mute: params.has('mute'),
  /** ?fps → muestra un contador de FPS. */
  fps: params.has('fps'),
  /** ?ramo → el ramo completo crece solo, sin tocar (modo demostración y capturas). */
  ramo: params.has('ramo'),
} as const;
