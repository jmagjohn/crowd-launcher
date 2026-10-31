import {
  BASE_Y,
  BREACH_Y,
  DEFAULT_STACK_CAP,
  DRIFT_RANGE,
  DT,
  ENEMY_SPAWN_Y,
  LANE_HALF,
  LATERAL_DAMPING,
  LAUNCH_RESERVE,
  LAUNCH_Y,
  MAX_CLONES_PER_PASS,
  MAX_GROUP_ENTITIES,
  MAX_SHOCKS,
  SHOCK_DMG,
  SHOCK_MAX_R,
  SHOCK_PERIOD,
  SHOCK_SPEED,
  SHOCK_WINDUP,
  TYRANT_SUMMON,
  TICK_HZ,
} from './config';
import {
  EV_BASE_HIT,
  EV_BREACH,
  EV_CHAMPION,
  EV_FIRE,
  EV_GATE_BREAK,
  EV_GATE_FLIP,
  EV_GATE_PASS,
  EV_KILL,
  EV_SHOCK_HIT,
  EV_SHOCK_WINDUP,
  EV_SHOCKWAVE,
  EventBuffer,
} from './events';
import { Gate, OP_ADD, OP_DIV, OP_MUL, OP_SUB, bonusUnits, divSurvivors, tollPaid } from './gates';
import { SpatialGrid } from './grid';
import { NEUTRAL_MODS, type LevelConfig, type PlayerMods } from './levelTypes';
import { UnitPool } from './pool';
import { Rng } from './rng';
import {
  F_BIG,
  F_IGNORES_GATES,
  T_BOSS,
  T_BRUTE,
  T_GRUNT,
  T_SOLDIER,
  T_TYRANT,
  TYPE_BASE_DMG,
  TYPE_DRIFT,
  TYPE_FLAGS,
  TYPE_MAX_HP,
  TYPE_RADIUS,
  TYPE_SPEED,
  TYPE_WEAVE,
} from './unitTypes';
import { WEAPONS } from './weapons';
import { compileWaves, type SpawnEvent } from './waves';

export const STATE_PLAYING = 0;
export const STATE_WON = 1;
export const STATE_LOST = 2;

/** Per-tick input. The caller writes it; the sim reads it at the start of each tick. */
export interface SimInput {
  aimX: number;
  firing: boolean;
  /** Edge-triggered: consumed by the next tick. */
  champion: boolean;
}

export class SimStats {
  fired = 0;
  gateGained = 0;
  gateLost = 0;
  playerLost = 0;
  enemiesKilled = 0;
  baseDamage = 0;
  unitsToBase = 0;
  champions = 0;
  peakArmy = 0;
  /** Logical units that crossed at least one good gate (for loss hints). */
  boosted = 0;
  enemyFolded = 0;
  enemyDropped = 0;
  /** Player units lost to boss shockwaves (subset of playerLost). */
  shockKilled = 0;
  /** Extra units from the volley upgrade (subset of fired). */
  volleyBonus = 0;
}

const DEFAULT_OVERTIME = { delay: 8, interval: 2.5, count: 6, growth: 1.25 };
const MAX_LEVEL_SECONDS = 300;

/** Numeric fields all have initializers (see the note on Gate): undefined-first fields box every double store. */
export class World {
  readonly level: LevelConfig;
  readonly mods: PlayerMods;
  readonly rng: Rng;
  readonly player: UnitPool;
  readonly enemy: UnitPool;
  readonly grid: SpatialGrid;
  readonly gates: Gate[];
  readonly events = new EventBuffer();
  readonly stats = new SimStats();
  readonly input: SimInput = { aimX: 0, firing: false, champion: false };
  readonly schedule: readonly SpawnEvent[];

  readonly fireRate: number = 0;
  /** Dynamic-difficulty factor in effect (<= 1). */
  readonly enemyScale: number = 1;
  readonly shotSize: number = 0;
  readonly chargePerUnit: number = 0;
  readonly championEnabled: boolean = true;
  readonly championHp: number = 0;
  readonly championDmg: number = 0;
  /** Weapon muzzles: unit type, lane-x offsets and initial lateral velocities. */
  readonly shotType: number = 0;
  readonly muzzleX: Float32Array;
  readonly muzzleVx: Float32Array;

