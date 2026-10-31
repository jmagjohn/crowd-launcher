import { describe, expect, it } from 'vitest';
import { LEVELS } from '../src/levels';
import { FIRST_GENERATED, LAST_LEVEL, generateLevel, isBossLevel, targetMargin } from '../src/levels/generator';
import { TUNE } from '../src/levels/tuning';
import { LANE_HALF } from '../src/sim/config';
import { compileWaves, scheduleHp } from '../src/sim/waves';

const generated = LEVELS.slice(FIRST_GENERATED - 1);

describe('level generator', () => {
  it('produces the full 50-level campaign with unique ids', () => {
    expect(LEVELS.length).toBe(LAST_LEVEL);
    expect(new Set(LEVELS.map((l) => l.id)).size).toBe(LAST_LEVEL);
  });

  it('is deterministic: the same level number always gives the same level', () => {
    for (let n = FIRST_GENERATED; n <= LAST_LEVEL; n++) expect(generateLevel(n)).toEqual(generateLevel(n));
  });

  it('has a calibration entry for every generated level', () => {
    for (let n = FIRST_GENERATED; n <= LAST_LEVEL; n++) expect(TUNE[n]?.k).toBeGreaterThan(0);
  });

  it('keeps gates inside the lane and never stacks two gates on the same spot', () => {
    for (const l of generated) {
      for (const g of l.gates) {
        const reach = g.width / 2 + (g.move?.amp ?? 0);
        expect(Math.abs(g.x) + reach, `${l.id} gate at x ${g.x}`).toBeLessThanOrEqual(LANE_HALF + 0.6);
        expect(g.y).toBeGreaterThan(4);
        expect(g.y).toBeLessThan(34);
      }
      for (let i = 0; i < l.gates.length; i++) {
        for (let j = i + 1; j < l.gates.length; j++) {
          const a = l.gates[i];
          const b = l.gates[j];
          if (Math.abs(a.y - b.y) > 0.5) continue;
          const gap = Math.abs(a.x - b.x) - (a.width / 2 + (a.move?.amp ?? 0)) - (b.width / 2 + (b.move?.amp ?? 0));
          expect(gap, `${l.id} gates ${i} and ${j} overlap`).toBeGreaterThanOrEqual(-1e-6);
        }
      }
    }
  });

  it('puts bosses on 20/30/40/50 and a breather after each', () => {
    for (let n = FIRST_GENERATED; n <= LAST_LEVEL; n++) {
      const l = LEVELS[n - 1];
      const bosses = l.waves.filter((w) => w.type === 'boss' || w.type === 'tyrant').length;
      if (isBossLevel(n)) {
        expect(l.boss, l.id).toBe(true);
        expect(bosses, l.id).toBeGreaterThan(0);
      }
      if (n % 10 === 1) expect(targetMargin(n)).toBeLessThan(targetMargin(n - 1));
    }
    expect(LEVELS[29].waves.some((w) => w.type === 'tyrant')).toBe(true);
    expect(LEVELS[39].waves.filter((w) => w.type === 'boss').length).toBe(2);
  });

  it('gets harder as levels climb: late enemy HP and base HP far above the early generated levels', () => {
    const hp = (n: number) => scheduleHp(compileWaves(LEVELS[n - 1]));
    const mean = (ns: number[], f: (n: number) => number) => ns.reduce((a, n) => a + f(n), 0) / ns.length;
    const early = [16, 17, 18, 19];
    const lateN = [46, 47, 48, 49];
    expect(mean(lateN, hp)).toBeGreaterThan(2.5 * mean(early, hp));
    expect(mean(lateN, (n) => LEVELS[n - 1].baseHp)).toBeGreaterThan(1.5 * mean(early, (n) => LEVELS[n - 1].baseHp));
  });

  it('pays more for later levels', () => {
    for (let n = FIRST_GENERATED + 1; n <= LAST_LEVEL; n++) {
      if (!isBossLevel(n) && !isBossLevel(n - 1)) expect(LEVELS[n - 1].reward!).toBeGreaterThan(LEVELS[n - 2].reward!);
    }
  });
});
