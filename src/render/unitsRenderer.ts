import * as THREE from 'three';
import type { UnitPool } from '../sim/pool';
import { NUM_UNIT_TYPES, TEAM_PLAYER, UNIT_DEFS } from '../sim/unitTypes';
import { UNIT_VISUALS, buildGeometry } from './visuals';

interface Range {
  start: number;
  count: number;
}

/**
 * One InstancedMesh (one draw call) per unit type, plus one blob-shadow mesh per type.
 *
 * Units never rotate, so a full 4x4 matrix per instance (64 bytes) is mostly zeros. Profiling the stress scene at
 * 4x CPU throttle showed the matrix writes plus their upload as the largest render cost, so each mesh streams a
 * compact `aInst = (x, y, z, scale)` attribute instead (16 bytes) and the Lambert shader is patched to apply it.
 * The InstancedMesh's own instanceMatrix stays identity and is uploaded once. The shadow mesh shares the same
 * attribute object (so the same GL buffer): shadows cost a draw call each but no CPU writes or uploads.
 */
export class UnitsRenderer {
  readonly meshes: THREE.InstancedMesh[] = [];
  private readonly shadows: THREE.InstancedMesh[] = [];
  private readonly attrs: THREE.InstancedBufferAttribute[] = [];
  private readonly arrays: Float32Array[] = [];
  private readonly caps = new Int32Array(NUM_UNIT_TYPES);
  private readonly used = new Int32Array(NUM_UNIT_TYPES);
  private readonly ranges: Range[] = [];
  /** Render-side cap per pool. Lower than the sim cap => draw every k-th entity, scaled up (quality scaling). */
  visualCap = 3000;
  /** The quality ladder can turn blob shadows off. */
  shadowsOn = true;
  renderedPlayer = 0;
  renderedEnemy = 0;

  constructor(scene: THREE.Scene, readonly playerCap: number, readonly enemyCap: number) {
    for (let t = 0; t < NUM_UNIT_TYPES; t++) {
      const vis = UNIT_VISUALS[t];
      const poolCap = UNIT_DEFS[t].team === TEAM_PLAYER ? playerCap : enemyCap;
      const cap = Math.min(poolCap, vis.maxInstances);
      const geom = buildGeometry(vis);
      const arr = new Float32Array(cap * 4);
      const attr = new THREE.InstancedBufferAttribute(arr, 4);
      attr.setUsage(THREE.DynamicDrawUsage);
      geom.setAttribute('aInst', attr);
      const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
      mat.onBeforeCompile = patchInstanceShader;
      mat.customProgramCacheKey = instanceCacheKey;
      const mesh = new THREE.InstancedMesh(geom, mat, cap);
      mesh.frustumCulled = false;
      mesh.count = 0;
      mesh.name = `units:${UNIT_DEFS[t].key}`;
      scene.add(mesh);

      const sGeom = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
      sGeom.setAttribute('aInst', attr);
      const shadow = new THREE.InstancedMesh(sGeom, shadowMaterial(vis.shadow * 0.85), cap);
      shadow.frustumCulled = false;
      shadow.count = 0;
      shadow.renderOrder = -1;
      shadow.name = `shadow:${UNIT_DEFS[t].key}`;
      scene.add(shadow);

      this.meshes.push(mesh);
      this.shadows.push(shadow);
      this.attrs.push(attr);
      this.arrays.push(arr);
      this.caps[t] = cap;
      this.ranges.push({ start: 0, count: 0 });
    }
  }

  update(player: UnitPool, enemy: UnitPool, alpha: number, time: number): void {
    this.used.fill(0);
    this.renderedPlayer = this.writePool(player, alpha, time);
    this.renderedEnemy = this.writePool(enemy, alpha, time);
    for (let t = 0; t < NUM_UNIT_TYPES; t++) {
      const n = this.used[t];
      const mesh = this.meshes[t];
      const shadow = this.shadows[t];
      mesh.count = shadow.count = n;
      mesh.visible = n > 0;
      shadow.visible = n > 0 && this.shadowsOn;
      if (n === 0) continue;
      const attr = this.attrs[t];
      const r = this.ranges[t];
      r.count = n * 4;
      attr.updateRanges.push(r);
      attr.needsUpdate = true;
    }
  }

  dispose(scene: THREE.Scene): void {
    for (const m of [...this.meshes, ...this.shadows]) {
      scene.remove(m);
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
      m.dispose();
    }
  }

  private writePool(pool: UnitPool, alpha: number, time: number): number {
    const n = pool.n;
    const stride = n > this.visualCap ? Math.ceil(n / this.visualCap) : 1;
    const strideScale = stride > 1 ? Math.cbrt(stride) : 1;
    const { x, y, px, py, count, type, seed } = pool;
    const used = this.used;
    const caps = this.caps;
    const arrays = this.arrays;
    // Run bob: |sin| at ~4 cycles/s from a table, phase-shifted per entity by its seed.
    const phase = (time * 4.14 * BOB_STEPS) | 0;
    let drawn = 0;
    for (let i = 0; i < n; i += stride) {
      const c = count[i];
      if (c <= 0) continue;
      const t = type[i];
      const slot = used[t];
      if (slot >= caps[t]) continue;
      used[t] = slot + 1;
      // Stacks read as slightly bigger bodies (one step per doubling); the HUD carries the exact number.
      let s = c < 2 ? 1 : c >= 2147483648 ? 1.9 : 1 + 0.12 * (31 - Math.clz32(c));
      if (s > 1.9) s = 1.9;
      s *= strideScale;
      const arr = arrays[t];
      const o = slot * 4;
      arr[o] = px[i] + (x[i] - px[i]) * alpha;
      arr[o + 1] = TYPE_BOB[t] * BOB_TABLE[(phase + (seed[i] >> 8)) & BOB_MASK];
      arr[o + 2] = -(py[i] + (y[i] - py[i]) * alpha);
      arr[o + 3] = s;
      drawn++;
    }
    return drawn;
  }
}

function patchInstanceShader(shader: THREE.WebGLProgramParametersWithUniforms): void {
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nattribute vec4 aInst;')
    .replace('#include <begin_vertex>', 'vec3 transformed = position * aInst.w + aInst.xyz;');
}

function instanceCacheKey(): string {
  return 'aInst-v1';
}

const SHADOW_VERT = /* glsl */ `
attribute vec4 aInst;
uniform float uRadius;
varying vec2 vUv;
void main() {
  vUv = position.xz;
  vec3 p = vec3(aInst.x, 0.03, aInst.z) + position * (uRadius * aInst.w);
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;

const SHADOW_FRAG = /* glsl */ `
varying vec2 vUv;
void main() {
  float d = length(vUv);
  float a = (1.0 - smoothstep(0.2, 1.0, d)) * 0.36;
  gl_FragColor = vec4(0.04, 0.06, 0.14, a);
}`;

function shadowMaterial(radius: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uRadius: { value: radius } },
    vertexShader: SHADOW_VERT,
    fragmentShader: SHADOW_FRAG,
    transparent: true,
    depthWrite: false,
  });
}

const BOB_STEPS = 256;
const BOB_MASK = BOB_STEPS - 1;
const BOB_TABLE = new Float32Array(BOB_STEPS).map((_, i) => Math.abs(Math.sin((Math.PI * i) / BOB_STEPS)));
const TYPE_BOB = new Float32Array(UNIT_VISUALS.map((v) => v.bob));
