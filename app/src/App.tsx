import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { playRound, PAYS, PAYING, SYM, NAMES, TIERS, S, MAX_WIN, MULT_CAP, COINS, type Spin, type Round, type Tier, type Runner } from './engine';
import { resolveRound, sha256Hex, randomServerSeed, randomClientSeed } from './fair';
import { sfx, setMuted, startAmbient, setTension } from './sound';
import { FX } from './fx';
import { ART, ALL_ART } from './art';
import { Board, wait } from './board';
import { post, listen } from './host';

const IMG = (s: number) => ART(SYM[s]);
const BETS = [10, 20, 40, 100, 200, 400, 1000, 2000, 5000, 10000]; // cents
const usd = (c: number) => '$' + (c / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const TIERS_WIN = [{ x: 15, t: 'NICE TAKE' }, { x: 50, t: 'BIG SCORE' }, { x: 200, t: 'HOUSE MONEY' }, { x: 1000, t: 'OWN THE NIGHT' }];
const tierOf = (x: number) => { let i = -1; TIERS_WIN.forEach((t, k) => { if (x >= t.x) i = k; }); return i; };
const RTP = { base: '96.5%', buys: ['96.6%', '96.5%', '96.6%'], maxOdds: 'about 1 in 4,000,000' }; // filled from sim-result.txt
const TIER_RULES = [
  ['8 free spins', '1 Runner on the board', 'Runners double on Double Down reels', '2 or more Keys add a Runner'],
  ['10 free spins', '2 Runners on the board', 'Runners double on Double Down reels', '2 or more Keys add a Runner'],
  ['10 free spins', '3 Runners on the board', 'Runners double on Double Down reels', '2 or more Keys add a Runner'],
];
const SLIDES = [
  { art: 'slide_crew', t: 'WELCOME TO THE HOUSE', d: `Hubie owns the night and his crew runs every table in town. Win up to ${MAX_WIN.toLocaleString()}x your bet.` },
  { icons: ['locked', 'key'], t: 'VAULT CELLS', d: 'Every reel has a locked Vault Cell above and below it. Land 1 or 2 House Keys to open both cells on their reels.' },
  { icons: ['h1', 'wild', 'split', 'expand'], t: 'WHAT IS INSIDE', d: 'An opened cell holds a crew member, a Boss Wild, a Double Down that splits every symbol on its reel in two, or a Stack Up worth 4 of a symbol.' },
  { icons: ['runner', 'dwild'], t: 'NIGHT SHIFT', d: `3, 4 or 5 Keys start free spins with 1, 2 or 3 Runners. Runners move every spin and double their multiplier on a split reel, up to x${MULT_CAP}.` },
  { art: 'slide_rivals', t: 'SEALED TIPS', d: 'The Night Owls want the city. When the shift starts, each Key turns into a Sealed Tip that marks one symbol with a multiplier for the whole feature.' },
];
const SHOWCASE = typeof location !== 'undefined' && location.search.includes('showcase');
const demoCache: Record<string, Spin> = {};
function findSpin(pred: (s: Spin) => boolean) {
  for (let i = 0; i < 300000; i++) { const r = playRound(() => Array.from({ length: 96 }, Math.random)); if (pred(r.spins[0])) return r.spins[0]; }
  return playRound(() => Array.from({ length: 96 }, Math.random)).spins[0];
}
type Pose = 'idle' | 'react' | 'bonus' | 'bigwin';
type Modal = null | 'buy' | 'confirm' | 'auto' | 'info' | 'fair';
type Auto = { left: number; stopWin: number; below: number; above: number };

export default function App() {
  const [loaded, setLoaded] = useState(0);
  const [screen, setScreen] = useState<'loading' | 'slides' | 'card' | 'game'>('loading');
  const [slide, setSlide] = useState(0);
  const [modal, setModal] = useState<Modal>(null);
  const [balance, setBalance] = useState(100000);
  const [bet, setBet] = useState(100);
  const [busy, setBusy] = useState(false);
  const [turbo, setTurbo] = useState(false);
  const [mute, setMute] = useState(false);
  const [pose, setPose] = useState<Pose>('idle');
  const [bubble, setBubble] = useState('');
  const [msg, setMsg] = useState<{ t: string; k?: string }>({ t: 'PLACE YOUR BET' });
  const [ways, setWays] = useState(243);
  const [winC, setWinC] = useState(0);
  const [armed, setArmed] = useState<Tier | null>(null);
  const [pick, setPick] = useState<Tier | null>(null);
  const [dontAsk, setDontAsk] = useState(() => localStorage.getItem('hr_noask') === '1');
  const [auto, setAuto] = useState<Auto | null>(null);
  const [autoCfg, setAutoCfg] = useState<Auto>({ left: 25, stopWin: 0, below: 0, above: 0 });
  const [bonus, setBonus] = useState<{ tier: Tier; left: number; marked: { sym: number; mult: number }; runners: Runner[] } | null>(null);
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
  const R = useRef({ turbo: false, bet: 100, auto: null as Auto | null, balance: 100000, armed: null as Tier | null, winC: 0 });
  R.current.turbo = turbo; R.current.bet = bet; R.current.auto = auto; R.current.balance = balance; R.current.armed = armed;
  const T = (ms: number) => wait(R.current.turbo ? ms * .4 : ms);

  useEffect(() => { let n = 0; const all = ALL_ART();
    Promise.all(all.map(u => { const i = new Image(); i.src = u; return i.decode().catch(() => {}).finally(() => { n++; setLoaded(n / (all.length + 1)); }); }))
      .then(async () => { if (!board.current && boardEl.current) { const b = new Board(); board.current = b; await b.init(boardEl.current);
        b.onAntic = on => { setTension(on); if (on) { sfx.riser(1.1); sfx.heartbeat(); setMsg({ t: 'ONE MORE KEY', k: 'antic' }); say('Come on...', 'react', 1300); } }; }
        setLoaded(1); setTimeout(() => setScreen('slides'), 250); post('ready', { balance: 1000 }); }); }, []);
  useEffect(() => { if (fxRef.current && !fx.current) fx.current = new FX(fxRef.current); }, []);
  useEffect(() => { sha256Hex(serverSeed).then(setHash); }, [serverSeed]);
  useEffect(() => { sha256Hex(nextSeed).then(setNextHash); }, [nextSeed]);
  useEffect(() => { setMuted(mute); }, [mute]);
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
  function setWin(to: number, dur = .8) { const from = R.current.winC; R.current.winC = to; setWinC(to); const el = winRef.current; if (!el) return; const o = { v: from };
    gsap.killTweensOf(o); gsap.to(o, { v: to, duration: R.current.turbo ? dur * .35 : dur, ease: 'power1.out', onUpdate: () => { el.textContent = usd(Math.round(o.v)); if (Math.random() < .3) sfx.tick(); } }); }

  /** Presents one spin; returns its win in cents. */
  async function present(sp: Spin, antic: boolean, firstFree = false) {
    const b = board.current!; const betC = R.current.bet; fx.current?.clear();
    setMsg({ t: sp.free ? 'NIGHT SHIFT' : 'GOOD LUCK' }); sfx.spinStart(); setWays(243);
    await b.spin(sp, { turbo: R.current.turbo, antic }); setTension(false);
    if (sp.reveals.length) { setMsg({ t: 'VAULT CELLS OPEN', k: 'feat' }); await b.openCells(sp); }
    if (sp.split.some(Boolean)) { setMsg({ t: 'DOUBLE DOWN', k: 'feat' }); await b.applySplits(sp); }
    if (sp.runners.length) { await b.moveRunners(sp.runners, firstFree); setBonus(bn => bn && { ...bn, runners: sp.runners.map(x => ({ ...x })) });
      if (sp.runners.some(r => r.doubled)) { setMsg({ t: 'RUNNER DOUBLED', k: 'feat' }); say('Double it!', 'bonus', 1100); await T(300); } }
    setWays(sp.ways);
    const c = Math.round(sp.win * betC);
    if (c > 0) { b.showWins(sp); sfx.win(sp.win); setWin(R.current.winC + c);
      setMsg({ t: 'WIN', k: 'win' }); if (sp.win >= 5) say(sp.win >= 15 ? 'That is House money.' : 'Nice cut.', 'react', 1400);
      await T(sp.win >= 5 ? 1200 : 800); }
    else if (!sp.free && sp.keys < 3) setMsg({ t: 'Better luck next spin', k: 'calm' });
    if (sp.free && sp.addSpins) { setMsg({ t: `+${sp.addSpins} SPINS${sp.addRunner ? ' · NEW RUNNER' : ''}`, k: 'feat' }); await T(700); }
    return c;
  }

  async function bigWin(x: number, c: number) {
    setBig({ x, c }); setPose('bigwin'); sfx.bigWin(); await wait(60);
    const el = document.querySelector('.bw-amt') as HTMLElement, title = document.querySelector('.bw-title') as HTMLElement;
    let skip = false; tapWait.current = () => { skip = true; };
    const f = fx.current; const o = { v: 0 }; let shown = -1; const dur = Math.min(9, 2 + tierOf(x) * 2);
    await new Promise<void>(res => { const tw = gsap.to(o, { v: x, duration: R.current.turbo ? dur * .5 : dur, ease: 'power1.inOut',
      onUpdate: () => { const ti = tierOf(o.v); if (ti !== shown && ti >= 0) { shown = ti; title.textContent = TIERS_WIN[ti].t; title.dataset.t = String(ti); el.parentElement!.parentElement!.dataset.t = String(ti);
        gsap.fromTo(title, { scale: 2, opacity: 0 }, { scale: 1, opacity: 1, duration: .4, ease: 'back.out(2.5)' }); sfx.tierUp(ti); if (f) { f.shower = 1 + ti * 2; f.burst(30 + ti * 25, innerWidth / 2, innerHeight * .5, ['bill', 'coin', 'spark'], 1 + ti * .3); } }
        el.textContent = usd(Math.round(o.v / x * c)); if (Math.random() < .2) sfx.coin(); if (skip) { tw.progress(1); } }, onComplete: () => res() }); });
    el.textContent = usd(c); (document.querySelector('.bw-hint') as HTMLElement).textContent = R.current.auto ? 'COLLECTING' : 'TAP TO COLLECT';
    await tapOrAuto(2500); if (f) f.clear(); setBig(null); setPose('idle');
  }

  async function play() {
    if (busy || !board.current) return; startAmbient();
    const tier = R.current.armed; const betC = R.current.bet; const cost = tier ? tier.buy * betC : betC;
    if (R.current.balance < cost) { setMsg({ t: 'INSUFFICIENT BALANCE', k: 'warn' }); setAuto(null); return; }
    setBusy(true); setArmed(null); setBalance(x => x - cost); R.current.winC = 0; setWinC(0); if (winRef.current) winRef.current.textContent = usd(0);
    const n = nonce; setNonce(n + 1); const buyTier = tier ? tier.id : 0;
    post('roundStart', { bet: betC / 100, cost: cost / 100, buyTier, nonce: n, serverSeedHash: hash, clientSeed });
    const round: Round = await resolveRound(serverSeed, clientSeed, n, src => playRound(src, buyTier));
    let total = await present(round.spins[0], !buyTier);
    if (round.tier && round.marked) {
      const t = round.tier; setMsg({ t: `${round.spins[0].keys} KEYS · ${t.name}`, k: 'feat' }); say('The shift starts now.', 'bonus', 1600); board.current.shake(8);
      await T(700); await board.current.mystery(round.spins[0], round.marked.sym, round.marked.mult);
      setCine({ kind: 'in', tier: t, marked: round.marked }); sfx.bonus(); await wait(80); await tapOrAuto(3000); setCine(null);
      setBonus({ tier: t, left: t.spins, marked: round.marked, runners: [] }); setPose('bonus'); board.current.setSkin(true);
      const free = round.spins.filter(s => s.free); let first = true;
      for (const sp of free) { setBonus(bn => bn && { ...bn, left: Math.max(0, bn.left - 1) }); await T(250);
        total += await present(sp, false, first); first = false; setBonus(bn => bn && { ...bn, left: sp.spinsLeft });
        if (total >= MAX_WIN * betC) break; }
      total = Math.min(total, MAX_WIN * betC);
      board.current.clearWins(); await T(400);
      // ONE total screen for the whole round, then back to base.
      fx.current?.clear(); setCine({ kind: 'out', tier: t, totalC: total, x: total / betC }); await wait(80);
      const el = document.querySelector('.cine-total') as HTMLElement, lab = document.querySelector('.cine-tier') as HTMLElement; const o = { v: 0 }; let shown = -1; const xr = total / betC;
      if (total > 0) { sfx.bigWin(); await new Promise<void>(res => { let skip = false; tapWait.current = () => { skip = true; };
        const tw = gsap.to(o, { v: total, duration: Math.min(7, 1.5 + Math.max(0, tierOf(xr)) * 1.5), ease: 'power1.inOut', onUpdate: () => { el.textContent = usd(Math.round(o.v));
          const ti = tierOf(o.v / betC); if (ti !== shown && ti >= 0) { shown = ti; lab.textContent = TIERS_WIN[ti].t; sfx.tierUp(ti); const f = fx.current; if (f) { f.shower = 1 + ti; f.burst(20 + ti * 20, innerWidth / 2, innerHeight * .45, ['bill', 'coin'], 1); } }
          if (skip) tw.progress(1); }, onComplete: () => res() }); }); el.textContent = usd(total); }
      (document.querySelector('.cine .c-tap') as HTMLElement).textContent = R.current.auto ? 'CONTINUING' : 'TAP TO COLLECT';
      await tapOrAuto(3000); fx.current?.clear(); setCine(null);
      setBonus(null); board.current.clearRunners(); board.current.setSkin(false); board.current.show(round.spins[0]); setPose('idle'); setWays(243);
      setMsg(total > 0 ? { t: 'TOTAL WIN', k: 'win' } : { t: 'Better luck next shift', k: 'calm' });
    } else {
      const x = total / betC; if (x >= TIERS_WIN[0].x) await bigWin(x, total);
      if (total > 0) setMsg({ t: 'WIN', k: 'win' });
    }
    R.current.winC = total; setWinC(total); if (winRef.current) winRef.current.textContent = usd(total);
    const nb = R.current.balance + total; setBalance(nb);
    setHist(h => [{ nonce: n, bet: betC, win: total, buy: buyTier, spins: round.spins.length }, ...h].slice(0, 30));
    post('roundEnd', { nonce: n, bet: betC / 100, cost: cost / 100, win: total / 100, multiplier: total / betC, buyTier, spins: round.spins.length });
    const a = R.current.auto; if (a && ((a.stopWin && total >= a.stopWin) || (a.below && nb < a.below) || (a.above && nb > a.above))) { setAuto(null); setMsg({ t: 'AUTOPLAY STOPPED', k: 'warn' }); }
    setBusy(false);
  }
  function chooseBuy(t: Tier) { sfx.click(); if (dontAsk) { setArmed(t); setModal(null); setMsg({ t: `${t.name} READY · PRESS SPIN`, k: 'feat' }); } else { setPick(t); setModal('confirm'); } }
  async function rotate() { setRevealed(r => [{ seed: serverSeed, clientSeed, last: nonce - 1 }, ...r]); setServerSeed(nextSeed); setNextSeed(randomServerSeed()); setNonce(1); }
  const bi = BETS.indexOf(bet);

  // Showcase helpers. Demo spins use throwaway random floats and never touch the balance.
  async function demo(kind: string) {
    if (busy || !board.current) return; setBusy(true); startAmbient(); R.current.winC = 0; setWinC(0);
    const rv = (k: number) => (s: Spin) => s.reveals.some(r => k === 6 ? r.cell.s >= 6 : r.cell.s === k) && s.keys < 3;
    try {
      if (kind.startsWith('big')) { const x = [22, 80, 420, 2600][+kind.slice(3)]; await bigWin(x, x * R.current.bet); }
      if (kind === 'antic') await present(demoCache.antic ??= findSpin(s => s.keys === 2 && s.keyReels[0] === 0 && s.keyReels[1] === 1), true);
      if (kind === 'win') await present(demoCache.win ??= findSpin(s => s.wins.length >= 2 && s.win >= 2 && s.win < 15 && !s.reveals.length), false);
      if (kind === 'dwild') await present(demoCache.dwild ??= findSpin(s => s.grid.some(c => c.some(x => x?.s === S.DWILD)) && s.win > 0 && s.win < 15 && s.keys === 0), false);
      for (const [k, code] of [['premium', 6], ['bwild', S.WILD], ['split', S.SPLIT], ['expand', S.EXPAND]] as const) if (kind === k) await present(demoCache[k] ??= findSpin(rv(code)), false);
      if (kind.startsWith('intro')) { const t = TIERS[+kind.slice(5)]; setCine({ kind: 'in', tier: t, marked: { sym: 6 + +kind.slice(5), mult: [3, 5, 10][+kind.slice(5)] } }); sfx.bonus(); await wait(80); await tapOrAuto(4000); setCine(null); }
      if (kind.startsWith('end')) { const x = kind === 'end0' ? 0 : 640; const c = x * R.current.bet; setCine({ kind: 'out', tier: TIERS[1], totalC: c, x }); await wait(80);
        const el = document.querySelector('.cine-total') as HTMLElement, lab = document.querySelector('.cine-tier') as HTMLElement;
        if (c) { const o = { v: 0 }; await gsap.to(o, { v: c, duration: 4, onUpdate: () => { el.textContent = usd(Math.round(o.v)); const ti = tierOf(o.v / R.current.bet); if (ti >= 0) lab.textContent = TIERS_WIN[ti].t; } }); el.textContent = usd(c); }
        await tapOrAuto(4000); fx.current?.clear(); setCine(null); }
      if (kind === 'mystery') { const sp = demoCache.my ??= findSpin(s => s.keys === 3); board.current.show(sp); await board.current.mystery(sp, 7, 5); board.current.show(sp); }
    } finally { setBusy(false); }
  }

  const overlayOn = !!(cine || big);
  return <div className={`app ${SHOWCASE ? 'sc' : ''} ${bonus ? 'bonus' : ''} ${overlayOn ? 'covered' : ''}`}>
    <div className="bg" style={{ ['--bg' as string]: `url(${ART(bonus ? 'bonus_bg' : 'bg')})`, ['--bgt' as string]: `url(${ART(bonus ? 'bonus_bg' : 'bg_tall')})` }} />
    <div className="world"><i className="rain" /><i className="sweep" /><i className="cam c1" /><i className="cam c2" /></div>
    <canvas ref={fxRef} className="fx" />
    <div className="game">
      <aside className="side-l">
        <div className="sign"><small>WIN UP TO</small><b>{MAX_WIN.toLocaleString()}x</b></div>
        <div className="ways" key={ways}><small>WAYS</small><b>{ways.toLocaleString()}</b></div>
        {bonus && <div className="runners"><small>RUNNERS</small><div>{(bonus.runners.length ? bonus.runners : Array.from({ length: bonus.tier.runners }, () => ({ m: 1 }))).map((r, i) => <span key={i} className={r.m > 1 ? 'hot' : ''}>x{r.m}</span>)}</div>
          <small>SEALED TIP</small><div className="marked"><img src={IMG(bonus.marked.sym)} /><b>x{bonus.marked.mult}</b></div></div>}
        <div className="hubie"><img ref={hubRef} src={hubImg} alt="Hubie" />{bubble && <div className="bubble" key={bubble}>{bubble}</div>}</div>
      </aside>
      <main className="center">
        <div className="board-wrap"><div className="board" ref={boardEl} onClick={() => board.current?.spinning && board.current.quickStop()} /></div>
        <div className={`msgbar ${msg.k ?? ''}`} key={msg.t + (msg.k ?? '')}>{msg.k === 'win' ? <><span>{msg.t}</span><span className="m-amt">{usd(winC)}</span></> : <span>{msg.t}</span>}</div>
      </main>
      <aside className="side-r">
        <img className="logo" src={ART('logo')} alt="House Rules" />
        {bonus ? <div className="spins-left"><small>SPINS LEFT</small><b key={bonus.left}>{bonus.left}</b><em>{bonus.tier.name}</em></div>
          : <button className={`buy-btn ${armed ? 'armed' : ''}`} disabled={busy} onClick={() => { sfx.click(); if (armed) { setArmed(null); setMsg({ t: 'BUY CANCELLED' }); } else setModal('buy'); }}>
            <img src={IMG(S.KEY)} /><span>{armed ? 'CANCEL BUY' : 'BONUS BUY'}</span></button>}
      </aside>
      <footer className="hud">
        <div className="meter"><label>BALANCE</label><b>{usd(balance)}</b></div>
        <div className="bet">
          <button aria-label="Lower bet" disabled={busy || bi <= 0 || !!armed} onClick={() => { sfx.click(); setBet(BETS[bi - 1]); post('bet', { bet: BETS[bi - 1] / 100 }); }}><svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="2.6" rx="1.3" fill="currentColor" /></svg></button>
          <div className="meter c"><label>BET</label><b>{usd(bet)}</b></div>
          <button aria-label="Raise bet" disabled={busy || bi >= BETS.length - 1 || !!armed} onClick={() => { sfx.click(); setBet(BETS[bi + 1]); post('bet', { bet: BETS[bi + 1] / 100 }); }}><svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="2.6" rx="1.3" fill="currentColor" /><rect x="10.7" y="5" width="2.6" height="14" rx="1.3" fill="currentColor" /></svg></button>
        </div>
        <div className="ctl">
          <button className="ic" aria-label="Game rules" onClick={() => { sfx.click(); setModal('info'); }}><svg viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" /></svg></button>
          <button className={`ic ${turbo ? 'on' : ''}`} aria-label="Turbo" onClick={() => { sfx.click(); setTurbo(t => !t); }}><svg viewBox="0 0 24 24"><path d="M13 2L4 14h7l-1 8 9-12h-7z" fill="currentColor" /></svg></button>
          <button className={`spin ${busy ? 'busy' : ''} ${armed ? 'armed' : ''} ${auto ? 'auto' : ''}`} aria-label="Spin" onClick={spinPress}>
            {auto ? <b className="auto-n">{auto.left}</b> : <svg viewBox="0 0 24 24"><path d="M12 4a8 8 0 1 0 7.4 5h-2.2A6 6 0 1 1 12 6v3l4-4-4-4z" fill="currentColor" /></svg>}
            {armed && <span className="price">{usd(armed.buy * bet)}</span>}</button>
          <button className={`ic auto ${auto ? 'on' : ''}`} aria-label="Autoplay" disabled={!!armed || (busy && !auto)} onClick={() => { sfx.click(); auto ? setAuto(null) : setModal('auto'); }}>{auto ? 'STOP' : 'AUTO'}</button>
          <button className="ic" aria-label="Sound" onClick={() => setMute(m => !m)}><svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" />{mute ? <path d="M16 9l5 6M21 9l-5 6" stroke="currentColor" strokeWidth="2" /> : <path d="M16 8a5 5 0 0 1 0 8M18.5 5.5a8.5 8.5 0 0 1 0 13" stroke="currentColor" strokeWidth="2" fill="none" />}</svg></button>
        </div>
        <div className="meter r"><label>WIN</label><b ref={winRef}>{usd(winC)}</b></div>
      </footer>
    </div>

    {SHOWCASE && screen === 'game' && <div className="showcase"><b>SHOWCASE</b>
      {['Nice Take', 'Big Score', 'House Money', 'Own the Night'].map((t, i) => <button key={t} onClick={() => demo('big' + i)}>{t}</button>)}
      {[['antic', 'Anticipation'], ['win', 'Win'], ['dwild', 'Double Wild'], ['premium', 'Cell: Crew'], ['bwild', 'Cell: Boss Wild'], ['split', 'Cell: Double Down'], ['expand', 'Cell: Stack Up'], ['mystery', 'Sealed Tip'], ['intro0', 'Intro 1'], ['intro1', 'Intro 2'], ['intro2', 'Intro 3'], ['end0', 'End: zero'], ['end1', 'End: big']].map(([k, t]) => <button key={k} onClick={() => demo(k)}>{t}</button>)}</div>}

    {screen === 'loading' && <div className="ov loading"><img src={ART('logo')} className="load-logo" /><div className="load-bar"><i style={{ width: `${loaded * 100}%` }} /></div><small>{Math.round(loaded * 100)}%</small></div>}

    {screen === 'slides' && <div className="ov slides">
      <div className="sl-top"><span className="vol">VOLATILITY <i /><i /><i /><i /><i /></span><button className="ic" aria-label="Sound" onClick={() => setMute(m => !m)}>{mute ? 'OFF' : 'ON'}</button></div>
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
          <dl><dt>RANK</dt><dd>Owner of the House</dd><dt>KNOWN FOR</dt><dd>Never losing a hat, or a bet</dd><dt>CREW</dt><dd>The Croupier, Big Lou, Madame Jade, Ratchet</dd><dt>RIVALS</dt><dd>The Night Owls</dd></dl>
        </div><div className="stamp">ALL ACCESS</div></div>
      <div className="c-tap">TAP TO PLAY</div></div>}

    {cine && <div className={`cine ${cine.kind} t${cine.tier.id}`} onClick={() => tapWait.current?.()}>
      <div className="c-bg" style={{ backgroundImage: `url(${ART('bonus_bg')})` }} /><div className="c-rays" /><div className="c-vig" />
      {cine.kind === 'in' ? <div className="c-wrap">
        <div className="c-file"><img src={ART('hubie_bonus')} /><div><small>CASE FILE · {cine.tier.name}</small><h1>{cine.tier.name}</h1>
          <ul>{TIER_RULES[cine.tier.id - 1].map(r => <li key={r}>{r}</li>)}</ul>
          {cine.marked && <div className="c-mark"><span>SEALED TIP</span><img src={IMG(cine.marked.sym)} /><b>x{cine.marked.mult}</b><span>on {NAMES[cine.marked.sym]} wins</span></div>}</div></div>
        <div className="c-tap">{R.current.auto ? 'STARTING' : 'TAP TO START'}</div></div>
        : <div className="c-wrap out"><small className="c-kicker">{cine.tier.name} COMPLETE</small>
          {cine.totalC ? <><div className="cine-tier">TOTAL WIN</div><div className="cine-total">{usd(0)}</div><div className="c-x">{(cine.x ?? 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}x BET</div></>
            : <><div className="cine-tier calm">A QUIET SHIFT</div><div className="c-calm">Better luck next time. The House is always open.</div></>}
          <div className="c-tap">TAP TO COLLECT</div></div>}
    </div>}

    {big && <div className="bigwin" data-t="0" onClick={() => tapWait.current?.()}>
      <div className="bw-rays" /><img className="bw-hubie" src={ART('hubie_bigwin')} />
      <div className="bw-text"><div className="bw-title">{TIERS_WIN[0].t}</div><div className="bw-amt">{usd(0)}</div><div className="bw-x">{big.x.toLocaleString('en-US', { maximumFractionDigits: 2 })}x BET</div><div className="bw-hint">TAP TO SKIP</div></div></div>}

    {modal && <div className="ov modal-wrap" onClick={() => setModal(null)}><div className={`modal ${modal === 'info' || modal === 'fair' ? 'wide' : ''}`} onClick={e => e.stopPropagation()}>
      <div className="m-head"><h2>{{ buy: 'BONUS BUY', confirm: 'CONFIRM BUY', auto: 'AUTOPLAY', info: 'GAME RULES', fair: 'PROVABLY FAIR' }[modal]}</h2>
        <button className="x" aria-label="Close" onClick={() => setModal(null)}><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" /></svg></button></div>
      <div className="m-body">
      {modal === 'buy' && <div className="tickets">{TIERS.map(t => <button key={t.id} className={`ticket t${t.id}`} disabled={balance < t.buy * bet} onClick={() => chooseBuy(t)}>
        <div className="tk-keys">{Array.from({ length: t.id + 2 }, (_, i) => <img key={i} src={IMG(S.KEY)} />)}</div>
        <b>{t.name}</b><span>{t.spins} spins · {t.runners} Runner{t.runners > 1 ? 's' : ''}</span><em>{usd(t.buy * bet)}</em><small>{t.buy}x bet · RTP {RTP.buys[t.id - 1]}</small></button>)}</div>}
      {modal === 'confirm' && pick && <div className="confirm"><p>You are buying <b>{pick.name}</b>. Total cost charged: <b>{usd(pick.buy * bet)}</b> ({pick.buy}x your {usd(bet)} bet). Your next spin triggers the feature.</p>
        <label className="chk"><input type="checkbox" checked={dontAsk} onChange={e => { setDontAsk(e.target.checked); localStorage.setItem('hr_noask', e.target.checked ? '1' : '0'); }} /> Do not show this again</label>
        <div className="row"><button className="pill" onClick={() => setModal('buy')}>BACK</button><button className="cta" onClick={() => { sfx.click(); setArmed(pick); setModal(null); setMsg({ t: `${pick.name} READY · PRESS SPIN`, k: 'feat' }); }}>CONFIRM</button></div></div>}
      {modal === 'auto' && <div className="autom">
        <label>NUMBER OF ROUNDS</label><div className="opts">{[10, 25, 50, 100, 250, 1000].map(v => <button key={v} className={autoCfg.left === v ? 'on' : ''} onClick={() => setAutoCfg(c => ({ ...c, left: v }))}>{v}</button>)}</div>
        <label>STOP IF A SINGLE WIN EXCEEDS</label><div className="opts">{[0, 1000, 5000, 10000, 50000].map(v => <button key={v} className={autoCfg.stopWin === v ? 'on' : ''} onClick={() => setAutoCfg(c => ({ ...c, stopWin: v }))}>{v ? usd(v) : 'Off'}</button>)}</div>
        <label>STOP IF BALANCE GOES BELOW</label><div className="opts">{[0, 10000, 50000, 90000].map(v => <button key={v} className={autoCfg.below === v ? 'on' : ''} onClick={() => setAutoCfg(c => ({ ...c, below: v }))}>{v ? usd(v) : 'Off'}</button>)}</div>
        <label>STOP IF BALANCE GOES ABOVE</label><div className="opts">{[0, 150000, 200000, 500000].map(v => <button key={v} className={autoCfg.above === v ? 'on' : ''} onClick={() => setAutoCfg(c => ({ ...c, above: v }))}>{v ? usd(v) : 'Off'}</button>)}</div>
        <p className="mut">Autoplay keeps going through wins and bonus rounds. It stops when a stop rule is met or when you press STOP. Big wins collect by themselves after a few seconds.</p>
        <button className="cta wide" onClick={() => { sfx.click(); setAuto({ ...autoCfg }); setModal(null); }}>START {autoCfg.left} ROUNDS · {usd(autoCfg.left * bet)}</button></div>}
      {modal === 'info' && <><div className="tabs">{['Features', 'Examples', 'Paytable', 'Rules'].map((t, i) => <button key={t} className={tab === i ? 'on' : ''} onClick={() => setTab(i)}>{t}</button>)}</div>
        {tab === 0 && <div className="blocks">
          {[['locked', 'Vault Cells', 'Each reel has a locked cell above and below it. 1 or 2 House Keys open both cells on their reels.'],
            ['h1', 'Crew Cell', 'An opened cell can hold a crew member, adding a symbol to the reel.'],
            ['wild', 'Boss Wild', 'Substitutes for every paying symbol.'],
            ['split', 'Double Down', 'Splits every regular symbol on its reel in two, so each counts twice and the ways go up.'],
            ['expand', 'Stack Up', 'Reveals a paying symbol worth 4 of a kind on that reel.'],
            ['dwild', 'Double Wild', 'Lands on reels 2, 3 and 4 in any game. Counts as 2 wilds and makes its reel a split reel.'],
            ['runner', 'Runners', `Roaming wilds in the bonus. They move every spin. On a split reel a Runner doubles its multiplier, up to x${MULT_CAP}, and keeps it until the feature ends.`],
            ['mystery', 'Sealed Tip', 'When the bonus starts, every Key becomes a Sealed Tip that marks one symbol with a multiplier for the whole feature.'],
            ['key', 'Night Shift', '3, 4 or 5 Keys start AFTER HOURS, MIDNIGHT RUN or HOUSE TAKEOVER. In the bonus each Key adds 1 spin; 2 or more Keys in one spin add a Runner and 1 more spin.'],
          ].map(([i, t, d]) => <div className="blk" key={t}><img src={ART(i)} /><div><b>{t}</b><span>{d}</span></div></div>)}</div>}
        {tab === 1 && <div className="ex"><Example win /><Example /></div>}
        {tab === 2 && <><p className="mut">Pays per way at {usd(bet)} bet. Tap a symbol for its payouts.</p>
          <div className="pay-grid">{PAYING.map(s => <button key={s} className={`pay ${tip === s ? 'on' : ''}`} onClick={() => setTip(tip === s ? null : s)}><img src={IMG(s)} /><b>{NAMES[s]}</b>
            {tip === s && <div className="tip">{PAYS[s].map((p, i) => <span key={i}>{i + 3} of a kind <em>{usd(Math.round(p / COINS * bet))}</em></span>).reverse()}</div>}</button>)}</div></>}
        {tab === 3 && <ul className="rules">
          <li>5 reels, 3 rows, plus one Vault Cell above and below each reel. 243 base ways, up to {(10 ** 5).toLocaleString()} or more with open cells and splits.</li>
          <li>Wins pay left to right on adjacent reels, starting from the leftmost reel. Only the highest way win per symbol is paid; wins of different symbols add up.</li>
          <li>Theoretical RTP {RTP.base}. Bonus buy RTP: AFTER HOURS {RTP.buys[0]}, MIDNIGHT RUN {RTP.buys[1]}, HOUSE TAKEOVER {RTP.buys[2]}.</li>
          <li>Max win {MAX_WIN.toLocaleString()}x bet. The round ends when it is reached. Odds of hitting max win in the base game: {RTP.maxOdds} rounds (simulated).</li>
          <li>Volatility: extreme. Results come from the provably fair HMAC SHA256 seed system (shield button in Rules).</li>
          <li>Autoplay plays the chosen number of rounds and stops on the rules you set, on a bonus win above your limit, or when you press STOP. Bonus buys are never bought by Autoplay.</li>
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
  return <div className="exg"><b>{win ? 'WIN: The Croupier on reels 1, 2 and 3' : 'NO WIN: reel 3 has no Croupier, so the chain breaks'}</b>
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
