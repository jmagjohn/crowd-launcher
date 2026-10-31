// Unit type table. Ids are plain numbers so the hot loops index typed arrays directly.

export const T_SOLDIER = 0;
export const T_BRUTE = 1;
export const T_RUNNER = 2;
export const T_GRUNT = 3;
export const T_SHIELD = 4;
export const T_SWARM = 5;
export const T_BOSS = 6;
export const T_OGRE = 7;
export const T_TYRANT = 8;
export const NUM_UNIT_TYPES = 9;

export const TEAM_PLAYER = 0;
export const TEAM_ENEMY = 1;

export const F_IGNORES_GATES = 1;
export const F_CHAMPION = 2;
export const F_BIG = 4;

export interface UnitDef {
  readonly id: number;
  readonly key: string;
  readonly name: string;
  readonly team: number;
  readonly maxHp: number;
  /** World units per second. */
  readonly speed: number;
  readonly radius: number;
  /** Base damage per logical unit on reaching the enemy base. */
  readonly baseDamage: number;
  readonly flags: number;
  /** Enemies: lateral speed (units/s) at which they steer toward the launcher. */
  readonly drift: number;
  /** Enemies: side-to-side weave amplitude in units/s (swarms). */
  readonly weave: number;
}

export const UNIT_DEFS: readonly UnitDef[] = [
  { id: T_SOLDIER, key: 'soldier', name: 'Soldier', team: TEAM_PLAYER, maxHp: 1, speed: 7, radius: 0.28, baseDamage: 1, flags: 0, drift: 0, weave: 0 },
  { id: T_BRUTE, key: 'brute', name: 'Brute', team: TEAM_PLAYER, maxHp: 40, speed: 3.5, radius: 0.85, baseDamage: 25, flags: F_IGNORES_GATES | F_CHAMPION, drift: 0, weave: 0 },
  { id: T_RUNNER, key: 'runner', name: 'Runner', team: TEAM_PLAYER, maxHp: 1, speed: 12, radius: 0.22, baseDamage: 1, flags: 0, drift: 0, weave: 0 },
  { id: T_GRUNT, key: 'grunt', name: 'Grunt', team: TEAM_ENEMY, maxHp: 1, speed: 4, radius: 0.3, baseDamage: 0, flags: 0, drift: 0.55, weave: 0 },
  { id: T_SHIELD, key: 'shield', name: 'Shield', team: TEAM_ENEMY, maxHp: 3, speed: 2.5, radius: 0.45, baseDamage: 0, flags: 0, drift: 0.35, weave: 0 },
  { id: T_SWARM, key: 'swarm', name: 'Swarm', team: TEAM_ENEMY, maxHp: 1, speed: 7, radius: 0.2, baseDamage: 0, flags: 0, drift: 0.9, weave: 2.6 },
  { id: T_BOSS, key: 'boss', name: 'Boss', team: TEAM_ENEMY, maxHp: 300, speed: 0.9, radius: 2.2, baseDamage: 0, flags: F_BIG, drift: 0.25, weave: 0 },
  // Late game (levels 16+). Ogre: a slow, heavy brawler worth 12 grunts that soaks up thin streams.
  { id: T_OGRE, key: 'ogre', name: 'Ogre', team: TEAM_ENEMY, maxHp: 12, speed: 1.9, radius: 0.7, baseDamage: 0, flags: 0, drift: 0.3, weave: 0 },
  // Tyrant: boss variant from level 30. Same shockwave cycle as the Warden, and each stomp summons grunts.
  { id: T_TYRANT, key: 'tyrant', name: 'Tyrant', team: TEAM_ENEMY, maxHp: 900, speed: 0.8, radius: 2.6, baseDamage: 0, flags: F_BIG, drift: 0.2, weave: 0 },
];

// Parallel arrays for hot-loop lookups.
export const TYPE_SPEED = new Float32Array(UNIT_DEFS.map((d) => d.speed));
export const TYPE_RADIUS = new Float32Array(UNIT_DEFS.map((d) => d.radius));
export const TYPE_MAX_HP = new Float32Array(UNIT_DEFS.map((d) => d.maxHp));
export const TYPE_BASE_DMG = new Float32Array(UNIT_DEFS.map((d) => d.baseDamage));
export const TYPE_FLAGS = new Uint8Array(UNIT_DEFS.map((d) => d.flags));
export const TYPE_DRIFT = new Float32Array(UNIT_DEFS.map((d) => d.drift));
export const TYPE_WEAVE = new Float32Array(UNIT_DEFS.map((d) => d.weave));

export const UNIT_KEY_TO_ID: Readonly<Record<string, number>> = Object.fromEntries(UNIT_DEFS.map((d) => [d.key, d.id]));
