# 改进：基于订单数量的回购

## 概述

将回购策略从"固定数量阶梯"改为"**基于实际卖单数量**"，更加合理和精确。

## 之前的问题

### 固定阶梯策略（❌）

```javascript
// 不管卖单数量多少，都按阶梯买入固定数量
if (priceDiff < 0.05) {
    quantity = 100;    // 固定买 100
} else if (priceDiff < 0.10) {
    quantity = 500;    // 固定买 500
} else {
    quantity = 1000;   // 固定买 1000
}
```

**问题**：
- ❌ 卖单只有 50 个，却买 100 个 → 超买
- ❌ 卖单有 200 个，却只买 100 个 → 不够支撑价格
- ❌ 忽略了市场实际情况

## 新的策略

### 基于订单数量（✅）

```javascript
// 优先使用卖单的实际数量
if (orderQuantity !== null) {
    quantity = orderQuantity / 1_000_000_000;  // 转换为可读格式
    console.log(`Using order quantity: ${quantity} tokens`);
} else {
    // 回退到阶梯策略（仅在没有订单数据时）
    quantity = 100 / 500 / 1000;
}
```

**优点**：
- ✅ 精确匹配卖单数量
- ✅ 避免超买或不足
- ✅ 更高效使用资金
- ✅ 仍保留回退策略

## 实际场景对比

### 场景 1：小额卖单

**卖单**：50 个 token @ 0.001 USDC

| 策略 | 买入数量 | 花费 | 结果 |
|------|---------|------|------|
| **之前（固定）** | 100 tokens | 0.1 USDC | ❌ 超买 50 个 |
| **现在（基于订单）** | 50 tokens | 0.05 USDC | ✅ 精确匹配 |

### 场景 2：大额卖单

**卖单**：2000 个 token @ 0.001 USDC

| 策略 | 买入数量 | 花费 | 结果 |
|------|---------|------|------|
| **之前（固定）** | 1000 tokens | 1 USDC | ❌ 不够支撑 |
| **现在（基于订单）** | 2000 tokens | 2 USDC | ✅ 完全吃掉卖单 |

### 场景 3：没有订单数据（手动触发）

**手动触发回购**

| 策略 | 买入数量 | 说明 |
|------|---------|------|
| **之前（固定）** | 100/500/1000 | 固定阶梯 |
| **现在（回退）** | 100/500/1000 | ✅ 保留回退逻辑 |

## 代码修改

### 1. `deepbookListener.js` - 传递订单数量

#### recordOrder 函数
```javascript
// 触发回购时传递订单数量
if (this.onBuybackTrigger) {
    this.onBuybackTrigger({
        poolId,
        vaultId: vaultInfo.vaultId,
        currentPrice: priceIn6Decimals,
        floorPrice: floorPrice,
        orderId,
        orderQuantity: quantity,  // ✅ 传递订单数量
    });
}
```

#### handleOrderPlaced 函数
```javascript
// 监听到 OrderPlaced 事件时传递数量
if (this.onBuybackTrigger) {
    await this.onBuybackTrigger({
        poolId,
        vaultId: vaultInfo.vaultId,
        orderId: orderId,
        askPrice: priceIn6Decimals,
        quantity: quantity,  // ✅ 已经在传递（之前就有）
        floorPrice: vaultInfo.floorPrice,
        event: data,
        action: 'BUY_ASK_ORDER',
    });
}
```

### 2. `buybackExecutor.js` - 使用订单数量

#### calculateBuybackAmount 函数

**函数签名更新：**
```javascript
calculateBuybackAmount(poolId, currentPrice, floorPrice, orderQuantity = null)
```

**逻辑更新：**
```javascript
let quantity;

// ✅ 优先使用订单数量
if (orderQuantity !== null && orderQuantity !== undefined) {
    // orderQuantity 是 9 decimals raw format
    quantity = Number(orderQuantity) / 1_000_000_000;
    console.log(`💡 Using order quantity: ${quantity} tokens (from sell order)`);
} else {
    // ⚠️ 回退到阶梯策略
    console.log(`⚠️  No order quantity provided, using fallback strategy`);
    if (priceDiff < 0.05) {
        quantity = 100;
    } else if (priceDiff < 0.10) {
        quantity = 500;
    } else {
        quantity = 1000;
    }
}
```

#### executeBuyback 函数

