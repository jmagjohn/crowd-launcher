import { describe, expect, it } from 'vitest';
import { bonusUnits, divSurvivors, mulTotal, tollPaid } from '../src/sim/gates';
import type { LevelConfig } from '../src/sim/levelTypes';
import { Rng } from '../src/sim/rng';
import { World } from '../src/sim/world';

/** Splits `total` into random positive parts, like stacks arriving at a gate one after another. */
function partition(total: number, rng: Rng): number[] {
  const parts: number[] = [];
  let left = total;
  while (left > 0) {
    const p = Math.min(left, 1 + rng.int(Math.min(50, left)));
    parts.push(p);
    left -= p;
  }
  return parts;
}

describe('gate math', () => {
  it('xN multiplies exactly', () => {
    expect(mulTotal(1, 3)).toBe(3);
    expect(mulTotal(7, 100)).toBe(700);
    expect(mulTotal(123_456_789, 100)).toBe(12_345_678_900);
  });

  it('/N lets exactly floor(total/N) through regardless of how units are stacked', () => {
    const rng = new Rng(5);
    for (const n of [2, 3, 4, 7]) {
      for (let trial = 0; trial < 50; trial++) {
        const total = 1 + rng.int(2000);
        let crossed = 0;
        let survivors = 0;
        for (const c of partition(total, rng)) {
          survivors += divSurvivors(crossed, c, n);
          crossed += c;
        }
        expect(survivors).toBe(Math.floor(total / n));
      }
    }
  });

  it('/N on single units passes every Nth one', () => {
    const out: number[] = [];
    for (let i = 0; i < 6; i++) out.push(divSurvivors(i, 1, 3));
    expect(out).toEqual([0, 0, 1, 0, 0, 1]);
  });

  it('toll absorbs up to its remaining value', () => {
    expect(tollPaid(5, 15)).toBe(5);
    expect(tollPaid(20, 15)).toBe(15);
    expect(tollPaid(3, 0)).toBe(0);
  });

  it('gate bonus is exact over any partition', () => {
    const rng = new Rng(9);
    for (const pct of [5, 10, 15, 33]) {
      const total = 1 + rng.int(5000);
      let credited = 0;
      let bonus = 0;
      for (const g of partition(total, rng)) {
        bonus += bonusUnits(credited, g, pct);
        credited += g;
      }
      expect(bonus).toBe(Math.floor((total * pct) / 100));
    }
  });
});

const gateLevel = (gate: LevelConfig['gates'][number]): LevelConfig => ({
  id: 't',
  name: 't',
  baseHp: 1e9,
  fireRate: 10,
  gates: [gate],
  waves: [],
  overtime: { delay: 1e6, interval: 1e6, count: 0, growth: 1 },
});

/** Fires `seconds` of shots straight up and returns the world once all of them are past y = 20. */
/** Alive units plus units spent on the base (soldiers deal 1 damage each). */
function accounted(w: World): number {
  return w.playerLogical + w.stats.baseDamage;
}

function runThroughGate(level: LevelConfig, seconds: number): World {
  const w = new World(level, undefined, 3);
  w.input.firing = true;
  for (let t = 0; t < seconds * 60; t++) w.step();
  w.input.firing = false;
  for (let t = 0; t < 60 * 3; t++) w.step();
  return w;
}

describe('gates in the world', () => {
  it('x3 gate triples every fired unit, stacks included', () => {
    const w = runThroughGate(gateLevel({ op: 'mul', value: 3, x: 0, y: 10, width: 12 }), 4);
    expect(w.stats.fired).toBe(40);
    expect(accounted(w)).toBe(120);
  });

  it('x100 gate stays exact when the entity cap forces stacking', () => {
    const lvl = { ...gateLevel({ op: 'mul', value: 100, x: 0, y: 10, width: 12 }), stackCap: 400 };
    const w = runThroughGate(lvl, 4);
    expect(w.player.n).toBeLessThanOrEqual(400);
    expect(accounted(w)).toBe(4000);
  });

  it('/2 gate halves the stream exactly', () => {
    const w = runThroughGate(gateLevel({ op: 'div', value: 2, x: 0, y: 10, width: 12 }), 4.1);
    expect(w.stats.fired).toBe(41);
    expect(accounted(w)).toBe(20);
  });

  it('-N toll eats the first N units then lets the rest through', () => {
    const w = runThroughGate(gateLevel({ op: 'sub', value: 15, x: 0, y: 10, width: 12 }), 4);
    expect(accounted(w)).toBe(40 - 15);
    expect(w.gates[0].active).toBe(false);
  });

  it('+N pulse adds N per recharge window, not per unit', () => {
    // 10 shots/s for 2 s through +5 with a 1 s recharge: pulses at the first crossing and ~1 s later.
    const w = runThroughGate(gateLevel({ op: 'add', value: 5, x: 0, y: 10, width: 12, recharge: 1 }), 2);
    expect(w.stats.fired).toBe(20);
    expect(accounted(w)).toBe(20 + 2 * 5);
  });

  it('one-use gate only affects the first crossing', () => {
    const w = runThroughGate(gateLevel({ op: 'mul', value: 10, x: 0, y: 10, width: 12, uses: 1 }), 2);
    expect(accounted(w)).toBe(20 - 1 + 10);
    expect(w.gates[0].active).toBe(false);
  });

  it('flip gate switches op after its threshold', () => {
    // x2 for the first 10 units, then /2.
    const w = runThroughGate(
      gateLevel({ op: 'mul', value: 2, x: 0, y: 10, width: 12, flip: { after: 10, op: 'div', value: 2 } }),
      3,
    );
    expect(w.gates[0].flipped).toBe(true);
    expect(accounted(w)).toBe(10 * 2 + Math.floor(20 / 2));
  });

  it('units that miss the gate are unchanged', () => {
    const w = runThroughGate(gateLevel({ op: 'mul', value: 5, x: 5, y: 10, width: 1 }), 2);
    expect(accounted(w)).toBe(20);
  });
});

describe('combat', () => {
  it('HP exchange conserves: player HP lost equals enemy HP lost', () => {
    const lvl: LevelConfig = {
      ...gateLevel({ op: 'mul', value: 4, x: 0, y: 6, width: 12 }),
      waves: [
        { t: 0, type: 'shield', count: 30, spread: 6 },
        { t: 1, type: 'grunt', count: 50, spread: 8 },
      ],
    };
    const w = new World(lvl, undefined, 4);
    w.input.firing = true;
    for (let t = 0; t < 60 * 6; t++) w.step();
    const s = w.stats;
    const playerHpLost = s.playerLost; // soldiers have 1 HP each
    const enemyHpLost = 30 * 3 + 50 - (w.enemyLogical > 0 ? countEnemyHp(w) : 0);
    expect(playerHpLost).toBe(enemyHpLost);
  });
});

function countEnemyHp(w: World): number {
  let s = 0;
  for (let i = 0; i < w.enemy.n; i++) s += w.enemy.totalHp(i);
  return s;
}
