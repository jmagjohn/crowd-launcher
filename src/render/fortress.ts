import * as THREE from 'three';
import { BASE_Y } from '../sim/config';
import type { Particles } from './particles';

const STONE = 0x6b6378;
const STONE_D = 0x4a4456;
const ROOF = 0xc92a2a;
const TRIM = 0xe5383b;
const DOOR = 0x2a0f12;

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
 * The enemy fortress. It visibly crumbles as it takes damage: merlons, roofs and banners are "chunks" that each
 * break off at an HP threshold (with debris), the stone darkens and smokes, and on defeat the whole keep sinks.
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
    const stone = this.mat(STONE);
    const stoneD = this.mat(STONE_D);
    const roof = this.mat(ROOF);
    const trim = this.mat(TRIM);
    const door = this.mat(DOOR);
    const g = this.group;

    const add = (geom: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, chunkAt = -1): THREE.Mesh => {
      const m = new THREE.Mesh(geom, mat);
      m.position.set(x, y, z);
      g.add(m);
      if (chunkAt >= 0) this.chunks.push({ mesh: m, at: chunkAt, falling: 0, vy: 0, spin: new THREE.Vector3(), home: m.position.clone(), homeRot: new THREE.Euler() });
      return m;
    };

    // Curtain wall and gatehouse.
    add(new THREE.BoxGeometry(12.6, 3.4, 2.2), stone, 0, 1.7, 0);
    add(new THREE.BoxGeometry(12.8, 0.3, 2.4), stoneD, 0, 3.45, 0);
    add(new THREE.BoxGeometry(4.4, 5.6, 3.2), stone, 0, 2.8, 0.4);
    add(new THREE.BoxGeometry(2.6, 2.6, 0.2), door, 0, 1.3, 2.05);
    add(new THREE.BoxGeometry(3.2, 0.35, 0.3), trim, 0, 2.75, 2.1);
    const gateRoof = add(new THREE.ConeGeometry(3.4, 2.4, 4), roof, 0, 6.8, 0.4, 0.12);
    gateRoof.rotation.y = Math.PI / 4;

    // Merlons along the wall top.
    const merlon = new THREE.BoxGeometry(0.9, 0.8, 0.7);
    const xs = [-5.8, -4.6, -3.4, 3.4, 4.6, 5.8];
    xs.forEach((x, i) => add(merlon, stone, x, 4.0, 0.75, 0.92 - i * 0.13));
    [-1.6, -0.5, 0.6, 1.7].forEach((x, i) => add(merlon, stone, x, 5.95, 1.7, 0.86 - i * 0.16));

    // Corner towers with roofs.
    for (const side of [-1, 1]) {
      add(new THREE.CylinderGeometry(1.35, 1.5, 6.4, 10), stone, side * 6.4, 3.2, 0.3);
      add(new THREE.CylinderGeometry(1.55, 1.55, 0.35, 10), stoneD, side * 6.4, 6.5, 0.3);
      add(new THREE.ConeGeometry(1.8, 2.6, 10), roof, side * 6.4, 7.95, 0.3, side < 0 ? 0.4 : 0.25);
      // Banners.
      add(new THREE.BoxGeometry(1.0, 2.0, 0.06), trim, side * 2.9, 2.4, 1.15, side < 0 ? 0.55 : 0.33);
    }

    // Flag on the gatehouse.
    add(new THREE.CylinderGeometry(0.06, 0.06, 2.6, 6), stoneD, 0, 9.2, 0.4);
    this.flag = add(new THREE.PlaneGeometry(1.6, 0.9, 6, 1).translate(0.8, 0, 0), new THREE.MeshLambertMaterial({ color: TRIM, side: THREE.DoubleSide }), 0.06, 10.0, 0.4);

    for (const c of this.chunks) c.homeRot.copy(c.mesh.rotation);
    g.name = 'fortress';
    g.position.set(0, 0, -(BASE_Y + 1.6));
    scene.add(g);
  }

  private mat(color: number): THREE.MeshLambertMaterial {
    const m = new THREE.MeshLambertMaterial({ color, emissive: 0xff2a2a, emissiveIntensity: 0 });
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
        this.particles.emit(wx + p.x, p.y, wz + p.z, 14, STONE, 4, 7, 0.35, 1.2);
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
        for (let k = 0; k < 6; k++) this.particles.emit(wx + (k - 2.5) * 2, 2 + Math.random() * 3, wz + 1, 16, k % 2 ? STONE : 0x9a90a8, 6, 9, 0.5, 1.6);
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
