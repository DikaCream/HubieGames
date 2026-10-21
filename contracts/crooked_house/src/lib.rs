//! DRAFT (unaudited, not compiled here) — Anchor program for CROOKED HOUSE: Hubie's Last Job.
//!
//! Commit-reveal flow mirroring Housebets' provably-fair spec:
//!  1. `commit_seed(hash)`   house commits sha256(server_seed) for a player session.
//!  2. `place_bet(amount, client_seed, buy_tier)` player escrows stake (bet or bonus-buy price) into the vault; nonce++.
//!  3. `settle(server_seed, payout_x100)` house reveals the seed; program checks sha256(seed) == commitment,
//!     bounds the payout by MAX_WIN and pays from the vault. The full round (base spin + free spins) is a pure
//!     function of (server_seed, client_seed, nonce, buy_tier) — see app/src/engine.ts — so anyone can recompute it.
//!     The revealed seed is emitted on-chain, making a wrong payout publicly provable.
//!     Next step: port engine.ts to Rust (`evaluate_round`) and compute payout on-chain (base spin ≈ 8 HMACs;
//!     bonuses up to ~1,600 HMACs => needs compute-budget batching or a ZK/optimistic proof).
//!  4. `refund` if the house does not settle within TIMEOUT_SLOTS.
use anchor_lang::prelude::*;
use anchor_lang::solana_program::hash::hash;

declare_id!("CrkdHse1111111111111111111111111111111111111");

pub const TIMEOUT_SLOTS: u64 = 1500;
pub const MAX_WIN_X: u64 = 10_000;
/// Bonus buy prices in multiples of bet (BREAK IN, INSIDE JOB, KINGPIN). Must match engine.ts TIERS.
pub const BUY_PRICE_X: [u64; 3] = [70, 235, 1020];
/// Pays per way in coins (total bet = 20 coins) for 3/4/5 of a kind — mirrors engine.ts PAYS.
/// Order: Fixer, Crooked Cop, Safecracker, Driver, Knuckles, Lockpicks, Dirty Cash, Dynamite.
pub const PAYS: [[u16; 3]; 8] = [[15,45,150],[12,30,90],[9,22,60],[9,20,50],[3,7,16],[3,6,12],[2,4,9],[1,3,8]];
pub const COINS: u16 = 20;

#[program]
pub mod crooked_house {
    use super::*;
    pub fn init_config(ctx: Context<InitConfig>) -> Result<()> {
        let c = &mut ctx.accounts.config; c.house = ctx.accounts.house.key(); c.bump = ctx.bumps.config; Ok(())
    }
    pub fn commit_seed(ctx: Context<CommitSeed>, server_seed_hash: [u8; 32]) -> Result<()> {
        let s = &mut ctx.accounts.session;
        require!(s.pending_stake == 0, SlotError::BetPending);
        s.player = ctx.accounts.player.key(); s.server_seed_hash = server_seed_hash; s.nonce = 0; Ok(())
    }
    pub fn place_bet(ctx: Context<PlaceBet>, bet: u64, client_seed: String, buy_tier: u8) -> Result<()> {
        require!(!client_seed.is_empty() && client_seed.len() <= 64, SlotError::BadSeed);
        require!(buy_tier <= 3, SlotError::BadTier);
        let s = &mut ctx.accounts.session;
        require!(s.pending_stake == 0, SlotError::BetPending);
        let stake = if buy_tier == 0 { bet } else { bet.checked_mul(BUY_PRICE_X[(buy_tier - 1) as usize]).ok_or(SlotError::Overflow)? };
        let max_payout = bet.checked_mul(MAX_WIN_X).ok_or(SlotError::Overflow)?;
        require!(ctx.accounts.vault.lamports() >= max_payout, SlotError::VaultTooSmall);
        anchor_lang::system_program::transfer(CpiContext::new(ctx.accounts.system_program.to_account_info(),
            anchor_lang::system_program::Transfer { from: ctx.accounts.player.to_account_info(), to: ctx.accounts.vault.to_account_info() }), stake)?;
        s.nonce += 1; s.pending_stake = stake; s.pending_bet = bet; s.buy_tier = buy_tier;
        s.client_seed = client_seed; s.bet_slot = Clock::get()?.slot;
        emit!(BetPlaced { player: s.player, nonce: s.nonce, bet, stake, buy_tier }); Ok(())
    }
    pub fn settle(ctx: Context<Settle>, server_seed: String, payout_x100: u64) -> Result<()> {
        let s = &mut ctx.accounts.session;
        require!(s.pending_stake > 0, SlotError::NoBet);
        require!(hash(server_seed.as_bytes()).to_bytes() == s.server_seed_hash, SlotError::SeedMismatch);
        require!(payout_x100 <= MAX_WIN_X * 100, SlotError::OverMax);
        let payout = (s.pending_bet as u128 * payout_x100 as u128 / 100) as u64;
        if payout > 0 {
            **ctx.accounts.vault.try_borrow_mut_lamports()? -= payout;
            **ctx.accounts.player.try_borrow_mut_lamports()? += payout;
        }
        emit!(Settled { player: s.player, nonce: s.nonce, server_seed, client_seed: s.client_seed.clone(), buy_tier: s.buy_tier, bet: s.pending_bet, payout });
        s.pending_stake = 0; s.pending_bet = 0; Ok(()) // a new commit_seed is required for the next round (seed rotation)
    }
    pub fn refund(ctx: Context<Refund>) -> Result<()> {
        let s = &mut ctx.accounts.session;
        require!(s.pending_stake > 0 && Clock::get()?.slot > s.bet_slot + TIMEOUT_SLOTS, SlotError::NotExpired);
        **ctx.accounts.vault.try_borrow_mut_lamports()? -= s.pending_stake;
        **ctx.accounts.player.try_borrow_mut_lamports()? += s.pending_stake;
        s.pending_stake = 0; Ok(())
    }
}

