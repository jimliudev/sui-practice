/**
 * Get DEEP Tokens from Faucet
 * 
 * 在 Testnet 上獲取 DEEP 代幣
 * 
 * 使用方式: npm run get-deep
 */

import { Transaction } from '@mysten/sui/transactions';
import { getSuiClient, getKeypair, signAndExecute, NETWORK } from './config.js';

// DeepBook Testnet 配置
const DEEPBOOK_CONFIG = {
  // DeepBook Package ID (Testnet)
  PACKAGE_ID: '0xb48d47cb5f56d0f489f48f186d06672df59d64bd2f514b2f0ba40cbb8c8fd487',
  // DEEP Token Treasury ID
  DEEP_TREASURY_ID: '0x69fffdae0075f8f71f4fa793549c11079266910e8905169845af1f5d00e09dcb',
  // DEEP Token Type
  DEEP_TYPE: '0x36dbef866a1d62bf7328989a10fb2f07d769f4ee587c0de4a0a256e57e0a58a8::deep::DEEP',
};

/**
 * 從 DeepBook Faucet 獲取 DEEP 代幣
 * 
 * 注意：這只在 Testnet 上有效
 */
async function getDeepFromFaucet() {
  if (NETWORK !== 'testnet') {
    console.error('❌ Faucet 只在 Testnet 上可用');
    console.log('請切換到 testnet: sui client switch --env testnet');
    return;
  }

  const client = getSuiClient();
  const keypair = getKeypair();
  const address = keypair.toSuiAddress();

  console.log('💰 Getting DEEP tokens from faucet...');
  console.log(`👤 Address: ${address}`);
  console.log(`🌐 Network: ${NETWORK}`);

  // 查詢當前 DEEP 餘額
  const balanceBefore = await client.getBalance({
    owner: address,
    coinType: DEEPBOOK_CONFIG.DEEP_TYPE,
  });
  console.log(`\n📊 Current DEEP balance: ${Number(balanceBefore.totalBalance) / 1e6} DEEP`);

  // 嘗試使用 DeepBook 的 mint_deep 函數（如果存在）
  // 注意：不同版本的 DeepBook 可能有不同的 faucet 實現
  const tx = new Transaction();

  try {
    // 方法一：嘗試調用 deep::faucet::mint
    // 這個函數可能不存在，取決於 DeepBook 版本
    tx.moveCall({
      target: `0x36dbef866a1d62bf7328989a10fb2f07d769f4ee587c0de4a0a256e57e0a58a8::deep::mint_for_testing`,
      arguments: [
        tx.pure.u64(1000 * 1e6), // 1000 DEEP
      ],
    });

    const result = await signAndExecute(client, keypair, tx);
    console.log('\n✅ Successfully got DEEP tokens!');
    console.log(`📋 Digest: ${result.digest}`);

    // 查詢新餘額
    const balanceAfter = await client.getBalance({
      owner: address,
      coinType: DEEPBOOK_CONFIG.DEEP_TYPE,
    });
    console.log(`📊 New DEEP balance: ${Number(balanceAfter.totalBalance) / 1e6} DEEP`);

  } catch (error: any) {
    console.log('\n⚠️ Direct faucet mint not available.');
    console.log('Trying alternative methods...\n');
    
    // 如果直接 mint 不可用，顯示替代方案
    showAlternativeMethods(address);
  }
}

/**
 * 顯示獲取 DEEP 的替代方案
 */
function showAlternativeMethods(address: string) {
  console.log('═'.repeat(60));
  console.log('📖 如何在 Testnet 獲取 DEEP 代幣');
  console.log('═'.repeat(60));

  console.log(`
🔹 方法一：DeepBook Discord Faucet
   1. 加入 DeepBook Discord: https://discord.gg/deepbook
   2. 在 #testnet-faucet 頻道請求 DEEP
   3. 提供你的地址: ${address}

🔹 方法二：Sui Testnet Faucet (獲取 SUI 後交換)
   1. 獲取 Testnet SUI:
      curl --location --request POST 'https://faucet.testnet.sui.io/gas' \\
        --header 'Content-Type: application/json' \\
        --data-raw '{"FixedAmountRequest":{"recipient":"${address}"}}'
   
   2. 在 DeepBook 上用 SUI 交換 DEEP (需要有 DEEP/SUI 池子)

🔹 方法三：直接在測試網購買
   如果 DEEP/SUI 池子有流動性，可以用 swap 功能購買：
   npm run swap

🔹 方法四：聯繫 DeepBook 團隊
   在 Sui Discord 或 DeepBook Discord 請求測試代幣
`);

  console.log('\n' + '═'.repeat(60));
  console.log('💡 提示：在 Testnet 上創建 Pool 需要約 100 DEEP');
  console.log('═'.repeat(60));
}

/**
 * 查詢 DEEP 餘額
 */
async function checkDeepBalance() {
  const client = getSuiClient();
  const keypair = getKeypair();
  const address = keypair.toSuiAddress();

  console.log('📊 Checking DEEP balance...');
  console.log(`👤 Address: ${address}`);

  const balance = await client.getBalance({
    owner: address,
    coinType: DEEPBOOK_CONFIG.DEEP_TYPE,
  });

  const deepBalance = Number(balance.totalBalance) / 1e6;
  console.log(`\n💰 DEEP Balance: ${deepBalance} DEEP`);

  if (deepBalance < 100) {
    console.log('\n⚠️ 注意：創建 Pool 需要約 100 DEEP');
    console.log('   你目前的餘額不足以創建 Pool');
  } else {
    console.log('\n✅ 你有足夠的 DEEP 來創建 Pool！');
  }

  return deepBalance;
}

// 執行
const args = process.argv.slice(2);

if (args.includes('--check') || args.includes('-c')) {
  // 只檢查餘額
  checkDeepBalance()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
} else {
  // 嘗試獲取 DEEP
  getDeepFromFaucet()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

export { getDeepFromFaucet, checkDeepBalance };
