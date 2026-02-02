/**
 * 自動化測試腳本：建立 NFT Vault
 * 
 * 這個腳本會自動執行以下步驟：
 * 1. 部署 Token 合約
 * 2. 鑄造 PropertyNFT
 * 3. 準備儲備金
 * 4. 創建 Vault
 * 
 * 使用方法：
 *   node testVaultCreation.js
 */

import fs from 'fs';

const BASE_URL = 'http://localhost:3000';

// 測試數據
const TEST_PROPERTY = {
    propertyId: `prop_${Date.now()}`,
    propertyName: '台北豪宅 A1',
    symbol: 'TPA1',
    description: '位於信義區的豪華套房，擁有絕佳視野',
    imageUrl: 'https://example.com/taipei-suite-a1.jpg',
    propertyValue: 5000000000, // 5000 USDC (6 decimals)
    location: '台北市信義區',
    reserveAmount: 1000000000, // 1 SUI
    totalSupply: 100000000000, // 100,000 tokens (6 decimals)
    tokenDecimals: 6
};

// 顏色輸出
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    green: '\x1b[32m',
    blue: '\x1b[34m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

function logStep(step, message) {
    log(`\n${'='.repeat(60)}`, 'cyan');
    log(`步驟 ${step}: ${message}`, 'bright');
    log('='.repeat(60), 'cyan');
}

function logSuccess(message) {
    log(`✅ ${message}`, 'green');
}

function logError(message) {
    log(`❌ ${message}`, 'red');
}

function logInfo(message) {
    log(`ℹ️  ${message}`, 'blue');
}