  // Boss shockwaves (rendered straight from these arrays).
  readonly shockX = new Float32Array(MAX_SHOCKS);
  readonly shockY = new Float32Array(MAX_SHOCKS);
  readonly shockR = new Float32Array(MAX_SHOCKS);
  readonly shockOn = new Uint8Array(MAX_SHOCKS);

  tick = 0;
  state = STATE_PLAYING;
  baseHp = 0;
  readonly baseMaxHp: number = 0;
  launcherX = 0;
  charge = 0;
  breached = false;
  playerLogical = 0;
  enemyLogical = 0;

  private fireAcc = 0;
  private shotsFired = 0;
  private nextSpawn = 0;
  private readonly overtimeStartTick: number = 0;
  private overtimeNextTick = 0;
  private overtimeCount = 0;
  private readonly overtimeIntervalTicks: number = 0;
  private readonly overtimeGrowth: number = 0;
  private readonly maxTicks = MAX_LEVEL_SECONDS * TICK_HZ;

  constructor(level: LevelConfig, mods: PlayerMods = NEUTRAL_MODS, seed?: number) {
    this.level = level;
    this.mods = mods;
    this.rng = new Rng(seed ?? level.seed ?? 1);
    const cap = level.stackCap ?? DEFAULT_STACK_CAP;
    this.player = new UnitPool(cap);
    this.enemy = new UnitPool(cap);
    this.grid = new SpatialGrid(cap);
    this.gates = level.gates.map((g) => new Gate(g));
    const scale = Math.min(1, mods.enemyScale);
    this.enemyScale = scale;
    this.schedule = compileWaves(level, scale);

    const weapon = WEAPONS[mods.weapon] ?? WEAPONS[0];
    this.fireRate = level.fireRate * mods.fireRateMult * weapon.rateMult;
    this.shotType = weapon.unit;
    this.muzzleX = Float32Array.from(weapon.offsets);
    this.muzzleVx = Float32Array.from(weapon.vx);
    this.shotSize = level.shotSize ?? 1;
    this.chargePerUnit = (level.chargePerShot ?? 1 / 60) * mods.chargeMult;
    this.championEnabled = level.champion !== false;
    this.championHp = Math.round(TYPE_MAX_HP[T_BRUTE] * mods.championMult);
    this.championDmg = TYPE_BASE_DMG[T_BRUTE] * mods.championMult;
    this.baseHp = this.baseMaxHp = Math.max(1, Math.round(level.baseHp * scale));

    const ot = level.overtime ?? DEFAULT_OVERTIME;
    const lastTick = this.schedule.length > 0 ? this.schedule[this.schedule.length - 1].tick : 0;
    this.overtimeStartTick = lastTick + Math.round(ot.delay * TICK_HZ);
    this.overtimeNextTick = this.overtimeStartTick;
    this.overtimeCount = ot.count * scale;
    this.overtimeIntervalTicks = Math.max(1, Math.round(ot.interval * TICK_HZ));
    this.overtimeGrowth = ot.growth;

    if (mods.startArmy > 0) this.spawnStartArmy(mods.startArmy);
  }

  get time(): number {
    return this.tick * DT;
  }

  get overtime(): boolean {
    return this.tick >= this.overtimeStartTick;
  }

  step(): void {
    if (this.state !== STATE_PLAYING) return;
    const P = this.player;
    const E = this.enemy;
    P.snapshotPrev();
    E.snapshotPrev();

    // Input. Aim is absolute: the launcher sits wherever the finger is.
    const input = this.input;
    this.launcherX = clamp(input.aimX, -LANE_HALF + 0.4, LANE_HALF - 0.4);
    // Accumulate in shots*ticks so integer fire rates are exact (summing rate/60 in floats drops shots).
    if (input.firing) {
      this.fireAcc += this.fireRate;
      while (this.fireAcc >= TICK_HZ) {
        this.fireAcc -= TICK_HZ;
        this.launch();
      }
    } else if (this.fireAcc > TICK_HZ - 1e-6) {
      this.fireAcc = TICK_HZ - 1e-6;
    }
    if (input.champion) {
      input.champion = false;
      if (this.charge >= 1 && this.championEnabled) this.launchChampion();
    }

    const gates = this.gates;
    for (let g = 0; g < gates.length; g++) gates[g].update(this.tick);

    this.spawnWaves();
    this.movePlayers();
    this.moveEnemies();
    this.updateShocks();
    this.resolveContacts();

    P.compact();
    E.compact();
    this.playerLogical = P.logicalCount();
    this.enemyLogical = E.logicalCount();
    if (this.playerLogical > this.stats.peakArmy) this.stats.peakArmy = this.playerLogical;

    this.tick++;
    if (this.baseHp <= 0) {
      this.baseHp = 0;
      this.state = STATE_WON;
    } else if ((this.breached || this.tick >= this.maxTicks) && !this.level.sandbox) {
      this.state = STATE_LOST;
    }
  }

