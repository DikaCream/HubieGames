// Procedural soundtrack and SFX (WebAudio only, no audio files, so nothing to license).
// Music: see the music engine section below.
let ctx: AudioContext | null = null, master: GainNode, music: GainNode, sfxBus: GainNode, verb: ConvolverNode, verbIn: GainNode;
let muted = false, started = false, tension: GainNode | null = null;
const L: GainNode[] = []; // layer buses, see buildGraph
export const isMuted = () => muted;
function ac() {
  if (!ctx) { ctx = new AudioContext(); buildGraph(ctx); }
  return ctx;
}
export function setMuted(m: boolean) { muted = m; if (ctx) master.gain.setTargetAtTime(m ? 0 : 0.8, ctx.currentTime, 0.05); }
let nb: AudioBuffer | null = null;
function noiseBuf() { const c = ac(); if (nb) return nb; nb = c.createBuffer(1, c.sampleRate * 2, c.sampleRate); const d = nb.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; return nb; }
function osc(freq: number, type: OscillatorType, t0: number, dur: number, vol: number, dest: AudioNode, glide?: number, att = 0.01) {
  const c = ac(), o = c.createOscillator(), g = c.createGain(); o.type = type; o.frequency.setValueAtTime(freq, t0);
  if (glide) o.frequency.exponentialRampToValueAtTime(glide, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + att); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(dest); o.onended = () => { o.disconnect(); g.disconnect(); }; o.start(t0); o.stop(t0 + dur + 0.05);
}
function noise(t0: number, dur: number, vol: number, freq: number, q = 1, type: BiquadFilterType = 'bandpass', dest?: AudioNode) {
  const c = ac(), s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
  s.buffer = noiseBuf(); s.loop = true; f.type = type; f.frequency.value = freq; f.Q.value = q;
  g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  s.connect(f).connect(g).connect(dest ?? sfxBus); s.onended = () => { s.disconnect(); f.disconnect(); g.disconnect(); }; s.start(t0, Math.random()); s.stop(t0 + dur + 0.05);
}
const N = (m: number) => 440 * 2 ** ((m - 69) / 12);

