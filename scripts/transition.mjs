// Headless check of a round-to-round transition on a running server: drives two rounds, logs the count-up camera
// choices and screenshots the inspection, auction, the slide down the row and the second unit.
// Usage: npm run build && npm run preview, then SHOTS_DIR=shots node scripts/transition.mjs [port] [tag]
import { chromium } from 'playwright';
const OUT = process.env.SHOTS_DIR; const port = process.argv[2] ?? '5173'; const tag = process.argv[3] ?? 'r';
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1100, height: 680 } });
const errors = []; page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message)); page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
const shot = (n) => page.screenshot({ path: `${OUT}/${tag}-${n}.png` });
await page.goto(`http://127.0.0.1:${port}/?seed=demo42&q=high`);
await page.waitForFunction(() => document.querySelector('.menu .start') && !document.querySelector('.menu .start').disabled, null, { timeout: 120000 });
await shot('0-menu');
await page.click('.menu .start');
await page.waitForFunction(() => window.game.phase === 'arrive', null, { timeout: 60000 });
await page.waitForTimeout(1200);
await shot('1-arrive');
await page.waitForFunction(() => window.game.phase === 'inspect', null, { timeout: 90000 });
await page.waitForTimeout(1800);
await shot('2-inspect');
await page.keyboard.down('a'); await page.waitForTimeout(900); await page.keyboard.up('a'); await page.waitForTimeout(900);
await shot('3-inspect-A');
await page.keyboard.down('d'); await page.waitForTimeout(1800); await page.keyboard.up('d'); await page.waitForTimeout(900);
await shot('4-inspect-D');
await page.click('.ready-btn');
await page.waitForFunction(() => window.game.phase === 'auction', null, { timeout: 20000 });
await page.waitForTimeout(2500);
await shot('5-auction');
for (let i = 0; i < 200; i++) {
  const ph = await page.evaluate(() => window.game.phase);
  if (ph !== 'auction') break;
  const btn = page.locator('.bid-buttons .main');
  if (await btn.isEnabled()) await btn.click();
  await page.waitForTimeout(400);
}
await page.waitForFunction(() => window.game.phase === 'count' || window.game.phase === 'result', null, { timeout: 120000 });
// camera choices for every item of this locker
const cams = await page.evaluate(() => {
  const g = window.game; const res = [];
  for (const [uid, e] of g.contents.entries) {
    const p = g.contents.worldPos(uid); const fp = g.contents.footprint(uid);
    const base = new (p.constructor)(Math.max(-1.1, Math.min(1.1, p.x * 0.45)), Math.min(2.3, Math.max(1.25, p.y + fp[1] * 0.45 + 0.95)), Math.min(1.2, p.z + Math.max(2.3, fp[0] * 1.0 + fp[2] * 0.7 + 1.3)));
    const v0 = g.contents.visibility(uid, base);
    const c = g.appraisalCamera(uid, p, fp);
    res.push({ uid, hidden: e.placed.hidden, pos: [+p.x.toFixed(2), +p.z.toFixed(2)], base: +v0.toFixed(2), chosen: +g.contents.visibility(uid, c).toFixed(2), moved: c.distanceTo(base) > 0.01 });
  }
  return res;
});
console.log('cameras', JSON.stringify(cams));
await page.waitForTimeout(5000);
await shot('6-count');
await page.click('.ff');
await page.waitForFunction(() => window.game.phase === 'result', null, { timeout: 90000 });
await page.waitForTimeout(500);
await shot('7-result');
await page.click('.result .next');
await page.waitForFunction(() => document.querySelector('.banner')?.textContent?.includes('Down the row'), null, { timeout: 30000 });
for (let i = 0; i < 6; i++) { await page.waitForTimeout(550); await shot(`8-slide-${i}`); }
await page.waitForFunction(() => window.game.phase === 'inspect', null, { timeout: 90000 });
await page.waitForTimeout(1500);
await shot('9-round2-inspect');
console.log(JSON.stringify(await page.evaluate(() => ({ round: window.game.stats.round, unit: window.game.gs.facility.currentUnit, bots: [...window.game.crowd.rivals.keys()] }))));
console.log('errors:', errors.slice(0, 20));
await browser.close();
