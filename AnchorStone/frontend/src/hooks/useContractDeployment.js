import { useState } from 'react'
import { useSuiClient } from '@mysten/dapp-kit'
import { buildPublishTransaction, parseDeploymentResult } from '../utils/contractInteraction'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000'

/**
 * Hook for deploying token contracts via wallet
 * This hook handles the full deployment flow:
 * 1. Request bytecode from backend
 * 2. Build publish transaction
 * 3. Sign and execute via wallet
 * 4. Parse results
 */
export function useContractDeployment() {
    const [isGenerating, setIsGenerating] = useState(false)
    const [isDeploying, setIsDeploying] = useState(false)
    const [error, setError] = useState(null)
    const [deploymentResult, setDeploymentResult] = useState(null)
    const suiClient = useSuiClient()

    /**
     * Deploy a token contract
     * @param {Object} tokenData - Token information
     * @param {string} tokenData.propertyId - Unique property ID
     * @param {string} tokenData.name - Property name
     * @param {string} tokenData.description - Token description
     * @param {string} currentAddress - Current wallet address
     * @param {Function} signTransaction - Function to sign transaction (from useSignTransaction)
     */
    const deployContract = async (tokenData, currentAddress, signTransaction) => {
        setError(null)
        setDeploymentResult(null)

        try {
            // Step 1: Request bytecode from backend
            setIsGenerating(true)
            console.log('🔧 Requesting bytecode from backend...')

            const response = await fetch(`${BACKEND_URL}/api/generate-bytecode`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    propertyId: tokenData.propertyId,
                    name: tokenData.name,
                    description: tokenData.description,
                }),
            })

            if (!response.ok) {
                const errorData = await response.json()
                throw new Error(errorData.message || 'Failed to generate bytecode')
            }

            const bytecodeData = await response.json()
            console.log('✅ Bytecode received:', {
                moduleName: bytecodeData.moduleName,
                symbol: bytecodeData.symbol,
                bytecodeSize: bytecodeData.bytecode?.length,
            })

            setIsGenerating(false)

            // Step 2: Build publish transaction
            setIsDeploying(true)
            console.log('📦 Building publish transaction...')

            const tx = buildPublishTransaction(
                bytecodeData.bytecode,
                bytecodeData.dependencies,
                currentAddress
            )

            // Step 3: Sign transaction
            console.log('✍️  Requesting wallet signature...')
            const { bytes, signature } = await signTransaction({
                transaction: tx,
            })

            // Step 4: Execute transaction with suiClient to get objectChanges
            console.log('🚀 Executing transaction...')
            const result = await suiClient.executeTransactionBlock({
                transactionBlock: bytes,
                signature: signature,
                options: {
                    showEffects: true,
                    showObjectChanges: true,
                },
            })

            console.log('✅ Transaction executed!')
            console.log('Transaction digest:', result.digest)
            console.log('Effects status:', result.effects?.status)
            console.log('Object changes count:', result.objectChanges?.length)

            // Step 5: Parse results
            console.log('\n📊 Parsing deployment result...')
            const parsed = parseDeploymentResult(result)

            if (!parsed.packageId) {
                console.error('❌ Failed to extract package ID')
                console.error('Available object changes:', result.objectChanges)
                throw new Error('Failed to extract package ID from deployment result')
            }

            const finalResult = {
                ...parsed,
                moduleName: bytecodeData.moduleName,
                structName: bytecodeData.structName,
                symbol: bytecodeData.symbol,
                tokenType: `${parsed.packageId}::${bytecodeData.moduleName}::${bytecodeData.structName}`,
            }

            console.log('\n🎉 Contract deployed successfully!')
            console.log('Final result:', finalResult)

            setDeploymentResult(finalResult)
            setIsDeploying(false)

            return finalResult

        } catch (err) {
            console.error('❌ Deployment failed:', err)
            setError(err.message || 'Deployment failed')
            setIsGenerating(false)
            setIsDeploying(false)
            throw err
        }
    }

    const reset = () => {
        setError(null)
        setDeploymentResult(null)
        setIsGenerating(false)
        setIsDeploying(false)
    }

    return {
        deployContract,
        isGenerating,
        isDeploying,
        isLoading: isGenerating || isDeploying,
        error,
        deploymentResult,
        reset,
    }
}
