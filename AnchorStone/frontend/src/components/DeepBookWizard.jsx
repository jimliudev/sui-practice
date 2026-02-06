/**
 * DeepBookWizard Component
 * 
 * Step 6: 發起 DeepBook 交易
 * - 創建 Balance Manager
 * - 創建 Pool
 * - 存入資金
 * - 掛限價單
 */

import { useState, useEffect } from 'react'
import { Transaction } from '@mysten/sui/transactions'
import { useSuiClient, useCurrentAccount, useSignAndExecuteTransaction } from '@mysten/dapp-kit'
import { DeepBookClient } from '@mysten/deepbook-v3'
import { checkDeepBalance, checkUsdcBalance, extractObjectId, generateOrderId, BUILT_IN_COINS, createCustomCoinConfig } from '../utils/deepbookHelpers'

// DeepBook Package ID (Testnet)
const DEEPBOOK_PACKAGE_ID = 'fb28c4cbc6865bd1c897d26aecbe1f8792d1509a20ffec692c800660cbec6982'

// Reserve Coin Type for RwaVault (儲備金類型)
// RwaVault<T, FRAC> 中的 T 是儲備金類型（例如 USDC）
// 在 AnchorStone 中，我們使用 DBUSDC 作為儲備金和交易報價貨幣
const RESERVE_COIN_TYPE = '0xf7152c05930480cd740d7311b5b8b45c6f488e3a53a11c3f74a6fac36a52e0d7::DBUSDC::DBUSDC'

// 從 tokenType 提取 coin key (例如 0x...::my_token::MY_TOKEN -> MY_TOKEN)
function extractCoinKey(tokenType) {
    if (!tokenType) return 'CUSTOM_TOKEN'
    const parts = tokenType.split('::')
    return parts.length >= 3 ? parts[2] : 'CUSTOM_TOKEN'
}

