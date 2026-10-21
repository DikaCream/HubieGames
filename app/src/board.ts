// PixiJS v8 board: 5 reels x 3 rows plus a Vault Cell above and below each reel.
// Motion blur strips, staggered stops with overshoot, anticipation, cell reveals, split reels, Runners, wins.
import { Application, Container, Sprite, Texture, Graphics, Text } from 'pixi.js';
import gsap from 'gsap';
import { S, PAYING, SYM, type Spin, type Cell, type Runner } from './engine';
import { ART } from './art';
import { sfx } from './sound';

export const C = 124, GAP = 6, PITCH = C + GAP;
export const BW = 5 * C + 4 * GAP, BH = 5 * C + 4 * GAP;
const MAIN_Y = PITCH; // main rows start below the top vault cell
const rx = (r: number) => r * PITCH;
const ry = (row: number) => row === 0 ? 0 : row === 4 ? MAIN_Y + 3 * C + GAP : MAIN_Y + (row - 1) * C;
const rndSym = () => PAYING[Math.floor(Math.random() * 8)];
const FONT = 'Oswald, Impact, sans-serif';
export const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

type Slot = { s: number; spr: Sprite };
interface Reel { c: Container; strip: Container; slots: Slot[]; pos: number; speed: number; state: 'idle' | 'spin' | 'stopping'; feed: number[]; stopAt: number; antic: boolean; dark: Graphics; glow: Graphics; cells: Sprite[]; vault: { lock: Sprite; content: Sprite; open: boolean; badge: Container | null }[] }
type Particle = { s: Sprite; vx: number; vy: number; life: number; max: number; g: number };

