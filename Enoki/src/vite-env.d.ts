/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ENOKI_PUBLIC_KEY: string;
  readonly VITE_SUI_NETWORK: 'mainnet' | 'testnet' | 'devnet';
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
