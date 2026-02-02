/**
 * useDeepBookClient Hook
 * 
 * 創建並配置 DeepBook client，包含自定義 token 註冊
 * 
 * 注意：此 hook 已棄用，DeepBookWizard 組件現在直接創建 client
 * 以便更靈活地控制 pools 和 balanceManagers 配置
 */

import { useMemo } from 'react'
import { DeepBookClient } from '@mysten/deepbook-v3'
import { useSuiClient, useCurrentAccount } from '@mysten/dapp-kit'
import { createCoinsConfig } from '../utils/deepbookHelpers'

/**
 * 使用 DeepBook Client (基礎版本)
 * 
 * @param {string} tokenType - 自定義 token type (可選)
 * @param {string} packageId - Package ID (可選)
 * @param {string} balanceManagerId - Balance Manager ID (可選)
 * @returns {DeepBookClient|null} DeepBook client instance
 * 
 * @deprecated 建議在組件中直接創建 DeepBookClient 以獲得更好的控制
 */
export function useDeepBookClient(tokenType = null, packageId = null, balanceManagerId = null) {
    const suiClient = useSuiClient()
    const currentAccount = useCurrentAccount()

    const dbClient = useMemo(() => {
        if (!currentAccount) {
            console.log('DeepBookClient: No account connected')
            return null
        }

        try {
            // 創建 coins 配置（包含內建和自定義 token）
            const coinsConfig = createCoinsConfig(tokenType, packageId)

            // Balance Manager 配置
            const balanceManagers = balanceManagerId ? {
                MANAGER_1: {
                    address: balanceManagerId,
                }
            } : undefined

            console.log('Creating DeepBookClient with:', {
                address: currentAccount.address,
                env: 'testnet',
                hasCoins: !!coinsConfig,
                hasBalanceManagers: !!balanceManagers,
            })

            const client = new DeepBookClient({
                address: currentAccount.address,
                env: 'testnet',
                client: suiClient,
                coins: coinsConfig,
                balanceManagers,
            })

            console.log('✅ DeepBookClient created successfully!')
            return client
        } catch (error) {
            console.error('❌ Failed to create DeepBookClient:', error)
            return null
        }
    }, [currentAccount, suiClient, tokenType, packageId, balanceManagerId])

    return dbClient
}
