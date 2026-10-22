// Procedural soundtrack and SFX (WebAudio only, no audio files, so nothing to license).
// Music is written as real chord progressions per track and rendered live by a lookahead scheduler.
// Every track has 4 layers (drums, bass, harmony, lead); setIntensity() fades layers in as a feature heats up.
let ctx: AudioContext | null = null, master: GainNode, music: GainNode, sfxBus: GainNode, verb: ConvolverNode, verbIn: GainNode;
let muted = false, started = false, tension: GainNode | null = null;
const L: GainNode[] = []; // layer buses: 0 drums, 1 bass, 2 harmony, 3 lead
export const isMuted = () => muted;
function ac() {
  if (!ctx) {
    ctx = new AudioContext(); master = ctx.createGain(); master.gain.value = 0.8; master.connect(ctx.destination);
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 4; comp.connect(master);
    music = ctx.createGain(); music.gain.value = 0.34; music.connect(comp);
    sfxBus = ctx.createGain(); sfxBus.gain.value = 0.85; sfxBus.connect(comp);
    // small generated room reverb shared by harmony and lead
    verb = ctx.createConvolver(); const len = ctx.sampleRate * 2.2, ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3; }
    verb.buffer = ir; verbIn = ctx.createGain(); verbIn.gain.value = 0.35; verbIn.connect(verb); const vo = ctx.createGain(); vo.gain.value = 0.5; verb.connect(vo).connect(music);
    for (let i = 0; i < 4; i++) { const g = ctx.createGain(); g.gain.value = i < 3 ? 1 : 0; g.connect(music); if (i >= 2) g.connect(verbIn); L.push(g); }
  }
  return ctx;
}
export function setMuted(m: boolean) { muted = m; if (ctx) master.gain.setTargetAtTime(m ? 0 : 0.8, ctx.currentTime, 0.05); }
let nb: AudioBuffer | null = null;
function noiseBuf() { const c = ac(); if (nb) return nb; nb = c.createBuffer(1, c.sampleRate * 2, c.sampleRate); const d = nb.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; return nb; }
function osc(freq: number, type: OscillatorType, t0: number, dur: number, vol: number, dest: AudioNode, glide?: number, att = 0.01) {
  const c = ac(), o = c.createOscillator(), g = c.createGain(); o.type = type; o.frequency.setValueAtTime(freq, t0);
  if (glide) o.frequency.exponentialRampToValueAtTime(glide, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + att); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(dest); o.start(t0); o.stop(t0 + dur + 0.05);
}
function noise(t0: number, dur: number, vol: number, freq: number, q = 1, type: BiquadFilterType = 'bandpass', dest?: AudioNode) {
  const c = ac(), s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
  s.buffer = noiseBuf(); s.loop = true; f.type = type; f.frequency.value = freq; f.Q.value = q;
  g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  s.connect(f).connect(g).connect(dest ?? sfxBus); s.start(t0, Math.random()); s.stop(t0 + dur + 0.05);
}
const N = (m: number) => 440 * 2 ** ((m - 69) / 12);

