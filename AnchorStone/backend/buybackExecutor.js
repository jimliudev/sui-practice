/**
 * Buyback Executor
 * 
 * 執行自動回購操作
 * 從 Vault 提取 USDC，在 DeepBook 下市價買單
 */

import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Transaction } from '@mysten/sui/transactions';
import vaultRegistry from './vaultRegistry.js';

// DeepBook Package ID (Testnet)
const DEEPBOOK_PACKAGE_ID = '0xfb28c4cbc6865bd1c897d26aecbe1f8792d1509a20ffec692c800660cbec6982';

// DBUSDC 類型 (Testnet)
const DBUSDC_TYPE = '0xf7152c05930480cd740d7311b5b8b45c6f488e3a53a11c3f74a6fac36a52e0d7::DBUSDC::DBUSDC';

/**
 * BuybackExecutor Class
 * 
 * 負責執行回購交易
 */
class BuybackExecutor {
    /**
     * @param {object} config - 配置
     * @param {string} config.network - 網絡
     * @param {string} config.privateKey - 執行錢包私鑰
     * @param {boolean} config.enabled - 是否啟用
     * @param {number} config.minAmount - 最小回購金額 (USDC)
     */
    constructor(config = {}) {
        this.network = config.network || process.env.NETWORK || 'testnet';
        this.enabled = config.enabled ?? (process.env.BUYBACK_ENABLED === 'true');
        this.minAmount = config.minAmount || parseFloat(process.env.BUYBACK_MIN_AMOUNT) || 1;

        this.client = new SuiClient({ url: getFullnodeUrl(this.network) });

        // 載入執行錢包
        this.keypair = null;
        this.address = null;
        this.loadKeypair(config.privateKey);

        // 執行記錄
        this.executions = [];

        console.log(`💰 BuybackExecutor initialized`);
        console.log(`   Network: ${this.network}`);
        console.log(`   Enabled: ${this.enabled}`);
        console.log(`   Min Amount: ${this.minAmount} USDC`);
        if (this.address) {
            console.log(`   Executor Address: ${this.address.substring(0, 20)}...`);
        }
    }

    /**
     * 載入執行錢包
     */
    loadKeypair(privateKey) {
        const key = privateKey || process.env.EXECUTOR_PRIVATE_KEY || process.env.SUI_PRIVATE_KEY;

        if (!key) {
            console.log('⚠️  No executor private key configured');
            return;
        }

        try {
            if (key.startsWith('suiprivkey')) {
                this.keypair = Ed25519Keypair.fromSecretKey(key);
            } else {
                this.keypair = Ed25519Keypair.fromSecretKey(Buffer.from(key, 'hex'));
            }
            this.address = this.keypair.getPublicKey().toSuiAddress();
        } catch (error) {
            console.error('❌ Failed to load executor keypair:', error.message);
        }
    }

    /**
     * 計算回購數量
     * 
     * @param {string} poolId - Pool ID
     * @param {number} currentPrice - 當前價格 (6 decimals)
     * @param {number} floorPrice - 地板價 (6 decimals)
     * @returns {object} 回購數量計算結果
     */
    calculateBuybackAmount(poolId, currentPrice, floorPrice) {
        const vaultInfo = vaultRegistry.getVaultByPoolId(poolId);
        if (!vaultInfo) {
            return { amount: 0, reason: 'Vault not found' };
        }

        // 價差百分比
        const priceDiff = (floorPrice - currentPrice) / floorPrice;

        // 根據價差決定回購金額 (簡單策略)
        // 價差 < 5%: 回購 10 USDC
        // 價差 5-10%: 回購 50 USDC
        // 價差 > 10%: 回購 100 USDC
        let amount;
        if (priceDiff < 0.05) {
            amount = 10;
        } else if (priceDiff < 0.10) {
            amount = 50;
        } else {
            amount = 100;
        }

        return {
            poolId,
            currentPrice,
            floorPrice,
            priceDiff: (priceDiff * 100).toFixed(2) + '%',
            amount,
            amountRaw: amount * 1_000_000, // 6 decimals
        };
    }

