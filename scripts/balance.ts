// Upgrade-aware winnability check over the whole campaign (docs/PLAN.md, "Difficulty math").
//
// For each level L it builds the upgrade state a player would have after clearing levels 1..L-1 once and spending
// greedily on the cheapest upgrade (Blaster only, no replays: a conservative player). Then:
//   - skilled bot WITH those upgrades must win every seed  (else UNWINNABLE)
//   - skilled bot with NO upgrades should lose from level 30 on (else SOFT: the curve no longer needs upgrades)
//
// With --calibrate it first rewrites src/levels/tuning.ts. For each generated level it binary-searches the largest
// enemy strength the skilled bot (with expected upgrades) survives for levelDuration(L) on every seed, sets the
// level at targetMargin(L) of that, sizes the base to ~90% of the damage the bot deals in that time, and backs off
// until all seeds still win.
//
// Usage: npx tsx scripts/balance.ts [from=1] [to=50] [--calibrate]
import { writeFileSync } from 'node:fs';
import { LEVELS } from '../src/levels';
import { FIRST_GENERATED, generateLevel, levelDuration, targetMargin } from '../src/levels/generator';
import { UPGRADES, modsFor, upgradeCost, type UpgradeLevels } from '../src/meta/upgrades';
import { AimBot, SKILLED } from '../src/sim/bots';
import type { LevelConfig, PlayerMods } from '../src/sim/levelTypes';
import { STATE_PLAYING, STATE_WON, World } from '../src/sim/world';

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const calibrate = process.argv.includes('--calibrate');
const from = Number(args[0] ?? 1);
const to = Number(args[1] ?? LEVELS.length);
const SEEDS = [1, 2, 3];
/** From here, even a perfect-aim player without upgrades should lose (informational). */
const MUST_NEED_UPGRADES_FROM = 30;

/** Upgrade levels after first-clearing levels 1..n-1 and greedily buying the cheapest upgrade each time. */
export function expectedUpgrades(n: number): { upgrades: UpgradeLevels; coins: number; spent: number } {
  const upgrades: UpgradeLevels = {};
  let coins = 0;
  let spent = 0;
  for (let i = 0; i < n - 1; i++) {
    coins += LEVELS[i].reward ?? 30;
    for (;;) {
      let best: { key: (typeof UPGRADES)[number]['key']; cost: number } | null = null;
      for (const u of UPGRADES) {
        const lvl = upgrades[u.key] ?? 0;
        if (lvl >= u.max) continue;
        const c = upgradeCost(u, lvl);
        if (!best || c < best.cost) best = { key: u.key, cost: c };
      }
      if (!best || best.cost > coins) break;
      coins -= best.cost;
      spent += best.cost;
      upgrades[best.key] = (upgrades[best.key] ?? 0) + 1;
    }
  }
  return { upgrades, coins, spent };
}

interface Run {
  won: boolean;
  t: number;
  base: number;
}

function run(level: LevelConfig, mods: PlayerMods, seed: number): Run {
  const w = new World(level, mods, seed);
  const bot = new AimBot(SKILLED);
  while (w.state === STATE_PLAYING) {
    bot.act(w);
    w.step();
  }
  return { won: w.state === STATE_WON, t: w.time, base: w.baseHp / w.baseMaxHp };
}

const pct = (r: Run[]) => `${Math.round((r.filter((x) => x.won).length / r.length) * 100)}%`.padStart(4);
const meanT = (r: Run[]) => (r.reduce((a, x) => a + x.t, 0) / r.length).toFixed(0).padStart(4);
const meanB = (r: Run[]) => `${Math.round((r.reduce((a, x) => a + x.base, 0) / r.length) * 100)}%`.padStart(4);

function winsAll(n: number, k: number, base: number, mods: PlayerMods): boolean {
  const level = generateLevel(n, k, base);
  return SEEDS.every((s) => run(level, mods, s).won);
}

/**
 * Plays levelDuration(n) seconds at enemy strength k against an unbreakable base, on every seed. Returns the least
 * base damage dealt, or -1 if any seed was breached (or timed out) first.
 */
