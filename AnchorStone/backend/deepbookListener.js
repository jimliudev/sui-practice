/**
 * DeepBook Listener
 * 
 * 監聽 DeepBook OrderFilled 事件
 * 當價格低於 floor price 時觸發自動回購
 */

import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import vaultRegistry from './vaultRegistry.js';

// DeepBook Package ID (Testnet) - without 0x prefix for consistency
const DEEPBOOK_PACKAGE_ID = 'fb28c4cbc6865bd1c897d26aecbe1f8792d1509a20ffec692c800660cbec6982';

// 事件類型 (DeepBook v3 uses order_info module)
const EVENT_TYPES = {
    ORDER_FILLED: `0x${DEEPBOOK_PACKAGE_ID}::order_info::OrderFilled`,
    ORDER_PLACED: `0x${DEEPBOOK_PACKAGE_ID}::order_info::OrderPlaced`,
    ORDER_CANCELED: `0x${DEEPBOOK_PACKAGE_ID}::order_info::OrderCanceled`,
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
        this.lastCursorPlaced = null; // OrderPlaced 事件的 cursor
        this.lastCursorFilled = null; // OrderFilled 事件的 cursor
        this.intervalId = null;

        // 手動設定的 Pool（本地配置）
        this.manualPools = new Map();

        // 訂單緩存（前端報告的訂單）
        this.orderCache = new Map(); // key: orderId, value: { poolId, price, quantity, isBid, timestamp }

        // 統計
        this.stats = {
            eventsProcessed: 0,
            orderPlacedCount: 0,
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
            owner: config.owner || null,
            tickSize: chainPoolInfo.tickSize || null,
            lotSize: chainPoolInfo.lotSize || null,
            minSize: chainPoolInfo.minSize || null,
            addedAt: new Date().toISOString(),
            source: 'manual',
        };
        this.manualPools.set(poolId, poolConfig);

        console.log(`📌 Manually added Pool to listener: ${poolId?.substring(0, 20) || poolId}...`);
        console.log(`   Vault ID: ${poolConfig.vaultId || 'Not provided'}`);
        console.log(`   Balance Manager ID: ${poolConfig.balanceManagerId || 'Not provided'}`);
        console.log(`   Note: Will be registered to VaultRegistry by server if vaultId is provided`);
        
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
        console.log('\n🚀 ====== Starting DeepBook Listener ======');
        console.log(`   Network: ${this.network}`);
        console.log(`   Poll Interval: ${this.pollInterval}ms`);

        // 顯示正在監控的 Pool
        const monitoredPools = vaultRegistry.getAllPools();
        const manualPools = this.getManualPools();
        const totalPools = monitoredPools.length + manualPools.length;

        console.log(`\n📊 Monitoring ${totalPools} Pool(s):`);
        console.log('='.repeat(60));

        // 顯示從 VaultRegistry 來的 Pool
        if (monitoredPools.length > 0) {
            console.log(`\n🏦 Registered Pools (${monitoredPools.length}):`);
            monitoredPools.forEach((pool, index) => {
                const floorPriceDisplay = (pool.floorPrice / 1_000_000).toFixed(6);
                console.log(`\n   ${index + 1}. Pool: ${pool.poolId.substring(0, 20)}...`);
                console.log(`      Vault: ${pool.vaultId.substring(0, 20)}...`);
                console.log(`      🛡️  Floor Price: ${floorPriceDisplay} USDC`);
                console.log(`      💡 Buyback trigger: price < ${floorPriceDisplay} USDC`);
            });
        }

        // 顯示手動添加的 Pool
        if (manualPools.length > 0) {
            console.log(`\n📝 Manual Pools (${manualPools.length}):`);
            manualPools.forEach((pool, index) => {
                const floorPriceDisplay = (pool.floorPrice / 1_000_000).toFixed(6);
                console.log(`\n   ${index + 1}. Pool: ${pool.poolId.substring(0, 20)}...`);
                if (pool.vaultId) {
                    console.log(`      Vault: ${pool.vaultId.substring(0, 20)}...`);
                }
                console.log(`      🛡️  Floor Price: ${floorPriceDisplay} USDC`);
                console.log(`      💡 Buyback trigger: price < ${floorPriceDisplay} USDC`);
            });
        }

        if (totalPools === 0) {
            console.log('   ⚠️  No pools registered yet');
            console.log('   💡 Use /api/vaults/register-pool to add pools');
        }

        console.log('\n' + '='.repeat(60));

        // 初始輪詢
        await this.poll();

        // 設置定時輪詢
        this.intervalId = setInterval(() => this.poll(), this.pollInterval);

        console.log('\n✅ Listener started successfully');
        console.log('   Monitoring for new OrderPlaced events...\n');
    }

    /**
     * 記錄訂單（由前端調用）
     * 
     * @param {object} orderInfo - 訂單信息
     * @param {string} orderInfo.orderId - 訂單 ID
     * @param {string} orderInfo.poolId - Pool ID
     * @param {string} orderInfo.price - 價格 (9 decimals)
     * @param {string} orderInfo.quantity - 數量
     * @param {boolean} orderInfo.isBid - 是否為買單
     */
    recordOrder(orderInfo) {
        const { orderId, poolId, price, quantity, isBid } = orderInfo;
        
        if (!orderId || !poolId || !price) {
            console.warn('⚠️  Invalid order info:', orderInfo);
            return { success: false, error: 'Missing required fields' };
        }

        // 標準化價格
        const priceIn6Decimals = Math.floor(Number(price) / 1000);
        const priceDisplay = (priceIn6Decimals / 1_000_000).toFixed(6);
        
        // 存入緩存
        this.orderCache.set(orderId, {
            poolId,
            price: priceIn6Decimals,
            quantity,
            isBid,
            timestamp: Date.now(),
        });

        console.log(`\n📝 Order Recorded:`);
        console.log(`   Order ID: ${orderId}`);
        console.log(`   Pool: ${poolId.substring(0, 30)}...`);
        console.log(`   Price: ${priceDisplay} USDC`);
        console.log(`   Quantity: ${quantity}`);
        console.log(`   Side: ${isBid ? '🟢 BUY' : '🔴 SELL'}`);

        // 立即檢查是否需要回購（賣單且價格低於 floor price）
        if (!isBid) {
            const normalizedPoolId = poolId.replace(/^0x0+/, '0x');
            let vaultInfo = vaultRegistry.getVaultByPoolId(normalizedPoolId);
            if (!vaultInfo) {
                vaultInfo = vaultRegistry.getVaultByPoolId(poolId);
            }

            if (vaultInfo) {
                const floorPrice = vaultInfo.floorPrice || 0;
                const floorPriceDisplay = (floorPrice / 1_000_000).toFixed(6);
                
                console.log(`   🛡️  Floor Price: ${floorPriceDisplay} USDC`);
                
                if (priceIn6Decimals < floorPrice) {
                    console.log(`   ⚠️  SELL order below floor price!`);
                    console.log(`\n🚨 ====== BUYBACK TRIGGERED ======`);
                    console.log(`   📉 Price: ${priceDisplay} < ${floorPriceDisplay} USDC`);
                    console.log(`   📦 Order Quantity: ${quantity || 'unknown'}`);
                    console.log(`   💡 Should trigger buyback immediately!`);
                    
                    // 觸發回購回調（传递订单数量）
                    if (this.onBuybackTrigger) {
                        this.onBuybackTrigger({
                            poolId,
                            vaultId: vaultInfo.vaultId,
                            currentPrice: priceIn6Decimals,
                            floorPrice: floorPrice,
                            orderId,
                            orderQuantity: quantity, // 传递原始订单数量
                        });
                    }
                    
                    this.stats.buybackTriggered++;
                }
            }
        }

        return { success: true, orderId, cached: true };
    }

    /**
     * 獲取緩存的訂單
     */
    getCachedOrder(orderId) {
        return this.orderCache.get(orderId);
    }

    /**
     * 清理舊訂單（可選，防止緩存過大）
     */
    cleanOldOrders(maxAge = 24 * 60 * 60 * 1000) { // 預設 24 小時
        const now = Date.now();
        let cleaned = 0;
        
        for (const [orderId, order] of this.orderCache.entries()) {
            if (now - order.timestamp > maxAge) {
                this.orderCache.delete(orderId);
                cleaned++;
            }
        }
        
        if (cleaned > 0) {
            console.log(`🧹 Cleaned ${cleaned} old order(s) from cache`);
        }
        
        return cleaned;
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
        console.log(`   OrderPlaced events: ${this.stats.orderPlacedCount}`);
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
     * 查詢 DeepBook 事件（只返回監控的 Pool）
     */
    async queryEvents() {
        const allEvents = [];
        
        // 獲取監控的 Pool IDs
        const monitoredPoolIds = vaultRegistry.getMonitoredPoolIds();
        
        if (monitoredPoolIds.length === 0) {
            return [];
        }
        
        // 標準化 Pool IDs（支持帶前導零和不帶前導零的格式）
        const normalizedPoolIds = new Set();
        for (const poolId of monitoredPoolIds) {
            normalizedPoolIds.add(poolId);
            normalizedPoolIds.add(poolId.replace(/^0x0+/, '0x'));
        }
        
        try {
            // 1. 查詢 OrderPlaced 事件（掛單）
            const placedResult = await this.client.queryEvents({
                query: {
                    MoveEventType: EVENT_TYPES.ORDER_PLACED,
                },
                cursor: this.lastCursorPlaced,
                limit: 50,
                order: 'ascending',
            });

            if (placedResult.data && placedResult.data.length > 0) {
                this.lastCursorPlaced = placedResult.nextCursor;
                
                // 只保留監控 Pool 的事件
                const filteredPlaced = placedResult.data.filter(event => {
                    const poolId = event.parsedJson?.pool_id;
                    if (!poolId) return false;
                    const normalized = poolId.replace(/^0x0+/, '0x');
                    return normalizedPoolIds.has(poolId) || normalizedPoolIds.has(normalized);
                });
                
                if (filteredPlaced.length > 0) {
                    allEvents.push(...filteredPlaced);
                }
            }

        } catch (error) {
            if (!error.message.includes('not found')) {
                console.warn('⚠️ Error querying OrderPlaced events:', error.message);
            }
        }

        try {
            // 2. 查詢 OrderFilled 事件（成交）
            const filledResult = await this.client.queryEvents({
                query: {
                    MoveEventType: EVENT_TYPES.ORDER_FILLED,
                },
                cursor: this.lastCursorFilled,
                limit: 50,
                order: 'ascending',
            });

            if (filledResult.data && filledResult.data.length > 0) {
                this.lastCursorFilled = filledResult.nextCursor;
                
                // 只保留監控 Pool 的事件
                const filteredFilled = filledResult.data.filter(event => {
                    const poolId = event.parsedJson?.pool_id;
                    if (!poolId) return false;
                    const normalized = poolId.replace(/^0x0+/, '0x');
                    return normalizedPoolIds.has(poolId) || normalizedPoolIds.has(normalized);
                });
                
                if (filteredFilled.length > 0) {
                    allEvents.push(...filteredFilled);
                }
            }

        } catch (error) {
            if (!error.message.includes('not found')) {
                console.warn('⚠️ Error querying OrderFilled events:', error.message);
            }
        }

        // 按時間戳排序（如果有多個事件）
        if (allEvents.length > 1) {
            allEvents.sort((a, b) => {
                const timeA = parseInt(a.timestampMs || 0);
                const timeB = parseInt(b.timestampMs || 0);
                return timeA - timeB;
            });
        }

        return allEvents;
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

        if (eventType === 'OrderPlaced') {
            // 監聽掛單事件 - 當有人掛低價賣單時立即回購
            await this.handleOrderPlaced(event);
        } else if (eventType === 'OrderFilled') {
            // 仍然監聽成交事件以更新統計
            await this.handleOrderFilled(event);
        }
    }

    /**
     * 處理 OrderPlaced 事件（掛單時立即檢查）
     * 
     * @param {object} event - OrderPlaced 事件
     */
    async handleOrderPlaced(event) {
        this.stats.orderPlacedCount++;
        
        const data = event.parsedJson;
        if (!data) {
            console.log('⚠️  Event has no parsed data');
            return;
        }

        const poolId = data.pool_id;
        const rawPrice = data.price;
        const isBid = data.is_bid; // true = 買單, false = 賣單
        const quantity = data.placed_quantity;
        const orderId = data.order_id;

        // 標準化 Pool ID 格式 (移除前導零)
        const normalizedPoolId = poolId?.replace(/^0x0+/, '0x') || poolId;
        
        // 獲取 floor price 用於比較（嘗試兩種格式）
        let vaultInfo = vaultRegistry.getVaultByPoolId(normalizedPoolId);
        if (!vaultInfo) {
            vaultInfo = vaultRegistry.getVaultByPoolId(poolId);
        }
        
        // 理論上不應該發生（queryEvents 已過濾），但保留檢查
        if (!vaultInfo) {
            return;
        }
        
        // 轉換價格 (DeepBook 使用 9 位小數，我們存儲 6 位)
        const priceIn6Decimals = Math.floor(Number(rawPrice) / 1000);
        const quantityDisplay = Number(quantity) / 1_000_000_000;

        console.log(`\n📝 OrderPlaced (Monitored Pool):`);
        console.log(`   Pool: ${poolId?.substring(0, 30)}...`);
        console.log(`   Order ID: ${orderId}`);
        console.log(`   Price: ${(priceIn6Decimals / 1_000_000).toFixed(6)} USDC`);
        console.log(`   Quantity: ${quantityDisplay.toFixed(6)}`);
        console.log(`   Side: ${isBid ? '🟢 BUY Order' : '🔴 SELL Order'}`);

        const floorPrice = vaultInfo.floorPrice || 0;
        const currentPriceDisplay = (priceIn6Decimals / 1_000_000).toFixed(6);
        const floorPriceDisplay = (floorPrice / 1_000_000).toFixed(6);
        
        console.log(`   🛡️  Floor Price: ${floorPriceDisplay} USDC`);

        // ⚠️ 只有「賣單」且「價格低於 floor price」才需要回購
        if (!isBid && priceIn6Decimals < floorPrice) {
            console.log(`   ⚠️  SELL order below floor price detected!`);
            console.log(`\n🚨 ====== BUYBACK TRIGGERED (Low Ask Price) ======`);
            console.log(`   Order ID: ${orderId}`);
            console.log(`   Vault: ${vaultInfo.vaultId?.substring(0, 20)}...`);
            console.log(`   🛡️  Floor Price: ${floorPriceDisplay} USDC`);
            console.log(`   📉 Ask Price: ${currentPriceDisplay} USDC`);
            console.log(`   💰 Price Gap: -${((floorPrice - priceIn6Decimals) / 1_000_000).toFixed(6)} USDC`);
            console.log(`   📦 Quantity: ${quantityDisplay.toFixed(6)} tokens`);
            console.log(`   💡 Action: Should buy this order to support price!`);

            this.stats.buybackTriggered++;

            // 觸發回購回調
            if (this.onBuybackTrigger) {
                await this.onBuybackTrigger({
                    poolId,
                    vaultId: vaultInfo.vaultId,
                    orderId: orderId,
                    askPrice: priceIn6Decimals,
                    quantity: quantity,
                    floorPrice: vaultInfo.floorPrice,
                    event: data,
                    action: 'BUY_ASK_ORDER', // 買入低價賣單
                });
            }
        } else if (!isBid) {
            console.log(`   ✅ Sell order price is above floor (${currentPriceDisplay} >= ${floorPriceDisplay})`);
        } else {
            console.log(`   ℹ️  Buy order (no action needed)`);
        }
    }

    /**
     * 處理 OrderFilled 事件（用於統計和記錄）
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
        
        // 檢查是否為監控的 Pool
        const normalizedPoolId = poolId?.replace(/^0x0+/, '0x') || poolId;
        let vaultInfo = vaultRegistry.getVaultByPoolId(normalizedPoolId);
        if (!vaultInfo) {
            vaultInfo = vaultRegistry.getVaultByPoolId(poolId);
        }
        
        // 只記錄監控的 Pool 的成交
        if (!vaultInfo) {
            // 靜默跳過非監控 Pool 的事件
            return;
        }

        const rawPrice = data.execution_price || data.price;

        // 轉換價格 (DeepBook 使用 9 位小數，我們存儲 6 位)
        const priceIn6Decimals = Math.floor(Number(rawPrice) / 1000);

        console.log(`\n✅ OrderFilled Event (Trade Executed):`);
        console.log(`   Pool: ${poolId?.substring(0, 30)}...`);
        console.log(`   Execution Price: ${(priceIn6Decimals / 1_000_000).toFixed(6)} USDC`);
        console.log(`   Side: ${data.maker_is_bid ? '🟢 Maker was Buyer' : '🔴 Maker was Seller'}`);

        // 更新記錄中的最後成交價（用於統計）
        vaultRegistry.updateLastTradePrice(poolId, priceIn6Decimals);

        const floorPrice = vaultInfo.floorPrice || 0;
        const floorPriceDisplay = (floorPrice / 1_000_000).toFixed(6);
        console.log(`   🛡️  Floor Price: ${floorPriceDisplay} USDC`);
        console.log(`   📊 Status: Trade completed at ${priceIn6Decimals < floorPrice ? 'below' : 'above'} floor price`);
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

        const floorPriceDisplay = (vaultInfo.floorPrice / 1_000_000).toFixed(6);
        const lastPriceDisplay = (vaultInfo.lastTradePrice / 1_000_000).toFixed(6);
        const needsBuyback = vaultRegistry.shouldBuyback(poolId, vaultInfo.lastTradePrice);

        console.log(`\n💰 Price Check for Pool ${poolId.substring(0, 20)}...`);
        console.log(`   🛡️  Floor Price: ${floorPriceDisplay} USDC`);
        console.log(`   📊 Last Trade Price: ${lastPriceDisplay} USDC`);
        console.log(`   ${needsBuyback ? '⚠️  Needs buyback!' : '✅ Price above floor'}`);

        return {
            poolId,
            vaultId: vaultInfo.vaultId,
            floorPrice: vaultInfo.floorPrice,
            floorPriceDisplay,
            lastTradePrice: vaultInfo.lastTradePrice,
            lastTradePriceDisplay: lastPriceDisplay,
            needsBuyback,
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
