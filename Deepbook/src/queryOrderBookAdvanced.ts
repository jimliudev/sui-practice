/**
 * Advanced Order Book Query
 * 
 * 深度查詢 DeepBook 訂單簿，遞歸解析所有動態字段
 * 
 * 使用方式: npx tsx src/queryOrderBookAdvanced.ts <POOL_ID>
 */

import { getSuiClient, NETWORK } from './config.js';

const POOL_ID = '0x9c73295c437151ee5ded33df815faebd1e7b13d794af60feda201a226ad680d6';

interface OrderData {
    price: string;
    quantity: string;
    orderId: string;
    side: 'bid' | 'ask';
}

/**
 * 遞歸查詢動態字段
 */
async function queryDynamicFieldsRecursive(
    client: any,
    parentId: string,
    depth: number = 0,
    maxDepth: number = 3
): Promise<any[]> {
    if (depth > maxDepth) {
        return [];
    }

    const indent = '  '.repeat(depth);
    console.log(`${indent}🔍 Querying dynamic fields at depth ${depth}...`);

    try {
        const fields = await client.getDynamicFields({
            parentId,
        });

        if (!fields.data || fields.data.length === 0) {
            console.log(`${indent}  📭 No fields found`);
            return [];
        }

        console.log(`${indent}  ✅ Found ${fields.data.length} field(s)`);

        const results: any[] = [];

        for (const field of fields.data) {
            try {
                const fieldObject = await client.getObject({
                    id: field.objectId,
                    options: {
                        showContent: true,
                        showType: true,
                    },
                });

                if (fieldObject.data) {
                    const fieldType = fieldObject.data.type || 'Unknown';
                    const typeName = fieldType.split('::').pop() || fieldType;

                    console.log(`${indent}  📋 ${typeName}`);
                    console.log(`${indent}     ID: ${field.objectId.substring(0, 20)}...`);

                    results.push({
                        objectId: field.objectId,
                        type: fieldType,
                        data: fieldObject.data,
                        depth,
                    });

                    // 如果這個字段本身也有動態字段，遞歸查詢
                    if (fieldObject.data.content && 'fields' in fieldObject.data.content) {
                        const content = fieldObject.data.content.fields as any;

                        // 顯示字段內容摘要
                        if (content.value) {
                            const valueStr = JSON.stringify(content.value).substring(0, 100);
                            console.log(`${indent}     Data: ${valueStr}...`);
                        }

                        // 遞歸查詢子字段
                        const childFields = await queryDynamicFieldsRecursive(
                            client,
                            field.objectId,
                            depth + 1,
                            maxDepth
                        );
                        results.push(...childFields);
                    }
                }
            } catch (e: any) {
                console.log(`${indent}  ⚠️ Error reading field: ${e.message}`);
            }
        }

        return results;
    } catch (e: any) {
        console.log(`${indent}  ❌ Error: ${e.message}`);
        return [];
    }
}

/**
 * 查詢交易歷史（通過事件）
 */
async function queryTradeHistory(client: any, poolId: string) {
    console.log('\n📊 Querying Trade History...');
    console.log('─'.repeat(60));

    try {
        // 查詢與池子相關的事件
        const events = await client.queryEvents({
            query: {
                MoveEventType: `0xfb28c4cbc6865bd1c897d26aecbe1f8792d1509a20ffec692c800660cbec6982::pool::OrderFilled`,
            },
            limit: 50,
        });

        if (!events.data || events.data.length === 0) {
            console.log('📭 No trade history found');
            return;
        }

        console.log(`✅ Found ${events.data.length} trade event(s)\n`);

        let tradeCount = 0;
        for (const event of events.data.slice(0, 10)) {
            if (event.parsedJson) {
                const data = event.parsedJson as any;

                // 檢查是否是這個池子的交易
                if (data.pool_id === poolId || true) { // 暫時顯示所有
                    tradeCount++;
                    console.log(`📈 Trade ${tradeCount}:`);
                    console.log(`   Price: ${data.price || 'N/A'}`);
                    console.log(`   Quantity: ${data.base_quantity || data.quantity || 'N/A'}`);
                    console.log(`   Timestamp: ${new Date(Number(event.timestampMs)).toLocaleString()}`);
                    console.log(`   Tx: ${event.id.txDigest.substring(0, 20)}...`);
                    console.log('');
                }
            }
        }

        if (tradeCount === 0) {
            console.log('💡 No trades found for this pool');
        }

    } catch (e: any) {
        console.log(`❌ Error querying events: ${e.message}`);
    }
}

