/**
 * 完整的 Kiosk 操作示範
 *
 * 這個腳本展示了 Kiosk 的完整操作流程：
 * 1. 建立 Kiosk
 * 2. 查詢 Kiosk 資訊
 * 3. 展示如何放置物品（概念說明）
 *
 * 執行: npm run demo
 */

import { Transaction } from "@mysten/sui/transactions";
import { KioskTransaction } from "@mysten/kiosk";
import { initializeClients } from "./utils.js";

async function demo() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("                    Sui Kiosk 完整示範                      ");
  console.log("═══════════════════════════════════════════════════════════\n");

  const { suiClient, kioskClient, signer } = initializeClients();
  const address = signer.toSuiAddress();

  // ============================================
  // 步驟 1: 查詢現有的 Kiosk
  // ============================================
  console.log("\n📋 步驟 1: 查詢現有的 Kiosk...\n");

  const { kioskOwnerCaps, kioskIds } = await kioskClient.getOwnedKiosks({
    address,
  });

  let kioskId: string;
  let kioskCap: string;

  if (kioskIds.length > 0) {
    kioskId = kioskIds[0];
    const cap = kioskOwnerCaps.find((cap) => cap.kioskId === kioskId);
    kioskCap = cap?.objectId || "";

    console.log(`✅ 找到現有的 Kiosk`);
    console.log(`   🏪 Kiosk ID: ${kioskId}`);
    console.log(`   🔑 KioskOwnerCap ID: ${kioskCap}`);
  } else {
    // ============================================
    // 步驟 2: 建立新的 Kiosk
    // ============================================
    console.log("❌ 沒有找到現有的 Kiosk");
    console.log("\n📋 步驟 2: 建立新的 Kiosk...\n");

    const createTx = new Transaction();
    const createKioskTx = new KioskTransaction({
      transaction: createTx,
      kioskClient,
    });

    createKioskTx.create();
    createKioskTx.shareAndTransferCap(address);
    createKioskTx.finalize();

    createTx.setSender(address);
    const txBytes = await createTx.build({ client: suiClient });
    const signature = await signer.signTransaction(txBytes);

    const result = await suiClient.executeTransactionBlock({
      transactionBlock: txBytes,
      signature: signature.signature,
      options: {
        showEffects: true,
        showObjectChanges: true,
      },
    });

    console.log(`✅ Kiosk 建立成功！交易: ${result.digest}`);

    // 解析建立的物件
    const createdObjects = result.objectChanges?.filter(
      (change) => change.type === "created"
    );

    for (const obj of createdObjects || []) {
      if (obj.type === "created") {
        if (obj.objectType.includes("Kiosk") && !obj.objectType.includes("Cap")) {
          kioskId = obj.objectId;
          console.log(`   🏪 Kiosk ID: ${kioskId}`);
        }
        if (obj.objectType.includes("KioskOwnerCap")) {
          kioskCap = obj.objectId;
          console.log(`   🔑 KioskOwnerCap ID: ${kioskCap}`);
        }
      }
    }
  }

  // ============================================
  // 步驟 3: 查詢 Kiosk 詳細資訊
  // ============================================
  console.log("\n📋 步驟 3: 查詢 Kiosk 詳細資訊...\n");

  try {
    const kiosk = await kioskClient.getKiosk({
      id: kioskId!,
      options: {
        withKioskFields: true,
        withListingPrices: true,
      },
    });

    console.log(`🏪 Kiosk 資訊:`);
    console.log(`   💰 收益: ${kiosk.kiosk?.profits || 0} MIST`);
    console.log(`   📦 物品數量: ${kiosk.kiosk?.itemCount || 0}`);
    console.log(`   👤 擁有者: ${kiosk.kiosk?.owner || "未知"}`);

    if (kiosk.items && kiosk.items.length > 0) {
      console.log(`\n📦 Kiosk 內的物品:`);
      for (const item of kiosk.items) {
        console.log(`   - 物件 ID: ${item.objectId}`);
        console.log(`     類型: ${item.type}`);
        const isListed = kiosk.listingIds?.includes(item.objectId);
        console.log(`     狀態: ${isListed ? "🏷️ 已上架" : "📦 未上架"}`);
      }
    } else {
      console.log(`\n📭 Kiosk 目前是空的`);
    }
  } catch (error) {
    console.log(`⚠️ 無法查詢 Kiosk 資訊: ${error}`);
  }

  // ============================================
  // 說明: 如何放置物品到 Kiosk
  // ============================================
  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("                    📚 Kiosk 操作說明                        ");
  console.log("═══════════════════════════════════════════════════════════\n");

  console.log(`
🔹 放置物品 (Place):
   將 NFT 放入 Kiosk，但不上架販售。
   
   const tx = new Transaction();
   const kioskTx = new KioskTransaction({ transaction: tx, kioskClient, kioskCap, kiosk });
   kioskTx.place({ itemType: 'package::module::Type', item: 'object_id' });
   kioskTx.finalize();

🔹 上架物品 (List):
   設定價格並上架物品。
   
   kioskTx.list({ itemType: 'package::module::Type', itemId: 'object_id', price: 1000000000n });

🔹 購買物品 (Purchase):
   從其他人的 Kiosk 購買物品。
   
   kioskTx.purchase({ itemType: 'package::module::Type', itemId: 'object_id', price: 1000000000n });

🔹 取消上架 (Delist):
   取消物品的上架狀態。
   
   kioskTx.delist({ itemType: 'package::module::Type', itemId: 'object_id' });

🔹 取出物品 (Take):
   從 Kiosk 取出物品（需要遵守 TransferPolicy）。
   
   kioskTx.take({ itemType: 'package::module::Type', itemId: 'object_id' });

🔹 提取收益 (Withdraw):
   提取 Kiosk 中的銷售收益。
   
   kioskTx.withdraw(address);

💡 注意事項:
   - 放置物品需要擁有該物件
   - 上架和取消上架需要 KioskOwnerCap
   - 購買需要支付足夠的 SUI
   - TransferPolicy 可能會對取出/購買物品有額外限制
`);

  console.log("═══════════════════════════════════════════════════════════\n");
  console.log("✅ 示範完成！");
}

demo().catch(console.error);
