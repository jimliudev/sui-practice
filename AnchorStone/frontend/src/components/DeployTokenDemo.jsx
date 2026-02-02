import { useState } from 'react'
import { useCurrentAccount, useSignTransaction } from '@mysten/dapp-kit'
import { useContractDeployment } from '../hooks/useContractDeployment'

/**
 * Demo component for testing contract deployment
 * This shows how to use the useContractDeployment hook
 */
export default function DeployTokenDemo() {
    const currentAccount = useCurrentAccount()
    const { mutateAsync: signTransaction } = useSignTransaction()
    const { deployContract, isGenerating, isDeploying, error, deploymentResult, reset } = useContractDeployment()

    const [formData, setFormData] = useState({
        propertyId: `prop_${Date.now()}`,
        name: '',
        description: '',
    })

    const handleDeploy = async (e) => {
        e.preventDefault()

        if (!currentAccount) {
            alert('Please connect your wallet first')
            return
        }

        try {
            const result = await deployContract(
                formData,
                currentAccount.address,
                signTransaction
            )

            console.log('Deployment successful:', result)
        } catch (err) {
            console.error('Deployment failed:', err)
        }
    }

    return (
        <div style={{ padding: '20px', maxWidth: '600px', margin: '0 auto' }}>
            <h2>🪙 Deploy Property Token</h2>
            <p style={{ color: '#666' }}>
                This demo shows how to deploy a Move contract from the frontend using wallet signature.
            </p>

            {!currentAccount && (
                <div style={{ padding: '15px', background: '#fff3cd', borderRadius: '8px', marginBottom: '20px' }}>
                    ⚠️ Please connect your wallet to continue
                </div>
            )}

            <form onSubmit={handleDeploy} style={{ marginTop: '20px' }}>
                <div style={{ marginBottom: '15px' }}>
                    <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                        Property ID
                    </label>
                    <input
                        type="text"
                        value={formData.propertyId}
                        onChange={(e) => setFormData({ ...formData, propertyId: e.target.value })}
                        style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ddd' }}
                        required
                    />
                </div>

                <div style={{ marginBottom: '15px' }}>
                    <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                        Property Name
                    </label>
                    <input
                        type="text"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        placeholder="e.g., Taipei Suite A1"
                        style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ddd' }}
                        required
                    />
                </div>

                <div style={{ marginBottom: '15px' }}>
                    <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                        Description (Optional)
                    </label>
                    <textarea
                        value={formData.description}
                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                        placeholder="Fractional ownership token for..."
                        style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ddd', minHeight: '80px' }}
                    />
                </div>

                <button
                    type="submit"
                    disabled={!currentAccount || isGenerating || isDeploying}
                    style={{
                        width: '100%',
                        padding: '12px',
                        background: isGenerating || isDeploying ? '#ccc' : '#0066ff',
                        color: 'white',
                        border: 'none',
                        borderRadius: '8px',
                        fontSize: '16px',
                        fontWeight: 'bold',
                        cursor: isGenerating || isDeploying ? 'not-allowed' : 'pointer',
                    }}
                >
                    {isGenerating && '🔧 Generating Bytecode...'}
                    {isDeploying && '📦 Deploying Contract...'}
                    {!isGenerating && !isDeploying && '🚀 Deploy Token Contract'}
                </button>
            </form>

            {error && (
                <div style={{ marginTop: '20px', padding: '15px', background: '#f8d7da', borderRadius: '8px', color: '#721c24' }}>
                    <strong>❌ Error:</strong> {error}
                    <button
                        onClick={reset}
                        style={{ marginLeft: '10px', padding: '5px 10px', cursor: 'pointer' }}
                    >
                        Retry
                    </button>
                </div>
            )}

            {deploymentResult && (
                <div style={{ marginTop: '20px', padding: '15px', background: '#d4edda', borderRadius: '8px', color: '#155724' }}>
                    <h3>✅ Deployment Successful!</h3>
                    <div style={{ marginTop: '10px', fontSize: '14px', fontFamily: 'monospace' }}>
                        <div style={{ marginBottom: '8px' }}>
                            <strong>Package ID:</strong><br />
                            <code style={{ background: '#fff', padding: '4px 8px', borderRadius: '4px', display: 'inline-block', marginTop: '4px' }}>
                                {deploymentResult.packageId}
                            </code>
                        </div>
                        <div style={{ marginBottom: '8px' }}>
                            <strong>TreasuryCap ID:</strong><br />
                            <code style={{ background: '#fff', padding: '4px 8px', borderRadius: '4px', display: 'inline-block', marginTop: '4px' }}>
                                {deploymentResult.treasuryCapId || '⚠️ NOT FOUND - Check console logs'}
                            </code>
                        </div>
                        <div style={{ marginBottom: '8px' }}>
                            <strong>UpgradeCap ID:</strong><br />
                            <code style={{ background: '#fff', padding: '4px 8px', borderRadius: '4px', display: 'inline-block', marginTop: '4px' }}>
                                {deploymentResult.upgradeCapId || 'N/A'}
                            </code>
                        </div>
                        <div style={{ marginBottom: '8px' }}>
                            <strong>CoinMetadata ID:</strong><br />
                            <code style={{ background: '#fff', padding: '4px 8px', borderRadius: '4px', display: 'inline-block', marginTop: '4px' }}>
                                {deploymentResult.coinMetadataId || 'N/A'}
                            </code>
                        </div>
                        <div style={{ marginBottom: '8px' }}>
                            <strong>Token Type:</strong><br />
                            <code style={{ background: '#fff', padding: '4px 8px', borderRadius: '4px', display: 'inline-block', marginTop: '4px', wordBreak: 'break-all' }}>
                                {deploymentResult.tokenType}
                            </code>
                        </div>
                        <div style={{ marginBottom: '8px' }}>
                            <strong>Symbol:</strong> {deploymentResult.symbol}
                        </div>
                        <div style={{ marginBottom: '12px' }}>
                            <strong>Transaction:</strong><br />
                            <a
                                href={`https://testnet.suivision.xyz/txblock/${deploymentResult.digest}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{ color: '#0066ff' }}
                            >
                                View on Explorer →
                            </a>
                        </div>

                        {/* Show all created objects for debugging */}
                        {deploymentResult.allCreatedObjects && deploymentResult.allCreatedObjects.length > 0 && (
                            <details style={{ marginTop: '12px', padding: '10px', background: '#fff', borderRadius: '4px' }}>
                                <summary style={{ cursor: 'pointer', fontWeight: 'bold' }}>
                                    🔍 All Created Objects ({deploymentResult.allCreatedObjects.length})
                                </summary>
                                <div style={{ marginTop: '8px', fontSize: '12px' }}>
                                    {deploymentResult.allCreatedObjects.map((obj, i) => (
                                        <div key={i} style={{ marginBottom: '8px', paddingBottom: '8px', borderBottom: '1px solid #eee' }}>
                                            <div><strong>#{i + 1}</strong></div>
                                            <div>Type: <code>{obj.type}</code></div>
                                            <div>ID: <code>{obj.id}</code></div>
                                            <div>Owner: <code>{JSON.stringify(obj.owner)}</code></div>
                                        </div>
                                    ))}
                                </div>
                            </details>
                        )}
                    </div>
                    <button
                        onClick={reset}
                        style={{ marginTop: '15px', padding: '8px 16px', cursor: 'pointer', borderRadius: '4px', border: '1px solid #155724', background: 'white' }}
                    >
                        Deploy Another
                    </button>
                </div>
            )}

            <div style={{ marginTop: '30px', padding: '15px', background: '#f8f9fa', borderRadius: '8px', fontSize: '14px' }}>
                <h4>ℹ️ How it works:</h4>
                <ol style={{ marginTop: '10px', paddingLeft: '20px' }}>
                    <li>Frontend sends property data to backend</li>
                    <li>Backend generates Move code and compiles to bytecode</li>
                    <li>Frontend receives bytecode and builds publish transaction</li>
                    <li>User signs transaction with their wallet</li>
                    <li>Contract is deployed to Sui network</li>
                    <li>TreasuryCap is transferred to user's wallet</li>
                </ol>
            </div>
        </div>
    )
}