// ---------- instruments ----------
const kick = (t: number, v = .55) => { osc(120, 'sine', t, .3, v, L[0], 42); osc(1800, 'triangle', t, .012, v * .15, L[0]); };
const snare = (t: number, v = .22) => { noise(t, .17, v, 1900, .8, 'bandpass', L[0]); osc(200, 'triangle', t, .07, v * .5, L[0]); };
const clap = (t: number, v = .2) => { for (let i = 0; i < 3; i++) noise(t + i * .011, .12, v, 1400, 1.2, 'bandpass', L[0]); };
const hat = (t: number, v = .05, open = false) => noise(t, open ? .22 : .035, v, 8500, 1, 'highpass', L[0]);
const rim = (t: number, v = .08) => osc(1650, 'square', t, .02, v, L[0]);
const bass = (t: number, m: number, d: number, v = .17, type: OscillatorType = 'triangle') => { osc(N(m), type, t, d, v, L[1]); osc(N(m) / 2, 'sine', t, d, v * .6, L[1]); };
function keys(t: number, notes: number[], d: number, v = .03) { for (const n of notes) { osc(N(n), 'sine', t, d, v, L[2], undefined, .015); osc(N(n) * 2, 'triangle', t, d * .35, v * .22, L[2]); } }
function pad(t: number, notes: number[], d: number, v = .016) { for (const n of notes) { osc(N(n), 'sawtooth', t, d, v, L[2], undefined, d * .3); osc(N(n) * 1.004, 'sawtooth', t, d, v * .7, L[2], undefined, d * .3); } }
const lead = (t: number, m: number, d: number, v = .05, type: OscillatorType = 'triangle') => { osc(N(m), type, t, d, v, L[3], undefined, .02); osc(N(m) * 2, 'sine', t, d * .6, v * .2, L[3]); };
const brass = (t: number, notes: number[], d: number, v = .028) => { for (const n of notes) { osc(N(n), 'sawtooth', t, d, v, L[3], undefined, .03); osc(N(n) * .998, 'square', t, d * .8, v * .4, L[3], undefined, .03); } };
const bell = (t: number, m: number, v = .05) => { osc(N(m), 'sine', t, 1.2, v, L[3]); osc(N(m) * 2.76, 'sine', t, .5, v * .3, L[3]); };

