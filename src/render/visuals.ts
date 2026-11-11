import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { NUM_UNIT_TYPES, T_BOSS, T_BRUTE, T_GRUNT, T_OGRE, T_RUNNER, T_SHIELD, T_SOLDIER, T_SWARM, T_TYRANT } from '../sim/unitTypes';

/**
 * Asset-swap layer. The sim only knows type ids; everything about how a type looks lives here.
 *
 * Models are built from primitive "parts" with baked vertex colours and merged into one BufferGeometry, so each
 * unit type is still a single InstancedMesh draw call. To swap in a glTF model (Kenney / Quaternius, CC0), set
 * `source` to `{ kind: 'gltf', url }`, load it before the level starts and merge its meshes the same way; sim code
 * is untouched. Models stand on y = 0 and face -z (player, away from the camera) or +z (enemy, toward it).
 *
 * Walk cycle: parts tagged `anim` 1 or 2 swing about the x axis at their `pivot` height in opposite phase (legs),
 * driven per instance in the vertex shader (unitsRenderer.ts). Untagged parts only bob and sway.
 */
export type Shape =
  | { s: 'capsule'; r: number; len: number }
  | { s: 'sphere'; r: number; detail?: number }
  | { s: 'box'; w: number; h: number; d: number }
  | { s: 'cone'; r: number; h: number; seg?: number }
  | { s: 'cyl'; rt: number; rb: number; h: number; seg?: number; open?: boolean };

export interface Part {
  shape: Shape;
  color: number;
  pos?: [number, number, number];
  rot?: [number, number, number];
  scale?: [number, number, number];
  /** Walk-cycle group: 1 and 2 swing in opposite phase. */
  anim?: 1 | 2;
  /** Height of the swing axis (hip) for animated parts. */
  pivot?: number;
}

export type VisualSource = { kind: 'parts'; parts: Part[] } | { kind: 'gltf'; url: string; mesh?: string };

export interface VisualDef {
  readonly source: VisualSource;
  /** Run-bob amplitude in world units. */
  readonly bob: number;
  /** Leg swing amplitude in radians. */
  readonly swing: number;
  /** Side-to-side body sway in radians. */
  readonly sway: number;
  /** Walk cycles per second. */
  readonly stride: number;
  /** Blob shadow radius at scale 1. */
  readonly shadow: number;
  /** Instances to allocate per mesh are min(pool cap, maxInstances). */
  readonly maxInstances: number;
  /** Visual-only scale on the model (crowd units read better slightly larger than their sim radius). */
  readonly scale?: number;
}

// ---- palette ----

// Knights.
const STEEL = 0xd3dbe6;
const STEEL_D = 0x7f8a9c;
const BLUE = 0x2f6bff;
const BLUE_D = 0x1c3fa8;
const SKY = 0x3fb6ff;
const GOLD = 0xffc933;
const WHITE = 0xf3f6ff;
const WOOD = 0x8a5a2b;
// Orcs and friends.
const SKIN = 0x6fb33c;
const SKIN_D = 0x4b8a2a;
const GOB = 0x9fd34e;
const LEATHER = 0x5b3a22;
const RED = 0xd63a2f;
const RED_D = 0x8f1f1a;
const IRON = 0x585e6b;
const BONE = 0xf1ead6;
const EYE = 0xffd23f;
const TROLL = 0x8399ad;
const TROLL_D = 0x5d6e80;
const KING = 0x86739f;
const KING_D = 0x5c4d73;
const FUR = 0x6b4a2e;
const GLOW = 0xff5ad6;

const box = (w: number, h: number, d: number): Shape => ({ s: 'box', w, h, d });

// ---- player side (face -z) ----

