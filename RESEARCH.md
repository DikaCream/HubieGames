# Housebets research notes (2026 10 21)

## What it is: Crypto casino + sportsbook, Curaçao Gaming Authority licence OGL/2024/431/0231. Founder: Porchy (@p0rchy on X): "message our founder anytime" transparency pitch.: Value props: rakeback / lossback slider ("Slide to Earn More"), "50% Duel Mode" rakeback toggle, daily cashback, daily reloads, "House Edge, Shared", $5m Wave 2 rewards for "qualifying wallets", mascot/host "Hubie".: House Keys: 50% of wager value is stored as Keys, which convert to the **$HBTS** platform token at a future TGE (buybacks, staking yield, burns, free bet pools). Chain/contract for $HBTS **not published** yet.

## Chain / currencies: Multi coin custodial deposits: BTC, ETH, USDT, USDC, LTC, DOGE, BNB, TRX, SOL, MATIC, SHIB. ETH hot wallet labelled Housebets exists (0x9323…6132).: Wording "qualifying wallets", airdrops + SOL deposits suggest Solana native community, but unconfirmed. A Solana "HBET" token on Meteora is NOT official.: Decision for the prototype: **Solana** (Phantom stub + Anchor program draft), with the RNG and math chain agnostic so an EVM port is trivial.

## Games: Third party slots / live casino / sportsbook (certified RNG providers).: "House Games" / Originals supplied by **Tequity**, launched Oct 7 2026: Dice, Limbo, Mines, Plinko, Keno, Roulette, Coinflip, seven hand Blackjack. RTPs 97.3% to 99.43%. Founder said 2 to 3 new games/week and players may later build their own -> fits the grant (no in house slot yet).

## Provably fair (exact spec, from /legal/fairness rng): serverSeed = 64 hex chars, SHA256 hash shown before betting; clientSeed 1 to 64 visible chars, user editable; nonce starts at 1, increments per round; rotate reveals seed, next pair hash pre shown; each game has its own pair.: Bytes = HMAC SHA256(key=serverSeed, msg=`clientSeed:nonce:block`), block 0,1,2… 32 bytes each; read 4 bytes big endian -> u32 / 2^32 = float.: Our slot uses exactly this scheme so it would plug into their Verifier.

## Visual style: Very dark teal black gradient (#05100f -> #0c2a2a), white geometric sans wordmark, the "H" in bright cyan/aqua (~#19e6e0), metallic teal playing card / 3D renders. Clean, minimal, modern.

## Grant: Tweet: grants up to $50k for individuals with exceptional AI talent to build a slot or acquisition funnel for @housebets, with revenue share.
