# DeepBook V3 交易演示

這個專案展示如何使用 DeepBook V3 TypeScript SDK 進行交易操作。

## DeepBook 簡介

DeepBook 是 Sui 區塊鏈上的中央限價訂單簿 (CLOB) DEX。它提供：
- 低延遲的限價單和市價單
- 鏈上訂單簿
- 完全去中心化的交易

## 快速開始

### 1. 安裝依賴

```bash
cd Deepbook
npm install
```

### 2. 配置環境

複製 `.env.example` 為 `.env` 並填寫：

```bash
cp .env.example .env
```

編輯 `.env`：
```
SUI_PRIVATE_KEY=你的私鑰
NETWORK=testnet
BALANCE_MANAGER_ID=
```

### 3. 創建 Balance Manager

Balance Manager 是 DeepBook 的核心組件，用於管理你的交易資金：

```bash
npm run create-balance-manager
```

將輸出的 ID 添加到 `.env` 的 `BALANCE_MANAGER_ID`。

### 4. 運行演示

```bash
npm run demo
```

## 可用腳本

| 命令 | 說明 |
|------|------|
| `npm run demo` | 完整交易演示 |
| `npm run create-balance-manager` | 創建 Balance Manager |
| `npm run deposit` | 存入資金到 Balance Manager |
| `npm run query-pools` | 查詢可用交易池 |
| `npm run query-balance` | 查詢 Balance Manager 餘額 |
| `npm run query-orders` | 查詢未成交訂單 |
| `npm run place-limit-order` | 放置限價單 |
| `npm run place-market-order` | 放置市價單 |
| `npm run cancel-order` | 取消訂單 |
| `npm run swap` | 代幣兌換 |

## 使用示例

### Build smart contract and mint

```bash
sui client publish --gas-budget 100000000

sui client call \
  --package 0xc141f2d7399f14a7c0334fdf655f8e7d4176e21331da9187a5ff20d20737fb39 \
  --module test01_coin \
  --function mint \
  --args 0x57b439bd440f92adef80f7faacf77ed038ce7dbc58164930d0a06d540ba35839 1000000000000 0x3f58a419f88a0b054daebff43c2a759a7a390a6f749cfc991793134cf6a89e21 \
  --gas-budget 10000000
```


### Creat Pool

```bash
npm run create-pool -- \
  --base TEST01_COIN \
  --quote SUI \
  --customCoin "0xc141f2d7399f14a7c0334fdf655f8e7d4176e21331da9187a5ff20d20737fb39::test01_coin::TEST01_COIN::9"

# 先獲取 SUI
curl --location --request POST 'https://faucet.testnet.sui.io/gas' \
  --header 'Content-Type: application/json' \
  --data-raw '{"FixedAmountRequest":{"recipient":"0x3f58a419f88a0b054daebff43c2a759a7a390a6f749cfc991793134cf6a89e21"}}'
```

### 限價單

```bash
# 買入 1 SUI，價格 1.5 USDC
npm run place-limit-order -- --pool SUI_USDC --price 1.5 --quantity 1 --side buy

# 賣出 1 SUI，價格 5 USDC
npm run place-limit-order -- --pool SUI_USDC --price 5 --quantity 1 --side sell
```

### 市價單

```bash
# 市價買入 0.1 SUI
npm run place-market-order -- --pool SUI_USDC --quantity 0.1 --side buy

# 市價賣出 0.1 SUI
npm run place-market-order -- --pool SUI_USDC --quantity 0.1 --side sell
```

### 取消訂單

```bash
# 取消特定訂單
npm run cancel-order -- --pool SUI_USDC --orderId 123456789

# 取消所有訂單
npm run cancel-order -- --pool SUI_USDC --all true
```

### 代幣兌換 (Swap)

```bash
# 估算兌換
npm run swap -- --pool SUI_USDC --amount 1 --direction base-to-quote --estimate true

# 執行兌換: SUI -> USDC
npm run swap -- --pool SUI_USDC --amount 1 --direction base-to-quote

# 執行兌換: USDC -> SUI
npm run swap -- --pool SUI_USDC --amount 10 --direction quote-to-base
```

### 查詢訂單簿

```bash
# 查詢特定池子的訂單簿
npm run query-orders SUI_USDC book

# 查詢所有池子的訂單
npm run query-orders all
```

## 核心概念

### Balance Manager

- 管理用戶在 DeepBook 上的所有資金
- 所有交易操作（除了 swap）都需要 Balance Manager
- 一個 Balance Manager 可以在所有池子中使用
- 必須是 shared object

### 訂單類型

| 類型 | 說明 |
|------|------|
| NO_RESTRICTION | 無限制，正常限價單 |
| IMMEDIATE_OR_CANCEL | 立即成交否則取消 |
| FILL_OR_KILL | 全部成交否則取消 |
| POST_ONLY | 只做 Maker（不吃單） |

### 交易對 (Pools)

常用的交易對：
- `SUI_USDC` - SUI/USDC
- `DEEP_SUI` - DEEP/SUI
- `DEEP_USDC` - DEEP/USDC

### 費用

- Taker 費率: 約 0.1%
- Maker 費率: 約 0.05%
- 可以用 DEEP 代幣支付費用獲得折扣

## 代碼結構

```
src/
├── config.ts              # 配置和工具函數
├── createBalanceManager.ts # 創建 Balance Manager
├── deposit.ts             # 存入資金
├── queryPools.ts          # 查詢交易池
├── queryBalance.ts        # 查詢餘額
├── queryOrders.ts         # 查詢訂單
├── placeLimitOrder.ts     # 限價單
├── placeMarketOrder.ts    # 市價單
├── cancelOrder.ts         # 取消訂單
├── swap.ts                # 代幣兌換
└── demo.ts                # 完整演示
```

## 在代碼中使用

```typescript
import { DeepBookClient } from '@mysten/deepbook-v3';
import { Transaction } from '@mysten/sui/transactions';
import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';

// 初始化客戶端
const dbClient = new DeepBookClient({
  address: '你的地址',
  env: 'testnet',
  client: new SuiClient({ url: getFullnodeUrl('testnet') }),
  balanceManagers: {
    MANAGER_1: {
      address: 'Balance Manager ID',
    },
  },
});

// 創建交易
const tx = new Transaction();

// 下限價買單
tx.add(
  dbClient.deepBook.placeLimitOrder({
    poolKey: 'SUI_USDC',
    balanceManagerKey: 'MANAGER_1',
    clientOrderId: '123456',
    price: 1.5,
    quantity: 1,
    isBid: true,
  })
);

// 執行交易
const result = await client.signAndExecuteTransaction({
  transaction: tx,
  signer: keypair,
});
```

## 參考資料

- [DeepBook V3 文檔](https://docs.sui.io/standards/deepbookv3/design)
- [DeepBook V3 GitHub](https://github.com/MystenLabs/deepbookv3)
- [DeepBook TypeScript SDK](https://www.npmjs.com/package/@mysten/deepbook-v3)
- [Sui TypeScript SDK](https://sdk.mystenlabs.com/typescript)

## 注意事項

1. **測試網使用**: 首先在 testnet 上測試所有功能
2. **資金安全**: 妥善保管私鑰，不要提交到版本控制
3. **滑點保護**: 市價單和 swap 時設置合理的 minOut
4. **Gas 費用**: 確保錢包有足夠的 SUI 支付 gas
5. **DEEP 代幣**: 建議持有一些 DEEP 代幣來支付交易費用