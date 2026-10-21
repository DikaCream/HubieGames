// RTP/volatility simulation. `npx tsx sim.ts [rounds] [hmac]`
import { createHmac, randomBytes } from 'node:crypto';
import { BASE, playRound, TIERS, FLOATS_PER_SPIN, BLOCKS_PER_SPIN, MAX_WIN } from './src/engine';
if (process.env.TK) for (const t of TIERS) { t.mode.splitP *= +process.env.TK; t.mode.dwildP *= +process.env.TK; }
const N = Number(process.argv[2]||1_000_000), useHmac = process.argv[3]==='hmac';
let s = (Date.now() ^ 0x9e3779b9)>>>0;
const fast = ()=>{ s^=s<<13; s>>>=0; s^=s>>>17; s^=s<<5; s>>>=0; return s/2**32; };
const seed = randomBytes(32).toString('hex'); let nonce = 0;
const src = (k:number)=>{ if(!useHmac) return Array.from({length:FLOATS_PER_SPIN},fast);
  const out:number[]=[]; for(let b=k*BLOCKS_PER_SPIN;b<(k+1)*BLOCKS_PER_SPIN;b++){ const h=createHmac('sha256',seed).update(`sim:${nonce}:${b}`).digest(); for(let i=0;i<32;i+=4) out.push(h.readUInt32BE(i)/2**32);} return out; };
function run(n:number, buy=0){
  let paid=0, sq=0, hits=0, max=0, caps=0, bonusPaid=0; const trig=[0,0,0]; const buckets=[0,0,0,0,0];
  for(let i=0;i<n;i++){ nonce++; const r=playRound(src,buy); const w=r.total; paid+=w; sq+=w*w; if(w>0) hits++; if(w>max) max=w; if(r.capped) caps++;
    if(r.tier && !buy){ trig[r.tier.id-1]++; bonusPaid+=w-r.spins[0].win; }
    buckets[w>=1000?4:w>=100?3:w>=20?2:w>=5?1:0]++; }
  const rtp=paid/n, sd=Math.sqrt(sq/n-rtp*rtp);
  return {n, rtp:+(rtp*100).toFixed(2), bonusShare:+(bonusPaid/n*100).toFixed(2), hitRate:+(hits/n*100).toFixed(2), maxWinX:+max.toFixed(1), capHits:caps, stdDev:+sd.toFixed(1),
    ci95:+(196*sd/Math.sqrt(n)).toFixed(2), bonus1in: trig.map(t=>t?Math.round(n/t):null), anyBonus1in: Math.round(n/(trig[0]+trig[1]+trig[2]||1)),
    dist:{'<5x':buckets[0],'5 to 20x':buckets[1],'20 to 100x':buckets[2],'100 to 1000x':buckets[3],'1000x+':buckets[4]}};
}
const base = run(N); console.log('BASE GAME (incl. triggered bonuses)', JSON.stringify(base));
const nb = Number(process.argv[4]||Math.max(20000, N/10));
// Low-variance blended estimate: base-spin RTP + sum(trigger prob x bonus EV measured on nb bought bonuses)
let blended = base.rtp - base.bonusShare; const ev:number[]=[];
for (const t of TIERS){ if (process.env.ONLY && +process.env.ONLY!==t.id) continue; const r=run(nb,t.id); ev.push(r.rtp/100);
  const q=BASE.keyP, k=t.id+2, C=[1,5,10,10,5,1][k]; const p = C*q**k*(1-q)**(5-k); // exact trigger probability
  blended += p*r.rtp;
  console.log(`BUY ${t.name} @${t.buy}x: trigger 1 in ${Math.round(1/p)}, avg ${(r.rtp/100).toFixed(1)}x, buy RTP ${(r.rtp/t.buy).toFixed(2)}%, max ${r.maxWinX}x, cap hits ${r.capHits}/${nb}, sd ${r.stdDev}`); }
console.log('Blended RTP estimate', blended.toFixed(2)+'%', '| bonus EVs', ev.map(e=>e.toFixed(1)+'x').join(' / '), '| max win cap', MAX_WIN+'x');
