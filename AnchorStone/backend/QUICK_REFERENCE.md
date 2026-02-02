# 🚀 NFT Vault API 快速參考

## 一鍵測試（推薦）

### 方法 1: Node.js 腳本
```bash
node testVaultCreation.js
```

### 方法 2: Shell 腳本
```bash
./create_vault.sh
```

---

## 手動測試 API

### 1️⃣ 部署 Token
```bash
curl -X POST http://localhost:3000/api/test/deploy-token \
  -H "Content-Type: application/json" \
  -d '{"propertyId":"prop001","propertyName":"台北豪宅","symbol":"TPA1"}'
```
**保存**: `treasuryCapId`, `tokenType`

---

### 2️⃣ 鑄造 NFT
```bash
curl -X POST http://localhost:3000/api/test/mint-nft \
  -H "Content-Type: application/json" \
  -d '{
    "name":"台北豪宅",
    "propertyValue":5000000000,
    "location":"台北市"
  }'
```
**保存**: `nftId`

---

### 3️⃣ 準備儲備金
```bash
curl -X POST http://localhost:3000/api/test/prepare-reserve \
  -H "Content-Type: application/json" \
  -d '{"amount":1000000000}'
```
**保存**: `coinId`

---

### 4️⃣ 創建 Vault
```bash
curl -X POST http://localhost:3000/api/test/create-vault \
  -H "Content-Type: application/json" \
  -d '{
    "nftId":"<從步驟2>",
    "treasuryCapId":"<從步驟1>",
    "tokenType":"<從步驟1>",
    "reserveCoinId":"<從步驟3>",
    "totalSupply":100000000000,
    "tokenName":"台北豪宅代幣",
    "tokenSymbol":"TPA1",
    "tokenDecimals":6
  }'
```
**獲得**: `vaultId` ✅

---

## 金額說明

| 描述 | MIST 值 | SUI 值 |
|------|---------|--------|
| 1 SUI | 1000000000 | 1.0 |
| 0.1 SUI | 100000000 | 0.1 |
| 0.01 SUI | 10000000 | 0.01 |

| 描述 | 代幣值 (6 decimals) | 實際數量 |
|------|---------------------|----------|
| 100,000 tokens | 100000000000 | 100,000 |
| 10,000 tokens | 10000000000 | 10,000 |
| 1,000 tokens | 1000000000 | 1,000 |

---

## 常用命令

### 檢查服務器
```bash
curl http://localhost:3000/health
```

### 啟動服務器
```bash
npm start
```

### 查詢對象
```bash
sui client object <object-id>
```

### 申請測試幣
```bash
sui client faucet
```

---

## 故障排查

| 錯誤 | 解決方法 |
|------|----------|
| Missing configuration | 檢查 `.env` 文件中的 `SUI_PRIVATE_KEY` |
| Insufficient balance | 運行 `sui client faucet` |
| Object not found | 確認 object ID 正確且未被消耗 |
| Server not running | 運行 `npm start` |

---

## 文件說明

- **NFT_VAULT_TUTORIAL.md** - 詳細教學文檔
- **API_TEST_GUIDE.md** - 完整 API 文檔
- **testVaultCreation.js** - 自動化測試腳本
- **create_vault.sh** - Shell 腳本
- **vault_result.json** - 測試結果（自動生成）