export default function DeepBookWizard({
    tokenType,
    packageId,
    vaultId,
    totalTokenSupply,
    onBack
}) {
    const suiClient = useSuiClient()
    const currentAccount = useCurrentAccount()
    const { mutateAsync: signAndExecuteTransaction } = useSignAndExecuteTransaction()

    const [currentStep, setCurrentStep] = useState(1)
    const [isProcessing, setIsProcessing] = useState(false)
    const [error, setError] = useState(null)

    // DeepBook 相關狀態
    const [balanceManagerId, setBalanceManagerId] = useState(null)
    const [poolId, setPoolId] = useState(null)
    const [deepBalance, setDeepBalance] = useState(0)
    const [usdcBalance, setUsdcBalance] = useState(0)
    const [orderBook, setOrderBook] = useState({
        bids: [],
        asks: [],
        bestBid: null,
        bestAsk: null,
        tickSize: 0.001,
        lotSize: 0.1,
    })
    const [isLoadingOrderBook, setIsLoadingOrderBook] = useState(false)
    const [myOpenOrders, setMyOpenOrders] = useState([])
    const [isLoadingMyOrders, setIsLoadingMyOrders] = useState(false)
    const [tradeHistory, setTradeHistory] = useState([])
    const [isLoadingTrades, setIsLoadingTrades] = useState(false)
    const [poolStats, setPoolStats] = useState({
        totalOrders: 0,
        totalBids: 0,
        totalAsks: 0,
        totalTrades: 0,
        totalVolume: 0,
    })
    const [managerBalances, setManagerBalances] = useState(null) // { fTokenBalance, usdcBalance }
    const [isLoadingBalances, setIsLoadingBalances] = useState(false)

    // 手動輸入的 tokenType (用於測試模式)
    const [manualTokenType, setManualTokenType] = useState(null)
    const [manualVaultId, setManualVaultId] = useState(null)
    const [manualPackageId, setManualPackageId] = useState(null)
    const [manualTokenSymbol, setManualTokenSymbol] = useState(null)  // F Token Symbol

    // 表單數據
    const [formData, setFormData] = useState({
        // Pool 配置
        tickSize: 0.001,
        lotSize: 0.1,
        minSize: 1,
        floorPrice: null,  // ⚠️ 必須由用戶設定，不提供默認值
        // 存款金額
        depositUsdc: 10,
        depositFToken: 5,
        // 限價單
        sellPrice: 5.0,
        sellQuantity: 1,
        buyPrice: 3.0,
        buyQuantity: 1,
    })

    // 創建 DeepBook Client (含 pools 配置)
    // 優先使用手動輸入的值（用於測試模式）
    const effectiveTokenType = manualTokenType || tokenType
    const effectiveVaultId = manualVaultId || vaultId
    const effectivePackageId = manualPackageId || packageId
    // 優先使用手動輸入的 symbol，否則從 tokenType 提取
    const coinKey = manualTokenSymbol || extractCoinKey(effectiveTokenType)
    const poolKey = `${coinKey}_DBUSDC`
    
    // Token scalar（小數位數轉換）
    // 大多數自定義代幣使用 6 位小數，但需要確認
    const TOKEN_SCALAR = 1_000_000  // 6 decimals
    const USDC_SCALAR = 1_000_000   // DBUSDC 使用 6 decimals

    const createDbClient = (balanceManagerAddress = null, customPoolId = null) => {
        if (!currentAccount) return null

        console.log('\n====== 🏗️ Creating DeepBook Client ======')
        console.log('effectiveTokenType:', effectiveTokenType)
        console.log('effectivePackageId:', effectivePackageId)
        console.log('coinKey:', coinKey)
        console.log('poolKey:', poolKey)
        console.log('balanceManagerAddress:', balanceManagerAddress)
        console.log('customPoolId:', customPoolId)

        // 自定義代幣配置 - 使用動態 coinKey
        const customCoins = effectiveTokenType ? {
            [coinKey]: createCustomCoinConfig(effectivePackageId, effectiveTokenType, 6)
        } : {}

        const coins = {
            ...BUILT_IN_COINS,
            ...customCoins,
        }
        
        console.log('Available coins:', Object.keys(coins))
        if (customCoins[coinKey]) {
            console.log(`Custom coin [${coinKey}]:`, customCoins[coinKey])
        }

        // 自定義池子配置 (如果已創建) - 使用動態 poolKey
        const pools = customPoolId ? {
            [poolKey]: {
                address: customPoolId,
                baseCoin: coinKey,
                quoteCoin: 'DBUSDC',
            }
        } : undefined
        
        if (pools) {
            console.log('Available pools:', Object.keys(pools))
            console.log(`Pool [${poolKey}]:`, pools[poolKey])
        } else {
            console.log('⚠️ No pools configured (customPoolId is null)')
        }

        // Balance Manager 配置
        const balanceManagers = balanceManagerAddress ? {
            MANAGER_1: {
                address: balanceManagerAddress,
            }
        } : undefined
        
        if (balanceManagers) {
            console.log('Balance Managers:', Object.keys(balanceManagers))
        } else {
            console.log('⚠️ No balance managers configured')
        }

        const client = new DeepBookClient({
            address: currentAccount.address,
            env: 'testnet',
            client: suiClient,
            coins,
            pools,
            balanceManagers,
        })
        
        console.log('✅ DeepBook Client created')
        return client
    }

    const handleInputChange = (field, value) => {
        setFormData(prev => ({ ...prev, [field]: value }))
    }

    // 查詢 Pool 的所有掛單和成交記錄
    const fetchPoolOrders = async (queryPoolId) => {
        setIsLoadingMyOrders(true)
        setIsLoadingTrades(true)
        
        try {
            console.log('🔍 Querying pool orders for:', queryPoolId)
            
            const ORDER_PLACED_EVENT = `0x${DEEPBOOK_PACKAGE_ID}::order_info::OrderPlaced`
            const ORDER_FILLED_EVENT = `0x${DEEPBOOK_PACKAGE_ID}::order_info::OrderFilled`
            const ORDER_CANCELED_EVENT = `0x${DEEPBOOK_PACKAGE_ID}::order_info::OrderCanceled`
            
            // 查詢掛單事件
            const placedResponse = await suiClient.queryEvents({
                query: {
                    MoveEventType: ORDER_PLACED_EVENT
                },
                limit: 50,
                order: 'descending'
            })
            
            // 查詢成交事件
            const filledResponse = await suiClient.queryEvents({
                query: {
                    MoveEventType: ORDER_FILLED_EVENT
                },
                limit: 50,
                order: 'descending'
            })
            
            // 查詢取消事件
            const canceledResponse = await suiClient.queryEvents({
                query: {
                    MoveEventType: ORDER_CANCELED_EVENT
                },
                limit: 50,
                order: 'descending'
            })
            
            console.log('📦 Placed events:', placedResponse.data.length)
            console.log('📦 Filled events:', filledResponse.data.length)
            console.log('📦 Canceled events:', canceledResponse.data.length)
            
            // 處理掛單事件
            const DEEPBOOK_SCALAR = 1_000_000_000
            const allPlacedOrders = []
            const trades = []
            const filledOrderIds = new Set()
            const canceledOrderIds = new Set()
            
            // 收集所有已成交的訂單 ID
            for (const event of filledResponse.data) {
                const eventData = event.parsedJson
                if (!eventData) continue
                
                const eventPoolId = eventData.pool_id?.replace(/^0x0*/, '0x')
                const targetPoolId = queryPoolId?.replace(/^0x0*/, '0x')
                
                if (eventPoolId === targetPoolId) {
                    // 記錄已成交的訂單 ID
                    if (eventData.order_id) {
                        filledOrderIds.add(eventData.order_id.toString())
                    }
                    
                    // 保存成交記錄
                    trades.push({
                        orderId: eventData.order_id,
                        maker: eventData.maker,
                        taker: eventData.taker,
                        price: Number(eventData.execution_price) / DEEPBOOK_SCALAR,
                        baseQuantity: Number(eventData.base_quantity) / DEEPBOOK_SCALAR,
                        quoteQuantity: Number(eventData.quote_quantity) / DEEPBOOK_SCALAR,
                        makerIsBid: eventData.maker_is_bid,
                        timestamp: event.timestampMs,
                        poolId: eventData.pool_id,
                        txDigest: event.id?.txDigest,
                    })
                }
            }
            
            // 收集所有已取消的訂單 ID
            for (const event of canceledResponse.data) {
                const eventData = event.parsedJson
                if (!eventData) continue
                
                const eventPoolId = eventData.pool_id?.replace(/^0x0*/, '0x')
                const targetPoolId = queryPoolId?.replace(/^0x0*/, '0x')
                
                if (eventPoolId === targetPoolId && eventData.order_id) {
                    canceledOrderIds.add(eventData.order_id.toString())
                }
            }
            
            console.log(`🔍 Filled order IDs: ${filledOrderIds.size}`)
            console.log(`🔍 Canceled order IDs: ${canceledOrderIds.size}`)
            
            // 過濾並解析掛單，排除已成交和已取消的訂單
            for (const event of placedResponse.data) {
                const eventData = event.parsedJson
                if (!eventData) continue
                
                // 只保留目標 Pool 的訂單
                const eventPoolId = eventData.pool_id?.replace(/^0x0*/, '0x')
                const targetPoolId = queryPoolId?.replace(/^0x0*/, '0x')
                
                if (eventPoolId === targetPoolId) {
                    const orderIdStr = eventData.order_id?.toString()
                    const isFilledOrCanceled = filledOrderIds.has(orderIdStr) || canceledOrderIds.has(orderIdStr)
                    
                    const order = {
                        orderId: eventData.order_id,
                        clientOrderId: eventData.client_order_id,
                        trader: eventData.trader,
                        price: Number(eventData.price) / DEEPBOOK_SCALAR,
                        quantity: Number(eventData.placed_quantity) / DEEPBOOK_SCALAR,
                        isBid: eventData.is_bid,
                        timestamp: event.timestampMs,
                        balanceManagerId: eventData.balance_manager_id,
                        poolId: eventData.pool_id,
                        txDigest: event.id?.txDigest,
                        status: isFilledOrCanceled ? 'closed' : 'open',
                    }
                    
                    allPlacedOrders.push(order)
                }
            }
            
            // 只保留有效的掛單（未成交且未取消）
            const activeOrders = allPlacedOrders.filter(o => o.status === 'open')
            
            console.log(`✅ Total placed orders: ${allPlacedOrders.length}`)
            console.log(`✅ Active orders: ${activeOrders.length}`)
            console.log(`✅ Trades: ${trades.length}`)
            
            // 計算統計數據（使用有效訂單）
            const bids = activeOrders.filter(o => o.isBid)
            const asks = activeOrders.filter(o => !o.isBid)
            const totalVolume = trades.reduce((sum, t) => sum + t.quoteQuantity, 0)
            
            setPoolStats({
                totalOrders: activeOrders.length,
                totalBids: bids.length,
                totalAsks: asks.length,
                totalTrades: trades.length,
                totalVolume: totalVolume,
            })
            
            // 更新最佳買賣價（只使用有效訂單）
            const bestBidPrice = bids.length > 0 ? Math.max(...bids.map(b => b.price)) : null
            const bestAskPrice = asks.length > 0 ? Math.min(...asks.map(a => a.price)) : null
            
            console.log(`📊 Best Bid: ${bestBidPrice?.toFixed(6) || 'N/A'}`)
            console.log(`📊 Best Ask: ${bestAskPrice?.toFixed(6) || 'N/A'}`)
            
            setOrderBook(prev => ({
                ...prev,
                bestBid: bestBidPrice,
                bestAsk: bestAskPrice,
                bids: bids.sort((a, b) => b.price - a.price).slice(0, 5).map(o => ({ price: o.price, quantity: o.quantity })),
                asks: asks.sort((a, b) => a.price - b.price).slice(0, 5).map(o => ({ price: o.price, quantity: o.quantity })),
            }))
            
            // 顯示所有訂單（包含已關閉的，用於展示歷史）
            setMyOpenOrders(allPlacedOrders)
            setTradeHistory(trades)
            
        } catch (err) {
            console.error('❌ Failed to fetch pool orders:', err)
            setMyOpenOrders([])
            setTradeHistory([])
        } finally {
            setIsLoadingMyOrders(false)
            setIsLoadingTrades(false)
        }
    }

    // 查詢訂單簿（Level 2 數據）和用戶挂單
    const fetchOrderBook = async () => {
        setIsLoadingOrderBook(true)
        setIsLoadingMyOrders(true)
        
        try {
            // 獲取查詢條件
            const queryInput = document.getElementById('queryOrderInput')
            const queryTypeRadio = document.querySelector('input[name="queryType"]:checked')
            const queryValue = queryInput?.value.trim() || currentAccount?.address
            const queryType = queryTypeRadio?.value || 'address'
            
            console.log('🔍 Query type:', queryType)
            console.log('🔍 Query value:', queryValue)
            
            // 如果是 Pool ID 查詢，使用新的查詢函數
            if (queryType === 'pool') {
                setIsLoadingOrderBook(false)
                await fetchPoolOrders(queryValue)
                return
            }
            
            if (!queryValue) {
                console.error('❌ No query value provided')
                setMyOpenOrders([])
                setIsLoadingMyOrders(false)
                return
            }
            
            // 查詢該地址或 Balance Manager 的訂單
            try {
                console.log('🔍 Querying orders...')
                
                let txResponse
                
                if (queryType === 'address') {
                    // 使用錢包地址查詢：查詢該地址發起的交易
                    console.log('📦 Querying by address:', queryValue)
                    txResponse = await suiClient.queryTransactionBlocks({
                        filter: {
                            FromAddress: queryValue
                        },
                        options: {
                            showEvents: true,
                            showEffects: true,
                            showInput: true,
                        },
                        limit: 100, // 增加數量以獲取更多歷史記錄
                        order: 'descending'
                    })
                } else {
                    // 使用 Balance Manager ID 查詢：查詢使用該 Balance Manager 的交易
                    console.log('📦 Querying by Balance Manager:', queryValue)
                    txResponse = await suiClient.queryTransactionBlocks({
                        filter: {
                            InputObject: queryValue
                        },
                        options: {
                            showEvents: true,
                            showEffects: true,
                            showInput: true,
                        },
                        limit: 100,
                        order: 'descending'
                    })
                }
                
                console.log('📦 Total transactions found:', txResponse.data.length)
                
                // 從交易中提取 OrderPlaced 事件
                const orders = []
                const eventType = `0x${DEEPBOOK_PACKAGE_ID}::order_info::OrderPlaced`
                
                for (const tx of txResponse.data) {
                    try {
                        const events = tx.events || []
                        
                        for (const event of events) {
                            if (event.type === eventType) {
                                const eventData = event.parsedJson
                                
                                if (!eventData) continue
                                
                                // 根據查詢類型過濾
                                if (queryType === 'address') {
                                    // 檢查 trader 地址是否匹配
                                    const traderMatch = eventData.trader?.replace(/^0x/, '') === queryValue?.replace(/^0x/, '')
                                    if (!traderMatch) continue
                                } else {
                                    // 檢查 balance_manager_id 是否匹配
                                    const bmMatch = eventData.balance_manager_id?.replace(/^0x/, '') === queryValue?.replace(/^0x/, '')
                                    if (!bmMatch) continue
                                }
                                
                                console.log('✅ Found matching order:', eventData)
                                
                                // DeepBook 使用 1e9 作為價格和數量的 scalar
                                const DEEPBOOK_SCALAR = 1_000_000_000
                                
                                const order = {
                                    orderId: eventData.order_id,
                                    clientOrderId: eventData.client_order_id,
                                    trader: eventData.trader,
                                    price: Number(eventData.price) / DEEPBOOK_SCALAR,
                                    quantity: Number(eventData.placed_quantity) / DEEPBOOK_SCALAR,
                                    isBid: eventData.is_bid,
                                    timestamp: event.timestampMs || tx.timestampMs,
                                    balanceManagerId: eventData.balance_manager_id,
                                    poolId: eventData.pool_id,
                                    txDigest: tx.digest,
                                }
                                
                                orders.push(order)
                            }
                        }
                    } catch (parseErr) {
                        console.error('⚠️ Failed to parse transaction:', parseErr)
                        continue
                    }
                }
                
                console.log(`✅ Found ${orders.length} orders`)
                
                // 從訂單中計算市場最佳價格
                let bestBidPrice = null
                let bestAskPrice = null
                
                const bids = orders.filter(o => o.isBid).sort((a, b) => b.price - a.price) // 買單降序
                const asks = orders.filter(o => !o.isBid).sort((a, b) => a.price - b.price) // 賣單升序
                
                if (bids.length > 0) {
                    bestBidPrice = bids[0].price // 最高買價
                    console.log('💰 Best Bid (最高買價):', bestBidPrice)
                }
                
                if (asks.length > 0) {
                    bestAskPrice = asks[0].price // 最低賣價
                    console.log('💰 Best Ask (最低賣價):', bestAskPrice)
                }
                
                // 更新 orderBook 以包含市場價格
                setOrderBook(prev => ({
                    ...prev,
                    bestBid: bestBidPrice,
                    bestAsk: bestAskPrice,
                    bids: bids.slice(0, 5).map(o => ({ price: o.price, quantity: o.quantity })),
                    asks: asks.slice(0, 5).map(o => ({ price: o.price, quantity: o.quantity })),
                }))
                
                setMyOpenOrders(orders)
                
            } catch (orderErr) {
                console.error('⚠️ Failed to fetch orders:', orderErr)
                console.error('Error details:', orderErr.message)
                setMyOpenOrders([])
            }
            setIsLoadingMyOrders(false)
            
            // 如果有 poolId，也查詢 Pool 配置資訊
            if (poolId) {
                const poolObject = await suiClient.getObject({
                    id: poolId,
                    options: {
                        showContent: true,
                    },
                })

                console.log('Pool object:', poolObject)

                if (poolObject.data?.content && 'fields' in poolObject.data.content) {
                    const fields = poolObject.data.content.fields
                
                // 提取配置資訊
                const tickSize = fields.tick_size ? Number(fields.tick_size) / 1_000_000 : formData.tickSize
                const lotSize = fields.lot_size ? Number(fields.lot_size) / 1_000_000 : formData.lotSize
                
                console.log('Pool config:', { tickSize, lotSize })
                
                // DeepBook v3 的訂單簿儲存在 bids 和 asks 字段中
                // 這是一個簡化版本，實際結構可能更複雜
                let bestBid = null
                let bestAsk = null
                
                // 嘗試從 Pool 中提取訂單簿資訊
                if (fields.bids || fields.asks) {
                    console.log('Order book data found in pool')
                    // 這裡需要根據實際的 DeepBook v3 結構來解析
                    // 目前只顯示配置資訊
                }
                
                setOrderBook({
                    bids: [],
                    asks: [],
                    bestBid,
                    bestAsk,
                    tickSize,
                    lotSize,
                })
                
                console.log('✅ Order book fetched')
                } else {
                    console.warn('⚠️ Pool object has no content fields')
                    setOrderBook({ 
                        bids: [], 
                        asks: [], 
                        bestBid: null, 
                        bestAsk: null,
                        tickSize: formData.tickSize,
                        lotSize: formData.lotSize,
                    })
                }
            } else {
                console.log('ℹ️ No poolId provided, skipping pool config query')
                setOrderBook({ 
                    bids: [], 
                    asks: [], 
                    bestBid: null, 
                    bestAsk: null,
                    tickSize: formData.tickSize,
                    lotSize: formData.lotSize,
                })
            }
        } catch (err) {
            console.error('❌ Failed to fetch orders:', err)
            setOrderBook({ 
                bids: [], 
                asks: [], 
                bestBid: null, 
                bestAsk: null,
                tickSize: formData.tickSize,
                lotSize: formData.lotSize,
            })
        } finally {
            setIsLoadingOrderBook(false)
        }
    }

    // 當 Step 4 時自動查詢訂單簿並註冊 Pool
    useEffect(() => {
        if (currentStep === 4) {
            fetchOrderBook()
            
            // 自動註冊 Pool（如果有 Pool ID 和 Balance Manager ID）
            if (poolId && balanceManagerId) {
                console.log('🔍 Step 4 loaded, checking pool registration...')
                registerPoolToBackend(poolId, balanceManagerId).catch(err => {
                    console.warn('⚠️ Auto-registration failed:', err)
                })
            }
        }
    }, [currentStep, poolId, balanceManagerId])

    // Step 6.1: 創建 Balance Manager (通過後端) 並存入 USDC (用戶錢包)
    const handleCreateBalanceManager = async () => {
        setIsProcessing(true)
        setError(null)

        try {
            if (!currentAccount?.address) {
                throw new Error('請先連接錢包')
            }

            // ===== Step 1: 通過後端創建 Balance Manager =====
            console.log('Step 1: Creating Balance Manager via backend API...')

            const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000'
            const response = await fetch(`${backendUrl}/api/deepbook/create-balance-manager`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    userAddress: currentAccount.address,
                }),
            })

            if (!response.ok) {
                const errorData = await response.json()
                throw new Error(errorData.message || errorData.error || 'Failed to create Balance Manager')
            }

            const result = await response.json()
            const managerId = result.data.balanceManagerId

            console.log('✅ Balance Manager created:', managerId)
            console.log('   Digest:', result.data.digest)

            setBalanceManagerId(managerId)

            // ===== Step 2: 存入用戶的 USDC =====
            const usdcAmount = formData.depositUsdc || 0

            if (usdcAmount > 0) {
                console.log(`Step 2: Depositing ${usdcAmount} USDC from user wallet...`)

                // 轉換為 6 decimals
                const amountRaw = Math.floor(parseFloat(usdcAmount) * 1_000_000)

                // 獲取用戶的 USDC coins
                const usdcCoins = await suiClient.getCoins({
                    owner: currentAccount.address,
                    coinType: RESERVE_COIN_TYPE,
                })

                if (!usdcCoins.data || usdcCoins.data.length === 0) {
                    console.warn('⚠️  User has no USDC coins, skipping deposit')
                    setCurrentStep(2)
                    return
                }

                // 構建存款交易
                const depositTx = new Transaction()

                // Split 出需要的 USDC 金額
                const [depositCoin] = depositTx.splitCoins(
                    depositTx.object(usdcCoins.data[0].coinObjectId),
                    [depositTx.pure.u64(amountRaw)]
                )

                // 調用 balance_manager::deposit
                depositTx.moveCall({
                    target: `0x${DEEPBOOK_PACKAGE_ID}::balance_manager::deposit`,
                    typeArguments: [RESERVE_COIN_TYPE],
                    arguments: [
                        depositTx.object(managerId),
                        depositCoin,
                    ],
                })

                // 執行存款交易
                const depositResult = await signAndExecuteTransaction({
                    transaction: depositTx,
                })

                console.log('✅ USDC deposited:', depositResult.digest)
                console.log(`   Amount: ${usdcAmount} USDC`)
            } else {
                console.log('⚠️  No USDC amount specified, skipping deposit')
            }

            setCurrentStep(2)

        } catch (err) {
            console.error('❌ Create Balance Manager error:', err)
            setError(err.message)
        } finally {
            setIsProcessing(false)
        }
    }

    // Step 6.2: 創建 DeepBook Pool
    const handleCreatePool = async () => {
        setIsProcessing(true)
        setError(null)

        try {
            // ✅ 驗證 Floor Price 必須設定
            if (!formData.floorPrice || formData.floorPrice <= 0) {
                throw new Error('❌ 請設定 Floor Price（最低回購價格）！這是必填項目。')
            }

            // 檢查 DEEP 餘額
            const balance = await checkDeepBalance(suiClient, currentAccount.address)
            setDeepBalance(balance)

            if (balance < 500) {
                throw new Error(`DEEP 代幣不足！需要 500 DEEP，目前只有 ${balance.toFixed(2)} DEEP`)
            }

            console.log('Creating Pool...')
            console.log('Pool config:', {
                baseCoinKey: coinKey,
                quoteCoinKey: 'DBUSDC',
                tickSize: formData.tickSize,
                lotSize: formData.lotSize,
                minSize: formData.minSize,
            })

            const dbClient = createDbClient(balanceManagerId)
            if (!dbClient) {
                throw new Error('Failed to create DeepBook client')
            }

            // 使用 SDK 創建 Permissionless Pool
            // 需要手動獲取並傳入 DEEP coin 來繞過 CoinWithBalance intent
            const tx = new Transaction()

            // 1. 獲取用戶的 DEEP coins
            const deepCoins = await suiClient.getCoins({
                owner: currentAccount.address,
                coinType: BUILT_IN_COINS.DEEP.type,
            })

            if (!deepCoins.data || deepCoins.data.length === 0) {
                throw new Error('沒有找到 DEEP 代幣，請確保錢包有 DEEP')
            }

            // 2. 合併 DEEP coins (如果有多個)
            const [firstDeepCoin, ...restDeepCoins] = deepCoins.data

            if (restDeepCoins.length > 0) {
                tx.mergeCoins(
                    tx.object(firstDeepCoin.coinObjectId),
                    restDeepCoins.map(c => tx.object(c.coinObjectId))
                )
            }

            // 3. 分割出 500 DEEP 作為創建費用 (500 * 1e6 = 5e8)
            const POOL_CREATION_FEE = 500_000_000n
            const [deepCoinForPool] = tx.splitCoins(
                tx.object(firstDeepCoin.coinObjectId),
                [tx.pure.u64(POOL_CREATION_FEE)]
            )

            // 4. 調用 SDK 函數，傳入手動準備的 DEEP coin
            dbClient.deepBook.createPermissionlessPool({
                baseCoinKey: coinKey,
                quoteCoinKey: 'DBUSDC',
                tickSize: formData.tickSize,
                lotSize: formData.lotSize,
                minSize: formData.minSize,
                deepCoin: deepCoinForPool,  // 傳入手動準備的 DEEP coin
            })(tx)

            // 使用 signAndExecuteTransaction 執行交易
            const result = await signAndExecuteTransaction({
                transaction: tx,
            })

            // 等待交易確認並獲取完整結果
            const fullResult = await suiClient.waitForTransaction({
                digest: result.digest,
                options: { showObjectChanges: true },
            })

            console.log('Pool creation result:', fullResult)

            // 提取 Pool ID
            const newPoolId = extractObjectId(fullResult, 'Pool')

            if (!newPoolId) {
                throw new Error('Failed to find Pool ID in transaction result')
            }

            console.log('✅ Pool ID:', newPoolId)
            setPoolId(newPoolId)

            // 2. 更新鏈上 Vault 的 DeepBook 資訊
            console.log('📝 Updating Vault with DeepBook info...')
            try {
                const updateTx = new Transaction()

                console.log('Updating Vault with:', {
                    vaultId: effectiveVaultId,
                    poolId: newPoolId,
                    balanceManagerId: balanceManagerId,
                    tokenType: effectiveTokenType, // 碎片代幣類型
                })

                // 調用 set_deepbook_pool_entry 更新 Vault
                // typeArguments: [T, FRAC] 其中 T 是儲備金類型（DBUSDC），FRAC 是分數代幣類型
                updateTx.moveCall({
                    target: `${effectivePackageId}::rwa_vault::set_deepbook_pool_entry`,
                    typeArguments: [RESERVE_COIN_TYPE, effectiveTokenType],
                    arguments: [
                        updateTx.object(effectiveVaultId),
                        updateTx.pure.address(newPoolId),
                        updateTx.pure.address(balanceManagerId),
                        updateTx.pure.string(effectiveTokenType), // 完整的碎片代幣類型字符串
                    ],
                })

                const updateResult = await signAndExecuteTransaction({ transaction: updateTx })

                console.log('✅ Vault updated on-chain:', updateResult.digest)
            } catch (updateErr) {
                console.warn('⚠️ Failed to update Vault on-chain:', updateErr.message)
                console.warn('⚠️ Error details:', updateErr)
                console.warn('⚠️ Token type used:', effectiveTokenType)
                // 繼續執行，因為後端仍然可以追蹤
            }

            // 3. 註冊 Pool 到後端監聽器
            try {
                const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000'
                const response = await fetch(`${backendUrl}/api/vaults/register-pool`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        vaultId,
                        poolId: newPoolId,
                        balanceManagerId,
                        coinType: effectiveTokenType,
                        floorPrice: formData.floorPrice,  // ✅ 不再使用默認值
                        owner: currentAccount.address,
                    }),
                })
                
                if (!response.ok) {
                    const errorData = await response.json()
                    throw new Error(`後端註冊失敗: ${errorData.error || errorData.message}`)
                }
                
                console.log('✅ Pool registered with backend')
            } catch (regErr) {
                console.error('❌ Failed to register pool with backend:', regErr)
                throw new Error(`無法註冊 Pool 到後端: ${regErr.message}`)
            }

            setCurrentStep(3)

        } catch (err) {
            console.error('Create Pool error:', err)
            setError(err.message)
        } finally {
            setIsProcessing(false)
        }
    }

    // Step 6.3: 存入資金到 Balance Manager (直接 Move 調用)
    const handleDeposit = async () => {
        setIsProcessing(true)
        setError(null)

        try {
            // 驗證必要的 ID
            if (!effectiveVaultId) {
                throw new Error('缺少 Vault ID！請在測試模式中輸入，或從 Token Vault 頁面進入。')
            }
            if (!effectivePackageId) {
                throw new Error('缺少 Package ID！請在測試模式中輸入，或從 Token Vault 頁面進入。')
            }
            if (!balanceManagerId) {
                throw new Error('缺少 Balance Manager ID！請先完成 Step 1。')
            }
            
            // ⚠️ 檢查 Token Type 是否正確
            if (!effectiveTokenType) {
                throw new Error('❌ 缺少 Token Type！請從 Token Vault 頁面進入，或在測試模式中輸入你的 FToken 類型。')
            }
            if (effectiveTokenType.includes('0x2::sui::SUI') || effectiveTokenType === '0x2::sui::SUI') {
                throw new Error('❌ 錯誤！不能存入 SUI！請輸入你自己 mint 的 FToken 類型，不是 SUI！')
            }

            // 檢查 USDC 餘額
            const usdc = await checkUsdcBalance(suiClient, currentAccount.address)
            setUsdcBalance(usdc)

            console.log('💰 Depositing funds...')
            console.log(`📊 Token Type: ${effectiveTokenType}`)
            console.log(`🏷️  Coin Key: ${coinKey}`)
            console.log(`📦 FToken 存入數量:`, formData.depositFToken)
            console.log(`💵 USDC 存入數量:`, formData.depositUsdc)

            const tx = new Transaction()

            // 1. 獲取用戶錢包中的 FToken
            const depositAmount = BigInt(Math.floor(formData.depositFToken * 1_000_000))
            console.log(`🔢 FToken 存入數量 (鏈上單位): ${depositAmount.toString()}`)

            const fTokenCoins = await suiClient.getCoins({
                owner: currentAccount.address,
                coinType: effectiveTokenType,
            })

            if (!fTokenCoins.data || fTokenCoins.data.length === 0) {
                throw new Error(`❌ 錢包中沒有找到 ${coinKey} 代幣！請先從 Token Vault 頁面 mint 代幣到錢包。`)
            }

            // 計算總餘額
            const totalFTokenBalance = fTokenCoins.data.reduce((sum, coin) => sum + BigInt(coin.balance), 0n)
            const fTokenBalanceDisplay = Number(totalFTokenBalance) / 1_000_000
            
            console.log(`✅ 找到 ${fTokenCoins.data.length} 個 ${coinKey} coins`)
            console.log(`💰 ${coinKey} 總餘額: ${fTokenBalanceDisplay.toLocaleString()} 個`)
            
            if (totalFTokenBalance < depositAmount) {
                throw new Error(`❌ ${coinKey} 餘額不足！需要 ${formData.depositFToken} 個，但只有 ${fTokenBalanceDisplay.toFixed(2)} 個`)
            }

            // 2. 合併並分割出需要的數量
            const [firstFToken, ...restFTokens] = fTokenCoins.data

            if (restFTokens.length > 0) {
                tx.mergeCoins(
                    tx.object(firstFToken.coinObjectId),
                    restFTokens.map(coin => tx.object(coin.coinObjectId))
                )
            }

            const [fTokenToDeposit] = tx.splitCoins(
                tx.object(firstFToken.coinObjectId),
                [tx.pure.u64(depositAmount)]
            )

            // 3. Deposit FToken to Balance Manager
            tx.moveCall({
                target: `0x${DEEPBOOK_PACKAGE_ID}::balance_manager::deposit`,
                typeArguments: [effectiveTokenType],
                arguments: [
                    tx.object(balanceManagerId),
                    fTokenToDeposit,
                ],
            })

            // 4. Deposit USDC to Balance Manager (如果有且用戶有足夠餘額)
            if (formData.depositUsdc > 0 && usdc >= formData.depositUsdc) {
                // 獲取 USDC coins
                const usdcCoins = await suiClient.getCoins({
                    owner: currentAccount.address,
                    coinType: BUILT_IN_COINS.DBUSDC.type,
                })

                if (usdcCoins.data && usdcCoins.data.length > 0) {
                    const depositAmountRaw = BigInt(Math.floor(formData.depositUsdc * 1_000_000))

                    // 合併並分割 USDC
                    const [firstCoin, ...restCoins] = usdcCoins.data

                    if (restCoins.length > 0) {
                        tx.mergeCoins(
                            tx.object(firstCoin.coinObjectId),
                            restCoins.map(coin => tx.object(coin.coinObjectId))
                        )
                    }

                    const [usdcToDeposit] = tx.splitCoins(
                        tx.object(firstCoin.coinObjectId),
                        [tx.pure.u64(depositAmountRaw)]
                    )

                    tx.moveCall({
                        target: `0x${DEEPBOOK_PACKAGE_ID}::balance_manager::deposit`,
                        typeArguments: [BUILT_IN_COINS.DBUSDC.type],
                        arguments: [
                            tx.object(balanceManagerId),
                            usdcToDeposit,
                        ],
                    })
                }
            }

            const result = await signAndExecuteTransaction({ transaction: tx })

            console.log('Deposit result:', result)
            console.log('✅ Deposit successful!')
            setCurrentStep(4)

        } catch (err) {
            console.error('Deposit error:', err)
            setError(err.message)
        } finally {
            setIsProcessing(false)
        }
    }

    // 註冊 Pool 到後端監聽器
    const registerPoolToBackend = async (poolIdToRegister, balanceManagerIdToRegister) => {
        try {
            // ✅ 驗證 Floor Price
            if (!formData.floorPrice || formData.floorPrice <= 0) {
                throw new Error('Floor Price 未設定或無效')
            }

            console.log('📝 Registering Pool to backend...')
            console.log('  Pool ID:', poolIdToRegister)
            console.log('  Balance Manager ID:', balanceManagerIdToRegister)
            console.log('  Vault ID:', effectiveVaultId)
            console.log('  Token Type:', effectiveTokenType)
            console.log('  Floor Price:', formData.floorPrice, 'USDC')
            
            const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000'
            const response = await fetch(`${backendUrl}/api/vaults/register-pool`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    vaultId: effectiveVaultId,
                    poolId: poolIdToRegister,
                    balanceManagerId: balanceManagerIdToRegister,
                    coinType: effectiveTokenType,
                    floorPrice: formData.floorPrice,  // ✅ 不再使用默認值
                    owner: currentAccount?.address,
                }),
            })
            
            if (response.ok) {
                const result = await response.json()
                console.log('✅ Pool registered to backend:', result)
                return true
            } else {
                const errorData = await response.json()
                console.warn('⚠️ Failed to register pool to backend:', errorData)
                return false
            }
        } catch (err) {
            console.warn('⚠️ Failed to register pool to backend:', err.message)
            return false
        }
    }
    
    // 查詢 Balance Manager 中的某個幣種餘額
    const getBalanceFromManager = async (coinType) => {
        try {
            console.log(`🔍 Checking Balance Manager balance for ${coinType}...`)
            
            // 查詢 Balance Manager 的動態字段
            const dynamicFields = await suiClient.getDynamicFields({
                parentId: balanceManagerId,
            })
            
            console.log(`📊 Found ${dynamicFields.data.length} dynamic fields in Balance Manager`)
            
            // 尋找對應幣種的餘額字段
            // Balance Manager 使用 Table 結構存儲餘額
            for (const field of dynamicFields.data) {
                // 檢查是否是 balances table
                if (field.name?.value && typeof field.name.value === 'string') {
                    if (field.name.value === 'balances') {
                        // 找到 balances table，需要進一步查詢
                        console.log('✅ Found balances table:', field.objectId)
                        
                        // 查詢 table 內的餘額
                        try {
                            const tableFields = await suiClient.getDynamicFields({
                                parentId: field.objectId,
                            })
                            
                            console.log(`📊 Table has ${tableFields.data.length} entries`)
                            
                            // 查找匹配的 coin type
                            for (const entry of tableFields.data) {
                                if (entry.name?.type?.includes(coinType)) {
                                    // 查詢該字段的值
                                    const fieldObject = await suiClient.getDynamicFieldObject({
                                        parentId: field.objectId,
                                        name: entry.name,
                                    })
                                    
                                    if (fieldObject.data?.content && 'fields' in fieldObject.data.content) {
                                        const balance = fieldObject.data.content.fields.value
                                        console.log(`💰 Balance found: ${balance}`)
                                        return BigInt(balance || 0)
                                    }
                                }
                            }
                        } catch (tableErr) {
                            console.warn('⚠️ Failed to query table entries:', tableErr)
                        }
                    }
                }
            }
            
            console.log('⚠️ No balance found for this coin type')
            return 0n
            
        } catch (err) {
            console.error('❌ Failed to check balance:', err)
            return 0n
        }
    }
    
    // 查詢 Balance Manager 中的多個幣種餘額
    const checkBalanceManagerBalances = async () => {
        if (!balanceManagerId) return null
        
        try {
            console.log('\n🔍 Querying Balance Manager balances...')
            
            // 查詢 FToken 和 USDC 餘額
            const [fTokenBalanceRaw, usdcBalanceRaw] = await Promise.all([
                getBalanceFromManager(effectiveTokenType),
                getBalanceFromManager(BUILT_IN_COINS.DBUSDC.type),
            ])
            
            // 轉換為可讀格式（6 decimals）
            const fTokenBalance = Number(fTokenBalanceRaw) / 1_000_000_000 // DeepBook 使用 9 decimals
            const usdcBalance = Number(usdcBalanceRaw) / 1_000_000_000
            
            console.log(`💰 ${coinKey} Balance: ${fTokenBalance.toFixed(6)}`)
            console.log(`💵 USDC Balance: ${usdcBalance.toFixed(6)}`)
            
            return { fTokenBalance, usdcBalance }
            
        } catch (err) {
            console.error('❌ Failed to check balances:', err)
            return null
        }
    }

    // Step 6.4: 掛限價單（賣單或買單）
    const handlePlaceLimitOrder = async (isBid) => {
        setIsProcessing(true)
        setError(null)

        try {
            // 驗證必要的 ID
            if (!balanceManagerId) {
                throw new Error('缺少 Balance Manager ID！請先完成 Step 1。')
            }
            if (!poolId) {
                throw new Error('缺少 Pool ID！請先完成 Step 2。')
            }

            // 根據買賣方向取得價格和數量
            const price = isBid ? formData.buyPrice : formData.sellPrice
            const quantity = isBid ? formData.buyQuantity : formData.sellQuantity

            if (!price || price <= 0) {
                throw new Error(`請輸入有效的${isBid ? '買入' : '賣出'}價格`)
            }
            if (!quantity || quantity <= 0) {
                throw new Error(`請輸入有效的${isBid ? '買入' : '賣出'}數量`)
            }
            
            // 提示用戶檢查餘額
            console.log(`⚠️ 請確認 Balance Manager 中有足夠的${isBid ? 'USDC' : coinKey}`)
            console.log(`   需要：${isBid ? (price * quantity).toFixed(2) + ' USDC' : quantity + ' ' + coinKey}`)

            console.log('📝 Placing Limit Order...')
            console.log(`📊 Side: ${isBid ? 'BUY' : 'SELL'}`)
            console.log(`💰 Price: ${price}`)
            console.log(`📦 Quantity: ${quantity}`)
            console.log(`🏊 Pool Key: ${poolKey}`)
            console.log(`🏦 Balance Manager: ${balanceManagerId}`)

            // 訂單類型常量
            const ORDER_TYPES = {
                NO_RESTRICTION: 0,
                IMMEDIATE_OR_CANCEL: 1,
                FILL_OR_KILL: 2,
                POST_ONLY: 3,
            }

            // 自我匹配選項
            const SELF_MATCHING_OPTIONS = {
                SELF_MATCHING_ALLOWED: 0,
                CANCEL_TAKER: 1,
                CANCEL_MAKER: 2,
            }

            // 創建 DeepBook Client
            const dbClient = createDbClient(balanceManagerId, poolId)
            if (!dbClient) {
                throw new Error('無法創建 DeepBook Client')
            }

            const tx = new Transaction()

            // 生成唯一的 client order ID
            const clientOrderId = generateOrderId()
            console.log(`📋 Client Order ID: ${clientOrderId}`)

            // 放置限價訂單
            tx.add(
                dbClient.deepBook.placeLimitOrder({
                    poolKey,
                    balanceManagerKey: 'MANAGER_1',
                    clientOrderId,
                    price,
                    quantity,
                    isBid,
                    orderType: ORDER_TYPES.NO_RESTRICTION,
                    selfMatchingOption: SELF_MATCHING_OPTIONS.SELF_MATCHING_ALLOWED,
                    payWithDeep: false,
                })
            )

            const result = await signAndExecuteTransaction({ transaction: tx })

            console.log('\n✅ Limit Order placed successfully!')
            console.log(`📋 Digest: ${result.digest}`)

            // 解析訂單事件並報告給後端
            let orderRecorded = false
            if (result.events) {
                console.log('\n📊 Order Events:')
                for (const event of result.events) {
                    if (event.type.includes('OrderPlaced')) {
                        console.log(`  Event: ${event.type.split('::').pop()}`)
                        if (event.parsedJson) {
                            const orderId = event.parsedJson.order_id
                            const eventPrice = event.parsedJson.price
                            const eventQuantity = event.parsedJson.placed_quantity
                            
                            console.log(`  Order ID: ${orderId}`)
                            console.log(`  Price: ${eventPrice}`)
                            console.log(`  Quantity: ${eventQuantity}`)
                            
                            // 報告訂單給後端
                            if (!orderRecorded) {
                                try {
                                    const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'
                                    const recordResponse = await fetch(`${backendUrl}/api/orders/record`, {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({
                                            orderId,
                                            poolId,
                                            price: eventPrice,
                                            quantity: eventQuantity,
                                            isBid,
                                        }),
                                    })
                                    
                                    if (recordResponse.ok) {
                                        console.log('✅ 訂單已報告給後端監控')
                                        orderRecorded = true
                                    } else {
                                        console.warn('⚠️  後端記錄訂單失敗')
                                    }
                                } catch (backendErr) {
                                    console.warn('⚠️  無法連接後端:', backendErr.message)
                                }
                            }
                        }
                    } else if (event.type.includes('OrderFilled')) {
                        console.log(`  Event: ${event.type.split('::').pop()}`)
                        if (event.parsedJson) {
                            console.log(`  Base Quantity: ${event.parsedJson.base_quantity}`)
                        }
                    }
                }
            }

            // 刷新訂單列表
            await fetchPoolOrders(poolId)

            // 如果是第一次下單，進入完成步驟
            if (currentStep === 4) {
                setCurrentStep(5)
            }

        } catch (err) {
            console.error('Place Limit Order error:', err)
            setError(err.message)
        } finally {
            setIsProcessing(false)
        }
    }

    const resetWizard = () => {
        setCurrentStep(1)
        setBalanceManagerId(null)
        setPoolId(null)
        setError(null)
        setFormData({
            tickSize: 0.001,
            lotSize: 0.1,
            minSize: 1,
            floorPrice: null,  // ✅ 不提供默認值
            depositUsdc: 10,
            depositFToken: 5,
            sellPrice: 5.0,
            sellQuantity: 1,
            buyPrice: 3.0,
            buyQuantity: 1,
        })
    }

    const steps = [
        { id: 1, title: 'Balance Manager', status: currentStep > 1 ? 'completed' : currentStep === 1 ? 'active' : 'pending' },
        { id: 2, title: 'Pool 創建', status: currentStep > 2 ? 'completed' : currentStep === 2 ? 'active' : 'pending' },
        { id: 3, title: '資金存入', status: currentStep > 3 ? 'completed' : currentStep === 3 ? 'active' : 'pending' },
        { id: 4, title: '掛限價單', status: currentStep > 4 ? 'completed' : currentStep === 4 ? 'active' : 'pending' },
        { id: 5, title: '完成', status: currentStep === 5 ? 'active' : 'pending' },
    ]

    return (
        <div style={{ maxWidth: '800px', margin: '0 auto', padding: '20px', color: '#333' }}>
            <h2 style={{ marginBottom: '10px', color: '#000' }}>🏦 Step 6: DeepBook 交易</h2>
            <p style={{ color: '#333', marginBottom: '30px' }}>
                創建 Balance Manager、Pool，並掛限價單
            </p>

            {/* Progress Steps */}
            <div style={{ display: 'flex', gap: '10px', marginBottom: '30px', overflowX: 'auto' }}>
                {steps.map((step) => (
                    <div
                        key={step.id}
                        style={{
                            flex: 1,
                            minWidth: '120px',
                            padding: '15px',
                            borderRadius: '8px',
                            background: step.status === 'completed' ? '#d4edda' : step.status === 'active' ? '#fff3cd' : '#f8f9fa',
                            border: `2px solid ${step.status === 'completed' ? '#28a745' : step.status === 'active' ? '#ffc107' : '#dee2e6'}`,
                            cursor: 'default',
                        }}
                    >
                        <div style={{ fontWeight: 'bold', color: '#000' }}>{step.id}. {step.title}</div>
                    </div>
                ))}
            </div>

            {!currentAccount && (
                <div style={{ padding: '15px', background: '#fff3cd', borderRadius: '8px', marginBottom: '20px' }}>
                    ⚠️ 請先連接錢包
                </div>
            )}

            {error && (
                <div style={{ padding: '15px', background: '#f8d7da', borderRadius: '8px', marginBottom: '20px', color: '#721c24' }}>
                    ❌ {error}
                </div>
            )}

            {/* Step 6.1: Create Balance Manager */}
            {currentStep === 1 && (
                <div>
                    <h3 style={{ color: '#000' }}>📦 創建 Balance Manager 並存入 USDC</h3>
                    <p style={{ color: '#333', marginBottom: '20px' }}>
                        Balance Manager 用於管理您在 DeepBook 上的所有資金。創建後可立即存入 USDC。
                    </p>

                    <div style={{ padding: '15px', background: '#e7f3ff', border: '2px solid #0066ff', borderRadius: '8px', marginBottom: '20px' }}>
                        <h4 style={{ marginTop: 0, color: '#0066ff' }}>ℹ️ 說明</h4>
                        <ul style={{ marginBottom: 0, paddingLeft: '20px', color: '#333' }}>
                            <li>Balance Manager 是 shared object</li>
                            <li>一個 Balance Manager 可在所有池子中使用</li>
                            <li>創建後會自動分享給所有人</li>
                            <li>💰 創建後立即從您的錢包存入 USDC</li>
                        </ul>
                    </div>

                    {/* USDC 存款金額輸入 */}
                    <div style={{ marginBottom: '20px', padding: '15px', background: '#fff', border: '1px solid #ddd', borderRadius: '8px' }}>
                        <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', color: '#333' }}>
                            💵 USDC 存入數量（選填）
                        </label>
                        <input
                            type="number"
                            step="1"
                            min="0"
                            value={formData.depositUsdc}
                            onChange={(e) => handleInputChange('depositUsdc', parseFloat(e.target.value) || 0)}
                            style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ddd' }}
                            placeholder="例如：10"
                        />
                        <small style={{ color: '#555' }}>
                            用於買入代幣或掛買單。將從您的錢包存入。
                            {formData.depositUsdc > 0 && (
                                <span style={{ color: '#007bff', marginLeft: '8px' }}>
                                    （鏈上：{(formData.depositUsdc * 1_000_000).toLocaleString()} 單位）
                                </span>
                            )}
                        </small>
                    </div>

                    <button
                        onClick={handleCreateBalanceManager}
                        disabled={!currentAccount || isProcessing}
                        style={{
                            padding: '12px 24px',
                            background: currentAccount && !isProcessing ? '#007bff' : '#6c757d',
                            color: 'white',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: currentAccount && !isProcessing ? 'pointer' : 'not-allowed',
                            fontSize: '16px',
                            fontWeight: 'bold',
                        }}
                    >
                        {isProcessing ? '處理中...' : formData.depositUsdc > 0 ? `創建並存入 ${formData.depositUsdc} USDC` : '創建 Balance Manager'}
                    </button>

                    {/* 測試用輸入框 - 手動輸入已有的 ID */}
                    <div style={{ marginTop: '30px', padding: '20px', background: '#f8f9fa', borderRadius: '8px', border: '2px dashed #6c757d' }}>
                        <h4 style={{ marginTop: 0, color: '#495057' }}>🔧 測試模式：手動輸入已有 ID</h4>
                        <p style={{ color: '#6c757d', fontSize: '14px', marginBottom: '15px' }}>
                            如果你已經有 Balance Manager 或 Pool，可以直接輸入 ID 跳到對應步驟。
                        </p>

                        <div style={{ display: 'grid', gap: '15px' }}>
                            {/* F Token Symbol 輸入 */}
                            <div>
                                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', color: '#333' }}>
                                    🏷️ F Token Symbol
                                </label>
                                <input
                                    type="text"
                                    placeholder="例如：ROOF_TOKEN"
                                    id="manualTokenSymbol"
                                    defaultValue={manualTokenSymbol || ''}
                                    onChange={(e) => {
                                        const val = e.target.value.trim().toUpperCase()
                                        if (val) {
                                            setManualTokenSymbol(val)
                                            console.log('✅ 手動設置 Token Symbol:', val)
                                        } else {
                                            setManualTokenSymbol(null)
                                        }
                                    }}
                                    style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '14px' }}
                                />
                                <small style={{ color: '#6c757d' }}>代幣符號，用於顯示和 Pool Key（如：{coinKey}_DBUSDC）</small>
                            </div>

                            {/* Base Coin (Token Type) 輸入 */}
                            <div>
                                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', color: '#333' }}>
                                    🪙 Base Coin (Token Type) ⚠️ 重要！
                                </label>
                                <div style={{ padding: '10px', background: '#fff3cd', borderRadius: '6px', marginBottom: '10px', border: '1px solid #ffc107' }}>
                                    <strong style={{ color: '#856404' }}>⚠️ 警告：不要輸入 0x2::sui::SUI！</strong>
                                    <div style={{ fontSize: '13px', marginTop: '5px', color: '#856404' }}>
                                        請輸入你在 Token Vault 頁面部署的 FToken 類型，例如：<br/>
                                        <code style={{ background: '#fff', padding: '2px 4px', borderRadius: '3px' }}>
                                            0x458a...::roof::ROOF
                                        </code>
                                    </div>
                                </div>
                                <input
                                    type="text"
                                    placeholder="0x...::module::TOKEN_NAME（你自己的 FToken，不是 SUI！）"
                                    id="manualTokenType"
                                    defaultValue={tokenType || ''}
                                    onChange={(e) => {
                                        const val = e.target.value.trim()
                                        if (val) {
                                            // 檢查是否錯誤輸入了 SUI
                                            if (val.includes('0x2::sui::SUI')) {
                                                alert('❌ 錯誤！不要輸入 SUI！請輸入你自己 mint 的 FToken 類型')
                                                return
                                            }
                                            setManualTokenType(val)
                                            console.log('✅ 手動設置 Token Type:', val)
                                        }
                                    }}
                                    style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '2px solid #ff9800', fontFamily: 'monospace', fontSize: '12px' }}
                                />
                                <small style={{ color: '#d32f2f', fontWeight: 'bold' }}>
                                    ⚠️ 必須是你的 FToken，格式：0x...::module_name::TOKEN_NAME
                                </small>
                            </div>

                            {/* Package ID 輸入 */}
                            <div>
                                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', color: '#333' }}>
                                    📦 Package ID
                                </label>
                                <input
                                    type="text"
                                    placeholder="0x..."
                                    id="manualPackageId"
                                    defaultValue={packageId || ''}
                                    onChange={(e) => {
                                        const val = e.target.value.trim()
                                        if (val) {
                                            setManualPackageId(val)
                                            console.log('✅ 手動設置 Package ID:', val)
                                        }
                                    }}
                                    style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ddd', fontFamily: 'monospace', fontSize: '12px' }}
                                />
                                <small style={{ color: '#6c757d' }}>RWA Vault 合約的 Package ID</small>
                            </div>

                            {/* Vault ID 輸入 */}
                            <div>
                                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', color: '#333' }}>
                                    🏦 Vault ID
                                </label>
                                <input
                                    type="text"
                                    placeholder="0x..."
                                    id="manualVaultId"
                                    defaultValue={vaultId || ''}
                                    onChange={(e) => {
                                        const val = e.target.value.trim()
                                        if (val) {
                                            setManualVaultId(val)
                                            console.log('✅ 手動設置 Vault ID:', val)
                                        }
                                    }}
                                    style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ddd', fontFamily: 'monospace', fontSize: '12px' }}
                                />
                                <small style={{ color: '#6c757d' }}>RWA Vault 的 Object ID（用於 mint tokens）</small>
                            </div>

                            <div>
                                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', color: '#333' }}>
                                    Balance Manager ID
                                </label>
                                <div style={{ display: 'flex', gap: '10px' }}>
                                    <input
                                        type="text"
                                        placeholder="0x..."
                                        id="manualBalanceManagerId"
                                        style={{ flex: 1, padding: '10px', borderRadius: '6px', border: '1px solid #ddd', fontFamily: 'monospace', fontSize: '12px' }}
                                    />
                                    <button
                                        onClick={() => {
                                            const input = document.getElementById('manualBalanceManagerId')
                                            const id = input.value.trim()
                                            if (id) {
                                                setBalanceManagerId(id)
                                                setCurrentStep(2)
                                                console.log('✅ 手動設置 Balance Manager ID:', id)
                                            }
                                        }}
                                        style={{
                                            padding: '10px 20px',
                                            background: '#28a745',
                                            color: 'white',
                                            border: 'none',
                                            borderRadius: '6px',
                                            cursor: 'pointer',
                                            fontWeight: 'bold',
                                        }}
                                    >
                                        跳到 Step 2
                                    </button>
                                </div>
                            </div>

                            <div>
                                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', color: '#333' }}>
                                    🔍 Pool ID（智能查詢）
                                </label>
                                <div style={{ display: 'flex', gap: '10px' }}>
                                    <input
                                        type="text"
                                        placeholder="0x...（輸入 Pool ID 自動查詢 Token Type）"
                                        id="manualPoolId"
                                        style={{ flex: 1, padding: '10px', borderRadius: '6px', border: '1px solid #ddd', fontFamily: 'monospace', fontSize: '12px' }}
                                    />
                                    <button
                                        onClick={async () => {
                                            const bmInput = document.getElementById('manualBalanceManagerId')
                                            const poolInput = document.getElementById('manualPoolId')
                                            const bmId = bmInput.value.trim()
                                            const pId = poolInput.value.trim()
                                            
                                            if (!bmId) {
                                                alert('請先輸入 Balance Manager ID')
                                                return
                                            }
                                            if (!pId) {
                                                alert('請先輸入 Pool ID')
                                                return
                                            }
                                            
                                            try {
                                                console.log('🔍 查詢 Pool:', pId)
                                                
                                                // 查詢 Pool 對象
                                                const poolObj = await suiClient.getObject({
                                                    id: pId,
                                                    options: { showType: true, showContent: true }
                                                })
                                                
                                                if (!poolObj.data) {
                                                    alert('❌ 找不到 Pool！請檢查 ID 是否正確')
                                                    return
                                                }
                                                
                                                console.log('✅ Pool 對象:', poolObj.data)
                                                
                                                // 從 Pool 的類型參數中提取 Token Type
                                                // Pool<BaseCoin, QuoteCoin> 格式
                                                const poolType = poolObj.data.type
                                                console.log('📊 Pool Type:', poolType)
                                                
                                                // 提取類型參數（在 < > 中）
                                                const typeMatch = poolType.match(/<(.+?),\s*(.+?)>/)
                                                if (typeMatch) {
                                                    const baseCoinType = typeMatch[1]
                                                    const quoteCoinType = typeMatch[2]
                                                    
                                                    console.log('✅ Base Coin Type:', baseCoinType)
                                                    console.log('✅ Quote Coin Type:', quoteCoinType)
                                                    
                                                    // 自動填充 Token Type
                                                    setManualTokenType(baseCoinType)
                                                    const tokenTypeInput = document.getElementById('manualTokenType')
                                                    if (tokenTypeInput) {
                                                        tokenTypeInput.value = baseCoinType
                                                    }
                                                    
                                                    // 提取 symbol
                                                    const parts = baseCoinType.split('::')
                                                    const symbol = parts.length >= 3 ? parts[2] : ''
                                                    if (symbol) {
                                                        setManualTokenSymbol(symbol)
                                                        const symbolInput = document.getElementById('manualTokenSymbol')
                                                        if (symbolInput) {
                                                            symbolInput.value = symbol
                                                        }
                                                    }
                                                    
                                                    setBalanceManagerId(bmId)
                                                    setPoolId(pId)
                                                    
                                                    // 自動註冊 Pool 到後端
                                                    await registerPoolToBackend(pId, bmId)
                                                    
                                                    setCurrentStep(3)
                                                    
                                                    alert(`✅ Pool 查詢成功！\n\n📊 Token Symbol: ${symbol}\n🔗 Base Coin Type: ${baseCoinType.substring(0, 60)}...\n💵 Quote Coin: ${quoteCoinType.split('::').pop()}\n\n✅ 已自動註冊到後端監聽器\n✅ 已自動填充所有資訊，可以直接存款！`)
                                                } else {
                                                    alert('❌ 無法解析 Pool 類型參數')
                                                }
                                                
                                            } catch (err) {
                                                console.error('查詢 Pool 錯誤:', err)
                                                alert('❌ 查詢 Pool 失敗：' + err.message)
                                            }
                                        }}
                                        style={{
                                            padding: '10px 20px',
                                            background: '#17a2b8',
                                            color: 'white',
                                            border: 'none',
                                            borderRadius: '6px',
                                            cursor: 'pointer',
                                            fontWeight: 'bold',
                                            whiteSpace: 'nowrap',
                                        }}
                                    >
                                        🔍 智能查詢
                                    </button>
                                </div>
                                <small style={{ color: '#17a2b8', fontSize: '12px', marginTop: '5px', display: 'block' }}>
                                    💡 輸入 Pool ID 後點擊「智能查詢」，系統會自動查詢並填充 FToken Type、Symbol 等資訊
                                </small>
                            </div>

                            {/* 跳到 Step 4 (掛限價單) 按鈕 */}
                            <div>
                                <button
                                    onClick={async () => {
                                        const bmInput = document.getElementById('manualBalanceManagerId')
                                        const poolInput = document.getElementById('manualPoolId')
                                        const bmId = bmInput?.value.trim()
                                        const pId = poolInput?.value.trim()
                                        if (bmId && pId) {
                                            setBalanceManagerId(bmId)
                                            setPoolId(pId)
                                            
                                            console.log('✅ 手動設置 Balance Manager ID:', bmId)
                                            console.log('✅ 手動設置 Pool ID:', pId)
                                            
                                            // 自動註冊 Pool 到後端
                                            await registerPoolToBackend(pId, bmId)
                                            
                                            setCurrentStep(4)
                                            console.log('✅ 跳到 Step 4 (掛限價單)')
                                        } else if (!bmId) {
                                            alert('請先輸入 Balance Manager ID')
                                        } else if (!pId) {
                                            alert('請先輸入 Pool ID')
                                        }
                                    }}
                                    style={{
                                        width: '100%',
                                        padding: '12px 20px',
                                        background: '#6f42c1',
                                        color: 'white',
                                        border: 'none',
                                        borderRadius: '6px',
                                        cursor: 'pointer',
                                        fontWeight: 'bold',
                                        fontSize: '14px',
                                    }}
                                >
                                    🎯 跳到 Step 4 (掛限價單)
                                </button>
                                <small style={{ color: '#6c757d', display: 'block', marginTop: '5px' }}>
                                    需要先填入 Balance Manager ID 和 Pool ID（會自動註冊到後端）
                                </small>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Step 6.2: Create Pool */}
            {currentStep === 2 && (
                <div>
                    <h3 style={{ color: '#000' }}>🏊 創建 DeepBook Pool</h3>
                    <p style={{ color: '#333', marginBottom: '20px' }}>
                        創建 {coinKey}/USDC 交易對。<strong>需要 500 DEEP 代幣作為費用。</strong>
                    </p>

                    {balanceManagerId && (
                        <div style={{ padding: '10px', background: '#d4edda', borderRadius: '6px', marginBottom: '15px', color: '#155724' }}>
                            ✅ Balance Manager: <code style={{ fontSize: '11px' }}>{balanceManagerId.slice(0, 20)}...</code>
                        </div>
                    )}

                    {deepBalance > 0 && (
                        <div style={{ padding: '10px', background: deepBalance >= 100 ? '#d4edda' : '#f8d7da', borderRadius: '6px', marginBottom: '15px', color: deepBalance >= 100 ? '#155724' : '#721c24' }}>
                            💰 您的 DEEP 餘額：<strong>{deepBalance.toFixed(2)} DEEP</strong>
                        </div>
                    )}

                    <div style={{ display: 'grid', gap: '15px', marginBottom: '20px' }}>
                        <div>
                            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', color: '#333' }}>
                                Tick Size（價格精度）
                            </label>
                            <input
                                type="number"
                                step="0.0001"
                                value={formData.tickSize}
                                onChange={(e) => handleInputChange('tickSize', parseFloat(e.target.value))}
                                style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ddd' }}
                            />
                            <small style={{ color: '#555' }}>例：0.001 表示價格精度到小數點後 3 位</small>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                            <div>
                                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', color: '#333' }}>
                                    Lot Size（最小交易量）
                                </label>
                                <input
                                    type="number"
                                    step="0.1"
                                    value={formData.lotSize}
                                    onChange={(e) => handleInputChange('lotSize', parseFloat(e.target.value))}
                                    style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ddd' }}
                                />
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', color: '#333' }}>
                                    Min Size（最小訂單）
                                </label>
                                <input
                                    type="number"
                                    step="0.1"
                                    value={formData.minSize}
                                    onChange={(e) => handleInputChange('minSize', parseFloat(e.target.value))}
                                    style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ddd' }}
                                />
                            </div>
                        </div>

                        <div style={{ marginTop: '15px' }}>
                            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', color: '#d9534f' }}>
                                🛡️ Floor Price（自動回購觸發價格 USDC）<span style={{ color: 'red' }}> *必填</span>
                            </label>
                            <input
                                type="number"
                                step="0.01"
                                min="0.001"
                                value={formData.floorPrice || ''}
                                onChange={(e) => handleInputChange('floorPrice', parseFloat(e.target.value))}
                                placeholder="請輸入最低回購價格，例：0.01"
                                required
                                style={{ 
                                    width: '100%', 
                                    padding: '10px', 
                                    borderRadius: '6px', 
                                    border: !formData.floorPrice || formData.floorPrice <= 0 ? '2px solid #d9534f' : '1px solid #28a745',
                                    backgroundColor: !formData.floorPrice || formData.floorPrice <= 0 ? '#fff3cd' : 'white'
                                }}
                            />
                            <small style={{ color: !formData.floorPrice || formData.floorPrice <= 0 ? '#d9534f' : '#28a745', fontWeight: 'bold' }}>
                                {!formData.floorPrice || formData.floorPrice <= 0 
                                    ? '⚠️ 必須設定！當市場價格低於此價格時，系統將自動啟動回購機制' 
                                    : `✅ 已設定：${formData.floorPrice} USDC`
                                }
                            </small>
                        </div>
                    </div>

                    <button
                        onClick={handleCreatePool}
                        disabled={isProcessing}
                        style={{
                            padding: '12px 24px',
                            background: !isProcessing ? '#007bff' : '#6c757d',
                            color: 'white',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: !isProcessing ? 'pointer' : 'not-allowed',
                            fontSize: '16px',
                            fontWeight: 'bold',
                        }}
                    >
                        {isProcessing ? '處理中...' : '創建 Pool'}
                    </button>
                </div>
            )}

            {/* Step 6.3: Deposit Funds */}
            {currentStep === 3 && (
                <div>
                    <h3 style={{ color: '#000' }}>💰 存入資金</h3>
                    <p style={{ color: '#333', marginBottom: '20px' }}>
                        將 <strong>{coinKey}</strong> (FToken) 和 USDC 從錢包存入 Balance Manager 以便交易。
                    </p>
                    
                    {/* 顯示當前 Token Type */}
                    <div style={{ padding: '15px', background: '#e3f2fd', borderRadius: '8px', marginBottom: '20px', border: '2px solid #2196f3' }}>
                        <div style={{ marginBottom: '10px' }}>
                            <strong style={{ color: '#1976d2' }}>📊 當前 Token Type：</strong>
                        </div>
                        <code style={{ 
                            background: '#fff', 
                            padding: '8px 12px', 
                            borderRadius: '4px', 
                            display: 'block',
                            wordBreak: 'break-all',
                            fontSize: '12px',
                            border: effectiveTokenType?.includes('0x2::sui::SUI') ? '2px solid #f44336' : '1px solid #ddd'
                        }}>
                            {effectiveTokenType || '❌ 未設置'}
                        </code>
                        {effectiveTokenType?.includes('0x2::sui::SUI') && (
                            <div style={{ marginTop: '10px', padding: '10px', background: '#ffebee', borderRadius: '4px', color: '#c62828' }}>
                                <strong>❌ 錯誤！這是 SUI，不是你的 FToken！</strong><br/>
                                請返回測試模式輸入正確的 FToken Type
                            </div>
                        )}
                    </div>
                    
                    <div style={{ padding: '15px', background: '#fff3cd', borderRadius: '8px', marginBottom: '20px', border: '2px solid #ffc107' }}>
                        <strong>⚠️ 重要說明：</strong>
                        <ul style={{ marginBottom: 0, paddingLeft: '20px', marginTop: '10px' }}>
                            <li>請先從 <strong>Token Vault 頁面</strong> mint {coinKey} 到您的錢包</li>
                            <li>存入的是錢包中已有的 {coinKey}，不是 SUI</li>
                            <li><strong>存入數量必須 ≥ 你要賣出的數量</strong>（例如要賣 5 個，就至少存 5 個）</li>
                            <li><strong>買入需要存 USDC</strong>（總金額 = 買入價格 × 買入數量）</li>
                        </ul>
                    </div>
                    
                    <div style={{ padding: '15px', background: '#e7f3ff', borderRadius: '8px', marginBottom: '20px', border: '2px solid #0066ff' }}>
                        <h4 style={{ margin: '0 0 10px 0', color: '#0066ff' }}>💡 存款建議</h4>
                        <div style={{ fontSize: '14px', color: '#004085' }}>
                            <div style={{ marginBottom: '8px' }}>
                                <strong>如果你要在 Step 4 掛賣單：</strong><br/>
                                存入至少 <span style={{ fontSize: '18px', fontWeight: 'bold', color: '#c92a2a' }}>{formData.sellQuantity}</span> {coinKey}
                            </div>
                            <div>
                                <strong>如果你要在 Step 4 掛買單：</strong><br/>
                                存入至少 <span style={{ fontSize: '18px', fontWeight: 'bold', color: '#1864ab' }}>{(formData.buyPrice * formData.buyQuantity).toFixed(2)}</span> USDC
                            </div>
                        </div>
                    </div>

                    {poolId && (
                        <div style={{ padding: '10px', background: '#d4edda', borderRadius: '6px', marginBottom: '15px', color: '#155724' }}>
                            ✅ Pool ID: <code style={{ fontSize: '11px' }}>{poolId.slice(0, 20)}...</code>
                        </div>
                    )}

                    {usdcBalance > 0 && (
                        <div style={{ padding: '10px', background: '#e7f3ff', borderRadius: '6px', marginBottom: '15px', color: '#004085' }}>
                            💵 您的 USDC 餘額：<strong>{usdcBalance.toFixed(2)} USDC</strong>
                        </div>
                    )}

                    <div style={{ padding: '10px', background: '#f0f9ff', borderRadius: '6px', marginBottom: '15px', color: '#004085', border: '1px solid #b8daff' }}>
                        ℹ️ <strong>小數位數：6 位</strong> — 輸入 <code>6</code> 表示 6 個代幣（鏈上存儲為 6,000,000）
                    </div>

                    <div style={{ display: 'grid', gap: '15px', marginBottom: '20px' }}>
                        <div>
                            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', color: '#333' }}>
                                🪙 {coinKey} 數量（從錢包存入）
                            </label>
                            <input
                                type="number"
                                step="1"
                                min="1"
                                value={formData.depositFToken}
                                onChange={(e) => handleInputChange('depositFToken', parseFloat(e.target.value))}
                                style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ddd' }}
                            />
                            <small style={{ color: '#555' }}>
                                從您的錢包存入此數量的 {coinKey} 到 Balance Manager
                                {formData.depositFToken > 0 && (
                                    <span style={{ color: '#007bff', marginLeft: '8px' }}>
                                        （鏈上：{(formData.depositFToken * 1_000_000).toLocaleString()}）
                                    </span>
                                )}
                            </small>
                        </div>

                        <div>
                            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', color: '#333' }}>
                                USDC 數量（可選）
                            </label>
                            <input
                                type="number"
                                step="1"
                                min="0"
                                value={formData.depositUsdc}
                                onChange={(e) => handleInputChange('depositUsdc', parseFloat(e.target.value))}
                                style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ddd' }}
                            />
                            <small style={{ color: '#555' }}>
                                用於買入 {coinKey}（如果要掛買單）
                                {formData.depositUsdc > 0 && (
                                    <span style={{ color: '#007bff', marginLeft: '8px' }}>
                                        （鏈上：{(formData.depositUsdc * 1_000_000).toLocaleString()}）
                                    </span>
                                )}
                            </small>
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: '10px' }}>
                        <button
                            onClick={handleDeposit}
                            disabled={isProcessing}
                            style={{
                                flex: 1,
                                padding: '12px 24px',
                                background: !isProcessing ? '#007bff' : '#6c757d',
                                color: 'white',
                                border: 'none',
                                borderRadius: '6px',
                                cursor: !isProcessing ? 'pointer' : 'not-allowed',
                                fontSize: '16px',
                                fontWeight: 'bold',
                            }}
                        >
                            {isProcessing ? '處理中...' : '存入資金'}
                        </button>
                        
                        <button
                            onClick={async () => {
                                setIsLoadingBalances(true)
                                const balances = await checkBalanceManagerBalances()
                                setManagerBalances(balances)
                                setIsLoadingBalances(false)
                            }}
                            disabled={isLoadingBalances || !balanceManagerId}
                            style={{
                                padding: '12px 24px',
                                background: isLoadingBalances ? '#6c757d' : '#28a745',
                                color: 'white',
                                border: 'none',
                                borderRadius: '6px',
                                cursor: isLoadingBalances || !balanceManagerId ? 'not-allowed' : 'pointer',
                                fontSize: '16px',
                                fontWeight: 'bold',
                                whiteSpace: 'nowrap',
                            }}
                        >
                            {isLoadingBalances ? '⏳' : '🔍 查詢餘額'}
                        </button>
                    </div>
                    
                    {/* 顯示查詢到的餘額 */}
                    {managerBalances && (
                        <div style={{ marginTop: '20px', padding: '15px', background: '#d4edda', borderRadius: '8px', border: '2px solid #28a745' }}>
                            <h4 style={{ marginTop: 0, color: '#155724' }}>✅ Balance Manager 當前餘額</h4>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                                <div>
                                    <strong>🪙 {coinKey}:</strong> {managerBalances.fTokenBalance.toFixed(6)}
                                </div>
                                <div>
                                    <strong>💵 USDC:</strong> {managerBalances.usdcBalance.toFixed(6)}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Step 6.4: Place Limit Order */}
            {currentStep === 4 && (
                <div>
                    <h3 style={{ color: '#000' }}>📊 掛限價單</h3>
                    <p style={{ color: '#333', marginBottom: '20px' }}>
                        設置賣出價格和數量，掛單到 DeepBook。
                    </p>

                    {/* 查詢訂單區塊 */}
                    <div style={{ padding: '20px', background: '#fff9e6', borderRadius: '8px', marginBottom: '20px', border: '2px solid #ffc107' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                            <h4 style={{ margin: 0, color: '#856404' }}>📋 查詢訂單</h4>
                        </div>

                        {/* 查詢條件輸入 */}
                        <div style={{ display: 'grid', gap: '15px', marginBottom: '15px' }}>
                            <div>
                                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', color: '#333' }}>
                                    🔍 查詢條件（選擇一種）
                                </label>
                                <div style={{ display: 'flex', gap: '10px', marginBottom: '10px', flexWrap: 'wrap' }}>
                                    <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                                        <input
                                            type="radio"
                                            name="queryType"
                                            value="pool"
                                            defaultChecked
                                            style={{ marginRight: '5px' }}
                                        />
                                        <span>🏊 Pool ID（查看整個市場）</span>
                                    </label>
                                    <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                                        <input
                                            type="radio"
                                            name="queryType"
                                            value="address"
                                            style={{ marginRight: '5px' }}
                                        />
                                        <span>👤 錢包地址（我的訂單）</span>
                                    </label>
                                    <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                                        <input
                                            type="radio"
                                            name="queryType"
                                            value="balanceManager"
                                            style={{ marginRight: '5px' }}
                                        />
                                        <span>💼 Balance Manager ID</span>
                                    </label>
                                </div>
                            </div>

                            <div>
                                <input
                                    type="text"
                                    id="queryOrderInput"
                                    placeholder="輸入 Pool ID、錢包地址或 Balance Manager ID..."
                                    defaultValue={poolId || currentAccount?.address || ''}
                                    style={{ 
                                        width: '100%', 
                                        padding: '10px', 
                                        borderRadius: '6px', 
                                        border: '1px solid #ddd',
                                        fontFamily: 'monospace',
                                        fontSize: '12px'
                                    }}
                                    onChange={(e) => {
                                        // 自動判斷輸入類型
                                        const val = e.target.value.trim()
                                        if (val.length > 60) {
                                            // 長 ID 可能是 Pool ID 或 Balance Manager ID
                                            // 用戶需要手動選擇
                                        }
                                    }}
                                />
                                <small style={{ color: '#6c757d', display: 'block', marginTop: '5px' }}>
                                    💡 推薦：輸入 Pool ID 查看整個市場的掛單情況
                                </small>
                            </div>

                            <button
                                onClick={fetchOrderBook}
                                disabled={isLoadingMyOrders}
                                style={{
                                    padding: '10px 20px',
                                    background: isLoadingMyOrders ? '#6c757d' : '#ffc107',
                                    color: '#000',
                                    border: 'none',
                                    borderRadius: '6px',
                                    cursor: isLoadingMyOrders ? 'not-allowed' : 'pointer',
                                    fontSize: '14px',
                                    fontWeight: 'bold',
                                }}
                            >
                                {isLoadingMyOrders ? '查詢中...' : '🔍 查詢訂單'}
                            </button>
                        </div>

                        {/* Pool 統計數據（只在 Pool 查詢時顯示）*/}
                        {document.querySelector('input[name="queryType"]:checked')?.value === 'pool' && !isLoadingMyOrders && (
                            <div>
                                {poolStats.totalOrders > 0 ? (
                                    <div style={{ padding: '15px', background: '#fff', borderRadius: '8px', marginBottom: '15px', border: '2px solid #28a745' }}>
                                        <h4 style={{ margin: '0 0 15px 0', color: '#28a745' }}>📊 Pool 市場統計（當前有效掛單）</h4>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '10px' }}>
                                    <div style={{ padding: '10px', background: '#f8f9fa', borderRadius: '6px', textAlign: 'center' }}>
                                        <div style={{ fontSize: '12px', color: '#6c757d' }}>總掛單數</div>
                                        <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#495057' }}>{poolStats.totalOrders}</div>
                                    </div>
                                    <div style={{ padding: '10px', background: '#f0f9ff', borderRadius: '6px', textAlign: 'center' }}>
                                        <div style={{ fontSize: '12px', color: '#6c757d' }}>買單</div>
                                        <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#1864ab' }}>{poolStats.totalBids}</div>
                                    </div>
                                    <div style={{ padding: '10px', background: '#fff5f5', borderRadius: '6px', textAlign: 'center' }}>
                                        <div style={{ fontSize: '12px', color: '#6c757d' }}>賣單</div>
                                        <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#c92a2a' }}>{poolStats.totalAsks}</div>
                                    </div>
                                    <div style={{ padding: '10px', background: '#e7f3ff', borderRadius: '6px', textAlign: 'center' }}>
                                        <div style={{ fontSize: '12px', color: '#6c757d' }}>成交筆數</div>
                                        <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#0066ff' }}>{poolStats.totalTrades}</div>
                                    </div>
                                    <div style={{ padding: '10px', background: '#d4edda', borderRadius: '6px', textAlign: 'center' }}>
                                        <div style={{ fontSize: '12px', color: '#6c757d' }}>總成交量</div>
                                        <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#28a745' }}>{poolStats.totalVolume.toFixed(2)} USDC</div>
                                    </div>
                                </div>
                            </div>
                                ) : (
                                    <div style={{ padding: '15px', background: '#fff3cd', borderRadius: '8px', marginBottom: '15px', border: '2px solid #ffc107' }}>
                                        <h4 style={{ margin: '0 0 10px 0', color: '#856404' }}>⚠️ 目前沒有有效掛單</h4>
                                        <p style={{ margin: 0, color: '#856404', fontSize: '14px' }}>
                                            這個 Pool 目前沒有任何開啟中的掛單。{myOpenOrders.length > 0 ? '歷史訂單可能已全部成交或取消。' : '你可以成為第一個掛單的人！'}
                                        </p>
                                        {myOpenOrders.length > 0 && (
                                            <div style={{ marginTop: '10px', padding: '10px', background: '#fff', borderRadius: '6px', fontSize: '13px' }}>
                                                💡 <strong>提示</strong>：下方顯示的是歷史訂單記錄（已成交或已取消）
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* 查詢結果 - 掛單 */}
                        {isLoadingMyOrders ? (
                            <div style={{ textAlign: 'center', color: '#6c757d', padding: '20px', background: '#fff', borderRadius: '6px' }}>
                                ⏳ 載入訂單數據...
                            </div>
                        ) : myOpenOrders.length > 0 ? (
                            <div>
                                <div style={{ color: '#856404', marginBottom: '10px', padding: '10px', background: '#fff', borderRadius: '6px' }}>
                                    ✅ 找到 <strong>{myOpenOrders.length}</strong> 筆掛單記錄
                                </div>
                                <div style={{ maxHeight: '300px', overflowY: 'auto', background: '#fff', borderRadius: '6px', padding: '10px' }}>
                                    {myOpenOrders.map((order, index) => {
                                        const priceNum = order.price || 0
                                        const qtyNum = order.quantity || 0
                                        const orderType = order.isBid ? '🔵 買單' : '🔴 賣單'
                                        const isActive = order.status === 'open'
                                        
                                        return (
                                            <div key={order.orderId || index} style={{ 
                                                padding: '12px', 
                                                marginBottom: '8px', 
                                                background: isActive ? (order.isBid ? '#f0f9ff' : '#fff5f5') : '#f8f9fa',
                                                borderRadius: '6px',
                                                border: `1px solid ${isActive ? (order.isBid ? '#339af0' : '#ff6b6b') : '#dee2e6'}`,
                                                opacity: isActive ? 1 : 0.6,
                                            }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                                                    <span style={{ fontWeight: 'bold', color: order.isBid ? '#1864ab' : '#c92a2a' }}>
                                                        {orderType}
                                                        {!isActive && <span style={{ marginLeft: '8px', fontSize: '11px', color: '#6c757d', fontWeight: 'normal' }}>(已關閉)</span>}
                                                    </span>
                                                    <span style={{ fontSize: '12px', color: '#6c757d' }}>
                                                        #{index + 1}
                                                        {isActive && <span style={{ marginLeft: '5px', color: '#28a745', fontWeight: 'bold' }}>●</span>}
                                                    </span>
                                                </div>
                                                <div style={{ fontSize: '14px', color: '#495057' }}>
                                                    <div>價格: <strong>{priceNum > 0 ? priceNum.toFixed(6) : 'N/A'} USDC/{coinKey}</strong></div>
                                                    <div>數量: <strong>{qtyNum > 0 ? qtyNum.toFixed(6) : 'N/A'} {coinKey}</strong></div>
                                                    <div style={{ fontSize: '12px', color: '#6c757d', marginTop: '5px' }}>
                                                        總值: {(priceNum * qtyNum).toFixed(6)} USDC
                                                    </div>
                                                </div>
                                                {order.trader && (
                                                    <div style={{ 
                                                        marginTop: '8px', 
                                                        fontSize: '11px', 
                                                        color: '#6c757d',
                                                        fontFamily: 'monospace',
                                                        wordBreak: 'break-all'
                                                    }}>
                                                        Trader: {order.trader.slice(0, 10)}...{order.trader.slice(-8)}
                                                    </div>
                                                )}
                                                {order.orderId && (
                                                    <div style={{ 
                                                        marginTop: '4px', 
                                                        fontSize: '11px', 
                                                        color: '#6c757d',
                                                        fontFamily: 'monospace',
                                                        wordBreak: 'break-all'
                                                    }}>
                                                        Order ID: {order.orderId.toString().slice(0, 20)}...
                                                    </div>
                                                )}
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>
                        ) : (
                            <div style={{ textAlign: 'center', color: '#856404', padding: '15px', background: '#fff', borderRadius: '6px' }}>
                                <div>📭 沒有找到訂單記錄</div>
                                <div style={{ fontSize: '12px', color: '#6c757d', marginTop: '8px' }}>
                                    💡 請確認地址或 Balance Manager ID 是否正確
                                </div>
                            </div>
                        )}

                        {/* 查詢結果 - 成交記錄 */}
                        {tradeHistory.length > 0 && (
                            <div style={{ marginTop: '20px' }}>
                                <div style={{ color: '#0066ff', marginBottom: '10px', padding: '10px', background: '#fff', borderRadius: '6px', border: '2px solid #0066ff' }}>
                                    <h4 style={{ margin: 0 }}>💰 成交記錄 ({tradeHistory.length} 筆)</h4>
                                </div>
                                <div style={{ maxHeight: '300px', overflowY: 'auto', background: '#fff', borderRadius: '6px', padding: '10px' }}>
                                    {tradeHistory.map((trade, index) => {
                                        const priceNum = trade.price || 0
                                        const qtyNum = trade.baseQuantity || 0
                                        const totalValue = trade.quoteQuantity || 0
                                        const tradeType = trade.makerIsBid ? '🟢 買單成交' : '🔴 賣單成交'
                                        const date = new Date(parseInt(trade.timestamp))
                                        
                                        return (
                                            <div key={`${trade.txDigest}-${index}`} style={{ 
                                                padding: '12px', 
                                                marginBottom: '8px', 
                                                background: trade.makerIsBid ? '#f0f9ff' : '#fff5f5', 
                                                borderRadius: '6px',
                                                border: `1px solid ${trade.makerIsBid ? '#339af0' : '#ff6b6b'}`,
                                            }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                                                    <span style={{ fontWeight: 'bold', color: trade.makerIsBid ? '#1864ab' : '#c92a2a' }}>
                                                        {tradeType}
                                                    </span>
                                                    <span style={{ fontSize: '11px', color: '#6c757d' }}>
                                                        {date.toLocaleString()}
                                                    </span>
                                                </div>
                                                <div style={{ fontSize: '14px', color: '#495057' }}>
                                                    <div>成交價: <strong>{priceNum > 0 ? priceNum.toFixed(6) : 'N/A'} USDC/{coinKey}</strong></div>
                                                    <div>成交量: <strong>{qtyNum > 0 ? qtyNum.toFixed(6) : 'N/A'} {coinKey}</strong></div>
                                                    <div style={{ fontSize: '12px', color: '#6c757d', marginTop: '5px', padding: '5px', background: '#f8f9fa', borderRadius: '4px' }}>
                                                        💵 總金額: <strong>{totalValue.toFixed(6)} USDC</strong>
                                                    </div>
                                                </div>
                                                {trade.maker && trade.taker && (
                                                    <div style={{ 
                                                        marginTop: '8px', 
                                                        fontSize: '10px', 
                                                        color: '#6c757d',
                                                        fontFamily: 'monospace',
                                                        display: 'grid',
                                                        gap: '2px'
                                                    }}>
                                                        <div>Maker: {trade.maker.slice(0, 10)}...{trade.maker.slice(-8)}</div>
                                                        <div>Taker: {trade.taker.slice(0, 10)}...{trade.taker.slice(-8)}</div>
                                                    </div>
                                                )}
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* 🎯 快速決策指南 - 我該掛什麼單？ */}
                    {!isLoadingMyOrders && (
                        <div>
                            {(orderBook.bestBid || orderBook.bestAsk) ? (
                                <div style={{ padding: '20px', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', borderRadius: '12px', marginBottom: '20px', color: 'white', boxShadow: '0 4px 15px rgba(102, 126, 234, 0.4)' }}>
                                    <h4 style={{ marginTop: 0, color: 'white', fontSize: '18px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        🎯 我該掛什麼單才能成交？
                                    </h4>
                            
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginTop: '15px' }}>
                                {/* 賣出決策 */}
                                <div style={{ padding: '15px', background: 'rgba(255, 255, 255, 0.95)', borderRadius: '8px', color: '#333' }}>
                                    <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#c92a2a', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                        🔴 想賣出 {coinKey}？
                                    </div>
                                    
                                    {orderBook.bestBid ? (
                                        <div>
                                            <div style={{ padding: '12px', background: '#fff5f5', borderRadius: '6px', border: '2px solid #ff6b6b', marginBottom: '10px' }}>
                                                <div style={{ fontSize: '13px', color: '#666', marginBottom: '5px' }}>✅ 立即成交價格</div>
                                                <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#c92a2a' }}>
                                                    ≤ {orderBook.bestBid.toFixed(4)}
                                                </div>
                                                <div style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>
                                                    掛這個價或更低，立刻賣出
                                                </div>
                                            </div>
                                            
                                            <div style={{ fontSize: '12px', color: '#495057', padding: '8px', background: '#f8f9fa', borderRadius: '4px' }}>
                                                💡 <strong>建議操作</strong>：<br/>
                                                點擊賣出區的「立即成交」按鈕
                                            </div>
                                        </div>
                                    ) : (
                                        <div style={{ padding: '10px', background: '#fff3cd', borderRadius: '6px', fontSize: '13px', color: '#856404' }}>
                                            ⚠️ 目前沒有買單<br/>
                                            你的賣單會成為市場價格
                                        </div>
                                    )}
                                </div>

                                {/* 買入決策 */}
                                <div style={{ padding: '15px', background: 'rgba(255, 255, 255, 0.95)', borderRadius: '8px', color: '#333' }}>
                                    <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#1864ab', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                        🔵 想買入 {coinKey}？
                                    </div>
                                    
                                    {orderBook.bestAsk ? (
                                        <div>
                                            <div style={{ padding: '12px', background: '#f0f9ff', borderRadius: '6px', border: '2px solid #339af0', marginBottom: '10px' }}>
                                                <div style={{ fontSize: '13px', color: '#666', marginBottom: '5px' }}>✅ 立即成交價格</div>
                                                <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#1864ab' }}>
                                                    ≥ {orderBook.bestAsk.toFixed(4)}
                                                </div>
                                                <div style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>
                                                    掛這個價或更高，立刻買入
                                                </div>
                                            </div>
                                            
                                            <div style={{ fontSize: '12px', color: '#495057', padding: '8px', background: '#f8f9fa', borderRadius: '4px' }}>
                                                💡 <strong>建議操作</strong>：<br/>
                                                點擊買入區的「立即成交」按鈕
                                            </div>
                                        </div>
                                    ) : (
                                        <div style={{ padding: '10px', background: '#fff3cd', borderRadius: '6px', fontSize: '13px', color: '#856404' }}>
                                            ⚠️ 目前沒有賣單<br/>
                                            你的買單會成為市場價格
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* 價差提示 */}
                            {orderBook.bestBid && orderBook.bestAsk && (
                                <div style={{ marginTop: '15px', padding: '12px', background: 'rgba(255, 255, 255, 0.9)', borderRadius: '8px' }}>
                                    <div style={{ fontSize: '14px', color: '#495057' }}>
                                        <strong>📊 當前價差：</strong> {(orderBook.bestAsk - orderBook.bestBid).toFixed(4)} USDC 
                                        <span style={{ marginLeft: '10px', color: '#6c757d' }}>
                                            ({(((orderBook.bestAsk - orderBook.bestBid) / orderBook.bestBid) * 100).toFixed(2)}%)
                                        </span>
                                    </div>
                                    <div style={{ fontSize: '12px', color: '#6c757d', marginTop: '5px' }}>
                                        💡 如果你不急著成交，可以掛在 <strong>{orderBook.bestBid.toFixed(4)}</strong> 到 <strong>{orderBook.bestAsk.toFixed(4)}</strong> 之間等待
                                    </div>
                                </div>
                            )}
                        </div>
                            ) : poolStats.totalOrders === 0 && myOpenOrders.length > 0 ? (
                                <div style={{ padding: '20px', background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)', borderRadius: '12px', marginBottom: '20px', color: 'white', boxShadow: '0 4px 15px rgba(240, 147, 251, 0.4)' }}>
                                    <h4 style={{ marginTop: 0, color: 'white', fontSize: '18px' }}>
                                        ℹ️ 所有訂單已成交或取消
                                    </h4>
                                    <div style={{ padding: '15px', background: 'rgba(255, 255, 255, 0.95)', borderRadius: '8px', color: '#333' }}>
                                        <p style={{ margin: '0 0 10px 0', fontSize: '14px' }}>
                                            查詢到 <strong>{myOpenOrders.length}</strong> 筆歷史訂單，但目前沒有開啟中的掛單。
                                        </p>
                                        <div style={{ padding: '10px', background: '#e7f3ff', borderRadius: '6px', marginTop: '10px' }}>
                                            <strong>💡 你可以：</strong>
                                            <ul style={{ margin: '8px 0 0 0', paddingLeft: '20px', fontSize: '13px' }}>
                                                <li>參考下方的成交記錄，了解歷史價格</li>
                                                <li>根據歷史價格決定你的掛單價格</li>
                                                <li>成為第一個掛單的人，設定市場價格！</li>
                                            </ul>
                                        </div>
                                    </div>
                                </div>
                            ) : poolStats.totalOrders === 0 && myOpenOrders.length === 0 ? (
                                <div style={{ padding: '20px', background: 'linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)', borderRadius: '12px', marginBottom: '20px', color: '#333', boxShadow: '0 4px 15px rgba(168, 237, 234, 0.4)' }}>
                                    <h4 style={{ marginTop: 0, color: '#2d3748', fontSize: '18px' }}>
                                        🎊 市場尚未開啟 - 你是先行者！
                                    </h4>
                                    <div style={{ padding: '15px', background: 'rgba(255, 255, 255, 0.9)', borderRadius: '8px' }}>
                                        <p style={{ margin: '0 0 10px 0', fontSize: '14px' }}>
                                            這個 Pool 還沒有任何訂單記錄，你將成為第一個掛單的人！
                                        </p>
                                        <div style={{ padding: '12px', background: '#d4edda', borderRadius: '6px', marginTop: '10px', border: '2px solid #28a745' }}>
                                            <strong>🎯 建議策略：</strong>
                                            <div style={{ fontSize: '13px', marginTop: '8px' }}>
                                                <strong>1. 賣出</strong>：參考你的資產價值和期望收益，設定一個合理的價格<br/>
                                                <strong>2. 買入</strong>：如果有其他人掛賣單，你可以決定是否接受<br/>
                                                <strong>3. 等待</strong>：掛單後等待其他人與你成交
                                            </div>
                                        </div>
                                        <div style={{ marginTop: '10px', fontSize: '12px', color: '#6c757d' }}>
                                            💡 提示：第一個掛單的價格會成為市場參考，建議設定在合理範圍內
                                        </div>
                                    </div>
                                </div>
                            ) : null}
                        </div>
                    )}

                    {/* 市場價格分析與成交建議 */}
                    {(orderBook.bestBid || orderBook.bestAsk) ? (
                        <div style={{ padding: '20px', background: '#e7f3ff', borderRadius: '8px', marginBottom: '20px', border: '2px solid #0066ff' }}>
                            <h4 style={{ marginTop: 0, color: '#0066ff' }}>💡 進階：成交策略詳解</h4>
                            
                            <div style={{ display: 'grid', gap: '15px', marginBottom: '15px' }}>
                                {/* 當前市場價格 */}
                                <div style={{ padding: '15px', background: '#fff', borderRadius: '6px', border: '1px solid #339af0' }}>
                                    <div style={{ fontWeight: 'bold', marginBottom: '10px', color: '#1864ab' }}>📊 當前市場價格</div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                                        <div>
                                            <div style={{ fontSize: '12px', color: '#6c757d' }}>最高買價 (Best Bid)</div>
                                            <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#1864ab' }}>
                                                {orderBook.bestBid ? `${orderBook.bestBid.toFixed(4)} USDC` : 'N/A'}
                                            </div>
                                        </div>
                                        <div>
                                            <div style={{ fontSize: '12px', color: '#6c757d' }}>最低賣價 (Best Ask)</div>
                                            <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#c92a2a' }}>
                                                {orderBook.bestAsk ? `${orderBook.bestAsk.toFixed(4)} USDC` : 'N/A'}
                                            </div>
                                        </div>
                                    </div>
                                    {orderBook.bestBid && orderBook.bestAsk && (
                                        <div style={{ marginTop: '10px', padding: '8px', background: '#f0f9ff', borderRadius: '4px', fontSize: '13px' }}>
                                            <strong>價差 (Spread):</strong> {(orderBook.bestAsk - orderBook.bestBid).toFixed(4)} USDC 
                                            ({(((orderBook.bestAsk - orderBook.bestBid) / orderBook.bestBid) * 100).toFixed(2)}%)
                                        </div>
                                    )}
                                </div>

                                {/* 賣出建議 */}
                                <div style={{ padding: '15px', background: '#fff5f5', borderRadius: '6px', border: '2px solid #ff6b6b' }}>
                                    <div style={{ fontWeight: 'bold', marginBottom: '10px', color: '#c92a2a' }}>🔴 如果你想賣出 {coinKey}</div>
                                    <div style={{ fontSize: '14px', lineHeight: '1.6' }}>
                                        {orderBook.bestBid ? (
                                            <>
                                                <div style={{ marginBottom: '8px' }}>
                                                    <strong>立即成交：</strong>掛單價格 <span style={{ color: '#c92a2a', fontWeight: 'bold', fontSize: '16px' }}>≤ {orderBook.bestBid.toFixed(4)}</span> USDC
                                                    <div style={{ fontSize: '12px', color: '#6c757d', marginTop: '4px' }}>
                                                        💰 會立即與買單成交
                                                    </div>
                                                </div>
                                                <div>
                                                    <strong>掛單等待：</strong>掛單價格 <span style={{ color: '#e8590c', fontWeight: 'bold', fontSize: '16px' }}>&gt; {orderBook.bestBid.toFixed(4)}</span> USDC
                                                    <div style={{ fontSize: '12px', color: '#6c757d', marginTop: '4px' }}>
                                                        ⏳ 等待買方接受你的價格
                                                    </div>
                                                </div>
                                            </>
                                        ) : (
                                            <div style={{ color: '#6c757d' }}>目前沒有買單，你的賣單會成為市場最佳價格</div>
                                        )}
                                    </div>
                                </div>

                                {/* 買入建議 */}
                                <div style={{ padding: '15px', background: '#f0f9ff', borderRadius: '6px', border: '2px solid #339af0' }}>
                                    <div style={{ fontWeight: 'bold', marginBottom: '10px', color: '#1864ab' }}>🔵 如果你想買入 {coinKey}</div>
                                    <div style={{ fontSize: '14px', lineHeight: '1.6' }}>
                                        {orderBook.bestAsk ? (
                                            <>
                                                <div style={{ marginBottom: '8px' }}>
                                                    <strong>立即成交：</strong>掛單價格 <span style={{ color: '#1864ab', fontWeight: 'bold', fontSize: '16px' }}>≥ {orderBook.bestAsk.toFixed(4)}</span> USDC
                                                    <div style={{ fontSize: '12px', color: '#6c757d', marginTop: '4px' }}>
                                                        💰 會立即與賣單成交
                                                    </div>
                                                </div>
                                                <div>
                                                    <strong>掛單等待：</strong>掛單價格 <span style={{ color: '#0c8599', fontWeight: 'bold', fontSize: '16px' }}>&lt; {orderBook.bestAsk.toFixed(4)}</span> USDC
                                                    <div style={{ fontSize: '12px', color: '#6c757d', marginTop: '4px' }}>
                                                        ⏳ 等待賣方接受你的價格
                                                    </div>
                                                </div>
                                            </>
                                        ) : (
                                            <div style={{ color: '#6c757d' }}>目前沒有賣單，你的買單會成為市場最佳價格</div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : myOpenOrders.length > 0 ? (
                        <div style={{ padding: '20px', background: '#fff3cd', borderRadius: '8px', marginBottom: '20px', border: '2px solid #ffc107' }}>
                            <h4 style={{ marginTop: 0, color: '#856404' }}>⚠️ 無法分析市場價格</h4>
                            <p style={{ marginBottom: 0, color: '#856404' }}>
                                找到了 {myOpenOrders.length} 筆訂單，但無法確定當前市場的最佳買賣價格。
                                <br/>
                                💡 可能原因：所有訂單已成交或被取消。
                            </p>
                        </div>
                    ) : null}

                    {/* 訂單簿信息 */}
                    <div style={{ padding: '20px', background: '#f8f9fa', borderRadius: '8px', marginBottom: '20px', border: '2px solid #dee2e6' }}>
                        <h4 style={{ marginTop: 0, color: '#495057' }}>📈 池子配置信息</h4>

                        {isLoadingOrderBook ? (
                            <div style={{ textAlign: 'center', color: '#6c757d', padding: '20px' }}>
                                ⏳ 載入池子信息...
                            </div>
                        ) : (orderBook.tickSize || orderBook.lotSize) ? (
                            <div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '15px' }}>
                                    <div style={{ padding: '12px', background: '#fff', borderRadius: '6px', border: '1px solid #dee2e6' }}>
                                        <div style={{ fontSize: '12px', color: '#6c757d', marginBottom: '5px' }}>Tick Size（價格精度）</div>
                                        <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#495057' }}>
                                            {orderBook.tickSize}
                                        </div>
                                    </div>
                                    <div style={{ padding: '12px', background: '#fff', borderRadius: '6px', border: '1px solid #dee2e6' }}>
                                        <div style={{ fontSize: '12px', color: '#6c757d', marginBottom: '5px' }}>Lot Size（最小交易量）</div>
                                        <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#495057' }}>
                                            {orderBook.lotSize}
                                        </div>
                                    </div>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                                    {/* 賣單（Ask）列表 */}
                                    <div>
                                        <div style={{ fontWeight: 'bold', color: '#c92a2a', marginBottom: '10px', fontSize: '14px' }}>
                                            🔴 市場賣單
                                        </div>
                                        {orderBook.bestAsk ? (
                                            <div style={{ padding: '10px', background: '#fff5f5', borderRadius: '6px', border: '1px solid #ff6b6b' }}>
                                                <div style={{ fontSize: '12px', color: '#666' }}>最佳賣價</div>
                                                <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#c92a2a' }}>
                                                    {orderBook.bestAsk.toFixed(3)} USDC
                                                </div>
                                            </div>
                                        ) : (
                                            <div style={{ padding: '10px', background: '#f8f9fa', borderRadius: '6px', color: '#6c757d', fontSize: '14px' }}>
                                                暫無市場賣單
                                            </div>
                                        )}
                                    </div>

                                    {/* 買單（Bid）列表 */}
                                    <div>
                                        <div style={{ fontWeight: 'bold', color: '#1864ab', marginBottom: '10px', fontSize: '14px' }}>
                                            🔵 市場買單
                                        </div>
                                        {orderBook.bestBid ? (
                                            <div style={{ padding: '10px', background: '#f0f9ff', borderRadius: '6px', border: '1px solid #339af0' }}>
                                                <div style={{ fontSize: '12px', color: '#666' }}>最佳買價</div>
                                                <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#1864ab' }}>
                                                    {orderBook.bestBid.toFixed(3)} USDC
                                                </div>
                                            </div>
                                        ) : (
                                            <div style={{ padding: '10px', background: '#f8f9fa', borderRadius: '6px', color: '#6c757d', fontSize: '14px' }}>
                                                暫無市場買單
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {myOpenOrders.length > 0 && (
                                    <div style={{ marginTop: '15px', padding: '10px', background: '#d1ecf1', borderRadius: '6px', fontSize: '14px', color: '#0c5460' }}>
                                        💡 提示：您已有 {myOpenOrders.length} 筆掛單。新掛單將與現有訂單一起排隊成交。
                                    </div>
                                )}

                                {!myOpenOrders.length && (orderBook.bestBid || orderBook.bestAsk) && (
                                    <div style={{ marginTop: '15px', padding: '10px', background: '#e7f3ff', borderRadius: '6px', fontSize: '14px' }}>
                                        💡 建議：賣單價格應高於 <strong>{orderBook.bestBid ? orderBook.bestBid.toFixed(3) : 'N/A'}</strong>，
                                        買單價格應低於 <strong>{orderBook.bestAsk ? orderBook.bestAsk.toFixed(3) : 'N/A'}</strong>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div style={{ textAlign: 'center', color: '#6c757d', padding: '20px' }}>
                                點擊上方「刷新」按鈕查看池子信息
                            </div>
                        )}
                    </div>

                    {/* 餘額查詢 */}
                    <div style={{ padding: '20px', background: '#e7f3ff', borderRadius: '8px', marginBottom: '20px', border: '2px solid #0066ff' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                            <h4 style={{ margin: 0, color: '#0066ff' }}>💰 Balance Manager 餘額</h4>
                            <button
                                onClick={async () => {
                                    setIsLoadingBalances(true)
                                    const balances = await checkBalanceManagerBalances()
                                    setManagerBalances(balances)
                                    setIsLoadingBalances(false)
                                }}
                                disabled={isLoadingBalances || !balanceManagerId}
                                style={{
                                    padding: '8px 16px',
                                    background: isLoadingBalances ? '#6c757d' : '#0066ff',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '6px',
                                    cursor: isLoadingBalances || !balanceManagerId ? 'not-allowed' : 'pointer',
                                    fontSize: '13px',
                                    fontWeight: 'bold',
                                }}
                            >
                                {isLoadingBalances ? '查詢中...' : '🔍 查詢餘額'}
                            </button>
                        </div>
                        
                        {managerBalances ? (
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                                <div style={{ padding: '15px', background: '#fff', borderRadius: '8px', border: '2px solid #28a745' }}>
                                    <div style={{ fontSize: '12px', color: '#6c757d', marginBottom: '5px' }}>🪙 {coinKey} 餘額</div>
                                    <div style={{ fontSize: '24px', fontWeight: 'bold', color: managerBalances.fTokenBalance >= formData.sellQuantity ? '#28a745' : '#dc3545' }}>
                                        {managerBalances.fTokenBalance.toFixed(6)}
                                    </div>
                                    <div style={{ fontSize: '12px', color: '#6c757d', marginTop: '5px' }}>
                                        {managerBalances.fTokenBalance >= formData.sellQuantity ? 
                                            `✅ 足夠賣出 ${formData.sellQuantity}` : 
                                            `❌ 不足，需要 ${formData.sellQuantity}`
                                        }
                                    </div>
                                </div>
                                
                                <div style={{ padding: '15px', background: '#fff', borderRadius: '8px', border: '2px solid #007bff' }}>
                                    <div style={{ fontSize: '12px', color: '#6c757d', marginBottom: '5px' }}>💵 USDC 餘額</div>
                                    <div style={{ fontSize: '24px', fontWeight: 'bold', color: managerBalances.usdcBalance >= (formData.buyPrice * formData.buyQuantity) ? '#007bff' : '#dc3545' }}>
                                        {managerBalances.usdcBalance.toFixed(6)}
                                    </div>
                                    <div style={{ fontSize: '12px', color: '#6c757d', marginTop: '5px' }}>
                                        {managerBalances.usdcBalance >= (formData.buyPrice * formData.buyQuantity) ? 
                                            `✅ 足夠買入 ${formData.buyQuantity}` : 
                                            `❌ 不足，需要 ${(formData.buyPrice * formData.buyQuantity).toFixed(2)}`
                                        }
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div style={{ padding: '15px', background: '#fff', borderRadius: '8px', textAlign: 'center', color: '#6c757d' }}>
                                點擊上方按鈕查詢 Balance Manager 中的餘額
                            </div>
                        )}
                    </div>

                    {/* 餘額警告 */}
                    <div style={{ padding: '20px', background: '#fff3cd', borderRadius: '8px', marginBottom: '20px', border: '2px solid #ffc107' }}>
                        <h4 style={{ marginTop: 0, color: '#856404' }}>⚠️ 重要：確認 Balance Manager 餘額</h4>
                        <div style={{ fontSize: '14px', color: '#856404', lineHeight: '1.6' }}>
                            <p style={{ margin: '10px 0' }}>
                                <strong>下單前請確認你在 Step 3 已經存入足夠的資金！</strong>
                            </p>
                            <div style={{ padding: '12px', background: '#fff', borderRadius: '6px', marginTop: '10px' }}>
                                <div style={{ marginBottom: '8px' }}>
                                    🔴 <strong>賣出 {coinKey}</strong>：需要在 Balance Manager 中有足夠的 <strong>{coinKey}</strong>
                                </div>
                                <div style={{ fontSize: '13px', color: '#6c757d', marginLeft: '20px', marginBottom: '10px' }}>
                                    例如：賣出 {formData.sellQuantity} {coinKey}，需要至少 {formData.sellQuantity} {coinKey} 餘額
                                </div>
                                
                                <div>
                                    🔵 <strong>買入 {coinKey}</strong>：需要在 Balance Manager 中有足夠的 <strong>USDC</strong>
                                </div>
                                <div style={{ fontSize: '13px', color: '#6c757d', marginLeft: '20px' }}>
                                    例如：買入 {formData.buyQuantity} {coinKey} @ {formData.buyPrice} USDC = 需要 {(formData.buyPrice * formData.buyQuantity).toFixed(2)} USDC
                                </div>
                            </div>
                            
                            <div style={{ padding: '10px', background: '#f8d7da', borderRadius: '6px', marginTop: '10px', border: '1px solid #f5c6cb' }}>
                                <strong>❌ 如果餘額不足</strong>，會出現錯誤：
                                <code style={{ display: 'block', marginTop: '5px', fontSize: '11px', fontFamily: 'monospace' }}>
                                    MoveAbort...balance_manager...withdraw_with_proof...3
                                </code>
                            </div>
                            
                            <div style={{ padding: '10px', background: '#d1ecf1', borderRadius: '6px', marginTop: '10px', border: '1px solid #bee5eb' }}>
                                <strong>💡 解決方法</strong>：
                                <ul style={{ margin: '5px 0 0 0', paddingLeft: '20px' }}>
                                    <li>返回 Step 3 存入更多資金</li>
                                    <li>或者減少下單數量</li>
                                </ul>
                            </div>
                            
                            <button
                                onClick={() => setCurrentStep(3)}
                                style={{
                                    width: '100%',
                                    marginTop: '10px',
                                    padding: '10px',
                                    background: '#17a2b8',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                    fontWeight: 'bold',
                                    fontSize: '14px'
                                }}
                            >
                                ← 返回 Step 3 存入更多資金
                            </button>
                        </div>
                    </div>

                    {/* 賣單區塊 */}
                    <div style={{ padding: '20px', background: '#fff5f5', borderRadius: '8px', border: '2px solid #ff6b6b', marginBottom: '20px' }}>
                        <h4 style={{ marginTop: 0, color: '#c92a2a' }}>🔴 賣出訂單</h4>
                        <div style={{ padding: '10px', background: '#fff', borderRadius: '6px', marginBottom: '15px', border: '1px solid #ffc107' }}>
                            <strong>⚠️ 需要餘額：</strong> {formData.sellQuantity} {coinKey} (在 Balance Manager 中)
                        </div>
                        
                        {/* 快速價格選擇 */}
                        {orderBook.bestBid && (
                            <div style={{ marginBottom: '15px', padding: '10px', background: '#fff', borderRadius: '6px' }}>
                                <div style={{ fontSize: '13px', color: '#6c757d', marginBottom: '8px' }}>💡 快速選擇價格：</div>
                                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                    <button
                                        onClick={() => handleInputChange('sellPrice', orderBook.bestBid)}
                                        style={{ padding: '6px 12px', background: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', fontSize: '12px', cursor: 'pointer' }}
                                    >
                                        立即成交: {orderBook.bestBid.toFixed(4)}
                                    </button>
                                    <button
                                        onClick={() => handleInputChange('sellPrice', orderBook.bestBid * 1.05)}
                                        style={{ padding: '6px 12px', background: '#fd7e14', color: 'white', border: 'none', borderRadius: '4px', fontSize: '12px', cursor: 'pointer' }}
                                    >
                                        +5%: {(orderBook.bestBid * 1.05).toFixed(4)}
                                    </button>
                                    <button
                                        onClick={() => handleInputChange('sellPrice', orderBook.bestBid * 1.1)}
                                        style={{ padding: '6px 12px', background: '#ffc107', color: '#000', border: 'none', borderRadius: '4px', fontSize: '12px', cursor: 'pointer' }}
                                    >
                                        +10%: {(orderBook.bestBid * 1.1).toFixed(4)}
                                    </button>
                                    {orderBook.bestAsk && (
                                        <button
                                            onClick={() => handleInputChange('sellPrice', orderBook.bestAsk)}
                                            style={{ padding: '6px 12px', background: '#6c757d', color: 'white', border: 'none', borderRadius: '4px', fontSize: '12px', cursor: 'pointer' }}
                                        >
                                            掛最低價: {orderBook.bestAsk.toFixed(4)}
                                        </button>
                                    )}
                                </div>
                            </div>
                        )}
                        
                        <div style={{ display: 'grid', gap: '15px', marginBottom: '15px' }}>
                            <div>
                                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', color: '#333' }}>
                                    賣出價格（USDC per {coinKey}）
                                </label>
                                <input
                                    type="number"
                                    step="0.01"
                                    value={formData.sellPrice}
                                    onChange={(e) => handleInputChange('sellPrice', parseFloat(e.target.value))}
                                    style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ddd' }}
                                />
                            </div>

                            <div>
                                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', color: '#333' }}>
                                    賣出數量（{coinKey}）
                                </label>
                                <input
                                    type="number"
                                    step="0.1"
                                    value={formData.sellQuantity}
                                    onChange={(e) => handleInputChange('sellQuantity', parseFloat(e.target.value))}
                                    style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ddd' }}
                                />
                                <small style={{ color: '#555' }}>
                                    總價值：{(formData.sellPrice * formData.sellQuantity).toFixed(2)} USDC
                                </small>
                            </div>
                        </div>

                        <button
                            onClick={() => handlePlaceLimitOrder(false)}
                            disabled={isProcessing}
                            style={{
                                width: '100%',
                                padding: '12px 24px',
                                background: !isProcessing ? '#ff6b6b' : '#6c757d',
                                color: 'white',
                                border: 'none',
                                borderRadius: '6px',
                                cursor: !isProcessing ? 'pointer' : 'not-allowed',
                                fontSize: '16px',
                                fontWeight: 'bold',
                            }}
                        >
                            {isProcessing ? '處理中...' : '掛限價賣單'}
                        </button>
                    </div>

                    {/* 買單區塊 */}
                    <div style={{ padding: '20px', background: '#f0f9ff', borderRadius: '8px', border: '2px solid #339af0' }}>
                        <h4 style={{ marginTop: 0, color: '#1864ab' }}>🔵 買入訂單</h4>
                        <div style={{ padding: '10px', background: '#fff', borderRadius: '6px', marginBottom: '15px', border: '1px solid #ffc107' }}>
                            <strong>⚠️ 需要餘額：</strong> {(formData.buyPrice * formData.buyQuantity).toFixed(2)} USDC (在 Balance Manager 中)
                        </div>
                        
                        {/* 快速價格選擇 */}
                        {orderBook.bestAsk && (
                            <div style={{ marginBottom: '15px', padding: '10px', background: '#fff', borderRadius: '6px' }}>
                                <div style={{ fontSize: '13px', color: '#6c757d', marginBottom: '8px' }}>💡 快速選擇價格：</div>
                                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                    <button
                                        onClick={() => handleInputChange('buyPrice', orderBook.bestAsk)}
                                        style={{ padding: '6px 12px', background: '#28a745', color: 'white', border: 'none', borderRadius: '4px', fontSize: '12px', cursor: 'pointer' }}
                                    >
                                        立即成交: {orderBook.bestAsk.toFixed(4)}
                                    </button>
                                    <button
                                        onClick={() => handleInputChange('buyPrice', orderBook.bestAsk * 0.95)}
                                        style={{ padding: '6px 12px', background: '#17a2b8', color: 'white', border: 'none', borderRadius: '4px', fontSize: '12px', cursor: 'pointer' }}
                                    >
                                        -5%: {(orderBook.bestAsk * 0.95).toFixed(4)}
                                    </button>
                                    <button
                                        onClick={() => handleInputChange('buyPrice', orderBook.bestAsk * 0.9)}
                                        style={{ padding: '6px 12px', background: '#007bff', color: 'white', border: 'none', borderRadius: '4px', fontSize: '12px', cursor: 'pointer' }}
                                    >
                                        -10%: {(orderBook.bestAsk * 0.9).toFixed(4)}
                                    </button>
                                    {orderBook.bestBid && (
                                        <button
                                            onClick={() => handleInputChange('buyPrice', orderBook.bestBid)}
                                            style={{ padding: '6px 12px', background: '#6c757d', color: 'white', border: 'none', borderRadius: '4px', fontSize: '12px', cursor: 'pointer' }}
                                        >
                                            掛最高價: {orderBook.bestBid.toFixed(4)}
                                        </button>
                                    )}
                                </div>
                            </div>
                        )}
                        
                        <div style={{ display: 'grid', gap: '15px', marginBottom: '15px' }}>
                            <div>
                                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', color: '#333' }}>
                                    買入價格（USDC per {coinKey}）
                                </label>
                                <input
                                    type="number"
                                    step="0.01"
                                    value={formData.buyPrice}
                                    onChange={(e) => handleInputChange('buyPrice', parseFloat(e.target.value))}
                                    style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ddd' }}
                                />
                            </div>

                            <div>
                                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', color: '#333' }}>
                                    買入數量（{coinKey}）
                                </label>
                                <input
                                    type="number"
                                    step="0.1"
                                    value={formData.buyQuantity}
                                    onChange={(e) => handleInputChange('buyQuantity', parseFloat(e.target.value))}
                                    style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ddd' }}
                                />
                                <small style={{ color: '#555' }}>
                                    總價值：{(formData.buyPrice * formData.buyQuantity).toFixed(2)} USDC
                                </small>
                            </div>
                        </div>

                        <button
                            onClick={() => handlePlaceLimitOrder(true)}
                            disabled={isProcessing}
                            style={{
                                width: '100%',
                                padding: '12px 24px',
                                background: !isProcessing ? '#339af0' : '#6c757d',
                                color: 'white',
                                border: 'none',
                                borderRadius: '6px',
                                cursor: !isProcessing ? 'pointer' : 'not-allowed',
                                fontSize: '16px',
                                fontWeight: 'bold',
                            }}
                        >
                            {isProcessing ? '處理中...' : '掛限價買單'}
                        </button>
                    </div>
                </div>
            )}

            {/* Step 6.5: Completion */}
            {currentStep === 5 && (
                <div>
                    <h3 style={{ color: '#000' }}>✅ DeepBook 交易設置完成！</h3>

                    <div style={{ padding: '20px', background: '#d4edda', borderRadius: '8px', marginBottom: '20px' }}>
                        <h4 style={{ marginTop: 0, color: '#155724' }}>🎉 成功！</h4>
                        <div style={{ display: 'grid', gap: '10px', color: '#155724' }}>
                            <div>
                                <strong>Balance Manager ID:</strong>
                                <div style={{ fontFamily: 'monospace', fontSize: '12px', wordBreak: 'break-all' }}>
                                    {balanceManagerId}
                                </div>
                            </div>
                            <div>
                                <strong>Pool ID:</strong>
                                <div style={{ fontFamily: 'monospace', fontSize: '12px', wordBreak: 'break-all' }}>
                                    {poolId}
                                </div>
                            </div>
                            <div>
                                <strong>限價單:</strong> {formData.sellQuantity} {coinKey} @ {formData.sellPrice} USDC
                            </div>
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: '10px' }}>
                        <button
                            onClick={resetWizard}
                            style={{
                                padding: '12px 24px',
                                background: '#6c757d',
                                color: 'white',
                                border: 'none',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                fontSize: '16px',
                            }}
                        >
                            重新開始
                        </button>
                        {onBack && (
                            <button
                                onClick={onBack}
                                style={{
                                    padding: '12px 24px',
                                    background: '#007bff',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                    fontSize: '16px',
                                }}
                            >
                                返回 Vault
                            </button>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}
