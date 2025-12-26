/**
 * Sui Kiosk 共用工具函數
 * 提供客戶端初始化、簽名者設定等功能
 */

import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { KioskClient, Network } from "@mysten/kiosk";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

// 取得當前檔案的目錄，並載入專案根目錄的 .env
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env") });

// 網路映射
const NETWORK_MAP: Record<string, Network> = {
  mainnet: Network.MAINNET,
  testnet: Network.TESTNET,
};

/**
 * 取得 Sui 客戶端設定
 */
export function getConfig() {
  const network = (process.env.SUI_NETWORK || "testnet") as
    | "mainnet"
    | "testnet"
    | "devnet"
    | "localnet";
  const privateKey = process.env.SUI_PRIVATE_KEY;

  if (!privateKey || privateKey === "your_private_key_here") {
    throw new Error(
      "請在 .env 檔案中設定 SUI_PRIVATE_KEY\n" +
        "可以使用 sui keytool export --key-identity <alias> 導出私鑰"
    );
  }

  return { network, privateKey };
}

/**
 * 建立 Sui 客戶端
 */
export function createSuiClient(
  network: "mainnet" | "testnet" | "devnet" | "localnet"
): SuiClient {
  return new SuiClient({ url: getFullnodeUrl(network) });
}

/**
 * 從私鑰建立簽名者
 * 支援 base64 或 bech32 格式的私鑰
 */
export function createSigner(privateKey: string): Ed25519Keypair {
  // 如果是 suiprivkey 開頭的 bech32 格式
  if (privateKey.startsWith("suiprivkey")) {
    return Ed25519Keypair.fromSecretKey(privateKey);
  }

  // 否則假設是 base64 格式
  const secretKey = Buffer.from(privateKey, "base64");
  return Ed25519Keypair.fromSecretKey(secretKey);
}

/**
 * 建立 Kiosk 客戶端
 */
export function createKioskClient(
  suiClient: SuiClient,
  network: "mainnet" | "testnet" | "devnet" | "localnet"
): KioskClient {
  const kioskNetwork = NETWORK_MAP[network] || Network.TESTNET;
  return new KioskClient({
    client: suiClient,
    network: kioskNetwork,
  });
}

/**
 * 初始化所有客戶端
 */
export function initializeClients() {
  const { network, privateKey } = getConfig();
  const suiClient = createSuiClient(network);
  const kioskClient = createKioskClient(suiClient, network);
  const signer = createSigner(privateKey);

  console.log(`🌐 網路: ${network}`);
  console.log(`👤 地址: ${signer.toSuiAddress()}`);

  return { suiClient, kioskClient, signer, network };
}

/**
 * 執行交易並等待確認
 */
export async function executeTransaction(
  suiClient: SuiClient,
  signer: Ed25519Keypair,
  txBytes: Uint8Array
) {
  const signature = await signer.signTransaction(txBytes);

  const result = await suiClient.executeTransactionBlock({
    transactionBlock: txBytes,
    signature: signature.signature,
    options: {
      showEffects: true,
      showObjectChanges: true,
    },
  });

  return result;
}
