// Screenshot of the dev model gallery: node scripts/gallery-shot.mjs <url> <out.png> <width> <height>
import puppeteer from 'puppeteer-core';
const [,, url, out, w, h] = process.argv;
const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--enable-gpu', '--use-angle=d3d11'], defaultViewport: { width: +w, height: +h, deviceScaleFactor: 1 } });
const p = await b.newPage();
p.on('pageerror', (e) => console.log('err', e.message));
await p.goto(url, { waitUntil: 'load' });
await new Promise((r) => setTimeout(r, 1500));
await p.screenshot({ path: out });
await b.close();