// ---------- music engine (v16) ----------
// Original procedural club groove. A lookahead scheduler books every 16th note against the AudioContext clock,
// so timing never drifts with the JS timer. Songs are built from 8 bar sections (intro, A, B, breakdown, build, drop)
// that rotate and mutate with a seeded random generator, so long sessions keep changing.
const CAP0 = typeof navigator !== 'undefined' && /Android|iPhone|iPad/.test(navigator.userAgent) ? 40 : 64; let VOICE_CAP = CAP0; let voices = 0;
/** Polyphony guard: optional notes are skipped when too many voices are alive (keeps mobile CPU low). */
const room = (need = 1) => voices + need <= VOICE_CAP;
function tone(freq: number, type: OscillatorType, t0: number, dur: number, vol: number, dest: AudioNode, o2: { glide?: number, att?: number, cut?: number, q?: number, env?: number, det?: number } = {}) {
  if (!room()) return; const c = ac(), o = c.createOscillator(), g = c.createGain(); o.type = type; o.frequency.setValueAtTime(freq, t0); if (o2.det) o.detune.value = o2.det;
  if (o2.glide) o.frequency.exponentialRampToValueAtTime(o2.glide, t0 + Math.min(dur, .12));
  const att = o2.att ?? .004; g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + att); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  let f: BiquadFilterNode | null = null;
  if (o2.cut) { f = c.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = o2.q ?? 4; f.frequency.setValueAtTime(o2.cut * (o2.env ?? 4), t0); f.frequency.exponentialRampToValueAtTime(o2.cut, t0 + Math.min(dur, .18)); o.connect(f).connect(g); } else o.connect(g);
  g.connect(dest); voices++; o.onended = () => { voices--; o.disconnect(); f?.disconnect(); g.disconnect(); }; o.start(t0); o.stop(t0 + dur + .03);
}
function hiss(t0: number, dur: number, vol: number, freq: number, q: number, type: BiquadFilterType, dest: AudioNode, sweepTo?: number) {
  if (!room()) return; const c = ac(), s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
  s.buffer = noiseBuf(); f.type = type; f.frequency.setValueAtTime(freq, t0); if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t0 + dur); f.Q.value = q;
  g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + (sweepTo ? dur * .9 : .002)); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  s.connect(f).connect(g).connect(dest); voices++; s.onended = () => { voices--; s.disconnect(); f.disconnect(); g.disconnect(); }; s.start(t0, Math.random() * 1.5); s.stop(t0 + dur + .03);
}
// layer buses: 0 kick, 1 drums, 2 bass, 3 chords, 4 arp, 5 lead, 6 fx. Kick is outside the sidechain duck.
const K = () => L[0], D = () => L[1], B = () => L[2], C = () => L[3], A = () => L[4], LD = () => L[5], FX = () => L[6];
let duck: GainNode; // sidechain style pump on everything except the kick
const kick = (t: number, v = .9) => { tone(150, 'sine', t, .32, v, K(), { glide: 44, att: .002 }); tone(3000, 'square', t, .008, v * .05, K()); pump(t); };
const pump = (t: number, depth = .45, rel = .16) => { const g = duck.gain; g.cancelScheduledValues(t); g.setValueAtTime(1 - depth, t); g.setTargetAtTime(1, t + .01, rel / 3); };
const clap = (t: number, v = .32) => { for (let i = 0; i < 3; i++) hiss(t + i * .009, i === 2 ? .16 : .02, v, 1250, 1.4, 'bandpass', D()); };
const snare = (t: number, v = .3) => { hiss(t, .14, v, 2200, .7, 'bandpass', D()); tone(190, 'triangle', t, .08, v * .5, D(), { glide: 150 }); };
const hat = (t: number, v = .07, open = false) => hiss(t, open ? .2 : .03, v, open ? 7500 : 9500, 1, 'highpass', D());
const shaker = (t: number, v = .035) => hiss(t, .05, v, 6000, 2, 'bandpass', D());
const rim = (t: number, v = .1) => tone(1720, 'square', t, .018, v, D(), { cut: 2600, env: 1 });
const tom = (t: number, m: number, v = .3) => tone(N(m), 'sine', t, .2, v, D(), { glide: N(m) * .6 });
const crash = (t: number, v = .12) => hiss(t, 1.6, v, 5200, .6, 'highpass', FX());
const riser = (t: number, dur: number, v = .1) => hiss(t, dur, v, 400, 3, 'bandpass', FX(), 7000);
const sub = (t: number, m: number, d: number, v = .22) => tone(N(m), 'sine', t, d, v, B(), { att: .006 });
const bassN = (t: number, m: number, d: number, v = .16, cut = 420) => { tone(N(m), 'sawtooth', t, d, v, B(), { cut, q: 7, env: 5 }); if (room(4)) tone(N(m), 'sine', t, d, v * .9, B()); };
const stab = (t: number, ns: number[], d: number, v = .045, cut = 1500) => { if (room(ns.length + 6)) for (const n of ns) { tone(N(n), 'sawtooth', t, d, v, C(), { cut, q: 2, env: 3, det: -7 }); } };
const pluck = (t: number, m: number, d: number, v = .045) => tone(N(m), 'square', t, d, v, A(), { cut: 1800, q: 5, env: 3 });
const leadN = (t: number, m: number, d: number, v = .055, type: OscillatorType = 'sawtooth') => { tone(N(m), type, t, d, v, LD(), { cut: 2600, q: 2, env: 1.6, att: .01 }); if (room(8)) tone(N(m + 12), 'triangle', t, d, v * .35, LD(), { att: .01 }); };
const chime = (t: number, m: number, v = .05) => { tone(N(m), 'sine', t, 1, v, LD()); tone(N(m) * 2.76, 'sine', t, .4, v * .25, LD()); };

