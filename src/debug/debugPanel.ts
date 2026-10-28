import GUI from 'lil-gui';
import type { Game } from '../game';
import { clearSave, freshSave, writeSave } from '../meta/save';

/** lil-gui panel (?debug). Loaded on demand so it never ships in the normal path. */
export function createDebugPanel(game: Game): GUI {
  const gui = new GUI({ title: 'debug' });
  gui.domElement.style.zIndex = '20';
  gui.close();
  const p = game.progress;
  const state = {
    coins: () => {
      p.save.coins += 1000;
      writeSave(p.save);
    },
    unlockAll: () => {
      p.save.unlocked = 99;
      writeSave(p.save);
    },
    resetSave: () => {
      clearSave();
      p.save = freshSave();
      location.reload();
    },
    win: () => {
      game.currentWorld.baseHp = 0;
    },
    showAssistLog: () => console.table(p.save.assistLog),
  };
  gui.add(game, 'timeScale', 0.25, 4, 0.25).name('sim speed');
  gui.add(game.renderer, 'shakeOn').name('camera shake');
  const units = game.renderer.units;
  if (units) {
    gui.add(units, 'visualCap', 200, 3000, 100).name('visual cap');
    gui.add(units, 'shadowsOn').name('blob shadows');
  }
  gui.add(state, 'coins').name('+1000 coins');
  gui.add(state, 'unlockAll').name('unlock all levels');
  gui.add(state, 'win').name('win this level');
  gui.add(state, 'showAssistLog').name('assist log (console)');
  gui.add(state, 'resetSave').name('reset save');
  return gui;
}
