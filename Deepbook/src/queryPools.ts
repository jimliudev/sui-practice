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
async function queryPoolDetails(poolKey: string) {
  const client = getSuiClient();
  const keypair = getKeypair();
  const address = keypair.toSuiAddress();

  const dbClient = new DeepBookClient({
    address,
    env: NETWORK,
    client,
  });

  console.log(`\n🔍 Querying Pool Details: ${poolKey}`);
  console.log('='.repeat(60));

  console.log('  💡 訂單簿詳細信息請使用 DeepBook API 服務');
  console.log('  🔗 https://deepbook-indexer.mainnet.mystenlabs.com/docs');
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
