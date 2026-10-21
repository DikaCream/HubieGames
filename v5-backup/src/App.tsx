import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { playRound, PAYS, PAYING, SYM, NAMES, TIERS, S, MAX_WIN, COINS, DIRTY, type Spin, type Round, type Tier } from './engine';
import { resolveRound, sha256Hex, randomServerSeed, randomClientSeed } from './fair';
import { sfx, setMuted, startAmbient, setTension } from './sound';
import { FX } from './fx';
import { ART, ALL_ART } from './art';
import { Board, wait } from './board';
import { post, listen } from './host';

const IMG = (s: number) => ART(SYM[s]);
const BETS = [0.2, 0.4, 1, 2, 4, 10, 20, 50, 100];
const usd = (n: number) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
type Pose = 'idle' | 'react' | 'bonus' | 'bigwin';
type Overlay = null | 'loading' | 'intro' | 'buy' | 'info' | 'fair';
export const BIG = [{ x: 15, t: 'BIG WIN' }, { x: 50, t: 'MEGA WIN' }, { x: 200, t: 'CROOKED WIN' }, { x: 1000, t: 'KINGPIN WIN' }];
const TIER_RULES = [
  ['9 free spins', 'Every new Shove Wild adds its multiplier to HEAT', 'HEAT multiplies every win and never resets', 'Each Key adds 1 spin'],
  ['10 free spins', 'HEAT starts at x2', 'A Safe is guaranteed every spin, on any reel', 'Each Key adds 1 spin'],
  ['10 free spins', 'Shove Wilds stay sticky with their multipliers', 'HEAT keeps rising with every new wild', 'Each Key adds 1 spin'],
];
const SHOWCASE = typeof location !== 'undefined' && location.search.includes('showcase');

/** Finds a base spin matching a condition using throwaway random floats (showcase only, never used for real rounds). */
const demoCache: Record<string, Spin> = {};
function findSpin(pred: (s: Spin) => boolean) {
  for (let i = 0; i < 400000; i++) { const r = playRound(() => Array.from({ length: 64 }, Math.random)); if (pred(r.spins[0])) return r.spins[0]; }
  return playRound(() => Array.from({ length: 64 }, Math.random)).spins[0];
}

