/**
 * Swap (無需 BalanceManager)
 * 
 * 使用 DeepBook 進行代幣兌換。
 * Swap 是唯一不需要 BalanceManager 的交易操作。
 * 
 * 使用方式: npm run swap
 */

import { Transaction } from '@mysten/sui/transactions';
import { DeepBookClient } from '@mysten/deepbook-v3';
import { getSuiClient, getKeypair, signAndExecute, NETWORK } from './config.js';

interface SwapParams {
  poolKey: string;
  amount: number;        // 輸入數量
  minOut?: number;       // 最小輸出數量 (滑點保護)
  isBaseToQuote: boolean; // true = Base->Quote, false = Quote->Base
}

// Base -> Quote (例如: SUI -> USDC)
async function swapBaseForQuote(poolKey: string, amount: number, minOut: number = 0) {
  const client = getSuiClient();
  const keypair = getKeypair();
  const address = keypair.toSuiAddress();

  console.log('🔄 Swapping Base for Quote...');
  console.log(`👤 Address: ${address}`);
  console.log(`🏊 Pool: ${poolKey}`);
  console.log(`📦 Amount In (Base): ${amount}`);
  console.log(`📦 Min Out (Quote): ${minOut}`);

  const dbClient = new DeepBookClient({
    address,
    env: NETWORK,
    client,
  });

  const tx = new Transaction();

  // Swap Base for Quote (例如: SUI -> USDC)
  const [baseOut, quoteOut, deepOut] = tx.add(
    dbClient.deepBook.swapExactBaseForQuote({
      poolKey,
      amount,
      deepAmount: 0,
      minOut,
    })
  );

  // 將輸出轉給自己
  tx.transferObjects([baseOut, quoteOut, deepOut], address);

  try {
    const result = await signAndExecute(client, keypair, tx);
    console.log('\n✅ Swap successful!');
    console.log(`📋 Digest: ${result.digest}`);

    // 顯示餘額變化
    if (result.balanceChanges) {
      console.log('\n💰 Balance Changes:');
      result.balanceChanges.forEach((change: any) => {
        const coinType = change.coinType.split('::').pop();
        const amount = parseFloat(change.amount);
        const sign = amount >= 0 ? '+' : '';
        console.log(`  ${coinType}: ${sign}${amount}`);
      });
    }

    return result;
  } catch (error) {
    console.error('❌ Swap failed:', error);
    throw error;
  }
}

// Quote -> Base (例如: USDC -> SUI)
async function swapQuoteForBase(poolKey: string, amount: number, minOut: number = 0) {
  const client = getSuiClient();
  const keypair = getKeypair();
  const address = keypair.toSuiAddress();

  console.log('🔄 Swapping Quote for Base...');
  console.log(`👤 Address: ${address}`);
  console.log(`🏊 Pool: ${poolKey}`);
  console.log(`📦 Amount In (Quote): ${amount}`);
  console.log(`📦 Min Out (Base): ${minOut}`);

  const dbClient = new DeepBookClient({
    address,
    env: NETWORK,
    client,
  });

  const tx = new Transaction();

  // Swap Quote for Base (例如: USDC -> SUI)
  const [baseOut, quoteOut, deepOut] = tx.add(
    dbClient.deepBook.swapExactQuoteForBase({
      poolKey,
      amount,
      deepAmount: 0,
      minOut,
    })
  );

  // 將輸出轉給自己
  tx.transferObjects([baseOut, quoteOut, deepOut], address);

  try {
    const result = await signAndExecute(client, keypair, tx);
    console.log('\n✅ Swap successful!');
    console.log(`📋 Digest: ${result.digest}`);

    if (result.balanceChanges) {
      console.log('\n💰 Balance Changes:');
      result.balanceChanges.forEach((change: any) => {
        const coinType = change.coinType.split('::').pop();
        const amount = parseFloat(change.amount);
        const sign = amount >= 0 ? '+' : '';
        console.log(`  ${coinType}: ${sign}${amount}`);
      });
    }

    return result;
  } catch (error) {
    console.error('❌ Swap failed:', error);
    throw error;
  }
}

// 估算 Swap 輸出
async function estimateSwap(poolKey: string, amount: number, isBaseToQuote: boolean) {
  const client = getSuiClient();
  const keypair = getKeypair();
  const address = keypair.toSuiAddress();

  const dbClient = new DeepBookClient({
    address,
    env: NETWORK,
    client,
  });

  console.log(`\n📊 Estimating Swap for ${poolKey}...`);
  console.log(`   Direction: ${isBaseToQuote ? 'Base -> Quote' : 'Quote -> Base'}`);
  console.log(`   Amount: ${amount}`);

  console.log('\n   💡 Swap 估算需要通過 DeepBook API 獲取訂單簿数據');
  console.log('   💡 請直接執行 swap 並設置合理的 minOut');
  
  return { output: 0, unfilled: amount };
}

// 範例
async function exampleSwap() {
  const poolKey = 'SUI_USDC';
  
  console.log('\n📌 Example: Swap 0.1 SUI for USDC');
  
  // 先估算
  await estimateSwap(poolKey, 0.1, true);

  // 執行 swap (注意: 這會實際執行交易)
  // return swapBaseForQuote(poolKey, 0.1, 0);
  console.log('\n💡 Uncomment the return statement to actually execute the swap');
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
    amount: parseFloat(params.amount || '0.1'),
    direction: params.direction || 'base-to-quote',
    minOut: parseFloat(params.minOut || '0'),
    estimate: params.estimate === 'true',
  };
}

// 執行
const parsedParams = parseArgs();

if (parsedParams) {
  if (parsedParams.estimate) {
    estimateSwap(
      parsedParams.poolKey,
      parsedParams.amount,
      parsedParams.direction === 'base-to-quote'
    )
      .then(() => {
        console.log('\n✨ Done!');
        process.exit(0);
      })
      .catch((error) => {
        console.error(error);
        process.exit(1);
      });
  } else if (parsedParams.direction === 'base-to-quote') {
    swapBaseForQuote(parsedParams.poolKey, parsedParams.amount, parsedParams.minOut)
      .then(() => {
        console.log('\n✨ Done!');
        process.exit(0);
      })
      .catch((error) => {
        console.error(error);
        process.exit(1);
      });
  } else {
    swapQuoteForBase(parsedParams.poolKey, parsedParams.amount, parsedParams.minOut)
      .then(() => {
        console.log('\n✨ Done!');
        process.exit(0);
      })
      .catch((error) => {
        console.error(error);
        process.exit(1);
      });
  }
} else {
  console.log('📖 Swap Usage:');
  console.log('');
  console.log('  Estimate swap:');
  console.log('    npm run swap -- --pool SUI_USDC --amount 1 --direction base-to-quote --estimate true');
  console.log('');
  console.log('  Execute swap (Base -> Quote, e.g., SUI -> USDC):');
  console.log('    npm run swap -- --pool SUI_USDC --amount 1 --direction base-to-quote');
  console.log('');
  console.log('  Execute swap (Quote -> Base, e.g., USDC -> SUI):');
  console.log('    npm run swap -- --pool SUI_USDC --amount 10 --direction quote-to-base');
  console.log('');
  
  exampleSwap()
    .then(() => {
      console.log('\n✨ Done!');
      process.exit(0);
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

export { swapBaseForQuote, swapQuoteForBase, estimateSwap };
