import { useCurrentAccount } from '@mysten/dapp-kit';
import LoginPage from './components/LoginPage';
import Dashboard from './components/Dashboard';

function App() {
  const currentAccount = useCurrentAccount();

  return (
    <div>
      {currentAccount ? <Dashboard /> : <LoginPage />}
    </div>
  );
}

export default App;
