import type { LevelConfig } from '../sim/levelTypes';
import { CAMPAIGN } from './campaign';
import { FIRST_GENERATED, LAST_LEVEL, generateLevel } from './generator';

/** The full campaign: handcrafted levels 1-15, then seeded procedural levels 16-50. Built once at startup. */
export const LEVELS: readonly LevelConfig[] = [
  ...CAMPAIGN,
  ...Array.from({ length: LAST_LEVEL - FIRST_GENERATED + 1 }, (_, i) => generateLevel(FIRST_GENERATED + i)),
];
