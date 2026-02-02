# Node.js 自動化部署 Token 指南

## 概述

這個指南說明如何使用 Node.js 自動化部署每個房產的獨特代幣。

## 工作流程

```
1. mint_nft_entry() → 創建 PropertyNFT
2. [Node.js] 自動生成並部署 Coin 模組 → 獲得 TreasuryCap
3. create_vault_with_token_entry() → 註冊 Token 並創建 Vault
4. mint_tokens_entry() → 鑄造代幣
```

## Node.js 部署腳本

### 1. 安裝依賴

```bash
npm install @mysten/sui
```

### 2. Token 模組模板

創建 `token_template.move`:

```move
module {PACKAGE_NAME}::{TOKEN_MODULE_NAME} {
    use sui::coin;

    public struct {TOKEN_TYPE} has drop {}

    fun init(witness: {TOKEN_TYPE}, ctx: &mut TxContext) {
        let (treasury_cap, metadata) = coin::create_currency(
            witness,
            {DECIMALS},
            b"{SYMBOL}",
            b"{NAME}",
            b"{DESCRIPTION}",
            option::none(),
            ctx
        );

        transfer::public_freeze_object(metadata);
        transfer::public_transfer(treasury_cap, tx_context::sender(ctx));
    }
}
```

### 3. 自動化部署腳本

```javascript
import { SuiClient } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Transaction } from '@mysten/sui/transactions';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

// 配置
const NETWORK = 'testnet';
const PRIVATE_KEY = process.env.PRIVATE_KEY;

// 初始化
const client = new SuiClient({ url: `https://fullnode.${NETWORK}.sui.io:443` });
const keypair = Ed25519Keypair.fromSecretKey(Buffer.from(PRIVATE_KEY, 'hex'));

/**
 * 為房產生成並部署代幣
 */
async function deployPropertyToken(propertyInfo) {
  const {
    propertyId,
    propertyName,
    tokenSymbol,
    tokenName,
    decimals = 6,
    description
  } = propertyInfo;

  console.log(`🚀 部署代幣: ${tokenName} (${tokenSymbol})`);

  // 1. 生成模組名稱（小寫，下劃線）
  const moduleName = tokenSymbol.toLowerCase() + '_token';
  const typeName = tokenSymbol.toUpperCase() + '_TOKEN';

  // 2. 從模板生成 Move 文件
  const template = fs.readFileSync('token_template.move', 'utf8');
  const moveCode = template
    .replace(/{PACKAGE_NAME}/g, 'property_tokens')
    .replace(/{TOKEN_MODULE_NAME}/g, moduleName)
    .replace(/{TOKEN_TYPE}/g, typeName)
    .replace(/{DECIMALS}/g, decimals)
    .replace(/{SYMBOL}/g, tokenSymbol)
    .replace(/{NAME}/g, tokenName)
    .replace(/{DESCRIPTION}/g, description);

  // 3. 創建臨時目錄
  const tempDir = path.join(__dirname, 'temp', moduleName);
  fs.mkdirSync(path.join(tempDir, 'sources'), { recursive: true });

  // 4. 寫入 Move.toml
  const moveToml = `
[package]
name = "${moduleName}"
version = "0.0.1"

[dependencies]
Sui = { git = "https://github.com/MystenLabs/sui.git", subdir = "crates/sui-framework/packages/sui-framework", rev = "framework/testnet" }

[addresses]
property_tokens = "0x0"
`;
  fs.writeFileSync(path.join(tempDir, 'Move.toml'), moveToml);
  fs.writeFileSync(path.join(tempDir, 'sources', `${moduleName}.move`), moveCode);

  // 5. 編譯
  console.log('📦 編譯合約...');
  execSync('sui move build', { cwd: tempDir, stdio: 'inherit' });

  // 6. 部署
  console.log('🌐 部署到測試網...');
  const { modules, dependencies } = JSON.parse(
    execSync('sui move build --dump-bytecode-as-base64', { cwd: tempDir }).toString()
  );

  const tx = new Transaction();
  const [upgradeCap] = tx.publish({
    modules,
    dependencies,
  });
  tx.transferObjects([upgradeCap], keypair.getPublicKey().toSuiAddress());

  const result = await client.signAndExecuteTransaction({
    transaction: tx,
    signer: keypair,
    options: {
      showEffects: true,
      showObjectChanges: true,
    },
  });

  // 7. 提取 TreasuryCap ID
  const treasuryCapId = result.objectChanges?.find(
    (obj) => obj.objectType?.includes('TreasuryCap')
  )?.objectId;

  const packageId = result.objectChanges?.find(
    (obj) => obj.type === 'published'
  )?.packageId;

  console.log('✅ 部署成功！');
  console.log(`   Package ID: ${packageId}`);
  console.log(`   TreasuryCap ID: ${treasuryCapId}`);
  console.log(`   Token Type: ${packageId}::${moduleName}::${typeName}`);

  // 8. 清理臨時文件
  fs.rmSync(tempDir, { recursive: true, force: true });

  return {
    packageId,
    treasuryCapId,
    tokenType: `${packageId}::${moduleName}::${typeName}`,
    moduleName,
    typeName,
  };
}

/**
 * 完整流程：創建 NFT → 部署 Token → 創建 Vault
 */
