import { onboardNewProperty } from './deployProperty.js';

// Example properties to onboard
const exampleProperties = [
    {
        id: 'prop001',
        name: 'Taipei Suite A1',
        description: 'Luxury suite in Xinyi District with stunning city views. High-end finishes and premium amenities.',
        imageUrl: 'https://example.com/taipei-suite-a1.jpg',
        propertyValue: 5000000000, // 5,000 USDC (6 decimals)
        location: 'Xinyi District, Taipei, Taiwan',
        reserveAmount: 1000000000, // 1 SUI reserve
        totalSupply: 100000000000  // 100,000 tokens (6 decimals)
    },
    {
        id: 'prop002',
        name: 'Tokyo Apartment',
        description: 'Modern apartment in Shibuya with excellent transport links.',
        imageUrl: 'https://example.com/tokyo-apt.jpg',
        propertyValue: 8000000000, // 8,000 USDC
        location: 'Shibuya, Tokyo, Japan',
        reserveAmount: 1500000000, // 1.5 SUI reserve
        totalSupply: 150000000000  // 150,000 tokens
    },
    {
        id: 'prop003',
        name: 'Singapore Condo',
        description: 'Luxury condominium in Marina Bay with waterfront views.',
        imageUrl: 'https://example.com/singapore-condo.jpg',
        propertyValue: 12000000000, // 12,000 USDC
        location: 'Marina Bay, Singapore',
        reserveAmount: 2000000000, // 2 SUI reserve
        totalSupply: 200000000000  // 200,000 tokens
    }
];

async function testDeployment() {
    console.log('\n🧪 Starting Test Deployment');
    console.log('========================================\n');
    
    const results = [];
    
    for (const property of exampleProperties) {
        try {
            console.log(`\n➡️  Testing property: ${property.name}`);
            const result = await onboardNewProperty(property);
            results.push(result);
            
            // Wait a bit between deployments to avoid rate limits
            await new Promise(resolve => setTimeout(resolve, 2000));
            
        } catch (error) {
            console.error(`❌ Failed to deploy ${property.name}:`, error.message);
            results.push({
                success: false,
                propertyId: property.id,
                error: error.message
            });
        }
    }
    
    // Summary
    console.log('\n\n========================================');
    console.log('📊 Deployment Summary');
    console.log('========================================\n');
    
    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);
    
    console.log(`✅ Successful: ${successful.length}`);
    console.log(`❌ Failed: ${failed.length}`);
    console.log(`📦 Total: ${results.length}\n`);
    
    if (successful.length > 0) {
        console.log('Successful Deployments:');
        successful.forEach(r => {
            console.log(`\n  ${r.propertyId}:`);
            console.log(`    NFT ID: ${r.nftId}`);
            console.log(`    Vault ID: ${r.vaultId}`);
            console.log(`    Token: ${r.symbol}`);
            console.log(`    Package: ${r.packageId}`);
        });
    }
    
    if (failed.length > 0) {
        console.log('\nFailed Deployments:');
        failed.forEach(r => {
            console.log(`\n  ${r.propertyId}: ${r.error}`);
        });
    }
    
    return results;
}

// Run test
testDeployment()
    .then(() => {
        console.log('\n✅ Test completed\n');
        process.exit(0);
    })
    .catch(error => {
        console.error('\n❌ Test failed:', error);
        process.exit(1);
    });
