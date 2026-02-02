/**
 * DeepBook Listener
 * 
 * 監聽 DeepBook OrderFilled 事件
 * 當價格低於 floor price 時觸發自動回購
 */

import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import vaultRegistry from './vaultRegistry.js';

// DeepBook Package ID (Testnet)
const DEEPBOOK_PACKAGE_ID = '0xfb28c4cbc6865bd1c897d26aecbe1f8792d1509a20ffec692c800660cbec6982';

// 事件類型
const EVENT_TYPES = {
    ORDER_FILLED: `${DEEPBOOK_PACKAGE_ID}::clob::OrderFilled`,
    ORDER_PLACED: `${DEEPBOOK_PACKAGE_ID}::clob::OrderPlaced`,
    ORDER_CANCELED: `${DEEPBOOK_PACKAGE_ID}::clob::OrderCanceled`,
};

/**
 * DeepBookListener Class
 * 
 * 持續監聽 DeepBook 事件並觸發回購機制
 */
class DeepBookListener {
    /**
     * @param {object} config - 配置
     * @param {string} config.network - 網絡 (testnet/mainnet)
     * @param {number} config.pollInterval - 輪詢間隔 (ms)
     * @param {function} config.onBuybackTrigger - 回購觸發回調
     */
    constructor(config = {}) {
        this.network = config.network || process.env.NETWORK || 'testnet';
        this.pollInterval = config.pollInterval || parseInt(process.env.LISTENER_POLL_INTERVAL) || 5000;
        this.onBuybackTrigger = config.onBuybackTrigger || null;

        this.client = new SuiClient({ url: getFullnodeUrl(this.network) });
        this.isRunning = false;
        this.lastCursor = null;
        this.intervalId = null;

        // 手動設定的 Pool（本地配置）
        this.manualPools = new Map();

        // 統計
        this.stats = {
            eventsProcessed: 0,
            orderFilledCount: 0,
            buybackTriggered: 0,
            lastEventTime: null,
        };

        console.log(`🎧 DeepBookListener initialized`);
        console.log(`   Network: ${this.network}`);
        console.log(`   Poll Interval: ${this.pollInterval}ms`);
    }

    /**
     * 手動添加 Pool 到監控列表（自動從鏈上查詢資訊）
     * @param {string} poolId - Pool ID
     * @param {object} config - Pool 配置（可選，會從鏈上補充）
     */
    async addManualPool(poolId, config = {}) {
        if (!poolId) {
            throw new Error('poolId is required');
        }

        // 從鏈上查詢 Pool 資訊
        let chainPoolInfo = {};
        try {
            console.log(`🔍 Querying pool info from chain: ${poolId.substring(0, 20)}...`);
            const poolObject = await this.client.getObject({
                id: poolId,
                options: { showContent: true, showType: true }
            });

            if (poolObject.data && poolObject.data.content) {
                const fields = poolObject.data.content.fields;
                chainPoolInfo = {
                    // 從 Pool object 中提取資訊
                    tickSize: fields?.tick_size,
                    lotSize: fields?.lot_size,
                    minSize: fields?.min_size,
                    makerFee: fields?.maker_fee,
                    takerFee: fields?.taker_fee,
                    // 從 type 中提取 baseCoin 和 quoteCoin
                    poolType: poolObject.data.type,
                };

                // 解析 Pool type 獲取 coin 類型
                // 格式: 0x...::pool::Pool<BaseCoin, QuoteCoin>
                const typeMatch = poolObject.data.type?.match(/Pool<(.+),\s*(.+)>/);
                if (typeMatch) {
                    chainPoolInfo.baseCoin = typeMatch[1];
                    chainPoolInfo.quoteCoin = typeMatch[2];
                }

                console.log(`   ✅ Found pool on chain!`);
                console.log(`   Base Coin: ${chainPoolInfo.baseCoin?.substring(0, 30) || 'unknown'}...`);
                console.log(`   Quote Coin: ${chainPoolInfo.quoteCoin?.substring(0, 30) || 'unknown'}...`);
                console.log(`   Min Size: ${chainPoolInfo.minSize || 'unknown'}`);
            }
        } catch (error) {
            console.log(`   ⚠️ Could not query pool from chain: ${error.message}`);
        }

        const poolConfig = {
            poolId,
            balanceManagerId: config.balanceManagerId || null,
            vaultId: config.vaultId || null,
            coinType: config.coinType || chainPoolInfo.baseCoin || null,
            quoteCoin: chainPoolInfo.quoteCoin || null,
            floorPrice: config.floorPrice || 1_000_000, // 預設 1 USDC
            tickSize: chainPoolInfo.tickSize || null,
            lotSize: chainPoolInfo.lotSize || null,
            minSize: chainPoolInfo.minSize || null,
            addedAt: new Date().toISOString(),
            source: 'manual',
        };
        this.manualPools.set(poolId, poolConfig);

        // 同時註冊到 vaultRegistry（與動態註冊的 Pool 合併）
        vaultRegistry.registerPool(poolId, poolConfig);

        console.log(`📌 Manually added Pool: ${poolId?.substring(0, 20) || poolId}...`);
        return poolConfig;
    }

