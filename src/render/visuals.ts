import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { NUM_UNIT_TYPES, T_BOSS, T_BRUTE, T_GRUNT, T_OGRE, T_RUNNER, T_SHIELD, T_SOLDIER, T_SWARM, T_TYRANT } from '../sim/unitTypes';

/**
 * Asset-swap layer. The sim only knows type ids; everything about how a type looks lives here.
 *
 * Placeholders are built from primitive "parts" with baked vertex colours and merged into one BufferGeometry, so
 * each unit type is still a single InstancedMesh draw call. To swap in a glTF model (Kenney / Quaternius, CC0),
 * set `source` to `{ kind: 'gltf', url }`, load it before the level starts and merge its meshes the same way;
 * sim code is untouched. Models stand on y = 0 and face -z (player) or +z (enemy, toward the camera).
 */
export type Shape =
  | { s: 'capsule'; r: number; len: number }
  | { s: 'sphere'; r: number; detail?: number }
  | { s: 'box'; w: number; h: number; d: number }
  | { s: 'cone'; r: number; h: number; seg?: number }
  | { s: 'cyl'; rt: number; rb: number; h: number; seg?: number };

export interface Part {
  shape: Shape;
  color: number;
  pos?: [number, number, number];
  rot?: [number, number, number];
  scale?: [number, number, number];
}

export type VisualSource = { kind: 'parts'; parts: Part[] } | { kind: 'gltf'; url: string; mesh?: string };

export interface VisualDef {
  readonly source: VisualSource;
  /** Run-bob amplitude in world units. */
  readonly bob: number;
  /** Blob shadow radius at scale 1. */
  readonly shadow: number;
  /** Instances to allocate per mesh are min(pool cap, maxInstances). */
  readonly maxInstances: number;
  /** Visual-only scale on the model (crowd units read better slightly larger than their sim radius). */
  readonly scale?: number;
}

// Palette.
const BLUE = 0x2f7bff;
const BLUE_D = 0x1b47c9;
const BLUE_L = 0xcfe0ff;
const CYAN = 0x35d4ff;
const RED = 0xe5383b;
const RED_D = 0x8f1a1d;
const ORANGE = 0xf59e0b;
const STEEL = 0xd5dbe5;
const DARK = 0x1a1d29;
const GOLD = 0xffcc33;
const MAGENTA = 0xff3fa4;
const PURPLE = 0x6d28d9;
const EYE = 0xfff1a8;
const OLIVE = 0x8fb83f;
const OLIVE_D = 0x5d7d26;
const WOOD = 0x7a4a24;
const VOID = 0x4a1d63;
const VIOLET = 0x8b2fd6;

const soldier: Part[] = [
  { shape: { s: 'capsule', r: 0.19, len: 0.22 }, color: BLUE, pos: [0, 0.4, 0] },
  { shape: { s: 'sphere', r: 0.17 }, color: BLUE_L, pos: [0, 0.78, 0] },
  { shape: { s: 'box', w: 0.22, h: 0.22, d: 0.12 }, color: BLUE_D, pos: [0, 0.48, 0.17] },
];

const runner: Part[] = [
  { shape: { s: 'capsule', r: 0.15, len: 0.24 }, color: CYAN, pos: [0, 0.38, 0], rot: [-0.35, 0, 0] },
  { shape: { s: 'sphere', r: 0.14 }, color: BLUE_L, pos: [0, 0.72, -0.1] },
  { shape: { s: 'cone', r: 0.09, h: 0.32, seg: 4 }, color: BLUE, pos: [0, 0.45, 0.2], rot: [Math.PI / 2 + 0.3, 0, 0] },
];

const brute: Part[] = [
  { shape: { s: 'box', w: 1.15, h: 1.0, d: 0.8 }, color: BLUE_D, pos: [0, 0.95, 0] },
  { shape: { s: 'box', w: 0.8, h: 0.5, d: 0.6 }, color: BLUE, pos: [0, 0.35, 0] },
  { shape: { s: 'sphere', r: 0.32, detail: 1 }, color: BLUE_L, pos: [0, 1.65, -0.1] },
  { shape: { s: 'sphere', r: 0.34, detail: 0 }, color: STEEL, pos: [-0.75, 0.8, -0.2] },
  { shape: { s: 'sphere', r: 0.34, detail: 0 }, color: STEEL, pos: [0.75, 0.8, -0.2] },
  { shape: { s: 'box', w: 1.22, h: 0.16, d: 0.86 }, color: GOLD, pos: [0, 0.55, 0] },
  { shape: { s: 'box', w: 0.5, h: 0.08, d: 0.82 }, color: BLUE_L, pos: [0, 1.47, 0] },
  { shape: { s: 'cone', r: 0.12, h: 0.35, seg: 5 }, color: GOLD, pos: [-0.25, 1.95, -0.1] },
  { shape: { s: 'cone', r: 0.12, h: 0.35, seg: 5 }, color: GOLD, pos: [0.25, 1.95, -0.1] },
];

