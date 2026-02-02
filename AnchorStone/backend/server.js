import express from 'express';
import dotenv from 'dotenv';
import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { onboardNewProperty } from './deployProperty.js';
import vaultRegistry from './vaultRegistry.js';
import deepBookListener from './deepbookListener.js';
import buybackExecutor from './buybackExecutor.js';

dotenv.config();

const app = express();
app.use(express.json());

// Enable CORS for frontend requests
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

// Initialize Sui client for health checks
const suiClient = new SuiClient({ url: getFullnodeUrl(process.env.NETWORK || 'testnet') });

// Load keypair for balance checks
let deployerKeypair = null;
let deployerAddress = null;
try {
    if (process.env.SUI_PRIVATE_KEY) {
        const privateKey = process.env.SUI_PRIVATE_KEY;

        // Support both Bech32 (suiprivkey1...) and hex formats
        if (privateKey.startsWith('suiprivkey')) {
            deployerKeypair = Ed25519Keypair.fromSecretKey(privateKey);
        } else {
            deployerKeypair = Ed25519Keypair.fromSecretKey(Buffer.from(privateKey, 'hex'));
        }

        deployerAddress = deployerKeypair.getPublicKey().toSuiAddress();
    }
} catch (error) {
    console.warn('⚠️  Warning: Could not load deployer keypair for health checks');
    console.warn('   Error:', error.message);
}

// In-memory storage (replace with database in production)
const properties = new Map();

/**
 * API: Create new property and deploy token
 */
app.post('/api/properties', async (req, res) => {
    try {
        const propertyData = req.body;

        // Validate input
        if (!propertyData.name || !propertyData.propertyValue || !propertyData.location) {
            return res.status(400).json({
                error: 'Missing required fields: name, propertyValue, location'
            });
        }

        // Generate unique ID
        propertyData.id = `prop_${Date.now()}`;

        console.log(`\n📥 Received property creation request: ${propertyData.name}`);

        // Deploy token and create vault
        const result = await onboardNewProperty(propertyData);

        // Store in database/memory
        properties.set(propertyData.id, {
            ...propertyData,
            ...result,
            createdAt: new Date().toISOString()
        });

        res.json({
            success: true,
            property: properties.get(propertyData.id)
        });

    } catch (error) {
        console.error('Error creating property:', error);
        res.status(500).json({
            error: 'Failed to create property',
            message: error.message
        });
    }
});

/**
 * API: Get all properties
 */
app.get('/api/properties', (req, res) => {
    const allProperties = Array.from(properties.values());
    res.json({
        success: true,
        count: allProperties.length,
        properties: allProperties
    });
});

/**
 * API: Get property by ID
 */
app.get('/api/properties/:id', (req, res) => {
    const property = properties.get(req.params.id);

    if (!property) {
        return res.status(404).json({
            error: 'Property not found'
        });
    }

    res.json({
        success: true,
        property
    });
});

/**
 * API: Generate bytecode for token contract (for frontend deployment)
 * POST /api/generate-bytecode
 * Body: { propertyId, name, description }
 */
app.post('/api/generate-bytecode', async (req, res) => {
    try {
        const { propertyId, name, description } = req.body;

        if (!propertyId || !name) {
            return res.status(400).json({
                error: 'Missing required fields: propertyId, name'
            });
        }

        console.log(`\n📥 Received bytecode generation request for: ${name}`);

        const { generateBytecode } = await import('./deployProperty.js');

        const propertyData = {
            id: propertyId,
            name,
            description: description || `Fractional ownership token for ${name}`
        };

        const result = await generateBytecode(propertyData);

        res.json({
            success: true,
            ...result
        });

    } catch (error) {
        console.error('Error generating bytecode:', error);
        res.status(500).json({
            error: 'Failed to generate bytecode',
            message: error.message
        });
    }
});

// ========================================
// Individual Test APIs
// ========================================

/**
 * API: Test Step 1 - Generate and Deploy Token Contract
 * POST /api/test/deploy-token
 * Body: { propertyId: "prop001", propertyName: "Test Property" }
 */
