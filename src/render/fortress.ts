import * as THREE from 'three';
import { BASE_Y } from '../sim/config';
import type { Particles } from './particles';
import { buildParts, type Part } from './visuals';

const ROCK = 0x6b6378;
const LOG = 0x9a6638;
const LOG_D = 0x74482a;
const TIP = 0xe0c08e;
const IRON = 0x3d414a;
const DOOR = 0x3a2414;
const RED = 0xc0392b;
const BONE = 0xe8e0c8;
/** Debris colour for falling chunks. */
const DEBRIS = LOG;

interface Chunk {
  mesh: THREE.Object3D;
  /** Falls when base HP fraction drops below this. */
  at: number;
  falling: number;
  vy: number;
  spin: THREE.Vector3;
  home: THREE.Vector3;
  homeRot: THREE.Euler;
}

/**
 * The orc stronghold. It visibly crumbles as it takes damage: roofs, banners, skull poles and spikes are "chunks"
 * that each break off at an HP threshold (with debris), the wood darkens and smokes, and on defeat it all sinks.
 */
export class Fortress {
  readonly group = new THREE.Group();
  private readonly mats: THREE.MeshLambertMaterial[] = [];
  private readonly chunks: Chunk[] = [];
  private readonly flag: THREE.Mesh;
  private flash = 0;
  private lastHp = -1;
  private collapse = 0;
  private smokeClock = 0;
  private frac = 1;

