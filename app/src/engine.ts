// HOUSE RULES: pure deterministic game math, shared by UI, simulator and the contract draft.
// A round = 1 base spin (or a bought trigger spin) + all free spins it triggers. Spin k of a round
// consumes 96 floats = HMAC blocks 12k..12k+11 of the same (serverSeed, clientSeed, nonce).
export const REELS = 5, ROWS = 5, FLOATS_PER_SPIN = 96, BLOCKS_PER_SPIN = 12, MAX_WIN = 50_000, MAX_SPINS = 300, MULT_CAP = 256, MAX_RUNNERS = 5;
export const S = { WILD: 0, KEY: 1, DWILD: 2, SPLIT: 3, EXPAND: 4, MYST: 5 } as const;
export const SYM = ['wild', 'key', 'dwild', 'split', 'expand', 'mystery', 'h1', 'h2', 'h3', 'h4', 'l1', 'l2', 'l3', 'l4'] as const;
export const NAMES = ['Boss Wild', 'House Key', 'Double Wild', 'Double Down', 'Stack Up', 'Sealed Tip', 'The Croupier', 'Big Lou', 'Madame Jade', 'Ratchet', 'Chips', 'Dice', 'Cards', 'Cocktail'];
export const PAYING = [6, 7, 8, 9, 10, 11, 12, 13];
export const PREMIUM = [6, 7, 8, 9];
const WEIGHTS = [4, 5, 6, 7, 10, 11, 12, 13]; const WSUM = WEIGHTS.reduce((a, b) => a + b, 0);
/** Total bet = COINS coins; pays are coins per way for 3, 4, 5 reels. */
export const COINS = 20;
export const PAYS: Record<number, [number, number, number]> = {
  6: [18, 54, 180], 7: [14, 40, 125], 8: [11, 32, 90], 9: [9, 25, 68], 10: [4, 8, 20], 11: [3, 7, 17], 12: [3, 6, 14], 13: [2, 5, 11],
};
export const MYSTERY_MULTS = [2, 2, 3, 3, 4, 5, 5, 8, 10, 20];
/** Vault cell reveal weights: premium, Boss Wild, Double Down, Stack Up. */
export interface Mode { keyP: number; dwildP: number; splitP: number; cellW: [number, number, number, number] }
export const BASE: Mode = { keyP: 0.079, dwildP: 0.028, splitP: 0, cellW: [38, 20, 25, 17] };
export interface Tier { id: 1 | 2 | 3; name: string; spins: number; runners: number; buy: number; mode: Mode }
export const TIERS: Tier[] = [
  { id: 1, name: 'AFTER HOURS', spins: 8, runners: 1, buy: 74, mode: { keyP: 0.03, dwildP: 0.05, splitP: 0.078, cellW: [38, 20, 25, 17] } },
  { id: 2, name: 'MIDNIGHT RUN', spins: 10, runners: 2, buy: 357, mode: { keyP: 0.03, dwildP: 0.04, splitP: 0.055, cellW: [38, 20, 25, 17] } },
  { id: 3, name: 'HOUSE TAKEOVER', spins: 10, runners: 3, buy: 1650, mode: { keyP: 0.03, dwildP: 0.04, splitP: 0.065, cellW: [38, 20, 25, 17] } },
];
export interface Cell { s: number; x?: number }
export interface Reveal { reel: number; row: number; cell: Cell }
export interface Runner { r: number; row: number; m: number; doubled: boolean; from?: { r: number; row: number } }
export interface Win { sym: number; len: number; ways: number; pay: number; mult: number }
export interface Spin {
  grid: (Cell | null)[][]; reveals: Reveal[]; split: boolean[]; runners: Runner[]; wins: Win[]; ways: number; win: number;
  keys: number; keyReels: number[]; free: boolean; spinsLeft: number; marked: { sym: number; mult: number } | null; addRunner: boolean; addSpins: number;
}
export interface Round { spins: Spin[]; total: number; tier: Tier | null; capped: boolean; bought: boolean; marked: { sym: number; mult: number } | null }

const pickPay = (f: number) => { let x = f * WSUM; for (let i = 0; i < 8; i++) { x -= WEIGHTS[i]; if (x < 0) return PAYING[i]; } return 13; };
function pickCell(f: number, g: number, w: Mode['cellW']): Cell {
  const t = w[0] + w[1] + w[2] + w[3]; let x = f * t;
  if ((x -= w[0]) < 0) return { s: PREMIUM[Math.floor(g * 4)] };
  if ((x -= w[1]) < 0) return { s: S.WILD };
  if ((x -= w[2]) < 0) return { s: S.SPLIT };
  return { s: S.EXPAND, x: PAYING[Math.floor(g * 8)] };
}