async function makeRequest(endpoint, data) {
    try {
        const response = await fetch(`${BASE_URL}${endpoint}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.message || result.error || 'Request failed');
        }

        return result;
    } catch (error) {
        throw new Error(`API 請求失敗: ${error.message}`);
    }
}

async function checkHealth() {
    logStep(0, '檢查系統健康狀態');

    try {
        const response = await fetch(`${BASE_URL}/health`);
        const health = await response.json();

        if (health.status !== 'ok') {
            logError(`系統狀態異常: ${health.status}`);
            console.log(JSON.stringify(health, null, 2));
            return false;
        }

        logSuccess('系統狀態正常');
        logInfo(`網絡: ${health.environment.network}`);
        logInfo(`部署者地址: ${health.checks.configuration.details.deployerAddress}`);

        if (health.checks.deployerWallet?.details?.balance) {
            logInfo(`錢包餘額: ${health.checks.deployerWallet.details.balance}`);
        }

        return true;
    } catch (error) {
        logError(`無法連接到服務器: ${error.message}`);
        logInfo('請確保服務器正在運行: npm start');
        return false;
    }
}

async function deployToken() {
    logStep(1, '部署 Token 合約');

    const data = {
        propertyId: TEST_PROPERTY.propertyId,
        propertyName: TEST_PROPERTY.propertyName,
        symbol: TEST_PROPERTY.symbol
    };

    logInfo(`Property ID: ${data.propertyId}`);
    logInfo(`Property Name: ${data.propertyName}`);
    logInfo(`Symbol: ${data.symbol}`);

    const result = await makeRequest('/api/test/deploy-token', data);

    logSuccess('Token 合約部署成功！');
    logInfo(`Package ID: ${result.result.packageId}`);
    logInfo(`TreasuryCap ID: ${result.result.treasuryCapId}`);
    logInfo(`Token Type: ${result.result.tokenType.substring(0, 50)}...`);

    return result.result;
}

async function mintNFT() {
    logStep(2, '鑄造 PropertyNFT');

    const data = {
        name: TEST_PROPERTY.propertyName,
        description: TEST_PROPERTY.description,
        imageUrl: TEST_PROPERTY.imageUrl,
        propertyValue: TEST_PROPERTY.propertyValue,
        location: TEST_PROPERTY.location
    };

    logInfo(`NFT Name: ${data.name}`);
    logInfo(`Property Value: ${data.propertyValue / 1_000_000} USDC`);
    logInfo(`Location: ${data.location}`);

    const result = await makeRequest('/api/test/mint-nft', data);

    logSuccess('PropertyNFT 鑄造成功！');
    logInfo(`NFT ID: ${result.result.nftId}`);

    return result.result;
}

async function prepareReserve() {
    logStep(3, '準備儲備金');

    const data = {
        amount: TEST_PROPERTY.reserveAmount
    };

    logInfo(`Reserve Amount: ${TEST_PROPERTY.reserveAmount / 1_000_000_000} SUI`);

    const result = await makeRequest('/api/test/prepare-reserve', data);

    logSuccess('儲備金準備完成！');
    logInfo(`Coin ID: ${result.result.coinId}`);
    logInfo(`Amount: ${result.result.amountInSui} SUI`);

    return result.result;
}

async function createVault(tokenData, nftData, reserveData) {
    logStep(4, '創建 Vault');

    const data = {
        nftId: nftData.nftId,
        treasuryCapId: tokenData.treasuryCapId,
        tokenType: tokenData.tokenType,
        reserveCoinId: reserveData.coinId,
        totalSupply: TEST_PROPERTY.totalSupply,
        tokenName: `${TEST_PROPERTY.propertyName} Token`,
        tokenSymbol: TEST_PROPERTY.symbol,
        tokenDecimals: TEST_PROPERTY.tokenDecimals
    };

    logInfo(`Total Supply: ${TEST_PROPERTY.totalSupply / 1_000_000} tokens`);
    logInfo(`Token Name: ${data.tokenName}`);
    logInfo(`Token Symbol: ${data.tokenSymbol}`);

    const result = await makeRequest('/api/test/create-vault', data);

    logSuccess('Vault 創建成功！');
    logInfo(`Vault ID: ${result.result.vaultId}`);

    return result.result;
}

async function saveResults(tokenData, nftData, reserveData, vaultData) {
    const results = {
        timestamp: new Date().toISOString(),
        property: {
            id: TEST_PROPERTY.propertyId,
            name: TEST_PROPERTY.propertyName,
            symbol: TEST_PROPERTY.symbol,
            location: TEST_PROPERTY.location,
            value: TEST_PROPERTY.propertyValue
        },
        token: {
            packageId: tokenData.packageId,
            treasuryCapId: tokenData.treasuryCapId,
            tokenType: tokenData.tokenType,
            symbol: tokenData.symbol
        },
        nft: {
            nftId: nftData.nftId
        },
        reserve: {
            coinId: reserveData.coinId,
            amount: reserveData.amount,
            amountInSui: reserveData.amountInSui
        },
        vault: {
            vaultId: vaultData.vaultId,
            totalSupply: vaultData.totalSupply
        }
    };

    const filename = 'vault_result.json';
    fs.writeFileSync(filename, JSON.stringify(results, null, 2));

    logSuccess(`結果已保存到 ${filename}`);
    return results;
}

async function main() {
    log('\n' + '='.repeat(60), 'bright');
    log('🚀 NFT Vault 自動化測試腳本', 'bright');
    log('='.repeat(60) + '\n', 'bright');

    try {
        // 檢查健康狀態
        const isHealthy = await checkHealth();
        if (!isHealthy) {
            process.exit(1);
        }

        // 等待一下
        await new Promise(resolve => setTimeout(resolve, 1000));

        // 步驟 1: 部署 Token
        const tokenData = await deployToken();
        await new Promise(resolve => setTimeout(resolve, 2000));

        // 步驟 2: 鑄造 NFT
        const nftData = await mintNFT();
        await new Promise(resolve => setTimeout(resolve, 2000));

        // 步驟 3: 準備儲備金
        const reserveData = await prepareReserve();
        await new Promise(resolve => setTimeout(resolve, 2000));

        // 步驟 4: 創建 Vault
        const vaultData = await createVault(tokenData, nftData, reserveData);
        await new Promise(resolve => setTimeout(resolve, 1000));

        // 保存結果
        const results = await saveResults(tokenData, nftData, reserveData, vaultData);

        // 最終總結
        log('\n' + '='.repeat(60), 'green');
        log('🎉 所有步驟完成！', 'green');
        log('='.repeat(60), 'green');

        log('\n📋 重要 ID 總結:', 'bright');
        log(`   NFT ID:       ${results.nft.nftId}`, 'cyan');
        log(`   Vault ID:     ${results.vault.vaultId}`, 'cyan');
        log(`   Package ID:   ${results.token.packageId}`, 'cyan');
        log(`   Token Symbol: ${results.property.symbol}`, 'cyan');

        log('\n💡 下一步:', 'yellow');
        log('   1. 查看 vault_result.json 獲取完整信息', 'yellow');
        log('   2. 使用 Vault ID 查詢鏈上狀態:', 'yellow');
        log(`      sui client object ${results.vault.vaultId}`, 'yellow');
        log('   3. 使用 NFT ID 查詢 NFT 信息:', 'yellow');
        log(`      sui client object ${results.nft.nftId}`, 'yellow');

        log('\n✅ 測試成功完成！\n', 'green');

    } catch (error) {
        logError(`測試失敗: ${error.message}`);
        console.error(error);
        process.exit(1);
    }
}

// 運行主函數
main();
