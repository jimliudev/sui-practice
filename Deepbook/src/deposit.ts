/**
 * Deposit funds to Balance Manager
 * 
 * 在進行交易之前，需要先將資金存入 BalanceManager。
 * 
 * 使用方式: 
 *   npm run deposit -- --coin SUI --amount 10
 *   npm run deposit -- --coin TEST01_COIN --amount 100
 */

import { Transaction } from '@mysten/sui/transactions';
import { DeepBookClient } from '@mysten/deepbook-v3';
import type { BalanceManager } from '@mysten/deepbook-v3';
import { getSuiClient, getKeypair, signAndExecute, NETWORK, formatAmount } from './config.js';

// 配置
const BALANCE_MANAGER_ID = process.env.BALANCE_MANAGER_ID || '';

// 代幣類型映射
const COIN_TYPES: { [key: string]: { type: string; decimals: number } } = {
  SUI: {
    type: '0x2::sui::SUI',
    decimals: 9,
  },
  DBUSDC: {
    type: '0xf7152c05930480cd740d7311b5b8b45c6f488e3a53a11c3f74a6fac36a52e0d7::DBUSDC::DBUSDC',
    decimals: 6,
  },
  DEEP: {
    type: '0x36dbef866a1d62bf7328989a10fb2f07d769f4ee587c0de4a0a256e57e0a58a8::deep::DEEP',
    decimals: 6,
  },
  TEST01_COIN: {
    type: '0xc141f2d7399f14a7c0334fdf655f8e7d4176e21331da9187a5ff20d20737fb39::test01_coin::TEST01_COIN',
    decimals: 9,
  },
};

interface DepositParams {
  coinKey: string;   // 代幣 key (如 'SUI', 'TEST01_COIN')
  amount: number;    // 存入數量
}