  constructor(scene: THREE.Scene, private readonly particles: Particles) {
    const g = this.group;

    // Everything that never breaks off is merged into one vertex-coloured mesh (one draw call).
    const fixed: Part[] = [];
    const part = (shape: Part['shape'], color: number, x: number, y: number, z: number, rot?: [number, number, number]): void => {
      fixed.push({ shape, color, pos: [x, y, z], rot });
    };
    // Chunks are separate meshes so they can fall.
    const chunk = (geom: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, at: number): THREE.Mesh => {
      const m = new THREE.Mesh(geom, mat);
      m.position.set(x, y, z);
      g.add(m);
      this.chunks.push({ mesh: m, at, falling: 0, vy: 0, spin: new THREE.Vector3(), home: m.position.clone(), homeRot: new THREE.Euler() });
      return m;
    };
    const red = this.mat(RED);
    const iron = this.mat(IRON);
    const bone = this.mat(BONE);
    const logMat = this.mat(LOG_D);

    // Rock footing and a log palisade with sharpened tips.
    part({ s: 'box', w: 13.4, h: 0.9, d: 2.8 }, ROCK, 0, 0.45, 0.2);
    for (let k = 0; k < 17; k++) {
      const x = -6.2 + k * 0.775;
      if (Math.abs(x) < 2.1) continue; // the gate
      const h = 3.3 + ((k * 37) % 5) * 0.12;
      part({ s: 'cyl', rt: 0.39, rb: 0.39, h, seg: 6 }, k % 2 ? LOG : LOG_D, x, 0.9 + h / 2, 0.5);
      part({ s: 'cone', r: 0.39, h: 0.7, seg: 6 }, TIP, x, 0.9 + h + 0.35, 0.5);
    }
    // Walkway behind the wall.
    part({ s: 'box', w: 12.6, h: 0.25, d: 1.4 }, LOG_D, 0, 3.6, -0.6);

    // Gatehouse: two thick towers, an iron-banded gate, a platform and a spiked roof.
    for (const side of [-1, 1]) {
      part({ s: 'cyl', rt: 0.75, rb: 0.85, h: 5.2, seg: 7 }, LOG, side * 1.85, 3.5, 0.7);
      part({ s: 'box', w: 1.9, h: 0.25, d: 1.9 }, IRON, side * 1.85, 4.1, 0.7);
    }
    part({ s: 'box', w: 2.9, h: 3.1, d: 0.35 }, DOOR, 0, 2.45, 1.0);
    for (const y of [1.5, 2.6, 3.6]) part({ s: 'box', w: 3.0, h: 0.18, d: 0.12 }, IRON, 0, y, 1.2);
    part({ s: 'box', w: 5.2, h: 0.45, d: 2.6 }, LOG_D, 0, 6.1, 0.6);
    for (const x of [-2.2, -1.1, 0, 1.1, 2.2]) part({ s: 'cone', r: 0.16, h: 0.8, seg: 4 }, BONE, x, 6.7, 1.75);

    // Corner watchtowers on stilts.
    for (const side of [-1, 1]) {
      const tx = side * 6.5;
      for (const [dx, dz] of [[-0.9, -0.5], [0.9, -0.5], [-0.9, 1.3], [0.9, 1.3]]) {
        part({ s: 'cyl', rt: 0.16, rb: 0.2, h: 6.2, seg: 5 }, LOG_D, tx + dx, 3.1, 0.4 + dz);
      }
      part({ s: 'box', w: 2.6, h: 1.1, d: 2.6 }, LOG, tx, 6.3, 0.8);
      part({ s: 'box', w: 2.8, h: 0.2, d: 2.8 }, IRON, tx, 6.9, 0.8);
    }

    const merged = new THREE.Mesh(buildParts(fixed), this.mat(0xffffff, true));
    g.add(merged);

    // Breakable pieces, most fragile first as HP drops.
    const roof = this.mat(LOG_D);
    const gateRoof = chunk(new THREE.ConeGeometry(3.3, 2.6, 4), roof, 0, 7.6, 0.6, 0.15);
    gateRoof.rotation.y = Math.PI / 4;
    for (const side of [-1, 1]) {
      chunk(new THREE.ConeGeometry(2.1, 2.4, 4), roof, side * 6.5, 8.2, 0.8, side < 0 ? 0.42 : 0.28).rotation.y = Math.PI / 4;
      // War banners on the wall: red cloth with a bone stripe.
      chunk(new THREE.BoxGeometry(1.2, 2.3, 0.08), red, side * 3.7, 2.6, 1.0, side < 0 ? 0.6 : 0.36);
      chunk(new THREE.BoxGeometry(0.9, 0.18, 0.1), bone, side * 3.7, 2.9, 1.06, side < 0 ? 0.6 : 0.36);
    }
    // Skull poles in front of the gate.
    for (const [x, at] of [[-2.8, 0.9], [2.8, 0.78], [-4.9, 0.66], [4.9, 0.5]] as const) {
      chunk(new THREE.CylinderGeometry(0.07, 0.09, 2.4, 5), logMat, x, 2.1, 1.9, at);
      chunk(new THREE.IcosahedronGeometry(0.28, 0), bone, x, 3.4, 1.9, at);
    }
    // Iron spikes along the gate platform.
    for (const [x, at] of [[-2.4, 0.72], [2.4, 0.55]] as const) chunk(new THREE.ConeGeometry(0.2, 1.0, 4), iron, x, 6.8, 0.6, at);

    // Flag on the gatehouse.
    chunk(new THREE.CylinderGeometry(0.06, 0.06, 2.6, 6), logMat, 0, 9.6, 0.6, -1);
    this.flag = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.9, 6, 1).translate(0.8, 0, 0), new THREE.MeshLambertMaterial({ color: RED, side: THREE.DoubleSide }));
    this.flag.position.set(0.06, 10.4, 0.6);
    g.add(this.flag);

    for (const c of this.chunks) c.homeRot.copy(c.mesh.rotation);
    g.name = 'fortress';
    g.position.set(0, 0, -(BASE_Y + 1.6));
    scene.add(g);
  }

  private mat(color: number, vertexColors = false): THREE.MeshLambertMaterial {
    const m = new THREE.MeshLambertMaterial({ color, vertexColors, emissive: 0xff2a2a, emissiveIntensity: 0 });
    m.userData.base = new THREE.Color(color);
    this.mats.push(m);
    return m;
  }

  reset(): void {
    this.flash = 0;
    this.lastHp = -1;
    this.collapse = 0;
    this.frac = 1;
    this.group.position.y = 0;
    this.group.rotation.set(0, 0, 0);
    this.group.scale.set(1, 1, 1);
    for (const c of this.chunks) {
      c.falling = 0;
      c.mesh.visible = true;
      c.mesh.position.copy(c.home);
      c.mesh.rotation.copy(c.homeRot);
    }
    for (const m of this.mats) m.color.copy(m.userData.base as THREE.Color);
  }

  /** @returns true on the frame the HP dropped (for camera shake). */
  update(hp: number, maxHp: number, won: boolean, time: number, dt: number): boolean {
    const frac = maxHp > 0 ? Math.max(0, hp / maxHp) : 0;
    const hit = this.lastHp >= 0 && hp < this.lastHp;
    if (hit) this.flash = 1;
    this.lastHp = hp;
    this.flash = Math.max(0, this.flash - dt * 10);

    if (frac !== this.frac) {
      this.frac = frac;
      // Darken toward scorched as HP drops.
      const k = 0.45 + 0.55 * frac;
      for (const m of this.mats) m.color.copy(m.userData.base as THREE.Color).multiplyScalar(k);
    }
    for (const m of this.mats) m.emissiveIntensity = this.flash * 0.16;

    const wx = this.group.position.x;
    const wz = this.group.position.z;
    for (const c of this.chunks) {
      if (c.falling === 0 && frac < c.at) {
        c.falling = 1;
        c.vy = 2;
        c.spin.set((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 6);
        const p = c.mesh.position;
        this.particles.emit(wx + p.x, p.y, wz + p.z, 14, DEBRIS, 4, 7, 0.35, 1.2);
      }
      if (c.falling > 0 && c.mesh.visible) {
        c.vy -= 22 * dt;
        c.mesh.position.y += c.vy * dt;
        c.mesh.position.z += 2.5 * dt;
        c.mesh.rotation.x += c.spin.x * dt;
        c.mesh.rotation.z += c.spin.z * dt;
        if (c.mesh.position.y < -1) c.mesh.visible = false;
      }
    }

    // Smoke grows as the base weakens.
    this.smokeClock += dt;
    const smokeEvery = frac < 0.25 ? 0.08 : frac < 0.5 ? 0.18 : frac < 0.75 ? 0.4 : 0;
    if (smokeEvery > 0 && this.smokeClock > smokeEvery && this.collapse === 0) {
      this.smokeClock = 0;
      const sx = (Math.random() - 0.5) * 10;
      this.particles.emit(wx + sx, 4 + Math.random() * 2, wz + 0.5, 1, frac < 0.25 ? 0x3a3a3a : 0x6b6b6b, 0.4, 2.2, 0.9, 2.2, -0.04);
      if (frac < 0.25 && Math.random() < 0.5) this.particles.emit(wx + sx, 3.5, wz + 1, 1, 0xff8a1f, 0.6, 3, 0.45, 0.6, -0.05);
    }

    // Flag wave.
    const pos = this.flag.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      pos.setZ(i, Math.sin(time * 6 - x * 3) * 0.12 * x);
    }
    pos.needsUpdate = true;

    if (won) {
      if (this.collapse === 0) {
        for (let k = 0; k < 6; k++) this.particles.emit(wx + (k - 2.5) * 2, 2 + Math.random() * 3, wz + 1, 16, k % 2 ? LOG : TIP, 6, 9, 0.5, 1.6);
        this.particles.emit(wx, 3, wz + 1, 30, 0xff8a1f, 5, 8, 0.4, 0.9);
      }
      this.collapse = Math.min(1, this.collapse + dt * 0.7);
      const e = this.collapse * this.collapse;
      this.group.position.y = -e * 7;
      this.group.rotation.x = -e * 0.25;
      this.group.position.x = Math.sin(time * 40) * 0.12 * (1 - this.collapse);
    }
    return hit;
  }
}
