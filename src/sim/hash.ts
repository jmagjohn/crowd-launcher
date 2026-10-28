import type { UnitPool } from './pool';
import type { World } from './world';

/** FNV-1a over the live part of both pools plus key scalars. Debug/test only (allocates). */
export function hashWorld(w: World): string {
  let h = 0x811c9dc5;
  const mix = (bytes: Uint8Array): void => {
    for (let i = 0; i < bytes.length; i++) {
      h ^= bytes[i];
      h = Math.imul(h, 0x01000193) >>> 0;
    }
  };
  const pool = (p: UnitPool): void => {
    const n = p.n;
    mix(new Uint8Array(p.type.buffer, 0, n));
    mix(new Uint8Array(p.x.buffer, 0, n * 4));
    mix(new Uint8Array(p.y.buffer, 0, n * 4));
    mix(new Uint8Array(p.hp.buffer, 0, n * 4));
    mix(new Uint8Array(p.count.buffer, 0, n * 8));
  };
  pool(w.player);
  pool(w.enemy);
  mix(new Uint8Array(new Float64Array([w.tick, w.baseHp, w.charge, w.state, w.rng.state]).buffer));
  return h.toString(16).padStart(8, '0');
}
