import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { FEAT, playRound, PAYS, PAYING, SYM, NAMES, TIERS, S, MAX_WIN, MULT_CAP, COINS, type Spin, type Round, type Tier, type Runner } from './engine';
import { resolveRound, sha256Hex, randomServerSeed, randomClientSeed } from './fair';
import { sfx, startAmbient, setTension, setMusicOn, setSfxOn, setMusicMode, setIntensity } from './sound';
import { FX } from './fx';
import { ART, ALL_ART } from './art';
import { Board, wait } from './board';
import { post, listen } from './host';

const IMG = (s: number) => ART(SYM[s]);
const BETS = [10, 20, 30, 40, 50, 60, 80, 100, 120, 150, 200, 300, 400, 500, 1000, 2000]; // cents
export const MAX_WAYS = 2087008; // reels 1 and 5: 14, reels 2 to 4: 22 (split reel with two Stack cells)
const usd = (c: number) => '$' + (c / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const TIERS_WIN = [{ x: 25, t: 'HIGH ROLLER' }, { x: 50, t: 'HOUSE MONEY' }, { x: 150, t: "HUBIE'S HEIST" }, { x: 500, t: 'OWN THE HOUSE' }];
/** Bonus end screens: art and Hubie's line per feature, by win band (under 25x, 25x, 150x, 500x). */
const END_ART = ['end_ah', 'end_mr', 'end_ht'];
const END_LINES = [
  ['Quiet night. The lounge stays open.', 'A good night at the tables.', 'The bar tab is on me tonight.', 'Best night this lounge has ever seen.'],
  ['Clean getaway, light bag.', 'The midnight run paid off.', 'That briefcase is getting heavy.', 'Nobody runs midnight like you.'],
  ['The House always reopens.', 'The House pays well tonight.', 'Half the casino is yours.', 'You own the House now.'],
];
const END_HEAD = ['LAST ORDERS', 'CLEAN GETAWAY', 'THE HOUSE IS YOURS'];
const FORCE = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('force') : null;
const tierOf = (x: number) => { let i = -1; TIERS_WIN.forEach((t, k) => { if (x >= t.x) i = k; }); return i; };
const RTP = { base: '95.8%', buys: ['96.4%', '96.0%', '96.9%'], maxOdds: 'about 1 in 500,000' }; // filled from sim-result.txt
const TIER_RULES = [
  ['8 free spins', '1 Roaming Wild', 'A Roaming Wild on a split reel doubles its multiplier', '2 or more Keys in one spin add a Roaming Wild'],
  ['10 free spins', '2 Roaming Wilds', 'A Roaming Wild on a split reel doubles its multiplier', '2 or more Keys in one spin add a Roaming Wild'],
  ['10 free spins', '3 Roaming Wilds', 'A Roaming Wild on a split reel doubles its multiplier', '2 or more Keys in one spin add a Roaming Wild'],
];
const SLIDES = [
  { art: 'end_ht', t: 'WELCOME TO THE HOUSE', d: `Hubie owns the night and every table in town. His hat, his tie, his coin pin: land them to get paid. Win up to ${MAX_WIN.toLocaleString()}x your bet.` },
  { icons: ['locked', 'key'], t: 'LOCKED CELLS', d: 'Each reel has a locked cell above and below it. 1 or 2 Keys open the locked cells on their reels.' },
  { icons: ['h1', 'wild', 'split', 'expand'], t: 'WHAT IS INSIDE', d: 'An open cell shows a top symbol, a Wild, a Split (every symbol on that reel counts twice) or a Stack (one symbol that counts as 4).' },
  { icons: ['key', 'runner'], t: 'FREE SPINS', d: `3, 4 or 5 Keys start free spins with 1, 2 or 3 Roaming Wilds. They move every spin and double their multiplier on a split reel, up to x${MULT_CAP}.` },
  { icons: ['hubie_react', 'wild', 'locked'], t: 'BASE GAME SURPRISES', d: "Any spin can bring Hubie's Tip (Hubie throws 1 to 3 Wilds onto the reels), an House Swap (Hubie swaps one symbol onto reels 1, 2 and 3 for a sure win) or a Lucky Cell (a locked cell opens for free)." },
  { icons: ['hubie_bonus', 'runner', 'key'], t: 'FREE SPIN EXTRAS', d: `The House Meter multiplies every free spin win and grows by 1 with every Key, up to x${FEAT.meterCap}. Hubie's Round adds 1 more halfway. A doubling Roaming Wild can split in two. If the feature has paid under ${FEAT.lastCallBelow}x by the final spin, Last Call turns reels 2 and 3 Wild.` },
  { art: 'bw_vault', t: 'MYSTERY SYMBOL', d: 'When free spins start, the Keys flip to reveal one symbol and a multiplier. That symbol pays with the multiplier until the feature ends.' },
];
const SHOWCASE = typeof location !== 'undefined' && location.search.includes('showcase');
const demoCache: Record<string, Spin> = {};
function findSpin(pred: (s: Spin) => boolean, plain = true) {
  for (let i = 0; i < 300000; i++) { const r = playRound(() => Array.from({ length: 96 }, Math.random)); const x = r.spins[0]; if (pred(x) && (!plain || (!x.tip.length && !x.raid && !x.lucky))) return x; }
  return playRound(() => Array.from({ length: 96 }, Math.random)).spins[0];
}
type Pose = 'idle' | 'react' | 'bonus' | 'bigwin';
type Modal = null | 'buy' | 'confirm' | 'auto' | 'info' | 'fair';
type Auto = { left: number; stopWin: number; loss: number; gain: number; start: number };

export default function App() {
  const [loaded, setLoaded] = useState(0);
  const [screen, setScreen] = useState<'loading' | 'slides' | 'card' | 'game'>('loading');
  const [slide, setSlide] = useState(0);
  const [modal, setModal] = useState<Modal>(null);
  const [balance, setBalance] = useState(1000000);
  const [bet, setBet] = useState(100);
  const [busy, setBusy] = useState(false);
  const [turbo, setTurbo] = useState(false);
  const [musicOn, setMusic] = useState(true); const [sfxOnS, setSfxS] = useState(true);
  const [pose, setPose] = useState<Pose>('idle');
  const [bubble, setBubble] = useState('');
  const [xtag, setXtag] = useState('');
  const [msg, setMsg] = useState<{ t: string; k?: string; img?: number; amt?: string }>({ t: 'PLACE YOUR BET' });
  const [ways, setWays] = useState(243);
  const [winC, setWinC] = useState(0);
  const [armed, setArmed] = useState<Tier | null>(null);
  const [pick, setPick] = useState<Tier | null>(null);
  const [dontAsk, setDontAsk] = useState(() => localStorage.getItem('hr_noask') === '1');
  const [auto, setAuto] = useState<Auto | null>(null);
  const [autoCfg, setAutoCfg] = useState<Auto>({ left: 25, stopWin: 0, loss: 0, gain: 0, start: 0 });
  const [bonus, setBonus] = useState<{ tier: Tier; left: number; marked: { sym: number; mult: number }; runners: Runner[]; added?: number; meter?: number } | null>(null);
  const [cine, setCine] = useState<null | { kind: 'in' | 'out'; tier: Tier; marked?: { sym: number; mult: number }; totalC?: number; x?: number }>(null);
  const [big, setBig] = useState<null | { x: number; c: number }>(null);
  const [tab, setTab] = useState(0); const [tip, setTip] = useState<number | null>(null);
  const [serverSeed, setServerSeed] = useState(randomServerSeed); const [nextSeed, setNextSeed] = useState(randomServerSeed);
  const [hash, setHash] = useState(''); const [nextHash, setNextHash] = useState('');
  const [clientSeed, setClientSeed] = useState(randomClientSeed); const [nonce, setNonce] = useState(1);
  const [revealed, setRevealed] = useState<{ seed: string; clientSeed: string; last: number }[]>([]);
  const [hist, setHist] = useState<{ nonce: number; bet: number; win: number; buy: number; spins: number }[]>([]);

  const boardEl = useRef<HTMLDivElement>(null); const board = useRef<Board | null>(null);
  const fxRef = useRef<HTMLCanvasElement>(null); const fx = useRef<FX | null>(null);
  const hubRef = useRef<HTMLImageElement>(null); const winRef = useRef<HTMLSpanElement>(null);
  const tapWait = useRef<(() => void) | null>(null);
  const R = useRef({ turbo: false, bet: 100, auto: null as Auto | null, balance: 1000000, armed: null as Tier | null, winC: 0 });
  R.current.turbo = turbo; R.current.bet = bet; R.current.auto = auto; R.current.balance = balance; R.current.armed = armed;
  const T = (ms: number) => wait(R.current.turbo ? ms * .4 : ms);

  useEffect(() => { let n = 0; const all = ALL_ART();
    Promise.all(all.map(u => { const i = new Image(); i.src = u; return i.decode().catch(() => {}).finally(() => { n++; setLoaded(n / (all.length + 1)); }); }))
      .then(async () => { if (!board.current && boardEl.current) { const b = new Board(); board.current = b; await b.init(boardEl.current);
        b.onAntic = on => { setTension(on); if (!bonusOn.current) setIntensity(on ? 2 : 1); if (on) { sfx.riser(1.1); sfx.heartbeat(); setMsg({ t: 'ONE MORE KEY', k: 'antic' }); say('Come on...', 'react', 1300); } }; }
        setLoaded(1); setTimeout(() => setScreen('slides'), 250); post('ready', { balance: 10000 }); }); }, []);
  useEffect(() => { if (fxRef.current && !fx.current) fx.current = new FX(fxRef.current); }, []);
  useEffect(() => { sha256Hex(serverSeed).then(setHash); }, [serverSeed]);
  useEffect(() => { sha256Hex(nextSeed).then(setNextHash); }, [nextSeed]);
  useEffect(() => { setMusicOn(musicOn); }, [musicOn]); useEffect(() => { setSfxOn(sfxOnS); }, [sfxOnS]);
  useEffect(() => { const fix = () => { if (scrollX || scrollY) scrollTo(0, 0); document.querySelectorAll('.app,.game,#root').forEach(e => { (e as HTMLElement).scrollLeft = 0; (e as HTMLElement).scrollTop = 0; }); };
    addEventListener('scroll', fix, true); const iv = setInterval(fix, 500); return () => { removeEventListener('scroll', fix, true); clearInterval(iv); }; }, []);
  useEffect(() => listen(m => { if (m.type === 'setBalance') setBalance(Math.round(m.balance * 100)); if (m.type === 'setBet' && BETS.includes(Math.round(m.bet * 100))) setBet(Math.round(m.bet * 100)); }), []);
  useEffect(() => { post('balance', { balance: balance / 100 }); }, [balance]);
  useEffect(() => { const el = hubRef.current; if (!el || screen !== 'game') return;
    const br = gsap.to(el, { scaleY: 1.025, scaleX: .99, y: -3, duration: 1.7, yoyo: true, repeat: -1, ease: 'sine.inOut', transformOrigin: '50% 100%' });
    const bl = setInterval(() => gsap.fromTo(el, { scaleY: .97 }, { scaleY: 1, duration: .18 }), 4200);
    return () => { br.kill(); clearInterval(bl); }; }, [screen, pose]);
  useEffect(() => { if (hubRef.current) gsap.fromTo(hubRef.current, { rotate: -5, scale: .9 }, { rotate: 0, scale: 1, duration: .45, ease: 'back.out(3)' }); }, [pose]);
  // autoplay driver
  useEffect(() => { if (!auto || busy || modal || cine || big || screen !== 'game') return;
    if (auto.left <= 0) { setAuto(null); return; }
    const t = setTimeout(() => { setAuto(a => a && { ...a, left: a.left - 1 }); play(); }, R.current.turbo ? 150 : 350); return () => clearTimeout(t); });
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.code !== 'Space' || ['INPUT', 'SELECT'].includes((e.target as HTMLElement).tagName)) return; e.preventDefault(); spinPress(); };
    addEventListener('keydown', k); return () => removeEventListener('keydown', k); });

  const bubT = useRef(0); const bonusOn = useRef(false); bonusOn.current = !!bonus;
  function say(t: string, p: Pose = 'react', ms = 1500) { setBubble(t); setPose(p); clearTimeout(bubT.current); bubT.current = window.setTimeout(() => { setBubble(''); setPose(bonusOn.current ? 'bonus' : 'idle'); }, ms); }
  const hubImg = ART(pose === 'idle' ? 'hubie_idle' : pose === 'react' ? 'hubie_react' : pose === 'bonus' ? 'hubie_bonus' : 'hubie_bigwin');
  /** Wait for a tap; in autoplay continue by itself after ms. */
  const tapOrAuto = (ms: number) => new Promise<void>(r => { let done = false; const fin = () => { if (done) return; done = true; tapWait.current = null; r(); };
    tapWait.current = () => { sfx.click(); fin(); }; if (R.current.auto) setTimeout(fin, ms); });

  function spinPress() {
    if (tapWait.current) { tapWait.current(); return; }
    if (board.current?.spinning) { board.current.quickStop(); return; }
    if (!busy && !modal && screen === 'game') { if (auto) { setAuto(null); return; } play(); }
  }
  const shown = useRef(0); const winTw = useRef<gsap.core.Tween | null>(null); const msgAmt = useRef<HTMLSpanElement | null>(null);
  const paint = (c: number) => { shown.current = c; const t = usd(c); if (winRef.current) winRef.current.textContent = t; }; void msgAmt; const msgHold = useRef(false);
  /** Single source of truth: integer cents in R.current.winC; every counter paints the same tweened value. */
  function setWin(to: number, dur = .8) { R.current.winC = to; setWinC(to); winTw.current?.kill(); const o = { v: shown.current };
    if (to <= o.v) { paint(to); return; }
    winTw.current = gsap.to(o, { v: to, duration: R.current.turbo ? dur * .3 : dur, ease: 'power1.out', onUpdate: () => { paint(Math.max(shown.current, Math.min(to, Math.round(o.v)))); if (Math.random() < .3) sfx.tick(); }, onComplete: () => paint(to) }); }

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
    const b = board.current!; const betC = R.current.bet; fx.current?.clear();
    setMsg({ t: sp.free ? 'FREE SPIN' : 'GOOD LUCK' }); sfx.spinStart(); setWays(243); setXtag(''); msgHold.current = false;
    if (sp.tip.length) { setMsg({ t: "HUBIE'S TIP", k: 'feat' }); say('Here, take a tip.', 'react', 1600); }
    if (sp.lastCall) { setMsg({ t: 'LAST CALL', k: 'feat' }); say('One more round on me.', 'bonus', 1600); await b.banner('LAST CALL', 0xff8a3d, 900); }
    if (sp.hubieRound) { setMsg({ t: "HUBIE'S ROUND", k: 'feat' }); say('This round is on the House.', 'bigwin', 1800); cheer(); await b.banner("HUBIE'S ROUND", 0xf5c542, 900); }
    await b.spin(landingSpin(sp), { turbo: R.current.turbo, antic }); setTension(false);
    if (sp.tip.length) await b.tipWilds(sp.tip);
    if (sp.raid) { setMsg({ t: 'HOUSE SWAP', k: 'feat' }); say('Let me fix that for you.', 'react', 1600); await b.flipCells(sp.raid.cells, sp.raid.sym, 0xa865ff); }
    if (sp.lastCall) await b.flipCells([1, 2].flatMap(r => [1, 2, 3].filter(row => sp.grid[r][row]!.s === S.WILD).map(row => ({ r, row }))), S.WILD, 0xf5c542);
    if (sp.lucky) { setMsg({ t: 'LUCKY CELL', k: 'feat' }); say('Lucky you.', 'react', 1200); await b.banner('LUCKY CELL', 0x02f7fd, 600); }
    else if (sp.reveals.length) setMsg({ t: 'CELLS OPEN', k: 'feat' });
    if (sp.reveals.length) await b.openCells(sp);
    if (sp.split.some(Boolean)) { setMsg({ t: 'SPLIT REEL', k: 'feat' }); await b.applySplits(sp); }
    if (sp.runners.length) { await b.moveRunners(sp.runners, firstFree); setBonus(bn => bn && { ...bn, runners: sp.runners.map(x => ({ ...x })) });
      if (sp.runners.some(r => r.doubled)) { setMsg({ t: 'MULTIPLIER DOUBLED', k: 'feat' }); say('Double it!', 'bonus', 1100); cheer(); await T(200); } }
    if (sp.agents) { setMsg({ t: 'DOUBLE AGENT: A ROAMING WILD SPLITS IN TWO', k: 'feat' }); await b.banner('DOUBLE AGENT', 0x02f7fd, 800); }
    if (sp.free) setIntensity(sp.meter >= 4 || sp.runners.some(r => r.m >= 8) || sp.spinsLeft === 0 ? 3 : sp.meter >= 2 || sp.runners.some(r => r.m >= 2) ? 2 : 1);
    if (sp.free && sp.meterAdd) { setBonus(bn => bn && { ...bn, meter: sp.meter }); setMsg({ t: `x${sp.meter}`, k: 'mult' }); sfx.multSlam(); sfx.mult(sp.meter); b.shake(4); await T(700); }
    setWays(sp.ways);
    const c = Math.round(sp.win * betC);
    if (c > 0) {
      const marked = sp.wins.some(w => w.mult > 1);
      const preC = Math.round(sp.pre * betC); const meterOn = sp.free && sp.meter > 1;
      const ways = sp.wins.map(w => ({ img: w.sym, t: `${NAMES[w.sym].toUpperCase()} ${w.len} REELS${w.mult > 1 ? ' x' + w.mult : ''}`, amt: usd(Math.round(w.pay / (meterOn ? sp.meter : 1) * betC)) }));
      b.showWins(sp); const big = sp.win >= 5; const dur = sp.win < 1 ? .5 : sp.win < 5 ? .9 : 1.6;
      if (marked && sp.marked) { msgHold.current = true; setMsg({ t: `x${sp.marked.mult}`, k: 'mult', img: sp.marked.sym }); sfx.multSlam(); await T(650); msgHold.current = false; }
      setWin(R.current.winC + (meterOn ? preC : c), dur);
      void b.cycleWays(i => { if (!msgHold.current) setMsg({ ...ways[i], k: 'way' }); }, meterOn ? 2400 : 1400);
      if (meterOn) { await T(dur * 1000 + 150); msgHold.current = true; setMsg({ t: `x${sp.meter}`, k: 'mult' }); setXtag('x' + sp.meter); sfx.multSlam(); sfx.winTier(1); setWin(R.current.winC - preC + c, 1.2); await T(1300); msgHold.current = false; }
      if (big && sp.win < TIERS_WIN[0].x) say(sp.win >= 15 ? 'That is House money.' : 'Nice cut.', 'react', 1400);
      if (big) cheer();
      await T(sp.win < 1 ? 700 : sp.win < 5 ? 1100 : 1800); }
    else if (!sp.free && sp.keys < 3) setMsg({ t: sp.keys === 2 ? 'SO CLOSE: ONE KEY SHORT' : 'NO LUCK THIS TIME', k: 'calm' });
    if (sp.free && sp.addSpins) { msgHold.current = true; setBonus(bn => bn && { ...bn, left: sp.spinsLeft, added: sp.addSpins }); sfx.retrigger(); setIntensity(3); cheer(); say('More spins!', 'bigwin', 1400);
      setMsg({ t: `RETRIGGER +${sp.addSpins} SPIN${sp.addSpins > 1 ? 'S' : ''}${sp.addRunner ? ' AND A NEW ROAMING WILD' : ''}`, k: 'feat' }); { const r = document.querySelector('.spins-left')?.getBoundingClientRect(); fx.current?.burst(50, r ? r.x + r.width / 2 : innerWidth / 2, r ? r.y + r.height / 2 : 60, ['spark', 'coin'], 1.1); } sfx.multSlam(); await T(1100); msgHold.current = false; }
    return c;
  }

  /** Big win: full screen, the count climbs through every tier it reaches; banner, colour, Hubie, effect and music change at each threshold. */
  async function bigWin(x: number, c: number) {
    const prevMode = bonusOn.current ? 'bonus' : 'base'; setBig({ x, c }); setPose('bigwin'); sfx.bigWin(); await wait(60);
    const ov = document.querySelector('.bigwin') as HTMLElement, el = ov.querySelector('.bw-amt') as HTMLElement, title = ov.querySelector('.bw-title') as HTMLElement, hub = ov.querySelector('.bw-hubie') as HTMLImageElement;
    let skip = false; tapWait.current = () => { skip = true; };
    const f = fx.current; const turbo = R.current.turbo; const top = tierOf(x); let shownT = -1; let fw = 0;
    const enter = (ti: number) => { if (ti <= shownT) return; shownT = ti; ov.dataset.t = String(ti); title.textContent = TIERS_WIN[ti].t;
      gsap.fromTo(title, { scale: 2.2, opacity: 0 }, { scale: 1, opacity: 1, duration: .45, ease: 'back.out(2.5)' });
      hub.src = ART(ti === 0 ? 'hubie_idle' : ti === 1 ? 'hubie_bigwin' : ti === 2 ? 'hubie_react' : 'hubie_bigwin'); gsap.fromTo(hub, { scale: .7, rotate: -8 }, { scale: 1, rotate: 0, duration: .5, ease: 'back.out(3)' });
      sfx.winTier(ti); setMusicMode('win' + ti);
      if (f) { f.shower = [3, 5, 6, 8][ti]; f.burst([30, 70, 60, 90][ti], innerWidth / 2, innerHeight * .45, ti === 0 ? ['coin', 'spark'] : ti === 1 ? ['bill', 'coin'] : ti === 2 ? ['spark', 'coin', 'bill'] : ['spark', 'coin', 'bill'], 1 + ti * .25); }
      if (ti >= 1) { ov.classList.remove('shake'); void ov.offsetWidth; ov.classList.add('shake'); }
      if (ti === 3 && !fw) { const boom = () => { if (!f) return; f.burst(45, innerWidth * (.15 + Math.random() * .7), innerHeight * (.12 + Math.random() * .4), ['spark'], 1.1); sfx.firework(); }; boom(); fw = window.setInterval(boom, 650); } };
    // value segments: 0 > 25x > 50x > 150x > 500x > final, a few seconds per tier, shorter in turbo
    const marks = [0, ...TIERS_WIN.map(t => t.x).filter(v => v < x), x]; const tl = gsap.timeline({ paused: true }); const o = { v: 0 };
    for (let i = 1; i < marks.length; i++) { const seg = i === 1 ? 1.6 : i === marks.length - 1 ? 1.8 : 2.4; tl.to(o, { v: marks[i], duration: seg * (turbo ? .45 : 1), ease: i === marks.length - 1 ? 'power2.out' : 'none' }); }
    tl.eventCallback('onUpdate', () => { const ti = tierOf(o.v); if (ti >= 0) enter(ti); el.textContent = usd(Math.round(o.v / x * c)); if (Math.random() < .25) sfx.coin(); if (skip) tl.progress(1); });
    enter(0); await new Promise<void>(res => { tl.eventCallback('onComplete', () => res()); tl.play(); });
    enter(top); el.textContent = usd(c); gsap.fromTo(el, { scale: 1.25 }, { scale: 1, duration: .4, ease: 'back.out(3)' });
    (ov.querySelector('.bw-hint') as HTMLElement).textContent = R.current.auto ? 'COLLECTING' : 'TAP TO COLLECT';
    await tapOrAuto(2500); clearInterval(fw); if (f) f.clear(); setBig(null); setPose(bonusOn.current ? 'bonus' : 'idle'); setMusicMode(prevMode); setIntensity(bonusOn.current ? 2 : 1);
  }

  /** Bonus total: monotonic count up, label taken from the final multiple. */
  async function outroCount(total: number, betC: number) {
    await wait(60); const el = document.querySelector('.cine-total') as HTMLElement; if (!el || total <= 0) return;
    const ti = tierOf(total / betC); sfx.bigWin(); if (ti >= 0) { sfx.winTier(ti); setMusicMode('win' + ti); } const f = fx.current; if (f) { f.shower = 1 + Math.max(0, ti) * 2; f.burst(20 + Math.max(0, ti) * 25, innerWidth / 2, innerHeight * .45, ti >= 2 ? ['bill', 'coin', 'spark'] : ['bill', 'coin'], 1); }
    let best = 0; const o = { v: 0 }; let skip = false; tapWait.current = () => { skip = true; };
    await new Promise<void>(res => { const tw = gsap.to(o, { v: total, duration: Math.min(6, 1.5 + Math.max(0, ti) * 1.2) * (R.current.turbo ? .4 : 1), ease: 'power1.out',
      onUpdate: () => { best = Math.max(best, Math.min(total, Math.round(o.v))); el.textContent = usd(best); if (Math.random() < .2) sfx.coin(); if (skip) tw.progress(1); }, onComplete: () => res() }); });
    el.textContent = usd(total);
  }
  async function play() {
    if (busy || !board.current) return; startAmbient();
    const tier = R.current.armed; const betC = R.current.bet; const cost = tier ? tier.buy * betC : betC;
    if (R.current.balance < cost) { setMsg({ t: 'INSUFFICIENT BALANCE', k: 'warn' }); setAuto(null); return; }
    setBusy(true); setArmed(null); setBalance(x => x - cost); R.current.winC = 0; setWinC(0); winTw.current?.kill(); paint(0);
    const n = nonce; setNonce(n + 1); const buyTier = tier ? tier.id : 0;
    post('roundStart', { bet: betC / 100, cost: cost / 100, buyTier, nonce: n, serverSeedHash: hash, clientSeed });
    const round: Round = await resolveRound(serverSeed, clientSeed, n, src => playRound(src, buyTier));
    let total = await present(round.spins[0], !buyTier);
    if (round.tier && round.marked) {
      const t = round.tier; setMsg({ t: `${round.spins[0].keys} KEYS · ${t.name}`, k: 'feat' }); say('The shift starts now.', 'bonus', 1600); board.current.shake(8);
      await T(700); await board.current.mystery(round.spins[0], round.marked.sym, round.marked.mult);
      setCine({ kind: 'in', tier: t, marked: round.marked }); sfx.bonus(); await wait(80); await tapOrAuto(3000); setCine(null);
      setBonus({ tier: t, left: t.spins, marked: round.marked, runners: [] }); setPose('bonus'); setMusicMode('bonus'); setIntensity(1); board.current.setSkin(true);
      const free = round.spins.filter(s => s.free); let first = true;
      for (const sp of free) { setBonus(bn => bn && { ...bn, left: Math.max(0, bn.left - 1), added: 0 }); await T(250);
        const sc = await present(sp, false, first); total += sc; first = false; setBonus(bn => bn && { ...bn, left: sp.spinsLeft });
        if (sc / betC >= TIERS_WIN[0].x) await bigWin(sc / betC, sc);
        if (total >= MAX_WIN * betC) break; }
      total = Math.min(total, MAX_WIN * betC);
      board.current.clearWins(); await T(400);
      // ONE total screen for the whole round, then back to base.
      fx.current?.clear(); setCine({ kind: 'out', tier: t, totalC: total, x: total / betC }); await wait(80);
      await outroCount(total, betC); setMusicMode('end');
      (document.querySelector('.cine .c-tap') as HTMLElement).textContent = R.current.auto ? 'CONTINUING' : 'TAP TO COLLECT';
      await tapOrAuto(3000); fx.current?.clear(); setCine(null);
      setBonus(null); setIntensity(1); board.current.clearRunners(); board.current.setSkin(false); board.current.show(round.spins[0]); setPose('idle'); setWays(243);
      setMsg(total > 0 ? { t: 'TOTAL WIN', k: 'win' } : { t: 'NO LUCK THIS TIME', k: 'calm' });
    } else {
      const x = total / betC; if (x >= TIERS_WIN[0].x) await bigWin(x, total);
    }
    winTw.current?.kill(); R.current.winC = total; setWinC(total); paint(total);
    const nb = R.current.balance + total; setBalance(nb);
    setHist(h => [{ nonce: n, bet: betC, win: total, buy: buyTier, spins: round.spins.length }, ...h].slice(0, 30));
    post('roundEnd', { nonce: n, bet: betC / 100, cost: cost / 100, win: total / 100, multiplier: total / betC, buyTier, spins: round.spins.length });
    const a = R.current.auto; if (a && ((a.stopWin && total >= a.stopWin * betC) || (a.loss && a.start - nb >= a.loss * betC) || (a.gain && nb - a.start >= a.gain * betC))) { setAuto(null); setMsg({ t: 'AUTOPLAY STOPPED', k: 'warn' }); }
    setBusy(false);
  }
  function chooseBuy(t: Tier) { sfx.click(); if (dontAsk) { setArmed(t); setModal(null); setMsg({ t: `${t.name} READY · PRESS SPIN`, k: 'feat' }); } else { setPick(t); setModal('confirm'); } }
  async function rotate() { setRevealed(r => [{ seed: serverSeed, clientSeed, last: nonce - 1 }, ...r]); setServerSeed(nextSeed); setNextSeed(randomServerSeed()); setNonce(1); }
  const bi = BETS.indexOf(bet);
  function buyClick() { sfx.click(); if (armed) { setArmed(null); setMsg({ t: 'BUY CANCELLED' }); } else setModal('buy'); }

  // Showcase helpers. Demo spins use throwaway random floats and never touch the balance.
  async function demo(kind: string) {
    if (busy || !board.current) return; setBusy(true); startAmbient(); R.current.winC = 0; setWinC(0);
    const rv = (k: number) => (s: Spin) => s.reveals.some(r => k === 6 ? r.cell.s >= 6 : r.cell.s === k) && s.keys < 3;
    try {
      if (kind.startsWith('big')) { const x = [32, 84, 236, 1240][+kind.slice(3)]; await bigWin(x, x * R.current.bet); }
      if (kind === 'antic') await present(demoCache.antic ??= findSpin(s => s.keys === 2 && s.keyReels[0] === 0 && s.keyReels[1] === 1), true);
      if (kind === 'win') await present(demoCache.win ??= findSpin(s => s.wins.length >= 2 && s.win >= 2 && s.win < 15 && !s.reveals.length), false);
      if (kind === 'dwild') await present(demoCache.dwild ??= findSpin(s => s.grid.some(c => c.some(x => x?.s === S.DWILD)) && s.win > 0 && s.win < 15 && s.keys === 0), false);
      for (const [k, code] of [['premium', 6], ['bwild', S.WILD], ['split', S.SPLIT], ['expand', S.EXPAND]] as const) if (kind === k) await present(demoCache[k] ??= findSpin(rv(code)), false);
      if (kind.startsWith('intro')) { const t = TIERS[+kind.slice(5)]; setCine({ kind: 'in', tier: t, marked: { sym: 6 + +kind.slice(5), mult: [3, 5, 10][+kind.slice(5)] } }); sfx.bonus(); await wait(80); await tapOrAuto(4000); setCine(null); }
      if (kind.startsWith('end')) { const ti = +(kind[3] ?? 1), x = [0, 12, 64, 260, 1100][+(kind[4] ?? 2)]; const c = x * R.current.bet; setCine({ kind: 'out', tier: TIERS[ti], totalC: c, x }); await outroCount(c, R.current.bet); setMusicMode('end'); await tapOrAuto(4000); fx.current?.clear(); setCine(null); }
      if (kind === 'tip') await present(demoCache.tip ??= findSpin(s => s.tip.length >= 2, false), false);
      if (kind === 'raid') await present(demoCache.raid ??= findSpin(s => !!s.raid, false), false);
      if (kind === 'lucky') await present(demoCache.lucky ??= findSpin(s => s.lucky, false), false);
      if (kind.startsWith('f')) { const pred: Record<string, (s: Spin) => boolean> = { fmeter: s => s.meterAdd > 0 && s.win > 0 && s.meter > 1, fagent: s => s.agents > 0, flast: s => s.lastCall, fround: s => s.hubieRound, fretrig: s => s.addSpins > 0, fmult: s => s.runners.some(r => r.doubled) && s.win > 0 };
        let rd: Round | null = null, idx = 0; for (let i = 0; i < 20000 && !rd; i++) { const r = playRound(() => Array.from({ length: 96 }, Math.random), 1 + (i % 3)); const j = r.spins.findIndex(x => x.free && pred[kind](x)); if (j > 0) { rd = r; idx = j; } }
        if (rd) { const prev = rd.spins[idx - 1]; setBonus({ tier: rd.tier!, left: rd.spins[idx].spinsLeft, marked: rd.marked!, runners: prev.runners, meter: prev.meter || 1 }); setPose('bonus'); board.current.setSkin(true); setMusicMode('bonus');
          if (prev.runners.length) await board.current.moveRunners(prev.runners, true); await present(rd.spins[idx], false); await T(800);
          setBonus(null); board.current.clearRunners(); board.current.setSkin(false); setMusicMode('base'); setPose('idle'); } }
      if (kind === 'mystery') { const sp = demoCache.my ??= findSpin(s => s.keys === 3); board.current.show(sp); await board.current.mystery(sp, 7, 5); board.current.show(sp); }
    } finally { setBusy(false); }
  }

  useEffect(() => { if (FORCE) (window as unknown as { __hrDemo?: (k: string) => Promise<void> }).__hrDemo = demo; });
  const overlayOn = !!(cine || big);
  return <div className={`app ${SHOWCASE ? 'sc' : ''} ${bonus ? 'bonus' : ''} ${overlayOn ? 'covered' : ''}`}>
    <div className="bg" style={{ ['--bg' as string]: `url(${ART(bonus ? 'bonus_bg' : 'bg')})`, ['--bgt' as string]: `url(${ART(bonus ? 'bonus_bg' : 'bg_tall')})` }} />
    <div className="world"><i className="rain" /><i className="sweep" /><i className="cam c1" /><i className="cam c2" /></div>
    <canvas ref={fxRef} className="fx" />
    <div className="game">
      <aside className="side-l">
        <div className="sign"><small>WIN UP TO</small><b>{MAX_WIN.toLocaleString()}x</b></div>
        <div className="hubie"><img ref={hubRef} src={hubImg} alt="Hubie" />{bubble && <div className="bubble" key={bubble}>{bubble}</div>}</div>
      </aside>
      <main className="center">
        <div className="chips">
          <span className="chip" key={ways}><b>{ways.toLocaleString()}</b>WAYS</span>
          {bonus && <>
            <span className="chip wilds">WILDS{(bonus.runners.length ? bonus.runners : Array.from({ length: bonus.tier.runners }, () => ({ m: 1 }))).map((r, i) => <b key={i} className={r.m > 1 ? 'hot' : ''}>x{r.m}</b>)}</span>
            <span className="chip gold" key={'m' + (bonus.meter ?? 1)} title="House Meter"><svg viewBox="0 0 40 26" className="chip-hat" aria-hidden="true"><rect x="9" y="1" width="22" height="18" rx="2.5" /><rect x="1" y="18.5" width="38" height="5.5" rx="2.75" /></svg><b>x{bonus.meter ?? 1}</b></span>
            <span className="chip myst"><img src={IMG(bonus.marked.sym)} alt="" /><b>x{bonus.marked.mult}</b></span></>}
        </div>
        <div className="board-wrap"><div className="board" ref={boardEl} onClick={() => board.current?.spinning && board.current.quickStop()} /></div>
        <div className={`msgbar ${msg.k ?? ''}`} key={msg.t + (msg.k ?? '')}>{msg.img !== undefined && <img src={IMG(msg.img)} alt="" />}<span>{msg.t}</span>{msg.amt && <em>{msg.amt}</em>}</div>
      </main>
      <aside className="side-r">
        <Logo />
        {bonus && <div className={`spins-left ${bonus.left ? '' : 'last'}`}><small>{bonus.left ? 'FREE SPINS' : 'FINAL SPIN'}</small>{!!bonus.left && <b key={bonus.left}>{bonus.left}</b>}{!!bonus.added && <i className="added" key={'a' + bonus.left}>+{bonus.added}</i>}</div>}
      </aside>
      <footer className="hud2">
        <div className="strip">
          <button className="ic sm" title="Game rules and settings" aria-label="Game rules" onClick={() => { sfx.click(); setModal('info'); }}><svg viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" /></svg></button>
          <div className="cell"><label>BALANCE</label><b>{usd(balance)}</b></div>
          <div className="cell"><label>BET</label><b>{usd(bet)}</b></div>
          <div className="cell win"><label>WIN</label><b><span ref={el => { winRef.current = el; if (el && !el.textContent) el.textContent = usd(shown.current); }} />{xtag && <i className="xtag" key={xtag}>{xtag}</i>}</b></div>
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
      <button className="cta" onClick={() => { startAmbient(); sfx.click(); setScreen('card'); setTimeout(() => sfx.slam(), 250); }}>CONTINUE</button></div>}

    {screen === 'card' && <div className="ov card-ov" onClick={() => { sfx.click(); setScreen('game'); }}>
      <div className="member">
        <div className="m-photo"><img src={ART('dossier')} /></div>
        <div className="m-info"><small>HOUSE MEMBERSHIP · No. 0001</small><h2>HUBIE</h2>
          <dl><dt>RANK</dt><dd>Owner of the House</dd><dt>KNOWN FOR</dt><dd>Never losing a hat, or a bet</dd><dt>WEARS</dt><dd>Top hat, orange tie, coin pin</dd><dt>SIGNS WITH</dt><dd>His gold pen</dd></dl>
        </div><div className="stamp">ALL ACCESS</div></div>
      <div className="c-tap">TAP TO PLAY</div></div>}

    {cine && <div className={`cine ${cine.kind} t${cine.tier.id}`} onClick={() => tapWait.current?.()}>
      <div className="c-bg" style={{ backgroundImage: `url(${ART('bonus_bg')})` }} /><div className="c-rays" /><div className="c-vig" />
      {cine.kind === 'in' ? <div className="c-wrap">
        <div className="c-file"><img src={ART('hubie_bonus')} /><div><small>FREE SPINS · {cine.tier.name}</small><h1>{cine.tier.name}</h1>
          <ul>{TIER_RULES[cine.tier.id - 1].map(r => <li key={r}>{r}</li>)}</ul>
          {cine.marked && <div className="c-mark"><span>MYSTERY SYMBOL</span><img src={IMG(cine.marked.sym)} /><b>x{cine.marked.mult}</b><span>on {NAMES[cine.marked.sym]} wins</span></div>}</div></div>
        <div className="c-tap">{R.current.auto ? 'STARTING' : 'TAP TO START'}</div></div>
        : (() => { const ti = cine.totalC ? tierOf(cine.x ?? 0) : -1; const band = cine.totalC ? ti + 1 : 0; return <div className={`c-wrap out end b${band}`}>
          <div className="end-art"><img src={ART(END_ART[cine.tier.id - 1])} alt="Hubie" /><span className="end-line">{END_LINES[cine.tier.id - 1][Math.max(0, ti)]}</span></div>
          <small className="c-kicker">{cine.tier.name} COMPLETE</small>
          {cine.totalC ? <><div className="cine-tier">{ti >= 0 ? TIERS_WIN[ti].t : END_HEAD[cine.tier.id - 1]}</div><div className="cine-total">{usd(0)}</div></>
            : <><div className="cine-tier calm">NO WIN THIS TIME</div><div className="c-calm">THE HOUSE IS ALWAYS OPEN. TRY AGAIN.</div></>}
          <div className="c-tap">TAP TO COLLECT</div></div>; })()}
    </div>}

    {big && <div className="bigwin" data-t="0" onClick={() => tapWait.current?.()}>
      <div className="bw-vault" style={{ backgroundImage: `url(${ART('bw_vault')})` }} /><div className="bw-rays" /><div className="bw-vig" />
      <div className="bw-logo" aria-hidden="true"><span>H</span>OUSEBETS</div>
      <img className="bw-hubie" src={ART('hubie_idle')} alt="Hubie" />
      <div className="bw-text"><div className="bw-title">{TIERS_WIN[0].t}</div><div className="bw-amt">{usd(0)}</div><div className="bw-hint">TAP TO SKIP</div></div></div>}

    {modal && <div className="ov modal-wrap" onClick={() => setModal(null)}><div className={`modal ${modal === 'info' || modal === 'fair' ? 'wide' : ''}`} onClick={e => e.stopPropagation()}>
      <div className="m-head"><h2>{{ buy: 'BONUS BUY', confirm: 'CONFIRM BUY', auto: 'AUTOPLAY', info: 'GAME RULES', fair: 'PROVABLY FAIR' }[modal]}</h2>
        <button className="x" aria-label="Close" onClick={() => setModal(null)}><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" /></svg></button></div>
      <div className="m-body">
      {modal === 'buy' && <div className="tickets">{TIERS.map(t => <button key={t.id} className={`ticket t${t.id}`} disabled={balance < t.buy * bet} onClick={() => chooseBuy(t)}>
        <div className="tk-keys">{Array.from({ length: t.id + 2 }, (_, i) => <img key={i} src={IMG(S.KEY)} />)}</div>
        <b>{t.name}</b><span>{t.spins} free spins · {t.runners} Roaming Wild{t.runners > 1 ? 's' : ''}</span><em>{usd(t.buy * bet)}</em><small>{t.buy}x bet · RTP {RTP.buys[t.id - 1]}</small></button>)}</div>}
      {modal === 'confirm' && pick && <div className="confirm"><p>You are buying <b>{pick.name}</b>. Total cost charged: <b>{usd(pick.buy * bet)}</b> ({pick.buy}x your {usd(bet)} bet). Your next spin triggers the feature.</p>
        <label className="chk"><input type="checkbox" checked={dontAsk} onChange={e => { setDontAsk(e.target.checked); localStorage.setItem('hr_noask', e.target.checked ? '1' : '0'); }} /> Do not show this again</label>
        <div className="row"><button className="pill" onClick={() => setModal('buy')}>BACK</button><button className="cta" onClick={() => { sfx.click(); setArmed(pick); setModal(null); setMsg({ t: `${pick.name} READY · PRESS SPIN`, k: 'feat' }); }}>CONFIRM</button></div></div>}
      {modal === 'auto' && <div className="autom">
        <label>NUMBER OF ROUNDS</label><div className="opts">{[10, 25, 50, 100, 250, 1000].map(v => <button key={v} className={autoCfg.left === v ? 'on' : ''} onClick={() => setAutoCfg(c => ({ ...c, left: v }))}>{v}</button>)}</div>
        <label>STOP IF A SINGLE WIN IS AT LEAST</label><div className="opts">{[0, 50, 100, 500, 1000].map(v => <button key={v} className={autoCfg.stopWin === v ? 'on' : ''} onClick={() => setAutoCfg(c => ({ ...c, stopWin: v }))}>{v ? `${v}x · ${usd(v * bet)}` : 'OFF'}</button>)}</div>
        <label>STOP IF BALANCE DROPS BY</label><div className="opts">{[0, 10, 50, 100, 500].map(v => <button key={v} className={autoCfg.loss === v ? 'on' : ''} onClick={() => setAutoCfg(c => ({ ...c, loss: v }))}>{v ? `${v}x · ${usd(v * bet)}` : 'OFF'}</button>)}</div>
        <label>STOP IF BALANCE RISES BY</label><div className="opts">{[0, 10, 50, 100, 500].map(v => <button key={v} className={autoCfg.gain === v ? 'on' : ''} onClick={() => setAutoCfg(c => ({ ...c, gain: v }))}>{v ? `${v}x · ${usd(v * bet)}` : 'OFF'}</button>)}</div>
        <p className="mut help">Limits count from your balance when autoplay starts ({usd(balance)}). Autoplay keeps going through wins and free spins, collects big wins by itself after a few seconds, and never buys a bonus. Press STOP at any time.</p>
        <button className="cta wide" onClick={() => { sfx.click(); setAuto({ ...autoCfg, start: balance }); setModal(null); }}>START {autoCfg.left} ROUNDS · {usd(autoCfg.left * bet)}</button></div>}
      {modal === 'info' && <><div className="settings"><span>SETTINGS</span><button className={`pill ${turbo ? 'on' : ''}`} onClick={() => setTurbo(t => !t)}>TURBO {turbo ? 'ON' : 'OFF'}</button><button className={`pill ${musicOn ? 'on' : ''}`} onClick={() => setMusic(m => !m)}>MUSIC {musicOn ? 'ON' : 'OFF'}</button><button className={`pill ${sfxOnS ? 'on' : ''}`} onClick={() => setSfxS(m => !m)}>SOUND {sfxOnS ? 'ON' : 'OFF'}</button></div><div className="tabs">{['Features', 'Examples', 'Paytable', 'Rules'].map((t, i) => <button key={t} className={tab === i ? 'on' : ''} onClick={() => setTab(i)}>{t}</button>)}</div>
        {tab === 0 && <div className="blocks">
          {[['locked', 'Locked Cells', 'Each reel has a locked cell above and below it. 1 or 2 Keys open the cells on their reels. 3 or more Keys start free spins instead.'],
            ['h1', 'Top Symbol', 'An open cell can show a top symbol (House Token, Top Hat, Orange Tie or Coin Pin). It adds one more symbol to that reel.'],
            ['wild', 'Hubie Wild', 'Hubie stands in for every paying symbol.'],
            ['split', 'Split', 'Every symbol on this reel counts twice, so you get more ways to win.'],
            ['expand', 'Stack', 'Shows one paying symbol that counts as 4 of that symbol on its reel.'],
            ['dwild', 'Double Wild', 'Can land on reels 2, 3 and 4 in any game. It counts as 2 Wilds and turns its reel into a split reel.'],
            ['runner', 'Roaming Wild', `Free spins only. Moves to a new spot every spin. On a split reel its multiplier doubles, up to x${MULT_CAP}, and it keeps that multiplier.`],
            ['mystery', 'Mystery Symbol', 'When free spins start, the Keys flip to show one symbol and a multiplier. Wins with that symbol get the multiplier for the whole feature.'],
            ['hubie_react', "Hubie's Tip", 'Base game. Before the win check Hubie can throw 1 to 3 Wilds onto the reels.'],
            ['hubie_react', 'House Swap', 'Base game. Hubie swaps one symbol onto reels 1, 2 and 3, so the spin always wins.'],
            ['locked', 'Lucky Cell', 'Base game. With no Key on screen, one locked cell can open for free.'],
            ['hubie_bonus', 'House Meter', `Free spins. Starts at x1 and multiplies every win. Each Key adds 1, Hubie's Round adds 1 halfway through. Up to x${FEAT.meterCap}, kept until the feature ends.`],
            ['runner', 'Double Agent', 'Free spins. A Roaming Wild that doubles its multiplier can split in two; the new one starts at x1.'],
            ['wild', 'Last Call', `Free spins. If the feature has paid less than ${FEAT.lastCallBelow}x your bet before the final spin, reels 2 and 3 turn fully Wild on that spin.`],
            ['key', 'Free Spins', '3, 4 or 5 Keys start AFTER HOURS, MIDNIGHT RUN or HOUSE TAKEOVER. During free spins each Key adds 1 spin; 2 or more Keys in one spin also add a Roaming Wild and 1 more spin.'],
          ].map(([i, t, d]) => <div className="blk" key={t}><img src={ART(i)} /><div><b>{t}</b><span>{d}</span></div></div>)}</div>}
        {tab === 1 && <div className="ex"><Example win /><Example /></div>}
        {tab === 2 && <><p className="mut">Pays per way at {usd(bet)} bet. Tap a symbol for its payouts.</p>
          <div className="pay-grid">{PAYING.map(s => <button key={s} className={`pay ${tip === s ? 'on' : ''}`} onClick={() => setTip(tip === s ? null : s)}><img src={IMG(s)} /><b>{NAMES[s]}</b>
            {tip === s && <div className="tip">{PAYS[s].map((p, i) => <span key={i}>{i + 3} of a kind <em>{usd(Math.round(p / COINS * bet))}</em></span>).reverse()}</div>}</button>)}</div></>}
        {tab === 3 && <ul className="rules">
          <li>5 reels and 3 rows with a locked cell above and below each reel. 243 ways at the start of every spin. Open cells, Splits and Stacks raise the ways, up to {MAX_WAYS.toLocaleString()}.</li>
          <li>Wins pay left to right on adjacent reels, starting from the leftmost reel. Only the highest way win per symbol is paid; wins of different symbols add up.</li>
          <li>Theoretical RTP {RTP.base}. Bonus buy RTP: AFTER HOURS {RTP.buys[0]}, MIDNIGHT RUN {RTP.buys[1]}, HOUSE TAKEOVER {RTP.buys[2]}.</li>
          <li>Max win {MAX_WIN.toLocaleString()}x bet. The round ends when it is reached. Odds of hitting it from a normal spin: {RTP.maxOdds} rounds (simulated).</li>
          <li>Volatility: medium high. Results come from the provably fair HMAC SHA256 seed system. Use the button below to check any round.</li>
          <li>Autoplay plays the chosen number of rounds. It stops when a limit you set is reached or when you press STOP. It never buys a bonus.</li>
          <li>An unfinished round is completed with the same outcome when the game reloads; the outcome is fixed when the round starts.</li>
          <li>A malfunction voids all pays and plays. 18+. Play responsibly.</li>
          <li><button className="pill" onClick={() => setModal('fair')}>Open provably fair</button></li></ul>}</>}
      {modal === 'fair' && <>
        <p className="mut">Round = HMAC SHA256(key = server seed, msg = <code>clientSeed:nonce:block</code>). Spin k of a round reads blocks 12k to 12k+11 (96 floats, big endian u32 divided by 2^32). This is the Housebets House Games scheme. One nonce covers the whole round, free spins included.</p>
        <label>Active server seed hash</label><code>{hash}</code><label>Next server seed hash</label><code>{nextHash}</code>
        <label>Client seed</label><input value={clientSeed} maxLength={64} disabled={busy} onChange={e => { setClientSeed(e.target.value.replace(/[^\x21-\x7e]/g, '')); setNonce(1); }} />
        <label>Next nonce</label><code>{nonce}</code>
        <button className="pill" disabled={busy} onClick={rotate}>Rotate seed pair and reveal</button>
        {revealed.map((r, i) => <div key={i} className="rev">Seed <code>{r.seed}</code> Client seed {r.clientSeed} · nonces 1 to {r.last}</div>)}
        <Verifier prefill={revealed[0]} />
        <h3>History</h3><table><thead><tr><th>Nonce</th><th>Type</th><th>Cost</th><th>Win</th></tr></thead>
          <tbody>{hist.map((h, i) => <tr key={i}><td>{h.nonce}</td><td>{h.buy ? TIERS[h.buy - 1].name : 'Spin'}</td><td>{usd(h.buy ? TIERS[h.buy - 1].buy * h.bet : h.bet)}</td><td>{usd(h.win)}</td></tr>)}</tbody></table></>}
      </div></div></div>}
  </div>;
}

