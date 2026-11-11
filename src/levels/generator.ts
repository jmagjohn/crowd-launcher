import type { EnemyKey, GateConfig, LevelConfig, WaveConfig } from '../sim/levelTypes';
import { Rng } from '../sim/rng';
import { TYPE_MAX_HP, UNIT_KEY_TO_ID } from '../sim/unitTypes';
import { TUNE } from './tuning';

/**
 * Seeded procedural levels 16-50 (docs/PLAN.md, "Difficulty math"). The same level number always produces the
 * same level: the generator only reads its own Rng, seeded from the level number.
 *
 * Enemy strength is D(L) = pacing(L) * GROWTH^(L - 15) times a per-level calibration k(L) from tuning.ts. Random
 * gate layouts move a level's ceiling a lot, so the formula alone is not enough: `npm run balance -- --calibrate`
 * finds the strongest waves a skilled bot, with the upgrades a player would own by then, survives for
 * levelDuration(L) seconds, and stores k(L) = targetMargin(L) * that maximum. The margin tightens as levels climb
 * (with the same sawtooth), so late levels sit close to that ceiling.
 *
 * Base HP is calibrated separately, from the damage that bot deals in levelDuration(L): the threat decides whether
 * you survive, the base decides how long you must. Gate richness also grows (more rows, bigger multipliers) so the
 * player's ceiling rises with the enemy's.
 */
export const FIRST_GENERATED = 16;
/** Last calibrated campaign level. Beyond it is endless mode (see endlessTune). */
export const LAST_LEVEL = 100;
/** `late` runs 0..1 over levels 15-50 and keeps climbing after; values past LATE_CAP stop changing gate speeds etc. */
const LATE_SPAN = 35;
const LATE_CAP = 1.6;
/**
 * Endless mode. Levels up to ENDLESS_CALIBRATED are calibrated against maxed upgrades, with the margin climbing
 * ENDLESS_RAMP of the bot's ceiling per level (past 100% from about level 110: how far you get is the score).
 * Past that, strength and base extrapolate at ENDLESS_GROWTH per level.
 */
export const ENDLESS_CALIBRATED = 160;
export const ENDLESS_RAMP = 0.02;
export const ENDLESS_GROWTH = 1.03;

function lateness(n: number): number {
  return (n - 15) / LATE_SPAN;
}

/** Tuned with `npm run balance` (scripts/balance.ts). */
export const GEN = {
  /** Per-level growth of the enemy budget. */
  growth: 1.075,
  /** Enemy wave HP (soldier-HP equivalents) at D = 1, i.e. level 15 strength. */
  waveHp0: 1100,
  /** Base HP at D = 1, used only before a level is calibrated. */
  baseHp0: 4000,
  /** Boss HP at D = 1 (the Warden on level 15 had 550). */
  bossHp0: 600,
  tyrantHp0: 900,
};

/** Sawtooth pacing inside each block of 10: ramp 0.80 -> 1.10, boss level 1.30, the level after a boss 0.70. */
export function pacing(n: number): number {
  const p = ((n - 1) % 10) + 1;
  if (p === 10) return 1.3;
  if (p === 1) return 0.7;
  return 0.8 + ((p - 2) / 7) * 0.3;
}

export function difficulty(n: number): number {
  return pacing(n) * Math.pow(GEN.growth, n - 15);
}

/** Fraction of the calibrated ceiling a level is set at: ~0.5 at 16, up to 0.82 in the 40s; sawtooth on top. */
export function targetMargin(n: number): number {
  const late = lateness(n);
  const endless = n > LAST_LEVEL ? ENDLESS_RAMP * (n - LAST_LEVEL) : 0;
  return Math.min(0.82, Math.max(0.35, (0.5 + 0.25 * late) * pacing(n))) + endless;
}

/** Target length of a level for a strong, upgraded player: 30 s at level 16, 55 s at 50, 60 s from 57 (bosses +10 s). */
export function levelDuration(n: number): number {
  const late = Math.min(lateness(n), 1.2);
  return 30 + 25 * late + (isBossLevel(n) ? 10 : 0);
}

