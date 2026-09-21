import type { Layer, World } from '../core/types';

/** Jardín: pasto, tallos que crecen, hojas y flores amarillas que florecen. (STUB: pendiente de implementar) */
export class GardenLayer implements Layer {
  readonly name = 'garden';

  init(_world: World): void {}

  resize(_world: World): void {}

  update(_dt: number, _world: World): void {}

  draw(_g: CanvasRenderingContext2D, _world: World): void {}
}
