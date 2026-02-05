# 配置说明：最低回购金额（minBuybackAmount）

## ✅ 已实现：通过 API 动态设置

现在最低回购金额可以在注册 Pool 时通过 API 动态设置，不再需要硬编码！

---

## 使用方法

### 方式 1：注册 Pool 时设置（推荐）

```bash
curl -X POST http://localhost:3000/api/deepbook/listener/add-pool \
  -H "Content-Type: application/json" \
  -d '{
    "poolId": "0x2281e4164e299193fff040bb7e3a8e168cea3973adedfdfbd0ee95b96af722a3",
    "vaultId": "0x7af94521daa033f5e3a1bb9b99849beb68158e5818356e080d3cff78afbd28fd",
    "balanceManagerId": "0x2dad7c896a8b875969708eeb77cb0312f6c5cbdaa40c2befb7b7b5500400efdd",
    "floorPrice": 0.01,
    "minBuybackAmount": 0.0001
  }'
```

**新增参数**：
- `minBuybackAmount`: 最低回购金额（USDC）
  - 不设置 = 没有最低限制（推荐用于测试）
  - `0` = 没有最低限制
  - `0.0001` = 0.0001 USDC 最低
  - `0.1` = 0.1 USDC 最低
  - `1.0` = 1.0 USDC 最低

---

## 使用场景示例

### 场景 1：测试环境（无最低限制）

```bash
curl -X POST http://localhost:3000/api/deepbook/listener/add-pool \
  -H "Content-Type: application/json" \
  -d '{
    "poolId": "0x2281...",
    "vaultId": "0x7af9...",
    "balanceManagerId": "0x2dad...",
    "floorPrice": 0.01
  }'
```

**说明**：不设置 `minBuybackAmount`，任何金额都可以回购 ✅

### 场景 2：小额回购（0.0001 USDC）

```bash
curl -X POST http://localhost:3000/api/deepbook/listener/add-pool \
  -H "Content-Type: application/json" \
  -d '{
    "poolId": "0x2281...",
    "vaultId": "0x7af9...",
    "balanceManagerId": "0x2dad...",
    "floorPrice": 0.01,
    "minBuybackAmount": 0.0001
  }'
```

**说明**：只有花费 >= 0.0001 USDC 的订单才会回购

### 场景 3：正常回购（1.0 USDC）

```bash
curl -X POST http://localhost:3000/api/deepbook/listener/add-pool \
  -H "Content-Type: application/json" \
  -d '{
    "poolId": "0x2281...",
    "vaultId": "0x7af9...",
    "balanceManagerId": "0x2dad...",
    "floorPrice": 0.01,
    "minBuybackAmount": 1.0
  }'
```

**说明**：只有花费 >= 1.0 USDC 的订单才会回购（节省 gas）

### 场景 4：大额回购（10.0 USDC）

```bash
curl -X POST http://localhost:3000/api/deepbook/listener/add-pool \
  -H "Content-Type: application/json" \
  -d '{
    "poolId": "0x2281...",
    "vaultId": "0x7af9...",
    "balanceManagerId": "0x2dad...",
    "floorPrice": 0.01,
    "minBuybackAmount": 10.0
  }'
```

**说明**：只回购大额订单

---

## 日志输出示例

### 注册时的日志

```bash
🏊 ====== Adding Pool to Listener ======
📋 Pool ID: 0x2281e4164e299193fff040bb7e3a...
🏦 Vault ID: 0x7af94521daa033f5e3a1bb9b998...
💼 Balance Manager ID: 0x2dad7c896a8b875969708eeb77c...
🪙 Coin Type: Will query from chain
🛡️  Floor Price: 0.010000 USDC
💰 Min Buyback Amount: 0.0001 USDC  ← 新增显示
👤 Owner: N/A
========================================

📝 [VaultRegistry] Pool Registered
   Pool ID: 0x2281e4164e299193ff...
   Vault ID: 0x7af94521daa033f5e3...
   💼 Balance Manager: 0x2dad7c896a8b875969... ✅
   🪙 Coin Type: MANSION
   🛡️  Floor Price: 0.010000 USDC
   💰 Min Buyback: 0.0001 USDC  ← 新增显示
   💡 Will trigger buyback when price < 0.010000 USDC
```

### 回购时的日志

```bash
🏦 Executing Buyback...
   Pool: 0x2281e4164e299193ff...
   Vault: 0x7af94521daa033f5e3...
   📦 Order Quantity: 100.000000 tokens (from sell order)
   💡 Using order quantity: 100.000000 tokens (from sell order)
   Price Diff: 90.00%
   Buyback Quantity: 100 tokens
   Estimated Cost: 0.100000 USDC
   ✅ Cost check passed (min: 0.0001 USDC)  ← 新增显示
```

### 被拦截时的日志

```bash
⚠️  Buyback cost (0.000050 USDC) below minimum (0.0001 USDC)
   💡 Pool minimum: 0.0001
   💡 Global minimum: not set
```

---

## 优先级规则

系统会按照以下优先级检查最低金额：