    /**
     * 查詢 Pool 的訂單簿（掛單數量）
     * @param {string} poolId - Pool ID
     */
    async getPoolOrderBook(poolId) {
        try {
            console.log(`📊 Querying order book for pool: ${poolId.substring(0, 20)}...`);

            const poolObject = await this.client.getObject({
                id: poolId,
                options: { showContent: true }
            });

            if (!poolObject.data || !poolObject.data.content) {
                return { error: 'Pool not found' };
            }

            const fields = poolObject.data.content.fields;

            // DeepBook v3 的訂單簿結構
            // bids 和 asks 是動態欄位
            let bidsCount = 0;
            let asksCount = 0;
            let bestBid = null;
            let bestAsk = null;

            // 嘗試獲取 bids/asks 的數量
            if (fields?.bids) {
                bidsCount = fields.bids.fields?.size || 0;
            }
            if (fields?.asks) {
                asksCount = fields.asks.fields?.size || 0;
            }

            // 獲取當前中間價
            const midPrice = fields?.mid_price;

            const result = {
                poolId,
                bidsCount,
                asksCount,
                totalOrders: bidsCount + asksCount,
                midPrice: midPrice ? Number(midPrice) / 1_000_000 : null,
                poolState: {
                    baseVault: fields?.base_vault?.fields?.balance || 0,
                    quoteVault: fields?.quote_vault?.fields?.balance || 0,
                },
                queriedAt: new Date().toISOString(),
            };

            console.log(`   📈 Bids: ${bidsCount}, Asks: ${asksCount}, Total: ${bidsCount + asksCount}`);
            return result;

        } catch (error) {
            console.error(`❌ Error querying order book: ${error.message}`);
            return { error: error.message };
        }
    }

    /**
     * 移除手動添加的 Pool
     * @param {string} poolId - Pool ID
     */
    removeManualPool(poolId) {
        if (this.manualPools.has(poolId)) {
            this.manualPools.delete(poolId);
            console.log(`🗑️ Removed manual Pool: ${poolId.substring(0, 20)}...`);
            return true;
        }
        return false;
    }

    /**
     * 獲取所有手動添加的 Pool
     */
    getManualPools() {
        return Array.from(this.manualPools.values());
    }

    /**
     * 啟動監聽器
     */
    async start() {
        if (this.isRunning) {
            console.log('⚠️  Listener already running');
            return;
        }

        this.isRunning = true;
        console.log('\n🚀 Starting DeepBook Listener...');

        // 初始輪詢
        await this.poll();

        // 設置定時輪詢
        this.intervalId = setInterval(() => this.poll(), this.pollInterval);

        console.log('✅ Listener started successfully');
    }

    /**
     * 停止監聽器
     */
    stop() {
        if (!this.isRunning) {
            console.log('⚠️  Listener not running');
            return;
        }

        this.isRunning = false;
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }

