#!/bin/bash

# AnchorStone 自動化測試腳本
# 使用方法: ./test.sh

set -e  # 遇到錯誤立即退出

# 顏色定義
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   AnchorStone 自動化測試腳本          ║${NC}"
echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo ""

# 檢查是否在正確的目錄
if [ ! -f "Move.toml" ]; then
    echo -e "${RED}錯誤: 請在 move 目錄下執行此腳本${NC}"
    exit 1
fi

# 步驟 1: 編譯合約
echo -e "${GREEN}[1/5] 編譯合約...${NC}"
sui move build
echo -e "${GREEN}✓ 編譯完成${NC}\n"

# 步驟 2: 部署合約
echo -e "${GREEN}[2/5] 部署合約到測試網...${NC}"
PUBLISH_OUTPUT=$(sui client publish --gas-budget 100000000 --json)

# 提取 Package ID 和 TokenRegistry ID
PACKAGE_ID=$(echo $PUBLISH_OUTPUT | jq -r '.objectChanges[] | select(.type=="published") | .packageId')
TOKEN_REGISTRY_ID=$(echo $PUBLISH_OUTPUT | jq -r '.objectChanges[] | select(.objectType | contains("TokenRegistry")) | .objectId')

if [ -z "$PACKAGE_ID" ] || [ -z "$TOKEN_REGISTRY_ID" ]; then
    echo -e "${RED}錯誤: 部署失敗，無法獲取 Package ID 或 TokenRegistry ID${NC}"
    exit 1
fi

echo -e "${BLUE}Package ID: ${YELLOW}$PACKAGE_ID${NC}"
echo -e "${BLUE}TokenRegistry ID: ${YELLOW}$TOKEN_REGISTRY_ID${NC}"
echo -e "${GREEN}✓ 部署完成${NC}\n"

# 步驟 3: 鑄造 PropertyNFT
echo -e "${GREEN}[3/5] 鑄造 PropertyNFT...${NC}"
NFT_OUTPUT=$(sui client call \
  --package $PACKAGE_ID \
  --module rwa_vault \
  --function mint_nft_entry \
  --args \
    "Taipei Luxury Suite A1" \
    "Premium suite in Xinyi District with panoramic city view" \
    "https://images.unsplash.com/photo-1545324418-cc1a3fa10c00" \
    5000000000 \
    "No.1 Xinyi Road, Taipei City, Taiwan" \
  --gas-budget 10000000 \
  --json)

PROPERTY_NFT_ID=$(echo $NFT_OUTPUT | jq -r '.objectChanges[] | select(.objectType | contains("PropertyNFT")) | .objectId')

if [ -z "$PROPERTY_NFT_ID" ]; then
    echo -e "${RED}錯誤: NFT 鑄造失敗${NC}"
    exit 1
fi

echo -e "${BLUE}PropertyNFT ID: ${YELLOW}$PROPERTY_NFT_ID${NC}"
echo -e "${GREEN}✓ NFT 鑄造完成${NC}\n"

# 步驟 4: 準備儲備金（分割 SUI）
echo -e "${GREEN}[4/5] 準備儲備金（1 SUI）...${NC}"
GAS_COIN=$(sui client gas --json | jq -r '.[0].gasCoinId')

if [ -z "$GAS_COIN" ]; then
    echo -e "${RED}錯誤: 無法獲取 gas coin${NC}"
    exit 1
fi

SPLIT_OUTPUT=$(sui client split-coin \
  --coin-id $GAS_COIN \
  --amounts 1000000000 \
  --gas-budget 10000000 \
  --json)

RESERVE_COIN_ID=$(echo $SPLIT_OUTPUT | jq -r '.objectChanges[] | select(.objectType=="0x2::coin::Coin<0x2::sui::SUI>") | .objectId' | sed -n '2p')

if [ -z "$RESERVE_COIN_ID" ]; then
    echo -e "${RED}錯誤: 儲備金準備失敗${NC}"
    exit 1
fi

echo -e "${BLUE}Reserve Coin ID: ${YELLOW}$RESERVE_COIN_ID${NC}"
echo -e "${GREEN}✓ 儲備金準備完成${NC}\n"

# 步驟 5: 顯示下一步指令
echo -e "${YELLOW}[5/5] 創建 Token 和 Vault${NC}"
echo -e "${YELLOW}由於 witness 限制，請手動執行以下步驟：${NC}\n"

echo -e "${BLUE}1. 創建 witness 模組文件：${NC}"
echo "   sources/test_property_token.move"
echo ""

echo -e "${BLUE}2. 重新部署包含 witness 的合約${NC}"
echo ""

echo -e "${BLUE}3. 執行以下命令創建 Token 和 Vault：${NC}"
echo ""
cat << EOF
sui client call \\
  --package <NEW_PACKAGE_ID> \\
  --module rwa_vault \\
  --function create_token_and_vault_entry \\
  --type-args \\
    "0x2::sui::SUI" \\
    "<NEW_PACKAGE_ID>::test_property_token::TEST_PROPERTY_TOKEN" \\
  --args \\
    $TOKEN_REGISTRY_ID \\
    $PROPERTY_NFT_ID \\
    "Taipei Suite A1 Token" \\
    "TSA1" \\
    6 \\
    "Fractional ownership token for Taipei Luxury Suite A1" \\
    "https://images.unsplash.com/photo-1545324418-cc1a3fa10c00" \\
    <WITNESS_OBJECT_ID> \\
    $RESERVE_COIN_ID \\
    100000000000 \\
  --gas-budget 50000000
EOF

echo ""
echo -e "${GREEN}════════════════════════════════════════${NC}"
echo -e "${GREEN}測試準備完成！${NC}"
echo -e "${GREEN}════════════════════════════════════════${NC}"
echo ""

# 保存變量到文件供後續使用
cat > test_vars.sh << EOF
#!/bin/bash
export PACKAGE_ID="$PACKAGE_ID"
export TOKEN_REGISTRY_ID="$TOKEN_REGISTRY_ID"
export PROPERTY_NFT_ID="$PROPERTY_NFT_ID"
export RESERVE_COIN_ID="$RESERVE_COIN_ID"
EOF

echo -e "${BLUE}變量已保存到 test_vars.sh${NC}"
echo -e "${BLUE}使用 'source test_vars.sh' 來載入變量${NC}"
