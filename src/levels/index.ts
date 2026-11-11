import type { LevelConfig } from '../sim/levelTypes';
import { CAMPAIGN } from './campaign';
import { FIRST_GENERATED, LAST_LEVEL, generateLevel } from './generator';

/** The calibrated campaign: handcrafted levels 1-15, then seeded procedural levels 16-100. Built once at startup. */
export const LEVELS: readonly LevelConfig[] = [
  ...CAMPAIGN,
  ...Array.from({ length: LAST_LEVEL - FIRST_GENERATED + 1 }, (_, i) => generateLevel(FIRST_GENERATED + i)),
];

/** Level by 0-based index: the campaign, then endless levels (101, 102, ...) generated on demand. */
export function levelAt(i: number): LevelConfig {
  return i < LEVELS.length ? LEVELS[i] : generateLevel(i + 1);
}
