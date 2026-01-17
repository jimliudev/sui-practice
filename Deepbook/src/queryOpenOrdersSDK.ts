/**
 * Query Open Orders using SDK
 * 
 * 使用 DeepBook SDK 的 accountOpenOrders 方法查詢未成交訂單
 * 
 * 使用方式: npx tsx src/queryOpenOrdersSDK.ts
 */

import { DeepBookClient } from '@mysten/deepbook-v3';
import type { BalanceManager } from '@mysten/deepbook-v3';
import { getSuiClient, getKeypair, NETWORK } from './config.js';

const BALANCE_MANAGER_ID = process.env.BALANCE_MANAGER_ID || '';

async function queryOpenOrdersSDK() {
    if (!BALANCE_MANAGER_ID) {
        console.error('❌ BALANCE_MANAGER_ID not set');
        console.log('💡 Run: npm run create-balance-manager');
        process.exit(1);
    }

    const client = getSuiClient();
    const keypair = getKeypair();
    const address = keypair.toSuiAddress();

    console.log('📊 Querying Open Orders using SDK');
    console.log('═'.repeat(60));
    console.log(`👤 Address: ${address}`);
    console.log(`🏦 Balance Manager: ${BALANCE_MANAGER_ID}`);
    console.log(`🌐 Network: ${NETWORK}`);
    console.log('═'.repeat(60));

    // 配置自定義代幣和池子
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

    const customPools = {
        TEST01_COIN_DBUSDC: {
            address: '0x9c73295c437151ee5ded33df815faebd1e7b13d794af60feda201a226ad680d6',
            baseCoin: 'TEST01_COIN',
            quoteCoin: 'DBUSDC',
        },
    };

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
        coins: customCoins,
        pools: customPools,
    });

    // 查詢未成交訂單
    const poolKey = 'TEST01_COIN_DBUSDC';
    const managerKey = 'MANAGER_1';

    console.log(`\n🔍 Querying open orders for pool: ${poolKey}`);
    console.log('─'.repeat(60));

    try {
        const openOrderIds = await dbClient.accountOpenOrders(poolKey, managerKey);

        console.log(`\n✅ Query successful!`);
        console.log(`📊 Open Orders: ${openOrderIds.length} order(s)`);

        if (openOrderIds.length === 0) {
            console.log('\n📭 No open orders found');
            console.log('💡 This could mean:');
            console.log('   - All orders have been filled');
            console.log('   - Orders were cancelled');
            console.log('   - Orders are in a different pool');
        } else {
            console.log('\n📋 Order IDs:');
            openOrderIds.forEach((orderId, index) => {
                console.log(`   ${index + 1}. ${orderId}`);
            });
        }

        // 查詢池子價格
        console.log('\n💰 Querying Pool Price...');
        console.log('─'.repeat(60));
        try {
            const price = await dbClient.getPoolDeepPrice(poolKey);
            console.log(`✅ Current DEEP Price: ${price}`);
            console.log(`   (Price in DEEP tokens)`);
        } catch (e: any) {
            console.log(`⚠️ Could not get price: ${e.message}`);
            console.log(`   This is normal if the pool has no recent trades`);
        }

        // 嘗試查詢其他已知池子
        console.log('\n🔍 Checking other pools...');
        const otherPools = ['SUI_USDC', 'DEEP_SUI', 'SUI_DBUSDC'];

        for (const pool of otherPools) {
            try {
                const orders = await dbClient.accountOpenOrders(pool, managerKey);
                if (orders.length > 0) {
                    console.log(`   ${pool}: ${orders.length} order(s)`);
                }
            } catch (e) {
                // Pool might not exist, skip
            }
        }

    } catch (error: any) {
        console.error('\n❌ Error querying open orders:', error.message);

        if (error.message?.includes('Pool not found')) {
            console.log('\n💡 Pool not found in SDK configuration');
            console.log('💡 Make sure the pool is registered in customPools');
        } else if (error.message?.includes('Balance Manager')) {
            console.log('\n💡 Balance Manager issue');
            console.log('💡 Check that BALANCE_MANAGER_ID is correct');
        }

        console.log('\n📋 Debug Info:');
        console.log(`   Pool Key: ${poolKey}`);
        console.log(`   Manager Key: ${managerKey}`);
        console.log(`   Balance Manager: ${BALANCE_MANAGER_ID}`);
    }

    console.log('\n' + '═'.repeat(60));
    console.log('💡 Note:');
    console.log('   - accountOpenOrders returns order IDs');
    console.log('   - To get order details, you need to query each order individually');
    console.log('   - Your recent orders:');
    console.log('     • Sell: 5 TEST01 @ 1.5 DBUSDC (may be filled)');
    console.log('     • Sell: 15 TEST01 @ 1.8 DBUSDC');
    console.log('     • Buy: 10 TEST01 @ 1.0 DBUSDC');
    console.log('═'.repeat(60));
}

queryOpenOrdersSDK()
    .then(() => {
        console.log('\n✨ Done!');
        process.exit(0);
    })
    .catch((error) => {
        console.error('❌ Fatal error:', error);
        process.exit(1);
    });