**参数更新：**
```javascript
async executeBuyback(params) {
    const { 
        poolId, 
        vaultId, 
        currentPrice, 
        floorPrice, 
        orderQuantity,  // ✅ 新增
        quantity        // ✅ 兼容旧格式
    } = params;
    
    // 兼容不同的参数名称
    const actualQuantity = orderQuantity || quantity;
    
    // 传递给 calculateBuybackAmount
    const calculation = this.calculateBuybackAmount(
        poolId, 
        currentPrice, 
        floorPrice, 
        actualQuantity  // ✅ 传递订单数量
    );
}
```

## 日志输出示例

### 使用订单数量（✅）

```bash
🏦 Executing Buyback...
   Pool: 0x2281e4164e299193...
   Vault: 0x1234567890abcdef...
   📦 Order Quantity: 50.000000 tokens (from sell order)  # ✅ 显示来源

   💡 Using order quantity: 50.000000 tokens (from sell order)  # ✅ 使用订单数量
   Price Diff: 99.90%
   Buyback Quantity: 50 tokens  # ✅ 精确匹配
   Estimated Cost: 0.050000 USDC

   📊 Price Info:
      Current Price: 0.001000 USDC per token
      Buyback Quantity: 50 tokens (fixed)
      Estimated Cost: 0.050000 USDC
```

### 回退到阶梯策略（手动触发）

```bash
🏦 Executing Buyback...
   Pool: 0x2281e4164e299193...
   Vault: 0x1234567890abcdef...
   # 没有 "Order Quantity" 行

   ⚠️  No order quantity provided, using fallback strategy  # ⚠️ 回退提示
   Price Diff: 15.00%
   Buyback Quantity: 1000 tokens  # 使用阶梯策略
   Estimated Cost: 1.000000 USDC
```

## API 兼容性

### 手动触发回购（仍然支持）

```bash
# 不提供 quantity - 使用回退策略
curl -X POST http://localhost:3000/api/buyback/manual \
  -H "Content-Type: application/json" \
  -d '{
    "poolId": "0x2281...",
    "amount": 10
  }'

# 提供 quantity - 使用指定数量
curl -X POST http://localhost:3000/api/buyback/manual \
  -H "Content-Type: application/json" \
  -d '{
    "poolId": "0x2281...",
    "quantity": "50000000000"
  }'
```

### 记录订单（自动传递数量）

```bash
curl -X POST http://localhost:3000/api/orders/manual-record \
  -H "Content-Type: application/json" \
  -d '{
    "orderId": "123456789",
    "poolId": "0x2281...",
    "price": "1000",
    "quantity": "50000000000",  # ✅ 系统会使用这个数量
    "isBid": false
  }'
```

## 测试场景

### 1. 小额卖单测试

```bash
curl -X POST http://localhost:3000/api/orders/manual-record \
  -H "Content-Type: application/json" \
  -d '{
    "orderId": "test_small",
    "poolId": "YOUR_POOL_ID",
    "price": "1000",
    "quantity": "50000000000",
    "isBid": false
  }'
```

**预期**：
```
✅ Buyback Quantity: 50 tokens (from order)
✅ Estimated Cost: 0.05 USDC
```

### 2. 大额卖单测试

```bash
curl -X POST http://localhost:3000/api/orders/manual-record \
  -H "Content-Type: application/json" \
  -d '{
    "orderId": "test_large",
    "poolId": "YOUR_POOL_ID",
    "price": "1000",
    "quantity": "2000000000000",
    "isBid": false
  }'
```

**预期**：
```
✅ Buyback Quantity: 2000 tokens (from order)
✅ Estimated Cost: 2.0 USDC
```

### 3. 手动触发测试（无订单数据）

```bash
curl -X POST http://localhost:3000/api/buyback/manual \
  -H "Content-Type: application/json" \
  -d '{
    "poolId": "YOUR_POOL_ID"
  }'
```

**预期**：
```
⚠️  No order quantity provided, using fallback strategy
✅ Buyback Quantity: 100/500/1000 tokens (depending on price diff)
```

## 优势总结

### 1. 精确性
- ✅ 回购数量与卖单数量精确匹配
- ✅ 避免超买或不足

### 2. 效率
- ✅ 资金使用更高效
- ✅ 完全吃掉低价卖单

### 3. 灵活性
- ✅ 保留回退策略（手动触发时使用）
- ✅ 向后兼容

### 4. 可维护性
- ✅ 代码逻辑更清晰
- ✅ 日志输出更详细

## 相关文件

- `AnchorStone/backend/deepbookListener.js` - 传递订单数量
- `AnchorStone/backend/buybackExecutor.js` - 基于订单数量计算
- `AnchorStone/backend/server.js` - 回调处理（无需修改）

## 修改日期

2026-02-05

## 作者

AI Assistant (Cursor)