function spinOnce(f: number[], m: Mode, opt: { free: boolean; runners: Runner[]; marked: Spin['marked']; forceKeys?: number; spinsLeft: number }): Spin {
  const grid: (Cell | null)[][] = []; const keyReels: number[] = []; const reveals: Reveal[] = [];
  for (let r = 0; r < REELS; r++) {
    const col: (Cell | null)[] = [null];
    for (let row = 0; row < 3; row++) col.push({ s: pickPay(f[r * 3 + row]) });
    col.push(null); grid.push(col);
  }
  // House Keys (max one per reel)
  let keyOn = [0, 1, 2, 3, 4].map(r => f[15 + r] < m.keyP);
  if (opt.forceKeys) { const order = [0, 1, 2, 3, 4].sort((a, b) => f[72 + a] - f[72 + b]); keyOn = [0, 1, 2, 3, 4].map(r => order.indexOf(r) < opt.forceKeys!); }
  for (let r = 0; r < REELS; r++) if (keyOn[r]) { grid[r][1 + Math.floor(f[20 + r] * 3)] = { s: S.KEY }; keyReels.push(r); }
  // Double Wild on reels 2 to 4
  for (let r = 1; r <= 3; r++) if (f[25 + r] < m.dwildP) { const row = 1 + Math.floor(f[30 + r] * 3); if (grid[r][row]!.s !== S.KEY) grid[r][row] = { s: S.DWILD }; }
  const keys = keyReels.length;
  // Vault cells: 1 or 2 Keys (any keys in the bonus) open both cells on their reels.
  const opens = (keys > 0 && keys < 3) || (opt.free && keys > 0);
  if (opens && !opt.forceKeys) for (const r of keyReels) for (const [row, b] of [[0, 35], [4, 37]] as const) {
    const c = pickCell(f[b + r * 4], f[b + 1 + r * 4], m.cellW); grid[r][row] = c; reveals.push({ reel: r, row, cell: c }); }
  // Bonus: a Double Down can break open a top vault cell by itself.
  if (opt.free) for (let r = 0; r < REELS; r++) if (!grid[r][0] && f[55 + r] < m.splitP) { const c = { s: S.SPLIT }; grid[r][0] = c; reveals.push({ reel: r, row: 0, cell: c }); }
  const split = grid.map(col => col.some(c => c && (c.s === S.SPLIT || c.s === S.DWILD)));
  // Runners (roaming wilds) move to new cells every spin; on a split reel their multiplier doubles and is kept.
  const runners: Runner[] = []; const taken = new Set<number>();
  opt.runners.forEach((rn, i) => {
    let idx = Math.floor(f[60 + i * 2] * 15); while (taken.has(idx)) idx = (idx + 1) % 15; taken.add(idx);
    const r = Math.floor(idx / 3), row = 1 + (idx % 3); let mm = rn.m, doubled = false;
    if (split[r] && mm < MULT_CAP) { mm = Math.min(MULT_CAP, mm * 2); doubled = true; }
    runners.push({ r, row, m: mm, doubled, from: { r: rn.r, row: rn.row } });
  });
  const runAt = (r: number, row: number) => runners.find(x => x.r === r && x.row === row);
  const cellW = (r: number, row: number, s: number) => {
    const rn = runAt(r, row); if (rn) return rn.m;
    const c = grid[r][row]; if (!c) return 0; const k = split[r] ? 2 : 1;
    if (c.s === s) return k; if (c.s === S.WILD) return 1; if (c.s === S.DWILD) return 2; if (c.s === S.EXPAND && c.x === s) return 4 * k; return 0;
  };
  let ways = 1;
  for (let r = 0; r < REELS; r++) { let v = 0; for (let row = 0; row < ROWS; row++) { const c = grid[r][row]; if (!c && !runAt(r, row)) continue;
    if (runAt(r, row) || !c) { v += 1; continue; }
    v += c.s === S.SPLIT ? 0 : c.s === S.DWILD ? 2 : c.s === S.EXPAND ? 4 * (split[r] ? 2 : 1) : c.s === S.WILD || c.s === S.KEY ? 1 : split[r] ? 2 : 1; } ways *= Math.max(1, v); }
  const wins: Win[] = []; let win = 0;
  for (const s of PAYING) {
    let w = 1, len = 0;
    for (let r = 0; r < REELS; r++) { let v = 0; for (let row = 0; row < ROWS; row++) v += cellW(r, row, s); if (!v) break; w *= v; len++; }
    if (len >= 3) { const mult = opt.marked && opt.marked.sym === s ? opt.marked.mult : 1; const pay = PAYS[s][len - 3] * w / COINS * mult; wins.push({ sym: s, len, ways: w, pay, mult }); win += pay; }
  }
  const addRunner = opt.free && keys >= 2; const addSpins = opt.free ? keys + (keys >= 2 ? 1 : 0) : 0;
  return { grid, reveals, split, runners, wins, ways, win, keys, keyReels, free: opt.free, spinsLeft: opt.spinsLeft, marked: opt.marked, addRunner, addSpins };
}

/** Play a full round. src(k) returns the 96 floats of spin k. buyTier 1 to 3 buys a forced trigger spin. */
export function playRound(src: (k: number) => number[], buyTier = 0): Round {
  const spins: Spin[] = []; let total = 0, k = 0, tier: Tier | null = null, marked: Round['marked'] = null;
  const f0 = src(k++);
  const s0 = spinOnce(f0, BASE, { free: false, runners: [], marked: null, forceKeys: buyTier ? buyTier + 2 : 0, spinsLeft: 0 });
  spins.push(s0); total += s0.win;
  if (s0.keys >= 3) { tier = TIERS[Math.min(5, s0.keys) - 3];
    marked = { sym: PAYING[Math.floor(f0[70] * 8)], mult: MYSTERY_MULTS[Math.floor(f0[71] * MYSTERY_MULTS.length)] }; }
  let capped = total >= MAX_WIN;
  if (tier && !capped) {
    let left = tier.spins; let runners: Runner[] = Array.from({ length: tier.runners }, () => ({ r: 2, row: 2, m: 1, doubled: false }));
    while (left > 0 && k < MAX_SPINS) {
      left--; const f = src(k++);
      const s = spinOnce(f, tier.mode, { free: true, runners, marked, spinsLeft: left });
      left += s.addSpins; s.spinsLeft = left;
      runners = s.runners.map(x => ({ ...x }));
      if (s.addRunner && runners.length < MAX_RUNNERS) runners.push({ r: 2, row: 2, m: 1, doubled: false });
      spins.push(s); total += s.win;
      if (total >= MAX_WIN) { capped = true; break; }
    }
  }
  return { spins, total: Math.min(total, MAX_WIN), tier, capped, bought: !!buyTier, marked };
}
