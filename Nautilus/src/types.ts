/**
 * Nautilus TypeScript Client - Type Definitions
 * 
 * This file contains type definitions for interacting with Nautilus,
 * a framework for secure and verifiable off-chain computation on Sui.
 */

import { SuiClient } from '@mysten/sui/client';

/**
 * Configuration for the Nautilus client
 */
export interface NautilusConfig {
    /** Sui client instance for blockchain interaction */
    suiClient: SuiClient;

    /** URL endpoint of the TEE (Trusted Execution Environment) */
    enclaveEndpoint: string;

    /** Package ID of the Nautilus Move package on Sui */
    packageId: string;

    /** Optional timeout for TEE requests in milliseconds */
    requestTimeout?: number;
}

/**
 * TEE Attestation Document structure
 * Based on AWS Nitro Enclaves attestation format
 */
export interface AttestationDocument {
    /** Module ID (e.g., "i-1234567890abcdef0-enc0123456789abcdef") */
    moduleId: string;

    /** Timestamp when the attestation was generated */
    timestamp: number;

    /** Digest of the enclave image file */
    digest: string;

    /** PCR (Platform Configuration Register) values */
    pcrs: Record<number, string>;

    /** Certificate chain for verification */
    certificate: string;

    /** CA bundle for certificate verification */
    cabundle: string[];

    /** Public key of the enclave */
    publicKey?: string;

    /** User data included in the attestation */
    userData?: string;

    /** Nonce for replay protection */
    nonce?: string;
}

/**
 * Request to the TEE for computation
 */
export interface ComputationRequest {
    /** Type of computation to perform */
    operation: string;

    /** Input data for the computation */
    data: any;

    /** Optional nonce for replay protection */
    nonce?: string;

    /** Optional metadata */
    metadata?: Record<string, any>;
}

/**
 * Response from the TEE after computation
 */
export interface ComputationResponse {
    /** Result of the computation */
    result: any;

    /** Attestation document proving the computation was done in TEE */
    attestation: AttestationDocument;

    /** Signature over the result and attestation */
    signature: string;

    /** Timestamp of the computation */
    timestamp: number;
}

/**
 * Verification result for attestation
 */
export interface VerificationResult {
    /** Whether the attestation is valid */
    isValid: boolean;

    /** Error message if verification failed */
    error?: string;

    /** Details about the verification */
    details?: {
        /** Whether PCRs match expected values */
        pcrsValid?: boolean;

        /** Whether certificate chain is valid */
        certificateValid?: boolean;

        /** Whether signature is valid */
        signatureValid?: boolean;
    };
}

/**
 * Options for submitting computation result to Sui
 */
export interface SubmitOptions {
    /** Gas budget for the transaction */
    gasBudget?: number;

    /** Sender address */
    sender: string;

    /** Optional additional arguments for the Move function */
    additionalArgs?: any[];
}

/**
 * Result of submitting to Sui blockchain
 */
export interface SubmitResult {
    /** Transaction digest */
    digest: string;

    /** Whether the transaction was successful */
    success: boolean;

    /** Error message if transaction failed */
    error?: string;

    /** Gas used */
    gasUsed?: number;
}
