import { useState } from 'react'
import { useCurrentAccount, useSignAndExecuteTransaction, useSignTransaction, useSuiClient } from '@mysten/dapp-kit'
import { Transaction } from '@mysten/sui/transactions'
import { DeepBookClient } from '@mysten/deepbook-v3'
import { useContractDeployment } from '../hooks/useContractDeployment'
import { checkDeepBalance, extractObjectId, BUILT_IN_COINS, createCustomCoinConfig } from '../utils/deepbookHelpers'
import { buildMintNFTTransaction } from '../utils/contractInteraction'

// DeepBook Package ID (Testnet)
const DEEPBOOK_PACKAGE_ID = 'fb28c4cbc6865bd1c897d26aecbe1f8792d1509a20ffec692c800660cbec6982'

// Reserve Coin Type for RwaVault (儲備金類型)
const RESERVE_COIN_TYPE = '0xf7152c05930480cd740d7311b5b8b45c6f488e3a53a11c3f74a6fac36a52e0d7::DBUSDC::DBUSDC'

// 從 tokenType 提取 coin key
function extractCoinKey(tokenType) {
    if (!tokenType) return 'CUSTOM_TOKEN'
    const parts = tokenType.split('::')
    return parts.length >= 3 ? parts[2] : 'CUSTOM_TOKEN'
}

/**
 * AnchorStone - 让资产拥抱未来
 * 
 * "简单，才是终极的复杂" - 乔布斯
 */
