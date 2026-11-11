import type { World } from '../sim/world';

const TEXT_INTERVAL = 1 / 12;

export function formatCount(n: number): string {
  if (n < 10_000) return Math.round(n).toLocaleString('en-US');
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 100_000 ? 1 : 0)}K`;
  if (n < 1_000_000_000) return `${(n / 1e6).toFixed(n < 1e7 ? 2 : 1)}M`;
  return `${(n / 1e9).toFixed(2)}B`;
}

/**
 * HTML HUD over the canvas. Bars move via transform every frame (no layout); text is rewritten at most 12 times a
 * second and only when the value changed.
 */
export class Hud {
  readonly root: HTMLDivElement;
  private readonly levelName: HTMLDivElement;
  private readonly weaponTag: HTMLDivElement;
  private readonly baseFill: HTMLDivElement;
  private readonly baseText: HTMLSpanElement;
  private readonly armyText: HTMLSpanElement;
  private readonly enemyText: HTMLSpanElement;
  private readonly champBtn: HTMLButtonElement;
  private readonly chargeFill: HTMLDivElement;
  private textClock = 0;
  private shownArmy = -1;
  private shownEnemy = -1;
  private shownBase = -1;
  private shownBaseFrac = -1;
  private shownCharge = -1;
  private ready = false;

  constructor(stage: HTMLElement, onChampion: () => void, onPause: () => void) {
    this.root = document.createElement('div');
    this.root.className = 'hud';
    this.root.innerHTML = `
      <button class="pause-btn" type="button" aria-label="Pause"><i></i><i></i></button>
      <div class="hud-top">
        <div class="hud-level"></div>
        <div class="base-bar"><div class="base-fill"></div><span class="base-text"></span></div>
      </div>
      <div class="hud-bottom">
        <div class="pill army"><span class="dot blue"></span><span class="army-count">0</span></div>
        <div class="pill enemy"><span class="dot red"></span><span class="enemy-count">0</span></div>
        <div class="weapon-tag"></div>
        <button class="champ" type="button" aria-label="Launch Brute">
          <div class="charge-fill"></div><span>BRUTE</span><kbd>B</kbd>
        </button>
      </div>`;
    stage.append(this.root);
    const q = <T extends Element>(sel: string): T => this.root.querySelector(sel) as T;
    this.levelName = q('.hud-level');
    this.weaponTag = q('.weapon-tag');
    this.baseFill = q('.base-fill');
    this.baseText = q('.base-text');
    this.armyText = q('.army-count');
    this.enemyText = q('.enemy-count');
    this.champBtn = q('.champ');
    this.chargeFill = q('.charge-fill');
    // The button lives over the canvas; stop the press from also starting fire.
    this.champBtn.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      onChampion();
    });
    const pauseBtn = q<HTMLButtonElement>('.pause-btn');
    pauseBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
    pauseBtn.addEventListener('click', onPause);
  }

  setLevel(label: string, championEnabled: boolean, weapon: string): void {
    this.levelName.textContent = label;
    this.weaponTag.textContent = weapon;
    this.champBtn.style.visibility = championEnabled ? '' : 'hidden';
    this.shownArmy = this.shownEnemy = this.shownBase = this.shownBaseFrac = this.shownCharge = -1;
    this.textClock = TEXT_INTERVAL;
  }

  setVisible(v: boolean): void {
    this.root.style.display = v ? '' : 'none';
  }

  update(w: World, dt: number): void {
    const frac = w.baseMaxHp > 0 ? w.baseHp / w.baseMaxHp : 0;
    if (Math.abs(frac - this.shownBaseFrac) > 0.0005) {
      this.shownBaseFrac = frac;
      this.baseFill.style.transform = `scaleX(${frac.toFixed(4)})`;
    }
    const charge = w.charge;
    if (charge !== this.shownCharge) {
      this.shownCharge = charge;
      this.chargeFill.style.transform = `scaleY(${charge.toFixed(3)})`;
      const ready = charge >= 1;
      if (ready !== this.ready) {
        this.ready = ready;
        this.champBtn.classList.toggle('ready', ready);
      }
    }

    this.textClock += dt;
    if (this.textClock < TEXT_INTERVAL) return;
    this.textClock = 0;
    if (w.playerLogical !== this.shownArmy) {
      this.shownArmy = w.playerLogical;
      this.armyText.textContent = formatCount(w.playerLogical);
    }
    if (w.enemyLogical !== this.shownEnemy) {
      this.shownEnemy = w.enemyLogical;
      this.enemyText.textContent = formatCount(w.enemyLogical);
    }
    const hp = Math.ceil(w.baseHp);
    if (hp !== this.shownBase) {
      this.shownBase = hp;
      this.baseText.textContent = formatCount(hp);
    }
  }
}
