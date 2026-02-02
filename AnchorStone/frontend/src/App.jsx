import { useState } from 'react'
import { useCurrentAccount, useDisconnectWallet } from '@mysten/dapp-kit'
import LoginPage from './components/LoginPage'
import PropertyForm from './components/PropertyForm'
import DeployTokenDemo from './components/DeployTokenDemo'
import TokenVaultWizard from './components/TokenVaultWizard'
import DeepBookWizard from './components/DeepBookWizard'
import './App.css'

function App() {
  const currentAccount = useCurrentAccount()
  const { mutate: disconnect } = useDisconnectWallet()
  const [currentPage, setCurrentPage] = useState('wizard') // 'property', 'deploy', or 'wizard'

  const handleLogout = () => {
    disconnect()
  }

  const NavButton = ({ page, icon, label }) => (
    <button
      onClick={() => setCurrentPage(page)}
      style={{
        padding: '10px 20px',
        background: currentPage === page ? '#0066ff' : 'white',
        color: currentPage === page ? 'white' : '#333',
        border: '1px solid #ddd',
        borderRadius: '6px',
        cursor: 'pointer',
        fontWeight: currentPage === page ? 'bold' : 'normal'
      }}
    >
      {icon} {label}
    </button>
  )

  return (
    <div className="app">
      {!currentAccount ? (
        <LoginPage />
      ) : (
        <>
          {/* Navigation */}
          <div style={{
            padding: '20px',
            background: '#f5f5f5',
            borderBottom: '1px solid #ddd',
            display: 'flex',
            gap: '10px',
            alignItems: 'center',
            flexWrap: 'wrap'
          }}>
            <NavButton page="wizard" icon="🏦" label="Token Vault Wizard" />
            <NavButton page="deepbook" icon="📊" label="DeepBook Test" />
            <NavButton page="property" icon="🏠" label="Property Form" />
            <NavButton page="deploy" icon="🪙" label="Deploy Token Demo" />
            <div style={{ marginLeft: 'auto' }}>
              <button
                onClick={handleLogout}
                style={{
                  padding: '10px 20px',
                  background: '#dc3545',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer'
                }}
              >
                Logout
              </button>
            </div>
          </div>

          {/* Page Content */}
          {currentPage === 'wizard' && <TokenVaultWizard />}
          {currentPage === 'deepbook' && (
            <DeepBookWizard
              tokenType="0x2::sui::SUI"  // 測試用，可替換為實際 token type
              packageId={import.meta.env.VITE_PACKAGE_ID}
              vaultId="0x0000000000000000000000000000000000000000000000000000000000000000"  // 測試用
              totalTokenSupply={1000000}
            />
          )}
          {currentPage === 'property' && (
            <PropertyForm
              userAddress={currentAccount.address}
              onLogout={handleLogout}
            />
          )}
          {currentPage === 'deploy' && <DeployTokenDemo />}
        </>
      )}
    </div>
  )
}

export default App
