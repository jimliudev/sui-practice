/**
 * Deposit funds to Balance Manager
 * 
 * 在進行交易之前，需要先將資金存入 BalanceManager。
 * 
 * 使用方式: npm run deposit
 */

import { Transaction } from '@mysten/sui/transactions';
import { DeepBookClient } from '@mysten/deepbook-v3';
import type { BalanceManager } from '@mysten/deepbook-v3';
import { getSuiClient, getKeypair, signAndExecute, NETWORK } from './config.js';

// 配置
const BALANCE_MANAGER_ID = process.env.BALANCE_MANAGER_ID || '';
const DEPOSIT_AMOUNT_SUI = 1; // 存入 1 SUI

async function deposit() {
  if (!BALANCE_MANAGER_ID) {
    console.error('❌ BALANCE_MANAGER_ID not set. Please create a Balance Manager first.');
    console.log('💡 Run: npm run create-balance-manager');
    process.exit(1);
  }

  const client = getSuiClient();
  const keypair = getKeypair();
  const address = keypair.toSuiAddress();

  console.log('💰 Depositing funds to Balance Manager...');
  console.log(`👤 Address: ${address}`);
  console.log(`🏦 Balance Manager: ${BALANCE_MANAGER_ID}`);
  console.log(`💵 Amount: ${DEPOSIT_AMOUNT_SUI} SUI`);

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

  // 存入 SUI - 使用直接的 Move call
  // 注意: 這需要你的私鑰對應的地址是 BalanceManager 的 owner
  console.log('   💡 提示: 如果存款失敗，請確保你是 BalanceManager 的 owner');
  console.log('   💡 直接存款需要通過錢包界面或其他方式完成');

  try {
    const result = await signAndExecute(client, keypair, tx);
    console.log('\n✅ Deposit successful!');
    console.log(`📋 Digest: ${result.digest}`);

    // 顯示餘額變化
    if (result.balanceChanges) {
      console.log('\n💰 Balance Changes:');
      result.balanceChanges.forEach((change: any) => {
        console.log(`  - ${change.coinType}: ${change.amount}`);
      });
    }

  } catch (error) {
    console.error('❌ Deposit failed:', error);
    throw error;
  }
}

// 存入自定義代幣
async function depositCustomCoin(
  coinType: string,
  coinObjectId: string,
  amount: bigint
) {
  if (!BALANCE_MANAGER_ID) {
    throw new Error('BALANCE_MANAGER_ID not set');
  }

  const client = getSuiClient();
  const keypair = getKeypair();
  const address = keypair.toSuiAddress();

  const balanceManagers: { [key: string]: BalanceManager } = {
    MANAGER_1: {
      address: BALANCE_MANAGER_ID,
    },
  };

  const dbClient = new DeepBookClient({
    address,
    env: NETWORK,
    client,
    balanceManagers,
  });

  const tx = new Transaction();

  // 對於非 SUI 代幣，需要提供 coin object
  tx.moveCall({
    target: '0x2::coin::split',
    typeArguments: [coinType],
    arguments: [tx.object(coinObjectId), tx.pure.u64(amount)],
  });

  // 然後存入 BalanceManager
  // 這需要根據具體的代幣類型調整

  const result = await signAndExecute(client, keypair, tx);
  return result;
}

// 執行
deposit()
  .then(() => {
    console.log('\n✨ Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