  // ---- spawning ----

  /** One trigger pull: one shot per weapon muzzle. */
  private launch(): void {
    const P = this.player;
    const rng = this.rng;
    const pct = this.mods.shotBonusPct;
    const type = this.shotType;
    const mx = this.muzzleX;
    const mvx = this.muzzleVx;
    for (let m = 0; m < mx.length; m++) {
      // Volley upgrade: exact integer extras, floor(shots * pct / 100) over the level.
      let size = this.shotSize;
      if (pct > 0) {
        const extra = Math.floor(((this.shotsFired + 1) * pct) / 100) - Math.floor((this.shotsFired * pct) / 100);
        size += extra;
        this.stats.volleyBonus += extra;
      }
      this.shotsFired++;
      // Jitter from 16-bit integers: launch runs once per tick and may stay in V8's mid tier, where a double
      // returned from rng.range() gets boxed. bits16() always returns a small integer.
      let x = this.launcherX + mx[m] + (rng.bits16() - 32768) * (0.12 / 32768);
      if (x < -LANE_HALF + 0.3) x = -LANE_HALF + 0.3;
      else if (x > LANE_HALF - 0.3) x = LANE_HALF - 0.3;
      const y = LAUNCH_Y + rng.bits16() * (0.2 / 65536);
      const vx = mvx[m] + (rng.bits16() - 32768) * (0.25 / 32768);
      const seed = rng.bits16();
      let idx = P.alloc(type, seed);
      if (idx >= 0) {
        P.x[idx] = P.px[idx] = x;
        P.y[idx] = P.py[idx] = y;
        P.vx[idx] = vx;
        P.hp[idx] = P.maxHp[idx] = TYPE_MAX_HP[type];
        P.count[idx] = size;
      } else {
        // Pool full (only possible if the launcher reserve is exhausted): fold into a recent shot near the launcher.
        for (let i = P.n - 1; i >= 0 && i >= P.n - 64; i--) {
          if (P.type[i] === type && P.y[i] < 4 && P.count[i] > 0) {
            P.count[i] += size;
            idx = i;
            break;
          }
        }
        if (idx < 0) continue;
      }
      this.stats.fired += size;
      if (this.championEnabled) this.charge = Math.min(1, this.charge + size * this.chargePerUnit);
    }
    const ev = this.events;
    const s = ev.claim(EV_FIRE);
    ev.x[s] = this.launcherX;
    ev.y[s] = LAUNCH_Y;
    ev.a[s] = type;
    ev.b[s] = mx.length;
  }

  private launchChampion(): void {
    const P = this.player;
    const idx = P.spawn(T_BRUTE, this.launcherX, LAUNCH_Y + 0.4, 1, this.championHp, 0, this.rng.bits16());
    if (idx < 0) return;
    this.charge = 0;
    this.stats.champions++;
    this.events.push(EV_CHAMPION, this.launcherX, LAUNCH_Y, 0, 0);
  }

  private spawnStartArmy(total: number): void {
    const P = this.player;
    const rng = this.rng;
    const k = Math.min(total, 60, P.cap - LAUNCH_RESERVE);
    const base = Math.floor(total / k);
    let rem = total - base * k;
    for (let j = 0; j < k; j++) {
      const c = base + (rem > 0 ? 1 : 0);
      if (rem > 0) rem--;
      P.spawn(T_SOLDIER, rng.range(-2.5, 2.5), 1 + rng.range(0, 3), c, 1, 0, rng.bits16());
    }
  }

