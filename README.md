# Crowd Launcher

Browser prototype of a crowd-runner / mob-launcher: aim a launcher, fire a stream of units through gates that
multiply them, and break the enemy base before anything reaches your line. Vite + TypeScript (strict) + Three.js,
no engine. Design and data layout: [docs/PLAN.md](docs/PLAN.md).

## Run

```bash
npm install
npm run dev          # http://localhost:5199
```

Controls: hold to fire, drag (or move the mouse) to aim. Keyboard: A/D or arrows aim, Space fires, E launches the
Brute when charged, Esc pauses, ` or P toggles the perf overlay.

Game: a 15-level campaign (one new mechanic per level, boss at 10), coins from every run, and a shop with four
launcher weapons (Blaster, Twin Cannon, Scatter Gun, Runner Gun) and seven upgrade tracks. Progress is saved in
localStorage (versioned schema, `src/meta/save.ts`).

URL flags: `?level=2`, `?level=stress`, `?perf`, `?debug` (lil-gui panel: coins, unlock all, sim speed, visual cap),
`?seed=123`, `?dpr=1`, `?shadows=0`, `?autoq=0` (disable automatic quality scaling), `?hide=props,gate` (GPU A/B by
object name), `?bench` (stress benchmark; add `&warm=3&secs=10`, `&autoq`).

## Scripts

| script | what it does |
|---|---|
| `npm test` | Vitest: gate math (exact over any stacking), per-tick unit conservation, determinism |
| `npm run bench:sim` | headless sim at stress load, ms per tick |
| `npm run build && npm run bench:browser` | production build in Chrome over CDP: desktop 1x and phone 4x CPU throttle, with GPU timer queries. `BENCH_PROFILES=phone-4x-vsync BENCH_RUNS=3` to filter/repeat |
| `node scripts/profile-browser.mjs` | sampling CPU profile + Chrome per-category metrics at 4x throttle |
| `npm run balance [-- from to]` | upgrade-aware winnability check over all 50 levels; `-- --calibrate` re-tunes levels 16-50 |
| `npm run shots -- <url> <dir> 1,10 5,12` | bot-driven gameplay screenshots in headless Chrome (dev server must be running) |
| `npx tsx scripts/tris.ts` | triangles / vertices per unit model |

## Layout

```
src/sim       pure simulation (no DOM / Three.js): pools, grid, gates, waves, world
src/render    Three.js scene, instanced units, gates, asset-swap visuals
src/input     pointer + keyboard
src/levels    handcrafted 1-15, seeded generator 16-50 + calibration table, stress scene
src/meta      save schema, coins, upgrades, weapons, dynamic difficulty
src/ui        HTML HUD and screens
src/debug     perf overlay, GPU timer, benchmark recorder
scripts       benchmarks and profiling
tests         Vitest
```
