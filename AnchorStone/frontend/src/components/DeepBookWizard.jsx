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

    // 手動輸入的 tokenType (用於測試模式)
    const [manualTokenType, setManualTokenType] = useState(null)
    const [manualVaultId, setManualVaultId] = useState(null)
    const [manualPackageId, setManualPackageId] = useState(null)

    // 表單數據
    const [formData, setFormData] = useState({
        // Pool 配置
        tickSize: 0.001,
        lotSize: 0.1,
        minSize: 1,
        floorPrice: 1.0,  // 自動回購觸發價格
        // 存款金額
        depositUsdc: 10,
        depositFToken: 5,
        // 限價單
        sellPrice: 5.0,
        sellQuantity: 1,
    })

    // 創建 DeepBook Client (含 pools 配置)
    // 優先使用手動輸入的值（用於測試模式）
    const effectiveTokenType = manualTokenType || tokenType
    const effectiveVaultId = manualVaultId || vaultId
    const effectivePackageId = manualPackageId || packageId
    const coinKey = extractCoinKey(effectiveTokenType)
    const poolKey = `${coinKey}_DBUSDC`

    const createDbClient = (balanceManagerAddress = null, customPoolId = null) => {
        if (!currentAccount) return null

        // 自定義代幣配置 - 使用動態 coinKey
        const customCoins = effectiveTokenType ? {
            [coinKey]: createCustomCoinConfig(packageId, effectiveTokenType, 6)
        } : {}

        const coins = {
            ...BUILT_IN_COINS,
            ...customCoins,
        }

        // 自定義池子配置 (如果已創建) - 使用動態 poolKey
        const pools = customPoolId ? {
            [poolKey]: {
                address: customPoolId,
                baseCoin: coinKey,
                quoteCoin: 'DBUSDC',
            }
        } : undefined

        // Balance Manager 配置
        const balanceManagers = balanceManagerAddress ? {
            MANAGER_1: {
                address: balanceManagerAddress,
            }
        } : undefined

        return new DeepBookClient({
            address: currentAccount.address,
            env: 'testnet',
            client: suiClient,
            coins,
            pools,
            balanceManagers,
        })
    }

    const handleInputChange = (field, value) => {
        setFormData(prev => ({ ...prev, [field]: value }))
    }

    // Step 6.1: 創建 Balance Manager (直接 Move 調用)
    const handleCreateBalanceManager = async () => {
        setIsProcessing(true)
        setError(null)

        try {
            console.log('Creating Balance Manager via Move call...')

            const tx = new Transaction()

            // 調用 balance_manager::new 創建 BalanceManager
            const [balanceManager] = tx.moveCall({
                target: `0x${DEEPBOOK_PACKAGE_ID}::balance_manager::new`,
                arguments: [],
            })

            // BalanceManager 必須是 shared object
            tx.moveCall({
                target: '0x2::transfer::public_share_object',
                typeArguments: [`0x${DEEPBOOK_PACKAGE_ID}::balance_manager::BalanceManager`],
                arguments: [balanceManager],
            })

            const result = await signAndExecuteTransaction({
                transaction: tx,
            }, {
                onSuccess: (data) => console.log('Transaction success:', data),
            })

            // 等待交易確認並獲取完整結果
            const fullResult = await suiClient.waitForTransaction({
                digest: result.digest,
                options: { showObjectChanges: true },
            })

            console.log('Balance Manager creation result:', result)

            const managerId = extractObjectId(fullResult, 'BalanceManager')

            if (!managerId) {
                throw new Error('Failed to find Balance Manager ID in transaction result')
            }

            console.log('✅ Balance Manager ID:', managerId)
            setBalanceManagerId(managerId)
            setCurrentStep(2)

        } catch (err) {
            console.error('Create Balance Manager error:', err)
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

                // 調用 set_deepbook_pool_entry 更新 Vault
                updateTx.moveCall({
                    target: `${effectivePackageId}::rwa_vault::set_deepbook_pool_entry`,
                    typeArguments: ['0x2::sui::SUI', effectiveTokenType],
                    arguments: [
                        updateTx.object(effectiveVaultId),
                        updateTx.pure.id(newPoolId),
                        updateTx.pure.id(balanceManagerId),
                        updateTx.pure.string(effectiveTokenType),
                    ],
                })

                const updateResult = await signAndExecuteTransaction({ transaction: updateTx })

                console.log('✅ Vault updated on-chain:', updateResult.digest)
            } catch (updateErr) {
                console.warn('⚠️ Failed to update Vault on-chain:', updateErr.message)
                // 繼續執行，因為後端仍然可以追蹤
            }

            // 3. 註冊 Pool 到後端監聽器
            try {
                const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000'
                await fetch(`${backendUrl}/api/vaults/register-pool`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        vaultId,
                        poolId: newPoolId,
                        balanceManagerId,
                        coinType: effectiveTokenType,
                        floorPrice: formData.floorPrice || 1.0,
                        owner: currentAccount.address,
                    }),
                })
                console.log('✅ Pool registered with backend')
            } catch (regErr) {
                console.warn('⚠️ Failed to register pool with backend:', regErr.message)
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

            // 檢查 USDC 餘額
            const usdc = await checkUsdcBalance(suiClient, currentAccount.address)
            setUsdcBalance(usdc)

            console.log('Depositing funds...')
            console.log('FToken amount:', formData.depositFToken)
            console.log('USDC amount:', formData.depositUsdc)

            const tx = new Transaction()

            // 1. Mint FToken from Vault
            const mintAmount = BigInt(Math.floor(formData.depositFToken * 1_000_000))
            console.log('Mint amount (raw):', mintAmount.toString())

            const [mintedCoin] = tx.moveCall({
                target: `${effectivePackageId}::rwa_vault::mint_tokens`,
                typeArguments: ['0x2::sui::SUI', effectiveTokenType],
                arguments: [
                    tx.object(effectiveVaultId),
                    tx.pure.u64(mintAmount),
                ],
            })

            // 2. Deposit FToken to Balance Manager (直接 Move 調用)
            tx.moveCall({
                target: `0x${DEEPBOOK_PACKAGE_ID}::balance_manager::deposit`,
                typeArguments: [effectiveTokenType],
                arguments: [
                    tx.object(balanceManagerId),
                    mintedCoin,
                ],
            })

            // 3. Deposit USDC to Balance Manager (如果有且用戶有足夠餘額)
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

    // Step 6.4: 掛限價賣單
    const handlePlaceLimitOrder = async () => {
        setIsProcessing(true)
        setError(null)

        try {
            console.log('Placing limit order...')
            console.log('Price:', formData.sellPrice, 'USDC per FToken')
            console.log('Quantity:', formData.sellQuantity, 'FToken')

            const dbClient = createDbClient(balanceManagerId, poolId)
            if (!dbClient) {
                throw new Error('Failed to create DeepBook client')
            }

            const tx = new Transaction()

            // 掛限價賣單 - 使用 tx.add() 包裝
            tx.add(
                dbClient.deepBook.placeLimitOrder({
                    poolKey: poolKey,
                    balanceManagerKey: 'MANAGER_1',
                    clientOrderId: generateOrderId(),
                    price: formData.sellPrice,
                    quantity: formData.sellQuantity,
                    isBid: false,  // false = 賣單
                    orderType: 0,  // NO_RESTRICTION
                    selfMatchingOption: 0, // SELF_MATCHING_ALLOWED
                    payWithDeep: false,
                })
            )

            const result = await signAndExecuteTransaction({ transaction: tx })

            console.log('Order placement result:', result)
            console.log('✅ Limit order placed successfully!')
            setCurrentStep(5)

        } catch (err) {
            console.error('Place order error:', err)
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
            floorPrice: 1.0,
            depositUsdc: 10,
            depositFToken: 5,
            sellPrice: 5.0,
            sellQuantity: 1,
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
                    <h3 style={{ color: '#000' }}>📦 創建 Balance Manager</h3>
                    <p style={{ color: '#333', marginBottom: '20px' }}>
                        Balance Manager 用於管理您在 DeepBook 上的所有資金。
                    </p>

                    <div style={{ padding: '15px', background: '#e7f3ff', border: '2px solid #0066ff', borderRadius: '8px', marginBottom: '20px' }}>
                        <h4 style={{ marginTop: 0, color: '#0066ff' }}>ℹ️ 說明</h4>
                        <ul style={{ marginBottom: 0, paddingLeft: '20px', color: '#333' }}>
                            <li>Balance Manager 是 shared object</li>
                            <li>一個 Balance Manager 可在所有池子中使用</li>
                            <li>創建後會自動分享給所有人</li>
                        </ul>
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
                        {isProcessing ? '處理中...' : '創建 Balance Manager'}
                    </button>

                    {/* 測試用輸入框 - 手動輸入已有的 ID */}
                    <div style={{ marginTop: '30px', padding: '20px', background: '#f8f9fa', borderRadius: '8px', border: '2px dashed #6c757d' }}>
                        <h4 style={{ marginTop: 0, color: '#495057' }}>🔧 測試模式：手動輸入已有 ID</h4>
                        <p style={{ color: '#6c757d', fontSize: '14px', marginBottom: '15px' }}>
                            如果你已經有 Balance Manager 或 Pool，可以直接輸入 ID 跳到對應步驟。
                        </p>

                        <div style={{ display: 'grid', gap: '15px' }}>
                            {/* Base Coin (Token Type) 輸入 */}
                            <div>
                                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', color: '#333' }}>
                                    🪙 Base Coin (Token Type)
                                </label>
                                <input
                                    type="text"
                                    placeholder="0x...::module::TOKEN_NAME"
                                    id="manualTokenType"
                                    defaultValue={tokenType || ''}
                                    onChange={(e) => {
                                        const val = e.target.value.trim()
                                        if (val) {
                                            setManualTokenType(val)
                                            console.log('✅ 手動設置 Token Type:', val)
                                        }
                                    }}
                                    style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ddd', fontFamily: 'monospace', fontSize: '12px' }}
                                />
                                <small style={{ color: '#6c757d' }}>格式：0x...::module_name::TOKEN_NAME</small>
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
                                    Pool ID（選填，可同時設置）
                                </label>
                                <div style={{ display: 'flex', gap: '10px' }}>
                                    <input
                                        type="text"
                                        placeholder="0x..."
                                        id="manualPoolId"
                                        style={{ flex: 1, padding: '10px', borderRadius: '6px', border: '1px solid #ddd', fontFamily: 'monospace', fontSize: '12px' }}
                                    />
                                    <button
                                        onClick={() => {
                                            const bmInput = document.getElementById('manualBalanceManagerId')
                                            const poolInput = document.getElementById('manualPoolId')
                                            const bmId = bmInput.value.trim()
                                            const pId = poolInput.value.trim()
                                            if (bmId && pId) {
                                                setBalanceManagerId(bmId)
                                                setPoolId(pId)
                                                setCurrentStep(3)
                                                console.log('✅ 手動設置 Balance Manager ID:', bmId)
                                                console.log('✅ 手動設置 Pool ID:', pId)
                                            } else if (!bmId) {
                                                alert('請先輸入 Balance Manager ID')
                                            } else if (!pId) {
                                                alert('請先輸入 Pool ID')
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
                                        }}
                                    >
                                        跳到 Step 3
                                    </button>
                                </div>
                            </div>

                            {/* 跳到 Step 4 (掛限價單) 按鈕 */}
                            <div>
                                <button
                                    onClick={() => {
                                        const bmInput = document.getElementById('manualBalanceManagerId')
                                        const poolInput = document.getElementById('manualPoolId')
                                        const bmId = bmInput?.value.trim()
                                        const pId = poolInput?.value.trim()
                                        if (bmId && pId) {
                                            setBalanceManagerId(bmId)
                                            setPoolId(pId)
                                            setCurrentStep(4)
                                            console.log('✅ 手動設置 Balance Manager ID:', bmId)
                                            console.log('✅ 手動設置 Pool ID:', pId)
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
                                    需要先填入 Balance Manager ID 和 Pool ID
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
                            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', color: '#333' }}>
                                🛡️ Floor Price（自動回購觸發價格 USDC）
                            </label>
                            <input
                                type="number"
                                step="0.1"
                                value={formData.floorPrice}
                                onChange={(e) => handleInputChange('floorPrice', parseFloat(e.target.value))}
                                style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ddd' }}
                            />
                            <small style={{ color: '#555' }}>
                                當市場價格低於此價格時，系統將自動啟動回購機制
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
                        將 {coinKey} 和 USDC 存入 Balance Manager 以便交易。
                    </p>

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

                    <div style={{ display: 'grid', gap: '15px', marginBottom: '20px' }}>
                        <div>
                            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', color: '#333' }}>
                                {coinKey} 數量（從 Vault mint）
                            </label>
                            <input
                                type="number"
                                step="0.1"
                                value={formData.depositFToken}
                                onChange={(e) => handleInputChange('depositFToken', parseFloat(e.target.value))}
                                style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ddd' }}
                            />
                            <small style={{ color: '#555' }}>將從 Vault 自動 mint 此數量的 {coinKey}</small>
                        </div>

                        <div>
                            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', color: '#333' }}>
                                USDC 數量（可選）
                            </label>
                            <input
                                type="number"
                                step="0.1"
                                value={formData.depositUsdc}
                                onChange={(e) => handleInputChange('depositUsdc', parseFloat(e.target.value))}
                                style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ddd' }}
                            />
                            <small style={{ color: '#555' }}>用於買入 {coinKey}（如果要掛買單）</small>
                        </div>
                    </div>

                    <button
                        onClick={handleDeposit}
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
                        {isProcessing ? '處理中...' : '存入資金'}
                    </button>
                </div>
            )}

            {/* Step 6.4: Place Limit Order */}
            {currentStep === 4 && (
                <div>
                    <h3 style={{ color: '#000' }}>📊 掛限價賣單</h3>
                    <p style={{ color: '#333', marginBottom: '20px' }}>
                        設置賣出價格和數量，掛單到 DeepBook。
                    </p>

                    <div style={{ display: 'grid', gap: '15px', marginBottom: '20px' }}>
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
                        onClick={handlePlaceLimitOrder}
                        disabled={isProcessing}
                        style={{
                            padding: '12px 24px',
                            background: !isProcessing ? '#28a745' : '#6c757d',
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
