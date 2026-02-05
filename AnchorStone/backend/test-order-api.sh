#!/bin/bash

# Test Order Management APIs
# 測試訂單管理 API

BACKEND_URL="http://localhost:3001"
POOL_ID="0x2281e4164e299193fff040bb7e3a8e168cea3973adedfdfbd0ee95b96af722a3"

echo "🧪 Testing Order Management APIs"
echo "================================="
echo ""

# 1. 手動補錄單個訂單
echo "📝 Test 1: Manual Record Single Order"
echo "--------------------------------------"
curl -X POST "$BACKEND_URL/api/orders/manual-record" \
  -H "Content-Type: application/json" \
  -d "{
    \"orderId\": \"170141183460515385485359725014027337733\",
    \"poolId\": \"$POOL_ID\",
    \"price\": \"1000000000\",
    \"quantity\": \"100000000000\",
    \"isBid\": false
  }"
echo -e "\n\n"

# 2. 手動補錄批量訂單
echo "📦 Test 2: Manual Record Batch Orders"
echo "--------------------------------------"
curl -X POST "$BACKEND_URL/api/orders/manual-record" \
  -H "Content-Type: application/json" \
  -d "{
    \"orders\": [
      {
        \"orderId\": \"170141183460515385485359725014027337734\",
        \"poolId\": \"$POOL_ID\",
        \"price\": \"2000000000\",
        \"quantity\": \"50000000000\",
        \"isBid\": false
      },
      {
        \"orderId\": \"170141183460515385485359725014027337735\",
        \"poolId\": \"$POOL_ID\",
        \"price\": \"500000000\",
        \"quantity\": \"200000000000\",
        \"isBid\": false
      }
    ]
  }"
echo -e "\n\n"

# 3. 查詢所有緩存訂單
echo "🔍 Test 3: Get All Cached Orders"
echo "--------------------------------------"
curl "$BACKEND_URL/api/orders/cache"
echo -e "\n\n"

# 4. 按 Pool ID 過濾
echo "🔍 Test 4: Get Orders by Pool ID"
echo "--------------------------------------"
curl "$BACKEND_URL/api/orders/cache?poolId=$POOL_ID"
echo -e "\n\n"

# 5. 查詢單個訂單
echo "🔍 Test 5: Get Single Order"
echo "--------------------------------------"
curl "$BACKEND_URL/api/orders/cache?orderId=170141183460515385485359725014027337733"
echo -e "\n\n"

# 6. 清理舊訂單（測試模式：清理 1 秒前的訂單）
echo "🧹 Test 6: Clean Old Orders (test mode: 1 second)"
echo "--------------------------------------"
sleep 2
curl -X POST "$BACKEND_URL/api/orders/clean" \
  -H "Content-Type: application/json" \
  -d '{ "maxAge": 1000 }'
echo -e "\n\n"

# 7. 再次查詢確認清理結果
echo "🔍 Test 7: Verify Clean Result"
echo "--------------------------------------"
curl "$BACKEND_URL/api/orders/cache"
echo -e "\n\n"

echo "✅ All tests completed!"
echo "================================="

