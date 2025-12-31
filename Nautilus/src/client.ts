/**
 * Nautilus TypeScript Client
 * 
 * Main client class for interacting with Nautilus TEE and Sui blockchain
 */

import { SuiClient } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import {
    NautilusConfig,
    ComputationRequest,
    ComputationResponse,
    VerificationResult,
    SubmitOptions,
    SubmitResult,
    AttestationDocument
} from './types';
import {
    parseAttestationDocument,
    encodeRequestData,
    decodeResponseData,
    verifyAttestationBasic,
    generateNonce,
    formatError
} from './utils';

/**
 * Nautilus Client for interacting with TEE and Sui blockchain
 */
export class NautilusClient {
    private suiClient: SuiClient;
    private enclaveEndpoint: string;
    private packageId: string;
    private requestTimeout: number;

    /**
     * Create a new Nautilus client
     * @param config Client configuration
     */
    constructor(config: NautilusConfig) {
        this.suiClient = config.suiClient;
        this.enclaveEndpoint = config.enclaveEndpoint;
        this.packageId = config.packageId;
        this.requestTimeout = config.requestTimeout || 30000; // 30 seconds default
    }

    /**
     * Request computation from the TEE
     * @param request Computation request
     * @returns Computation response with attestation
     */
    async requestComputation(request: ComputationRequest): Promise<ComputationResponse> {
        try {
            // Add nonce if not provided
            if (!request.nonce) {
                request.nonce = generateNonce();
            }

            // Encode request data
            const encodedData = encodeRequestData(request);

            // Make HTTP request to TEE endpoint
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), this.requestTimeout);

            const response = await fetch(`${this.enclaveEndpoint}/compute`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    data: encodedData,
                    nonce: request.nonce,
                }),
                signal: controller.signal,
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                throw new Error(`TEE request failed: ${response.statusText}`);
            }

            const responseData = await response.json() as {
                result: string;
                attestation: string;
                signature: string;
                timestamp: number;
            };

            // Parse the response
            const computationResponse: ComputationResponse = {
                result: decodeResponseData(responseData.result),
                attestation: parseAttestationDocument(responseData.attestation),
                signature: responseData.signature,
                timestamp: responseData.timestamp,
            };

            return computationResponse;
        } catch (error) {
            throw new Error(`Failed to request computation: ${formatError(error)}`);
        }
    }

    /**
     * Verify attestation document (client-side basic verification)
     * Note: Full verification should be done on-chain
     * @param attestation Attestation document
     * @param expectedPcrs Optional expected PCR values
     * @returns Verification result
     */
    verifyAttestation(
        attestation: AttestationDocument,
        expectedPcrs?: Record<number, string>
    ): VerificationResult {
        return verifyAttestationBasic(attestation, expectedPcrs);
    }

    /**
     * Submit computation result to Sui blockchain for on-chain verification
     * @param response Computation response from TEE
     * @param options Submit options
     * @returns Submit result
     */
    async submitToSui(
        response: ComputationResponse,
        options: SubmitOptions
    ): Promise<SubmitResult> {
        try {
            // Create a new transaction
            const tx = new Transaction();

            // Call the Nautilus Move contract to verify attestation and process result
            // This is a placeholder - actual implementation depends on your Move contract
            tx.moveCall({
                target: `${this.packageId}::nautilus::verify_and_execute`,
                arguments: [
                    tx.pure.string(JSON.stringify(response.attestation)),
                    tx.pure.string(JSON.stringify(response.result)),
                    tx.pure.string(response.signature),
                    tx.pure.u64(response.timestamp),
                    ...(options.additionalArgs || []),
                ],
            });

            // Set gas budget
            if (options.gasBudget) {
                tx.setGasBudget(options.gasBudget);
            }

            // Note: In a real implementation, you would need to sign and execute the transaction
            // This requires a keypair which should be provided by the caller
            // For now, we return a placeholder result

            const result: SubmitResult = {
                digest: 'placeholder-digest',
                success: true,
                error: 'Transaction building successful - signing and execution requires keypair',
            };

            return result;
        } catch (error) {
            return {
                digest: '',
                success: false,
                error: formatError(error),
            };
        }
    }

    /**
     * Get the Sui client instance
     * @returns Sui client
     */
    getSuiClient(): SuiClient {
        return this.suiClient;
    }

    /**
     * Get the enclave endpoint
     * @returns Enclave endpoint URL
     */
    getEnclaveEndpoint(): string {
        return this.enclaveEndpoint;
    }

    /**
     * Get the package ID
     * @returns Package ID
     */
    getPackageId(): string {
        return this.packageId;
    }

    /**
     * Health check for the TEE endpoint
     * @returns Whether the TEE is healthy
     */
    async healthCheck(): Promise<boolean> {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);

            const response = await fetch(`${this.enclaveEndpoint}/health`, {
                method: 'GET',
                signal: controller.signal,
            });

            clearTimeout(timeoutId);
            return response.ok;
        } catch (error) {
            return false;
        }
    }
}
