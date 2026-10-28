import * as THREE from 'three';
import { LANE_HALF, LANE_LENGTH, LANE_WIDTH } from '../sim/config';
import { Rng } from '../sim/rng';
import { buildParts, type Part } from './visuals';

export const SKY_HORIZON = 0xd6efff;

/**
 * Static scenery: sky gradient, lane with team zones, striped curbs, grass and instanced trees, rocks and hills.
 * Everything here is built once; the instanced props are a handful of draw calls in total.
 */
export function buildEnvironment(scene: THREE.Scene): void {
  // The camera looks down at the ground, which covers the whole view: a textured sky would be a wasted
  // full-screen pass (measured ~1 ms GPU at DPR 2 on an integrated GPU). Clear to the horizon colour instead.
  scene.background = new THREE.Color(SKY_HORIZON);
  scene.fog = new THREE.Fog(SKY_HORIZON, 70, 150);

  const len = LANE_LENGTH + 12;
  const zMid = -(len / 2) + 5;

  // Lane surface: paving tiles.
  const laneTex = canvasTexture(256, 256, (g) => {
    g.fillStyle = '#efe8d8';
    g.fillRect(0, 0, 256, 256);
    const rng = new Rng(7);
    for (let ty = 0; ty < 4; ty++) {
      for (let tx = 0; tx < 4; tx++) {
        const shade = 226 + rng.int(14);
        g.fillStyle = `rgb(${shade + 6},${shade},${shade - 14})`;
        g.fillRect(tx * 64 + 2, ty * 64 + 2, 60, 60);
      }
    }
  });
  laneTex.repeat.set(LANE_WIDTH / 4, len / 4);
  const lane = new THREE.Mesh(new THREE.PlaneGeometry(LANE_WIDTH, len), new THREE.MeshLambertMaterial({ map: laneTex }));
  lane.rotation.x = -Math.PI / 2;
  lane.position.set(0, 0, zMid);
  lane.name = 'env:lane';
  scene.add(lane);

  // Team zones: blue glow at the launcher end, red at the base end.
  scene.add(zone(0x2f7bff, 5, 2.5, 0.35));
  scene.add(zone(0xe5383b, 6, -(LANE_LENGTH - 3), 0.28, true));

  // Grass with speckles.
  const grassTex = canvasTexture(128, 128, (g) => {
    g.fillStyle = '#6cc35b';
    g.fillRect(0, 0, 128, 128);
    const rng = new Rng(3);
    for (let i = 0; i < 500; i++) {
      g.fillStyle = rng.next() < 0.5 ? '#5fb54f' : '#7dd06a';
      g.fillRect(rng.int(128), rng.int(128), 2 + rng.int(3), 2 + rng.int(3));
    }
  });
  grassTex.repeat.set(40, 40);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(260, 260), new THREE.MeshLambertMaterial({ map: grassTex }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, -0.03, -LANE_LENGTH / 2);
  ground.name = 'env:ground';
  scene.add(ground);

  buildCurbs(scene, len, zMid);
  buildProps(scene);
}

function zone(color: number, depth: number, z: number, alpha: number, flip = false): THREE.Mesh {
  const tex = canvasTexture(4, 64, (g) => {
    const grad = g.createLinearGradient(0, 0, 0, 64);
    grad.addColorStop(0, 'rgba(255,255,255,0)');
    grad.addColorStop(1, 'rgba(255,255,255,1)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 4, 64);
  });
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(LANE_WIDTH, depth),
    new THREE.MeshBasicMaterial({ color, map: tex, transparent: true, opacity: alpha, depthWrite: false }),
  );
  m.rotation.x = -Math.PI / 2;
  if (flip) m.rotation.z = Math.PI;
  m.position.set(0, 0.01, z);
  m.name = 'env:zone';
  return m;
}

