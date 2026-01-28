import { ConnectButton } from '@mysten/dapp-kit'
import './LoginPage.css'

export default function LoginPage() {
    return (
        <div className="login-container">
            <div className="login-background">
                <div className="gradient-orb orb-1"></div>
                <div className="gradient-orb orb-2"></div>
                <div className="gradient-orb orb-3"></div>
            </div>

            <div className="login-content fade-in">
                <div className="login-card card-glass">
                    <div className="login-header">
                        <h1 className="login-title">
                            <span className="title-gradient">AnchorStone</span>
                        </h1>
                        <p className="login-subtitle">
                            Tokenize Real-World Assets on Sui Blockchain
                        </p>
                    </div>

                    <div className="login-features">
                        <div className="feature-item">
                            <div className="feature-icon">🏦</div>
                            <div className="feature-text">
                                <h3>Dual-Purpose Collateral</h3>
                                <p>1000 USDC for market making + liquidation</p>
                            </div>
                        </div>

                        <div className="feature-item">
                            <div className="feature-icon">🛡️</div>
                            <div className="feature-text">
                                <h3>Defense Layer</h3>
                                <p>Price monitoring & circuit breaker protection</p>
                            </div>
                        </div>

                        <div className="feature-item">
                            <div className="feature-icon">⚡</div>
                            <div className="feature-text">
                                <h3>Fast & Secure</h3>
                                <p>Built on Sui for instant finality</p>
                            </div>
                        </div>
                    </div>

                    <div className="login-actions">
                        <ConnectButton
                            className="btn btn-primary btn-login connect-wallet-btn"
                            connectText="Connect Wallet to Continue"
                        />

                        <p className="login-note text-muted">
                            Secure authentication powered by Sui Wallet
                        </p>
                    </div>
                </div>

                <div className="login-footer">
                    <p className="text-muted">
                        By connecting, you agree to our Terms of Service and Privacy Policy
                    </p>
                </div>
            </div>
        </div>
    )
}
