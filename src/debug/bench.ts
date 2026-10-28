export interface BenchResult {
  seconds: number;
  frames: number;
  fps: number;
  frameMs: { mean: number; p50: number; p95: number; p99: number; max: number };
  simMs: { mean: number; p95: number; max: number };
  renderMs: { mean: number; p95: number; max: number };
  cpuMs: { mean: number; p95: number; max: number };
  /** GPU time per frame from timer queries (null if unsupported). */
  gpuMs: { mean: number; p95: number; max: number; samples: number } | null;
  rendered: { mean: number; min: number; max: number };
  entities: { mean: number };
  drawCalls: number;
  logicalPlayer: number;
  logicalEnemy: number;
  dpr: number;
  canvas: string;
  glRenderer: string;
}

const MAX_FRAMES = 60 * 240;

/** Records per-frame timings after a warm-up and summarises them. Preallocated; recording does not allocate. */
export class BenchRecorder {
  private readonly frame = new Float32Array(MAX_FRAMES);
  private readonly sim = new Float32Array(MAX_FRAMES);
  private readonly render = new Float32Array(MAX_FRAMES);
  private readonly rendered = new Float32Array(MAX_FRAMES);
  private readonly entities = new Float32Array(MAX_FRAMES);
  private readonly gpu = new Float32Array(MAX_FRAMES);
  private gpuN = 0;
  private n = 0;
  private startAt = -1;
  private endAt = -1;
  done = false;

  constructor(
    readonly warmupSec: number,
    readonly measureSec: number,
  ) {}

  /** GPU samples arrive asynchronously; record each resolved one once. */
  recordGpu(ms: number): void {
    if (!this.done && this.n > 0 && this.gpuN < MAX_FRAMES) this.gpu[this.gpuN++] = ms;
  }

  /** Returns true while measuring. */
  record(now: number, frameMs: number, simMs: number, renderMs: number, rendered: number, entities: number): boolean {
    if (this.done) return false;
    if (this.startAt < 0) {
      this.startAt = now + this.warmupSec * 1000;
      this.endAt = this.startAt + this.measureSec * 1000;
    }
    if (now < this.startAt) return false;
    if (now >= this.endAt || this.n >= MAX_FRAMES) {
      this.done = true;
      return false;
    }
    const i = this.n++;
    this.frame[i] = frameMs;
    this.sim[i] = simMs;
    this.render[i] = renderMs;
    this.rendered[i] = rendered;
    this.entities[i] = entities;
    return true;
  }

  summary(extra: Pick<BenchResult, 'drawCalls' | 'logicalPlayer' | 'logicalEnemy' | 'dpr' | 'canvas' | 'glRenderer'>): BenchResult {
    const n = this.n;
    const frame = this.frame.slice(0, n);
    const sim = this.sim.slice(0, n);
    const render = this.render.slice(0, n);
    const cpu = new Float32Array(n);
    for (let i = 0; i < n; i++) cpu[i] = sim[i] + render[i];
    const rendered = this.rendered.slice(0, n);
    const frameSum = sum(frame);
    return {
      seconds: frameSum / 1000,
      frames: n,
      fps: n / (frameSum / 1000),
      frameMs: { mean: frameSum / n, p50: pct(frame, 0.5), p95: pct(frame, 0.95), p99: pct(frame, 0.99), max: max(frame) },
      simMs: { mean: sum(sim) / n, p95: pct(sim, 0.95), max: max(sim) },
      renderMs: { mean: sum(render) / n, p95: pct(render, 0.95), max: max(render) },
      cpuMs: { mean: sum(cpu) / n, p95: pct(cpu, 0.95), max: max(cpu) },
      gpuMs: this.gpuN > 0 ? stats(this.gpu.slice(0, this.gpuN)) : null,
      rendered: { mean: sum(rendered) / n, min: min(rendered), max: max(rendered) },
      entities: { mean: sum(this.entities.slice(0, n)) / n },
      ...extra,
    };
  }
}

function stats(a: Float32Array): { mean: number; p95: number; max: number; samples: number } {
  return { mean: sum(a) / a.length, p95: pct(a, 0.95), max: max(a), samples: a.length };
}
function sum(a: Float32Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i];
  return s;
}
function max(a: Float32Array): number {
  let m = -Infinity;
  for (let i = 0; i < a.length; i++) if (a[i] > m) m = a[i];
  return m;
}
function min(a: Float32Array): number {
  let m = Infinity;
  for (let i = 0; i < a.length; i++) if (a[i] < m) m = a[i];
  return m;
}
function pct(a: Float32Array, p: number): number {
  const s = Float32Array.from(a).sort();
  return s[Math.min(s.length - 1, Math.floor(p * s.length))];
}