export function isBossLevel(n: number): boolean {
  return n % 10 === 0;
}

const ADJ = ['Iron', 'Ember', 'Frost', 'Hollow', 'Crimson', 'Ashen', 'Storm', 'Bone', 'Thorn', 'Gilded', 'Shadow', 'Broken', 'Sunken', 'Howling'];
const NOUN = ['Pass', 'Gate', 'Bridge', 'Keep', 'Road', 'March', 'Hold', 'Rampart', 'Ford', 'Crossing', 'Watch', 'Spire', 'Causeway', 'Breach'];
const BOSS_NAMES: Record<number, string> = {
  20: "Warden's Return",
  30: 'The Tyrant',
  40: 'Twin Wardens',
  50: 'Last Stand',
  60: "Warlord's Pact",
  70: 'Twin Kings',
  80: 'War Council',
  90: 'The Horde',
  100: 'Final Siege',
};

const INTROS: Record<number, LevelConfig['intro']> = {
  16: { title: 'Ogres', text: 'Ogres take 12 hits each and plod forward. A thin stream just feeds them; multiply hard before you meet one.' },
  25: { title: 'Escorted', text: 'From here on, Wardens can lead ordinary waves. Expect stomps on any level.' },
  30: { title: 'Boss: the Tyrant', text: 'The Tyrant stomps like a Warden, and every stomp calls up a pack of grunts. Kill it fast or drown.' },
  40: { title: 'Two at once', text: 'Two Wardens, staggered stomps. Upgrades are not optional any more.' },
  51: { title: 'Beyond the wall', text: 'The war goes on. Five gate rows from level 60, faster gates, and bigger hordes.' },
  70: { title: 'Two kings', text: 'Two Tyrants, two summoning stomps. Thin their escorts before they swarm you.' },
  75: { title: 'Royal escort', text: 'From here, Tyrants lead ordinary waves too.' },
  100: { title: 'Final Siege', text: 'Every boss they have left. Win this and the endless war begins.' },
  101: { title: 'Endless', text: 'The war never ends. Each level pushes a little harder than the last, and sooner or later the horde wins. How far can you go?' },
};

type RowKind = 'pair' | 'toll' | 'plus' | 'div' | 'flip' | 'move' | 'limited';

/** Row templates and the level each becomes available (all of them exist by level 15; this just orders variety). */
const ROW_KINDS: readonly RowKind[] = ['pair', 'toll', 'plus', 'div', 'flip', 'move', 'limited'];

/** `k` scales the enemy waves and bosses; `baseHp` overrides the base (both default to the calibration table). */
export function generateLevel(n: number, k = TUNE[n]?.k ?? endlessTune(n).k, baseHp = TUNE[n]?.base ?? endlessTune(n).base): LevelConfig {
  if (n < FIRST_GENERATED) throw new Error(`generateLevel: level ${n} is handcrafted`);
  const seed = 0x5eed + n * 7919;
  const rng = new Rng(seed);
  const D = difficulty(n);
  const K = D * k;
  const late = Math.min(lateness(n), LATE_CAP); // 0..1 over 16-50, capped later
  const boss = isBossLevel(n);

  // Gate values (tolls, + gates, flip thresholds) track D through the campaign. In endless D keeps compounding while
  // k holds the enemy flat, so gates grow ENDLESS_GROWTH a level from level 100 instead.
  const gateD = n > LAST_LEVEL ? (pacing(n) / pacing(LAST_LEVEL)) * difficulty(LAST_LEVEL) * Math.pow(ENDLESS_GROWTH, n - LAST_LEVEL) : D;
  const gates = buildGates(n, rng, gateD, late);
  const waves = buildWaves(n, rng, K, late);

  const name = BOSS_NAMES[n] ?? `${ADJ[rng.int(ADJ.length)]} ${NOUN[rng.int(NOUN.length)]}`;
  const reward = Math.round(((110 + 7 * (n - 15)) * (boss ? 1.6 : 1)) / 5) * 5;
  return {
    id: `g${n}`,
    name,
    seed,
    baseHp: baseHp ?? Math.round((GEN.baseHp0 * K) / 10) * 10,
    fireRate: 11 + Math.floor((n - 15) / 10) * 0.5,
    reward,
    boss: boss || undefined,
    intro: INTROS[n],
    gates,
    waves,
  };
}

