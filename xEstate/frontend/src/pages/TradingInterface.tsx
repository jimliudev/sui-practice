import { useParams, useNavigate } from 'react-router-dom';

export default function TradingInterface() {
    const { propertyId } = useParams();
    const navigate = useNavigate();

    return (
        <div className="trading-page" style={{ minHeight: '100vh', padding: '2rem' }}>
            <div className="container">
                <div className="flex-between mb-lg">
                    <h1>Trade Property Tokens</h1>
                    <button className="btn btn-secondary" onClick={() => navigate('/properties')}>
                        Back to Properties
                    </button>
                </div>

                <div className="grid grid-2 gap-lg">
                    <div className="glass-card">
                        <h2>Property Information</h2>
                        <p className="text-secondary">Property ID: {propertyId}</p>
                        <p className="text-secondary mt-md">Trading interface coming soon...</p>
                    </div>

                    <div className="glass-card">
                        <h2>Order Book</h2>
                        <p className="text-secondary">DeepBook integration coming soon...</p>
                    </div>
                </div>

                <div className="glass-card mt-lg">
                    <h3>Place Order</h3>
                    <div className="grid grid-2 gap-md mt-md">
                        <div className="input-group">
                            <label className="input-label">Amount</label>
                            <input type="number" className="input-field" placeholder="0.00" disabled />
                        </div>
                        <div className="input-group">
                            <label className="input-label">Price (eTUSDC)</label>
                            <input type="number" className="input-field" placeholder="0.00" disabled />
                        </div>
                    </div>
                    <div className="flex gap-md mt-md">
                        <button className="btn btn-primary" style={{ flex: 1 }} disabled>
                            Buy
                        </button>
                        <button className="btn btn-secondary" style={{ flex: 1 }} disabled>
                            Sell
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
