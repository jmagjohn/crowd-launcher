# Crowd Launcher — technical plan

## Module map

```
src/sim/      pure TS, no DOM or Three.js. Runs in the browser and in Node (tests, bots, balance).
src/render/   Three.js scene, InstancedMesh per unit type, gate panels, camera, asset-swap layer (visuals.ts)
src/input/    pointer + keyboard -> SimInput (one code path for mouse and touch)
src/levels/   level configs (data only), seeded generator 16-50, calibration table
src/meta/     coins, upgrades, save/load (M2)
src/ui/       HTML/CSS overlays: HUD, start/win/lose, shop
src/audio/    procedural WebAudio (M5)
src/debug/    perf overlay, benchmark harness, lil-gui panel (dev only)
scripts/      bench-sim (headless), bench-browser (CDP-throttled Chrome), balance (winnability + calibration)
```

## Data layout

Two `UnitPool`s (player, enemy), structure-of-arrays, preallocated to a fixed capacity at level load:

| field | type | meaning |
|---|---|---|
| `x, y` | Float32Array | sim position (lane space: x across, y from launcher=0 to base) |
| `px, py` | Float32Array | position at the start of the tick, for render interpolation |
| `vx` | Float32Array | lateral drift (decays), used for gate "blossom" spread |
| `count` | Float64Array | logical units in this entity (stack size, integer, exact to 2^53) |
| `hp` | Float32Array | remaining HP of the front unit of the stack (integer valued) |
| `maxHp` | Float32Array | per-unit max HP (per entity so bosses scale per level) |
| `type` | Uint8Array | unit type id |
| `seed` | Uint16Array | visual variation (bob phase) |

Per-type constants (speed, radius, base damage, flags) live in parallel typed arrays indexed by type id.
Removal is mark-then-compact (swap-remove at the end of the tick), so live entities stay dense in `[0, n)`.
Gates are a handful of preallocated objects; events for juice go into a fixed ring buffer.

## Sim loop

- Fixed 60 Hz step, accumulator in the frame loop, max 5 steps per frame (no spiral of death), render with
  `alpha = acc / dt` interpolating `p* -> *`.
- Tick order: snapshot prev positions -> apply input -> fire / champion -> gates (movement, recharge) ->
  wave spawns -> move player units (gate crossing, base hits) -> move enemies (breach) -> build enemy spatial
  hash -> resolve contacts -> compact -> win/lose.
- Determinism: all randomness from one seeded PRNG (mulberry32) owned by the world; inputs are sampled per tick.
  Same seed + same per-tick inputs => bit-identical state (Vitest checks a hash of the pools).
- Zero allocation in `step()`: typed arrays, index loops, no closures, no spreads. Allocation happens only at level load.
  Verified with V8's sampling heap profiler, which also caught engine-level boxing that "no `new`" does not prevent:
  numeric class fields declared without an initializer (start as `undefined`, so every double store allocates),
  uint32/double values returned across calls V8 does not inline (RNG), and doubles passed as arguments to
  non-inlined spawn/event helpers. Hot paths now claim a slot and write typed arrays directly.
- Input latency: the launcher is drawn at the live pointer position in the same frame; the sim reads the aim on
  its next tick (<= 16.7 ms later).

## Contacts (spatial hash)

Enemies are counting-sorted into a uniform grid (1.0 world units per cell, ~14 x 50 cells) every tick: O(n), no
allocation. Each player entity scans the cells within `radius + maxEnemyRadius`. Rare big enemies (Boss) live in a
separate short list checked linearly. Quick reject on the enemy y-range keeps units far from the front nearly free.

Contact is an exact HP exchange: `H = (count-1)*maxHp + hp` for both sides, both lose `min(Ha, Hb)`, then count
and front-HP are recomputed. 1:1 annihilation for 1-HP units falls out of this; a Shield (HP 3) absorbs three
soldiers; a Brute with 40 HP is worth 40 soldiers.

## Logical count vs. visual count

Entities are stacks. The sim caps live entities per side (`stackCap`, default 3000). Below the cap, every logical
unit is its own entity. When a gate multiplies a stack it clones up to `min(N-1, 24, budget)` new entities and
distributes `count*N` across them with integer division plus remainder, so the total is exact. When the budget is
exhausted the extra units fold into existing stacks (stacks render slightly larger: `1 + 0.12*log2(count)`). The HUD
reads the summed `count`, which is always the true number. A x100 gate therefore costs at most 24 new entities per
crossing and never more than the cap.

- `+N`: pulse gate. Adds exactly N units on a crossing, then recharges. Strong at low flow, weak at high flow.
- `-N`: toll gate. Absorbs the first N units that cross it; regenerates slowly. Usually guards something good.
- `xN`: every crossing unit becomes N.
- `/N`: the gate keeps an accumulator so exactly `floor(total/N)` of everything that ever crossed survives,
  independent of how the units were stacked.
- Modifiers: moving (sinusoidal x), one-use (`uses`), flip (after K units, swap to another op/value).
- Champions ignore gates. They are a fixed-value tactical burst, not a multiplier exploit.

**Conflict flagged:** the brief asks for quality scaling that lowers the *visual cap*. If that cap also drove stack
merging, a slow phone would play a different game than a fast desktop or the balance bots. Tradeoff: the sim's
`stackCap` is fixed per level (gameplay, deterministic); the renderer has its own `visualCap` and, when it is lower,
draws every k-th entity scaled up by k^(1/3). Quality scaling only ever touches the render side.

## Win / lose

