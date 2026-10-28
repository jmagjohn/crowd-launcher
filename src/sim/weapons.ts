import { T_RUNNER, T_SOLDIER } from './unitTypes';

/**
 * Launcher weapons. A weapon decides what one trigger pull fires: which unit type, from how many muzzles, at what
 * lateral offsets and initial sideways velocities, and how fast it cycles relative to the level's base fire rate.
 * Units per second = level fire rate x rateMult x muzzles, so each weapon trades raw volume against coverage.
 */
export interface WeaponDef {
  readonly key: string;
  readonly name: string;
  readonly blurb: string;
  readonly unit: number;
  readonly rateMult: number;
  /** Lane-x offset of each muzzle from the aim point. */
  readonly offsets: readonly number[];
  /** Initial lateral velocity of each muzzle's shot (decays with LATERAL_DAMPING). */
  readonly vx: readonly number[];
  readonly cost: number;
}

export const W_BLASTER = 0;
export const W_TWIN = 1;
export const W_SCATTER = 2;
export const W_RUNNER = 3;

export const WEAPONS: readonly WeaponDef[] = [
  {
    key: 'blaster', name: 'Blaster', blurb: 'One tight stream. Thread it through the best gate.',
    unit: T_SOLDIER, rateMult: 1, offsets: [0], vx: [0], cost: 0,
  },
  {
    key: 'twin', name: 'Twin Cannon', blurb: 'Two parallel streams: 20% more units, and it can feed two gates at once.',
    unit: T_SOLDIER, rateMult: 0.6, offsets: [-0.85, 0.85], vx: [0, 0], cost: 150,
  },
  {
    key: 'scatter', name: 'Scatter Gun', blurb: 'Three-way fan: 35% more units, sprayed wide. Great against swarms, poor at threading gates.',
    unit: T_SOLDIER, rateMult: 0.45, offsets: [-0.3, 0, 0.3], vx: [-3.2, 0, 3.2], cost: 320,
  },
  {
    key: 'runner', name: 'Runner Gun', blurb: 'Fires Runners: 25% faster fire and units that sprint at nearly twice the speed.',
    unit: T_RUNNER, rateMult: 1.25, offsets: [0], vx: [0], cost: 600,
  },
];

export const WEAPON_KEY_TO_ID: Readonly<Record<string, number>> = Object.fromEntries(WEAPONS.map((w, i) => [w.key, i]));

/** Logical units per second for a weapon at a given base fire rate. */
export function weaponUnitsPerSecond(weapon: number, baseRate: number): number {
  const w = WEAPONS[weapon];
  return baseRate * w.rateMult * w.offsets.length;
}
