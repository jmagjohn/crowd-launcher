import * as THREE from 'three';
import { Gate, OP_ADD, OP_SUB, OP_SYMBOL } from '../sim/gates';
import { formatCount } from '../ui/hud';

// + green, − orange, × blue, ÷ red.
const OP_COLOR = [0x22c55e, 0xf97316, 0x2f7bff, 0xdc2626];
const PANEL_H = 2.1;
const POST = 0.24;

const S_ACTIVE = 0;
const S_RECHARGING = 1;
const S_SPENT = 2;

const POP_POOL = 10;
const POP_EVERY = 0.5;

interface GateView {
  group: THREE.Group;
  panel: THREE.Mesh;
  mat: THREE.ShaderMaterial;
  capMat: THREE.MeshLambertMaterial;
  label: HTMLDivElement;
  main: HTMLSpanElement;
  sub: HTMLSpanElement;
  op: number;
  shown: number;
  flipLeft: number;
  status: number;
  lastPass: number;
  flash: number;
  sx: number;
  sy: number;
  /** Units gained or lost since the last popup. */
  pending: number;
  popClock: number;
}

/**
 * Gates: a frame (two posts and a lintel) around an animated energy panel, plus an HTML label projected over the
 * canvas. Label text and styles are written only when the numbers change. Units gained or lost at each gate
 * are batched into floating "+24" popups.
 */
export class GatesRenderer {
  private readonly views: GateView[] = [];
  private readonly v = new THREE.Vector3();
  private readonly panelGeom = new THREE.PlaneGeometry(1, PANEL_H);
  private readonly postGeom = new THREE.BoxGeometry(POST, PANEL_H + 0.3, POST);
  private readonly capGeom = new THREE.BoxGeometry(1, 0.26, POST * 1.2);
  private readonly postMat = new THREE.MeshLambertMaterial({ color: 0xf1f5f9 });
  private readonly pops: HTMLDivElement[] = [];
  private popNext = 0;

