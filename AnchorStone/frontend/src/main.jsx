import React from 'react'
import ReactDOM from 'react-dom/client'
import { SuiClientProvider, WalletProvider } from '@mysten/dapp-kit'
import { getFullnodeUrl } from '@mysten/sui/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { EnokiFlowProvider } from '@mysten/enoki/react'
import App from './App.jsx'
import './index.css'
import '@mysten/dapp-kit/dist/index.css'

// Create QueryClient for React Query
const queryClient = new QueryClient()

// Get Sui network configuration
const network = import.meta.env.VITE_SUI_NETWORK || 'testnet'

// Enoki configuration
const enokiApiKey = import.meta.env.VITE_ENOKI_API_KEY || 'enoki_public_testnet_key'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <SuiClientProvider networks={{ testnet: { url: getFullnodeUrl('testnet') } }} defaultNetwork="testnet">
        <WalletProvider autoConnect>
          <EnokiFlowProvider apiKey={enokiApiKey}>
            <App />
          </EnokiFlowProvider>
        </WalletProvider>
      </SuiClientProvider>
    </QueryClientProvider>
  </React.StrictMode>,
)
