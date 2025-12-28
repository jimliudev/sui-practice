/**
 * Create DeepBook Pool
 * 
 * 在 DeepBook V3 中創建新的交易池。
 * 創建池子需要支付 DEEP 代幣作為費用。
 * 
 * 使用方式: npm run create-pool
 * 
 * 支援：
 * 1. 使用 SDK 內建代幣 (SUI, DEEP, USDC)
 * 2. 註冊自定義代幣到 SDK
 */

import { Transaction } from '@mysten/sui/transactions';
import { DeepBookClient } from '@mysten/deepbook-v3';
import { getSuiClient, getKeypair, signAndExecute, NETWORK } from './config.js';

/**
 * Coin 配置接口 - 用於註冊自定義代幣到 DeepBook SDK
 * 
 * @property address - 代幣的 package address（不含 module::name）
 * @property type - 完整的代幣類型（package::module::NAME）
 * @property scalar - 代幣精度（1e6 = 6位小數, 1e9 = 9位小數）
 */
interface CoinConfig {
  address: string;
  type: string;
  scalar: number;
}

/**
 * CoinMap 類型 - 用於傳遞給 DeepBookClient
 */
type CoinMap = Record<string, CoinConfig>;

// 池子配置
interface PoolConfig {
  baseCoinKey: string;     // Base 代幣 key (需要在 SDK coins 中註冊)
  quoteCoinKey: string;    // Quote 代幣 key (需要在 SDK coins 中註冊)
  tickSize: number;        // 最小價格變動單位
  lotSize: number;         // 最小交易數量
  minSize: number;         // 最小訂單大小
  customCoins?: CoinMap;   // 自定義代幣映射（可選）
}

// 常見代幣類型
const COIN_TYPES = {
  SUI: '0x2::sui::SUI',
  // Testnet USDC (需要根據實際情況替換)
  USDC_TESTNET: '0xa1ec7fc00a6f40db9693ad1415d0c193ad3906494428cf252621037bd7117e29::usdc::USDC',
  // Mainnet USDC
  USDC_MAINNET: '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC',
  // DEEP Token
  DEEP_MAINNET: '0xdeeb7a4662eec9f2f3def03fb937a663dddaa2e215b8078a284d026b7946c270::deep::DEEP',
  DEEP_TESTNET: '0x36dbef866a1d62bf7328989a10fb2f07d769f4ee587c0de4a0a256e57e0a58a8::deep::DEEP',
};

/**
 * 創建自定義代幣的 CoinConfig
 * 
 * @param packageId - 代幣的 package ID
 * @param moduleName - 模組名稱
 * @param coinName - 代幣名稱（通常大寫）
 * @param decimals - 小數位數（如 6, 9）
 * @returns CoinConfig 對象
 * 
 * @example
 * const myToken = createCoinConfig(
 *   '0x1234...abcd',  // 你的 package ID
 *   'my_token',       // module 名稱
 *   'MY_TOKEN',       // 代幣名稱
 *   9                 // 9位小數
 * );
 */
function createCoinConfig(
  packageId: string,
  moduleName: string,
  coinName: string,
  decimals: number
): CoinConfig {
  return {
    address: packageId,
    type: `${packageId}::${moduleName}::${coinName}`,
    scalar: Math.pow(10, decimals),
  };
}

/**
 * 創建新的交易池
 * 
 * 注意：
 * 1. 需要 100 DEEP 作為創建費用
 * 2. tickSize, lotSize, minSize 需要根據代幣精度設置
 * 3. 創建後池子會自動在 DeepBook Registry 中註冊
 */
