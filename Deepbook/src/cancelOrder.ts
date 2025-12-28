/**
 * Cancel Order
 * 
 * 取消 DeepBook 上的訂單。
 * 
 * 使用方式: npm run cancel-order
 */

import { Transaction } from '@mysten/sui/transactions';
import { DeepBookClient } from '@mysten/deepbook-v3';
import type { BalanceManager } from '@mysten/deepbook-v3';
import { getSuiClient, getKeypair, signAndExecute, NETWORK } from './config.js';

// 配置
const BALANCE_MANAGER_ID = process.env.BALANCE_MANAGER_ID || '';

interface CancelOrderParams {
  poolKey: string;
  orderId: string; // Order ID (u128)
}

async function cancelOrder(params: CancelOrderParams) {
  if (!BALANCE_MANAGER_ID) {
    console.error('❌ BALANCE_MANAGER_ID not set.');
    process.exit(1);
  }

  const { poolKey, orderId } = params;

  const client = getSuiClient();
  const keypair = getKeypair();
  const address = keypair.toSuiAddress();

  console.log('❌ Canceling Order...');
  console.log(`👤 Address: ${address}`);
  console.log(`🏦 Balance Manager: ${BALANCE_MANAGER_ID}`);
  console.log(`🏊 Pool: ${poolKey}`);
  console.log(`📋 Order ID: ${orderId}`);

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

  const tx = new Transaction();

  // 取消訂單 - 使用正確的 SDK API
  dbClient.deepBook.cancelOrder(
    poolKey,
    'MANAGER_1',
    orderId,
  )(tx);

  try {
    const result = await signAndExecute(client, keypair, tx);
    console.log('\n✅ Order canceled successfully!');
    console.log(`📋 Digest: ${result.digest}`);

    // 解析取消事件
    if (result.events) {
      console.log('\n📊 Cancel Events:');
      result.events.forEach((event: any) => {
        if (event.type.includes('OrderCanceled')) {
          console.log(`  Event: ${event.type.split('::').pop()}`);
          if (event.parsedJson) {
            console.log(`  Order ID: ${event.parsedJson.order_id}`);
            console.log(`  Canceled Quantity: ${event.parsedJson.base_asset_quantity_canceled}`);
          }
        }
      });
    }

    return result;
  } catch (error) {
    console.error('❌ Failed to cancel order:', error);
    throw error;
  }
}

// 取消所有訂單
async function cancelAllOrders(poolKey: string) {
  if (!BALANCE_MANAGER_ID) {
    console.error('❌ BALANCE_MANAGER_ID not set.');
    process.exit(1);
  }

  const client = getSuiClient();
  const keypair = getKeypair();
  const address = keypair.toSuiAddress();

  console.log('❌ Canceling All Orders...');
  console.log(`👤 Address: ${address}`);
  console.log(`🏦 Balance Manager: ${BALANCE_MANAGER_ID}`);
  console.log(`🏊 Pool: ${poolKey}`);

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

  const tx = new Transaction();

  // 取消所有訂單 - 使用正確的 SDK API
  dbClient.deepBook.cancelAllOrders(
    poolKey,
    'MANAGER_1',
  )(tx);

  try {
    const result = await signAndExecute(client, keypair, tx);
    console.log('\n✅ All orders canceled successfully!');
    console.log(`📋 Digest: ${result.digest}`);

    // 統計取消的訂單數
    let canceledCount = 0;
    if (result.events) {
      result.events.forEach((event: any) => {
        if (event.type.includes('OrderCanceled')) {
          canceledCount++;
        }
      });
      console.log(`\n📊 Canceled ${canceledCount} orders`);
    }

    return result;
  } catch (error) {
    console.error('❌ Failed to cancel all orders:', error);
    throw error;
  }
}

// 取消多個訂單
async function cancelMultipleOrders(poolKey: string, orderIds: string[]) {
  if (!BALANCE_MANAGER_ID) {
    console.error('❌ BALANCE_MANAGER_ID not set.');
    process.exit(1);
  }

  const client = getSuiClient();
  const keypair = getKeypair();
  const address = keypair.toSuiAddress();

  console.log('❌ Canceling Multiple Orders...');
  console.log(`👤 Address: ${address}`);
  console.log(`🏊 Pool: ${poolKey}`);
  console.log(`📋 Order IDs: ${orderIds.join(', ')}`);

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

  const tx = new Transaction();

  // 批量取消訂單 - 使用正確的 SDK API
  for (const orderId of orderIds) {
    dbClient.deepBook.cancelOrder(
      poolKey,
      'MANAGER_1',
      orderId,
    )(tx);
  }

  try {
    const result = await signAndExecute(client, keypair, tx);
    console.log('\n✅ Orders canceled successfully!');
    console.log(`📋 Digest: ${result.digest}`);
    return result;
  } catch (error) {
    console.error('❌ Failed to cancel orders:', error);
    throw error;
  }
}

// 解析命令行參數
function parseArgs() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    return null;
  }

  const params: any = {};
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i].replace('--', '');
    const value = args[i + 1];
    params[key] = value;
  }

  return {
    poolKey: params.pool || 'SUI_USDC',
    orderId: params.orderId,
    cancelAll: params.all === 'true',
  };
}

// 執行
const parsedParams = parseArgs();

if (parsedParams) {
  if (parsedParams.cancelAll) {
    cancelAllOrders(parsedParams.poolKey)
      .then(() => {
        console.log('\n✨ Done!');
        process.exit(0);
      })
      .catch((error) => {
        console.error(error);
        process.exit(1);
      });
  } else if (parsedParams.orderId) {
    cancelOrder({
      poolKey: parsedParams.poolKey,
      orderId: parsedParams.orderId,
    })
      .then(() => {
        console.log('\n✨ Done!');
        process.exit(0);
      })
      .catch((error) => {
        console.error(error);
        process.exit(1);
      });
  } else {
    console.log('❌ Please provide --orderId or --all true');
    process.exit(1);
  }
} else {
  console.log('📖 Cancel Order Usage:');
  console.log('  Cancel specific order:');
  console.log('    npm run cancel-order -- --pool SUI_USDC --orderId 123456789');
  console.log('');
  console.log('  Cancel all orders:');
  console.log('    npm run cancel-order -- --pool SUI_USDC --all true');
  process.exit(0);
}

export { cancelOrder, cancelAllOrders, cancelMultipleOrders };