async function loadImg(url: string) { const i = new Image(); i.src = url; await i.decode().catch(() => {}); return i; }
const FRAME: Record<number, string> = { 0: '#f5c542', 1: '#02F7FD', 2: '#f5c542', 3: '#02F7FD', 4: '#f5c542', 5: '#f5c542', 6: '#e0384e', 7: '#3f86ff', 8: '#1fd08f', 9: '#a865ff', 10: '#5aa7b5', 11: '#5aa7b5', 12: '#5aa7b5', 13: '#5aa7b5' };
/** One frame system for every symbol: dark rounded card, art inside, coloured rim. Full art cards are cropped to cover; cut out icons sit on a tinted glow. */
function drawFramed(x: CanvasRenderingContext2D, img: HTMLImageElement, sym: number, card: boolean, X: number, Y: number, W: number) {
  const col = FRAME[sym] ?? '#5aa7b5', r = W * .14, inset = W * .04;
  const path = () => { x.beginPath(); x.roundRect(X + inset, Y + inset, W - inset * 2, W - inset * 2, r); };
  x.save(); path(); x.clip();
  const g = x.createRadialGradient(X + W / 2, Y + W * .45, W * .05, X + W / 2, Y + W / 2, W * .7); g.addColorStop(0, col + '66'); g.addColorStop(.6, '#0c2229'); g.addColorStop(1, '#050e12');
  x.fillStyle = g; x.fillRect(X, Y, W, W);
  if (card) { const c = .07 * img.width; x.drawImage(img, c, c, img.width - 2 * c, img.height - 2 * c, X + inset, Y + inset, W - inset * 2, W - inset * 2); }
  else { const pad = W * .1, sc = Math.min((W - pad * 2) / img.width, (W - pad * 2) / img.height), w = img.width * sc, h = img.height * sc; x.drawImage(img, X + (W - w) / 2, Y + (W - h) / 2, w, h); }
  const sh = x.createLinearGradient(0, Y, 0, Y + W); sh.addColorStop(0, '#ffffff22'); sh.addColorStop(.35, '#ffffff00'); x.fillStyle = sh; x.fillRect(X, Y, W, W);
  x.restore(); path(); x.lineWidth = W * .035; x.strokeStyle = col; x.stroke(); x.lineWidth = W * .012; x.strokeStyle = '#ffffff55'; x.stroke();
}
function tex(img: HTMLImageElement, mode: 'plain' | 'blur' | 'split', sym = -1, card = false) {
  const R = 2, W = C * R, cv = document.createElement('canvas'); cv.width = W; cv.height = W; const x = cv.getContext('2d')!;
  if (sym < 0) { x.drawImage(img, 0, 0, W, W); return Texture.from(cv); }
  if (mode === 'plain') drawFramed(x, img, sym, card, 0, 0, W);
  else if (mode === 'blur') { const t = document.createElement('canvas'); t.width = t.height = W; drawFramed(t.getContext('2d')!, img, sym, card, 0, 0, W);
    for (let i = 0; i < 12; i++) { x.globalAlpha = .18; x.drawImage(t, 0, (i / 11 - .5) * W * .5); } }
  else { const h = W * .54; drawFramed(x, img, sym, card, 0, 0, h); drawFramed(x, img, sym, card, W - h, W - h, h);
    x.strokeStyle = '#02F7FD'; x.lineWidth = 3 * R; x.globalAlpha = .8; x.beginPath(); x.moveTo(W * .92, W * .08); x.lineTo(W * .08, W * .92); x.stroke(); }
  return Texture.from(cv);
}
function dotTex() { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d')!; const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, '#fff'); g.addColorStop(.4, '#ffffff88'); g.addColorStop(1, '#fff0'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); return Texture.from(c); }
function shineTex() { const c = document.createElement('canvas'); c.width = 128; c.height = 8; const x = c.getContext('2d')!; const g = x.createLinearGradient(0, 0, 128, 0);
  g.addColorStop(0, '#fff0'); g.addColorStop(.5, '#ffffffcc'); g.addColorStop(1, '#fff0'); x.fillStyle = g; x.fillRect(0, 0, 128, 8); return Texture.from(c); }
function badge(text: string, color = 0xf5c542, size = 22) {
  const b = new Container(); const t = new Text({ text, style: { fontFamily: FONT, fontSize: size, fontWeight: '700', fill: 0x0b1920 } }); t.anchor.set(.5);
  const w = Math.max(size * 1.7, t.width + 16); b.addChild(new Graphics().roundRect(-w / 2, -size * .75, w, size * 1.5, size * .75).fill(color).stroke({ color: 0x000000, width: 3 }), t); return b;
}

export class Board {
  app = new Application(); root = new Container(); reels: Reel[] = []; T: Record<string, Texture> = {}; plain: Texture[] = []; blur: Texture[] = []; splitT: Texture[] = [];
  fxL = new Container(); winL = new Container(); runL = new Container(); parts: Particle[] = []; dot!: Texture; shine!: Texture;
  bonus = false; quick = false; turbo = false; runners: { c: Container; b: Container; m: number }[] = [];
  onAntic: (on: boolean) => void = () => {}; onLand: (reel: number) => void = () => {};
  private t = 0; private landResolve: (() => void) | null = null; private landed = 0; private ctx: Spin | null = null; private anticOK = false; private keys = 0;

  async init(host: HTMLElement) {
    await this.app.init({ width: BW, height: BH, backgroundAlpha: 0, antialias: true, resolution: Math.min(devicePixelRatio || 1, 2), autoDensity: true, preference: 'webgl' });
    const cv = this.app.canvas; cv.style.width = '100%'; cv.style.height = '100%'; cv.style.display = 'block'; host.appendChild(cv);
    const imgs = await Promise.all(SYM.map(n => loadImg(ART(n))));
    const cards = new Set([S.WILD, S.DWILD, 6, 7, 8, 9]);
    this.plain = imgs.map((im, i) => tex(im, 'plain', i, cards.has(i as 0))); this.blur = imgs.map((im, i) => tex(im, 'blur', i, cards.has(i as 0)));
    this.splitT = imgs.map((im, i) => tex(im, 'split', i, cards.has(i as 0)));
    this.T.locked = tex(await loadImg(ART('locked')), 'plain'); this.T.runner = tex(await loadImg(ART('runner')), 'plain', S.WILD, true);
    this.dot = dotTex(); this.shine = shineTex();
    this.app.stage.addChild(this.root);
    for (let r = 0; r < 5; r++) {
      const c = new Container(); c.x = rx(r); this.root.addChild(c);
      c.addChild(new Graphics().roundRect(0, MAIN_Y, C, 3 * C, 10).fill({ color: 0x06141a, alpha: .86 }));
      const strip = new Container(); c.addChild(strip);
      const m = new Graphics().roundRect(0, MAIN_Y, C, 3 * C, 10).fill(0xffffff); c.addChild(m); strip.mask = m;
      const slots: Slot[] = [];
      for (let i = 0; i < 5; i++) { const s = rndSym(); const spr = new Sprite(this.plain[s]); spr.anchor.set(.5); spr.width = spr.height = C; strip.addChild(spr); slots.push({ s, spr }); }
      const vault = [0, 4].map(row => { const lock = new Sprite(this.T.locked); lock.width = lock.height = C; lock.y = ry(row); c.addChild(lock);
        const content = new Sprite(Texture.EMPTY); content.anchor.set(.5); content.x = C / 2; content.y = ry(row) + C / 2; content.width = content.height = C; content.visible = false; c.addChild(content);
        return { lock, content, open: false, badge: null as Container | null }; });
      const dark = new Graphics().rect(0, 0, C, BH).fill(0x000000); dark.alpha = 0; c.addChild(dark);
      const glow = new Graphics(); glow.alpha = 0; c.addChild(glow);
      const reel: Reel = { c, strip, slots, pos: 0, speed: 0, state: 'idle', feed: [], stopAt: 0, antic: false, dark, glow, cells: [], vault };
      this.reels.push(reel); this.layout(reel); reel.cells = [slots[1].spr, slots[2].spr, slots[3].spr];
    }
    this.root.addChild(this.winL, this.runL, this.fxL);
    this.app.ticker.add(tk => this.tick(tk.deltaMS));
  }
  setSkin(bonus: boolean) { this.bonus = bonus; this.reels.forEach(r => (r.c.children[0] as Graphics).clear().roundRect(0, MAIN_Y, C, 3 * C, 10).fill({ color: bonus ? 0x1c0c05 : 0x06141a, alpha: .86 })); }
  private layout(r: Reel) { r.slots.forEach((sl, i) => { sl.spr.x = C / 2; sl.spr.y = MAIN_Y + (i - 1) * C + C / 2 + r.pos; }); }
  private setSlot(sl: Slot, s: number, t: 'plain' | 'blur' | 'split') { sl.s = s; sl.spr.texture = (t === 'blur' ? this.blur : t === 'split' ? this.splitT : this.plain)[s]; sl.spr.width = sl.spr.height = C; }

  private tick(dt: number) {
    this.t += dt; const now = performance.now();
    for (const r of this.reels) {
      if (r.state === 'idle') continue;
      if (r.state === 'spin' && now >= r.stopAt) r.state = 'stopping';
      const target = r.antic ? 1400 : this.turbo ? 4600 : 3700;
      r.speed += (target - r.speed) * Math.min(1, dt / 90); r.pos += r.speed * dt / 1000;
      let done = false;
      while (r.pos >= C) { r.pos -= C; const last = r.slots.pop()!; let s = rndSym();
        if (r.state === 'stopping') { s = r.feed.shift()!; if (!r.feed.length) done = true; }
        this.setSlot(last, s, 'blur'); r.slots.unshift(last); if (done) break; }
      if (done) this.land(r); else this.layout(r);
    }
    for (let i = this.parts.length - 1; i >= 0; i--) { const p = this.parts[i]; p.life += dt; p.vy += p.g * dt / 16; p.s.x += p.vx * dt / 16; p.s.y += p.vy * dt / 16; p.s.alpha = Math.max(0, 1 - p.life / p.max);
      if (p.life >= p.max) { p.s.destroy(); this.parts.splice(i, 1); } }
    for (const r of this.reels) if (r.antic) r.glow.alpha = .65 + Math.sin(this.t / 90) * .35;
  }
  private land(r: Reel) {
    const i = this.reels.indexOf(r); r.state = 'idle'; r.speed = 0; r.pos = 0;
    r.slots.forEach(sl => this.setSlot(sl, sl.s, 'plain')); this.layout(r); r.cells = [r.slots[1].spr, r.slots[2].spr, r.slots[3].spr];
    gsap.fromTo(r.strip, { y: this.turbo ? 12 : 24 }, { y: 0, duration: this.turbo ? .12 : .22, ease: 'back.out(3)' });
    sfx.reelStop(i); this.shake(this.turbo ? 1.5 : 3);
    if (r.antic) { r.antic = false; gsap.to(r.glow, { alpha: 0, duration: .3 }); }
    this.ctx!.grid[i].slice(1, 4).forEach((c, k) => { if (c!.s === S.KEY) { this.keys++; this.slam(i, k + 1, 0x02f7fd); sfx.scatter(this.keys); } else if (c!.s === S.DWILD) this.slam(i, k + 1, 0xf5c542, .7); });
    this.landed++; this.onLand(i);
    if (this.anticOK && this.keys >= 2 && i < 4 && this.reels[i + 1].state !== 'idle' && !this.reels[i + 1].antic) this.startAntic(i + 1);
    if (this.landed === 5) { this.reels.forEach(x => gsap.to(x.dark, { alpha: 0, duration: .25 })); this.onAntic(false); const f = this.landResolve; this.landResolve = null; setTimeout(() => f?.(), this.turbo ? 50 : 120); }
  }
  private startAntic(j: number) {
    const now = performance.now(), d = this.quick ? 450 : this.turbo ? 650 : 1050;
    for (let k = j; k < 5; k++) this.reels[k].stopAt = Math.max(this.reels[k].stopAt, now + (k - j + 1) * d);
    const r = this.reels[j]; r.antic = true;
    r.glow.clear().roundRect(-4, MAIN_Y - 4, C + 8, 3 * C + 8, 14).stroke({ color: 0x02f7fd, width: 6 }).roundRect(-10, MAIN_Y - 10, C + 20, 3 * C + 20, 18).stroke({ color: 0x02f7fd, width: 3, alpha: .4 });
    this.reels.forEach((x, k) => gsap.to(x.dark, { alpha: k === j ? 0 : .55, duration: .3 })); this.onAntic(true);
  }
  /** Close all vault cells and clear split visuals (start of each spin). */
  private resetVaults() { for (const r of this.reels) for (const v of r.vault) { v.open = false; v.content.visible = false; v.badge?.destroy(); v.badge = null; gsap.killTweensOf(v.lock); v.lock.alpha = 1; v.lock.y = ry(r.vault.indexOf(v) ? 4 : 0); } }
  spin(sp: Spin, opts: { turbo: boolean; antic: boolean }) {
    this.clearWins(); this.clearParticles(); this.resetVaults(); this.turbo = opts.turbo; this.quick = false; this.ctx = sp; this.anticOK = opts.antic; this.keys = 0; this.landed = 0;
    const now = performance.now(), base = opts.turbo ? 90 : 420, stag = opts.turbo ? 0 : 140;
    this.reels.forEach((r, i) => { const col = sp.grid[i]; r.feed = [col[3]!.s, col[2]!.s, col[1]!.s, rndSym()]; r.stopAt = now + base + i * stag; r.antic = false;
      gsap.fromTo(r.strip, { y: 0 }, { y: -12, duration: .07, yoyo: true, repeat: 1 }); setTimeout(() => { r.state = 'spin'; r.speed = 900; }, 60); });
    const t0 = performance.now();
    return new Promise<void>(res => { this.landResolve = () => { const w = window as unknown as { __spinMs?: number[] }; (w.__spinMs ??= []).push(Math.round(performance.now() - t0)); res(); }; });
  }
  quickStop() { if (!this.landResolve) return; this.quick = true; const now = performance.now(); let k = 0; this.reels.forEach(r => { if (r.state === 'spin' && !r.antic && r.stopAt > now) r.stopAt = now + (k++) * 30; }); }
  get spinning() { return !!this.landResolve; }
  /** Instantly show a grid (used to restore the board after a bonus). */
  show(sp: Spin) { this.clearWins(); this.resetVaults(); this.ctx = sp; this.reels.forEach((r, i) => { [1, 2, 3].forEach(row => this.setSlot(r.slots[row], sp.grid[i][row]!.s, 'plain')); r.cells = [r.slots[1].spr, r.slots[2].spr, r.slots[3].spr]; }); }

  shake(a: number) { gsap.killTweensOf(this.root, 'x,y'); const tl = gsap.timeline(); for (let k = 0; k < 4; k++) tl.to(this.root, { x: (Math.random() - .5) * a * 2 * (1 - k / 4), y: (Math.random() - .5) * a * 2 * (1 - k / 4), duration: .03 }); tl.to(this.root, { x: 0, y: 0, duration: .04 }); }
  pos(r: number, row: number) { return { x: rx(r) + C / 2, y: ry(row) + C / 2 }; }
  burst(x: number, y: number, n: number, color: number, power = 1, g = .12) {
    for (let i = 0; i < n; i++) { const s = new Sprite(this.dot); s.anchor.set(.5); s.tint = color; s.blendMode = 'add'; s.width = s.height = 6 + Math.random() * 14; s.x = x; s.y = y; this.fxL.addChild(s);
      const a = Math.random() * Math.PI * 2, v = (2 + Math.random() * 6) * power; this.parts.push({ s, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 2, life: 0, max: 400 + Math.random() * 400, g }); }
  }
  clearParticles() { this.parts.forEach(p => p.s.destroy()); this.parts = []; }
  private ring(x: number, y: number, color: number) { const ring = new Sprite(this.dot); ring.anchor.set(.5); ring.tint = color; ring.blendMode = 'add'; ring.x = x; ring.y = y; ring.width = ring.height = C; this.fxL.addChild(ring);
    gsap.to(ring, { width: C * 2.6, height: C * 2.6, alpha: 0, duration: .6, ease: 'power2.out', onComplete: () => { ring.destroy(); } }); }
  private slam(r: number, row: number, color: number, k = 1) {
    const spr = this.reels[r].slots[row].spr; const p = this.pos(r, row);
    gsap.fromTo(spr.scale, { x: spr.scale.x * 1.45, y: spr.scale.y * 1.45 }, { x: spr.scale.x, y: spr.scale.y, duration: .35, ease: 'back.out(2.5)' });
    this.ring(p.x, p.y, color); this.burst(p.x, p.y + C * .35, Math.round(14 * k), 0x9fb8bf, .8, .02); this.burst(p.x, p.y, Math.round(12 * k), color, 1.2); this.shake(5 * k);
  }
  private cellTex(c: Cell) { return this.plain[c.s === S.EXPAND ? c.x! : c.s]; }
  /** Open vault cells one by one: shutter slides away, content slams in. */
  async openCells(sp: Spin) {
    for (const rv of sp.reveals) { const r = this.reels[rv.reel]; const v = r.vault[rv.row === 0 ? 0 : 1]; const p = this.pos(rv.reel, rv.row);
      sfx.enhancer(); v.open = true;
      sfx.cellOpen(); gsap.to(v.lock, { y: v.lock.y + (rv.row === 0 ? -C * .6 : C * .6), alpha: 0, duration: this.turbo ? .15 : .3, ease: 'power2.in' });
      await wait(this.turbo ? 90 : 200);
      v.content.texture = rv.cell.s === S.EXPAND ? this.plain[S.EXPAND] : this.cellTex(rv.cell); v.content.width = v.content.height = C; v.content.visible = true;
      gsap.fromTo(v.content.scale, { x: v.content.scale.x * 1.5, y: v.content.scale.y * 1.5 }, { x: v.content.scale.x, y: v.content.scale.y, duration: .3, ease: 'back.out(3)' });
      const col = rv.cell.s === S.WILD ? 0xf5c542 : rv.cell.s === S.SPLIT ? 0x02f7fd : rv.cell.s === S.EXPAND ? 0xf5c542 : 0xffffff;
      this.ring(p.x, p.y, col); this.burst(p.x, p.y, 16, col);
      if (rv.cell.s === S.EXPAND) { await wait(this.turbo ? 120 : 320); v.content.texture = this.plain[rv.cell.x!]; v.content.width = v.content.height = C; sfx.safe();
        const b = badge('4x'); b.x = p.x - rx(rv.reel) + C * .3; b.y = ry(rv.row) + C * .78; r.c.addChild(b); v.badge = b; gsap.from(b.scale, { x: 0, y: 0, duration: .3, ease: 'back.out(3)' }); }
      await wait(this.turbo ? 100 : 260);
    }
  }
  /** Apply split visuals: regular symbols on split reels show as two halves. */
  async applySplits(sp: Spin) {
    let any = false;
    sp.split.forEach((on, r) => { if (!on) return; any = true; const reel = this.reels[r];
      [1, 2, 3].forEach((row, k) => { const c = sp.grid[r][row]!; if (PAYING.includes(c.s)) { const spr = reel.cells[k]; spr.texture = this.splitT[c.s]; spr.width = spr.height = C;
        gsap.fromTo(spr.scale, { x: spr.scale.x * 1.25, y: spr.scale.y * 1.25 }, { x: spr.scale.x, y: spr.scale.y, duration: .3, ease: 'back.out(3)' }); } });
      for (const [vi, row] of [[0, 0], [1, 4]] as const) { const c = sp.grid[r][row]; if (c && PAYING.includes(c.s)) { reel.vault[vi].content.texture = this.splitT[c.s]; reel.vault[vi].content.width = reel.vault[vi].content.height = C; } }
      const p = this.pos(r, 2); this.burst(p.x, p.y, 26, 0x02f7fd, 1.4); });
    if (any) { sfx.shove(); this.shake(4); await wait(this.turbo ? 150 : 380); }
  }
  /** Runners move to their new cells; on a split reel they double (badge punch). */
  async moveRunners(list: Runner[], first: boolean) {
    while (this.runners.length < list.length) { const c = new Container(); const s = new Sprite(this.T.runner); s.anchor.set(.5); s.width = s.height = C * .98; c.addChild(s);
      const b = badge('x1', 0x02f7fd, 24); b.y = C * .36; c.addChild(b); const p = this.pos(2, 2); c.x = p.x; c.y = p.y; c.scale.set(0); this.runL.addChild(c); this.runners.push({ c, b, m: 1 }); }
    await Promise.all(list.map(async (rn, i) => { const R = this.runners[i]; const p = this.pos(rn.r, rn.row);
      if (first || R.c.scale.x === 0) { R.c.x = p.x; R.c.y = p.y; await gsap.to(R.c.scale, { x: 1, y: 1, duration: .35, ease: 'back.out(2.5)' }); }
      else { sfx.whoosh(); await gsap.to(R.c, { x: p.x, y: p.y, duration: this.turbo ? .2 : .45, ease: 'power3.inOut' }); }
      this.ring(p.x, p.y, 0x02f7fd);
      if (rn.doubled) { await wait(i * 120); sfx.mult(Math.log2(rn.m)); this.setBadge(R, rn.m); this.burst(p.x, p.y, 24, 0xf5c542, 1.3); gsap.fromTo(R.c.scale, { x: 1.35, y: 1.35 }, { x: 1, y: 1, duration: .4, ease: 'back.out(3)' }); }
      else this.setBadge(R, rn.m); }));
  }
  private setBadge(R: { c: Container; b: Container; m: number }, m: number) { if (R.m === m && R.b.parent) return; R.m = m; R.b.destroy(); const b = badge('x' + m, m > 1 ? 0xf5c542 : 0x02f7fd, 24); b.y = C * .36; R.c.addChild(b); R.b = b; gsap.from(b.scale, { x: 1.8, y: 1.8, duration: .3, ease: 'back.out(3)' }); }
  clearRunners() { this.runners.forEach(r => r.c.destroy({ children: true })); this.runners = []; }
  /** Mystery Symbol: key cells turn into envelopes, then reveal the marked symbol and its multiplier. */
  async mystery(sp: Spin, sym: number, mult: number) {
    const cells: { r: number; row: number; s: Sprite }[] = [];
    sp.grid.forEach((col, r) => col.forEach((c, row) => { if (c && c.s === S.KEY && row >= 1 && row <= 3) cells.push({ r, row, s: this.reels[r].cells[row - 1] }); }));
    for (const { s } of cells) { s.texture = this.plain[S.MYST]; s.width = s.height = C; }
    sfx.riser(1); await wait(this.turbo ? 350 : 800);
    const bs: Container[] = [];
    for (const { r, row, s } of cells) { s.texture = this.plain[sym]; s.width = s.height = C; const p = this.pos(r, row); this.ring(p.x, p.y, 0xf5c542); this.burst(p.x, p.y, 18, 0xf5c542);
      const b = badge('x' + mult, 0xf5c542, 26); b.x = p.x + C * .26; b.y = p.y + C * .34; this.fxL.addChild(b); bs.push(b); gsap.from(b.scale, { x: 0, y: 0, duration: .35, ease: 'back.out(3)' }); }
    sfx.tierUp(1); await wait(this.turbo ? 500 : 1200); bs.forEach(b => b.destroy());
  }
  /** Win presentation: dim others, punch + shine + idle loop on winners, glowing way lines. */
  showWins(sp: Spin) {
    if (!sp.wins.length) return;
    const colors = [0xf5c542, 0x02f7fd, 0xff8a3d, 0x7dffb3]; const hit = new Set<string>();
    const runAt = (r: number, row: number) => sp.runners.some(x => x.r === r && x.row === row);
    sp.wins.forEach((w, wi) => {
      const rows = (r: number) => [0, 1, 2, 3, 4].filter(row => { if (runAt(r, row)) return true; const c = sp.grid[r][row]; if (!c) return false;
        return c.s === w.sym || c.s === S.WILD || c.s === S.DWILD || (c.s === S.EXPAND && c.x === w.sym); });
      const g = new Graphics(); this.winL.addChild(g);
      for (let r = 0; r < w.len; r++) for (const row of rows(r)) hit.add(r + ':' + row);
      for (let r = 0; r < w.len - 1; r++) for (const a of rows(r)) for (const b of rows(r + 1)) { const A = this.pos(r, a), B = this.pos(r + 1, b);
        g.moveTo(A.x, A.y).lineTo(B.x, B.y).stroke({ color: colors[wi % 4], width: 12, alpha: .22 }); g.moveTo(A.x, A.y).lineTo(B.x, B.y).stroke({ color: colors[wi % 4], width: 3.5, alpha: .95 }); }
      g.alpha = 0; gsap.to(g, { alpha: 1, duration: .25, delay: wi * .1 });
    });
    this.reels.forEach((reel, r) => [1, 2, 3, 0, 4].forEach(row => {
      const spr = row >= 1 && row <= 3 ? reel.cells[row - 1] : reel.vault[row === 0 ? 0 : 1].content;
      if (row === 0 || row === 4) { if (!reel.vault[row === 0 ? 0 : 1].open) return; }
      if (!hit.has(r + ':' + row)) { gsap.to(spr, { alpha: .3, duration: .2 }); return; }
      if (runAt(r, row)) return;
      const sx = spr.scale.x, sy = spr.scale.y;
      gsap.timeline().fromTo(spr.scale, { x: sx * 1.25, y: sy * 1.25 }, { x: sx, y: sy, duration: .35, ease: 'back.out(3)' }).to(spr.scale, { x: sx * 1.05, y: sy * 1.05, duration: .55, yoyo: true, repeat: -1, ease: 'sine.inOut' });
      const p = this.pos(r, row); const sh = new Sprite(this.shine); sh.anchor.set(.5); sh.width = C * .7; sh.height = C * 1.6; sh.rotation = .5; sh.blendMode = 'add'; sh.alpha = .8;
      const mask = new Graphics().roundRect(p.x - C / 2 + 4, p.y - C / 2 + 4, C - 8, C - 8, 10).fill(0xffffff); this.winL.addChild(mask, sh); sh.mask = mask; sh.y = p.y;
      gsap.fromTo(sh, { x: p.x - C }, { x: p.x + C, duration: .7, delay: .1, repeat: -1, repeatDelay: 1.1, ease: 'power1.inOut' });
      const fr = new Graphics().roundRect(p.x - C / 2 + 3, p.y - C / 2 + 3, C - 6, C - 6, 12).stroke({ color: 0xf5c542, width: 3 }); this.winL.addChild(fr);
    }));
    this.runners.forEach(R => gsap.fromTo(R.c.scale, { x: 1.15, y: 1.15 }, { x: 1, y: 1, duration: .4, ease: 'back.out(3)' }));
  }
  clearWins() {
    for (const ch of [...this.winL.children]) { gsap.killTweensOf(ch); ch.destroy(); }
    this.reels.forEach(r => { [...r.cells, ...r.vault.map(v => v.content)].forEach(s => { gsap.killTweensOf(s); gsap.killTweensOf(s.scale); s.alpha = 1; s.width = s.height = C; }); });
  }
}
