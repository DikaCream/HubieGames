// Provably fair RNG matching Housebets' House Games spec:
// bytes = HMAC_SHA256(key=serverSeed, msg=`${clientSeed}:${nonce}:${block}`), u32 big endian / 2^32.
import { FLOATS_PER_SPIN } from './engine';
const enc = new TextEncoder();
const hex = (b:ArrayBuffer)=>[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('');
export async function sha256Hex(s:string){ return hex(await crypto.subtle.digest('SHA-256', enc.encode(s))); }
export function randomServerSeed(){ const a=new Uint8Array(32); crypto.getRandomValues(a); return hex(a.buffer); }
export function randomClientSeed(){ const a=new Uint8Array(8); crypto.getRandomValues(a); return hex(a.buffer); }
/** Floats for spins 0..n-1 of a round. Spin k uses blocks 8k..8k+7. */
export async function roundFloats(serverSeed:string, clientSeed:string, nonce:number, nSpins:number){
  const key = await crypto.subtle.importKey('raw', enc.encode(serverSeed), {name:'HMAC',hash:'SHA-256'}, false, ['sign']);
  const blocks = nSpins*FLOATS_PER_SPIN/8;
  const bufs = await Promise.all(Array.from({length:blocks},(_,b)=>crypto.subtle.sign('HMAC', key, enc.encode(`${clientSeed}:${nonce}:${b}`))));
  const all:number[] = [];
  for (const buf of bufs){ const v=new DataView(buf); for(let i=0;i<32;i+=4) all.push(v.getUint32(i,false)/2**32); }
  return (k:number)=>{ if(k>=nSpins) throw new Error('extend'); return all.slice(k*FLOATS_PER_SPIN,(k+1)*FLOATS_PER_SPIN); };
}
/** Lazily extends if a round needs more spins than prefetched. */
export async function resolveRound<T>(serverSeed:string, clientSeed:string, nonce:number, play:(src:(k:number)=>number[])=>T):Promise<T>{
  for (let n=40;;n*=5){ const src=await roundFloats(serverSeed,clientSeed,nonce,n); try { return play(src); } catch(e){ if((e as Error).message!=='extend'||n>=200) throw e; } }
}
