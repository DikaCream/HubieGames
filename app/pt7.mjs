import { chromium } from 'playwright';
const O = '/workspace/housebets-slot/v7-'; const b = await chromium.launch({ args: ['--use-gl=swiftshader','--enable-unsafe-swiftshader'] }); const errs = []; const W = ms => new Promise(r => setTimeout(r, ms));
const idle = p => p.waitForFunction(() => !document.querySelector('.spin.busy') && !document.querySelector('.cine') && !document.querySelector('.bigwin'), null, { timeout: 300000 });
async function page(w, h, q = '') { const p = await b.newPage({ viewport: { width: w, height: h } }); p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto('http://127.0.0.1:4180/' + q); await p.waitForSelector('.ov.slides', { timeout: 60000 }); await p.screenshot({ path: O + (q ? 'slide1-sc' : 'slide1') + '.png' }); await p.click('.cta'); await W(800); await p.click('.card-ov'); await W(600); return p; }
const bal = (p, v) => p.evaluate(v => window.postMessage({ target: 'crooked-house', type: 'setBalance', balance: v }, '*'), v);
const p = await page(1280, 800); await p.screenshot({ path: O + 'desktop-base.png' });
const lg = await p.$('.logo'); await lg.screenshot({ path: O + 'logo.png' });
// 100 rapid clicks
for (let i = 0; i < 100; i++) { await p.click('.spin', { force: true, delay: 0 }); await W(40 + (i % 7) * 30); if (i % 10 === 9) await p.keyboard.press('Space'); }
await idle(p); await W(500);
const geo = await p.evaluate(() => { const h = document.querySelector('.hud').getBoundingClientRect(); return { sx: scrollX, sw: document.documentElement.scrollWidth, appL: document.querySelector('.game').scrollLeft, hudL: Math.round(h.left), hudR: Math.round(h.right), iw: innerWidth }; });
console.log('after 100 clicks', JSON.stringify(geo)); if (geo.sx || geo.appL || geo.hudL < 0 || geo.hudR > geo.iw) errs.push('shift ' + JSON.stringify(geo));
await p.screenshot({ path: O + 'desktop-after-100.png' });
// turbo timing
await p.click('[aria-label=Turbo]'); const tt = []; for (let i = 0; i < 4; i++) { const t0 = Date.now(); await p.click('.spin', { force: true }); await idle(p); tt.push(Date.now() - t0); } console.log('turbo ms', tt, 'spinMs', await p.evaluate(() => window.__spinMs.slice(-4))); await p.click('[aria-label=Turbo]');
// rules
await p.click('[aria-label="Game rules"]'); for (const [i, t] of ['features', 'examples', 'paytable', 'rules'].entries()) { await p.click(`.tabs button >> nth=${i}`); if (t === 'paytable') await p.click('.pay >> nth=7'); await W(250); await p.screenshot({ path: O + 'rules-' + t + '.png' }); } await p.click('.modal .x');
// symbols on board (showcase page)
const s = await page(1280, 800, '?showcase'); await s.click('.showcase >> text="Cell: Split"'); await W(3300); const bd = await s.$('.board-wrap'); await bd.screenshot({ path: O + 'symbols.png' }); await idle(s);
await s.click('.showcase >> text="End: big"'); await W(5500); await s.screenshot({ path: O + 'bonus-outro-showcase.png' }); console.log('outro label', await s.textContent('.cine-tier'), await s.textContent('.cine-total')); await s.click('.cine'); await idle(s);
await s.click('.showcase >> text="Intro 3"'); await W(900); await s.screenshot({ path: O + 'bonus-intro-3.png' }); await s.click('.cine'); await idle(s);
// real buy with counter sync check
await bal(p, 50000); await W(200); await p.click('.buy-btn.desk', { force: true }); await W(300); await p.screenshot({ path: O + 'buy-menu.png' }); await p.click('.ticket.t2'); await W(200); await p.click('.confirm .cta'); await W(200);
await p.click('.spin', { force: true }); await p.waitForSelector('.cine.in', { timeout: 60000 }); await p.click('.cine'); await p.waitForSelector('.app.bonus');
let mism = 0, samples = 0, zeroLeft = 0; const t0 = Date.now();
while (!(await p.$('.cine.out')) && Date.now() - t0 < 300000) { const r = await p.evaluate(() => [document.querySelector('.meter.r b')?.textContent, document.querySelector('.m-amt')?.textContent, document.querySelector('.spins-left b')?.textContent, document.querySelector('.msgbar')?.textContent]);
  if (r[1]) { samples++; if (r[0] !== r[1]) mism++; } if (r[2] === '0' && !(await p.$('.cine'))) zeroLeft++; await W(120); }
console.log('counter samples', samples, 'mismatch', mism, 'zero-left samples', zeroLeft);
await W(5000); await p.screenshot({ path: O + 'bonus-outro.png' }); console.log('real outro', await p.textContent('.cine-tier'), await p.textContent('.cine-total').catch(() => '')); await p.click('.cine'); await idle(p);
// autoplay loss stop
await bal(p, 1000); await W(200); await p.click('[aria-label=Autoplay]'); await W(300); await p.click('.autom .opts >> nth=0 >> text="50"'); await p.click('.autom .opts >> nth=2 >> button >> nth=1'); await p.screenshot({ path: O + 'autoplay-menu.png' }); await p.click('.autom .cta');
await p.waitForFunction(() => !document.querySelector('.spin.auto'), null, { timeout: 400000 }); await idle(p); console.log('autoplay stopped:', await p.textContent('.msgbar'), await p.textContent('.meter b'));
for (const [w, h] of [[412, 915], [360, 740]]) { const q = await page(w, h); await q.screenshot({ path: O + `mobile-${w}-base.png` }); await q.click('.buy-btn.mob', { force: true }); await W(300); await q.screenshot({ path: O + `mobile-${w}-buy.png` }); await q.close(); }
console.log('ERRORS', errs.length, errs.slice(0, 8)); await b.close();
