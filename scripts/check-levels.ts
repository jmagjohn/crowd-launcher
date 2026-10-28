// Quick campaign sanity check: idle and greedy bots over every campaign level, several seeds each.
// Usage: npx tsx scripts/check-levels.ts [upgradeLevel=0] [weapon=blaster]
import { CAMPAIGN } from '../src/levels/campaign';
import { modsFor, UPGRADES } from '../src/meta/upgrades';
import { AVERAGE, AimBot, IdleBot, SKILLED, type Bot } from '../src/sim/bots';
import { STATE_PLAYING, STATE_WON, World } from '../src/sim/world';

const upg = Number(process.argv[2] ?? 0);
const weapon = process.argv[3] ?? 'blaster';
const mods = modsFor(Object.fromEntries(UPGRADES.map((u) => [u.key, Math.min(u.max, upg)])), weapon);
const SEEDS = [1, 2, 3, 4, 5];

function run(levelIdx: number, bot: Bot, seed: number): { won: boolean; t: number; base: number; breach: boolean } {
  const w = new World(CAMPAIGN[levelIdx], mods, seed);
  while (w.state === STATE_PLAYING) {
    bot.act(w);
    w.step();
  }
  return { won: w.state === STATE_WON, t: w.time, base: w.baseHp / w.baseMaxHp, breach: w.breached };
}

const rows: string[] = [];
rows.push(`upgrades=${upg} weapon=${weapon}`);
rows.push('lvl  name             | idle win  base | average win  time base | skilled win  time base');
for (let i = 0; i < CAMPAIGN.length; i++) {
  const res = (mk: () => Bot) => SEEDS.map((s) => run(i, mk(), s));
  const idle = res(() => new IdleBot());
  const avg = SEEDS.map((s) => run(i, new AimBot({ ...AVERAGE, seed: s * 7 }), s));
  const sk = res(() => new AimBot(SKILLED));
  const wr = (r: ReturnType<typeof run>[]) => `${(r.filter((x) => x.won).length / r.length * 100).toFixed(0).padStart(3)}%`;
  const avgT = (r: ReturnType<typeof run>[]) => (r.reduce((a, x) => a + x.t, 0) / r.length).toFixed(1).padStart(5);
  const avgB = (r: ReturnType<typeof run>[]) => (r.reduce((a, x) => a + x.base, 0) / r.length * 100).toFixed(0).padStart(3) + '%';
  rows.push(
    `${String(i + 1).padStart(3)}  ${CAMPAIGN[i].name.padEnd(16)} | ${wr(idle)}  ${avgB(idle)} |    ${wr(avg)} ${avgT(avg)} ${avgB(avg)} |    ${wr(sk)} ${avgT(sk)} ${avgB(sk)}`,
  );
}
console.log(rows.join('\n'));
