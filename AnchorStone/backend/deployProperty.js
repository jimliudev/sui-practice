import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Transaction } from '@mysten/sui/transactions';
import { bcs } from '@mysten/sui/bcs';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ====== Configuration ======
const NETWORK = 'testnet'; // or 'mainnet'
const MAIN_PACKAGE_ID = process.env.MAIN_PACKAGE_ID || ''; // Your main contract package ID
const TOKEN_REGISTRY_ID = process.env.TOKEN_REGISTRY_ID || ''; // TokenRegistry shared object ID

// Reserve Coin Type for RwaVault (儲備金類型)
// RwaVault<T, FRAC> 中的 T 是儲備金類型（例如 USDC）
// 在 AnchorStone 中，我們使用 DBUSDC 作為儲備金和交易報價貨幣
const RESERVE_COIN_TYPE = '0xf7152c05930480cd740d7311b5b8b45c6f488e3a53a11c3f74a6fac36a52e0d7::DBUSDC::DBUSDC';

// Initialize Sui client
const client = new SuiClient({ url: getFullnodeUrl(NETWORK) });

// Load keypair from environment or file
function loadKeypair() {
    const privateKey = process.env.SUI_PRIVATE_KEY;
    if (!privateKey) {
        throw new Error('Please set SUI_PRIVATE_KEY environment variable');
    }

    // Support both Bech32 (suiprivkey1...) and hex formats
    try {
        if (privateKey.startsWith('suiprivkey')) {
            // Bech32 format - use fromSecretKey with the encoded string
            return Ed25519Keypair.fromSecretKey(privateKey);
        } else {
            // Hex format
            return Ed25519Keypair.fromSecretKey(Buffer.from(privateKey, 'hex'));
        }
    } catch (error) {
        throw new Error(`Invalid private key format: ${error.message}`);
    }
}

/**
 * Generate module name and struct name for the property token
 * 
 * IMPORTANT: structName MUST be the uppercase version of moduleName
 * to satisfy Sui's One-Time Witness (OTW) requirement
 */
function generateTokenIdentifiers(propertyId, customSymbol = null) {
    const timestamp = Date.now();
    
    // If customSymbol is provided, use it directly as the module name
    if (customSymbol) {
        const cleanSymbol = customSymbol.toLowerCase().replace(/[^a-z0-9]/g, '');
        const moduleName = cleanSymbol;
        // IMPORTANT: structName must be uppercase version of moduleName for OTW
        const structName = moduleName.toUpperCase();
        return { moduleName, structName, timestamp };
    }
    
    // Otherwise, generate from property name
    // Use a short random identifier as fallback
    const randomId = Math.floor(Math.random() * 0xFFFF).toString(16).padStart(4, '0');
    const moduleName = `token_${randomId}`;
    const structName = moduleName.toUpperCase();
    return { moduleName, structName, timestamp };
}

/**
 * Generate Move contract from template
 */
export function generateTokenContract(propertyData) {
    // Generate token symbol (max 10 chars, uppercase)
    // Use custom symbol if provided, otherwise derive from name
    const symbol = propertyData.symbol || 
        propertyData.name
            .replace(/[^a-zA-Z0-9]/g, '')
            .toUpperCase()
            .substring(0, 10);

    const { moduleName, structName } = generateTokenIdentifiers(propertyData.id, symbol);

    // Read template
    const templatePath = path.join(__dirname, 'templates', 'property_token_template.move');
    let template = fs.readFileSync(templatePath, 'utf-8');

    // Replace placeholders
    template = template
        .replace(/{{MODULE_NAME}}/g, moduleName)
        .replace(/{{STRUCT_NAME}}/g, structName)
        .replace(/{{SYMBOL}}/g, symbol)
        .replace(/{{TOKEN_NAME}}/g, `${propertyData.name} Token`)
        .replace(/{{DESCRIPTION}}/g, `Fractional ownership token for ${propertyData.name}`);

    return {
        content: template,
        moduleName,
        structName,
        symbol
    };
}

/**
 * Deploy the token contract to Sui network
 */
