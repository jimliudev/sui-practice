// This is a template file for generating property-specific tokens
// Variables: {{MODULE_NAME}}, {{STRUCT_NAME}}, {{SYMBOL}}, {{TOKEN_NAME}}, {{DESCRIPTION}}

module anchorstone::{{MODULE_NAME}} {
    use sui::coin::{Self, TreasuryCap};

    /// One-Time-Witness for property token
    public struct {{STRUCT_NAME}} has drop {}

    /// Initialize function called once when module is published
    fun init(witness: {{STRUCT_NAME}}, ctx: &mut TxContext) {
        let (treasury_cap, metadata) = coin::create_currency(
            witness,
            6, // decimals
            b"{{SYMBOL}}",
            b"{{TOKEN_NAME}}",
            b"{{DESCRIPTION}}",
            option::none(),
            ctx
        );

        // Freeze metadata so it's immutable
        transfer::public_freeze_object(metadata);
        
        // Transfer treasury cap to the deployer
        // The deployer will use this to create the vault
        transfer::public_transfer(treasury_cap, tx_context::sender(ctx));
    }
}
