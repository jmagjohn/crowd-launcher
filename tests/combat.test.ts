import { describe, expect, it } from 'vitest';
import { SHOCK_PERIOD, TICK_HZ } from '../src/sim/config';
import { NEUTRAL_MODS, type LevelConfig } from '../src/sim/levelTypes';
import { T_BRUTE, T_SOLDIER } from '../src/sim/unitTypes';
import { WEAPONS, weaponUnitsPerSecond } from '../src/sim/weapons';
import { World } from '../src/sim/world';

/** Empty lane: no gates, no waves, no overtime, unkillable base. */
const EMPTY: LevelConfig = {
  id: 'empty', name: 'empty', baseHp: 1e9, fireRate: 10, gates: [], waves: [],
  overtime: { delay: 1e6, interval: 1e6, count: 0, growth: 1 }, sandbox: true,
};

describe('weapons', () => {
  for (let wi = 0; wi < WEAPONS.length; wi++) {
    it(`${WEAPONS[wi].key} fires exactly rate x rateMult x muzzles units per second`, () => {
      const w = new World(EMPTY, { ...NEUTRAL_MODS, weapon: wi }, 1);
      w.input.firing = true;
      for (let t = 0; t < TICK_HZ * 10; t++) w.step();
      const expected = weaponUnitsPerSecond(wi, EMPTY.fireRate) * 10;
      // Per-muzzle volleys land on whole trigger pulls, so allow one pull of slack.
      expect(Math.abs(w.stats.fired - expected)).toBeLessThanOrEqual(WEAPONS[wi].offsets.length);
      expect(w.player.type[0]).toBe(WEAPONS[wi].unit);
    });
  }

  it('volley bonus adds exactly floor(shots * pct / 100) extra units', () => {
    for (const pct of [5, 15, 35, 50]) {
      const w = new World(EMPTY, { ...NEUTRAL_MODS, shotBonusPct: pct }, 2);
      w.input.firing = true;
      for (let t = 0; t < TICK_HZ * 7; t++) w.step();
      const shots = w.stats.fired - w.stats.volleyBonus;
      expect(w.stats.volleyBonus).toBe(Math.floor((shots * pct) / 100));
    }
  });

  it('dynamic difficulty scales headcount and base HP, never above authored', () => {
    const lvl: LevelConfig = { ...EMPTY, baseHp: 1000, waves: [{ t: 0, type: 'grunt', count: 100 }, { t: 0, type: 'boss', count: 1, hp: 400 }] };
    const easy = new World(lvl, { ...NEUTRAL_MODS, enemyScale: 0.85 }, 1);
    expect(easy.baseMaxHp).toBe(850);
    expect(easy.schedule.find((e) => e.hp === 1)!.count).toBe(85);
    expect(easy.schedule.find((e) => e.count === 1)!.hp).toBe(340);
    const hard = new World(lvl, { ...NEUTRAL_MODS, enemyScale: 1.5 }, 1);
    expect(hard.baseMaxHp).toBe(1000);
  });

  it('champion stays locked on levels that have not introduced it', () => {
    const w = new World({ ...EMPTY, champion: false, chargePerShot: 1 }, NEUTRAL_MODS, 1);
    w.input.firing = true;
    for (let t = 0; t < 120; t++) w.step();
    expect(w.charge).toBe(0);
    w.input.champion = true;
    w.step();
    expect(w.stats.champions).toBe(0);
  });
});

describe('boss shockwave', () => {
  const lvl: LevelConfig = { ...EMPTY, waves: [{ t: 0, type: 'boss', count: 1, x: 0, hp: 1e6 }] };

  /** Steps until the boss is 0.2 s from releasing its first shockwave. */
  function primed(mods = NEUTRAL_MODS): World {
    const w = new World(lvl, mods, 1);
    w.step();
    while (w.enemy.aux[0] < SHOCK_PERIOD - 0.2) w.step();
    return w;
  }

  it('hits each unit exactly once per wave: a Brute in the ring loses exactly 30% of max HP', () => {
    const w = primed({ ...NEUTRAL_MODS, championMult: 2.5 });
    const P = w.player;
    const by = w.enemy.y[0];
    P.spawn(T_BRUTE, 0, by - 7.2, 1, w.championHp, 0, 1);
    const maxHp = w.championHp;
    let released = false;
    for (let t = 0; t < TICK_HZ; t++) {
      w.step();
      if (w.shockOn[0]) released = true;
      if (released && !w.shockOn[0]) break;
    }
    expect(released).toBe(true);
    expect(P.n).toBe(1);
    expect(maxHp - P.totalHp(0)).toBe(Math.ceil(maxHp * 0.3));
    expect(w.stats.shockKilled).toBe(0);
  });

  it('wipes soldier stacks the ring sweeps and counts them as losses (conservation holds)', () => {
    const w = primed();
    const by = w.enemy.y[0];
    for (let k = 0; k < 9; k++) w.player.spawn(T_SOLDIER, -4 + k, by - 7, 10, 1, 0, k);
    const before = w.player.logicalCount();
    for (let t = 0; t < TICK_HZ * 0.6; t++) w.step();
    expect(w.stats.shockKilled).toBeGreaterThan(0);
    expect(w.stats.shockKilled).toBeLessThanOrEqual(before);
    expect(w.player.logicalCount()).toBe(before - w.stats.playerLost - w.stats.unitsToBase);
  });
});