        console.log('\n🛑 Listener stopped');
        console.log(`   Total events processed: ${this.stats.eventsProcessed}`);
        console.log(`   OrderFilled events: ${this.stats.orderFilledCount}`);
        console.log(`   Buybacks triggered: ${this.stats.buybackTriggered}`);
    }

    /**
     * 輪詢新事件
     */
    async poll() {
        try {
            // 獲取監控的 Pool IDs
            const poolIds = vaultRegistry.getMonitoredPoolIds();

            if (poolIds.length === 0) {
                console.log('📭 No pools registered for monitoring');
                return;
            }

            console.log(`🔄 Polling... (Monitoring ${poolIds.length} pool(s))`);

            // 查詢最新事件
            const events = await this.queryEvents();

            if (events.length > 0) {
                console.log(`\n📨 Received ${events.length} new event(s)`);

                for (const event of events) {
                    await this.processEvent(event);
                }
            }

        } catch (error) {
            console.error('❌ Poll error:', error.message);
        }
    }

    /**
     * 查詢 DeepBook 事件
     */
    async queryEvents() {
        try {
            // 查詢 OrderFilled 事件
            const result = await this.client.queryEvents({
                query: {
                    MoveEventType: EVENT_TYPES.ORDER_FILLED,
                },
                cursor: this.lastCursor,
                limit: 50,
                order: 'ascending',
            });

            if (result.data && result.data.length > 0) {
                this.lastCursor = result.nextCursor;
                return result.data;
            }

            return [];
        } catch (error) {
            // 可能是事件類型不存在
            if (error.message.includes('not found')) {
                return [];
            }
            throw error;
        }
    }

    /**
     * 處理單個事件
     * 
     * @param {object} event - Sui 事件
     */
    async processEvent(event) {
        this.stats.eventsProcessed++;
        this.stats.lastEventTime = new Date().toISOString();

        const eventType = event.type.split('::').pop();

        if (eventType === 'OrderFilled') {
            await this.handleOrderFilled(event);
        }
    }

    /**
     * 處理 OrderFilled 事件
     * 
     * @param {object} event - OrderFilled 事件
     */
    async handleOrderFilled(event) {
        this.stats.orderFilledCount++;

        const data = event.parsedJson;
        if (!data) {
            console.log('⚠️  Event has no parsed data');
            return;
        }

        const poolId = data.pool_id;
        const rawPrice = data.price;

        // 轉換價格 (DeepBook 使用 9 位小數，我們存儲 6 位)
        const priceIn6Decimals = Math.floor(Number(rawPrice) / 1000);

        console.log(`\n📊 OrderFilled Event:`);
        console.log(`   Pool: ${poolId?.substring(0, 20)}...`);
        console.log(`   Price: ${priceIn6Decimals / 1_000_000} USDC`);
        console.log(`   Side: ${data.is_bid ? '🟢 BUY' : '🔴 SELL'}`);

        // 更新記錄中的最後成交價
        vaultRegistry.updateLastTradePrice(poolId, priceIn6Decimals);

        // 檢查是否需要回購
        if (vaultRegistry.shouldBuyback(poolId, priceIn6Decimals)) {
            console.log(`\n⚠️  PRICE BELOW FLOOR! Triggering buyback...`);

            const vaultInfo = vaultRegistry.getVaultByPoolId(poolId);
            console.log(`   Vault: ${vaultInfo?.vaultId?.substring(0, 20)}...`);
            console.log(`   Floor Price: ${vaultInfo?.floorPrice / 1_000_000} USDC`);
            console.log(`   Current Price: ${priceIn6Decimals / 1_000_000} USDC`);

            this.stats.buybackTriggered++;

            // 觸發回購回調
            if (this.onBuybackTrigger) {
                await this.onBuybackTrigger({
                    poolId,
                    vaultId: vaultInfo?.vaultId,
                    currentPrice: priceIn6Decimals,
                    floorPrice: vaultInfo?.floorPrice,
                    event: data,
                });
            }
        }
    }

    /**
     * 手動檢查特定 Pool 的價格
     * 
     * @param {string} poolId - Pool ID
     * @returns {object} 價格資訊
     */
    async checkPoolPrice(poolId) {
        const vaultInfo = vaultRegistry.getVaultByPoolId(poolId);
        if (!vaultInfo) {
            return { error: 'Pool not registered' };
        }

        return {
            poolId,
            vaultId: vaultInfo.vaultId,
            floorPrice: vaultInfo.floorPrice,
            lastTradePrice: vaultInfo.lastTradePrice,
            needsBuyback: vaultRegistry.shouldBuyback(poolId, vaultInfo.lastTradePrice),
        };
    }

    /**
     * 獲取監聽器狀態
     */
    getStatus() {
        return {
            isRunning: this.isRunning,
            network: this.network,
            pollInterval: this.pollInterval,
            monitoredPools: vaultRegistry.getMonitoredPoolIds().length,
            stats: this.stats,
        };
    }
}

// 創建單例
const deepBookListener = new DeepBookListener();

export { DeepBookListener, deepBookListener };
export default deepBookListener;