/** Red/white race-track curbs along both edges: one InstancedMesh with per-instance colour. */
function buildCurbs(scene: THREE.Scene, len: number, zMid: number): void {
  const block = 1.2;
  const perSide = Math.ceil(len / block);
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.42, block * 0.98), new THREE.MeshLambertMaterial(), perSide * 2);
  const m = new THREE.Matrix4();
  const red = new THREE.Color(0xe5383b);
  const white = new THREE.Color(0xf8fafc);
  const blue = new THREE.Color(0x2f7bff);
  let k = 0;
  for (const side of [-1, 1]) {
    for (let i = 0; i < perSide; i++) {
      const z = zMid + len / 2 - (i + 0.5) * block;
      m.makeTranslation(side * (LANE_HALF + 0.25), 0.21, z);
      mesh.setMatrixAt(k, m);
      mesh.setColorAt(k, i % 2 === 0 ? white : z > -6 ? blue : red);
      k++;
    }
  }
  mesh.name = 'env:curbs';
  scene.add(mesh);

  // Launcher line.
  const line = new THREE.Mesh(new THREE.BoxGeometry(LANE_WIDTH, 0.04, 0.22), new THREE.MeshBasicMaterial({ color: 0x2f7bff }));
  line.position.set(0, 0.02, 0);
  scene.add(line);
}

const TREE: Part[] = [
  { shape: { s: 'cyl', rt: 0.18, rb: 0.26, h: 1.2, seg: 6 }, color: 0x8b5a2b, pos: [0, 0.6, 0] },
  { shape: { s: 'sphere', r: 1.0, detail: 0 }, color: 0x2f9e44, pos: [0, 1.8, 0] },
  { shape: { s: 'sphere', r: 0.7, detail: 0 }, color: 0x40c057, pos: [0.3, 2.5, 0.2] },
];
const PINE: Part[] = [
  { shape: { s: 'cyl', rt: 0.15, rb: 0.2, h: 0.8, seg: 6 }, color: 0x7c4a1e, pos: [0, 0.4, 0] },
  { shape: { s: 'cone', r: 1.0, h: 1.6, seg: 7 }, color: 0x2b8a3e, pos: [0, 1.5, 0] },
  { shape: { s: 'cone', r: 0.75, h: 1.3, seg: 7 }, color: 0x37b24d, pos: [0, 2.3, 0] },
];
const ROCK: Part[] = [{ shape: { s: 'sphere', r: 0.7, detail: 0 }, color: 0xa9a29a, scale: [1.2, 0.7, 1] }];
const HILL: Part[] = [{ shape: { s: 'sphere', r: 1, detail: 2 }, color: 0x58b04a, scale: [1, 0.45, 1] }];

function buildProps(scene: THREE.Scene): void {
  const rng = new Rng(21);
  const place = (parts: Part[], n: number, minX: number, maxX: number, z0: number, z1: number, s0: number, s1: number): void => {
    const mesh = new THREE.InstancedMesh(buildParts(parts), new THREE.MeshLambertMaterial({ vertexColors: true }), n);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const p = new THREE.Vector3();
    const s = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      const side = rng.next() < 0.5 ? -1 : 1;
      p.set(side * rng.range(minX, maxX), 0, rng.range(z1, z0));
      const k = rng.range(s0, s1);
      s.set(k, k, k);
      q.setFromEuler(e.set(0, rng.range(0, Math.PI * 2), 0));
      mesh.setMatrixAt(i, m.compose(p, q, s));
    }
    mesh.name = 'env:props';
    scene.add(mesh);
  };
  place(TREE, 40, LANE_HALF + 2.2, 34, 14, -95, 0.8, 1.5);
  place(PINE, 40, LANE_HALF + 2.5, 36, 14, -95, 0.9, 1.7);
  place(ROCK, 30, LANE_HALF + 1.2, 26, 12, -80, 0.4, 1.1);
  place(HILL, 10, 18, 60, -60, -120, 10, 22);
}

function canvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

