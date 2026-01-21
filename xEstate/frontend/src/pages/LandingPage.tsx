import { useNavigate } from 'react-router-dom';
import './LandingPage.css';

export default function LandingPage() {
    const navigate = useNavigate();

    return (
        <div className="landing-page">
            {/* Animated Background */}
            <div className="bg-animation">
                <div className="gradient-orb orb-1"></div>
                <div className="gradient-orb orb-2"></div>
                <div className="gradient-orb orb-3"></div>
            </div>

            {/* Main Content */}
            <div className="landing-content">
                <div className="hero-section fade-in">
                    {/* Logo/Brand */}
                    <div className="brand">
                        <div className="brand-icon">🏢</div>
                        <h1 className="brand-name">
                            x<span className="text-gradient">Estate</span>
                        </h1>
                    </div>

                    {/* Tagline */}
                    <p className="tagline">
                        Tokenize Real Estate. Trade with Confidence.
                    </p>
                    <p className="subtitle">
                        The future of property investment on Sui blockchain
                    </p>

                    {/* CTA Buttons */}
                    <div className="cta-container">
                        <button
                            className="cta-button company-button"
                            onClick={() => navigate('/company/register')}
                        >
                            <div className="button-content">
                                <span className="button-icon">🏢</span>
                                <div className="button-text">
                                    <span className="button-title">For Companies</span>
                                    <span className="button-subtitle">List & tokenize properties</span>
                                </div>
                            </div>
                            <div className="button-shine"></div>
                        </button>

                        <button
                            className="cta-button user-button"
                            onClick={() => navigate('/properties')}
                        >
                            <div className="button-content">
                                <span className="button-icon">👤</span>
                                <div className="button-text">
                                    <span className="button-title">For Investors</span>
                                    <span className="button-subtitle">Browse & invest in properties</span>
                                </div>
                            </div>
                            <div className="button-shine"></div>
                        </button>
                    </div>

                    {/* Features */}
                    <div className="features-grid">
                        <div className="feature-card glass-card">
                            <div className="feature-icon">🔒</div>
                            <h3>Secure & Transparent</h3>
                            <p>All transactions on Sui blockchain</p>
                        </div>
                        <div className="feature-card glass-card">
                            <div className="feature-icon">💎</div>
                            <h3>Fractional Ownership</h3>
                            <p>Invest in premium properties</p>
                        </div>
                        <div className="feature-card glass-card">
                            <div className="feature-icon">⚡</div>
                            <h3>Instant Trading</h3>
                            <p>Trade on DeepBook DEX</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