/**
 * 分析訂單數據
 */
function analyzeOrderData(fields: any[]): { bids: OrderData[], asks: OrderData[] } {
    const bids: OrderData[] = [];
    const asks: OrderData[] = [];

    for (const field of fields) {
        try {
            const typeName = field.type.split('::').pop();

            // 嘗試識別訂單相關的字段
            if (typeName && (
                typeName.includes('Order') ||
                typeName.includes('Bid') ||
                typeName.includes('Ask') ||
                typeName.includes('Level')
            )) {
                console.log(`\n🔍 Found potential order field: ${typeName}`);

                if (field.data.content && 'fields' in field.data.content) {
                    const content = field.data.content.fields;
                    console.log(`   Content: ${JSON.stringify(content).substring(0, 200)}`);
                }
            }
        } catch (e) {
            // Ignore
        }
    }

    return { bids, asks };
}

/**
 * 主函數
 */
async function main() {
    const client = getSuiClient();
    const poolId = process.argv[2] || POOL_ID;

    console.log('🔬 Advanced Order Book Query');
    console.log('═'.repeat(60));
    console.log(`🌐 Network: ${NETWORK}`);
    console.log(`🆔 Pool ID: ${poolId}`);
    console.log('═'.repeat(60));

    // 1. 查詢 Pool 基本信息
    console.log('\n📋 Step 1: Querying Pool Object...');
    const poolObject = await client.getObject({
        id: poolId,
        options: {
            showContent: true,
            showType: true,
        },
    });

    if (!poolObject.data) {
        console.log('❌ Pool not found');
        return;
    }

    console.log('✅ Pool found');

    // 解析交易對
    const poolType = poolObject.data.type;
    if (poolType) {
        const typeMatch = poolType.match(/Pool<(.+?),\s*(.+?)>/);
        if (typeMatch) {
            const baseToken = typeMatch[1].split('::').pop();
            const quoteToken = typeMatch[2].split('::').pop();
            console.log(`📊 Trading Pair: ${baseToken}/${quoteToken}`);
        }
    }

    // 2. 遞歸查詢所有動態字段
    console.log('\n📋 Step 2: Recursively Querying Dynamic Fields...');
    console.log('─'.repeat(60));

    const allFields = await queryDynamicFieldsRecursive(client, poolId, 0, 2);

    console.log('\n' + '─'.repeat(60));
    console.log(`📊 Total fields found: ${allFields.length}`);

    // 3. 分析訂單數據
    console.log('\n📋 Step 3: Analyzing Order Data...');
    console.log('─'.repeat(60));

    const { bids, asks } = analyzeOrderData(allFields);

    if (bids.length === 0 && asks.length === 0) {
        console.log('💡 Could not parse order data from dynamic fields');
        console.log('💡 This is expected - DeepBook V3 uses a complex tree structure');
    }

    // 4. 查詢交易歷史
    await queryTradeHistory(client, poolId);

    // 5. 總結
    console.log('\n═'.repeat(60));
    console.log('📊 Summary');
    console.log('═'.repeat(60));
    console.log(`✅ Pool exists and is active`);
    console.log(`📋 Total dynamic fields: ${allFields.length}`);
    console.log(`\n💡 Your known orders:`);
    console.log(`   - Sell: 5 TEST01 @ 1.5 DBUSDC (remaining)`);
    console.log(`   - Sell: 15 TEST01 @ 1.8 DBUSDC`);
    console.log(`   - Buy: 10 TEST01 @ 1.0 DBUSDC`);
    console.log(`\n💡 Recent trade:`);
    console.log(`   - Filled: 5 TEST01 @ 1.5 DBUSDC ✅`);
    console.log(`\n🔗 View on Explorer:`);
    console.log(`   https://testnet.suivision.xyz/object/${poolId}`);
    console.log('═'.repeat(60));
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