export default function App() {
  const [loaded, setLoaded] = useState(0);
  const [overlay, setOverlay] = useState<Overlay>('loading');
  const [balance, setBalance] = useState(1000);
  const [bet, setBet] = useState(1);
  const [busy, setBusy] = useState(false);
  const [turbo, setTurbo] = useState(false);
  const [auto, setAuto] = useState(0);
  const [mute, setMute] = useState(false);
  const [pose, setPose] = useState<Pose>('idle');
  const [bubble, setBubble] = useState('');
  const [msg, setMsg] = useState<{ t: string; k?: string }>({ t: 'PLACE YOUR BET AND SPIN' });
  const [lastWin, setLastWin] = useState(0);
  const [bonus, setBonus] = useState<{ tier: Tier; left: number; heat: number; total: number; waiting: boolean } | null>(null);
  const [bAuto, setBAuto] = useState(false);
  const [cine, setCine] = useState<null | { kind: 'in' | 'out'; tier: Tier; total?: number }>(null);
  const [big, setBig] = useState<null | { x: number; amount: number }>(null);
  const [tab, setTab] = useState(0);
  const [serverSeed, setServerSeed] = useState(randomServerSeed);
  const [nextSeed, setNextSeed] = useState(randomServerSeed);
  const [hash, setHash] = useState(''); const [nextHash, setNextHash] = useState('');
  const [clientSeed, setClientSeed] = useState(randomClientSeed);
  const [nonce, setNonce] = useState(1);
  const [revealed, setRevealed] = useState<{ seed: string; hash: string; clientSeed: string; last: number }[]>([]);
  const [hist, setHist] = useState<{ nonce: number; bet: number; win: number; buy: number; spins: number }[]>([]);

  const boardEl = useRef<HTMLDivElement>(null); const board = useRef<Board | null>(null);
  const fxRef = useRef<HTMLCanvasElement>(null); const fx = useRef<FX | null>(null);
  const hubRef = useRef<HTMLImageElement>(null); const winNum = useRef<HTMLSpanElement>(null); const bigNum = useRef<HTMLDivElement>(null);
  const tapWait = useRef<(() => void) | null>(null); const bonusSpinWait = useRef<(() => void) | null>(null);
  const turboRef = useRef(false); turboRef.current = turbo; const bAutoRef = useRef(false); bAutoRef.current = bAuto;
  const betRef = useRef(bet); betRef.current = bet;
  const T = (ms: number) => wait(turboRef.current ? ms * .4 : ms);

  // preload + board init
  useEffect(() => { let n = 0; const all = ALL_ART();
    const done = Promise.all(all.map(u => { const i = new Image(); i.src = u; return i.decode().catch(() => {}).finally(() => { n++; setLoaded(n / (all.length + 1)); }); }));
    done.then(async () => { if (!board.current && boardEl.current) { const b = new Board(); board.current = b; await b.init(boardEl.current);
      b.onAntic = (on) => { setTension(on); if (on) { sfx.riser(1.1); sfx.heartbeat(); setMsg({ t: 'ONE MORE KEY', k: 'antic' }); hubieSays('Come on...', 'react', 1300); } }; }
      setLoaded(1); setOverlay('intro'); post('ready', { balance: 1000 }); }); }, []);
  useEffect(() => { if (fxRef.current && !fx.current) fx.current = new FX(fxRef.current); }, []);
  useEffect(() => { sha256Hex(serverSeed).then(setHash); }, [serverSeed]);
  useEffect(() => { sha256Hex(nextSeed).then(setNextHash); }, [nextSeed]);
  useEffect(() => { setMuted(mute); }, [mute]);
  useEffect(() => { if (fx.current) { fx.current.heat = !!bonus; fx.current.ambient = !overlay; } }, [bonus, overlay]);
  useEffect(() => listen(m => { if (m.type === 'setBalance') setBalance(m.balance); if (m.type === 'setBet' && BETS.includes(m.bet)) setBet(m.bet); }), []);
  useEffect(() => { post('balance', { balance }); }, [balance]);
  // Hubie idle motion: breathing, blink squash, periodic hat tip.
  useEffect(() => { const el = hubRef.current; if (!el || loaded < 1) return;
    const br = gsap.to(el, { scaleY: 1.025, scaleX: .99, y: -3, duration: 1.7, yoyo: true, repeat: -1, ease: 'sine.inOut', transformOrigin: '50% 100%' });
    const bl = setInterval(() => { if (pose === 'idle') gsap.fromTo(el, { scaleY: .97 }, { scaleY: 1, duration: .18, ease: 'power2.out' }); }, 3800);
    const tip = setInterval(() => { if (!busy && pose === 'idle' && !bubble) hubieSays(['Feeling lucky?', 'The House is open.', 'Easy money.'][Math.floor(Math.random() * 3)], 'react', 1600); }, 14000);
    return () => { br.kill(); clearInterval(bl); clearInterval(tip); }; }, [loaded, pose, busy, bubble]);
  useEffect(() => { if (hubRef.current) gsap.fromTo(hubRef.current, { rotate: -5, scale: .92 }, { rotate: 0, scale: 1, duration: .45, ease: 'back.out(3)' }); }, [pose]);
  useEffect(() => { if (auto > 0 && !busy && !overlay && !big && !cine) { const t = setTimeout(() => { setAuto(a => a - 1); play(0); }, 300); return () => clearTimeout(t); } });
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.code !== 'Space' || ['INPUT', 'SELECT'].includes((e.target as HTMLElement).tagName)) return; e.preventDefault(); spinPress(); };
    addEventListener('keydown', k); return () => removeEventListener('keydown', k); });

  const hubImg = ART(pose === 'idle' ? 'hubie_idle' : pose === 'react' ? 'hubie_react' : pose === 'bonus' ? 'hubie_bonus' : 'hubie_bigwin');
  const bubT = useRef(0);
  function hubieSays(t: string, p: Pose = 'react', ms = 1500) { setBubble(t); setPose(p); clearTimeout(bubT.current); bubT.current = window.setTimeout(() => { setBubble(''); setPose(bonusRef.current ? 'bonus' : 'idle'); }, ms); }
  const bonusRef = useRef(false); bonusRef.current = !!bonus;
  const tap = () => new Promise<void>(r => { tapWait.current = () => { tapWait.current = null; sfx.click(); r(); }; });

  function spinPress() {
    if (tapWait.current) { tapWait.current(); return; }
    if (board.current?.spinning) { board.current.quickStop(); return; }
    if (bonusSpinWait.current) { bonusSpinWait.current(); return; }
    if (!busy && !overlay) play(0);
  }

  async function rollWin(to: number, dur = .8) { await wait(40); const el = winNum.current; if (!el) return; const o = { v: 0 };
    gsap.to(o, { v: to, duration: turboRef.current ? dur * .4 : dur, ease: 'power1.out', onUpdate: () => { el.textContent = usd(o.v); if (Math.random() < .3) sfx.tick(); } }); }

  /** Presents one spin of a round on the board. Returns the spin's win in x bet. */
  async function present(sp: Spin, antic: boolean, keep?: number[]) {
    const b = board.current!; const turboNow = turboRef.current;
    setMsg({ t: sp.free ? 'GOOD LUCK' : 'GOOD LUCK' }); sfx.spinStart();
    await b.spin(sp, { turbo: turboNow, antic, keep });
    setTension(false);
    if (sp.enh.length) { setMsg({ t: 'TIP OFF', k: 'feat' }); await b.enhancers(sp.enh); }
    for (let r = 0; r < 5; r++) if (sp.wild[r]) { const isNew = !keep || !keep[r] || sp.newWilds[r] > 0;
      if (isNew) { setMsg({ t: `SHOVE WILD x${sp.wild[r]}`, k: 'feat' }); hubieSays('Shove it!', 'react', 1100); }
      await b.shove(r, sp.wild[r], isNew); }
    if (await b.crackSafes(sp)) { setMsg({ t: `SAFECRACK: ${NAMES[sp.safeSym].toUpperCase()}`, k: 'feat' }); }
    if (sp.free && sp.heat !== (bonusHeat.current)) { bonusHeat.current = sp.heat; sfx.heat(); setBonus(bn => bn ? { ...bn, heat: sp.heat } : bn); }
    if (sp.win > 0) {
      b.showWins(sp); sfx.win(sp.win);
      const parts = [sp.dirty > 1 ? `CASH x${sp.dirty}` : '', sp.free && sp.heat > 1 ? `HEAT x${sp.heat}` : ''].filter(Boolean).join(' · ');
      setMsg({ t: 'WIN', k: 'win' + (parts ? ' ' + parts : '') }); rollWin(sp.win * betRef.current);
      if (sp.win >= 5) hubieSays(sp.win >= 15 ? 'Now we are talking!' : 'Nice cut.', 'react', 1500);
      await T(sp.win >= 5 ? 1100 : 700);
    } else if (!sp.scatters || sp.scatters < 3) setMsg({ t: sp.free ? 'NO WIN' : 'SPIN AGAIN' });
    if (sp.free && sp.scatters) { setMsg({ t: `+${sp.scatters} SPIN${sp.scatters > 1 ? 'S' : ''}`, k: 'feat' }); await T(500); }
    return sp.win;
  }
  const bonusHeat = useRef(1);

  async function cinematic(kind: 'in' | 'out', tier: Tier, total?: number) {
    setCine({ kind, tier, total }); kind === 'in' ? sfx.bonus() : sfx.bigWin();
    await wait(80);
    if (kind === 'out' && total != null) { const el = document.querySelector('.cine-total'); const o = { v: 0 }; gsap.to(o, { v: total * betRef.current, duration: 1.6, ease: 'power2.out', onUpdate: () => { if (el) el.textContent = usd(o.v); } }); }
    await tap(); setCine(null); await wait(50);
  }

  async function bigWin(x: number) {
    const amt = x * betRef.current; setBig({ x, amount: amt }); setPose('bigwin'); sfx.bigWin(); await wait(60);
    const f = fx.current; let skip = false; tapWait.current = () => { skip = true; };
    const steps = BIG.filter(b => x >= b.x); const el = bigNum.current; const title = document.querySelector('.bw-title') as HTMLElement | null;
    let from = 0;
    for (let i = 0; i < steps.length && !skip; i++) {
      const to = i + 1 < steps.length ? BIG[i + 1].x * betRef.current : amt;
      if (title) { title.textContent = BIG[i].t; title.dataset.t = String(i); gsap.fromTo(title, { scale: 2.2, opacity: 0 }, { scale: 1, opacity: 1, duration: .45, ease: 'back.out(2.5)' }); }
      sfx.tierUp(i); if (f) { f.shower = 1 + i * 2; f.burst(30 + i * 30, innerWidth / 2, innerHeight * .45, ['coin', 'spark'], 1 + i * .3); }
      gsap.fromTo('.bw-hubie', { scale: .8 + i * .05 }, { scale: 1 + i * .08, duration: .5, ease: 'back.out(3)' });
      document.querySelector('.bigwin')?.setAttribute('data-t', String(i));
      const o = { v: from }; await new Promise<void>(res => { const tw = gsap.to(o, { v: to, duration: 1.8, ease: 'none', onUpdate: () => { if (el) el.textContent = usd(o.v); if (skip) { tw.kill(); res(); } if (Math.random() < .25) sfx.coin(); }, onComplete: () => res() }); });
      from = to;
    }
    const last = steps.length - 1; if (title) { title.textContent = BIG[last].t; title.dataset.t = String(last); } document.querySelector('.bigwin')?.setAttribute('data-t', String(last));
    if (el) { el.textContent = usd(amt); gsap.fromTo(el, { scale: 1.3 }, { scale: 1, duration: .4, ease: 'back.out(3)' }); }
    if (f) f.shower = 1 + last * 2;
    document.querySelector('.bw-hint')!.textContent = 'TAP TO COLLECT';
    await tap(); if (f) f.shower = 0; setBig(null); setPose(bonusRef.current ? 'bonus' : 'idle');
  }

  async function play(buyTier: number) {
    if (busy || !board.current) return; startAmbient();
    const tier = buyTier ? TIERS[buyTier - 1] : null; const b = betRef.current; const cost = tier ? tier.buy * b : b;
    if (balance < cost) { setMsg({ t: 'INSUFFICIENT BALANCE', k: 'warn' }); setAuto(0); return; }
    setBusy(true); setBalance(x => x - cost); setLastWin(0); if (winNum.current) winNum.current.textContent = usd(0);
    const n = nonce; setNonce(n + 1); post('roundStart', { bet: b, cost, buyTier, nonce: n, serverSeedHash: hash, clientSeed });
    const round: Round = await resolveRound(serverSeed, clientSeed, n, src => playRound(src, buyTier));
    let shown = 0;
    if (!buyTier) shown += await present(round.spins[0], true);
    if (round.tier) {
      const t = round.tier;
      if (!buyTier) { setMsg({ t: `${round.spins[0].scatters} KEYS`, k: 'feat' }); hubieSays('We are in!', 'bonus', 1400); board.current.shake(8); await T(1100); }
      await cinematic('in', t);
      const free = round.spins.filter(s => s.free); bonusHeat.current = t.heat;
      setBonus({ tier: t, left: t.spins, heat: t.heat, total: shown, waiting: true }); setPose('bonus'); board.current.setSkin(true); document.body.classList.add('in-bonus');
      let sticky = [0, 0, 0, 0, 0];
      for (const sp of free) {
        if (!bAutoRef.current) { setBonus(bn => bn && { ...bn, waiting: true }); setMsg({ t: 'PRESS SPIN', k: 'feat' }); await new Promise<void>(r => { bonusSpinWait.current = () => { bonusSpinWait.current = null; r(); }; }); }
        else await T(350);
        setBonus(bn => bn && { ...bn, waiting: false, left: Math.max(0, bn.left - 1) });
        shown += await present(sp, false, t.sticky ? sticky : undefined);
        if (t.sticky) sticky = sp.wild.slice();
        setBonus(bn => bn && { ...bn, left: sp.spinsLeft, total: Math.min(MAX_WIN, shown) });
        if (shown >= MAX_WIN) { setMsg({ t: `MAX WIN ${MAX_WIN.toLocaleString()}x`, k: 'win' }); break; }
      }
      board.current.clearWins();
      await cinematic('out', t, round.total);
      setBonus(null); setBAuto(false); board.current.setSkin(false); document.body.classList.remove('in-bonus'); setPose('idle');
      await wait(300);
    }
    const tot = round.total;
    if (tot >= BIG[0].x) await bigWin(tot);
    setBalance(x => x + tot * b); setLastWin(tot * b); if (winNum.current) winNum.current.textContent = usd(tot * b);
    if (tot > 0) setMsg({ t: 'TOTAL WIN', k: 'win' }); 
    setHist(h => [{ nonce: n, bet: b, win: tot * b, buy: buyTier, spins: round.spins.length }, ...h].slice(0, 30));
    post('roundEnd', { nonce: n, bet: b, cost, win: tot * b, multiplier: tot, buyTier, spins: round.spins.length });
    setBusy(false);
  }
  async function rotate() { setRevealed(r => [{ seed: serverSeed, hash, clientSeed, last: nonce - 1 }, ...r]); setServerSeed(nextSeed); setNextSeed(randomServerSeed()); setNonce(1); }
  const betIdx = BETS.indexOf(bet);

  // Showcase helpers (only with ?showcase)
  async function demo(kind: string) {
    if (busy || !board.current) return; setBusy(true); startAmbient();
    try {
      if (kind.startsWith('big')) await bigWin([25, 80, 400, 2400][+kind.slice(3)]);
      if (kind === 'antic') { const sp = demoCache.antic ??= findSpin(s => s.scatters === 2 && s.scatterReels[0] === 0 && s.scatterReels[1] === 1); await present(sp, true); }
      if (kind === 'win') { const sp = demoCache.win ??= findSpin(s => s.wins.length >= 2 && s.win >= 2 && s.win < 15 && !s.wild.some(Boolean)); await present(sp, true); }
      if (kind === 'wild') { const sp = demoCache.wild ??= findSpin(s => s.wild.some(w => w >= 3) && s.win > 0 && s.win < 15); await present(sp, true); }
      if (kind.startsWith('intro')) await cinematic('in', TIERS[+kind.slice(5)]);
    } finally { setBusy(false); }
  }

  return <div className={`app ${bonus ? 'bonus' : ''}`}>
    <div className="bg" style={{ backgroundImage: `url(${ART(bonus ? 'bonus_bg' : 'bg')})` }} />
    <canvas ref={fxRef} className={`fx ${big ? 'top' : ''}`} />
    <div className="game">
      <header className="top">
        <div className="hubie"><img ref={hubRef} src={hubImg} alt="Hubie" />{bubble && <div className="bubble" key={bubble}>{bubble}</div>}</div>
        <img className="logo" src={ART('logo')} alt="Crooked House: Hubie's Last Job" />
      </header>
      {bonus && <div className="bonus-hud">
        <div className="bh-box"><label>SPINS LEFT</label><b>{bonus.left}</b></div>
        <div className="bh-heat"><label>HEAT {bonus.tier.sticky ? '· STICKY WILDS' : ''}</label><div className="heat-bar"><i style={{ width: `${Math.min(100, (bonus.heat / 20) * 100)}%` }} /></div><b className="heat-x" key={bonus.heat}>x{bonus.heat}</b></div>
        <div className="bh-box"><label>BONUS WIN</label><b>{usd(bonus.total * bet)}</b></div>
      </div>}
      <div className="board-wrap"><div className="board" ref={boardEl} onClick={() => board.current?.spinning && board.current.quickStop()} /></div>
      <div className={`msgbar ${msg.k?.split(' ')[0] ?? ''}`} key={msg.t + msg.k}>
        {msg.k?.startsWith('win') ? <><span className="m-l">{msg.t}</span><span className="m-amt" ref={winNum}>{usd(lastWin)}</span>{msg.k.length > 3 && <span className="m-sub">{msg.k.slice(4)}</span>}</> : <span>{msg.t}</span>}
      </div>
      <footer className="hud">
        <div className="hud-row info">
          <div className="meter"><label>BALANCE</label><b>{usd(balance)}</b></div>
          <div className="bet">
            <button aria-label="Lower bet" disabled={busy || betIdx <= 0} onClick={() => { sfx.click(); setBet(BETS[betIdx - 1]); post('bet', { bet: BETS[betIdx - 1] }); }}><svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="2.6" rx="1.3" fill="currentColor" /></svg></button>
            <div className="meter"><label>BET</label><b>{usd(bet)}</b></div>
            <button aria-label="Raise bet" disabled={busy || betIdx >= BETS.length - 1} onClick={() => { sfx.click(); setBet(BETS[betIdx + 1]); post('bet', { bet: BETS[betIdx + 1] }); }}><svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="2.6" rx="1.3" fill="currentColor" /><rect x="10.7" y="5" width="2.6" height="14" rx="1.3" fill="currentColor" /></svg></button>
          </div>
          <div className="meter r"><label>WIN</label><b>{usd(lastWin)}</b></div>
        </div>
        <div className="hud-row ctl">
          <button className="ic" aria-label="Game guide" onClick={() => { sfx.click(); setOverlay('info'); }}><svg viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" /></svg></button>
          <button className="ic" aria-label="Sound" onClick={() => setMute(m => !m)}><svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" />{mute ? <path d="M16 9l5 6M21 9l-5 6" stroke="currentColor" strokeWidth="2" /> : <path d="M16 8a5 5 0 0 1 0 8M18.5 5.5a8.5 8.5 0 0 1 0 13" stroke="currentColor" strokeWidth="2" fill="none" />}</svg></button>
          <button className={`ic ${turbo ? 'on' : ''}`} aria-label="Turbo" onClick={() => { sfx.click(); setTurbo(t => !t); }}><svg viewBox="0 0 24 24"><path d="M13 2L4 14h7l-1 8 9-12h-7z" fill="currentColor" /></svg></button>
          <button className={`spin ${busy && !bonus?.waiting ? 'busy' : ''}`} aria-label="Spin" onClick={spinPress}>
            <svg viewBox="0 0 24 24"><path d="M12 4a8 8 0 1 0 7.4 5h-2.2A6 6 0 1 1 12 6v3l4-4-4-4z" fill="currentColor" /></svg></button>
          {bonus ? <button className={`ic auto ${bAuto ? 'on' : ''}`} aria-label="Auto spin bonus" onClick={() => { setBAuto(a => !a); bonusSpinWait.current?.(); }}>AUTO</button>
            : <button className={`ic auto ${auto ? 'on' : ''}`} aria-label="Autoplay" onClick={() => setAuto(a => a ? 0 : 25)}>{auto ? auto : 'AUTO'}</button>}
          <button className="ic buy" aria-label="Bonus buy" disabled={busy} onClick={() => { sfx.click(); setOverlay('buy'); }}>BUY</button>
          <button className="ic" aria-label="Provably fair" onClick={() => setOverlay('fair')}><svg viewBox="0 0 24 24"><path d="M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5z" fill="none" stroke="currentColor" strokeWidth="2" /><path d="M8 12l3 3 5-6" stroke="currentColor" strokeWidth="2.2" fill="none" /></svg></button>
        </div>
      </footer>
    </div>

    {SHOWCASE && <div className="showcase"><b>SHOWCASE</b>
      {['Big', 'Mega', 'Crooked', 'Kingpin'].map((t, i) => <button key={t} onClick={() => demo('big' + i)}>{t}</button>)}
      <button onClick={() => demo('antic')}>Anticipation</button><button onClick={() => demo('win')}>Win</button><button onClick={() => demo('wild')}>Shove Wild</button>
      {TIERS.map((t, i) => <button key={t.id} onClick={() => demo('intro' + i)}>Intro {t.name}</button>)}</div>}

    {overlay === 'loading' && <div className="ov loading"><img src={ART('logo')} className="load-logo" /><div className="load-bar"><i style={{ width: `${loaded * 100}%` }} /></div><small>LOADING THE JOB {Math.round(loaded * 100)}%</small></div>}

    {overlay === 'intro' && <div className="ov intro" onClick={() => { startAmbient(); sfx.click(); setOverlay(null); }}>
      <div className="intro-box">
        <div className="intro-head"><img className="intro-hubie" src={ART('hubie_idle')} /><img className="intro-logo" src={ART('logo')} /></div>
        <p className="story">Hubie ran the House for years. Tonight he and a crew nobody trusts crack the city vault.</p>
        <div className="feats">
          <div><img src={IMG(S.WILD)} /><p><b>SHOVE WILDS</b><span>Fill the reel, x1 to x4. Multipliers multiply.</span></p></div>
          <div><img src={IMG(S.SAFE)} /><p><b>SAFECRACK</b><span>Safes crack into 2 to 4 stacked symbols.</span></p></div>
          <div><img src={IMG(S.SCAT)} /><p><b>TIP OFF CELLS</b><span>1 to 2 Keys unlock Wilds, Safes or Cash x2 to x5. 3 Keys or more start a bonus.</span></p></div></div>
        <div className="intro-meta">243 ways · RTP 96% · Max win {MAX_WIN.toLocaleString()}x</div>
        <button className="cta">START THE JOB</button></div></div>}

    {cine && <div className={`cine ${cine.kind} t${cine.tier.id}`} onClick={() => tapWait.current?.()}>
      <div className="c-bg" style={{ backgroundImage: `url(${ART('bonus_intro')})` }} /><div className="c-rays" /><div className="c-vig" />
      <img className="c-hubie" src={ART(cine.kind === 'in' ? 'hubie_bonus' : 'hubie_bigwin')} />
      <div className="c-content">
        <small className="c-kicker">{cine.kind === 'in' ? 'BONUS UNLOCKED' : 'JOB DONE'}</small>
        <h1 className="c-title">{cine.tier.name}</h1>
        {cine.kind === 'in' ? <ul className="c-rules">{TIER_RULES[cine.tier.id - 1].map(r => <li key={r}>{r}</li>)}</ul>
          : <><div className="c-sub">TOTAL HAUL</div><div className="cine-total">{usd(0)}</div></>}
        <div className="c-tap">{cine.kind === 'in' ? 'TAP TO START' : 'TAP TO CONTINUE'}</div>
      </div></div>}

    {big && <div className="bigwin" data-t="0" onClick={() => tapWait.current?.()}>
      <div className="bw-rays" /><img className="bw-hubie" src={ART('hubie_bigwin')} />
      <div className="bw-text"><div className="bw-title">BIG WIN</div><div className="bw-amt" ref={bigNum}>{usd(0)}</div><div className="bw-x">{big.x.toLocaleString('en-US', { maximumFractionDigits: 2 })}x BET</div><div className="bw-hint">TAP TO SKIP</div></div></div>}

    {overlay === 'buy' && <div className="ov modal-wrap" onClick={() => setOverlay(null)}><div className="modal" onClick={e => e.stopPropagation()}>
      <div className="m-head"><h2>BONUS BUY</h2><button className="x" aria-label="Close" onClick={() => setOverlay(null)}><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" /></svg></button></div>
      <p className="mut">Buy straight into the job at {usd(bet)} bet. Every option returns about 96%.</p>
      <div className="buy-grid">{TIERS.map(t => <button key={t.id} className={`buy-card t${t.id}`} disabled={balance < t.buy * bet}
        onClick={() => { sfx.click(); setOverlay(null); play(t.id); }}>
        <div className="keys">{Array.from({ length: t.id + 2 }, (_, i) => <img key={i} src={IMG(S.SCAT)} />)}</div>
        <div className="bc-txt"><b>{t.name}</b><span>{TIER_RULES[t.id - 1][0]} · {TIER_RULES[t.id - 1][1]}</span></div>
        <div className="bc-price"><em>{usd(t.buy * bet)}</em><small>{t.buy}x bet</small></div></button>)}</div></div></div>}

    {overlay === 'info' && <div className="ov modal-wrap" onClick={() => setOverlay(null)}><div className="modal wide" onClick={e => e.stopPropagation()}>
      <div className="m-head"><h2>GAME GUIDE</h2><button className="x" aria-label="Close" onClick={() => setOverlay(null)}><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" /></svg></button></div>
      <div className="tabs">{['Paytable', 'Features', 'Bonuses', 'Rules'].map((t, i) => <button key={t} className={tab === i ? 'on' : ''} onClick={() => setTab(i)}>{t}</button>)}</div>
      <div className="m-body">
      {tab === 0 && <><p className="mut">Pay per way at {usd(bet)} bet. Wins pay left to right on adjacent reels.</p>
        <div className="pay-grid">{PAYING.map(s => <div key={s} className={`pay ${s <= 6 ? 'high' : ''}`}><img src={IMG(s)} /><div><b>{NAMES[s]}</b>{PAYS[s].map((p, i) => <span key={i}>{i + 3} reels <em>{usd(p / COINS * bet)}</em></span>).reverse()}</div></div>)}</div></>}
      {tab === 1 && <div className="rules">
        <p><img src={IMG(S.WILD)} /><span><b>Shove Wild.</b> Lands on reels 2 to 5 and shoves to fill the reel, adding 1 per shove (x1 to x4). Substitutes for every paying symbol and counts as one way times its multiplier. Wild multipliers in the same win multiply together.</span></p>
        <p><img src={IMG(S.SAFE)} /><span><b>Safecrack.</b> Lands on reels 2 to 4 and cracks into a stack of 2 to 4 copies of one paying symbol. All safes on a spin reveal the same symbol.</span></p>
        <p><img src={IMG(S.SCAT)} /><span><b>Tip off cells.</b> 1 or 2 Keys open the cell above their reel and reveal a Shove Wild, a Safe, or Cash x{DIRTY.join(', x')} on that spin's win.</span></p></div>}
      {tab === 2 && <div className="rules">{TIERS.map(t => <p key={t.id}><span className="kk">{t.id + 2} <img src={IMG(S.SCAT)} /></span><span><b>{t.name}.</b> {TIER_RULES[t.id - 1].join('. ')}. Buy price {t.buy}x bet.</span></p>)}</div>}
      {tab === 3 && <div className="rules"><p><span>5 reels, 3 rows, 243 base ways. Max win {MAX_WIN.toLocaleString()}x bet; the round ends when it is reached. Theoretical RTP 96.1% (5M round simulation), bonus buys about 96%. Volatility very high. Hit rate about 38.7%. Results come from the provably fair HMAC SHA256 seed system (shield button). A malfunction voids all pays and plays. 18+. Play responsibly.</span></p></div>}
      </div></div></div>}

    {overlay === 'fair' && <div className="ov modal-wrap" onClick={() => setOverlay(null)}><div className="modal wide" onClick={e => e.stopPropagation()}>
      <div className="m-head"><h2>PROVABLY FAIR</h2><button className="x" aria-label="Close" onClick={() => setOverlay(null)}><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" /></svg></button></div>
      <div className="m-body">
      <p className="mut">Round = HMAC SHA256(key = server seed, msg = <code>clientSeed:nonce:block</code>). Spin k of a round reads blocks 8k to 8k+7 (64 floats, big endian u32 divided by 2^32). This is the Housebets House Games scheme.</p>
      <label>Active server seed hash</label><code>{hash}</code><label>Next server seed hash</label><code>{nextHash}</code>
      <label>Client seed</label><input value={clientSeed} maxLength={64} disabled={busy} onChange={e => { setClientSeed(e.target.value.replace(/[^\x21-\x7e]/g, '')); setNonce(1); }} />
      <label>Next nonce</label><code>{nonce}</code>
      <button className="pill" disabled={busy} onClick={rotate}>Rotate seed pair and reveal</button>
      {revealed.map((r, i) => <div key={i} className="rev"><div>Seed <code>{r.seed}</code></div><div>Client seed {r.clientSeed} · nonces 1 to {r.last}</div></div>)}
      <Verifier prefill={revealed[0]} />
      <h3>History</h3>
      <table><thead><tr><th>Nonce</th><th>Type</th><th>Cost</th><th>Spins</th><th>Win</th></tr></thead>
        <tbody>{hist.map((h, i) => <tr key={i}><td>{h.nonce}</td><td>{h.buy ? 'Buy ' + TIERS[h.buy - 1].name : 'Spin'}</td><td>{usd(h.buy ? TIERS[h.buy - 1].buy * h.bet : h.bet)}</td><td>{h.spins}</td><td>{usd(h.win)}</td></tr>)}</tbody></table></div></div></div>}
  </div>;
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
    {out && <div className="vout"><div>SHA256(seed) = <code>{out.h}</code></div>
      <div className="vmini">{out.r.spins[0].grid.map((c, r) => <div key={r}>{c.map((x, i) => <img key={i} src={IMG(x.s === S.SAFE ? x.reveal! : x.s)} />)}</div>)}</div>
      <div>{out.r.spins.length} spin(s){out.r.tier ? ` · ${out.r.tier.name}` : ''} · total <b>{out.r.total.toFixed(2)}x bet</b>{out.r.capped ? ' (max win)' : ''}</div></div>}
  </div>;
}