const grunt: Part[] = [
  { shape: { s: 'capsule', r: 0.2, len: 0.22 }, color: RED, pos: [0, 0.4, 0] },
  { shape: { s: 'sphere', r: 0.18 }, color: RED_D, pos: [0, 0.8, 0] },
  { shape: { s: 'cone', r: 0.06, h: 0.2, seg: 4 }, color: STEEL, pos: [-0.12, 0.98, 0], rot: [0, 0, 0.5] },
  { shape: { s: 'cone', r: 0.06, h: 0.2, seg: 4 }, color: STEEL, pos: [0.12, 0.98, 0], rot: [0, 0, -0.5] },
];

const shield: Part[] = [
  { shape: { s: 'capsule', r: 0.24, len: 0.28 }, color: RED_D, pos: [0, 0.45, 0] },
  { shape: { s: 'sphere', r: 0.2 }, color: DARK, pos: [0, 0.9, 0] },
  { shape: { s: 'box', w: 0.9, h: 0.8, d: 0.1 }, color: ORANGE, pos: [0, 0.48, 0.32] },
  { shape: { s: 'sphere', r: 0.1, detail: 0 }, color: STEEL, pos: [0, 0.48, 0.43] },
];

const swarm: Part[] = [
  { shape: { s: 'sphere', r: 0.2, detail: 0 }, color: MAGENTA, pos: [0, 0.22, 0], scale: [1, 0.65, 1.25] },
  { shape: { s: 'sphere', r: 0.11, detail: 0 }, color: PURPLE, pos: [0, 0.28, 0.2] },
  { shape: { s: 'box', w: 0.62, h: 0.02, d: 0.16 }, color: 0xffc2e5, pos: [0, 0.36, -0.04], rot: [0, 0.4, 0] },
  { shape: { s: 'box', w: 0.62, h: 0.02, d: 0.16 }, color: 0xffc2e5, pos: [0, 0.37, -0.04], rot: [0, -0.4, 0] },
];

const boss: Part[] = [
  { shape: { s: 'sphere', r: 1.5, detail: 1 }, color: RED_D, pos: [0, 2.0, 0], scale: [1.1, 1, 0.9] },
  { shape: { s: 'box', w: 1.6, h: 1.2, d: 1.2 }, color: DARK, pos: [0, 0.6, 0] },
  { shape: { s: 'sphere', r: 0.75, detail: 1 }, color: DARK, pos: [-1.55, 2.5, 0] },
  { shape: { s: 'sphere', r: 0.75, detail: 1 }, color: DARK, pos: [1.55, 2.5, 0] },
  { shape: { s: 'sphere', r: 0.6, detail: 0 }, color: STEEL, pos: [-1.8, 1.2, 0.3] },
  { shape: { s: 'sphere', r: 0.6, detail: 0 }, color: STEEL, pos: [1.8, 1.2, 0.3] },
  { shape: { s: 'sphere', r: 0.7, detail: 1 }, color: RED, pos: [0, 3.55, 0.25] },
  { shape: { s: 'cone', r: 0.22, h: 0.9, seg: 5 }, color: STEEL, pos: [-0.55, 4.25, 0.1], rot: [0, 0, 0.45] },
  { shape: { s: 'cone', r: 0.22, h: 0.9, seg: 5 }, color: STEEL, pos: [0.55, 4.25, 0.1], rot: [0, 0, -0.45] },
  { shape: { s: 'cone', r: 0.25, h: 0.7, seg: 4 }, color: GOLD, pos: [0, 3.0, 1.3], rot: [Math.PI / 2, 0, 0] },
  { shape: { s: 'box', w: 0.5, h: 0.12, d: 0.1 }, color: EYE, pos: [0, 3.6, 0.92] },
  { shape: { s: 'box', w: 2.6, h: 0.3, d: 1.6 }, color: GOLD, pos: [0, 2.9, 0] },
];

const ogre: Part[] = [
  { shape: { s: 'sphere', r: 0.62, detail: 1 }, color: OLIVE, pos: [0, 0.95, 0], scale: [1.1, 1, 0.9] },
  { shape: { s: 'box', w: 0.7, h: 0.45, d: 0.55 }, color: OLIVE_D, pos: [0, 0.25, 0] },
  { shape: { s: 'sphere', r: 0.3, detail: 0 }, color: OLIVE_D, pos: [0, 1.65, 0.1] },
  { shape: { s: 'box', w: 0.32, h: 0.06, d: 0.06 }, color: EYE, pos: [0, 1.7, 0.38] },
  { shape: { s: 'cyl', rt: 0.16, rb: 0.08, h: 0.95, seg: 5 }, color: WOOD, pos: [0.72, 1.05, 0.25], rot: [0.5, 0, -0.35] },
  { shape: { s: 'box', w: 1.25, h: 0.14, d: 0.95 }, color: RED_D, pos: [0, 0.62, 0] },
];

