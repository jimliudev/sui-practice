import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ConnectButton, useCurrentAccount, useSignAndExecuteTransaction } from '@mysten/dapp-kit';
import { Transaction } from '@mysten/sui/transactions';
import './CompanyRegistration.css';

// TODO: Replace with actual package ID after deployment
const PACKAGE_ID = '0x...';

export default function CompanyRegistration() {
    const navigate = useNavigate();
    const currentAccount = useCurrentAccount();
    const { mutate: signAndExecute } = useSignAndExecuteTransaction();

    const [companyName, setCompanyName] = useState('');
    const [isRegistering, setIsRegistering] = useState(false);
    const [error, setError] = useState('');

    const handleRegister = async () => {
        if (!currentAccount) {
            setError('Please connect your wallet first');
            return;
        }

        if (!companyName.trim()) {
            setError('Please enter a company name');
            return;
        }

        setIsRegistering(true);
        setError('');

        try {
            const tx = new Transaction();

            // Call register_company function
            tx.moveCall({
                target: `${PACKAGE_ID}::real_estate_platform::register_company`,
                arguments: [
                    tx.pure.string(companyName),
                ],
            });

            signAndExecute(
                {
                    transaction: tx,
                },
                {
                    onSuccess: (result) => {
                        console.log('Registration successful:', result);
                        // Navigate to dashboard
                        setTimeout(() => {
                            navigate('/company/dashboard');
                        }, 1500);
                    },
                    onError: (error) => {
                        console.error('Registration failed:', error);
                        setError(error.message || 'Registration failed');
                        setIsRegistering(false);
                    },
                }
            );
        } catch (err: any) {
            console.error('Error:', err);
            setError(err.message || 'An error occurred');
            setIsRegistering(false);
        }
    };

    return (
        <div className="registration-page">
            <div className="bg-animation">
                <div className="gradient-orb orb-1"></div>
                <div className="gradient-orb orb-2"></div>
            </div>

            <div className="registration-container">
                <div className="registration-card glass-card fade-in">
                    <div className="card-header">
                        <div className="brand-small" onClick={() => navigate('/')}>
                            <span className="brand-icon-small">🏢</span>
                            <span className="brand-text">x<span className="text-gradient">Estate</span></span>
                        </div>
                    </div>

                    <div className="card-body">
                        <h2 className="registration-title">Company Registration</h2>
                        <p className="registration-subtitle">
                            Register your company to start tokenizing real estate properties
                        </p>

                        {!currentAccount ? (
                            <div className="wallet-connect-section">
                                <p className="connect-prompt">Connect your wallet to continue</p>
                                <ConnectButton className="btn btn-primary btn-large" />
                            </div>
                        ) : (
                            <div className="registration-form">
                                <div className="wallet-info glass-card">
                                    <span className="wallet-label">Connected Wallet:</span>
                                    <span className="wallet-address">
                                        {currentAccount.address.slice(0, 6)}...{currentAccount.address.slice(-4)}
                                    </span>
                                </div>

                                <div className="input-group">
                                    <label className="input-label">Company Name</label>
                                    <input
                                        type="text"
                                        className="input-field"
                                        placeholder="Enter your company name"
                                        value={companyName}
                                        onChange={(e) => setCompanyName(e.target.value)}
                                        disabled={isRegistering}
                                    />
                                </div>

                                {error && (
                                    <div className="error-message">
                                        <span className="error-icon">⚠️</span>
                                        {error}
                                    </div>
                                )}

                                <button
                                    className="btn btn-primary btn-large"
                                    onClick={handleRegister}
                                    disabled={isRegistering || !companyName.trim()}
                                >
                                    {isRegistering ? (
                                        <>
                                            <div className="spinner"></div>
                                            Registering...
                                        </>
                                    ) : (
                                        'Register Company'
                                    )}
                                </button>

                                <button
                                    className="btn btn-secondary"
                                    onClick={() => navigate('/')}
                                    disabled={isRegistering}
                                >
                                    Back to Home
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                <div className="info-section fade-in">
                    <h3>Why Register?</h3>
                    <div className="info-cards">
                        <div className="info-card glass-card">
                            <div className="info-icon">📝</div>
                            <h4>List Properties</h4>
                            <p>Upload and tokenize your real estate assets</p>
                        </div>
                        <div className="info-card glass-card">
                            <div className="info-icon">💰</div>
                            <h4>Raise Capital</h4>
                            <p>Sell fractional ownership to investors</p>
                        </div>
                        <div className="info-card glass-card">
                            <div className="info-icon">📊</div>
                            <h4>Track Performance</h4>
                            <p>Monitor your properties and transactions</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
