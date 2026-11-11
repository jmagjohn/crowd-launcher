import { BenchRecorder, type BenchResult } from './debug/bench';
import { PerfOverlay, type PerfSource } from './debug/perfOverlay';
import { InputController } from './input/input';
import { Progress } from './meta/progress';
import { loadSave, writeSave } from './meta/save';
import { GameRenderer } from './render/gameRenderer';
import { QualityController } from './render/quality';
import { DT, MAX_STEPS_PER_FRAME } from './sim/config';
import { NEUTRAL_MODS, type LevelConfig } from './sim/levelTypes';
import { WEAPONS } from './sim/weapons';
import { STATE_PLAYING, STATE_WON, World } from './sim/world';
import { Hud } from './ui/hud';
import { Screens, type EndSummary } from './ui/screens';

type Mode = 'menu' | 'play' | 'paused' | 'ended';

/** `startLevel` value that opens the stress / benchmark scene. */
export const STRESS_INDEX = -2;

export interface GameOptions {
  /** The calibrated campaign; indices past it are endless levels from `levelAt`. */
  levels: readonly LevelConfig[];
  levelAt: (i: number) => LevelConfig;
  /** Benchmark / sandbox level, reachable with ?level=stress or ?bench. */
  stress: LevelConfig;
  /** -1 = continue from the save; STRESS_INDEX = the stress level; otherwise a level index. */
  startLevel: number;
  seed?: number;
  perf: boolean;
  debug: boolean;
  maxDpr?: number;
  /** Blob shadows (default on). */
  shadows?: boolean;
  /** Debug: object-name prefixes to hide (GPU A/B). */
  hide?: string[];
  /** Automatic quality scaling (default on, off in benchmarks unless asked for). */
  autoQuality: boolean;
  bench: { warm: number; secs: number } | null;
}

declare global {
  interface Window {
    __bench?: BenchResult;
    __game?: Game;
  }
}

/** Seconds the end screen waits after the result, so the base collapse / breach plays out. */
const END_DELAY = 1.1;

/** Wires sim, renderer, input, meta-progression and UI together and owns the frame loop. */
export class Game implements PerfSource {
  readonly renderer: GameRenderer;
  private readonly input: InputController;
  private readonly hud: Hud;
  private readonly screens: Screens;
  readonly perf: PerfOverlay;
  readonly progress: Progress;
  private world!: World;
  private level!: LevelConfig;
  private levelIndex = 0;
  private mode: Mode = 'menu';
  private acc = 0;
  private last = 0;
  private clock = 0;
  /** Presentation clock: always runs except while paused. */
  private animTime = 0;
  private endTimer = 0;
  private bench: BenchRecorder | null = null;
  stepsLastFrame = 0;
  readonly quality: QualityController;
  private gpuSamplesSeen = 0;
  /** Frames rendered since load (profiling scripts read it). */
  perfFrames = 0;
  /** Debug: sim speed multiplier. */
  timeScale = 1;

