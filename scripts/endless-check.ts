// Plays endless levels with the skilled bot and every upgrade maxed: `npx tsx scripts/endless-check.ts [from] [to]`.
// Endless is extrapolated, not calibrated, so this shows roughly where the wall lands.
import { generateLevel } from '../src/levels/generator';
import { UPGRADES, modsFor, type UpgradeLevels } from '../src/meta/upgrades';
import { AimBot, SKILLED } from '../src/sim/bots';
import { STATE_PLAYING, STATE_WON, World } from '../src/sim/world';

const from = Number(process.argv[2] ?? 101);
const to = Number(process.argv[3] ?? 130);
const maxed = Object.fromEntries(UPGRADES.map((u) => [u.key, u.max])) as UpgradeLevels;
const mods = modsFor(maxed, 'blaster');
for (let n = from; n <= to; n++) {
  const level = generateLevel(n);
  const res = [1, 2, 3].map((seed) => {
    const w = new World(level, mods, seed);
    const bot = new AimBot(SKILLED);
    while (w.state === STATE_PLAYING) {
      bot.act(w);
      w.step();
    }
    return `${w.state === STATE_WON ? 'W' : 'L'}${w.time.toFixed(0)}`;
  });
  console.log(`${n} ${level.name.padEnd(16)} ${res.join(' ')}`);
}
