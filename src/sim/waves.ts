import { TICK_HZ } from './config';
import type { LevelConfig } from './levelTypes';
import { T_BOSS, T_GRUNT, T_OGRE, T_SHIELD, T_SWARM, T_TYRANT, TYPE_MAX_HP } from './unitTypes';

const ENEMY_TYPE: Readonly<Record<string, number>> = {
  grunt: T_GRUNT,
  shield: T_SHIELD,
  swarm: T_SWARM,
  boss: T_BOSS,
  ogre: T_OGRE,
  tyrant: T_TYRANT,
};

/** One compiled spawn: `count` units of `type` in a formation centred on x. Sorted by tick. */
export interface SpawnEvent {
  readonly tick: number;
  readonly type: number;
  readonly count: number;
  readonly x: number;
  readonly spread: number;
  readonly hp: number;
}

/** Expands waves (with bursts) into a flat, tick-sorted schedule. Runs once at load. */
export function compileWaves(level: LevelConfig, scale = 1): SpawnEvent[] {
  const out: SpawnEvent[] = [];
  for (const w of level.waves) {
    const type = ENEMY_TYPE[w.type];
    // Dynamic difficulty scales headcount for crowds and HP for bosses (a boss stays one boss).
    const isBoss = w.type === 'boss' || w.type === 'tyrant';
    const hp = Math.max(1, Math.round((w.hp ?? TYPE_MAX_HP[type]) * (isBoss ? scale : 1)));
    const total = isBoss ? w.count : Math.max(1, Math.round(w.count * scale));
    const x = w.x ?? 0;
    const spread = w.spread ?? (isBoss ? 0 : 6);
    const burst = w.burst && w.burst > 0 ? w.burst : w.count;
    const interval = w.interval ?? 0;
    let left = total;
    let k = 0;
    while (left > 0) {
      const c = Math.min(burst, left);
      out.push({ tick: Math.round((w.t + k * interval) * TICK_HZ), type, count: c, x, spread, hp });
      left -= c;
      k++;
    }
  }
  // Stable sort keeps authoring order within a tick, so compilation is deterministic.
  out.sort((p, q) => p.tick - q.tick);
  return out;
}

/** Total enemy HP across the scripted schedule (soldier-HP equivalents). */
export function scheduleHp(events: readonly SpawnEvent[]): number {
  let s = 0;
  for (const e of events) s += e.count * e.hp;
  return s;
}