export async function deployTokenContract(contractContent, moduleName) {
    console.log(`\n📦 Deploying token contract: ${moduleName}...`);

    // Create temp directory for deployment
    const tempDir = path.join(__dirname, '../move/sources/temp_tokens');
    if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
    }

    // Write contract file
    const contractPath = path.join(tempDir, `${moduleName}.move`);
    fs.writeFileSync(contractPath, contractContent);

    try {
        // Deploy using Sui CLI
        const output = execSync(
            `sui client publish --gas-budget 100000000 --json`,
            {
                cwd: path.join(__dirname, '../move'),
                encoding: 'utf-8'
            }
        );

        const result = JSON.parse(output);

        // Extract package ID
        const packageId = result.effects?.created?.find(
            obj => obj.owner === 'Immutable'
        )?.reference?.objectId;

        // Extract TreasuryCap object ID
        const treasuryCapId = result.effects?.created?.find(
            obj => obj.owner?.AddressOwner &&
                result.objectChanges?.some(
                    change => change.objectId === obj.reference.objectId &&
                        change.objectType?.includes('TreasuryCap')
                )
        )?.reference?.objectId;

        if (!packageId || !treasuryCapId) {
            throw new Error('Failed to extract package ID or TreasuryCap ID from deployment result');
        }

        console.log('✅ Contract deployed successfully!');
        console.log(`   Package ID: ${packageId}`);
        console.log(`   TreasuryCap ID: ${treasuryCapId}`);

        // Clean up temp file
        fs.unlinkSync(contractPath);

        return {
            packageId,
            treasuryCapId,
            transactionDigest: result.digest
        };

    } catch (error) {
        console.error('❌ Deployment failed:', error.message);
        // Clean up on failure
        if (fs.existsSync(contractPath)) {
            fs.unlinkSync(contractPath);
        }
        throw error;
    }
}

/**
 * Generate bytecode for token contract (for frontend deployment)
 * This function generates the Move code and compiles it to bytecode,
 * but does NOT deploy it. The bytecode is returned to the frontend
 * for wallet-based deployment using tx.publish()
 */
export async function generateBytecode(propertyData) {
    console.log(`\n🔧 Generating bytecode for: ${propertyData.name}...`);

    // Step 1: Generate Move contract code
    const { content, moduleName, structName, symbol } = generateTokenContract(propertyData);
    console.log(`   Module: ${moduleName}`);
    console.log(`   Symbol: ${symbol}`);

    // Step 2: Create temp directory and write contract file
    const tempDir = path.join(__dirname, '../move/sources/temp_tokens');
    if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
    }

    const contractPath = path.join(tempDir, `${moduleName}.move`);
    fs.writeFileSync(contractPath, content);

    try {
        // Step 3: Build the Move package to generate bytecode
        console.log('   Compiling Move contract...');
        const buildOutput = execSync(
            `sui move build --path ${path.join(__dirname, '../move')}`,
            {
                encoding: 'utf-8',
                stdio: 'pipe'
            }
        );

        // Step 4: Read the compiled bytecode from build directory
        const bytecodeModulesDir = path.join(__dirname, '../move/build/anchorstone/bytecode_modules');
        const mvFilePath = path.join(bytecodeModulesDir, `${moduleName}.mv`);

        if (!fs.existsSync(mvFilePath)) {
            throw new Error(`Compiled module not found: ${mvFilePath}`);
        }

        // Read the .mv file and convert to base64
        const bytecode = fs.readFileSync(mvFilePath).toString('base64');

        // Step 5: Get dependencies (Sui standard library packages)
        // These are the package IDs that the contract depends on
        const dependencies = [
            '0x0000000000000000000000000000000000000000000000000000000000000001', // MoveStdlib
            '0x0000000000000000000000000000000000000000000000000000000000000002', // Sui
        ];

        console.log('✅ Bytecode generated successfully!');
        console.log(`   Bytecode size: ${bytecode.length} bytes (base64)`);

        // Step 6: Clean up temp file
        fs.unlinkSync(contractPath);

        // Note: We also need to clean up the compiled .mv file
        // to prevent conflicts with future compilations
        if (fs.existsSync(mvFilePath)) {
            fs.unlinkSync(mvFilePath);
        }

        return {
            success: true,
            moduleName,
            structName,
            symbol,
            bytecode,
            dependencies,
            // Note: packageId will be determined after deployment
            // tokenType will be: `${packageId}::${moduleName}::${structName}`
        };

    } catch (error) {
        console.error('❌ Bytecode generation failed:', error.message);

        // Clean up on failure
        if (fs.existsSync(contractPath)) {
            fs.unlinkSync(contractPath);
        }

        throw error;
    }
}

