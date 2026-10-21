// PixiJS v8 reel board: full scale motion blur strips, staggered stops with overshoot,
// anticipation, Shove Wild, Safecrack, enhancer cells, win presentation and particles.
import { Application, Container, Sprite, Texture, Graphics, Text } from 'pixi.js';
import gsap from 'gsap';
import { S, PAYING, SYM, type Spin, type Enh } from './engine';
import { ART } from './art';
import { sfx } from './sound';

export const CW = 150, CH = 150, GAP = 6, TIP = 54;
export const BW = 5 * CW + 4 * GAP, BH = TIP + 8 + 3 * CH;
const rx = (r: number) => r * (CW + GAP);
const ROWY = TIP + 8;
const rndSym = () => PAYING[Math.floor(Math.random() * 8)];
const FONT = 'Oswald, Impact, sans-serif';

type Slot = { s: number; spr: Sprite };
interface Reel { c: Container; strip: Container; slots: Slot[]; pos: number; speed: number; state: 'idle' | 'spin' | 'stopping'; feed: number[]; stopAt: number; antic: boolean; dark: Graphics; glow: Graphics; wildC: Container | null; landedCells: Sprite[] }
type Particle = { s: Sprite; vx: number; vy: number; life: number; max: number; g: number };

async function loadImg(url: string) { const i = new Image(); i.src = url; await i.decode().catch(() => {}); return i; }
function cellCanvas(img: HTMLImageElement, blur: boolean, pad = 10) {
  const R = 2, c = document.createElement('canvas'); c.width = CW * R; c.height = CH * R; const x = c.getContext('2d')!;
  const sc = Math.min((CW - pad * 2) / img.width, (CH - pad * 2) / img.height) * R; const w = img.width * sc, h = img.height * sc;
  const ox = (c.width - w) / 2, oy = (c.height - h) / 2;
  if (!blur) x.drawImage(img, ox, oy, w, h);
  else { const n = 14; for (let i = 0; i < n; i++) { x.globalAlpha = 0.16; x.drawImage(img, ox, oy + (i / (n - 1) - 0.5) * 110 * R / 2, w, h); } }
  return Texture.from(c);
}
function softDot() { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d')!; const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, '#ffffffff'); g.addColorStop(.4, '#ffffff88'); g.addColorStop(1, '#ffffff00'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); return Texture.from(c); }
function shineTex() { const c = document.createElement('canvas'); c.width = 128; c.height = 8; const x = c.getContext('2d')!; const g = x.createLinearGradient(0, 0, 128, 0);
  g.addColorStop(0, '#fff0'); g.addColorStop(.5, '#ffffffcc'); g.addColorStop(1, '#fff0'); x.fillStyle = g; x.fillRect(0, 0, 128, 8); return Texture.from(c); }

export class Board {
  app = new Application(); root = new Container(); reels: Reel[] = []; tex: Texture[] = []; blur: Texture[] = [];
  fxL = new Container(); winL = new Container(); tipL = new Container(); parts: Particle[] = []; dot!: Texture; shine!: Texture;
  frame = new Graphics(); tips: { bg: Graphics; label: Text }[] = []; bonus = false; quick = false; turbo = false;
  onAntic: (on: boolean, reel: number) => void = () => {};
  private t = 0;

  async init(host: HTMLElement) {
    await this.app.init({ width: BW, height: BH, backgroundAlpha: 0, antialias: true, resolution: Math.min(devicePixelRatio || 1, 2), autoDensity: true, preference: 'webgl' });
    const cv = this.app.canvas; cv.style.width = '100%'; cv.style.height = 'auto'; cv.style.display = 'block'; host.appendChild(cv);
    const imgs = await Promise.all(SYM.map(n => loadImg(ART(n))));
    this.tex = imgs.map((im, i) => cellCanvas(im, false, i === S.WILD ? 6 : 10)); this.blur = imgs.map(im => cellCanvas(im, true));
    this.dot = softDot(); this.shine = shineTex();
    this.app.stage.addChild(this.root);
    // tip row
    this.root.addChild(this.tipL);
    for (let r = 0; r < 5; r++) {
      const bg = new Graphics(); bg.x = rx(r); this.tipL.addChild(bg);
      const label = new Text({ text: 'TIP OFF', style: { fontFamily: FONT, fontSize: 20, fontWeight: '700', fill: 0x5f8590, letterSpacing: 2 } }); label.anchor.set(.5); label.x = rx(r) + CW / 2; label.y = TIP / 2; this.tipL.addChild(label);
      this.tips.push({ bg, label });
    }
    this.drawTips();
    for (let r = 0; r < 5; r++) {
      const c = new Container(); c.x = rx(r); c.y = ROWY; this.root.addChild(c);
      const bg = new Graphics().roundRect(0, 0, CW, 3 * CH, 10).fill({ color: 0x06141a, alpha: .82 }); c.addChild(bg);
      const strip = new Container(); c.addChild(strip);
      const m = new Graphics().roundRect(0, 0, CW, 3 * CH, 10).fill(0xffffff); c.addChild(m); strip.mask = m;
      const slots: Slot[] = [];
      for (let i = 0; i < 5; i++) { const s = rndSym(); const spr = new Sprite(this.tex[s]); spr.width = CW; spr.height = CH; spr.anchor.set(.5); strip.addChild(spr); slots.push({ s, spr }); }
      const dark = new Graphics().rect(0, 0, CW, 3 * CH).fill(0x000000); dark.alpha = 0; c.addChild(dark);
      const glow = new Graphics(); glow.alpha = 0; c.addChild(glow);
      const reel: Reel = { c, strip, slots, pos: 0, speed: 0, state: 'idle', feed: [], stopAt: 0, antic: false, dark, glow, wildC: null, landedCells: [] };
      this.reels.push(reel); this.layout(reel);
    }
    this.root.addChild(this.winL, this.fxL);
    this.app.ticker.add(tk => this.tick(tk.deltaMS));
  }
  drawTips() { this.tips.forEach((t, r) => { t.bg.clear().roundRect(0, 0, CW, TIP, 10).fill({ color: this.bonus ? 0x2a0f05 : 0x0a1d24, alpha: .9 }).stroke({ color: this.bonus ? 0x8a3b12 : 0x1d4450, width: 2 }); t.label.text = this.bonus ? '' : 'TIP OFF'; t.label.style.fill = 0x5f8590; t.label.scale.set(1); }); }
  setSkin(bonus: boolean) { this.bonus = bonus; this.drawTips(); this.reels.forEach(r => { (r.c.children[0] as Graphics).clear().roundRect(0, 0, CW, 3 * CH, 10).fill({ color: bonus ? 0x1a0904 : 0x06141a, alpha: .85 }); }); }
  private layout(r: Reel) { r.slots.forEach((sl, i) => { sl.spr.x = CW / 2; sl.spr.y = (i - 1) * CH + CH / 2 + r.pos; }); }
  private setSlot(sl: Slot, s: number, blurred: boolean) { sl.s = s; sl.spr.texture = blurred ? this.blur[s] : this.tex[s]; sl.spr.width = CW; sl.spr.height = CH; }

  private tick(dt: number) {
    this.t += dt; const now = performance.now();
    for (const r of this.reels) {
      if (r.state === 'idle') continue;
      if (r.state === 'spin' && now >= r.stopAt) r.state = 'stopping';
      const target = r.antic ? 1500 : this.turbo ? 4600 : 3800;
      r.speed += (target - r.speed) * Math.min(1, dt / 90);
      r.pos += r.speed * dt / 1000;
      while (r.pos >= CH) {
        r.pos -= CH; const last = r.slots.pop()!;
        let s = rndSym(), done = false;
        if (r.state === 'stopping') { s = r.feed.shift()!; if (r.feed.length === 0) done = true; }
        this.setSlot(last, s, true); r.slots.unshift(last);
        if (done) { this.land(r); break; }
      }
      if ((r.state as string) !== 'idle') this.layout(r);
    }
    // particles
    for (let i = this.parts.length - 1; i >= 0; i--) { const p = this.parts[i]; p.life += dt; p.vy += p.g * dt / 16; p.s.x += p.vx * dt / 16; p.s.y += p.vy * dt / 16; p.s.alpha = Math.max(0, 1 - p.life / p.max);
      if (p.life >= p.max) { p.s.destroy(); this.parts.splice(i, 1); } }
    for (const r of this.reels) if (r.antic) r.glow.alpha = .65 + Math.sin(this.t / 90) * .35;
  }
  private landResolve: (() => void) | null = null; private landed = 0; private spinCtx: Spin | null = null; private anticOK = false; private scat = 0;
  private land(r: Reel) {
    const i = this.reels.indexOf(r); r.state = 'idle'; r.speed = 0;
    r.slots.forEach(sl => this.setSlot(sl, sl.s, false));
    r.pos = 0; this.layout(r);
    gsap.fromTo(r.strip, { y: this.turbo ? 14 : 26 }, { y: 0, duration: this.turbo ? .12 : .22, ease: 'back.out(3)' });
    sfx.reelStop(i); this.shake(this.turbo ? 1.5 : 3);
    r.landedCells = [r.slots[1].spr, r.slots[2].spr, r.slots[3].spr];
    if (r.antic) { r.antic = false; gsap.to(r.glow, { alpha: 0, duration: .3 }); }
    const col = this.spinCtx!.grid[i];
    col.forEach((c, row) => { if (c.s === S.SCAT) { this.scat++; this.slam(r.landedCells[row], 0x02f7fd); sfx.scatter(this.scat); } else if (c.s === S.SAFE) this.slam(r.landedCells[row], 0xf5c542, .6); });
    this.landed++;
    if (this.anticOK && this.scat >= 2 && i < 4 && !this.reels[i + 1].antic && this.reels[i + 1].state !== 'idle') this.startAntic(i + 1);
    else if (this.landed < 5 && this.reels.some(x => x.antic)) {}
    if (this.landed === 5) { this.reels.forEach(x => gsap.to(x.dark, { alpha: 0, duration: .3 })); this.onAntic(false, -1); const f = this.landResolve; this.landResolve = null; setTimeout(() => f?.(), this.turbo ? 60 : 140); }
  }
  private startAntic(j: number) {
    const now = performance.now(); const d = this.quick ? 450 : this.turbo ? 700 : 1100;
    for (let k = j; k < 5; k++) this.reels[k].stopAt = Math.max(this.reels[k].stopAt, now + (k - j + 1) * d);
    const r = this.reels[j]; r.antic = true;
    r.glow.clear().roundRect(-4, -4, CW + 8, 3 * CH + 8, 14).stroke({ color: 0x02f7fd, width: 6 }).roundRect(-10, -10, CW + 20, 3 * CH + 20, 18).stroke({ color: 0x02f7fd, width: 3, alpha: .4 });
    this.reels.forEach((x, k) => gsap.to(x.dark, { alpha: k === j ? 0 : .55, duration: .3 }));
    this.onAntic(true, j);
  }
  spin(sp: Spin, opts: { turbo: boolean; antic: boolean; keep?: number[] }) {
    this.clearWins(); this.turbo = opts.turbo; this.quick = false; this.spinCtx = sp; this.anticOK = opts.antic; this.scat = 0; this.landed = 0;
    this.tips.forEach(t => { t.label.text = this.bonus ? '' : 'TIP OFF'; t.label.style.fill = 0x5f8590; });
    this.drawTips();
    const now = performance.now(); const base = opts.turbo ? 120 : 420, stag = opts.turbo ? 45 : 140;
    this.reels.forEach((r, i) => {
      if (r.wildC && !(opts.keep && opts.keep[i])) { const w = r.wildC; r.wildC = null; gsap.to(w, { alpha: 0, duration: .15, onComplete: () => { w.destroy({ children: true }); } }); }
      const col = sp.grid[i]; const vis = col.map(c => c.s === S.WILD ? rndSym() : c.s);
      r.feed = [vis[2], vis[1], vis[0], rndSym()]; r.stopAt = now + base + i * stag; r.antic = false;
      gsap.fromTo(r.strip, { y: 0 }, { y: -14, duration: .07, yoyo: true, repeat: 1, ease: 'sine.out' });
      setTimeout(() => { r.state = 'spin'; r.speed = 900; }, 60);
    });
    const t0 = performance.now(); return new Promise<void>(res => { this.landResolve = () => { const w = window as unknown as { __spinMs?: number[] }; (w.__spinMs ??= []).push(Math.round(performance.now() - t0)); res(); }; });
  }
  quickStop() { if (!this.landResolve) return; this.quick = true; const now = performance.now(); let k = 0;
    this.reels.forEach(r => { if (r.state === 'spin' && !r.antic && r.stopAt > now) r.stopAt = now + (k++) * 30; }); }
  get spinning() { return !!this.landResolve; }

  shake(a: number) { gsap.killTweensOf(this.root, 'x,y'); const tl = gsap.timeline(); for (let k = 0; k < 4; k++) tl.to(this.root, { x: (Math.random() - .5) * a * 2 * (1 - k / 4), y: (Math.random() - .5) * a * 2 * (1 - k / 4), duration: .03 }); tl.to(this.root, { x: 0, y: 0, duration: .04 }); }
  private cellPos(r: number, row: number) { return { x: rx(r) + CW / 2, y: ROWY + row * CH + CH / 2 }; }
  burst(x: number, y: number, n: number, color: number, power = 1, g = .12) {
    for (let i = 0; i < n; i++) { const s = new Sprite(this.dot); s.anchor.set(.5); s.tint = color; s.blendMode = 'add'; const sz = 6 + Math.random() * 14; s.width = s.height = sz; s.x = x; s.y = y; this.fxL.addChild(s);
      const a = Math.random() * Math.PI * 2, v = (2 + Math.random() * 6) * power; this.parts.push({ s, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 2, life: 0, max: 450 + Math.random() * 450, g }); }
  }
  private slam(spr: Sprite, color: number, k = 1) {
    const reel = this.reels.find(r => r.strip.children.includes(spr))!; const ri = this.reels.indexOf(reel); const row = Math.round((spr.y - CH / 2) / CH);
    const p = this.cellPos(ri, row);
    gsap.fromTo(spr.scale, { x: spr.scale.x * 1.45, y: spr.scale.y * 1.45 }, { x: spr.scale.x, y: spr.scale.y, duration: .35, ease: 'back.out(2.5)' });
    const ring = new Sprite(this.dot); ring.anchor.set(.5); ring.tint = color; ring.blendMode = 'add'; ring.x = p.x; ring.y = p.y; ring.width = ring.height = CW; this.fxL.addChild(ring);
    gsap.to(ring, { width: CW * 2.6, height: CW * 2.6, alpha: 0, duration: .6, ease: 'power2.out', onComplete: () => { ring.destroy(); } });
    this.burst(p.x, p.y + CH * .35, Math.round(16 * k), 0x9fb8bf, .8, .02); this.burst(p.x, p.y, Math.round(14 * k), color, 1.2); this.shake(5 * k);
  }
  /** Enhancer (Tip off) cells reveal. */
  async enhancers(list: Enh[]) {
    for (const e of list) { const t = this.tips[e.reel]; sfx.enhancer();
      t.bg.clear().roundRect(0, 0, CW, TIP, 10).fill({ color: e.kind === 'dirty' ? 0x3a2a05 : 0x063238 }).stroke({ color: e.kind === 'dirty' ? 0xf5c542 : 0x02f7fd, width: 3 });
      t.label.text = e.kind === 'wild' ? 'WILD' : e.kind === 'safe' ? 'SAFE' : `CASH x${e.value}`; t.label.style.fill = e.kind === 'dirty' ? 0xf5c542 : 0x02f7fd;
      gsap.fromTo(t.label.scale, { x: 2, y: 2 }, { x: 1, y: 1, duration: .35, ease: 'back.out(3)' }); this.burst(rx(e.reel) + CW / 2, TIP / 2, 18, e.kind === 'dirty' ? 0xf5c542 : 0x02f7fd);
      await wait(this.turbo ? 160 : 380); }
  }
  /** Shove Wild: full reel wild card shoved in step by step, multiplier counts up. */
  async shove(r: number, mult: number, animate: boolean) {
    const reel = this.reels[r]; if (reel.wildC) { (reel.wildC.getChildByLabel('m') as Text).text = 'x' + mult; return; }
    const w = new Container(); w.x = rx(r); w.y = ROWY; this.root.addChildAt(w, this.root.getChildIndex(this.winL));
    const inner = new Container(); w.addChild(inner);
    const m = new Graphics().roundRect(0, 0, CW, 3 * CH, 10).fill(0xffffff); w.addChild(m); inner.mask = m;
    inner.addChild(new Graphics().roundRect(0, 0, CW, 3 * CH, 10).fill({ color: 0x041c22 }).roundRect(0, 0, CW, 3 * CH, 10).stroke({ color: 0x02f7fd, width: 4 }));
    const glow = new Sprite(this.dot); glow.tint = 0x02f7fd; glow.blendMode = 'add'; glow.anchor.set(.5); glow.x = CW / 2; glow.y = CH * 1.3; glow.width = CW * 1.6; glow.height = CH * 2.4; glow.alpha = .55; inner.addChild(glow);
    const art = new Sprite(this.tex[S.WILD]); art.width = CW * 1.06; art.height = CH * 1.06; art.anchor.set(.5); art.x = CW / 2; art.y = CH * 1.25; inner.addChild(art);
    const tag = new Text({ text: 'SHOVE WILD', style: { fontFamily: FONT, fontSize: 19, fontWeight: '700', fill: 0x02f7fd, letterSpacing: 2 } }); tag.anchor.set(.5); tag.x = CW / 2; tag.y = 22; inner.addChild(tag);
    const mt = new Text({ text: 'x1', label: 'm', style: { fontFamily: FONT, fontSize: 64, fontWeight: '700', fill: 0xf5c542, stroke: { color: 0x000000, width: 6 } } }); mt.label = 'm'; mt.anchor.set(.5); mt.x = CW / 2; mt.y = CH * 2.5; w.addChild(mt);
    reel.wildC = w;
    if (!animate) { mt.text = 'x' + mult; return; }
    const steps = mult - 1, off = steps ? Math.min(steps, 2) * CH * .9 : 0;
    inner.y = -3 * CH; sfx.shove(); this.burst(rx(r) + CW / 2, ROWY + 20, 20, 0x02f7fd, 1.2);
    await gsap.to(inner, { y: -off, duration: this.turbo ? .14 : .26, ease: 'power3.in' }); this.shake(4);
    for (let k = 1; k <= steps; k++) {
      await wait(this.turbo ? 90 : 200); sfx.shove(); sfx.mult(k + 1);
      await gsap.to(inner, { y: -off + off * k / steps, duration: this.turbo ? .1 : .16, ease: 'back.out(2)' });
      mt.text = 'x' + (k + 1); gsap.fromTo(mt.scale, { x: 1.8, y: 1.8 }, { x: 1, y: 1, duration: .3, ease: 'back.out(3)' }); this.shake(3);
      this.burst(rx(r) + CW / 2, ROWY + CH * 2.5, 12, 0xf5c542);
    }
    if (!steps) gsap.fromTo(mt.scale, { x: 1.8, y: 1.8 }, { x: 1, y: 1, duration: .3, ease: 'back.out(3)' });
  }
  /** Safes crack into stacked symbols (badge shows the stack size). */
  async crackSafes(sp: Spin) {
    const cells: { r: number; row: number; size: number; reveal: number }[] = [];
    sp.grid.forEach((col, r) => col.forEach((c, row) => { if (c.s === S.SAFE && !sp.wild[r]) cells.push({ r, row, size: c.size!, reveal: c.reveal! }); }));
    if (!cells.length) return false;
    for (const c of cells) { const spr = this.reels[c.r].landedCells[c.row]; gsap.fromTo(spr, { rotation: -.06 }, { rotation: .06, duration: .05, repeat: 7, yoyo: true, onComplete: () => { spr.rotation = 0; } }); }
    sfx.safe(); await wait(this.turbo ? 200 : 420);
    for (const c of cells) { const spr = this.reels[c.r].landedCells[c.row]; const p = this.cellPos(c.r, c.row);
      spr.texture = this.tex[c.reveal]; spr.width = CW; spr.height = CH; this.reels[c.r].slots[c.row + 1].s = c.reveal;
      gsap.fromTo(spr.scale, { x: spr.scale.x * 1.4, y: spr.scale.y * 1.4 }, { x: spr.scale.x, y: spr.scale.y, duration: .35, ease: 'back.out(3)' });
      this.burst(p.x, p.y, 24, 0xf5c542, 1.3);
      const b = new Container(); b.x = p.x + CW * .3; b.y = p.y + CH * .32; b.label = 'badge';
      b.addChild(new Graphics().circle(0, 0, 22).fill(0xf5c542).stroke({ color: 0x000000, width: 3 }));
      const t = new Text({ text: 'x' + c.size, style: { fontFamily: FONT, fontSize: 24, fontWeight: '700', fill: 0x0b1920 } }); t.anchor.set(.5); b.addChild(t);
      this.winL.addChild(b); gsap.from(b.scale, { x: 0, y: 0, duration: .3, ease: 'back.out(3)' }); }
    this.shake(5); await wait(this.turbo ? 120 : 260); return true;
  }
  /** Win presentation: dim others, punch + shine + idle loop on winners, glowing way lines. */
  showWins(sp: Spin) {
    if (!sp.wins.length) return;
    const on = new Set<string>(); const colors = [0xf5c542, 0x02f7fd, 0xff8a3d, 0x7dffb3];
    sp.wins.forEach((w, wi) => {
      const rows = (r: number) => sp.wild[r] ? [1] : sp.grid[r].map((c, row) => (c.s === w.sym || (c.s === S.SAFE && c.reveal === w.sym)) ? row : -1).filter(x => x >= 0);
      const g = new Graphics(); this.winL.addChildAt(g, 0);
      for (let r = 0; r < w.len; r++) for (const row of rows(r)) on.add(r + ':' + row + (sp.wild[r] ? 'w' : ''));
      for (let r = 0; r < w.len - 1; r++) for (const a of rows(r)) for (const b of rows(r + 1)) { const A = this.cellPos(r, a), B = this.cellPos(r + 1, b);
        g.moveTo(A.x, A.y).lineTo(B.x, B.y).stroke({ color: colors[wi % 4], width: 14, alpha: .25 }); g.moveTo(A.x, A.y).lineTo(B.x, B.y).stroke({ color: colors[wi % 4], width: 4, alpha: .95 }); }
      g.alpha = 0; gsap.to(g, { alpha: 1, duration: .25, delay: wi * .12 });
    });
    this.reels.forEach((reel, r) => reel.landedCells.forEach((spr, row) => {
      const hit = on.has(r + ':' + row);
      if (sp.wild[r]) { if (reel.wildC && [...on].some(k => k.startsWith(r + ':'))) gsap.fromTo(reel.wildC.scale, { x: 1.06, y: 1.06 }, { x: 1, y: 1, duration: .4, ease: 'back.out(3)' }); return; }
      if (!hit) { gsap.to(spr, { alpha: .3, duration: .2 }); return; }
      const sx = spr.scale.x, sy = spr.scale.y;
      gsap.timeline().fromTo(spr.scale, { x: sx * 1.28, y: sy * 1.28 }, { x: sx, y: sy, duration: .35, ease: 'back.out(3)' })
        .to(spr.scale, { x: sx * 1.06, y: sy * 1.06, duration: .55, yoyo: true, repeat: -1, ease: 'sine.inOut' });
      const s = reel.slots[row + 1].s;
      if (s >= 3 && s <= 6) gsap.to(spr, { rotation: .05, duration: .3, yoyo: true, repeat: -1, ease: 'sine.inOut', delay: .35 });
      if (s === 10) { const p = this.cellPos(r, row); this.burst(p.x + 30, p.y - 40, 10, 0xff8a3d, .6); }
      // shine sweep
      const p = this.cellPos(r, row); const sh = new Sprite(this.shine); sh.anchor.set(.5); sh.width = CW * .7; sh.height = CH * 1.6; sh.rotation = .5; sh.blendMode = 'add'; sh.alpha = .8;
      const mask = new Graphics().roundRect(p.x - CW / 2 + 4, p.y - CH / 2 + 4, CW - 8, CH - 8, 10).fill(0xffffff); this.winL.addChild(mask, sh); sh.mask = mask; sh.y = p.y;
      gsap.fromTo(sh, { x: p.x - CW }, { x: p.x + CW, duration: .7, delay: .1, repeat: -1, repeatDelay: 1.1, ease: 'power1.inOut' });
      const fr = new Graphics().roundRect(p.x - CW / 2 + 3, p.y - CH / 2 + 3, CW - 6, CH - 6, 12).stroke({ color: 0xf5c542, width: 3 }); this.winL.addChild(fr); gsap.from(fr, { alpha: 0, duration: .3 });
    }));
  }
  clearWins() {
    for (const ch of [...this.winL.children]) { gsap.killTweensOf(ch); ch.destroy(); }
    this.reels.forEach(r => r.landedCells.forEach(s => { gsap.killTweensOf(s); gsap.killTweensOf(s.scale); s.alpha = 1; s.rotation = 0; s.width = CW; s.height = CH; }));
  }
  /** Demo helper for showcase: force anticipation on a crafted spin. */
}
export const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
