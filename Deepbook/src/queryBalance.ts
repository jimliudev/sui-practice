/**
 * Query Balance Manager
 * 
 * 查詢 BalanceManager 中的餘額。
 * 
 * 使用方式: npm run query-balance
 */

import { DeepBookClient } from '@mysten/deepbook-v3';
import type { BalanceManager } from '@mysten/deepbook-v3';
import { getSuiClient, getKeypair, NETWORK, parseAmount } from './config.js';

// 配置
const BALANCE_MANAGER_ID = process.env.BALANCE_MANAGER_ID || '';

async function queryBalance() {
  if (!BALANCE_MANAGER_ID) {
    console.error('❌ BALANCE_MANAGER_ID not set. Please create a Balance Manager first.');
    console.log('💡 Run: npm run create-balance-manager');
    process.exit(1);
  }

  const client = getSuiClient();
  const keypair = getKeypair();
  const address = keypair.toSuiAddress();

  console.log('💰 Querying Balance Manager...');
  console.log(`👤 Address: ${address}`);
  console.log(`🏦 Balance Manager: ${BALANCE_MANAGER_ID}`);
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

  console.log('\n📊 Balances:');
  console.log('='.repeat(50));

  // 查詢常見代幣餘額
  const coins = ['SUI', 'DEEP', 'USDC', 'USDT'];

  console.log('  💡 Balance Manager 餘額查詢需要通過鏈上查詢');
  console.log('  💡 請使用 Sui Explorer 查看 Balance Manager 對象');
  console.log(`  🔗 https://suiscan.xyz/${NETWORK}/object/${BALANCE_MANAGER_ID}`);

  console.log('='.repeat(50));

  // 也查詢錢包餘額作為對比
  console.log('\n📊 Wallet Balances (for reference):');
  console.log('='.repeat(50));

  try {
    const walletBalances = await client.getAllBalances({ owner: address });
    for (const balance of walletBalances) {
      const coinType = balance.coinType.split('::').pop() || balance.coinType;
      const decimals = coinType === 'USDC' || coinType === 'USDT' ? 6 : 9;
      const formattedBalance = parseAmount(BigInt(balance.totalBalance), decimals);
      console.log(`  ${coinType}: ${formattedBalance}`);
    }
  } catch (error) {
    console.error('Failed to fetch wallet balances');
  }

  console.log('='.repeat(50));
}

// 查詢特定池子中的餘額
async function queryPoolBalances(poolKey: string) {
  if (!BALANCE_MANAGER_ID) {
    throw new Error('BALANCE_MANAGER_ID not set');
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

  console.log(`\n🏊 Pool: ${poolKey} Balances`);
  console.log('='.repeat(50));

  console.log('  💡 Pool 餘額查詢需要通過鏈上查詢');
  console.log(`  🔗 請使用 Sui Explorer 查看相關池子信息`);
}

// 執行
const args = process.argv.slice(2);
const specificPool = args[0];

if (specificPool) {
  queryPoolBalances(specificPool)
    .then(() => {
      console.log('\n✨ Done!');
      process.exit(0);
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
} else {
  queryBalance()
    .then(() => {
      console.log('\n✨ Done!');
      process.exit(0);
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

export { queryBalance, queryPoolBalances };