#[derive(Accounts)] pub struct InitConfig<'info> {
    #[account(init, payer = house, space = 8 + 32 + 1, seeds = [b"config"], bump)] pub config: Account<'info, Config>,
    #[account(mut)] pub house: Signer<'info>, pub system_program: Program<'info, System> }
#[derive(Accounts)] pub struct CommitSeed<'info> {
    #[account(init_if_needed, payer = house, space = 8 + Session::SIZE, seeds = [b"session", player.key().as_ref()], bump)] pub session: Account<'info, Session>,
    /// CHECK: player pubkey only
    pub player: UncheckedAccount<'info>,
    #[account(mut, address = config.house)] pub house: Signer<'info>, pub config: Account<'info, Config>, pub system_program: Program<'info, System> }
#[derive(Accounts)] pub struct PlaceBet<'info> {
    #[account(mut, seeds = [b"session", player.key().as_ref()], bump, has_one = player)] pub session: Account<'info, Session>,
    #[account(mut)] pub player: Signer<'info>,
    /// CHECK: program-owned vault PDA
    #[account(mut, seeds = [b"vault"], bump)] pub vault: UncheckedAccount<'info>, pub system_program: Program<'info, System> }
#[derive(Accounts)] pub struct Settle<'info> {
    #[account(mut, seeds = [b"session", player.key().as_ref()], bump, has_one = player)] pub session: Account<'info, Session>,
    /// CHECK: receives payout
    #[account(mut)] pub player: UncheckedAccount<'info>,
    /// CHECK: program-owned vault PDA
    #[account(mut, seeds = [b"vault"], bump)] pub vault: UncheckedAccount<'info>,
    #[account(address = config.house)] pub house: Signer<'info>, pub config: Account<'info, Config> }
#[derive(Accounts)] pub struct Refund<'info> {
    #[account(mut, seeds = [b"session", player.key().as_ref()], bump, has_one = player)] pub session: Account<'info, Session>,
    #[account(mut)] pub player: Signer<'info>,
    /// CHECK: program-owned vault PDA
    #[account(mut, seeds = [b"vault"], bump)] pub vault: UncheckedAccount<'info> }

#[account] pub struct Config { pub house: Pubkey, pub bump: u8 }
#[account] pub struct Session { pub player: Pubkey, pub server_seed_hash: [u8; 32], pub client_seed: String, pub nonce: u64, pub pending_stake: u64, pub pending_bet: u64, pub buy_tier: u8, pub bet_slot: u64 }
impl Session { pub const SIZE: usize = 32 + 32 + 4 + 64 + 8 + 8 + 8 + 1 + 8; }
#[event] pub struct BetPlaced { pub player: Pubkey, pub nonce: u64, pub bet: u64, pub stake: u64, pub buy_tier: u8 }
#[event] pub struct Settled { pub player: Pubkey, pub nonce: u64, pub server_seed: String, pub client_seed: String, pub buy_tier: u8, pub bet: u64, pub payout: u64 }
#[error_code] pub enum SlotError { BetPending, NoBet, BadSeed, BadTier, SeedMismatch, VaultTooSmall, NotExpired, Overflow, OverMax }
