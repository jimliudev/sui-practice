import { useConnectWallet, useCurrentAccount, useWallets } from '@mysten/dapp-kit';

export default function LoginPage() {
  const currentAccount = useCurrentAccount();
  const { mutate: connect } = useConnectWallet();
  const wallets = useWallets();

  // 調試：顯示所有可用的錢包
  console.log('🔍 All available wallets:', wallets.map(w => ({ name: w.name, features: Object.keys(w.features) })));

  // 過濾出登入相關的錢包（名稱包含 "Sign in"）
  const authWallets = wallets.filter(w => w.name.includes('Sign in'));
  console.log('🍄 Auth wallets found:', authWallets.map(w => w.name));
  
  const googleWallet = authWallets.find(w => w.name.includes('Google'));
  const facebookWallet = authWallets.find(w => w.name.includes('Facebook'));
  
  console.log('✅ Google wallet:', googleWallet?.name || 'NOT FOUND');
  console.log('✅ Facebook wallet:', facebookWallet?.name || 'NOT FOUND');

  // 如果已登入，顯示當前帳戶
  if (currentAccount) {
    return null; // 主 App 會處理已登入狀態
  }

  const handleLogin = (wallet: any) => {
    connect({ wallet });
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.header}>
          <h1 style={styles.title}>🍄 Enoki SDK 範例</h1>
          <p style={styles.subtitle}>
            使用 Web2 登入方式體驗 Sui 區塊鏈
          </p>
        </div>

        <div style={styles.buttonGroup}>
          {googleWallet && (
            <button
              onClick={() => handleLogin(googleWallet)}
              style={{ ...styles.button, ...styles.googleButton }}
            >
              <svg style={styles.icon} viewBox="0 0 24 24">
                <path
                  fill="currentColor"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="currentColor"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="currentColor"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="currentColor"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              使用 Google 登入
            </button>
          )}

          {facebookWallet && (
            <button
              onClick={() => handleLogin(facebookWallet)}
              style={{ ...styles.button, ...styles.facebookButton }}
            >
              <svg style={styles.icon} viewBox="0 0 24 24">
                <path
                  fill="currentColor"
                  d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"
                />
              </svg>
              使用 Facebook 登入
            </button>
          )}

          {!googleWallet && !facebookWallet && (
            <div style={styles.noWallets}>
              <p>⚠️ 沒有可用的登入選項</p>
              <p style={styles.hint}>
                請確認已在 Enoki Portal 設定 OAuth 提供者
              </p>
            </div>
          )}
        </div>

        <div style={styles.features}>
          <div style={styles.feature}>
            <span style={styles.featureIcon}>🔐</span>
            <div>
              <h3 style={styles.featureTitle}>安全自託管</h3>
              <p style={styles.featureText}>使用 zkLogin 技術保護您的資產</p>
            </div>
          </div>
          <div style={styles.feature}>
            <span style={styles.featureIcon}>⚡</span>
            <div>
              <h3 style={styles.featureTitle}>免 Gas 費用</h3>
              <p style={styles.featureText}>應用贊助所有交易費用</p>
            </div>
          </div>
          <div style={styles.feature}>
            <span style={styles.featureIcon}>🎯</span>
            <div>
              <h3 style={styles.featureTitle}>簡單易用</h3>
              <p style={styles.featureText}>無需了解錢包或私鑰</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const styles = {
  container: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '100vh',
    padding: '20px',
  },
  card: {
    backgroundColor: 'white',
    borderRadius: '20px',
    padding: '40px',
    maxWidth: '500px',
    width: '100%',
    boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
  },
  header: {
    textAlign: 'center' as const,
    marginBottom: '40px',
  },
  title: {
    fontSize: '32px',
    fontWeight: 'bold',
    color: '#1a202c',
    marginBottom: '10px',
  },
  subtitle: {
    fontSize: '16px',
    color: '#718096',
  },
  buttonGroup: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '15px',
    marginBottom: '40px',
  },
  button: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '12px',
    padding: '16px 24px',
    fontSize: '16px',
    fontWeight: '600',
    border: 'none',
    borderRadius: '12px',
    cursor: 'pointer',
    transition: 'all 0.2s',
    color: 'white',
  },
  googleButton: {
    backgroundColor: '#4285f4',
  },
  facebookButton: {
    backgroundColor: '#1877f2',
  },
  icon: {
    width: '24px',
    height: '24px',
  },
  noWallets: {
    textAlign: 'center' as const,
    padding: '20px',
    backgroundColor: '#fff3cd',
    borderRadius: '12px',
    color: '#856404',
  },
  hint: {
    fontSize: '14px',
    marginTop: '8px',
  },
  features: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '20px',
    paddingTop: '30px',
    borderTop: '1px solid #e2e8f0',
  },
  feature: {
    display: 'flex',
    gap: '15px',
    alignItems: 'flex-start',
  },
  featureIcon: {
    fontSize: '28px',
  },
  featureTitle: {
    fontSize: '16px',
    fontWeight: '600',
    color: '#1a202c',
    marginBottom: '4px',
  },
  featureText: {
    fontSize: '14px',
    color: '#718096',
  },
} as const;
