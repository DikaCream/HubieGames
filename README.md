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

## Math (sim.ts, 2 runs of 2,000,000 base rounds and 300,000 buys per tier)
* Base RTP about 96.5% (runs: 96.77% and 96.20%), hit rate 39.1%, extreme volatility.
* Bonus odds: 1 in 237 / 1 in 5,300 / about 1 in 450,000 base rounds; any bonus 1 in 226.
* Buys: AFTER HOURS 74x (96.6%), MIDNIGHT RUN 357x (96.5%), HOUSE TAKEOVER 1650x (96.6%).
* Max win odds: about 1 in 4,000,000 base rounds; about 1 in 160 HOUSE TAKEOVER buys.
* Raw output in sim-result.txt. Run: `npx tsx sim.ts 2000000 x 300000`.

## Provably fair
HMAC SHA256(server seed, `clientSeed:nonce:block`). Spin k of a round uses blocks 12k to 12k+11 (96 floats). One nonce per round. All money is integer cents.

## Host interface (postMessage)
Out: ready, balance, bet, roundStart, roundEnd. In (target `crooked-house`): setBalance, setBet, pause, resume.

## v7 notes
* Bet ladder $0.10 to $20 in 16 steps. Autoplay limits are relative to the balance at start, in multiples of the bet.
* Synthesized soundtrack: base lounge loop at 86 bpm, bonus loop at 100 bpm, separate MUSIC and SOUND toggles, audio starts on the first tap.

## Run
`cd app && npm i && npm run build && npx vite preview --host 127.0.0.1 --port 4180`. Add `?showcase` for demo buttons. Playtest: `node pt.mjs`.
