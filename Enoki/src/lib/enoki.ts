import { EnokiClient } from '@mysten/enoki';
import { getFullnodeUrl } from '@mysten/sui/client';

// Enoki 客戶端配置
export const enokiPublicKey = import.meta.env.VITE_ENOKI_PUBLIC_KEY;
export const network = import.meta.env.VITE_SUI_NETWORK || 'testnet';

// 創建 Enoki 客戶端（前端使用 public key）
export const enokiClient = new EnokiClient({
  apiKey: enokiPublicKey,
});

// Sui 網路配置
export const suiNetworkUrl = getFullnodeUrl(network as 'mainnet' | 'testnet' | 'devnet');

// 輔助函數：格式化地址顯示
export function formatAddress(address: string): string {
  if (!address) return '';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}
