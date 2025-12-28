/**
 * Place Market Order
 * 
 * 在 DeepBook 上放置市價訂單。
 * 市價訂單會以當前最佳價格立即執行。
 * 
 * 使用方式: npm run place-market-order
 */

import { Transaction } from '@mysten/sui/transactions';
import { DeepBookClient } from '@mysten/deepbook-v3';
import type { BalanceManager } from '@mysten/deepbook-v3';
import { getSuiClient, getKeypair, signAndExecute, NETWORK } from './config.js';

// 配置
const BALANCE_MANAGER_ID = process.env.BALANCE_MANAGER_ID || '';

// 自我匹配選項
const SELF_MATCHING_OPTIONS = {
  SELF_MATCHING_ALLOWED: 0,
  CANCEL_TAKER: 1,
  CANCEL_MAKER: 2,
};

interface PlaceMarketOrderParams {
  poolKey: string;
  quantity: number;   // 數量 (base asset)
  isBid: boolean;     // true = 買入, false = 賣出
  payWithDeep?: boolean;
  clientOrderId?: string;
}

async function placeMarketOrder(params: PlaceMarketOrderParams) {
  if (!BALANCE_MANAGER_ID) {
    console.error('❌ BALANCE_MANAGER_ID not set. Please create a Balance Manager first.');
    console.log('💡 Run: npm run create-balance-manager');
    process.exit(1);
  }

  const {
    poolKey,
    quantity,
    isBid,
    payWithDeep = true,
    clientOrderId = Date.now().toString(),
  } = params;

  const client = getSuiClient();
  const keypair = getKeypair();
  const address = keypair.toSuiAddress();

  console.log('📝 Placing Market Order...');
  console.log(`👤 Address: ${address}`);
  console.log(`🏦 Balance Manager: ${BALANCE_MANAGER_ID}`);
  console.log(`🏊 Pool: ${poolKey}`);
  console.log(`📊 Side: ${isBid ? 'BUY' : 'SELL'}`);
  console.log(`📦 Quantity: ${quantity}`);
  console.log(`💎 Pay with DEEP: ${payWithDeep}`);

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

  // 放置市價訂單
  tx.add(
    dbClient.deepBook.placeMarketOrder({
      poolKey,
      balanceManagerKey: 'MANAGER_1',
      clientOrderId,
      quantity,
      isBid,
      selfMatchingOption: SELF_MATCHING_OPTIONS.SELF_MATCHING_ALLOWED,
      payWithDeep,
    })
  );

  try {
    const result = await signAndExecute(client, keypair, tx);
    console.log('\n✅ Market Order placed successfully!');
    console.log(`📋 Digest: ${result.digest}`);

    // 解析訂單事件
    if (result.events) {
      console.log('\n📊 Order Events:');
      result.events.forEach((event: any) => {
        if (event.type.includes('OrderFilled')) {
          console.log(`  Event: ${event.type.split('::').pop()}`);
          if (event.parsedJson) {
            console.log(`  Price: ${event.parsedJson.price}`);
            console.log(`  Base Quantity: ${event.parsedJson.base_quantity}`);
            console.log(`  Quote Quantity: ${event.parsedJson.quote_quantity}`);
          }
        }
      });
    }

    // 顯示餘額變化
    if (result.balanceChanges) {
      console.log('\n💰 Balance Changes:');
      result.balanceChanges.forEach((change: any) => {
        const coinType = change.coinType.split('::').pop();
        console.log(`  ${coinType}: ${change.amount}`);
      });
    }

    return result;
  } catch (error) {
    console.error('❌ Failed to place market order:', error);
    throw error;
  }
}

// 市價買入
async function marketBuy(poolKey: string, quantity: number) {
  return placeMarketOrder({
    poolKey,
    quantity,
    isBid: true,
  });
}

// 市價賣出
async function marketSell(poolKey: string, quantity: number) {
  return placeMarketOrder({
    poolKey,
    quantity,
    isBid: false,
  });
}

// 範例
async function exampleMarketBuy() {
  const poolKey = 'SUI_USDC';
  const quantity = 0.1; // 買 0.1 SUI

  console.log('\n📌 Example: Market BUY order');
  console.log(`   Pool: ${poolKey}`);
  console.log(`   Quantity: ${quantity} SUI`);

  return marketBuy(poolKey, quantity);
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
    quantity: parseFloat(params.quantity || '0.1'),
    isBid: params.side?.toLowerCase() !== 'sell',
  };
}

// 執行
const parsedParams = parseArgs();

if (parsedParams) {
  placeMarketOrder(parsedParams)
    .then(() => {
      console.log('\n✨ Done!');
      process.exit(0);
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
} else {
  console.log('📖 No parameters provided. Running example...');
  console.log('💡 Usage: npm run place-market-order -- --pool SUI_USDC --quantity 0.1 --side buy');
  
  exampleMarketBuy()
    .then(() => {
      console.log('\n✨ Done!');
      process.exit(0);
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

export { placeMarketOrder, marketBuy, marketSell };