  private spawnWaves(): void {
    const sched = this.schedule;
    while (this.nextSpawn < sched.length && sched[this.nextSpawn].tick <= this.tick) {
      const ev = sched[this.nextSpawn++];
      this.spawnGroup(ev.type, ev.count, ev.x, ev.spread, ev.hp);
    }
    if (this.nextSpawn >= sched.length && this.tick >= this.overtimeNextTick) {
      const c = Math.round(this.overtimeCount);
      this.spawnGroup(T_GRUNT, c, this.rng.range(-3, 3), 6, 1);
      this.overtimeCount *= this.overtimeGrowth;
      this.overtimeNextTick += this.overtimeIntervalTicks;
    }
  }

  /** Spawns `count` logical enemies as up to MAX_GROUP_ENTITIES stacks in a formation emerging from the base. */
  spawnGroup(type: number, count: number, x: number, spread: number, hp: number, y = ENEMY_SPAWN_Y): void {
    if (count <= 0) return;
    const E = this.enemy;
    const rng = this.rng;
    const free = E.cap - E.n;
    const big = (TYPE_FLAGS[type] & F_BIG) !== 0;
    const k = Math.min(count, big ? count : MAX_GROUP_ENTITIES, free);
    if (k <= 0) {
      for (let i = E.n - 1; i >= 0; i--) {
        if (E.type[i] === type && E.count[i] > 0) {
          E.count[i] += count;
          this.stats.enemyFolded += count;
          return;
        }
      }
      this.stats.enemyDropped += count;
      return;
    }
    const r = TYPE_RADIUS[type];
    const spacing = r * 2.3;
    const perRow = Math.max(1, Math.floor(Math.max(spread, spacing) / spacing));
    const base = Math.floor(count / k);
    let rem = count - base * k;
    for (let j = 0; j < k; j++) {
      const c = base + (rem > 0 ? 1 : 0);
      if (rem > 0) rem--;
      const row = Math.floor(j / perRow);
      const col = j - row * perRow;
      const rowN = Math.min(perRow, k - row * perRow);
      const ex = x + (col - (rowN - 1) / 2) * spacing + rng.range(-0.08, 0.08);
      const ey = y + row * spacing + rng.range(-0.08, 0.08);
      const e = E.alloc(type, rng.bits16());
      E.x[e] = E.px[e] = clamp(ex, -LANE_HALF + r, LANE_HALF - r);
      E.y[e] = E.py[e] = ey;
      E.vx[e] = 0;
      E.hp[e] = E.maxHp[e] = hp;
      E.count[e] = c;
    }
  }

  // ---- movement & gates ----

  private movePlayers(): void {
    const P = this.player;
    const gates = this.gates;
    const ng = gates.length;
    // Clones spawned this tick start moving next tick.
    const n0 = P.n;
    for (let i = 0; i < n0; i++) {
      if (P.count[i] <= 0) continue;
      const t = P.type[i];
      const r = TYPE_RADIUS[t];
      const y0 = P.y[i];
      const y = y0 + TYPE_SPEED[t] * DT;
      const vx = P.vx[i];
      const x = clamp(P.x[i] + vx * DT, -LANE_HALF + r, LANE_HALF - r);
      P.vx[i] = vx * LATERAL_DAMPING;
      P.x[i] = x;
      P.y[i] = y;

      if ((TYPE_FLAGS[t] & F_IGNORES_GATES) === 0) {
        for (let g = 0; g < ng; g++) {
          const gate = gates[g];
          if (!gate.active || y0 >= gate.y || y < gate.y) continue;
          const dx = x - gate.x;
          if (dx > gate.halfW || dx < -gate.halfW) continue;
          this.applyGate(gate, g, i);
          if (P.count[i] <= 0) break;
        }
      }

      if (P.count[i] > 0 && y >= BASE_Y - r * 0.5) {
        const dmg = P.count[i] * (t === T_BRUTE ? this.championDmg : TYPE_BASE_DMG[t]) * this.mods.baseDamageMult;
        this.baseHp -= dmg;
        this.stats.baseDamage += dmg;
        this.stats.unitsToBase += P.count[i];
        const ev = this.events;
        const s = ev.claim(EV_BASE_HIT);
        ev.x[s] = x;
        ev.y[s] = BASE_Y;
        ev.a[s] = dmg;
        ev.b[s] = t;
        P.kill(i);
      }
    }
  }