app.post('/api/test/deploy-token', async (req, res) => {
    try {
        const { propertyId, propertyName, symbol } = req.body;

        if (!propertyId || !propertyName) {
            return res.status(400).json({
                error: 'Missing required fields: propertyId, propertyName'
            });
        }

        const { generateTokenContract, deployTokenContract } = await import('./deployProperty.js');

        // Generate contract
        const propertyData = {
            id: propertyId,
            name: propertyName
        };

        const { content, moduleName, structName, symbol: generatedSymbol } = generateTokenContract(propertyData);

        // Deploy contract
        const deployment = await deployTokenContract(content, moduleName);
        const tokenType = `${deployment.packageId}::${moduleName}::${structName}`;

        res.json({
            success: true,
            step: 'deploy-token',
            result: {
                packageId: deployment.packageId,
                treasuryCapId: deployment.treasuryCapId,
                tokenType,
                moduleName,
                structName,
                symbol: symbol || generatedSymbol,
                transactionDigest: deployment.transactionDigest
            }
        });

    } catch (error) {
        console.error('Error deploying token:', error);
        res.status(500).json({
            error: 'Failed to deploy token',
            message: error.message
        });
    }
});

/**
 * API: Test Step 2 - Mint PropertyNFT
 * POST /api/test/mint-nft
 * Body: { name, description, imageUrl, propertyValue, location }
 */
app.post('/api/test/mint-nft', async (req, res) => {
    try {
        const { name, description, imageUrl, propertyValue, location } = req.body;

        if (!name || !propertyValue || !location) {
            return res.status(400).json({
                error: 'Missing required fields: name, propertyValue, location'
            });
        }

        const { mintPropertyNFT } = await import('./deployProperty.js');
        const { Ed25519Keypair } = await import('@mysten/sui/keypairs/ed25519');

        // Load keypair
        const privateKey = process.env.SUI_PRIVATE_KEY;
        const keypair = privateKey.startsWith('suiprivkey')
            ? Ed25519Keypair.fromSecretKey(privateKey)
            : Ed25519Keypair.fromSecretKey(Buffer.from(privateKey, 'hex'));

        const propertyData = {
            name,
            description: description || `Property: ${name}`,
            imageUrl: imageUrl || 'https://example.com/default.jpg',
            propertyValue,
            location
        };

        const nftId = await mintPropertyNFT(propertyData, keypair);

        res.json({
            success: true,
            step: 'mint-nft',
            result: {
                nftId,
                propertyData
            }
        });

    } catch (error) {
        console.error('Error minting NFT:', error);
        res.status(500).json({
            error: 'Failed to mint NFT',
            message: error.message
        });
    }
});

/**
 * API: Test Step 3 - Prepare Reserve Coin
 * POST /api/test/prepare-reserve
 * Body: { amount: 1000000000 } // Amount in MIST
 */
app.post('/api/test/prepare-reserve', async (req, res) => {
    try {
        const { amount } = req.body;

        if (!amount) {
            return res.status(400).json({
                error: 'Missing required field: amount (in MIST)'
            });
        }

        const { prepareReserveCoin } = await import('./deployProperty.js');
        const { Ed25519Keypair } = await import('@mysten/sui/keypairs/ed25519');

        // Load keypair
        const privateKey = process.env.SUI_PRIVATE_KEY;
        const keypair = privateKey.startsWith('suiprivkey')
            ? Ed25519Keypair.fromSecretKey(privateKey)
            : Ed25519Keypair.fromSecretKey(Buffer.from(privateKey, 'hex'));

        const coinId = await prepareReserveCoin(amount, keypair);

        res.json({
            success: true,
            step: 'prepare-reserve',
            result: {
                coinId,
                amount,
                amountInSui: (amount / 1_000_000_000).toFixed(4)
            }
        });

    } catch (error) {
        console.error('Error preparing reserve coin:', error);
        res.status(500).json({
            error: 'Failed to prepare reserve coin',
            message: error.message
        });
    }
});

/**
 * API: Test Step 4 - Create Vault
 * POST /api/test/create-vault
 * Body: {
 *   nftId,
 *   treasuryCapId,
 *   tokenType,
 *   reserveCoinId,
 *   totalSupply,
 *   tokenName,
 *   tokenSymbol,
 *   tokenDecimals
 * }
 */