/** Footman: steel kit, blue cape on the back (what the camera sees), white crest, upright spear. */
const knight: Part[] = [
  { shape: box(0.1, 0.24, 0.12), color: STEEL_D, pos: [-0.08, 0.12, 0], anim: 1, pivot: 0.24 },
  { shape: box(0.1, 0.24, 0.12), color: STEEL_D, pos: [0.08, 0.12, 0], anim: 2, pivot: 0.24 },
  { shape: box(0.3, 0.28, 0.2), color: STEEL, pos: [0, 0.38, 0] },
  { shape: box(0.3, 0.32, 0.03), color: BLUE, pos: [0, 0.36, 0.115] },
  { shape: { s: 'cyl', rt: 0.13, rb: 0.15, h: 0.2, seg: 6 }, color: STEEL, pos: [0, 0.62, 0] },
  { shape: box(0.04, 0.1, 0.24), color: WHITE, pos: [0, 0.77, 0.02] },
  { shape: box(0.05, 0.3, 0.24), color: BLUE, pos: [-0.2, 0.4, -0.02] },
  { shape: { s: 'cyl', rt: 0.016, rb: 0.016, h: 0.95, seg: 3, open: true }, color: WOOD, pos: [0.2, 0.55, 0] },
  { shape: { s: 'cone', r: 0.045, h: 0.14, seg: 4 }, color: STEEL, pos: [0.2, 1.09, 0] },
  { shape: box(0.08, 0.22, 0.08), color: STEEL, pos: [0.19, 0.42, 0] },
];

/** Scout (Runner Gun): hooded, light tunic, a scarf streaming behind, short blade. */
const scout: Part[] = [
  { shape: box(0.08, 0.24, 0.1), color: BLUE_D, pos: [-0.07, 0.12, 0], anim: 1, pivot: 0.24 },
  { shape: box(0.08, 0.24, 0.1), color: BLUE_D, pos: [0.07, 0.12, 0], anim: 2, pivot: 0.24 },
  { shape: box(0.24, 0.26, 0.17), color: SKY, pos: [0, 0.37, -0.02], rot: [-0.25, 0, 0] },
  { shape: { s: 'cone', r: 0.15, h: 0.3, seg: 5 }, color: BLUE_D, pos: [0, 0.66, -0.04] },
  { shape: box(0.18, 0.03, 0.3), color: BLUE, pos: [0, 0.54, 0.18], rot: [-0.45, 0, 0] },
  { shape: box(0.03, 0.03, 0.28), color: STEEL, pos: [0.16, 0.38, -0.12], rot: [0.9, 0, 0] },
];

/** The Brute: a giant paladin. Plate, blue tabard and cape, gold crest, a warhammer held upright. */
const paladin: Part[] = [
  { shape: box(0.34, 0.56, 0.4), color: STEEL_D, pos: [-0.26, 0.28, 0], anim: 1, pivot: 0.56 },
  { shape: box(0.34, 0.56, 0.4), color: STEEL_D, pos: [0.26, 0.28, 0], anim: 2, pivot: 0.56 },
  { shape: box(1.0, 0.8, 0.62), color: STEEL, pos: [0, 0.96, 0] },
  { shape: box(0.7, 0.74, 0.66), color: BLUE, pos: [0, 0.9, 0] },
  { shape: box(1.04, 0.12, 0.68), color: GOLD, pos: [0, 0.6, 0] },
  { shape: { s: 'sphere', r: 0.32, detail: 0 }, color: STEEL, pos: [-0.62, 1.32, 0], scale: [1, 0.8, 1] },
  { shape: { s: 'sphere', r: 0.32, detail: 0 }, color: STEEL, pos: [0.62, 1.32, 0], scale: [1, 0.8, 1] },
  { shape: box(0.24, 0.6, 0.26), color: STEEL, pos: [-0.64, 0.92, 0] },
  { shape: box(0.24, 0.6, 0.26), color: STEEL, pos: [0.64, 0.92, 0] },
  { shape: { s: 'cyl', rt: 0.26, rb: 0.31, h: 0.44, seg: 8 }, color: STEEL, pos: [0, 1.6, 0] },
  { shape: box(0.08, 0.26, 0.56), color: GOLD, pos: [0, 1.92, 0.02] },
  { shape: box(0.92, 1.05, 0.05), color: BLUE_D, pos: [0, 1.0, 0.36] },
  { shape: { s: 'cyl', rt: 0.05, rb: 0.05, h: 1.5, seg: 4 }, color: WOOD, pos: [0.82, 1.0, -0.1] },
  { shape: box(0.55, 0.32, 0.32), color: STEEL_D, pos: [0.82, 1.8, -0.1] },
  { shape: box(0.58, 0.08, 0.34), color: GOLD, pos: [0.82, 1.8, -0.1] },
];

