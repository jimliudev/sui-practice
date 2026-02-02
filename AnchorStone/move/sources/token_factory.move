module anchorstone::token_factory {
    use std::string::{String};
    use sui::coin::TreasuryCap;
    use sui::event;
    use sui::table::{Self, Table};

    // ====== Error Codes ======
    const EInvalidDecimals: u64 = 1;
    const ETokenAlreadyExists: u64 = 3;

    // ====== Structs ======

    /// One-Time-Witness for the factory
    public struct TOKEN_FACTORY has drop {}

    /// Registry to track all created tokens
    public struct TokenRegistry has key {
        id: UID,
        // Map from property_id to token_manager_id
        tokens: Table<ID, ID>,
        total_tokens_created: u64,
    }

    /// Manager for a specific property's token
    /// Tracks token metadata and statistics (does NOT hold TreasuryCap)
    public struct TokenManager has key, store {
        id: UID,
        property_id: ID,
        property_name: String,
        token_name: String,
        token_symbol: String,
        decimals: u8,
        // Collateral information
        collateral_amount: u64,  // Amount of collateral (e.g., USDC, SUI)
        collateral_type: String,  // Type name for display (e.g., "USDC", "SUI")
        created_at: u64,
        creator: address,
    }

    // ====== Events ======

    public struct TokenManagerCreated has copy, drop {
        manager_id: ID,
        property_id: ID,
        property_name: String,
        token_name: String,
        token_symbol: String,
        creator: address,
    }

    // ====== Init Function ======

    /// Initialize the token registry
    fun init(_witness: TOKEN_FACTORY, ctx: &mut TxContext) {
        let registry = TokenRegistry {
            id: object::new(ctx),
            tokens: table::new(ctx),
            total_tokens_created: 0,
        };
        transfer::share_object(registry);
    }

    // ====== Public Functions ======

    /// Register a token manager for a pre-deployed token
    /// This does NOT create a new coin, it only registers an existing one
    /// Can only be called from within the anchorstone package
    public(package) fun register_token_manager<T>(
        registry: &mut TokenRegistry,
        treasury_cap: TreasuryCap<T>,
        property_id: ID,
        property_name: String,
        token_name: String,
        token_symbol: String,
        decimals: u8,
        collateral_amount: u64,
        collateral_type: String,
        ctx: &mut TxContext
    ): TreasuryCap<T> {
        // Check if token already exists for this property
        assert!(!table::contains(&registry.tokens, property_id), ETokenAlreadyExists);
        assert!(decimals <= 18, EInvalidDecimals);

        // Create token manager (only metadata, no coin creation)
        let manager = TokenManager {
            id: object::new(ctx),
            property_id,
            property_name,
            token_name,
            token_symbol,
            decimals,
            collateral_amount,
            collateral_type,
            created_at: tx_context::epoch_timestamp_ms(ctx),
            creator: tx_context::sender(ctx),
        };

        // Register in the registry
        table::add(&mut registry.tokens, property_id, object::id(&manager));
        registry.total_tokens_created = registry.total_tokens_created + 1;

        // Emit event
        event::emit(TokenManagerCreated {
            manager_id: object::id(&manager),
            property_id,
            property_name: manager.property_name,
            token_name: manager.token_name,
            token_symbol: manager.token_symbol,
            creator: manager.creator,
        });

        // Transfer manager to creator for record keeping
        transfer::public_transfer(manager, tx_context::sender(ctx));

        // Return treasury_cap for vault creation
        treasury_cap
    }


    /// Get token manager info
    public fun get_manager_info(manager: &TokenManager): (ID, String, String, String, u8, u64, String, address) {
        (
            manager.property_id,
            manager.property_name,
            manager.token_name,
            manager.token_symbol,
            manager.decimals,
            manager.collateral_amount,
            manager.collateral_type,
            manager.creator
        )
    }

    /// Get registry stats
    public fun get_registry_stats(registry: &TokenRegistry): u64 {
        registry.total_tokens_created
    }

    /// Check if token exists for property
    public fun token_exists(registry: &TokenRegistry, property_id: ID): bool {
        table::contains(&registry.tokens, property_id)
    }
}