app.post('/api/test/create-vault', async (req, res) => {
    try {
        const {
            nftId,
            treasuryCapId,
            tokenType,
            reserveCoinId,
            totalSupply,
            tokenName,
            tokenSymbol,
            tokenDecimals
        } = req.body;

        if (!nftId || !treasuryCapId || !tokenType || !reserveCoinId || !totalSupply) {
            return res.status(400).json({
                error: 'Missing required fields: nftId, treasuryCapId, tokenType, reserveCoinId, totalSupply'
            });
        }

        const { createVaultWithRegisteredToken } = await import('./deployProperty.js');
        const { Ed25519Keypair } = await import('@mysten/sui/keypairs/ed25519');

        // Load keypair
        const privateKey = process.env.SUI_PRIVATE_KEY;
        const keypair = privateKey.startsWith('suiprivkey')
            ? Ed25519Keypair.fromSecretKey(privateKey)
            : Ed25519Keypair.fromSecretKey(Buffer.from(privateKey, 'hex'));

        const vaultId = await createVaultWithRegisteredToken(
            nftId,
            treasuryCapId,
            tokenType,
            tokenName || 'Property Token',
            tokenSymbol || 'PROP',
            tokenDecimals || 6,
            reserveCoinId,
            totalSupply,
            keypair
        );

        res.json({
            success: true,
            step: 'create-vault',
            result: {
                vaultId,
                nftId,
                treasuryCapId,
                tokenType,
                totalSupply
            }
        });

    } catch (error) {
        console.error('Error creating vault:', error);
        res.status(500).json({
            error: 'Failed to create vault',
            message: error.message
        });
    }
});

/**
 * Health check - comprehensive system status
 */
app.get('/health', async (req, res) => {
    const startTime = Date.now();
    const health = {
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: {
            network: process.env.NETWORK || 'not configured',
            mainPackageId: process.env.MAIN_PACKAGE_ID || 'not configured',
            tokenRegistryId: process.env.TOKEN_REGISTRY_ID || 'not configured',
            nodeVersion: process.version
        },
        checks: {}
    };

    // Check 1: Configuration
    health.checks.configuration = {
        status: 'ok',
        details: {
            hasPrivateKey: !!process.env.SUI_PRIVATE_KEY,
            hasMainPackage: !!process.env.MAIN_PACKAGE_ID,
            hasTokenRegistry: !!process.env.TOKEN_REGISTRY_ID,
            deployerAddress: deployerAddress || 'not available'
        }
    };

    if (!process.env.SUI_PRIVATE_KEY || !process.env.MAIN_PACKAGE_ID) {
        health.checks.configuration.status = 'warning';
        health.checks.configuration.message = 'Missing required configuration';
        health.status = 'degraded';
    }

    // Check 2: Sui Network Connectivity
    try {
        const chainId = await suiClient.getChainIdentifier();
        const latestCheckpoint = await suiClient.getLatestCheckpointSequenceNumber();

        health.checks.suiNetwork = {
            status: 'ok',
            details: {
                chainId,
                latestCheckpoint: latestCheckpoint.toString(),
                connected: true
            }
        };
    } catch (error) {
        health.checks.suiNetwork = {
            status: 'error',
            message: 'Failed to connect to Sui network',
            error: error.message
        };
        health.status = 'error';
    }

    // Check 3: Deployer Wallet Balance
    if (deployerAddress) {
        try {
            const balance = await suiClient.getBalance({
                owner: deployerAddress,
                coinType: '0x2::sui::SUI'
            });

            const balanceInSui = parseInt(balance.totalBalance) / 1_000_000_000;
            const isLowBalance = balanceInSui < 0.1;

            health.checks.deployerWallet = {
                status: isLowBalance ? 'warning' : 'ok',
                details: {
                    address: deployerAddress,
                    balance: balanceInSui.toFixed(4) + ' SUI',
                    balanceMist: balance.totalBalance
                }
            };

            if (isLowBalance) {
                health.checks.deployerWallet.message = 'Low balance - may not be able to deploy contracts';
                health.status = health.status === 'ok' ? 'degraded' : health.status;
            }
        } catch (error) {
            health.checks.deployerWallet = {
                status: 'error',
                message: 'Failed to fetch wallet balance',
                error: error.message
            };
            if (health.status === 'ok') health.status = 'degraded';
        }
    } else {
        health.checks.deployerWallet = {
            status: 'warning',
            message: 'Deployer keypair not configured'
        };
        if (health.status === 'ok') health.status = 'degraded';
    }

    // Check 4: Main Package Status
    if (process.env.MAIN_PACKAGE_ID) {
        try {
            const packageObj = await suiClient.getObject({
                id: process.env.MAIN_PACKAGE_ID,
                options: { showContent: true }
            });

            health.checks.mainPackage = {
                status: packageObj.data ? 'ok' : 'error',
                details: {
                    packageId: process.env.MAIN_PACKAGE_ID,
                    exists: !!packageObj.data,
                    type: packageObj.data?.type || 'unknown'
                }
            };

            if (!packageObj.data) {
                health.checks.mainPackage.message = 'Main package not found on chain';
                health.status = 'error';
            }
        } catch (error) {
            health.checks.mainPackage = {
                status: 'error',
                message: 'Failed to verify main package',
                error: error.message
            };
            health.status = 'error';
        }
    }

    // Check 5: Service Statistics
    health.checks.service = {
        status: 'ok',
        details: {
            propertiesCreated: properties.size,
            memoryUsage: {
                heapUsed: (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2) + ' MB',
                heapTotal: (process.memoryUsage().heapTotal / 1024 / 1024).toFixed(2) + ' MB'
            },
            responseTime: (Date.now() - startTime) + 'ms'
        }
    };

    // Set HTTP status based on overall health
    const statusCode = health.status === 'ok' ? 200 :
        health.status === 'degraded' ? 200 : 503;

    res.status(statusCode).json(health);
});