let seed = 20261026; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
// Song definition: key root (midi), scale, chord roots as scale degrees, tempo, swing, hook, layer set.
type Song = { bpm: number, swing: number, root: number, scale: number[], prog: number[][], hook: number[][][], form: string[], flavor: number, once?: boolean, bars?: number };
const MINOR = [0, 2, 3, 5, 7, 8, 10], PHRYG = [0, 1, 3, 5, 7, 8, 10], DORIAN = [0, 2, 3, 5, 7, 9, 10], HARM = [0, 2, 3, 5, 7, 8, 11], MAJOR = [0, 2, 4, 5, 7, 9, 11], MIXO = [0, 2, 4, 5, 7, 9, 10];
// Hooks: [16th step, scale degree (can exceed 7), length in 16ths], two bar phrases.
const HOOK_BASE = [[0, 4, 2], [3, 3, 1], [4, 4, 2], [6, 7, 2], [10, 6, 3], [14, 4, 2], [16, 4, 2], [19, 3, 1], [20, 2, 2], [22, 0, 2], [26, 1, 2], [28, 2, 3]];
const HOOK_B2 = [[0, 7, 3], [3, 6, 1], [4, 4, 2], [7, 5, 1], [8, 4, 4], [14, 2, 2], [16, 3, 2], [18, 4, 2], [20, 6, 3], [24, 4, 2], [27, 3, 1], [28, 4, 4]];
const HOOK_F1 = [[0, 7, 1], [2, 7, 1], [3, 9, 2], [6, 8, 1], [8, 7, 2], [11, 4, 1], [12, 5, 2], [14, 4, 2], [16, 7, 1], [18, 7, 1], [19, 9, 2], [22, 10, 2], [24, 9, 2], [27, 7, 1], [28, 8, 4]];
const HOOK_F2 = [[0, 4, 1], [1, 4, 1], [3, 7, 2], [6, 6, 2], [8, 4, 1], [10, 3, 2], [12, 4, 4], [16, 4, 1], [17, 4, 1], [19, 8, 2], [22, 7, 2], [24, 6, 1], [26, 4, 2], [28, 3, 4]];
const HOOK_F3 = [[0, 0, 2], [2, 1, 1], [3, 3, 2], [6, 1, 2], [8, 0, 1], [10, 7, 2], [12, 6, 2], [14, 4, 2], [16, 0, 2], [18, 1, 1], [19, 3, 2], [22, 4, 2], [24, 5, 1], [25, 4, 1], [26, 3, 2], [28, 1, 4]];
const SONGS: Record<string, Song> = {
  // Base: 104 bpm D minor shuffle, i VI III VII then a darker i iv VI V turnaround in the B part.
  base: { bpm: 104, swing: .16, root: 50, scale: HARM, prog: [[0, 5, 2, 6], [0, 3, 5, 4]], hook: [HOOK_BASE, HOOK_B2], form: ['intro', 'A', 'A', 'B', 'brk', 'build', 'A', 'B', 'drop', 'B'], flavor: 0 },
  // Free spins: three distinct songs per bonus.
  bonus0: { bpm: 122, swing: .08, root: 52, scale: DORIAN, prog: [[0, 6, 3, 4], [0, 3, 6, 4]], hook: [HOOK_F2, HOOK_F1], form: ['A', 'B', 'A', 'build', 'drop', 'brk', 'B', 'drop'], flavor: 1 },
  bonus1: { bpm: 126, swing: .04, root: 54, scale: MINOR, prog: [[0, 5, 6, 4], [5, 6, 0, 4]], hook: [HOOK_F1, HOOK_F2], form: ['A', 'B', 'build', 'drop', 'A', 'brk', 'build', 'drop'], flavor: 2 },
  bonus2: { bpm: 130, swing: 0, root: 55, scale: PHRYG, prog: [[0, 1, 0, 6], [0, 5, 1, 4]], hook: [HOOK_F3, HOOK_F1], form: ['build', 'drop', 'B', 'drop', 'brk', 'build', 'drop', 'B'], flavor: 3 },
  // Big win tiers: four bar loops, rising key and tempo, each with its own hook and more layers.
  win0: { bpm: 112, swing: .1, root: 53, scale: MIXO, prog: [[0, 3, 4, 3]], hook: [HOOK_B2], form: ['W'], flavor: 10, bars: 4 },
  win1: { bpm: 120, swing: .06, root: 55, scale: MIXO, prog: [[0, 6, 3, 4]], hook: [HOOK_F2], form: ['W'], flavor: 11, bars: 4 },
  win2: { bpm: 128, swing: 0, root: 57, scale: MAJOR, prog: [[5, 3, 0, 4]], hook: [HOOK_F1], form: ['W'], flavor: 12, bars: 4 },
  win3: { bpm: 136, swing: 0, root: 58, scale: MAJOR, prog: [[0, 4, 5, 3], [3, 4, 0, 0]], hook: [HOOK_F1, HOOK_F3], form: ['W'], flavor: 13, bars: 4 },
  // Bonus summary: a short half time outro, plays once then hands back to base.
  end: { bpm: 90, swing: .12, root: 50, scale: DORIAN, prog: [[0, 5, 3, 4]], hook: [HOOK_B2], form: ['end'], flavor: 20, once: true, bars: 4 },
};
SONGS.bonus = SONGS.bonus1;
const TRACKS = SONGS;
let song = SONGS.base, mode = 'base', timer = 0, step = 0, nextT = 0, musicOn = true, sfxOn = true, intensity = 1, secIdx = 0, sec = 'intro', cycle = 0, heat = 0;
// per section mutation, rerolled every section
let vary = { kickAlt: 0, bassPat: 0, hatPat: 0, arpPat: 0, hookOct: 0, stabPat: 0, fill: 1 };
const reroll = () => { vary = { kickAlt: Math.floor(rnd() * 3), bassPat: Math.floor(rnd() * 4), hatPat: Math.floor(rnd() * 3), arpPat: Math.floor(rnd() * 3), hookOct: rnd() < .25 ? 12 : 0, stabPat: Math.floor(rnd() * 3), fill: Math.floor(rnd() * 3) }; };
const deg = (d: number) => { const s = song.scale, o = Math.floor(d / 7), i = ((d % 7) + 7) % 7; return song.root + s[i] + o * 12; };
const triad = (d: number) => [deg(d) + 12, deg(d + 2) + 12, deg(d + 4) + 12, ...(intensity >= 2 ? [deg(d + 6) + 12] : [])];
const BASS_PATS = [ // [step, octave offset, len] one bar
  [[0, 0, 3], [3, 0, 1], [6, 12, 1], [8, 0, 2], [11, 0, 1], [14, 7, 2]],
  [[0, 0, 2], [2, 0, 1], [4, 12, 1], [7, 0, 2], [10, 0, 1], [12, 10, 2], [15, 0, 1]],
  [[0, 0, 1], [2, 12, 1], [4, 0, 1], [6, 12, 1], [8, 0, 1], [10, 12, 1], [12, 0, 1], [14, 12, 1]],
  [[0, 0, 4], [6, 0, 1], [7, 7, 1], [10, 0, 2], [13, 12, 1], [14, 10, 2]]];
