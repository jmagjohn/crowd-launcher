// Fixed-size ring buffer of sim events for presentation (particles, flashes, sounds). The sim never reads it.
// If the renderer falls behind, the oldest events are overwritten; gameplay is unaffected.

export const EV_GATE_PASS = 1;
export const EV_KILL = 2;
export const EV_BASE_HIT = 3;
export const EV_BREACH = 4;
export const EV_CHAMPION = 5;
export const EV_GATE_FLIP = 6;
export const EV_GATE_BREAK = 7;
/** A shot left the launcher: x = muzzle x, a = unit type. */
export const EV_FIRE = 8;
/** Boss starts winding up a shockwave: x, y = boss, a = shock slot. */
export const EV_SHOCK_WINDUP = 9;
/** Shockwave released: x, y = centre, a = shock slot. */
export const EV_SHOCKWAVE = 10;
/** Player units killed by a shockwave: x, y = position, a = units. */
export const EV_SHOCK_HIT = 11;

export class EventBuffer {
  readonly cap: number;
  readonly kind: Uint8Array;
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly a: Float64Array;
  readonly b: Float64Array;
  /** Total events ever written; slot = index % cap. */
  written = 0;

  constructor(cap = 4096) {
    this.cap = cap;
    this.kind = new Uint8Array(cap);
    this.x = new Float32Array(cap);
    this.y = new Float32Array(cap);
    this.a = new Float64Array(cap);
    this.b = new Float64Array(cap);
  }

  /**
   * Claims the next slot and returns its index; the caller writes x/y/a/b directly. Keeping doubles off the call
   * boundary means V8 never boxes them, so emitting events allocates nothing.
   */
  claim(kind: number): number {
    const s = this.written % this.cap;
    this.kind[s] = kind;
    this.written++;
    return s;
  }

  /** Convenience for cold paths. */
  push(kind: number, x: number, y: number, a: number, b: number): void {
    const s = this.claim(kind);
    this.x[s] = x;
    this.y[s] = y;
    this.a[s] = a;
    this.b[s] = b;
  }
}
