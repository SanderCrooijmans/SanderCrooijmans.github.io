// Real-browser checks against a running preview (default http://localhost:4321) using the installed Microsoft Edge.
// Usage: node tests/browser.mjs [baseUrl]
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const BASE = process.argv[2] || 'http://localhost:4321';
const OUT = fileURLToPath(new URL('../../docs/screenshots/', import.meta.url));
mkdirSync(OUT, { recursive: true });
const results = [];
const rec = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' – ' + detail : ''}`); };

const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const pages = ['/', '/chambers/', '/chambers/series-7/', '/chambers/series-8/', '/chambers/series-9/', '/home-wellness/', '/athletes-and-clubs/', '/clinics-and-recovery-businesses/', '/resources/', '/about/', '/affiliate-disclosure/', '/privacy/', '/terms/'];

async function sweep(width, height, label) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
  for (const path of pages) {
    const page = await ctx.newPage();
    const problems = [];
    page.on('console', (m) => { if (['error'].includes(m.type())) problems.push('console: ' + m.text()); });
    page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
    page.on('requestfailed', (r) => problems.push('requestfailed: ' + r.url()));
    page.on('response', (r) => { if (r.status() >= 400) problems.push(`HTTP ${r.status()} ${r.url()}`); });
    await page.goto(BASE + path, { waitUntil: 'load' });
    await page.waitForTimeout(path === '/' ? 3500 : 400);
    await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 500) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 60)); } window.scrollTo(0, 0); });
    await page.waitForTimeout(1800);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    const imgs = await page.evaluate(async () => {
      const bad = [];
      for (const i of document.images) {
        i.scrollIntoView({ block: 'center' });
        i.loading = 'eager'; // software WebGL on the home page can starve lazy loading; force the fetch
        for (let t = 0; t < 100 && !(i.complete && i.naturalWidth > 0); t++) await new Promise((r) => setTimeout(r, 100));
        if (!(i.complete && i.naturalWidth > 0)) bad.push(i.src);
      }
      return bad;
    });
    rec(`${label} ${path} no horizontal overflow`, overflow <= 0, overflow > 0 ? `${overflow}px` : '');
    rec(`${label} ${path} images load`, imgs.length === 0, imgs.join(','));
    rec(`${label} ${path} no console/network errors`, problems.length === 0, problems.slice(0, 3).join(' | '));
    if (path === '/' || path === '/chambers/') await page.screenshot({ path: `${OUT}${label}${path.replace(/\W+/g, '-')}full.png`, fullPage: true });
    await page.close();
  }
  await ctx.close();
}
await sweep(390, 844, 'phone');
await sweep(820, 1180, 'tablet');
await sweep(1440, 900, 'desktop');

// 3D viewer behaviour (desktop)
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto(BASE + '/', { waitUntil: 'load' });
  await page.waitForSelector('[data-viewer] canvas', { timeout: 30000 }).then(() => rec('3D canvas appears after lazy load', true)).catch(() => rec('3D canvas appears after lazy load', false, 'timeout'));
  await page.waitForTimeout(1500);
  await page.locator('[data-viewer]').first().screenshot({ path: OUT + 'viewer-closed.png' });
  const poster = await page.evaluate(() => document.querySelector('.poster')?.hasAttribute('hidden'));
  rec('poster hidden once 3D is live', poster === true);
  await page.click('[data-action="inside"]');
  await page.waitForTimeout(4500);
  const hot = await page.evaluate(() => document.querySelector('[data-hotspots]')?.classList.contains('show'));
  rec('Look inside shows HTML hotspots', hot === true);
  await page.locator('[data-viewer]').first().screenshot({ path: OUT + 'viewer-inside.png' });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(4500);
  const hot2 = await page.evaluate(() => document.querySelector('[data-hotspots]')?.classList.contains('show'));
  rec('Escape closes interior view', hot2 === false);
  await page.locator('[data-viewer]').first().screenshot({ path: OUT + 'viewer-reset.png' });
  await page.click('[data-action="rotate"]'); await page.waitForTimeout(300);
  rec('Rotate toggles pressed state', (await page.getAttribute('[data-action="rotate"]', 'aria-pressed')) === 'true');
  await page.click('[data-action="pause"]');
  rec('Pause toggles pressed state', (await page.getAttribute('[data-action="pause"]', 'aria-pressed')) === 'true');
  rec('no JS errors during viewer use', errs.length === 0, errs.slice(0, 3).join(' | '));
  await ctx.close();
}

// Reduced motion: immediate interior view, no auto-rotation
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await page.goto(BASE + '/', { waitUntil: 'load' });
  await page.waitForSelector('[data-viewer] canvas', { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(1200);
  const state = await page.textContent('[data-state]');
  rec('reduced motion: not auto-rotating', !/rotating/i.test(state || ''), state || '');
  await page.click('[data-action="inside"]'); await page.waitForTimeout(1500);
  const hot = await page.evaluate(() => document.querySelector('[data-hotspots]')?.classList.contains('show'));
  rec('reduced motion: interior shown immediately', hot === true);
  await ctx.close();
}

// No-WebGL fallback: poster and text remain, buttons disabled, no crash
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript(() => { const orig = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (t, ...a) { if (/webgl/.test(t)) return null; return orig.call(this, t, ...a); }; });
  const page = await ctx.newPage(); const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(BASE + '/', { waitUntil: 'load' }); await page.waitForTimeout(3500);
  const posterVisible = await page.evaluate(() => { const p = document.querySelector('.poster'); return !!p && !p.hasAttribute('hidden') && p.naturalWidth > 0; });
  rec('no-WebGL fallback keeps the static poster', posterVisible);
  rec('no-WebGL fallback: no page errors', errs.length === 0, errs.join(' | '));
  await ctx.close();
}

// CTA integrity in the browser
{
  const ctx = await browser.newContext(); const page = await ctx.newPage();
  await page.goto(BASE + '/', { waitUntil: 'load' });
  const hrefs = await page.$$eval('[data-affiliate-cta]', (as) => as.map((a) => [a.href, a.rel, a.target]));
  rec('home CTAs use exact affiliate URL + sponsored rel', hrefs.length > 0 && hrefs.every(([h, r, t]) => h === 'https://oxynova.com/ref/152/' && /sponsored/.test(r) && t === '_blank'), JSON.stringify(hrefs[0]));
  await ctx.close();
}

await browser.close();
const failed = results.filter((r) => !r.ok);
writeFileSync(OUT + 'browser-test-results.json', JSON.stringify({ date: new Date().toISOString(), base: BASE, total: results.length, failed: failed.length, results }, null, 2));
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
