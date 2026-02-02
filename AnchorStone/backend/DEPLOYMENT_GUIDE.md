# AnchorStone 部署指南

## 概述

每个 PropertyNFT 都会自动部署一个独立的 token 合约，无需手动传入 witness。

## 架构说明

```
┌─────────────────────────────────────────────┐
│          Frontend (React/Next.js)           │
│     用户上传房产信息 & 提交表单              │
└─────────────┬───────────────────────────────┘
              │ POST /api/properties
              ↓
┌─────────────────────────────────────────────┐
│           Backend (Node.js)                 │
│  1. 从模板生成 token 合约                    │
│  2. 部署合约到 Sui (自动获取 TreasuryCap)   │
│  3. 铸造 PropertyNFT                        │
│  4. 创建 Vault                              │
└─────────────┬───────────────────────────────┘
              │
              ↓
┌─────────────────────────────────────────────┐
│              Sui Blockchain                 │
│  • PropertyNFT                              │
│  • Property Token Contract                  │
│  • RwaVault (with TreasuryCap)             │
└─────────────────────────────────────────────┘
```

## 快速开始

### 1. 部署主合约（只需一次）

```bash
cd AnchorStone/move
sui client switch --env testnet
sui client publish --gas-budget 100000000
```

**记录输出中的：**
- `PACKAGE_ID`: 主合约包 ID
- `TOKEN_REGISTRY_ID`: TokenRegistry 对象 ID（如果有）

### 2. 配置后端

```bash
cd ../backend
npm install
cp .env.example .env
```

编辑 `.env`：
```env
NETWORK=testnet
SUI_PRIVATE_KEY=your_private_key_here
MAIN_PACKAGE_ID=0x...  # 步骤1的PACKAGE_ID
TOKEN_REGISTRY_ID=0x...  # 步骤1的TOKEN_REGISTRY_ID
```

获取私钥：
```bash
sui keytool export --key-identity <your-address>
```

### 3. 启动后端服务

```bash
npm start
```

服务运行在 `http://localhost:3000`

### 4. 测试部署

```bash
# 使用示例数据测试
npm run deploy

# 或运行完整测试
node test.js
```

## API 使用示例

### 创建新房产（自动部署 token）

```bash
curl -X POST http://localhost:3000/api/properties \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Taipei Suite A1",
    "description": "Luxury suite in Xinyi District",
    "imageUrl": "https://example.com/image.jpg",
    "propertyValue": 5000000000,
    "location": "Taipei, Taiwan",
    "reserveAmount": 1000000000,
    "totalSupply": 100000000000
  }'
```

### 响应示例

```json
{
  "success": true,
  "property": {
    "id": "prop_1706543210000",
    "name": "Taipei Suite A1",
    "nftId": "0xabc123...",
    "vaultId": "0xdef456...",
    "packageId": "0x789abc...",
    "treasuryCapId": "0x012def...",
    "tokenType": "0x789abc::property_token_prop001_1706543210000::PROPERTY_TOKEN_PROP001_1706543210000",
    "symbol": "TPSUITA1",
    "moduleName": "property_token_prop001_1706543210000",
    "transactionDigest": "9x8y7z...",
    "createdAt": "2024-01-29T10:00:00.000Z"
  }
}
```

## 工作流程详解

### 后端自动化流程

1. **接收房产数据**
   ```javascript
   POST /api/properties
   {
     name: "Taipei Suite A1",
     propertyValue: 5000000000,
     location: "Taipei"
   }
   ```

2. **生成唯一 Token 合约**
   ```move
   module anchorstone::property_token_prop001_1706543210000 {
       public struct PROPERTY_TOKEN_PROP001_1706543210000 has drop {}
       
       fun init(witness: PROPERTY_TOKEN_PROP001_1706543210000, ctx: &mut TxContext) {
           let (treasury_cap, metadata) = coin::create_currency(witness, ...);
           transfer::public_transfer(treasury_cap, tx_context::sender(ctx));
       }
   }
   ```

3. **部署合约到 Sui**
   ```bash
   sui client publish --gas-budget 100000000
   ```
   
   - 自动获取 `packageId`
   - 自动提取 `treasuryCapId`

