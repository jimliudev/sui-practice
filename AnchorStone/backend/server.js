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
        const { vaultId, poolId, balanceManagerId, coinType, floorPrice, minBuybackAmount, owner } = req.body;

        if (!vaultId || !poolId) {
            return res.status(400).json({
                error: 'Missing required fields: vaultId, poolId'
            });
        }

        // 轉換 floorPrice 到 6 位小數
        const floorPriceRaw = Math.floor(parseFloat(floorPrice || 1) * 1_000_000);
        const floorPriceDisplay = (floorPriceRaw / 1_000_000).toFixed(6);

        console.log('\n🏊 ====== Registering DeepBook Pool ======');
        console.log(`📋 Pool ID: ${poolId}`);
        console.log(`🏦 Vault ID: ${vaultId}`);
        console.log(`💼 Balance Manager ID: ${balanceManagerId || 'N/A'}`);
        console.log(`🪙 Coin Type: ${coinType || 'N/A'}`);
        console.log(`🛡️  Floor Price: ${floorPriceDisplay} USDC (Raw: ${floorPriceRaw})`);
        console.log(`💰 Min Buyback Amount: ${minBuybackAmount !== undefined ? minBuybackAmount + ' USDC' : 'Not set'}`);
        console.log(`👤 Owner: ${owner || 'N/A'}`);
        console.log('========================================\n');

        const entry = vaultRegistry.registerPool(poolId, {
            vaultId,
            balanceManagerId,
            coinType,
            floorPrice: floorPriceRaw,
            minBuybackAmount: minBuybackAmount !== undefined ? parseFloat(minBuybackAmount) : undefined,
            owner,
        });

        console.log('✅ Pool registered successfully!');
        console.log(`   Monitoring price for automatic buyback when below ${floorPriceDisplay} USDC`);
        console.log(`\n📊 Registered Information:`);
        console.log(`   Vault ID: ${entry.vaultId}`);
        console.log(`   Balance Manager ID: ${entry.balanceManagerId || 'Not provided'}`);
        console.log(`   Coin Type: ${entry.coinType || 'Not provided'}`);
        console.log(`   Owner: ${entry.owner || 'Not provided'}`);
        console.log(`   Registered At: ${entry.registeredAt}\n`);

        res.json({
            success: true,
            message: 'Pool registered successfully',
            data: {
                poolId: entry.poolId,
                vaultId: entry.vaultId,
                balanceManagerId: entry.balanceManagerId,
                coinType: entry.coinType,
                floorPrice: floorPriceRaw,
                floorPriceDisplay: floorPriceDisplay,
                owner: entry.owner,
                registeredAt: entry.registeredAt,
            },
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
 * API: Record Order (called by frontend after placing order)
 */
app.post('/api/orders/record', async (req, res) => {
    try {
        const { orderId, poolId, price, quantity, isBid } = req.body;

        if (!orderId || !poolId || !price) {
            return res.status(400).json({
                error: 'Missing required fields: orderId, poolId, price'
            });
        }

        // 記錄訂單到 DeepBook Listener 的緩存
        const result = deepBookListener.recordOrder({
            orderId,
            poolId,
            price,
            quantity,
            isBid,
        });

        if (result.success) {
            res.json({
                success: true,
                message: 'Order recorded successfully',
                orderId: result.orderId,
            });
        } else {
            res.status(400).json({
                success: false,
                error: result.error,
            });
        }

    } catch (error) {
        console.error('❌ Error recording order:', error);
        res.status(500).json({
            error: 'Failed to record order',
            message: error.message
        });
    }
});

/**
 * API: Manual Record Orders (for adding historical orders)
 * 
 * 支持單個訂單或批量訂單
 * 
 * 單個訂單示例:
 * POST /api/orders/manual-record
 * {
 *   "orderId": "123456789...",
 *   "poolId": "0x2281e4164e299193ff...",
 *   "price": "1000000000",
 *   "quantity": "100000000000",
 *   "isBid": false
 * }
 * 
 * 批量訂單示例:
 * POST /api/orders/manual-record
 * {
 *   "orders": [
 *     { "orderId": "123...", "poolId": "0x228...", "price": "1000000", "isBid": false },
 *     { "orderId": "456...", "poolId": "0x228...", "price": "2000000", "isBid": true }
 *   ]
 * }
 */
app.post('/api/orders/manual-record', async (req, res) => {
    try {
        const body = req.body;
        let ordersToRecord = [];

        // 檢查是單個訂單還是批量訂單
        if (body.orders && Array.isArray(body.orders)) {
            // 批量訂單
            ordersToRecord = body.orders;
        } else if (body.orderId || body.poolId) {
            // 單個訂單
            ordersToRecord = [body];
        } else {
            return res.status(400).json({
                error: 'Invalid request format',
                message: 'Provide either a single order or an array of orders',
                examples: {
                    single: { orderId: '...', poolId: '...', price: '...', isBid: false },
                    batch: { orders: [{ orderId: '...', poolId: '...', price: '...', isBid: false }] }
                }
            });
        }

        console.log(`\n📥 Manual Record Request: ${ordersToRecord.length} order(s)`);

        const results = [];
        let successCount = 0;
        let failCount = 0;

        for (const order of ordersToRecord) {
            const { orderId, poolId, price, quantity, isBid } = order;

            if (!orderId || !poolId || !price) {
                results.push({
                    orderId: orderId || 'unknown',
                    success: false,
                    error: 'Missing required fields: orderId, poolId, price'
                });
                failCount++;
                continue;
            }

            try {
                const result = deepBookListener.recordOrder({
                    orderId,
                    poolId,
                    price,
                    quantity: quantity || '0',
                    isBid: isBid !== undefined ? isBid : false,
                });

                if (result.success) {
                    results.push({
                        orderId,
                        success: true,
                        message: 'Recorded successfully'
                    });
                    successCount++;
                } else {
                    results.push({
                        orderId,
                        success: false,
                        error: result.error
                    });
                    failCount++;
                }
            } catch (err) {
                results.push({
                    orderId,
                    success: false,
                    error: err.message
                });
                failCount++;
            }
        }

        console.log(`✅ Manual record completed: ${successCount} success, ${failCount} failed\n`);

        res.json({
            success: true,
            message: `Processed ${ordersToRecord.length} order(s)`,
            summary: {
                total: ordersToRecord.length,
                success: successCount,
                failed: failCount
            },
            results
        });

    } catch (error) {
        console.error('❌ Error in manual record:', error);
        res.status(500).json({
            error: 'Failed to record orders',
            message: error.message
        });
    }
});

/**
 * API: Get Cached Orders
 * 
 * GET /api/orders/cache
 * GET /api/orders/cache?poolId=0x228...
 * GET /api/orders/cache?orderId=123...
 */
app.get('/api/orders/cache', (req, res) => {
    try {
        const { poolId, orderId } = req.query;

        if (orderId) {
            // 查詢單個訂單
            const order = deepBookListener.getCachedOrder(orderId);
            if (order) {
                res.json({
                    success: true,
                    orderId,
                    order: {
                        ...order,
                        priceDisplay: (order.price / 1_000_000).toFixed(6),
                    }
                });
            } else {
                res.status(404).json({
                    success: false,
                    error: 'Order not found in cache'
                });
            }
        } else {
            // 獲取所有緩存的訂單
            const allOrders = [];
            for (const [id, order] of deepBookListener.orderCache.entries()) {
                if (!poolId || order.poolId === poolId) {
                    allOrders.push({
                        orderId: id,
                        ...order,
                        priceDisplay: (order.price / 1_000_000).toFixed(6),
                    });
                }
            }

            res.json({
                success: true,
                count: allOrders.length,
                orders: allOrders,
                filter: poolId ? { poolId } : 'none'
            });
        }
    } catch (error) {
        console.error('❌ Error getting cached orders:', error);
        res.status(500).json({
            error: 'Failed to get cached orders',
            message: error.message
        });
    }
});

/**
 * API: Clean Old Cached Orders
 * 
 * POST /api/orders/clean
 * { "maxAge": 86400000 }  // maxAge in milliseconds (default: 24 hours)
 */
app.post('/api/orders/clean', (req, res) => {
    try {
        const { maxAge } = req.body;
        const maxAgeMs = maxAge || 24 * 60 * 60 * 1000; // 預設 24 小時

        const cleaned = deepBookListener.cleanOldOrders(maxAgeMs);

        res.json({
            success: true,
            message: `Cleaned ${cleaned} old order(s)`,
            cleaned,
            maxAge: maxAgeMs
        });
    } catch (error) {
        console.error('❌ Error cleaning orders:', error);
        res.status(500).json({
            error: 'Failed to clean orders',
            message: error.message
        });
    }
});

/**
 * API: Get Buyback Execution History
 * 
 * GET /api/buyback/history
 * GET /api/buyback/history?poolId=0x228...
 */
app.get('/api/buyback/history', (req, res) => {
    try {
        const { poolId } = req.query;
        
        let executions = buybackExecutor.getExecutions();
        
        // 按 Pool ID 过滤
        if (poolId) {
            executions = executions.filter(exec => exec.poolId === poolId);
        }
        
        // 计算总金额
        const totalAmount = executions.reduce((sum, exec) => sum + (exec.amount || 0), 0);
        const successCount = executions.filter(exec => exec.status === 'executed').length;
        
        res.json({
            success: true,
            count: executions.length,
            successCount,
            totalAmount,
            executions: executions.map(exec => ({
                ...exec,
                priceDisplay: exec.currentPrice ? (exec.currentPrice / 1_000_000).toFixed(6) : 'N/A',
                floorPriceDisplay: exec.floorPrice ? (exec.floorPrice / 1_000_000).toFixed(6) : 'N/A',
            })),
            filter: poolId ? { poolId } : 'none'
        });
    } catch (error) {
        console.error('❌ Error getting buyback history:', error);
        res.status(500).json({
            error: 'Failed to get buyback history',
            message: error.message
        });
    }
});

/**
 * API: Get Buyback Stats
 * 
 * GET /api/buyback/stats
 */
app.get('/api/buyback/stats', (req, res) => {
    try {
        const executions = buybackExecutor.getExecutions();
        
        const stats = {
            total: executions.length,
            executed: executions.filter(e => e.status === 'executed').length,
            failed: executions.filter(e => e.status === 'failed').length,
            simulated: executions.filter(e => e.status === 'simulated').length,
            totalAmount: executions.reduce((sum, e) => sum + (e.amount || 0), 0),
            enabled: buybackExecutor.enabled,
            balanceManager: buybackExecutor.balanceManagerId,
        };
        
        res.json({
            success: true,
            stats
        });
    } catch (error) {
        console.error('❌ Error getting buyback stats:', error);
        res.status(500).json({
            error: 'Failed to get buyback stats',
            message: error.message
        });
    }
});

/**
 * API: Get Registered Pool Info
 * 
 * GET /api/pools/:poolId
 */
app.get('/api/pools/:poolId', (req, res) => {
    try {
        const { poolId } = req.params;
        
        const poolInfo = vaultRegistry.getVaultByPoolId(poolId);
        
        if (!poolInfo) {
            return res.status(404).json({
                success: false,
                error: 'Pool not found',
                message: 'This pool has not been registered'
            });
        }
        
        res.json({
            success: true,
            pool: {
                poolId: poolInfo.poolId,
                vaultId: poolInfo.vaultId,
                balanceManagerId: poolInfo.balanceManagerId,
                coinType: poolInfo.coinType,
                floorPrice: poolInfo.floorPrice,
                floorPriceDisplay: (poolInfo.floorPrice / 1_000_000).toFixed(6) + ' USDC',
                owner: poolInfo.owner,
                lastTradePrice: poolInfo.lastTradePrice,
                buybackCount: poolInfo.buybackCount,
                totalBuybackAmount: poolInfo.totalBuybackAmount,
                registeredAt: poolInfo.registeredAt,
            }
        });
    } catch (error) {
        console.error('❌ Error getting pool info:', error);
        res.status(500).json({
            error: 'Failed to get pool info',
            message: error.message
        });
    }
});

/**
 * API: Get All Registered Pools
 * 
 * GET /api/pools
 */
app.get('/api/pools', (req, res) => {
    try {
        const allPools = vaultRegistry.getAllPools();
        
        res.json({
            success: true,
            count: allPools.length,
            pools: allPools.map(pool => ({
                poolId: pool.poolId,
                vaultId: pool.vaultId,
                balanceManagerId: pool.balanceManagerId,
                coinType: pool.coinType,
                floorPriceDisplay: (pool.floorPrice / 1_000_000).toFixed(6) + ' USDC',
                buybackCount: pool.buybackCount,
                registeredAt: pool.registeredAt,
            }))
        });
    } catch (error) {
        console.error('❌ Error getting pools:', error);
        res.status(500).json({
            error: 'Failed to get pools',
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
 * 
 * Request body:
 * - poolId (required): DeepBook Pool ID
 * - vaultId (required for buyback): Associated Vault ID
 * - balanceManagerId (required for buyback): Balance Manager ID for executing buyback
 * - coinType (optional): Base coin type (will be queried from chain if not provided)
 * - floorPrice (optional): Floor price in USDC (default: 1.0)
 * - minBuybackAmount (optional): Minimum buyback amount in USDC (default: 0, no limit)
 * - owner (optional): Vault owner address
 */
app.post('/api/deepbook/listener/add-pool', async (req, res) => {
    try {
        const { poolId, balanceManagerId, vaultId, coinType, floorPrice, minBuybackAmount, owner } = req.body;

        if (!poolId) {
            return res.status(400).json({ error: 'Missing poolId' });
        }

        // 轉換 floorPrice 到 6 位小數
        const floorPriceRaw = floorPrice ? Math.floor(parseFloat(floorPrice) * 1_000_000) : 1_000_000;
        const floorPriceDisplay = (floorPriceRaw / 1_000_000).toFixed(6);

        console.log('\n🏊 ====== Adding Pool to Listener ======');
        console.log(`📋 Pool ID: ${poolId}`);
        console.log(`🏦 Vault ID: ${vaultId || '⚠️  NOT PROVIDED'}`);
        console.log(`💼 Balance Manager ID: ${balanceManagerId || '⚠️  NOT PROVIDED'}`);
        console.log(`🪙 Coin Type: ${coinType || 'Will query from chain'}`);
        console.log(`🛡️  Floor Price: ${floorPriceDisplay} USDC`);
        console.log(`💰 Min Buyback Amount: ${minBuybackAmount !== undefined ? minBuybackAmount + ' USDC' : 'Not set (no limit)'}`);
        console.log(`👤 Owner: ${owner || 'N/A'}`);

        // 檢查：如果要啟用自動回購，必須提供 vaultId 和 balanceManagerId
        const canBuyback = vaultId && balanceManagerId;
        if (!canBuyback) {
            console.log('\n⚠️  Warning: Missing vaultId or balanceManagerId');
            console.log('   Automatic buyback will NOT be available for this pool');
            console.log('   Pool will be monitored but buyback cannot be executed');
        }

        console.log('========================================\n');

        // 步驟 1: 添加到 listener (用於監聽事件)
        const poolConfig = await deepBookListener.addManualPool(poolId, {
            balanceManagerId,
            vaultId,
            coinType,
            floorPrice: floorPriceRaw,
            owner,
        });

        // 步驟 2: 如果提供了完整信息，註冊到 vaultRegistry (用於回購觸發)
        let registeredToVault = false;
        if (vaultId) {
            vaultRegistry.registerPool(poolId, {
                vaultId,
                balanceManagerId: balanceManagerId || null,
                coinType: poolConfig.coinType, // 使用從鏈上查詢的 coinType（如果有）
                floorPrice: floorPriceRaw,
                minBuybackAmount: minBuybackAmount !== undefined ? parseFloat(minBuybackAmount) : undefined,
                owner,
            });
            registeredToVault = true;
            
            console.log('✅ Pool added to listener and registered in vault registry');
            console.log(`   Buyback ${canBuyback ? 'ENABLED' : 'DISABLED (missing balanceManagerId)'}`);
        } else {
            console.log('✅ Pool added to listener only (no vault registration)');
            console.log('   ℹ️  To enable buyback, provide vaultId and balanceManagerId');
        }

        res.json({
            success: true,
            message: registeredToVault 
                ? (canBuyback ? 'Pool registered with buyback enabled' : 'Pool registered but buyback disabled (missing balanceManagerId)')
                : 'Pool added to monitoring only',
            data: {
                poolId: poolConfig.poolId,
                vaultId: poolConfig.vaultId,
                balanceManagerId: poolConfig.balanceManagerId,
                coinType: poolConfig.coinType,
                quoteCoin: poolConfig.quoteCoin,
                floorPrice: floorPriceRaw,
                floorPriceDisplay: floorPriceDisplay + ' USDC',
                minBuybackAmount: minBuybackAmount !== undefined ? parseFloat(minBuybackAmount) : null,
                owner: poolConfig.owner,
                registeredToVault,
                buybackEnabled: canBuyback,
                addedAt: poolConfig.addedAt,
            },
            warnings: !canBuyback ? [
                'Missing vaultId or balanceManagerId - automatic buyback is disabled',
                'Provide both vaultId and balanceManagerId to enable buyback functionality'
            ] : [],
        });
    } catch (error) {
        console.error('❌ Error adding pool:', error);
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
