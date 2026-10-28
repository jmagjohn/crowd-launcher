const RING = 8;

/**
 * GPU time per frame via EXT_disjoint_timer_query_webgl2. Queries resolve a few frames late, so `lastMs` lags
 * slightly. Fixed ring of query objects; no per-frame allocation. No-op where the extension is unavailable.
 */
export class GpuTimer {
  private readonly gl: WebGL2RenderingContext | null;
  private readonly ext: { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number } | null;
  private readonly queries: (WebGLQuery | null)[] = [];
  private head = 0;
  private tail = 0;
  private open = false;
  enabled = false;
  lastMs = 0;
  /** Bumped each time a new sample resolves. */
  samples = 0;

  constructor(gl: WebGLRenderingContext | WebGL2RenderingContext) {
    const gl2 = typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext ? gl : null;
    this.gl = gl2;
    this.ext = gl2 ? gl2.getExtension('EXT_disjoint_timer_query_webgl2') : null;
    if (this.gl && this.ext) for (let i = 0; i < RING; i++) this.queries.push(this.gl.createQuery());
  }

  get available(): boolean {
    return this.ext !== null;
  }

  begin(): void {
    if (!this.enabled || !this.ext || !this.gl) return;
    if (this.head - this.tail >= RING) return; // all queries in flight; skip this frame
    this.gl.beginQuery(this.ext.TIME_ELAPSED_EXT, this.queries[this.head % RING]!);
    this.open = true;
  }

  end(): void {
    if (!this.open || !this.ext || !this.gl) return;
    this.gl.endQuery(this.ext.TIME_ELAPSED_EXT);
    this.open = false;
    this.head++;
  }

  poll(): void {
    const gl = this.gl;
    if (!gl || !this.ext) return;
    while (this.tail < this.head) {
      const q = this.queries[this.tail % RING]!;
      if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) break;
      const disjoint = gl.getParameter(this.ext.GPU_DISJOINT_EXT);
      if (!disjoint) {
        this.lastMs = gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6;
        this.samples++;
      }
      this.tail++;
    }
  }
}
