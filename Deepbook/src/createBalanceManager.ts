/**
 * Create Balance Manager
 * 
 * BalanceManager 是 DeepBook V3 的核心組件，用於管理用戶的資金。
 * 所有交易操作（除了 swap）都需要 BalanceManager。
 * 
 * 使用方式: npm run create-balance-manager
 */

import { Transaction } from '@mysten/sui/transactions';
import { getSuiClient, getKeypair, signAndExecute, NETWORK } from './config.js';

async function createBalanceManager() {
  const client = getSuiClient();
  const keypair = getKeypair();
  const address = keypair.toSuiAddress();

  console.log('📦 Creating Balance Manager...');
  console.log(`👤 Address: ${address}`);
  console.log(`🌐 Network: ${NETWORK}`);

  // DeepBook V3 Package IDs
  const DEEPBOOK_PACKAGE_ID = NETWORK === 'mainnet'
    ? '0xdee9bc3ba7b9e7c2be8f72d95d4fffb37a94a6d1c22d7c75e8fe65e8c9e82be6'
    : '0x98dead3f1f7c4f60a8ec7c7e3c4f4a4e4b6c8a0d2f6e9b4a8c0d2e4f6a8b0c2d4'; // testnet ID (需要替換)

  const tx = new Transaction();

  // 調用 balance_manager::new 創建 BalanceManager
  // 注意: 實際的 package ID 需要根據網路確認
  const [balanceManager] = tx.moveCall({
    target: `${DEEPBOOK_PACKAGE_ID}::balance_manager::new`,
    arguments: [],
  });

  // BalanceManager 必須是 shared object
  tx.moveCall({
    target: '0x2::transfer::public_share_object',
    typeArguments: [`${DEEPBOOK_PACKAGE_ID}::balance_manager::BalanceManager`],
    arguments: [balanceManager],
  });

  try {
    const result = await signAndExecute(client, keypair, tx);
    console.log('\n✅ Balance Manager created successfully!');
    console.log(`📋 Digest: ${result.digest}`);

    // 查找創建的 BalanceManager ID
    if (result.objectChanges) {
      for (const change of result.objectChanges) {
        if (change.type === 'created' && change.objectType?.includes('BalanceManager')) {
          console.log(`\n🆔 Balance Manager ID: ${change.objectId}`);
          console.log('\n💡 請將此 ID 添加到 .env 文件中:');
          console.log(`BALANCE_MANAGER_ID=${change.objectId}`);
        }
      }
    }

    // 打印所有創建的對象
    console.log('\n📦 Created Objects:');
    result.objectChanges?.forEach((change: any) => {
      if (change.type === 'created') {
        console.log(`  - ${change.objectType}: ${change.objectId}`);
      }
    });

  } catch (error) {
    console.error('❌ Failed to create Balance Manager:', error);
    throw error;
  }
}

// 如果你想使用 SDK 的方式
async function createBalanceManagerWithSDK() {
  const { DeepBookClient } = await import('@mysten/deepbook-v3');
  
  const client = getSuiClient();
  const keypair = getKeypair();
  const address = keypair.toSuiAddress();

  console.log('📦 Creating Balance Manager...');
  console.log(`👤 Address: ${address}`);
  console.log(`🌐 Network: ${NETWORK}`);

  // 使用 DeepBook SDK 創建 BalanceManager
  const dbClient = new DeepBookClient({
    address,
    env: NETWORK,
    client,
  });

  const tx = new Transaction();

  // 調用 SDK 的 createAndShareBalanceManager 方法
  dbClient.balanceManager.createAndShareBalanceManager()(tx);

  try {
    const result = await signAndExecute(client, keypair, tx);
    console.log('\n✅ Balance Manager created successfully!');
    console.log(`📋 Digest: ${result.digest}`);

    // 查找創建的 BalanceManager ID
    if (result.objectChanges) {
      for (const change of result.objectChanges) {
        if (change.type === 'created' && change.objectType?.includes('BalanceManager')) {
          console.log(`\n🆔 Balance Manager ID: ${change.objectId}`);
          console.log('\n💡 請將此 ID 添加到 .env 文件中:');
          console.log(`BALANCE_MANAGER_ID=${change.objectId}`);
        }
      }
    }

    // 打印所有創建的對象
    console.log('\n📦 Created Objects:');
    result.objectChanges?.forEach((change: any) => {
      if (change.type === 'created') {
        console.log(`  - ${change.objectType}: ${change.objectId}`);
      }
    });

  } catch (error) {
    console.error('❌ Failed to create Balance Manager:', error);
    throw error;
  }
}

// 執行
createBalanceManagerWithSDK()
  .then(() => {
    console.log('\n✨ Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
