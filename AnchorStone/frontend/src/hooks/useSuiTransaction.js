import { useState } from 'react'
import { useSignAndExecuteTransaction, useSuiClient } from '@mysten/dapp-kit'
import { Transaction } from '@mysten/sui/transactions'

export function useSuiTransaction() {
    const [status, setStatus] = useState('idle') // idle, pending, success, error
    const [txDigest, setTxDigest] = useState(null)
    const [error, setError] = useState(null)

    const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction()
    const client = useSuiClient()

    const executeTransaction = async (txBlock) => {
        try {
            setStatus('pending')
            setError(null)

            const result = await signAndExecute({
                transaction: txBlock,
                options: {
                    showEffects: true,
                    showObjectChanges: true,
                },
            })

            setTxDigest(result.digest)

            // Wait for transaction to be confirmed
            await client.waitForTransaction({
                digest: result.digest,
            })

            setStatus('success')
            return result
        } catch (err) {
            console.error('Transaction error:', err)
            setError(err.message)
            setStatus('error')
            throw err
        }
    }

    const reset = () => {
        setStatus('idle')
        setTxDigest(null)
        setError(null)
    }

    return {
        executeTransaction,
        status,
        txDigest,
        error,
        isLoading: status === 'pending',
        isSuccess: status === 'success',
        isError: status === 'error',
        reset,
    }
}