// ---- gates ----

function buildGates(n: number, rng: Rng, D: number, late: number): GateConfig[] {
  const rowsY = n < 25 ? [8, 16, 24] : n < 60 ? [7, 13.5, 20, 26.5] : [6.5, 12, 17.5, 23, 28.5];
  const narrow = Math.max(2.2, 3 - 0.8 * late);
  const out: GateConfig[] = [];
  let prev: RowKind | null = null;
  for (let r = 0; r < rowsY.length; r++) {
    const y = rowsY[r];
    let kind = ROW_KINDS[rng.int(ROW_KINDS.length)];
    // No repeats back to back; the toll row needs room for its follow-up gate, so not in the last row.
    while (kind === prev || (kind === 'toll' && r === rowsY.length - 1)) kind = ROW_KINDS[rng.int(ROW_KINDS.length)];
    prev = kind;
    const s = rng.next() < 0.5 ? -1 : 1;
    switch (kind) {
      case 'pair': {
        const a = r === 0 || rng.next() < 0.6 ? 2 : 3;
        out.push({ op: 'mul', value: a, x: -s * 3, y, width: 4.5 });
        out.push({ op: 'mul', value: a + 1, x: s * 3.4, y, width: narrow });
        break;
      }
      case 'toll': {
        const toll = Math.round((25 * Math.pow(D, 0.8)) / 5) * 5;
        out.push({ op: 'sub', value: toll, x: s * 3, y, width: 4.2, regen: Math.round(2 + 4 * late) });
        out.push({ op: 'mul', value: 4 + (late > 0.5 ? 1 : 0), x: s * 3, y: y + 3.2, width: 4 });
        out.push({ op: 'mul', value: 2, x: -s * 3, y: y + 1.6, width: 4.5 });
        break;
      }
      case 'plus': {
        const v = Math.round((25 * Math.pow(D, 0.6)) / 5) * 5;
        out.push({ op: 'add', value: v, x: s * 3.5, y, width: narrow, recharge: 1 });
        out.push({ op: 'mul', value: 2, x: -s * 3, y, width: 4.5 });
        break;
      }
      case 'div': {
        // A divider in the middle with narrow x3s at the edges; late on it wobbles, eating into the edges.
        const div: GateConfig = { op: 'div', value: late > 0.6 ? 3 : 2, x: 0, y, width: 3 };
        if (late > 0.4) div.move = { amp: 1.1, speed: 0.8 + 0.6 * late, phase: rng.range(0, 6) };
        out.push(div);
        out.push({ op: 'mul', value: 3, x: -4.4, y, width: narrow + 0.2 });
        out.push({ op: 'mul', value: 3, x: 4.4, y, width: narrow + 0.2 });
        break;
      }
      case 'flip': {
        const after = Math.round((240 * Math.pow(D, 0.9)) / 10) * 10;
        out.push({ op: 'mul', value: 4, x: s * 3, y, width: 4, flip: { after, op: 'div', value: 2 } });
        out.push({ op: 'mul', value: 2, x: -s * 3, y, width: 4.5 });
        break;
      }
      case 'move': {
        out.push({ op: 'mul', value: 3, x: 0, y, width: narrow + 0.3, move: { amp: 3.4, speed: 0.8 + 0.7 * late, phase: rng.range(0, 6) } });
        break;
      }
      case 'limited': {
        const uses = Math.round((40 * Math.pow(D, 0.7)) / 5) * 5;
        out.push({ op: 'mul', value: 5, x: 0, y, width: narrow, uses });
        out.push({ op: 'mul', value: 2, x: -4.3, y, width: 3.2 });
        out.push({ op: 'mul', value: 2, x: 4.3, y, width: 3.2 });
        break;
      }
    }
  }
  return out;
}

// ---- waves ----

const BURST_GAP = 1.6;