/**
 * Simple liveness probe (for k8s/docker)
 */
app.get('/health/live', (req, res) => {
    res.json({ status: 'alive' });
});

/**
 * Readiness probe (for k8s/docker)
 */
app.get('/health/ready', async (req, res) => {
    const isReady = process.env.SUI_PRIVATE_KEY &&
        process.env.MAIN_PACKAGE_ID &&
        deployerAddress;

    if (isReady) {
        res.json({ status: 'ready' });
    } else {
        res.status(503).json({
            status: 'not ready',
            message: 'Missing required configuration'
        });
    }
});

const PORT = process.env.PORT || 3000;

// ====== DeepBook Integration APIs ======

/**
 * API: Register DeepBook Pool for a Vault
 */
app.post('/api/vaults/register-pool', async (req, res) => {
    try {
        const { vaultId, poolId, balanceManagerId, coinType, floorPrice, owner } = req.body;

        if (!vaultId || !poolId) {
            return res.status(400).json({
                error: 'Missing required fields: vaultId, poolId'
            });
        }

        // 轉換 floorPrice 到 6 位小數
        const floorPriceRaw = Math.floor(parseFloat(floorPrice || 1) * 1_000_000);

        const entry = vaultRegistry.registerPool(poolId, {
            vaultId,
            balanceManagerId,
            coinType,
            floorPrice: floorPriceRaw,
            owner,
        });

        res.json({
            success: true,
            message: 'Pool registered successfully',
            data: entry,
        });

    } catch (error) {
        console.error('Error registering pool:', error);
        res.status(500).json({
            error: 'Failed to register pool',
            message: error.message
        });
    }
});

/**
 * API: Get Vault's DeepBook info
 */
app.get('/api/vaults/:vaultId/deepbook', (req, res) => {
    try {
        const { vaultId } = req.params;
        const info = vaultRegistry.getPoolByVaultId(vaultId);

        if (!info) {
            return res.status(404).json({
                error: 'Vault not found or no pool registered'
            });
        }

        res.json({
            success: true,
            data: {
                poolId: info.poolId,
                balanceManagerId: info.balanceManagerId,
                coinType: info.coinType,
                floorPrice: info.floorPrice / 1_000_000,
                lastTradePrice: info.lastTradePrice / 1_000_000,
                buybackCount: info.buybackCount,
                totalBuybackAmount: info.totalBuybackAmount / 1_000_000,
            },
        });

    } catch (error) {
        res.status(500).json({
            error: 'Failed to get DeepBook info',
            message: error.message
        });
    }
});

/**
 * API: Get all registered pools
 */
