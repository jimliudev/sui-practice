/**
 * Place Limit Order
 * 
 * 在 DeepBook 上放置限價訂單。
 * 限價訂單會以指定的價格（或更好的價格）執行。
 * 
 * 使用方式: npm run place-limit-order
 */

import { Transaction } from '@mysten/sui/transactions';
import { DeepBookClient } from '@mysten/deepbook-v3';
import type { BalanceManager } from '@mysten/deepbook-v3';
import { getSuiClient, getKeypair, signAndExecute, NETWORK } from './config.js';

// 配置
const BALANCE_MANAGER_ID = process.env.BALANCE_MANAGER_ID || '';

// 訂單類型常量
const ORDER_TYPES = {
  NO_RESTRICTION: 0,      // 無限制
  IMMEDIATE_OR_CANCEL: 1, // 立即成交否則取消
  FILL_OR_KILL: 2,        // 全部成交否則取消
  POST_ONLY: 3,           // 只做 Maker
};

// 自我匹配選項
const SELF_MATCHING_OPTIONS = {
  SELF_MATCHING_ALLOWED: 0, // 允許自我匹配
  CANCEL_TAKER: 1,          // 取消 Taker 訂單
  CANCEL_MAKER: 2,          // 取消 Maker 訂單
};

interface PlaceLimitOrderParams {
  poolKey: string;
  price: number;      // 價格
  quantity: number;   // 數量 (base asset)
  isBid: boolean;     // true = 買入, false = 賣出
  orderType?: number;
  payWithDeep?: boolean;
  clientOrderId?: string;
}

async function placeLimitOrder(params: PlaceLimitOrderParams) {
  if (!BALANCE_MANAGER_ID) {
    console.error('❌ BALANCE_MANAGER_ID not set. Please create a Balance Manager first.');
    console.log('💡 Run: npm run create-balance-manager');
    process.exit(1);
  }

  const {
    poolKey,
    price,
    quantity,
    isBid,
    orderType = ORDER_TYPES.NO_RESTRICTION,
    payWithDeep = false,  // 改為 false，用 SUI 支付手續費
    clientOrderId = Date.now().toString(),
  } = params;

  const client = getSuiClient();
  const keypair = getKeypair();
  const address = keypair.toSuiAddress();

  console.log('📝 Placing Limit Order...');
  console.log(`👤 Address: ${address}`);
  console.log(`🏦 Balance Manager: ${BALANCE_MANAGER_ID}`);
  console.log(`🏊 Pool: ${poolKey}`);
  console.log(`📊 Side: ${isBid ? 'BUY' : 'SELL'}`);
  console.log(`💰 Price: ${price}`);
  console.log(`📦 Quantity: ${quantity}`);
  console.log(`📋 Order Type: ${Object.keys(ORDER_TYPES)[orderType]}`);
  console.log(`💎 Pay with DEEP: ${payWithDeep}`);

  // 配置 BalanceManager
  const balanceManagers: { [key: string]: BalanceManager } = {
    MANAGER_1: {
      address: BALANCE_MANAGER_ID,
      tradeCap: process.env.TRADE_CAP_ID,
    },
  };

  // 自定義代幣配置
  const customCoins = {
    DEEP: {
      address: '0x36dbef866a1d62bf7328989a10fb2f07d769f4ee587c0de4a0a256e57e0a58a8',
      type: '0x36dbef866a1d62bf7328989a10fb2f07d769f4ee587c0de4a0a256e57e0a58a8::deep::DEEP',
      scalar: 1e6,
    },
    SUI: {
      address: '0x0000000000000000000000000000000000000000000000000000000000000002',
      type: '0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI',
      scalar: 1e9,
    },
    DBUSDC: {
      address: '0xf7152c05930480cd740d7311b5b8b45c6f488e3a53a11c3f74a6fac36a52e0d7',
      type: '0xf7152c05930480cd740d7311b5b8b45c6f488e3a53a11c3f74a6fac36a52e0d7::DBUSDC::DBUSDC',
      scalar: 1e6,
    },
    TEST01_COIN: {
      address: '0xc141f2d7399f14a7c0334fdf655f8e7d4176e21331da9187a5ff20d20737fb39',
      type: '0xc141f2d7399f14a7c0334fdf655f8e7d4176e21331da9187a5ff20d20737fb39::test01_coin::TEST01_COIN',
      scalar: 1e9,
    },
  };

  // 自定義池子配置
  const customPools = {
    TEST01_COIN_DBUSDC: {
      address: '0x9c73295c437151ee5ded33df815faebd1e7b13d794af60feda201a226ad680d6',
      baseCoin: 'TEST01_COIN',
      quoteCoin: 'DBUSDC',
    },
  };

  const dbClient = new DeepBookClient({
    address,
    env: NETWORK,
    client,
    balanceManagers,
    coins: customCoins,
    pools: customPools,
  });

  const tx = new Transaction();

  // 放置限價訂單
  tx.add(
    dbClient.deepBook.placeLimitOrder({
      poolKey,
      balanceManagerKey: 'MANAGER_1',
      clientOrderId,
      price,
      quantity,
      isBid,
      orderType,
      selfMatchingOption: SELF_MATCHING_OPTIONS.SELF_MATCHING_ALLOWED,
      payWithDeep,
    })
  );

  try {
    const result = await signAndExecute(client, keypair, tx);
    console.log('\n✅ Limit Order placed successfully!');
    console.log(`📋 Digest: ${result.digest}`);

    // 解析訂單事件
    if (result.events) {
      console.log('\n📊 Order Events:');
      result.events.forEach((event: any) => {
        if (event.type.includes('OrderPlaced') || event.type.includes('OrderFilled')) {
          console.log(`  Event: ${event.type.split('::').pop()}`);
          if (event.parsedJson) {
            console.log(`  Order ID: ${event.parsedJson.order_id}`);
            console.log(`  Price: ${event.parsedJson.price}`);
            console.log(`  Quantity: ${event.parsedJson.placed_quantity || event.parsedJson.base_quantity}`);
          }
        }
      });
    }

    return result;
  } catch (error) {
    console.error('❌ Failed to place limit order:', error);
    throw error;
  }
}

