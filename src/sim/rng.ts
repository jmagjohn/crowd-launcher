/**
 * mulberry32: tiny, fast, good enough for gameplay.
 *
 * Allocation notes (measured with the V8 sampling heap profiler): a uint32 does not fit V8's small-integer range,
 * so a uint32 state field, or a uint32/double returned from a call V8 does not inline, gets boxed as a heap
 * number. So the state and the last output live in an Int32Array, `advance()` returns nothing, and each public
 * method derives its own result from `out[1]`.
 */
export class Rng {
  /** [0] = state, [1] = last output (int32 bit pattern). */
  private readonly s = new Int32Array(2);

  constructor(seed: number) {
    this.s[0] = seed >>> 0 || 0x9e3779b9;
  }

  /** Unsigned 32-bit state (for hashing / snapshots). */
  get state(): number {
    return this.s[0] >>> 0;
  }

  private advance(): void {
    const s = (this.s[0] = (this.s[0] + 0x6d2b79f5) | 0);
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    this.s[1] = t ^ (t >>> 14);
  }

  nextU32(): number {
    this.advance();
    return this.s[1] >>> 0;
  }

  /** 16 random bits. Always a small integer, so it never boxes. */
  bits16(): number {
    this.advance();
    return this.s[1] >>> 16;
  }

  /** [0, 1) */
  next(): number {
    this.advance();
    return (this.s[1] >>> 0) / 4294967296;
  }

  range(a: number, b: number): number {
    this.advance();
    return a + (b - a) * ((this.s[1] >>> 0) / 4294967296);
  }

  int(n: number): number {
    this.advance();
    return Math.floor(((this.s[1] >>> 0) / 4294967296) * n);
  }
}
