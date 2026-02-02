module anchorstone::rwa_vault {
    use std::string::{String};
    use sui::coin::{Self, Coin, TreasuryCap};
    use sui::balance::{Self, Balance};
    use sui::url::{Self, Url};
    use sui::event;
    use anchorstone::token_factory::{Self, TokenRegistry};

    // ====== Error Codes ======
    const EVaultLiquidating: u64 = 3;
    const ENotOwner: u64 = 4;
    const EInsufficientCollateral: u64 = 5;

    // ====== Structs ======

    /// PropertyNFT represents a real-world asset (e.g., real estate)
    public struct PropertyNFT has key, store {
        id: UID,
        name: String,
        description: String,
        image_url: Url,
        property_value: u64,  // Value in USDC (with 6 decimals)
        location: String,
        created_at: u64,
        owner: address,
    }

    /// RwaVault locks the PropertyNFT and manages fractional tokens
    /// T is the reserve coin type (e.g., USDC)
    /// FRAC is the fractional token type
    public struct RwaVault<phantom T, phantom FRAC> has key {
        id: UID,
        // Locked property NFT
        underlying_nft: PropertyNFT,
        // Treasury capability for minting fractional tokens
        treasury_cap: TreasuryCap<FRAC>,
        // Reserve funds (e.g., USDC for market making + liquidation)
        reserve_funds: Balance<T>,
        
        // DeepBook integration fields
        total_token_supply: u64,      // Total fractional token supply
        initial_price: u64,           // Initial listing price on DeepBook (USDC per token, 6 decimals)
        floor_price: u64,             // Minimum buyback price during liquidation (USDC per token, 6 decimals)
        usdc_collateral: u64,         // USDC collateral amount for buyback guarantee
        
        // DeepBook Pool tracking (新增)
        deepbook_pool_id: Option<ID>,      // DeepBook Pool ID
        balance_manager_id: Option<ID>,    // Balance Manager ID
        coin_type_name: Option<String>,    // Token type string for querying
        last_trade_price: u64,             // 最後成交價 (6 decimals)
        buyback_count: u64,                // 回購次數
        total_buyback_amount: u64,         // 總回購金額 (6 decimals)
        
        // Liquidation status
        is_liquidating: bool,
        created_at: u64,
        owner: address,
    }

    // ====== Events ======

    public struct PropertyNFTMinted has copy, drop {
        nft_id: ID,
        name: String,
        property_value: u64,
        owner: address,
    }

    public struct VaultCreated has copy, drop {
        vault_id: ID,
        nft_id: ID,
        total_fragments: u64,
        reserve_amount: u64,
        owner: address,
    }

    public struct TokensMinted has copy, drop {
        vault_id: ID,
        amount: u64,
        recipient: address,
    }

    public struct DeepBookPoolRegistered has copy, drop {
        vault_id: ID,
        pool_id: ID,
        balance_manager_id: ID,
        coin_type_name: String,
    }

    public struct BuybackExecuted has copy, drop {
        vault_id: ID,
        trade_price: u64,
        buyback_amount: u64,
        buyback_count: u64,
    }

    // ====== Public Functions ======

    /// Mint a new PropertyNFT
    public fun mint_property_nft(
        name: String,
        description: String,
        image_url: vector<u8>,
        property_value: u64,
        location: String,
        ctx: &mut TxContext
    ): PropertyNFT {
        let nft = PropertyNFT {
            id: object::new(ctx),
            name,
            description,
            image_url: url::new_unsafe_from_bytes(image_url),
            property_value,
            location,
            created_at: tx_context::epoch_timestamp_ms(ctx),
            owner: tx_context::sender(ctx),
        };

        event::emit(PropertyNFTMinted {
            nft_id: object::id(&nft),
            name: nft.name,
            property_value: nft.property_value,
            owner: nft.owner,
        });

        nft
    }

    /// Create a vault by locking PropertyNFT, creating fractional tokens, and depositing reserve
    /// This function requires a TreasuryCap for the fractional token type to be passed in
    /// Validates that USDC collateral is sufficient for buyback guarantee at floor price
    public fun create_vault<T, FRAC>(
        nft: PropertyNFT,
        treasury_cap: TreasuryCap<FRAC>,
        reserve_coin: Coin<T>,
        total_token_supply: u64,
        initial_price: u64,      // USDC per token (6 decimals)
        floor_price: u64,        // Minimum buyback price (6 decimals)
        ctx: &mut TxContext
    ): RwaVault<T, FRAC> {
        let reserve_balance = coin::into_balance(reserve_coin);
        let usdc_collateral = balance::value(&reserve_balance);

        // Validation: Ensure sufficient collateral for buyback
        // Required collateral = (total_token_supply * floor_price) / 1_000_000
        let required_collateral = (total_token_supply * floor_price) / 1_000_000;
        assert!(usdc_collateral >= required_collateral, EInsufficientCollateral);

        let vault = RwaVault<T, FRAC> {
            id: object::new(ctx),
            underlying_nft: nft,
            treasury_cap,
            reserve_funds: reserve_balance,
            total_token_supply,
            initial_price,
            floor_price,
            usdc_collateral,
            // DeepBook fields - initialized as empty/zero
            deepbook_pool_id: option::none(),
            balance_manager_id: option::none(),
            coin_type_name: option::none(),
            last_trade_price: 0,
            buyback_count: 0,
            total_buyback_amount: 0,
            // Status
            is_liquidating: false,
            created_at: tx_context::epoch_timestamp_ms(ctx),
            owner: tx_context::sender(ctx),
        };

        event::emit(VaultCreated {
            vault_id: object::id(&vault),
            nft_id: object::id(&vault.underlying_nft),
            total_fragments: total_token_supply,
            reserve_amount: usdc_collateral,
            owner: vault.owner,
        });

        vault
    }

    /// Mint fractional tokens from the vault
    public fun mint_tokens<T, FRAC>(
        vault: &mut RwaVault<T, FRAC>,
        amount: u64,
        ctx: &mut TxContext
    ): Coin<FRAC> {
        assert!(!vault.is_liquidating, EVaultLiquidating);
        assert!(tx_context::sender(ctx) == vault.owner, ENotOwner);

        let minted_coin = coin::mint(&mut vault.treasury_cap, amount, ctx);

        event::emit(TokensMinted {
            vault_id: object::id(vault),
            amount,
            recipient: tx_context::sender(ctx),
        });

        minted_coin
    }

    /// Deposit additional reserve coins to vault
    public fun deposit_reserve<T, FRAC>(
        vault: &mut RwaVault<T, FRAC>,
        coin: Coin<T>,
        ctx: &TxContext
    ) {
        assert!(tx_context::sender(ctx) == vault.owner, ENotOwner);
        let balance = coin::into_balance(coin);
        balance::join(&mut vault.reserve_funds, balance);
    }

    /// Get vault information
    public fun get_vault_info<T, FRAC>(vault: &RwaVault<T, FRAC>): (u64, u64, bool, address) {
        (
            vault.total_token_supply,
            balance::value(&vault.reserve_funds),
            vault.is_liquidating,
            vault.owner
        )
    }

    /// Get PropertyNFT information
    public fun get_nft_info(nft: &PropertyNFT): (String, String, u64, String) {
        (
            nft.name,
            nft.description,
            nft.property_value,
            nft.location
        )
    }

    /// Get reserve balance
    public fun get_reserve_balance<T, FRAC>(vault: &RwaVault<T, FRAC>): u64 {
        balance::value(&vault.reserve_funds)
    }

    /// Create vault with a pre-deployed token
    /// This registers the token and creates the vault in one transaction
    public fun create_vault_with_registered_token<T, FRAC>(
        registry: &mut TokenRegistry,
        nft: PropertyNFT,
        treasury_cap: TreasuryCap<FRAC>,
        token_name: String,
        token_symbol: String,
        token_decimals: u8,
        reserve_coin: Coin<T>,
        total_fragments: u64,
        ctx: &mut TxContext
    ): RwaVault<T, FRAC> {
        let nft_id = object::id(&nft);
        let property_name = nft.name;
        
        // Get collateral amount from reserve coin
        let collateral_amount = coin::value(&reserve_coin);
        
        // Get collateral type name
        let collateral_type = std::string::utf8(b"Reserve Coin");

        // Step 1: Register the pre-deployed token
        let treasury_cap = token_factory::register_token_manager(
            registry,
            treasury_cap,
            nft_id,
            property_name,
            token_name,
            token_symbol,
            token_decimals,
            collateral_amount,
            collateral_type,
            ctx
        );

        // Step 2: Create vault with the treasury cap
        // Use initial_price = floor_price = property_value / total_fragments (placeholder)
        let initial_price = 1_000_000; // 1 USDC placeholder
        let floor_price = 800_000;     // 0.8 USDC placeholder
        let vault = create_vault(
            nft,
            treasury_cap,
            reserve_coin,
            total_fragments,
            initial_price,
            floor_price,
            ctx
        );

        vault
    }

    // ====== Entry Functions for Frontend ======

    /// Entry function to mint NFT and transfer to sender
    entry fun mint_nft_entry(
        name: String,
        description: String,
        image_url: vector<u8>,
        property_value: u64,
        location: String,
        ctx: &mut TxContext
    ) {
        let nft = mint_property_nft(
            name,
            description,
            image_url,
            property_value,
            location,
            ctx
        );
        transfer::public_transfer(nft, tx_context::sender(ctx));
    }

    /// Entry function to create vault and share it
    entry fun create_vault_entry<T, FRAC>(
        nft: PropertyNFT,
        treasury_cap: TreasuryCap<FRAC>,
        reserve_coin: Coin<T>,
        total_token_supply: u64,
        initial_price: u64,
        floor_price: u64,
        ctx: &mut TxContext
    ) {
        let vault = create_vault(nft, treasury_cap, reserve_coin, total_token_supply, initial_price, floor_price, ctx);
        transfer::share_object(vault);
    }

    /// Entry function to mint tokens and transfer to sender
    entry fun mint_tokens_entry<T, FRAC>(
        vault: &mut RwaVault<T, FRAC>,
        amount: u64,
        ctx: &mut TxContext
    ) {
        let tokens = mint_tokens(vault, amount, ctx);
        transfer::public_transfer(tokens, tx_context::sender(ctx));
    }

    /// Entry function to create vault with pre-deployed token
    entry fun create_vault_with_token_entry<T, FRAC>(
        registry: &mut TokenRegistry,
        nft: PropertyNFT,
        treasury_cap: TreasuryCap<FRAC>,
        token_name: String,
        token_symbol: String,
        token_decimals: u8,
        reserve_coin: Coin<T>,
        total_fragments: u64,
        ctx: &mut TxContext
    ) {
        let vault = create_vault_with_registered_token(
            registry,
            nft,
            treasury_cap,
            token_name,
            token_symbol,
            token_decimals,
            reserve_coin,
            total_fragments,
            ctx
        );
        
        // Share the vault
        transfer::share_object(vault);
    }

    // ====== DeepBook Integration Functions ======

    /// Register DeepBook pool and balance manager for this vault
    /// Only vault owner can call this
    public fun set_deepbook_pool<T, FRAC>(
        vault: &mut RwaVault<T, FRAC>,
        pool_id: ID,
        bm_id: ID,
        coin_type: String,
        ctx: &TxContext
    ) {
        assert!(tx_context::sender(ctx) == vault.owner, ENotOwner);
        
        vault.deepbook_pool_id = option::some(pool_id);
        vault.balance_manager_id = option::some(bm_id);
        vault.coin_type_name = option::some(coin_type);

        event::emit(DeepBookPoolRegistered {
            vault_id: object::id(vault),
            pool_id,
            balance_manager_id: bm_id,
            coin_type_name: coin_type,
        });
    }

    /// Update last trade price (called by backend listener)
    /// Anyone can update - useful for price feeds
    public fun update_last_trade_price<T, FRAC>(
        vault: &mut RwaVault<T, FRAC>,
        price: u64,
        _ctx: &TxContext
    ) {
        vault.last_trade_price = price;
    }

    /// Record a buyback execution
    /// Only vault owner can record buybacks
    public fun record_buyback<T, FRAC>(
        vault: &mut RwaVault<T, FRAC>,
        trade_price: u64,
        buyback_amount: u64,
        ctx: &TxContext
    ) {
        assert!(tx_context::sender(ctx) == vault.owner, ENotOwner);
        
        vault.buyback_count = vault.buyback_count + 1;
        vault.total_buyback_amount = vault.total_buyback_amount + buyback_amount;
        vault.last_trade_price = trade_price;

        event::emit(BuybackExecuted {
            vault_id: object::id(vault),
            trade_price,
            buyback_amount,
            buyback_count: vault.buyback_count,
        });
    }

    /// Get DeepBook integration info
    public fun get_deepbook_info<T, FRAC>(vault: &RwaVault<T, FRAC>): (
        Option<ID>,    // pool_id
        Option<ID>,    // balance_manager_id
        u64,           // floor_price
        u64,           // last_trade_price
        u64,           // buyback_count
        u64            // total_buyback_amount
    ) {
        (
            vault.deepbook_pool_id,
            vault.balance_manager_id,
            vault.floor_price,
            vault.last_trade_price,
            vault.buyback_count,
            vault.total_buyback_amount
        )
    }

    /// Check if price is below floor price (returns true if buyback should trigger)
    public fun should_buyback<T, FRAC>(vault: &RwaVault<T, FRAC>, current_price: u64): bool {
        current_price < vault.floor_price
    }

    // ====== Entry Functions for DeepBook ======

    /// Entry function to register DeepBook pool
    entry fun set_deepbook_pool_entry<T, FRAC>(
        vault: &mut RwaVault<T, FRAC>,
        pool_id: ID,
        bm_id: ID,
        coin_type: String,
        ctx: &TxContext
    ) {
        set_deepbook_pool(vault, pool_id, bm_id, coin_type, ctx);
    }

    /// Entry function to record buyback
    entry fun record_buyback_entry<T, FRAC>(
        vault: &mut RwaVault<T, FRAC>,
        trade_price: u64,
        buyback_amount: u64,
        ctx: &TxContext
    ) {
        record_buyback(vault, trade_price, buyback_amount, ctx);
    }
}