// Gameplay screenshots in headless Chrome (real GPU), driven by the skilled bot. Needs a dev server running.
//   node scripts/shots.mjs [baseUrl] [outDir] [level,level,...] [times in s, comma separated]
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import puppeteer from 'puppeteer-core';

const CHROME = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const base = process.argv[2] ?? 'http://localhost:5199/';
const out = process.argv[3] ?? 'shots';
const levels = (process.argv[4] ?? '1').split(',').map(Number);
const times = (process.argv[5] ?? '5,12').split(',').map(Number);
mkdirSync(out, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'],
  defaultViewport: { width: 430, height: 860, deviceScaleFactor: 2 },
});
try {
  const page = await browser.newPage();
  page.on('console', (m) => { if (m.type() === 'error') console.log('console error:', m.text()); });
  page.on('pageerror', (e) => console.log('page error:', e.message));
  if (process.env.SHOTS_UI) {
    // Menu + shop with some coins, both tabs.
    await page.goto(base, { waitUntil: 'load' });
    await page.evaluate(() => localStorage.setItem('crowd-launcher.save', JSON.stringify({ v: 1, coins: 480, unlocked: 6, upgrades: { fireRate: 2, gatePower: 1 }, weapons: { owned: ['blaster', 'twin'], equipped: 'twin' } })));
    await page.reload({ waitUntil: 'load' });
    await new Promise((r) => setTimeout(r, 800));
    await page.screenshot({ path: join(out, 'ui-menu.png') });
    await page.evaluate(() => document.querySelector('.shop-btn').click());
    await new Promise((r) => setTimeout(r, 300));
    await page.screenshot({ path: join(out, 'ui-shop-weapons.png') });
    await page.evaluate(() => document.querySelectorAll('.tabs button')[1].click());
    await new Promise((r) => setTimeout(r, 300));
    await page.screenshot({ path: join(out, 'ui-shop-upgrades.png') });
    await page.evaluate(() => [...document.querySelectorAll('.actions button')].find((b) => b.textContent === 'Back').click());
    await page.evaluate(() => [...document.querySelectorAll('.actions button')].find((b) => b.textContent === 'Levels').click());
    await new Promise((r) => setTimeout(r, 300));
    await page.screenshot({ path: join(out, 'ui-levels.png') });
  }
  for (const lvl of levels) {
    await page.goto(`${base}?level=${lvl}`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__game, { timeout: 20000 });
    await page.screenshot({ path: join(out, `L${lvl}-start.png`) });
    await page.evaluate(async () => {
      const { AimBot, SKILLED } = await import('/src/sim/bots.ts');
      const bot = new AimBot(SKILLED);
      const g = window.__game;
      const inp = g.input;
      Object.defineProperty(inp, 'firing', { get: () => true });
      const loop = () => {
        const w = g.currentWorld;
        bot.act(w);
        inp.aimX = w.input.aimX;
        if (w.input.champion) {
          w.input.champion = false;
          inp.requestChampion();
        }
        requestAnimationFrame(loop);
      };
      loop();
      document.querySelector('.screen button.primary').click();
    });
    let t0 = 0;
    for (const t of times) {
      await new Promise((r) => setTimeout(r, (t - t0) * 1000));
      t0 = t;
      const info = await page.evaluate(() => {
        const w = window.__game.currentWorld;
        return { t: w.time.toFixed(1), army: w.playerLogical, enemy: w.enemyLogical, base: Math.round(w.baseHp), state: w.state };
      });
      console.log(`L${lvl} @${t}s`, JSON.stringify(info));
      await page.screenshot({ path: join(out, `L${lvl}-${t}s.png`) });
    }
  }
} finally {
  await browser.close();
}
