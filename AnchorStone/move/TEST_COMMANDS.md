# AnchorStone 測試指令

## 前置準備

### 1. 切換到測試網路
```bash
sui client switch --env testnet
```

### 2. 檢查當前地址和餘額
```bash
sui client active-address
sui client gas
```

### 3. 如果餘額不足，申請測試幣
```bash
curl --location --request POST 'https://faucet.testnet.sui.io/gas' \
--header 'Content-Type: application/json' \
--data-raw '{
    "FixedAmountRequest": {
        "recipient": "YOUR_ADDRESS"
    }
}'
```

## 部署合約

### 1. 編譯合約
```bash
cd /Users/jim/Desktop/sui-practice/AnchorStone/move
sui move build
```

### 2. 部署到測試網
```bash
sui client publish --gas-budget 100000000
```

**重要：記錄以下信息**
- `PACKAGE_ID`: 合約包 ID
- `TOKEN_REGISTRY_ID`: TokenRegistry 共享對象 ID（在 Created Objects 中找）

## 測試流程：Create Vault and Token

### 步驟 1: 鑄造 PropertyNFT

```bash
sui client call \
  --package PACKAGE_ID \
  --module rwa_vault \
  --function mint_nft_entry \
  --args \
    "Taipei Suite A1" \
    "Luxury suite in Xinyi District with city view" \
    "https://example.com/image.jpg" \
    5000000000 \
    "Taipei, Taiwan" \
  --gas-budget 10000000
```

**記錄：**
- `PROPERTY_NFT_ID`: 新創建的 PropertyNFT 對象 ID

### 步驟 2: 準備儲備金（使用 SUI 作為測試）

先分割一些 SUI 作為儲備金：

```bash
sui client split-coin \
  --coin-id YOUR_GAS_COIN_ID \
  --amounts 1000000000 \
  --gas-budget 10000000
```

**記錄：**
- `RESERVE_COIN_ID`: 分割出來的 Coin 對象 ID（1 SUI = 1000000000 MIST）

### 步驟 3: 創建代幣模組（witness）

首先需要創建一個簡單的 witness 模組。創建文件：

`sources/test_property_token.move`:
```move
module anchorstone::test_property_token {
    use sui::coin;

    public struct TEST_PROPERTY_TOKEN has drop {}

    fun init(witness: TEST_PROPERTY_TOKEN, ctx: &mut TxContext) {
        // 這個 witness 只用於測試，不需要創建 coin
        // 實際的 coin 會由 token_factory 創建
        transfer::public_transfer(witness, tx_context::sender(ctx));
    }
}
```

重新編譯和部署：
```bash
sui move build
sui client publish --gas-budget 100000000
```

**記錄新的：**
- `NEW_PACKAGE_ID`: 包含 test_property_token 的新包 ID
- `WITNESS_OBJECT_ID`: TEST_PROPERTY_TOKEN witness 對象 ID

### 步驟 4: 創建 Token 和 Vault（整合調用）

```bash
sui client call \
  --package NEW_PACKAGE_ID \
  --module rwa_vault \
  --function create_token_and_vault_entry \
  --type-args \
    "0x2::sui::SUI" \
    "NEW_PACKAGE_ID::test_property_token::TEST_PROPERTY_TOKEN" \
  --args \
    TOKEN_REGISTRY_ID \
    PROPERTY_NFT_ID \
    "Taipei Suite A1 Token" \
    "TSA1" \
    6 \
    "Fractional ownership token for Taipei Suite A1" \
    "https://example.com/icon.jpg" \
    WITNESS_OBJECT_ID \
    RESERVE_COIN_ID \
    100000000000 \
  --gas-budget 50000000
```

**參數說明：**
- `TOKEN_REGISTRY_ID`: TokenRegistry 共享對象
- `PROPERTY_NFT_ID`: PropertyNFT 對象
- `"Taipei Suite A1 Token"`: 代幣名稱
- `"TSA1"`: 代幣符號
- `6`: decimals
- `"Fractional ownership..."`: 描述
- `"https://..."`: 圖標 URL
- `WITNESS_OBJECT_ID`: witness 對象
- `RESERVE_COIN_ID`: 儲備金 Coin
- `100000000000`: 總代幣數量（100,000 tokens with 6 decimals）

**記錄：**
- `VAULT_ID`: 新創建的 RwaVault 共享對象 ID
- `TOKEN_MANAGER_ID`: TokenManager 對象 ID

### 步驟 5: 鑄造代幣

