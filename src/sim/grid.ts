import { BIG_RADIUS, GRID_CELL, LANE_HALF, LANE_LENGTH } from './config';
import type { UnitPool } from './pool';
import { TYPE_RADIUS } from './unitTypes';

/**
 * Uniform grid rebuilt every tick with a counting sort: O(n), no allocation.
 * Cell c holds items[cellStart[c] .. cellStart[c + 1]).
 */
export class SpatialGrid {
  readonly cell = GRID_CELL;
  readonly inv = 1 / GRID_CELL;
  readonly x0 = -LANE_HALF - 2;
  readonly y0 = -3;
  readonly cols: number;
  readonly rows: number;
  readonly cellStart: Int32Array;
  private readonly cursor: Int32Array;
  private readonly cellOf: Int32Array;
  readonly items: Int32Array;

  /** Entities too large for the grid (bosses), checked linearly. */
  readonly big: Int32Array;
  bigN = 0;
  /** Largest radius among gridded entities this tick. */
  maxR = 0;
  minY = 0;
  maxY = 0;

  constructor(cap: number) {
    this.cols = Math.ceil((LANE_HALF * 2 + 4) * this.inv);
    this.rows = Math.ceil((LANE_LENGTH + 8) * this.inv);
    const cells = this.cols * this.rows;
    this.cellStart = new Int32Array(cells + 1);
    this.cursor = new Int32Array(cells);
    this.cellOf = new Int32Array(cap);
    this.items = new Int32Array(cap);
    this.big = new Int32Array(64);
  }

  col(x: number): number {
    const c = Math.floor((x - this.x0) * this.inv);
    return c < 0 ? 0 : c >= this.cols ? this.cols - 1 : c;
  }

  row(y: number): number {
    const r = Math.floor((y - this.y0) * this.inv);
    return r < 0 ? 0 : r >= this.rows ? this.rows - 1 : r;
  }

  build(pool: UnitPool): void {
    const cells = this.cols * this.rows;
    const start = this.cellStart;
    const cursor = this.cursor;
    const cellOf = this.cellOf;
    start.fill(0);
    this.bigN = 0;
    let maxR = 0;
    let minY = Infinity;
    let maxY = -Infinity;

    const n = pool.n;
    const px = pool.x;
    const py = pool.y;
    const type = pool.type;
    const count = pool.count;
    const cols = this.cols;
    const colMax = cols - 1;
    const rowMax = this.rows - 1;
    const x0 = this.x0;
    const y0 = this.y0;
    const inv = this.inv;
    for (let i = 0; i < n; i++) {
      if (count[i] <= 0) {
        cellOf[i] = -1;
        continue;
      }
      const r = TYPE_RADIUS[type[i]];
      if (r > BIG_RADIUS) {
        if (this.bigN < this.big.length) this.big[this.bigN++] = i;
        cellOf[i] = -1;
        continue;
      }
      if (r > maxR) maxR = r;
      const y = py[i];
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      let col = ((px[i] - x0) * inv) | 0;
      let row = ((y - y0) * inv) | 0;
      col = col < 0 ? 0 : col > colMax ? colMax : col;
      row = row < 0 ? 0 : row > rowMax ? rowMax : row;
      const c = row * cols + col;
      cellOf[i] = c;
      start[c + 1]++;
    }
    for (let c = 0; c < cells; c++) {
      start[c + 1] += start[c];
      cursor[c] = start[c];
    }
    const items = this.items;
    for (let i = 0; i < n; i++) {
      const c = cellOf[i];
      if (c >= 0) items[cursor[c]++] = i;
    }
    this.maxR = maxR;
    this.minY = minY;
    this.maxY = maxY;
  }
}
