import { Transaction } from '@mysten/sui/transactions'

const PACKAGE_ID = import.meta.env.VITE_PACKAGE_ID || '0x0'

/**
 * Build transaction to mint PropertyNFT
 * @param {Object} propertyData - Property information
 * @returns {Transaction} - Transaction block
 */
export function buildMintNFTTransaction(propertyData) {
    const tx = new Transaction()

    const { name, description, imageUrl, propertyValue, location } = propertyData

    // Convert property value to u64 (USDC has 6 decimals)
    const valueInMicroUSDC = Math.floor(propertyValue * 1_000_000)

    tx.moveCall({
        target: `${PACKAGE_ID}::rwa_vault::mint_nft_entry`,
        arguments: [
            tx.pure.string(name),
            tx.pure.string(description),
            tx.pure.vector('u8', Array.from(new TextEncoder().encode(imageUrl))),
            tx.pure.u64(valueInMicroUSDC),
            tx.pure.string(location),
        ],
    })

    return tx
}

/**
 * Build transaction to create RwaVault with dynamic token type
 * @param {Object} params - Vault creation parameters
 * @param {string} params.nftId - PropertyNFT object ID
 * @param {string} params.treasuryCapId - TreasuryCap object ID
 * @param {string} params.reserveCoinId - Reserve coin object ID (SUI or USDC)
 * @param {string} params.reserveCoinType - Type of reserve coin (e.g., '0x2::sui::SUI')
 * @param {string} params.tokenType - Full token type (e.g., 'PACKAGE::module::STRUCT')
 * @param {number} params.totalFragments - Total number of fractional tokens
 * @returns {Transaction} - Transaction block
 */
export function buildCreateVaultTransaction({
    nftId,
    treasuryCapId,
    reserveCoinId,
    reserveCoinType = '0x2::sui::SUI',
    tokenType,
    totalFragments
}) {
    const tx = new Transaction()

    tx.moveCall({
        target: `${PACKAGE_ID}::rwa_vault::create_vault_entry`,
        typeArguments: [reserveCoinType, tokenType],
        arguments: [
            tx.object(nftId),
            tx.object(treasuryCapId),
            tx.object(reserveCoinId),
            tx.pure.u64(totalFragments),
        ],
    })

    return tx
}

/**
 * Build transaction to mint fractional tokens
 * @param {string} vaultId - RwaVault object ID
 * @param {number} amount - Amount of tokens to mint
 * @returns {Transaction} - Transaction block
 */
export function buildMintTokensTransaction(vaultId, amount) {
    const tx = new Transaction()

    const usdcType = '0x2::sui::SUI'
    const roofType = `${PACKAGE_ID}::roof_token::ROOF_TOKEN`

    tx.moveCall({
        target: `${PACKAGE_ID}::rwa_vault::mint_tokens_entry`,
        typeArguments: [usdcType, roofType],
        arguments: [
            tx.object(vaultId),
            tx.pure.u64(amount),
        ],
    })

    return tx
}

/**
 * Parse transaction result to extract created object IDs
 * @param {Object} result - Transaction result
 * @returns {Object} - Parsed object IDs
 */
export function parseTransactionResult(result) {
    const created = result.objectChanges?.filter(change => change.type === 'created') || []

    return {
        nftId: created.find(obj => obj.objectType?.includes('PropertyNFT'))?.objectId,
        vaultId: created.find(obj => obj.objectType?.includes('RwaVault'))?.objectId,
        treasuryCapId: created.find(obj => obj.objectType?.includes('TreasuryCap'))?.objectId,
    }
}

/**
 * Build transaction to publish a Move package
 * @param {string} bytecode - Base64 encoded bytecode
 * @param {string[]} dependencies - Package IDs that this package depends on
 * @param {string} senderAddress - Address to transfer UpgradeCap to
 * @returns {Transaction} - Transaction block
 */
export function buildPublishTransaction(bytecode, dependencies, senderAddress) {
    const tx = new Transaction()

    // Publish the package
    const [upgradeCap] = tx.publish({
        modules: [bytecode],
        dependencies: dependencies,
    })

    // Transfer UpgradeCap to sender
    // This allows the sender to upgrade the package in the future
    tx.transferObjects([upgradeCap], senderAddress)

    return tx
}

/**
 * Parse deployment result to extract package ID and TreasuryCap
 * @param {Object} result - Transaction result from deployment
 * @returns {Object} - Parsed deployment info
 */
export function parseDeploymentResult(result) {
    console.log('📊 Parsing deployment result...')
    console.log('Full result:', JSON.stringify(result, null, 2))

    // Find the published package
    const published = result.objectChanges?.find(change => change.type === 'published')
    const packageId = published?.packageId

    console.log('📦 Package ID:', packageId)

    // Find created objects
    const created = result.objectChanges?.filter(change => change.type === 'created') || []
    console.log(`📋 Created objects (${created.length}):`)
    created.forEach((obj, i) => {
        console.log(`  ${i + 1}. ${obj.objectType}`)
        console.log(`     ID: ${obj.objectId}`)
    })

    // Find TreasuryCap (created during init function)
    // The TreasuryCap type will be like: 0x2::coin::TreasuryCap<PACKAGE_ID::MODULE::STRUCT>
    const treasuryCapObj = created.find(obj => {
        const type = obj.objectType || ''
        return type.includes('TreasuryCap') || type.includes('0x2::coin::TreasuryCap')
    })
    const treasuryCapId = treasuryCapObj?.objectId

    console.log('💰 TreasuryCap:', treasuryCapObj ? {
        id: treasuryCapId,
        type: treasuryCapObj.objectType
    } : 'NOT FOUND')

    // Find UpgradeCap
    const upgradeCapObj = created.find(obj => {
        const type = obj.objectType || ''
        return type.includes('UpgradeCap') || type.includes('0x2::package::UpgradeCap')
    })
    const upgradeCapId = upgradeCapObj?.objectId

    console.log('🔧 UpgradeCap:', upgradeCapObj ? {
        id: upgradeCapId,
        type: upgradeCapObj.objectType
    } : 'NOT FOUND')

    // Find CoinMetadata (also created during init)
    const coinMetadataObj = created.find(obj => {
        const type = obj.objectType || ''
        return type.includes('CoinMetadata') || type.includes('0x2::coin::CoinMetadata')
    })
    const coinMetadataId = coinMetadataObj?.objectId

    console.log('📜 CoinMetadata:', coinMetadataObj ? {
        id: coinMetadataId,
        type: coinMetadataObj.objectType
    } : 'NOT FOUND')

    const parsedResult = {
        packageId,
        treasuryCapId,
        upgradeCapId,
        coinMetadataId,
        digest: result.digest,
        allCreatedObjects: created.map(obj => ({
            id: obj.objectId,
            type: obj.objectType,
            owner: obj.owner
        }))
    }

    console.log('✅ Parsed result:', parsedResult)

    return parsedResult
}