  constructor(
    stage: HTMLElement,
    private readonly opts: GameOptions,
  ) {
    this.progress = new Progress(loadSave());
    this.renderer = new GameRenderer(stage);
    if (opts.maxDpr) this.renderer.setMaxDpr(opts.maxDpr);
    if (opts.shadows === false) this.renderer.shadowsOn = false;
    if (opts.hide) this.renderer.hide = opts.hide;
    this.renderer.shakeOn = this.progress.save.settings.shake;
    this.input = new InputController(this.renderer.canvas, (cx) => this.renderer.laneXFromClient(cx));
    this.input.onKey = (code) => {
      if (code === 'Backquote' || code === 'KeyP') this.perf.toggle();
      else if (code === 'Escape' && this.mode === 'play') this.pause();
    };
    this.hud = new Hud(stage, () => this.input.requestChampion(), () => this.mode === 'play' && this.pause());
    this.screens = new Screens(stage);
    this.perf = new PerfOverlay(stage);
    if (opts.perf) this.perf.toggle(true);
    this.quality = new QualityController(this.renderer, (line) => this.perf.note(line));
    this.quality.enabled = opts.autoQuality;

    new ResizeObserver(() => this.renderer.resize()).observe(stage);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.mode === 'play' && !this.bench) this.pause();
      this.last = 0;
    });

    this.loadLevel(opts.startLevel === -1 ? this.progress.save.unlocked : opts.startLevel);
    if (opts.bench) {
      this.bench = new BenchRecorder(opts.bench.warm, opts.bench.secs);
      this.play();
    } else if (opts.startLevel !== -1) {
      this.showStart();
    } else {
      this.showMenu();
    }
    if (opts.debug) void import('./debug/debugPanel').then((m) => m.createDebugPanel(this));
    window.__game = this;
  }

  start(): void {
    requestAnimationFrame(this.frame);
  }

  // ---- PerfSource ----
  get drawCalls(): number { return this.renderer.drawCalls; }
  get triangles(): number { return this.renderer.triangles; }
  get playerLogical(): number { return this.world.playerLogical; }
  get enemyLogical(): number { return this.world.enemyLogical; }
  get playerEntities(): number { return this.world.player.n; }
  get enemyEntities(): number { return this.world.enemy.n; }
  get renderedPlayer(): number { return this.renderer.units?.renderedPlayer ?? 0; }
  get renderedEnemy(): number { return this.renderer.units?.renderedEnemy ?? 0; }
  get dpr(): number { return this.renderer.dpr; }
  get visualCap(): number { return this.renderer.units?.visualCap ?? 0; }
  get glRenderer(): string { return this.renderer.glRenderer; }
  get qualityLevel(): number { return this.quality.level; }
  get gpuMs(): number { return this.renderer.gpuTimer.available ? this.renderer.gpuTimer.lastMs : -1; }
  get currentWorld(): World { return this.world; }

  // ---- flow ----

  private isStress(i: number): boolean {
    return i === STRESS_INDEX;
  }

  private labelFor(i: number): string {
    if (this.isStress(i)) return 'Debug';
    return i >= this.opts.levels.length ? `Endless ${i + 1}` : `Level ${i + 1}`;
  }

  loadLevel(i: number): void {
    this.levelIndex = i;
    this.level = this.isStress(i) ? this.opts.stress : this.opts.levelAt(i);
    const mods = this.isStress(i) ? NEUTRAL_MODS : this.progress.modsFor(this.level);
    this.world = new World(this.level, mods, this.opts.seed);
    this.renderer.setWorld(this.world);
    this.hud.setLevel(`${this.labelFor(i)} · ${this.level.name}`, this.world.championEnabled, WEAPONS[mods.weapon].name);
    this.acc = 0;
    this.endTimer = 0;
  }

  private play(): void {
    this.screens.hide();
    this.hud.setVisible(true);
    this.mode = 'play';
    this.input.enabled = true;
    this.input.releaseAll();
    this.last = 0;
    this.quality.reset();
    if (this.level.intro && !this.progress.save.seen.includes(this.level.id)) {
      this.progress.save.seen.push(this.level.id);
      this.persist();
    }
  }

  private restart(): void {
    this.loadLevel(this.levelIndex);
    this.play();
  }

  private pause(): void {
    this.mode = 'paused';
    this.input.enabled = false;
    this.screens.showPause(() => this.play(), () => this.restart(), () => this.showMenu());
  }

  private showMenu(): void {
    this.mode = 'menu';
    this.input.enabled = false;
    this.hud.setVisible(false);
    const next = this.progress.save.unlocked;
    if (next !== this.levelIndex) this.loadLevel(next);
    this.screens.showMenu(
      this.progress.coins,
      this.labelFor(next),
      () => this.showStart(),
      () => this.showLevels(),
      () => this.showShop(() => this.showMenu()),
    );
  }

  private showStart(): void {
    this.mode = 'menu';
    this.input.enabled = false;
    this.hud.setVisible(false);
    const l = this.level;
    const intro = l.intro && !this.progress.save.seen.includes(l.id) ? l.intro : null;
    const assist = this.isStress(this.levelIndex) ? 0 : Math.round((1 - this.progress.enemyScale(l.id)) * 100);
    this.screens.showStart(l.name, this.labelFor(this.levelIndex), intro, !!l.boss, assist, () => this.play(), () => this.showMenu());
  }

  private showLevels(): void {
    this.mode = 'menu';
    this.input.enabled = false;
    this.hud.setVisible(false);
    const save = this.progress.save;
    const n = this.opts.levels.length;
    const tiles = this.opts.levels.map((l, i) => ({
      label: String(i + 1),
      name: l.name,
      locked: i > save.unlocked && !this.opts.debug,
      cleared: (save.levels[l.id]?.wins ?? 0) > 0,
      boss: !!l.boss,
      current: i === save.unlocked,
    }));
    // Endless: one tile that resumes at the furthest endless level reached.
    const endlessAt = Math.max(n, save.unlocked);
    tiles.push({
      label: '∞',
      name: save.unlocked > n ? `Endless (best: level ${save.unlocked})` : 'Endless mode',
      locked: save.unlocked < n && !this.opts.debug,
      cleared: false,
      boss: false,
      current: save.unlocked >= n,
    });
    if (this.opts.debug) tiles.push({ label: 'S', name: 'Stress test', locked: false, cleared: false, boss: false, current: false });
    this.screens.showLevels(tiles, (i) => {
      this.loadLevel(i < n ? i : i === n ? endlessAt : STRESS_INDEX);
      this.showStart();
    }, () => this.showMenu());
  }

  private showShop(back: () => void): void {
    this.mode = 'menu';
    this.input.enabled = false;
    this.hud.setVisible(false);
    this.screens.showShop(this.progress, this.level.fireRate, () => this.persist(), () => {
      // Upgrades and weapons apply from the next load.
      this.loadLevel(this.levelIndex);
      back();
    });
  }

  private persist(): void {
    writeSave(this.progress.save);
  }

  private onEnd(): void {
    const w = this.world;
    this.mode = 'ended';
    this.input.enabled = false;
    const won = w.state === STATE_WON;
    const stress = this.isStress(this.levelIndex);
    const reward = stress
      ? { coins: 0, firstClear: false, assistNote: null }
      : this.progress.finishRun(this.level, this.levelIndex, { won, progress: 1 - w.baseHp / w.baseMaxHp, seconds: w.time });
    if (reward.assistNote) this.perf.note(`assist: ${reward.assistNote}`);
    this.persist();
    const summary: EndSummary = {
      won,
      levelName: this.level.name,
      levelLabel: `${this.labelFor(this.levelIndex)} · ${this.level.name}`,
      basePctLeft: w.baseHp / w.baseMaxHp,
      seconds: w.time,
      peakArmy: w.stats.peakArmy,
      fired: w.stats.fired,
      coins: reward.coins,
      firstClear: reward.firstClear,
      hint: won ? null : lossHint(w),
      shopHint: won ? null : this.progress.affordableSuggestion(),
    };
    const hasNext = !stress;
    const next = won && hasNext ? () => { this.loadLevel(this.levelIndex + 1); this.showStart(); } : null;
    this.hud.setVisible(false);
    this.screens.showEnd(summary, () => this.restart(), next, () => this.showShop(() => this.showStart()), () => this.showMenu());
  }

  // ---- frame loop ----

  private readonly frame = (now: number): void => {
    requestAnimationFrame(this.frame);
    this.perfFrames++;
    const frameMs = this.last === 0 ? 1000 / 60 : now - this.last;
    this.last = now;
    const dt = Math.min(frameMs / 1000, 0.25);
    const w = this.world;
    this.input.update(dt);

    const t0 = performance.now();
    let steps = 0;
    let aim = this.input.aimX;
    // The sim keeps running for a moment after the result so the ending plays out, with input released.
    const live = this.mode === 'play' || (this.mode === 'ended' && this.endTimer > 0);
    if (live) {
      if (this.bench) {
        // Bench bot: sweep the aim so every gate sees traffic, fire continuously.
        aim = Math.sin(this.clock * 1.2) * 5;
        w.input.firing = true;
      } else {
        w.input.firing = this.mode === 'play' && this.input.firing;
        if (this.input.consumeChampion()) w.input.champion = true;
      }
      w.input.aimX = aim;
      this.clock += dt;
      this.acc += dt * this.timeScale;
      while (this.acc >= DT && steps < MAX_STEPS_PER_FRAME * this.timeScale) {
        w.step();
        this.acc -= DT;
        steps++;
      }
      // Too far behind (tab stall, debugger): drop the backlog instead of spiralling.
      if (this.acc >= DT) this.acc = 0;
    }
    this.stepsLastFrame = steps;
    const t1 = performance.now();
    const alpha = live && w.state === STATE_PLAYING ? this.acc / DT : 1;
    const animDt = this.mode === 'paused' ? 0 : dt;
    this.animTime += animDt;
    this.renderer.render(w, alpha, aim, this.animTime, animDt);
    const t2 = performance.now();
    this.hud.update(w, dt);
    this.perf.record(now, frameMs, t1 - t0, t2 - t1);
    if (this.mode === 'play') this.quality.sample(now, frameMs);
    this.perf.refresh(now, this);

    if (this.mode === 'play' && w.state !== STATE_PLAYING) {
      this.mode = 'ended';
      this.endTimer = END_DELAY;
    } else if (this.mode === 'ended' && this.endTimer > 0) {
      this.endTimer -= dt;
      if (this.endTimer <= 0) this.onEnd();
    }
    const gpu = this.renderer.gpuTimer;
    gpu.enabled = this.perf.visible || this.bench !== null;
    if (gpu.samples !== this.gpuSamplesSeen) {
      this.gpuSamplesSeen = gpu.samples;
      this.bench?.recordGpu(gpu.lastMs);
    }
    if (this.bench && !this.bench.done) {
      this.bench.record(now, frameMs, t1 - t0, t2 - t1, this.renderedPlayer + this.renderedEnemy, w.player.n + w.enemy.n);
      if (this.bench.done) this.finishBench();
    }
  };

  private finishBench(): void {
    const r = this.bench!.summary({
      drawCalls: this.drawCalls,
      logicalPlayer: this.world.playerLogical,
      logicalEnemy: this.world.enemyLogical,
      dpr: this.renderer.dpr,
      canvas: `${this.renderer.width}x${this.renderer.height}`,
      glRenderer: this.renderer.glRenderer,
    });
    window.__bench = r;
    console.log('BENCH ' + JSON.stringify(r));
    this.perf.toggle(true);
    this.perf.note(
      `bench: ${r.fps.toFixed(0)} fps, p95 ${r.frameMs.p95.toFixed(1)} ms, cpu ${r.cpuMs.mean.toFixed(2)} ms, ${r.rendered.mean.toFixed(0)} drawn`,
    );
  }
}

/** One concrete, data-driven hint for the loss screen: the most likely single cause of this loss. */
export function lossHint(w: World): string {
  const s = w.stats;
  const shockShare = s.fired > 0 ? s.shockKilled / s.fired : 0;
  if (shockShare > 0.15) return 'The boss shockwave wiped out a lot of your army. When the red circle pulses, hold fire or aim away, then push again.';
  if (s.fired > 0 && s.boosted / s.fired < 0.35) return 'Most of your units missed the multiplier gates. Aim through × gates before pushing.';
  if (w.breached) return 'An enemy slipped past your line. Swing over to meet threats before they reach the bottom.';
  if (w.championEnabled && s.champions === 0) return 'You never launched the Brute. Tap BRUTE (or press B) when it glows to break dense waves.';
  if (s.gateLost > s.gateGained * 0.5) return 'You lost a lot of units to ÷ and − gates. Route around them, or only pay a toll that guards a big ×.';
  return 'Spread your fire: one gate can flip or run dry if you lean on it too hard.';
}