/** `K` is the full enemy scale: D(L) times the calibration k(L). */
function buildWaves(n: number, rng: Rng, K: number, late: number): WaveConfig[] {
  const out: WaveConfig[] = [];
  const bossLevel = isBossLevel(n);
  // Crowd budget. On boss levels the boss carries part of the threat, so the crowds are lighter.
  const budget = GEN.waveHp0 * K * (bossLevel ? 0.6 : 1);

  // Bosses: 20 Warden, 30 Tyrant, 40 two Wardens, 50 Tyrant + Warden. From 25, ordinary levels ending in 5 bring
  // an escorting Warden.
  const bossHp = (base: number) => Math.round((base * K) / 10) * 10;
  if (n === 20) out.push({ t: 2, type: 'boss', count: 1, hp: bossHp(GEN.bossHp0) });
  if (n === 30) out.push({ t: 2, type: 'tyrant', count: 1, hp: bossHp(GEN.tyrantHp0) });
  if (n === 40) {
    out.push({ t: 2, type: 'boss', count: 1, x: -2.5, hp: bossHp(GEN.bossHp0 * 0.7) });
    out.push({ t: 4.5, type: 'boss', count: 1, x: 2.5, hp: bossHp(GEN.bossHp0 * 0.7) });
  }
  if (n === 50) {
    out.push({ t: 2, type: 'tyrant', count: 1, hp: bossHp(GEN.tyrantHp0 * 0.8) });
    out.push({ t: 14, type: 'boss', count: 1, x: rng.range(-2, 2), hp: bossHp(GEN.bossHp0 * 0.6) });
  }
  // 60-100: every boss level stacks more of them.
  if (n === 60) {
    out.push({ t: 2, type: 'tyrant', count: 1, hp: bossHp(GEN.tyrantHp0 * 0.7) });
    out.push({ t: 9, type: 'boss', count: 1, x: -2.5, hp: bossHp(GEN.bossHp0 * 0.5) });
  }
  if (n === 70) {
    out.push({ t: 2, type: 'tyrant', count: 1, x: -2.5, hp: bossHp(GEN.tyrantHp0 * 0.55) });
    out.push({ t: 6, type: 'tyrant', count: 1, x: 2.5, hp: bossHp(GEN.tyrantHp0 * 0.55) });
  }
  if (n === 80) {
    for (const [t, x] of [[2, 0], [6, -3], [10, 3]]) out.push({ t, type: 'boss', count: 1, x, hp: bossHp(GEN.bossHp0 * 0.45) });
  }
  if (n === 90) {
    out.push({ t: 2, type: 'tyrant', count: 1, hp: bossHp(GEN.tyrantHp0 * 0.6) });
    for (const [t, x] of [[8, -3], [14, 3]]) out.push({ t, type: 'boss', count: 1, x, hp: bossHp(GEN.bossHp0 * 0.4) });
  }
  if (n === 100) {
    for (const [t, x] of [[2, -2.5], [7, 2.5]]) out.push({ t, type: 'tyrant', count: 1, x, hp: bossHp(GEN.tyrantHp0 * 0.45) });
    for (const [t, x] of [[12, -3], [16, 3]]) out.push({ t, type: 'boss', count: 1, x, hp: bossHp(GEN.bossHp0 * 0.35) });
  }
  // Endless boss levels cycle through the 60-100 line-ups' simplest form: a Tyrant and a Warden.
  if (n > LAST_LEVEL && bossLevel) {
    out.push({ t: 2, type: 'tyrant', count: 1, hp: bossHp(GEN.tyrantHp0 * 0.6) });
    out.push({ t: 10, type: 'boss', count: 1, x: rng.range(-2, 2), hp: bossHp(GEN.bossHp0 * 0.5) });
  }
  // Escorts on levels ending in 5: a Warden from 25, a Tyrant from 75.
  if (!bossLevel && n >= 25 && n % 10 === 5) {
    const x = rng.range(-2, 2);
    if (n >= 75) out.push({ t: 10, type: 'tyrant', count: 1, x, hp: bossHp(GEN.tyrantHp0 * 0.4) });
    else out.push({ t: 10, type: 'boss', count: 1, x, hp: bossHp(GEN.bossHp0 * 0.5) });
  }

  // Crowd waves: more of them, and heavier types, as levels climb.
  const nWaves = 4 + Math.round(2 * late);
  const weights: Record<EnemyKey, number> = {
    grunt: 1,
    shield: 0.6 + 0.3 * late,
    swarm: 0.5 + 0.4 * late,
    ogre: n === 16 ? 1.2 : 0.35 + 0.6 * late,
    boss: 0,
    tyrant: 0,
  };
  const keys = (Object.keys(weights) as EnemyKey[]).filter((k) => weights[k] > 0);
  // Wave sizes grow through the level: shares 1, 1.25, 1.5, ...
  let shareSum = 0;
  for (let i = 0; i < nWaves; i++) shareSum += 1 + 0.25 * i;
  // Waves spread over the first 80% of the level; overtime covers the rest.
  const gap = (0.8 * levelDuration(n) - 3) / (nWaves - 1);
  let t = 3;
  for (let i = 0; i < nWaves; i++) {
    const hp = (budget * (1 + 0.25 * i)) / shareSum;
    // The first wave is always grunts, so every level opens gently; later waves mix two types.
    const a: EnemyKey = i === 0 ? 'grunt' : pickWeighted(rng, keys, weights);
    const mixed = i > 0 && rng.next() < 0.35 + 0.4 * late;
    const b: EnemyKey = mixed ? pickWeighted(rng, keys, weights) : a;
    const parts: [EnemyKey, number][] = a === b ? [[a, hp]] : [[a, hp * 0.6], [b, hp * 0.4]];
    for (const [type, h] of parts) {
      const unitHp = TYPE_MAX_HP[UNIT_KEY_TO_ID[type]];
      const count = Math.max(1, Math.round(h / unitHp));
      const bursts = Math.max(1, Math.min(5, Math.round(count / (type === 'ogre' ? 3 : 25))));
      out.push({
        t: Math.round(t * 10) / 10,
        type,
        count,
        x: Math.round(rng.range(-2, 2) * 10) / 10,
        spread: type === 'ogre' ? 7 : 10,
        burst: Math.ceil(count / bursts),
        interval: BURST_GAP,
      });
    }
    t += gap * rng.range(0.85, 1.15);
  }
  return out;
}

