/**
 * DeepBook Helper Functions
 * 
 * 提供 DeepBook 整合所需的工具函數
 */

/**
 * 內建代幣配置 (Testnet)
 */
export const BUILT_IN_COINS = {
    DEEP: {
        address: '0x36dbef866a1d62bf7328989a10fb2f07d769f4ee587c0de4a0a256e57e0a58a8',
        type: '0x36dbef866a1d62bf7328989a10fb2f07d769f4ee587c0de4a0a256e57e0a58a8::deep::DEEP',
        scalar: 1e6,
    },
    SUI: {
        address: '0x0000000000000000000000000000000000000000000000000000000000000002',
        type: '0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI',
        scalar: 1e9,
    },
    DBUSDC: {
        address: '0xf7152c05930480cd740d7311b5b8b45c6f488e3a53a11c3f74a6fac36a52e0d7',
        type: '0xf7152c05930480cd740d7311b5b8b45c6f488e3a53a11c3f74a6fac36a52e0d7::DBUSDC::DBUSDC',
        scalar: 1e6,
    },
}

/**
 * 創建自定義代幣配置
 * 
 * @param {string} packageId - Token package ID
 * @param {string} tokenType - 完整的 token type
 * @param {number} decimals - 小數位數 (預設 6)
 * @returns {object} Coin config
 */
export function createCustomCoinConfig(packageId, tokenType, decimals = 6) {
    // 驗證 tokenType
    if (!tokenType || typeof tokenType !== 'string') {
        console.error('❌ createCustomCoinConfig - Invalid tokenType:', tokenType)
        throw new Error(`Invalid tokenType: ${tokenType}`)
    }

    // 從 tokenType 提取 package address (去掉 ::module::NAME 部分)
    const parts = tokenType.split('::')
    let address = parts[0]

    // 確保地址有 0x 前綴
    if (address && !address.startsWith('0x')) {
        address = '0x' + address
    }

    console.log('📦 createCustomCoinConfig:', {
        tokenType,
        address,
        parts,
        decimals
    })

    return {
        address: address,
        type: tokenType,
        scalar: Math.pow(10, decimals),
    }
}

/**
 * 合併內建和自定義代幣
 * 
 * @param {string} tokenType - 自定義 token type
 * @param {string} packageId - Package ID
 * @returns {object} 完整的 coins 配置
 */
export function createCoinsConfig(tokenType, packageId) {
    const customCoin = tokenType ? {
        FTOKEN: createCustomCoinConfig(packageId, tokenType, 6)
    } : {}

    return {
        ...BUILT_IN_COINS,
        ...customCoin,
    }
}

/**
 * 檢查 DEEP 代幣餘額
 * 
 * @param {SuiClient} suiClient - Sui client
 * @param {string} address - 用戶地址
 * @returns {Promise<number>} DEEP 餘額（以 DEEP 為單位）
 */
export async function checkDeepBalance(suiClient, address) {
    try {
        const coins = await suiClient.getCoins({
            owner: address,
            coinType: BUILT_IN_COINS.DEEP.type,
        })

        const totalBalance = coins.data.reduce((sum, coin) => sum + BigInt(coin.balance), 0n)
        return Number(totalBalance) / BUILT_IN_COINS.DEEP.scalar
    } catch (error) {
        console.error('Error checking DEEP balance:', error)
        return 0
    }
}

/**
 * 檢查 DBUSDC 代幣餘額
 * 
 * @param {SuiClient} suiClient - Sui client
 * @param {string} address - 用戶地址
 * @returns {Promise<number>} DBUSDC 餘額（以 USDC 為單位）
 */
export async function checkUsdcBalance(suiClient, address) {
    try {
        const coins = await suiClient.getCoins({
            owner: address,
            coinType: BUILT_IN_COINS.DBUSDC.type,
        })

        const totalBalance = coins.data.reduce((sum, coin) => sum + BigInt(coin.balance), 0n)
        return Number(totalBalance) / BUILT_IN_COINS.DBUSDC.scalar
    } catch (error) {
        console.error('Error checking USDC balance:', error)
        return 0
    }
}

/**
 * 格式化交易摘要
 * 
 * @param {object} result - 交易結果
 * @returns {string} 格式化的摘要
 */
export function formatTransactionDigest(result) {
    return `${result.digest.slice(0, 8)}...${result.digest.slice(-6)}`
}

/**
 * 從交易結果中提取對象 ID
 * 
 * @param {object} result - 交易結果
 * @param {string} objectTypePattern - 對象類型模式（用於匹配）
 * @returns {string|null} 對象 ID
 */
export function extractObjectId(result, objectTypePattern) {
    if (!result.objectChanges) return null

    const obj = result.objectChanges.find(
        change => change.type === 'created' && change.objectType?.includes(objectTypePattern)
    )

    return obj?.objectId || null
}

/**
 * 生成唯一的 client order ID
 * 
 * @returns {string} Order ID
 */
export function generateOrderId() {
    // 結合時間戳和隨機數，確保唯一性
    // 避免在同一毫秒內產生重複的 Order ID
    const timestamp = Date.now()
    const random = Math.floor(Math.random() * 1000000)
    return `${timestamp}${random}`
}

/**
 * 計算所需的最低 USDC 質押
 * 
 * @param {number} tokenSupply - Token 總供應量（整數）
 * @param {number} floorPrice - 最低價格（USDC per token）
 * @returns {number} 最低 USDC 需求
 */
export function calculateMinCollateral(tokenSupply, floorPrice) {
    return tokenSupply * floorPrice
}
