// v12 playtest: node v12.mjs <w> <h> <tag> [spins] [buys]
import { chromium } from 'playwright';
const [w, h, tag] = [+process.argv[2], +process.argv[3], process.argv[4]]; const NSP = +(process.argv[5] ?? 30); const NB = +(process.argv[6] ?? 3);
const mobile = w < 600; const OUT = `/workspace/housebets-slot/v12-${tag}-`;
const W = ms => new Promise(r => setTimeout(r, ms));
const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile });
const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
const bad = []; const shots = new Set(); const log = [];
const shot = async n => { if (shots.has(n)) return; shots.add(n); await p.screenshot({ path: OUT + n + '.png' }); };
const click = sel => mobile ? p.tap(sel, { force: true }) : p.click(sel, { force: true });
async function check(t) {
  const r = await p.evaluate(() => {
    const out = []; const vis = e => { const s = getComputedStyle(e); const r = e.getBoundingClientRect(); return s.display !== 'none' && s.visibility !== 'hidden' && +s.opacity > 0 && r.width > 0 && r.height > 0; };
    if (document.documentElement.scrollWidth > innerWidth) out.push('scrollWidth ' + document.documentElement.scrollWidth);
    for (const e of document.querySelectorAll('.game *, .modal *, .bigwin .bw-text *, .bigwin .bw-hubie, .bigwin .bw-logo, .cine .c-wrap *')) { if (!vis(e) || e.closest('.bg,.world,.bubble')) continue; const r = e.getBoundingClientRect(); if (r.right > innerWidth + 1 || r.left < -1 || r.bottom > innerHeight + 1 || r.top < -1) out.push('outside ' + e.tagName + '.' + e.className + ` ${r.left|0},${r.top|0},${r.right|0},${r.bottom|0}`); }
    const ov = (a, c) => Math.min(a.right, c.right) - Math.max(a.left, c.left) > 1 && Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top) > 1;
    const bwT = document.querySelector('.bigwin'); if (bwT) { const els = ['.bw-logo', '.bw-hubie', '.bw-title', '.bw-amt', '.bw-hint'].map(s => document.querySelector(s)).filter(e => e && vis(e)); for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) if (ov(els[i].getBoundingClientRect(), els[j].getBoundingClientRect())) out.push('bigwin overlap ' + els[i].className + ' X ' + els[j].className); }
    if (document.querySelector('.cine') || bwT) return out;
    const board = document.querySelector('.board-wrap').getBoundingClientRect();
    const bar = [...document.querySelectorAll('.hud2 button, .hud2 .cell, .msgbar, .chips, .side-r > *, .side-l .hubie img')].filter(vis);
    for (const e of bar) if (ov(e.getBoundingClientRect(), board)) out.push('overlaps board: ' + e.className);
    const btns = [...document.querySelectorAll('.ctrls button, .strip > *')].filter(vis);
    for (let i = 0; i < btns.length; i++) for (let j = i + 1; j < btns.length; j++) if (ov(btns[i].getBoundingClientRect(), btns[j].getBoundingClientRect())) out.push('bar overlap ' + btns[i].className + ' X ' + btns[j].className);
    const hub = document.querySelector('.side-l .hubie img'); if (hub && vis(hub)) for (const s of ['.msgbar', '.hud2']) if (ov(hub.getBoundingClientRect(), document.querySelector(s).getBoundingClientRect())) out.push('hubie overlaps ' + s);
    return out; });
  for (const x of r) bad.push(t + ': ' + x);
}
const hubieVisible = () => p.evaluate(() => { if (document.querySelector('.app.covered, .cine, .bigwin')) return true; const i = document.querySelector('.side-l .hubie img'); if (!i) return false; const r = i.getBoundingClientRect(); const s = getComputedStyle(i); return r.width > 30 && r.height > 30 && s.visibility !== 'hidden' && +s.opacity > .2 && getComputedStyle(i.closest('.side-l')).display !== 'none'; });
async function settle(o = {}) { const t0 = Date.now(); let last = '', lastT = Date.now(); let hubMiss = 0, hubSeen = 0;
  while (Date.now() - t0 < 1800000) {
    const st = await p.evaluate(() => (document.querySelector('.msgbar')?.textContent || '') + '|' + (document.querySelector('.spins-left')?.textContent || '') + '|' + !!document.querySelector('.cine') + !!document.querySelector('.bigwin'));
    if (st !== last) { last = st; lastT = Date.now(); } else if (Date.now() - lastT > 90000) { await p.screenshot({ path: '/tmp/stuck-' + tag + '.png' }); console.log('ERR so far', JSON.stringify(errs)); throw new Error('stuck ' + st); }
    if (o.win && await p.$('.msgbar.way')) { await W(500); await check('win'); await shot(o.win); o.win = null; }
    if (await p.$('.app.bonus') && !(await p.$('.cine')) && !(await p.$('.bigwin'))) { if (await hubieVisible()) hubSeen++; else { hubMiss++; if (hubMiss === 1) await p.screenshot({ path: OUT + 'hubie-missing-' + (o.tag || '') + '.png' }); }
      if (o.spin && await p.$('.msgbar.way')) { await W(400); await check('bonus ' + o.tag); await shot(o.spin); o.spin = null; } }
    const cine = await p.$('.cine');
    if (cine) { if (await p.$('.cine.out')) { await W(3800); await check('end ' + o.tag); if (o.end) await shot(o.end); log.push('end text: ' + await p.evaluate(() => document.querySelector('.cine')?.innerText.replace(/\n/g, ' / '))); }
      else { await W(900); if (o.intro) await shot(o.intro); } await p.evaluate(() => document.querySelector('.cine')?.click()); await W(400); continue; }
    const bw = await p.$('.bigwin'); if (bw) { await W(2500); await check('bigwin'); log.push('bigwin ' + await p.evaluate(() => document.querySelector('.bigwin')?.innerText.replace(/\n/g, ' / '))); await shot('bigwin-live-' + (o.tag || 'base')); await p.evaluate(() => document.querySelector('.bigwin')?.click()); await W(400); continue; }
    if (!(await p.$('.spin.busy'))) { if (o.tag) log.push(`hubie in ${o.tag}: seen ${hubSeen} missing ${hubMiss}`); return; } await W(150); }
  throw new Error('settle timeout'); }