function survive(n: number, k: number, mods: PlayerMods): number {
  const level = generateLevel(n, k, 1e12);
  const T = levelDuration(n);
  let least = Infinity;
  for (const s of SEEDS) {
    const w = new World(level, mods, s);
    const bot = new AimBot(SKILLED);
    while (w.state === STATE_PLAYING && w.time < T) {
      bot.act(w);
      w.step();
    }
    if (w.state !== STATE_PLAYING) return -1;
    least = Math.min(least, w.stats.baseDamage);
  }
  return least;
}

/** Largest k (to ~5%) the skilled bot survives for the whole level duration on every seed. */
function ceiling(n: number, mods: PlayerMods): number {
  let lo = 0.05;
  let hi = 0.5;
  while (survive(n, hi, mods) >= 0 && hi < 200) {
    lo = hi;
    hi *= 2;
  }
  if (survive(n, lo, mods) < 0) return lo;
  while (hi / lo > 1.05) {
    const m = Math.sqrt(lo * hi);
    if (survive(n, m, mods) >= 0) lo = m;
    else hi = m;
  }
  return lo;
}

/** Base set so the skilled bot needs ~90% of the level duration to break it. */
const BASE_SHARE = 0.9;

const levels: LevelConfig[] = [...LEVELS];
if (calibrate) {
  const table: Record<number, { k: number; base: number }> = {};
  for (let n = Math.max(from, FIRST_GENERATED); n <= to; n++) {
    const mods = modsFor(expectedUpgrades(n).upgrades, 'blaster');
    const max = ceiling(n, mods);
    let k = max * targetMargin(n);
    let base = 0;
    // The ceiling is not perfectly monotonic (snowballs); back off until every seed survives and wins.
    for (;;) {
      const dmg = survive(n, k, mods);
      base = Math.max(100, Math.round((dmg * BASE_SHARE) / 10) * 10);
      if ((dmg >= 0 && winsAll(n, k, base, mods)) || k < 0.05) break;
      k *= 0.92;
    }
    table[n] = { k: Math.round(k * 1000) / 1000, base };
    levels[n - 1] = generateLevel(n, table[n].k, base);
    console.log(`calibrate ${n}: ceiling ${max.toFixed(2)}, margin ${targetMargin(n).toFixed(2)}, k ${table[n].k}, base ${base}`);
  }
  const body = Object.entries(table)
    .map(([n, t]) => `  ${n}: { k: ${t.k}, base: ${t.base} },`)
    .join('\n');
  const header = '// Generated by `npm run balance -- --calibrate`. Do not edit by hand.\n' +
    '// Per generated level: k = enemy strength multiplier, base = base HP (see generator.ts).\n';
  writeFileSync('src/levels/tuning.ts', `${header}export const TUNE: Readonly<Record<number, { k: number; base: number }>> = {\n${body}\n};\n`);
  console.log('wrote src/levels/tuning.ts\n');
}

console.log('lvl  name               | upgrades (rate/vol/gate/res/chg/brute/siege) | with upg: win  time base | none: win base | flag');
let unwinnable = 0;
let soft = 0;
const t0 = Date.now();
for (let i = from - 1; i < to; i++) {
  const n = i + 1;
  const { upgrades } = expectedUpgrades(n);
  const withUpg = SEEDS.map((s) => run(levels[i], modsFor(upgrades, 'blaster'), s));
  const none = [run(levels[i], modsFor({}, 'blaster'), 1)];
  const flags: string[] = [];
  if (withUpg.some((r) => !r.won)) {
    flags.push('UNWINNABLE');
    unwinnable++;
  }
  if (n >= MUST_NEED_UPGRADES_FROM && none[0].won) {
    flags.push('SOFT');
    soft++;
  }
  const u = UPGRADES.map((d) => String(upgrades[d.key] ?? 0).padStart(2)).join(' ');
  console.log(
    `${String(n).padStart(3)}  ${LEVELS[i].name.padEnd(18)} | ${u.padEnd(44)} | ${pct(withUpg)} ${meanT(withUpg)} ${meanB(withUpg)} | ${pct(none)} ${meanB(none)} | ${flags.join(' ')}`,
  );
}
console.log(`\n${unwinnable} unwinnable, ${soft} soft, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
process.exitCode = unwinnable > 0 ? 1 : 0;