// ---------- tracks ----------
type Track = { bpm: number; swing: number; bars: number; once?: boolean; play: (t: number, k: number, bar: number, s16: number, rnd: () => number) => void };
// chord = [bass root, ...voicing]
const ch = (s: string) => s.split(' ').map(Number);
let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
/** melodic phrase from chord tones with stepwise passing notes; regenerated every 8 bars so loops never repeat exactly. */
function phrase(chords: number[][], bars: number, density: number) {
  const out: { bar: number; k: number; m: number; d: number }[] = [];
  for (let b = 0; b < bars; b++) { const tones = chords[b % chords.length].slice(1).map(n => n + 12); let last = tones[Math.floor(rnd() * tones.length)];
    for (let k = 0; k < 16; k += 2) if (rnd() < density && !(k === 14 && b % 2)) { const step = rnd() < .6 ? tones[Math.floor(rnd() * tones.length)] : last + (rnd() < .5 ? 2 : -1);
      last = step; out.push({ bar: b, k, m: step, d: rnd() < .3 ? 4 : 2 }); } }
  return out;
}
const BASE_CH = ['38 53 57 60 64', '43 53 57 59 64', '36 52 55 59 62', '45 55 58 61 64', '34 50 53 57 60', '43 50 53 58 62', '40 50 53 55 58', '45 49 52 55 59'].map(ch); // Dm9 G13 Cmaj9 A7b9 Bbmaj7 Gm9 Em7b5 A7
const FREE_CH = ['41 53 56 60 63', '37 53 56 61 65', '44 51 56 60 63', '39 51 55 58 63', '46 53 58 61 65', '37 53 56 61 65', '36 52 55 58 64', '36 52 55 58 60'].map(ch); // Fm9 Db Ab Eb Bbm Db C7 C7
const WIN_CH = [
  ['36 52 55 60 64', '45 52 57 60 64', '41 53 57 60 65', '43 55 59 62 67'], // C Am F G
  ['39 55 58 63 67', '36 51 55 60 63', '44 56 60 63 68', '46 53 58 62 65'], // Eb Cm Ab Bb
  ['45 57 60 64 69', '41 53 57 60 65', '36 55 60 64 67', '43 55 59 62 67'], // Am F C G
  ['38 54 57 62 66', '47 54 59 62 66', '43 55 59 62 67', '45 57 61 64 69', '40 55 59 64 67', '42 54 58 61 66', '43 55 59 62 67', '45 57 61 64 69'], // D Bm G A Em F#m G A
].map(a => a.map(ch));
const END_CH = ['41 52 57 60 64', '40 50 55 59 62', '38 53 57 60 64', '43 53 57 60 62', '36 52 55 59 62'].map(ch); // Fmaj7 Em7 Dm9 G9sus Cmaj9
let melody: ReturnType<typeof phrase> = [];
const TRACKS: Record<string, Track> = {
  base: { bpm: 88, swing: .18, bars: 8, play(t, k, bar, s16, r) { const c = BASE_CH[bar]; const sec = Math.floor(loopBar / 8) % 2;
    if (k === 0 || k === 10 || (k === 7 && bar % 2)) kick(t); if (k === 4 || k === 12) snare(t); if (k % 2 === 0) hat(t, k % 4 === 2 ? .06 : .035); if (k === 14 && bar === 7) snare(t, .12);
    if (sec && (k === 3 || k === 11)) rim(t);
    if (k % 4 === 0) { const walk = [c[0], c[0] + 7, c[0] + 12, c[0] + 10][k / 4]; bass(t, k === 12 && r() < .5 ? walk - 1 : walk, s16 * 3.5); }
    if (k === 0) keys(t + .02, c.slice(1), s16 * 13); if (k === 10 && bar % 2) keys(t, c.slice(3), s16 * 4, .022);
    for (const n of melody) if (n.bar === bar && n.k === k) lead(t, n.m, s16 * n.d, .035, 'sine'); } },
  bonus: { bpm: 104, swing: .08, bars: 8, play(t, k, bar, s16) { const c = FREE_CH[bar];
    if (k % 4 === 0 || (k === 14 && bar % 2)) kick(t, .6); if (k === 4 || k === 12) clap(t); hat(t, k % 2 ? .03 : .06, k === 6); 
    if (k % 2 === 0) bass(t, c[0] + (k % 8 === 6 ? 12 : 0), s16 * 1.6, .14, 'sawtooth');
    if (k === 0) pad(t, c.slice(1), s16 * 16); if (k % 2 === 0) lead(t, c[1 + (k / 2) % 4] + 12, s16 * 1.2, .022, 'square');
    if ((k === 0 || k === 6 || k === 10) && intensity >= 3) brass(t, c.slice(2), s16 * 1.5);
    for (const n of melody) if (n.bar === bar && n.k === k && intensity >= 2) lead(t, n.m + 12, s16 * n.d, .03); } },
  end: { bpm: 76, swing: .12, bars: 5, once: true, play(t, k, bar, s16) { const c = END_CH[bar];
    if (k === 0) { keys(t, c.slice(1), s16 * (bar === 4 ? 30 : 15), .035); pad(t, c.slice(1), s16 * 16, .01); bass(t, c[0], s16 * 12, .15); }
    if (bar < 4 && k % 4 === 0 && k) keys(t, [c[1 + k / 4] + 12], s16 * 3, .025); if (bar === 4 && k === 0) bell(t, 84, .05); if (k === 8 && bar < 4) hat(t, .03, true); } },
};
WIN_CH.forEach((chs, i) => { TRACKS['win' + i] = { bpm: [116, 124, 132, 140][i], swing: i < 2 ? .1 : 0, bars: chs.length, play(t, k, bar, s16) { const c = chs[bar];
  if (i === 0) { if (k === 0 || k === 8) kick(t); if (k === 4 || k === 12) snare(t); if (k % 2 === 0) hat(t, .05); if (k % 4 === 0) bass(t, c[0], s16 * 3);
    if (k === 0 || k === 6 || k === 12) brass(t, c.slice(2), s16 * 1.8, .026); if (k === 0) keys(t, c.slice(1), s16 * 12); }
  if (i === 1) { if (k % 4 === 0) kick(t, .65); if (k === 4 || k === 12) clap(t, .26); hat(t, k % 2 ? .03 : .06, k % 4 === 2); bass(t, c[0] + [0, 12, 0, 10][k % 4], s16 * .9, .15, 'square');
    if (k === 2 || k === 10) brass(t, c.slice(2), s16, .03); if (k === 0) pad(t, c.slice(1), s16 * 16); }
  if (i === 2) { if (k % 4 === 0) kick(t, .65); if (k === 4 || k === 12) snare(t, .26); hat(t, .04); if (k % 2 === 0) bass(t, c[0], s16 * 1.5, .14, 'sawtooth');
    lead(t, c[1 + [0, 1, 2, 3, 2, 1][k % 6]] + 12, s16 * .9, .024, 'sawtooth'); if (k === 0) pad(t, c.slice(1), s16 * 16, .02); }
  if (i === 3) { if (k % 4 === 0 || k === 14) kick(t, .7); if (k === 4 || k === 12) { snare(t, .28); clap(t, .2); } hat(t, k % 2 ? .04 : .07, k === 14);
    if (k % 2 === 0) bass(t, c[0] + (k % 4 ? 12 : 0), s16 * 1.6, .15, 'sawtooth'); if (k === 0) { pad(t, c.slice(1), s16 * 16, .022); brass(t, c.slice(1), s16 * 6, .03); }
    if (k % 2 === 0) lead(t, c[1 + (k / 2) % 4] + 12, s16 * 1.2, .022, 'square'); if (k === 0 && bar % 4 === 0) bell(t, c[4] + 12); }
} }; });

