# API Usage Examples for Manual Pool Registration

## Overview

当手动通过 API 添加 DeepBook Pool 时，系统现在会正确记录和验证 `vaultId` 和 `balanceManagerId`。

## API 端点

### POST `/api/deepbook/listener/add-pool`

手动添加 Pool 到监听器并注册到 VaultRegistry（如果提供完整信息）。

#### 完整示例（启用自动回购）

```bash
curl -X POST http://localhost:3000/api/deepbook/listener/add-pool \
  -H "Content-Type: application/json" \
  -d '{
    "poolId": "0x2281e4164e299193ff5e8f9fd1af4c22b483b8d6e0c90d2dda406fcc7c8f1e87",
    "vaultId": "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
    "balanceManagerId": "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
    "coinType": "0xf7152c05930480cd740d7311b5b8b45c6f488e3a53a11c3f74a6fac36a52e0d7::MANSION::MANSION",
    "floorPrice": 1.5,
    "owner": "0x9876543210fedcba9876543210fedcba9876543210fedcba9876543210fedcba"
  }'
```

**预期响应：**
```json
{
  "success": true,
  "message": "Pool registered with buyback enabled",
  "data": {
    "poolId": "0x2281e4164e299193ff5e8f9fd1af4c22b483b8d6e0c90d2dda406fcc7c8f1e87",
    "vaultId": "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
    "balanceManagerId": "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
    "coinType": "0xf7152c05930480cd740d7311b5b8b45c6f488e3a53a11c3f74a6fac36a52e0d7::MANSION::MANSION",
    "quoteCoin": "0xf7152c05930480cd740d7311b5b8b45c6f488e3a53a11c3f74a6fac36a52e0d7::DBUSDC::DBUSDC",
    "floorPrice": 1500000,
    "floorPriceDisplay": "1.500000 USDC",
    "owner": "0x9876543210fedcba9876543210fedcba9876543210fedcba9876543210fedcba",
    "registeredToVault": true,
    "buybackEnabled": true,
    "addedAt": "2026-02-05T10:30:00.000Z"
  },
  "warnings": []
}
```

#### 示例 2：仅监控（无自动回购）

如果只想监控 Pool 而不启用自动回购，可以只提供 `poolId`：

```bash
curl -X POST http://localhost:3000/api/deepbook/listener/add-pool \
  -H "Content-Type: application/json" \
  -d '{
    "poolId": "0x2281e4164e299193ff5e8f9fd1af4c22b483b8d6e0c90d2dda406fcc7c8f1e87",
    "floorPrice": 1.0
  }'
```

**预期响应：**
```json
{
  "success": true,
  "message": "Pool added to monitoring only",
  "data": {
    "poolId": "0x2281e4164e299193ff5e8f9fd1af4c22b483b8d6e0c90d2dda406fcc7c8f1e87",
    "vaultId": null,
    "balanceManagerId": null,
    "coinType": "0xf7152c05930480cd740d7311b5b8b45c6f488e3a53a11c3f74a6fac36a52e0d7::MANSION::MANSION",
    "quoteCoin": "0xf7152c05930480cd740d7311b5b8b45c6f488e3a53a11c3f74a6fac36a52e0d7::DBUSDC::DBUSDC",
    "floorPrice": 1000000,
    "floorPriceDisplay": "1.000000 USDC",
    "owner": null,
    "registeredToVault": false,
    "buybackEnabled": false,
    "addedAt": "2026-02-05T10:35:00.000Z"
  },
  "warnings": [
    "Missing vaultId or balanceManagerId - automatic buyback is disabled",
    "Provide both vaultId and balanceManagerId to enable buyback functionality"
  ]
}
```

#### 示例 3：提供 vaultId 但无 balanceManagerId

```bash
curl -X POST http://localhost:3000/api/deepbook/listener/add-pool \
  -H "Content-Type: application/json" \
  -d '{
    "poolId": "0x2281e4164e299193ff5e8f9fd1af4c22b483b8d6e0c90d2dda406fcc7c8f1e87",
    "vaultId": "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
    "floorPrice": 1.2
  }'
```

**预期响应：**
```json
{
  "success": true,
  "message": "Pool registered but buyback disabled (missing balanceManagerId)",
  "data": {
    "poolId": "0x2281e4164e299193ff5e8f9fd1af4c22b483b8d6e0c90d2dda406fcc7c8f1e87",
    "vaultId": "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
    "balanceManagerId": null,
    "coinType": "0xf7152c05930480cd740d7311b5b8b45c6f488e3a53a11c3f74a6fac36a52e0d7::MANSION::MANSION",
    "quoteCoin": "0xf7152c05930480cd740d7311b5b8b45c6f488e3a53a11c3f74a6fac36a52e0d7::DBUSDC::DBUSDC",
    "floorPrice": 1200000,
    "floorPriceDisplay": "1.200000 USDC",
    "owner": null,
    "registeredToVault": true,
    "buybackEnabled": false,
    "addedAt": "2026-02-05T10:40:00.000Z"
  },
  "warnings": [
    "Missing vaultId or balanceManagerId - automatic buyback is disabled",
    "Provide both vaultId and balanceManagerId to enable buyback functionality"
  ]
}
```

