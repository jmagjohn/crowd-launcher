import * as THREE from 'three';
import { MAX_SHOCKS, SHOCK_MAX_R, SHOCK_PERIOD, SHOCK_WINDUP } from '../sim/config';
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
  EV_SHOCKWAVE,
} from '../sim/events';
import { T_BOSS, T_GRUNT, T_SHIELD, T_SWARM } from '../sim/unitTypes';
import type { World } from '../sim/world';
import type { GatesRenderer } from './gatesRenderer';
import type { Launcher } from './launcher';
import type { Particles } from './particles';

const ENEMY_COLOR: Record<number, number> = { [T_GRUNT]: 0xe5383b, [T_SHIELD]: 0xf59e0b, [T_SWARM]: 0xff3fa4, [T_BOSS]: 0x8f1a1d };
const GATE_COLOR = [0x22c55e, 0xf97316, 0x2f7bff, 0xdc2626];

// Per-frame emission budgets: a 5,000-unit brawl produces thousands of kill events a second; a sample is plenty.
const KILL_BUDGET = 14;
const GATE_BUDGET = 16;
const HIT_BUDGET = 10;

/**
 * Presentation of sim events: reads the world's event ring since the last frame and turns events into particles,
 * gate popups, launcher recoil and camera shake. Also draws boss shockwave rings and their ground telegraph
 * straight from sim state. Nothing here feeds back into the sim.
 */
export class Effects {
  private read = 0;
  private readonly rings: THREE.Mesh[] = [];
  private readonly ringMats: THREE.MeshBasicMaterial[] = [];
  private readonly warns: THREE.Mesh[] = [];
  private readonly warnMats: THREE.MeshBasicMaterial[] = [];
  /** Camera shake "trauma", 0..1; the renderer squares it. */
  trauma = 0;
  /** Muzzle shots since the last frame (for audio later). */
  shots = 0;

  constructor(
    scene: THREE.Scene,
    private readonly particles: Particles,
    private readonly launcher: Launcher,
  ) {
    const ringGeom = new THREE.RingGeometry(0.86, 1, 56).rotateX(-Math.PI / 2);
    const warnGeom = new THREE.RingGeometry(0.0, 1, 56).rotateX(-Math.PI / 2);
    for (let k = 0; k < MAX_SHOCKS; k++) {
      const m = new THREE.MeshBasicMaterial({ color: 0xffd36b, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
      const r = new THREE.Mesh(ringGeom, m);
      r.position.y = 0.06;
      r.visible = false;
      scene.add(r);
      this.rings.push(r);
      this.ringMats.push(m);
      const wm = new THREE.MeshBasicMaterial({ color: 0xff2a2a, transparent: true, opacity: 0, depthWrite: false });
      const w = new THREE.Mesh(warnGeom, wm);
      w.position.y = 0.04;
      w.scale.setScalar(SHOCK_MAX_R);
      w.visible = false;
      scene.add(w);
      this.warns.push(w);
      this.warnMats.push(wm);
    }
  }

  reset(world: World): void {
    this.read = world.events.written;
    this.trauma = 0;
    this.particles.clear();
  }

  shake(amount: number): void {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  update(world: World, gates: GatesRenderer, time: number, dt: number): void {
    const ev = world.events;
    // If we fell more than a ring behind (long stall), skip to the oldest event still in the buffer.
    if (ev.written - this.read > ev.cap) this.read = ev.written - ev.cap;
    let kills = 0;
    let gatesFx = 0;
    let hits = 0;
    const P = this.particles;
    for (; this.read < ev.written; this.read++) {
      const s = this.read % ev.cap;
      const x = ev.x[s];
      const z = -ev.y[s];
      switch (ev.kind[s]) {
        case EV_KILL:
          if (kills++ < KILL_BUDGET) {
            P.emit(x, 0.5, z, 2, ENEMY_COLOR[ev.b[s]] ?? 0xe5383b, 3, 5, 0.18, 0.5);
            P.emit(x, 0.5, z, 1, 0x2f7bff, 3, 5, 0.16, 0.45);
          }
          break;
        case EV_GATE_PASS: {
          const gi = ev.a[s];
          gates.addDelta(gi, ev.b[s]);
          if (gatesFx++ < GATE_BUDGET) P.emit(x, 1.1, z, 1, GATE_COLOR[world.gates[gi]?.op ?? 2], 2.5, 3, 0.14, 0.4, 0.4);
          break;
        }
        case EV_BASE_HIT:
          if (hits++ < HIT_BUDGET) P.emit(x, 1.5, z + 0.6, 3, hits % 2 ? 0x6b6378 : 0xffd36b, 4, 6, 0.24, 0.7);
          this.shake(0.012);
          break;
        case EV_BREACH:
          P.emit(x, 0.6, z, 30, 0xff2a2a, 6, 7, 0.3, 0.9);
          this.shake(0.6);
          break;
        case EV_CHAMPION:
          P.ring(x, z, 26, 0xcfe0ff, 7, 0.3, 0.6);
          this.shake(0.25);
          break;
        case EV_GATE_FLIP:
          P.emit(x, 1.2, z, 26, GATE_COLOR[world.gates[ev.a[s]]?.op ?? 3], 5, 5, 0.25, 0.8);
          this.shake(0.15);
          break;
        case EV_GATE_BREAK:
          P.emit(x, 1.2, z, 30, 0xf1f5f9, 6, 6, 0.28, 0.9);
          this.shake(0.2);
          break;
        case EV_FIRE:
          this.launcher.fire();
          this.shots++;
          break;
        case EV_SHOCKWAVE:
          P.ring(x, z, 40, 0xffd36b, 9, 0.35, 0.8);
          P.emit(x, 0.4, z, 20, 0x8a7f74, 4, 4, 0.5, 1.0);
          this.shake(0.45);
          break;
        case EV_SHOCK_HIT:
          if (hits++ < HIT_BUDGET) P.emit(x, 0.5, z, 3, 0x2f7bff, 4, 7, 0.2, 0.6);
          break;
      }
    }

    // Shockwave rings, straight from sim state.
    for (let k = 0; k < MAX_SHOCKS; k++) {
      const on = world.shockOn[k] !== 0;
      const ring = this.rings[k];
      ring.visible = on;
      if (!on) continue;
      const r = world.shockR[k];
      ring.position.x = world.shockX[k];
      ring.position.z = -world.shockY[k];
      ring.scale.setScalar(r);
      this.ringMats[k].opacity = 0.95 * (1 - r / SHOCK_MAX_R) + 0.15;
    }

    // Telegraph: while a boss winds up, its blast radius pulses red on the ground.
    const E = world.enemy;
    let w = 0;
    const windStart = SHOCK_PERIOD - SHOCK_WINDUP;
    for (let i = 0; i < E.n && w < MAX_SHOCKS; i++) {
      if (E.type[i] !== T_BOSS || E.count[i] <= 0) continue;
      const t = E.aux[i];
      if (t < windStart) continue;
      const k = (t - windStart) / SHOCK_WINDUP;
      const warn = this.warns[w];
      warn.visible = true;
      warn.position.x = E.x[i];
      warn.position.z = -E.y[i];
      warn.scale.setScalar(SHOCK_MAX_R * (0.3 + 0.7 * k));
      this.warnMats[w].opacity = (0.16 + 0.14 * Math.sin(time * 30)) * (0.5 + k);
      w++;
    }
    for (; w < MAX_SHOCKS; w++) this.warns[w].visible = false;

    P.update(dt);
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
  }
}
