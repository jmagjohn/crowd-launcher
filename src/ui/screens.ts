import type { Progress } from '../meta/progress';
import { UPGRADES } from '../meta/upgrades';
import { WEAPONS, weaponUnitsPerSecond } from '../sim/weapons';
import { formatCount } from './hud';

export interface EndSummary {
  won: boolean;
  levelName: string;
  levelLabel: string;
  basePctLeft: number;
  seconds: number;
  peakArmy: number;
  fired: number;
  coins: number;
  firstClear: boolean;
  hint: string | null;
  shopHint: string | null;
}

export interface LevelTile {
  label: string;
  name: string;
  locked: boolean;
  cleared: boolean;
  boss: boolean;
  current: boolean;
}

interface Action {
  label: string;
  primary?: boolean;
  cls?: string;
  run: () => void;
}

/** Full-screen HTML overlays: menu, start, end, pause, level map, shop. One root element, content swapped per screen. */
export class Screens {
  private readonly root: HTMLDivElement;
  private shopTab: 'weapons' | 'upgrades' = 'weapons';

  constructor(stage: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'screen hidden';
    stage.append(this.root);
  }

  hide(): void {
    this.root.className = 'screen hidden';
    this.root.replaceChildren();
  }

  get visible(): boolean {
    return !this.root.classList.contains('hidden');
  }

  showMenu(coins: number, nextLabel: string, onPlay: () => void, onLevels: () => void, onShop: () => void): void {
    this.show('menu', `
      <div class="logo"><span class="logo-a">CROWD</span><span class="logo-b">LAUNCHER</span></div>
      ${coinRow(coins)}
      <div class="howto"><span class="finger"></span><span>Hold to fire<br>Drag to aim</span></div>`, [
      { label: `Play · ${nextLabel}`, primary: true, run: onPlay },
      { label: 'Shop', cls: 'shop-btn', run: onShop },
      { label: 'Levels', run: onLevels },
    ]);
  }

  showStart(title: string, kicker: string, intro: { title: string; text: string } | null, boss: boolean, assist: number, onPlay: () => void, onBack: () => void): void {
    const introHtml = intro ? `<div class="intro"><b>New: ${esc(intro.title)}</b><p>${esc(intro.text)}</p></div>` : '';
    const assistHtml = assist > 0 ? `<div class="assist">Assist active: enemies −${assist}%</div>` : '';
    this.show(boss ? 'start boss' : 'start', `<div class="kicker">${esc(kicker)}</div>
      ${boss ? '<div class="boss-tag">BOSS</div>' : ''}<h1>${esc(title)}</h1>${introHtml}${assistHtml}`, [
      { label: 'Play', primary: true, run: onPlay },
      { label: 'Back', run: onBack },
    ]);
  }

  showEnd(s: EndSummary, onRetry: () => void, onNext: (() => void) | null, onShop: () => void, onMenu: () => void): void {
    const pct = Math.round(s.basePctLeft * 100);
    const coins = s.coins > 0 ? `<div class="earned">+${s.coins} <span class="coin"></span>${s.firstClear ? '<em>first clear</em>' : ''}</div>` : '';
    const body = s.won
      ? `<div class="kicker">${esc(s.levelLabel)}</div><h1 class="win">Victory!</h1>${coins}
         <div class="stats"><div><b>${s.seconds.toFixed(1)}s</b><span>time</span></div>
         <div><b>${formatCount(s.peakArmy)}</b><span>peak army</span></div>
         <div><b>${formatCount(s.fired)}</b><span>fired</span></div></div>`
      : `<div class="kicker">${esc(s.levelLabel)}</div><h1 class="lose">Defeat</h1>
         <div class="close"><div class="close-bar"><div class="close-fill" style="transform:scaleX(${(1 - s.basePctLeft).toFixed(3)})"></div></div>
         <span>Base at <b>${pct}%</b> HP</span></div>${coins}
         ${s.hint ? `<p class="hint">${esc(s.hint)}</p>` : ''}
         ${s.shopHint ? `<p class="hint shop-hint">${esc(s.shopHint)}</p>` : ''}`;
    const actions: Action[] = [];
    if (s.won && onNext) actions.push({ label: 'Next level', primary: true, run: onNext });
    actions.push({ label: 'Retry', primary: !s.won, run: onRetry });
    actions.push({ label: 'Shop', cls: 'shop-btn', run: onShop });
    actions.push({ label: 'Menu', run: onMenu });
    this.show(s.won ? 'end win' : 'end lose', body, actions);
  }

  showPause(onResume: () => void, onRestart: () => void, onMenu: () => void): void {
    this.show('pause', '<h1>Paused</h1>', [
      { label: 'Resume', primary: true, run: onResume },
      { label: 'Restart', run: onRestart },
      { label: 'Menu', run: onMenu },
    ]);
  }