## 后端日志输出

### 完整配置（启用回购）

```
🏊 ====== Adding Pool to Listener ======
📋 Pool ID: 0x2281e4164e299193ff5e8f9fd1af4c22b483b8d6e0c90d2dda406fcc7c8f1e87
🏦 Vault ID: 0x1234567890abcdef...
💼 Balance Manager ID: 0xabcdef1234567890...
🪙 Coin Type: Will query from chain
🛡️  Floor Price: 1.500000 USDC
👤 Owner: 0x9876543210fedcba...
========================================

🔍 Querying pool info from chain: 0x2281e4164e299193...
   ✅ Found pool on chain!
   Base Coin: 0xf7152c05930480cd740d7311b5b8...
   Quote Coin: 0xf7152c05930480cd740d7311b5b8...
   Min Size: 1000

📌 Manually added Pool to listener: 0x2281e4164e299193...
   Vault ID: 0x1234567890abcdef...
   Balance Manager ID: 0xabcdef1234567890...
   Note: Will be registered to VaultRegistry by server if vaultId is provided

📝 [VaultRegistry] Pool Registered
   Pool ID: 0x2281e4164e299193...
   Vault ID: 0x1234567890abcdef...
   💼 Balance Manager: 0xabcdef1234567890... ✅
   🪙 Coin Type: MANSION
   👤 Owner: 0x9876543210fedcba...
   🛡️  Floor Price: 1.500000 USDC
   💡 Will trigger buyback when price < 1.500000 USDC

✅ Pool added to listener and registered in vault registry
   Buyback ENABLED
```

### 缺少 balanceManagerId

```
🏊 ====== Adding Pool to Listener ======
📋 Pool ID: 0x2281e4164e299193ff5e8f9fd1af4c22b483b8d6e0c90d2dda406fcc7c8f1e87
🏦 Vault ID: 0x1234567890abcdef...
💼 Balance Manager ID: ⚠️  NOT PROVIDED
🪙 Coin Type: Will query from chain
🛡️  Floor Price: 1.200000 USDC
👤 Owner: N/A

⚠️  Warning: Missing vaultId or balanceManagerId
   Automatic buyback will NOT be available for this pool
   Pool will be monitored but buyback cannot be executed
========================================

📝 [VaultRegistry] Pool Registered
   Pool ID: 0x2281e4164e299193...
   Vault ID: 0x1234567890abcdef...
   💼 Balance Manager: NOT PROVIDED ⚠️
   ⚠️  Warning: Without Balance Manager, buyback cannot be executed!
   🪙 Coin Type: MANSION
   🛡️  Floor Price: 1.200000 USDC
   💡 Will detect (but cannot execute) buyback when price < 1.200000 USDC

✅ Pool added to listener and registered in vault registry
   Buyback DISABLED (missing balanceManagerId)
```

## 关键改进

### 1. **双重记录机制**

- **DeepBookListener**：记录 Pool 配置用于事件监听
- **VaultRegistry**：记录 Pool 与 Vault 的映射关系用于回购触发

### 2. **balanceManagerId 验证**

- 系统现在会检查是否提供了 `balanceManagerId`
- 如果缺少 `balanceManagerId`，会清楚警告无法执行自动回购
- 支持 Pool 级别的 `balanceManagerId`（优先级高于全局配置）

### 3. **清晰的状态反馈**

- API 响应中包含 `buybackEnabled` 标志
- 如果配置不完整，返回 `warnings` 数组
- 后端日志清楚显示每个字段的状态（已提供 ✅ / 未提供 ⚠️）

### 4. **灵活的使用场景**

- **完整配置**：提供所有字段，启用完整的监控 + 自动回购
- **仅监控**：只提供 `poolId`，仅监控事件不执行回购
- **部分配置**：提供 `vaultId` 但无 `balanceManagerId`，可检测回购时机但无法执行

## 相关 API 端点

### 查询已注册的 Pool

```bash
# 获取所有已注册的 Pool
curl http://localhost:3000/api/pools

# 获取特定 Pool 的信息
curl http://localhost:3000/api/pools/0x2281e4164e299193ff5e8f9fd1af4c22b483b8d6e0c90d2dda406fcc7c8f1e87
```

### 查询 Vault 的 DeepBook 信息

```bash
curl http://localhost:3000/api/vaults/0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef/deepbook
```

### 查询 Listener 状态

```bash
curl http://localhost:3000/api/deepbook/listener/status
```

## 注意事项

1. **必需字段组合**：
   - 要启用自动回购：必须同时提供 `vaultId` 和 `balanceManagerId`
   - 仅监控：只需 `poolId`

2. **coinType 自动查询**：
   - 如果不提供 `coinType`，系统会自动从链上查询
   - 建议让系统自动查询以确保准确性

3. **floorPrice 默认值**：
   - 如果不提供 `floorPrice`，默认为 1.0 USDC

4. **优先级**：
   - Pool 级别的 `balanceManagerId` 优先于全局 `.env` 配置
   - 这允许不同的 Pool 使用不同的 Balance Manager

