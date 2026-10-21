import { chromium } from 'playwright';
const O = '/workspace/housebets-slot/v6-';
const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const errs = []; const W = ms => new Promise(r => setTimeout(r, ms));
const idle = p => p.waitForFunction(() => !document.querySelector('.spin.busy') && !document.querySelector('.cine') && !document.querySelector('.bigwin'), null, { timeout: 240000 });
async function page(w, h, q = '', shots = false) { const p = await b.newPage({ viewport: { width: w, height: h } });
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto('http://127.0.0.1:4180/' + q); await p.waitForTimeout(150); if (shots) await p.screenshot({ path: O + 'loading.png' });
  await p.waitForSelector('.ov.slides', { timeout: 60000 });
  if (shots) for (let i = 0; i < 5; i++) { await W(400); await p.screenshot({ path: O + `slide${i + 1}.png` }); if (i < 4) await p.click('[aria-label=Next]'); }
  await p.click('.cta'); await W(900); if (shots) await p.screenshot({ path: O + 'membership.png' }); await p.click('.card-ov'); await W(500);
  await p.evaluate(() => { window.__ov = { out: 0, big: 0, nowin: 0 }; new MutationObserver(ms => { for (const m of ms) for (const n of m.addedNodes) if (n.nodeType === 1) { if (n.matches?.('.cine.out')) window.__ov.out++; if (n.matches?.('.bigwin')) window.__ov.big++; }
    if (/NO WIN/.test(document.querySelector('.msgbar')?.textContent || '')) window.__ov.nowin++; }).observe(document.body, { childList: true, subtree: true, characterData: true }); });
  return p; }
const bal = (p, v) => p.evaluate(v => window.postMessage({ target: 'crooked-house', type: 'setBalance', balance: v }, '*'), v);
const p = await page(1280, 760, '?showcase', true);
await p.screenshot({ path: O + 'base.png' });
const times = []; for (let i = 0; i < 6; i++) { const t0 = Date.now(); await p.click('.spin', { force: true }); if (i === 0) { await W(350); await p.screenshot({ path: O + 'spin-blur.png' }); } await idle(p); times.push(Date.now() - t0); }
console.log('round ms', times);
await p.click('[aria-label=Turbo]'); const tt = []; for (let i = 0; i < 4; i++) { const t0 = Date.now(); await p.click('.spin', { force: true }); await idle(p); tt.push(Date.now() - t0); } console.log('turbo ms', tt); await p.click('[aria-label=Turbo]');
for (const [k, f] of [['Anticipation', 'anticipation'], ['Win', 'win'], ['Double Wild', 'double-wild'], ['Cell: Crew', 'cell-crew'], ['Cell: Boss Wild', 'cell-wild'], ['Cell: Double Down', 'cell-split'], ['Cell: Stack Up', 'cell-expand'], ['Sealed Tip', 'sealed-tip']]) {
  const t0 = Date.now(); await p.click(`.showcase >> text="${k}"`); await W(k === 'Anticipation' ? 2000 : k === 'Sealed Tip' ? 1300 : 3300); await p.screenshot({ path: O + f + '.png' }); await idle(p); console.log(k, Date.now() - t0, 'ms'); }
