// Headless smoke test: drives a full round (intro → cut → inspect → auction → count-up → result → stats)
// against a running preview server and saves screenshots. Usage: node scripts/walkthrough.mjs [--mobile]
// Requires: npm run build && npm run preview (port 4173) and the playwright devDependency.
// Set CHROME_PATH to point at a Chromium binary if Playwright's own download is missing.
import { chromium } from 'playwright';
const OUT = process.env.SHOTS_DIR ?? 'shots';
import { mkdirSync } from 'node:fs'; mkdirSync(OUT, { recursive: true });
const mobile = process.argv.includes('--mobile');
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext(mobile ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: 1100, height: 680 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
await page.goto('http://127.0.0.1:4173/?seed=demo42&q=high');
await page.waitForTimeout(1500);
const tag = mobile ? 'm' : 'd';
await page.screenshot({ path: `${OUT}/${tag}-0-intro.png` });
await page.click('.start');
await page.waitForTimeout(2200);
await page.screenshot({ path: `${OUT}/${tag}-1-cut.png` });
await page.waitForTimeout(4500);
await page.screenshot({ path: `${OUT}/${tag}-2-open.png` });
// inspection: flashlight on, drag camera
await page.waitForFunction(() => window.game.phase === 'inspect', null, { timeout: 15000 });
await page.click('.flash-btn');
await page.mouse.move(550, 340); await page.mouse.down(); await page.mouse.move(330, 320, { steps: 10 }); await page.mouse.up();
await page.waitForTimeout(1200);
await page.screenshot({ path: `${OUT}/${tag}-3-inspect.png` });
await page.click('.ready-btn');
await page.waitForFunction(() => window.game.phase === 'auction', null, { timeout: 5000 });
await page.waitForTimeout(3000);
await page.screenshot({ path: `${OUT}/${tag}-4-auction.png` });
// bid incrementally until we win
for (let i = 0; i < 200; i++) {
  const st = await page.evaluate(() => ({ phase: window.game.phase }));
  if (st.phase !== 'auction') break;
  const btn = page.locator('.bid-buttons .main');
  if (await btn.isEnabled()) await btn.click();
  await page.waitForTimeout(400);
}
await page.waitForFunction(() => window.game.phase === 'sold' || window.game.phase === 'count' || window.game.phase === 'result', null, { timeout: 120000 });
await page.screenshot({ path: `${OUT}/${tag}-5-sold.png` });
await page.waitForFunction(() => window.game.phase === 'count' || window.game.phase === 'result', null, { timeout: 60000 });
await page.waitForTimeout(4000);
await page.screenshot({ path: `${OUT}/${tag}-6-count.png` });
await page.waitForTimeout(9000);
await page.screenshot({ path: `${OUT}/${tag}-7-count2.png` });
await page.click('.ff');
await page.waitForFunction(() => window.game.phase === 'result', null, { timeout: 90000 });
await page.waitForTimeout(600);
await page.screenshot({ path: `${OUT}/${tag}-8-result.png` });
await page.click('.result .stats');
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/${tag}-9-stats.png` });
console.log(JSON.stringify(await page.evaluate(() => ({ balance: window.game.stats.balance, round: window.game.stats.round, hist: window.game.stats.history[0] })), null, 1));
console.log('errors:', errors.slice(0, 20));
await browser.close();
