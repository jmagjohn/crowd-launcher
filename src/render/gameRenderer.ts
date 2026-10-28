import * as THREE from 'three';
import { BASE_Y, LANE_HALF, LANE_WIDTH } from '../sim/config';
import { GpuTimer } from '../debug/gpuTimer';
import { STATE_WON, type World } from '../sim/world';
import { Effects } from './effects';
import { buildEnvironment } from './environment';
import { Fortress } from './fortress';
import { GatesRenderer } from './gatesRenderer';
import { LAUNCHER_Z, Launcher } from './launcher';
import { Particles } from './particles';
import { UnitsRenderer } from './unitsRenderer';

const MAX_DPR = 2;

/** Owns the Three.js scene. Sim (x, y) maps to world (x, 0, -y): the lane runs away from the camera. */
export class GameRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(46, 9 / 16, 0.5, 400);
  readonly canvas: HTMLCanvasElement;
  readonly labelLayer: HTMLDivElement;
  units: UnitsRenderer | null = null;
  gates: GatesRenderer | null = null;
  readonly particles: Particles;
  readonly effects: Effects;
  readonly launcher: Launcher;
  readonly fortress: Fortress;
  /** Camera shake on/off (settings). */
  shakeOn = true;
  /** Blob shadows on/off (quality). */
  shadowsOn = true;
  /** Render-side visual cap per pool (quality). */
  visualCap = 3000;
  /** Debug A/B (?hide=props,ground,...): objects whose name starts with one of these move off the camera layer. */
  hide: string[] = [];

  width = 1;
  height = 1;
  dpr = 1;
  maxDpr = MAX_DPR;
  drawCalls = 0;
  triangles = 0;
  readonly glRenderer: string;
  readonly gpuTimer: GpuTimer;

  private canvasLeft = 0;
  private laneX0 = 0;
  private laneX1 = 1;
  private readonly tmp = new THREE.Vector3();
  private readonly camHome = new THREE.Vector3();
  private readonly camLook = new THREE.Vector3();

  constructor(private readonly stage: HTMLElement) {
    const dpr = window.devicePixelRatio || 1;
    this.renderer = new THREE.WebGLRenderer({ antialias: dpr < 1.5, powerPreference: 'high-performance', stencil: false });
    this.canvas = this.renderer.domElement;
    this.canvas.className = 'game-canvas';
    stage.append(this.canvas);
    this.labelLayer = document.createElement('div');
    this.labelLayer.className = 'label-layer';
    stage.append(this.labelLayer);

    const gl = this.renderer.getContext();
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    this.glRenderer = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : 'unknown';
    this.gpuTimer = new GpuTimer(gl);

    this.scene.add(new THREE.HemisphereLight(0xf2f8ff, 0x6b8a5a, 1.75));
    const sun = new THREE.DirectionalLight(0xfff4e0, 1.9);
    sun.position.set(-5, 14, 7);
    this.scene.add(sun);

    buildEnvironment(this.scene);
    this.particles = new Particles(this.scene);
    this.fortress = new Fortress(this.scene, this.particles);
    this.launcher = new Launcher(this.scene);
    this.effects = new Effects(this.scene, this.particles, this.launcher);
    this.resize();
  }

  setWorld(world: World): void {
    const pc = world.player.cap;
    const ec = world.enemy.cap;
    if (!this.units || this.units.playerCap !== pc || this.units.enemyCap !== ec) {
      this.units?.dispose(this.scene);
      this.units = new UnitsRenderer(this.scene, pc, ec);
    }
    this.units.shadowsOn = this.shadowsOn;
    this.units.visualCap = this.visualCap;
    this.gates?.dispose();
    this.gates = new GatesRenderer(this.scene, this.labelLayer, world.gates);
    this.launcher.setWeapon(world.mods.weapon);
    this.fortress.reset();
    this.effects.reset(world);
    if (this.hide.length) this.applyHide();
  }

  applyHide(): void {
    // Layers are per object (not inherited), so hide the whole subtree of a match.
    this.scene.traverse((o) => {
      if (this.hide.some((p) => o.name.startsWith(p))) o.traverse((c) => c.layers.set(1));
    });
  }

  resize(): void {
    const w = Math.max(1, this.stage.clientWidth);
    const h = Math.max(1, this.stage.clientHeight);
    this.width = w;
    this.height = h;
    this.dpr = Math.min(window.devicePixelRatio || 1, this.maxDpr);
    this.renderer.setPixelRatio(this.dpr);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.fitCamera();
    this.canvasLeft = this.canvas.getBoundingClientRect().left;
    this.updateLaneMapping();
  }

  setMaxDpr(maxDpr: number): void {
    this.maxDpr = maxDpr;
    this.resize();
  }

  /** Screen x (client px) -> lane x at the launcher row. Exact: perspective is linear along a constant-depth line. */
  laneXFromClient(clientX: number): number {
    const t = (clientX - this.canvasLeft - this.laneX0) / (this.laneX1 - this.laneX0);
    return -LANE_HALF + t * LANE_WIDTH;
  }

  render(world: World, alpha: number, aimX: number, time: number, frameDt: number): void {
    const units = this.units!;
    this.launcher.update(aimX, world.championEnabled && world.charge >= 1, time, frameDt);
    units.update(world.player, world.enemy, alpha, time);
    this.gates!.update(world.gates, world.tick, this.camera, this.width, this.height, time, frameDt);
    this.effects.update(world, this.gates!, time, frameDt);
    if (this.fortress.update(world.baseHp, world.baseMaxHp, world.state === STATE_WON, time, frameDt)) this.effects.shake(0.02);

    // Camera shake: offset by trauma^2 noise, then restore the fitted pose.
    const tr = this.shakeOn ? this.effects.trauma : 0;
    const cam = this.camera;
    if (tr > 0) {
      const k = tr * tr * 0.45;
      cam.position.set(
        this.camHome.x + Math.sin(time * 71) * k,
        this.camHome.y + Math.sin(time * 53 + 1) * k,
        this.camHome.z + Math.sin(time * 61 + 2) * k * 0.5,
      );
    } else {
      cam.position.copy(this.camHome);
    }
    cam.lookAt(this.camLook);

    this.gpuTimer.poll();
    this.gpuTimer.begin();
    this.renderer.render(this.scene, cam);
    this.gpuTimer.end();
    this.drawCalls = this.renderer.info.render.calls;
    this.triangles = this.renderer.info.render.triangles;
  }

  /**
   * Portrait fit: for a fixed pitch, search the look-at point and distance that frame the whole lane (launcher row
   * at the bottom, base at the top) as large as possible while leaving room for the HUD bars.
   */
  private fitCamera(): void {
    const cam = this.camera;
    cam.updateProjectionMatrix();
    const pitch = THREE.MathUtils.degToRad(54);
    const dirY = Math.sin(pitch);
    const dirZ = Math.cos(pitch);
    const pts: [number, number, number, number][] = [
      // x, y, z, role (0 = bottom row, 1 = top row)
      [-LANE_HALF - 0.4, 0, LAUNCHER_Z + 1.2, 0],
      [LANE_HALF + 0.4, 0, LAUNCHER_Z + 1.2, 0],
      [-LANE_HALF - 0.4, 0, -BASE_Y, 1],
      [LANE_HALF + 0.4, 0, -BASE_Y, 1],
      [0, 8.5, -(BASE_Y + 1), 1],
    ];
    const v = this.tmp;
    const fits = (tz: number, d: number): boolean => {
      cam.position.set(0, d * dirY, tz + d * dirZ);
      cam.lookAt(0, 0, tz);
      cam.updateMatrixWorld(true);
      for (const p of pts) {
        v.set(p[0], p[1], p[2]).project(cam);
        if (Math.abs(v.x) > 0.98) return false;
        if (p[3] === 0 ? v.y < -0.8 : v.y > 0.8) return false;
      }
      return true;
    };
    let best = Infinity;
    let bestZ = -BASE_Y / 2;
    for (let tz = -6; tz >= -BASE_Y + 4; tz -= 0.5) {
      let lo = 4;
      let hi = 200;
      if (!fits(tz, hi)) continue;
      for (let k = 0; k < 28; k++) {
        const mid = (lo + hi) / 2;
        if (fits(tz, mid)) hi = mid;
        else lo = mid;
      }
      if (hi < best) {
        best = hi;
        bestZ = tz;
      }
    }
    if (!Number.isFinite(best)) best = 80;
    this.camHome.set(0, best * dirY, bestZ + best * dirZ);
    this.camLook.set(0, 0, bestZ);
    cam.position.copy(this.camHome);
    cam.lookAt(this.camLook);
    cam.updateMatrixWorld(true);
  }

  private updateLaneMapping(): void {
    const v = this.tmp;
    v.set(-LANE_HALF, 0, 0).project(this.camera);
    this.laneX0 = (v.x * 0.5 + 0.5) * this.width;
    v.set(LANE_HALF, 0, 0).project(this.camera);
    this.laneX1 = (v.x * 0.5 + 0.5) * this.width;
  }
}
