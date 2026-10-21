import { chromium } from 'playwright';
const O = '/workspace/housebets-slot/v7-'; const b = await chromium.launch({ args: ['--use-gl=swiftshader','--enable-unsafe-swiftshader'] }); const errs = [];
async function page(w, h, q = '') { const p = await b.newPage({ viewport: { width: w, height: h } }); p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto('http://127.0.0.1:4180/' + q); await p.waitForSelector('.ov.slides', { timeout: 60000 }); return p; }
for (const [w, h] of [[412, 915], [360, 740]]) { const p = await page(w, h); await p.click('.cta'); await p.waitForTimeout(900); await p.screenshot({ path: O + `membership-${w}.png` }); await p.click('.card-ov'); await p.waitForTimeout(700);
  await p.screenshot({ path: O + `mobile-${w}-base.png` }); const r = await p.evaluate(() => { const e = document.querySelector('.buy-btn.mob').getBoundingClientRect(); return [e.left, e.right, e.top, e.bottom, innerWidth, document.documentElement.scrollWidth].map(Math.round); }); console.log('mob buy', w, r); await p.close(); }
console.log('ERR', errs);
await b.close();