function pickWeighted(rng: Rng, keys: readonly EnemyKey[], w: Record<EnemyKey, number>): EnemyKey {
  let total = 0;
  for (const k of keys) total += w[k];
  let r = rng.next() * total;
  for (const k of keys) {
    r -= w[k];
    if (r <= 0) return k;
  }
  return keys[keys.length - 1];
}

/**
 * Stand-in for levels past the calibration table. Upgrades are maxed by then, so calibrated strength levels off:
 * take the average unpaced strength and base of the last calibrated block of ten (minus its boss level), centred
 * on its middle level, and grow both ENDLESS_GROWTH per level from there, keeping the usual sawtooth pacing.
 */
export function endlessTune(n: number): { k: number; base: number } {
  let logS = 0;
  let logBase = 0;
  let sumM = 0;
  let count = 0;
  const last = Math.floor(Math.max(LAST_LEVEL, ...Object.keys(TUNE).map(Number)) / 10) * 10;
  for (let m = last - 9; m < last; m++) {
    const t = TUNE[m];
    if (!t) continue;
    logS += Math.log(t.k * Math.pow(GEN.growth, m - 15)); // strength without pacing
    logBase += Math.log(t.base / pacing(m));
    sumM += m;
    count++;
  }
  if (count === 0) return { k: 1, base: Math.round((GEN.baseHp0 * difficulty(n)) / 10) * 10 };
  const grow = Math.pow(ENDLESS_GROWTH, n - sumM / count);
  // K = D(n) * k must equal pacing(n) * S * grow, and D(n) = pacing(n) * GEN.growth^(n-15).
  const k = (Math.exp(logS / count) * grow) / Math.pow(GEN.growth, n - 15);
  const base = Math.round((Math.exp(logBase / count) * pacing(n) * grow) / 10) * 10;
  return { k, base };
}
