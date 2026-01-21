/// Real Estate Tokenization Platform
/// 
/// This module provides the core functionality for tokenizing real estate:
/// - Company registration
/// - Property NFT creation
/// - Fractional token minting
/// - USDC collateralization
/// - Atomic listing (NFT + tokens + USDC lock in one transaction)

module xestate::real_estate_platform {
    use sui::coin::{Self, Coin, TreasuryCap};
    use sui::balance::{Self, Balance};
    use sui::table::{Self, Table};
    use std::string::{Self, String};
    use sui::event;
    use sui::url::{Self, Url};
    use sui::vec_map::{Self, VecMap};

    /// Placeholder for USDC type
    public struct USDC has drop {}

    /// Error codes
    const E_NOT_REGISTERED: u64 = 1;
    const E_ALREADY_REGISTERED: u64 = 2;
    const E_INSUFFICIENT_USDC: u64 = 3;
    const E_INVALID_TOKEN_AMOUNT: u64 = 4;
    const E_NOT_COMPANY_OWNER: u64 = 5;

    /// Company Registry - stores all registered companies
    public struct CompanyRegistry has key {
        id: UID,
        companies: Table<address, CompanyInfo>,
        total_companies: u64,
    }

    /// Company Information
    public struct CompanyInfo has store {
        name: String,
        registered_at: u64,
        properties: vector<ID>,
        total_properties: u64,
    }

    /// Real Estate NFT - unique token for each property
    public struct RealEstateNFT has key, store {
        id: UID,
        /// Unique property identifier
        property_id: String,
        /// Company that owns this property
        company: address,
        /// Property name
        name: String,
        /// Property description
        description: String,
        /// Location
        location: String,
        /// Metadata URI (IPFS/Walrus)
        metadata_uri: String,
        /// Document URLs (contracts, deeds, etc.)
        documents: vector<String>,
        /// Image URLs
        images: vector<String>,
        /// Total fractional tokens minted
        total_tokens: u64,
        /// Tokens available for sale
        tokens_for_sale: u64,
        /// Creation timestamp
        created_at: u64,
        /// Additional metadata
        extra_metadata: VecMap<String, String>,
    }

    /// Property Token Wrapper - manages fractional tokens for a property
    /// Generic over T which is the specific property token type
    public struct PropertyToken<phantom T> has key {
        id: UID,
        /// Reference to the NFT
        property_nft_id: ID,
        /// Company owner
        company: address,
        /// Treasury cap for minting tokens
        treasury_cap: TreasuryCap<T>,
        /// Locked USDC collateral
        locked_usdc: Balance<USDC>,
        /// Required USDC per token
        usdc_per_token: u64,
        /// DeepBook pool ID (if created)
        pool_id: Option<ID>,
    }

    /// Events
    public struct CompanyRegistered has copy, drop {
        company: address,
        name: String,
        timestamp: u64,
    }

    public struct PropertyListed has copy, drop {
        property_id: ID,
        nft_id: ID,
        company: address,
        name: String,
        total_tokens: u64,
        tokens_for_sale: u64,
        usdc_locked: u64,
        timestamp: u64,
    }

    /// Initialize the platform
    fun init(ctx: &mut TxContext) {
        let registry = CompanyRegistry {
            id: object::new(ctx),
            companies: table::new(ctx),
            total_companies: 0,
        };
        transfer::share_object(registry);
    }

    /// Register a new company
    public entry fun register_company(
        registry: &mut CompanyRegistry,
        name: vector<u8>,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);
        
        // Check if already registered
        assert!(!table::contains(&registry.companies, sender), E_ALREADY_REGISTERED);

        let company_info = CompanyInfo {
            name: string::utf8(name),
            registered_at: tx_context::epoch(ctx),
            properties: vector::empty(),
            total_properties: 0,
        };

        table::add(&mut registry.companies, sender, company_info);
        registry.total_companies = registry.total_companies + 1;

