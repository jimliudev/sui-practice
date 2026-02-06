import { useState } from 'react'
import { useCurrentAccount, useSignAndExecuteTransaction, useSuiClient } from '@mysten/dapp-kit'
import { Transaction } from '@mysten/sui/transactions'
import { DeepBookClient } from '@mysten/deepbook-v3'
import { BUILT_IN_COINS, createCustomCoinConfig } from '../utils/deepbookHelpers'

// DeepBook Package ID (Testnet)
const DEEPBOOK_PACKAGE_ID = 'fb28c4cbc6865bd1c897d26aecbe1f8792d1509a20ffec692c800660cbec6982'

// 從 tokenType 提取 coin key
function extractCoinKey(tokenType) {
    if (!tokenType) return 'CUSTOM_TOKEN'
    const parts = tokenType.split('::')
    return parts.length >= 3 ? parts[2] : 'CUSTOM_TOKEN'
}

/**
 * PlaceOrderPage - 手動掛單頁面
 * 用於在 Pool 建立完成後，手動掛初始賣單
 * 避免 ENoDataPoints 錯誤
 */
export default function PlaceOrderPage() {
    const currentAccount = useCurrentAccount()
    const suiClient = useSuiClient()
    const { mutateAsync: signAndExecuteTransaction } = useSignAndExecuteTransaction()

    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState(null)
    const [success, setSuccess] = useState(null)

    const [formData, setFormData] = useState({
        managerId: '',
        poolId: '',
        packageId: '',
        tokenType: '',
        quantity: 1000,
        price: 0.001,
    })

    const handleInputChange = (field, value) => {
        setFormData(prev => ({ ...prev, [field]: value }))
    }

    const handlePlaceOrder = async () => {
        setIsLoading(true)
        setError(null)
        setSuccess(null)

        try {
            // 驗證必要欄位
            if (!formData.managerId || !formData.poolId || !formData.packageId || !formData.tokenType) {
                throw new Error('請填寫所有必要欄位')
            }

            const coinKey = extractCoinKey(formData.tokenType)
            const poolKey = `${coinKey}_DBUSDC`

            console.log('🔧 Creating DeepBook Client...')
            console.log('- coinKey:', coinKey)
            console.log('- poolKey:', poolKey)
            console.log('- poolId:', formData.poolId)
            console.log('- managerId:', formData.managerId)

            // 創建 DeepBook Client
            const sellDbClient = new DeepBookClient({
                address: currentAccount.address,
                env: 'testnet',
                client: suiClient,
                coins: {
                    ...BUILT_IN_COINS,
                    [coinKey]: createCustomCoinConfig(formData.packageId, formData.tokenType, 6),
                },
                pools: {
                    [poolKey]: {
                        address: formData.poolId,
                        baseCoin: coinKey,
                        quoteCoin: 'DBUSDC',
                    },
                },
                balanceManagers: {
                    MANAGER: {
                        address: formData.managerId,
                        tradeCap: undefined,
                    }
                }
            })

            const sellQuantity = Number(formData.quantity)
            const sellPrice = Number(formData.price)

            console.log(`📝 Placing sell order: ${sellQuantity} tokens at ${sellPrice} USDC each`)

            const sellTx = new Transaction()
            sellDbClient.deepBook.placeLimitOrder({
                poolKey,
                balanceManagerKey: 'MANAGER',
                clientOrderId: BigInt(Date.now()),
                price: sellPrice,
                quantity: sellQuantity,
                isBid: false,  // 賣單
                orderType: 0,
                selfMatchingOption: 0,  // CANCEL_TAKER
                payWithDeep: false
            })(sellTx)

            const sellResult = await signAndExecuteTransaction({ transaction: sellTx })
            
            console.log('⏳ Waiting for sell order transaction to finalize...')
            await suiClient.waitForTransaction({
                digest: sellResult.digest,
                options: { showEffects: true, showEvents: true },
            })
            
            console.log('✅ Sell order placed:', sellResult.digest)
            setSuccess(`賣單成功！交易 Hash: ${sellResult.digest}`)

        } catch (err) {
            console.error('Place order error:', err)
            
            // 檢查是否是 DEEP price data points 錯誤
            const isDeepPriceError = err.message?.includes('MoveAbort') && 
                                    err.message?.includes('deep_price') && 
                                    err.message?.includes(', 2)')
            
            if (isDeepPriceError) {
                setError('❌ DEEP 價格數據尚未準備好 (ENoDataPoints)。請稍等幾分鐘後再試。新建的 Pool 需要時間累積價格數據。')
            } else {
                setError(err.message)
            }
        } finally {
            setIsLoading(false)
        }
    }

    const inputStyle = {
        width: '100%',
        padding: '14px 16px',
        fontSize: '14px',
        border: '1px solid rgba(255, 255, 255, 0.15)',
        borderRadius: '10px',
        outline: 'none',
        background: 'rgba(255, 255, 255, 0.05)',
        color: '#ffffff',
        fontFamily: 'monospace',
        transition: 'all 0.2s',
    }

    const labelStyle = {
        display: 'block',
        fontSize: '13px',
        fontWeight: '600',
        color: 'rgba(255, 255, 255, 0.6)',
        marginBottom: '8px',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
    }

    return (
        <div style={{
            maxWidth: '640px',
            margin: '0 auto',
            padding: '60px 20px',
            minHeight: 'calc(100vh - 160px)',
        }}>
            <h1 style={{
                fontSize: '32px',
                fontWeight: '700',
                marginBottom: '16px',
                color: '#ffffff',
            }}>
                手動掛單
            </h1>
            
            <p style={{
                fontSize: '16px',
                color: 'rgba(255, 255, 255, 0.6)',
                marginBottom: '40px',
                lineHeight: '1.6',
            }}>
                在 Pool 建立完成後，使用此頁面手動掛初始賣單。
                <br />
                這可以避免新 Pool 因為 DEEP 價格數據尚未準備好而產生的 ENoDataPoints 錯誤。
            </p>

            {error && (
                <div style={{
                    padding: '16px 20px',
                    background: 'rgba(255, 59, 48, 0.1)',
                    border: '1px solid rgba(255, 59, 48, 0.3)',
                    borderRadius: '12px',
                    marginBottom: '24px',
                    color: '#ff6b6b',
                    fontSize: '14px',
                    lineHeight: '1.5',
                }}>
                    {error}
                </div>
            )}

            {success && (
                <div style={{
                    padding: '16px 20px',
                    background: 'rgba(52, 199, 89, 0.1)',
                    border: '1px solid rgba(52, 199, 89, 0.3)',
                    borderRadius: '12px',
                    marginBottom: '24px',
                    color: '#34c759',
                    fontSize: '14px',
                    lineHeight: '1.5',
                    wordBreak: 'break-all',
                }}>
                    {success}
                </div>
            )}

            {/* Pool & Manager 資訊 */}
            <div style={{
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '16px',
                padding: '24px',
                marginBottom: '24px',
            }}>
                <h3 style={{
                    fontSize: '16px',
                    fontWeight: '600',
                    color: '#ffffff',
                    marginBottom: '20px',
                }}>
                    Pool & Manager 資訊
                </h3>

                <div style={{ marginBottom: '16px' }}>
                    <label style={labelStyle}>Manager ID *</label>
                    <input
                        type="text"
                        value={formData.managerId}
                        onChange={(e) => handleInputChange('managerId', e.target.value)}
                        placeholder="0x..."
                        style={inputStyle}
                        onFocus={(e) => {
                            e.target.style.borderColor = '#667eea'
                            e.target.style.background = 'rgba(255, 255, 255, 0.08)'
                        }}
                        onBlur={(e) => {
                            e.target.style.borderColor = 'rgba(255, 255, 255, 0.15)'
                            e.target.style.background = 'rgba(255, 255, 255, 0.05)'
                        }}
                    />
                </div>

                <div style={{ marginBottom: '16px' }}>
                    <label style={labelStyle}>Pool ID *</label>
                    <input
                        type="text"
                        value={formData.poolId}
                        onChange={(e) => handleInputChange('poolId', e.target.value)}
                        placeholder="0x..."
                        style={inputStyle}
                        onFocus={(e) => {
                            e.target.style.borderColor = '#667eea'
                            e.target.style.background = 'rgba(255, 255, 255, 0.08)'
                        }}
                        onBlur={(e) => {
                            e.target.style.borderColor = 'rgba(255, 255, 255, 0.15)'
                            e.target.style.background = 'rgba(255, 255, 255, 0.05)'
                        }}
                    />
                </div>

                <div style={{ marginBottom: '16px' }}>
                    <label style={labelStyle}>Package ID *</label>
                    <input
                        type="text"
                        value={formData.packageId}
                        onChange={(e) => handleInputChange('packageId', e.target.value)}
                        placeholder="0x..."
                        style={inputStyle}
                        onFocus={(e) => {
                            e.target.style.borderColor = '#667eea'
                            e.target.style.background = 'rgba(255, 255, 255, 0.08)'
                        }}
                        onBlur={(e) => {
                            e.target.style.borderColor = 'rgba(255, 255, 255, 0.15)'
                            e.target.style.background = 'rgba(255, 255, 255, 0.05)'
                        }}
                    />
                </div>

                <div>
                    <label style={labelStyle}>Token Type *</label>
                    <input
                        type="text"
                        value={formData.tokenType}
                        onChange={(e) => handleInputChange('tokenType', e.target.value)}
                        placeholder="0x...::module::TOKEN"
                        style={inputStyle}
                        onFocus={(e) => {
                            e.target.style.borderColor = '#667eea'
                            e.target.style.background = 'rgba(255, 255, 255, 0.08)'
                        }}
                        onBlur={(e) => {
                            e.target.style.borderColor = 'rgba(255, 255, 255, 0.15)'
                            e.target.style.background = 'rgba(255, 255, 255, 0.05)'
                        }}
                    />
                </div>
            </div>

            {/* 訂單資訊 */}
            <div style={{
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '16px',
                padding: '24px',
                marginBottom: '32px',
            }}>
                <h3 style={{
                    fontSize: '16px',
                    fontWeight: '600',
                    color: '#ffffff',
                    marginBottom: '20px',
                }}>
                    訂單資訊
                </h3>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <div>
                        <label style={labelStyle}>數量 (Tokens)</label>
                        <input
                            type="number"
                            value={formData.quantity}
                            onChange={(e) => handleInputChange('quantity', e.target.value)}
                            min="1"
                            step="1"
                            style={inputStyle}
                            onFocus={(e) => {
                                e.target.style.borderColor = '#667eea'
                                e.target.style.background = 'rgba(255, 255, 255, 0.08)'
                            }}
                            onBlur={(e) => {
                                e.target.style.borderColor = 'rgba(255, 255, 255, 0.15)'
                                e.target.style.background = 'rgba(255, 255, 255, 0.05)'
                            }}
                        />
                    </div>
                    <div>
                        <label style={labelStyle}>價格 (USDC)</label>
                        <input
                            type="number"
                            value={formData.price}
                            onChange={(e) => handleInputChange('price', e.target.value)}
                            min="0.001"
                            step="0.001"
                            style={inputStyle}
                            onFocus={(e) => {
                                e.target.style.borderColor = '#667eea'
                                e.target.style.background = 'rgba(255, 255, 255, 0.08)'
                            }}
                            onBlur={(e) => {
                                e.target.style.borderColor = 'rgba(255, 255, 255, 0.15)'
                                e.target.style.background = 'rgba(255, 255, 255, 0.05)'
                            }}
                        />
                    </div>
                </div>

                <div style={{
                    marginTop: '16px',
                    padding: '12px 16px',
                    background: 'rgba(102, 126, 234, 0.1)',
                    borderRadius: '8px',
                    fontSize: '14px',
                    color: 'rgba(255, 255, 255, 0.8)',
                }}>
                    總價值: <strong>{(Number(formData.quantity) * Number(formData.price)).toFixed(4)} USDC</strong>
                </div>
            </div>

            {/* 提示訊息 */}
            <div style={{
                background: 'rgba(255, 193, 7, 0.1)',
                border: '1px solid rgba(255, 193, 7, 0.3)',
                borderRadius: '12px',
                padding: '16px 20px',
                marginBottom: '24px',
                fontSize: '13px',
                color: 'rgba(255, 255, 255, 0.8)',
                lineHeight: '1.6',
            }}>
                <strong style={{ color: '#ffc107' }}>⚠️ 注意事項：</strong>
                <ul style={{ margin: '8px 0 0 0', paddingLeft: '20px' }}>
                    <li>新建的 Pool 需要等待 DEEP 價格數據累積（通常需要幾分鐘）</li>
                    <li>如果遇到 ENoDataPoints 錯誤，請稍等後再試</li>
                    <li>確保 Balance Manager 中有足夠的 Token 餘額</li>
                </ul>
            </div>

            {/* 掛單按鈕 */}
            <button
                onClick={handlePlaceOrder}
                disabled={isLoading || !currentAccount}
                style={{
                    width: '100%',
                    padding: '18px',
                    fontSize: '16px',
                    fontWeight: '600',
                    background: isLoading 
                        ? 'rgba(255, 255, 255, 0.1)'
                        : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '12px',
                    cursor: isLoading ? 'not-allowed' : 'pointer',
                    transition: 'all 0.3s ease',
                    boxShadow: isLoading ? 'none' : '0 8px 24px rgba(102, 126, 234, 0.3)',
                }}
                onMouseEnter={(e) => {
                    if (!isLoading) {
                        e.target.style.transform = 'translateY(-2px)'
                        e.target.style.boxShadow = '0 12px 32px rgba(102, 126, 234, 0.5)'
                    }
                }}
                onMouseLeave={(e) => {
                    e.target.style.transform = 'translateY(0)'
                    e.target.style.boxShadow = '0 8px 24px rgba(102, 126, 234, 0.3)'
                }}
            >
                {isLoading ? '掛單中...' : '🚀 掛賣單'}
            </button>
        </div>
    )
}
