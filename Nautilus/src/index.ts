/**
 * Nautilus TypeScript Client - Main Export
 */

// Export client
export { NautilusClient } from './client';

// Export types
export type {
    NautilusConfig,
    AttestationDocument,
    ComputationRequest,
    ComputationResponse,
    VerificationResult,
    SubmitOptions,
    SubmitResult,
} from './types';

// Export utilities
export {
    parseAttestationDocument,
    encodeRequestData,
    decodeResponseData,
    verifyPCRs,
    verifyAttestationBasic,
    generateNonce,
    formatError,
    hexToBytes,
    bytesToHex,
} from './utils';
