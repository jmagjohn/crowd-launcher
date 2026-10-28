/**
 * Structure-of-arrays storage for one side's entities. Every entity is a stack of `count` logical units of one
 * type. Live entities are dense in [0, n); removal is mark (count = 0) then `compact()`.
 */
export class UnitPool {
  readonly cap: number;
  n = 0;

  readonly type: Uint8Array;
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly px: Float32Array;
  readonly py: Float32Array;
  readonly vx: Float32Array;
  readonly hp: Float32Array;
  readonly maxHp: Float32Array;
  readonly count: Float64Array;
  readonly seed: Uint16Array;
  /** Per-type scratch: the boss's shockwave timer (seconds). */
  readonly aux: Float32Array;

  constructor(cap: number) {
    this.cap = cap;
    this.type = new Uint8Array(cap);
    this.x = new Float32Array(cap);
    this.y = new Float32Array(cap);
    this.px = new Float32Array(cap);
    this.py = new Float32Array(cap);
    this.vx = new Float32Array(cap);
    this.hp = new Float32Array(cap);
    this.maxHp = new Float32Array(cap);
    this.count = new Float64Array(cap);
    this.seed = new Uint16Array(cap);
    this.aux = new Float32Array(cap);
  }

  /** Returns the new index, or -1 when full. New entities do not interpolate (prev = current). */
  spawn(type: number, x: number, y: number, count: number, maxHp: number, vx: number, seed: number): number {
    const i = this.alloc(type, seed);
    if (i < 0) return -1;
    this.x[i] = this.px[i] = x;
    this.y[i] = this.py[i] = y;
    this.vx[i] = vx;
    this.hp[i] = this.maxHp[i] = maxHp;
    this.count[i] = count;
    return i;
  }

  /**
   * Hot-path spawn: claims a slot and sets the integer fields; the caller writes x/y/px/py/vx/hp/maxHp/count
   * straight into the arrays. Passing doubles through a call V8 does not inline boxes them (allocation per spawn).
   */
  alloc(type: number, seed: number): number {
    if (this.n >= this.cap) return -1;
    const i = this.n++;
    this.type[i] = type;
    this.seed[i] = seed;
    this.aux[i] = 0;
    return i;
  }

  /** Total HP of a stack: full units behind the front one, plus the front unit's remaining HP. */
  totalHp(i: number): number {
    return (this.count[i] - 1) * this.maxHp[i] + this.hp[i];
  }

  /** Set a stack's total HP exactly; zero or less kills it. */
  setTotalHp(i: number, total: number): void {
    if (total <= 0) {
      this.count[i] = 0;
      this.hp[i] = 0;
      return;
    }
    const m = this.maxHp[i];
    const c = Math.ceil(total / m);
    this.count[i] = c;
    this.hp[i] = total - (c - 1) * m;
  }

  kill(i: number): void {
    this.count[i] = 0;
  }

  snapshotPrev(): void {
    // Whole-array copy: one memcpy and, unlike subarray(), no view object allocated per tick.
    this.px.set(this.x);
    this.py.set(this.y);
  }

  /** Swap-remove dead entities. Deterministic: order depends only on state. */
  compact(): number {
    let removed = 0;
    let i = 0;
    while (i < this.n) {
      if (this.count[i] > 0) {
        i++;
        continue;
      }
      const last = --this.n;
      removed++;
      if (i !== last) this.move(last, i);
    }
    return removed;
  }

  logicalCount(): number {
    let s = 0;
    for (let i = 0; i < this.n; i++) s += this.count[i];
    return s;
  }

  clear(): void {
    this.n = 0;
  }

  private move(from: number, to: number): void {
    this.type[to] = this.type[from];
    this.x[to] = this.x[from];
    this.y[to] = this.y[from];
    this.px[to] = this.px[from];
    this.py[to] = this.py[from];
    this.vx[to] = this.vx[from];
    this.hp[to] = this.hp[from];
    this.maxHp[to] = this.maxHp[from];
    this.count[to] = this.count[from];
    this.seed[to] = this.seed[from];
    this.aux[to] = this.aux[from];
  }
}
