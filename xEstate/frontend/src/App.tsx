import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SuiClientProvider, WalletProvider } from '@mysten/dapp-kit';
import { getFullnodeUrl } from '@mysten/sui/client';
import { createNetworkConfig } from '@mysten/dapp-kit';
import '@mysten/dapp-kit/dist/index.css';
import './styles/index.css';

// Pages
import LandingPage from './pages/LandingPage';
import CompanyRegistration from './pages/CompanyRegistration';
import CompanyDashboard from './pages/CompanyDashboard';
import PropertyListing from './pages/PropertyListing';
import PropertyBrowsing from './pages/PropertyBrowsing';
import TradingInterface from './pages/TradingInterface';

// Create a query client
const queryClient = new QueryClient();

// Configure network
const { networkConfig } = createNetworkConfig({
  testnet: { url: getFullnodeUrl('testnet') },
  mainnet: { url: getFullnodeUrl('mainnet') },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <SuiClientProvider networks={networkConfig} defaultNetwork="testnet">
        <WalletProvider autoConnect>
          <Router>
            <Routes>
              <Route path="/" element={<LandingPage />} />
              <Route path="/company/register" element={<CompanyRegistration />} />
              <Route path="/company/dashboard" element={<CompanyDashboard />} />
              <Route path="/company/list-property" element={<PropertyListing />} />
              <Route path="/properties" element={<PropertyBrowsing />} />
              <Route path="/trade/:propertyId" element={<TradingInterface />} />
            </Routes>
          </Router>
        </WalletProvider>
      </SuiClientProvider>
    </QueryClientProvider>
  );
}

export default App;
