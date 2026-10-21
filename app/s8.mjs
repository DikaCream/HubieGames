import { chromium } from 'playwright';
const O = '/workspace/housebets-slot/v8-'; const b = await chromium.launch({ args: ['--use-gl=swiftshader','--enable-unsafe-swiftshader'] }); const W = ms => new Promise(r => setTimeout(r, ms)); const errs=[];
const p = await b.newPage({ viewport: { width: 1280, height: 800 } }); p.on('pageerror', e => errs.push(e.message));
await p.goto('http://127.0.0.1:4180/?showcase'); await p.waitForSelector('.ov.slides', { timeout: 60000 }); await p.click('.cta'); await W(800); await p.click('.card-ov'); await W(600);
const idle = () => p.waitForFunction(() => !document.querySelector('.spin.busy'), null, { timeout: 60000 });
for (const [k, f, t] of [['Win', 'win-hit', 3500], ["Hubie's Tip", 'feature-hubies-tip', 3900]]) { await p.click(`.showcase >> text="${k}"`); await W(t); await p.screenshot({ path: O + f + '.png' }); await idle(); }
console.log(errs); await b.close();
