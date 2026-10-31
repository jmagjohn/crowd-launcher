import { DT, LANE_HALF, LAUNCH_Y } from './config';
import { OP_ADD, OP_DIV, OP_MUL, OP_SUB } from './gates';
import { Rng } from './rng';
import { T_BOSS, T_TYRANT, TYPE_SPEED } from './unitTypes';
import type { World } from './world';

/** A bot writes `w.input` before each `w.step()`. Bots read sim state only, so runs stay deterministic. */
export interface Bot {
  readonly name: string;
  act(w: World): void;
}

/** Holds fire at the centre and launches the Brute whenever it is ready. The "no skill" baseline. */
export class IdleBot implements Bot {
  readonly name = 'idle';
  act(w: World): void {
    w.input.aimX = 0;
    w.input.firing = true;
    if (w.charge >= 1) w.input.champion = true;
  }
}

export interface AimBotOptions {
  name: string;
  /** Ticks between decisions (reaction time). */
  period: number;
  /** Aim error in lane units (uniform +-noise). */
  noise: number;
  /** Defend when an enemy is less than this many seconds from the breach line. */
  threatT: number;
  /** Fraction of decisions that evaluate gates at all; the rest keep the previous target. */
  attention: number;
  seed: number;
}

export const SKILLED: AimBotOptions = { name: 'skilled', period: 6, noise: 0, threatT: 2.2, attention: 1, seed: 1 };
export const AVERAGE: AimBotOptions = { name: 'average', period: 24, noise: 0.7, threatT: 1.5, attention: 0.7, seed: 2 };

/**
 * Greedy aim bot: defends against the nearest threat, otherwise aims the stream along the straight path with the
 * best expected per-unit multiplier through the gates (accounting for gate motion at arrival time, + gate
 * recharge, toll cost and ÷ loss). Launches the Brute at bosses or dense fronts.
 */
export class AimBot implements Bot {
  readonly name: string;
  private readonly rng: Rng;
  private target = 0;
  private aim = 0;

  constructor(private readonly o: AimBotOptions) {
    this.name = o.name;
    this.rng = new Rng(o.seed);
  }

  act(w: World): void {
    w.input.firing = true;
    if (w.tick % this.o.period === 0) {
      const threat = this.threatX(w);
      if (threat !== null) this.target = threat;
      else if (this.rng.next() < this.o.attention) this.target = bestPath(w);
      this.aim = clamp(this.target + (this.rng.next() * 2 - 1) * this.o.noise, -LANE_HALF + 0.5, LANE_HALF - 0.5);
    }
    w.input.aimX = this.aim;
    if (w.charge >= 1 && (hasBoss(w) || w.enemyLogical > 25)) w.input.champion = true;
  }

  private threatX(w: World): number | null {
    const E = w.enemy;
    let best = -1;
    let bestT = this.o.threatT;
    for (let i = 0; i < E.n; i++) {
      if (E.count[i] <= 0) continue;
      const t = E.y[i] / TYPE_SPEED[E.type[i]];
      if (t < bestT) {
        bestT = t;
        best = i;
      }
    }
    return best >= 0 ? E.x[best] : null;
  }
}

function hasBoss(w: World): boolean {
  const E = w.enemy;
  for (let i = 0; i < E.n; i++) if ((E.type[i] === T_BOSS || E.type[i] === T_TYRANT) && E.count[i] > 0) return true;
  return false;
}

/** Lane x with the best expected per-unit gate multiplier along a straight path. */
export function bestPath(w: World): number {
  const speed = TYPE_SPEED[w.shotType];
  const rate = Math.max(1, w.fireRate * w.muzzleX.length);
  let bestX = 0;
  let bestScore = -Infinity;
  for (let x = -LANE_HALF + 0.5; x <= LANE_HALF - 0.5 + 1e-6; x += 0.25) {
    let v = 1;
    // Gates are authored roughly bottom-to-top; evaluate in y order.
    for (const g of sortedGates(w)) {
      if (!g.active) continue;
      const arrive = (g.y - LAUNCH_Y) / speed;
      const gx = g.amp !== 0 ? g.baseX + g.amp * Math.sin(g.speed * (w.tick * DT + arrive) + g.phase) : g.x;
      if (Math.abs(x - gx) > g.halfW * 0.8) continue;
      switch (g.op) {
        case OP_MUL:
          v *= g.value;
          break;
        case OP_ADD:
          v += g.value / (rate * v * g.rechargeTicks * DT);
          break;
        case OP_DIV:
          v /= g.value;
          break;
        case OP_SUB: {
          const flow = rate * v;
          const regen = g.regenPerTick / DT;
          // Paying a toll costs `toll` units once (spread over ~4 s of flow), plus the regen forever.
          v *= Math.max(0.05, 1 - g.toll / (flow * 4) - regen / flow);
          break;
        }
      }
    }
    const score = v - Math.abs(x) * 0.002;
    if (score > bestScore) {
      bestScore = score;
      bestX = x;
    }
  }
  return bestX;
}

function sortedGates(w: World): readonly World['gates'][number][] {
  return [...w.gates].sort((a, b) => a.y - b.y);
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
