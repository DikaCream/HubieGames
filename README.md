# HOUSE RULES: Hubie Owns the Night

A provably fair video slot prototype for the Housebets House Games embed. Hubie the sloth owns the city at night; his crew (The Croupier, Big Lou, Madame Jade, Ratchet) runs the tables while the Night Owls try to take over.

## Mechanics
* 5 reels by 3 rows, 243 base ways, up to 2,087,008 with open cells, plus a locked locked cell above and below every reel.
* Key: 1 or 2 Keys open both locked cells on their reels. A cell reveals a crew symbol, a Wild, a Split (every symbol on that reel counts twice) or a Stack (one symbol that counts as 4).
* Double Wild lands on reels 2, 3 and 4, counts as 2 wilds and makes its reel a split reel.
* 3, 4 or 5 Keys start AFTER HOURS (8 spins, 1 Roaming Wild), MIDNIGHT RUN (10 spins, 2 Roaming Wilds) or HOUSE TAKEOVER (10 spins, 3 Roaming Wilds).
* Roaming Wilds move every spin. On a split reel a Roaming Wild doubles its multiplier and keeps it, up to x256.
* Mystery Symbol: when free spins start the Keys flip to show one symbol with a multiplier for the whole feature.
* In free spins each Key adds a spin; 2 or more Keys add a Roaming Wild and 1 more spin.
* Max win 50,000x bet. The round ends at the cap.

## v8 features
* Hubie's Tip (base): Hubie throws 1 to 3 Wilds onto the reels before the win check.
* Owl Raid (base): the Night Owls swap one symbol onto reels 1, 2 and 3 for a sure win.
* Lucky Cell (base): with no Key on screen, one locked cell opens for free.
* House Meter (free spins): starts at x1, +1 per Key, +1 on Hubie's Round halfway, up to x5, multiplies every win.
* Double Agent (free spins): a Roaming Wild that doubles can split in two; the copy starts at x1.
* Last Call (free spins): if the feature paid under 5x before the final spin, reels 2 and 3 turn Wild.
* Retriggers get a celebration; every feature is in `?showcase`. The engine uses floats 77 to 92 of each spin for these, still one nonce per round, and the verifier replays them.

### Math (v9, measured with sim.ts at the final prices)
| Buy | Price | Feature spins | Measured RTP | Rounds simulated | Max win hits |
|---|---|---|---|---|---|
| AFTER HOURS | 100x | 8, 1 Roaming Wild | 96.64% | 5,500,000 | 1 in 17,000 |
| MIDNIGHT RUN | 400x | 10, 2 Roaming Wilds | 96.76% | 3,000,000 | 1 in 1,550 |
| HOUSE TAKEOVER | 2000x | 10, 3 Roaming Wilds | 96.43% | 1,000,000 | 1 in 145 |

* Base game: 96.0% (base spins 61.26% measured over 3,000,000 rounds, plus exact trigger odds times the measured feature values above). The raw 3,000,000 round run including features gave 97.47% with a 95% margin of 6.1 points, so the split figure is the reliable one.
* Hit rate 40.5%, extreme volatility. Free spins 1 in 314 rounds: AFTER HOURS 1 in 324, MIDNIGHT RUN 1 in 8,472, HOUSE TAKEOVER 1 in 554,253 (exact; measured 1 in 326 / 9,259 / 428,571).
* Max win 50,000x, about 1 in 1,500,000 base rounds (2 hits in 3,000,000).
* Tuning: Key chance 7.1% per reel, House Meter cap x5, Double Agent 5%, pay scale per mode (base 0.943, AFTER HOURS 0.579, MIDNIGHT RUN 0.652, HOUSE TAKEOVER 0.945) over a divisor of 21.15 coins.
* Raw output in sim-result.txt.

# Provably fair
HMAC SHA256(server seed, `clientSeed:nonce:block`). Spin k of a round uses blocks 12k to 12k+11 (96 floats). One nonce per round. All money is integer cents.

## Host interface (postMessage)
Out: ready, balance, bet, roundStart, roundEnd. In (target `crooked-house`): setBalance, setBet, pause, resume.

## v7 notes
* Bet ladder $0.10 to $20 in 16 steps. Autoplay limits are relative to the balance at start, in multiples of the bet.
* Synthesized soundtrack: base lounge loop at 86 bpm, bonus loop at 100 bpm, separate MUSIC and SOUND toggles, audio starts on the first tap.

## Run
`cd app && npm i && npm run build && npx vite preview --host 127.0.0.1 --port 4180`. Add `?showcase` for demo buttons. Playtest: `node pt.mjs`.
