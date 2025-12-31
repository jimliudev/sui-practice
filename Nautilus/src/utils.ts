/**
 * Nautilus TypeScript Client - Utility Functions
 * 
 * Helper functions for working with Nautilus attestations and data
 */

import { AttestationDocument, VerificationResult } from './types';

/**
 * Parse a base64-encoded attestation document
 * @param attestationBase64 Base64-encoded attestation document
 * @returns Parsed attestation document
 */
export function parseAttestationDocument(attestationBase64: string): AttestationDocument {
    try {
        const attestationJson = Buffer.from(attestationBase64, 'base64').toString('utf-8');
        const attestation = JSON.parse(attestationJson);
        return attestation as AttestationDocument;
    } catch (error) {
        throw new Error(`Failed to parse attestation document: ${error}`);
    }
}

/**
 * Encode data for TEE request
 * @param data Data to encode
 * @returns Base64-encoded data
 */
export function encodeRequestData(data: any): string {
    try {
        const jsonString = JSON.stringify(data);
        return Buffer.from(jsonString, 'utf-8').toString('base64');
    } catch (error) {
        throw new Error(`Failed to encode request data: ${error}`);
    }
}

/**
 * Decode response data from TEE
 * @param dataBase64 Base64-encoded response data
 * @returns Decoded data
 */
export function decodeResponseData(dataBase64: string): any {
    try {
        const jsonString = Buffer.from(dataBase64, 'base64').toString('utf-8');
        return JSON.parse(jsonString);
    } catch (error) {
        throw new Error(`Failed to decode response data: ${error}`);
    }
}

/**
 * Verify PCR values match expected values
 * @param pcrs PCR values from attestation
 * @param expectedPcrs Expected PCR values
 * @returns Whether PCRs match
 */
export function verifyPCRs(
    pcrs: Record<number, string>,
    expectedPcrs: Record<number, string>
): boolean {
    for (const [index, expectedValue] of Object.entries(expectedPcrs)) {
        const pcrIndex = parseInt(index);
        if (pcrs[pcrIndex] !== expectedValue) {
            return false;
        }
    }
    return true;
}

/**
 * Basic client-side attestation verification
 * Note: Full verification should be done on-chain via Sui Move contract
 * @param attestation Attestation document to verify
 * @param expectedPcrs Optional expected PCR values
 * @returns Verification result
 */
export function verifyAttestationBasic(
    attestation: AttestationDocument,
    expectedPcrs?: Record<number, string>
): VerificationResult {
    const result: VerificationResult = {
        isValid: true,
        details: {}
    };

    // Check if attestation has required fields
    if (!attestation.moduleId || !attestation.digest || !attestation.pcrs) {
        result.isValid = false;
        result.error = 'Attestation missing required fields';
        return result;
    }

    // Verify PCRs if expected values provided
    if (expectedPcrs) {
        const pcrsValid = verifyPCRs(attestation.pcrs, expectedPcrs);
        if (result.details) {
            result.details.pcrsValid = pcrsValid;
        }
        if (!pcrsValid) {
            result.isValid = false;
            result.error = 'PCR values do not match expected values';
            return result;
        }
    }

    // Check timestamp is recent (within last hour)
    const currentTime = Date.now();
    const attestationTime = attestation.timestamp;
    const oneHour = 60 * 60 * 1000;

    if (Math.abs(currentTime - attestationTime) > oneHour) {
        result.isValid = false;
        result.error = 'Attestation timestamp is too old or in the future';
        return result;
    }

    return result;
}

/**
 * Generate a random nonce for replay protection
 * @returns Random nonce as hex string
 */
export function generateNonce(): string {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return Buffer.from(bytes).toString('hex');
}

/**
 * Format error message from various error types
 * @param error Error object
 * @returns Formatted error message
 */
export function formatError(error: unknown): string {
    if (error instanceof Error) {
        return error.message;
    }
    if (typeof error === 'string') {
        return error;
    }
    return 'Unknown error occurred';
}

/**
 * Convert hex string to Uint8Array
 * @param hex Hex string
 * @returns Uint8Array
 */
export function hexToBytes(hex: string): Uint8Array {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
        bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
    }
    return bytes;
}

/**
 * Convert Uint8Array to hex string
 * @param bytes Uint8Array
 * @returns Hex string
 */
export function bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}
