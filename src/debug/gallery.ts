// Dev-only model gallery (/gallery.html): every unit model at its in-game scale, turning slowly. ?type=boss to solo one.
import * as THREE from 'three';
import { UNIT_VISUALS, buildGeometry } from '../render/visuals';
import { UNIT_DEFS } from '../sim/unitTypes';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio));
renderer.setSize(innerWidth, innerHeight);
document.body.append(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9fd0ff);
scene.add(new THREE.HemisphereLight(0xdfefff, 0x5a7a3a, 1.6));
const sun = new THREE.DirectionalLight(0xffffff, 1.8);
sun.position.set(4, 10, 6);
scene.add(sun);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshLambertMaterial({ color: 0xe9e2d4 }));
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

const solo = new URLSearchParams(location.search).get('type');
const models: THREE.Mesh[] = [];
let x = 0;
for (let t = 0; t < UNIT_VISUALS.length; t++) {
  if (solo && UNIT_DEFS[t].key !== solo) continue;
  const m = new THREE.Mesh(buildGeometry(UNIT_VISUALS[t]), new THREE.MeshLambertMaterial({ vertexColors: true }));
  const box = new THREE.Box3().setFromObject(m);
  const w = box.max.x - box.min.x;
  m.position.x = x + w / 2;
  x += w + 0.6;
  scene.add(m);
  models.push(m);
}
const mid = x / 2;
for (const m of models) m.position.x -= mid;
const camera = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, 0.1, 200);
camera.position.set(0, x * 0.35 + 1.5, x * 0.85 + 2);
camera.lookAt(0, 1, 0);
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});
renderer.setAnimationLoop((ms) => {
  for (const m of models) m.rotation.y = Math.sin(ms * 0.0006) * 0.9;
  renderer.render(scene, camera);
});