4. **铸造 PropertyNFT**
   ```javascript
   tx.moveCall({
       target: `${MAIN_PACKAGE_ID}::rwa_vault::mint_nft_entry`,
       arguments: [name, description, imageUrl, value, location]
   })
   ```

5. **准备储备金**
   ```javascript
   // 分割 SUI 作为 reserve
   tx.splitCoins(tx.gas, [1000000000])
   ```

6. **创建 Vault**
   ```javascript
   tx.moveCall({
       target: `${MAIN_PACKAGE_ID}::rwa_vault::create_vault_entry`,
       typeArguments: ['0x2::sui::SUI', tokenType],
       arguments: [nftId, treasuryCapId, reserveCoin, totalSupply]
   })
   ```

## 关键优势

### ✅ 无需手动 Witness
- **以前**：需要手动创建 witness 模块，手动部署，手动传入 witness 对象
- **现在**：后端自动生成模块，自动部署，`init` 函数自动处理 witness

### ✅ 完全独立的 Token
- 每个房产有独特的 token 类型
- 不同房产的 token 不会混淆
- 类型安全保证

### ✅ 自动化流程
- 前端只需调用一个 API
- 后端处理所有区块链交互
- 用户无感知的复杂部署

### ✅ 可扩展
- 无限制创建新房产
- 每个房产独立管理
- 不影响其他房产

## 前端集成示例

```javascript
// PropertyForm.jsx
async function handleSubmit(formData) {
    const response = await fetch('http://localhost:3000/api/properties', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            name: formData.name,
            description: formData.description,
            imageUrl: formData.imageUrl,
            propertyValue: parseFloat(formData.value) * 1_000_000,
            location: formData.location,
            reserveAmount: 1_000_000_000,
            totalSupply: parseFloat(formData.tokens) * 1_000_000
        })
    });
    
    const result = await response.json();
    
    if (result.success) {
        alert(`成功！Token: ${result.property.symbol}`);
        // 更新 UI，显示 vaultId, nftId 等
    }
}
```

## 数据库存储（生产环境）

建议存储以下信息：

```sql
CREATE TABLE properties (
    id VARCHAR PRIMARY KEY,
    name VARCHAR NOT NULL,
    description TEXT,
    location VARCHAR,
    property_value BIGINT,
    
    -- Blockchain IDs
    nft_id VARCHAR NOT NULL,
    vault_id VARCHAR NOT NULL,
    package_id VARCHAR NOT NULL,
    treasury_cap_id VARCHAR NOT NULL,
    token_type VARCHAR NOT NULL,
    
    -- Token Info
    symbol VARCHAR(10),
    module_name VARCHAR,
    total_supply BIGINT,
    reserve_amount BIGINT,
    
    -- Metadata
    transaction_digest VARCHAR,
    created_at TIMESTAMP DEFAULT NOW(),
    
    UNIQUE(nft_id),
    UNIQUE(vault_id)
);
```

## Gas 成本估算

每次创建房产的 gas 成本：
- 部署 token 合约: ~0.05 SUI
- 铸造 NFT: ~0.001 SUI
- 创建 Vault: ~0.002 SUI
- 总计: **~0.053 SUI** per property

建议保持部署钱包至少 1 SUI 余额。

## 故障排查

### "SUI_PRIVATE_KEY not set"
```bash
sui keytool export --key-identity <address>
# 复制私钥到 .env（不带 0x 前缀）
```

### "Failed to extract TreasuryCap ID"
检查部署输出格式是否改变，可能需要更新解析逻辑。

### Gas 不足
```bash
sui client gas
# 如果余额不足，前往 faucet 获取测试 SUI
```

### 部署失败
```bash
# 检查 Move.toml 配置
# 确保 dependencies 正确
# 检查网络连接
sui client active-env
```

## 下一步

1. **添加数据库**：替换内存存储为 PostgreSQL
2. **添加队列**：使用 Bull/Redis 处理异步任务
3. **监控**：添加日志和报警
4. **前端界面**：创建完整的房产上传表单
5. **铸造功能**：实现用户购买碎片 token 的功能

## 参考文件

- `backend/deployProperty.js` - 核心部署逻辑
- `backend/server.js` - API 服务器
- `backend/templates/property_token_template.move` - Token 合约模板
- `backend/examples/frontend-api-usage.js` - 前端调用示例
