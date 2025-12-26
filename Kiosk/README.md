# Sui Kiosk TypeScript 範例

這個專案展示如何使用 TypeScript 操作 Sui Kiosk。

## 什麼是 Kiosk？

Kiosk 是 Sui 區塊鏈上的一個標準化解決方案，用於：
- **存放 NFT**: 將 NFT 放入 Kiosk 中安全存儲
- **交易 NFT**: 設定價格上架，讓其他人購買
- **執行 TransferPolicy**: 支援版稅、鎖定等進階功能

## 安裝

```bash
npm install
```

## 設定

1. 複製環境變數範例檔：
```bash
cp .env.example .env
```

2. 編輯 `.env` 檔案，填入您的私鑰：
```bash
# 從 Sui CLI 導出私鑰
sui keytool export --key-identity <your-alias>
```

3. 將導出的私鑰填入 `.env` 的 `SUI_PRIVATE_KEY`

## 可用指令

### 建立 Kiosk
```bash
npm run create-kiosk
```
建立一個新的 Kiosk，成為共享物件後任何人都可以查看和購買上架的物品。

### 查詢 Kiosk
```bash
npm run demo
```
執行完整示範，包括查詢現有 Kiosk 或建立新的 Kiosk。

### 放置物品
```bash
ITEM_ID=0x... ITEM_TYPE=0x...::module::Type npm run place-item
```
將物品放入 Kiosk（不上架）。

### 上架物品
```bash
ITEM_ID=0x... ITEM_TYPE=0x...::module::Type PRICE=1 npm run list-item
```
將物品放入 Kiosk 並以指定價格（SUI）上架。

### 購買物品
```bash
KIOSK_ID=0x... ITEM_ID=0x... ITEM_TYPE=0x...::module::Type PRICE=1 npm run purchase-item
```
從其他人的 Kiosk 購買物品。

### 提取收益
```bash
npm run withdraw-profits
```
提取 Kiosk 中累積的銷售收益。

## Kiosk 基本概念

### Kiosk 結構
- **Kiosk**: 共享物件，用於存放和展示 NFT
- **KioskOwnerCap**: 所有權憑證，控制 Kiosk 的操作權限

### 主要操作
1. **Place**: 將物品放入 Kiosk
2. **List**: 設定價格上架物品
3. **Delist**: 取消上架
4. **Purchase**: 購買上架的物品
5. **Take**: 從 Kiosk 取出物品（需遵守 TransferPolicy）
6. **Withdraw**: 提取銷售收益

### TransferPolicy
TransferPolicy 是控制物品轉移規則的機制，可以實現：
- 版稅 (Royalty)
- 鎖定期限 (Lock)
- 白名單 (Allowlist)
- 更多自定義規則

## 範例流程

```
1. 建立 Kiosk
   ↓
2. 放置 NFT 到 Kiosk
   ↓
3. 設定價格上架
   ↓
4. 買家購買 NFT
   ↓
5. 賣家提取收益
```

## 參考資源

- [Sui Kiosk 官方文件](https://docs.sui.io/standards/kiosk)
- [Mysten Labs Kiosk SDK](https://github.com/MystenLabs/sui/tree/main/sdk/kiosk)

# 鑄造 NFT
sui client call \
  --package 0xf1f5f40fb0ce27cdcd16a6a48ca39db2728706b8de64be6173726d833a275144 \
  --module nft \
  --function mint \
  --args "Test NFT not list" "A test NFT for Kiosk" "https://example.com/image.png" \
  --gas-budget 10000000

  NFT 0x9fd05d1f9a715620393385b663d7d4af0b5e71b2160f05de9c94d641247be861

ITEM_ID=0x9fd05d1f9a715620393385b663d7d4af0b5e71b2160f05de9c94d641247be861 ITEM_TYPE=0xf1f5f40fb0ce27cdcd16a6a48ca39db2728706b8de64be6173726d833a275144::nft::NFT PRICE=123999 npm run list-item

nft not list:
0x1a2c6ed147dcbcce7394eaab16a0d7ab791405bcb077b234a9bb333b354d50da

ITEM_ID=0x1a2c6ed147dcbcce7394eaab16a0d7ab791405bcb077b234a9bb333b354d50da ITEM_TYPE=0xf1f5f40fb0ce27cdcd16a6a48ca39db2728706b8de64be6173726d833a275144::nft::NFT npm run place-item