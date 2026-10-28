import { DT } from './config';
import type { GateConfig, GateOpName } from './levelTypes';

export const OP_ADD = 0;
export const OP_SUB = 1;
export const OP_MUL = 2;
export const OP_DIV = 3;

const OP_IDS: Readonly<Record<GateOpName, number>> = { add: OP_ADD, sub: OP_SUB, mul: OP_MUL, div: OP_DIV };
export const OP_SYMBOL = ['+', '−', '×', '÷'] as const;

export function opId(name: GateOpName): number {
  return OP_IDS[name];
}

/** True for gates that make the army bigger. Used for colour and for bot heuristics. */
export function isGoodOp(op: number): boolean {
  return op === OP_ADD || op === OP_MUL;
}

// ---- Pure gate math (exact integer arithmetic, unit-tested) ----

/** Units after an xN gate. */
export function mulTotal(count: number, n: number): number {
  return count * n;
}

/**
 * Survivors of a /N gate given everything that crossed before. Over any sequence of crossings the total number of
 * survivors is exactly floor(totalCrossed / N), no matter how the units were stacked.
 */
export function divSurvivors(crossedBefore: number, count: number, n: number): number {
  return Math.floor((crossedBefore + count) / n) - Math.floor(crossedBefore / n);
}

/** Units absorbed by a toll gate with `remaining` toll. */
export function tollPaid(count: number, remaining: number): number {
  return count < remaining ? count : remaining;
}

/**
 * Integer bonus units for `gained` units produced by a good gate with an integer `pct` bonus, given the gains
 * credited before. Total bonus over any partition is exactly floor(totalGained * pct / 100).
 */
export function bonusUnits(creditedBefore: number, gained: number, pct: number): number {
  return Math.floor(((creditedBefore + gained) * pct) / 100) - Math.floor((creditedBefore * pct) / 100);
}

/**
 * Runtime gate state. Created once at level load; mutated in place.
 * Every numeric field has an initializer: a field declared without one starts as undefined, which makes V8 store
 * later doubles as freshly boxed heap numbers (measured: one allocation per store).
 */
export class Gate {
  op = 0;
  value = 0;
  readonly baseX: number = 0;
  x = 0;
  readonly y: number = 0;
  readonly halfW: number = 0;
  readonly amp: number = 0;
  readonly speed: number = 0;
  readonly phase: number = 0;
  /** Remaining entity crossings, or -1 for unlimited. */
  usesLeft = 0;
  readonly flipAfter: number = 0;
  readonly flipOp: number = 0;
  readonly flipValue: number = 0;
  flipped = false;
  readonly rechargeTicks: number = 0;
  readyTick = 0;
  tollMax = 0;
  toll = 0;
  readonly regenPerTick: number = 0;
  regenAcc = 0;
  active = true;

  /** Logical units that have crossed (drives flip and the /N accumulator). */
  crossed = 0;
  /** Units credited for the gate-bonus accumulator. */
  bonusCredited = 0;
  /** Last tick something crossed; the renderer flashes on change. */
  lastPassTick = -1000;
  passes = 0;

  constructor(cfg: GateConfig) {
    this.op = opId(cfg.op);
    this.value = cfg.value;
    this.baseX = cfg.x;
    this.x = cfg.x;
    this.y = cfg.y;
    this.halfW = cfg.width / 2;
    this.amp = cfg.move?.amp ?? 0;
    this.speed = cfg.move?.speed ?? 0;
    this.phase = cfg.move?.phase ?? 0;
    this.usesLeft = cfg.uses ?? -1;
    this.flipAfter = cfg.flip?.after ?? 0;
    this.flipOp = cfg.flip ? opId(cfg.flip.op) : this.op;
    this.flipValue = cfg.flip?.value ?? this.value;
    this.rechargeTicks = Math.max(1, Math.round((cfg.recharge ?? 0.6) / DT));
    this.tollMax = this.op === OP_SUB ? cfg.value : 0;
    this.toll = this.tollMax;
    this.regenPerTick = (cfg.regen ?? 0) * DT;
  }

  update(tick: number): void {
    if (this.amp !== 0) this.x = this.baseX + this.amp * Math.sin(this.speed * tick * DT + this.phase);
    if (this.op === OP_SUB && this.toll < this.tollMax && this.regenPerTick > 0) {
      this.regenAcc += this.regenPerTick;
      if (this.regenAcc >= 1) {
        const whole = Math.floor(this.regenAcc);
        this.regenAcc -= whole;
        this.toll = Math.min(this.tollMax, this.toll + whole);
      }
    }
  }

  /** Called after a crossing has been applied. */
  afterCrossing(units: number, tick: number): void {
    this.crossed += units;
    this.lastPassTick = tick;
    this.passes++;
    if (this.usesLeft > 0 && --this.usesLeft === 0) this.active = false;
    if (!this.flipped && this.flipAfter > 0 && this.crossed >= this.flipAfter) {
      this.flipped = true;
      this.op = this.flipOp;
      this.value = this.flipValue;
      this.crossed = 0;
      this.bonusCredited = 0;
      if (this.op === OP_SUB) this.tollMax = this.toll = this.value;
    }
  }
}
