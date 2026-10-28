import type { LevelConfig } from '../sim/levelTypes';

/**
 * Stress scene: very high fire rate through stacked multipliers into a constant flood of enemies, tuned so both
 * pools sit near their caps (5,000+ rendered entities) while combat, gates and compaction all run.
 */
export const STRESS_LEVEL: LevelConfig = {
  id: 'stress',
  name: 'Stress Test',
  seed: 99,
  baseHp: 1e12,
  fireRate: 60,
  gates: [
    { op: 'mul', value: 5, x: 0, y: 5, width: 12 },
    { op: 'mul', value: 3, x: -3, y: 9, width: 6 },
    { op: 'mul', value: 100, x: 3, y: 9, width: 6 },
  ],
  waves: [{ t: 0, type: 'grunt', count: 400_000, spread: 11, burst: 800, interval: 0.1 }],
  overtime: { delay: 1000, interval: 1000, count: 0, growth: 1 },
  stackCap: 3000,
  sandbox: true,
};
