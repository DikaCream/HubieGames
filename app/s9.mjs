import { chromium } from 'playwright';
const b = await chromium.launch({ args: ['--use-gl=swiftshader','--enable-unsafe-swiftshader'] }); const W = ms => new Promise(r => setTimeout(r, ms)); const errs=[];
const p = await b.newPage({ viewport: { width: 412, height: 915 } }); p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
await p.goto('http://127.0.0.1:4180/'); await p.waitForSelector('.ov.slides', { timeout: 60000 }); await p.click('.cta'); await W(800); await p.click('.card-ov'); await W(600);
await p.click('.buy-btn.mob', { force: true }); await W(400); await p.screenshot({ path: '/workspace/housebets-slot/v9-buy-menu.png' });
console.log((await p.textContent('.tickets')).replace(/\s+/g,' ')); await p.click('.ticket.t1'); await W(200); console.log((await p.textContent('.confirm p'))); console.log(errs); await b.close();
