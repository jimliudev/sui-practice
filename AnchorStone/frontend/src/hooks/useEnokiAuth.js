import { useState, useEffect } from 'react'
import { useEnokiFlow, useZkLogin } from '@mysten/enoki/react'

export function useEnokiAuth() {
    const enokiFlow = useEnokiFlow()
    const { address } = useZkLogin()
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState(null)

    const login = async () => {
        try {
            setIsLoading(true)
            setError(null)

            // Create authorization URL for Google OAuth
            const protocol = window.location.protocol
            const host = window.location.host
            const redirectUrl = `${protocol}//${host}/auth`

            const authUrl = await enokiFlow.createAuthorizationURL({
                provider: 'google',
                clientId: import.meta.env.VITE_GOOGLE_CLIENT_ID,
                redirectUrl,
                network: 'testnet',
            })

            // Redirect to Google OAuth
            window.location.href = authUrl
        } catch (err) {
            console.error('Login error:', err)
            setError(err.message)
            setIsLoading(false)
        }
    }

    const logout = () => {
        // Clear Enoki session
        localStorage.removeItem('enoki_session')
        window.location.reload()
    }

    return {
        address,
        isAuthenticated: !!address,
        isLoading,
        error,
        login,
        logout,
    }
}
