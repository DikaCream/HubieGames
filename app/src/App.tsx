import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { FEAT, playRound, PAYS, PAYING, SYM, NAMES, TIERS, S, MAX_WIN, MULT_CAP, COINS, BASE, type Spin, type Round, type Tier, type Runner } from './engine';
import { resolveRound, sha256Hex, randomServerSeed, randomClientSeed } from './fair';
import { sfx, startAmbient, setTension, setMusicOn, setSfxOn, setMusicMode, setIntensity } from './sound';
import { FX } from './fx';
import { ART, ALL_ART } from './art';
import { Board, wait } from './board';
import { post, listen } from './host';

const IMG = (s: number) => ART(SYM[s]);
const BETS = [10, 20, 30, 40, 50, 60, 80, 100, 120, 150, 200, 300, 400, 500, 1000, 2000]; // cents
export const MAX_WAYS = 1565109; // reels 1 and 5: 13 (Key 1, two doubled symbols 4, top Split 0, bottom Stack 8), reels 2 to 4: 21 (Key 1, Double Wild 2, doubled symbol 2, two Stacks 16)
const usd = (c: number) => '$' + (c / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const TIERS_WIN = [{ x: 25, t: 'HIGH ROLLER' }, { x: 50, t: 'HOUSE MONEY' }, { x: 150, t: "HUBIE'S HEIST" }, { x: 500, t: 'OWN THE HOUSE' }];
/** Bonus end screens: art and Hubie's line per feature, by win band (under 25x, 25x, 150x, 500x). */
const END_ART = ['end_ah', 'end_mr', 'end_ht'];
const END_LINES = [
  ['Quiet night. The lounge stays open.', 'A good night at the tables.', 'The bar tab is on me tonight.', 'Best night this lounge has ever seen.'],
  ['Clean getaway, light bag.', 'The midnight run paid off.', 'That briefcase is getting heavy.', 'Nobody runs midnight like you.'],
  ['The House always reopens.', 'The House pays well tonight.', 'Half the casino is yours.', 'You own the House now.'],
];
const FORCE = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('force') : null;
const tierOf = (x: number) => { let i = -1; TIERS_WIN.forEach((t, k) => { if (x >= t.x) i = k; }); return i; };
const RTP = { base: '95.8%', buys: ['96.4%', '96.0%', '96.9%'], maxOdds: 'about 1 in 500,000' }; // filled from sim-result.txt
const TIER_RULES = [
  ['8 free spins', '1 Roaming Wild', 'Each Key adds a free spin'],
  ['10 free spins', '2 Roaming Wilds', 'Each Key adds a free spin'],
  ['10 free spins', '3 Roaming Wilds', 'Each Key adds a free spin'],
];
const MULT_WORD = (m: number) => m === 2 ? 'double' : m === 3 ? 'triple' : `${m} times as much`;
const BUY_NOTE = ['Lowest price, a shorter shift.', 'Two Wilds working the floor.', 'Three Wilds for the biggest nights.'];
const SLIDES = [
  { art: 'end_ht', t: 'WELCOME TO THE HOUSE', d: `Match symbols on neighbouring reels from the left. Win up to ${MAX_WIN.toLocaleString()} times your bet.` },
  { icons: ['locked', 'key', 'wild'], t: 'KEYS OPEN CELLS', d: 'Each reel has a locked cell above and below. 1 or 2 Keys open them to show a top symbol, a Wild, a Split or a Stack.' },
  { icons: ['key', 'runner'], t: 'FREE SPINS', d: '3, 4 or 5 Keys start free spins. Roaming Wilds move every spin and get stronger on split reels.' },
];
const SHOWCASE = typeof location !== 'undefined' && location.search.includes('showcase');
const demoCache: Record<string, Spin> = {};
function findSpin(pred: (s: Spin) => boolean, plain = true) {
  for (let i = 0; i < 300000; i++) { const r = playRound(() => Array.from({ length: 96 }, Math.random)); const x = r.spins[0]; if (pred(x) && (!plain || (!x.tip.length && !x.raid && !x.lucky))) return x; }
  return playRound(() => Array.from({ length: 96 }, Math.random)).spins[0];
}
type Pose = 'idle' | 'react' | 'bonus' | 'bigwin';
type Modal = null | 'buy' | 'confirm' | 'auto' | 'info' | 'fair';
const nextFrame = () => new Promise<void>(r => requestAnimationFrame(() => r()));
/** Wait until React has mounted the element behind a ref (overlays), up to 3 s. */
async function mounted<T>(ref: { current: T | null }) { for (let i = 0; i < 180 && !ref.current; i++) await nextFrame(); return ref.current; }
type Auto = { left: number; stopWin: number; loss: number; gain: number; start: number };

export default function App() {
  const [loaded, setLoaded] = useState(0);
  const [screen, setScreen] = useState<'loading' | 'slides' | 'game'>('loading');
  const [slide, setSlide] = useState(0);
  const [modal, setModal] = useState<Modal>(null);
  const [balance, setBalance] = useState(1000000);
  const [bet, setBet] = useState(100);
  const [busy, setBusy] = useState(false);
  const [turbo, setTurbo] = useState(false);
  const [musicOn, setMusic] = useState(true); const [sfxOnS, setSfxS] = useState(true);
  const [pose, setPose] = useState<Pose>('idle');
  const [msg, setMsg] = useState<{ t: string; k?: string; img?: number; amt?: string }>({ t: 'PLACE YOUR BET' });
  const [ways, setWays] = useState(243);
  const [winC, setWinC] = useState(0);
  const [armed, setArmed] = useState<Tier | null>(null);
  const [pick, setPick] = useState<Tier | null>(null);
  const [dontAsk, setDontAsk] = useState(() => localStorage.getItem('hr_noask') === '1');
  const [auto, setAuto] = useState<Auto | null>(null);
  const [autoCfg, setAutoCfg] = useState<Auto>({ left: 25, stopWin: 0, loss: 0, gain: 0, start: 0 });
  const [bonus, setBonus] = useState<{ tier: Tier; played: number; total: number; marked: { sym: number; mult: number }; runners: Runner[]; added?: number; meter?: number } | null>(null);
  const [cine, setCine] = useState<null | { kind: 'in' | 'out'; tier: Tier; marked?: { sym: number; mult: number }; totalC?: number; x?: number; cost?: number; capped?: boolean }>(null);
  const [chipTip, setChipTip] = useState<string | null>(null); const [payTip, setPayTip] = useState<number | null>(null);
  const [big, setBig] = useState<null | { x: number; c: number }>(null);
  const [tab, setTab] = useState(0);
  const [serverSeed, setServerSeed] = useState(randomServerSeed); const [nextSeed, setNextSeed] = useState(randomServerSeed);
  const [hash, setHash] = useState(''); const [nextHash, setNextHash] = useState('');
  const [clientSeed, setClientSeed] = useState(randomClientSeed); const [nonce, setNonce] = useState(1);
  const [revealed, setRevealed] = useState<{ seed: string; clientSeed: string; last: number }[]>([]);
  const [hist, setHist] = useState<{ nonce: number; bet: number; win: number; buy: number; spins: number }[]>([]);

  const boardEl = useRef<HTMLDivElement>(null); const board = useRef<Board | null>(null);
  const fxRef = useRef<HTMLCanvasElement>(null); const fx = useRef<FX | null>(null);
  const hubRef = useRef<HTMLImageElement>(null); const winRef = useRef<HTMLSpanElement>(null);
  const tapWait = useRef<(() => void) | null>(null); const popRef = useRef<HTMLDivElement>(null);
  const bwRef = useRef<HTMLDivElement>(null), bwAmt = useRef<HTMLDivElement>(null), bwTitle = useRef<HTMLDivElement>(null), bwHub = useRef<HTMLImageElement>(null), bwHint = useRef<HTMLDivElement>(null);
  const cineTotal = useRef<HTMLDivElement>(null), cineTap = useRef<HTMLDivElement>(null); const tb = useRef(false);
  const R = useRef({ turbo: false, bet: 100, auto: null as Auto | null, balance: 1000000, armed: null as Tier | null, winC: 0, cap: 0, modal: null as Modal });
  R.current.turbo = turbo; R.current.bet = bet; R.current.auto = auto; R.current.balance = balance; R.current.armed = armed; R.current.modal = modal;
  const T = (ms: number) => wait(tb.current ? ms * .4 : ms);

  useEffect(() => { let n = 0; const all = ALL_ART();
    Promise.all(all.map(u => { const i = new Image(); i.src = u; return i.decode().catch(() => {}).finally(() => { n++; setLoaded(n / (all.length + 1)); }); }))
      .then(async () => { if (!board.current && boardEl.current) { const b = new Board(); board.current = b; await b.init(boardEl.current);
        b.onAntic = on => { setTension(on); if (!bonusOn.current) setIntensity(on ? 2 : 1); if (on) { sfx.riser(1.1); sfx.heartbeat(); setMsg({ t: 'ONE MORE KEY', k: 'antic' }); say('react', 1300); } }; }
        setLoaded(1); setTimeout(() => setScreen('slides'), 250); post('ready', { balance: 10000 }); }); }, []);
  useEffect(() => { if (fxRef.current && !fx.current) fx.current = new FX(fxRef.current); }, []);
  useEffect(() => { sha256Hex(serverSeed).then(setHash); }, [serverSeed]);
  useEffect(() => { sha256Hex(nextSeed).then(setNextHash); }, [nextSeed]);
  useEffect(() => { setMusicOn(musicOn); }, [musicOn]); useEffect(() => { setSfxOn(sfxOnS); }, [sfxOnS]);
  useEffect(() => { const fix = () => { if (scrollX || scrollY) scrollTo(0, 0); document.querySelectorAll('.app,.game,#root').forEach(e => { (e as HTMLElement).scrollLeft = 0; (e as HTMLElement).scrollTop = 0; }); };
    addEventListener('scroll', fix, true); const iv = setInterval(fix, 500); return () => { removeEventListener('scroll', fix, true); clearInterval(iv); }; }, []);
  useEffect(() => listen(m => { if (m.type === 'setBalance') setBalance(Math.round(m.balance * 100)); if (m.type === 'setBet' && BETS.includes(Math.round(m.bet * 100))) setBet(Math.round(m.bet * 100)); }), []);
  useEffect(() => { post('balance', { balance: balance / 100 }); }, [balance]);
  useEffect(() => { const el = hubRef.current; if (!el || screen !== 'game') return; gsap.killTweensOf(el);
    const br = gsap.to(el, { scaleY: 1.025, scaleX: .99, y: -3, duration: 1.7, yoyo: true, repeat: -1, ease: 'sine.inOut', transformOrigin: '50% 100%' });
    const bl = setInterval(() => gsap.fromTo(el, { scaleY: .97 }, { scaleY: 1, duration: .18 }), 4200);
    return () => { br.kill(); clearInterval(bl); gsap.killTweensOf(el); }; }, [screen]);
  useEffect(() => { const el = popRef.current; if (!el) return; gsap.killTweensOf(el); gsap.fromTo(el, { rotate: -5, scale: .9 }, { rotate: 0, scale: 1, duration: .45, ease: 'back.out(3)' }); }, [pose]);
  // autoplay driver
  useEffect(() => { if (!auto || busy || modal || cine || big || screen !== 'game') return;
    if (auto.left <= 0) { setAuto(null); return; }
    const t = setTimeout(() => { setAuto(a => a && { ...a, left: a.left - 1 }); play(); }, R.current.turbo ? 150 : 350); return () => clearTimeout(t); });
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.code !== 'Space' || ['INPUT', 'SELECT'].includes((e.target as HTMLElement).tagName)) return; e.preventDefault(); spinPress(); };
    addEventListener('keydown', k); return () => removeEventListener('keydown', k); });

  const bubT = useRef(0); const bonusOn = useRef(false); bonusOn.current = !!bonus;
  function say(p: Pose = 'react', ms = 1500) { setPose(p); clearTimeout(bubT.current); bubT.current = window.setTimeout(() => { setPose(bonusOn.current ? 'bonus' : 'idle'); }, ms); }
  const hubImg = ART(pose === 'idle' ? 'hubie_idle' : pose === 'react' ? 'hubie_react' : pose === 'bonus' ? 'hubie_bonus' : 'hubie_bigwin');
  /** Wait for a tap; in autoplay continue by itself after ms. */
  const tapOrAuto = (ms: number) => new Promise<void>(r => { let done = false; const fin = () => { if (done) return; done = true; tapWait.current = null; r(); };
    tapWait.current = () => { sfx.click(); fin(); }; if (R.current.auto) setTimeout(fin, tb.current ? ms / 2 : ms); });

  function spinPress() {
    if (tapWait.current) { tapWait.current(); return; }
    if (board.current?.spinning) { board.current.quickStop(); return; }
    if (!busy && !modal && screen === 'game') { if (auto) { setAuto(null); return; } play(); }
  }
  const shown = useRef(0); const winTw = useRef<gsap.core.Tween | null>(null); const msgAmt = useRef<HTMLSpanElement | null>(null);
  const paint = (c: number) => { shown.current = c; const t = usd(c); if (winRef.current) winRef.current.textContent = t; }; void msgAmt; const msgHold = useRef(false); const quiet = useRef(false);
  /** Single source of truth: integer cents in R.current.winC; every counter paints the same tweened value. */
  function setWin(to: number, dur = .8) { to = Math.min(to, R.current.cap || to); R.current.winC = to; setWinC(to); winTw.current?.kill(); const o = { v: shown.current };
    if (to <= o.v) { paint(to); return; }
    winTw.current = gsap.to(o, { v: to, duration: tb.current ? dur * .3 : dur, ease: 'power1.out', onUpdate: () => { paint(Math.max(shown.current, Math.min(to, Math.round(o.v)))); if (Math.random() < .3) sfx.tick(); }, onComplete: () => paint(to) }); }

  /** Presents one spin; returns its win in cents. */
  /** Landing grid: Hubie's Tip, House Swap and Last Call cells land as their original symbol first, then change on screen. */
  function landingSpin(sp: Spin): Spin {
    const grid = sp.grid.map(c => c.slice());
    sp.tip.forEach(t => { grid[t.r][t.row] = { s: t.under }; }); sp.raid?.cells.forEach(t => { grid[t.r][t.row] = { s: t.under }; });
    if (sp.lastCall) for (const r of [1, 2]) for (let row = 1; row <= 3; row++) if (grid[r][row]!.s === S.WILD) grid[r][row] = { s: 10 + (r + row) % 4 };
    return { ...sp, grid };
  }
  const cheer = () => { const el = document.querySelector('.app'); el?.classList.remove('cheer'); void (el as HTMLElement)?.offsetWidth; el?.classList.add('cheer'); sfx.cheer(); };
  async function present(sp: Spin, antic: boolean, firstFree = false) {
    const b = board.current!; const betC = R.current.bet; fx.current?.clear(); tb.current = R.current.turbo;
    setMsg({ t: sp.free ? 'FREE SPIN' : 'GOOD LUCK' }); sfx.spinStart(); setWays(243); msgHold.current = false;
    if (sp.free) setBonus(bn => bn && { ...bn, played: bn.played + 1, added: 0 });
    if (sp.tip.length) { setMsg({ t: "HUBIE'S TIP", k: 'feat' }); say('react', 1600); }
    if (sp.lastCall) { setMsg({ t: 'LAST CALL', k: 'feat' }); say('bonus', 1600); await b.banner('LAST CALL', 0xff8a3d, 900); }
    if (sp.hubieRound) { setMsg({ t: "HUBIE'S ROUND", k: 'feat' }); say('bigwin', 1800); cheer(); await b.banner("HUBIE'S ROUND", 0xf5c542, 900); }
    await b.spin(landingSpin(sp), { turbo: tb.current, antic }); setTension(false);
    if (sp.tip.length) await b.tipWilds(sp.tip);
    if (sp.raid) { setMsg({ t: 'HOUSE SWAP', k: 'feat' }); say('react', 1600); await b.flipCells(sp.raid.cells, sp.raid.sym, 0xa865ff); }
    if (sp.lastCall) await b.flipCells([1, 2].flatMap(r => [1, 2, 3].filter(row => sp.grid[r][row]!.s === S.WILD).map(row => ({ r, row }))), S.WILD, 0xf5c542);
    if (sp.lucky) { setMsg({ t: 'LUCKY CELL', k: 'feat' }); say('react', 1200); }
    else if (sp.reveals.length) setMsg({ t: 'CELLS OPEN', k: 'feat' });
    if (sp.reveals.length) await b.openCells(sp);
    if (sp.split.some(Boolean)) { setMsg({ t: 'SPLIT REEL', k: 'feat' }); await b.applySplits(sp); }
    if (sp.runners.length) { await b.moveRunners(sp.runners, firstFree); setBonus(bn => bn && { ...bn, runners: sp.runners.map(x => ({ ...x })) });
      if (sp.runners.some(r => r.doubled)) { say('bonus', 1100); cheer(); await T(200); } }
    if (sp.agents) { setMsg({ t: 'DOUBLE AGENT: A WILD SPLITS IN TWO', k: 'feat' }); await b.banner('DOUBLE AGENT', 0x02f7fd, 800); }
    if (sp.free) setIntensity(sp.meter >= 4 || sp.runners.some(r => r.m >= 8) || sp.spinsLeft === 0 ? 3 : sp.meter >= 2 || sp.runners.some(r => r.m >= 2) ? 2 : 1);
    if (sp.free && sp.meterAdd) { setBonus(bn => bn && { ...bn, meter: sp.meter }); sfx.mult(sp.meter); b.shake(4); await T(400); }
    setWays(sp.ways);
    const c = Math.round(sp.win * betC);
    if (c > 0) {
      const ways = sp.wins.map(w => ({ img: w.sym, t: `${NAMES[w.sym].toUpperCase()} ${w.len} REELS`, amt: usd(Math.round(w.pay * betC)) }));
      b.showWins(sp); const big = sp.win >= 5; const dur = sp.win < 1 ? .5 : sp.win < 5 ? .9 : 1.6;
      if (sp.wins.some(w => w.mult > 1)) sfx.multSlam();
      setWin(R.current.winC + c, dur);
      void b.cycleWays(i => { if (!msgHold.current && !quiet.current && !R.current.modal) setMsg({ ...ways[i], k: 'way' }); }, 1400);
      if (big) cheer();
      await T(sp.win < 1 ? 700 : sp.win < 5 ? 1100 : 1800); }
    else if (!sp.free && sp.keys < 3) setMsg({ t: sp.keys === 2 ? 'SO CLOSE: ONE KEY SHORT' : 'NO LUCK THIS TIME', k: 'calm' });
    if (sp.free && sp.addSpins) { msgHold.current = true; setBonus(bn => bn && { ...bn, total: bn.played + sp.spinsLeft, added: sp.addSpins }); sfx.retrigger(); setIntensity(3); cheer(); say('bigwin', 1400);
      setMsg({ t: `+${sp.addSpins} SPIN${sp.addSpins > 1 ? 'S' : ''}${sp.addRunner ? ' AND A NEW ROAMING WILD' : ''}`, k: 'feat' }); { const r = document.querySelector('.spins-left')?.getBoundingClientRect(); fx.current?.burst(50, r ? r.x + r.width / 2 : innerWidth / 2, r ? r.y + r.height / 2 : 60, ['spark', 'coin'], 1.1); } sfx.multSlam(); await T(1100); msgHold.current = false; }
    return c;
  }

  /** Big win (base game only): full screen, the count climbs through every tier it reaches. Shows exactly the amount c that the WIN meter shows. */
  async function bigWin(x: number, c: number) {
    const prevMode = bonusOn.current ? 'bonus' : 'base'; quiet.current = true; clearTimeout(bubT.current); setBig({ x, c }); setPose('bigwin'); sfx.bigWin();
    const ov = await mounted(bwRef), el = bwAmt.current, title = bwTitle.current, hub = bwHub.current;
    if (!ov || !el || !title || !hub) { setBig(null); quiet.current = false; return; }
    let skip = false; tapWait.current = () => { skip = true; };
    const f = fx.current; const turbo = tb.current; const top = tierOf(x); let shownT = -1; let fw = 0;
    const enter = (ti: number) => { if (ti <= shownT) return; shownT = ti; ov.dataset.t = String(ti); title.textContent = TIERS_WIN[ti].t;
      gsap.fromTo(title, { scale: 2.2, opacity: 0 }, { scale: 1, opacity: 1, duration: .45, ease: 'back.out(2.5)' });
      hub.src = ART(ti === 0 ? 'hubie_idle' : ti === 1 ? 'hubie_bigwin' : ti === 2 ? 'hubie_react' : 'hubie_bigwin'); gsap.fromTo(hub, { scale: .7, rotate: -8 }, { scale: 1, rotate: 0, duration: .5, ease: 'back.out(3)' });
      sfx.winTier(ti); setMusicMode('win' + ti);
      if (f) { f.shower = [2, 3, 3, 4][ti]; f.burst([30, 50, 50, 60][ti], innerWidth / 2, innerHeight * .45, ti === 0 ? ['coin', 'spark'] : ti === 1 ? ['bill', 'coin'] : ['spark', 'coin', 'bill'], 1 + ti * .25); }
      if (ti >= 1) { ov.classList.remove('shake'); void ov.offsetWidth; ov.classList.add('shake'); }
      if (ti === 3 && !fw) { const boom = () => { if (!f) return; f.burst(45, innerWidth * (.15 + Math.random() * .7), innerHeight * (.12 + Math.random() * .4), ['spark'], 1.1); sfx.firework(); }; boom(); fw = window.setInterval(boom, 650); } };
    const marks = [0, ...TIERS_WIN.map(t => t.x).filter(v => v < x), x]; const tl = gsap.timeline({ paused: true }); const o = { v: 0 };
    for (let i = 1; i < marks.length; i++) { const seg = (i === 1 ? 1.6 : i === marks.length - 1 ? 1.8 : 2.4) * (bonusOn.current ? .6 : 1); tl.to(o, { v: marks[i], duration: seg * (turbo ? .45 : 1), ease: i === marks.length - 1 ? 'power2.out' : 'none' }); }
    tl.eventCallback('onUpdate', () => { const ti = tierOf(o.v); if (ti >= 0) enter(ti); el.textContent = usd(Math.round(o.v / x * c)); if (Math.random() < .25) sfx.coin(); if (skip) tl.progress(1); });
    try {
      enter(0); await new Promise<void>(res => { tl.eventCallback('onComplete', () => res()); tl.play(); });
      enter(top); el.textContent = usd(c); gsap.fromTo(el, { scale: 1.25 }, { scale: 1, duration: .4, ease: 'back.out(3)' });
      if (bwHint.current) bwHint.current.textContent = R.current.auto ? 'COLLECTING' : 'TAP TO COLLECT';
      await tapOrAuto(bonusOn.current ? 1500 : 2500);
    } finally { tl.kill(); clearInterval(fw); if (f) f.clear(); setBig(null); setPose(bonusOn.current ? 'bonus' : 'idle'); setMusicMode(prevMode); setIntensity(bonusOn.current ? 2 : 1); quiet.current = false; }
  }
  /** Bonus end title: heist titles only when the result beats the price paid and reaches the first big win tier. */
  const resultBand = (x: number, capped?: boolean) => capped || x >= 500 ? 3 : x >= 150 ? 2 : x >= 25 ? 1 : 0;
  const endInfo = (x: number, cost = 0) => { const good = x >= Math.max(TIERS_WIN[0].x, cost); const ti = good ? tierOf(x) : -1; return { good, ti, band: good ? ti + 1 : 0 }; };

  /** Bonus total: monotonic count up. */
  async function outroCount(total: number, betC: number, cost = 0) {
    const el = await mounted(cineTotal); if (!el || total <= 0) return;
    const { ti } = endInfo(total / betC, cost); sfx.bigWin(); if (ti >= 0) { sfx.winTier(ti); setMusicMode('win' + ti); } const f = fx.current; if (f) { f.shower = 1 + Math.max(0, ti); f.burst(20 + Math.max(0, ti) * 25, innerWidth / 2, innerHeight * .45, ti >= 2 ? ['bill', 'coin', 'spark'] : ['bill', 'coin'], 1); }
    let best = 0; const o = { v: 0 }; let skip = false; tapWait.current = () => { skip = true; };
    await new Promise<void>(res => { const tw = gsap.to(o, { v: total, duration: Math.min(6, 1.5 + Math.max(0, ti) * 1.2) * (tb.current ? .4 : 1), ease: 'power1.out',
      onUpdate: () => { best = Math.max(best, Math.min(total, Math.round(o.v))); el.textContent = usd(best); if (Math.random() < .2) sfx.coin(); if (skip) tw.progress(1); }, onComplete: () => res() }); });
    el.textContent = usd(total);
  }
  const credit = (c: number) => { if (c <= 0) return; R.current.balance += c; setBalance(R.current.balance); };
  async function play(buy?: Tier) {
    if (busy || !board.current) return; startAmbient(); setMusicMode('base'); tb.current = R.current.turbo;
    const tier = buy ?? R.current.armed; const betC = R.current.bet; const cost = tier ? tier.buy * betC : betC;
    if (R.current.balance < cost) { setMsg({ t: 'INSUFFICIENT BALANCE', k: 'warn' }); setAuto(null); return; }
    setBusy(true);
    try {
    setArmed(null); R.current.armed = null; R.current.balance -= cost; setBalance(R.current.balance); R.current.winC = 0; setWinC(0); winTw.current?.kill(); paint(0);
    const n = nonce; setNonce(n + 1); const buyTier = tier ? tier.id : 0; const cap = MAX_WIN * betC;
    post('roundStart', { bet: betC / 100, cost: cost / 100, buyTier, nonce: n, serverSeedHash: hash, clientSeed });
    const round: Round = await resolveRound(serverSeed, clientSeed, n, src => playRound(src, buyTier));
    R.current.cap = cap; let total = Math.min(cap, await present(round.spins[0], !buyTier)); credit(total); const baseWin = total;
    if (total / betC >= TIERS_WIN[0].x) await bigWin(total / betC, total);
    if (round.tier && round.marked && total < cap) {
      board.current.clearWins(); const t = round.tier; setMsg({ t: `${round.spins[0].keys} KEYS · ${t.name}`, k: 'feat' }); say('bonus', 1600); board.current.shake(8);
      await T(700); await board.current.mystery(round.spins[0], round.marked.sym, round.marked.mult);
      quiet.current = true; setCine({ kind: 'in', tier: t, marked: round.marked }); sfx.bonus(); await mounted(cineTap); await tapOrAuto(3000); setCine(null); quiet.current = false;
      setBonus({ tier: t, played: 0, total: t.spins, marked: round.marked, runners: [] }); setPose('bonus'); setMusicMode('bonus'); setIntensity(1); board.current.setSkin(true);
      const free = round.spins.filter(s => s.free); let first = true;
      for (const sp of free) { await T(200);
        const sc = Math.min(cap - total, await present(sp, false, first)); total += sc; first = false;
        if (sc / betC >= TIERS_WIN[0].x) await bigWin(sc / betC, sc);
        if (total >= cap) { msgHold.current = true; setMsg({ t: 'MAX WIN REACHED', k: 'big', amt: usd(total) }); await board.current.banner('MAX WIN REACHED', 0xf5c542, 1400); msgHold.current = false; break; } }
      board.current.clearWins(); await T(400);
      fx.current?.clear(); quiet.current = true; const buyX = buyTier ? t.buy : 0;
      setCine({ kind: 'out', tier: t, totalC: total, x: total / betC, cost: buyX, capped: total >= cap });
      await outroCount(total, betC, buyX); setMusicMode('end');
      if (cineTap.current) cineTap.current.textContent = R.current.auto ? 'CONTINUING' : 'TAP TO COLLECT';
      await tapOrAuto(3000); credit(total - baseWin); fx.current?.clear(); setCine(null); quiet.current = false; setMusicMode('base');
      setBonus(null); setIntensity(1); board.current.clearRunners(); board.current.setSkin(false); board.current.show(round.spins[0]); setPose('idle'); setWays(243);
      setMsg(total > 0 ? { t: 'TOTAL WIN', k: 'win', amt: usd(total) } : { t: 'NO LUCK THIS TIME', k: 'calm' });
    } else if (total >= cap) setMsg({ t: 'MAX WIN REACHED', k: 'big', amt: usd(total) });
    winTw.current?.kill(); R.current.winC = total; setWinC(total); paint(total);
    const nb = R.current.balance;
    setHist(h => [{ nonce: n, bet: betC, win: total, buy: buyTier, spins: round.spins.length }, ...h].slice(0, 30));
    post('roundEnd', { nonce: n, bet: betC / 100, cost: cost / 100, win: total / 100, multiplier: total / betC, buyTier, spins: round.spins.length });
    const a = R.current.auto; if (a && ((a.stopWin && total >= a.stopWin * betC) || (a.loss && a.start - nb >= a.loss * betC) || (a.gain && nb - a.start >= a.gain * betC))) { setAuto(null); setMsg({ t: 'AUTOPLAY STOPPED', k: 'warn' }); }
    } catch (e) { console.warn('round presentation failed', e); setBig(null); setCine(null); quiet.current = false; msgHold.current = false; }
    finally { setBusy(false); }
  }
  function startBuy(t: Tier) { setModal(null); setPick(null); void play(t); }
  function chooseBuy(t: Tier) { sfx.click(); if (dontAsk) startBuy(t); else { setPick(t); setModal('confirm'); } }
  async function rotate() { setRevealed(r => [{ seed: serverSeed, clientSeed, last: nonce - 1 }, ...r]); setServerSeed(nextSeed); setNextSeed(randomServerSeed()); setNonce(1); }
  const bi = BETS.indexOf(bet);
  function buyClick() { sfx.click(); if (armed) { setArmed(null); setMsg({ t: 'BUY CANCELLED' }); } else setModal('buy'); }

  // Showcase helpers. Demo spins use throwaway random floats and never touch the balance.
  async function demo(kind: string) {
    if (busy || !board.current) return; setBusy(true); startAmbient(); R.current.winC = 0; setWinC(0); paint(0);
    const rv = (k: number) => (s: Spin) => s.reveals.some(r => k === 6 ? r.cell.s >= 6 : r.cell.s === k) && s.keys < 3;
    try {
      if (kind.startsWith('big')) { const x = [32, 84, 236, 1240][+kind.slice(3)]; tb.current = R.current.turbo; R.current.winC = x * R.current.bet; paint(x * R.current.bet); await bigWin(x, x * R.current.bet); }
      if (kind === 'antic') await present(demoCache.antic ??= findSpin(s => s.keys === 2 && s.keyReels[0] === 0 && s.keyReels[1] === 1), true);
      if (kind === 'win') await present(demoCache.win ??= findSpin(s => s.wins.length >= 2 && s.win >= 2 && s.win < 15 && !s.reveals.length), false);
      if (kind === 'dwild') await present(demoCache.dwild ??= findSpin(s => s.grid.some(c => c.some(x => x?.s === S.DWILD)) && s.win > 0 && s.win < 15 && s.keys === 0), false);
      for (const [k, code] of [['premium', 6], ['bwild', S.WILD], ['split', S.SPLIT], ['expand', S.EXPAND]] as const) if (kind === k) await present(demoCache[k] ??= findSpin(rv(code)), false);
      if (kind.startsWith('intro')) { const t = TIERS[+kind.slice(5)]; setCine({ kind: 'in', tier: t, marked: { sym: 6 + +kind.slice(5), mult: [3, 5, 10][+kind.slice(5)] } }); sfx.bonus(); await mounted(cineTap); await tapOrAuto(4000); setCine(null); }
      if (kind.startsWith('end')) { const ti = +(kind[3] ?? 1), x = [0, 12, 64, 260, 1100][+(kind[4] ?? 2)]; const c = x * R.current.bet; setCine({ kind: 'out', tier: TIERS[ti], totalC: c, x, cost: TIERS[ti].buy }); await outroCount(c, R.current.bet, TIERS[ti].buy); setMusicMode('end'); await tapOrAuto(4000); fx.current?.clear(); setCine(null); setMusicMode('base'); }
      if (kind.startsWith('fbig')) { const ti = +kind.slice(4); const x = [32, 84, 236, 1240][ti]; R.current.cap = MAX_WIN * R.current.bet; tb.current = R.current.turbo; setBonus({ tier: TIERS[1], played: 3, total: 10, marked: { sym: 7, mult: 2 }, runners: [] }); bonusOn.current = true; board.current.setSkin(true); setMusicMode('bonus'); setPose('bonus');
        await wait(300); setWin(x * R.current.bet, .5); await wait(600); await bigWin(x, x * R.current.bet); setBonus(null); bonusOn.current = false; board.current.setSkin(false); setMusicMode('base'); setPose('idle'); }
      if (kind === 'tip') await present(demoCache.tip ??= findSpin(s => s.tip.length >= 2, false), false);
      if (kind === 'raid') await present(demoCache.raid ??= findSpin(s => !!s.raid, false), false);
      if (kind === 'lucky') await present(demoCache.lucky ??= findSpin(s => s.lucky, false), false);
      if (kind.startsWith('f') && !kind.startsWith('fbig')) { const pred: Record<string, (s: Spin) => boolean> = { fmeter: s => s.meterAdd > 0 && s.win > 0 && s.meter > 1, fagent: s => s.agents > 0, flast: s => s.lastCall, fround: s => s.hubieRound, fretrig: s => s.addSpins > 0, fmult: s => s.runners.some(r => r.doubled) && s.win > 0 };
        let rd: Round | null = null, idx = 0; for (let i = 0; i < 20000 && !rd; i++) { const r = playRound(() => Array.from({ length: 96 }, Math.random), 1 + (i % 3)); const j = r.spins.findIndex(x => x.free && pred[kind](x)); if (j > 0) { rd = r; idx = j; } }
        if (rd) { const prev = rd.spins[idx - 1]; setBonus({ tier: rd.tier!, played: idx - 1, total: idx + rd.spins[idx].spinsLeft, marked: rd.marked!, runners: prev.runners, meter: prev.meter || 1 }); setPose('bonus'); board.current.setSkin(true); setMusicMode('bonus');
          if (prev.runners.length) await board.current.moveRunners(prev.runners, true); await present(rd.spins[idx], false); await T(800);
          setBonus(null); board.current.clearRunners(); board.current.setSkin(false); setMusicMode('base'); setPose('idle'); } }
      if (kind === 'mystery') { const sp = demoCache.my ??= findSpin(s => s.keys === 3); board.current.show(sp); await board.current.mystery(sp, 7, 5); board.current.show(sp); }
    } finally { setBusy(false); }
  }

  useEffect(() => { if (FORCE) { const w = window as unknown as Record<string, unknown>; w.__hrDemo = demo; w.__hr = { gsap, board: board.current, fx: fx.current }; } });
  const overlayOn = !!(cine || big);
  return <div className={`app ${SHOWCASE ? 'sc' : ''} ${bonus ? 'bonus' : ''} ${overlayOn ? 'covered' : ''}`}>
    <div className="bg" style={{ ['--bg' as string]: `url(${ART(bonus ? 'bonus_bg' : 'bg')})`, ['--bgt' as string]: `url(${ART(bonus ? 'bonus_bg' : 'bg_tall')})` }} />
    <div className="world"><i className="rain" /><i className="sweep" /><i className="cam c1" /><i className="cam c2" /></div>
    <canvas ref={fxRef} className="fx" />
    <div className="game">
      <aside className="side-l">
        <div className="sign"><small>WIN UP TO</small><b>x{MAX_WIN.toLocaleString()}</b></div>
        <div className="hubie"><div className="hub-pop" ref={popRef}><img ref={hubRef} src={hubImg} alt="Hubie" /></div></div>
      </aside>
      <main className="center">
        <div className="chips" onMouseLeave={() => setChipTip(null)}>
          <span className="chip" key={ways} onClick={() => setChipTip(t => t === 'ways' ? null : 'ways')} onMouseEnter={() => setChipTip('ways')}><b>{ways.toLocaleString()}</b>WAYS</span>
          {chipTip && <div className="chiptip" onClick={() => setChipTip(null)}>Ways to win on this spin. Open cells, Splits and Stacks add more.</div>}
        </div>
        <div className="board-wrap"><div className="board" ref={boardEl} onClick={() => board.current?.spinning && board.current.quickStop()} /></div>
        <div className={`msgbar ${msg.k ?? ''}`} key={msg.t + (msg.k ?? '')}>{msg.img !== undefined && <img src={IMG(msg.img)} alt="" />}<span>{msg.t}</span>{msg.amt && <em>{msg.amt}</em>}</div>
      </main>
      <aside className="side-r">
        <Logo />
        {bonus && <div className={`spins-left ${bonus.played >= bonus.total ? 'last' : ''}`}><small>FREE SPIN</small><b>{Math.max(1, bonus.played)}<span>/{bonus.total}</span></b>{!!bonus.added && <i className="added" key={'a' + bonus.total}>+{bonus.added}</i>}</div>}
      </aside>
      <footer className="hud2">
        <div className="strip">
          <button className="ic sm" title="Game rules and settings" aria-label="Game rules" onClick={() => { sfx.click(); setModal('info'); }}><svg viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" /></svg></button>
          <div className="cell"><label>BALANCE</label><b>{usd(balance)}</b></div>
          <div className="cell"><label>BET</label><b>{usd(bet)}</b></div>
          <div className="cell win"><label>WIN</label><b><span ref={el => { winRef.current = el; if (el && !el.textContent) el.textContent = usd(shown.current); }} /></b></div>
          <button className={`ic sm ${sfxOnS || musicOn ? '' : 'off'}`} title="Sound on or off" aria-label="Sound" onClick={() => { const v = !(musicOn || sfxOnS); setMusic(v); setSfxS(v); }}><svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" />{sfxOnS || musicOn ? <path d="M16 8a5 5 0 0 1 0 8" stroke="currentColor" strokeWidth="2" fill="none" /> : <path d="M16 9l5 6M21 9l-5 6" stroke="currentColor" strokeWidth="2" />}</svg></button>
        </div>
        <div className="ctrls">
          <div className="l">{bonus ? <div className="fs-tag">FREE SPINS</div> : <button className={`buy2 ${armed ? 'armed' : ''}`} title="Buy free spins" disabled={busy} onClick={buyClick}><img src={IMG(S.KEY)} alt="" /><span><b>{armed ? 'CANCEL' : 'BONUS'}</b><small>{armed ? usd(armed.buy * bet) : 'BUY'}</small></span></button>}</div>
          <div className="c">
            <button className="pm" aria-label="Lower bet" disabled={busy || bi <= 0 || !!armed} onClick={() => { sfx.click(); setBet(BETS[bi - 1]); post('bet', { bet: BETS[bi - 1] / 100 }); }}><svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="2.6" rx="1.3" fill="currentColor" /></svg></button>
            <button className={`spin ${busy ? 'busy' : ''} ${armed ? 'armed' : ''} ${auto ? 'auto' : ''}`} title="Spin (space)" aria-label="Spin" onClick={spinPress}>
              {auto ? <b className="auto-n">{auto.left}</b> : <svg viewBox="0 0 48 48" className="coin"><path d="M38 24a14 14 0 1 1-4.1-9.9" fill="none" stroke="currentColor" strokeWidth="4.5" strokeLinecap="round" /><path d="M36 6v10H26z" fill="currentColor" /></svg>}
              {armed && <span className="price">{usd(armed.buy * bet)}</span>}</button>
            <button className="pm" aria-label="Raise bet" disabled={busy || bi >= BETS.length - 1 || !!armed} onClick={() => { sfx.click(); setBet(BETS[bi + 1]); post('bet', { bet: BETS[bi + 1] / 100 }); }}><svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="2.6" rx="1.3" fill="currentColor" /><rect x="10.7" y="5" width="2.6" height="14" rx="1.3" fill="currentColor" /></svg></button>
          </div>
          <div className="r">
            <button className={`ic md ${auto ? 'on' : ''}`} title="Autoplay" aria-label="Autoplay" disabled={!!armed || (busy && !auto)} onClick={() => { sfx.click(); auto ? setAuto(null) : setModal('auto'); }}><svg viewBox="0 0 24 24"><path d="M5 12a7 7 0 0 1 12-5l2-2v6h-6l2-2a4.5 4.5 0 1 0 1 5h2.6A7 7 0 0 1 5 12z" fill="currentColor" /></svg><em>{auto ? 'STOP' : 'AUTO'}</em></button>
            <button className={`ic md turbo ${turbo ? 'on' : ''}`} title="Turbo: faster spins" aria-label="Turbo" onClick={() => { sfx.click(); setTurbo(t => !t); }}><svg viewBox="0 0 24 24"><path d="M13 2L4 14h7l-1 8 9-12h-7z" fill="currentColor" /></svg><em>TURBO</em></button>
          </div>
        </div>
      </footer>
    </div>

    {SHOWCASE && screen === 'game' && <div className="showcase"><b>SHOWCASE</b>
      {TIERS_WIN.map(w => w.t).map((t, i) => <button key={t} onClick={() => demo('big' + i)}>{t}</button>)}
      {[['antic', 'Anticipation'], ['win', 'Win'], ['dwild', 'Double Wild'], ['premium', 'Cell: Top Symbol'], ['bwild', 'Cell: Wild'], ['split', 'Cell: Split'], ['expand', 'Cell: Stack'], ['mystery', 'Mystery Symbol'], ['tip', "Hubie's Tip"], ['raid', 'House Swap'], ['lucky', 'Lucky Cell'], ['fmeter', 'House Meter'], ['fagent', 'Double Agent'], ['flast', 'Last Call'], ['fround', "Hubie's Round"], ['fretrig', 'Retrigger'], ['fmult', 'Roaming x2'], ['intro0', 'Intro 1'], ['intro1', 'Intro 2'], ['intro2', 'Intro 3'], ['end00', 'End: zero'], ['end01', 'End 1'], ['end12', 'End 2'], ['end24', 'End 3']].map(([k, t]) => <button key={k} onClick={() => demo(k)}>{t}</button>)}</div>}

    {screen === 'loading' && <div className="ov loading"><Logo big /><div className="load-bar"><i style={{ width: `${loaded * 100}%` }} /></div><small>{Math.round(loaded * 100)}%</small></div>}

    {screen === 'slides' && <div className="ov slides">
      <div className="sl-top"><span className="vol">VOLATILITY <i /><i /><i /><i /><i className="off" /></span><button className="pill" aria-label="Sound" onClick={() => { const v = !(musicOn || sfxOnS); setMusic(v); setSfxS(v); }}>SOUND {musicOn || sfxOnS ? 'ON' : 'OFF'}</button></div>
      <div className="sl-card" key={slide}>
        {SLIDES[slide].art ? <img className="sl-art" src={ART(SLIDES[slide].art!)} /> : <div className="sl-icons">{SLIDES[slide].icons!.map(i => <img key={i} src={ART(i)} />)}</div>}
        <h2>{SLIDES[slide].t}</h2><p>{SLIDES[slide].d}</p></div>
      <div className="sl-nav"><button className="ic" aria-label="Previous" disabled={slide === 0} onClick={() => setSlide(s => s - 1)}><svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7" stroke="currentColor" strokeWidth="2.6" fill="none" /></svg></button>
        <div className="dots">{SLIDES.map((_, i) => <i key={i} className={i === slide ? 'on' : ''} onClick={() => setSlide(i)} />)}</div>
        <button className="ic" aria-label="Next" disabled={slide === SLIDES.length - 1} onClick={() => setSlide(s => s + 1)}><svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7" stroke="currentColor" strokeWidth="2.6" fill="none" /></svg></button></div>
      <button className="cta" onClick={() => { startAmbient(); sfx.click(); setScreen('game'); }}>PLAY</button></div>}

    {cine && <div className={`cine ${cine.kind} t${cine.tier.id}`} onClick={() => tapWait.current?.()}>
      <div className="c-bg" style={{ backgroundImage: `url(${ART('bonus_bg')})` }} /><div className="c-rays" /><div className="c-vig" />
      {cine.kind === 'in' ? <div className="c-wrap">
        <div className="c-file"><img src={ART('hubie_bonus')} /><div><small>FREE SPINS · {cine.tier.name}</small><h1>{cine.tier.name}</h1>
          <ul>{TIER_RULES[cine.tier.id - 1].map(r => <li key={r}>{r}</li>)}</ul>
          {cine.marked && <div className="c-mark"><span>MYSTERY SYMBOL</span><img src={IMG(cine.marked.sym)} /><span>{NAMES[cine.marked.sym]} pays {MULT_WORD(cine.marked.mult)}</span></div>}</div></div>
        <div className="c-tap" ref={cineTap}>{R.current.auto ? 'STARTING' : 'TAP TO START'}</div></div>
        : (() => { const { good, ti, band } = endInfo(cine.x ?? 0, cine.cost); return <div className={`c-wrap out end b${cine.totalC ? band : 0}`}>
          <div className="end-art"><img src={ART(END_ART[cine.tier.id - 1])} alt="Hubie" /><span className="end-line">{END_LINES[cine.tier.id - 1][resultBand(cine.x ?? 0, cine.capped)]}</span></div>
          <small className="c-kicker">{cine.tier.name} COMPLETE{cine.capped ? ' · MAX WIN REACHED' : ''}</small>
          {cine.totalC ? <><div className="cine-tier">{good ? TIERS_WIN[ti].t : 'SHIFT OVER'}</div><div className="cine-total" ref={cineTotal}>{usd(0)}</div></>
            : <><div className="cine-tier calm">SHIFT OVER</div><div className="c-calm">NO WIN THIS TIME. THE HOUSE IS ALWAYS OPEN.</div></>}
          <div className="c-tap" ref={cineTap}>TAP TO COLLECT</div></div>; })()}
    </div>}

    {big && <div className="bigwin" ref={bwRef} data-t="0" onClick={() => tapWait.current?.()}>
      <div className="bw-vault" style={{ backgroundImage: `url(${ART('bw_vault')})` }} /><div className="bw-rays" /><div className="bw-vig" />
      <div className="bw-logo" aria-hidden="true"><span>H</span>OUSEBETS</div>
      <img className="bw-hubie" ref={bwHub} src={ART('hubie_idle')} alt="Hubie" />
      <div className="bw-text"><div className="bw-title" ref={bwTitle}>{TIERS_WIN[0].t}</div><div className="bw-amt" ref={bwAmt}>{usd(0)}</div><div className="bw-hint" ref={bwHint}>TAP TO SKIP</div></div></div>}

    {modal && <div className="ov modal-wrap" onClick={() => setModal(null)}><div className={`modal ${modal === 'info' || modal === 'fair' ? 'wide' : ''}`} onClick={e => e.stopPropagation()}>
      <div className="m-head"><h2>{{ buy: 'BONUS BUY', confirm: 'CONFIRM BUY', auto: 'AUTOPLAY', info: 'GAME RULES', fair: 'PROVABLY FAIR' }[modal]}</h2>
        <button className="x" aria-label="Close" onClick={() => setModal(null)}><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" /></svg></button></div>
      <div className="m-body">
      {modal === 'buy' && <div className="tickets">{TIERS.map(t => <button key={t.id} className={`ticket t${t.id}`} disabled={balance < t.buy * bet} onClick={() => chooseBuy(t)}>
        <div className="tk-keys">{Array.from({ length: t.id + 2 }, (_, i) => <img key={i} src={IMG(S.KEY)} />)}</div>
        <b>{t.name}</b><span>{t.spins} free spins · {t.runners} Roaming Wild{t.runners > 1 ? 's' : ''}</span><p className="tk-note">{BUY_NOTE[t.id - 1]}</p><em>{usd(t.buy * bet)}</em><small>RTP {RTP.buys[t.id - 1]}</small></button>)}</div>}
      {modal === 'confirm' && pick && <div className="confirm"><p>You are buying <b>{pick.name}</b>. Price: <b>{usd(pick.buy * bet)}</b> at a {usd(bet)} bet. Free spins start right away.</p>
        <label className="chk"><input type="checkbox" checked={dontAsk} onChange={e => { setDontAsk(e.target.checked); localStorage.setItem('hr_noask', e.target.checked ? '1' : '0'); }} /> Do not show this again</label>
        <div className="row"><button className="pill" onClick={() => setModal('buy')}>BACK</button><button className="cta" onClick={() => { sfx.click(); startBuy(pick); }}>START</button></div></div>}
      {modal === 'auto' && <div className="autom">
        <label>NUMBER OF ROUNDS</label><div className="opts">{[10, 25, 50, 100, 250, 1000].map(v => <button key={v} className={autoCfg.left === v ? 'on' : ''} onClick={() => setAutoCfg(c => ({ ...c, left: v }))}>{v}</button>)}</div>
        <label>STOP IF A ROUND WIN IS AT LEAST</label><div className="opts">{[0, 50, 100, 500, 1000].map(v => <button key={v} className={autoCfg.stopWin === v ? 'on' : ''} onClick={() => setAutoCfg(c => ({ ...c, stopWin: v }))}>{v ? usd(v * bet) : 'OFF'}</button>)}</div>
        <label>STOP IF BALANCE DROPS BY</label><div className="opts">{[0, 10, 50, 100, 500].map(v => <button key={v} className={autoCfg.loss === v ? 'on' : ''} onClick={() => setAutoCfg(c => ({ ...c, loss: v }))}>{v ? usd(v * bet) : 'OFF'}</button>)}</div>
        <label>STOP IF BALANCE RISES BY</label><div className="opts">{[0, 10, 50, 100, 500].map(v => <button key={v} className={autoCfg.gain === v ? 'on' : ''} onClick={() => setAutoCfg(c => ({ ...c, gain: v }))}>{v ? usd(v * bet) : 'OFF'}</button>)}</div>
        <p className="mut help">Limits count from your balance when autoplay starts ({usd(balance)}). Autoplay plays through wins and free spins, collects big wins after a few seconds and never buys a bonus.</p>
        <button className="cta wide" onClick={() => { sfx.click(); setAuto({ ...autoCfg, start: balance }); setModal(null); }}>START {autoCfg.left} ROUNDS · {usd(autoCfg.left * bet)}</button></div>}
      {modal === 'info' && <><div className="settings"><span>SETTINGS</span><button className={`pill ${turbo ? 'on' : ''}`} onClick={() => setTurbo(t => !t)}>TURBO {turbo ? 'ON' : 'OFF'}</button><button className={`pill ${musicOn ? 'on' : ''}`} onClick={() => setMusic(m => !m)}>MUSIC {musicOn ? 'ON' : 'OFF'}</button><button className={`pill ${sfxOnS ? 'on' : ''}`} onClick={() => setSfxS(m => !m)}>SOUND {sfxOnS ? 'ON' : 'OFF'}</button></div><div className="tabs">{['Features', 'Examples', 'Paytable', 'Rules'].map((t, i) => <button key={t} className={tab === i ? 'on' : ''} onClick={() => setTab(i)}>{t}</button>)}</div>
        {tab === 0 && <div className="blocks">
          {[['locked', 'Locked Cells', 'A locked cell sits above and below each reel. 1 or 2 Keys open the cells on their reels. In free spins every Key opens them, and a Split can also break open a top cell by itself.'],
            ['h1', 'Top Symbol', 'A House Token, Top Hat, Orange Tie or Coin Pin in an open cell adds one more symbol to its reel.'],
            ['wild', 'Hubie Wild', 'Stands in for every paying symbol.'],
            ['split', 'Split', 'Paying symbols on this reel count twice. Wilds still count once.'],
            ['expand', 'Stack', 'One paying symbol that counts as 4, or as 8 on a split reel.'],
            ['dwild', 'Double Wild', 'Lands on reels 2, 3 and 4. Counts as 2 Wilds and makes its reel a split reel.'],
            ['runner', 'Roaming Wild', 'Free spins only. Moves to a new spot every spin. On a split reel its multiplier doubles and stays. Up to 5 at once.'],
            ['mystery', 'Mystery Symbol', 'When free spins start, the Keys reveal one symbol. That symbol pays more until the feature ends.'],
            ['hubie_react', "Hubie's Tip", 'Base game. Hubie throws 1 to 3 Wilds onto the reels. Never on a bonus buy.'],
            ['hubie_react', 'House Swap', 'Base game without Keys, never together with a Tip. Hubie turns one cell on reels 1, 2 and 3 into the same symbol, so the spin wins.'],
            ['locked', 'Lucky Cell', 'Base game without Keys. One locked cell opens for free.'],
            ['hubie_bonus', 'House Meter', "Free spins. Multiplies every win. Each Key raises it, and Hubie's Round raises it once more on free spin 4 (AFTER HOURS) or 5 (MIDNIGHT RUN, HOUSE TAKEOVER). It stops growing at its top level."],
            ['runner', 'Double Agent', 'Free spins. A Roaming Wild that doubles can split in two. The new one joins next spin at the starting multiplier.'],
            ['wild', 'Last Call', `Free spins. If the free spins have paid less than ${FEAT.lastCallBelow} times your bet when the scheduled last spin starts, reels 2 and 3 turn Wild.`],
            ['key', 'Free Spins', `3, 4 or 5 Keys start ${TIERS.map(t => `${t.name} (${t.spins} spins, ${t.runners} Roaming Wild${t.runners > 1 ? 's' : ''})`).join(', ')}. Each Key adds 1 spin. 2 or more Keys in one spin add 1 more spin and a Roaming Wild.`],
          ].map(([i, t, d]) => <div className="blk" key={t}><img src={ART(i)} /><div><b>{t}</b><span>{d}</span></div></div>)}</div>}
        {tab === 1 && <div className="ex"><Example win /><Example />
          <div className="exs">{[[S.WILD, 'WILD', 'Stands in for the House Token, so reels 1 to 3 still win.'], [S.SPLIT, 'SPLIT', 'Paying symbols on that reel count twice. Wilds still count once.'], [S.EXPAND, 'STACK', 'One cell that counts as 4 of its symbol, or 8 on a split reel.']].map(([sym, t, d]) =>
            <div className="exc" key={t}><div className="mini sm">{[6, sym as number, 6].map((v, k) => <div key={k}><img className="hit" src={IMG(v as number)} /></div>)}</div><b>{t}</b><span>{d}</span></div>)}</div></div>}
        {tab === 2 && <><p className="mut">Base game pays per way for 3, 4 and 5 reels at a {usd(bet)} bet. Values are rounded to the cent. Free spin pays are lower in AFTER HOURS and higher in MIDNIGHT RUN and HOUSE TAKEOVER. Tap a symbol for details.</p>
          <div className="pay-grid">{PAYING.map(s => <button key={s} className={`pay ${payTip === s ? 'on' : ''}`} onClick={() => setPayTip(t => t === s ? null : s)}><img src={IMG(s)} /><b>{NAMES[s]}</b>
            <div className="pays">{PAYS[s].map((p, i) => <span key={i}><i>{i + 3}</i><em>{usd(Math.round(p * (BASE.pay ?? 1) / COINS * bet))}</em></span>).reverse()}</div>{payTip === s && <small className="pay-note">{s <= 9 ? 'Top symbol. Can also appear in an open locked cell.' : 'Common symbol. Can appear as a Stack.'}</small>}</button>)}</div></>}
        {tab === 3 && <ul className="rules">
          <li>5 reels and 3 rows, plus a locked cell above and below each reel.</li>
          <li>Every spin starts with 243 ways. Open cells, Splits and Stacks add more, up to {MAX_WAYS.toLocaleString()}.</li>
          <li>Wins pay from the leftmost reel on neighbouring reels. Each symbol pays once, for its longest run. Different symbols add up.</li>
          <li>RTP {RTP.base}. Bonus buy RTP: AFTER HOURS {RTP.buys[0]}, MIDNIGHT RUN {RTP.buys[1]}, HOUSE TAKEOVER {RTP.buys[2]}.</li>
          <li>Max win is {MAX_WIN.toLocaleString()} times your bet, and the round ends there. Odds from a normal spin: {RTP.maxOdds} (simulated).</li>
          <li>Volatility: medium high.</li>
          <li>Bet from {usd(BETS[0])} to {usd(BETS[BETS.length - 1])}.</li>
          <li>Autoplay stops at the limits you set or when you press STOP. It never buys a bonus.</li>
          <li>A malfunction voids all pays and plays. 18+. Play responsibly.</li>
          <li><button className="pill" onClick={() => setModal('fair')}>Open provably fair</button></li></ul>}</>}
      {modal === 'fair' && <>
        <p>Every result is fixed by seeds before you spin, so you can check any round afterwards.</p>
        <details className="tech"><summary>Technical details</summary><p className="mut">Round = HMAC SHA256(key = server seed, msg = <code>clientSeed:nonce:block</code>). Spin k of a round reads blocks 12k to 12k+11 (96 floats, big endian u32 divided by 2^32). One nonce covers the whole round, free spins included.</p></details>
        <label>Active server seed hash</label><code>{hash}</code><label>Next server seed hash</label><code>{nextHash}</code>
        <label>Client seed</label><input value={clientSeed} maxLength={64} disabled={busy} onChange={e => { setClientSeed(e.target.value.replace(/[^\x21-\x7e]/g, '')); setNonce(1); }} />
        <label>Next nonce</label><code>{nonce}</code>
        <button className="pill" disabled={busy} onClick={rotate}>Rotate seed pair and reveal</button>
        {revealed.map((r, i) => <div key={i} className="rev">Seed <code>{r.seed}</code> Client seed {r.clientSeed} · nonces 1 to {r.last}</div>)}
        <Verifier prefill={revealed[0]} />
        <h3>History</h3><div className="tbl"><table><thead><tr><th>Nonce</th><th>Type</th><th>Cost</th><th>Win</th></tr></thead>
          <tbody>{hist.map((h, i) => <tr key={i}><td>{h.nonce}</td><td>{h.buy ? TIERS[h.buy - 1].name : 'Spin'}</td><td>{usd(h.buy ? TIERS[h.buy - 1].buy * h.bet : h.bet)}</td><td>{usd(h.win)}</td></tr>)}</tbody></table></div></>}
      </div></div></div>}
  </div>;
}

