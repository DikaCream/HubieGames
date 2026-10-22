import { chromium } from 'playwright';
const W = ms => new Promise(r => setTimeout(r, ms));
const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const p = await b.newPage({ viewport: { width: 393, height: 873 }, deviceScaleFactor: 2.75, isMobile: true, hasTouch: true });
await p.goto(process.env.URL + '?force=perf'); await p.waitForSelector('.ov.slides', { timeout: 60000 }); await p.tap('.cta', { force: true }); await W(1500);
const cdp = await p.context().newCDPSession(p); await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
await p.tap('.buy2', { force: true }); await W(600); await p.tap('.ticket.t1', { force: true }); await W(400); await p.tap('.confirm .cta', { force: true });
for (let t = 0; t < 60 && !(await p.$('.cine')); t++) await W(300); await W(1500); await p.evaluate(() => document.querySelector('.cine')?.click()); await W(3000);
const ev = []; cdp.on('Tracing.dataCollected', d => ev.push(...d.value));
const done = new Promise(r => cdp.once('Tracing.tracingComplete', r));
await cdp.send('Tracing.start', { traceConfig: { includedCategories: ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'blink', 'cc', 'gpu', 'viz'] } }); await W(8000); await cdp.send('Tracing.end'); await done;
const main = ev.filter(e => e.ph === 'X' && e.dur); const pids = new Map(); for (const e of main) { const k = e.pid + ':' + e.tid; pids.set(k, (pids.get(k) || 0) + e.dur); }
const thr = new Map(ev.filter(e => e.name === 'thread_name').map(e => [e.pid + ':' + e.tid, e.args.name]));
console.log([...pids].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `${thr.get(k) || k} ${Math.round(v / 1000)}ms`).join('\n'));
const top = new Map(); for (const e of main) { const t = thr.get(e.pid + ':' + e.tid) || ''; if (!/CrRendererMain/.test(t)) continue; top.set(e.name, (top.get(e.name) || 0) + e.dur); }
[...top].sort((a, b) => b[1] - a[1]).slice(0, 25).forEach(([k, v]) => console.log(Math.round(v / 1000) + 'ms', k));
const fr = ev.filter(e => e.name === 'DrawFrame' || e.name === 'BeginMainThreadFrame'); console.log('frames', fr.length);
await b.close();
