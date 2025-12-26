# Enoki SDK 範例專案

這是一個展示如何使用 Mysten Labs Enoki SDK 的完整範例，讓用戶可以透過 Web2 登入方式（Google、Apple 等）使用 Sui 區塊鏈。

## 功能特色

- ✅ **Web2 登入整合** - 使用 Google、Facebook 等熟悉的登入方式
- ✅ **自動生成 Sui 地址** - 透過 zkLogin 技術自動為用戶創建區塊鏈地址
- ✅ **贊助交易** - 開發者可以為用戶支付 gas 費用
- ✅ **簡單易用** - 用戶無需了解錢包、私鑰等 Web3 概念

## 快速開始

### 1. 安裝依賴

```bash
npm install
```

### 2. 設定 API Keys

前往 [Enoki Portal](https://portal.enoki.mystenlabs.com/) 創建你的應用並獲取 API Keys：

1. 創建新的應用
2. 生成 **Public API Key** (用於前端 zkLogin)
3. 設定 OAuth 提供者（Google、Facebook 等）並獲取 **Client IDs**
4. 記下每個 OAuth 提供者的 Client ID

創建 `.env` 文件：

```bash
cp .env.example .env
```

編輯 `.env` 並填入你的配置：

```env
VITE_ENOKI_PUBLIC_KEY=your_enoki_public_key_here
VITE_SUI_NETWORK=testnet
```

然後編輯 `src/components/EnokiWalletRegistration.tsx`，更新 OAuth Client IDs：

```typescript
providers: {
  google: {
    clientId: 'your-google-client-id.apps.googleusercontent.com',
  },
  facebook: {
    clientId: 'your-facebook-app-id',
  },
}
```

### 3. 啟動開發伺服器

```bash
npm run dev
```

## 專案結構

```
Enoki/
├── src/
│   ├── App.tsx                 # 主要應用組件
│   ├── main.tsx               # 應用入口點
│   ├── components/
│   │   ├── LoginPage.tsx      # 登入頁面（自訂登入按鈕）
│   │   ├── Dashboard.tsx      # 用戶儀表板
│   │   └── TransactionDemo.tsx # 交易示範
│   ├── lib/
│   │   └── enoki.ts          # Enoki 客戶端配置
│   └── vite-env.d.ts
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
└── README.md
```

## 使用方式

### 基本登入流程

1. 用戶點擊「使用 Google 登入」按鈕
2. Enoki SDK 處理 OAuth 流程
3. 自動生成與用戶 JWT 綁定的 Sui 地址
4. 用戶可以開始進行區塊鏈交易

### 贊助交易

開發者可以選擇為用戶支付所有 gas 費用：

```typescript
// 在後端創建贊助交易
const sponsored = await enokiClient.createSponsoredTransaction({
  network: 'testnet',
  transactionKindBytes: txBytes,
  sender: userAddress,
  allowedMoveCallTargets: ['0x2::coin::transfer'],
});

// 執行贊助交易
await enokiClient.executeSponsoredTransaction({
  digest: sponsored.digest,
  signature: userSignature,
});
```

## 重要概念

### zkLogin
- Enoki 使用 zkLogin 技術生成自託管的 Sui 地址
- 用戶地址與其 Web2 憑證（JWT）綁定
- 每個應用有不同的 salt，所以同一用戶在不同應用有不同地址

### API Keys
- **Public Key**: 用於前端，啟用 zkLogin 功能
- **Private Key**: 用於後端，啟用贊助交易功能
- ⚠️ 絕對不要將 Private Key 暴露在前端！

## 文件資源

- [Enoki 官方文檔](https://docs.enoki.mystenlabs.com/)
- [Enoki TypeScript SDK](https://docs.enoki.mystenlabs.com/ts-sdk)
- [Sui 文檔](https://docs.sui.io/)
- [Enoki Portal](https://portal.enoki.mystenlabs.com/)

## 授權

MIT
