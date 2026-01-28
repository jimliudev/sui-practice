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
 * Build transaction to create RwaVault
 * @param {string} nftId - PropertyNFT object ID
 * @param {string} treasuryCapId - TreasuryCap object ID for ROOF tokens
 * @param {string} usdcCoinId - USDC coin object ID
 * @param {number} totalFragments - Total number of fractional tokens
 * @returns {Transaction} - Transaction block
 */
export function buildCreateVaultTransaction(nftId, treasuryCapId, usdcCoinId, totalFragments) {
    const tx = new Transaction()

    // Type parameters: <USDC, ROOF_TOKEN>
    const usdcType = '0x2::sui::SUI' // Using SUI as placeholder for testnet
    const roofType = `${PACKAGE_ID}::roof_token::ROOF_TOKEN`

    tx.moveCall({
        target: `${PACKAGE_ID}::rwa_vault::create_vault_entry`,
        typeArguments: [usdcType, roofType],
        arguments: [
            tx.object(nftId),
            tx.object(treasuryCapId),
            tx.object(usdcCoinId),
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
