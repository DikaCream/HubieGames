import { chromium } from 'playwright'; import fs from 'fs';
const b = await chromium.launch(); const p = await b.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
await p.goto('http://127.0.0.1:4180/?force=x'); await p.waitForFunction(() => window.__hr, null, { timeout: 20000 });
const wav = (f, sr = 44100) => { const n = f.length, buf = Buffer.alloc(44 + n * 2); buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVEfmt ', 8); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(sr, 24); buf.writeUInt32LE(sr * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 2, 40); for (let i = 0; i < n; i++) buf.writeInt16LE(Math.max(-32767, Math.min(32767, f[i] * 32767 | 0)), 44 + i * 2); return buf; };
const jobs = (process.argv[2] ? JSON.parse(process.argv[2]) : null) ?? [['base', 80, 1], ['bonus0', 32, 1], ['bonus1', 32, 2], ['bonus2', 32, 2], ['win0', 8, 3], ['win1', 8, 3], ['win2', 8, 3], ['win3', 8, 3], ['end', 12, 1]];
for (const [m, s, i] of jobs) {
  const t0 = Date.now(); const b64 = await p.evaluate(async ([m, s, i]) => { const f = await window.__hr.renderMusic(m, s, i); const u = new Uint8Array(f.buffer); let o = ''; for (let j = 0; j < u.length; j += 32768) o += String.fromCharCode(...u.subarray(j, j + 32768)); return btoa(o); }, [m, s, i]); const bb = Buffer.from(b64, 'base64'); const f = new Float32Array(bb.buffer, bb.byteOffset, bb.length / 4); console.log(' render ms', Date.now() - t0);
  fs.writeFileSync(`/workspace/housebets-slot/audio/v16-${m}.wav`, wav(f));
  let peak = 0, ss = 0, clip = 0; for (const v of f) { const x = Math.abs(v); peak = Math.max(peak, x); ss += v * v; if (x > .999) clip++; }
  // onset detection: energy flux per 11.6 ms hop, then tempo by autocorrelation of flux 60..160 bpm
  const hop = 512, E = []; for (let j = 0; j + hop < f.length; j += hop) { let e = 0; for (let k = 0; k < hop; k++) e += f[j + k] ** 2; E.push(Math.sqrt(e / hop)); }
  const fl = E.map((e, j) => Math.max(0, e - (E[j - 1] ?? 0))); const thr = fl.reduce((a, b) => a + b, 0) / fl.length * 2.5; let ons = 0; for (let j = 1; j < fl.length - 1; j++) if (fl[j] > thr && fl[j] >= fl[j - 1] && fl[j] > fl[j + 1]) ons++;
  let best = 0, bl = 0; const fr = 44100 / hop; for (let bpm = 80; bpm <= 160; bpm += .5) { const lag = Math.round(fr * 60 / bpm); let c = 0; for (let j = lag; j < fl.length; j++) c += fl[j] * fl[j - lag]; if (c > best) { best = c; bl = bpm; } }
  // section loudness per 8 bars for base to show structure
  console.log(m, `${s}s peak ${peak.toFixed(2)} rms ${(Math.sqrt(ss / f.length)).toFixed(3)} clipped ${clip} onsets/s ${(ons / s).toFixed(1)} tempo≈${bl}`);
}
console.log('errors', errs); await b.close();
