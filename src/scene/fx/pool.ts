/**
 * Pool fijo de partículas. `take()` devuelve una libre y, si están todas ocupadas,
 * recicla la siguiente en orden circular (la más vieja, aprox.): así el efecto más
 * reciente (p. ej. un toque) siempre se ve, aunque se toque muy rápido.
 */
export class Pool<T extends { on: boolean }> {
  readonly items: T[];
  private cur = 0;

  constructor(size: number, make: () => T) {
    this.items = Array.from({ length: size }, make);
  }

  take(): T {
    const n = this.items.length;
    for (let k = 0; k < n; k++) {
      const i = (this.cur + k) % n;
      const it = this.items[i] as T;
      if (!it.on) {
        this.cur = (i + 1) % n;
        return it;
      }
    }
    const it = this.items[this.cur] as T;
    this.cur = (this.cur + 1) % n;
    return it;
  }

  /** Libre o null (para efectos opcionales que no deben robar a otros). */
  free(): T | null {
    const n = this.items.length;
    for (let k = 0; k < n; k++) {
      const i = (this.cur + k) % n;
      const it = this.items[i] as T;
      if (!it.on) {
        this.cur = (i + 1) % n;
        return it;
      }
    }
    return null;
  }

  clear(): void {
    for (const it of this.items) it.on = false;
    this.cur = 0;
  }
}
