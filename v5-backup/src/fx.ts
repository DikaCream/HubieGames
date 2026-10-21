// Single full-screen canvas particle system (60fps, DPR-capped): ambient dust/sparkles, coin showers, bursts, streaks.
type Kind = 'dust' | 'coin' | 'spark' | 'bill' | 'ember';
type P = { x: number; y: number; vx: number; vy: number; life: number; max: number; kind: Kind; r: number; rot: number; vr: number; hue: number; g: number };
export class FX {
  ps: P[] = []; ctx: CanvasRenderingContext2D; w = 0; h = 0; d = 1; c: HTMLCanvasElement;
  shower = 0; ambient = true; heat = false;
  constructor(c: HTMLCanvasElement) { this.c = c; this.ctx = c.getContext('2d')!; this.resize(); addEventListener('resize', () => this.resize()); requestAnimationFrame(this.loop); }
  resize() { this.d = Math.min(devicePixelRatio || 1, 1.75); this.w = this.c.width = innerWidth * this.d; this.h = this.c.height = innerHeight * this.d; }
  private add(p: Partial<P>) { if (this.ps.length > 900) return; this.ps.push({ x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 100, kind: 'spark', r: 4, rot: Math.random() * 6, vr: (Math.random() - .5) * .3, hue: 45, g: .35, ...p }); }
  /** Burst at CSS-pixel coordinates. */
  burst(n: number, x = innerWidth / 2, y = innerHeight / 2, kinds: Kind[] = ['coin', 'spark'], power = 1) {
    const s0 = this.d * Math.min(1.4, innerWidth / 900);
    for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, s = (3 + Math.random() * 11) * s0 * power; const k = kinds[Math.floor(Math.random() * kinds.length)];
      this.add({ x: x * this.d, y: y * this.d, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 5 * s0, max: 70 + Math.random() * 70, kind: k, r: (k === 'coin' ? 7 + Math.random() * 7 : k === 'bill' ? 10 : 2 + Math.random() * 3) * s0, hue: k === 'spark' ? 30 + Math.random() * 160 : 45, g: k === 'bill' ? .08 : .3 * s0 }); }
  }
  burstAt(el: Element | null, n = 24, kinds: Kind[] = ['spark'], power = .6) { if (!el) return; const r = el.getBoundingClientRect(); this.burst(n, r.left + r.width / 2, r.top + r.height / 2, kinds, power); }
  loop = () => {
    const { ctx, w, h, d } = this; ctx.clearRect(0, 0, w, h);
    if (this.ambient && Math.random() < .25) this.add({ x: Math.random() * w, y: h + 10, vx: (Math.random() - .5) * .4, vy: -(.4 + Math.random() * 1.1) * d, max: 500, kind: this.heat ? 'ember' : 'dust', r: (1 + Math.random() * 2) * d, g: 0 });
    for (let i = 0; i < this.shower; i++) if (Math.random() < .45) this.add({ x: Math.random() * w, y: -20 - Math.random() * 60, vx: (Math.random() - .5) * 2, vy: (5 + Math.random() * 6) * d, max: 220, kind: Math.random() < .8 ? 'coin' : 'bill', r: (8 + Math.random() * 9) * d, g: .12 * d });
    this.ps = this.ps.filter(p => p.life++ < p.max && p.y < h + 60 && p.y > -200);
    for (const p of this.ps) {
      p.vy += p.g; p.x += p.vx; p.y += p.vy; p.rot += p.vr; if (p.kind === 'bill') { p.vx = Math.sin(p.life / 12) * 2 * d; }
      const a = Math.min(1, (p.max - p.life) / 25, p.life / 6);
      if (p.kind === 'dust' || p.kind === 'ember') { ctx.globalAlpha = a * .7; ctx.fillStyle = p.kind === 'ember' ? '#ff8a1f' : '#7ff3ef'; ctx.beginPath(); ctx.arc(p.x + Math.sin(p.life / 25) * 6 * d, p.y, p.r, 0, 7); ctx.fill(); continue; }
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.globalAlpha = a;
      if (p.kind === 'coin') { const sx = Math.max(.12, Math.abs(Math.cos(p.life / 5 + p.rot)));
        ctx.fillStyle = '#b86e00'; ctx.beginPath(); ctx.ellipse(0, 0, p.r * sx, p.r, 0, 0, 7); ctx.fill();
        ctx.fillStyle = sx > .5 ? '#ffd23f' : '#f2a516'; ctx.beginPath(); ctx.ellipse(0, -p.r * .08, p.r * sx * .82, p.r * .82, 0, 0, 7); ctx.fill();
        if (sx > .6) { ctx.fillStyle = '#fff6c2'; ctx.fillRect(-p.r * .25 * sx, -p.r * .5, p.r * .18 * sx, p.r * .5); } }
      else if (p.kind === 'bill') { ctx.fillStyle = '#5fb36a'; ctx.fillRect(-p.r, -p.r * .5, p.r * 2, p.r); ctx.fillStyle = '#2f7a3a'; ctx.beginPath(); ctx.arc(0, 0, p.r * .3, 0, 7); ctx.fill(); }
      else { ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = `hsl(${p.hue},100%,65%)`; ctx.fillRect(-p.r * 2, -p.r / 3, p.r * 4, p.r / 1.5); ctx.globalCompositeOperation = 'source-over'; }
      ctx.restore();
    }
    ctx.globalAlpha = 1; requestAnimationFrame(this.loop);
  };
}
