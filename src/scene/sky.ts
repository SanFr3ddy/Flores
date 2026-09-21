import { smoothstep, type Random } from '../core/math';
import type { Layer, World } from '../core/types';
import { Haze } from './sky/haze';
import { HeartConstellation } from './sky/heart';
import { Moon } from './sky/moon';
import { ShootingStars } from './sky/shooting';
import { StarField } from './sky/stars';

/**
 * Cielo nocturno: bruma de vía láctea, tres capas de estrellas, luna creciente,
 * estrellas fugaces y la constelación de corazón. El fondo sigue siendo negro.
 */
export class SkyLayer implements Layer {
  readonly name = 'sky';

  private rng: Random | null = null;
  private readonly haze = new Haze();
  private readonly stars = new StarField();
  private readonly moon = new Moon();
  private readonly meteors = new ShootingStars();
  private readonly heart = new HeartConstellation();
  /** Desplazamiento de parallax reutilizable (sin asignaciones por frame). */
  private readonly off = { x: 0, y: 0 };

  init(world: World): void {
    const rng = world.rng.fork();
    this.rng = rng;
    // Cada sub-sistema con su propio generador: cambiar uno no altera a los demás.
    this.haze.init(rng.fork());
    this.stars.init(rng.fork(), world);
    this.moon.init(rng.fork());
    this.meteors.init(rng.fork());
    this.heart.init(rng.fork(), world);
  }

  resize(world: World): void {
    if (!this.rng) return;
    this.haze.resize(world);
    this.stars.resize(world);
    this.moon.resize(world);
    this.heart.resize(world);
  }

  update(dt: number, world: World): void {
    this.stars.update(dt, world);
    this.meteors.update(world);
    this.heart.update(world);
  }

  draw(g: CanvasRenderingContext2D, world: World): void {
    const t = world.time;
    // La bruma aparece despacio, junto con las primeras estrellas.
    this.haze.draw(g, world, smoothstep(0, 3.2, t));
    this.stars.draw(g, world);

    this.stars.offset(0.4, world.scale, this.off);
    this.moon.draw(g, world, this.off.x, this.off.y);

    this.meteors.draw(g, world);

    this.stars.offset(1.4, world.scale, this.off);
    this.heart.draw(g, world, this.off.x, this.off.y);
  }
}
