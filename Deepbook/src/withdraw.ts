/**
 * Withdraw funds from Balance Manager
 * 
 * 從 BalanceManager 提取已結算的資金到錢包。
 * 當訂單成交後，資金會進入 BalanceManager，需要手動提取。
 * 
 * 使用方式: 
 *   npm run withdraw -- --coin DBUSDC --amount 10
 *   npm run withdraw -- --coin TEST01_COIN --amount 50
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

interface WithdrawParams {
    coinKey: string;   // 代幣 key (如 'SUI', 'DBUSDC')
    amount: number;    // 提取數量
}

async function withdraw(params: WithdrawParams) {
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

    console.log('💸 Withdrawing funds from Balance Manager...');
    console.log(`👤 Address: ${address}`);
    console.log(`🏦 Balance Manager: ${BALANCE_MANAGER_ID}`);
    console.log(`💵 Coin: ${coinKey}`);
    console.log(`📦 Amount: ${amount}`);
    console.log(`🔗 Coin Type: ${coinInfo.type}`);

    try {
        // 1. 查詢 BalanceManager 中的餘額
        console.log('\n🔍 Checking Balance Manager balance...');
        const bmObject = await client.getObject({
            id: BALANCE_MANAGER_ID,
            options: {
                showContent: true,
                showType: true,
            },
        });

        if (!bmObject.data) {
            console.error('❌ Balance Manager not found');
            process.exit(1);
        }

        console.log('✅ Balance Manager found');

        // 2. 創建交易
        const tx = new Transaction();

        // 轉換金額為最小單位
        const withdrawAmountRaw = formatAmount(amount, coinInfo.decimals);
        console.log(`\n📝 Withdraw amount (raw): ${withdrawAmountRaw}`);

        // 3. 從 Balance Manager 提取
        const DEEPBOOK_PACKAGE = '0xfb28c4cbc6865bd1c897d26aecbe1f8792d1509a20ffec692c800660cbec6982';

        const withdrawnCoin = tx.moveCall({
            target: `${DEEPBOOK_PACKAGE}::balance_manager::withdraw`,
            typeArguments: [coinInfo.type],
            arguments: [
                tx.object(BALANCE_MANAGER_ID),
                tx.pure.u64(withdrawAmountRaw),
            ],
        });

        // 4. 將提取的代幣轉到用戶地址
        tx.transferObjects([withdrawnCoin], tx.pure.address(address));

        console.log('\n📤 Submitting transaction...');
        const result = await signAndExecute(client, keypair, tx);

        console.log('\n✅ Withdrawal successful!');
        console.log(`📋 Digest: ${result.digest}`);
        console.log(`🔗 Explorer: https://${NETWORK}.suivision.xyz/txblock/${result.digest}`);

        // 顯示餘額變化
        if (result.balanceChanges) {
            console.log('\n💰 Balance Changes:');
            result.balanceChanges.forEach((change: any) => {
                const changeAmount = Number(change.amount) / Math.pow(10, coinInfo.decimals);
                const coinName = change.coinType.split('::').pop();
                console.log(`  ${coinName}: ${changeAmount > 0 ? '+' : ''}${changeAmount.toFixed(4)}`);
            });
        }

        console.log('\n💡 Next steps:');
        console.log('  1. Check your wallet balance: npm run query-balance');
        console.log('  2. Check remaining Balance Manager balance: npm run query-balance');

    } catch (error: any) {
        console.error('\n❌ Withdrawal failed:', error.message || error);

        if (error.message?.includes('InsufficientBalance') || error.message?.includes('insufficient')) {
            console.log('\n💡 Insufficient balance in Balance Manager');
            console.log('💡 Check your settled balance: npm run query-balance');
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
        coinKey: params.coin || 'DBUSDC',
        amount: parseFloat(params.amount || '1'),
    };
}

// 執行
const parsedParams = parseArgs();

if (parsedParams) {
    withdraw(parsedParams)
        .then(() => {
            console.log('\n✨ Done!');
            process.exit(0);
        })
        .catch((error) => {
            console.error(error);
            process.exit(1);
        });
} else {
    console.log('📖 Withdraw funds from Balance Manager');
    console.log('═'.repeat(60));
    console.log('\n💡 Usage:');
    console.log('  npm run withdraw -- --coin <COIN_KEY> --amount <AMOUNT>');
    console.log('\n📋 Examples:');
    console.log('  npm run withdraw -- --coin DBUSDC --amount 10');
    console.log('  npm run withdraw -- --coin TEST01_COIN --amount 50');
    console.log('  npm run withdraw -- --coin SUI --amount 5');
    console.log('\n📋 Supported coins:');
    Object.keys(COIN_TYPES).forEach(key => {
        console.log(`  - ${key}`);
    });
    console.log('\n💡 Note:');
    console.log('  - 只能提取 BalanceManager 中已結算的資金');
    console.log('  - 成交後的資金會自動進入 BalanceManager');
    console.log('  - 使用 npm run query-balance 查看可提取餘額');
    console.log('\n' + '═'.repeat(60));
    process.exit(0);
}

export { withdraw };