function Example({ win }: { win?: boolean }) {
  const g = win ? [[6, 10, 12], [11, 6, 13], [12, 13, 6], [10, 11, 12], [13, 12, 11]] : [[6, 10, 12], [11, 6, 13], [12, 13, 10], [6, 11, 12], [13, 12, 11]];
  return <div className="exg"><b>{win ? `WIN: ${NAMES[6]} on reels 1, 2 and 3` : `NO WIN: no ${NAMES[6]} on reel 3, so the win stops at reel 2`}</b>
    <div className="mini">{g.map((col, r) => <div key={r}>{col.map((s, i) => <img key={i} className={win && s === 6 && r < 3 ? 'hit' : !win && s === 6 ? 'miss' : ''} src={IMG(s)} />)}</div>)}</div></div>;
}

function Verifier({ prefill }: { prefill?: { seed: string; clientSeed: string; last: number } }) {
  const [seed, setSeed] = useState(prefill?.seed ?? ''); const [cs, setCs] = useState(prefill?.clientSeed ?? ''); const [n, setN] = useState(prefill?.last ?? 1); const [buy, setBuy] = useState(0);
  const [out, setOut] = useState<{ h: string; r: Round } | null>(null);
  async function run() { setOut({ h: await sha256Hex(seed), r: await resolveRound(seed, cs, n, src => playRound(src, buy)) }); }
  return <div className="verify"><h3>Verify a round</h3>
    <div className="vgrid"><input placeholder="revealed server seed" value={seed} onChange={e => setSeed(e.target.value.trim())} />
      <input placeholder="client seed" value={cs} onChange={e => setCs(e.target.value)} />
      <input type="number" min={1} value={n} onChange={e => setN(+e.target.value)} />
      <select value={buy} onChange={e => setBuy(+e.target.value)}><option value={0}>Normal spin</option>{TIERS.map(t => <option key={t.id} value={t.id}>Buy {t.name}</option>)}</select>
      <button className="pill" onClick={run}>Verify</button></div>
    {out && <div className="vout">SHA256(seed) = <code>{out.h}</code> {out.r.spins.length} spin(s){out.r.tier ? ` · ${out.r.tier.name}` : ''} · total <b>x{out.r.total.toFixed(2)}</b>{out.r.capped ? ' (max win)' : ''}</div>}
  </div>;
}

function Logo({ big }: { big?: boolean }) {
  return <div className={`logo ${big ? 'big' : ''}`} aria-label="House Rules: Hubie Owns the Night">
    <div className="lg-main"><svg viewBox="0 0 40 26" className="lg-hat" aria-hidden="true"><rect x="9" y="1" width="22" height="18" rx="2.5" /><rect x="9" y="13" width="22" height="3.5" className="band" /><rect x="1" y="18.5" width="38" height="5.5" rx="2.75" /></svg>
      <span className="lg-a">HOUSE</span><span className="lg-b">RULES</span></div>
    <div className="lg-tag">HUBIE OWNS THE NIGHT</div></div>;
}