// ---- enemy side (face +z, toward the camera) ----

/** Orc grunt: green, tusked, pointy ears, red waist cloth, a hand axe. */
const orc: Part[] = [
  { shape: box(0.11, 0.22, 0.13), color: LEATHER, pos: [-0.09, 0.11, 0], anim: 1, pivot: 0.22 },
  { shape: box(0.11, 0.22, 0.13), color: LEATHER, pos: [0.09, 0.11, 0], anim: 2, pivot: 0.22 },
  { shape: box(0.34, 0.28, 0.24), color: SKIN, pos: [0, 0.37, 0] },
  { shape: box(0.36, 0.1, 0.26), color: RED, pos: [0, 0.27, 0] },
  { shape: { s: 'sphere', r: 0.16 }, color: SKIN, pos: [0, 0.62, 0.04], scale: [1.15, 0.95, 1] },
  { shape: box(0.15, 0.035, 0.02), color: EYE, pos: [0, 0.66, 0.19] },
  { shape: { s: 'cone', r: 0.025, h: 0.08, seg: 3 }, color: BONE, pos: [-0.06, 0.59, 0.18] },
  { shape: { s: 'cone', r: 0.025, h: 0.08, seg: 3 }, color: BONE, pos: [0.06, 0.59, 0.18] },
  { shape: { s: 'cone', r: 0.04, h: 0.13, seg: 3 }, color: SKIN, pos: [-0.19, 0.66, 0], rot: [0, 0, 1.3] },
  { shape: { s: 'cone', r: 0.04, h: 0.13, seg: 3 }, color: SKIN, pos: [0.19, 0.66, 0], rot: [0, 0, -1.3] },
  { shape: { s: 'cyl', rt: 0.015, rb: 0.015, h: 0.5, seg: 3, open: true }, color: WOOD, pos: [0.23, 0.42, 0.06] },
  { shape: box(0.03, 0.14, 0.16), color: IRON, pos: [0.23, 0.62, 0.13] },
];

/** Orc shieldbearer (3 HP): bigger, iron helmet, a big round wooden shield with a red stripe held in front. */
const orcShield: Part[] = [
  { shape: box(0.13, 0.24, 0.15), color: LEATHER, pos: [-0.1, 0.12, 0], anim: 1, pivot: 0.24 },
  { shape: box(0.13, 0.24, 0.15), color: LEATHER, pos: [0.1, 0.12, 0], anim: 2, pivot: 0.24 },
  { shape: box(0.4, 0.32, 0.28), color: SKIN_D, pos: [0, 0.42, 0] },
  { shape: { s: 'sphere', r: 0.17 }, color: SKIN_D, pos: [0, 0.7, 0.02] },
  { shape: { s: 'cone', r: 0.2, h: 0.2, seg: 5 }, color: IRON, pos: [0, 0.84, 0.02] },
  { shape: box(0.14, 0.035, 0.02), color: EYE, pos: [0, 0.72, 0.18] },
  { shape: { s: 'cyl', rt: 0.38, rb: 0.38, h: 0.06, seg: 8 }, color: WOOD, pos: [0, 0.46, 0.3], rot: [Math.PI / 2, 0, 0] },
  { shape: box(0.66, 0.1, 0.03), color: RED, pos: [0, 0.46, 0.345] },
  { shape: { s: 'sphere', r: 0.08 }, color: IRON, pos: [0, 0.46, 0.36] },
];

/** Goblin (swarm): small, pale green, huge ears, a dagger. */
const goblin: Part[] = [
  { shape: box(0.07, 0.14, 0.08), color: LEATHER, pos: [-0.06, 0.07, 0], anim: 1, pivot: 0.14 },
  { shape: box(0.07, 0.14, 0.08), color: LEATHER, pos: [0.06, 0.07, 0], anim: 2, pivot: 0.14 },
  { shape: box(0.2, 0.18, 0.16), color: RED_D, pos: [0, 0.23, 0] },
  { shape: { s: 'sphere', r: 0.13 }, color: GOB, pos: [0, 0.41, 0.03] },
  { shape: { s: 'cone', r: 0.05, h: 0.2, seg: 3 }, color: GOB, pos: [-0.17, 0.45, 0], rot: [0, 0, 1.4] },
  { shape: { s: 'cone', r: 0.05, h: 0.2, seg: 3 }, color: GOB, pos: [0.17, 0.45, 0], rot: [0, 0, -1.4] },
  { shape: box(0.1, 0.025, 0.02), color: EYE, pos: [0, 0.43, 0.15] },
  { shape: box(0.02, 0.02, 0.18), color: STEEL, pos: [0.13, 0.25, 0.12], rot: [-0.5, 0, 0] },
];