function Example({ win }: { win?: boolean }) {
  const g = win ? [[6, 10, 12], [11, 6, 13], [12, 13, 6], [10, 11, 12], [13, 12, 11]] : [[6, 10, 12], [11, 6, 13], [12, 13, 10], [6, 11, 12], [13, 12, 11]];
  return <div className="exg"><b>{win ? `WIN: ${NAMES[6]} on reels 1, 2 and 3` : `NO WIN: no ${NAMES[6]} on reel 3, so the line stops at reel 2`}</b>
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
    {out && <div className="vout">SHA256(seed) = <code>{out.h}</code> {out.r.spins.length} spin(s){out.r.tier ? ` · ${out.r.tier.name}` : ''} · total <b>{out.r.total.toFixed(2)}x bet</b>{out.r.capped ? ' (max win)' : ''}</div>}
  </div>;
}

function Logo({ big }: { big?: boolean }) {
  return <div className={`logo ${big ? 'big' : ''}`} aria-label="House Rules: Hubie Owns the Night">
    <div className="lg-main"><svg viewBox="0 0 40 26" className="lg-hat" aria-hidden="true"><rect x="9" y="1" width="22" height="18" rx="2.5" /><rect x="9" y="13" width="22" height="3.5" className="band" /><rect x="1" y="18.5" width="38" height="5.5" rx="2.75" /></svg>
      <span className="lg-a">HOUSE</span><span className="lg-b">RULES</span></div>
    <div className="lg-tag">HUBIE OWNS THE NIGHT</div></div>;
}
