import { chromium } from 'playwright';
const O = '/workspace/housebets-slot/v8-'; const b = await chromium.launch({ args: ['--use-gl=swiftshader','--enable-unsafe-swiftshader'] }); const errs = []; const W = ms => new Promise(r => setTimeout(r, ms));
const idle = p => p.waitForFunction(() => !document.querySelector('.spin.busy') && !document.querySelector('.cine') && !document.querySelector('.bigwin'), null, { timeout: 300000 });
async function page(w, h, q = '') { const p = await b.newPage({ viewport: { width: w, height: h } }); p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto('http://127.0.0.1:4180/' + q); await p.waitForSelector('.ov.slides', { timeout: 60000 }); await p.click('.cta'); await W(800); await p.click('.card-ov'); await W(600); return p; }
const bal = (p, v) => p.evaluate(v => window.postMessage({ target: 'crooked-house', type: 'setBalance', balance: v }, '*'), v);
const s = await page(1280, 800, '?showcase'); await s.screenshot({ path: O + 'desktop-base.png' });
const ms = []; for (let i = 0; i < 5; i++) { await s.click('.spin', { force: true }); await idle(s); } console.log('normal spin ms', await s.evaluate(() => window.__spinMs));
const shots = [['Win', 'win-hit', 2600], ["Hubie's Tip", 'feature-hubies-tip', 3400], ['Owl Raid', 'feature-owl-raid', 3300], ['Lucky Cell', 'feature-lucky-cell', 3000], ['Roaming x2', 'multiplier-roaming', 3600], ['House Meter', 'feature-house-meter', 4200], ['Double Agent', 'feature-double-agent', 4200], ['Last Call', 'feature-last-call', 1300], ["Hubie's Round", 'feature-hubies-round', 1300], ['Retrigger', 'feature-retrigger', 5200], ['Mystery Symbol', 'multiplier-mystery', 1500]];
for (const [k, f, t] of shots) { const t0 = Date.now(); await s.click(`.showcase >> text="${k}"`); await W(t); await s.screenshot({ path: O + f + '.png' }); await idle(s); console.log(k, Date.now() - t0, 'ms'); }
await s.click('.showcase >> text="End: big"'); await W(5000); await s.screenshot({ path: O + 'bonus-outro.png' }); console.log('outro text', (await s.textContent('.cine')).replace(/\s+/g, ' ')); await s.click('.cine'); await idle(s);
await s.click('[aria-label="Game rules"]'); await W(300); await s.screenshot({ path: O + 'rules-features.png' }); await s.click('.modal .x');
for (const [w, h] of [[460, 1000], [412, 915], [360, 740]]) { const q = await page(w, h); await q.screenshot({ path: O + `mobile-${w}-base.png` });
  if (w === 460) { await bal(q, 50000); await W(200); await q.click('.buy-btn.mob', { force: true }); await W(300); await q.click('.ticket.t1'); await W(200); await q.click('.confirm .cta'); await q.click('.spin', { force: true });
    await q.waitForSelector('.cine.in', { timeout: 60000 }); await q.click('.cine'); await q.waitForSelector('.app.bonus'); await W(600); await q.screenshot({ path: O + 'mobile-bonus-topbar.png' }); await W(500); await q.screenshot({ path: O + 'mobile-bonus-spinning.png' });
    const ov = await q.evaluate(() => { const r = s => document.querySelector(s)?.getBoundingClientRect(); const a = [...document.querySelectorAll('.side-l > *, .side-r > *')].map(e => e.getBoundingClientRect()).filter(x => x.width);
      let o = 0; for (let i = 0; i < a.length; i++) for (let j = i + 1; j < a.length; j++) { const A = a[i], B = a[j]; if (A.left < B.right - 1 && B.left < A.right - 1 && A.top < B.bottom - 1 && B.top < A.bottom - 1) o++; } return o; });
    console.log('top bar overlaps', ov); if (ov) errs.push('topbar overlap');
    await q.waitForSelector('.cine.out', { timeout: 300000 }); await W(4000); await q.screenshot({ path: O + 'mobile-bonus-outro.png' }); console.log('mobile outro', (await q.textContent('.cine')).replace(/\s+/g, ' ')); await q.click('.cine'); await idle(q); }
  await q.close(); }
console.log('ERRORS', errs.length, errs.slice(0, 8)); await b.close();