/** Troll (Ogre, 12 HP): grey-blue, hunched, long arms, a tapered club. */
const troll: Part[] = [
  { shape: box(0.22, 0.4, 0.26), color: TROLL_D, pos: [-0.2, 0.2, 0], anim: 1, pivot: 0.4 },
  { shape: box(0.22, 0.4, 0.26), color: TROLL_D, pos: [0.2, 0.2, 0], anim: 2, pivot: 0.4 },
  { shape: box(0.62, 0.2, 0.46), color: LEATHER, pos: [0, 0.45, 0] },
  { shape: { s: 'sphere', r: 0.5 }, color: TROLL, pos: [0, 0.85, 0], scale: [1.15, 0.9, 0.85] },
  { shape: { s: 'sphere', r: 0.22 }, color: TROLL, pos: [0, 1.22, 0.28] },
  { shape: box(0.2, 0.04, 0.03), color: EYE, pos: [0, 1.27, 0.48] },
  { shape: { s: 'cone', r: 0.05, h: 0.15, seg: 3 }, color: BONE, pos: [-0.1, 1.14, 0.45] },
  { shape: { s: 'cone', r: 0.05, h: 0.15, seg: 3 }, color: BONE, pos: [0.1, 1.14, 0.45] },
  { shape: box(0.18, 0.6, 0.2), color: TROLL, pos: [-0.62, 0.72, 0.1] },
  { shape: box(0.18, 0.6, 0.2), color: TROLL, pos: [0.62, 0.72, 0.1] },
  { shape: { s: 'cyl', rt: 0.15, rb: 0.06, h: 1.0, seg: 5 }, color: WOOD, pos: [0.66, 0.75, 0.38], rot: [0.6, 0, 0] },
];

/** The Warden: an orc warlord. Iron chest plate, spiked pauldrons, horned helm, red cape, a great axe. */
const warlord: Part[] = [
  { shape: box(0.6, 1.1, 0.7), color: LEATHER, pos: [-0.55, 0.55, 0], anim: 1, pivot: 1.1 },
  { shape: box(0.6, 1.1, 0.7), color: LEATHER, pos: [0.55, 0.55, 0], anim: 2, pivot: 1.1 },
  { shape: box(2.0, 1.5, 1.3), color: SKIN_D, pos: [0, 1.85, 0] },
  { shape: box(1.6, 1.0, 0.2), color: IRON, pos: [0, 1.95, 0.7] },
  { shape: box(2.1, 0.32, 1.4), color: RED_D, pos: [0, 1.15, 0] },
  { shape: { s: 'sphere', r: 0.22 }, color: BONE, pos: [0, 1.15, 0.75] },
  { shape: { s: 'sphere', r: 0.55 }, color: IRON, pos: [-1.15, 2.55, 0] },
  { shape: { s: 'sphere', r: 0.55 }, color: IRON, pos: [1.15, 2.55, 0] },
  { shape: { s: 'cone', r: 0.16, h: 0.6, seg: 4 }, color: BONE, pos: [-1.15, 3.1, 0] },
  { shape: { s: 'cone', r: 0.16, h: 0.6, seg: 4 }, color: BONE, pos: [1.15, 3.1, 0] },
  { shape: box(0.5, 1.2, 0.55), color: SKIN_D, pos: [-1.3, 1.75, 0.15] },
  { shape: box(0.5, 1.2, 0.55), color: SKIN_D, pos: [1.3, 1.75, 0.15] },
  { shape: { s: 'sphere', r: 0.55, detail: 1 }, color: SKIN_D, pos: [0, 3.0, 0.25] },
  { shape: { s: 'cyl', rt: 0.5, rb: 0.6, h: 0.5, seg: 8 }, color: IRON, pos: [0, 3.38, 0.2] },
  { shape: { s: 'cone', r: 0.15, h: 0.85, seg: 5 }, color: BONE, pos: [-0.62, 3.75, 0.2], rot: [0, 0, 0.6] },
  { shape: { s: 'cone', r: 0.15, h: 0.85, seg: 5 }, color: BONE, pos: [0.62, 3.75, 0.2], rot: [0, 0, -0.6] },
  { shape: box(0.55, 0.09, 0.05), color: EYE, pos: [0, 3.05, 0.79] },
  { shape: { s: 'cone', r: 0.07, h: 0.25, seg: 3 }, color: BONE, pos: [-0.2, 2.8, 0.74] },
  { shape: { s: 'cone', r: 0.07, h: 0.25, seg: 3 }, color: BONE, pos: [0.2, 2.8, 0.74] },
  { shape: box(2.0, 2.3, 0.1), color: RED, pos: [0, 1.95, -0.72] },
  { shape: { s: 'cyl', rt: 0.08, rb: 0.08, h: 2.9, seg: 5 }, color: WOOD, pos: [1.6, 1.75, 0.45] },
  { shape: box(0.12, 1.0, 1.15), color: IRON, pos: [1.6, 3.0, 0.45] },
];