  showLevels(tiles: readonly LevelTile[], onPick: (i: number) => void, onBack: () => void): void {
    this.root.className = 'screen levels';
    const card = document.createElement('div');
    card.className = 'card wide';
    card.innerHTML = '<h1>Levels</h1>';
    const grid = document.createElement('div');
    grid.className = 'level-grid';
    tiles.forEach((t, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `tile${t.locked ? ' locked' : ''}${t.cleared ? ' cleared' : ''}${t.boss ? ' boss' : ''}${t.current ? ' current' : ''}`;
      b.disabled = t.locked;
      b.title = t.name;
      b.innerHTML = `<b>${esc(t.label)}</b><span>${t.locked ? '🔒' : t.cleared ? '★' : t.boss ? 'BOSS' : ''}</span>`;
      b.addEventListener('click', () => onPick(i));
      grid.append(b);
    });
    card.append(grid, this.actionRow([{ label: 'Back', run: onBack }]));
    this.root.replaceChildren(card);
  }

  /** Shop: weapons (buy once, equip) and upgrades (levels). Re-renders in place after every purchase. */
  showShop(progress: Progress, baseRate: number, onChange: () => void, onBack: () => void): void {
    const render = (): void => {
      this.root.className = 'screen shop';
      const card = document.createElement('div');
      card.className = 'card wide';
      card.innerHTML = `<div class="shop-head"><h1>Shop</h1>${coinRow(progress.coins)}</div>`;
      const tabs = document.createElement('div');
      tabs.className = 'tabs';
      for (const [key, label] of [['weapons', 'Weapons'], ['upgrades', 'Upgrades']] as const) {
        const t = document.createElement('button');
        t.type = 'button';
        t.textContent = label;
        t.className = this.shopTab === key ? 'on' : '';
        t.addEventListener('click', () => {
          this.shopTab = key;
          render();
        });
        tabs.append(t);
      }
      const list = document.createElement('div');
      list.className = 'shop-list';
      if (this.shopTab === 'weapons') {
        for (const w of WEAPONS) {
          const owned = progress.ownsWeapon(w.key);
          const equipped = progress.save.weapons.equipped === w.key;
          const ups = weaponUnitsPerSecond(WEAPONS.indexOf(w), baseRate).toFixed(1);
          const btnLabel = equipped ? 'Equipped' : owned ? 'Equip' : `${w.cost}`;
          list.append(row(
            `<div class="w-icon w-${w.key}"></div>`,
            w.name,
            `${esc(w.blurb)}<br><small>${w.offsets.length} muzzle${w.offsets.length > 1 ? 's' : ''} · ${ups} units/s at base rate</small>`,
            btnLabel,
            !owned,
            equipped || (!owned && w.cost > progress.coins),
            () => {
              if (owned) progress.equip(w.key);
              else progress.buyWeapon(w.key);
              onChange();
              render();
            },
          ));
        }
      } else {
        for (const u of UPGRADES) {
          const lvl = progress.upgradeLevel(u.key);
          const cost = progress.nextUpgradeCost(u.key);
          const pips = `<div class="pips">${Array.from({ length: u.max }, (_, i) => `<i class="${i < lvl ? 'on' : ''}"></i>`).join('')}</div>`;
          list.append(row(
            `<div class="u-icon">${esc(u.icon)}</div>`,
            u.name,
            `${lvl > 0 ? esc(u.effect(lvl)) : '<span class="muted">Not owned</span>'}${cost !== null ? `<br><small>Next: ${esc(u.effect(lvl + 1))}</small>` : ''}${pips}`,
            cost === null ? 'Max' : `${cost}`,
            cost !== null,
            cost === null || cost > progress.coins,
            () => {
              progress.buyUpgrade(u.key);
              onChange();
              render();
            },
          ));
        }
      }
      card.append(tabs, list, this.actionRow([{ label: 'Back', primary: true, run: onBack }]));
      this.root.replaceChildren(card);
    };
    render();
  }

  private show(kind: string, html: string, actions: Action[]): void {
    this.root.className = `screen ${kind}`;
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = html;
    card.append(this.actionRow(actions));
    this.root.replaceChildren(card);
    (card.querySelector('button.primary') as HTMLButtonElement | null)?.focus({ preventScroll: true });
  }

  private actionRow(actions: Action[]): HTMLDivElement {
    const row = document.createElement('div');
    row.className = 'actions';
    for (const a of actions) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = a.label;
      b.className = [a.primary ? 'primary' : '', a.cls ?? ''].join(' ').trim();
      b.addEventListener('click', a.run);
      row.append(b);
    }
    return row;
  }
}

function row(icon: string, name: string, desc: string, btn: string, isPrice: boolean, disabled: boolean, onBuy: () => void): HTMLDivElement {
  const el = document.createElement('div');
  el.className = 'shop-row';
  el.innerHTML = `${icon}<div class="shop-text"><b>${esc(name)}</b><div class="desc">${desc}</div></div>`;
  const b = document.createElement('button');
  b.type = 'button';
  b.className = `buy${isPrice ? ' price' : ''}`;
  b.innerHTML = isPrice ? `<span class="coin"></span>${esc(btn)}` : esc(btn);
  b.disabled = disabled;
  b.addEventListener('click', onBuy);
  el.append(b);
  return el;
}

function coinRow(coins: number): string {
  return `<div class="coins"><span class="coin"></span>${formatCount(coins)}</div>`;
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}
