import { chromium } from 'playwright';
const W = ms => new Promise(r => setTimeout(r, ms));
const args = JSON.parse(process.env.ARGS);
const b = await chromium.launch({ args });
const p = await b.newPage({ viewport: { width: 393, height: 873 }, deviceScaleFactor: 2.75, isMobile: true, hasTouch: true });
await p.goto(process.env.URL); await p.waitForSelector('.ov.slides', { timeout: 60000 }); await p.tap('.cta', { force: true }); await W(2000);
const gl = await p.evaluate(() => { const c = document.createElement('canvas').getContext('webgl'); const e = c.getExtension('WEBGL_debug_renderer_info'); return e ? c.getParameter(e.UNMASKED_RENDERER_WEBGL) : '?'; });
const f = () => p.evaluate(() => new Promise(r => { let n = 0; const t0 = performance.now(); const s = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(s); else r(n / 2); }; requestAnimationFrame(s); }));
console.log(gl.slice(0,10), 'base', await f()); for (const css of (process.env.CSS||'').split('|').filter(Boolean)) { await p.addStyleTag({ content: css }); await W(500); console.log(css.slice(0,60), await f()); } await p.tap('.spin', { force: true }); await W(300); console.log('spin fps', await f()); await b.close();
