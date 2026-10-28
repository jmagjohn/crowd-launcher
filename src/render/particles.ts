import * as THREE from 'three';

const GRAVITY = -18;

/**
 * Pooled CPU particles drawn as one InstancedMesh of tiny octahedra (no billboarding needed, so no per-frame
 * camera math). State is structure-of-arrays; dead particles are swap-removed, so the live set is a dense prefix
 * and only that prefix is uploaded. Emission is budgeted by the caller, so a 5,000-unit brawl cannot flood it.
 */
export class Particles {
  readonly cap: number;
  n = 0;
  private readonly x: Float32Array;
  private readonly y: Float32Array;
  private readonly z: Float32Array;
  private readonly vx: Float32Array;
  private readonly vy: Float32Array;
  private readonly vz: Float32Array;
  private readonly life: Float32Array;
  private readonly maxLife: Float32Array;
  private readonly size: Float32Array;
  private readonly grav: Float32Array;
  private readonly col: Float32Array;
  private readonly inst: Float32Array;
  private readonly instAttr: THREE.InstancedBufferAttribute;
  private readonly colAttr: THREE.InstancedBufferAttribute;
  private readonly instRange = { start: 0, count: 0 };
  private readonly colRange = { start: 0, count: 0 };
  readonly mesh: THREE.InstancedMesh;
  private seed = 12345;
  private readonly tmp = new THREE.Color();

  constructor(scene: THREE.Scene, cap = 1500) {
    this.cap = cap;
    this.x = new Float32Array(cap);
    this.y = new Float32Array(cap);
    this.z = new Float32Array(cap);
    this.vx = new Float32Array(cap);
    this.vy = new Float32Array(cap);
    this.vz = new Float32Array(cap);
    this.life = new Float32Array(cap);
    this.maxLife = new Float32Array(cap);
    this.size = new Float32Array(cap);
    this.grav = new Float32Array(cap);
    this.col = new Float32Array(cap * 3);
    this.inst = new Float32Array(cap * 4);

    const geom = new THREE.OctahedronGeometry(0.5, 0);
    this.instAttr = new THREE.InstancedBufferAttribute(this.inst, 4);
    this.instAttr.setUsage(THREE.DynamicDrawUsage);
    geom.setAttribute('aInst', this.instAttr);
    const mat = new THREE.MeshLambertMaterial({ emissive: 0x222222 });
    mat.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec4 aInst;')
        .replace('#include <begin_vertex>', 'vec3 transformed = position * aInst.w + aInst.xyz;');
    };
    mat.customProgramCacheKey = () => 'particles-v1';
    this.mesh = new THREE.InstancedMesh(geom, mat, cap);
    this.colAttr = new THREE.InstancedBufferAttribute(this.col, 3);
    this.colAttr.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceColor = this.colAttr;
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.name = 'particles';
    scene.add(this.mesh);
  }

  /** Cheap LCG for visual randomness (keeps the sim RNG untouched). */
  private rand(): number {
    this.seed = (Math.imul(this.seed, 1664525) + 1013904223) | 0;
    return (this.seed >>> 8) / 16777216;
  }

  /**
   * Burst of `count` particles at (x, y, z) in world space. `speed` is the horizontal spread, `up` the upward kick,
   * `gravity` 0..1 scales gravity (0 = floating smoke).
   */
  emit(x: number, y: number, z: number, count: number, color: number, speed: number, up: number, size: number, life: number, gravity = 1): void {
    this.tmp.setHex(color);
    const r = this.tmp.r;
    const g = this.tmp.g;
    const b = this.tmp.b;
    for (let k = 0; k < count; k++) {
      if (this.n >= this.cap) return;
      const i = this.n++;
      const a = this.rand() * Math.PI * 2;
      const sp = speed * (0.4 + this.rand() * 0.6);
      this.x[i] = x;
      this.y[i] = y;
      this.z[i] = z;
      this.vx[i] = Math.cos(a) * sp;
      this.vz[i] = Math.sin(a) * sp;
      this.vy[i] = up * (0.5 + this.rand() * 0.7);
      const l = life * (0.6 + this.rand() * 0.5);
      this.life[i] = this.maxLife[i] = l;
      this.size[i] = size * (0.6 + this.rand() * 0.6);
      this.grav[i] = gravity;
      const v = 0.85 + this.rand() * 0.3;
      this.col[i * 3] = r * v;
      this.col[i * 3 + 1] = g * v;
      this.col[i * 3 + 2] = b * v;
    }
  }

  /** Ring of particles flying outward horizontally (shockwaves, Brute landing). */
  ring(x: number, z: number, count: number, color: number, speed: number, size: number, life: number): void {
    const start = this.n;
    this.emit(x, 0.2, z, count, color, speed, 1.5, size, life, 0.3);
    for (let i = start; i < this.n; i++) {
      const a = ((i - start) / count) * Math.PI * 2;
      this.vx[i] = Math.cos(a) * speed;
      this.vz[i] = Math.sin(a) * speed;
    }
  }

  update(dt: number): void {
    let i = 0;
    while (i < this.n) {
      const l = this.life[i] - dt;
      if (l <= 0) {
        this.remove(i);
        continue;
      }
      this.life[i] = l;
      this.vy[i] += GRAVITY * this.grav[i] * dt;
      let y = this.y[i] + this.vy[i] * dt;
      if (y < 0.02 && this.grav[i] > 0) {
        y = 0.02;
        this.vy[i] *= -0.35;
        this.vx[i] *= 0.6;
        this.vz[i] *= 0.6;
      }
      this.x[i] += this.vx[i] * dt;
      this.y[i] = y;
      this.z[i] += this.vz[i] * dt;
      if (this.grav[i] < 0.5) {
        this.vx[i] *= 1 - 2 * dt;
        this.vz[i] *= 1 - 2 * dt;
      }
      const o = i * 4;
      this.inst[o] = this.x[i];
      this.inst[o + 1] = y;
      this.inst[o + 2] = this.z[i];
      const f = l / this.maxLife[i];
      this.inst[o + 3] = this.size[i] * (f < 0.35 ? f / 0.35 : 1);
      i++;
    }
    this.mesh.count = this.n;
    this.mesh.visible = this.n > 0;
    if (this.n > 0) {
      this.instRange.count = this.n * 4;
      this.instAttr.updateRanges.push(this.instRange);
      this.instAttr.needsUpdate = true;
      this.colRange.count = this.n * 3;
      this.colAttr.updateRanges.push(this.colRange);
      this.colAttr.needsUpdate = true;
    }
  }

  clear(): void {
    this.n = 0;
    this.mesh.count = 0;
  }

  private remove(i: number): void {
    const last = --this.n;
    if (i === last) return;
    this.x[i] = this.x[last];
    this.y[i] = this.y[last];
    this.z[i] = this.z[last];
    this.vx[i] = this.vx[last];
    this.vy[i] = this.vy[last];
    this.vz[i] = this.vz[last];
    this.life[i] = this.life[last];
    this.maxLife[i] = this.maxLife[last];
    this.size[i] = this.size[last];
    this.grav[i] = this.grav[last];
    this.col[i * 3] = this.col[last * 3];
    this.col[i * 3 + 1] = this.col[last * 3 + 1];
    this.col[i * 3 + 2] = this.col[last * 3 + 2];
  }
}
