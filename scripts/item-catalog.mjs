// Writes a self-contained catalog page of every item and container (their asset
// pack reveal cards embedded) to docs/item-catalog.html. Item data comes from the
// game's own modules, loaded through a headless browser.
// Usage: node scripts/item-catalog.mjs [outFile] [--fragment fragmentFile]
// outFile is a standalone HTML document (served on GitHub Pages); the optional
// fragment omits <!doctype>/<head> for hosts that wrap the page themselves.
// Set CHROME_PATH if Playwright's own Chromium is not installed.
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';

const args = process.argv.slice(2);
const fi = args.indexOf('--fragment');
const FRAGMENT = fi >= 0 ? args.splice(fi, 2)[1] : null;
const OUT = args[0] ?? 'docs/item-catalog.html';
const server = await createServer({ server: { port: 5199, host: '127.0.0.1' }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 480, height: 480 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('http://127.0.0.1:5199/tools/catalog/render.html');
await page.waitForFunction(() => window.catalog, null, { timeout: 60000 });
const meta = await page.evaluate(() => { const c = window.catalog; return { scale: c.scale, categories: c.categories, items: c.items, covers: c.covers, missing: c.missing }; });
if (meta.missing.length) console.warn('missing descriptions:', meta.missing.join(', '));
const cardData = (rel) => 'data:image/webp;base64,' + readFileSync(new URL('../assets/pack/' + rel, import.meta.url)).toString('base64');
for (const it of meta.items) it.img = cardData(`cards/${it.id}.webp`);
for (const cv of meta.covers) cv.img = cardData(cv.card);
await browser.close();
await server.close();
if (errors.length) { console.error(errors); process.exit(1); }

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const money = (n) => '$' + (n < 10 ? n.toFixed(2) : n < 100 ? n.toFixed(n % 1 ? 2 : 0) : Math.round(n).toLocaleString('en-US'));
const SIZE = { S: 'Small', M: 'Medium', L: 'Large', XL: 'Extra large' };
const order = Object.keys(meta.categories);
const byCat = order.map((c) => ({ c, label: meta.categories[c], items: meta.items.filter((i) => i.category === c).sort((a, b) => b.value[1] - a.value[1]) })).filter((g) => g.items.length);
const total = meta.items.length;
const priciest = [...meta.items].sort((a, b) => b.value[1] - a.value[1])[0];

const card = (it) => {
  const flags = [it.luxury && '<span class="flag warn">Can be a replica</span>', it.valuable && '<span class="flag">Fits in a safe</span>', it.soft && '<span class="flag">Soft goods</span>', it.stackable && '<span class="flag">Stackable</span>'].filter(Boolean).join('');
  return `<article class="item" data-cat="${it.category}" data-search="${esc((it.name + ' ' + it.id + ' ' + it.description + ' ' + meta.categories[it.category]).toLowerCase())}">
    <div class="plate"><img src="${it.img}" alt="${esc(it.name)} card" width="300" height="400" loading="lazy" decoding="async"></div>
    <div class="body">
      <div class="head"><h3>${esc(it.name)}</h3><code>${esc(it.id)}</code></div>
      <div class="value"><span class="lab">Base value</span><b>${money(it.value[0])} – ${money(it.value[1])}</b></div>
      <p>${esc(it.description)}</p>
      <dl>
        <div><dt>Size</dt><dd>${SIZE[it.size]}</dd></div>
        <div><dt>Rarity</dt><dd><span class="rar r-${it.rarity.replace(' ', '-').toLowerCase()}">${it.rarity}</span></dd></div>
        <div class="wide"><dt>Hidden under</dt><dd>${esc(it.covers.join(', '))}</dd></div>
        ${it.themes.length ? `<div class="wide"><dt>Shows up most in</dt><dd>${esc(it.themes.join(', '))}</dd></div>` : ''}
      </dl>
      ${flags ? `<div class="flags">${flags}</div>` : ''}
    </div>
  </article>`;
};

const html = `<title>Locker Wars Item Catalog</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700;800&family=Barlow:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>
/* Layout: an auction-house manifest. Category bands, each a grid of inventory tags with the render on a steel plate. */
:root {
  --bg: #ecebe8; --panel: #fbfbfa; --plate: #dcdad5; --ink: #1d1b18; --muted: #6b665f; --line: #d6d3cd;
  --accent: #d9620f; --accent-ink: #fff; --warn: #b3261e; --rar-c: #5f5a53; --rar-u: #2f6b4f; --rar-r: #2a5d9f; --rar-v: #8a3fb0;
  --display: "Barlow Condensed", "Arial Narrow", "Roboto Condensed", sans-serif;
  --body: "Barlow", "Segoe UI", system-ui, -apple-system, sans-serif;
  --mono: "IBM Plex Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace;
}
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {
  --bg: #141311; --panel: #1d1b19; --plate: #2a2724; --ink: #f0ede8; --muted: #a39d94; --line: #34302c;
  --accent: #ff8a2a; --accent-ink: #1a1208; --warn: #ff7a70; --rar-c: #b7b0a6; --rar-u: #5fd09a; --rar-r: #7fb2ff; --rar-v: #d39bf0; color-scheme: dark } }
:root[data-theme="dark"] {
  --bg: #141311; --panel: #1d1b19; --plate: #2a2724; --ink: #f0ede8; --muted: #a39d94; --line: #34302c;
  --accent: #ff8a2a; --accent-ink: #1a1208; --warn: #ff7a70; --rar-c: #b7b0a6; --rar-u: #5fd09a; --rar-r: #7fb2ff; --rar-v: #d39bf0; color-scheme: dark }
* { box-sizing: border-box; }
[hidden] { display: none !important; }
img { max-width: 100%; }
body { margin: 0; background: var(--bg); color: var(--ink); font: 15px/1.5 var(--body); padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); padding-block: 0 48px; }
.wrap { max-width: 1240px; margin: 0 auto; }
header.top { padding-block: 40px 20px; display: grid; gap: 18px; }
.eyebrow { font: 500 12px/1 var(--mono); letter-spacing: .14em; text-transform: uppercase; color: var(--accent); }
h1 { font: 800 clamp(40px, 7vw, 72px)/.92 var(--display); letter-spacing: -.01em; text-transform: uppercase; margin: 0; text-wrap: balance; }
.lede { max-width: 66ch; color: var(--muted); margin: 0; }
.lede b { color: var(--ink); font-weight: 600; }
.facts { display: flex; flex-wrap: wrap; gap: 8px 22px; font: 400 13px/1.3 var(--mono); color: var(--muted); }
.facts b { color: var(--ink); font-weight: 500; }
.bar { position: sticky; top: env(safe-area-inset-top, 0px); z-index: 5; background: var(--bg); padding-block: 12px; border-bottom: 1px solid var(--line); display: grid; gap: 10px; }
body::before { content: ""; position: fixed; inset: 0 0 auto; height: env(safe-area-inset-top, 0px); z-index: 10; background: var(--bg); }
.search { width: 100%; max-width: 420px; padding: 10px 14px; font: inherit; color: var(--ink); background: var(--panel); border: 1px solid var(--line); border-radius: 8px; }
.search:focus-visible, .chip:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.chips { display: flex; gap: 6px; overflow-x: auto; scrollbar-width: none; padding-bottom: 2px; }
.chips::-webkit-scrollbar { display: none; }
.chip { flex: none; font: 600 13px/1 var(--body); padding: 8px 12px; border-radius: 999px; border: 1px solid var(--line); background: var(--panel); color: var(--ink); cursor: pointer; }
.chip span { font: 400 11px var(--mono); color: var(--muted); margin-left: 4px; }
.chip[aria-pressed="true"] { background: var(--accent); color: var(--accent-ink); border-color: transparent; }
.chip[aria-pressed="true"] span { color: inherit; opacity: .8; }
section.cat { padding-top: 34px; }
.cat-head { display: flex; align-items: baseline; gap: 12px; border-bottom: 2px solid var(--ink); padding-bottom: 6px; margin-bottom: 16px; }
.cat-head h2 { font: 700 30px/1 var(--display); text-transform: uppercase; letter-spacing: .02em; margin: 0; }
.cat-head span { font: 400 12px var(--mono); color: var(--muted); }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 240px), 1fr)); gap: 14px; }
.item { background: var(--panel); border: 1px solid var(--line); border-radius: 10px; overflow: hidden; display: flex; flex-direction: column; min-width: 0; }
.plate { background: #e9b48d; aspect-ratio: 3 / 4; max-width: 100%; overflow: hidden; }
.plate img { width: 100%; height: 100%; object-fit: cover; display: block; }
.body { padding: 14px 16px 16px; display: grid; gap: 10px; align-content: start; flex: 1; }
.head { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; }
.head h3 { font: 700 21px/1.05 var(--display); letter-spacing: .01em; margin: 0; text-wrap: balance; }
.head code { font: 400 11px var(--mono); color: var(--muted); white-space: nowrap; }
.value { display: flex; align-items: baseline; gap: 8px; font-variant-numeric: tabular-nums; }
.value .lab, dt { font: 500 10px/1.2 var(--mono); letter-spacing: .12em; text-transform: uppercase; color: var(--muted); }
.value b { font: 600 17px var(--mono); color: var(--accent); }
.body p { margin: 0; font-size: 14px; }
dl { margin: 0; display: grid; grid-template-columns: 1fr 1fr; gap: 8px 12px; padding-top: 10px; border-top: 1px dashed var(--line); }
dl .wide { grid-column: 1 / -1; }
dd { margin: 2px 0 0; font-size: 13px; }
.rar { font-weight: 600; }
.r-common { color: var(--rar-c); } .r-uncommon { color: var(--rar-u); } .r-rare { color: var(--rar-r); } .r-very-rare { color: var(--rar-v); }
.flags { display: flex; flex-wrap: wrap; gap: 6px; }
.flag { font: 500 11px/1 var(--mono); padding: 5px 8px; border-radius: 4px; border: 1px solid var(--line); color: var(--muted); }
.flag.warn { color: var(--warn); border-color: color-mix(in srgb, var(--warn) 40%, transparent); }
.covers .item .body { gap: 8px; }
.empty { padding: 40px 0; color: var(--muted); }
.note { max-width: 70ch; color: var(--muted); font-size: 14px; margin: 10px 0 0; }
@media (prefers-reduced-motion: reduce) { * { scroll-behavior: auto !important; } }
</style>
<div class="wrap">
  <header class="top">
    <span class="eyebrow">Locker Wars · item bank</span>
    <h1>Everything that can turn up in a unit</h1>
    <p class="lede">All <b>${total} items</b> the game can place in a locker, with its reveal card from the asset pack, its base appraisal range in game dollars, how rare it is, and which containers can hide it.</p>
    <div class="facts"><span><b>${total}</b> items</span><span><b>${byCat.length}</b> categories</span><span><b>${meta.covers.length}</b> concealments</span><span>Highest ceiling <b>${esc(priciest.name)} · ${money(priciest.value[1])}</b></span><span>Values shown at <b>1/${Math.round(1 / meta.scale)}</b> street price</span></div>
  </header>
  <div class="bar">
    <label class="sr" for="q" style="position:absolute;left:-9999px">Search items</label>
    <input id="q" class="search" type="search" placeholder="Search by name, id or description" autocomplete="off">
    <div class="chips" role="toolbar" aria-label="Filter by category">
      <button class="chip" data-f="all" aria-pressed="true">All<span>${total}</span></button>
      ${byCat.map((g) => `<button class="chip" data-f="${g.c}" aria-pressed="false">${esc(g.label)}<span>${g.items.length}</span></button>`).join('')}
      <button class="chip" data-f="covers" aria-pressed="false">Concealments<span>${meta.covers.length}</span></button>
    </div>
  </div>
  ${byCat.map((g) => `<section class="cat" data-sec="${g.c}" id="${g.c}"><div class="cat-head"><h2>${esc(g.label)}</h2><span>${g.items.length} items · sorted by top value</span></div><div class="grid">${g.items.map(card).join('')}</div></section>`).join('')}
  <section class="cat covers" data-sec="covers" id="covers"><div class="cat-head"><h2>Concealments</h2><span>${meta.covers.length} cover types</span></div>
    <p class="note">Roughly a third to two thirds of each locker is concealed. A cover's size always matches the item under it, but its identity is only decided after the hammer falls.</p>
    <div class="grid" style="margin-top:14px">${meta.covers.map((c) => `<article class="item" data-cat="covers" data-search="${esc((c.name + ' ' + c.description).toLowerCase())}"><div class="plate"><img src="${c.img}" alt="${esc(c.name)} card" width="300" height="400" loading="lazy" decoding="async"></div><div class="body"><div class="head"><h3>${esc(c.name)}</h3><code>${c.kind}</code></div><p>${esc(c.description)}</p></div></article>`).join('')}</div>
  </section>
  <p class="empty" id="empty" hidden>No items match that search.</p>
</div>
<script>
(() => {
  const q = document.getElementById('q'), chips = [...document.querySelectorAll('.chip')], secs = [...document.querySelectorAll('section.cat')], empty = document.getElementById('empty');
  let f = 'all';
  const apply = () => {
    const t = q.value.trim().toLowerCase(); let shown = 0;
    for (const s of secs) {
      let n = 0;
      for (const it of s.querySelectorAll('.item')) { const ok = (f === 'all' || it.dataset.cat === f) && (!t || it.dataset.search.includes(t)); it.hidden = !ok; if (ok) n++; }
      s.hidden = n === 0; shown += n;
    }
    empty.hidden = shown > 0;
  };
  chips.forEach((c) => c.addEventListener('click', () => { f = c.dataset.f; chips.forEach((x) => x.setAttribute('aria-pressed', String(x === c))); apply(); }));
  q.addEventListener('input', apply);
  const h = location.hash.slice(1); const pre = chips.find((c) => c.dataset.f === h); if (pre) pre.click();
})();
</script>`;
const doc = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="description" content="Every item that can turn up in a Locker Wars storage unit, with renders, values and rarity.">
<link rel="icon" href="./favicon.svg" type="image/svg+xml">
</head>
<body>
${html}
</body>
</html>
`;
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, doc);
if (FRAGMENT) { mkdirSync(dirname(FRAGMENT), { recursive: true }); writeFileSync(FRAGMENT, html); }
console.log(`wrote ${OUT}: ${meta.items.length} items, ${meta.covers.length} covers, ${(html.length / 1024 / 1024).toFixed(2)} MB`);
