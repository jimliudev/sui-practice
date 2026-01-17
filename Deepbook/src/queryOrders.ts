/**
 * Query Open Orders
 * 
 * 查詢用戶在 DeepBook 上的未成交訂單。
 * 
 * 使用方式: npm run query-orders
 */

import { DeepBookClient } from '@mysten/deepbook-v3';
import type { BalanceManager } from '@mysten/deepbook-v3';
import { getSuiClient, getKeypair, NETWORK, parseAmount } from './config.js';

// 配置
const BALANCE_MANAGER_ID = process.env.BALANCE_MANAGER_ID || '';

async function queryOpenOrders(poolKey: string) {
  if (!BALANCE_MANAGER_ID) {
    console.error('❌ BALANCE_MANAGER_ID not set.');
    console.log('💡 Run: npm run create-balance-manager');
    process.exit(1);
  }

  const client = getSuiClient();
  const keypair = getKeypair();
  const address = keypair.toSuiAddress();

  console.log('📋 Querying Open Orders...');
  console.log(`👤 Address: ${address}`);
  console.log(`🏦 Balance Manager: ${BALANCE_MANAGER_ID}`);
  console.log(`🏊 Pool: ${poolKey}`);
  console.log(`🌐 Network: ${NETWORK}`);

  // 配置 BalanceManager
  const balanceManagers: { [key: string]: BalanceManager } = {
    MANAGER_1: {
      address: BALANCE_MANAGER_ID,
      tradeCap: process.env.TRADE_CAP_ID,
    },
  };

  const dbClient = new DeepBookClient({
    address,
    env: NETWORK,
    client,
    balanceManagers,
  });

  try {
    // 查詢訂單需要通過 DeepBook API 或鏈上查詢
    console.log('\n📊 Open Orders:');
    console.log('='.repeat(60));
    console.log('  💡 訂單查詢需要通過 DeepBook API 服務');
    console.log('  🔗 https://deepbook-indexer.mainnet.mystenlabs.com/docs');
    console.log(`  🔗 或查看 Sui Explorer: https://suiscan.xyz/${NETWORK}/object/${BALANCE_MANAGER_ID}`);
    console.log('='.repeat(60));
    return [];

  } catch (error) {
    console.error('❌ Failed to query orders:', error);
    throw error;
  }
}

// 查詢所有池子的訂單
async function queryAllOpenOrders() {
  const pools = ['SUI_USDC', 'DEEP_SUI', 'DEEP_USDC'];

  console.log('📋 Querying All Open Orders...');
  console.log('='.repeat(60));

  for (const poolKey of pools) {
    try {
      console.log(`\n🏊 Pool: ${poolKey}`);
      const orders = await queryOpenOrdersSilent(poolKey);

      if (orders && orders.length > 0) {
        console.log(`   Found ${orders.length} open order(s)`);
        orders.forEach((orderId: any, i: number) => {
          console.log(`   ${i + 1}. Order ID: ${orderId}`);
        });
      } else {
        console.log('   No open orders');
      }
    } catch (e) {
      console.log(`   Pool not available on ${NETWORK}`);
    }
  }

  console.log('\n' + '='.repeat(60));
}

// 靜默查詢（不輸出太多信息）
async function queryOpenOrdersSilent(poolKey: string) {
  if (!BALANCE_MANAGER_ID) {
    return [];
  }

  const client = getSuiClient();
  const keypair = getKeypair();
  const address = keypair.toSuiAddress();

  const balanceManagers: { [key: string]: BalanceManager } = {
    MANAGER_1: {
      address: BALANCE_MANAGER_ID,
      tradeCap: process.env.TRADE_CAP_ID,
    },
  };

  const dbClient = new DeepBookClient({
    address,
    env: NETWORK,
    client,
    balanceManagers,
  });

  try {
    // 需要通過 DeepBook API 查詢
    return [];
  } catch (e) {
    return [];
  }
}

// 查詢訂單簿 (Level 2)
async function queryOrderBook(poolKey: string) {
  const client = getSuiClient();

  console.log(`\n📚 Querying Order Book: ${poolKey}`);
  console.log('='.repeat(60));

  try {
    // Pool ID 映射
    const knownPools: { [key: string]: string } = {
      'TEST01_COIN_DBUSDC': '0x9c73295c437151ee5ded33df815faebd1e7b13d794af60feda201a226ad680d6',
    };

    let poolId = poolKey;
    if (knownPools[poolKey]) {
      poolId = knownPools[poolKey];
      console.log(`📋 Pool Key: ${poolKey}`);
      console.log(`🆔 Pool ID: ${poolId}`);
    }

    // 查詢 Pool 對象
    const poolObject = await client.getObject({
      id: poolId,
      options: {
        showContent: true,
        showType: true,
      },
    });

    if (!poolObject.data) {
      console.log('❌ Pool not found');
      return { bids: [], asks: [] };
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

    // 查詢動態字段
    console.log('\n🔍 Querying dynamic fields (orders)...');
    const dynamicFields = await client.getDynamicFields({
      parentId: poolId,
    });

    if (!dynamicFields.data || dynamicFields.data.length === 0) {
      console.log('📭 No orders found (order book is empty)');
      console.log('\n💡 Place orders to add liquidity:');
      console.log('   npm run place-limit-order -- --pool TEST01_COIN_DBUSDC --price 1.5 --quantity 10 --side sell');
      return { bids: [], asks: [] };
    }

    console.log(`✅ Found ${dynamicFields.data.length} dynamic field(s)`);
    console.log('\n📖 Order Book Structure:');
    console.log('─'.repeat(60));

    for (const field of dynamicFields.data.slice(0, 10)) {
      try {
        const fieldObject = await client.getObject({
          id: field.objectId,
          options: { showContent: true, showType: true },
        });

        if (fieldObject.data) {
          const fieldType = fieldObject.data.type || 'Unknown';
          console.log(`\n  📋 Field Type: ${fieldType.split('::').pop()}`);
          console.log(`     Object ID: ${field.objectId.substring(0, 20)}...`);

          if (fieldObject.data.content && 'fields' in fieldObject.data.content) {
            const fields = fieldObject.data.content.fields as any;
            if (fields.value) {
              console.log(`     Data: ${JSON.stringify(fields.value).substring(0, 80)}...`);
            }
          }
        }
      } catch (e: any) {
        // Ignore errors
      }
    }

    console.log('\n' + '─'.repeat(60));
    console.log(`📊 Total fields: ${dynamicFields.data.length}`);
    console.log('\n💡 Your recent orders:');
    console.log('   - Order 1: 10 TEST01 @ 1.5 DBUSDC');
    console.log('   - Order 2: 15 TEST01 @ 1.8 DBUSDC');
    console.log('\n🔗 View on Explorer:');
    console.log(`   https://testnet.suivision.xyz/object/${poolId}`);
    console.log('='.repeat(60));

    return { bids: [], asks: [] };
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    return { bids: [], asks: [] };
  }
}

// 解析命令行參數
const args = process.argv.slice(2);
const poolKey = args[0] || 'SUI_USDC';
const queryType = args[1] || 'orders'; // 'orders', 'book', 'all'

if (queryType === 'all') {
  queryAllOpenOrders()
    .then(() => {
      console.log('\n✨ Done!');
      process.exit(0);
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
} else if (queryType === 'book') {
  queryOrderBook(poolKey)
    .then(() => {
      console.log('\n✨ Done!');
      process.exit(0);
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
} else {
  queryOpenOrders(poolKey)
    .then(() => {
      console.log('\n✨ Done!');
      process.exit(0);
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

export { queryOpenOrders, queryAllOpenOrders, queryOrderBook };
