// v3 capture: base, win, shove wild, bonus intro, bonus, big win, mobile. Needs `npx vite preview --port 4173`.
import { chromium } from 'playwright';
const OUT = '/workspace/housebets-slot/v3-';
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
const has = s => p.$(s).then(Boolean); const W = ms => p.waitForTimeout(ms);
await p.goto('http://localhost:4173/?showcase'); await W(150); await p.screenshot({ path: OUT + 'loading.png' });
await p.waitForSelector('.intro', { timeout: 30000 }); await W(1300); await p.screenshot({ path: OUT + 'intro.png' });
await p.click('.intro'); await W(800); await p.screenshot({ path: OUT + 'base.png' });
async function finishRound() { for (let t = 0; t < 600 && await has('.spin.busy'); t++) { if (await has('.ov')) await p.click('.ov').catch(() => {}); await W(250); } }
let gotWin = false, gotWild = false;
for (let i = 0; i < 80 && !(gotWin && gotWild); i++) {
  await p.click('button.spin');
  for (let t = 0; t < 80 && await has('.spin.busy'); t++) {
    await W(100);
    if (!gotWild && await has('.wild-reel')) { await W(900); await p.screenshot({ path: OUT + 'shove-wild.png' }); gotWild = true; }
    if (!gotWin && await has('.winbar.on')) { await W(350); await p.screenshot({ path: OUT + 'win.png' }); gotWin = true; }
    if (await has('.ov')) break;
  }
  await finishRound();
}
console.log('win', gotWin, 'wild', gotWild);
// buy BREAK-IN
await p.click('button.buy'); await W(500); await p.screenshot({ path: OUT + 'buy-menu.png' });
await p.click('.buy-card.t1'); await p.waitForSelector('.bonus-intro', { timeout: 15000 }); await W(1300); await p.screenshot({ path: OUT + 'bonus-intro.png' });
await p.click('.ov'); let shot = false;
for (let t = 0; t < 400 && await has('.spin.busy'); t++) { await W(200);
  if (!shot && await has('.bonus-hud') && (await has('.wild-reel') || await has('.winbar.on'))) { await W(500); await p.screenshot({ path: OUT + 'bonus.png' }); shot = true; }
  if (await has('.ov.bonus-intro.end')) { await W(1200); await p.screenshot({ path: OUT + 'bonus-end.png' }); await p.click('.ov'); }
  if (await has('.ov.bigwin')) { await W(2500); await p.screenshot({ path: OUT + 'bigwin.png' }); await p.click('.ov'); await W(300); await p.click('.ov').catch(() => {}); } }
if (!shot) await p.screenshot({ path: OUT + 'bonus.png' });
// lower bet & buy KINGPIN for a guaranteed big-win sequence
for (let i = 0; i < 3; i++) { await p.click('.hud-c .arrow >> nth=0'); await W(100); }
await p.click('button.buy'); await W(400); await p.click('.buy-card.t3'); await p.waitForSelector('.bonus-intro', { timeout: 15000 }); await W(500); await p.click('.ov');
let bw = false;
for (let t = 0; t < 900 && await has('.spin.busy'); t++) { await W(200);
  if (t === 25) await p.screenshot({ path: OUT + 'bonus-kingpin.png' });
  if (await has('.ov.bonus-intro.end')) await p.click('.ov');
  if (await has('.ov.bigwin') && !bw) { await W(3000); await p.screenshot({ path: OUT + 'bigwin.png' }); bw = true; await p.click('.ov'); await W(300); await p.click('.ov').catch(() => {}); } }
if (!bw) { await p.evaluate(() => window.__bigwin(260)); await W(4200); await p.screenshot({ path: OUT + 'bigwin.png' }); await p.click('.ov'); await W(300); await p.click('.ov').catch(() => {}); bw = 'showcase'; }
console.log('bigwin', bw);
await p.setViewportSize({ width: 390, height: 844 }); await W(600); await p.screenshot({ path: OUT + 'mobile.png' });
await p.click('button.spin').catch(() => {}); await W(2500); await p.screenshot({ path: OUT + 'mobile-spin.png' });
console.log('errors', errs);
await b.close();
