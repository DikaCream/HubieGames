import { chromium } from 'playwright';
const b = await chromium.launch();
for (const [w,h,n] of [[360,740,'360'],[412,915,'mobile'],[460,1000,'460'],[1440,900,'desktop']]) {
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: w<500?2:1 });
  p.on('pageerror', e => console.log('ERR', e.message));
  await p.goto('http://localhost:4173/'); await p.waitForSelector('.ov.intro .cta', { timeout: 60000 }); await p.waitForTimeout(2200);
  const r = await p.evaluate(() => { const c = document.querySelector('.ov.intro .cta').getBoundingClientRect(); const o = document.querySelector('.ov.intro'); return [Math.round(c.bottom), innerHeight, o.scrollHeight <= o.clientHeight]; });
  console.log(n, r);
  await p.screenshot({ path: `/workspace/housebets-slot/v4-intro-${n}.png` });
  if (n==='mobile') { await p.click('.ov.intro'); await p.waitForTimeout(800); console.log('dismiss', await p.locator('.ov.intro').count()); }
  await p.close();
}
await b.close();