const tyrant: Part[] = [
  { shape: { s: 'sphere', r: 1.75, detail: 1 }, color: VOID, pos: [0, 2.3, 0], scale: [1.1, 1, 0.9] },
  { shape: { s: 'box', w: 1.9, h: 1.4, d: 1.4 }, color: DARK, pos: [0, 0.7, 0] },
  { shape: { s: 'sphere', r: 0.9, detail: 1 }, color: VIOLET, pos: [-1.85, 2.9, 0] },
  { shape: { s: 'sphere', r: 0.9, detail: 1 }, color: VIOLET, pos: [1.85, 2.9, 0] },
  { shape: { s: 'cone', r: 0.35, h: 1.1, seg: 5 }, color: STEEL, pos: [-1.95, 3.9, 0], rot: [0, 0, 0.2] },
  { shape: { s: 'cone', r: 0.35, h: 1.1, seg: 5 }, color: STEEL, pos: [1.95, 3.9, 0], rot: [0, 0, -0.2] },
  { shape: { s: 'sphere', r: 0.8, detail: 1 }, color: VIOLET, pos: [0, 4.1, 0.3] },
  { shape: { s: 'cyl', rt: 0.75, rb: 0.6, h: 0.45, seg: 7 }, color: GOLD, pos: [0, 4.95, 0.25] },
  { shape: { s: 'box', w: 0.62, h: 0.14, d: 0.1 }, color: MAGENTA, pos: [0, 4.15, 1.08] },
  { shape: { s: 'box', w: 3.1, h: 0.34, d: 1.8 }, color: GOLD, pos: [0, 3.3, 0] },
];

export const UNIT_VISUALS: readonly VisualDef[] = (() => {
  const v: VisualDef[] = new Array(NUM_UNIT_TYPES);
  v[T_SOLDIER] = { source: { kind: 'parts', parts: soldier }, bob: 0.07, shadow: 0.4, maxInstances: 1e9, scale: 1.3 };
  v[T_BRUTE] = { source: { kind: 'parts', parts: brute }, bob: 0.05, shadow: 0.95, maxInstances: 64 };
  v[T_RUNNER] = { source: { kind: 'parts', parts: runner }, bob: 0.04, shadow: 0.34, maxInstances: 1e9, scale: 1.3 };
  v[T_GRUNT] = { source: { kind: 'parts', parts: grunt }, bob: 0.07, shadow: 0.42, maxInstances: 1e9, scale: 1.3 };
  v[T_SHIELD] = { source: { kind: 'parts', parts: shield }, bob: 0.03, shadow: 0.6, maxInstances: 1e9, scale: 1.2 };
  v[T_SWARM] = { source: { kind: 'parts', parts: swarm }, bob: 0.12, shadow: 0.34, maxInstances: 1e9, scale: 1.3 };
  v[T_BOSS] = { source: { kind: 'parts', parts: boss }, bob: 0.04, shadow: 2.4, maxInstances: 8 };
  v[T_OGRE] = { source: { kind: 'parts', parts: ogre }, bob: 0.05, shadow: 0.8, maxInstances: 1e9, scale: 1.1 };
  v[T_TYRANT] = { source: { kind: 'parts', parts: tyrant }, bob: 0.04, shadow: 2.8, maxInstances: 8 };
  return v;
})();

export function buildGeometry(def: VisualDef): THREE.BufferGeometry {
  const src = def.source;
  if (src.kind === 'gltf') throw new Error(`glTF visuals need to be preloaded (${src.url})`);
  const g = buildParts(src.parts);
  if (def.scale) g.scale(def.scale, def.scale, def.scale);
  return g;
}

/** Merges coloured primitives into one indexed geometry with position, normal and color attributes. */
export function buildParts(parts: readonly Part[]): THREE.BufferGeometry {
  const color = new THREE.Color();
  const pieces = parts.map((p) => {
    let g = shapeGeometry(p.shape);
    if (p.scale) g.scale(p.scale[0], p.scale[1], p.scale[2]);
    if (p.rot) g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(p.rot[0], p.rot[1], p.rot[2])));
    if (p.pos) g.translate(p.pos[0], p.pos[1], p.pos[2]);
    g.deleteAttribute('uv');
    color.setHex(p.color).convertSRGBToLinear();
    const n = g.getAttribute('position').count;
    const cols = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      cols[i * 3] = color.r;
      cols[i * 3 + 1] = color.g;
      cols[i * 3 + 2] = color.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    // Indexed so the GPU's post-transform cache can reuse shared vertices (thousands of instances per frame).
    return g.index ? g : mergeVertices(g);
  });
  const merged = mergeGeometries(pieces, false);
  if (!merged) throw new Error('part merge failed');
  for (const p of pieces) p.dispose();
  return merged;
}

function shapeGeometry(sh: Shape): THREE.BufferGeometry {
  switch (sh.s) {
    case 'capsule':
      return new THREE.CapsuleGeometry(sh.r, sh.len, 1, 6);
    case 'sphere':
      return new THREE.IcosahedronGeometry(sh.r, sh.detail ?? 0);
    case 'box':
      return new THREE.BoxGeometry(sh.w, sh.h, sh.d);
    case 'cone':
      return new THREE.ConeGeometry(sh.r, sh.h, sh.seg ?? 6);
    case 'cyl':
      return new THREE.CylinderGeometry(sh.rt, sh.rb, sh.h, sh.seg ?? 8);
  }
}
