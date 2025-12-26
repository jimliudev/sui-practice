import { useEffect } from 'react';
import { useSuiClientContext } from '@mysten/dapp-kit';
import { registerEnokiWallets, isEnokiNetwork } from '@mysten/enoki';

/**
 * 註冊 Enoki 錢包組件
 * 必須在 WalletProvider 之前渲染
 */
export default function EnokiWalletRegistration() {
  const { client, network } = useSuiClientContext();

  useEffect(() => {
    // 檢查是否為支持的 Enoki 網路
    if (!isEnokiNetwork(network)) {
      console.warn(`Network ${network} is not supported by Enoki`);
      return;
    }

    const apiKey = import.meta.env.VITE_ENOKI_PUBLIC_KEY;
    
    if (!apiKey) {
      console.error('VITE_ENOKI_PUBLIC_KEY is not set');
      return;
    }

    console.log('Registering Enoki wallets for network:', network);

    try {
      // 註冊 Enoki 錢包
      // 注意：providers 的 clientId 需要從 Enoki Portal 獲取
      const { unregister } = registerEnokiWallets({
        apiKey,
        network,
        client: client as any,
        providers: {
          // 從環境變數讀取 Client IDs
          // 如果未設置，使用空字符串（可能會導致登入失敗）
          google: {
            clientId: import.meta.env.VITE_GOOGLE_CLIENT_ID || '',
          },
          // 可以根據需要添加更多提供者
          // facebook: {
          //   clientId: import.meta.env.VITE_FACEBOOK_CLIENT_ID || '',
          // },
        },
      });

      console.log('✅ Enoki wallets registered successfully');

      // 清理函數
      return () => {
        console.log('Unregistering Enoki wallets');
        unregister();
      };
    } catch (error) {
      console.error('❌ Failed to register Enoki wallets:', error);
    }
  }, [client, network]);

  return null;
}
