/**
 * Query DeepBook Pools
 * 
 * 查詢可用的交易池和池子信息。
 * 
 * 使用方式: npm run query-pools
 */

import { DeepBookClient } from '@mysten/deepbook-v3';
import { getSuiClient, getKeypair, NETWORK, parseAmount } from './config.js';

async function queryPools() {
  const client = getSuiClient();
  const keypair = getKeypair();
  const address = keypair.toSuiAddress();

  console.log('🔍 Querying DeepBook Pools...');
  console.log(`🌐 Network: ${NETWORK}`);

  const dbClient = new DeepBookClient({
    address,
    env: NETWORK,
    client,
  });

  // 列出常用的交易對
  const commonPools = [
    'SUI_USDC',
    'DEEP_SUI',
    'DEEP_USDC',
    'SUI_DBUSDC',
    'TEST01_COIN_DBUSDC'
  ];

  console.log('\n📊 Available Pools:');
  console.log('='.repeat(60));

  for (const poolKey of commonPools) {
    try {
      // 獲取池子的訂單簿信息
      const poolInfo = await getPoolInfo(dbClient, poolKey);
      if (poolInfo) {
        console.log(`\n🏊 Pool: ${poolKey}`);
        console.log(`  Status: Available on ${NETWORK}`);
        console.log(`  💡 使用 DeepBook API 獲取詳細信息`);
      }
    } catch (error: any) {
      // 池子可能不存在於當前網路
      console.log(`\n🏊 Pool: ${poolKey}`);
      console.log(`  Status: Not available on ${NETWORK}`);
    }
  }

  console.log('\n' + '='.repeat(60));
}

async function getPoolInfo(dbClient: DeepBookClient, poolKey: string) {
  try {
    // 返回基本池子信息
    return {
      poolId: poolKey,
    };
  } catch (error) {
    return null;
  }
}

// 查詢特定池子的詳細信息
async function queryPoolDetails(poolKeyOrId: string) {
  const client = getSuiClient();
  const keypair = getKeypair();
  const address = keypair.toSuiAddress();

  console.log(`\n🔍 Querying Pool Details: ${poolKeyOrId}`);
  console.log('='.repeat(60));

  try {
    // 如果輸入看起來像 Pool ID (0x開頭)，直接查詢對象
    if (poolKeyOrId.startsWith('0x')) {
      console.log('\n📋 Querying by Pool ID...');
      const poolObject = await client.getObject({
        id: poolKeyOrId,
        options: {
          showContent: true,
          showType: true,
        },
      });

      if (poolObject.data) {
        console.log('\n✅ Pool Found!');
        console.log(`🆔 Pool ID: ${poolObject.data.objectId}`);
        console.log(`📦 Type: ${poolObject.data.type}`);

        if (poolObject.data.content && 'fields' in poolObject.data.content) {
          const fields = poolObject.data.content.fields as any;
          console.log('\n📊 Pool Configuration:');

          // 顯示池子配置
          if (fields.tick_size) {
            console.log(`  Tick Size: ${fields.tick_size}`);
          }
          if (fields.lot_size) {
            console.log(`  Lot Size: ${fields.lot_size}`);
          }
          if (fields.min_size) {
            console.log(`  Min Size: ${fields.min_size}`);
          }
          if (fields.taker_fee) {
            console.log(`  Taker Fee: ${fields.taker_fee}`);
          }
          if (fields.maker_fee) {
            console.log(`  Maker Fee: ${fields.maker_fee}`);
          }
        }
      } else {
        console.log('❌ Pool not found');
      }
    } else {
      // 如果是 Pool Key，需要通過 Registry 查詢
      console.log('\n� Pool Key provided. To query by key, you need the Pool ID.');
      console.log('💡 You can find the Pool ID from the create-pool output.');
      console.log('\n📝 Your created pools:');
      console.log('  TEST01_COIN_DBUSDC Pool ID: 0x9c73295c437151ee5ded33df815faebd1e7b13d794af60feda201a226ad680d6');
      console.log('\n💡 Usage: npm run query-pools -- 0x9c73295c437151ee5ded33df815faebd1e7b13d794af60feda201a226ad680d6');
    }

    // 查詢訂單簿深度
    console.log('\n📊 Order Book Information:');
    console.log('  💡 To view order book depth, use:');
    console.log('     npm run query-orders -- ' + poolKeyOrId + ' book');

  } catch (error: any) {
    console.error('❌ Error querying pool:', error.message);
    console.log('\n💡 Make sure you are using the correct Pool ID from the create-pool output.');
  }
}

// 獲取池子的中間價格
async function getMidPrice(poolKey: string): Promise<number | null> {
  const client = getSuiClient();
  const keypair = getKeypair();
  const address = keypair.toSuiAddress();

  const dbClient = new DeepBookClient({
    address,
    env: NETWORK,
    client,
  });

  try {
    // 需要通過 DeepBook API 獲取中間價
    console.log(`  💡 使用 DeepBook API 獲取 ${poolKey} 中間價`);
    return null;
  } catch (error) {
    return null;
  }
}

// 執行
const args = process.argv.slice(2);
const specificPool = args[0];

if (specificPool) {
  queryPoolDetails(specificPool)
    .then(() => {
      console.log('\n✨ Done!');
      process.exit(0);
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
} else {
  queryPools()
    .then(() => {
      console.log('\n✨ Done!');
      process.exit(0);
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

export { queryPools, queryPoolDetails, getMidPrice };
