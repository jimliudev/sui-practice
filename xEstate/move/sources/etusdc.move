/// eTUSDC - USDC Voucher Token
/// 
/// This module implements a 1:1 redeemable voucher token for USDC.
/// Users can mint eTUSDC by depositing USDC and redeem USDC by burning eTUSDC.
/// Used as the quote currency in DeepBook pools for property tokens.

module xestate::etusdc {
    use sui::coin::{Self, Coin, TreasuryCap};
    use sui::balance::{Self, Balance};
    use sui::url;

    /// One-time witness for the coin
    public struct ETUSDC has drop {}

    /// Treasury that manages eTUSDC minting and USDC reserves
    public struct ETUSDCTreasury has key {
        id: UID,
        treasury_cap: TreasuryCap<ETUSDC>,
        usdc_reserve: Balance<USDC>,
        total_minted: u64,
        total_redeemed: u64,
    }

    /// Placeholder for USDC type (will be replaced with actual USDC type)
    public struct USDC has drop {}

    /// Initialize the eTUSDC token
    fun init(witness: ETUSDC, ctx: &mut TxContext) {
        let (treasury_cap, metadata) = coin::create_currency(
            witness,
            6, // 6 decimals to match USDC
            b"eTUSDC",
            b"Estate USDC Voucher",
            b"1:1 redeemable voucher for USDC, used in real estate token trading",
            option::some(url::new_unsafe_from_bytes(b"https://example.com/etusdc.png")),
            ctx
        );

        // Freeze metadata so it cannot be changed
        transfer::public_freeze_object(metadata);

        // Create and share the treasury
        let treasury = ETUSDCTreasury {
            id: object::new(ctx),
            treasury_cap,
            usdc_reserve: balance::zero(),
            total_minted: 0,
            total_redeemed: 0,
        };

        transfer::share_object(treasury);
    }

    /// Mint eTUSDC by depositing USDC (1:1 ratio)
    public fun mint_etusdc(
        treasury: &mut ETUSDCTreasury,
        usdc: Coin<USDC>,
        ctx: &mut TxContext
    ): Coin<ETUSDC> {
        let usdc_amount = coin::value(&usdc);
        
        // Add USDC to reserve
        balance::join(&mut treasury.usdc_reserve, coin::into_balance(usdc));
        
        // Mint equivalent eTUSDC
        let etusdc = coin::mint(&mut treasury.treasury_cap, usdc_amount, ctx);
        
        // Update stats
        treasury.total_minted = treasury.total_minted + usdc_amount;
        
        etusdc
    }

    /// Redeem USDC by burning eTUSDC (1:1 ratio)
    public fun redeem_usdc(
        treasury: &mut ETUSDCTreasury,
        etusdc: Coin<ETUSDC>,
        ctx: &mut TxContext
    ): Coin<USDC> {
        let etusdc_amount = coin::value(&etusdc);
        
        // Burn eTUSDC
        coin::burn(&mut treasury.treasury_cap, etusdc);
        
        // Withdraw equivalent USDC from reserve
        let usdc_balance = balance::split(&mut treasury.usdc_reserve, etusdc_amount);
        let usdc = coin::from_balance(usdc_balance, ctx);
        
        // Update stats
        treasury.total_redeemed = treasury.total_redeemed + etusdc_amount;
        
        usdc
    }

    /// Get total USDC reserve
    public fun get_reserve_amount(treasury: &ETUSDCTreasury): u64 {
        balance::value(&treasury.usdc_reserve)
    }

    /// Get total minted eTUSDC
    public fun get_total_minted(treasury: &ETUSDCTreasury): u64 {
        treasury.total_minted
    }

    /// Get total redeemed eTUSDC
    public fun get_total_redeemed(treasury: &ETUSDCTreasury): u64 {
        treasury.total_redeemed
    }

    #[test_only]
    public fun init_for_testing(ctx: &mut TxContext) {
        init(ETUSDC {}, ctx);
    }
}
