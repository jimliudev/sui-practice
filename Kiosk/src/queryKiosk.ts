/**
 * 查詢 Kiosk 資訊
 *
 * 查詢用戶擁有的所有 Kiosk 及其內容
 *
 * 執行: npm run query-kiosk
 */

import { initializeClients } from "./utils.js";

async function queryKiosk() {
  console.log("🔍 查詢 Kiosk 資訊...\n");

  const { kioskClient, signer } = initializeClients();
  const address = signer.toSuiAddress();

  // 取得用戶擁有的所有 Kiosk
  console.log(`📋 查詢地址 ${address} 擁有的 Kiosk...\n`);

  const { kioskOwnerCaps, kioskIds } = await kioskClient.getOwnedKiosks({
    address,
  });

  if (kioskIds.length === 0) {
    console.log("❌ 您尚未擁有任何 Kiosk");
    console.log("💡 請先執行 npm run create-kiosk 建立一個 Kiosk");
    return;
  }

  console.log(`✅ 找到 ${kioskIds.length} 個 Kiosk:\n`);

  // 遍歷每個 Kiosk 並顯示詳細資訊
  for (let i = 0; i < kioskIds.length; i++) {
    const kioskId = kioskIds[i];
    const cap = kioskOwnerCaps.find((cap) => cap.kioskId === kioskId);

    console.log(`━━━ Kiosk #${i + 1} ━━━`);
    console.log(`🏪 Kiosk ID: ${kioskId}`);
    console.log(`🔑 KioskOwnerCap ID: ${cap?.objectId || "未知"}`);

    try {
      // 取得 Kiosk 詳細資訊
      const kiosk = await kioskClient.getKiosk({
        id: kioskId,
        options: {
          withKioskFields: true,
          withListingPrices: true,
        },
      });

      console.log(`💰 收益: ${kiosk.kiosk?.profits || 0} MIST`);
      console.log(`📦 物品數量: ${kiosk.kiosk?.itemCount || 0}`);
      console.log(`🔓 允許擴展: ${kiosk.kiosk?.allowExtensions || false}`);

      // 顯示物品列表
      if (kiosk.items && kiosk.items.length > 0) {
        console.log(`\n📦 物品列表:`);
        for (const item of kiosk.items) {
          // 直接檢查 item.listing 是否存在來判斷是否上架
          if (item.listing) {
            const priceInSui = Number(item.listing.price) / 1_000_000_000;
            console.log(`   - ${item.objectId} (${item.type}) 🏷️ 上架中 - ${priceInSui} SUI`);
          } else {
            console.log(`   - ${item.objectId} (${item.type}) 📦 未上架`);
          }
        }
      }
    } catch (error) {
      console.log(`⚠️ 無法取得詳細資訊: ${error}`);
    }

    console.log("");
  }
}

queryKiosk().catch(console.error);
