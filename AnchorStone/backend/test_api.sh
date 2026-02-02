#!/bin/bash

# 簡單的 API 測試腳本
# 使用方法: ./test_api.sh

BASE_URL="http://localhost:3000"

echo "========================================="
echo "🧪 測試 NFT Vault API"
echo "========================================="
echo ""

# 測試 1: 健康檢查
echo "1️⃣ 測試健康檢查..."
curl -s "${BASE_URL}/health" | jq '.status, .checks.deployerWallet.details.balance'
echo ""

# 測試 2: 鑄造 NFT
echo "2️⃣ 測試鑄造 NFT..."
curl -X POST "${BASE_URL}/api/test/mint-nft" \
  -H "Content-Type: application/json" \
  -d '{
    "name":"測試房產",
    "description":"這是一個測試房產",
    "imageUrl":"https://example.com/test.jpg",
    "propertyValue":5000000000,
    "location":"台北市"
  }' | jq '.'

echo ""
echo "✅ 測試完成！"
