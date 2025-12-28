/**
 * DeepBook V3 Client Configuration
 * 
 * This module provides utility functions for initializing the DeepBook client
 * and common configurations.
 */

import { getFullnodeUrl, SuiClient } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { DeepBookClient } from '@mysten/deepbook-v3';
import type { BalanceManager } from '@mysten/deepbook-v3';
import dotenv from 'dotenv';

dotenv.config();

// 網路設定
export type NetworkType = 'testnet' | 'mainnet';
export const NETWORK: NetworkType = (process.env.NETWORK || 'testnet') as NetworkType;

// 從私鑰創建 keypair
export function getKeypairFromPrivateKey(privateKey: string): Ed25519Keypair {
  const { schema, secretKey } = decodeSuiPrivateKey(privateKey);
  if (schema === 'ED25519') {
    return Ed25519Keypair.fromSecretKey(secretKey);
  }
  throw new Error(`Unsupported key schema: ${schema}`);
}

// 獲取 SuiClient
export function getSuiClient(): SuiClient {
  return new SuiClient({ url: getFullnodeUrl(NETWORK) });
}

// 獲取 Keypair
export function getKeypair(): Ed25519Keypair {
  const privateKey = process.env.SUI_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error('SUI_PRIVATE_KEY not found in environment variables');
  }
  return getKeypairFromPrivateKey(privateKey);
}

// 創建 DeepBookClient
export function createDeepBookClient(
  balanceManagers?: { [key: string]: BalanceManager }
): DeepBookClient {
  const keypair = getKeypair();
  const address = keypair.toSuiAddress();

  return new DeepBookClient({
    address,
    env: NETWORK,
    client: getSuiClient(),
    balanceManagers,
  });
}

// 簽名並執行交易
export async function signAndExecute(
  client: SuiClient,
  keypair: Ed25519Keypair,
  tx: any
) {
  return client.signAndExecuteTransaction({
    transaction: tx,
    signer: keypair,
    options: {
      showEffects: true,
      showObjectChanges: true,
      showEvents: true,
    },
  });
}

// 常用的交易對 (Testnet)
export const TESTNET_POOLS = {
  SUI_USDC: {
    poolKey: 'SUI_USDC',
    baseCoin: '0x2::sui::SUI',
    quoteCoin: 'USDC', // DeepBook USDC on testnet
  },
  DEEP_SUI: {
    poolKey: 'DEEP_SUI',
    baseCoin: 'DEEP',
    quoteCoin: '0x2::sui::SUI',
  },
};

// 常用的交易對 (Mainnet)
export const MAINNET_POOLS = {
  SUI_USDC: {
    poolKey: 'SUI_USDC',
    baseCoin: '0x2::sui::SUI',
    quoteCoin: 'USDC',
  },
  DEEP_SUI: {
    poolKey: 'DEEP_SUI',
    baseCoin: 'DEEP',
    quoteCoin: '0x2::sui::SUI',
  },
  DEEP_USDC: {
    poolKey: 'DEEP_USDC',
    baseCoin: 'DEEP',
    quoteCoin: 'USDC',
  },
};

// 獲取當前網路的 pools
export function getPools() {
  return NETWORK === 'mainnet' ? MAINNET_POOLS : TESTNET_POOLS;
}

// 格式化數量 (考慮小數位)
export function formatAmount(amount: number, decimals: number = 9): bigint {
  return BigInt(Math.floor(amount * Math.pow(10, decimals)));
}

// 解析數量
export function parseAmount(amount: bigint, decimals: number = 9): number {
  return Number(amount) / Math.pow(10, decimals);
}

console.log(`🌐 Network: ${NETWORK}`);
console.log(`🔗 RPC URL: ${getFullnodeUrl(NETWORK)}`);