        event::emit(CompanyRegistered {
            company: sender,
            name: string::utf8(name),
            timestamp: tx_context::epoch(ctx),
        });
    }

    /// Create a property NFT and mint fractional tokens atomically
    /// This is the core function that ensures atomicity
    public fun create_property_with_tokens<T>(
        registry: &mut CompanyRegistry,
        witness: T,
        property_id: vector<u8>,
        name: vector<u8>,
        description: vector<u8>,
        location: vector<u8>,
        metadata_uri: vector<u8>,
        documents: vector<String>,
        images: vector<String>,
        total_tokens: u64,
        tokens_for_sale: u64,
        usdc_collateral: Coin<USDC>,
        usdc_per_token: u64,
        decimals: u8,
        symbol: vector<u8>,
        ctx: &mut TxContext
    ): (RealEstateNFT, PropertyToken<T>, Coin<T>) {
        let sender = tx_context::sender(ctx);
        
        // Verify company is registered
        assert!(table::contains(&registry.companies, sender), E_NOT_REGISTERED);
        
        // Verify token amounts
        assert!(tokens_for_sale <= total_tokens, E_INVALID_TOKEN_AMOUNT);
        
        // Verify USDC collateral (must deposit USDC equal to total tokens * usdc_per_token)
        let required_usdc = total_tokens * usdc_per_token;
        assert!(coin::value(&usdc_collateral) >= required_usdc, E_INSUFFICIENT_USDC);

        // Create the NFT
        let nft = RealEstateNFT {
            id: object::new(ctx),
            property_id: string::utf8(property_id),
            company: sender,
            name: string::utf8(name),
            description: string::utf8(description),
            location: string::utf8(location),
            metadata_uri: string::utf8(metadata_uri),
            documents,
            images,
            total_tokens,
            tokens_for_sale,
            created_at: tx_context::epoch(ctx),
            extra_metadata: vec_map::empty(),
        };

        let nft_id = object::id(&nft);

        // Create the fractional token
        let (treasury_cap, metadata) = coin::create_currency(
            witness,
            decimals,
            symbol,
            name,
            description,
            option::none(),
            ctx
        );

        transfer::public_freeze_object(metadata);

        // Mint the total supply
        let minted_tokens = coin::mint(&mut treasury_cap, total_tokens, ctx);

        // Create PropertyToken wrapper
        let property_token = PropertyToken<T> {
            id: object::new(ctx),
            property_nft_id: nft_id,
            company: sender,
            treasury_cap,
            locked_usdc: coin::into_balance(usdc_collateral),
            usdc_per_token,
            pool_id: option::none(),
        };

        let property_token_id = object::id(&property_token);

        // Update company info
        let company_info = table::borrow_mut(&mut registry.companies, sender);
        vector::push_back(&mut company_info.properties, property_token_id);
        company_info.total_properties = company_info.total_properties + 1;

        // Emit event
        event::emit(PropertyListed {
            property_id: property_token_id,
            nft_id,
            company: sender,
            name: string::utf8(name),
            total_tokens,
            tokens_for_sale,
            usdc_locked: required_usdc,
            timestamp: tx_context::epoch(ctx),
        });

        (nft, property_token, minted_tokens)
    }

    /// Set the DeepBook pool ID for a property
    public fun set_pool_id<T>(
        property_token: &mut PropertyToken<T>,
        pool_id: ID,
        ctx: &TxContext
    ) {
        assert!(property_token.company == tx_context::sender(ctx), E_NOT_COMPANY_OWNER);
        property_token.pool_id = option::some(pool_id);
    }

    /// Get company info
    public fun get_company_info(
        registry: &CompanyRegistry,
        company: address
    ): &CompanyInfo {
        table::borrow(&registry.companies, company)
    }

    /// Check if address is registered company
    public fun is_registered_company(
        registry: &CompanyRegistry,
        company: address
    ): bool {
        table::contains(&registry.companies, company)
    }

    /// Getters for RealEstateNFT
    public fun nft_property_id(nft: &RealEstateNFT): &String { &nft.property_id }
    public fun nft_company(nft: &RealEstateNFT): address { nft.company }
    public fun nft_name(nft: &RealEstateNFT): &String { &nft.name }
    public fun nft_description(nft: &RealEstateNFT): &String { &nft.description }
    public fun nft_location(nft: &RealEstateNFT): &String { &nft.location }
    public fun nft_total_tokens(nft: &RealEstateNFT): u64 { nft.total_tokens }
    public fun nft_tokens_for_sale(nft: &RealEstateNFT): u64 { nft.tokens_for_sale }

    /// Getters for PropertyToken
    public fun property_token_nft_id<T>(pt: &PropertyToken<T>): ID { pt.property_nft_id }
    public fun property_token_company<T>(pt: &PropertyToken<T>): address { pt.company }
    public fun property_token_locked_usdc<T>(pt: &PropertyToken<T>): u64 { 
        balance::value(&pt.locked_usdc) 
    }
    public fun property_token_pool_id<T>(pt: &PropertyToken<T>): &Option<ID> { &pt.pool_id }

    #[test_only]
    public fun init_for_testing(ctx: &mut TxContext) {
        init(ctx);
    }
}
