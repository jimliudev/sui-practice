module anchorstone::roof_token {
    use sui::coin::{Self, TreasuryCap};

    /// One-Time-Witness for ROOF token
    public struct ROOF_TOKEN has drop {}

    /// Initialize function called once when module is published
    fun init(witness: ROOF_TOKEN, ctx: &mut TxContext) {
        let (treasury_cap, metadata) = coin::create_currency(
            witness,
            6, // decimals
            b"ROOF",
            b"RWA Fractional Token",
            b"Fractional ownership token for real-world assets",
            option::none(),
            ctx
        );

        // Freeze metadata so it's immutable
        transfer::public_freeze_object(metadata);
        
        // Transfer treasury cap to the deployer
        // The deployer can then use this to create vaults
        transfer::public_transfer(treasury_cap, tx_context::sender(ctx));
    }
}