  constructor(
    private readonly scene: THREE.Scene,
    layer: HTMLElement,
    gates: readonly Gate[],
  ) {
    for (const g of gates) {
      const group = new THREE.Group();
      const w = g.halfW * 2;
      const mat = new THREE.ShaderMaterial({
        uniforms: {
          uColor: { value: new THREE.Color(OP_COLOR[g.op]) },
          uTime: { value: 0 },
          uFlash: { value: 0 },
          uAlpha: { value: 1 },
          uWidth: { value: w },
        },
        vertexShader: PANEL_VERT,
        fragmentShader: PANEL_FRAG,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const panel = new THREE.Mesh(this.panelGeom, mat);
      panel.scale.x = w;
      panel.position.y = PANEL_H / 2;
      panel.renderOrder = 2;
      const capMat = new THREE.MeshLambertMaterial({ color: OP_COLOR[g.op] });
      const cap = new THREE.Mesh(this.capGeom, capMat);
      cap.scale.x = w + POST;
      cap.position.y = PANEL_H + 0.15;
      const left = new THREE.Mesh(this.postGeom, this.postMat);
      left.position.set(-g.halfW, (PANEL_H + 0.3) / 2, 0);
      const right = new THREE.Mesh(this.postGeom, this.postMat);
      right.position.set(g.halfW, (PANEL_H + 0.3) / 2, 0);
      group.add(panel, cap, left, right);
      group.name = 'gate';
      group.position.set(g.x, 0, -g.y);
      scene.add(group);

      const label = document.createElement('div');
      label.className = 'gate-label';
      const main = document.createElement('span');
      main.className = 'gate-main';
      const sub = document.createElement('span');
      sub.className = 'gate-sub';
      label.append(main, sub);
      layer.append(label);
      this.views.push({
        group, panel, mat, capMat, label, main, sub,
        op: -1, shown: NaN, flipLeft: NaN, status: -1,
        lastPass: g.lastPassTick, flash: 0, sx: -1e9, sy: -1e9, pending: 0, popClock: 0,
      });
    }
    for (let i = 0; i < POP_POOL; i++) {
      const p = document.createElement('div');
      p.className = 'gate-pop';
      layer.append(p);
      this.pops.push(p);
    }
  }

  /** Units gained (+) or lost (-) at gate `gi` this frame; shown as a batched popup. */
  addDelta(gi: number, delta: number): void {
    const v = this.views[gi];
    if (v) v.pending += delta;
  }

  update(gates: readonly Gate[], tick: number, camera: THREE.Camera, w: number, h: number, time: number, frameDt: number): void {
    for (let i = 0; i < gates.length; i++) {
      const g = gates[i];
      const view = this.views[i];
      view.group.position.x = g.x;

      if (g.lastPassTick !== view.lastPass) {
        view.lastPass = g.lastPassTick;
        view.flash = 1;
      }
      view.flash = Math.max(0, view.flash - frameDt * 5);
      const status = !g.active ? S_SPENT : g.op === OP_ADD && tick < g.readyTick ? S_RECHARGING : S_ACTIVE;
      const u = view.mat.uniforms;
      u.uTime.value = time;
      u.uFlash.value = view.flash;
      u.uAlpha.value = status === S_SPENT ? 0.15 : status === S_RECHARGING ? 0.45 : 1;
      view.panel.visible = g.active || view.flash > 0;

      const shown = g.op === OP_SUB ? g.toll : g.value;
      const flipLeft = g.flipAfter > 0 && !g.flipped ? Math.max(0, g.flipAfter - g.crossed) : -1;
      if (g.op !== view.op) {
        view.op = g.op;
        (u.uColor.value as THREE.Color).setHex(OP_COLOR[g.op]);
        view.capMat.color.setHex(OP_COLOR[g.op]);
        view.label.dataset.op = String(g.op);
        view.shown = NaN;
      }
      if (shown !== view.shown) {
        view.shown = shown;
        view.main.textContent = OP_SYMBOL[g.op] + shown;
      }
      if (flipLeft !== view.flipLeft || status !== view.status) {
        view.flipLeft = flipLeft;
        view.status = status;
        view.sub.textContent =
          status === S_SPENT ? 'broken'
          : flipLeft >= 0 ? `${OP_SYMBOL[g.flipOp]}${g.flipValue} in ${flipLeft}`
          : g.usesLeft === 1 ? 'once'
          : g.usesLeft > 1 ? `${g.usesLeft} left`
          : g.op === OP_SUB && g.regenPerTick > 0 ? 'regrows'
          : '';
        view.label.dataset.status = String(status);
      }

      const p = this.v.set(g.x, PANEL_H + 0.75, -g.y).project(camera);
      const sx = (p.x * 0.5 + 0.5) * w;
      const sy = (-p.y * 0.5 + 0.5) * h;
      if (Math.abs(sx - view.sx) > 0.25 || Math.abs(sy - view.sy) > 0.25) {
        view.sx = sx;
        view.sy = sy;
        view.label.style.transform = `translate3d(${sx.toFixed(1)}px, ${sy.toFixed(1)}px, 0) translate(-50%, -50%)`;
      }

      view.popClock += frameDt;
      if (view.pending !== 0 && view.popClock >= POP_EVERY) {
        view.popClock = 0;
        this.pop(view.sx, view.sy - 26, view.pending);
        view.pending = 0;
      }
    }
  }

  private pop(x: number, y: number, delta: number): void {
    const el = this.pops[this.popNext];
    this.popNext = (this.popNext + 1) % POP_POOL;
    el.textContent = (delta > 0 ? '+' : '−') + formatCount(Math.abs(delta));
    el.dataset.good = delta > 0 ? '1' : '0';
    el.animate(
      [
        { transform: `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%) scale(0.6)`, opacity: 0 },
        { transform: `translate3d(${x}px, ${y - 14}px, 0) translate(-50%, -50%) scale(1.15)`, opacity: 1, offset: 0.2 },
        { transform: `translate3d(${x}px, ${y - 46}px, 0) translate(-50%, -50%) scale(1)`, opacity: 0 },
      ],
      { duration: 800, easing: 'ease-out' },
    );
  }

  dispose(): void {
    for (const v of this.views) {
      this.scene.remove(v.group);
      v.mat.dispose();
      v.capMat.dispose();
      v.label.remove();
    }
    for (const p of this.pops) p.remove();
    this.views.length = 0;
    this.panelGeom.dispose();
    this.postGeom.dispose();
    this.capGeom.dispose();
    this.postMat.dispose();
  }
}

const PANEL_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

// Rising diagonal stripes, bright edges, flash on crossings.
const PANEL_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uTime;
uniform float uFlash;
uniform float uAlpha;
uniform float uWidth;
varying vec2 vUv;
void main() {
  float stripe = step(0.5, fract((vUv.x * uWidth + vUv.y * 2.0) * 0.9 - uTime * 0.8));
  float edge = smoothstep(0.82, 1.0, abs(vUv.x - 0.5) * 2.0) + smoothstep(0.85, 1.0, vUv.y);
  float body = 0.32 + stripe * 0.12 + edge * 0.35;
  vec3 col = mix(uColor, vec3(1.0), 0.15 + edge * 0.35 + uFlash * 0.5);
  gl_FragColor = vec4(col, clamp((body + uFlash * 0.35) * uAlpha, 0.0, 0.95));
  #include <colorspace_fragment>
}`;