    /**
     * 執行回購
     * 
     * @param {object} params - 回購參數
     * @param {string} params.poolId - Pool ID
     * @param {string} params.vaultId - Vault ID
     * @param {number} params.currentPrice - 當前價格
     * @param {number} params.floorPrice - 地板價
     * @returns {object} 執行結果
     */
    async executeBuyback(params) {
        const { poolId, vaultId, currentPrice, floorPrice } = params;

        console.log('\n🏦 Executing Buyback...');
        console.log(`   Pool: ${poolId?.substring(0, 20)}...`);
        console.log(`   Vault: ${vaultId?.substring(0, 20)}...`);

        // 檢查是否啟用
        if (!this.enabled) {
            console.log('⚠️  Buyback execution is disabled');
            return { success: false, reason: 'Buyback disabled' };
        }

        // 檢查錢包
        if (!this.keypair) {
            console.log('❌ No executor keypair configured');
            return { success: false, reason: 'No keypair' };
        }

        // 計算回購金額
        const calculation = this.calculateBuybackAmount(poolId, currentPrice, floorPrice);
        console.log(`   Price Diff: ${calculation.priceDiff}`);
        console.log(`   Buyback Amount: ${calculation.amount} USDC`);

        if (calculation.amount < this.minAmount) {
            console.log(`⚠️  Buyback amount (${calculation.amount}) below minimum (${this.minAmount})`);
            return { success: false, reason: 'Below minimum amount' };
        }

        try {
            // 構建交易
            const tx = new Transaction();

            // 這裡應該執行實際的市價買單
            // 由於複雜性，這裡只記錄回購意圖
            // 實際實現需要：
            // 1. 從 Vault 提取 USDC
            // 2. 在 DeepBook 下市價買單
            // 3. 將購買的 token 轉回 Vault 或銷毀

            console.log('📝 Simulating buyback (dry run)...');

            // 記錄回購
            const execution = {
                poolId,
                vaultId,
                currentPrice,
                floorPrice,
                amount: calculation.amount,
                amountRaw: calculation.amountRaw,
                executedAt: new Date().toISOString(),
                status: 'simulated', // 'simulated' | 'executed' | 'failed'
            };

            this.executions.push(execution);
            vaultRegistry.recordBuyback(poolId, calculation.amountRaw);

            console.log('✅ Buyback recorded (simulation mode)');

            return {
                success: true,
                execution,
            };

        } catch (error) {
            console.error('❌ Buyback execution failed:', error.message);
            return {
                success: false,
                reason: error.message,
            };
        }
    }

    /**
     * 執行真實的 DeepBook 市價買單
     * 
     * @param {string} poolId - Pool ID
     * @param {string} coinType - Token 類型
     * @param {number} usdcAmount - USDC 金額 (6 decimals)
     * @returns {object} 交易結果
     */
    async executeMarketBuy(poolId, coinType, usdcAmount) {
        if (!this.keypair) {
            throw new Error('No executor keypair');
        }

        console.log('\n📈 Executing Market Buy...');
        console.log(`   Pool: ${poolId?.substring(0, 20)}...`);
        console.log(`   Token Type: ${coinType}`);
        console.log(`   USDC Amount: ${usdcAmount / 1_000_000}`);

        // 獲取 executor 的 USDC coins
        const usdcCoins = await this.client.getCoins({
            owner: this.address,
            coinType: DBUSDC_TYPE,
        });

        if (!usdcCoins.data || usdcCoins.data.length === 0) {
            throw new Error('Executor has no USDC');
        }

        const totalUsdc = usdcCoins.data.reduce((sum, coin) => sum + BigInt(coin.balance), 0n);
        console.log(`   Executor USDC Balance: ${Number(totalUsdc) / 1_000_000}`);

        if (totalUsdc < BigInt(usdcAmount)) {
            throw new Error(`Insufficient USDC: has ${totalUsdc}, need ${usdcAmount}`);
        }

        const tx = new Transaction();

        // 合併 USDC coins
        const [firstCoin, ...restCoins] = usdcCoins.data;
        if (restCoins.length > 0) {
            tx.mergeCoins(
                tx.object(firstCoin.coinObjectId),
                restCoins.map(c => tx.object(c.coinObjectId))
            );
        }

        // 分割所需金額
        const [usdcToSpend] = tx.splitCoins(
            tx.object(firstCoin.coinObjectId),
            [tx.pure.u64(usdcAmount)]
        );

        // 調用 DeepBook swap 函數
        // 注意：這是簡化版本，實際需要根據 DeepBook API
        // tx.moveCall({
        //     target: `${DEEPBOOK_PACKAGE_ID}::clob::swap_exact_quote_for_base`,
        //     typeArguments: [coinType, DBUSDC_TYPE],
        //     arguments: [
        //         tx.object(poolId),
        //         usdcToSpend,
        //         // ... other args
        //     ],
        // });

        console.log('⚠️  Market buy not fully implemented - simulation only');

        return {
            success: false,
            reason: 'Not implemented',
        };
    }

    /**
     * 獲取執行記錄
     */
    getExecutions() {
        return this.executions;
    }

    /**
     * 獲取統計
     */
    getStats() {
        return {
            enabled: this.enabled,
            hasKeypair: !!this.keypair,
            executorAddress: this.address,
            totalExecutions: this.executions.length,
            successfulExecutions: this.executions.filter(e => e.status === 'executed').length,
            simulatedExecutions: this.executions.filter(e => e.status === 'simulated').length,
        };
    }
}

// 創建單例
const buybackExecutor = new BuybackExecutor();

export { BuybackExecutor, buybackExecutor };
export default buybackExecutor;