/** The Tyrant: a troll king. Huge, purple-grey, fur mantle, gold crown, glowing eyes, spiked mace. */
const trollKing: Part[] = [
  { shape: box(0.75, 1.2, 0.85), color: KING_D, pos: [-0.7, 0.6, 0], anim: 1, pivot: 1.2 },
  { shape: box(0.75, 1.2, 0.85), color: KING_D, pos: [0.7, 0.6, 0], anim: 2, pivot: 1.2 },
  { shape: { s: 'sphere', r: 1.6, detail: 1 }, color: KING, pos: [0, 2.45, 0], scale: [1.1, 0.95, 0.9] },
  { shape: box(2.3, 0.4, 1.6), color: LEATHER, pos: [0, 1.3, 0] },
  { shape: { s: 'sphere', r: 1.1 }, color: FUR, pos: [0, 3.45, -0.1], scale: [1.8, 0.5, 1.2] },
  { shape: { s: 'sphere', r: 0.7, detail: 1 }, color: KING, pos: [0, 3.95, 0.5] },
  { shape: { s: 'cyl', rt: 0.56, rb: 0.5, h: 0.4, seg: 7 }, color: GOLD, pos: [0, 4.6, 0.45] },
  { shape: { s: 'cone', r: 0.12, h: 0.4, seg: 3 }, color: GOLD, pos: [-0.35, 4.98, 0.6] },
  { shape: { s: 'cone', r: 0.12, h: 0.45, seg: 3 }, color: GOLD, pos: [0, 5.0, 0.85] },
  { shape: { s: 'cone', r: 0.12, h: 0.4, seg: 3 }, color: GOLD, pos: [0.35, 4.98, 0.6] },
  { shape: box(0.62, 0.11, 0.05), color: GLOW, pos: [0, 4.0, 1.17] },
  { shape: { s: 'cone', r: 0.1, h: 0.35, seg: 3 }, color: BONE, pos: [-0.25, 3.65, 1.08] },
  { shape: { s: 'cone', r: 0.1, h: 0.35, seg: 3 }, color: BONE, pos: [0.25, 3.65, 1.08] },
  { shape: box(0.6, 1.7, 0.65), color: KING, pos: [-1.85, 2.2, 0.2] },
  { shape: box(0.6, 1.7, 0.65), color: KING, pos: [1.85, 2.2, 0.2] },
  { shape: { s: 'cyl', rt: 0.1, rb: 0.1, h: 2.2, seg: 5 }, color: WOOD, pos: [2.15, 1.75, 0.9], rot: [0.4, 0, 0] },
  { shape: { s: 'sphere', r: 0.48 }, color: IRON, pos: [2.15, 2.75, 1.35] },
  { shape: { s: 'cone', r: 0.12, h: 0.4, seg: 4 }, color: BONE, pos: [2.15, 3.3, 1.35] },
  { shape: { s: 'cone', r: 0.12, h: 0.4, seg: 4 }, color: BONE, pos: [2.65, 2.75, 1.35], rot: [0, 0, -Math.PI / 2] },
  { shape: { s: 'cone', r: 0.12, h: 0.4, seg: 4 }, color: BONE, pos: [2.15, 2.75, 1.85], rot: [Math.PI / 2, 0, 0] },
];

