import { useNavigate } from 'react-router-dom';
import { useCurrentAccount } from '@mysten/dapp-kit';

export default function CompanyDashboard() {
    const navigate = useNavigate();
    const currentAccount = useCurrentAccount();

    // TODO: Fetch company properties from blockchain

    return (
        <div className="dashboard-page" style={{ minHeight: '100vh', padding: '2rem' }}>
            <div className="container">
                <div className="flex-between mb-lg">
                    <h1>Company Dashboard</h1>
                    <button className="btn btn-secondary" onClick={() => navigate('/')}>
                        Home
                    </button>
                </div>

                {!currentAccount ? (
                    <div className="glass-card text-center">
                        <p>Please connect your wallet</p>
                    </div>
                ) : (
                    <>
                        <div className="glass-card mb-lg">
                            <h2>Your Properties</h2>
                            <p className="text-secondary">No properties listed yet</p>
                            <button
                                className="btn btn-primary mt-md"
                                onClick={() => navigate('/company/list-property')}
                            >
                                List New Property
                            </button>
                        </div>

                        <div className="grid grid-3 gap-lg">
                            <div className="glass-card">
                                <h3>Total Properties</h3>
                                <p className="text-gradient" style={{ fontSize: '2rem', fontWeight: 'bold' }}>0</p>
                            </div>
                            <div className="glass-card">
                                <h3>Total Tokens Issued</h3>
                                <p className="text-gradient" style={{ fontSize: '2rem', fontWeight: 'bold' }}>0</p>
                            </div>
                            <div className="glass-card">
                                <h3>USDC Locked</h3>
                                <p className="text-gradient" style={{ fontSize: '2rem', fontWeight: 'bold' }}>$0</p>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
