import * as THREE from 'three';
import { LANE_HALF } from '../sim/config';
import { W_RUNNER, W_SCATTER, W_TWIN } from '../sim/weapons';

export const LAUNCHER_Z = 0.9;

interface Barrel {
  pivot: THREE.Group;
  flash: THREE.Sprite;
  kick: number;
}

/**
 * The player's launcher: a cannon on a stone emplacement whose barrels change with the equipped weapon. Barrels recoil and flash on
 * every shot, a faint aim guide runs up the lane, and a gold ring pulses while the Brute is ready.
 */
export class Launcher {
  readonly group = new THREE.Group();
  private readonly turret = new THREE.Group();
  private barrels: Barrel[] = [];
  private readonly flashTex: THREE.Texture;
  private readonly ring: THREE.Mesh;
  private readonly ringMat: THREE.MeshBasicMaterial;
  private readonly guideMat: THREE.MeshBasicMaterial;
  private weapon = -1;
  private next = 0;
  private sway = 0;
  private lastX = 0;

  constructor(scene: THREE.Scene) {
    this.flashTex = radialTexture();
    // A stone emplacement under a bronze cannon.
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.25, 0.38, 8), new THREE.MeshLambertMaterial({ color: 0x8b909c }));
    pad.position.y = 0.18;
    const padRim = new THREE.Mesh(new THREE.TorusGeometry(1.08, 0.08, 6, 24), new THREE.MeshBasicMaterial({ color: 0x5aa2ff }));
    padRim.rotation.x = Math.PI / 2;
    padRim.position.y = 0.36;
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.62, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x2f7bff }));
    body.position.y = 0.36;
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.12, 0.3), new THREE.MeshLambertMaterial({ color: 0xffc933 }));
    stripe.position.set(0, 0.62, 0.35);
    this.turret.add(body, stripe);
    this.group.add(pad, padRim, this.turret);

    this.ringMat = new THREE.MeshBasicMaterial({ color: 0xffcc33, transparent: true, opacity: 0, depthWrite: false });
    this.ring = new THREE.Mesh(new THREE.RingGeometry(1.3, 1.55, 40), this.ringMat);
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.04;
    this.group.add(this.ring);

    // Aim guide: a fading strip from the muzzle up the lane.
    this.guideMat = new THREE.MeshBasicMaterial({ map: guideTexture(), transparent: true, opacity: 0.5, depthWrite: false });
    const guide = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 9), this.guideMat);
    guide.rotation.x = -Math.PI / 2;
    guide.position.set(0, 0.03, -5.6);
    this.group.add(guide);

    this.group.name = 'launcher';
    this.group.position.set(0, 0, LAUNCHER_Z);
    scene.add(this.group);
    this.setWeapon(0);
  }

  setWeapon(weapon: number): void {
    if (weapon === this.weapon) return;
    this.weapon = weapon;
    for (const b of this.barrels) this.turret.remove(b.pivot);
    this.barrels = [];
    const steel = new THREE.MeshLambertMaterial({ color: 0xd8b878 });
    const accent = new THREE.MeshLambertMaterial({ color: weapon === W_RUNNER ? 0x35d4ff : 0x1b47c9 });
    const make = (x: number, yaw: number, len: number, r: number): void => {
      const pivot = new THREE.Group();
      pivot.position.set(x, 0.7, 0);
      pivot.rotation.y = yaw;
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.85, r, len, 10), steel);
      tube.rotation.x = -Math.PI / 2;
      tube.position.z = -len / 2;
      const band = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.15, r * 1.15, 0.16, 10), accent);
      band.rotation.x = -Math.PI / 2;
      band.position.z = -len + 0.12;
      const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.flashTex, color: 0xfff1a8, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      flash.position.z = -len - 0.25;
      flash.scale.setScalar(0);
      pivot.add(tube, band, flash);
      this.turret.add(pivot);
      this.barrels.push({ pivot, flash, kick: 0 });
    };
    if (weapon === W_TWIN) {
      make(-0.36, 0, 1.4, 0.2);
      make(0.36, 0, 1.4, 0.2);
    } else if (weapon === W_SCATTER) {
      make(-0.32, 0.38, 1.0, 0.22);
      make(0, 0, 1.1, 0.24);
      make(0.32, -0.38, 1.0, 0.22);
    } else if (weapon === W_RUNNER) {
      make(0, 0, 1.9, 0.18);
    } else {
      make(0, 0, 1.5, 0.27);
    }
  }

  /** One trigger pull: barrels fire in rotation (all at once for scatter). */
  fire(): void {
    if (this.barrels.length === 0) return;
    if (this.weapon === W_SCATTER) {
      for (const b of this.barrels) b.kick = 1;
      return;
    }
    if (this.weapon === W_TWIN) {
      this.barrels[0].kick = this.barrels[1].kick = 1;
      return;
    }
    this.barrels[this.next % this.barrels.length].kick = 1;
    this.next++;
  }

  update(aimX: number, championReady: boolean, time: number, dt: number): void {
    const x = Math.max(-LANE_HALF + 0.4, Math.min(LANE_HALF - 0.4, aimX));
    // Lean into fast aim changes.
    const vx = dt > 0 ? (x - this.lastX) / dt : 0;
    this.lastX = x;
    this.sway += (Math.max(-0.35, Math.min(0.35, -vx * 0.02)) - this.sway) * Math.min(1, dt * 12);
    this.group.position.x = x;
    this.turret.rotation.z = this.sway;
    for (const b of this.barrels) {
      b.pivot.position.z = b.kick * 0.28;
      const f = b.kick > 0.55 ? (b.kick - 0.55) / 0.45 : 0;
      b.flash.scale.setScalar(f * 1.1);
      b.kick = Math.max(0, b.kick - dt * 9);
    }
    this.ringMat.opacity = championReady ? 0.55 + 0.35 * Math.sin(time * 8) : 0;
    this.ring.visible = championReady;
  }
}

function radialTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,240,180,0.8)');
  grad.addColorStop(1, 'rgba(255,200,80,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function guideTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 8;
  c.height = 128;
  const g = c.getContext('2d')!;
  for (let y = 0; y < 128; y += 16) {
    const a = 1 - y / 128;
    g.fillStyle = `rgba(255,255,255,${a.toFixed(2)})`;
    g.fillRect(0, 128 - y - 10, 8, 10);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
