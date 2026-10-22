// node perf.mjs <tag> [bonuses]  : 393x873 mobile, 4x CPU throttle, buys MIDNIGHT RUN N times + forced free spin big win, samples metrics each second
import { chromium } from 'playwright';
const tag = process.argv[2], N = +(process.argv[3] ?? 3);
const W = ms => new Promise(r => setTimeout(r, ms));
const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required', '--enable-precise-memory-info', '--js-flags=--expose-gc'] });
const p = await b.newPage({ viewport: { width: 393, height: 873 }, deviceScaleFactor: 2.75, isMobile: true, hasTouch: true });
const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.addInitScript(() => { window.__lt = []; new PerformanceObserver(l => l.getEntries().forEach(e => window.__lt.push(e.duration))).observe({ type: 'longtask', buffered: true });
  window.__fr = 0; const f = () => { window.__fr++; requestAnimationFrame(f); }; requestAnimationFrame(f);
  const AC = window.AudioContext; let nodes = 0; window.__an = () => nodes; for (const m of ['createOscillator', 'createGain', 'createBufferSource', 'createBiquadFilter']) { const o = AC.prototype[m]; AC.prototype[m] = function () { nodes++; return o.apply(this, arguments); }; } });
const cdp = await p.context().newCDPSession(p); await cdp.send('Performance.enable');
await p.goto((process.env.URL || 'http://127.0.0.1:4180/') + '?force=perf'); await p.waitForSelector('.ov.slides', { timeout: 60000 }); await p.tap('.cta', { force: true }); await W(1500);
for (let i = 0; i < 6; i++) { await p.tap('.pm[aria-label="Lower bet"]', { force: true }); await W(80); }
await p.evaluate(() => document.querySelector('.ic.turbo').click()); await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
const samples = []; let phase = 'idle'; let lastFr = 0, lastT = Date.now(), ltSeen = 0;
async function sample() { const m = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(x => [x.name, x.value]));
  const d = await p.evaluate(() => { const h = window.__hr || {}; const g = h.gsap; let tw = 0; try { tw = g.globalTimeline.getChildren(true, true, false).length; } catch {} 
    let pix = 0; const walk = o => { pix++; (o.children || []).forEach(walk); }; try { walk(h.board.app.stage); } catch {}
    return { fr: window.__fr, lt: window.__lt.slice(), tw, pix, fxp: h.fx ? h.fx.ps.length : 0, bp: h.board ? h.board.parts.length : 0, an: window.__an(), dom: document.getElementsByTagName('*').length }; });
  const now = Date.now(); const fps = (d.fr - lastFr) / ((now - lastT) / 1000); lastFr = d.fr; lastT = now; const lts = d.lt.slice(ltSeen); ltSeen = d.lt.length;
  samples.push({ phase, fps: +fps.toFixed(1), lt: lts.length, ltMs: Math.round(lts.reduce((a, b) => a + b, 0)), heap: +(m.JSHeapUsedSize / 1e6).toFixed(1), nodes: m.Nodes, dom: d.dom, listeners: m.JSEventListeners, tw: d.tw, pix: d.pix, fxp: d.fxp, bp: d.bp, an: d.an }); }
const fs = await import('fs'); const iv = setInterval(() => sample().then(() => fs.writeFileSync(`/workspace/housebets-slot/perf-${tag}.json`, JSON.stringify({ samples }))).catch(() => {}), 1000);
await W(3000);
const heapAt = [];
for (let k = 0; k < N; k++) {
  phase = 'bonus' + (k + 1);
  await p.tap('.buy2', { force: true }); await W(600); await p.tap('.ticket.t1', { force: true }); await W(400); if (await p.$('.confirm .chk input')) { if (!(await p.$eval('.confirm .chk input', e => e.checked))) await p.tap('.confirm .chk input', { force: true }); } if (await p.$('.confirm .cta')) await p.tap('.confirm .cta', { force: true }); await W(500);
  for (let t = 0; t < 400; t++) { if (await p.$('.cine')) await p.evaluate(() => document.querySelector('.cine')?.click()); if (await p.$('.bigwin .bw-hint')) { const h = await p.textContent('.bigwin .bw-hint').catch(() => ''); if (/COLLECT/.test(h)) await p.evaluate(() => document.querySelector('.bigwin')?.click()); }
    if (!(await p.$('.spin.busy'))) break; await W(700); }
  phase = 'bigwin' + (k + 1); const run = p.evaluate(() => window.__hrDemo('fbig3')); for (let t = 0; t < 40 && !(await p.$('.bigwin .bw-hint')); t++) await W(300); await W(9000); await p.evaluate(() => document.querySelector('.bigwin')?.click()); await W(800); await p.evaluate(() => document.querySelector('.bigwin')?.click()); await run;
  phase = 'rest'; await W(2500); await p.evaluate(() => window.gc && window.gc()); await W(500); await sample(); heapAt.push(samples.at(-1));
}
clearInterval(iv);
const agg = ph => { const s = samples.filter(x => x.phase.startsWith(ph)); if (!s.length) return null; const f = s.map(x => x.fps).sort((a, b) => a - b); return { n: s.length, fpsAvg: +(f.reduce((a, b) => a + b, 0) / f.length).toFixed(1), fpsP10: f[Math.floor(f.length * .1)], longTasks: s.reduce((a, b) => a + b.lt, 0), longMs: s.reduce((a, b) => a + b.ltMs, 0), maxTw: Math.max(...s.map(x => x.tw)), maxPix: Math.max(...s.map(x => x.pix)), maxFx: Math.max(...s.map(x => x.fxp)), maxBp: Math.max(...s.map(x => x.bp)), maxDom: Math.max(...s.map(x => x.dom)) }; };
const out = { tag, bonus: agg('bonus'), bigwin: agg('bigwin'), afterEach: heapAt.map(x => ({ heap: x.heap, nodes: x.nodes, dom: x.dom, listeners: x.listeners, tw: x.tw, pix: x.pix, audioCreated: x.an })), errs };
console.log(JSON.stringify(out, null, 1)); (await import('fs')).writeFileSync(`/workspace/housebets-slot/perf-${tag}.json`, JSON.stringify({ out, samples }, null, 1));
await b.close();