  private applyGate(gate: Gate, gi: number, i: number): void {
    const P = this.player;
    const c = P.count[i];
    const pct = this.mods.gateBonusPct;
    let delta = 0;
    switch (gate.op) {
      case OP_MUL: {
        const gained = c * gate.value - c;
        const bonus = pct > 0 ? bonusUnits(gate.bonusCredited, gained, pct) : 0;
        gate.bonusCredited += gained;
        delta = gained + bonus;
        P.count[i] = c + delta;
        this.distribute(i, gate);
        this.stats.gateGained += delta;
        this.stats.boosted += c;
        break;
      }
      case OP_ADD: {
        if (this.tick < gate.readyTick) return;
        gate.readyTick = this.tick + gate.rechargeTicks;
        const gained = gate.value;
        const bonus = pct > 0 ? bonusUnits(gate.bonusCredited, gained, pct) : 0;
        gate.bonusCredited += gained;
        delta = gained + bonus;
        P.count[i] = c + delta;
        this.distribute(i, gate);
        this.stats.gateGained += delta;
        this.stats.boosted += c;
        break;
      }
      case OP_SUB: {
        const pay = tollPaid(c, gate.toll);
        gate.toll -= pay;
        P.count[i] = c - pay;
        delta = -pay;
        this.stats.gateLost += pay;
        if (gate.toll <= 0 && gate.regenPerTick <= 0) {
          gate.active = false;
          this.events.push(EV_GATE_BREAK, gate.x, gate.y, gi, 0);
        }
        break;
      }
      case OP_DIV: {
        const s = divSurvivors(gate.crossed, c, gate.value);
        P.count[i] = s;
        delta = s - c;
        this.stats.gateLost += c - s;
        break;
      }
    }
    const wasFlipped = gate.flipped;
    const wasActive = gate.active;
    gate.afterCrossing(c, this.tick);
    const ev = this.events;
    const s = ev.claim(EV_GATE_PASS);
    ev.x[s] = P.x[i];
    ev.y[s] = gate.y;
    ev.a[s] = gi;
    ev.b[s] = delta;
    if (gate.flipped && !wasFlipped) this.events.push(EV_GATE_FLIP, gate.x, gate.y, gi, 0);
    if (wasActive && !gate.active) this.events.push(EV_GATE_BREAK, gate.x, gate.y, gi, 0);
  }

  /**
   * Spreads entity i's count across itself plus up to MAX_CLONES_PER_PASS clones placed just past the gate. Exact.
   * The total travels in count[i] rather than as an argument: a double passed to a call V8 does not inline is boxed.
   */
  private distribute(i: number, gate: Gate): void {
    const P = this.player;
    const total = P.count[i];
    const gateY = gate.y;
    const rng = this.rng;
    const budget = P.cap - LAUNCH_RESERVE - P.n;
    let clones = Math.min(MAX_CLONES_PER_PASS, total - 1);
    if (clones > budget) clones = budget > 0 ? budget : 0;
    const k = clones + 1;
    const base = Math.floor(total / k);
    let rem = total - base * k;
    P.count[i] = base + (rem > 0 ? 1 : 0);
    if (rem > 0) rem--;
    if (clones === 0) return;
    const x = P.x[i];
    const t = P.type[i];
    const mh = P.maxHp[i];
    const r = TYPE_RADIUS[t];
    P.vx[i] += rng.range(-1.5, 1.5);
    for (let j = 0; j < clones; j++) {
      const c = base + (rem > 0 ? 1 : 0);
      if (rem > 0) rem--;
      const cx = clamp(x + rng.range(-0.7, 0.7), -LANE_HALF + r, LANE_HALF - r);
      const cy = gateY + 0.02 + rng.range(0, 0.6);
      const vx = rng.range(-2.5, 2.5);
      const k2 = P.alloc(t, rng.bits16());
      P.x[k2] = P.px[k2] = cx;
      P.y[k2] = P.py[k2] = cy;
      P.vx[k2] = vx;
      P.hp[k2] = P.maxHp[k2] = mh;
      P.count[k2] = c;
    }
  }

