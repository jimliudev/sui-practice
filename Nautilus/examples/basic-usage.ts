/**
 * Nautilus TypeScript Client - Basic Usage Example
 * 
 * This example demonstrates how to use the Nautilus client to:
 * 1. Initialize the client
 * 2. Request computation from TEE
 * 3. Verify attestation
 * 4. Submit to Sui blockchain
 */

import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import { NautilusClient } from '../src/client';
import type { ComputationRequest } from '../src/types';

async function main() {
    console.log('=== Nautilus TypeScript Client - Basic Usage Example ===\n');

    // Step 1: Initialize Sui client
    console.log('Step 1: Initializing Sui client...');
    const suiClient = new SuiClient({
        url: getFullnodeUrl('testnet'), // Use testnet for this example
    });
    console.log('✓ Sui client initialized\n');

    // Step 2: Initialize Nautilus client
    console.log('Step 2: Initializing Nautilus client...');
    const nautilusClient = new NautilusClient({
        suiClient,
        enclaveEndpoint: 'https://your-tee-endpoint.example.com', // Replace with actual TEE endpoint
        packageId: '0x1234...', // Replace with actual Nautilus package ID on Sui
        requestTimeout: 30000,
    });
    console.log('✓ Nautilus client initialized');
    console.log(`  Enclave endpoint: ${nautilusClient.getEnclaveEndpoint()}`);
    console.log(`  Package ID: ${nautilusClient.getPackageId()}\n`);

    // Step 3: Check TEE health (optional)
    console.log('Step 3: Checking TEE health...');
    try {
        const isHealthy = await nautilusClient.healthCheck();
        console.log(`✓ TEE health status: ${isHealthy ? 'Healthy' : 'Unhealthy'}\n`);
    } catch (error) {
        console.log('⚠ TEE health check failed (this is expected for demo)\n');
    }

    // Step 4: Prepare computation request
    console.log('Step 4: Preparing computation request...');
    const request: ComputationRequest = {
        operation: 'verify_identity',
        data: {
            userId: 'user123',
            credentials: 'encrypted_credentials_here',
            timestamp: Date.now(),
        },
        metadata: {
            requestId: 'req-' + Date.now(),
        },
    };
    console.log('✓ Request prepared:');
    console.log(`  Operation: ${request.operation}`);
    console.log(`  Data: ${JSON.stringify(request.data, null, 2)}\n`);

    // Step 5: Request computation from TEE
    console.log('Step 5: Requesting computation from TEE...');
    console.log('⚠ Note: This will fail without a real TEE endpoint\n');

    try {
        const response = await nautilusClient.requestComputation(request);
        console.log('✓ Computation completed:');
        console.log(`  Result: ${JSON.stringify(response.result, null, 2)}`);
        console.log(`  Timestamp: ${new Date(response.timestamp).toISOString()}`);
        console.log(`  Attestation Module ID: ${response.attestation.moduleId}\n`);

        // Step 6: Verify attestation (client-side)
        console.log('Step 6: Verifying attestation (client-side)...');
        const verificationResult = nautilusClient.verifyAttestation(response.attestation);
        console.log(`✓ Verification result: ${verificationResult.isValid ? 'Valid' : 'Invalid'}`);
        if (verificationResult.error) {
            console.log(`  Error: ${verificationResult.error}`);
        }
        if (verificationResult.details) {
            console.log(`  Details: ${JSON.stringify(verificationResult.details, null, 2)}`);
        }
        console.log();

        // Step 7: Submit to Sui blockchain
        console.log('Step 7: Submitting to Sui blockchain...');
        const submitResult = await nautilusClient.submitToSui(response, {
            sender: '0xYourSuiAddress', // Replace with actual sender address
            gasBudget: 10000000,
        });

        console.log(`✓ Submit result: ${submitResult.success ? 'Success' : 'Failed'}`);
        if (submitResult.digest) {
            console.log(`  Transaction digest: ${submitResult.digest}`);
        }
        if (submitResult.error) {
            console.log(`  Note: ${submitResult.error}`);
        }
        console.log();

    } catch (error) {
        console.log('⚠ Expected error (no real TEE endpoint):');
        console.log(`  ${error}\n`);
    }

    // Step 8: Example of using utility functions
    console.log('Step 8: Demonstrating utility functions...');

    // Generate a nonce
    const { generateNonce } = await import('../src/utils');
    const nonce = generateNonce();
    console.log(`✓ Generated nonce: ${nonce.substring(0, 16)}...`);

    // Encode and decode data
    const { encodeRequestData, decodeResponseData } = await import('../src/utils');
    const testData = { message: 'Hello Nautilus!' };
    const encoded = encodeRequestData(testData);
    const decoded = decodeResponseData(encoded);
    console.log(`✓ Encode/Decode test: ${JSON.stringify(decoded)}`);
    console.log();

    console.log('=== Example Complete ===');
    console.log('\nNext steps:');
    console.log('1. Replace the enclaveEndpoint with your actual TEE endpoint');
    console.log('2. Replace the packageId with your deployed Nautilus Move package');
    console.log('3. Implement proper keypair management for signing transactions');
    console.log('4. Add error handling and retry logic for production use');
}

// Run the example
main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
});
