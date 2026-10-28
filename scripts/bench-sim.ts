// Headless sim benchmark: runs the stress level without rendering and reports ms per tick at the entity counts
// actually reached. Usage: npm run bench:sim [-- ticks]
import { STRESS_LEVEL } from '../src/levels/stress';
import { World } from '../src/sim/world';

const ticks = Number(process.argv[2] ?? 1800);
const warmup = 300;
const w = new World(STRESS_LEVEL);
const times = new Float64Array(ticks);
const entities = new Float64Array(ticks);

for (let t = 0; t < warmup + ticks; t++) {
  // Sweep the aim across the lane like a bot so all gates get traffic.
  w.input.aimX = Math.sin(t * 0.02) * 5;
  w.input.firing = true;
  const t0 = performance.now();
  w.step();
  const dt = performance.now() - t0;
  if (t >= warmup) {
    times[t - warmup] = dt;
    entities[t - warmup] = w.player.n + w.enemy.n;
  }
}

const sorted = Float64Array.from(times).sort();
const pct = (p: number): number => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
let sum = 0;
let ents = 0;
for (let i = 0; i < ticks; i++) {
  sum += times[i];
  ents += entities[i];
}
console.log(`ticks measured: ${ticks} (after ${warmup} warm-up)`);
console.log(`entities on field: avg ${(ents / ticks).toFixed(0)}  final player ${w.player.n} / enemy ${w.enemy.n}`);
console.log(`logical: player ${w.playerLogical.toLocaleString()}  enemy ${w.enemyLogical.toLocaleString()}`);
console.log(
  `ms/tick: mean ${(sum / ticks).toFixed(3)}  p50 ${pct(0.5).toFixed(3)}  p95 ${pct(0.95).toFixed(3)}  p99 ${pct(0.99).toFixed(3)}  max ${sorted[sorted.length - 1].toFixed(3)}`,
);
console.log(`state ${w.state}  fired ${w.stats.fired}  gained ${w.stats.gateGained.toLocaleString()}  killed ${w.stats.enemiesKilled.toLocaleString()}`);