  /**
   * Enemies march down the lane. Inside DRIFT_RANGE they steer toward the launcher (they are attacking it), so an
   * unaimed stream still meets the front; swarms weave; bosses stop to wind up shockwaves.
   */
  private moveEnemies(): void {
    const E = this.enemy;
    const lx = this.launcherX;
    const tsec = this.tick * DT;
    for (let i = 0; i < E.n; i++) {
      if (E.count[i] <= 0) continue;
      const t = E.type[i];
      if ((t === T_BOSS || t === T_TYRANT) && this.bossTick(i)) continue;
      const y = E.y[i] - TYPE_SPEED[t] * DT;
      E.y[i] = y;
      let x = E.x[i];
      const weave = TYPE_WEAVE[t];
      if (weave !== 0) x += weave * Math.sin(tsec * 3.1 + E.seed[i] * 0.0001) * DT;
      if (y < DRIFT_RANGE) {
        const step = TYPE_DRIFT[t] * DT;
        const dx = lx - x;
        x += dx > step ? step : dx < -step ? -step : dx;
      }
      const r = TYPE_RADIUS[t];
      E.x[i] = x < -LANE_HALF + r ? -LANE_HALF + r : x > LANE_HALF - r ? LANE_HALF - r : x;
      if (y <= BREACH_Y) {
        this.breached = true;
        const ev = this.events;
        const s = ev.claim(EV_BREACH);
        ev.x[s] = E.x[i];
        ev.y[s] = y;
        ev.a[s] = E.count[i];
        ev.b[s] = 0;
        E.kill(i);
      }
    }
  }

  /** Boss shockwave cycle. Returns true while the boss is planted (winding up), so it does not move this tick. */
  private bossTick(i: number): boolean {
    const E = this.enemy;
    const before = E.aux[i];
    const after = before + DT;
    const windStart = SHOCK_PERIOD - SHOCK_WINDUP;
    if (after >= SHOCK_PERIOD) {
      E.aux[i] = 0;
      this.releaseShock(E.x[i], E.y[i], TYPE_RADIUS[E.type[i]]);
      if (E.type[i] === T_TYRANT) {
        const r = TYPE_RADIUS[T_TYRANT];
        this.spawnGroup(T_GRUNT, Math.max(1, Math.round(TYRANT_SUMMON * this.enemyScale)), E.x[i], r * 2, 1, E.y[i] - r - 0.6);
      }
      return true;
    }
    E.aux[i] = after;
    if (before < windStart && after >= windStart) {
      const ev = this.events;
      const s = ev.claim(EV_SHOCK_WINDUP);
      ev.x[s] = E.x[i];
      ev.y[s] = E.y[i];
      ev.a[s] = 0;
      ev.b[s] = 0;
    }
    return after >= windStart;
  }

  private releaseShock(x: number, y: number, r0: number): void {
    for (let k = 0; k < MAX_SHOCKS; k++) {
      if (this.shockOn[k] !== 0) continue;
      this.shockOn[k] = 1;
      this.shockX[k] = x;
      this.shockY[k] = y;
      this.shockR[k] = r0;
      this.events.push(EV_SHOCKWAVE, x, y, k, 0);
      return;
    }
  }

  /**
   * Expands live shockwaves. A player entity is hit exactly once, on the tick the ring's edge crosses it:
   * (distance - radius) changes sign between its previous and current position. Each logical unit in the stack
   * takes max(SHOCK_DMG, 30% of its max HP), so soldier stacks die and a Brute loses a chunk.
   */
  private updateShocks(): void {
    const P = this.player;
    for (let k = 0; k < MAX_SHOCKS; k++) {
      if (this.shockOn[k] === 0) continue;
      const r0 = this.shockR[k];
      const r1 = r0 + SHOCK_SPEED * DT;
      if (r1 > SHOCK_MAX_R) {
        this.shockOn[k] = 0;
        continue;
      }
      this.shockR[k] = r1;
      const cx = this.shockX[k];
      const cy = this.shockY[k];
      for (let i = 0; i < P.n; i++) {
        const c = P.count[i];
        if (c <= 0) continue;
        const ri = TYPE_RADIUS[P.type[i]];
        const dx = P.x[i] - cx;
        const dy = P.y[i] - cy;
        const reach = r1 + ri;
        if (dx * dx + dy * dy > reach * reach) continue;
        const pdx = P.px[i] - cx;
        const pdy = P.py[i] - cy;
        if (Math.sqrt(pdx * pdx + pdy * pdy) - ri <= r0) continue;
        const mh = P.maxHp[i];
        const per = SHOCK_DMG > mh * 0.3 ? SHOCK_DMG : Math.ceil(mh * 0.3);
        P.setTotalHp(i, P.totalHp(i) - per * c);
        const lost = c - P.count[i];
        this.stats.playerLost += lost;
        this.stats.shockKilled += lost;
        if (lost > 0) {
          const ev = this.events;
          const s = ev.claim(EV_SHOCK_HIT);
          ev.x[s] = P.x[i];
          ev.y[s] = P.y[i];
          ev.a[s] = lost;
          ev.b[s] = 0;
        }
      }
    }
  }

