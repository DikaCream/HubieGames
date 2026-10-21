// Layered procedural audio (WebAudio): ambient bed + SFX. No external audio assets.
let ctx: AudioContext | null = null, master: GainNode, music: GainNode, sfxBus: GainNode;
let muted = false, bedNodes: AudioNode[] = [], tension: GainNode | null = null;
export const isMuted = () => muted;
function ac() {
  if (!ctx) {
    ctx = new AudioContext(); master = ctx.createGain(); master.gain.value = 0.8; master.connect(ctx.destination);
    const comp = ctx.createDynamicsCompressor(); comp.connect(master);
    music = ctx.createGain(); music.gain.value = 0.32; music.connect(comp);
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
/** Music: synthesized lounge noir beat. Base loop 86 bpm (lazy hip hop drums, walking bass, rhodes chords, rain).
 * Bonus loop 100 bpm with busier drums, minor stabs and a pulse. Scheduled with a lookahead timer. */
let musicOn = true, sfxOn = true, mode: 'base' | 'bonus' = 'base', timer = 0, step = 0, nextT = 0, padBus: GainNode | null = null;
export function setMusicOn(on: boolean) { musicOn = on; if (ctx) music.gain.setTargetAtTime(on ? 0.32 : 0, ctx.currentTime, 0.1); }
export function setSfxOn(on: boolean) { sfxOn = on; if (ctx) sfxBus.gain.setTargetAtTime(on ? 0.85 : 0, ctx.currentTime, 0.05); }
export function setMusicMode(m: 'base' | 'bonus') { mode = m; }
const N = (m: number) => 440 * 2 ** ((m - 69) / 12);
// Dm9, G13, Cmaj9, A7b9 (base) and Dm, Bb, Gm, A (bonus)
const CH = { base: [[50, 53, 57, 60, 64], [43, 53, 57, 59, 64], [48, 52, 55, 59, 62], [45, 55, 58, 61, 64]], bonus: [[50, 57, 62, 65], [46, 58, 62, 65], [43, 55, 58, 62], [45, 57, 61, 64]] };
const BASS = { base: [38, 41, 45, 43, 31, 35, 38, 41, 36, 40, 43, 45, 33, 37, 40, 43], bonus: [38, 38, 50, 38, 34, 34, 46, 34, 31, 31, 43, 31, 33, 33, 45, 40] };
function kick(t: number, v = .5) { osc(110, 'sine', t, .28, v, music, 40); }
function snare(t: number, v = .25) { noise(t, .18, v, 1800, .8, 'bandpass', music); osc(190, 'triangle', t, .08, v * .4, music); }
function hat(t: number, v = .06) { noise(t, .04, v, 8000, 1, 'highpass', music); }
function rhodes(t: number, notes: number[], dur: number, v = .035) { for (const n of notes) { osc(N(n), 'sine', t, dur, v, padBus!); osc(N(n) * 2, 'triangle', t, dur * .4, v * .25, padBus!); } }
function sched() {
  const c = ctx!; const bpm = mode === 'bonus' ? 100 : 86, s16 = 60 / bpm / 4;
  while (nextT < c.currentTime + .25) {
    const t = nextT, k = step % 16, bar = Math.floor(step / 16) % 4, sw = k % 2 ? s16 * .18 : 0, tt = t + sw;
    if (musicOn) {
      if (mode === 'base') {
        if (k === 0 || k === 10 || (k === 7 && bar % 2)) kick(tt); if (k === 4 || k === 12) snare(tt); if (k % 2 === 0 || k === 15) hat(tt, k % 4 === 2 ? .07 : .04);
        if (k % 4 === 0) osc(N(BASS.base[bar * 4 + k / 4]), 'triangle', tt, s16 * 3.6, .16, music);
        if (k === 0) rhodes(tt + .02, CH.base[bar], s16 * 14); if (k === 11 && bar % 2) rhodes(tt, CH.base[bar].slice(2), s16 * 3, .025);
      } else {
        if (k % 4 === 0 || k === 14) kick(tt, .6); if (k === 4 || k === 12) snare(tt, .32); hat(tt, k % 2 ? .04 : .08);
        if (k % 4 === 0 || k % 4 === 2) osc(N(BASS.bonus[bar * 4 + Math.floor(k / 4)]), 'sawtooth', tt, s16 * 1.6, .07, music);
        if (k === 0 || k === 6 || k === 10) rhodes(tt, CH.bonus[bar], s16 * 2, .03); if (k === 0 && bar === 3) osc(N(74), 'square', tt, s16 * 8, .02, music, N(86));
      }
    }
    nextT += s16; step++;
  }
}
/** Starts the audio after the first user tap (mobile autoplay rules). */
export function startAmbient() {
  const c = ac(); if (c.state === 'suspended') c.resume(); if (bedNodes.length) return;
  const rain = c.createBufferSource(); rain.buffer = noiseBuf(4); rain.loop = true;
  const rf = c.createBiquadFilter(); rf.type = 'highpass'; rf.frequency.value = 3000; const rg = c.createGain(); rg.gain.value = 0.05;
  rain.connect(rf).connect(rg).connect(music); rain.start();
  padBus = c.createGain(); const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1800; padBus.connect(lp).connect(music);
  tension = c.createGain(); tension.gain.value = 0; tension.connect(music);
  const t = c.createOscillator(); t.type = 'sawtooth'; t.frequency.value = 73.4; const tf = c.createBiquadFilter(); tf.type = 'lowpass'; tf.frequency.value = 500; t.connect(tf).connect(tension); t.start();
  bedNodes.push(rain, t); music.gain.value = musicOn ? 0.32 : 0; sfxBus.gain.value = sfxOn ? 0.85 : 0;
  nextT = c.currentTime + .1; timer = window.setInterval(sched, 60);
}
export function setTension(on: boolean) { if (tension && ctx) tension.gain.setTargetAtTime(on ? 0.06 : 0, ctx.currentTime, 0.3); }
export const stopMusic = () => clearInterval(timer);
const now = () => ac().currentTime;
const kick2 = (t: number) => osc(90, 'sine', t, .3, .4, sfxBus, 40);
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
  cellOpen: () => { const t = now(); noise(t, .2, .5, 2500, 2); osc(140, 'square', t, .12, .1, sfxBus, 70); osc(1200, 'triangle', t + .12, .25, .08, sfxBus, 1800); },
  winTier: (i: number) => { const t = now(); const sc = [[0, 4, 7], [0, 4, 7, 11], [0, 4, 7, 11, 14], [0, 4, 7, 11, 14, 19]][Math.max(0, Math.min(3, i))];
    sc.forEach((s, k) => { osc(392 * 2 ** (s / 12), 'triangle', t + k * .09, .5, .09, sfxBus); osc(196 * 2 ** (s / 12), 'square', t + k * .09, .3, .03, sfxBus); }); kick2(t); },
  multSlam: () => { const t = now(); osc(60, 'sine', t + .3, .5, .7, sfxBus, 30); noise(t + .3, .4, .7, 220, .7, 'lowpass'); osc(500, 'sawtooth', t, .3, .05, sfxBus, 1500); osc(1760, 'triangle', t + .32, .4, .07, sfxBus); },
  hit: (x: number) => { const t = now(); const n = x >= 5 ? 5 : x >= 1 ? 3 : 2; for (let i = 0; i < n; i++) osc(523 * 2 ** ([0, 4, 7, 12, 16][i] / 12), 'triangle', t + i * .06, .35, .08, sfxBus); osc(1046, 'sine', t + n * .06, .5, .05, sfxBus); },
  cheer: () => { const t = now(); for (let i = 0; i < 6; i++) noise(t + i * .05, .9, .12, 900 + i * 300, .6, 'bandpass'); },
  whoosh: () => { const t = now(); noise(t, 0.45, 0.35, 900, 0.5, 'bandpass'); },
  coin: () => { const t = now(); osc(2600 + Math.random() * 800, 'triangle', t, 0.08, 0.05, sfxBus); osc(3900, 'sine', t + 0.03, 0.06, 0.03, sfxBus); },
  tierUp: (i: number) => { const t = now(); [0, 4, 7, 12].forEach((s, k) => osc(262 * 2 ** ((s + i * 5) / 12), 'square', t + k * 0.06, 0.3, 0.07, sfxBus)); noise(t, 0.6, 0.3, 3000, 1); },
  heat: () => { const t = now(); noise(t, 0.7, 0.4, 600, 0.4, 'lowpass'); osc(110, 'sawtooth', t, 0.5, 0.08, sfxBus, 330); },
  siren: () => { const t = now(); osc(600, 'sawtooth', t, 0.6, 0.05, sfxBus, 900); osc(900, 'sawtooth', t + 0.6, 0.6, 0.05, sfxBus, 600); },
};
