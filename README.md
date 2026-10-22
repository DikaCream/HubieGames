# HOUSE RULES: Hubie Owns the Night

A provably fair video slot prototype for the Housebets House Games embed. Hubie the sloth owns the city at night, and everything on the reels is his: the House Token, his top hat, his orange tie, his coin pin, his chips, cufflinks, pocket watch and pen. Hubie himself is the Wild.

## Mechanics
* 5 reels by 3 rows, 243 base ways, up to 2,087,008 with open cells, plus a locked cell above and below every reel.
* Symbols, top to bottom: House Token, Top Hat, Orange Tie, Coin Pin, then Chips, Cufflinks, Pocket Watch, Pen. Hubie Wild, Double Wild, Key, Split and Stack keep their roles.
* Key: 1 or 2 Keys open both locked cells on their reels. A cell reveals a top symbol, a Wild, a Split (every symbol on that reel counts twice) or a Stack (one symbol that counts as 4).
* Double Wild lands on reels 2, 3 and 4, counts as 2 wilds and makes its reel a split reel.
* 3, 4 or 5 Keys start AFTER HOURS (8 spins, 1 Roaming Wild), MIDNIGHT RUN (10 spins, 2 Roaming Wilds) or HOUSE TAKEOVER (10 spins, 3 Roaming Wilds).
* Roaming Wilds move every spin. On a split reel a Roaming Wild doubles its multiplier and keeps it, up to x64.
* Mystery Symbol: when free spins start the Keys flip to show one symbol with a multiplier (x2 to x8) for the whole feature.
* In free spins each Key adds a spin; 2 or more Keys add a Roaming Wild and 1 more spin.
* Hubie's Tip, House Swap and Lucky Cell in the base game; House Meter (up to x5), Double Agent, Hubie's Round and Last Call in free spins. Last Call now fires when the feature has paid under 20x before the final spin, so far fewer features end with almost nothing.
* Max win 10,000x bet. The round ends at the cap.
* Demo balance $10,000, enough to buy HOUSE TAKEOVER at the $1 default bet.

## Big wins (v12)
Any single spin that pays 25x or more, in the base game or inside free spins, opens a full screen celebration. The count climbs through each tier it reaches and the banner, colour, Hubie pose, effects and music change at every threshold. Tap to skip; turbo plays it at about half length.

| Tier | From | Look |
|---|---|---|
| HIGH ROLLER | 25x | gold coin rain, smug Hubie, gold banner |
| HOUSE MONEY | 50x | Hubie throws cash, screen shake, mint banner |
| HUBIE'S HEIST | 150x | the vault blows open, cyan neon banner |
| OWN THE HOUSE | 500x | giant Housebets wordmark, fireworks, peak music |

Bonus end screens use their own Hubie scene (lounge chair for AFTER HOURS, rainy rooftop with a cash briefcase for MIDNIGHT RUN, a throne of chips for HOUSE TAKEOVER), a line from Hubie that depends on the win band, and the tier name as the headline. Results show the amount only.

Debug: `?force=tier` exposes `window.__hrDemo(name)` for forced presentations (`big0` to `big3`, `end<feature><band>`). It is off unless the query parameter is present and never touches the balance or the provably fair rounds. `?showcase` still shows the demo buttons.

## Audio (v12)
Everything is synthesized live with WebAudio in `src/sound.ts`; there are no audio files, so there is nothing to license or credit.
* Tracks: base lounge (88 bpm, 8 bar progression Dm9, G13, Cmaj9, A7b9, Bbmaj7, Gm9, Em7b5, A7 with a walking bass), free spins (104 bpm, Fm9, Db, Ab, Eb, Bbm, Db, C7), one track per big win tier (C major swing at 116, Eb funk at 124, A minor synth at 132, D major anthem at 140 with an 8 bar progression), and a bonus end cadence (Fmaj7, Em7, Dm9, G9sus, Cmaj9) that plays once and hands back to the base track.
* Layers: drums, bass, harmony and lead run on separate buses. Intensity 1 to 3 fades them in; it rises with anticipation in the base game and with the House Meter, multipliers, retriggers and the final spin in free spins.
* Melodies are rebuilt from chord tones every two passes, so the loops do not repeat note for note.
* SFX: separate sounds for small, medium and large hits, multipliers (pitch climbs with the value), retriggers, cell opens, each big win tier and fireworks.

## Math (v12, measured with sim.ts)
| | v11 | v12 |
|---|---|---|
| Base RTP | 96.0% | 95.8% (base spins 61.17% over 6,000,000 rounds plus exact trigger odds times the feature EVs, 34.65%) |
| AFTER HOURS buy 100x | 96.6% | 96.4% (3,000,000 buys) |
| MIDNIGHT RUN buy 400x | 96.8% | 96.0% (2,400,000 buys) |
| HOUSE TAKEOVER buy 2000x | 96.4% | 96.9% (1,000,000 buys) |
| Hit rate | 40.5% | 47.6% |
| Rounds paying 2x to 20x | 1 in 15.8 | 1 in 14.9 |
| Rounds paying 2x or more | 1 in 14.8 | 1 in 13.9 |
| Rounds paying 5x or more | 1 in 40 | 1 in 41 |
| Max win | 50,000x | 10,000x, about 1 in 500,000 base rounds |
| Buys returning under 20% of price (AH / MR / HT) | 37% / 44% / 46% | 12% / 30% / 26% |
| Std dev per base round, bet units | 46.7 | 20.3 |
| Std dev per buy, in bet units (AH / MR / HT) | 550 / 1,948 / 5,569 | 240 / 964 / 2,632 |
| Volatility | extreme | medium high |

* Tuning: symbol weights 4, 5, 6, 7, 15, 16, 17, 18; Tip 6%, Swap 5.5%, Lucky Cell 4%; Roaming Wild cap x64; Mystery multipliers x2 to x8; pay scale base 0.734, AFTER HOURS 0.41, MIDNIGHT RUN 1.038, HOUSE TAKEOVER 2.15.
* HOUSE TAKEOVER reaches the 10,000x cap in about 1 of 17 buys; that is where its extra value sits after the cap came down.
* Raw output in sim-result.txt.

# Provably fair
HMAC SHA256(server seed, `clientSeed:nonce:block`). Spin k of a round uses blocks 12k to 12k+11 (96 floats). One nonce per round. All money is integer cents.

## Host interface (postMessage)
Out: ready, balance, bet, roundStart, roundEnd. In (target `crooked-house`): setBalance, setBet, pause, resume.

## v7 notes
* Bet ladder $0.10 to $20 in 16 steps. Autoplay limits are relative to the balance at start, in multiples of the bet.
* Synthesized soundtrack: base lounge loop at 86 bpm, bonus loop at 100 bpm, separate MUSIC and SOUND toggles, audio starts on the first tap.

## Run
`cd app && npm i && npm run build && npx vite preview --host 127.0.0.1 --port 4180`. Add `?showcase` for demo buttons. Playtest: `node v12.mjs <width> <height> <tag> [spins] [buys]` writes v12 screenshots to the project root.