async function createPool(config: PoolConfig) {
  const { DeepBookClient } = await import('@mysten/deepbook-v3');
  
  const client = getSuiClient();
  const keypair = getKeypair();
  const address = keypair.toSuiAddress();

  console.log('🏊 Creating DeepBook Pool (Permissionless)...');
  console.log(`👤 Address: ${address}`);
  console.log(`🌐 Network: ${NETWORK}`);
  console.log('\n📋 Pool Configuration:');
  console.log(`  Base Coin Key: ${config.baseCoinKey}`);
  console.log(`  Quote Coin Key: ${config.quoteCoinKey}`);
  console.log(`  Tick Size: ${config.tickSize}`);
  console.log(`  Lot Size: ${config.lotSize}`);
  console.log(`  Min Size: ${config.minSize}`);
  
  if (config.customCoins) {
    console.log('\n📋 Custom Coins:');
    for (const [key, coin] of Object.entries(config.customCoins)) {
      console.log(`  ${key}: ${coin.type} (scalar: ${coin.scalar})`);
    }
  }

  // SDK 內建的 Testnet 代幣配置
  // 當傳入 customCoins 時，SDK 會覆蓋而非合併，所以需要手動添加內建代幣
  const builtInCoins: CoinMap = {
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
  };

  // 合併內建代幣和自定義代幣
  const allCoins: CoinMap = {
    ...builtInCoins,
    ...config.customCoins,
  };

  // 初始化 DeepBookClient
  // 傳入合併後的代幣配置
  const dbClient = new DeepBookClient({
    address,
    env: NETWORK,
    client,
    // 註冊所有代幣（內建 + 自定義）
    coins: config.customCoins ? allCoins : undefined,
  });

  const tx = new Transaction();

  // 使用 SDK 創建 Permissionless 池子
  // 注意：需要有足夠的 DEEP 代幣支付創建費用 (約 100 DEEP)
  dbClient.deepBook.createPermissionlessPool({
    baseCoinKey: config.baseCoinKey,
    quoteCoinKey: config.quoteCoinKey,
    tickSize: config.tickSize,
    lotSize: config.lotSize,
    minSize: config.minSize,
    // deepCoin: 可選，如果不提供會自動從錢包選取 DEEP
  })(tx);

  try {
    const result = await signAndExecute(client, keypair, tx);
    console.log('\n✅ Pool created successfully!');
    console.log(`📋 Digest: ${result.digest}`);

    // 查找創建的 Pool ID
    if (result.objectChanges) {
      for (const change of result.objectChanges) {
        if (change.type === 'created' && change.objectType?.includes('Pool')) {
          console.log(`\n🆔 Pool ID: ${change.objectId}`);
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

    return result;
  } catch (error: any) {
    console.error('❌ Failed to create pool:', error.message || error);
    
    if (error.message?.includes('InsufficientCoinBalance')) {
      console.log('\n💡 提示：創建池子需要 100 DEEP 代幣作為費用');
      console.log('   請確保你的錢包有足夠的 DEEP 代幣');
    }
    
    throw error;
  }
}

/**
 * 使用 Admin 權限創建池子（適用於有 AdminCap 的情況）
 * 這種方式可以創建白名單池子或穩定幣池子
 */
async function createPoolAdmin(config: PoolConfig & { 
  whitelisted?: boolean; 
  stablePool?: boolean;
  adminCapId: string;
}) {
  const { DeepBookClient } = await import('@mysten/deepbook-v3');
  
  const client = getSuiClient();
  const keypair = getKeypair();
  const address = keypair.toSuiAddress();

  console.log('🏊 Creating DeepBook Pool (Admin Mode)...');
  console.log(`👤 Address: ${address}`);
  console.log(`🌐 Network: ${NETWORK}`);

  const dbClient = new DeepBookClient({
    address,
    env: NETWORK,
    client,
    adminCap: config.adminCapId,
  });

  const tx = new Transaction();

  // 使用 Admin 權限創建池子
  dbClient.deepBookAdmin.createPoolAdmin({
    baseCoinKey: 'BASE',  // 需要在 SDK 中註冊的 coin key
    quoteCoinKey: 'QUOTE',
    tickSize: config.tickSize,
    lotSize: config.lotSize,
    minSize: config.minSize,
    whitelisted: config.whitelisted || false,
    stablePool: config.stablePool || false,
  })(tx);

  try {
    const result = await signAndExecute(client, keypair, tx);
    console.log('\n✅ Pool created successfully!');
    console.log(`📋 Digest: ${result.digest}`);
    return result;
  } catch (error) {
    console.error('❌ Failed to create pool:', error);
    throw error;
  }
}

// 範例：創建一個 SUI/USDC 池子
async function exampleCreatePool() {
  console.log('═'.repeat(60));
  console.log('📖 DeepBook Pool 創建指南');
  console.log('═'.repeat(60));
  
  console.log('\n📋 創建池子的要求：');
  console.log('  1. 需要 100 DEEP 代幣作為創建費用');
  console.log('  2. Base 和 Quote 代幣類型不能相同');
  console.log('  3. 池子創建後不能刪除');
  
  console.log('\n📋 參數說明：');
  console.log('  - tickSize: 最小價格變動單位 (例如 0.001 表示價格精度到小數點後3位)');
  console.log('  - lotSize: 最小交易數量 (例如 0.1 表示最少交易 0.1 個 Base 代幣)');
  console.log('  - minSize: 最小訂單大小 (例如 1 表示最小訂單為 1 個 Base 代幣)');
  
  console.log('\n📋 常見池子配置範例：');
  console.log('');
  console.log('  SUI/USDC 池子：');
  console.log('    tickSize: 0.001   (價格精度 $0.001)');
  console.log('    lotSize: 0.1      (最少交易 0.1 SUI)');
  console.log('    minSize: 1        (最小訂單 1 SUI)');
  console.log('');
  console.log('  DEEP/SUI 池子：');
  console.log('    tickSize: 0.0001  (價格精度 0.0001 SUI)');
  console.log('    lotSize: 1        (最少交易 1 DEEP)');
  console.log('    minSize: 10       (最小訂單 10 DEEP)');
  
  console.log('\n' + '═'.repeat(60));
  console.log('💡 要創建池子，請修改下方配置並取消註釋');
  console.log('═'.repeat(60));
  
  console.log(`
// ====== 方式一：使用 SDK 內建的代幣 ======
// 可用的 baseCoinKey/quoteCoinKey: 'SUI', 'DEEP', 'DBUSDC' (testnet) 等

const poolConfig: PoolConfig = {
  baseCoinKey: 'SUI',     // SDK 內建的 coin key
  quoteCoinKey: 'DBUSDC', // SDK 內建的 coin key (testnet USDC)
  tickSize: 0.001,        // 價格精度
  lotSize: 0.1,           // 最小交易量
  minSize: 1,             // 最小訂單大小
};

await createPool(poolConfig);


// ====== 方式二：註冊自定義代幣 ======
// 如果你有自己發行的代幣，需要先註冊到 SDK

// 1. 創建你的代幣配置
const myTokenConfig = createCoinConfig(
  '0x你的_package_id',  // 代幣的 package ID
  'my_token',           // module 名稱
  'MY_TOKEN',           // 代幣名稱（通常大寫）
  9                     // 小數位數
);

// 2. 創建 CoinMap
const customCoins: CoinMap = {
  'MY_TOKEN': myTokenConfig,
};

// 3. 使用自定義代幣創建池子
const poolWithCustomCoin: PoolConfig = {
  baseCoinKey: 'MY_TOKEN', // 使用你註冊的 key
  quoteCoinKey: 'SUI',     // 可以和內建代幣配對
  tickSize: 0.0001,
  lotSize: 1,
  minSize: 10,
  customCoins: customCoins, // 傳入自定義代幣
};

await createPool(poolWithCustomCoin);
`);
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

  return params;
}

// 執行
const parsedParams = parseArgs();

if (parsedParams?.base && parsedParams?.quote) {
  // 使用命令行參數創建池子
  // 支援自定義代幣：--customCoin "PACKAGE_ID::MODULE::NAME::DECIMALS"
  
  let customCoins: CoinMap | undefined;
  
  // 解析自定義代幣參數
  if (parsedParams.customCoin) {
    const parts = parsedParams.customCoin.split('::');
    if (parts.length === 4) {
      const [packageId, moduleName, coinName, decimals] = parts;
      const coinKey = coinName.toUpperCase();
      customCoins = {
        [coinKey]: createCoinConfig(packageId, moduleName, coinName, parseInt(decimals)),
      };
      console.log(`\n📝 Registering custom coin: ${coinKey}`);
    }
  }
  
  const config: PoolConfig = {
    baseCoinKey: parsedParams.base,
    quoteCoinKey: parsedParams.quote,
    tickSize: parseFloat(parsedParams.tickSize || '0.001'),
    lotSize: parseFloat(parsedParams.lotSize || '0.1'),
    minSize: parseFloat(parsedParams.minSize || '1'),
    customCoins,
  };
  
  createPool(config)
    .then(() => {
      console.log('\n✨ Done!');
      process.exit(0);
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
} else {
  // 顯示使用指南
  exampleCreatePool()
    .then(() => {
      console.log('\n✨ Done!');
      process.exit(0);
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

export { createPool, createPoolAdmin, createCoinConfig, COIN_TYPES };
export type { PoolConfig, CoinConfig, CoinMap };