Win: base HP reaches 0. Lose: any enemy reaches the launcher line. I chose the breach rule over a timer because the
threat is visible and spatial: the player always sees what will kill them and can answer it by aiming, which makes
"push gates vs. defend" a real tradeoff. A timer is invisible pressure that punishes careful play. To guarantee
termination, after the scripted waves end the base enters overtime and spawns an escalating trickle, so a stalled run
still ends in a loss (a timer in disguise, but a visible one).

## Rendering

- One InstancedMesh per unit type (7 draw calls for all units). Models are coloured primitives merged into one indexed
  geometry with vertex colours (`render/visuals.ts`), 64-88 triangles per crowd unit. Lambert materials.
- Blob shadows: a second InstancedMesh per type that shares the unit's `aInst` buffer (no extra CPU writes or
  uploads), drawn as a soft quad on the ground. First thing the quality ladder turns off.
- Units never rotate, so instead of streaming 64-byte matrices each mesh streams a 16-byte `aInst = (x, y, z, scale)`
  attribute and the Lambert shader is patched (`onBeforeCompile`) to apply it; the InstancedMesh's own matrix stays
  identity and is uploaded once. Only the live prefix is uploaded (`updateRanges`). This came out of profiling: the
  matrix writes plus upload were the largest render cost at 4x CPU throttle.
- `frustumCulled = false` on instanced meshes (the base geometry's bounds are meaningless for the batch).
- Asset-swap layer: each unit type maps to a `VisualDef` (geometry factory, colour, scale, y offset). A later glTF
  def only changes `visuals.ts`; the sim knows nothing about meshes.
- DPR capped at 2. Quality ladder (`render/quality.ts`, live since M2): shadows off -> DPR 1.5 -> 1.25 -> 1 ->
  visualCap 2000 -> 1200 -> DPR 0.75. One step after two consecutive bad seconds (average over 1.12x the refresh
  interval, or >10% of frames over 1.5x), refresh snapped to 60/90/120 Hz from the fastest frames, never steps back
  up in a session, every change logged to the perf overlay.
- Gate labels and HUD are HTML overlays positioned by projection (few elements, text rewritten only on change).

## Difficulty math (M3, implemented)

Units of measure: soldier-HP equivalents. Direction (owner feedback after M2): difficulty should climb steeply,
and upgrades are the intended answer to it. Levels 1-15 and the economy stay as they are.

- Levels 16-50 come from `src/levels/generator.ts`, seeded by level number. Enemy strength is
  `D(L) = pacing(L) * 1.075^(L-15)` times a per-level calibration `k(L)` (`src/levels/tuning.ts`).
  `pacing`: within each 10-level block a ramp 0.80 -> 1.10 on levels 2..9, boss levels at 1.30, the level after a
  boss at 0.70.
- Random gate layouts move a level's ceiling by up to 4x, so a formula alone cannot hit a target. Calibration
  (`npm run balance -- --calibrate`), per level:
  1. Expected upgrades `u(L)`: first-clear coins for levels 1..L-1, spent greedily on the cheapest upgrade, Blaster
     only, no replays (a conservative player).
  2. Ceiling: the largest `k` the skilled bot with `u(L)` survives for `levelDuration(L)` (30 s at 16 -> 55 s at
     50, bosses +10 s) on 3 seeds, by binary search.
  3. `k(L) = targetMargin(L) * ceiling`, with the margin rising from ~0.5 (16) to 0.82 (40s), same sawtooth.
  4. Base HP = 90% of the damage that bot deals in `levelDuration(L)`: the threat decides whether you survive, the
     base decides how long you must.
  5. Back off `k` 8% at a time until every seed wins the real level.
- The check (`npm run balance`) fails if any level is not won by the skilled bot with `u(L)` on all seeds.
- Upgrades: cost `c0 * 1.45^k`, linear gain per level. Replays pay 25%, halving per replay down to 5%.
- Dynamic difficulty: unchanged (after 3 losses, -5% per step, max -15%, logged).

## Roadmap (revised after M2 feedback)

Dropped: player-calibrated bot bands, re-tuning levels 1-15, economy rework, mobile pass (all reported fine).

**M3: levels 16-50 and harder late game** (done, see docs/milestones/M3.md)
- Seeded level generator for 16-50 using the budget above: bosses at 20/30/40/50, a breather after each.
- New pressure as levels climb: mixed waves (shields with swarms), several bosses, faster moving and flip gates,
  more toll and divide gates, tighter gate choices.
- Possibly 1-2 new enemy types and a stronger boss variant for 30+, so late levels feel new, not just bigger.
- Only automated check: a fast sanity test that every generated level is winnable with the expected upgrades
  and that a seed always produces the same level. No player-simulation bands.
- Upgrade caps reviewed so 50 stays reachable (max levels may rise if the late curve needs it).

**M4: knights vs orcs art, levels 51-100, endless** (done, see docs/milestones/M4.md)
- New unit models with a shader walk cycle, orc stronghold, B key for the Brute, capped rumble under heavy fire.
- Levels 51-100 from the calibrated generator; endless mode after 100.

**M5: feel**
- Procedural WebAudio (fire, gates, hits, boss stomp, win/lose) with a mute toggle.
- Juice: slow-mo on big moments, win celebration, camera follow, shake tuning.

## Measurement plan

- `npm run bench:sim`: headless sim at stress load, ms per tick with entity counts.
- `?bench=stress` in the browser: warm-up, then 10 s of frame, sim and render times (p50/p95/p99), rendered counts.
- `npm run bench:browser`: drives installed Chrome over CDP with `Emulation.setCPUThrottlingRate(4)` to approximate
  a mid-range phone, and at 1x for desktop numbers. Reports which GL renderer was used, so a software-GL result is
  never mistaken for a real GPU number.
