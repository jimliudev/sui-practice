/**
 * Vault Registry
 * 
 * 管理 DeepBook Pool 與 Vault 的映射關係
 * 支援查詢 floor price 以觸發自動回購
 */

// 存儲結構
// poolId -> { vaultId, floorPrice, balanceManagerId, coinType, ... }
const poolToVaultMap = new Map();

// vaultId -> { poolId, ... }
const vaultToPoolMap = new Map();

/**
 * VaultRegistry Class
 * 
 * 管理所有 Vault 和 DeepBook Pool 的映射
 */
class VaultRegistry {
    constructor() {
        this.poolToVault = new Map();
        this.vaultToPool = new Map();
    }

    /**
     * 註冊 Pool 到 Vault 的映射
     * 
     * @param {string} poolId - DeepBook Pool ID
     * @param {object} vaultInfo - Vault 資訊
     * @param {string} vaultInfo.vaultId - Vault ID
     * @param {string} vaultInfo.balanceManagerId - Balance Manager ID (可選，但回購需要)
     * @param {string} vaultInfo.coinType - Token 類型
     * @param {number} vaultInfo.floorPrice - 最低價格 (USDC, 6 decimals)
     * @param {number} vaultInfo.minBuybackAmount - 最低回購金額 (USDC)
     * @param {string} vaultInfo.owner - Vault owner 地址
     */
    registerPool(poolId, vaultInfo) {
        const { vaultId, balanceManagerId, coinType, floorPrice, minBuybackAmount, owner } = vaultInfo;

        if (!vaultId) {
            throw new Error('vaultId is required for pool registration');
        }

        const entry = {
            vaultId,
            poolId,
            balanceManagerId: balanceManagerId || null,
            coinType: coinType || null,
            floorPrice: floorPrice || 1_000_000, // 預設 1 USDC
            minBuybackAmount: minBuybackAmount !== undefined ? minBuybackAmount : null, // 最低回購金額
            owner: owner || null,
            lastTradePrice: 0,
            buybackCount: 0,
            totalBuybackAmount: 0,
            registeredAt: new Date().toISOString(),
        };

        this.poolToVault.set(poolId, entry);
        this.vaultToPool.set(vaultId, entry);

        const floorPriceDisplay = ((entry.floorPrice || 0) / 1_000_000).toFixed(6);
        console.log(`\n📝 [VaultRegistry] Pool Registered`);
        console.log(`   Pool ID: ${poolId.substring(0, 20)}...`);
        console.log(`   Vault ID: ${vaultId.substring(0, 20)}...`);
        
        if (balanceManagerId) {
            console.log(`   💼 Balance Manager: ${balanceManagerId.substring(0, 20)}... ✅`);
        } else {
            console.log(`   💼 Balance Manager: NOT PROVIDED ⚠️`);
            console.log(`   ⚠️  Warning: Without Balance Manager, buyback cannot be executed!`);
        }
        
        if (coinType) {
            console.log(`   🪙 Coin Type: ${coinType.split('::').pop()}`);
        } else {
            console.log(`   🪙 Coin Type: Not specified`);
        }
        
        if (owner) {
            console.log(`   👤 Owner: ${owner.substring(0, 20)}...`);
        }
        
        console.log(`   🛡️  Floor Price: ${floorPriceDisplay} USDC`);
        
        if (entry.minBuybackAmount !== null && entry.minBuybackAmount !== undefined) {
            console.log(`   💰 Min Buyback: ${entry.minBuybackAmount} USDC`);
        } else {
            console.log(`   💰 Min Buyback: Not set (will use global or 0)`);
        }
        
        console.log(`   💡 Will ${balanceManagerId ? 'trigger' : 'detect (but cannot execute)'} buyback when price < ${floorPriceDisplay} USDC\n`);

        return entry;
    }

    /**
     * 通過 Pool ID 獲取 Vault 資訊
     * 
     * @param {string} poolId - Pool ID
     * @returns {object|null} Vault 資訊
     */
    getVaultByPoolId(poolId) {
        return this.poolToVault.get(poolId) || null;
    }

    /**
     * 通過 Vault ID 獲取 Pool 資訊
     * 
     * @param {string} vaultId - Vault ID
     * @returns {object|null} Pool 資訊
     */
    getPoolByVaultId(vaultId) {
        return this.vaultToPool.get(vaultId) || null;
    }

    /**
     * 獲取 Pool 的 floor price
     * 
     * @param {string} poolId - Pool ID
     * @returns {number|null} Floor price (6 decimals)
     */
    getFloorPrice(poolId) {
        const entry = this.poolToVault.get(poolId);
        return entry ? entry.floorPrice : null;
    }

    /**
     * 更新最後成交價
     * 
     * @param {string} poolId - Pool ID
     * @param {number} price - 成交價 (6 decimals)
     */
    updateLastTradePrice(poolId, price) {
        const entry = this.poolToVault.get(poolId);
        if (entry) {
            entry.lastTradePrice = price;
            console.log(`📈 Updated last trade price for Pool ${poolId.substring(0, 16)}...: ${price / 1_000_000} USDC`);
        }
    }

    /**
     * 記錄回購
     * 
     * @param {string} poolId - Pool ID
     * @param {number} amount - 回購金額 (6 decimals)
     */
    recordBuyback(poolId, amount) {
        const entry = this.poolToVault.get(poolId);
        if (entry) {
            entry.buybackCount += 1;
            entry.totalBuybackAmount += amount;
            console.log(`💰 Recorded buyback for Pool ${poolId.substring(0, 16)}...: ${amount / 1_000_000} USDC (Total: ${entry.buybackCount})`);
        }
    }

    /**
     * 檢查是否應該觸發回購
     * 
     * @param {string} poolId - Pool ID
     * @param {number} currentPrice - 當前價格 (6 decimals)
     * @returns {boolean} 是否需要回購
     */
    shouldBuyback(poolId, currentPrice) {
        const floorPrice = this.getFloorPrice(poolId);
        if (floorPrice === null) return false;
        return currentPrice < floorPrice;
    }

    /**
     * 獲取所有註冊的 Pool
     * 
     * @returns {Array} Pool 列表
     */
    getAllPools() {
        return Array.from(this.poolToVault.values());
    }

    /**
     * 獲取所有需要監控的 Pool ID
     * 
     * @returns {Array<string>} Pool ID 列表
     */
    getMonitoredPoolIds() {
        return Array.from(this.poolToVault.keys());
    }

    /**
     * 從 JSON 載入狀態
     * 
     * @param {object} data - JSON 數據
     */
    loadFromJSON(data) {
        if (data && data.pools) {
            for (const entry of data.pools) {
                this.poolToVault.set(entry.poolId, entry);
                this.vaultToPool.set(entry.vaultId, entry);
            }
            console.log(`📂 Loaded ${data.pools.length} pool(s) from storage`);
        }
    }

    /**
     * 導出為 JSON
     * 
     * @returns {object} JSON 數據
     */
    toJSON() {
        return {
            pools: Array.from(this.poolToVault.values()),
            exportedAt: new Date().toISOString(),
        };
    }

    /**
     * 獲取統計資訊
     * 
     * @returns {object} 統計數據
     */
    getStats() {
        const pools = this.getAllPools();
        return {
            totalPools: pools.length,
            totalBuybacks: pools.reduce((sum, p) => sum + p.buybackCount, 0),
            totalBuybackAmount: pools.reduce((sum, p) => sum + p.totalBuybackAmount, 0),
        };
    }
}

// 創建單例
const vaultRegistry = new VaultRegistry();

export { VaultRegistry, vaultRegistry };
export default vaultRegistry;
