import { chromium } from 'playwright';
const [w, h] = [+process.argv[2], +process.argv[3]]; const OUT = `/workspace/housebets-slot/v11-${w}-`;
const W = ms => new Promise(r => setTimeout(r, ms));
const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true });
const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
const bad = [];
async function check(tag) {
  const r = await p.evaluate(() => {
    const out = []; const vis = e => { const s = getComputedStyle(e); const r = e.getBoundingClientRect(); return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0; };
    if (document.documentElement.scrollWidth > innerWidth) out.push('scrollWidth ' + document.documentElement.scrollWidth);
    for (const e of document.querySelectorAll('.game *, .modal *')) { if (!vis(e) || e.closest('.bg,.world,.bubble')) continue; const r = e.getBoundingClientRect(); if (r.right > innerWidth + 1 || r.left < -1 || r.bottom > innerHeight + 1 || r.top < -1) out.push('outside ' + e.tagName + '.' + e.className); }
    const board = document.querySelector('.board-wrap').getBoundingClientRect();
    const ov = (a, c) => Math.min(a.right, c.right) - Math.max(a.left, c.left) > 1 && Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top) > 1;
    const bar = [...document.querySelectorAll('.hud2 button, .hud2 .cell, .msgbar, .chips, .side-r > *, .side-l .hubie img')].filter(vis);
    for (const e of bar) if (ov(e.getBoundingClientRect(), board)) out.push('overlaps board: ' + e.className);
    const btns = [...document.querySelectorAll('.ctrls button, .strip > *')].filter(vis);
    for (let i = 0; i < btns.length; i++) for (let j = i + 1; j < btns.length; j++) if (ov(btns[i].getBoundingClientRect(), btns[j].getBoundingClientRect())) out.push('bar overlap ' + btns[i].className + ' X ' + btns[j].className);
    const hub = document.querySelector('.side-l .hubie img'); if (hub && vis(hub)) for (const s of ['.msgbar', '.hud2']) if (ov(hub.getBoundingClientRect(), document.querySelector(s).getBoundingClientRect())) out.push('hubie overlaps ' + s);
    return out; });
  for (const x of r) bad.push(tag + ': ' + x);
}
const shot = n => p.screenshot({ path: OUT + n + '.png' });
async function settle(onFrame) { const t0 = Date.now(); while (Date.now() - t0 < 300000) { if (onFrame && await onFrame()) onFrame = null;
  const c = await p.$('.cine'); if (c) { await W(1500); await c.tap({ force: true }).catch(() => {}); await W(300); continue; }
  const bw = await p.$('.bigwin'); if (bw) { await W(1200); await bw.tap({ force: true }).catch(() => {}); await W(300); continue; }
  if (!(await p.$('.spin.busy'))) return; await W(150); } throw new Error('timeout'); }
await p.goto('http://127.0.0.1:4180/'); await p.waitForSelector('.ov.slides', { timeout: 60000 }); await p.tap('.cta'); await W(800); await p.tap('.card-ov'); await W(1000);
await check('idle'); await shot('idle');
let won = false;
for (let i = 0; i < 25 && !won; i++) { await p.tap('.spin'); await W(200); await settle(async () => { if (await p.$('.msgbar.way')) { await W(600); await check('win'); await shot('win'); won = true; return true; } }); }
for (let k = 0; k < 15; k++) { const d = await p.$('.pm[aria-label="Lower bet"]:not([disabled])'); if (!d) break; await d.tap(); await W(50); }
await p.tap('.buy2'); await W(500); await check('buy'); await shot('buy-menu');
await p.tap('.ticket.t1'); await W(300); if (await p.$('.confirm .cta')) await p.tap('.confirm .cta'); await W(300);
await p.tap('.spin', { force: true }); let n = 0;
await settle(async () => { if (await p.$('.app.bonus') && !(await p.$('.cine')) && (await p.$('.msgbar.way') || ++n > 400)) { await W(500); await check('bonus'); await shot('bonus'); return true; } });
await check('after'); 
console.log(w, 'ERR', JSON.stringify(errs), 'BAD', bad.length ? '\n' + [...new Set(bad)].join('\n') : 'none'); await b.close();
