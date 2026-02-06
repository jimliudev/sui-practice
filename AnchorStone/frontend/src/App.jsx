import { Routes, Route, Link, useLocation } from 'react-router-dom'
import { useCurrentAccount, useDisconnectWallet } from '@mysten/dapp-kit'
import LoginPage from './components/LoginPage'
import PropertyForm from './components/PropertyForm'
import DeployTokenDemo from './components/DeployTokenDemo'
import TokenVaultWizard from './components/TokenVaultWizard'
import DeepBookWizard from './components/DeepBookWizard'
import AnchorStoneForm from './components/AnchorStoneForm'
import PlaceOrderPage from './components/PlaceOrderPage'
import './App.css'

function App() {
  const currentAccount = useCurrentAccount()
  const { mutate: disconnect } = useDisconnectWallet()
  const location = useLocation()

  const handleLogout = () => {
    disconnect()
  }

  const NavButton = ({ to, icon, label, variant = 'header', primary = false }) => {
    const isActive = location.pathname === to
    
    const styles = variant === 'footer' ? {
      padding: primary ? '10px 24px' : '8px 16px',
      background: primary 
        ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
        : (isActive ? 'rgba(255, 255, 255, 0.1)' : 'rgba(255, 255, 255, 0.03)'),
      color: 'white',
      border: primary ? 'none' : '1px solid rgba(255, 255, 255, 0.1)',
      borderRadius: '20px',
      cursor: 'pointer',
      fontWeight: primary ? '600' : (isActive ? '500' : '400'),
      textDecoration: 'none',
      display: 'inline-block',
      fontSize: primary ? '14px' : '13px',
      transition: 'all 0.2s ease',
      letterSpacing: '0.01em',
      opacity: primary ? 1 : (isActive ? 1 : 0.6)
    } : {
      padding: '10px 20px',
      background: isActive ? '#0066ff' : 'white',
      color: isActive ? 'white' : '#333',
      border: '1px solid #ddd',
      borderRadius: '6px',
      cursor: 'pointer',
      fontWeight: isActive ? 'bold' : 'normal',
      textDecoration: 'none',
      display: 'inline-block'
    }
    
    return (
      <Link 
        to={to} 
        style={styles}
        onMouseEnter={(e) => {
          if (variant === 'footer') {
            if (primary) {
              e.target.style.transform = 'translateY(-2px)'
              e.target.style.boxShadow = '0 8px 20px rgba(102, 126, 234, 0.4)'
            } else {
              e.target.style.background = 'rgba(255, 255, 255, 0.15)'
              e.target.style.opacity = '1'
            }
          }
        }}
        onMouseLeave={(e) => {
          if (variant === 'footer') {
            if (primary) {
              e.target.style.transform = 'translateY(0)'
              e.target.style.boxShadow = 'none'
            } else {
              e.target.style.background = isActive ? 'rgba(255, 255, 255, 0.1)' : 'rgba(255, 255, 255, 0.03)'
              e.target.style.opacity = isActive ? '1' : '0.6'
            }
          }
        }}
      >
        {icon && <span>{icon} </span>}{label}
      </Link>
    )
  }

  return (
    <div className="app" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#0a1929' }}>
      {!currentAccount ? (
        <LoginPage />
      ) : (
        <>
          {/* Header - 只有 Logout 按鈕 */}
          <div style={{
            padding: '20px 40px',
            background: 'rgba(10, 25, 41, 0.95)',
            backdropFilter: 'blur(10px)',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            justifyContent: 'flex-end',
            alignItems: 'center',
            position: 'sticky',
            top: 0,
            zIndex: 100
          }}>
            <button
              onClick={handleLogout}
              style={{
                padding: '8px 20px',
                background: 'rgba(255, 255, 255, 0.05)',
                color: '#ffffff',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                borderRadius: '20px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '500',
                transition: 'all 0.2s ease'
              }}
              onMouseEnter={(e) => {
                e.target.style.background = 'rgba(255, 255, 255, 0.1)'
                e.target.style.borderColor = 'rgba(255, 255, 255, 0.3)'
              }}
              onMouseLeave={(e) => {
                e.target.style.background = 'rgba(255, 255, 255, 0.05)'
                e.target.style.borderColor = 'rgba(255, 255, 255, 0.15)'
              }}
            >
              登出
            </button>
          </div>

          {/* Page Content */}
          <div style={{ flex: 1, background: '#0a1929' }}>
            <Routes>
              <Route path="/anchor-stone" element={<AnchorStoneForm />} />
              <Route path="/anchor-stone/place-order" element={<PlaceOrderPage />} />
              <Route path="/wizard" element={<TokenVaultWizard />} />
              <Route path="/deepbook" element={
                <DeepBookWizard
                  tokenType="0x2::sui::SUI"
                  packageId={import.meta.env.VITE_PACKAGE_ID}
                  vaultId="0x0000000000000000000000000000000000000000000000000000000000000000"
                  totalTokenSupply={1000000}
                />
              } />
              <Route path="/property" element={
                <PropertyForm
                  userAddress={currentAccount.address}
                  onLogout={handleLogout}
                />
              } />
              <Route path="/deploy" element={<DeployTokenDemo />} />
              <Route path="/" element={<AnchorStoneForm />} />
            </Routes>
          </div>

          {/* Footer Navigation - 所有頁面 */}
          <div style={{
            padding: '24px 40px',
            background: '#0a1929',
            borderTop: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            gap: '12px',
            alignItems: 'center',
            flexWrap: 'wrap',
            justifyContent: 'center'
          }}>
            <NavButton to="/anchor-stone" icon="" label="AnchorStone" variant="footer" primary={true} />
            <NavButton to="/anchor-stone/place-order" icon="📝" label="掛單" variant="footer" />
            <div style={{ width: '1px', height: '16px', background: 'rgba(255, 255, 255, 0.15)', margin: '0 8px' }}></div>
            <div style={{ color: 'rgba(255, 255, 255, 0.4)', marginRight: '8px', fontSize: '12px', letterSpacing: '0.05em' }}>
              DEV TOOLS
            </div>
            <NavButton to="/wizard" icon="" label="Vault Wizard" variant="footer" />
            <NavButton to="/deepbook" icon="" label="DeepBook" variant="footer" />
            <NavButton to="/property" icon="" label="Property" variant="footer" />
            <NavButton to="/deploy" icon="" label="Deploy" variant="footer" />
          </div>
        </>
      )}
    </div>
  )
}

export default App