/**
 * Mint PropertyNFT on-chain
 */
export async function mintPropertyNFT(propertyData, keypair) {
    console.log(`\n🏠 Minting PropertyNFT: ${propertyData.name}...`);

    const tx = new Transaction();

    // Convert imageUrl string to bytes array
    const imageUrlBytes = Array.from(new TextEncoder().encode(propertyData.imageUrl));

    tx.moveCall({
        target: `${MAIN_PACKAGE_ID}::rwa_vault::mint_nft_entry`,
        arguments: [
            tx.pure.string(propertyData.name),
            tx.pure.string(propertyData.description),
            tx.pure.vector('u8', imageUrlBytes),
            tx.pure.u64(propertyData.propertyValue),
            tx.pure.string(propertyData.location)
        ]
    });

    const result = await client.signAndExecuteTransaction({
        transaction: tx,
        signer: keypair,
        options: {
            showEffects: true,
            showObjectChanges: true
        }
    });

    // Extract NFT object ID
    const nftId = result.objectChanges?.find(
        change => change.type === 'created' &&
            change.objectType?.includes('PropertyNFT')
    )?.objectId;

    if (!nftId) {
        throw new Error('Failed to extract PropertyNFT ID');
    }

    console.log('✅ PropertyNFT minted!');
    console.log(`   NFT ID: ${nftId}`);

    return nftId;
}

/**
 * Create RwaVault with the deployed token's TreasuryCap
 */
async function createVault(nftId, treasuryCapId, tokenType, reserveCoinId, totalSupply, keypair) {
    console.log(`\n🏦 Creating Vault...`);

    const tx = new Transaction();

    // typeArguments: [T, FRAC] 其中 T 是儲備金類型（DBUSDC），FRAC 是分數代幣類型
    tx.moveCall({
        target: `${MAIN_PACKAGE_ID}::rwa_vault::create_vault_entry`,
        typeArguments: [
            RESERVE_COIN_TYPE, // Reserve coin type (DBUSDC for mainnet/testnet)
            tokenType          // The deployed property token type
        ],
        arguments: [
            tx.object(nftId),
            tx.object(treasuryCapId),
            tx.object(reserveCoinId),
            tx.pure.u64(totalSupply)
        ]
    });

    const result = await client.signAndExecuteTransaction({
        transaction: tx,
        signer: keypair,
        options: {
            showEffects: true,
            showObjectChanges: true
        }
    });

    // Extract Vault object ID
    const vaultId = result.objectChanges?.find(
        change => change.type === 'created' &&
            change.objectType?.includes('RwaVault')
    )?.objectId;

    if (!vaultId) {
        throw new Error('Failed to extract Vault ID');
    }

    console.log('✅ Vault created!');
    console.log(`   Vault ID: ${vaultId}`);

    return vaultId;
}

/**
 * Get DBUSDC coin from user wallet to use as reserve
 * Note: The user must have DBUSDC in their wallet
 */
export async function prepareReserveCoin(amount, keypair) {
    console.log(`\n💰 Preparing reserve coin (${amount / 1_000_000} USDC)...`);

    const address = keypair.getPublicKey().toSuiAddress();

    // Get DBUSDC coins from wallet
    const coins = await client.getCoins({
        owner: address,
        coinType: RESERVE_COIN_TYPE
    });

    if (!coins.data || coins.data.length === 0) {
        throw new Error('No DBUSDC coins found in wallet. Please get some DBUSDC first.');
    }

    const totalBalance = coins.data.reduce((sum, coin) => sum + BigInt(coin.balance), 0n);
    
    if (totalBalance < BigInt(amount)) {
        throw new Error(`Insufficient DBUSDC balance. Required: ${amount / 1_000_000} USDC, Available: ${Number(totalBalance) / 1_000_000} USDC`);
    }

    // Use the first coin (or merge if needed)
    const coinId = coins.data[0].coinObjectId;

    console.log('✅ Reserve coin prepared!');
    console.log(`   Coin ID: ${coinId}`);
    console.log(`   Amount: ${Number(coins.data[0].balance) / 1_000_000} USDC`);

    return coinId;
}

