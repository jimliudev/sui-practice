/**
 * Query Recent Transactions and Events
 * 
 * 查詢最近的交易和相關事件
 * 
 * 使用方式: npx tsx src/queryRecentTx.ts
 */

import { getSuiClient, getKeypair, NETWORK } from './config.js';

const DEEPBOOK_PACKAGE_ID = '0xfb28c4cbc6865bd1c897d26aecbe1f8792d1509a20ffec692c800660cbec6982';
const BALANCE_MANAGER_ID = process.env.BALANCE_MANAGER_ID || '';

async function queryRecentTransactions() {
    const client = getSuiClient();
    const keypair = getKeypair();
    const address = keypair.toSuiAddress();

    console.log('🔍 Querying Recent Transactions');
    console.log('═'.repeat(60));
    console.log(`👤 Address: ${address}`);
    console.log(`🌐 Network: ${NETWORK}`);
    console.log('═'.repeat(60));

    try {
        // 查詢最近的交易
        const txs = await client.queryTransactionBlocks({
            filter: {
                FromAddress: address,
            },
            options: {
                showEvents: true,
                showEffects: true,
                showInput: true,
            },
            limit: 20,
            order: 'descending',
        });

        if (!txs.data || txs.data.length === 0) {
            console.log('📭 No transactions found');
            return;
        }

        console.log(`\n✅ Found ${txs.data.length} transaction(s)\n`);

        for (const tx of txs.data) {
            const digest = tx.digest;
            const timestamp = tx.timestampMs ? new Date(Number(tx.timestampMs)).toLocaleString() : 'N/A';

            console.log('─'.repeat(60));
            console.log(`📝 Transaction: ${digest.substring(0, 30)}...`);
            console.log(`   Time: ${timestamp}`);

            // 檢查事件
            if (tx.events && tx.events.length > 0) {
                console.log(`   📊 Events (${tx.events.length}):`);

                for (const event of tx.events) {
                    const eventType = event.type.split('::').pop();
                    console.log(`\n   🔔 ${eventType}:`);

                    if (event.parsedJson) {
                        const data = event.parsedJson as any;

                        // OrderPlaced 事件
                        if (eventType === 'OrderPlaced') {
                            console.log(`      Order ID: ${data.order_id}`);
                            console.log(`      Pool: ${data.pool_id?.substring(0, 20)}...`);
                            console.log(`      Side: ${data.is_bid ? '🟢 BUY' : '🔴 SELL'}`);
                            console.log(`      Price: ${formatPrice(data.price)}`);
                            console.log(`      Quantity: ${formatQuantity(data.placed_quantity)}`);
                        }

                        // OrderFilled 事件
                        else if (eventType === 'OrderFilled') {
                            console.log(`      Pool: ${data.pool_id?.substring(0, 20)}...`);
                            console.log(`      Price: ${formatPrice(data.price)}`);
                            console.log(`      Base Qty: ${formatQuantity(data.base_quantity)}`);
                            console.log(`      Quote Qty: ${formatQuantity(data.quote_quantity)}`);

                            const isMaker = BALANCE_MANAGER_ID && data.maker_balance_manager_id === BALANCE_MANAGER_ID;
                            const isTaker = BALANCE_MANAGER_ID && data.taker_balance_manager_id === BALANCE_MANAGER_ID;
                            if (isMaker || isTaker) {
                                console.log(`      Your Role: ${isMaker ? '🏪 Maker' : '🛒 Taker'}`);
                            }
                        }

                        // OrderCanceled 事件
                        else if (eventType === 'OrderCanceled') {
                            console.log(`      Order ID: ${data.order_id}`);
                            console.log(`      Pool: ${data.pool_id?.substring(0, 20)}...`);
                        }

                        // 其他 DeepBook 事件
                        else if (event.type.includes(DEEPBOOK_PACKAGE_ID)) {
                            console.log(`      Data: ${JSON.stringify(data).substring(0, 100)}...`);
                        }
                    }
                }
            } else {
                console.log(`   📭 No events`);
            }

            console.log('');
        }

        // 統計
        console.log('═'.repeat(60));
        console.log('📊 Summary:');

        let orderPlacedCount = 0;
        let orderFilledCount = 0;
        let orderCanceledCount = 0;

        for (const tx of txs.data) {
            if (tx.events) {
                for (const event of tx.events) {
                    const eventType = event.type.split('::').pop();
                    if (eventType === 'OrderPlaced') orderPlacedCount++;
                    if (eventType === 'OrderFilled') orderFilledCount++;
                    if (eventType === 'OrderCanceled') orderCanceledCount++;
                }
            }
        }

        console.log(`   OrderPlaced: ${orderPlacedCount}`);
        console.log(`   OrderFilled: ${orderFilledCount}`);
        console.log(`   OrderCanceled: ${orderCanceledCount}`);
        console.log('═'.repeat(60));

    } catch (error: any) {
        console.error(`❌ Error: ${error.message}`);
    }
}

function formatPrice(price: string | undefined): string {
    if (!price) return 'N/A';
    try {
        const priceNum = Number(price) / 1e9;
        return priceNum.toFixed(6);
    } catch {
        return price;
    }
}

function formatQuantity(quantity: string | undefined): string {
    if (!quantity) return 'N/A';
    try {
        const qty = Number(quantity) / 1e9;
        return qty.toFixed(4);
    } catch {
        return quantity;
    }
}

async function main() {
    await queryRecentTransactions();

    console.log('\n💡 Tip:');
    console.log('   如果看到 OrderPlaced 事件，表示訂單已成功掛單');
    console.log('   如果看到 OrderFilled 事件，表示訂單已成交');
    console.log('   如果只有 OrderPlaced 沒有 OrderFilled，表示訂單還在等待成交');
}

main()
    .then(() => {
        console.log('\n✨ Done!');
        process.exit(0);
    })
    .catch((error) => {
        console.error('❌ Error:', error);
        process.exit(1);
    });
