import { useNavigate } from 'react-router-dom';

export default function PropertyBrowsing() {
    const navigate = useNavigate();

    // TODO: Fetch properties from blockchain

    return (
        <div className="browsing-page" style={{ minHeight: '100vh', padding: '2rem' }}>
            <div className="container">
                <div className="flex-between mb-lg">
                    <h1>Browse Properties</h1>
                    <button className="btn btn-secondary" onClick={() => navigate('/')}>
                        Home
                    </button>
                </div>

                <div className="glass-card text-center">
                    <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>🏢</div>
                    <h2>No Properties Available Yet</h2>
                    <p className="text-secondary">
                        Properties will appear here once companies start listing them
                    </p>
                </div>

                <div className="grid grid-3 gap-lg mt-xl">
                    {/* Placeholder cards */}
                    {[1, 2, 3].map((i) => (
                        <div key={i} className="glass-card" style={{ opacity: 0.5 }}>
                            <div style={{
                                height: '200px',
                                background: 'var(--glass-bg)',
                                borderRadius: 'var(--radius-md)',
                                marginBottom: '1rem',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '3rem'
                            }}>
                                🏠
                            </div>
                            <h3>Property {i}</h3>
                            <p className="text-secondary">Coming soon...</p>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
