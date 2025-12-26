/**
 * 上架物品到 Kiosk
 *
 * 這個腳本展示如何將物品放入 Kiosk 並設定價格上架
 *
 * 使用方式:
 *   ITEM_ID=<object_id> ITEM_TYPE=<type> PRICE=<price_in_sui> npm run list-item
 *
 * 範例:
 *   ITEM_ID=0x123... ITEM_TYPE=0xabc::nft::NFT PRICE=1 npm run list-item
 */

import { Transaction } from "@mysten/sui/transactions";
import { KioskTransaction } from "@mysten/kiosk";
import { initializeClients } from "./utils.js";

async function listItem() {
  const itemId = process.env.ITEM_ID;
  const itemType = process.env.ITEM_TYPE;
  const priceInSui = process.env.PRICE;

  if (!itemId || !itemType || !priceInSui) {
    console.log("❌ 缺少必要參數\n");
    console.log("使用方式:");
    console.log(
      "  ITEM_ID=<object_id> ITEM_TYPE=<type> PRICE=<price_in_sui> npm run list-item\n"
    );
    console.log("範例:");
    console.log(
      "  ITEM_ID=0x123... ITEM_TYPE=0xabc::nft::NFT PRICE=1 npm run list-item"
    );
    return;
  }

  // 將 SUI 轉換為 MIST (1 SUI = 1,000,000,000 MIST)
  const priceInMist = BigInt(parseFloat(priceInSui) * 1_000_000_000);

  console.log("🏷️ 上架物品到 Kiosk...\n");

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
  console.log(`📝 物品類型: ${itemType}`);
  console.log(`💰 價格: ${priceInSui} SUI (${priceInMist} MIST)\n`);

  const tx = new Transaction();

  const kioskTx = new KioskTransaction({
    transaction: tx,
    kioskClient,
    cap: kioskCap,
  });

  // 先將物品放入 Kiosk，再上架
  kioskTx.place({
    itemType: itemType,
    item: itemId,
  });

  kioskTx.list({
    itemType: itemType,
    itemId: itemId,
    price: priceInMist,
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
    console.log("\n✅ 物品上架成功！");
    console.log(`📋 交易摘要: ${result.digest}`);
  } else {
    console.log("\n❌ 交易失敗");
    console.log(`錯誤: ${result.effects?.status.error}`);
  }
}

listItem().catch(console.error);
