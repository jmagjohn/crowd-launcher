import { describe, expect, it } from 'vitest';
import { CAMPAIGN } from '../src/levels/campaign';
import { STRESS_LEVEL } from '../src/levels/stress';
import { hashWorld } from '../src/sim/hash';
import type { LevelConfig } from '../src/sim/levelTypes';
import { World } from '../src/sim/world';

/** Scripted input: sweeping aim, bursts of fire, periodic champion presses. Pure function of the tick. */
function scriptedRun(level: LevelConfig, seed: number, ticks: number): { hash: string; w: World } {
  const w = new World(level, undefined, seed);
  for (let t = 0; t < ticks; t++) {
    w.input.aimX = Math.sin(t * 0.013) * 4.5;
    w.input.firing = t % 240 < 200;
    if (t % 900 === 899) w.input.champion = true;
    w.step();
  }
  return { hash: hashWorld(w), w };
}

describe('determinism', () => {
  for (const level of CAMPAIGN) {
    it(`same seed + inputs => same state (${level.id})`, () => {
      const a = scriptedRun(level, 42, 60 * 40);
      const b = scriptedRun(level, 42, 60 * 40);
      expect(a.hash).toBe(b.hash);
      expect(a.w.tick).toBe(b.w.tick);
      expect(a.w.state).toBe(b.w.state);
    });
  }

  it('different seeds diverge', () => {
    const a = scriptedRun(CAMPAIGN[1], 1, 60 * 20);
    const b = scriptedRun(CAMPAIGN[1], 2, 60 * 20);
    expect(a.hash).not.toBe(b.hash);
  });

  it('stress scene is deterministic at full entity load', () => {
    const a = scriptedRun(STRESS_LEVEL, 7, 60 * 12);
    const b = scriptedRun(STRESS_LEVEL, 7, 60 * 12);
    expect(a.w.player.n + a.w.enemy.n).toBeGreaterThan(4000);
    expect(a.hash).toBe(b.hash);
  });

  for (const level of [...CAMPAIGN, STRESS_LEVEL]) {
    it(`logical units are conserved every tick (${level.id})`, () => {
      const w = new World(level, undefined, 3);
      for (let t = 0; t < 60 * 25 && w.state === 0; t++) {
        w.input.aimX = Math.sin(t * 0.017) * 5;
        w.input.firing = true;
        if (t % 600 === 599) w.input.champion = true;
        w.step();
        const s = w.stats;
        const expected = s.fired + s.champions + s.gateGained - s.gateLost - s.playerLost - s.unitsToBase;
        if (w.playerLogical !== expected) throw new Error(`tick ${t}: alive ${w.playerLogical} != ${expected}`);
      }
    });
  }
});
