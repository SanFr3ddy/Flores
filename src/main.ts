import './styles/base.css';
import './styles/ui.css';
import './styles/letter.css';
import { Music } from './audio/music';
import { CONFIG, DEBUG } from './config';
import { Engine } from './core/engine';
import { Letter } from './letter/letter';
import { ButterflyLayer } from './scene/butterflies';
import { GardenLayer } from './scene/garden';
import { ParticlesLayer } from './scene/particles';
import { PostLayer } from './scene/post';
import { SkyLayer } from './scene/sky';
import { Overlay } from './ui/overlay';

const canvas = document.querySelector<HTMLCanvasElement>('#scene');
const uiRoot = document.querySelector<HTMLElement>('#ui');
if (!canvas || !uiRoot) throw new Error('Falta #scene o #ui en index.html');

document.title = CONFIG.title;

const engine = new Engine(canvas, { seed: DEBUG.seed, speed: DEBUG.speed });
engine
  .add(new SkyLayer())
  .add(new GardenLayer())
  .add(new ParticlesLayer())
  .add(new ButterflyLayer())
  .add(new PostLayer());

const music = new Music();
const { world } = engine;

const panOf = (x: number) => (x / Math.max(1, world.width)) * 2 - 1;
world.events.on('bloom', (e) => music.chime(panOf(e.x), e.kind === 'sunflower' ? 1 : 0.6));
world.events.on('tap', (e) => music.chime(panOf(e.x), 0.8));
world.events.on('shootingStar', (e) => music.shimmer(panOf(e.x)));
world.events.on('constellation', (e) => music.shimmer(panOf(e.x)));
world.events.on('bouquetComplete', (e) => music.shimmer(panOf(e.x)));

const overlay = new Overlay(uiRoot, {
  onOpen() {
    music.start();
    engine.start(DEBUG.startAt);
  },
  onToggleMusic() {
    music.start();
    return music.toggle();
  },
  onReplay() {
    overlay.reset();
    letter.reset();
    music.restart();
    engine.restart();
  },
});

const letter = new Letter(uiRoot, {
  onOpenChange(open) {
    music.duck(open);
  },
});

// En ?auto no hay gesto del usuario: la música queda en silencio hasta que se active.
if (DEBUG.mute || DEBUG.auto) music.setMuted(true);
overlay.setMusicMuted(music.muted);
engine.onFrame = (w) => {
  overlay.update(w);
  letter.update(w);
};

if (DEBUG.auto) {
  overlay.skipIntro();
  engine.start(DEBUG.startAt);
} else {
  overlay.showIntro();
}

if (DEBUG.hold) engine.setSpeed(0);

if (DEBUG.fps) {
  const el = document.createElement('div');
  el.className = 'fps-meter';
  document.body.append(el);
  let frames = 0;
  let last = performance.now();
  const tick = (now: number) => {
    frames++;
    if (now - last >= 500) {
      el.textContent = `${Math.round((frames * 1000) / (now - last))} fps`;
      frames = 0;
      last = now;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

// Acceso para depuración y capturas automáticas.
(window as unknown as { __flores: unknown }).__flores = { engine, music, overlay, letter };