let mode = 'base', timer = 0, step = 0, loopBar = 0, nextT = 0, musicOn = true, sfxOn = true, intensity = 1;
const LAYER_BY_INT = [[1, 1, .7, 0], [1, 1, 1, .55], [1, 1, 1, .9], [1.1, 1.1, 1.1, 1.1]];
export function setIntensity(n: number) { intensity = Math.max(0, Math.min(3, n)); if (!ctx) return; LAYER_BY_INT[intensity].forEach((v, i) => L[i].gain.setTargetAtTime(v, ctx!.currentTime, .4)); }
export function setMusicOn(on: boolean) { musicOn = on; if (ctx) music.gain.setTargetAtTime(on ? 0.34 : 0, ctx.currentTime, 0.1); }
export function setSfxOn(on: boolean) { sfxOn = on; if (ctx) sfxBus.gain.setTargetAtTime(on ? 0.85 : 0, ctx.currentTime, 0.05); }
/** base, bonus, win0 to win3 (big win tiers), end (bonus summary, plays once then returns to base). */
export function setMusicMode(m: string) { if (m === mode || !TRACKS[m]) return; mode = m; step = 0; loopBar = 0;
  if (ctx) { const t = ctx.currentTime; music.gain.cancelScheduledValues(t); music.gain.setValueAtTime(music.gain.value, t); music.gain.linearRampToValueAtTime(0, t + .06); music.gain.setValueAtTime(0, t + .28); music.gain.linearRampToValueAtTime(musicOn ? .34 : 0, t + .8); nextT = Math.max(nextT, t + .3); }
  melody = phrase(m === 'bonus' ? FREE_CH : BASE_CH, 8, m === 'bonus' ? .45 : .3);
  setIntensity(m === 'base' ? 1 : m === 'bonus' ? 1 : m.startsWith('win') ? 3 : 1); }
