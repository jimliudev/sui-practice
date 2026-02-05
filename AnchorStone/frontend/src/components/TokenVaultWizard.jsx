import { useState } from 'react'
import { useCurrentAccount, useSignTransaction, useSuiClient } from '@mysten/dapp-kit'
import { Transaction } from '@mysten/sui/transactions'
import { useContractDeployment } from '../hooks/useContractDeployment'
import { buildMintNFTTransaction } from '../utils/contractInteraction'
import DeepBookWizard from './DeepBookWizard'

const STEPS = [
    { id: 1, title: '物業資料', description: '輸入物業和 Token 資訊' },
    { id: 2, title: '創建 NFT', description: '鑄造 PropertyNFT' },
    { id: 3, title: '部署 Token', description: '部署專屬 Token 合約' },
    { id: 4, title: '創建 Vault', description: '鎖定 TreasuryCap' },
    { id: 5, title: '完成', description: '查看結果' },
]

/**
 * Multi-step wizard for deploying token and creating vault
 * Ensures TreasuryCap is immediately locked in vault
 */
export default function TokenVaultWizard() {
    const currentAccount = useCurrentAccount()
    const { mutateAsync: signTransaction } = useSignTransaction()
    const suiClient = useSuiClient()
    const { deployContract, isGenerating, isDeploying, deploymentResult, reset: resetDeployment } = useContractDeployment()

    const [currentStep, setCurrentStep] = useState(1)
    const [isProcessing, setIsProcessing] = useState(false)
    const [error, setError] = useState(null)

    // Mint state
    const [mintAmount, setMintAmount] = useState('')
    const [mintResult, setMintResult] = useState(null)

    // DeepBook state
    const [showDeepBook, setShowDeepBook] = useState(false)

    // Form data for all steps
    const [formData, setFormData] = useState({
        // NFT data
        propertyName: '',
        description: '',
        imageUrl: 'https://example.com/property.jpg',
        propertyValue: 1000000,
        location: '',
        // Token data
        tokenSymbol: '',
        // Vault data
        totalFragments: 1,          // User inputs whole tokens (will multiply by 1M)
        // DeepBook integration
        initialPrice: 5.0,          // USDC per token
        floorPrice: null,           // ⚠️ USDC per token - 必須由用戶設定
        usdcCollateral: 1.0,        // USDC
    })

    // Results from each step
    const [results, setResults] = useState({
        nftId: null,
        packageId: null,
        treasuryCapId: null,
        tokenType: null,
        vaultId: null,
        digest: null,
    })

    const handleInputChange = (field, value) => {
        setFormData(prev => ({ ...prev, [field]: value }))
    }

    // Step 2: Create NFT
    const handleCreateNFT = async () => {
        setIsProcessing(true)
        setError(null)

        try {
            const tx = buildMintNFTTransaction({
                name: formData.propertyName,
                description: formData.description,
                imageUrl: formData.imageUrl,
                propertyValue: formData.propertyValue,
                location: formData.location,
            })

            const { bytes, signature } = await signTransaction({ transaction: tx })
            const result = await suiClient.executeTransactionBlock({
                transactionBlock: bytes,
                signature,
                options: { showObjectChanges: true },
            })

            const nftId = result.objectChanges?.find(
                obj => obj.type === 'created' && obj.objectType?.includes('PropertyNFT')
            )?.objectId

            if (!nftId) throw new Error('Failed to create NFT')

            setResults(prev => ({ ...prev, nftId }))
            setCurrentStep(3)
        } catch (err) {
            setError(err.message)
        } finally {
            setIsProcessing(false)
        }
    }

    // Step 3: Deploy Token
    const handleDeployToken = async () => {
        try {
            const result = await deployContract(
                {
                    propertyId: results.nftId,
                    name: formData.propertyName,
                    description: formData.description,
                    symbol: formData.tokenSymbol,  // 傳遞自定義 symbol
                },
                currentAccount.address,
                signTransaction
            )

            setResults(prev => ({
                ...prev,
                packageId: result.packageId,
                treasuryCapId: result.treasuryCapId,
                tokenType: result.tokenType,
            }))
            setCurrentStep(4)
        } catch (err) {
            setError(err.message)
        }
    }

    // Step 4: Create Vault
    const handleCreateVault = async () => {
        setIsProcessing(true)
        setError(null)

        try {
            // ✅ 驗證必填欄位
            if (!formData.floorPrice || formData.floorPrice <= 0) {
                throw new Error('❌ 請設定 Floor Price（最低回購價格）！這是必填項目。')
            }
            
            if (!formData.initialPrice || formData.initialPrice <= 0) {
                throw new Error('❌ 請設定 Initial Price（起始價格）！這是必填項目。')
            }
            
            if (formData.floorPrice > formData.initialPrice) {
                throw new Error('❌ Floor Price 不能高於 Initial Price！')
            }

            // Convert user input to smallest units (6 decimals)
            const totalTokenSupply = formData.totalFragments * 1_000_000  // User inputs whole tokens
            const usdcCollateralAmount = Math.floor(formData.usdcCollateral * 1_000_000)
            const initialPriceAmount = Math.floor(formData.initialPrice * 1_000_000)
            const floorPriceAmount = Math.floor(formData.floorPrice * 1_000_000)

            // Frontend validation
            const requiredCollateral = (totalTokenSupply * floorPriceAmount) / 1_000_000
            if (usdcCollateralAmount < requiredCollateral) {
                throw new Error(`質押不足！至少需要 ${(requiredCollateral / 1_000_000).toFixed(2)} USDC`)
            }

            console.log('Creating vault with:')
            console.log('- NFT ID:', results.nftId)
            console.log('- TreasuryCap ID:', results.treasuryCapId)
            console.log('- Token Type:', results.tokenType)
            console.log('- Total Token Supply (user input):', formData.totalFragments, 'tokens')
            console.log('- Total Token Supply (smallest unit):', totalTokenSupply)
            console.log('- USDC Collateral:', usdcCollateralAmount, '(', formData.usdcCollateral, 'USDC )')
            console.log('- Initial Price:', initialPriceAmount, '(', formData.initialPrice, 'USDC/token )')
            console.log('- Floor Price:', floorPriceAmount, '(', formData.floorPrice, 'USDC/token )')

            const tx = new Transaction()

            // Split the USDC collateral from gas coin
            const [usdcCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(usdcCollateralAmount)])

            // Call create_vault_entry
            tx.moveCall({
                target: `${import.meta.env.VITE_PACKAGE_ID}::rwa_vault::create_vault_entry`,
                typeArguments: ['0x2::sui::SUI', results.tokenType],
                arguments: [
                    tx.object(results.nftId),
                    tx.object(results.treasuryCapId),
                    usdcCoin,
                    tx.pure.u64(totalTokenSupply),  // Use converted value
                    tx.pure.u64(initialPriceAmount),
                    tx.pure.u64(floorPriceAmount),
                ],
            })

            const { bytes, signature } = await signTransaction({ transaction: tx })
            const result = await suiClient.executeTransactionBlock({
                transactionBlock: bytes,
                signature,
                options: { showObjectChanges: true },
            })

            console.log('Vault creation result:', result)

            const vaultId = result.objectChanges?.find(
                obj => obj.type === 'created' && obj.objectType?.includes('RwaVault')
            )?.objectId

            setResults(prev => ({ ...prev, vaultId, digest: result.digest }))
            setCurrentStep(5)
        } catch (err) {
            console.error('Create vault error:', err)
            setError(err.message)
        } finally {
            setIsProcessing(false)
        }
    }

    // Mint tokens from vault
    const handleMintTokens = async () => {
        setIsProcessing(true)
        setError(null)
        setMintResult(null)

        try {
            // Convert user input to smallest units (6 decimals)
            const amount = formData.totalFragments * 1_000_000  // User inputs whole tokens

            console.log('Minting tokens:')
            console.log('- Vault ID:', results.vaultId)
            console.log('- Token Type:', results.tokenType)
            console.log('- Amount (user input):', formData.totalFragments, 'tokens')
            console.log('- Amount (smallest unit):', amount)

            const tx = new Transaction()

            tx.moveCall({
                target: `${import.meta.env.VITE_PACKAGE_ID}::rwa_vault::mint_tokens_entry`,
                typeArguments: ['0x2::sui::SUI', results.tokenType],
                arguments: [
                    tx.object(results.vaultId),
                    tx.pure.u64(amount),
                ],
            })

            const { bytes, signature } = await signTransaction({ transaction: tx })
            const txResult = await suiClient.executeTransactionBlock({
                transactionBlock: bytes,
                signature,
                options: { showObjectChanges: true },
            })

            console.log('Mint result:', txResult)

            setMintResult({
                amount: formData.totalFragments,  // Store the user-friendly amount
                digest: txResult.digest,
            })
        } catch (err) {
            console.error('Mint error:', err)
            setError(err.message)
        } finally {
            setIsProcessing(false)
        }
    }

    const resetWizard = () => {
        setCurrentStep(1)
        setError(null)
        setFormData({
            propertyName: '',
            description: '',
            imageUrl: 'https://example.com/property.jpg',
            propertyValue: 1000000,
            location: '',
            tokenSymbol: '',
            totalFragments: 1,
            initialPrice: 5.0,
            floorPrice: null,  // ✅ 不提供默認值
            usdcCollateral: 1.0,
        })
        setResults({
            nftId: null,
            packageId: null,
            treasuryCapId: null,
            tokenType: null,
            vaultId: null,
            digest: null,
        })
        resetDeployment()
    }

    const isLoading = isProcessing || isGenerating || isDeploying

    // 如果顯示 DeepBook，渲染 DeepBookWizard
    if (showDeepBook) {
        return (
            <DeepBookWizard
                tokenType={results.tokenType}
                packageId={results.packageId}
                vaultId={results.vaultId}
                totalTokenSupply={formData.totalFragments}
                onBack={() => setShowDeepBook(false)}
            />
        )
    }

    return (
        <div style={{ padding: '20px', maxWidth: '700px', margin: '0 auto' }}>
            <h2>🏦 Token Vault Wizard</h2>
            <p style={{ color: '#666', marginBottom: '20px' }}>
                創建物業 Token 並自動鎖入 Vault，確保 TreasuryCap 安全
            </p>

            {/* Progress Steps */}
            <div style={{ display: 'flex', marginBottom: '30px', gap: '5px' }}>
                {STEPS.map((step) => (
                    <div
                        key={step.id}
                        style={{
                            flex: 1,
                            padding: '10px',
                            background: currentStep === step.id ? '#0066ff' : currentStep > step.id ? '#28a745' : '#e9ecef',
                            color: currentStep >= step.id ? 'white' : '#666',
                            borderRadius: '4px',
                            textAlign: 'center',
                            fontSize: '12px',
                        }}
                    >
                        <div style={{ fontWeight: 'bold' }}>{step.id}. {step.title}</div>
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

            {/* Step 1: Form */}
            {currentStep === 1 && (
                <div>
                    <h3>📝 輸入物業資料</h3>
                    <div style={{ display: 'grid', gap: '15px' }}>
                        <div>
                            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>物業名稱 *</label>
                            <input
                                type="text"
                                value={formData.propertyName}
                                onChange={(e) => handleInputChange('propertyName', e.target.value)}
                                placeholder="例：台北信義區豪宅 A1"
                                style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ddd' }}
                                required
                            />
                        </div>
                        <div>
                            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Token 符號（選填）</label>
                            <input
                                type="text"
                                value={formData.tokenSymbol}
                                onChange={(e) => handleInputChange('tokenSymbol', e.target.value.toUpperCase())}
                                placeholder="例：ROOF、HOUSE（最多 10 字元）"
                                maxLength="10"
                                style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ddd' }}
                            />
                            <small style={{ color: '#666', fontSize: '12px' }}>
                                代幣的短名稱，用於模組命名。留空將從物業名稱自動生成。
                            </small>
                        </div>
                        <div>
                            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>描述</label>
                            <textarea
                                value={formData.description}
                                onChange={(e) => handleInputChange('description', e.target.value)}
                                placeholder="物業詳細描述..."
                                style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ddd', minHeight: '80px' }}
                            />
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                            <div>
                                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>物業價值 (USD)</label>
                                <input
                                    type="number"
                                    value={formData.propertyValue}
                                    onChange={(e) => handleInputChange('propertyValue', Number(e.target.value))}
                                    style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ddd' }}
                                />
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>地點</label>
                                <input
                                    type="text"
                                    value={formData.location}
                                    onChange={(e) => handleInputChange('location', e.target.value)}
                                    placeholder="例：台北市信義區"
                                    style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ddd' }}
                                />
                            </div>
                        </div>

                        {/* DeepBook Integration Section */}
                        <div style={{ marginTop: '20px', padding: '15px', background: '#fff', border: '2px solid #0066ff', borderRadius: '8px' }}>
                            <h4 style={{ marginTop: 0, color: '#0066ff' }}>🏦 DeepBook 交易設定</h4>
                            <div style={{ display: 'grid', gap: '15px' }}>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', color: '#333' }}>Token 總供應量</label>
                                    <input
                                        type="number"
                                        value={formData.totalFragments}
                                        onChange={(e) => handleInputChange('totalFragments', Number(e.target.value))}
                                        style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ddd' }}
                                    />
                                    <small style={{ color: '#555' }}>輸入整數，例：1 = 1 個 token</small>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                                    <div>
                                        <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', color: '#333' }}>起始價格（USDC/token）</label>
                                        <input
                                            type="number"
                                            step="0.01"
                                            value={formData.initialPrice}
                                            onChange={(e) => handleInputChange('initialPrice', Number(e.target.value))}
                                            style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ddd' }}
                                        />
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', color: '#d9534f' }}>
                                            最低回購價（USDC/token）<span style={{ color: 'red' }}> *必填</span>
                                        </label>
                                        <input
                                            type="number"
                                            step="0.01"
                                            min="0.001"
                                            value={formData.floorPrice || ''}
                                            onChange={(e) => handleInputChange('floorPrice', Number(e.target.value))}
                                            placeholder="請輸入最低回購價"
                                            required
                                            style={{ 
                                                width: '100%', 
                                                padding: '10px', 
                                                borderRadius: '6px', 
                                                border: !formData.floorPrice || formData.floorPrice <= 0 ? '2px solid #d9534f' : '1px solid #28a745',
                                                backgroundColor: !formData.floorPrice || formData.floorPrice <= 0 ? '#fff3cd' : 'white'
                                            }}
                                        />
                                        {(!formData.floorPrice || formData.floorPrice <= 0) && (
                                            <small style={{ color: '#d9534f', fontWeight: 'bold' }}>
                                                ⚠️ 必須設定
                                            </small>
                                        )}
                                    </div>
                                </div>

                                <div>
                                    <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', color: '#333' }}>USDC 質押數量</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        value={formData.usdcCollateral}
                                        onChange={(e) => handleInputChange('usdcCollateral', Number(e.target.value))}
                                        style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ddd' }}
                                    />
                                    <small style={{ color: '#555', fontWeight: '600' }}>
                                        最低需要：{formData.floorPrice ? (formData.totalFragments * formData.floorPrice).toFixed(2) : '請先設定 Floor Price'} USDC
                                    </small>
                                </div>

                                {formData.floorPrice && formData.usdcCollateral < (formData.totalFragments * formData.floorPrice) && (
                                    <div style={{ padding: '10px', background: '#fff3cd', borderRadius: '6px', color: '#856404', border: '1px solid #ffc107' }}>
                                        ⚠️ 質押不足！無法在最低價格回購所有 token
                                    </div>
                                )}
                                
                                {!formData.floorPrice && (
                                    <div style={{ padding: '10px', background: '#f8d7da', borderRadius: '6px', color: '#721c24', border: '1px solid #f5c6cb' }}>
                                        ❌ 請先設定最低回購價
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                    <button
                        onClick={() => setCurrentStep(2)}
                        disabled={!formData.propertyName || !currentAccount}
                        style={{
                            marginTop: '20px',
                            width: '100%',
                            padding: '15px',
                            background: formData.propertyName && currentAccount ? '#0066ff' : '#ccc',
                            color: 'white',
                            border: 'none',
                            borderRadius: '8px',
                            fontSize: '16px',
                            fontWeight: 'bold',
                            cursor: formData.propertyName && currentAccount ? 'pointer' : 'not-allowed',
                        }}
                    >
                        下一步 →
                    </button>
                </div>
            )}

            {/* Step 2: Create NFT */}
            {currentStep === 2 && (
                <div style={{ textAlign: 'center', padding: '30px' }}>
                    <h3>🏠 創建物業 NFT</h3>
                    <p style={{ color: '#666' }}>將您的物業資料鑄造成 PropertyNFT</p>
                    <div style={{ margin: '20px 0', padding: '15px', background: '#f8f9fa', borderRadius: '8px', textAlign: 'left' }}>
                        <div><strong>名稱：</strong>{formData.propertyName}</div>
                        <div><strong>價值：</strong>${formData.propertyValue.toLocaleString()}</div>
                        <div><strong>地點：</strong>{formData.location || 'N/A'}</div>
                    </div>
                    <button
                        onClick={handleCreateNFT}
                        disabled={isLoading}
                        style={{
                            padding: '15px 40px',
                            background: isLoading ? '#ccc' : '#28a745',
                            color: 'white',
                            border: 'none',
                            borderRadius: '8px',
                            fontSize: '16px',
                            fontWeight: 'bold',
                            cursor: isLoading ? 'not-allowed' : 'pointer',
                        }}
                    >
                        {isLoading ? '處理中...' : '🔨 創建 NFT'}
                    </button>
                </div>
            )}

            {/* Step 3: Deploy Token */}
            {currentStep === 3 && (
                <div style={{ textAlign: 'center', padding: '30px' }}>
                    <h3>🪙 部署 Token 合約</h3>
                    <p style={{ color: '#666' }}>為您的物業創建專屬的 Token</p>
                    <div style={{ margin: '20px 0', padding: '15px', background: '#d4edda', borderRadius: '8px' }}>
                        ✅ NFT 已創建：<code>{results.nftId?.slice(0, 20)}...</code>
                    </div>
                    <button
                        onClick={handleDeployToken}
                        disabled={isLoading}
                        style={{
                            padding: '15px 40px',
                            background: isLoading ? '#ccc' : '#0066ff',
                            color: 'white',
                            border: 'none',
                            borderRadius: '8px',
                            fontSize: '16px',
                            fontWeight: 'bold',
                            cursor: isLoading ? 'not-allowed' : 'pointer',
                        }}
                    >
                        {isGenerating && '🔧 生成合約中...'}
                        {isDeploying && '📦 部署中...'}
                        {!isGenerating && !isDeploying && '🚀 部署 Token'}
                    </button>
                </div>
            )}

            {/* Step 4: Create Vault */}
            {currentStep === 4 && (
                <div style={{ textAlign: 'center', padding: '30px' }}>
                    <h3>🏦 創建 Vault 並鎖定 TreasuryCap</h3>
                    <p style={{ color: '#666' }}>將 TreasuryCap 鎖入 Vault，確保只能通過 Vault mint Token</p>
                    <div style={{ margin: '20px 0', padding: '15px', background: '#d4edda', borderRadius: '8px', textAlign: 'left' }}>
                        <div>✅ Token Package：<code>{results.packageId?.slice(0, 20)}...</code></div>
                        <div>✅ TreasuryCap：<code>{results.treasuryCapId?.slice(0, 20)}...</code></div>
                    </div>
                    <div style={{ margin: '10px 0', padding: '15px', background: '#fff3cd', borderRadius: '8px' }}>
                        ⚠️ 這是關鍵步驟！完成後 TreasuryCap 將被永久鎖入 Vault
                    </div>
                    <button
                        onClick={handleCreateVault}
                        disabled={isLoading}
                        style={{
                            padding: '15px 40px',
                            background: isLoading ? '#ccc' : '#dc3545',
                            color: 'white',
                            border: 'none',
                            borderRadius: '8px',
                            fontSize: '16px',
                            fontWeight: 'bold',
                            cursor: isLoading ? 'not-allowed' : 'pointer',
                        }}
                    >
                        {isLoading ? '處理中...' : '🔒 鎖定 TreasuryCap'}
                    </button>
                </div>
            )}

            {/* Step 5: Complete + Mint */}
            {currentStep === 5 && (
                <div>
                    <div style={{ padding: '20px', background: '#d4edda', borderRadius: '8px', marginBottom: '20px' }}>
                        <h3>🎉 Vault 創建完成！</h3>
                        <p>您的物業 Token 已成功創建並安全鎖入 Vault</p>
                        <div style={{ marginTop: '15px', fontFamily: 'monospace', fontSize: '13px' }}>
                            <div style={{ marginBottom: '8px' }}>
                                <strong>Vault ID：</strong>
                                <code style={{ background: '#fff', padding: '2px 6px', borderRadius: '4px', marginLeft: '8px' }}>
                                    {results.vaultId?.slice(0, 30)}...
                                </code>
                            </div>
                            <div style={{ marginBottom: '8px' }}>
                                <strong>Token Type：</strong>
                                <code style={{ background: '#fff', padding: '2px 6px', borderRadius: '4px', marginLeft: '8px', wordBreak: 'break-all', display: 'inline-block', maxWidth: '400px' }}>
                                    {results.tokenType}
                                </code>
                            </div>
                            <div>
                                <a
                                    href={`https://testnet.suivision.xyz/object/${results.vaultId}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{ color: '#0066ff' }}
                                >
                                    🔗 查看 Vault 詳情 →
                                </a>
                            </div>
                        </div>
                    </div>

                    {/* Mint Section */}
                    <div style={{ padding: '20px', background: '#f8f9fa', borderRadius: '8px', marginBottom: '20px' }}>
                        <h3>🪙 Mint 碎片化代幣</h3>
                        <p style={{ color: '#666', fontSize: '14px' }}>
                            一鍵 Mint 全部 {formData.totalFragments.toLocaleString()} 個代幣到您的錢包
                        </p>

                        <div style={{ marginTop: '15px', padding: '15px', background: '#e9ecef', borderRadius: '8px' }}>
                            <div><strong>將 Mint 數量：</strong> {formData.totalFragments.toLocaleString()} 代幣</div>
                            <div style={{ color: '#666', fontSize: '13px' }}>= {(formData.totalFragments * 1_000_000).toLocaleString()} 鏈上單位（6 位小數）</div>
                        </div>

                        <button
                            onClick={handleMintTokens}
                            disabled={isLoading}
                            style={{
                                marginTop: '15px',
                                width: '100%',
                                padding: '15px',
                                background: isLoading ? '#ccc' : '#28a745',
                                color: 'white',
                                border: 'none',
                                borderRadius: '8px',
                                fontSize: '16px',
                                fontWeight: 'bold',
                                cursor: isLoading ? 'not-allowed' : 'pointer',
                            }}
                        >
                            {isLoading ? '處理中...' : `💰 Mint 全部 ${(formData.totalFragments / 1000000).toLocaleString()} 代幣`}
                        </button>

                        {mintResult && (
                            <div style={{ marginTop: '15px', padding: '15px', background: '#d4edda', borderRadius: '8px' }}>
                                <strong>✅ Mint 成功！</strong>
                                <div style={{ marginTop: '8px', fontSize: '14px' }}>
                                    <div>數量: {Number(mintResult.amount) / 1000000} 代幣</div>
                                    <div>
                                        <a
                                            href={`https://testnet.suivision.xyz/txblock/${mintResult.digest}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            style={{ color: '#0066ff' }}
                                        >
                                            查看交易 →
                                        </a>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                        <button
                            onClick={resetWizard}
                            style={{
                                padding: '10px 20px',
                                background: 'white',
                                border: '1px solid #666',
                                borderRadius: '6px',
                                cursor: 'pointer',
                            }}
                        >
                            🔄 創建新的 Vault
                        </button>

                        <button
                            onClick={() => setShowDeepBook(true)}
                            style={{
                                padding: '10px 20px',
                                background: '#0066ff',
                                color: 'white',
                                border: 'none',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                fontWeight: 'bold',
                            }}
                        >
                            🏦 繼續到 DeepBook →
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}
