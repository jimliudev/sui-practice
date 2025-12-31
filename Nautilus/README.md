# Nautilus TypeScript Client

基礎的 TypeScript 客戶端，用於與 Nautilus 互動 - Sui 區塊鏈上的可驗證鏈下計算框架。

## 關於 Nautilus

Nautilus 是一個用於在 Sui 區塊鏈上進行安全且可驗證的鏈下計算的框架。它允許開發者在可信執行環境 (TEE) 中執行敏感或資源密集的任務，例如 AWS Nitro Enclaves，同時通過智能合約驗證保持鏈上信任。

### 主要特性

- 🔒 **安全計算**: 在 TEE 中執行敏感計算
- ✅ **可驗證**: 通過 Sui 智能合約驗證 TEE 證明
- 🔗 **混合 dApp**: 結合鏈上驗證與鏈下計算
- 🛡️ **防篡改**: TEE 提供隔離和加密保護

## 安裝

```bash
npm install
```

## 專案結構

```
Nautilus/
├── src/
│   ├── client.ts      # 主要 NautilusClient 類別
│   ├── types.ts       # TypeScript 類型定義
│   ├── utils.ts       # 工具函數
│   └── index.ts       # 主要導出文件
├── examples/
│   └── basic-usage.ts # 基本使用範例
├── package.json
├── tsconfig.json
└── README.md
```

## 快速開始

### 1. 初始化客戶端

```typescript
import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import { NautilusClient } from './src/client';

// 創建 Sui 客戶端
const suiClient = new SuiClient({
  url: getFullnodeUrl('testnet'),
});

// 創建 Nautilus 客戶端
const nautilusClient = new NautilusClient({
  suiClient,
  enclaveEndpoint: 'https://your-tee-endpoint.example.com',
  packageId: '0x1234...', // 您的 Nautilus Move 包 ID
  requestTimeout: 30000,
});
```

### 2. 請求 TEE 計算

```typescript
const request = {
  operation: 'verify_identity',
  data: {
    userId: 'user123',
    credentials: 'encrypted_credentials',
  },
};

const response = await nautilusClient.requestComputation(request);
console.log('Result:', response.result);
console.log('Attestation:', response.attestation);
```

### 3. 驗證證明

```typescript
const verificationResult = nautilusClient.verifyAttestation(
  response.attestation,
  expectedPcrs // 可選的預期 PCR 值
);

if (verificationResult.isValid) {
  console.log('Attestation is valid!');
} else {
  console.error('Attestation verification failed:', verificationResult.error);
}
```

### 4. 提交到 Sui 區塊鏈

```typescript
const submitResult = await nautilusClient.submitToSui(response, {
  sender: '0xYourSuiAddress',
  gasBudget: 10000000,
});

console.log('Transaction digest:', submitResult.digest);
```

## 運行範例

```bash
npm run example
```

這將運行 `examples/basic-usage.ts` 文件，展示所有主要功能。

## API 文檔

### NautilusClient

主要客戶端類別，用於與 Nautilus TEE 和 Sui 區塊鏈互動。

#### 方法

- `requestComputation(request: ComputationRequest): Promise<ComputationResponse>`
  - 向 TEE 請求計算
  
- `verifyAttestation(attestation: AttestationDocument, expectedPcrs?: Record<number, string>): VerificationResult`
  - 客戶端證明驗證（基本驗證）
  
- `submitToSui(response: ComputationResponse, options: SubmitOptions): Promise<SubmitResult>`
  - 將計算結果提交到 Sui 區塊鏈進行鏈上驗證
  
- `healthCheck(): Promise<boolean>`
  - 檢查 TEE 端點健康狀態

### 工具函數

- `parseAttestationDocument(attestationBase64: string): AttestationDocument`
- `encodeRequestData(data: any): string`
- `decodeResponseData(dataBase64: string): any`
- `verifyPCRs(pcrs: Record<number, string>, expectedPcrs: Record<number, string>): boolean`
- `generateNonce(): string`
- `hexToBytes(hex: string): Uint8Array`
- `bytesToHex(bytes: Uint8Array): string`

## 類型定義

完整的 TypeScript 類型定義請參見 `src/types.ts`：

- `NautilusConfig` - 客戶端配置
- `AttestationDocument` - TEE 證明文檔結構
- `ComputationRequest` - 計算請求
- `ComputationResponse` - 計算響應
- `VerificationResult` - 驗證結果
- `SubmitOptions` - 提交選項
- `SubmitResult` - 提交結果

## 開發

### 構建

```bash
npm run build
```

這將編譯 TypeScript 代碼到 `dist/` 目錄。

### 類型檢查

TypeScript 編譯器會自動進行類型檢查。確保所有代碼都符合 `tsconfig.json` 中定義的嚴格類型規則。

## 注意事項

⚠️ **重要提醒**:

1. 這是一個基礎實現，用於演示 Nautilus 的核心概念
2. 完整的證明驗證應該在 Sui Move 智能合約中進行
3. 生產環境使用需要：
   - 實際的 TEE 端點
   - 適當的密鑰管理
   - 錯誤處理和重試邏輯
   - 安全的憑證存儲

## 相關資源

- [Nautilus 官方文檔](https://docs.sui.io/concepts/cryptography/nautilus)
- [Nautilus GitHub](https://github.com/MystenLabs/nautilus)
- [Nautilus Twitter 範例](https://github.com/MystenLabs/nautilus-twitter)
- [Sui TypeScript SDK](https://sdk.mystenlabs.com/typescript)

## 授權

Apache-2.0

## 貢獻

歡迎提交 Issue 和 Pull Request！

## 聯繫方式

如有關於 Nautilus 的問題、用例討論或集成支持，請在 [Sui Discord](https://discord.com/channels/916379725201563759/1361500579603546223) 上聯繫 Nautilus 團隊。
