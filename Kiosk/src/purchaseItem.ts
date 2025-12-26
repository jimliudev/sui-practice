/**
 * 從 Kiosk 購買物品
 *
 * 這個腳本展示如何從其他人的 Kiosk 購買物品
 *
 * 使用方式:
 *   KIOSK_ID=<kiosk_id> ITEM_ID=<object_id> ITEM_TYPE=<type> PRICE=<price_in_sui> npm run purchase-item
 *
 * 範例:
 *   KIOSK_ID=0x456... ITEM_ID=0x123... ITEM_TYPE=0xabc::nft::NFT PRICE=1 npm run purchase-item
 */

import { Transaction } from "@mysten/sui/transactions";
import { KioskTransaction } from "@mysten/kiosk";
import { initializeClients } from "./utils.js";

async function purchaseItem() {
  const sellerKioskId = process.env.KIOSK_ID;
  const itemId = process.env.ITEM_ID;
  const itemType = process.env.ITEM_TYPE;
  const priceInSui = process.env.PRICE;

  if (!sellerKioskId || !itemId || !itemType || !priceInSui) {
    console.log("❌ 缺少必要參數\n");
    console.log("使用方式:");
    console.log(
      "  KIOSK_ID=<kiosk_id> ITEM_ID=<object_id> ITEM_TYPE=<type> PRICE=<price_in_sui> npm run purchase-item\n"
    );
    console.log("範例:");
    console.log(
      "  KIOSK_ID=0x456... ITEM_ID=0x123... ITEM_TYPE=0xabc::nft::NFT PRICE=1 npm run purchase-item"
    );
    return;
  }

  // 將 SUI 轉換為 MIST
  const priceInMist = BigInt(parseFloat(priceInSui) * 1_000_000_000);

  console.log("🛒 從 Kiosk 購買物品...\n");

  const { suiClient, kioskClient, signer } = initializeClients();
  const address = signer.toSuiAddress();

  console.log(`🏪 賣家 Kiosk: ${sellerKioskId}`);
  console.log(`📦 物品 ID: ${itemId}`);
  console.log(`📝 物品類型: ${itemType}`);
  console.log(`💰 價格: ${priceInSui} SUI (${priceInMist} MIST)\n`);

  const tx = new Transaction();

  // 使用 KioskTransaction 來購買物品
  try {
    const kioskTx = new KioskTransaction({
      transaction: tx,
      kioskClient,
    });

    // 購買物品並解析 TransferPolicy
    await kioskTx.purchaseAndResolve({
      itemType,
      itemId,
      price: priceInMist,
      sellerKiosk: sellerKioskId,
    });

    kioskTx.finalize();

    console.log("📝 簽署並執行交易...");

    tx.setSender(signer.toSuiAddress());
    const txBytes = await tx.build({ client: suiClient });
    const signature = await signer.signTransaction(txBytes);

    const txResult = await suiClient.executeTransactionBlock({
      transactionBlock: txBytes,
      signature: signature.signature,
      options: {
        showEffects: true,
      },
    });

    const status = txResult.effects?.status.status;

    if (status === "success") {
      console.log("\n✅ 購買成功！");
      console.log(`📋 交易摘要: ${txResult.digest}`);
      console.log(`📦 物品已轉移到您的地址: ${address}`);
    } else {
      console.log("\n❌ 交易失敗");
      console.log(`錯誤: ${txResult.effects?.status.error}`);
    }
  } catch (error) {
    console.log(`\n❌ 購買失敗: ${error}`);
    console.log("\n💡 可能的原因:");
    console.log("   - 物品未上架或已售出");
    console.log("   - 價格不正確");
    console.log("   - 餘額不足");
    console.log("   - TransferPolicy 限制");
  }
}

purchaseItem().catch(console.error);