1. **Pool 特定设置** → 在注册 Pool 时设置的 `minBuybackAmount`（优先级最高）
2. **全局设置** → 环境变量 `BUYBACK_MIN_AMOUNT`
3. **无限制** → 如果都没设置，则没有最低限制（值为 0）

```javascript
// 优先级逻辑
const effectiveMinAmount = 
    vaultInfo.minBuybackAmount ||      // 1. Pool 特定设置
    this.minAmount ||                  // 2. 全局设置
    0;                                 // 3. 无限制
```

---

## 完整测试示例

### 测试 1：设置最低金额 0.0001 USDC

```bash
# 1. 注册 Pool（设置最低回购 0.0001 USDC）
curl -X POST http://localhost:3000/api/deepbook/listener/add-pool \
  -H "Content-Type: application/json" \
  -d '{
    "poolId": "0x2281e4164e299193fff040bb7e3a8e168cea3973adedfdfbd0ee95b96af722a3",
    "vaultId": "0x7af94521daa033f5e3a1bb9b99849beb68158e5818356e080d3cff78afbd28fd",
    "balanceManagerId": "0x2dad7c896a8b875969708eeb77cb0312f6c5cbdaa40c2befb7b7b5500400efdd",
    "floorPrice": 0.01,
    "minBuybackAmount": 0.0001
  }'

# 2. 记录一个符合条件的订单（100 tokens @ 0.001 = 0.1 USDC）
curl -X POST http://localhost:3000/api/orders/manual-record \
  -H "Content-Type: application/json" \
  -d '{
    "orders": [{
      "orderId": "170141183460487678475761013267500105732",
      "poolId": "0x2281e4164e299193fff040bb7e3a8e168cea3973adedfdfbd0ee95b96af722a3",  
      "price": "1000",
      "quantity": "100000000000",
      "isBid": false
    }]
  }'
```

**预期结果**：
```
✅ Cost check passed (min: 0.0001 USDC)
✅ Buyback executed!
```

### 测试 2：订单低于最低金额

```bash
# 1. 注册 Pool（设置最低回购 1.0 USDC）
curl -X POST http://localhost:3000/api/deepbook/listener/add-pool \
  -H "Content-Type: application/json" \
  -d '{
    "poolId": "0x2281...",
    "vaultId": "0x7af9...",
    "balanceManagerId": "0x2dad...",
    "floorPrice": 0.01,
    "minBuybackAmount": 1.0
  }'

# 2. 记录一个低于最低金额的订单（100 tokens @ 0.001 = 0.1 USDC）
curl -X POST http://localhost:3000/api/orders/manual-record \
  -H "Content-Type: application/json" \
  -d '{
    "orders": [{
      "orderId": "test_order",
      "poolId": "0x2281...",  
      "price": "1000",
      "quantity": "100000000000",
      "isBid": false
    }]
  }'
```

**预期结果**：
```
⚠️  Buyback cost (0.100000 USDC) below minimum (1.0 USDC)
❌ Buyback not executed
```

---

## 修改已注册的 Pool

如果需要修改已经注册的 Pool 的最低回购金额，重新调用注册 API 即可：

```bash
curl -X POST http://localhost:3000/api/deepbook/listener/add-pool \
  -H "Content-Type: application/json" \
  -d '{
    "poolId": "0x2281...",
    "vaultId": "0x7af9...",
    "balanceManagerId": "0x2dad...",
    "floorPrice": 0.01,
    "minBuybackAmount": 0.5
  }'
```

**说明**：系统会更新该 Pool 的配置

---

## API 响应示例

```json
{
  "success": true,
  "message": "Pool registered with buyback enabled",
  "data": {
    "poolId": "0x2281...",
    "vaultId": "0x7af9...",
    "balanceManagerId": "0x2dad...",
    "floorPrice": 10000,
    "floorPriceDisplay": "0.010000 USDC",
    "minBuybackAmount": 0.0001,
    "registeredToVault": true,
    "buybackEnabled": true
  }
}
```

---

## 环境变量（可选）

如果想设置全局默认值，在 `.env` 中：

```env
# 全局最低回购金额（USDC）
BUYBACK_MIN_AMOUNT=0.0001

# 启用回购
BUYBACK_ENABLED=true
```

**注意**：Pool 特定设置会覆盖全局设置

---

## 总结

### ✅ 优点

1. **灵活配置** - 每个 Pool 可以有不同的最低回购金额
2. **动态调整** - 通过 API 即时修改，无需重启服务器
3. **无需硬编码** - 不再需要在代码中写死默认值
4. **向后兼容** - 不设置时自动使用全局配置或无限制

### 🎯 推荐设置

| 环境 | 推荐值 | 说明 |
|------|-------|------|
| 测试 | 不设置 或 `0` | 无限制，方便测试 |
| 开发 | `0.0001` | 允许小额测试 |
| 生产 | `0.1` - `1.0` | 节省 gas，只回购有意义的订单 |

---

## 修改日期

2026-02-05

## 相关文件

- `AnchorStone/backend/buybackExecutor.js` - 回购执行逻辑
- `AnchorStone/backend/vaultRegistry.js` - 存储 Pool 配置
- `AnchorStone/backend/server.js` - API 端点