```bash
sui client call \
  --package NEW_PACKAGE_ID \
  --module rwa_vault \
  --function mint_tokens_entry \
  --type-args \
    "0x2::sui::SUI" \
    "NEW_PACKAGE_ID::test_property_token::TEST_PROPERTY_TOKEN" \
  --args \
    VAULT_ID \
    10000000000 \
  --gas-budget 10000000
```

**參數說明：**
- `VAULT_ID`: Vault 對象 ID
- `10000000000`: 鑄造數量（10,000 tokens with 6 decimals）

## 查詢和驗證

### 查看 TokenManager 信息
```bash
sui client object TOKEN_MANAGER_ID
```

應該看到：
- `property_id`
- `token_name`: "Taipei Suite A1 Token"
- `token_symbol`: "TSA1"
- `collateral_amount`: 1000000000（1 SUI）
- `collateral_type`: "Reserve Coin"

### 查看 Vault 信息
```bash
sui client object VAULT_ID
```

應該看到：
- `underlying_nft`: PropertyNFT 引用
- `total_fragments`: 100000000000
- `reserve_funds`: 1000000000

### 查看你的代幣餘額
```bash
sui client objects --json | grep TEST_PROPERTY_TOKEN
```

## 完整測試腳本範例

將以下內容保存為 `test.sh`：

```bash
#!/bin/bash

# 顏色輸出
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}=== AnchorStone 測試腳本 ===${NC}"

# 1. 部署合約
echo -e "${GREEN}步驟 1: 部署合約${NC}"
PUBLISH_OUTPUT=$(sui client publish --gas-budget 100000000 --json)
PACKAGE_ID=$(echo $PUBLISH_OUTPUT | jq -r '.objectChanges[] | select(.type=="published") | .packageId')
TOKEN_REGISTRY_ID=$(echo $PUBLISH_OUTPUT | jq -r '.objectChanges[] | select(.objectType | contains("TokenRegistry")) | .objectId')

echo "PACKAGE_ID: $PACKAGE_ID"
echo "TOKEN_REGISTRY_ID: $TOKEN_REGISTRY_ID"

# 2. 鑄造 NFT
echo -e "${GREEN}步驟 2: 鑄造 PropertyNFT${NC}"
NFT_OUTPUT=$(sui client call \
  --package $PACKAGE_ID \
  --module rwa_vault \
  --function mint_nft_entry \
  --args "Test Property" "Test Description" "https://example.com/image.jpg" 5000000000 "Test Location" \
  --gas-budget 10000000 \
  --json)

PROPERTY_NFT_ID=$(echo $NFT_OUTPUT | jq -r '.objectChanges[] | select(.objectType | contains("PropertyNFT")) | .objectId')
echo "PROPERTY_NFT_ID: $PROPERTY_NFT_ID"

# 3. 準備儲備金
echo -e "${GREEN}步驟 3: 準備儲備金${NC}"
GAS_COIN=$(sui client gas --json | jq -r '.[0].gasCoinId')
SPLIT_OUTPUT=$(sui client split-coin --coin-id $GAS_COIN --amounts 1000000000 --gas-budget 10000000 --json)
RESERVE_COIN_ID=$(echo $SPLIT_OUTPUT | jq -r '.objectChanges[] | select(.objectType=="0x2::coin::Coin<0x2::sui::SUI>") | .objectId' | head -1)
echo "RESERVE_COIN_ID: $RESERVE_COIN_ID"

echo -e "${BLUE}=== 測試完成 ===${NC}"
echo "請手動完成後續步驟（需要 witness 模組）"
```

## 注意事項

1. **Witness 問題**：由於 Sui Move 的限制，witness 類型必須在模組初始化時創建，無法直接在命令行中構造。你需要：
   - 創建一個簡單的 witness 模組
   - 部署該模組
   - 使用返回的 witness 對象

2. **Gas Budget**：根據操作複雜度調整 gas budget
   - 部署：100000000
   - 創建 vault：50000000
   - 鑄造代幣：10000000

3. **對象 ID**：每次操作後記錄對象 ID，用於後續步驟

4. **測試網重置**：測試網可能會定期重置，需要重新部署

## 簡化測試（使用預部署的 witness）

如果你想簡化測試，可以在合約中添加一個測試輔助函數：

```move
#[test_only]
public fun create_test_witness(): TEST_PROPERTY_TOKEN {
    TEST_PROPERTY_TOKEN {}
}
```

但這只能在測試環境中使用，不能在主網使用。