const HAT_PATS = [[1, 0, 1, 0, 1, 0, 1, 1, 1, 0, 1, 0, 1, 0, 1, 0], [1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 1], [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 1]];
const ARP_PATS = [[0, 1, 2, 1], [0, 2, 1, 3], [2, 1, 0, 1]];
const STAB_PATS = [[0, 3, 6, 10], [2, 6, 10, 14], [0, 7, 10]];
/** One 16th note. k is the step in the bar, bar is the bar inside the 8 bar section. */
function play(t: number, k: number, bar: number, s16: number) {
  const fl = song.flavor, win = fl >= 10 && fl < 20, free = fl >= 1 && fl <= 3, bars = song.bars ?? 8;
  const prog = song.prog[(sec === 'B' || sec === 'drop') && song.prog[1] ? 1 : 0], ch = prog[bar % 4], last = bar === bars - 1;
  const en = Math.min(3, intensity + (heat > 1.5 ? 1 : 0)); // energy: intensity plus win streak heat
  if (fl === 20) { // end outro: half time, then a final hit
    if (bar === 3) { if (k === 0) { kick(t); stab(t, triad(0), s16 * 14, .05, 900); sub(t, deg(0) - 12, s16 * 14); chime(t, deg(4) + 24); crash(t, .08); } return; }
    if (k === 0 || k === 10) kick(t, .75); if (k === 8) clap(t, .25); if (k % 4 === 2) hat(t, .05);
    if (k === 0) { sub(t, deg(ch) - 12, s16 * 7); stab(t, triad(ch), s16 * 6, .035, 1100); } if (k % 4 === 0) pluck(t, triad(ch)[k / 4 % 3] + 12, s16 * 2, .03); return; }
  const brk = sec === 'brk', build = sec === 'build', drop = sec === 'drop' || win, intro = sec === 'intro';
  // ---- drums ----
  const four = free || win || drop || en >= 2;
  if (!brk) {
    if (build) { if (bar < 4 ? k % 4 === 0 : bar < 6 ? k % 2 === 0 : true) { if (k % 4 === 0) kick(t, .7); snare(t, .08 + .03 * bar * (k % 4 ? .5 : 1)); } if (k === 0 && bar === 0) riser(t, s16 * 16 * bars, .09); }
    else {
      const kAlt = [[0, 10], [0, 7, 10], [0, 6, 10, 14]][vary.kickAlt];
      if (four ? k % 4 === 0 || (k === 14 && vary.kickAlt === 2 && bar % 2) : kAlt.includes(k)) kick(t);
      if (k === 4 || k === 12) { if (!intro) { clap(t, free ? .3 : .26); if (en >= 2) snare(t, .12); } else if (k === 12) rim(t); }
      if (HAT_PATS[four ? (vary.hatPat === 2 ? 0 : vary.hatPat) : vary.hatPat][k]) hat(t, k % 4 === 2 ? .085 : .045, (k === 14 && !last) || (four && k % 4 === 2 && fl % 2 === 1));
      if (en >= 2 && k % 2 === 1) shaker(t);
      if (!four && (k === 3 || k === 11) && vary.kickAlt !== 1) rim(t, .07);
      if (last && k >= 12 && !win) { // fills, varied per section
        if (vary.fill === 0) snare(t, .12 + (k - 12) * .04); else if (vary.fill === 1) tom(t, deg(0) + 12 - (k - 12) * 3); else if (k % 2 === 0) clap(t, .2); }
    }
  } else if (k === 0 && bar % 2 === 0) hat(t, .05, true);
  if (k === 0 && bar === 0 && (drop || sec === 'A' && cycle > 0) && !win) crash(t);
  if (win && k === 0 && (bar === 0 || fl === 13)) crash(t, .1 + (fl - 10) * .02);
  // ---- bass ----
  if (!intro && !(brk && bar < 4)) {
    const bp = BASS_PATS[win || drop ? (fl === 13 || fl === 3 ? 2 : (vary.bassPat + 1) % 4) : free && vary.bassPat === 3 ? 1 : vary.bassPat];
    for (const [st, oc, ln] of bp) if (st === k) { const m = deg(ch) - 12 + oc; if (brk) sub(t, m - 12, s16 * ln * 2); else bassN(t, m, s16 * ln * .95, .15, 300 + en * 140 + (build ? bar * 120 : 0)); }
    if (k === 0 && (drop || en >= 3)) sub(t, deg(ch) - 24, s16 * 3, .18);
  } else if (intro && k === 0) sub(t, deg(ch) - 24, s16 * 15, .14);
  // ---- chords ----
  const sp = STAB_PATS[vary.stabPat];
  if (brk) { if (k === 0) stab(t, triad(ch), s16 * 15, .03, 700 + bar * 120); }
  else if (sp.includes(k) && (en >= 1 || k === 0)) stab(t, triad(ch), s16 * (k === 0 && intro ? 8 : 1.1), win ? .05 : .04, intro ? 900 : 1300 + en * 300);
  // ---- arp ----
  if ((en >= 2 || free || win || sec === 'B' || brk) && !intro && k % (fl === 13 || build ? 1 : 2) === 0) { const tr = triad(ch), ap = ARP_PATS[vary.arpPat]; pluck(t, tr[ap[(k / 2 | 0) % 4] % tr.length] + 12, s16 * .9, brk ? .03 : .036); }
  // ---- lead hook ----
  const hookOn = win || sec === 'A' || sec === 'B' || sec === 'drop' || (brk && bar >= 4);
  if (hookOn && en >= (free || win ? 0 : 1)) {
    const hook = song.hook[(sec === 'B' && song.hook[1]) ? 1 : 0], pos = (bar % 2) * 16 + k;
    for (const [st, d, ln] of hook) if (st === pos) { const shift = bar % 4 >= 2 && !win ? (song.prog[0][2] - song.prog[0][0] === 2 ? 2 : 0) : 0; const m = deg(d + shift) + 12 + vary.hookOct; leadN(t, m, s16 * ln * .9, brk ? .04 : .05, fl === 2 || fl === 12 ? 'square' : 'sawtooth'); }
    if (fl === 13 && k % 8 === 0 && bar % 2) chime(t, deg(7) + 24, .04);
  }
}
const LAYER_BY_INT = [[1, .8, .9, .7, .4, .6, .8], [1, 1, 1, .85, .7, .8, .9], [1, 1, 1, 1, .9, .95, 1], [1.05, 1.05, 1.05, 1.05, 1, 1.05, 1]];
export function setIntensity(n: number) { intensity = Math.max(0, Math.min(3, n)); if (!ctx || !L.length) return; LAYER_BY_INT[intensity].forEach((v, i) => L[i].gain.setTargetAtTime(v, ctx!.currentTime, .4)); }
export function setMusicOn(on: boolean) { musicOn = on; if (ctx) music.gain.setTargetAtTime(on ? MUSIC_VOL : 0, ctx.currentTime, 0.1); }
export function setSfxOn(on: boolean) { sfxOn = on; if (ctx) sfxBus.gain.setTargetAtTime(on ? 0.85 : 0, ctx.currentTime, 0.05); }
const MUSIC_VOL = .3;
/** Win streak feedback for the base game: x is the win in bet multiples (0 for a loss). Heat adds layers, big hits duck the groove. */
export function musicHit(x: number) { heat = x > 0 ? Math.min(3, heat + (x >= 5 ? 1.2 : .6)) : Math.max(0, heat - .5); if (ctx && duck && x >= 10) pump(ctx.currentTime + .01, .7, .6); }
function enterSection(i: number) {
  const f = song.form; secIdx = i % f.length; if (i > 0 && secIdx === 0) { cycle++; // evolve: every pass rotates the middle and may swap A/B parts
    if (f.length > 3 && rnd() < .6) { const a = 1 + Math.floor(rnd() * (f.length - 2)); const b = 1 + Math.floor(rnd() * (f.length - 2)); [f[a], f[b]] = [f[b], f[a]]; } }
  sec = f[secIdx]; reroll(); }
