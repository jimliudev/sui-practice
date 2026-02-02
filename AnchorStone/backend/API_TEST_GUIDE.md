# API 測試指南

## 獨立測試 API 端點

現在你可以單獨測試每個部署步驟，不需要跑完整流程！

### 1. 部署 Token 合約

**POST** `/api/test/deploy-token`

```bash
curl -X POST http://localhost:3000/api/test/deploy-token \
  -H "Content-Type: application/json" \
  -d '{
    "propertyId": "prop001",
    "propertyName": "Taipei Suite A1",
    "symbol": "TSA1"
  }'
```

**Response:**
```json
{
  "success": true,
  "step": "deploy-token",
  "result": {
    "packageId": "0x...",
    "treasuryCapId": "0x...",
    "tokenType": "0x...::property_token_prop001_...::PROPERTY_TOKEN_PROP001_...",
    "moduleName": "property_token_prop001_1234567890",
    "structName": "PROPERTY_TOKEN_PROP001_1234567890",
    "symbol": "TSA1",
    "transactionDigest": "..."
  }
}
```

---

### 2. 鑄造 PropertyNFT

**POST** `/api/test/mint-nft`

```bash
curl -X POST http://localhost:3000/api/test/mint-nft \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Taipei Suite A1",
    "description": "Luxury suite in Xinyi District",
    "imageUrl": "https://example.com/image.jpg",
    "propertyValue": 5000000000,
    "location": "Taipei, Taiwan"
  }'
```

**Response:**
```json
{
  "success": true,
  "step": "mint-nft",
  "result": {
    "nftId": "0x...",
    "propertyData": {
      "name": "Taipei Suite A1",
      "description": "Luxury suite in Xinyi District",
      "imageUrl": "https://example.com/image.jpg",
      "propertyValue": 5000000000,
      "location": "Taipei, Taiwan"
    }
  }
}
```

---

### 3. 準備儲備金

**POST** `/api/test/prepare-reserve`

```bash
curl -X POST http://localhost:3000/api/test/prepare-reserve \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 1000000000
  }'
```

**Response:**
```json
{
  "success": true,
  "step": "prepare-reserve",
  "result": {
    "coinId": "0x...",
    "amount": 1000000000,
    "amountInSui": "1.0000"
  }
}
```

**金額說明：**
- 1 SUI = 1,000,000,000 MIST
- 0.1 SUI = 100,000,000 MIST

---

### 4. 創建 Vault

**POST** `/api/test/create-vault`

```bash
curl -X POST http://localhost:3000/api/test/create-vault \
  -H "Content-Type: application/json" \
  -d '{
    "nftId": "0x...",
    "treasuryCapId": "0x...",
    "tokenType": "0x...::property_token_...",
    "reserveCoinId": "0x...",
    "totalSupply": 100000000000,
    "tokenName": "Taipei Suite A1 Token",
    "tokenSymbol": "TSA1",
    "tokenDecimals": 6
  }'
```

**Response:**
```json
{
  "success": true,
  "step": "create-vault",
  "result": {
    "vaultId": "0x...",
    "nftId": "0x...",
    "treasuryCapId": "0x...",
    "tokenType": "0x...::property_token_...",
    "totalSupply": 100000000000
  }
}
```

---

## 完整測試流程範例

### 步驟 1: 部署 Token
```bash
DEPLOY_RESULT=$(curl -s -X POST http://localhost:3000/api/test/deploy-token \
  -H "Content-Type: application/json" \
  -d '{"propertyId":"prop001","propertyName":"Test Property"}')

TREASURY_CAP_ID=$(echo $DEPLOY_RESULT | jq -r '.result.treasuryCapId')
TOKEN_TYPE=$(echo $DEPLOY_RESULT | jq -r '.result.tokenType')

echo "TreasuryCap ID: $TREASURY_CAP_ID"
echo "Token Type: $TOKEN_TYPE"
```

### 步驟 2: 鑄造 NFT
```bash
NFT_RESULT=$(curl -s -X POST http://localhost:3000/api/test/mint-nft \
  -H "Content-Type: application/json" \
  -d '{
    "name":"Test Property",
    "propertyValue":5000000000,
    "location":"Taipei"
  }')

NFT_ID=$(echo $NFT_RESULT | jq -r '.result.nftId')
echo "NFT ID: $NFT_ID"
```

### 步驟 3: 準備儲備金
```bash
RESERVE_RESULT=$(curl -s -X POST http://localhost:3000/api/test/prepare-reserve \
  -H "Content-Type: application/json" \
  -d '{"amount":1000000000}')

RESERVE_COIN_ID=$(echo $RESERVE_RESULT | jq -r '.result.coinId')
echo "Reserve Coin ID: $RESERVE_COIN_ID"
```

### 步驟 4: 創建 Vault
```bash
VAULT_RESULT=$(curl -s -X POST http://localhost:3000/api/test/create-vault \
  -H "Content-Type: application/json" \
  -d "{
    \"nftId\":\"$NFT_ID\",
    \"treasuryCapId\":\"$TREASURY_CAP_ID\",
    \"tokenType\":\"$TOKEN_TYPE\",
    \"reserveCoinId\":\"$RESERVE_COIN_ID\",
    \"totalSupply\":100000000000,
    \"tokenName\":\"Test Token\",
    \"tokenSymbol\":\"TEST\",
    \"tokenDecimals\":6
  }")

VAULT_ID=$(echo $VAULT_RESULT | jq -r '.result.vaultId')
echo "Vault ID: $VAULT_ID"
```

---

## 使用 Postman/Insomnia

### Collection 設置

1. **Base URL**: `http://localhost:3000`
2. **Headers**: `Content-Type: application/json`

### 測試順序

1. Deploy Token → 保存 `treasuryCapId` 和 `tokenType`
2. Mint NFT → 保存 `nftId`
3. Prepare Reserve → 保存 `coinId`
4. Create Vault → 使用上面保存的所有 ID

---

## 錯誤處理

### 常見錯誤

**1. Missing configuration**
```json
{
  "error": "Failed to deploy token",
  "message": "Please set SUI_PRIVATE_KEY environment variable"
}
```
→ 檢查 `.env` 文件中的 `SUI_PRIVATE_KEY`

**2. Insufficient balance**
```json
{
  "error": "Failed to prepare reserve coin",
  "message": "Insufficient balance"
}
```
→ 使用 faucet 申請測試幣

**3. Invalid object ID**
```json
{
  "error": "Failed to create vault",
  "message": "Object not found"
}
```
→ 檢查傳入的 object ID 是否正確

---

## 健康檢查

在測試前，先檢查服務狀態：

```bash
curl http://localhost:3000/health
```

確保：
- ✅ `status: "ok"`
- ✅ `hasPrivateKey: true`
- ✅ `deployerWallet.balance` > 0.1 SUI

---

## 提示

1. **保存 ID**：每步的輸出 ID 都要保存，下一步會用到
2. **等待確認**：每個交易需要等待鏈上確認（約 1-2 秒）
3. **Gas 費用**：每個操作需要消耗 gas，確保錢包有足夠餘額
4. **測試網**：建議先在測試網測試完整流程

---

## 完整流程 API

如果你想一次跑完整流程，使用原本的 API：

```bash
curl -X POST http://localhost:3000/api/properties \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Taipei Suite A1",
    "description": "Luxury suite",
    "imageUrl": "https://example.com/image.jpg",
    "propertyValue": 5000000000,
    "location": "Taipei, Taiwan",
    "reserveAmount": 1000000000,
    "totalSupply": 100000000000
  }'
```
