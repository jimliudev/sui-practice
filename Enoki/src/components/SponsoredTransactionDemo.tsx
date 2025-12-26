import { useState } from 'react';
import { useCurrentAccount, useSignTransaction, useSuiClient } from '@mysten/dapp-kit';
import { Transaction } from '@mysten/sui/transactions';
import { EnokiClient } from '@mysten/enoki';
import { toB64 } from '@mysten/sui/utils';

/**
 * Sponsored Transaction Demo Component
 * 
 * Sponsored transactions allow developers to pay gas fees for users,
 * enabling users to interact with the blockchain without holding SUI tokens.
 * 
 * Flow:
 * 1. Create transaction (only transaction content, no gas)
 * 2. Call Enoki API to create sponsored transaction (requires Private API Key)
 * 3. User signs the transaction
 * 4. Call Enoki API to execute the sponsored transaction
 */
export default function SponsoredTransactionDemo() {
  const currentAccount = useCurrentAccount();
  const { mutateAsync: signTransaction } = useSignTransaction();
  const suiClient = useSuiClient();
  
  const [recipient, setRecipient] = useState('');
  const [transferRecipient, setTransferRecipient] = useState('');
  const [transferAmount, setTransferAmount] = useState('0.01');
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  // Note: In production, sponsored transactions should be handled via backend API
  // For demo purposes, we use it directly in frontend (not recommended for production)
  const enokiClient = new EnokiClient({
    apiKey: import.meta.env.VITE_ENOKI_PUBLIC_KEY,
  });

  const handleSponsoredTransaction = async () => {
    if (!currentAccount) {
      setResult({ success: false, message: 'Please login first' });
      return;
    }

    if (!recipient) {
      setResult({ success: false, message: 'Please enter recipient address' });
      return;
    }

    try {
      setIsLoading(true);
      setResult(null);

      console.log('📝 Creating sponsored transaction...');

      // Step 1: Create transaction (only transaction content)
      const tx = new Transaction();
      
      // Note: In sponsored transactions, you cannot use tx.gas (GasCoin) as parameter
      // because gas is provided by the sponsor
      // Here we just call a simple Move Call as demo
      
      // Example: Create a simple event (no token transfer needed)
      // In real applications, you can call any contract method that doesn't require user's SUI
      tx.moveCall({
        target: '0x2::clock::timestamp_ms',
        arguments: [tx.object('0x6')], // Clock object
      });

      // Step 2: Build transaction (only get transaction kind, no gas info)
      const txBytes = await tx.build({
        client: suiClient as any, // Type cast to avoid version mismatch
        onlyTransactionKind: true, // Key: only build transaction kind
      });

      console.log('📤 Requesting Enoki sponsored transaction...');

      // Step 3: Call Enoki API to create sponsored transaction
      // Note: allowedMoveCallTargets should be configured in Enoki Portal, not passed here
      const sponsoredResponse = await enokiClient.createSponsoredTransaction({
        network: 'testnet',
        transactionKindBytes: toB64(txBytes),
        sender: currentAccount.address,
      });

      console.log('✅ Sponsored transaction created:', sponsoredResponse);

      // Step 4: User signs the transaction
      console.log('✍️ Requesting user signature...');
      
      // signTransaction can accept base64 string
      const { signature } = await signTransaction({
        transaction: sponsoredResponse.bytes,
      });

      if (!signature) {
        throw new Error('Signature failed');
      }

      console.log('📨 Executing sponsored transaction...');

      // Step 5: Execute sponsored transaction
      const executeResponse = await enokiClient.executeSponsoredTransaction({
        digest: sponsoredResponse.digest,
        signature,
      });

      console.log('🎉 Sponsored transaction successful:', executeResponse);

      setResult({
        success: true,
        message: `Sponsored transaction successful!\n\nDigest: ${executeResponse.digest}\n\nRecipient: ${recipient}\n\nUser paid no gas fees!`,
      });

    } catch (error: any) {
      console.error('❌ Sponsored transaction failed:', error);
      setResult({
        success: false,
        message: `Sponsored transaction failed: ${error.message}`,
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Sponsored Transfer: User transfers their own SUI to others, gas fee sponsored by Enoki
  const handleSponsoredTransfer = async () => {
    if (!currentAccount) {
      setResult({ success: false, message: 'Please login first' });
      return;
    }

    if (!transferRecipient) {
      setResult({ success: false, message: 'Please enter recipient address' });
      return;
    }

    const amountNum = parseFloat(transferAmount);
    if (isNaN(amountNum) || amountNum <= 0) {
      setResult({ success: false, message: 'Please enter a valid amount' });
      return;
    }

    try {
      setIsLoading(true);
      setResult(null);

      console.log('📝 Creating sponsored transfer transaction...');
      console.log(`   Recipient: ${transferRecipient}`);
      console.log(`   Amount: ${transferAmount} SUI`);

      // Step 1: Get user's SUI coins
      const coins = await suiClient.getCoins({
        owner: currentAccount.address,
        coinType: '0x2::sui::SUI',
      });

      if (coins.data.length === 0) {
        throw new Error('You have no SUI tokens to transfer');
      }

      // Convert amount to MIST (1 SUI = 10^9 MIST)
      const amountInMist = BigInt(Math.floor(amountNum * 1_000_000_000));

      // Step 2: Create transaction
      const tx = new Transaction();
      
      // Use user's own coin for transfer (not tx.gas)
      // Find a coin with sufficient balance
      const coinToUse = coins.data.find(
        (coin) => BigInt(coin.balance) >= amountInMist
      );

      if (!coinToUse) {
        throw new Error(`Insufficient balance. Need ${transferAmount} SUI, but no single coin has enough balance.`);
      }

      // Split the transfer amount from user's coin
      const [coinToTransfer] = tx.splitCoins(tx.object(coinToUse.coinObjectId), [amountInMist]);
      tx.transferObjects([coinToTransfer], transferRecipient);

      // Step 3: Build transaction (only get transaction kind)
      const txBytes = await tx.build({
        client: suiClient as any,
        onlyTransactionKind: true,
      });

      console.log('📤 Requesting Enoki sponsored transaction...');

      // Step 4: Create sponsored transaction
      const sponsoredResponse = await enokiClient.createSponsoredTransaction({
        network: 'testnet',
        transactionKindBytes: toB64(txBytes),
        sender: currentAccount.address,
        allowedAddresses: [transferRecipient, currentAccount.address],
      });

      console.log('✅ Sponsored transaction created:', sponsoredResponse);

      // Step 5: User signs
      console.log('✍️ Requesting user signature...');
      const { signature } = await signTransaction({
        transaction: sponsoredResponse.bytes,
      });

      if (!signature) {
        throw new Error('Signature failed');
      }

      console.log('📨 Executing sponsored transaction...');

      // Step 6: Execute transaction
      const executeResponse = await enokiClient.executeSponsoredTransaction({
        digest: sponsoredResponse.digest,
        signature,
      });

      setResult({
        success: true,
        message: `✅ Sponsored transfer successful!\n\n💰 Amount: ${transferAmount} SUI\n📬 Recipient: ${transferRecipient.slice(0, 10)}...${transferRecipient.slice(-8)}\n\n🎁 Gas fee sponsored by Enoki!\n\n📋 Digest: ${executeResponse.digest}`,
      });

    } catch (error: any) {
      console.error('❌ Sponsored transfer failed:', error);
      setResult({
        success: false,
        message: `Sponsored transfer failed: ${error.message}`,
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Example: Create a simple Move Call sponsored transaction
  const handleSponsoredMoveCall = async () => {
    if (!currentAccount) {
      setResult({ success: false, message: 'Please login first' });
      return;
    }

    try {
      setIsLoading(true);
      setResult(null);

      console.log('📝 Creating Move Call sponsored transaction...');

      const tx = new Transaction();
      
      // Example: Call Sui's clock module (just for demo, no tokens needed)
      // This is a read-only operation to demonstrate sponsored transactions
      tx.moveCall({
        target: '0x2::clock::timestamp_ms',
        arguments: [tx.object('0x6')], // Clock object
      });

      const txBytes = await tx.build({
        client: suiClient as any, // Type cast to avoid version mismatch
        onlyTransactionKind: true,
      });

      // Note: allowedMoveCallTargets should be configured in Enoki Portal
      const sponsoredResponse = await enokiClient.createSponsoredTransaction({
        network: 'testnet',
        transactionKindBytes: toB64(txBytes),
        sender: currentAccount.address,
      });

      console.log('✅ Sponsored transaction created');

      // signTransaction can accept base64 string
      const { signature } = await signTransaction({
        transaction: sponsoredResponse.bytes,
      });

      if (!signature) {
        throw new Error('Signature failed');
      }

      const executeResponse = await enokiClient.executeSponsoredTransaction({
        digest: sponsoredResponse.digest,
        signature,
      });

      setResult({
        success: true,
        message: `Move Call sponsored transaction successful!\n\nDigest: ${executeResponse.digest}\n\nGas fee paid by developer!`,
      });

    } catch (error: any) {
      console.error('❌ Sponsored transaction failed:', error);
      setResult({
        success: false,
        message: `Sponsored transaction failed: ${error.message}`,
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (!currentAccount) {
    return null;
  }

  return (
    <div style={styles.container}>
      <h3 style={styles.title}>🎁 Sponsored Transaction Demo</h3>
      <p style={styles.description}>
        Sponsored transactions allow users to interact without holding SUI. Gas fees are paid by the developer.
      </p>

      {/* Sponsored Transaction Example */}
      <div style={styles.section}>
        <h4 style={styles.sectionTitle}>💸 Sponsored Transaction Example</h4>
        <p style={styles.hint}>
          This example shows how to create a sponsored transaction. Enter an address as reference.
        </p>
        <div style={styles.form}>
          <div style={styles.inputGroup}>
            <label style={styles.label}>Reference Address (for logs)</label>
            <input
              type="text"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              placeholder="0x..."
              style={styles.input}
              disabled={isLoading}
            />
          </div>

          <button
            onClick={handleSponsoredTransaction}
            disabled={isLoading || !recipient}
            style={{
              ...styles.button,
              ...styles.sponsorButton,
              ...(isLoading || !recipient ? styles.buttonDisabled : {}),
            }}
          >
            {isLoading ? 'Processing...' : 'Execute Sponsored Transaction'}
          </button>
        </div>
      </div>

      {/* Sponsored Transfer to Others */}
      <div style={styles.section}>
        <h4 style={styles.sectionTitle}>💸 Sponsored Transfer (to Others)</h4>
        <p style={styles.hint}>
          Transfer your own SUI to others, but gas fee is sponsored by Enoki!
          <br />
          <strong>Note:</strong> You need sufficient SUI balance to transfer.
        </p>
        <div style={styles.form}>
          <div style={styles.inputGroup}>
            <label style={styles.label}>Recipient Address</label>
            <input
              type="text"
              value={transferRecipient}
              onChange={(e) => setTransferRecipient(e.target.value)}
              placeholder="0x..."
              style={styles.input}
              disabled={isLoading}
            />
          </div>
          <div style={styles.inputGroup}>
            <label style={styles.label}>Transfer Amount (SUI)</label>
            <input
              type="number"
              value={transferAmount}
              onChange={(e) => setTransferAmount(e.target.value)}
              placeholder="0.01"
              step="0.001"
              min="0.001"
              style={styles.input}
              disabled={isLoading}
            />
          </div>

          <button
            onClick={handleSponsoredTransfer}
            disabled={isLoading || !transferRecipient || !transferAmount}
            style={{
              ...styles.button,
              ...styles.transferButton,
              ...(isLoading || !transferRecipient || !transferAmount ? styles.buttonDisabled : {}),
            }}
          >
            {isLoading ? 'Processing...' : `Sponsored Transfer ${transferAmount} SUI`}
          </button>
        </div>
      </div>

      {/* Sponsored Move Call */}
      <div style={styles.section}>
        <h4 style={styles.sectionTitle}>⚡ Sponsored Move Call (Get Timestamp)</h4>
        <p style={styles.hint}>
          This example calls Sui Clock module to get current timestamp, demonstrating sponsored Move Call.
        </p>
        <button
          onClick={handleSponsoredMoveCall}
          disabled={isLoading}
          style={{
            ...styles.button,
            ...styles.moveCallButton,
            ...(isLoading ? styles.buttonDisabled : {}),
          }}
        >
          {isLoading ? 'Processing...' : 'Execute Sponsored Move Call'}
        </button>
      </div>

      {/* 結果顯示 */}
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

      {/* Explanation */}
      <div style={styles.note}>
        <p style={styles.noteTitle}>📚 Sponsored Transaction Guide</p>
        <ul style={styles.noteList}>
          <li><strong>What is a sponsored transaction?</strong> A transaction where the developer pays gas fees for users</li>
          <li><strong>Use case:</strong> Let new users experience dApp without buying SUI</li>
          <li><strong>Security:</strong> Can restrict allowed Move calls and addresses</li>
          <li><strong>Production:</strong> Should handle sponsorship logic via backend API</li>
        </ul>
      </div>

      {/* Code Steps */}
      <div style={styles.codeNote}>
        <p style={styles.noteTitle}>💻 Key Code Steps</p>
        <ol style={styles.noteList}>
          <li>Create Transaction and set transaction content</li>
          <li>Build with <code>onlyTransactionKind: true</code></li>
          <li>Call <code>enokiClient.createSponsoredTransaction()</code></li>
          <li>User signs the transaction</li>
          <li>Call <code>enokiClient.executeSponsoredTransaction()</code></li>
        </ol>
      </div>
    </div>
  );
}

const styles = {
  container: {
    backgroundColor: '#f0f9ff',
    borderRadius: '12px',
    padding: '24px',
    marginTop: '24px',
    border: '2px solid #0ea5e9',
  },
  title: {
    fontSize: '20px',
    fontWeight: '600',
    color: '#0369a1',
    marginBottom: '8px',
  },
  description: {
    fontSize: '14px',
    color: '#0c4a6e',
    marginBottom: '20px',
  },
  section: {
    backgroundColor: 'white',
    borderRadius: '8px',
    padding: '16px',
    marginBottom: '16px',
  },
  sectionTitle: {
    fontSize: '16px',
    fontWeight: '600',
    color: '#1a202c',
    marginBottom: '12px',
  },
  form: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '12px',
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
  },
  hint: {
    fontSize: '13px',
    color: '#64748b',
    marginBottom: '12px',
  },
  button: {
    padding: '14px 24px',
    fontSize: '16px',
    fontWeight: '600',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  sponsorButton: {
    backgroundColor: '#0ea5e9',
  },
  transferButton: {
    backgroundColor: '#10b981',
  },
  moveCallButton: {
    backgroundColor: '#8b5cf6',
  },
  buttonDisabled: {
    backgroundColor: '#cbd5e0',
    cursor: 'not-allowed',
  },
  result: {
    padding: '16px',
    borderRadius: '8px',
    marginBottom: '16px',
  },
  resultSuccess: {
    backgroundColor: '#d1fae5',
    borderLeft: '4px solid #10b981',
  },
  resultError: {
    backgroundColor: '#fee2e2',
    borderLeft: '4px solid #ef4444',
  },
  resultText: {
    margin: 0,
    fontSize: '13px',
    fontFamily: 'monospace',
    whiteSpace: 'pre-wrap' as const,
    wordBreak: 'break-all' as const,
    color: '#1f2937',
  },
  note: {
    backgroundColor: '#fef3c7',
    borderRadius: '8px',
    padding: '16px',
    marginBottom: '12px',
  },
  codeNote: {
    backgroundColor: '#e0e7ff',
    borderRadius: '8px',
    padding: '16px',
  },
  noteTitle: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: '8px',
  },
  noteList: {
    paddingLeft: '20px',
    fontSize: '13px',
    color: '#374151',
    lineHeight: '1.8',
    margin: 0,
  },
} as const;
