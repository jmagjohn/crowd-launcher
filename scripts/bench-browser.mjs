// Browser benchmark against the production build, driven over the Chrome DevTools Protocol.
//   npm run build && npm run bench:browser [-- --headful]
// Profiles:
//   desktop-unlocked : 1x CPU, vsync + frame-rate limit off  -> raw frame cost and max fps
//   phone-4x         : 4x CPU throttle (Emulation.setCPUThrottlingRate), 390x844 @ DPR 3 (game caps at 2), vsync off
//   phone-4x-vsync   : same, vsync on                         -> what a 60 Hz phone would show
// The GL renderer string is printed per run so a software-GL result (SwiftShader) is never mistaken for GPU numbers.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import puppeteer from 'puppeteer-core';
import { preview } from 'vite';

const CHROME = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const headful = process.argv.includes('--headful');
const secs = Number(process.env.BENCH_SECS ?? 10);
const warm = Number(process.env.BENCH_WARM ?? 3);
const runs = Number(process.env.BENCH_RUNS ?? 1);
const only = process.env.BENCH_PROFILES?.split(',');
/** Extra URL flags for A/B runs, e.g. BENCH_QUERY=shadows=0 */
const extra = process.env.BENCH_QUERY ? `&${process.env.BENCH_QUERY}` : '';

const profiles = [
  { name: 'desktop-unlocked', throttle: 1, vsync: false, viewport: { width: 540, height: 960, deviceScaleFactor: 1 } },
  { name: 'desktop-unlocked-dpr2', throttle: 1, vsync: false, viewport: { width: 540, height: 960, deviceScaleFactor: 2 } },
  { name: 'desktop-vsync-dpr2', throttle: 1, vsync: true, viewport: { width: 540, height: 960, deviceScaleFactor: 2 } },
  { name: 'phone-4x', throttle: 4, vsync: false, viewport: { width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true } },
  { name: 'phone-4x-vsync', throttle: 4, vsync: true, viewport: { width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true } },
];

const server = await preview({ preview: { port: 5200, strictPort: true }, logLevel: 'warn' });
const base = 'http://localhost:5200/';
const results = [];

try {
  for (const p of profiles.filter((q) => !only || only.includes(q.name))) for (let run = 0; run < runs; run++) {
    const args = [
      '--enable-gpu',
      '--ignore-gpu-blocklist',
      '--use-angle=d3d11',
      '--disable-renderer-backgrounding',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      `--window-size=${p.viewport.width + 20},${p.viewport.height + 120}`,
      '--window-position=40,40',
    ];
    if (!p.vsync) args.push('--disable-gpu-vsync', '--disable-frame-rate-limit');
    const browser = await puppeteer.launch({
      executablePath: CHROME,
      headless: headful ? false : 'new',
      args,
      userDataDir: join(process.env.BENCH_PROFILE_DIR ?? '.bench-profile', p.name),
      defaultViewport: p.viewport,
    });
    try {
      const page = await browser.newPage();
      await page.setViewport(p.viewport);
      const cdp = await page.createCDPSession();
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: p.throttle });
      await page.goto(`${base}?bench&warm=${warm}&secs=${secs}${extra}`, { waitUntil: 'load' });
      await page.waitForFunction(() => window.__bench, { timeout: (warm + secs + 60) * 1000, polling: 500 });
      const r = await page.evaluate(() => window.__bench);
      results.push({ profile: p.name, run, throttle: p.throttle, vsync: p.vsync, ...r });
      console.log(
        `${(p.name + '#' + run).padEnd(24)} fps ${r.fps.toFixed(1).padStart(6)} | frame p50 ${r.frameMs.p50.toFixed(2)} p95 ${r.frameMs.p95.toFixed(2)} p99 ${r.frameMs.p99.toFixed(2)} max ${r.frameMs.max.toFixed(1)} ms` +
          ` | sim ${r.simMs.mean.toFixed(2)} (p95 ${r.simMs.p95.toFixed(2)}) render ${r.renderMs.mean.toFixed(2)} (p95 ${r.renderMs.p95.toFixed(2)}) gpu ${r.gpuMs ? r.gpuMs.mean.toFixed(2) + ' (p95 ' + r.gpuMs.p95.toFixed(2) + ')' : 'n/a'} ms` +
          ` | drawn ${r.rendered.mean.toFixed(0)} [${r.rendered.min}-${r.rendered.max}] draws ${r.drawCalls} dpr ${r.dpr} ${r.canvas}`,
      );
      console.log(`${''.padEnd(22)} GL: ${r.glRenderer}`);
    } finally {
      await browser.close();
    }
  }
} finally {
  await new Promise((res) => server.httpServer.close(res));
}

// Median per profile across runs.
for (const name of new Set(results.map((r) => r.profile))) {
  const rs = results.filter((r) => r.profile === name);
  const med = (f) => rs.map(f).sort((a, b) => a - b)[Math.floor(rs.length / 2)];
  console.log(`MEDIAN ${name.padEnd(22)} fps ${med((r) => r.fps).toFixed(1)}  frame p50 ${med((r) => r.frameMs.p50).toFixed(2)} p95 ${med((r) => r.frameMs.p95).toFixed(2)} p99 ${med((r) => r.frameMs.p99).toFixed(2)}  sim ${med((r) => r.simMs.mean).toFixed(2)} render ${med((r) => r.renderMs.mean).toFixed(2)}  gpu ${med((r) => r.gpuMs?.mean ?? NaN).toFixed(2)} (p95 ${med((r) => r.gpuMs?.p95 ?? NaN).toFixed(2)})  drawn ${med((r) => r.rendered.mean).toFixed(0)}  (${rs.length} runs)`);
}
mkdirSync('bench-results', { recursive: true });
const file = join('bench-results', `browser-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
writeFileSync(file, JSON.stringify(results, null, 2));
console.log(`saved ${file}`);
