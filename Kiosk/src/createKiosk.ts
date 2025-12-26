/**
 * 建立 Kiosk
 *
 * Kiosk 是 Sui 上的一個共享物件，用於存放和交易 NFT。
 * 每個用戶可以擁有多個 Kiosk。
 *
 * 執行: npm run create-kiosk
 */

import { Transaction } from "@mysten/sui/transactions";
import { KioskTransaction } from "@mysten/kiosk";
import { initializeClients } from "./utils.js";

async function createKiosk() {
  console.log("🏪 建立新的 Kiosk...\n");

  const { suiClient, kioskClient, signer } = initializeClients();

  // 建立交易
  const tx = new Transaction();

  // 使用 KioskTransaction 建立 Kiosk
  const kioskTx = new KioskTransaction({ transaction: tx, kioskClient });

  // 建立並分享 Kiosk（這會讓 Kiosk 成為共享物件）
  kioskTx.create();
  kioskTx.shareAndTransferCap(signer.toSuiAddress());
  kioskTx.finalize();

  console.log("📝 簽署並執行交易...");

  // 設定交易發送者並建立交易
  tx.setSender(signer.toSuiAddress());
  const txBytes = await tx.build({ client: suiClient });
  const signature = await signer.signTransaction(txBytes);

  const result = await suiClient.executeTransactionBlock({
    transactionBlock: txBytes,
    signature: signature.signature,
    options: {
      showEffects: true,
      showObjectChanges: true,
    },
  });

  console.log("\n✅ Kiosk 建立成功！");
  console.log(`📋 交易摘要: ${result.digest}`);

  // 找出建立的 Kiosk 和 KioskOwnerCap
  const createdObjects = result.objectChanges?.filter(
    (change) => change.type === "created"
  );

  if (createdObjects) {
    for (const obj of createdObjects) {
      if (obj.type === "created") {
        if (obj.objectType.includes("Kiosk") && !obj.objectType.includes("Cap")) {
          console.log(`🏪 Kiosk ID: ${obj.objectId}`);
        }
        if (obj.objectType.includes("KioskOwnerCap")) {
          console.log(`🔑 KioskOwnerCap ID: ${obj.objectId}`);
        }
      }
    }
  }

  console.log("\n💡 提示: 請記下 Kiosk ID 和 KioskOwnerCap ID，後續操作會用到");
}

createKiosk().catch(console.error);
