# CROOKED HOUSE: Hubie's Last Job
A high volatility, provably fair video slot prototype, ready for onchain settlement, built for the Housebets AI slot grant.

> *The House always wins. Hubie, its loyal host, is done being loyal. Tonight he and a crew nobody trusts crack the city vault.*

Dark, gritty noir heist theme in the Housebets palette: dark teal #0B1920, cyan #02F7FD, mint buttons and gold for wins. Hubie is the Housebets mascot, a smug brown sloth in a top hat, orange tie and gold coin pin.
All art is original and made with AI image generation (`art-src/` holds raw renders, `app/src/art/` holds transparent WebP). No third party slot assets or names are used.

## Cast and symbols
| | Symbol | Role |
|---|---|---|
| Wild | **Hubie** the sloth | Shove Wild |
| Scatter | **Skeleton Key** (a nod to Housebets House Keys) | Tip off cells and bonus trigger |
| Special | **Safe** | Safecrack (stacked symbols) |
| High | The Fixer (fox), Crooked Cop (bulldog), The Safecracker (raccoon), The Driver (weasel) | |
| Low | Brass Knuckles, Lockpicks, Dirty Cash, Dynamite | |

## Mechanics
- **5x3, 243 ways or more.** Pays left to right; ways are the product of matching symbols per reel.
- **Shove Wilds:** Hubie lands on reels 2 to 5 and shoves to fill the reel. Each shove adds +1, so x1 to x4. Several wilds in one win multiply together.
- **Safecrack:** Safes on reels 2 to 4 crack into 2 to 4 stacked copies of one paying symbol, adding ways.
- **Tip off cells:** 1 to 2 Keys in the base game open the locked cell above their reel and reveal a Shove Wild, a Safe, or **Dirty Money** x2, x3 or x5 on that spin.
- **Three bonus tiers** (3, 4 or 5 Keys). Each Key during a bonus adds one spin.
  - **BREAK IN:** 9 spins. Each new Shove Wild adds its multiplier to the persistent **HEAT** multiplier.
  - **INSIDE JOB:** 10 spins. HEAT starts at x2 and a Safe is guaranteed every spin, on any reel.
  - **KINGPIN:** 10 spins. Shove Wilds are **sticky** and keep their multipliers, plus HEAT.
- **Bonus Buy:** 70x, 235x or 1,020x bet, priced at about 96% RTP.
- **Max win 10,000x.** The round ends when it is reached.

## Math (app/sim.ts, results in sim-result.txt)
5,000,000 base rounds plus 1,000,000 bought bonuses per tier. Bonus RTP is computed as bonus EV times exact trigger probability, which has far lower variance than counting bonuses inside the base run.

| Metric | Value |
|---|---|
| Blended RTP | **about 96%** (v5 rerun: 95.9% blended; earlier run 96.1%) |
| Hit rate | 38.7% (most hits pay under 1x, a typical high volatility profile) |
| Bonus frequency | BREAK IN 1 in 248, INSIDE JOB 1 in 5,860, KINGPIN about 1 in 346k |
| Bonus EV | 67.8x, 227.5x, about 980x bet |
| Buy RTP | 96.9%, 96.8%, about 96.5% |
| Max win | 10,000x cap reached (10 cap hits in 5M base rounds; KINGPIN buys hit it about 3% of the time) |
| Std dev per round | about 21x bet (volatility 5 of 5) |

Run: `cd app && npx tsx sim.ts 5000000 x 1000000` (fast PRNG) or `npx tsx sim.ts 1000000 hmac 50000` (real HMAC SHA256 RNG).

## Provably fair
Same as the Housebets House Games scheme: `HMAC_SHA256(key=serverSeed, msg="clientSeed:nonce:block")`, read as big endian u32 divided by 2^32.
A whole round (base spin plus every free spin) uses one nonce; spin k reads blocks 8k to 8k+7 (64 floats). The server seed hash is shown before play, rotating reveals it, and the in game **Verify** panel recomputes any round, bonus buys included.

