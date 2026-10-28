import { describe, expect, it } from 'vitest';
import { CAMPAIGN } from '../src/levels/campaign';
import { ASSIST_MAX_STEPS, Progress } from '../src/meta/progress';
import { SAVE_VERSION, freshSave, migrate } from '../src/meta/save';
import { UPGRADES, upgradeCost } from '../src/meta/upgrades';

const L1 = CAMPAIGN[0];
const lose = { won: false, progress: 0.5, seconds: 30 };
const win = { won: true, progress: 1, seconds: 20 };

describe('save schema', () => {
  it('migrates garbage and empty input to a fresh save', () => {
    for (const raw of [null, undefined, 42, 'x', [], {}]) {
      const s = migrate(raw);
      expect(s.v).toBe(SAVE_VERSION);
      expect(s.weapons.owned).toContain('blaster');
      expect(s.weapons.equipped).toBe('blaster');
    }
  });

  it('keeps valid fields from a partial save and repairs bad ones', () => {
    const s = migrate({ coins: 120, unlocked: 4, upgrades: { fireRate: 2 }, weapons: { owned: ['twin'], equipped: 'scatter' }, coins2: 9 });
    expect(s.coins).toBe(120);
    expect(s.unlocked).toBe(4);
    expect(s.upgrades.fireRate).toBe(2);
    expect(s.weapons.owned).toEqual(['blaster', 'twin']);
    expect(s.weapons.equipped).toBe('blaster'); // not owned -> reset
    expect(migrate({ coins: -5 }).coins).toBe(0);
  });

  it('does not guess at saves from a newer build', () => {
    expect(migrate({ v: SAVE_VERSION + 1, coins: 999 }).coins).toBe(0);
  });

  it('round-trips through JSON', () => {
    const p = new Progress(freshSave());
    p.finishRun(L1, 0, win);
    const back = migrate(JSON.parse(JSON.stringify(p.save)));
    expect(back).toEqual(p.save);
  });
});

describe('progression', () => {
  it('pays full reward on first clear, then 25% halving down to 5%', () => {
    const p = new Progress(freshSave());
    const base = L1.reward!;
    const pays = Array.from({ length: 6 }, () => p.finishRun(L1, 0, win).coins);
    expect(pays[0]).toBe(base);
    expect(pays[1]).toBe(Math.round(base * 0.25));
    expect(pays[2]).toBe(Math.round(base * 0.125));
    expect(pays[5]).toBe(Math.round(base * 0.05));
    expect(p.save.unlocked).toBe(1);
  });

  it('pays a consolation share on a loss, proportional to damage dealt', () => {
    const p = new Progress(freshSave());
    expect(p.finishRun(L1, 0, { won: false, progress: 0, seconds: 5 }).coins).toBe(0);
    expect(p.finishRun(L1, 0, lose).coins).toBe(Math.round(L1.reward! * 0.2 * 0.5));
  });

  it('dynamic difficulty: -5% per 3 consecutive losses, capped at -15%, logged, never raised by a win', () => {
    const p = new Progress(freshSave());
    const notes: string[] = [];
    for (let i = 0; i < 20; i++) {
      const r = p.finishRun(L1, 0, lose);
      if (r.assistNote) notes.push(r.assistNote);
    }
    expect(notes.length).toBe(ASSIST_MAX_STEPS);
    expect(p.enemyScale(L1.id)).toBeCloseTo(0.85);
    expect(p.save.assistLog.length).toBe(ASSIST_MAX_STEPS);
    p.finishRun(L1, 0, win);
    expect(p.enemyScale(L1.id)).toBeCloseTo(0.85);
    expect(p.modsFor(L1).enemyScale).toBeCloseTo(0.85);
  });

  it('a win resets the loss streak', () => {
    const p = new Progress(freshSave());
    p.finishRun(L1, 0, lose);
    p.finishRun(L1, 0, lose);
    p.finishRun(L1, 0, win);
    expect(p.finishRun(L1, 0, lose).assistNote).toBeNull();
    expect(p.enemyScale(L1.id)).toBe(1);
  });

  it('upgrades cost c0 * 1.45^k, cap at max, and refuse when broke', () => {
    const p = new Progress(freshSave());
    const def = UPGRADES[0];
    expect(p.buyUpgrade(def.key)).toBe(false);
    p.save.coins = 1e9;
    for (let k = 0; k < def.max; k++) {
      expect(p.nextUpgradeCost(def.key)).toBe(upgradeCost(def, k));
      expect(p.buyUpgrade(def.key)).toBe(true);
    }
    expect(p.nextUpgradeCost(def.key)).toBeNull();
    expect(p.buyUpgrade(def.key)).toBe(false);
    expect(p.upgradeLevel(def.key)).toBe(def.max);
  });

  it('weapons: buy once (auto-equips), equip only owned', () => {
    const p = new Progress(freshSave());
    p.equip('twin');
    expect(p.save.weapons.equipped).toBe('blaster');
    p.save.coins = 1000;
    expect(p.buyWeapon('twin')).toBe(true);
    expect(p.save.weapons.equipped).toBe('twin');
    expect(p.buyWeapon('twin')).toBe(false);
    p.equip('blaster');
    expect(p.save.weapons.equipped).toBe('blaster');
    expect(p.modsFor(L1).weapon).toBe(0);
  });
});
