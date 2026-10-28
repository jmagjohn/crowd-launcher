import type { LevelConfig, PlayerMods } from '../sim/levelTypes';
import { WEAPONS } from '../sim/weapons';
import { type LevelRecord, type SaveData } from './save';
import { UPGRADES, modsFor, upgradeCost, type UpgradeKey } from './upgrades';

/** Dynamic difficulty: every 3 consecutive losses on a level lowers its enemy budget 5%, at most 3 times (-15%). */
export const ASSIST_STEP = 0.05;
export const ASSIST_MAX_STEPS = 3;
export const ASSIST_AFTER_LOSSES = 3;

export interface RunResult {
  won: boolean;
  /** Fraction of the enemy base destroyed, 0..1. */
  progress: number;
  seconds: number;
}

export interface RunReward {
  coins: number;
  firstClear: boolean;
  /** Set when this loss triggered a difficulty step. */
  assistNote: string | null;
}

/**
 * All meta-progression rules over a SaveData. Methods mutate the save; the caller persists it.
 * No DOM, no storage: unit-testable and usable by the balance bots.
 */
export class Progress {
  constructor(public save: SaveData) {}

  get coins(): number {
    return this.save.coins;
  }

  record(id: string): LevelRecord {
    return (this.save.levels[id] ??= { wins: 0, losses: 0, streak: 0, assist: 0 });
  }

  enemyScale(id: string): number {
    return 1 - ASSIST_STEP * (this.save.levels[id]?.assist ?? 0);
  }

  modsFor(level: LevelConfig): PlayerMods {
    return modsFor(this.save.upgrades, this.save.weapons.equipped, this.enemyScale(level.id));
  }

  /**
   * Applies a finished run. Rewards: full on the first clear, then 25% halving on each replay down to 5%.
   * Losses pay a consolation share of the reward proportional to how much of the base was destroyed.
   */
  finishRun(level: LevelConfig, index: number, result: RunResult): RunReward {
    const rec = this.record(level.id);
    const base = level.reward ?? 30;
    let coins = 0;
    let firstClear = false;
    let assistNote: string | null = null;
    if (result.won) {
      firstClear = rec.wins === 0;
      const share = firstClear ? 1 : Math.max(0.05, 0.25 / Math.pow(2, rec.wins - 1));
      coins = Math.round(base * share);
      rec.wins++;
      rec.streak = 0;
      if (rec.best === undefined || result.seconds < rec.best) rec.best = Math.round(result.seconds * 10) / 10;
      if (this.save.unlocked < index + 1) this.save.unlocked = index + 1;
    } else {
      coins = Math.round(base * 0.2 * Math.max(0, Math.min(1, result.progress)));
      rec.losses++;
      rec.streak++;
      if (rec.streak >= ASSIST_AFTER_LOSSES && rec.assist < ASSIST_MAX_STEPS) {
        rec.assist++;
        rec.streak = 0;
        assistNote = `${level.id}: ${ASSIST_AFTER_LOSSES} losses in a row, enemy budget now -${Math.round(rec.assist * ASSIST_STEP * 100)}%`;
        this.save.assistLog.push(`${new Date().toISOString()} ${assistNote}`);
        if (this.save.assistLog.length > 50) this.save.assistLog.shift();
      }
    }
    this.save.coins += coins;
    return { coins, firstClear, assistNote };
  }

  upgradeLevel(key: UpgradeKey): number {
    return this.save.upgrades[key] ?? 0;
  }

  /** Cost of the next level, or null at max. */
  nextUpgradeCost(key: UpgradeKey): number | null {
    const def = UPGRADES.find((u) => u.key === key)!;
    const lvl = this.upgradeLevel(key);
    return lvl >= def.max ? null : upgradeCost(def, lvl);
  }

  buyUpgrade(key: UpgradeKey): boolean {
    const cost = this.nextUpgradeCost(key);
    if (cost === null || cost > this.save.coins) return false;
    this.save.coins -= cost;
    this.save.upgrades[key] = this.upgradeLevel(key) + 1;
    return true;
  }

  ownsWeapon(key: string): boolean {
    return this.save.weapons.owned.includes(key);
  }

  buyWeapon(key: string): boolean {
    const w = WEAPONS.find((x) => x.key === key);
    if (!w || this.ownsWeapon(key) || w.cost > this.save.coins) return false;
    this.save.coins -= w.cost;
    this.save.weapons.owned.push(key);
    this.save.weapons.equipped = key;
    return true;
  }

  equip(key: string): void {
    if (this.ownsWeapon(key)) this.save.weapons.equipped = key;
  }

  /** Cheapest thing the player could buy right now, for the loss screen's fail-forward nudge. */
  affordableSuggestion(): string | null {
    let best: { name: string; cost: number } | null = null;
    for (const u of UPGRADES) {
      const c = this.nextUpgradeCost(u.key);
      if (c !== null && c <= this.save.coins && (!best || c < best.cost)) best = { name: u.name, cost: c };
    }
    for (const w of WEAPONS) {
      if (!this.ownsWeapon(w.key) && w.cost <= this.save.coins && (!best || w.cost < best.cost)) best = { name: w.name, cost: w.cost };
    }
    return best ? `You can afford ${best.name} (${best.cost} coins) in the shop.` : null;
  }
}
