import { useState } from 'react';
import { useCurrentAccount, useSignAndExecuteTransaction } from '@mysten/dapp-kit';
import { Transaction } from '@mysten/sui/transactions';

export default function TransactionDemo() {
  const currentAccount = useCurrentAccount();
  const { mutate: signAndExecute } = useSignAndExecuteTransaction();
  
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  const handleTransfer = async () => {
    if (!currentAccount || !recipient || !amount) {
      setResult({ success: false, message: '請填寫所有欄位' });
      return;
    }

    try {
      setIsLoading(true);
      setResult(null);

      // 創建交易
      const tx = new Transaction();
      
      // 將 SUI 轉換為 MIST (1 SUI = 1,000,000,000 MIST)
      const amountInMist = Math.floor(parseFloat(amount) * 1_000_000_000);
      
      // 分割代幣
      const [coin] = tx.splitCoins(tx.gas, [amountInMist]);
      
      // 轉帳
      tx.transferObjects([coin], recipient);

      // 簽名並執行交易
      signAndExecute(
        {
          transaction: tx as any,
        },
        {
          onSuccess: (result) => {
            console.log('交易成功:', result);
            setResult({
              success: true,
              message: `成功轉帳 ${amount} SUI！\nDigest: ${result.digest}`,
            });
            setRecipient('');
            setAmount('');
            setIsLoading(false);
          },
          onError: (error) => {
            console.error('交易失敗:', error);
            setResult({
              success: false,
              message: `交易失敗: ${error.message}`,
            });
            setIsLoading(false);
          },
        }
      );
    } catch (error: any) {
      console.error('錯誤:', error);
      setResult({
        success: false,
        message: `錯誤: ${error.message}`,
      });
      setIsLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <h3 style={styles.title}>💸 轉帳示範</h3>
      <p style={styles.description}>
        試試看轉帳 SUI 代幣給其他地址
      </p>

      <div style={styles.form}>
        <div style={styles.inputGroup}>
          <label style={styles.label}>接收地址</label>
          <input
            type="text"
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            placeholder="0x..."
            style={styles.input}
            disabled={isLoading}
          />
        </div>

        <div style={styles.inputGroup}>
          <label style={styles.label}>金額 (SUI)</label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.001"
            step="0.001"
            min="0"
            style={styles.input}
            disabled={isLoading}
          />
        </div>

        <button
          onClick={handleTransfer}
          disabled={isLoading || !recipient || !amount}
          style={{
            ...styles.button,
            ...(isLoading || !recipient || !amount ? styles.buttonDisabled : {}),
          }}
        >
          {isLoading ? '處理中...' : '發送交易'}
        </button>
      </div>

      {result && (
        <div
          style={{
            ...styles.result,
            ...(result.success ? styles.resultSuccess : styles.resultError),
          }}
        >
          <pre style={styles.resultText}>{result.message}</pre>
        </div>
      )}

      <div style={styles.note}>
        <p style={styles.noteTitle}>💡 提示</p>
        <ul style={styles.noteList}>
          <li>這是一個基本的轉帳示範</li>
          <li>交易會使用您帳戶的餘額作為 gas 費</li>
          <li>如果啟用贊助交易，gas 費可由應用支付</li>
          <li>確保接收地址正確且有效</li>
        </ul>
      </div>
    </div>
  );
}

const styles = {
  container: {
    backgroundColor: '#f7fafc',
    borderRadius: '12px',
    padding: '24px',
  },
  title: {
    fontSize: '20px',
    fontWeight: '600',
    color: '#1a202c',
    marginBottom: '8px',
  },
  description: {
    fontSize: '14px',
    color: '#718096',
    marginBottom: '20px',
  },
  form: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '16px',
    marginBottom: '20px',
  },
  inputGroup: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '6px',
  },
  label: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#4a5568',
  },
  input: {
    padding: '12px',
    fontSize: '14px',
    border: '2px solid #e2e8f0',
    borderRadius: '8px',
    outline: 'none',
    transition: 'border-color 0.2s',
  },
  button: {
    padding: '14px 24px',
    fontSize: '16px',
    fontWeight: '600',
    color: 'white',
    backgroundColor: '#667eea',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  buttonDisabled: {
    backgroundColor: '#cbd5e0',
    cursor: 'not-allowed',
  },
  result: {
    padding: '16px',
    borderRadius: '8px',
    marginBottom: '20px',
  },
  resultSuccess: {
    backgroundColor: '#d4edda',
    borderLeft: '4px solid #28a745',
  },
  resultError: {
    backgroundColor: '#f8d7da',
    borderLeft: '4px solid #dc3545',
  },
  resultText: {
    margin: 0,
    fontSize: '13px',
    fontFamily: 'monospace',
    whiteSpace: 'pre-wrap' as const,
    wordBreak: 'break-all' as const,
  },
  note: {
    backgroundColor: '#edf2f7',
    borderRadius: '8px',
    padding: '16px',
  },
  noteTitle: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#2d3748',
    marginBottom: '8px',
  },
  noteList: {
    paddingLeft: '20px',
    fontSize: '13px',
    color: '#4a5568',
    lineHeight: '1.6',
  },
} as const;
