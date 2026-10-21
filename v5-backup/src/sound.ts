// Layered procedural audio (WebAudio): ambient bed + SFX. No external audio assets.
let ctx: AudioContext | null = null, master: GainNode, music: GainNode, sfxBus: GainNode;
let muted = false, bedNodes: AudioNode[] = [], tension: GainNode | null = null;
export const isMuted = () => muted;
function ac() {
  if (!ctx) {
    ctx = new AudioContext(); master = ctx.createGain(); master.gain.value = 0.8; master.connect(ctx.destination);
    const comp = ctx.createDynamicsCompressor(); comp.connect(master);
    music = ctx.createGain(); music.gain.value = 0.35; music.connect(comp);
    sfxBus = ctx.createGain(); sfxBus.gain.value = 0.9; sfxBus.connect(comp);
  }
  return ctx;
}
export function setMuted(m: boolean) { muted = m; if (ctx) master.gain.setTargetAtTime(m ? 0 : 0.8, ctx.currentTime, 0.05); }
function noiseBuf(sec = 2) { const c = ac(); const b = c.createBuffer(1, c.sampleRate * sec, c.sampleRate); const d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; return b; }
function osc(freq: number, type: OscillatorType, t0: number, dur: number, vol: number, dest: AudioNode, glide?: number) {
  const c = ac(), o = c.createOscillator(), g = c.createGain(); o.type = type; o.frequency.setValueAtTime(freq, t0);
  if (glide) o.frequency.exponentialRampToValueAtTime(glide, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(dest); o.start(t0); o.stop(t0 + dur + 0.05);
}
function noise(t0: number, dur: number, vol: number, freq: number, q = 1, type: BiquadFilterType = 'bandpass', dest?: AudioNode) {
  const c = ac(), s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
  s.buffer = noiseBuf(Math.max(0.1, dur)); f.type = type; f.frequency.value = freq; f.Q.value = q;
  g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  s.connect(f).connect(g).connect(dest ?? sfxBus); s.start(t0); s.stop(t0 + dur + 0.05);
}
/** Ambient bed: rain noise + dark detuned drone + slow pulse. */
export function startAmbient() {
  const c = ac(); if (c.state === 'suspended') c.resume(); if (bedNodes.length) return;
  const rain = c.createBufferSource(); rain.buffer = noiseBuf(4); rain.loop = true;
  const rf = c.createBiquadFilter(); rf.type = 'highpass'; rf.frequency.value = 2500; const rg = c.createGain(); rg.gain.value = 0.12;
  rain.connect(rf).connect(rg).connect(music); rain.start();
  const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 220; lp.connect(music);
  for (const f of [55, 55.4, 82.4]) { const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; const g = c.createGain(); g.gain.value = 0.09; o.connect(g).connect(lp); o.start(); bedNodes.push(o); }
  const lfo = c.createOscillator(); lfo.frequency.value = 0.08; const lg = c.createGain(); lg.gain.value = 120; lfo.connect(lg).connect(lp.frequency); lfo.start();
  tension = c.createGain(); tension.gain.value = 0; tension.connect(music);
  const t = c.createOscillator(); t.type = 'square'; t.frequency.value = 110; const tf = c.createBiquadFilter(); tf.type = 'lowpass'; tf.frequency.value = 600; t.connect(tf).connect(tension); t.start();
  bedNodes.push(rain, lfo, t);
}
export function setTension(on: boolean) { if (tension && ctx) tension.gain.setTargetAtTime(on ? 0.08 : 0, ctx.currentTime, 0.3); }
const now = () => ac().currentTime;
export const sfx = {
  click: () => osc(900, 'square', now(), 0.04, 0.05, sfxBus),
  spinStart: () => { const t = now(); noise(t, 0.35, 0.25, 800, 0.7, 'lowpass'); osc(120, 'sawtooth', t, 0.3, 0.12, sfxBus, 60); },
  reelStop: (i: number) => { const t = now(); noise(t, 0.12, 0.5, 300 + i * 40, 1.2, 'lowpass'); osc(70, 'sine', t, 0.18, 0.4, sfxBus, 40); osc(1800, 'square', t, 0.02, 0.03, sfxBus); },
  scatter: (n: number) => { const t = now(); [0, 4, 7, 12].forEach((s, i) => osc(440 * 2 ** ((s + n * 2) / 12), 'triangle', t + i * 0.05, 0.6, 0.12, sfxBus)); noise(t, 0.5, 0.15, 6000, 4); },
  heartbeat: () => { const t = now(); osc(60, 'sine', t, 0.15, 0.6, sfxBus, 40); osc(55, 'sine', t + 0.22, 0.18, 0.45, sfxBus, 35); },
  riser: (dur = 1.5) => { const t = now(); osc(200, 'sawtooth', t, dur, 0.06, sfxBus, 1600); noise(t, dur, 0.12, 2000, 0.8, 'bandpass'); },
  shove: () => { const t = now(); noise(t, 0.25, 0.4, 500, 0.6, 'lowpass'); osc(180, 'square', t, 0.2, 0.08, sfxBus, 90); },
  mult: (m: number) => osc(300 + m * 120, 'square', now(), 0.12, 0.08, sfxBus),
  safe: () => { const t = now(); for (let i = 0; i < 4; i++) osc(2200, 'square', t + i * 0.06, 0.02, 0.05, sfxBus); noise(t + 0.3, 0.4, 0.6, 180, 1, 'lowpass'); osc(90, 'sine', t + 0.3, 0.4, 0.4, sfxBus, 45); },
  enhancer: () => { const t = now(); osc(700, 'triangle', t, 0.3, 0.1, sfxBus, 1400); noise(t, 0.2, 0.2, 4000, 3); },
  win: (x: number) => { const t = now(); const base = x > 5 ? 330 : 262; [0, 3, 7, 10].forEach((s, i) => osc(base * 2 ** (s / 12), 'square', t + i * 0.07, 0.25, 0.06, sfxBus)); },
  tick: () => osc(1400 + Math.random() * 300, 'square', now(), 0.02, 0.025, sfxBus),
  bigWin: () => { const t = now(); noise(t, 1.2, 0.5, 120, 0.7, 'lowpass'); osc(55, 'sine', t, 1.2, 0.6, sfxBus, 30);
    [0, 5, 7, 12, 15, 19, 24].forEach((s, i) => osc(220 * 2 ** (s / 12), 'sawtooth', t + 0.2 + i * 0.11, 0.5, 0.06, sfxBus)); },
  bonus: () => { const t = now(); noise(t, 1.5, 0.6, 90, 0.5, 'lowpass'); [0, 3, 7, 12, 15].forEach((s, i) => osc(110 * 2 ** (s / 12), 'sawtooth', t + i * 0.18, 0.9, 0.08, sfxBus)); osc(41, 'sine', t, 2, 0.5, sfxBus); },
  slam: () => { const t = now(); noise(t, 0.5, 0.9, 140, 0.6, 'lowpass'); osc(48, 'sine', t, 0.6, 0.8, sfxBus, 28); osc(2400, 'triangle', t, 0.25, 0.06, sfxBus, 1200); },
  whoosh: () => { const t = now(); noise(t, 0.45, 0.35, 900, 0.5, 'bandpass'); },
  coin: () => { const t = now(); osc(2600 + Math.random() * 800, 'triangle', t, 0.08, 0.05, sfxBus); osc(3900, 'sine', t + 0.03, 0.06, 0.03, sfxBus); },
  tierUp: (i: number) => { const t = now(); [0, 4, 7, 12].forEach((s, k) => osc(262 * 2 ** ((s + i * 5) / 12), 'square', t + k * 0.06, 0.3, 0.07, sfxBus)); noise(t, 0.6, 0.3, 3000, 1); },
  heat: () => { const t = now(); noise(t, 0.7, 0.4, 600, 0.4, 'lowpass'); osc(110, 'sawtooth', t, 0.5, 0.08, sfxBus, 330); },
  siren: () => { const t = now(); osc(600, 'sawtooth', t, 0.6, 0.05, sfxBus, 900); osc(900, 'sawtooth', t + 0.6, 0.6, 0.05, sfxBus, 600); },
};
