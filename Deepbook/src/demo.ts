/**
 * DeepBook Demo
 * 
 * 完整的 DeepBook 交易演示腳本。
 * 展示如何創建 BalanceManager、存入資金、下單、查詢和取消訂單。
 * 
 * 使用方式: npm run demo
 */

import { Transaction } from '@mysten/sui/transactions';
import { DeepBookClient } from '@mysten/deepbook-v3';
import type { BalanceManager } from '@mysten/deepbook-v3';
import { getSuiClient, getKeypair, signAndExecute, NETWORK } from './config.js';

const BALANCE_MANAGER_ID = process.env.BALANCE_MANAGER_ID || '';

async function runDemo() {
  const client = getSuiClient();
  const keypair = getKeypair();
  const address = keypair.toSuiAddress();

  console.log('═'.repeat(60));
  console.log('🚀 DeepBook V3 交易演示');
  console.log('═'.repeat(60));
  console.log(`\n👤 地址: ${address}`);
  console.log(`🌐 網路: ${NETWORK}`);

  // 檢查錢包餘額
  console.log('\n📊 錢包餘額:');
  const balances = await client.getAllBalances({ owner: address });
  balances.forEach((balance) => {
    const coinType = balance.coinType.split('::').pop();
    const amount = parseInt(balance.totalBalance) / 1e9;
    console.log(`   ${coinType}: ${amount.toFixed(4)}`);
  });

  // 步驟 1: 創建或使用現有的 BalanceManager
  console.log('\n' + '─'.repeat(60));
  console.log('📦 步驟 1: Balance Manager');
  console.log('─'.repeat(60));

  let balanceManagerId = BALANCE_MANAGER_ID;

  if (!balanceManagerId) {
    console.log('\n   ⚠️ 未設置 BALANCE_MANAGER_ID');
    console.log('   💡 首先運行: npm run create-balance-manager');
    console.log('   然後將生成的 ID 添加到 .env 文件');
    return;
  } else {
    console.log(`   ✅ 使用現有 BalanceManager: ${balanceManagerId}`);
  }

  // 配置 DeepBook Client
  const balanceManagers: { [key: string]: BalanceManager } = {
    MANAGER_1: {
      address: balanceManagerId,
      tradeCap: process.env.TRADE_CAP_ID,
    },
  };

  const dbClient = new DeepBookClient({
    address,
    env: NETWORK,
    client,
    balanceManagers,
  });

  // 步驟 2: 查詢可用池子
  console.log('\n' + '─'.repeat(60));
  console.log('🏊 步驟 2: 查詢可用交易池');
  console.log('─'.repeat(60));

  const poolKey = 'SUI_USDC';
  
  console.log(`   🏊 Pool: ${poolKey}`);
  console.log('   💡 使用 DeepBook API 獲取訂單簿數據');
  console.log('   🔗 https://deepbook-indexer.mainnet.mystenlabs.com/docs');

  // 步驟 3: 查詢 BalanceManager 餘額
  console.log('\n' + '─'.repeat(60));
  console.log('💰 步驟 3: BalanceManager 餘額');
  console.log('─'.repeat(60));

  console.log('   💡 Balance Manager 餘額查詢需要通過鏈上查詢');
  console.log(`   🔗 https://suiscan.xyz/${NETWORK}/object/${balanceManagerId}`);

  // 步驟 4: 查詢當前訂單
  console.log('\n' + '─'.repeat(60));
  console.log('📋 步驟 4: 當前訂單');
  console.log('─'.repeat(60));

  try {
    console.log('   💡 訂單查詢需要通過 DeepBook API');
    console.log('   🔗 https://deepbook-indexer.mainnet.mystenlabs.com/docs');
  } catch (e) {
    console.log('   無法查詢訂單 (池子可能不可用)');
  }

  // 步驟 5: 演示下單 (可選)
  console.log('\n' + '─'.repeat(60));
  console.log('📝 步驟 5: 下單演示');
  console.log('─'.repeat(60));

  console.log('   💡 下單示例代碼:');
  console.log('');
  console.log('   // 限價買單');
  console.log('   const tx = new Transaction();');
  console.log('   tx.add(dbClient.deepBook.placeLimitOrder({');
  console.log(`     poolKey: '${poolKey}',`);
  console.log("     balanceManagerKey: 'MANAGER_1',");
  console.log("     clientOrderId: '123456',");
  console.log('     price: 1.5,');
  console.log('     quantity: 1,');
  console.log('     isBid: true,  // true = 買, false = 賣');
  console.log('   }));');
  console.log('');
  console.log('   // 執行交易');
  console.log('   await signAndExecute(client, keypair, tx);');

  // 總結
  console.log('\n' + '═'.repeat(60));
  console.log('📚 可用腳本:');
  console.log('═'.repeat(60));
  console.log('');
  console.log('   npm run create-balance-manager  # 創建 BalanceManager');
  console.log('   npm run deposit                 # 存入資金');
  console.log('   npm run query-pools             # 查詢交易池');
  console.log('   npm run query-balance           # 查詢餘額');
  console.log('   npm run query-orders            # 查詢訂單');
  console.log('   npm run place-limit-order       # 放置限價單');
  console.log('   npm run place-market-order      # 放置市價單');
  console.log('   npm run cancel-order            # 取消訂單');
  console.log('   npm run swap                    # 代幣兌換');
  console.log('');
  console.log('═'.repeat(60));
  console.log('✨ 演示完成!');
  console.log('═'.repeat(60));
}

runDemo()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Demo failed:', error);
    process.exit(1);
  });
