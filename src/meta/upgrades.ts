import { NEUTRAL_MODS, type PlayerMods } from '../sim/levelTypes';
import { WEAPON_KEY_TO_ID } from '../sim/weapons';

/**
 * Permanent upgrades bought with coins. Costs grow geometrically (c0 * 1.45^k) while income grows roughly linearly
 * with level, so upgrade levels grow about logarithmically: they help, but never replace aiming.
 */
export interface UpgradeDef {
  readonly key: UpgradeKey;
  readonly name: string;
  readonly icon: string;
  readonly max: number;
  readonly c0: number;
  /** Human-readable effect at level k (k >= 1). */
  readonly effect: (k: number) => string;
}

export type UpgradeKey = 'fireRate' | 'volley' | 'gatePower' | 'reserves' | 'charge' | 'brute' | 'siege';

export const UPGRADES: readonly UpgradeDef[] = [
  { key: 'fireRate', name: 'Fire Rate', icon: '»', max: 10, c0: 40, effect: (k) => `+${k * 8}% shots per second` },
  { key: 'volley', name: 'Volley', icon: '⁂', max: 10, c0: 60, effect: (k) => `+${k * 5}% units per shot` },
  { key: 'gatePower', name: 'Gate Power', icon: '×', max: 10, c0: 70, effect: (k) => `+${k * 4}% from + and × gates` },
  { key: 'reserves', name: 'Reserves', icon: '+', max: 10, c0: 30, effect: (k) => `Start with ${k * 5} units on the field` },
  { key: 'charge', name: 'Quick Charge', icon: '⚡', max: 8, c0: 50, effect: (k) => `Brute charges ${k * 12}% faster` },
  { key: 'brute', name: 'Brute Power', icon: '✊', max: 8, c0: 80, effect: (k) => `Brute HP and damage +${k * 20}%` },
  { key: 'siege', name: 'Siege', icon: '⚑', max: 10, c0: 60, effect: (k) => `+${k * 8}% damage to the base` },
];

export function upgradeCost(def: UpgradeDef, level: number): number {
  return Math.round((def.c0 * Math.pow(1.45, level)) / 5) * 5;
}

export type UpgradeLevels = Partial<Record<UpgradeKey, number>>;

/** Turns owned upgrades + equipped weapon into sim modifiers. */
export function modsFor(upgrades: UpgradeLevels, weaponKey: string, enemyScale = 1): PlayerMods {
  const u = (k: UpgradeKey): number => upgrades[k] ?? 0;
  return {
    ...NEUTRAL_MODS,
    weapon: WEAPON_KEY_TO_ID[weaponKey] ?? 0,
    fireRateMult: 1 + 0.08 * u('fireRate'),
    shotBonusPct: 5 * u('volley'),
    gateBonusPct: 4 * u('gatePower'),
    startArmy: 5 * u('reserves'),
    chargeMult: 1 + 0.12 * u('charge'),
    championMult: 1 + 0.2 * u('brute'),
    baseDamageMult: 1 + 0.08 * u('siege'),
    enemyScale,
  };
}