const enter = async q => { await p.goto('http://127.0.0.1:4180/' + q); await p.waitForSelector('.ov.slides', { timeout: 60000 }); await click('.cta'); await W(800); await click('.card-ov'); await W(1200); };
await enter('');
await check('idle'); await shot('base');
let wins = 0;
for (let i = 0; i < NSP; i++) { await click('.spin'); await W(200); const o = { win: wins < 1 ? 'win' : null }; await settle(o); if (!o.win) wins++; }
log.push(`normal spins ${NSP}, balance ${await p.textContent('.strip .cell b')}`);
await check('after spins');
for (const t of [1, 2, 3].slice(0, NB)) {
  await click('.buy2'); await W(500); if (t === 1) { await check('buy'); await shot('buy-menu'); }
  const dis = await p.$eval(`.ticket.t${t}`, e => e.disabled); if (dis) { log.push('ticket ' + t + ' disabled'); await click('.modal .x'); continue; }
  await click(`.ticket.t${t}`); await W(300); if (await p.$('.confirm .cta')) await click('.confirm .cta'); await W(300);
  await click('.spin'); await settle({ tag: 'bonus' + t, intro: `bonus${t}-intro`, spin: `bonus${t}-spin`, end: `bonus${t}-end` }); await W(500); await check('after bonus ' + t);
}
// forced big win tiers and end screens (debug hook only exists with ?force)
await enter('?force=tier');
const demo = k => p.evaluate(k => window.__hrDemo(k), k);
for (const [k, n] of [['big0', 1], ['big1', 2], ['big2', 3], ['big3', 4]]) {
  const run = demo(k); const seen = new Set();
  for (let i = 0; i < 200; i++) { const t = await p.evaluate(() => { const b = document.querySelector('.bigwin'); return b ? b.dataset.t + '|' + document.querySelector('.bw-title').textContent : null; });
    if (t) { const [ti, name] = t.split('|'); if (!seen.has(ti)) { seen.add(ti); await W(1300); await check('tier ' + ti); await shot(`tier${ti}` + (n - 1 > +ti ? `-in-${k}` : '')); log.push(`${k}: reached ${name}`); } if (seen.size === n) break; }
    await W(100); }
  for (let i = 0; i < 40 && await p.$('.bigwin'); i++) { await W(1500); await p.evaluate(() => document.querySelector('.bigwin')?.click()); } await run;
}
for (const [ti, band] of [[0, 0], [0, 2], [1, 1], [1, 3], [2, 2], [2, 4]]) { const run = demo(`end${ti}${band}`); await W(5200); await check(`end demo ${ti}${band}`); await shot(`end-${['afterhours', 'midnight', 'takeover'][ti]}-band${band}`); await p.evaluate(() => document.querySelector('.cine')?.click()); await run; }
console.log(tag, w + 'x' + h, '\n' + log.join('\n'), '\nERR', JSON.stringify(errs), '\nBAD', bad.length ? '\n' + [...new Set(bad)].join('\n') : 'none'); await b.close();