/**
 * Create RwaVault with registered token (used by API)
 */
export async function createVaultWithRegisteredToken(
    nftId,
    treasuryCapId,
    tokenType,
    tokenName,
    tokenSymbol,
    tokenDecimals,
    reserveCoinId,
    totalSupply,
    keypair
) {
    console.log(`\n🏦 Creating Vault with registered token...`);
    console.log(`   Token: ${tokenName} (${tokenSymbol})`);
    console.log(`   Total Supply: ${totalSupply}`);

    // For now, just call the existing createVault function
    // In the future, this might call a different Move function that uses register_token_manager
    return await createVault(nftId, treasuryCapId, tokenType, reserveCoinId, totalSupply, keypair);
}

/**
 * Main function: Deploy property token and create vault
 */
export async function onboardNewProperty(propertyData) {
    console.log('\n========================================');
    console.log('🚀 Starting Property Onboarding Process');
    console.log('========================================');
    console.log(`Property: ${propertyData.name}`);
    console.log(`Value: ${propertyData.propertyValue}`);
    console.log(`Location: ${propertyData.location}`);

    try {
        const keypair = loadKeypair();
        const address = keypair.getPublicKey().toSuiAddress();
        console.log(`\n👤 Deployer Address: ${address}`);

        // Step 1: Generate token contract
        const { content, moduleName, structName, symbol } = generateTokenContract(propertyData);
        console.log(`\n📝 Generated token contract: ${moduleName}`);
        console.log(`   Symbol: ${symbol}`);

        // Step 2: Deploy token contract
        const deployment = await deployTokenContract(content, moduleName);
        const tokenType = `${deployment.packageId}::${moduleName}::${structName}`;

        // Step 3: Mint PropertyNFT
        const nftId = await mintPropertyNFT(propertyData, keypair);

        // Step 4: Prepare reserve coin
        const reserveCoinId = await prepareReserveCoin(
            propertyData.reserveAmount || 1000000000, // Default 1 SUI
            keypair
        );

        // Step 5: Create Vault
        const vaultId = await createVault(
            nftId,
            deployment.treasuryCapId,
            tokenType,
            reserveCoinId,
            propertyData.totalSupply || 100000000000, // Default 100,000 tokens (6 decimals)
            keypair
        );

        const result = {
            success: true,
            propertyId: propertyData.id,
            nftId,
            vaultId,
            packageId: deployment.packageId,
            treasuryCapId: deployment.treasuryCapId,
            tokenType,
            moduleName,
            symbol,
            transactionDigest: deployment.transactionDigest
        };

        console.log('\n========================================');
        console.log('✅ Property Onboarding Completed!');
        console.log('========================================');
        console.log(JSON.stringify(result, null, 2));

        return result;

    } catch (error) {
        console.error('\n❌ Onboarding failed:', error);
        throw error;
    }
}

// Example usage
if (import.meta.url === `file://${process.argv[1]}`) {
    const exampleProperty = {
        id: 'prop001',
        name: 'Taipei Suite A1',
        description: 'Luxury suite in Xinyi District with city view',
        imageUrl: 'https://example.com/image.jpg',
        propertyValue: 5000000000, // 5000 USDC (6 decimals)
        location: 'Taipei, Taiwan',
        reserveAmount: 1000000000, // 1 SUI
        totalSupply: 100000000000  // 100,000 tokens (6 decimals)
    };

    onboardNewProperty(exampleProperty)
        .then(() => process.exit(0))
        .catch(() => process.exit(1));
}
