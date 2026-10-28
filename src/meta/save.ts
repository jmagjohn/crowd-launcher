import type { UpgradeLevels } from './upgrades';

/**
 * Versioned save. Bump SAVE_VERSION when the shape changes and add a step to `migrate`; older saves are upgraded
 * in place, unknown or corrupt data falls back to a fresh save (never throws into the game).
 */
export const SAVE_VERSION = 1;
const KEY = 'crowd-launcher.save';

export interface LevelRecord {
  wins: number;
  losses: number;
  /** Consecutive losses since the last win or difficulty step. */
  streak: number;
  /** Dynamic-difficulty steps applied (each -5% enemy budget, max 3). */
  assist: number;
  /** Best (lowest) clear time in seconds. */
  best?: number;
}

export interface SaveData {
  v: number;
  coins: number;
  /** Highest unlocked campaign index (0-based). */
  unlocked: number;
  levels: Record<string, LevelRecord>;
  upgrades: UpgradeLevels;
  weapons: { owned: string[]; equipped: string };
  /** Mechanic intros already shown. */
  seen: string[];
  /** Dynamic difficulty adjustments, newest last (capped). */
  assistLog: string[];
  settings: { sound: boolean; shake: boolean };
}

export function freshSave(): SaveData {
  return {
    v: SAVE_VERSION,
    coins: 0,
    unlocked: 0,
    levels: {},
    upgrades: {},
    weapons: { owned: ['blaster'], equipped: 'blaster' },
    seen: [],
    assistLog: [],
    settings: { sound: true, shake: true },
  };
}

/** Upgrades any older save to the current version. Fields missing from a partial save take defaults. */
export function migrate(raw: unknown): SaveData {
  const base = freshSave();
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Partial<SaveData> & { v?: number };
  const v = typeof r.v === 'number' ? r.v : 0;
  if (v > SAVE_VERSION) return base; // From a newer build: don't guess.
  // v0 -> v1: no released v0 existed; treat an unversioned object as a partial v1.
  const out: SaveData = {
    v: SAVE_VERSION,
    coins: num(r.coins, 0),
    unlocked: num(r.unlocked, 0),
    levels: r.levels && typeof r.levels === 'object' ? r.levels : {},
    upgrades: r.upgrades && typeof r.upgrades === 'object' ? r.upgrades : {},
    weapons: {
      owned: Array.isArray(r.weapons?.owned) ? r.weapons.owned.filter((k) => typeof k === 'string') : base.weapons.owned,
      equipped: typeof r.weapons?.equipped === 'string' ? r.weapons.equipped : 'blaster',
    },
    seen: Array.isArray(r.seen) ? r.seen : [],
    assistLog: Array.isArray(r.assistLog) ? r.assistLog.slice(-50) : [],
    settings: { ...base.settings, ...(r.settings ?? {}) },
  };
  if (!out.weapons.owned.includes('blaster')) out.weapons.owned.unshift('blaster');
  if (!out.weapons.owned.includes(out.weapons.equipped)) out.weapons.equipped = 'blaster';
  return out;
}

export function loadSave(): SaveData {
  try {
    const text = localStorage.getItem(KEY);
    return text ? migrate(JSON.parse(text)) : freshSave();
  } catch {
    return freshSave();
  }
}

export function writeSave(save: SaveData): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(save));
  } catch {
    // Private mode or quota: the run continues, progress just isn't persisted.
  }
}

export function clearSave(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

function num(v: unknown, d: number): number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : d;
}