for (const [i, n] of ['nice-take', 'big-score', 'house-money', 'own-the-night'].entries()) { await p.click(`.showcase >> text=${['Nice Take', 'Big Score', 'House Money', 'Own the Night'][i]}`); await W(2000 + 2000 * i); await p.screenshot({ path: O + 'bigwin-' + n + '.png' }); await p.click('.bigwin'); await W(300); await p.click('.bigwin').catch(() => {}); await idle(p); }
for (const i of [0, 1, 2]) { await p.click(`.showcase >> text="Intro ${i + 1}"`); await W(900); await p.screenshot({ path: O + `bonus-intro-${i + 1}.png` }); await p.click('.cine'); await idle(p); }
await p.click('.showcase >> text="End: zero"'); await W(900); await p.screenshot({ path: O + 'bonus-end-zero.png' }); await p.click('.cine'); await idle(p);
await p.click('.showcase >> text="End: big"'); await W(4600); await p.screenshot({ path: O + 'bonus-end-big.png' }); await p.click('.cine'); await idle(p);
await p.click('[aria-label="Game rules"]'); for (const [i, t] of ['features', 'examples', 'paytable', 'rules'].entries()) { await p.click(`.tabs button >> nth=${i}`); if (t === 'paytable') await p.click('.pay >> nth=0'); await W(250); await p.screenshot({ path: O + 'rules-' + t + '.png' }); } await p.click('.modal .x');
// buys
for (const tier of [1, 2, 3]) { await bal(p, 50000); await W(200); await p.click('.buy-btn', { force: true }); await W(300); if (tier === 1) await p.screenshot({ path: O + 'buy-menu.png' });
  await p.click(`.ticket.t${tier}`); await W(250); if (tier === 1) { await p.screenshot({ path: O + 'buy-confirm.png' }); }
  await p.click('.confirm .cta'); await W(250); if (tier === 1) await p.screenshot({ path: O + 'buy-armed.png' });
  await p.evaluate(() => window.__ov = { out: 0, big: 0, nowin: 0 });
  await p.click('.spin', { force: true }); await p.waitForSelector('.cine.in', { timeout: 60000 }); await W(500); await p.screenshot({ path: O + `buy${tier}-intro.png` }); await p.click('.cine');
  await p.waitForSelector('.app.bonus', { timeout: 20000 }); await W(4000); await p.screenshot({ path: O + `buy${tier}-bonus.png` });
  await p.waitForSelector('.cine.out', { timeout: 300000 }); await W(2500); await p.screenshot({ path: O + `buy${tier}-end.png` }); await p.click('.cine'); await W(200); await p.click('.cine').catch(() => {}); await idle(p); await W(1500);
  const ov = await p.evaluate(() => window.__ov); console.log('buy', tier, 'overlays', JSON.stringify(ov), 'win', await p.textContent('.meter.r b')); if (ov.out !== 1 || ov.big !== 0 || ov.nowin) errs.push('celebration count wrong ' + JSON.stringify(ov)); }
// autoplay with stops
await bal(p, 905); await W(200); await p.click("[aria-label=Autoplay]"); await W(300); await p.click(".autom .opts >> nth=0 >> text=\"10\""); await p.click(".autom .opts >> nth=2 >> text=\"$900.00\""); await p.screenshot({ path: O + 'autoplay-menu.png' });
await p.click('.autom .cta'); await W(1500); await p.screenshot({ path: O + 'autoplay-running.png' });
await p.waitForFunction(() => !document.querySelector('.spin.auto'), null, { timeout: 300000 }); console.log('autoplay stop msg', await p.textContent('.msgbar'), 'balance', await p.textContent('.meter b'));
// autoplay through big win: start 10 and inject big via showcase is separate; verify bigwin auto collect
await bal(p, 1000); await p.click('[aria-label=Autoplay]'); await p.click('.autom .opts >> nth=0 >> text="25"'); await p.click('.autom .opts >> nth=2 >> text="Off"'); await p.click('.autom .cta');
await W(25000); const left = await p.textContent('.spin').catch(() => ''); console.log('autoplay after 25s left', left); await p.click('[aria-label=Autoplay]'); await idle(p);
await p.click('[aria-label="Game rules"]'); await p.click('.tabs button >> nth=3'); await p.click('text=Open provably fair'); await W(300); await p.screenshot({ path: O + 'fair.png' }); await p.click('.modal .x');
for (const [w, h, n] of [[412, 915, 'mobile-412'], [360, 740, 'mobile-360'], [650, 520, 'frame-650'], [650, 900, 'frame-650-tall']]) {
  const q = await page(w, h, ''); await q.screenshot({ path: O + n + '.png' }); await q.click('.spin', { force: true }); await W(500); await q.screenshot({ path: O + n + '-spin.png' }); await idle(q);
  const ov = await q.evaluate(() => { const r = e => document.querySelector(e)?.getBoundingClientRect(); const bw = r('.board-wrap'), hud = r('.hud'), m = r('.msgbar');
    return { board: [bw.top, bw.bottom, bw.left, bw.right].map(Math.round), hud: Math.round(hud.top), msgBottom: Math.round(m.bottom), overflowX: document.documentElement.scrollWidth > innerWidth }; });
  console.log(n, JSON.stringify(ov)); if (ov.msgBottom > ov.hud + 1 || ov.overflowX) errs.push('layout overlap ' + n);
  await q.click('.buy-btn', { force: true }); await W(300); await q.screenshot({ path: O + n + '-buy.png' }); await q.click('.modal .x');
  await q.click('[aria-label="Game rules"]'); await W(300); await q.screenshot({ path: O + n + '-rules.png' }); await q.close(); }
console.log('ERRORS', errs.length, errs.slice(0, 10)); await b.close();