export const UNIT_VISUALS: readonly VisualDef[] = (() => {
  const v: VisualDef[] = new Array(NUM_UNIT_TYPES);
  const crowd = { maxInstances: 1e9, scale: 1.3 };
  v[T_SOLDIER] = { source: { kind: 'parts', parts: knight }, bob: 0.06, swing: 0.6, sway: 0.06, stride: 2.1, shadow: 0.4, ...crowd };
  v[T_BRUTE] = { source: { kind: 'parts', parts: paladin }, bob: 0.06, swing: 0.4, sway: 0.05, stride: 1.2, shadow: 0.95, maxInstances: 64 };
  v[T_RUNNER] = { source: { kind: 'parts', parts: scout }, bob: 0.05, swing: 0.8, sway: 0.04, stride: 3.2, shadow: 0.34, ...crowd };
  v[T_GRUNT] = { source: { kind: 'parts', parts: orc }, bob: 0.06, swing: 0.6, sway: 0.08, stride: 1.9, shadow: 0.42, ...crowd };
  v[T_SHIELD] = { source: { kind: 'parts', parts: orcShield }, bob: 0.03, swing: 0.4, sway: 0.05, stride: 1.4, shadow: 0.6, maxInstances: 1e9, scale: 1.2 };
  v[T_SWARM] = { source: { kind: 'parts', parts: goblin }, bob: 0.1, swing: 0.9, sway: 0.1, stride: 3.4, shadow: 0.34, ...crowd };
  v[T_BOSS] = { source: { kind: 'parts', parts: warlord }, bob: 0.05, swing: 0.3, sway: 0.04, stride: 0.6, shadow: 2.4, maxInstances: 8 };
  v[T_OGRE] = { source: { kind: 'parts', parts: troll }, bob: 0.05, swing: 0.45, sway: 0.07, stride: 1.0, shadow: 0.8, maxInstances: 1e9, scale: 1.1 };
  v[T_TYRANT] = { source: { kind: 'parts', parts: trollKing }, bob: 0.05, swing: 0.3, sway: 0.04, stride: 0.55, shadow: 2.8, maxInstances: 8 };
  return v;
})();

export function buildGeometry(def: VisualDef): THREE.BufferGeometry {
  const src = def.source;
  if (src.kind === 'gltf') throw new Error(`glTF visuals need to be preloaded (${src.url})`);
  return buildParts(src.parts, def.scale ?? 1);
}

/**
 * Merges coloured primitives into one indexed geometry with position, normal, color and `aAnim` (walk group,
 * pivot height) attributes. `scale` scales the whole model, pivots included.
 */
export function buildParts(parts: readonly Part[], scale = 1): THREE.BufferGeometry {
  const color = new THREE.Color();
  const pieces = parts.map((p) => {
    let g = shapeGeometry(p.shape);
    if (p.scale) g.scale(p.scale[0], p.scale[1], p.scale[2]);
    if (p.rot) g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(p.rot[0], p.rot[1], p.rot[2])));
    if (p.pos) g.translate(p.pos[0], p.pos[1], p.pos[2]);
    if (scale !== 1) g.scale(scale, scale, scale);
    g.deleteAttribute('uv');
    color.setHex(p.color).convertSRGBToLinear();
    const n = g.getAttribute('position').count;
    const cols = new Float32Array(n * 3);
    const anim = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      cols[i * 3] = color.r;
      cols[i * 3 + 1] = color.g;
      cols[i * 3 + 2] = color.b;
      anim[i * 2] = p.anim ?? 0;
      anim[i * 2 + 1] = (p.pivot ?? 0) * scale;
    }
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    g.setAttribute('aAnim', new THREE.BufferAttribute(anim, 2));
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
      return new THREE.CylinderGeometry(sh.rt, sh.rb, sh.h, sh.seg ?? 8, 1, sh.open ?? false);
  }
}
