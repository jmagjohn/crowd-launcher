// CPU profile of the stress scene under 4x throttling: Chrome's per-category metrics (script, layout, style, GC)
// plus the top self-time functions from the sampling profiler. Usage: npm run build && node scripts/profile-browser.mjs
import { join } from 'node:path';
import puppeteer from 'puppeteer-core';
import { preview } from 'vite';

const CHROME = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const throttle = Number(process.env.THROTTLE ?? 4);
const vsync = process.env.VSYNC !== '0';
const seconds = Number(process.env.SECS ?? 6);

const server = await preview({ preview: { port: 5200, strictPort: true }, logLevel: 'warn' });
const args = ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--disable-renderer-backgrounding',
  '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows'];
if (!vsync) args.push('--disable-gpu-vsync', '--disable-frame-rate-limit');
const viewport = { width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true };
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args, userDataDir: join('.bench-profile', 'profile'), defaultViewport: viewport });
try {
  const page = await browser.newPage();
  const cdp = await page.createCDPSession();
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
  await cdp.send('Performance.enable');
  await page.goto(`http://localhost:5200/?bench&warm=1000&secs=1000`, { waitUntil: 'load' });
  await new Promise((r) => setTimeout(r, 4000));

  const frames0 = await page.evaluate(() => window.__game.perfFrames ?? 0);
  const m0 = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
  await cdp.send('Profiler.start');
  await new Promise((r) => setTimeout(r, seconds * 1000));
  const { profile } = await cdp.send('Profiler.stop');
  const m1 = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
  const frames1 = await page.evaluate(() => window.__game.perfFrames ?? 0);

  const frames = frames1 - frames0;
  const wall = m1.Timestamp - m0.Timestamp;
  console.log(`throttle ${throttle}x vsync ${vsync} | ${frames} frames in ${wall.toFixed(2)} s = ${(frames / wall).toFixed(1)} fps`);
  const per = (k) => (((m1[k] - m0[k]) * 1000) / frames).toFixed(2);
  for (const k of ['TaskDuration', 'ScriptDuration', 'RecalcStyleDuration', 'LayoutDuration', 'TaskOtherDuration']) {
    console.log(`  ${k.padEnd(22)} ${per(k).padStart(7)} ms/frame`);
  }
  console.log(`  JSHeapUsedSize          ${(m1.JSHeapUsedSize / 1e6).toFixed(1)} MB (delta ${((m1.JSHeapUsedSize - m0.JSHeapUsedSize) / 1e6).toFixed(2)} MB)`);
  console.log(`  Layouts ${m1.LayoutCount - m0.LayoutCount}  StyleRecalcs ${m1.RecalcStyleCount - m0.RecalcStyleCount}`);

  // Self time per function from the sampling profile.
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const self = new Map();
  const dts = profile.timeDeltas;
  for (let i = 0; i < profile.samples.length; i++) {
    const n = byId.get(profile.samples[i]);
    const cf = n.callFrame;
    const key = `${cf.functionName || '(anon)'} ${cf.url.split('/').pop()}:${cf.lineNumber + 1}`;
    self.set(key, (self.get(key) ?? 0) + (dts[i] ?? 0));
  }
  const total = [...self.values()].reduce((a, b) => a + b, 0);
  const top = [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 28);
  console.log(`\nTop self time (sampled ${(total / 1000).toFixed(0)} ms):`);
  for (const [k, v] of top) console.log(`  ${((v / total) * 100).toFixed(1).padStart(5)}%  ${(v / 1000 / frames).toFixed(3)} ms/frame  ${k}`);
} finally {
  await browser.close();
  await new Promise((res) => server.httpServer.close(res));
}
