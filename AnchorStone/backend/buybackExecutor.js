/**
 * Buyback Executor
 * 
 * 執行自動回購操作
 * 從 Balance Manager 使用 USDC 在 DeepBook 下市價買單
 */

import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Transaction } from '@mysten/sui/transactions';
import { DeepBookClient } from '@mysten/deepbook-v3';
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
     * @param {string} config.balanceManagerId - Balance Manager ID（用於執行交易）
     * @param {boolean} config.enabled - 是否啟用
     * @param {number} config.minAmount - 最小回購金額 (USDC)
     */
    constructor(config = {}) {
        this.network = config.network || process.env.NETWORK || 'testnet';
        this.enabled = config.enabled ?? (process.env.BUYBACK_ENABLED === 'true');
        this.minAmount = config.minAmount || parseFloat(process.env.BUYBACK_MIN_AMOUNT) || null; // 不设置默认值，从 Pool 配置读取
        this.balanceManagerId = config.balanceManagerId || process.env.BUYBACK_BALANCE_MANAGER_ID;

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
        console.log(`   Balance Manager: ${this.balanceManagerId ? this.balanceManagerId.substring(0, 20) + '...' : 'Not configured'}`);
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
     * @param {string|number} orderQuantity - 訂單數量（9 decimals raw format，可選）
     * @returns {object} 回購數量計算結果
     */
    calculateBuybackAmount(poolId, currentPrice, floorPrice, orderQuantity = null) {
        const vaultInfo = vaultRegistry.getVaultByPoolId(poolId);
        if (!vaultInfo) {
            return { amount: 0, reason: 'Vault not found' };
        }

        // 價差百分比
        const priceDiff = (floorPrice - currentPrice) / floorPrice;

        let quantity;  // token 數量（human readable）
        
        // 優先使用訂單數量（如果提供）
        if (orderQuantity !== null && orderQuantity !== undefined) {
            // orderQuantity 是 9 decimals raw format
            quantity = Number(orderQuantity) / 1_000_000_000;
            console.log(`   💡 Using order quantity: ${quantity.toFixed(6)} tokens (from sell order)`);
        } else {
            // 回退到階梯策略（如果沒有提供訂單數量）
            console.log(`   ⚠️  No order quantity provided, using fallback strategy`);
            if (priceDiff < 0.05) {
                quantity = 100;
            } else if (priceDiff < 0.10) {
                quantity = 500;
            } else {
                quantity = 1000;
            }
        }

        // 計算需要花費的 USDC（當前價格 × 數量）
        const priceInUsdc = currentPrice / 1_000_000;
        const usdcAmount = quantity * priceInUsdc;

        return {
            poolId,
            currentPrice,
            floorPrice,
            priceDiff: (priceDiff * 100).toFixed(2) + '%',
            quantity,              // token 數量
            quantityRaw: quantity * 1_000_000_000, // 9 decimals (假設 token 是 9 decimals)
            usdcAmount,            // 需要花費的 USDC
            usdcAmountRaw: Math.floor(usdcAmount * 1_000_000), // 6 decimals
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
     * @param {string|number} params.orderQuantity - 訂單數量（可選，9 decimals）
     * @param {string|number} params.quantity - 訂單數量（可選，9 decimals，兼容舊格式）
     * @returns {object} 執行結果
     */
    async executeBuyback(params) {
        const { poolId, vaultId, currentPrice, floorPrice, orderQuantity, quantity } = params;
        
        // 兼容不同的參數名稱
        const actualQuantity = orderQuantity || quantity;

        console.log('\n🏦 Executing Buyback...');
        console.log(`   Pool: ${poolId?.substring(0, 20)}...`);
        console.log(`   Vault: ${vaultId?.substring(0, 20)}...`);
        if (actualQuantity) {
            const qtyDisplay = (Number(actualQuantity) / 1_000_000_000).toFixed(6);
            console.log(`   📦 Order Quantity: ${qtyDisplay} tokens (from sell order)`);
        }

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

        try {
            // 獲取 Pool 信息（必須先獲取）
            const vaultInfo = vaultRegistry.getVaultByPoolId(poolId);
            if (!vaultInfo) {
                console.log('❌ Pool not found in registry');
                return { success: false, reason: 'Pool not registered' };
            }

            // 計算回購數量（傳遞訂單數量）
            const calculation = this.calculateBuybackAmount(poolId, currentPrice, floorPrice, actualQuantity);
            console.log(`   Price Diff: ${calculation.priceDiff}`);
            console.log(`   Buyback Quantity: ${calculation.quantity} tokens`);
            console.log(`   Estimated Cost: ${calculation.usdcAmount.toFixed(6)} USDC`);

            // 獲取 Pool 特定的最低回購金額（優先）或使用全局設置
            const effectiveMinAmount = vaultInfo.minBuybackAmount !== undefined 
                ? vaultInfo.minBuybackAmount 
                : (this.minAmount !== null ? this.minAmount : 0);

            if (effectiveMinAmount > 0 && calculation.usdcAmount < effectiveMinAmount) {
                console.log(`⚠️  Buyback cost (${calculation.usdcAmount.toFixed(6)} USDC) below minimum (${effectiveMinAmount} USDC)`);
                console.log(`   💡 Pool minimum: ${vaultInfo.minBuybackAmount !== undefined ? vaultInfo.minBuybackAmount : 'not set'}`);
                console.log(`   💡 Global minimum: ${this.minAmount !== null ? this.minAmount : 'not set'}`);
                return { success: false, reason: 'Below minimum amount' };
            }
            
            console.log(`   ✅ Cost check passed (min: ${effectiveMinAmount} USDC)`);

            // 檢查 Balance Manager（優先使用 Pool 特定的，然後是全局的）
            const effectiveBalanceManagerId = vaultInfo.balanceManagerId || this.balanceManagerId;
            if (!effectiveBalanceManagerId) {
                console.log('❌ Balance Manager ID not configured');
                console.log('   This pool does not have a Balance Manager registered');
                console.log('   Please provide balanceManagerId when registering the pool,');
                console.log('   or set BUYBACK_BALANCE_MANAGER_ID in .env');
                return { success: false, reason: 'No Balance Manager configured for this pool' };
            }

            console.log(`   💼 Using Balance Manager: ${effectiveBalanceManagerId.substring(0, 20)}...`);

            // 獲取 coin type（從 vaultInfo 或使用默認）
            const baseCoinType = vaultInfo.coinType;
            if (!baseCoinType) {
                console.log('❌ Base coin type not found');
                return { success: false, reason: 'Coin type unknown' };
            }

            console.log(`   🪙 Base Coin: ${baseCoinType.split('::').pop()}`);
            console.log(`   💵 Quote Coin: DBUSDC`);

            // 創建 DeepBook Client（需要配置 Pool 和 Coin 信息）
            // SDK 需要自定義的 key，我們使用 'BUYBACK_POOL' 作為 pool key
            const poolKey = 'BUYBACK_POOL';
            const baseCoinKey = 'BASE_COIN';
            
            // 判斷 base coin 的精度（通常 token 是 9 decimals）
            const baseCoinScalar = 1e9; // 大多數 token 使用 9 位小數
            
            const dbClient = new DeepBookClient({
                address: this.address,
                env: this.network,
                client: this.client,
                balanceManagers: {
                    EXECUTOR: {
                        address: effectiveBalanceManagerId,
                    }
                },
                // 配置 Coin 信息
                coins: {
                    [baseCoinKey]: {
                        address: baseCoinType.split('::')[0],
                        type: baseCoinType,
                        scalar: baseCoinScalar,
                    },
                    DBUSDC: {
                        address: '0xf7152c05930480cd740d7311b5b8b45c6f488e3a53a11c3f74a6fac36a52e0d7',
                        type: DBUSDC_TYPE,
                        scalar: 1e6, // DBUSDC 使用 6 位小數
                    }
                },
                // 配置 Pool 信息
                pools: {
                    [poolKey]: {
                        address: poolId,
                        baseCoin: baseCoinKey,
                        quoteCoin: 'DBUSDC',
                    }
                }
            });

            console.log('📝 Executing real buyback transaction...');

            // 構建市價買單交易
            const tx = new Transaction();

            // 使用計算好的固定數量
            const buyQuantity = calculation.quantity;
            const priceInUsdc = currentPrice / 1_000_000;
            
            console.log(`   📊 Price Info:`);
            console.log(`      Current Price: ${priceInUsdc.toFixed(6)} USDC per token (raw: ${currentPrice})`);
            console.log(`      Buyback Quantity: ${buyQuantity} tokens (fixed)`);
            console.log(`      Estimated Cost: ${calculation.usdcAmount.toFixed(6)} USDC`);

            // 下市價買單
            // 注意：DeepBook SDK 使用 FLOAT 格式的價格（不是 raw），需要除以 1e9
            // currentPrice 是 6 decimals，DeepBook 內部是 9 decimals，所以需要轉換
            const sdkPrice = (currentPrice * 2) / 1_000; // 雙倍價格以確保立即成交，轉換為 SDK 需要的格式
            
            console.log(`   📝 Order Details:`);
            console.log(`      Pool Key: ${poolKey}`);
            console.log(`      Pool ID: ${poolId.substring(0, 30)}...`);
            console.log(`      SDK Price: ${sdkPrice} (2x current price to ensure fill)`);
            console.log(`      Quantity: ${buyQuantity} tokens`);
            console.log(`      Order Type: IMMEDIATE_OR_CANCEL`);
            
            tx.add(
                dbClient.deepBook.placeLimitOrder({
                    poolKey: poolKey, // 使用配置中的 pool key
                    balanceManagerKey: 'EXECUTOR',
                    clientOrderId: BigInt(Date.now()),
                    price: sdkPrice,
                    quantity: buyQuantity,  // 使用固定數量
                    isBid: true, // 買單
                    orderType: 1, // IMMEDIATE_OR_CANCEL
                    selfMatchingOption: 0,
                    payWithDeep: false,
                })
            );

            // 執行交易
            const result = await this.client.signAndExecuteTransaction({
                transaction: tx,
                signer: this.keypair,
                options: {
                    showEffects: true,
                    showEvents: true,
                },
            });

            console.log(`✅ Transaction executed: ${result.digest}`);
            console.log(`   View on explorer: https://testnet.suivision.xyz/txblock/${result.digest}`);

            // 檢查交易結果
            const status = result.effects?.status?.status;
            if (status !== 'success') {
                console.error('❌ Transaction failed');
                return {
                    success: false,
                    reason: 'Transaction failed',
                    digest: result.digest,
                };
            }

            // 解析事件
            let filled = false;
            if (result.events) {
                for (const event of result.events) {
                    if (event.type.includes('OrderFilled')) {
                        filled = true;
                        console.log(`✅ Order filled!`);
                        if (event.parsedJson) {
                            console.log(`   Base quantity: ${event.parsedJson.base_quantity}`);
                            console.log(`   Quote quantity: ${event.parsedJson.quote_quantity}`);
                        }
                    }
                }
            }

            // 記錄回購
            const execution = {
                poolId,
                vaultId,
                currentPrice,
                floorPrice,
                quantity: calculation.quantity,
                usdcAmount: calculation.usdcAmount,
                usdcAmountRaw: calculation.usdcAmountRaw,
                executedAt: new Date().toISOString(),
                status: filled ? 'executed' : 'partial',
                digest: result.digest,
            };

            this.executions.push(execution);
            vaultRegistry.recordBuyback(poolId, calculation.usdcAmountRaw);

            console.log(`✅ Buyback executed successfully!`);

            return {
                success: true,
                execution,
                digest: result.digest,
            };

        } catch (error) {
            console.error('❌ Buyback execution failed:', error.message);
            console.error('   Error details:', error);
            
            // 記錄失敗
            const execution = {
                poolId,
                vaultId,
                currentPrice,
                floorPrice,
                quantity: calculation.quantity,
                usdcAmount: calculation.usdcAmount,
                usdcAmountRaw: calculation.usdcAmountRaw,
                executedAt: new Date().toISOString(),
                status: 'failed',
                error: error.message,
            };
            this.executions.push(execution);

            return {
                success: false,
                reason: error.message,
                error: error.toString(),
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