async function createPropertyWithToken(propertyData) {
  const {
    // NFT 信息
    name,
    description,
    imageUrl,
    propertyValue,
    location,
    // Token 信息
    tokenSymbol,
    tokenName,
    // Vault 信息
    reserveAmount,
    totalFragments,
  } = propertyData;

  // 步驟 1: 鑄造 NFT
  console.log('1️⃣ 鑄造 PropertyNFT...');
  const nftTx = new Transaction();
  nftTx.moveCall({
    target: `${PACKAGE_ID}::rwa_vault::mint_nft_entry`,
    arguments: [
      nftTx.pure.string(name),
      nftTx.pure.string(description),
      nftTx.pure.string(imageUrl),
      nftTx.pure.u64(propertyValue),
      nftTx.pure.string(location),
    ],
  });

  const nftResult = await client.signAndExecuteTransaction({
    transaction: nftTx,
    signer: keypair,
    options: { showObjectChanges: true },
  });

  const nftId = nftResult.objectChanges?.find(
    (obj) => obj.objectType?.includes('PropertyNFT')
  )?.objectId;

  console.log(`   NFT ID: ${nftId}`);

  // 步驟 2: 部署 Token
  console.log('2️⃣ 部署代幣...');
  const tokenInfo = await deployPropertyToken({
    propertyId: nftId,
    propertyName: name,
    tokenSymbol,
    tokenName,
    description: `Fractional ownership token for ${name}`,
  });

  // 步驟 3: 準備儲備金
  console.log('3️⃣ 準備儲備金...');
  const splitTx = new Transaction();
  const [coin] = splitTx.splitCoins(splitTx.gas, [reserveAmount]);
  const splitResult = await client.signAndExecuteTransaction({
    transaction: splitTx,
    signer: keypair,
    options: { showObjectChanges: true },
  });

  const reserveCoinId = splitResult.objectChanges?.find(
    (obj) => obj.objectType === '0x2::coin::Coin<0x2::sui::SUI>'
  )?.objectId;

  // 步驟 4: 創建 Vault
  console.log('4️⃣ 創建 Vault...');
  const vaultTx = new Transaction();
  vaultTx.moveCall({
    target: `${PACKAGE_ID}::rwa_vault::create_vault_with_token_entry`,
    typeArguments: ['0x2::sui::SUI', tokenInfo.tokenType],
    arguments: [
      vaultTx.object(TOKEN_REGISTRY_ID),
      vaultTx.object(nftId),
      vaultTx.object(tokenInfo.treasuryCapId),
      vaultTx.pure.string(tokenName),
      vaultTx.pure.string(tokenSymbol),
      vaultTx.pure.u8(6),
      vaultTx.object(reserveCoinId),
      vaultTx.pure.u64(totalFragments),
    ],
  });

  const vaultResult = await client.signAndExecuteTransaction({
    transaction: vaultTx,
    signer: keypair,
    options: { showObjectChanges: true },
  });

  const vaultId = vaultResult.objectChanges?.find(
    (obj) => obj.objectType?.includes('RwaVault')
  )?.objectId;

  console.log('✅ 完成！');
  console.log(`   Vault ID: ${vaultId}`);

  return {
    nftId,
    vaultId,
    ...tokenInfo,
  };
}

// 使用範例
const propertyData = {
  name: 'Taipei Luxury Suite A1',
  description: 'Premium suite in Xinyi District',
  imageUrl: 'https://example.com/image.jpg',
  propertyValue: 5000000000, // 5M USDC (6 decimals)
  location: 'Taipei, Taiwan',
  tokenSymbol: 'TSA1',
  tokenName: 'Taipei Suite A1 Token',
  reserveAmount: 1000000000, // 1 SUI
  totalFragments: 100000000000, // 100,000 tokens
};

createPropertyWithToken(propertyData)
  .then((result) => {
    console.log('部署結果:', result);
  })
  .catch((error) => {
    console.error('部署失敗:', error);
  });
```

## 環境變數

創建 `.env` 文件：

```env
PRIVATE_KEY=your_private_key_hex
PACKAGE_ID=0x...
TOKEN_REGISTRY_ID=0x...
NETWORK=testnet
```

## 執行

```bash
node deploy-property-token.js
```

## 輸出

腳本會自動完成：
1. ✅ 鑄造 PropertyNFT
2. ✅ 生成並部署代幣模組
3. ✅ 準備儲備金
4. ✅ 創建 Vault 並註冊代幣
5. ✅ 返回所有對象 ID

## 注意事項

1. **Gas 費用**：確保錢包有足夠的 SUI
2. **網路延遲**：測試網可能較慢，添加適當的等待時間
3. **錯誤處理**：生產環境需要更完善的錯誤處理
4. **批量部署**：可以修改腳本支持批量部署多個房產

## 進階功能

### 批量部署

```javascript
const properties = [
  { name: 'Property 1', tokenSymbol: 'PROP1', ... },
  { name: 'Property 2', tokenSymbol: 'PROP2', ... },
];

for (const property of properties) {
  await createPropertyWithToken(property);
  await new Promise(resolve => setTimeout(resolve, 2000)); // 等待 2 秒
}
```

### 保存部署記錄

```javascript
const deploymentLog = {
  timestamp: new Date().toISOString(),
  property: propertyData,
  result: deploymentResult,
};

fs.writeFileSync(
  `deployments/${tokenSymbol}.json`,
  JSON.stringify(deploymentLog, null, 2)
);
```