async function deposit(params: DepositParams) {
  if (!BALANCE_MANAGER_ID) {
    console.error('❌ BALANCE_MANAGER_ID not set. Please create a Balance Manager first.');
    console.log('💡 Run: npm run create-balance-manager');
    process.exit(1);
  }

  const { coinKey, amount } = params;

  // 檢查代幣是否支持
  const coinInfo = COIN_TYPES[coinKey];
  if (!coinInfo) {
    console.error(`❌ Unsupported coin: ${coinKey}`);
    console.log('\n💡 Supported coins:');
    Object.keys(COIN_TYPES).forEach(key => {
      console.log(`  - ${key}: ${COIN_TYPES[key].type}`);
    });
    process.exit(1);
  }

  const client = getSuiClient();
  const keypair = getKeypair();
  const address = keypair.toSuiAddress();

  console.log('💰 Depositing funds to Balance Manager...');
  console.log(`👤 Address: ${address}`);
  console.log(`🏦 Balance Manager: ${BALANCE_MANAGER_ID}`);
  console.log(`💵 Coin: ${coinKey}`);
  console.log(`📦 Amount: ${amount}`);
  console.log(`🔗 Coin Type: ${coinInfo.type}`);

  try {
    // 1. 查詢用戶的代幣
    console.log('\n🔍 Querying your coins...');
    const coins = await client.getCoins({
      owner: address,
      coinType: coinInfo.type,
    });

    if (!coins.data || coins.data.length === 0) {
      console.error(`❌ No ${coinKey} found in your wallet`);
      console.log(`💡 Make sure you have ${coinKey} in your wallet`);
      process.exit(1);
    }

    console.log(`✅ Found ${coins.data.length} ${coinKey} coin(s)`);

    // 計算總餘額
    const totalBalance = coins.data.reduce((sum, coin) => sum + BigInt(coin.balance), 0n);
    const totalBalanceFormatted = Number(totalBalance) / Math.pow(10, coinInfo.decimals);
    console.log(`💰 Total Balance: ${totalBalanceFormatted} ${coinKey}`);

    // 2. 創建交易
    const tx = new Transaction();

    // 轉換金額為最小單位
    const depositAmountRaw = formatAmount(amount, coinInfo.decimals);
    console.log(`\n📝 Deposit amount (raw): ${depositAmountRaw}`);

    if (depositAmountRaw > totalBalance) {
      console.error(`❌ Insufficient balance. You have ${totalBalanceFormatted} ${coinKey}, but trying to deposit ${amount} ${coinKey}`);
      process.exit(1);
    }

    // 3. 合併代幣並分割出需要的數量
    let coinToDeposit;

    if (coins.data.length === 1 && BigInt(coins.data[0].balance) === depositAmountRaw) {
      // 如果只有一個幣且金額剛好，直接使用
      coinToDeposit = tx.object(coins.data[0].coinObjectId);
    } else {
      // 否則需要合併和分割
      const [firstCoin, ...restCoins] = coins.data;

      // 合併所有代幣到第一個
      if (restCoins.length > 0) {
        tx.mergeCoins(
          tx.object(firstCoin.coinObjectId),
          restCoins.map(coin => tx.object(coin.coinObjectId))
        );
      }

      // 分割出需要的數量
      coinToDeposit = tx.splitCoins(
        tx.object(firstCoin.coinObjectId),
        [tx.pure.u64(depositAmountRaw)]
      )[0];
    }

    // 4. 存入 Balance Manager
    // DeepBook 的 deposit 函數
    const DEEPBOOK_PACKAGE = '0xfb28c4cbc6865bd1c897d26aecbe1f8792d1509a20ffec692c800660cbec6982';

    tx.moveCall({
      target: `${DEEPBOOK_PACKAGE}::balance_manager::deposit`,
      typeArguments: [coinInfo.type],
      arguments: [
        tx.object(BALANCE_MANAGER_ID),
        coinToDeposit,
      ],
    });

    console.log('\n📤 Submitting transaction...');
    const result = await signAndExecute(client, keypair, tx);

    console.log('\n✅ Deposit successful!');
    console.log(`📋 Digest: ${result.digest}`);
    console.log(`🔗 Explorer: https://testnet.suivision.xyz/txblock/${result.digest}`);

    // 顯示餘額變化
    if (result.balanceChanges) {
      console.log('\n💰 Balance Changes:');
      result.balanceChanges.forEach((change: any) => {
        const amount = Number(change.amount) / 1e9; // 簡化顯示
        console.log(`  ${change.coinType.split('::').pop()}: ${amount > 0 ? '+' : ''}${amount.toFixed(4)}`);
      });
    }

    console.log('\n💡 Next steps:');
    console.log('  1. Check your balance: npm run query-balance');
    console.log('  2. Place orders: npm run place-limit-order -- --pool TEST01_COIN_DBUSDC --price 1.5 --quantity 10 --side sell');

  } catch (error: any) {
    console.error('\n❌ Deposit failed:', error.message || error);

    if (error.message?.includes('InsufficientBalance')) {
      console.log('\n💡 You don\'t have enough coins to deposit');
    } else if (error.message?.includes('ObjectNotFound')) {
      console.log('\n💡 Balance Manager not found. Make sure BALANCE_MANAGER_ID is correct');
    }

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
    coinKey: params.coin || 'SUI',
    amount: parseFloat(params.amount || '1'),
  };
}

// 執行
const parsedParams = parseArgs();

if (parsedParams) {
  deposit(parsedParams)
    .then(() => {
      console.log('\n✨ Done!');
      process.exit(0);
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
} else {
  console.log('📖 Deposit funds to Balance Manager');
  console.log('═'.repeat(60));
  console.log('\n💡 Usage:');
  console.log('  npm run deposit -- --coin <COIN_KEY> --amount <AMOUNT>');
  console.log('\n📋 Examples:');
  console.log('  npm run deposit -- --coin SUI --amount 10');
  console.log('  npm run deposit -- --coin TEST01_COIN --amount 100');
  console.log('  npm run deposit -- --coin DBUSDC --amount 500');
  console.log('\n📋 Supported coins:');
  Object.keys(COIN_TYPES).forEach(key => {
    console.log(`  - ${key}`);
  });
  console.log('\n' + '═'.repeat(60));
  process.exit(0);
}

export { deposit };
