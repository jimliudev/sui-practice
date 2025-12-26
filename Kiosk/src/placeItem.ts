/**
 * 將物品放入 Kiosk（不上架）
 *
 * 這個腳本展示如何將物品放入 Kiosk 中儲存
 * 物品放入後可以稍後再決定是否上架販售
 *
 * 使用方式:
 *   ITEM_ID=<object_id> ITEM_TYPE=<type> npm run place-item
 *
 * 範例:
 *   ITEM_ID=0x123... ITEM_TYPE=0xabc::nft::NFT npm run place-item
 */

import { Transaction } from "@mysten/sui/transactions";
import { KioskTransaction } from "@mysten/kiosk";
import { initializeClients } from "./utils.js";

async function placeItem() {
  const itemId = process.env.ITEM_ID;
  const itemType = process.env.ITEM_TYPE;

  if (!itemId || !itemType) {
    console.log("❌ 缺少必要參數\n");
    console.log("使用方式:");
    console.log("  ITEM_ID=<object_id> ITEM_TYPE=<type> npm run place-item\n");
    console.log("範例:");
    console.log("  ITEM_ID=0x123... ITEM_TYPE=0xabc::nft::NFT npm run place-item");
    return;
  }

  console.log("📦 將物品放入 Kiosk...\n");

  const { suiClient, kioskClient, signer } = initializeClients();
  const address = signer.toSuiAddress();

  // 取得用戶的 Kiosk
  const { kioskOwnerCaps, kioskIds } = await kioskClient.getOwnedKiosks({
    address,
  });

  if (kioskIds.length === 0) {
    console.log("❌ 您尚未擁有任何 Kiosk");
    console.log("💡 請先執行 npm run create-kiosk 建立一個 Kiosk");
    return;
  }

  const kioskId = kioskIds[0];
  const kioskCap = kioskOwnerCaps.find((cap) => cap.kioskId === kioskId);

  console.log(`🏪 使用 Kiosk: ${kioskId}`);
  console.log(`📦 物品 ID: ${itemId}`);
  console.log(`📝 物品類型: ${itemType}\n`);

  const tx = new Transaction();

  const kioskTx = new KioskTransaction({
    transaction: tx,
    kioskClient,
    cap: kioskCap,
  });

  // 將物品放入 Kiosk
  kioskTx.place({
    itemType: itemType,
    item: itemId,
  });

  kioskTx.finalize();

  console.log("📝 簽署並執行交易...");

  tx.setSender(signer.toSuiAddress());
  const txBytes = await tx.build({ client: suiClient });
  const signature = await signer.signTransaction(txBytes);

  const result = await suiClient.executeTransactionBlock({
    transactionBlock: txBytes,
    signature: signature.signature,
    options: {
      showEffects: true,
    },
  });

  const status = result.effects?.status.status;

  if (status === "success") {
    console.log("\n✅ 物品已放入 Kiosk！");
    console.log(`📋 交易摘要: ${result.digest}`);
    console.log("\n💡 您可以使用 npm run list-item 來上架此物品");
  } else {
    console.log("\n❌ 交易失敗");
    console.log(`錯誤: ${result.effects?.status.error}`);
  }
}

placeItem().catch(console.error);
