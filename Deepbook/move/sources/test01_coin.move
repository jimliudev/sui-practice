/// Test01Coin - 自定義代幣合約
/// 
/// 這是一個標準的 Sui Coin 實現，可用於：
/// 1. 在 DeepBook 創建交易池
/// 2. 作為測試代幣進行交易
/// 
/// 部署後會獲得 TreasuryCap，可用於鑄造新代幣
#[allow(implicit_const_copy, deprecated_usage, lint(public_entry))]
module test01_coin::test01_coin {
    use sui::coin::{Self, TreasuryCap, Coin};
    use sui::url;

    /// 代幣類型標識符 - 這是 OTW (One-Time Witness) 模式
    public struct TEST01_COIN has drop {}

    /// 代幣元數據常量
    const DECIMALS: u8 = 9;  // 9位小數（與 SUI 相同）
    const SYMBOL: vector<u8> = b"T01";
    const NAME: vector<u8> = b"Test01Coin";
    const DESCRIPTION: vector<u8> = b"A test coin for DeepBook trading";
    const ICON_URL: vector<u8> = b"";  // 可選：代幣圖標 URL

    /// 模組初始化函數 - 部署時自動調用
    /// 創建代幣並將 TreasuryCap 發送給部署者
    fun init(witness: TEST01_COIN, ctx: &mut TxContext) {
        let icon_url = if (ICON_URL.length() > 0) {
            option::some(url::new_unsafe_from_bytes(ICON_URL))
        } else {
            option::none()
        };

        let (treasury_cap, metadata) = coin::create_currency<TEST01_COIN>(
            witness,
            DECIMALS,
            SYMBOL,
            NAME,
            DESCRIPTION,
            icon_url,
            ctx
        );

        // 凍結元數據，使其不可更改
        transfer::public_freeze_object(metadata);
        
        // 將 TreasuryCap 發送給部署者
        // 持有 TreasuryCap 的人可以鑄造新代幣
        transfer::public_transfer(treasury_cap, ctx.sender());
    }

    /// 鑄造新代幣
    /// 只有持有 TreasuryCap 的人可以調用
    /// 
    /// @param treasury_cap - 代幣的 TreasuryCap
    /// @param amount - 要鑄造的數量（包含小數位，如 1000000000 = 1 代幣）
    /// @param recipient - 接收者地址
    public entry fun mint(
        treasury_cap: &mut TreasuryCap<TEST01_COIN>,
        amount: u64,
        recipient: address,
        ctx: &mut TxContext
    ) {
        let coin = coin::mint(treasury_cap, amount, ctx);
        transfer::public_transfer(coin, recipient);
    }

    /// 批量鑄造 - 一次鑄造給多個接收者
    public entry fun mint_batch(
        treasury_cap: &mut TreasuryCap<TEST01_COIN>,
        amounts: vector<u64>,
        recipients: vector<address>,
        ctx: &mut TxContext
    ) {
        assert!(amounts.length() == recipients.length(), 0);
        
        let mut i = 0;
        while (i < amounts.length()) {
            let coin = coin::mint(treasury_cap, amounts[i], ctx);
            transfer::public_transfer(coin, recipients[i]);
            i = i + 1;
        };
    }

    /// 銷毀代幣
    /// 只有持有 TreasuryCap 的人可以調用
    public entry fun burn(
        treasury_cap: &mut TreasuryCap<TEST01_COIN>,
        coin: Coin<TEST01_COIN>
    ) {
        coin::burn(treasury_cap, coin);
    }

    /// 獲取代幣總供應量
    public fun total_supply(treasury_cap: &TreasuryCap<TEST01_COIN>): u64 {
        coin::total_supply(treasury_cap)
    }

    // ============ 測試輔助函數 ============

    #[test_only]
    public fun init_for_testing(ctx: &mut TxContext) {
        init(TEST01_COIN {}, ctx);
    }
}
