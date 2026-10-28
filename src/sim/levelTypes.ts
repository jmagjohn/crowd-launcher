// Level data shapes. Levels are plain data; the sim compiles them into runtime state at load.

export type GateOpName = 'add' | 'sub' | 'mul' | 'div';
export type EnemyKey = 'grunt' | 'shield' | 'swarm' | 'boss';

export interface GateConfig {
  op: GateOpName;
  value: number;
  /** Centre x in lane space (lane spans -6..6). */
  x: number;
  y: number;
  width: number;
  /** Side-to-side motion: x = x + amp * sin(speed * t + phase). */
  move?: { amp: number; speed: number; phase?: number };
  /** Gate disappears after this many crossings (entity crossings, so 1 = first touch only). */
  uses?: number;
  /** After `after` logical units have crossed, the gate turns into op/value. */
  flip?: { after: number; op: GateOpName; value: number };
  /** `add` gates: seconds between pulses. Default 0.6. */
  recharge?: number;
  /** `sub` gates: toll units regenerated per second. Default 0. */
  regen?: number;
}

export interface WaveConfig {
  /** Seconds from level start. */
  t: number;
  type: EnemyKey;
  count: number;
  x?: number;
  /** Formation width. */
  spread?: number;
  /** Split `count` into bursts of this size... */
  burst?: number;
  /** ...spaced this many seconds apart. */
  interval?: number;
  /** Per-unit HP override (bosses). */
  hp?: number;
}

export interface OvertimeConfig {
  /** Seconds after the last scripted spawn before overtime starts. */
  delay: number;
  interval: number;
  count: number;
  /** Multiplier on `count` per overtime spawn. */
  growth: number;
}

export interface LevelConfig {
  id: string;
  name: string;
  seed?: number;
  baseHp: number;
  /** Shots per second before upgrades. */
  fireRate: number;
  gates: GateConfig[];
  waves: WaveConfig[];
  overtime?: OvertimeConfig;
  /** Live entity cap per side (gameplay constant; see docs/PLAN.md). */
  stackCap?: number;
  /** Logical units launched per shot. */
  shotSize?: number;
  /** Charge gained per logical unit fired; 1.0 = champion ready. */
  chargePerShot?: number;
  reward?: number;
  /** Champion (Brute) available on this level. Default true; the teaching sequence turns it on at level 3. */
  champion?: boolean;
  /** Boss level: bigger reward, boss banner. */
  boss?: boolean;
  /** Shown on the start screen the first time a mechanic appears. */
  intro?: { title: string; text: string };
  /** Benchmarks only: breaches and the time limit never end the level. */
  sandbox?: boolean;
}

/** Meta-progression modifiers applied on top of the level. Neutral values = no upgrades. */
export interface PlayerMods {
  /** Index into WEAPONS. */
  weapon: number;
  fireRateMult: number;
  /** Integer percent extra units per shot (exact via an accumulator: floor(shots * pct / 100) extras in total). */
  shotBonusPct: number;
  startArmy: number;
  chargeMult: number;
  /** Integer percent bonus on units gained from + and x gates (exact via a per-gate accumulator). */
  gateBonusPct: number;
  baseDamageMult: number;
  /** Brute HP and base damage multiplier. */
  championMult: number;
  /** Dynamic difficulty: scales enemy wave counts, boss HP and base HP. 1 = as authored; never above 1. */
  enemyScale: number;
}

export const NEUTRAL_MODS: Readonly<PlayerMods> = {
  weapon: 0,
  fireRateMult: 1,
  shotBonusPct: 0,
  startArmy: 0,
  chargeMult: 1,
  gateBonusPct: 0,
  baseDamageMult: 1,
  championMult: 1,
  enemyScale: 1,
};