## Presentation (v5)
- **PixiJS v8 reel engine** (`app/src/board.ts`): full scale motion blur strips, staggered stops with overshoot bounce, a thud and light shake per reel, slams with dust and glow when Keys and Safes land. Timing: normal spin about 1.25s, turbo about 0.5s, tap the board or Spin to quick stop.
- **Anticipation:** once 2 Keys land, the remaining reels slow down, the rest of the board darkens, a cyan frame pulses on the waiting reel and a riser plays.
- **Wins:** winning symbols punch, get a shine sweep and an idle loop; glowing way lines connect them; the amount counts up in the message bar under the grid (never over it). Hubie reacts.
- **Bonus:** full screen cinematic intro (camera push, rays, Hubie slides in, large title and rules, TAP TO START). The bonus has its own background and board skin, a large HUD (spins left, big HEAT meter, bonus win), manual spin or AUTO, and a cinematic outro with the total.
- **Big wins:** Big 15x, Mega 50x, Crooked 200x, Kingpin 1000x. The amount counts up through each tier with stronger rays, coin showers and sound. Tap once to skip, tap again to collect.
- **Hubie:** idle breathing, blink squash, hat tip lines, and react, bonus and big win poses.
- **Showcase:** open with `?showcase` for a bar with buttons for each big win tier, anticipation, a win, a Shove Wild and each bonus intro. Demo spins come from throwaway random seeds and never touch the balance.

## Host integration
The slot is built to run inside the Housebets casino frame (about 650px wide on desktop, full screen on mobile). There is no wallet code; balance and bet belong to the host. `app/src/host.ts` holds a postMessage stub.

Messages from the game to `window.parent` (all carry `source: 'crooked-house'`):

| type | payload |
|---|---|
| `ready` | `balance` |
| `balance` | `balance` after every change |
| `bet` | `bet` when the player changes it |
| `roundStart` | `bet`, `cost`, `buyTier` (0 for a normal spin), `nonce`, `serverSeedHash`, `clientSeed` |
| `roundEnd` | `nonce`, `bet`, `cost`, `win`, `multiplier`, `buyTier`, `spins` |

Messages from the host to the game (all carry `target: 'crooked-house'`):

| type | payload |
|---|---|
| `setBalance` | `balance` |
| `setBet` | `bet` (one of 0.2, 0.4, 1, 2, 4, 10, 20, 50, 100) |
| `pause`, `resume` | none (reserved) |

Example: `iframe.contentWindow.postMessage({ target: 'crooked-house', type: 'setBalance', balance: 250 }, '*')`. In production the host should check `event.origin` and settle rounds server side with the same seeds.

## Code
- `app/src/engine.ts`: pure game math shared by UI and simulator
- `app/src/fair.ts`: HMAC RNG and round resolution
- `app/src/board.ts`: PixiJS reel board and win presentation
- `app/src/App.tsx`, `index.css`: UI, HUD, cinematics, modals; `sound.ts` audio; `fx.ts` full screen coin particles; `host.ts` host messages
- `app/sim.ts`: RTP and volatility simulator; `app/pt.mjs`: Playwright playtest and screenshots
- `contracts/crooked_house/`: Anchor draft (commit and reveal, bonus buy stakes, max win bound, timeout refund). Not audited and not compiled here. Next step: port `engine.ts` to Rust for onchain payout checks.
- Run `cd app && npm i && npm run dev`. Build with `npm run build` (art is inlined into the bundle).

## Grant pitch outline
1. **Gap:** Housebets launched its own Originals (Dice, Mines, Plinko, Blackjack and more) in Oct 2026 but has **no slot of its own**. Slots are the biggest casino vertical, and that volume goes to outside providers today.
2. **Product:** *Crooked House*, a high volatility Housebets Original starring Hubie. Keys tie into House Keys and $HBTS, and it uses the Housebets fairness spec, so it plugs into the existing Verifier.
3. **Proof:** playable build, open math (96% RTP, 10,000x cap, public simulator), onchain settlement draft for Solana.
4. **Speed with AI:** art, math tuning, code and docs were made with AI in days. The same engine can be reskinned into a new themed slot every week.
5. **Roadmap:**
   - Weeks 1 and 2: connect the Housebets wallet, balance API and seed service.
   - Week 3: math certification (exact enumeration plus 100M round simulations) and a regional RTP variant.
   - Week 4: final animation pass and a free demo bonus that leads to signup.
   - Then: one new variant per month.
6. **Ask:** a grant of up to $50k plus a revenue share on the slot's GGR, paid by milestone.

Screenshots: `v5-*.png` (current), older `v3-*.png` and `v4-intro-*.png`.
