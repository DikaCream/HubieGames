import { chromium } from 'playwright';
const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] }); const errs = [];
const p = await b.newPage({ viewport: { width: 412, height: 915 } }); p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
await p.goto('http://127.0.0.1:4180/'); await p.waitForSelector('.ov.intro', { timeout: 60000 }); await p.screenshot({ path: '/workspace/housebets-slot/v5-intro-mobile.png' }); await p.click('.ov.intro'); await p.waitForTimeout(500);
for (let i = 0; i < 3; i++) { await p.click('.spin'); await p.waitForFunction(() => !document.querySelector('.spin.busy'), null, { timeout: 30000 }); }
console.log('spins', await p.evaluate(() => window.__spinMs), 'errors', errs); await b.close();
