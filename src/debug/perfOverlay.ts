/** Numbers the overlay reads each refresh. Implemented by Game; no per-frame object is built. */
export interface PerfSource {
  readonly drawCalls: number;
  readonly triangles: number;
  readonly playerLogical: number;
  readonly enemyLogical: number;
  readonly playerEntities: number;
  readonly enemyEntities: number;
  readonly renderedPlayer: number;
  readonly renderedEnemy: number;
  readonly dpr: number;
  readonly visualCap: number;
  readonly stepsLastFrame: number;
  readonly glRenderer: string;
  readonly qualityLevel: number;
  /** Latest GPU frame time in ms, or -1 when timer queries are unavailable. */
  readonly gpuMs: number;
}

const WINDOW = 240;
const REFRESH_MS = 250;

/** Rolling 1-second window of frame timings, rendered as a small monospace panel. Toggle: ` key or the corner button. */
export class PerfOverlay {
  private readonly el: HTMLPreElement;
  private readonly btn: HTMLButtonElement;
  private readonly frameMs = new Float32Array(WINDOW);
  private readonly simMs = new Float32Array(WINDOW);
  private readonly renderMs = new Float32Array(WINDOW);
  private readonly stamp = new Float64Array(WINDOW);
  private head = 0;
  private lastRefresh = 0;
  private readonly log: string[] = [];
  visible = false;

  constructor(stage: HTMLElement) {
    this.el = document.createElement('pre');
    this.el.className = 'perf hidden';
    this.btn = document.createElement('button');
    this.btn.className = 'perf-toggle';
    this.btn.type = 'button';
    this.btn.textContent = 'perf';
    this.btn.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.btn.addEventListener('click', () => this.toggle());
    stage.append(this.el, this.btn);
  }

  toggle(force?: boolean): void {
    this.visible = force ?? !this.visible;
    this.el.classList.toggle('hidden', !this.visible);
  }

  /** Debug log lines (quality changes, difficulty adjustments). Kept short. */
  note(line: string): void {
    this.log.push(line);
    if (this.log.length > 6) this.log.shift();
    console.info(`[perf] ${line}`);
  }

  record(now: number, frameMs: number, simMs: number, renderMs: number): void {
    const h = this.head;
    this.frameMs[h] = frameMs;
    this.simMs[h] = simMs;
    this.renderMs[h] = renderMs;
    this.stamp[h] = now;
    this.head = (h + 1) % WINDOW;
  }

  /** Average frame interval over the last second (ms). Used by quality scaling too. */
  avgFrameMs(now: number): number {
    let s = 0;
    let n = 0;
    for (let i = 0; i < WINDOW; i++) {
      if (now - this.stamp[i] <= 1000) {
        s += this.frameMs[i];
        n++;
      }
    }
    return n > 0 ? s / n : 0;
  }

  refresh(now: number, src: PerfSource): void {
    if (!this.visible || now - this.lastRefresh < REFRESH_MS) return;
    this.lastRefresh = now;
    let n = 0;
    let fSum = 0;
    let fMax = 0;
    let sSum = 0;
    let sMax = 0;
    let rSum = 0;
    let rMax = 0;
    for (let i = 0; i < WINDOW; i++) {
      if (now - this.stamp[i] > 1000) continue;
      n++;
      fSum += this.frameMs[i];
      sSum += this.simMs[i];
      rSum += this.renderMs[i];
      if (this.frameMs[i] > fMax) fMax = this.frameMs[i];
      if (this.simMs[i] > sMax) sMax = this.simMs[i];
      if (this.renderMs[i] > rMax) rMax = this.renderMs[i];
    }
    if (n === 0) return;
    const f = fSum / n;
    this.el.textContent =
      `fps     ${(1000 / f).toFixed(0).padStart(5)}   q${src.qualityLevel} dpr ${src.dpr}\n` +
      `frame   ${f.toFixed(2).padStart(5)} ms  max ${fMax.toFixed(1)}\n` +
      `sim     ${(sSum / n).toFixed(2).padStart(5)} ms  max ${sMax.toFixed(2)}  (${src.stepsLastFrame} st)\n` +
      `render  ${(rSum / n).toFixed(2).padStart(5)} ms  max ${rMax.toFixed(2)}\n` +
      `draws   ${String(src.drawCalls).padStart(5)}   tris ${(src.triangles / 1000).toFixed(0)}K\n` +
      `blue    ${fmt(src.playerLogical)} logical  ${src.playerEntities} ent  ${src.renderedPlayer} drawn\n` +
      `red     ${fmt(src.enemyLogical)} logical  ${src.enemyEntities} ent  ${src.renderedEnemy} drawn\n` +
      `cap     ${src.visualCap}/side   ${src.glRenderer.slice(0, 34)}` +
      (this.log.length ? `\n${this.log.join('\n')}` : '');
  }
}

function fmt(n: number): string {
  return n < 1e6 ? String(Math.round(n)).padStart(7) : `${(n / 1e6).toFixed(2)}M`.padStart(7);
}