  // ---- combat ----

  private resolveContacts(): void {
    const P = this.player;
    const E = this.enemy;
    if (P.n === 0 || E.n === 0) return;
    const grid = this.grid;
    grid.build(E);
    const start = grid.cellStart;
    const items = grid.items;
    const cols = grid.cols;
    const colMax = cols - 1;
    const rowMax = grid.rows - 1;
    const gx0 = grid.x0;
    const gy0 = grid.y0;
    const inv = grid.inv;
    const maxR = grid.maxR;
    const minY = grid.minY;
    const maxY = grid.maxY;
    const big = grid.big;
    const bigN = grid.bigN;
    const ex = E.x;
    const ey = E.y;
    const ec = E.count;
    const et = E.type;

    for (let i = 0; i < P.n; i++) {
      if (P.count[i] <= 0) continue;
      const xi = P.x[i];
      const yi = P.y[i];
      const ri = TYPE_RADIUS[P.type[i]];

      for (let b = 0; b < bigN; b++) {
        const j = big[b];
        if (ec[j] <= 0) continue;
        const dx = ex[j] - xi;
        const dy = ey[j] - yi;
        const rr = ri + TYPE_RADIUS[et[j]];
        if (dx * dx + dy * dy < rr * rr) {
          this.exchange(i, j);
          if (P.count[i] <= 0) break;
        }
      }
      if (P.count[i] <= 0) continue;

      const reach = ri + maxR;
      if (yi + reach < minY || yi - reach > maxY) continue;
      // Cell range, inlined (hot). `| 0` truncates; negatives clamp to 0 so the result matches floor.
      let c0 = ((xi - reach - gx0) * inv) | 0;
      let c1 = ((xi + reach - gx0) * inv) | 0;
      let r0 = ((yi - reach - gy0) * inv) | 0;
      let r1 = ((yi + reach - gy0) * inv) | 0;
      if (c0 < 0) c0 = 0;
      if (r0 < 0) r0 = 0;
      if (c1 > colMax) c1 = colMax;
      if (r1 > rowMax) r1 = rowMax;
      scan: for (let r = r0; r <= r1; r++) {
        const rowBase = r * cols;
        for (let c = c0; c <= c1; c++) {
          const cell = rowBase + c;
          const s = start[cell];
          const e = start[cell + 1];
          for (let k = s; k < e; k++) {
            const j = items[k];
            if (ec[j] <= 0) continue;
            const dx = ex[j] - xi;
            const dy = ey[j] - yi;
            const rr = ri + TYPE_RADIUS[et[j]];
            if (dx * dx + dy * dy < rr * rr) {
              this.exchange(i, j);
              if (P.count[i] <= 0) break scan;
            }
          }
        }
      }
    }
  }

  /** Exact HP exchange: both sides lose min(total HP a, total HP b). */
  private exchange(i: number, j: number): void {
    const P = this.player;
    const E = this.enemy;
    const ha = P.totalHp(i);
    const hb = E.totalHp(j);
    const d = ha < hb ? ha : hb;
    const ca = P.count[i];
    const cb = E.count[j];
    P.setTotalHp(i, ha - d);
    E.setTotalHp(j, hb - d);
    this.stats.playerLost += ca - P.count[i];
    this.stats.enemiesKilled += cb - E.count[j];
    const ev = this.events;
    const s = ev.claim(EV_KILL);
    ev.x[s] = (P.x[i] + E.x[j]) * 0.5;
    ev.y[s] = (P.y[i] + E.y[j]) * 0.5;
    ev.a[s] = d;
    ev.b[s] = E.type[j];
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
