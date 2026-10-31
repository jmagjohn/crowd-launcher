// Lane-space constants. x runs across the lane (0 = centre), y runs from the launcher (0) to the base.

export const TICK_HZ = 60;
export const DT = 1 / TICK_HZ;

export const LANE_WIDTH = 12;
export const LANE_HALF = LANE_WIDTH / 2;
export const LANE_LENGTH = 44;

/** Front face of the enemy base. Player units reaching it deal damage. */
export const BASE_Y = LANE_LENGTH;
/** Enemies spawn just in front of the base. */
export const ENEMY_SPAWN_Y = LANE_LENGTH - 1.5;
/** Player units appear here when fired. */
export const LAUNCH_Y = 0.6;
/** Any enemy crossing this line is a breach (loss). */
export const BREACH_Y = 0;

export const GRID_CELL = 1.0;
/** Enemies with a radius above this go in the "big" list instead of the grid. */
export const BIG_RADIUS = 1.0;

export const DEFAULT_STACK_CAP = 3000;
/** Slots kept free for launcher shots so gate clones can never starve the launcher. */
export const LAUNCH_RESERVE = 240;
/** Max new entities a single gate crossing may create; the rest folds into stack counts. */
export const MAX_CLONES_PER_PASS = 24;
/** Max entities per spawned enemy group; larger groups become stacks. */
export const MAX_GROUP_ENTITIES = 80;

export const LATERAL_DAMPING = 0.92;
export const MAX_STEPS_PER_FRAME = 5;

// Boss shockwave: every SHOCK_PERIOD seconds the boss stops, winds up for SHOCK_WINDUP, then emits a ring that grows
// from its body to SHOCK_MAX_R. Every player unit the ring sweeps over takes SHOCK_DMG HP (per logical unit).
export const SHOCK_PERIOD = 5;
export const SHOCK_WINDUP = 1.1;
export const SHOCK_SPEED = 9;
export const SHOCK_MAX_R = 7.5;
export const SHOCK_DMG = 1;
export const MAX_SHOCKS = 8;
/** Grunts a Tyrant summons with every stomp (scaled by dynamic difficulty like any crowd). */
export const TYRANT_SUMMON = 16;
/** Enemies only steer toward the launcher once they are this close to the breach line. */
export const DRIFT_RANGE = 30;
