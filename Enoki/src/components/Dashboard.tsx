import { useCurrentAccount, useDisconnectWallet, useSuiClientQuery } from '@mysten/dapp-kit';
import TransactionDemo from './TransactionDemo';

export default function Dashboard() {
  const currentAccount = useCurrentAccount();
  const { mutate: disconnect } = useDisconnectWallet();

  // 查詢帳戶餘額
  const { data: balance } = useSuiClientQuery(
    'getBalance',
    { owner: currentAccount?.address || '' },
    { enabled: !!currentAccount }
  );

  if (!currentAccount) {
    return null;
  }

  const balanceInSui = balance 
    ? (Number(balance.totalBalance) / 1_000_000_000).toFixed(4)
    : '0.0000';

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        {/* 標題欄 */}
        <div style={styles.header}>
          <h1 style={styles.title}>🍄 Enoki Dashboard</h1>
          <button onClick={() => disconnect()} style={styles.logoutButton}>
            登出
          </button>
        </div>

        {/* 帳戶資訊 */}
        <div style={styles.accountInfo}>
          <div style={styles.infoRow}>
            <span style={styles.label}>您的 Sui 地址：</span>
            <div style={styles.addressBox}>
              <code style={styles.address}>{currentAccount.address}</code>
              <button
                onClick={() => navigator.clipboard.writeText(currentAccount.address)}
                style={styles.copyButton}
                title="複製地址"
              >
                📋
              </button>
            </div>
          </div>

          <div style={styles.infoRow}>
            <span style={styles.label}>餘額：</span>
            <span style={styles.balance}>{balanceInSui} SUI</span>
          </div>

          {balance && Number(balance.totalBalance) === 0 && (
            <div style={styles.warningBox}>
              <p>⚠️ 您的帳戶餘額為 0</p>
              <p style={styles.warningText}>
                前往{' '}
                <a
                  href="https://faucet.sui.io/"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={styles.link}
                >
                  Sui Faucet
                </a>
                {' '}領取測試代幣
              </p>
            </div>
          )}
        </div>

        {/* 說明區塊 */}
        <div style={styles.infoBox}>
          <h3 style={styles.infoTitle}>✨ 關於您的帳戶</h3>
          <ul style={styles.infoList}>
            <li>此地址是透過 zkLogin 自動生成的</li>
            <li>與您的 Web2 登入憑證綁定</li>
            <li>您擁有完全的控制權（自託管）</li>
            <li>每個應用都會生成不同的地址</li>
          </ul>
        </div>

        {/* 交易示範組件 */}
        <TransactionDemo />
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
    maxWidth: '700px',
    width: '100%',
    boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '30px',
  },
  title: {
    fontSize: '28px',
    fontWeight: 'bold',
    color: '#1a202c',
  },
  logoutButton: {
    padding: '10px 20px',
    fontSize: '14px',
    fontWeight: '600',
    color: '#e53e3e',
    backgroundColor: '#fff5f5',
    border: '2px solid #feb2b2',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  accountInfo: {
    backgroundColor: '#f7fafc',
    borderRadius: '12px',
    padding: '24px',
    marginBottom: '24px',
  },
  infoRow: {
    marginBottom: '16px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px',
  },
  label: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#4a5568',
  },
  addressBox: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    backgroundColor: 'white',
    padding: '12px',
    borderRadius: '8px',
    border: '1px solid #e2e8f0',
  },
  address: {
    flex: 1,
    fontSize: '13px',
    color: '#2d3748',
    wordBreak: 'break-all' as const,
    fontFamily: 'monospace',
  },
  copyButton: {
    padding: '6px 10px',
    fontSize: '16px',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    borderRadius: '4px',
    transition: 'background 0.2s',
  },
  balance: {
    fontSize: '24px',
    fontWeight: 'bold',
    color: '#667eea',
  },
  warningBox: {
    marginTop: '16px',
    padding: '16px',
    backgroundColor: '#fffaf0',
    borderRadius: '8px',
    border: '1px solid #fbd38d',
    color: '#744210',
  },
  warningText: {
    fontSize: '14px',
    marginTop: '8px',
  },
  link: {
    color: '#667eea',
    textDecoration: 'underline',
  },
  infoBox: {
    backgroundColor: '#edf2f7',
    borderRadius: '12px',
    padding: '20px',
    marginBottom: '24px',
  },
  infoTitle: {
    fontSize: '16px',
    fontWeight: '600',
    color: '#1a202c',
    marginBottom: '12px',
  },
  infoList: {
    paddingLeft: '20px',
    color: '#4a5568',
    fontSize: '14px',
    lineHeight: '1.8',
  },
} as const;
