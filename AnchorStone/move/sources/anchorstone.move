module anchorstone::rwa_vault {
    use std::string::{String};
    use sui::coin::{Self, Coin, TreasuryCap};
    use sui::balance::{Self, Balance};
    use sui::url::{Self, Url};
    use sui::event;

    // ====== Error Codes ======
    const EVaultLiquidating: u64 = 3;
    const ENotOwner: u64 = 4;

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
        // Total number of fractional tokens
        total_fragments: u64,
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
    public fun create_vault<T, FRAC>(
        nft: PropertyNFT,
        treasury_cap: TreasuryCap<FRAC>,
        reserve_coin: Coin<T>,
        total_fragments: u64,
        ctx: &mut TxContext
    ): RwaVault<T, FRAC> {
        let reserve_balance = coin::into_balance(reserve_coin);
        let reserve_amount = balance::value(&reserve_balance);

        let vault = RwaVault<T, FRAC> {
            id: object::new(ctx),
            underlying_nft: nft,
            treasury_cap,
            reserve_funds: reserve_balance,
            total_fragments,
            is_liquidating: false,
            created_at: tx_context::epoch_timestamp_ms(ctx),
            owner: tx_context::sender(ctx),
        };

        event::emit(VaultCreated {
            vault_id: object::id(&vault),
            nft_id: object::id(&vault.underlying_nft),
            total_fragments,
            reserve_amount,
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
            vault.total_fragments,
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
        total_fragments: u64,
        ctx: &mut TxContext
    ) {
        let vault = create_vault(nft, treasury_cap, reserve_coin, total_fragments, ctx);
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
}

