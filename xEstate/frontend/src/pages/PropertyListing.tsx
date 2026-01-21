import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCurrentAccount } from '@mysten/dapp-kit';

export default function PropertyListing() {
    const navigate = useNavigate();
    const currentAccount = useCurrentAccount();

    const [formData, setFormData] = useState({
        name: '',
        description: '',
        location: '',
        totalTokens: '',
        tokensForSale: '',
        usdcPerToken: '',
    });

    // TODO: Implement file upload and transaction

    return (
        <div className="listing-page" style={{ minHeight: '100vh', padding: '2rem' }}>
            <div className="container" style={{ maxWidth: '800px' }}>
                <div className="flex-between mb-lg">
                    <h1>List New Property</h1>
                    <button className="btn btn-secondary" onClick={() => navigate('/company/dashboard')}>
                        Back to Dashboard
                    </button>
                </div>

                <div className="glass-card">
                    <h2 className="mb-md">Property Information</h2>

                    <div className="input-group">
                        <label className="input-label">Property Name</label>
                        <input
                            type="text"
                            className="input-field"
                            placeholder="e.g., Luxury Apartment Downtown"
                            value={formData.name}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        />
                    </div>

                    <div className="input-group">
                        <label className="input-label">Description</label>
                        <textarea
                            className="input-field"
                            placeholder="Describe the property..."
                            value={formData.description}
                            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                        />
                    </div>

                    <div className="input-group">
                        <label className="input-label">Location</label>
                        <input
                            type="text"
                            className="input-field"
                            placeholder="e.g., New York, NY"
                            value={formData.location}
                            onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                        />
                    </div>

                    <h3 className="mt-lg mb-md">Tokenization Settings</h3>

                    <div className="grid grid-2 gap-md">
                        <div className="input-group">
                            <label className="input-label">Total Tokens</label>
                            <input
                                type="number"
                                className="input-field"
                                placeholder="e.g., 1000000"
                                value={formData.totalTokens}
                                onChange={(e) => setFormData({ ...formData, totalTokens: e.target.value })}
                            />
                        </div>

                        <div className="input-group">
                            <label className="input-label">Tokens for Sale</label>
                            <input
                                type="number"
                                className="input-field"
                                placeholder="e.g., 500000"
                                value={formData.tokensForSale}
                                onChange={(e) => setFormData({ ...formData, tokensForSale: e.target.value })}
                            />
                        </div>
                    </div>

                    <div className="input-group">
                        <label className="input-label">USDC per Token (collateral)</label>
                        <input
                            type="number"
                            className="input-field"
                            placeholder="e.g., 1"
                            value={formData.usdcPerToken}
                            onChange={(e) => setFormData({ ...formData, usdcPerToken: e.target.value })}
                        />
                        <p style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)', marginTop: '0.5rem' }}>
                            Required USDC deposit: {formData.totalTokens && formData.usdcPerToken
                                ? (Number(formData.totalTokens) * Number(formData.usdcPerToken)).toLocaleString()
                                : '0'} USDC
                        </p>
                    </div>

                    <div className="glass-card mt-md" style={{ padding: '1rem', background: 'rgba(124, 58, 237, 0.1)' }}>
                        <p style={{ margin: 0, fontSize: '0.9rem' }}>
                            📄 <strong>Document Upload:</strong> Coming soon - Upload property documents (PDFs)
                        </p>
                        <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.9rem' }}>
                            🖼️ <strong>Image Upload:</strong> Coming soon - Upload property images
                        </p>
                    </div>

                    <button className="btn btn-primary btn-large mt-lg" style={{ width: '100%' }} disabled>
                        List Property (Coming Soon)
                    </button>
                </div>
            </div>
        </div>
    );
}