app.get('/api/deepbook/pools', (req, res) => {
    try {
        const pools = vaultRegistry.getAllPools();
        res.json({
            success: true,
            count: pools.length,
            pools: pools.map(p => ({
                poolId: p.poolId,
                vaultId: p.vaultId,
                floorPrice: p.floorPrice / 1_000_000,
                lastTradePrice: p.lastTradePrice / 1_000_000,
                buybackCount: p.buybackCount,
            })),
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * API: Get listener status
 */
app.get('/api/deepbook/listener/status', (req, res) => {
    res.json({
        success: true,
        listener: deepBookListener.getStatus(),
        executor: buybackExecutor.getStats(),
        registry: vaultRegistry.getStats(),
    });
});

/**
 * API: Start listener
 */
app.post('/api/deepbook/listener/start', async (req, res) => {
    try {
        await deepBookListener.start();
        res.json({ success: true, message: 'Listener started' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * API: Stop listener
 */
app.post('/api/deepbook/listener/stop', (req, res) => {
    try {
        deepBookListener.stop();
        res.json({ success: true, message: 'Listener stopped' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * API: Manually add Pool to listener
 */
app.post('/api/deepbook/listener/add-pool', async (req, res) => {
    try {
        const { poolId, balanceManagerId, vaultId, coinType, floorPrice } = req.body;

        if (!poolId) {
            return res.status(400).json({ error: 'Missing poolId' });
        }

        const poolConfig = await deepBookListener.addManualPool(poolId, {
            balanceManagerId,
            vaultId,
            coinType,
            floorPrice: floorPrice ? Math.floor(parseFloat(floorPrice) * 1_000_000) : 1_000_000,
        });

        res.json({
            success: true,
            message: 'Pool added to monitoring',
            data: poolConfig,
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * API: Remove manual Pool from listener
 */
app.post('/api/deepbook/listener/remove-pool', (req, res) => {
    try {
        const { poolId } = req.body;

        if (!poolId) {
            return res.status(400).json({ error: 'Missing poolId' });
        }

        const removed = deepBookListener.removeManualPool(poolId);
        res.json({
            success: removed,
            message: removed ? 'Pool removed' : 'Pool not found',
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * API: Get manual Pools
 */
app.get('/api/deepbook/listener/manual-pools', (req, res) => {
    try {
        const pools = deepBookListener.getManualPools();
        res.json({
            success: true,
            count: pools.length,
            pools,
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * API: Get Pool order book (pending orders count)
 */
app.get('/api/deepbook/pool/:poolId/orderbook', async (req, res) => {
    try {
        const { poolId } = req.params;

        if (!poolId) {
            return res.status(400).json({ error: 'Missing poolId' });
        }

        const orderBook = await deepBookListener.getPoolOrderBook(poolId);

        if (orderBook.error) {
            return res.status(404).json({ error: orderBook.error });
        }

        res.json({
            success: true,
            data: orderBook,
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * API: Manual buyback trigger
 */
app.post('/api/buyback/manual', async (req, res) => {
    try {
        const { poolId, amount } = req.body;

        if (!poolId) {
            return res.status(400).json({ error: 'Missing poolId' });
        }

        const vaultInfo = vaultRegistry.getVaultByPoolId(poolId);
        if (!vaultInfo) {
            return res.status(404).json({ error: 'Pool not registered' });
        }

        const result = await buybackExecutor.executeBuyback({
            poolId,
            vaultId: vaultInfo.vaultId,
            currentPrice: vaultInfo.lastTradePrice,
            floorPrice: vaultInfo.floorPrice,
        });

        res.json(result);

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * API: Get buyback executions
 */
app.get('/api/buyback/executions', (req, res) => {
    res.json({
        success: true,
        executions: buybackExecutor.getExecutions(),
    });
});

// ====== Server Startup ======

// Setup buyback trigger callback
deepBookListener.onBuybackTrigger = async (params) => {
    console.log('\n🚨 Buyback triggered from listener!');
    await buybackExecutor.executeBuyback(params);
};

app.listen(PORT, () => {
    console.log('\n========================================');
    console.log('🚀 AnchorStone Backend Server');
    console.log('========================================');
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Network: ${process.env.NETWORK}`);
    console.log(`Main Package: ${process.env.MAIN_PACKAGE_ID || 'Not set'}`);
    console.log('========================================');
    console.log('\n🎧 DeepBook Listener: Ready');
    console.log('💰 Buyback Executor: ' + (buybackExecutor.enabled ? 'Enabled' : 'Disabled'));
    console.log(`📁 Registered Pools: ${vaultRegistry.getMonitoredPoolIds().length}`);
    console.log('========================================\n');

    // Auto-start listener if enabled
    if (process.env.AUTO_START_LISTENER === 'true') {
        console.log('🚀 Auto-starting DeepBook listener...');
        deepBookListener.start();
    }
});