export const musicMode = () => mode;
function sched() {
  const c = ctx!; const tr = TRACKS[mode]; const s16 = 60 / tr.bpm / 4;
  while (nextT < c.currentTime + .25) {
    const k = step % 16, bar = Math.floor(step / 16) % tr.bars, t = nextT + (k % 2 ? s16 * tr.swing : 0);
    if (musicOn) tr.play(t, k, bar, s16, rnd);
    nextT += s16; step++;
    if (step % 16 === 0) { loopBar++; if (loopBar % tr.bars === 0) { if (tr.once) { mode = 'base'; step = 0; loopBar = 0; } else if ((loopBar / tr.bars) % 2 === 0) melody = phrase(mode === 'bonus' ? FREE_CH : BASE_CH, 8, mode === 'bonus' ? .45 : .2 + rnd() * .25); } }
  }
}
/** Starts audio after the first user tap (mobile autoplay rules). */
export function startAmbient() {
  const c = ac(); if (c.state === 'suspended') c.resume(); if (started) return; started = true;
  const rain = c.createBufferSource(); rain.buffer = noiseBuf(); rain.loop = true;
  const rf = c.createBiquadFilter(); rf.type = 'highpass'; rf.frequency.value = 3200; const rg = c.createGain(); rg.gain.value = 0.035; rain.connect(rf).connect(rg).connect(music); rain.start();
  tension = c.createGain(); tension.gain.value = 0; tension.connect(music);
  const t = c.createOscillator(); t.type = 'sawtooth'; t.frequency.value = 73.4; const tf = c.createBiquadFilter(); tf.type = 'lowpass'; tf.frequency.value = 500; t.connect(tf).connect(tension); t.start();
  music.gain.value = musicOn ? 0.34 : 0; sfxBus.gain.value = sfxOn ? 0.85 : 0; melody = phrase(BASE_CH, 8, .3);
  nextT = c.currentTime + .1; timer = window.setInterval(sched, 50);
}
export function setTension(on: boolean) { if (tension && ctx) tension.gain.setTargetAtTime(on ? 0.05 : 0, ctx.currentTime, 0.3); }
export const stopMusic = () => clearInterval(timer);
const now = () => ac().currentTime;
const kick2 = (t: number) => osc(90, 'sine', t, .3, .4, sfxBus, 40);
const arp = (root: number, iv: number[], gap: number, d: number, v: number, type: OscillatorType = 'triangle', t = now()) => iv.forEach((s, i) => osc(N(root + s), type, t + i * gap, d, v, sfxBus));
export const sfx = {
  click: () => osc(900, 'square', now(), 0.04, 0.05, sfxBus),
  spinStart: () => { const t = now(); noise(t, 0.35, 0.22, 800, 0.7, 'lowpass'); osc(120, 'sawtooth', t, 0.3, 0.1, sfxBus, 60); },
  reelStop: (i: number) => { const t = now(); noise(t, 0.12, 0.45, 300 + i * 40, 1.2, 'lowpass'); osc(70, 'sine', t, 0.18, 0.38, sfxBus, 40); osc(1800, 'square', t, 0.02, 0.03, sfxBus); },
  scatter: (n: number) => { const t = now(); arp(69 + n * 3, [0, 4, 7, 12], .05, .6, .12, 'triangle', t); noise(t, 0.5, 0.15, 6000, 4); },
  heartbeat: () => { const t = now(); osc(60, 'sine', t, 0.15, 0.6, sfxBus, 40); osc(55, 'sine', t + 0.22, 0.18, 0.45, sfxBus, 35); },
  riser: (dur = 1.5) => { const t = now(); osc(200, 'sawtooth', t, dur, 0.06, sfxBus, 1600); noise(t, dur, 0.12, 2000, 0.8, 'bandpass'); },
  shove: () => { const t = now(); noise(t, 0.25, 0.4, 500, 0.6, 'lowpass'); osc(180, 'square', t, 0.2, 0.08, sfxBus, 90); },
  /** multiplier: pitch climbs with the multiplier, glassy ping plus sub drop */
  mult: (m: number) => { const t = now(); const r = 72 + Math.min(12, Math.round(m * 2)); arp(r, [0, 7, 12], .045, .35, .07, 'square', t); osc(N(r + 24), 'sine', t + .14, .6, .05, sfxBus); osc(70, 'sine', t, .3, .3, sfxBus, 40); },
  safe: () => { const t = now(); for (let i = 0; i < 4; i++) osc(2200, 'square', t + i * 0.06, 0.02, 0.05, sfxBus); noise(t + 0.3, 0.4, 0.6, 180, 1, 'lowpass'); osc(90, 'sine', t + 0.3, 0.4, 0.4, sfxBus, 45); },
  enhancer: () => { const t = now(); osc(700, 'triangle', t, 0.3, 0.1, sfxBus, 1400); noise(t, 0.2, 0.2, 4000, 3); },
  win: (x: number) => arp(x > 5 ? 64 : 60, [0, 3, 7, 10], .07, .25, .06, 'square'),
  tick: () => osc(1400 + Math.random() * 300, 'square', now(), 0.02, 0.022, sfxBus),
  bigWin: () => { const t = now(); noise(t, 1.2, 0.5, 120, 0.7, 'lowpass'); osc(55, 'sine', t, 1.2, 0.6, sfxBus, 30); arp(57, [0, 5, 7, 12, 15, 19, 24], .11, .5, .05, 'sawtooth', t + .2); },
  bonus: () => { const t = now(); noise(t, 1.5, 0.6, 90, 0.5, 'lowpass'); arp(45, [0, 3, 7, 12, 15], .18, .9, .08, 'sawtooth', t); osc(41, 'sine', t, 2, 0.5, sfxBus); },
  slam: () => { const t = now(); noise(t, 0.5, 0.9, 140, 0.6, 'lowpass'); osc(48, 'sine', t, 0.6, 0.8, sfxBus, 28); osc(2400, 'triangle', t, 0.25, 0.06, sfxBus, 1200); },
  cellOpen: () => { const t = now(); noise(t, .2, .5, 2500, 2); osc(140, 'square', t, .12, .1, sfxBus, 70); osc(1200, 'triangle', t + .12, .25, .08, sfxBus, 1800); },
  /** big win tier stinger: each tier has its own chord and colour */
  winTier: (i: number) => { const t = now(); const sc = [[60, [0, 4, 7, 12]], [63, [0, 4, 7, 11, 14]], [57, [0, 3, 7, 10, 15, 19]], [62, [0, 4, 7, 12, 16, 19, 24]]][Math.max(0, Math.min(3, i))] as [number, number[]];
    sc[1].forEach((s, k) => { osc(N(sc[0] + s + 12), 'triangle', t + k * .07, .6, .08, sfxBus); osc(N(sc[0] + s), 'sawtooth', t + k * .07, .4, .025, sfxBus); }); kick2(t); noise(t, .8, .25, 5000, .7, 'highpass'); if (i >= 2) osc(N(sc[0] - 24), 'sine', t, 1.4, .4, sfxBus); },
  multSlam: () => { const t = now(); osc(60, 'sine', t + .3, .5, .7, sfxBus, 30); noise(t + .3, .4, .7, 220, .7, 'lowpass'); osc(500, 'sawtooth', t, .3, .05, sfxBus, 1500); osc(1760, 'triangle', t + .32, .4, .07, sfxBus); },
  /** win hit: small, medium and large hits get different motifs */
  hit: (x: number) => { const t = now(); if (x < 1) arp(72, [0, 7], .06, .25, .07, 'triangle', t); else if (x < 5) { arp(72, [0, 4, 7, 12], .06, .35, .08, 'triangle', t); osc(N(96), 'sine', t + .25, .5, .04, sfxBus); }
    else { arp(67, [0, 4, 7, 12, 16, 19], .055, .45, .08, 'triangle', t); arp(55, [0, 7, 12], .12, .5, .04, 'sawtooth', t); noise(t, .5, .15, 6000, 1, 'highpass'); } },
  /** retrigger: rising fanfare with a bell on top */
  retrigger: () => { const t = now(); arp(60, [0, 4, 7, 12, 16, 19, 24], .07, .5, .07, 'square', t); osc(N(96), 'sine', t + .5, 1.2, .07, sfxBus); osc(N(103), 'sine', t + .62, 1, .04, sfxBus); noise(t, 1, .25, 7000, .8, 'highpass'); kick2(t); },
  cheer: () => { const t = now(); for (let i = 0; i < 6; i++) noise(t + i * .05, .9, .1, 900 + i * 300, .6, 'bandpass'); },
  whoosh: () => { const t = now(); noise(t, 0.45, 0.32, 900, 0.5, 'bandpass'); },
  coin: () => { const t = now(); osc(2600 + Math.random() * 800, 'triangle', t, 0.08, 0.045, sfxBus); osc(3900, 'sine', t + 0.03, 0.06, 0.025, sfxBus); },
  tierUp: (i: number) => arp(60 + i * 5, [0, 4, 7, 12], .06, .3, .07, 'square'),
  heat: () => { const t = now(); noise(t, 0.7, 0.4, 600, 0.4, 'lowpass'); osc(110, 'sawtooth', t, 0.5, 0.08, sfxBus, 330); },
  firework: () => { const t = now(); osc(400, 'sine', t, .5, .05, sfxBus, 1800); noise(t + .5, .7, .45, 2500, .4, 'lowpass'); noise(t + .5, 1.1, .1, 7000, 1, 'highpass'); },
  siren: () => { const t = now(); osc(600, 'sawtooth', t, 0.6, 0.05, sfxBus, 900); osc(900, 'sawtooth', t + 0.6, 0.6, 0.05, sfxBus, 600); },
};
