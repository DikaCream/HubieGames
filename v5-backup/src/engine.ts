// CROOKED HOUSE: pure deterministic game math. Shared by UI, simulator and (mirrored) contract.
// A round = 1 base spin (or a purchased bonus) + all free spins it triggers. Every spin k of a round
// consumes 64 floats = HMAC blocks 8k..8k+7 of the same (serverSeed, clientSeed, nonce).
export const REELS = 5, ROWS = 3, FLOATS_PER_SPIN = 64, MAX_WIN = 10_000, MAX_SPINS = 200;
export const S = { WILD: 0, SCAT: 1, SAFE: 2 } as const;
export const SYM = ['wild','scatter','safe','h1','h2','h3','h4','l1','l2','l3','l4'] as const;
export const NAMES = ['Hubie Shove Wild','Skeleton Key','Safecrack','The Fixer','Crooked Cop','The Safecracker','The Driver','Brass Knuckles','Lockpicks','Dirty Cash','Dynamite'];
export const PAYING = [3,4,5,6,7,8,9,10];
const WEIGHTS = [3,4,5,6,9,10,11,12]; const WSUM = WEIGHTS.reduce((a,b)=>a+b,0);
/** Pay per way in coins for 3/4/5 reels. Total bet = COINS coins. */
export const COINS = 20;
export const PAYS: Record<number,[number,number,number]> = {
  3:[15,45,150], 4:[12,30,90], 5:[9,22,60], 6:[9,20,50], 7:[3,7,16], 8:[3,6,12], 9:[2,4,9], 10:[1,3,8],
};
export const DIRTY = [2,3,5];
export interface Mode { scatP:number; safeP:number; wildP:number; enh:boolean; safeAll:boolean; guaranteeSafe:boolean }
export const BASE: Mode = { scatP:0.078, safeP:0.05, wildP:0.03, enh:true, safeAll:false, guaranteeSafe:false };
export interface Tier { id:1|2|3; name:string; spins:number; heat:number; sticky:boolean; mode:Mode; buy:number }
export const TIERS: Tier[] = [
  { id:1, name:'BREAK IN', spins:9, heat:1, sticky:false, buy:70, mode:{ scatP:0.035, safeP:0.12, wildP:0.08, enh:false, safeAll:false, guaranteeSafe:false } },
  { id:2, name:'INSIDE JOB', spins:10, heat:2, sticky:false, buy:235, mode:{ scatP:0.035, safeP:0.15, wildP:0.09, enh:false, safeAll:true, guaranteeSafe:true } },
  { id:3, name:'KINGPIN', spins:10, heat:1, sticky:true, buy:1020, mode:{ scatP:0.035, safeP:0.08, wildP:0.06, enh:false, safeAll:false, guaranteeSafe:false } },
];
export interface Cell { s:number; size?:number; reveal?:number }
export interface Win { sym:number; len:number; ways:number; pay:number }
export interface Enh { reel:number; kind:'wild'|'safe'|'dirty'; value:number }
export interface Spin { grid:Cell[][]; wild:number[]; wins:Win[]; base:number; dirty:number; heat:number; win:number; scatters:number; scatterReels:number[]; enh:Enh[]; newWilds:number[]; safeSym:number; free:boolean; spinsLeft:number }
export interface Round { spins:Spin[]; total:number; tier:Tier|null; capped:boolean; bought:boolean }

const pickPay = (f:number)=>{ let x=f*WSUM; for(let i=0;i<8;i++){ x-=WEIGHTS[i]; if(x<0) return PAYING[i]; } return 10; };