export default function AnchorStoneForm() {
    const currentAccount = useCurrentAccount()
    const suiClient = useSuiClient()
    const { mutateAsync: signAndExecuteTransaction } = useSignAndExecuteTransaction()
    const { mutateAsync: signTransaction } = useSignTransaction()
    const { deployContract, isGenerating, isDeploying } = useContractDeployment()

    const [currentStep, setCurrentStep] = useState(0) // 0: hero, 1: form, 2: processing, 3: success
    const [isProcessing, setIsProcessing] = useState(false)
    const [error, setError] = useState(null)
    const [progress, setProgress] = useState('')
    
    // DeepBook 相關狀態
    const [balanceManagerId, setBalanceManagerId] = useState(null)  // 前端用戶掛單用
    const [balanceManagerJobId, setBalanceManagerJobId] = useState(null)  // 後端 job 自動回購用
    const [poolId, setPoolId] = useState(null)

    const [formData, setFormData] = useState({
        propertyName: '',
        description: '',
        location: 'default',
        propertyValue: 0.1,
        imageUrl: 'https://example.com/property.jpg',
        tokenSymbol: '',
        totalSupply: 100,
        initialPrice: 0.001,
        floorPrice: 0.001,
        usdcCollateral: 0.1,
        // DeepBook 配置
        tickSize: 0.001,
        lotSize: 1,
        minSize: 1,
    })

    const [results, setResults] = useState({
        nftId: null,
        packageId: null,
        tokenType: null,
        vaultId: null,
        mintDigest: null,
        poolId: null,
        balanceManagerId: null,  // 前端用戶掛單用
        balanceManagerJobId: null,  // 後端 job 自動回購用
    })

    const handleInputChange = (field, value) => {
        setFormData(prev => ({ ...prev, [field]: value }))
    }

    // 創建 DeepBook Client
    const createDbClient = (tokenType, packageId, balanceManagerAddress = null, customPoolId = null) => {
        if (!currentAccount) return null

        // 驗證 tokenType 格式
        if (!tokenType || typeof tokenType !== 'string') {
            console.error('❌ Invalid tokenType:', tokenType)
            return null
        }

        const coinKey = extractCoinKey(tokenType)
        console.log('🔧 createDbClient - coinKey:', coinKey, 'tokenType:', tokenType)
        
        const poolKey = `${coinKey}_DBUSDC`

        // 自定義代幣配置
        const customCoinConfig = createCustomCoinConfig(packageId, tokenType, 6)
        console.log('🔧 createDbClient - customCoinConfig:', customCoinConfig)
        
        const customCoins = tokenType ? {
            [coinKey]: customCoinConfig
        } : {}

        const coins = {
            ...BUILT_IN_COINS,
            ...customCoins,
        }

        // 自定義池子配置 (如果已創建)
        const pools = customPoolId ? {
            [poolKey]: {
                address: customPoolId,
                baseCoin: coinKey,
                quoteCoin: 'DBUSDC',
            }
        } : undefined

        // 使用正確的 DeepBookClient 初始化參數
        // address: 用戶錢包地址 (字符串)
        // env: 網路環境
        // client: SuiClient instance
        const dbClientConfig = {
            address: currentAccount.address,  // 使用地址字符串，不是整個 account 物件
            env: 'testnet',
            client: suiClient,
            coins,
            pools,
        }

        // 如果有 Balance Manager，加入配置
        if (balanceManagerAddress) {
            dbClientConfig.balanceManagers = {
                MANAGER_1: {
                    address: balanceManagerAddress,
                    tradeCap: undefined,
                }
            }
        }

        console.log('🔧 DeepBookClient config:', dbClientConfig)

        return new DeepBookClient(dbClientConfig)
    }

    const handleTokenize = async () => {
        setIsProcessing(true)
        setCurrentStep(2)
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

            // Step 2: Deploy Token
            setProgress('正在部署代幣合約...')
            const deployResult = await deployContract(
                {
                    propertyId: nftId,
                    name: formData.propertyName,
                    description: formData.description,
                    symbol: formData.tokenSymbol || 'TOKEN',
                },
                currentAccount.address,
                signTransaction
            )

            // Step 3: Create Vault
            setProgress('正在建立智能金庫...')
            const vaultTx = new Transaction()
            const totalTokenSupply = formData.totalSupply * 1_000_000
            const usdcCollateralAmount = Math.floor(formData.usdcCollateral * 1_000_000)
            const initialPriceAmount = Math.floor(formData.initialPrice * 1_000_000)
            const floorPriceAmount = Math.floor(formData.floorPrice * 1_000_000)

            const requiredCollateral = (totalTokenSupply * floorPriceAmount) / 1_000_000
            if (usdcCollateralAmount < requiredCollateral) {
                throw new Error(`質押不足！至少需要 ${(requiredCollateral / 1_000_000).toFixed(2)} USDC`)
            }

            // 獲取用戶的 USDC coins（使用 DBUSDC 作為儲備金）
            const vaultUsdcCoins = await suiClient.getCoins({
                owner: currentAccount.address,
                coinType: RESERVE_COIN_TYPE,
            })

            if (!vaultUsdcCoins.data || vaultUsdcCoins.data.length === 0) {
                throw new Error('❌ 錢包中沒有 DBUSDC！請先獲取 DBUSDC 用於質押。')
            }

            // 計算總餘額
            const totalUsdcBalance = vaultUsdcCoins.data.reduce((sum, coin) => sum + BigInt(coin.balance), 0n)
            if (totalUsdcBalance < BigInt(usdcCollateralAmount)) {
                throw new Error(`❌ DBUSDC 餘額不足！需要 ${formData.usdcCollateral} DBUSDC，但只有 ${Number(totalUsdcBalance) / 1_000_000} DBUSDC`)
            }

            // 合併 USDC coins (如果有多個)
            const [firstVaultUsdc, ...restVaultUsdc] = vaultUsdcCoins.data
            if (restVaultUsdc.length > 0) {
                vaultTx.mergeCoins(
                    vaultTx.object(firstVaultUsdc.coinObjectId),
                    restVaultUsdc.map(c => vaultTx.object(c.coinObjectId))
                )
            }

            // 分割出需要的 USDC 金額
            const [usdcCoin] = vaultTx.splitCoins(
                vaultTx.object(firstVaultUsdc.coinObjectId),
                [vaultTx.pure.u64(usdcCollateralAmount)]
            )

            vaultTx.moveCall({
                target: `${import.meta.env.VITE_PACKAGE_ID}::rwa_vault::create_vault_entry`,
                typeArguments: [RESERVE_COIN_TYPE, deployResult.tokenType],
                arguments: [
                    vaultTx.object(nftId),
                    vaultTx.object(deployResult.treasuryCapId),
                    usdcCoin,
                    vaultTx.pure.u64(totalTokenSupply),
                    vaultTx.pure.u64(initialPriceAmount),
                    vaultTx.pure.u64(floorPriceAmount),
                ],
            })

            const vaultResult = await signAndExecuteTransaction({
                transaction: vaultTx,
            })

            // 等待交易確認並獲取完整的 objectChanges
            const fullVaultResult = await suiClient.waitForTransaction({
                digest: vaultResult.digest,
                options: { showObjectChanges: true },
            })

            console.log('Vault creation objectChanges:', fullVaultResult.objectChanges)

            const vaultId = fullVaultResult.objectChanges?.find(
                obj => obj.type === 'created' && obj.objectType?.includes('RwaVault')
            )?.objectId

            if (!vaultId) {
                console.error('Available objects:', fullVaultResult.objectChanges)
                throw new Error('金庫創建失敗')
            }

            console.log('✅ Vault created:', vaultId)

            // Step 4: Mint Tokens
            setProgress('正在鑄造代幣...')
            const mintTx = new Transaction()
            mintTx.moveCall({
                target: `${import.meta.env.VITE_PACKAGE_ID}::rwa_vault::mint_tokens_entry`,
                typeArguments: [RESERVE_COIN_TYPE, deployResult.tokenType],
                arguments: [
                    mintTx.object(vaultId),
                    mintTx.pure.u64(totalTokenSupply),
                ],
            })

            const mintResult = await signAndExecuteTransaction({
                transaction: mintTx,
                options: { showEffects: true },
            })

            console.log('✅ Tokens minted:', mintResult.digest)

            // ===== Step 5: 創建兩個 Balance Manager =====
            // 1. 前端用戶掛單用的 Balance Manager
            // 2. 後端 job 自動回購用的 Balance Manager
            setProgress('正在創建 Balance Managers...')
            console.log('Step 5: Creating Balance Managers...')

            const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000'

            // // 5.1: 創建前端用戶掛單用的 Balance Manager (直接調用 Move 函數)
            // console.log('Step 5.1: Creating User Balance Manager for trading...')
            // const userBmTx = new Transaction()

            // // 調用 balance_manager::new 創建 BalanceManager
            // const [userBalanceManager] = userBmTx.moveCall({
            //     target: `0x${DEEPBOOK_PACKAGE_ID}::balance_manager::new`,
            //     arguments: [],
            // })

            // // BalanceManager 必須是 shared object
            // userBmTx.moveCall({
            //     target: '0x2::transfer::public_share_object',
            //     typeArguments: [`0x${DEEPBOOK_PACKAGE_ID}::balance_manager::BalanceManager`],
            //     arguments: [userBalanceManager],
            // })

            // const userBmResult = await signAndExecuteTransaction({
            //     transaction: userBmTx,
            //     options: { showObjectChanges: true },
            // })

            // // 等待交易確認並獲取完整結果
            // const fullUserBmResult = await suiClient.waitForTransaction({
            //     digest: userBmResult.digest,
            //     options: { showObjectChanges: true },
            // })

            // // 提取 Balance Manager ID
            // const managerId = fullUserBmResult.objectChanges?.find(
            //     obj => obj.type === 'created' && obj.objectType?.includes('BalanceManager')
            // )?.objectId

            // if (!managerId) {
            //     throw new Error('Failed to create User Balance Manager')
            // }

            // console.log('✅ User Balance Manager created:', managerId)
            const managerId = "0x664591f46503a52b4acdcff46e777f923d20605771ca716b9244266a8e3d38da"
            setBalanceManagerId(managerId)

            // 5.2: 創建後端 job 自動回購用的 Balance Manager
            // console.log('Step 5.2: Creating Job Balance Manager for auto buyback...')
            // const jobBalanceManagerResponse = await fetch(`${backendUrl}/api/deepbook/create-balance-manager`, {
            //     method: 'POST',
            //     headers: {
            //         'Content-Type': 'application/json',
            //     },
            //     body: JSON.stringify({
            //         userAddress: currentAccount.address,
            //         purpose: 'buyback_job',  // 標記這是給後端 job 用的
            //     }),
            // })

            // if (!jobBalanceManagerResponse.ok) {
            //     const errorData = await jobBalanceManagerResponse.json()
            //     throw new Error(errorData.message || errorData.error || 'Failed to create Job Balance Manager')
            // }

            // const jobBalanceManagerResult = await jobBalanceManagerResponse.json()
            // const jobManagerId = jobBalanceManagerResult.data.balanceManagerId
            // console.log('✅ Job Balance Manager created:', jobManagerId)
            const jobManagerId = "0x2dad7c896a8b875969708eeb77cb0312f6c5cbdaa40c2befb7b7b5500400efdd"
            setBalanceManagerJobId(jobManagerId)  // 後端預先創建好，直接使用固定 ID

            // ===== Step 6: 創建 DeepBook Pool =====
            setProgress('正在創建 DeepBook Pool...')
            console.log('Step 6: Creating DeepBook Pool...')

            // 檢查 DEEP 餘額
            const deepBalance = await checkDeepBalance(suiClient, currentAccount.address)
            if (deepBalance < 500) {
                throw new Error(`DEEP 代幣不足！需要 500 DEEP，目前只有 ${deepBalance.toFixed(2)} DEEP`)
            }

            // 驗證 deployResult 是否完整
            if (!deployResult || !deployResult.tokenType || !deployResult.packageId) {
                console.error('❌ deployResult is incomplete:', deployResult)
                throw new Error('代幣部署結果不完整，請重試')
            }

            console.log('📦 Token Type:', deployResult.tokenType)
            console.log('📦 Package ID:', deployResult.packageId)

            const coinKey = extractCoinKey(deployResult.tokenType)
            console.log('🔑 Coin Key:', coinKey)

            const dbClient = createDbClient(deployResult.tokenType, deployResult.packageId, managerId)
            if (!dbClient) {
                throw new Error('Failed to create DeepBook client')
            }

            const poolTx = new Transaction()

            // 獲取用戶的 DEEP coins
            const deepCoins = await suiClient.getCoins({
                owner: currentAccount.address,
                coinType: BUILT_IN_COINS.DEEP.type,
            })

            if (!deepCoins.data || deepCoins.data.length === 0) {
                throw new Error('沒有找到 DEEP 代幣，請確保錢包有 DEEP')
            }

            // 合併 DEEP coins (如果有多個)
            const [firstDeepCoin, ...restDeepCoins] = deepCoins.data
            if (restDeepCoins.length > 0) {
                poolTx.mergeCoins(
                    poolTx.object(firstDeepCoin.coinObjectId),
                    restDeepCoins.map(c => poolTx.object(c.coinObjectId))
                )
            }

            // 分割出 500 DEEP 作為創建費用
            const POOL_CREATION_FEE = 500_000_000n
            const [deepCoinForPool] = poolTx.splitCoins(
                poolTx.object(firstDeepCoin.coinObjectId),
                [poolTx.pure.u64(POOL_CREATION_FEE)]
            )

            // 調用 SDK 函數創建 Pool
            dbClient.deepBook.createPermissionlessPool({
                baseCoinKey: coinKey,
                quoteCoinKey: 'DBUSDC',
                tickSize: formData.tickSize,
                lotSize: formData.lotSize,
                minSize: formData.minSize,
                deepCoin: deepCoinForPool,
            })(poolTx)

            const poolResult = await signAndExecuteTransaction({
                transaction: poolTx,
            })

            console.log('⏳ Waiting for Pool creation transaction to finalize...')
            
            // 等待交易確認並獲取完整結果
            const fullPoolResult = await suiClient.waitForTransaction({
                digest: poolResult.digest,
                options: { 
                    showObjectChanges: true,
                    showEffects: true,
                },
            })

            console.log('📊 Pool creation objectChanges:', JSON.stringify(fullPoolResult.objectChanges, null, 2))

            const newPoolId = extractObjectId(fullPoolResult, 'Pool')
            if (!newPoolId) {
                console.error('❌ Failed to find Pool ID')
                console.log('Available objectChanges:', fullPoolResult.objectChanges)
                throw new Error('Failed to find Pool ID in transaction result')
            }

            console.log('✅ Pool created:', newPoolId)
            setPoolId(newPoolId)

            // ===== Step 7: 更新 Vault 並存入資金到 Balance Manager =====
            setProgress('正在更新 Vault 並存入資金...')
            console.log('Step 7: Updating Vault and depositing funds to Balance Manager...')

            try {
                const combinedTx = new Transaction()

                // 2. Deposit USDC 到 Balance Manager（用於買單）
                // if (formData.usdcCollateral > 0) {
                //     const usdcCoins = await suiClient.getCoins({
                //         owner: currentAccount.address,
                //         coinType: RESERVE_COIN_TYPE,
                //     })

                //     if (usdcCoins.data && usdcCoins.data.length > 0) {
                //         const depositAmountRaw = BigInt(Math.floor(formData.usdcCollateral * 1_000_000))

                //         // 合併並分割 USDC
                //         const [firstCoin, ...restCoins] = usdcCoins.data
                //         if (restCoins.length > 0) {
                //             combinedTx.mergeCoins(
                //                 combinedTx.object(firstCoin.coinObjectId),
                //                 restCoins.map(coin => combinedTx.object(coin.coinObjectId))
                //             )
                //         }

                //         const [usdcToDeposit] = combinedTx.splitCoins(
                //             combinedTx.object(firstCoin.coinObjectId),
                //             [combinedTx.pure.u64(depositAmountRaw)]
                //         )

                //         combinedTx.moveCall({
                //             target: `0x${DEEPBOOK_PACKAGE_ID}::balance_manager::deposit`,
                //             typeArguments: [RESERVE_COIN_TYPE],
                //             arguments: [
                //                 combinedTx.object(jobManagerId),
                //                 usdcToDeposit,
                //             ],
                //         })
                //     }
                // }

                // 3. Deposit FToken 到 Balance Manager（用於賣單）
                // 查詢用戶錢包中新 mint 的 FToken
                const fTokenCoins = await suiClient.getCoins({
                    owner: currentAccount.address,
                    coinType: deployResult.tokenType,
                })

                if (fTokenCoins.data && fTokenCoins.data.length > 0) {
                    // 計算要存入的 FToken 數量（存入部分供市場交易）
                    const fTokenDepositAmount = BigInt(Math.floor(formData.totalSupply * 0.1 * 1_000_000)) // 存入 10% 供交易
                    const totalFTokenBalance = fTokenCoins.data.reduce((sum, coin) => sum + BigInt(coin.balance), 0n)

                    if (totalFTokenBalance >= fTokenDepositAmount) {
                        console.log(`💰 Depositing ${Number(fTokenDepositAmount) / 1_000_000} FTokens to Balance Manager...`)

                        // 合併 FToken coins
                        const [firstFToken, ...restFTokens] = fTokenCoins.data
                        if (restFTokens.length > 0) {
                            combinedTx.mergeCoins(
                                combinedTx.object(firstFToken.coinObjectId),
                                restFTokens.map(coin => combinedTx.object(coin.coinObjectId))
                            )
                        }

                        const [fTokenToDeposit] = combinedTx.splitCoins(
                            combinedTx.object(firstFToken.coinObjectId),
                            [combinedTx.pure.u64(fTokenDepositAmount)]
                        )

                        combinedTx.moveCall({
                            target: `0x${DEEPBOOK_PACKAGE_ID}::balance_manager::deposit`,
                            typeArguments: [deployResult.tokenType],
                            arguments: [
                                combinedTx.object(managerId),
                                fTokenToDeposit,
                            ],
                        })
                    } else {
                        console.warn('⚠️ Not enough FTokens to deposit to Balance Manager')
                    }
                }

                const combinedResult = await signAndExecuteTransaction({ transaction: combinedTx })
                
                console.log('⏳ Waiting for Vault update transaction to finalize...')
                await suiClient.waitForTransaction({
                    digest: combinedResult.digest,
                    options: { showEffects: true },
                })
                
                console.log('✅ Vault updated and funds deposited:', combinedResult.digest)
            } catch (combinedErr) {
                console.warn('⚠️ Failed to update Vault or deposit funds:', combinedErr.message)
                // 繼續執行，因為後端仍然可以追蹤
            }

            // ===== Step 8: 註冊 Pool 到後端監聽器 =====
            // 注意：初始掛單已移至 /anchor-stone/place-order 頁面
            // 讓用戶可以在 Pool 準備好後手動掛單，避免 ENoDataPoints 錯誤
            setProgress('正在註冊 Pool 到後端...')
            console.log('Step 8: Registering Pool to backend...')

            try {
                const registerResponse = await fetch(`${backendUrl}/api/vaults/register-pool`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        vaultId,
                        poolId: newPoolId,
                        balanceManagerId: managerId,  // 前端用戶的 Balance Manager
                        balanceManagerJobId: jobManagerId,  // 後端 job 回購用的 Balance Manager
                        coinType: deployResult.tokenType,
                        floorPrice: formData.floorPrice,
                        owner: currentAccount.address,
                    }),
                })

                if (!registerResponse.ok) {
                    const errorData = await registerResponse.json()
                    throw new Error(`後端註冊失敗: ${errorData.error || errorData.message}`)
                }

                console.log('✅ Pool registered with backend')
            } catch (regErr) {
                console.error('❌ Failed to register pool with backend:', regErr)
                throw new Error(`無法註冊 Pool 到後端: ${regErr.message}`)
            }

            setResults({
                nftId,
                packageId: deployResult.packageId,
                tokenType: deployResult.tokenType,
                vaultId,
                mintDigest: mintResult.digest,
                poolId: newPoolId,
                balanceManagerId: managerId,  // 前端用戶掛單用
                balanceManagerJobId: jobManagerId,  // 後端 job 自動回購用
            })

            setCurrentStep(3)

        } catch (err) {
            console.error('Tokenization error:', err)
            setError(err.message)
            setCurrentStep(1)
        } finally {
            setIsProcessing(false)
        }
    }

    const isLoading = isProcessing || isGenerating || isDeploying

    // Hero Screen
    if (currentStep === 0) {
        return (
            <div style={{
                minHeight: 'calc(100vh - 160px)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center',
                padding: '40px 20px',
                background: 'linear-gradient(135deg, #0a1929 0%, #112240 100%)',
            }}>
                <div style={{
                    maxWidth: '800px',
                    textAlign: 'center',
                    color: 'white',
                }}>
                    <h1 style={{
                        fontSize: '56px',
                        fontWeight: '700',
                        marginBottom: '24px',
                        lineHeight: '1.2',
                        letterSpacing: '-0.02em',
                    }}>
                        讓資產
                        <br />
                        擁抱未來
                    </h1>
                    <p style={{
                        fontSize: '24px',
                        fontWeight: '300',
                        marginBottom: '48px',
                        opacity: 0.95,
                        lineHeight: '1.5',
                    }}>
                        將實體資產轉換為數位代幣
                        <br />
                        簡單、快速、安全
                    </p>
                    <button
                        onClick={() => setCurrentStep(1)}
                        disabled={!currentAccount}
                        style={{
                            padding: '18px 48px',
                            fontSize: '20px',
                            fontWeight: '600',
                            background: currentAccount 
                                ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
                                : 'rgba(255,255,255,0.1)',
                            color: 'white',
                            border: 'none',
                            borderRadius: '50px',
                            cursor: currentAccount ? 'pointer' : 'not-allowed',
                            transition: 'all 0.3s ease',
                            boxShadow: currentAccount ? '0 8px 24px rgba(102, 126, 234, 0.3)' : 'none',
                        }}
                        onMouseEnter={(e) => {
                            if (currentAccount) {
                                e.target.style.transform = 'translateY(-2px)'
                                e.target.style.boxShadow = '0 12px 32px rgba(102, 126, 234, 0.5)'
                            }
                        }}
                        onMouseLeave={(e) => {
                            e.target.style.transform = 'translateY(0)'
                            e.target.style.boxShadow = '0 8px 24px rgba(102, 126, 234, 0.3)'
                        }}
                    >
                        {currentAccount ? '開始代幣化' : '請先連接錢包'}
                    </button>
                </div>
            </div>
        )
    }

    // Form Screen
    if (currentStep === 1) {
        return (
            <div style={{
                maxWidth: '640px',
                margin: '0 auto',
                padding: '60px 20px',
                minHeight: 'calc(100vh - 160px)',
            }}>
                <button
                    onClick={() => setCurrentStep(0)}
                    style={{
                        marginBottom: '40px',
                        padding: '8px 16px',
                        background: 'transparent',
                        border: 'none',
                        color: 'rgba(255, 255, 255, 0.6)',
                        fontSize: '16px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        transition: 'all 0.2s',
                    }}
                    onMouseEnter={(e) => {
                        e.target.style.color = '#ffffff'
                    }}
                    onMouseLeave={(e) => {
                        e.target.style.color = 'rgba(255, 255, 255, 0.6)'
                    }}
                >
                    ← 返回
                </button>

                <h2 style={{
                    fontSize: '36px',
                    fontWeight: '700',
                    marginBottom: '48px',
                    color: '#ffffff',
                }}>
                    描述您的資產
                </h2>

                {error && (
                    <div style={{
                        padding: '16px 20px',
                        background: 'rgba(255, 59, 48, 0.1)',
                        border: '1px solid rgba(255, 59, 48, 0.3)',
                        borderRadius: '12px',
                        marginBottom: '32px',
                        color: '#ff3b30',
                    }}>
                        {error}
                    </div>
                )}

                {/* 基本資訊 */}
                <div style={{ marginBottom: '48px' }}>
                    <label style={{
                        display: 'block',
                        fontSize: '14px',
                        fontWeight: '600',
                        color: 'rgba(255, 255, 255, 0.6)',
                        marginBottom: '8px',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                    }}>
                        資產名稱
                    </label>
                    <input
                        type="text"
                        value={formData.propertyName}
                        onChange={(e) => handleInputChange('propertyName', e.target.value)}
                        placeholder="例如：台北信義區豪宅 A1"
                        style={{
                            width: '100%',
                            padding: '16px 20px',
                            fontSize: '18px',
                            border: '1px solid rgba(255, 255, 255, 0.15)',
                            borderRadius: '12px',
                            outline: 'none',
                            transition: 'all 0.2s',
                            background: 'rgba(255, 255, 255, 0.05)',
                            color: '#ffffff',
                        }}
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

                <div style={{ marginBottom: '48px' }}>
                    <label style={{
                        display: 'block',
                        fontSize: '14px',
                        fontWeight: '600',
                        color: 'rgba(255, 255, 255, 0.6)',
                        marginBottom: '8px',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                    }}>
                        資產描述
                    </label>
                    <textarea
                        value={formData.description}
                        onChange={(e) => handleInputChange('description', e.target.value)}
                        placeholder="簡短描述這個資產..."
                        style={{
                            width: '100%',
                            padding: '16px 20px',
                            fontSize: '16px',
                            border: '1px solid rgba(255, 255, 255, 0.15)',
                            borderRadius: '12px',
                            outline: 'none',
                            minHeight: '120px',
                            fontFamily: 'inherit',
                            resize: 'vertical',
                            background: 'rgba(255, 255, 255, 0.05)',
                            color: '#ffffff',
                        }}
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

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '48px' }}>
                    <div>
                        <label style={{
                            display: 'block',
                            fontSize: '14px',
                            fontWeight: '600',
                            color: 'rgba(255, 255, 255, 0.6)',
                            marginBottom: '8px',
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em',
                        }}>
                            資產價值（USD）
                        </label>
                        <input
                            type="number"
                            value={formData.propertyValue}
                            onChange={(e) => handleInputChange('propertyValue', Number(e.target.value))}
                            style={{
                                width: '100%',
                                padding: '16px 20px',
                                fontSize: '16px',
                                border: '1px solid rgba(255, 255, 255, 0.15)',
                                borderRadius: '12px',
                                outline: 'none',
                                background: 'rgba(255, 255, 255, 0.05)',
                                color: '#ffffff',
                            }}
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

                {/* 代幣設定 */}
                    <div style={{
                        height: '1px',
                        background: 'rgba(255, 255, 255, 0.1)',
                        margin: '48px 0',
                    }} />

                <h3 style={{
                    fontSize: '24px',
                    fontWeight: '600',
                    marginBottom: '32px',
                    color: '#ffffff',
                }}>
                    代幣設定
                </h3>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '48px' }}>
                    <div>
                        <label style={{
                            display: 'block',
                            fontSize: '14px',
                            fontWeight: '600',
                            color: 'rgba(255, 255, 255, 0.6)',
                            marginBottom: '8px',
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em',
                        }}>
                            代幣符號
                        </label>
                        <input
                            type="text"
                            value={formData.tokenSymbol}
                            onChange={(e) => handleInputChange('tokenSymbol', e.target.value.toUpperCase())}
                            placeholder="自動生成"
                            maxLength="10"
                            style={{
                                width: '100%',
                                padding: '16px 20px',
                                fontSize: '16px',
                                border: '1px solid rgba(255, 255, 255, 0.15)',
                                borderRadius: '12px',
                                outline: 'none',
                                background: 'rgba(255, 255, 255, 0.05)',
                                color: '#ffffff',
                            }}
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
                        <label style={{
                            display: 'block',
                            fontSize: '14px',
                            fontWeight: '600',
                            color: 'rgba(255, 255, 255, 0.6)',
                            marginBottom: '8px',
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em',
                        }}>
                            發行數量
                        </label>
                        <input
                            type="number"
                            value={formData.totalSupply}
                            onChange={(e) => handleInputChange('totalSupply', Number(e.target.value))}
                            style={{
                                width: '100%',
                                padding: '16px 20px',
                                fontSize: '16px',
                                border: '1px solid rgba(255, 255, 255, 0.15)',
                                borderRadius: '12px',
                                outline: 'none',
                                background: 'rgba(255, 255, 255, 0.05)',
                                color: '#ffffff',
                            }}
                            onFocus={(e) => {
                                e.target.style.borderColor = '#667eea'
                                e.target.style.background = 'rgba(255, 255, 255, 0.08)'
                            }}
                            onBlur={(e) => {
                                e.target.style.borderColor = 'rgba(255, 255, 255, 0.15)'
                                e.target.style.background = 'rgba(255, 255, 255, 0.05)'
                            }}
                        />
                        <div style={{
                            marginTop: '4px',
                            fontSize: '12px',
                            color: 'rgba(255, 255, 255, 0.4)',
                        }}>
                            Token 總數量（整數）
                        </div>
                    </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '32px' }}>
                    <div>
                        <label style={{
                            display: 'block',
                            fontSize: '14px',
                            fontWeight: '600',
                            color: 'rgba(255, 255, 255, 0.6)',
                            marginBottom: '8px',
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em',
                        }}>
                            起始價格（USDC）
                        </label>
                        <input
                            type="number"
                            step="0.001"
                            min="0.001"
                            value={formData.initialPrice}
                            onChange={(e) => handleInputChange('initialPrice', Number(e.target.value))}
                            style={{
                                width: '100%',
                                padding: '16px 20px',
                                fontSize: '16px',
                                border: '1px solid rgba(255, 255, 255, 0.15)',
                                borderRadius: '12px',
                                outline: 'none',
                                background: 'rgba(255, 255, 255, 0.05)',
                                color: '#ffffff',
                            }}
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
                        <label style={{
                            display: 'block',
                            fontSize: '14px',
                            fontWeight: '600',
                            color: 'rgba(255, 255, 255, 0.6)',
                            marginBottom: '8px',
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em',
                        }}>
                            地板價（USDC）
                        </label>
                        <input
                            type="number"
                            step="0.001"
                            min="0.001"
                            value={formData.floorPrice}
                            onChange={(e) => handleInputChange('floorPrice', Number(e.target.value))}
                            style={{
                                width: '100%',
                                padding: '16px 20px',
                                fontSize: '16px',
                                border: formData.floorPrice <= 0 ? '1px solid #ff3b30' : '1px solid rgba(255, 255, 255, 0.15)',
                                borderRadius: '12px',
                                outline: 'none',
                                background: 'rgba(255, 255, 255, 0.05)',
                                color: '#ffffff',
                            }}
                            onFocus={(e) => {
                                e.target.style.borderColor = '#667eea'
                                e.target.style.background = 'rgba(255, 255, 255, 0.08)'
                            }}
                            onBlur={(e) => {
                                e.target.style.borderColor = formData.floorPrice <= 0 ? '#ff3b30' : 'rgba(255, 255, 255, 0.15)'
                                e.target.style.background = 'rgba(255, 255, 255, 0.05)'
                            }}
                        />
                    </div>
                </div>

                <div style={{ marginBottom: '48px' }}>
                    <label style={{
                        display: 'block',
                        fontSize: '14px',
                        fontWeight: '600',
                        color: 'rgba(255, 255, 255, 0.6)',
                        marginBottom: '8px',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                    }}>
                        質押金額（USDC）
                    </label>
                    <input
                        type="number"
                        step="0.001"
                        min="0.001"
                        value={formData.usdcCollateral}
                        onChange={(e) => handleInputChange('usdcCollateral', Number(e.target.value))}
                            style={{
                                width: '100%',
                                padding: '16px 20px',
                                fontSize: '16px',
                                border: '1px solid rgba(255, 255, 255, 0.15)',
                                borderRadius: '12px',
                                outline: 'none',
                                background: 'rgba(255, 255, 255, 0.05)',
                                color: '#ffffff',
                            }}
                            onFocus={(e) => {
                                e.target.style.borderColor = '#667eea'
                                e.target.style.background = 'rgba(255, 255, 255, 0.08)'
                            }}
                            onBlur={(e) => {
                                e.target.style.borderColor = 'rgba(255, 255, 255, 0.15)'
                                e.target.style.background = 'rgba(255, 255, 255, 0.05)'
                            }}
                    />
                    <div style={{
                        marginTop: '8px',
                        fontSize: '13px',
                        color: 'rgba(255, 255, 255, 0.4)',
                    }}>
                        最低需要：{(formData.totalSupply * formData.floorPrice).toFixed(4)} USDC
                    </div>
                </div>

                {/* DeepBook 配置 */}
                <div style={{
                    height: '1px',
                    background: 'rgba(255, 255, 255, 0.1)',
                    margin: '48px 0',
                }} />

                <h3 style={{
                    fontSize: '24px',
                    fontWeight: '600',
                    marginBottom: '32px',
                    color: '#ffffff',
                }}>
                    DeepBook 配置
                </h3>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '24px', marginBottom: '48px' }}>
                    <div>
                        <label style={{
                            display: 'block',
                            fontSize: '14px',
                            fontWeight: '600',
                            color: 'rgba(255, 255, 255, 0.6)',
                            marginBottom: '8px',
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em',
                        }}>
                            Tick Size
                        </label>
                        <input
                            type="number"
                            step="0.001"
                            min="0.001"
                            value={formData.tickSize}
                            onChange={(e) => handleInputChange('tickSize', Number(e.target.value))}
                            style={{
                                width: '100%',
                                padding: '16px 20px',
                                fontSize: '16px',
                                border: '1px solid rgba(255, 255, 255, 0.15)',
                                borderRadius: '12px',
                                outline: 'none',
                                background: 'rgba(255, 255, 255, 0.05)',
                                color: '#ffffff',
                            }}
                            onFocus={(e) => {
                                e.target.style.borderColor = '#667eea'
                                e.target.style.background = 'rgba(255, 255, 255, 0.08)'
                            }}
                            onBlur={(e) => {
                                e.target.style.borderColor = 'rgba(255, 255, 255, 0.15)'
                                e.target.style.background = 'rgba(255, 255, 255, 0.05)'
                            }}
                        />
                        <div style={{
                            marginTop: '4px',
                            fontSize: '12px',
                            color: 'rgba(255, 255, 255, 0.4)',
                        }}>
                            價格最小變動單位
                        </div>
                    </div>
                    <div>
                        <label style={{
                            display: 'block',
                            fontSize: '14px',
                            fontWeight: '600',
                            color: 'rgba(255, 255, 255, 0.6)',
                            marginBottom: '8px',
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em',
                        }}>
                            Lot Size
                        </label>
                        <input
                            type="number"
                            step="0.1"
                            min="0.1"
                            value={formData.lotSize}
                            onChange={(e) => handleInputChange('lotSize', Number(e.target.value))}
                            style={{
                                width: '100%',
                                padding: '16px 20px',
                                fontSize: '16px',
                                border: '1px solid rgba(255, 255, 255, 0.15)',
                                borderRadius: '12px',
                                outline: 'none',
                                background: 'rgba(255, 255, 255, 0.05)',
                                color: '#ffffff',
                            }}
                            onFocus={(e) => {
                                e.target.style.borderColor = '#667eea'
                                e.target.style.background = 'rgba(255, 255, 255, 0.08)'
                            }}
                            onBlur={(e) => {
                                e.target.style.borderColor = 'rgba(255, 255, 255, 0.15)'
                                e.target.style.background = 'rgba(255, 255, 255, 0.05)'
                            }}
                        />
                        <div style={{
                            marginTop: '4px',
                            fontSize: '12px',
                            color: 'rgba(255, 255, 255, 0.4)',
                        }}>
                            最小交易量（token）
                        </div>
                    </div>
                    <div>
                        <label style={{
                            display: 'block',
                            fontSize: '14px',
                            fontWeight: '600',
                            color: 'rgba(255, 255, 255, 0.6)',
                            marginBottom: '8px',
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em',
                        }}>
                            Min Size
                        </label>
                        <input
                            type="number"
                            step="1"
                            min="1"
                            value={formData.minSize}
                            onChange={(e) => handleInputChange('minSize', Number(e.target.value))}
                            style={{
                                width: '100%',
                                padding: '16px 20px',
                                fontSize: '16px',
                                border: '1px solid rgba(255, 255, 255, 0.15)',
                                borderRadius: '12px',
                                outline: 'none',
                                background: 'rgba(255, 255, 255, 0.05)',
                                color: '#ffffff',
                            }}
                            onFocus={(e) => {
                                e.target.style.borderColor = '#667eea'
                                e.target.style.background = 'rgba(255, 255, 255, 0.08)'
                            }}
                            onBlur={(e) => {
                                e.target.style.borderColor = 'rgba(255, 255, 255, 0.15)'
                                e.target.style.background = 'rgba(255, 255, 255, 0.05)'
                            }}
                        />
                        <div style={{
                            marginTop: '4px',
                            fontSize: '12px',
                            color: 'rgba(255, 255, 255, 0.4)',
                        }}>
                            最小訂單數量
                        </div>
                    </div>
                </div>

                {/* CTA Button */}
                <button
                    onClick={handleTokenize}
                    disabled={!currentAccount || !formData.propertyName || formData.floorPrice <= 0}
                    style={{
                        width: '100%',
                        padding: '20px',
                        fontSize: '18px',
                        fontWeight: '600',
                        background: currentAccount && formData.propertyName && formData.floorPrice > 0
                            ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
                            : 'rgba(255, 255, 255, 0.1)',
                        color: 'white',
                        border: 'none',
                        borderRadius: '12px',
                        cursor: currentAccount && formData.propertyName && formData.floorPrice > 0 ? 'pointer' : 'not-allowed',
                        transition: 'all 0.3s ease',
                    }}
                    onMouseEnter={(e) => {
                        if (currentAccount && formData.propertyName && formData.floorPrice > 0) {
                            e.target.style.transform = 'translateY(-2px)'
                            e.target.style.boxShadow = '0 8px 24px rgba(102, 126, 234, 0.4)'
                        }
                    }}
                    onMouseLeave={(e) => {
                        e.target.style.transform = 'translateY(0)'
                        e.target.style.boxShadow = 'none'
                    }}
                >
                    開始代幣化
                </button>
            </div>
        )
    }

    // Processing Screen
    if (currentStep === 2) {
        return (
            <div style={{
                minHeight: 'calc(100vh - 160px)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center',
                padding: '40px 20px',
            }}>
                <div style={{
                    maxWidth: '480px',
                    textAlign: 'center',
                }}>
                    <div style={{
                        width: '80px',
                        height: '80px',
                        margin: '0 auto 32px',
                        border: '4px solid rgba(255, 255, 255, 0.1)',
                        borderTopColor: '#667eea',
                        borderRadius: '50%',
                        animation: 'spin 1s linear infinite',
                    }} />
                    <style>{`
                        @keyframes spin {
                            to { transform: rotate(360deg); }
                        }
                    `}</style>
                    <h2 style={{
                        fontSize: '28px',
                        fontWeight: '600',
                        marginBottom: '16px',
                        color: '#ffffff',
                    }}>
                        {progress}
                    </h2>
                    <p style={{
                        fontSize: '16px',
                        color: 'rgba(255, 255, 255, 0.6)',
                        lineHeight: '1.6',
                    }}>
                        請在錢包中確認交易
                        <br />
                        這可能需要幾分鐘時間
                    </p>
                </div>
            </div>
        )
    }

    // Success Screen
    if (currentStep === 3) {
        return (
            <div style={{
                minHeight: 'calc(100vh - 160px)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center',
                padding: '40px 20px',
            }}>
                <div style={{
                    maxWidth: '640px',
                    textAlign: 'center',
                }}>
                    <div style={{
                        fontSize: '72px',
                        marginBottom: '24px',
                    }}>
                        ✓
                    </div>
                    <h2 style={{
                        fontSize: '36px',
                        fontWeight: '700',
                        marginBottom: '16px',
                        color: '#ffffff',
                    }}>
                        代幣化完成
                    </h2>
                    <p style={{
                        fontSize: '18px',
                        color: 'rgba(255, 255, 255, 0.6)',
                        marginBottom: '48px',
                        lineHeight: '1.6',
                    }}>
                        您的資產已成功轉換為數位代幣
                        <br />
                        現在可以在區塊鏈上自由交易
                    </p>

                    <div style={{
                        background: 'rgba(255, 255, 255, 0.05)',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        padding: '32px',
                        borderRadius: '16px',
                        marginBottom: '32px',
                        textAlign: 'left',
                    }}>
                        <div style={{ marginBottom: '16px' }}>
                            <div style={{
                                fontSize: '12px',
                                color: 'rgba(255, 255, 255, 0.4)',
                                marginBottom: '4px',
                                textTransform: 'uppercase',
                                letterSpacing: '0.05em',
                            }}>
                                Vault ID
                            </div>
                            <div style={{
                                fontFamily: 'monospace',
                                fontSize: '14px',
                                color: '#ffffff',
                                wordBreak: 'break-all',
                            }}>
                                {results.vaultId}
                            </div>
                        </div>
                        <div style={{ marginBottom: '16px' }}>
                            <div style={{
                                fontSize: '12px',
                                color: 'rgba(255, 255, 255, 0.4)',
                                marginBottom: '4px',
                                textTransform: 'uppercase',
                                letterSpacing: '0.05em',
                            }}>
                                Token Type
                            </div>
                            <div style={{
                                fontFamily: 'monospace',
                                fontSize: '14px',
                                color: '#ffffff',
                                wordBreak: 'break-all',
                            }}>
                                {results.tokenType}
                            </div>
                        </div>
                        {results.poolId && (
                            <div style={{ marginBottom: '16px' }}>
                                <div style={{
                                    fontSize: '12px',
                                    color: 'rgba(255, 255, 255, 0.4)',
                                    marginBottom: '4px',
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.05em',
                                }}>
                                    Pool ID
                                </div>
                                <div style={{
                                    fontFamily: 'monospace',
                                    fontSize: '14px',
                                    color: '#ffffff',
                                    wordBreak: 'break-all',
                                }}>
                                    {results.poolId}
                                </div>
                            </div>
                        )}
                        {results.balanceManagerId && (
                            <div style={{ marginBottom: '16px' }}>
                                <div style={{
                                    fontSize: '12px',
                                    color: 'rgba(255, 255, 255, 0.4)',
                                    marginBottom: '4px',
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.05em',
                                }}>
                                    Balance Manager ID (用戶掛單)
                                </div>
                                <div style={{
                                    fontFamily: 'monospace',
                                    fontSize: '14px',
                                    color: '#ffffff',
                                    wordBreak: 'break-all',
                                }}>
                                    {results.balanceManagerId}
                                </div>
                            </div>
                        )}
                        {results.balanceManagerJobId && (
                            <div style={{ marginBottom: '16px' }}>
                                <div style={{
                                    fontSize: '12px',
                                    color: 'rgba(255, 255, 255, 0.4)',
                                    marginBottom: '4px',
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.05em',
                                }}>
                                    Balance Manager ID (自動回購)
                                </div>
                                <div style={{
                                    fontFamily: 'monospace',
                                    fontSize: '14px',
                                    color: '#ffffff',
                                    wordBreak: 'break-all',
                                }}>
                                    {results.balanceManagerJobId}
                                </div>
                            </div>
                        )}
                    </div>

                    <a
                        href={`https://testnet.suivision.xyz/object/${results.vaultId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                            display: 'inline-block',
                            padding: '16px 32px',
                            fontSize: '16px',
                            fontWeight: '600',
                            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                            color: 'white',
                            border: 'none',
                            borderRadius: '12px',
                            textDecoration: 'none',
                            marginRight: '16px',
                            transition: 'all 0.2s',
                        }}
                        onMouseEnter={(e) => {
                            e.target.style.transform = 'translateY(-2px)'
                            e.target.style.boxShadow = '0 8px 24px rgba(102, 126, 234, 0.4)'
                        }}
                        onMouseLeave={(e) => {
                            e.target.style.transform = 'translateY(0)'
                            e.target.style.boxShadow = 'none'
                        }}
                    >
                        查看詳情
                    </a>
                    <button
                        onClick={() => {
                            setCurrentStep(0)
                            setResults({
                                nftId: null,
                                packageId: null,
                                tokenType: null,
                                vaultId: null,
                                mintDigest: null,
                                poolId: null,
                                balanceManagerId: null,
                                balanceManagerJobId: null,
                            })
                            setBalanceManagerId(null)
                            setBalanceManagerJobId(null)
                            setPoolId(null)
                            setFormData({
                                propertyName: '',
                                description: '',
                                location: '',
                                propertyValue: 1,
                                imageUrl: 'https://example.com/property.jpg',
                                tokenSymbol: '',
                                totalSupply: 1000,
                                initialPrice: 0.001,
                                floorPrice: 0.001,
                                usdcCollateral: 1,
                                tickSize: 0.001,
                                lotSize: 0.1,
                                minSize: 1,
                            })
                        }}
                        style={{
                            padding: '16px 32px',
                            fontSize: '16px',
                            fontWeight: '600',
                            background: 'transparent',
                            color: 'rgba(255, 255, 255, 0.6)',
                            border: '1px solid rgba(255, 255, 255, 0.2)',
                            borderRadius: '12px',
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                        }}
                        onMouseEnter={(e) => {
                            e.target.style.color = '#ffffff'
                            e.target.style.borderColor = 'rgba(255, 255, 255, 0.4)'
                        }}
                        onMouseLeave={(e) => {
                            e.target.style.color = 'rgba(255, 255, 255, 0.6)'
                            e.target.style.borderColor = 'rgba(255, 255, 255, 0.2)'
                        }}
                    >
                        代幣化新資產
                    </button>
                </div>
            </div>
        )
    }

    return null
}
