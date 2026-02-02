# 🔧 修復說明：mintPropertyNFT is not a function

## 問題診斷

錯誤訊息：`{"error":"Failed to mint NFT","message":"mintPropertyNFT is not a function"}`

### 根本原因

`deployProperty.js` 中的輔助函數沒有被導出（export），導致 `server.js` 無法導入這些函數。

## 已修復的函數

我已經為以下函數添加了 `export` 關鍵字：

1. ✅ `export function generateTokenContract(propertyData)`
2. ✅ `export async function deployTokenContract(contractContent, moduleName)`
3. ✅ `export async function mintPropertyNFT(propertyData, keypair)`
4. ✅ `export async function prepareReserveCoin(amount, keypair)`
5. ✅ `export async function createVaultWithRegisteredToken(...)` - 新增函數

## 現在可以使用的 API

### 1. 部署 Token
```bash
curl -X POST http://localhost:3000/api/test/deploy-token \
  -H "Content-Type: application/json" \
  -d '{"propertyId":"prop001","propertyName":"台北豪宅","symbol":"TPA1"}'
```

### 2. 鑄造 NFT
```bash
curl -X POST http://localhost:3000/api/test/mint-nft \
  -H "Content-Type: application/json" \
  -d '{
    "name":"台北豪宅",
    "propertyValue":5000000000,
    "location":"台北市"
  }'
```

### 3. 準備儲備金
```bash
curl -X POST http://localhost:3000/api/test/prepare-reserve \
  -H "Content-Type: application/json" \
  -d '{"amount":1000000000}'
```

### 4. 創建 Vault
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

## 關於 TOKEN_REGISTRY_ID

目前你的 `.env` 文件中 `TOKEN_REGISTRY_ID` 是空的。這個 ID 只在使用 `create_vault_with_registered_token` 函數時才需要。

### 如何獲取 TOKEN_REGISTRY_ID

當你第一次部署合約時，會創建一個 `TokenRegistry` 共享對象。你可以通過以下方式找到它：

```bash
# 查看部署交易的事件
sui client events --transaction <部署時的交易digest>

# 或查找所有共享對象
sui client objects --json | jq '.[] | select(.data.type | contains("TokenRegistry"))'
```

### 暫時的解決方案

目前的 API 端點使用的是簡化版本，不需要 `TOKEN_REGISTRY_ID`。如果你需要使用完整的 token registry 功能，需要：

1. 找到 `TokenRegistry` 的對象 ID
2. 更新 `.env` 文件中的 `TOKEN_REGISTRY_ID`
3. 使用 `create_vault_with_token_entry` 函數

## 測試步驟

1. **重啟服務器**（如果還在運行）
   ```bash
   # 停止當前服務器 (Ctrl+C)
   # 重新啟動
   npm start
   ```

2. **測試健康檢查**
   ```bash
   curl http://localhost:3000/health
   ```

3. **運行完整測試**
   ```bash
   node testVaultCreation.js
   ```

## 驗證修復

修復後，你應該能夠：
- ✅ 成功調用 `/api/test/mint-nft`
- ✅ 成功調用 `/api/test/prepare-reserve`
- ✅ 成功調用 `/api/test/deploy-token`
- ✅ 成功調用 `/api/test/create-vault`

## 下一步

如果測試成功，你可以：
1. 使用自動化腳本測試完整流程
2. 集成到前端應用
3. 部署到生產環境

如果還有問題，請檢查：
- 服務器日誌中的錯誤訊息
- `.env` 文件中的配置
- 錢包餘額是否足夠