function spinOnce(f:number[], m:Mode, sticky:number[]|null, heatIn:number, free:boolean, spinsLeft:number):Spin {
  const grid:Cell[][] = []; const wild = [0,0,0,0,0]; const scatterReels:number[] = []; const enh:Enh[] = [];
  const safeSym = PAYING[Math.floor(f[60]*8)]; const safeSize = 2 + Math.floor(f[61]*3);
  for (let r=0;r<REELS;r++){
    const b = 20 + r*8; const col:Cell[] = [];
    for (let row=0;row<ROWS;row++) col.push({ s: pickPay(f[r*4+row]) });
    if (f[b] < m.scatP) { col[Math.floor(f[b+1]*ROWS)] = { s:S.SCAT }; scatterReels.push(r); }
    const safeOk = m.safeAll || (r>=1 && r<=3);
    if (safeOk && f[b+2] < m.safeP) { const row=Math.floor(f[b+3]*ROWS); if (col[row].s!==S.SCAT) col[row] = { s:S.SAFE, size:safeSize, reveal:safeSym }; }
    if (r>=1 && f[b+4] < m.wildP) wild[r] = 1 + Math.floor(f[b+5]*4); // Shove Wild: shoves 0-3 => x1..x4
    grid.push(col);
  }
  if (m.guaranteeSafe && !grid.some(c=>c.some(x=>x.s===S.SAFE))) {
    const r = 1 + Math.floor(f[62]*3), row = Math.floor(f[63]*ROWS);
    if (grid[r][row].s!==S.SCAT) grid[r][row] = { s:S.SAFE, size:safeSize, reveal:safeSym };
  }
  let dirty = 1;
  // Tip off Enhancer cells: 1-2 Keys in base game open the cell above their reel.
  if (m.enh && scatterReels.length>0 && scatterReels.length<3) {
    for (const r of scatterReels) {
      const b = 20 + r*8, t = f[b+6];
      if (t < 0.4 && r>=1) { wild[r] = Math.max(wild[r], 1 + Math.floor(f[b+7]*4)); enh.push({reel:r,kind:'wild',value:wild[r]}); }
      else if (t < 0.8) { const row = grid[r].findIndex(c=>c.s!==S.SCAT); grid[r][row] = { s:S.SAFE, size:safeSize, reveal:safeSym }; enh.push({reel:r,kind:'safe',value:safeSize}); }
      else { const d = DIRTY[Math.floor(f[b+7]*3)]; dirty *= d; enh.push({reel:r,kind:'dirty',value:d}); }
    }
  }
  const newWilds = wild.map((w,r)=> (sticky && sticky[r]) ? 0 : w);
  if (sticky) for (let r=0;r<REELS;r++) if (sticky[r]) wild[r] = Math.max(wild[r], sticky[r]);
  // Wild reels: every non-scatter cell becomes Wild.
  for (let r=0;r<REELS;r++) if (wild[r]) grid[r] = grid[r].map(c=> c.s===S.SCAT ? c : { s:S.WILD });
  const heat = heatIn + (free ? newWilds.reduce((a,w)=>a+w,0) : 0);
  const wins:Win[] = []; let base = 0;
  for (const s of PAYING) {
    let ways = 1, len = 0;
    for (let r=0;r<REELS;r++){
      let v = 0;
      if (wild[r]) v = wild[r]; // a Shove Wild is one reel-tall symbol: 1 way × its multiplier
      else for (const c of grid[r]) v += c.s===s ? 1 : (c.s===S.SAFE && c.reveal===s ? c.size! : 0);
      if (!v) break; ways *= v; len++;
    }
    if (len>=3) { const pay = PAYS[s][len-3]*ways/COINS; wins.push({sym:s,len,ways,pay}); base += pay; }
  }
  const win = base * dirty * (free ? heat : 1);
  return { grid, wild, wins, base, dirty, heat, win, scatters:scatterReels.length, scatterReels, enh, newWilds, safeSym, free, spinsLeft };
}

/** Play a full round. src(k) must return the 64 floats for spin k. buyTier: 1-3 to buy a bonus. */
export function playRound(src:(k:number)=>number[], buyTier=0):Round {
  const spins:Spin[] = []; let total = 0, k = 0; let tier:Tier|null = null;
  if (!buyTier) {
    const s = spinOnce(src(k++), BASE, null, 1, false, 0); spins.push(s); total += s.win;
    if (s.scatters>=3) tier = TIERS[s.scatters-3];
  } else tier = TIERS[buyTier-1];
  let capped = total >= MAX_WIN;
  if (tier && !capped) {
    let left = tier.spins, heat = tier.heat; const sticky = tier.sticky ? [0,0,0,0,0] : null;
    while (left>0 && k<MAX_SPINS) {
      left--;
      const s = spinOnce(src(k++), tier.mode, sticky, heat, true, left);
      heat = s.heat; if (sticky) for (let r=0;r<REELS;r++) sticky[r] = Math.max(sticky[r], s.wild[r]);
      left += s.scatters; s.spinsLeft = left; // each Key in the bonus = +1 spin
      spins.push(s); total += s.win;
      if (total >= MAX_WIN) { capped = true; break; }
    }
  }
  return { spins, total: Math.min(total, MAX_WIN), tier, capped, bought: !!buyTier };
}
