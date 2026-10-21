import { chromium } from 'playwright';
const O = '/workspace/housebets-slot/v5-';
const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const errs = [];
async function page(w, h, q = '') { const p = await b.newPage({ viewport: { width: w, height: h } });
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto('http://127.0.0.1:4180/' + q); await p.waitForSelector('.ov.intro', { timeout: 60000 }); await p.click('.ov.intro'); await p.waitForTimeout(600); return p; }
const W = ms => new Promise(r => setTimeout(r, ms));
const p = await page(650, 900, '?showcase');
await p.screenshot({ path: O + 'base.png' });
// spin timing
const times = [];
for (let i = 0; i < 6; i++) { const t0 = Date.now(); await p.click('.spin'); if (i === 0) { await W(380); await p.screenshot({ path: O + 'spin-blur.png' }); }
  await p.waitForFunction(() => !document.querySelector('.spin.busy'), null, { timeout: 30000 }); times.push(Date.now() - t0); }
console.log('normal round ms', times);
await p.click('[aria-label=Turbo]'); const tt = [];
for (let i = 0; i < 5; i++) { const t0 = Date.now(); await p.click('.spin'); await p.waitForFunction(() => !document.querySelector('.spin.busy'), null, { timeout: 30000 }); tt.push(Date.now() - t0); }
console.log('turbo round ms', tt); console.log('spin ms (click to all reels landed)', await p.evaluate(() => window.__spinMs)); await p.click('[aria-label=Turbo]');
// anticipation
await p.click('.showcase >> text=Anticipation'); await p.waitForSelector('.msgbar.antic', { timeout: 30000 }); await W(500); await p.screenshot({ path: O + 'anticipation.png' }); await p.waitForFunction(() => !document.querySelector('.spin.busy'), null, { timeout: 30000 });
await p.click('.showcase >> text=Win'); await p.waitForSelector('.msgbar.win', { timeout: 30000 }); await W(900); await p.screenshot({ path: O + 'win.png' }); await p.waitForFunction(() => !document.querySelector('.spin.busy'), null, { timeout: 30000 });
await p.click('.showcase >> text=Shove Wild'); await p.waitForSelector('.msgbar.win', { timeout: 30000 }); await W(700); await p.screenshot({ path: O + 'shove-wild.png' }); await p.waitForFunction(() => !document.querySelector('.spin.busy'), null, { timeout: 30000 });
const names = ['big', 'mega', 'crooked', 'kingpin'];
for (let i = 0; i < 4; i++) { await p.click(`.showcase >> text=${['Big', 'Mega', 'Crooked', 'Kingpin'][i]}`); await W(1900 * (i + 1) + 600); await p.screenshot({ path: O + 'bigwin-' + names[i] + '.png' }); await p.click('.bigwin'); await W(400); await p.click('.bigwin').catch(() => {}); await W(500); }
// guide over fx check
await p.click('[aria-label="Game guide"]'); await W(300); await p.screenshot({ path: O + 'guide.png' }); await p.click('.modal .x');
// bonus buys each tier
for (const tier of [1, 2, 3]) {
  await p.evaluate(() => window.postMessage({ target: 'crooked-house', type: 'setBalance', balance: 5000 }, '*')); await W(200);
  await p.click('[aria-label="Bonus buy"]'); await W(300); if (tier === 1) await p.screenshot({ path: O + 'buy-menu.png' });
  await p.click(`.buy-card.t${tier}`); await p.waitForSelector('.cine.in', { timeout: 20000 }); await W(1800);
  if (tier === 2) await p.screenshot({ path: O + 'bonus-intro.png' });
  await p.click('.cine'); await W(500);
  // check overlap: cine gone
  console.log('cine gone', await p.locator('.cine').count() === 0);
  await p.click('[aria-label="Auto spin bonus"]');
  let shot = false;
  for (let t = 0; t < 600; t++) { await W(200);
    if (!shot && t === 15 && await p.locator('.bonus-hud').count()) { await p.screenshot({ path: O + (tier === 3 ? 'bonus-kingpin.png' : tier === 1 ? 'bonus.png' : 'bonus-inside.png') }); shot = true; }
    if (await p.locator('.cine.out').count()) { await W(1900); if (tier === 1) await p.screenshot({ path: O + 'bonus-outro.png' }); await p.click('.cine'); }
    if (await p.locator('.bigwin').count()) { await W(1500); await p.click('.bigwin'); await W(300); await p.click('.bigwin').catch(() => {}); }
    if (!(await p.locator('.spin.busy').count()) && !(await p.locator('.bonus-hud').count()) && !(await p.locator('.cine').count())) break; }
  console.log('tier', tier, 'done', await p.locator('.meter b').first().textContent());
}
// overlap check: msgbar below board
console.log('layout650', await p.evaluate(() => { const r = s => document.querySelector(s).getBoundingClientRect(); const b = r('.board-wrap'), m = r('.msgbar'), h = r('.hud'); return { boardBottom: b.bottom, msgTop: m.top, hudBottom: h.bottom, vh: innerHeight }; }));
await p.close();
for (const [w, h, n] of [[412, 915, 'mobile'], [360, 740, 'mobile-360'], [1440, 900, 'desktop']]) {
  const q = await page(w, h); await q.screenshot({ path: O + n + '.png' });
  console.log(n, await q.evaluate(() => { const r = s => document.querySelector(s).getBoundingClientRect(); return { board: r('.board-wrap').bottom, msg: r('.msgbar').top, hud: r('.hud').bottom, vh: innerHeight, sw: document.documentElement.scrollWidth }; }));
  if (n === 'mobile') { await q.click('[aria-label="Game guide"]'); await W(300); await q.screenshot({ path: O + 'mobile-guide.png' }); await q.click('.modal .x');
    await q.click('[aria-label="Bonus buy"]'); await q.click('.buy-card.t1'); await q.waitForSelector('.cine.in'); await W(1800); await q.screenshot({ path: O + 'mobile-bonus-intro.png' }); await q.click('.cine'); await W(1500); await q.screenshot({ path: O + 'mobile-bonus.png' }); }
  await q.close();
}
console.log('ERRORS', errs.length, errs.slice(0, 8));
await b.close();