// 放置買單 (Bid)
async function placeBuyOrder(poolKey: string, price: number, quantity: number) {
  return placeLimitOrder({
    poolKey,
    price,
    quantity,
    isBid: true,
  });
}

// 放置賣單 (Ask)
async function placeSellOrder(poolKey: string, price: number, quantity: number) {
  return placeLimitOrder({
    poolKey,
    price,
    quantity,
    isBid: false,
  });
}

// 範例: 在 SUI/USDC 池子放置買單
async function exampleBuyOrder() {
  const poolKey = 'SUI_USDC';
  const price = 1.5;      // 1.5 USDC per SUI
  const quantity = 1;     // 買 1 SUI

  console.log('\n📌 Example: Placing a BUY order');
  console.log(`   Pool: ${poolKey}`);
  console.log(`   Price: ${price} USDC/SUI`);
  console.log(`   Quantity: ${quantity} SUI`);
  console.log(`   Total Cost: ~${price * quantity} USDC + fees`);

  return placeBuyOrder(poolKey, price, quantity);
}

// 範例: 在 SUI/USDC 池子放置賣單
async function exampleSellOrder() {
  const poolKey = 'SUI_USDC';
  const price = 5.0;      // 5.0 USDC per SUI
  const quantity = 1;     // 賣 1 SUI

  console.log('\n📌 Example: Placing a SELL order');
  console.log(`   Pool: ${poolKey}`);
  console.log(`   Price: ${price} USDC/SUI`);
  console.log(`   Quantity: ${quantity} SUI`);
  console.log(`   Total Receive: ~${price * quantity} USDC - fees`);

  return placeSellOrder(poolKey, price, quantity);
}

// 解析命令行參數
function parseArgs() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    return null; // 使用範例
  }

  const params: any = {};
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i].replace('--', '');
    const value = args[i + 1];
    params[key] = value;
  }

  return {
    poolKey: params.pool || 'SUI_USDC',
    price: parseFloat(params.price || '1'),
    quantity: parseFloat(params.quantity || '1'),
    isBid: params.side?.toLowerCase() !== 'sell',
  };
}

// 執行
const parsedParams = parseArgs();

if (parsedParams) {
  placeLimitOrder(parsedParams)
    .then(() => {
      console.log('\n✨ Done!');
      process.exit(0);
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
} else {
  // 運行範例
  console.log('📖 No parameters provided. Running example...');
  console.log('💡 Usage: npm run place-limit-order -- --pool SUI_USDC --price 1.5 --quantity 1 --side buy');

  exampleBuyOrder()
    .then(() => {
      console.log('\n✨ Done!');
      process.exit(0);
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

export { placeLimitOrder, placeBuyOrder, placeSellOrder, ORDER_TYPES, SELF_MATCHING_OPTIONS };
