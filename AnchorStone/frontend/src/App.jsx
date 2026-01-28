import { useCurrentAccount, useDisconnectWallet } from '@mysten/dapp-kit'
import LoginPage from './components/LoginPage'
import PropertyForm from './components/PropertyForm'
import './App.css'

function App() {
  const currentAccount = useCurrentAccount()
  const { mutate: disconnect } = useDisconnectWallet()

  const handleLogout = () => {
    disconnect()
  }

  return (
    <div className="app">
      {!currentAccount ? (
        <LoginPage />
      ) : (
        <PropertyForm
          userAddress={currentAccount.address}
          onLogout={handleLogout}
        />
      )}
    </div>
  )
}

export default App
