import type { GameRenderer } from './gameRenderer';

interface Step {
  label: string;
  /** Applies the step; returns false when it would change nothing on this device (then it is skipped). */
  apply(r: GameRenderer): boolean;
}

/**
 * Render-only quality ladder, cheapest visual loss first. The sim never changes (see the flagged conflict in
 * docs/PLAN.md): only shadows, resolution and the visual cap move.
 */
const STEPS: Step[] = [
  { label: 'shadows off', apply: (r) => { if (!r.shadowsOn) return false; r.shadowsOn = false; if (r.units) r.units.shadowsOn = false; return true; } },
  { label: 'dpr 1.5', apply: (r) => dprStep(r, 1.5) },
  { label: 'dpr 1.25', apply: (r) => dprStep(r, 1.25) },
  { label: 'dpr 1', apply: (r) => dprStep(r, 1) },
  { label: 'visual cap 2000', apply: (r) => capStep(r, 2000) },
  { label: 'visual cap 1200', apply: (r) => capStep(r, 1200) },
  { label: 'dpr 0.75', apply: (r) => dprStep(r, 0.75) },
];

function dprStep(r: GameRenderer, d: number): boolean {
  if (r.dpr <= d) return false;
  r.setMaxDpr(d);
  return true;
}

function capStep(r: GameRenderer, cap: number): boolean {
  r.visualCap = cap;
  if (r.units) r.units.visualCap = cap;
  return true;
}

const WINDOW = 120;
const EVAL_MS = 1000;
const COOLDOWN_MS = 2500;

/**
 * Watches frame times while playing and steps quality down when frames miss the display's refresh. The refresh
 * interval is estimated from the fastest recent frames, snapped to 60 / 90 / 120 Hz. Two bad seconds in a row
 * trigger one step; it never steps back up within a session (no oscillation). Every change is logged.
 */
export class QualityController {
  level = 0;
  enabled = true;
  private readonly frames = new Float32Array(WINDOW);
  private n = 0;
  private head = 0;
  private lastEval = 0;
  private lastChange = 0;
  private strikes = 0;

  constructor(
    private readonly renderer: GameRenderer,
    private readonly log: (line: string) => void,
  ) {}

  /** Call once per rendered frame while the game is being played. */
  sample(now: number, frameMs: number): void {
    if (!this.enabled || this.level >= STEPS.length) return;
    this.frames[this.head] = frameMs;
    this.head = (this.head + 1) % WINDOW;
    if (this.n < WINDOW) this.n++;
    if (this.lastEval === 0) this.lastEval = now;
    if (now - this.lastEval < EVAL_MS || this.n < 60) return;
    this.lastEval = now;

    let min = Infinity;
    let sum = 0;
    for (let i = 0; i < this.n; i++) {
      const f = this.frames[i];
      if (f < min) min = f;
      sum += f;
    }
    const refresh = min < 9.5 ? 1000 / 120 : min < 12.5 ? 1000 / 90 : 1000 / 60;
    let slow = 0;
    for (let i = 0; i < this.n; i++) if (this.frames[i] > refresh * 1.5) slow++;
    const avg = sum / this.n;
    const bad = avg > refresh * 1.12 || slow / this.n > 0.1;
    this.strikes = bad ? this.strikes + 1 : 0;
    if (this.strikes >= 2 && now - this.lastChange > COOLDOWN_MS) {
      this.stepDown(`avg ${avg.toFixed(1)} ms vs ${refresh.toFixed(1)} ms refresh, ${slow}/${this.n} slow`);
      this.lastChange = now;
      this.strikes = 0;
      this.n = 0;
    }
  }

  /** Discard history (after a pause, level load or tab switch). */
  reset(): void {
    this.n = 0;
    this.strikes = 0;
    this.lastEval = 0;
  }

  private stepDown(reason: string): void {
    while (this.level < STEPS.length) {
      const step = STEPS[this.level++];
      if (step.apply(this.renderer)) {
        this.log(`quality q${this.level}: ${step.label} (${reason})`);
        return;
      }
    }
  }
}
