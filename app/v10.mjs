import { chromium } from 'playwright';
const OUT = '/workspace/housebets-slot/';
const W = ms => new Promise(r => setTimeout(r, ms));
const mode = process.argv[2] || 'mobile'; const N = +(process.argv[3] || 30);
const vp = mode === 'mobile' ? { width: 430, height: 932 } : { width: 1280, height: 800 };
const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: vp, deviceScaleFactor: mode === 'mobile' ? 2 : 1, isMobile: mode === 'mobile', hasTouch: mode === 'mobile' });
const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
const shots = new Set(); const pre = OUT + 'v10-' + (mode === 'mobile' ? 'mobile-' : 'desktop-');
async function shot(name) { if (shots.has(name)) return; shots.add(name); await p.screenshot({ path: pre + name + '.png' }); console.log('shot', name); }
const overl = [];
async function checkOverlap(tag) {
  const r = await p.evaluate(() => {
    const vis = e => { const s = getComputedStyle(e); const r = e.getBoundingClientRect(); return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0; };
    const groups = ['.strip > *', '.ctrls .l > *, .ctrls .c > *, .ctrls .r > *', '.chips > *', '.side-r > *', '.msgbar, .board-wrap, .hud2, .chips, .side-r'];
    const bad = [];
    for (const g of groups) { const els = [...document.querySelectorAll(g)].filter(vis); for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) { const a = els[i].getBoundingClientRect(), c = els[j].getBoundingClientRect();
      const ox = Math.min(a.right, c.right) - Math.max(a.left, c.left), oy = Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top);
      if (ox > 1 && oy > 1) bad.push(`${els[i].className} X ${els[j].className} (${ox|0}x${oy|0})`); } }
    for (const e of document.querySelectorAll('.game *')) { if (!vis(e)) continue; const r = e.getBoundingClientRect(); if (r.right > innerWidth + 1 || r.left < -1 || r.bottom > innerHeight + 1) { if (!e.closest('.bg,.world')) bad.push('offscreen ' + e.className + ' ' + (r.left|0) + ',' + (r.right|0) + ',' + (r.bottom|0)); } }
    return bad; });
  if (r.length) overl.push(tag + ': ' + [...new Set(r)].join(' | '));
}
async function settle(opt = {}) {
  const t0 = Date.now(); let outSeen = 0;
  let last = '', lastT = Date.now();
  while (Date.now() - t0 < 600000) {
    const st = await p.evaluate(() => (document.querySelector('.msgbar')?.textContent || '') + '|' + (document.querySelector('.spins-left')?.textContent || '') + '|' + !!document.querySelector('.cine') + !!document.querySelector('.bigwin'));
    if (st !== last) { last = st; lastT = Date.now(); } else if (Date.now() - lastT > 60000) { console.log('STUCK', st); await p.screenshot({ path: '/tmp/stuck.png' }); throw new Error('stuck'); }
    if (opt.win && !shots.has(opt.win) && await p.$('.msgbar.way')) { await W(700); await shot(opt.win); await checkOverlap('win'); }
    if (opt.mult && await p.$('.msgbar.mult')) { await W(250); await shot(opt.mult); await checkOverlap('mult'); }
    if (opt.bonus && await p.$('.app.bonus .msgbar.way')) await shot(opt.bonus);
    const cine = await p.$('.cine');
    if (cine) { const out = await p.$('.cine.out'); if (out) { if (!outSeen) { outSeen = Date.now(); } if (Date.now() - outSeen > 3500) { if (opt.end) await shot(opt.end); await cine.click({ force: true }).catch(() => {}); } }
      else { if (opt.intro) await shot(opt.intro); await W(800); await cine.click({ force: true }).catch(() => {}); } await W(300); continue; }
    const bw = await p.$('.bigwin'); if (bw) { await W(1500); await bw.click({ force: true }).catch(() => {}); await W(300); continue; }
    if (!(await p.$('.spin.busy'))) return; await W(150);
  }
  throw new Error('settle timeout');
}
await p.goto('http://127.0.0.1:4180/'); await p.waitForSelector('.ov.slides', { timeout: 60000 }); await p.click('.cta'); await W(800); await p.click('.card-ov'); await W(800);
await shot('base'); await checkOverlap('base');
if (mode === 'mobile') await p.locator('.hud2').screenshot({ path: OUT + 'v10-mobile-bottom-bar.png' });
let wins = 0;
for (let i = 0; i < N; i++) { await p.click('.spin'); await W(200); await settle({ win: 'win-' + Math.min(wins, 2) }); if (shots.has('win-' + Math.min(wins, 2))) wins++; }
console.log('normal spins done, win shots', wins);
for (let k = 0; k < 15; k++) { const d = await p.$('.pm[aria-label="Lower bet"]:not([disabled])'); if (!d) break; await d.click(); await W(60); }
for (const t of [1, 2, 3].slice(0, +(process.argv[4] || 3))) {
  await p.click('.buy2'); await W(500); if (t === 1) { await shot('buy-menu'); await checkOverlap('buy'); }
  await p.click(`.ticket.t${t}`); await W(300); if (await p.$('.confirm .cta')) await p.click('.confirm .cta'); await W(300);
  await p.click('.spin', { force: true }); await settle({ intro: `bonus${t}-intro`, mult: t === 1 ? 'bonus-mult' : `bonus${t}-mult`, bonus: `bonus${t}-spin`, end: `bonus${t}-end` });
  await W(500); await checkOverlap('after bonus ' + t);
}
await shot('final');
console.log('ERRORS', JSON.stringify(errs)); console.log('OVERLAPS', overl.length ? '\n' + [...new Set(overl)].join('\n') : 'none');
await b.close();