/** base, bonus (or bonus0 to bonus2 per bonus type), win0 to win3 (big win tiers), end (bonus summary, plays once then returns to base). */
export function setMusicMode(m: string) { if (m === mode || !SONGS[m]) return; mode = m; song = SONGS[m]; step = 0; cycle = 0; enterSection(0); if (m.startsWith('bonus')) heat = 0;
  if (ctx) { const t = ctx.currentTime; music.gain.cancelScheduledValues(t); music.gain.setValueAtTime(music.gain.value, t); music.gain.linearRampToValueAtTime(0, t + .06); music.gain.setValueAtTime(0, t + .2); music.gain.linearRampToValueAtTime(musicOn ? MUSIC_VOL : 0, t + .5); nextT = Math.max(nextT, t + .22); }
  if (m === 'base' && sec === 'intro') enterSection(1);
  setIntensity(m.startsWith('win') ? 3 : 1); }
export const musicMode = () => mode;
function sched(ahead = .2) {
  const c = ctx!;
  while (nextT < c.currentTime + ahead) {
    const s16 = 60 / song.bpm / 4, bars = song.bars ?? 8, k = step % 16, bar = Math.floor(step / 16) % bars, t = nextT + (k % 2 ? s16 * song.swing : 0);
    if (musicOn) play(t, k, bar, s16);
    nextT += s16; step++;
    if (step % (16 * bars) === 0) { if (song.once) { mode = 'base'; song = SONGS.base; step = 0; enterSection(1); } else enterSection(secIdx + 1); }
  }
}
function buildGraph(c: BaseAudioContext) {
  master = c.createGain(); master.gain.value = muted ? 0 : 0.8; master.connect(c.destination);
  const comp = c.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4; comp.attack.value = .005; comp.release.value = .15; comp.connect(master);
  music = c.createGain(); music.gain.value = musicOn ? MUSIC_VOL : 0; music.connect(comp);
  sfxBus = c.createGain(); sfxBus.gain.value = sfxOn ? 0.85 : 0; sfxBus.connect(comp);
  duck = c.createGain(); duck.connect(music);
  verb = c.createConvolver(); const len = c.sampleRate * 1.6, ir = c.createBuffer(2, len, c.sampleRate);
  for (let chn = 0; chn < 2; chn++) { const d = ir.getChannelData(chn); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3; }
  verb.buffer = ir; verbIn = c.createGain(); verbIn.gain.value = .3; verbIn.connect(verb); const vo = c.createGain(); vo.gain.value = .45; verb.connect(vo).connect(duck);
  // stereo width: chords left, arp right, lead centre
  L.length = 0; for (let i = 0; i < 7; i++) { const g = c.createGain(); g.gain.value = LAYER_BY_INT[1][i]; let out: AudioNode = g;
    if (i === 3 || i === 4) { const p = c.createStereoPanner(); p.pan.value = i === 3 ? -.3 : .35; g.connect(p); out = p; }
    out.connect(i === 0 ? music : duck); if (i >= 3) g.connect(verbIn); L.push(g); }
}
/** Starts audio after the first user tap (mobile autoplay rules). */
export function startAmbient() {
  const c = ac(); if (c.state === 'suspended') c.resume(); if (started) return; started = true;
  const rain = c.createBufferSource(); rain.buffer = noiseBuf(); rain.loop = true;
  const rf = c.createBiquadFilter(); rf.type = 'highpass'; rf.frequency.value = 3200; const rg = c.createGain(); rg.gain.value = 0.02; rain.connect(rf).connect(rg).connect(music); rain.start();
  tension = c.createGain(); tension.gain.value = 0; tension.connect(music);
  const t = c.createOscillator(); t.type = 'sawtooth'; t.frequency.value = 73.4; const tf = c.createBiquadFilter(); tf.type = 'lowpass'; tf.frequency.value = 500; t.connect(tf).connect(tension); t.start();
  music.gain.value = musicOn ? MUSIC_VOL : 0; sfxBus.gain.value = sfxOn ? 0.85 : 0; enterSection(0);
  nextT = c.currentTime + .1; timer = window.setInterval(() => sched(), 25);
}
/** Debug: render a music mode offline and return mono samples (used by the audio sanity test). */
export async function renderMusic(m: string, secs: number, int = 1) {
  const save = { ctx, master, music, sfxBus, verb, verbIn, duck, L: [...L], nb, mode, song, step, nextT, secIdx, sec, cycle, intensity, seed, heat };
  VOICE_CAP = 1e9; const oc = new OfflineAudioContext(2, Math.ceil(44100 * secs), 44100); ctx = oc as unknown as AudioContext; nb = null; buildGraph(oc);
  mode = ''; setMusicMode(m); intensity = int; nextT = .05; sched(secs);
  const buf = await oc.startRendering();
  ctx = save.ctx; master = save.master; music = save.music; sfxBus = save.sfxBus; verb = save.verb; verbIn = save.verbIn; duck = save.duck; L.length = 0; L.push(...save.L); nb = save.nb;
  mode = save.mode; song = save.song; step = save.step; nextT = save.nextT; secIdx = save.secIdx; sec = save.sec; cycle = save.cycle; intensity = save.intensity; seed = save.seed; heat = save.heat; voices = 0; VOICE_CAP = CAP0;
  const a = buf.getChannelData(0), b = buf.getChannelData(1), out = new Float32Array(a.length); for (let i = 0; i < a.length; i++) out[i] = (a[i] + b[i]) / 2; return out;
}
export function setTension(on: boolean) { if (tension && ctx) tension.gain.setTargetAtTime(on ? 0.05 : 0, ctx.currentTime, 0.3); }
export const stopMusic = () => clearInterval(timer);
const now = () => ac().currentTime;
const kick2 = (t: number) => osc(90, 'sine', t, .3, .4, sfxBus, 40);
const arp = (root: number, iv: number[], gap: number, d: number, v: number, type: OscillatorType = 'triangle', t = now()) => iv.forEach((s, i) => osc(N(root + s), type, t + i * gap, d, v, sfxBus));
/** Rate limit for sounds fired from per frame callbacks (each call creates WebAudio nodes). */
const lastAt: Record<string, number> = {};
function gate(k: string, ms: number) { const t = performance.now(); if (t - (lastAt[k] ?? 0) < ms) return false; lastAt[k] = t; return true; }
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
  tick: () => { if (!gate('tick', 70)) return; osc(1400 + Math.random() * 300, 'square', now(), 0.02, 0.022, sfxBus); },
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
  coin: () => { if (!gate('coin', 90)) return; const t = now(); osc(2600 + Math.random() * 800, 'triangle', t, 0.08, 0.045, sfxBus); osc(3900, 'sine', t + 0.03, 0.06, 0.025, sfxBus); },
  tierUp: (i: number) => arp(60 + i * 5, [0, 4, 7, 12], .06, .3, .07, 'square'),
  heat: () => { const t = now(); noise(t, 0.7, 0.4, 600, 0.4, 'lowpass'); osc(110, 'sawtooth', t, 0.5, 0.08, sfxBus, 330); },
  firework: () => { const t = now(); osc(400, 'sine', t, .5, .05, sfxBus, 1800); noise(t + .5, .7, .45, 2500, .4, 'lowpass'); noise(t + .5, 1.1, .1, 7000, 1, 'highpass'); },
  siren: () => { const t = now(); osc(600, 'sawtooth', t, 0.6, 0.05, sfxBus, 900); osc(900, 'sawtooth', t + 0.6, 0.6, 0.05, sfxBus, 600); },
};
