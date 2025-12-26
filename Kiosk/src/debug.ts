/**
 * 除錯腳本 - 查詢 Kiosk 詳細資訊
 */

import { initializeClients } from "./utils.js";

async function debug() {
  const { kioskClient } = initializeClients();

  const kiosk = await kioskClient.getKiosk({
    id: "0xfed50b00e33c1e3c49320c70ca34a7aa1ee6b8f2e3c6e8b69ef2cfbc0099f252",
    options: {
      withKioskFields: true,
      withListingPrices: true,
    },
  });

  console.log("=== Kiosk 詳細資訊 ===");
  console.log("items:", JSON.stringify(kiosk.items, null, 2));
  console.log("listingIds:", JSON.stringify(kiosk.listingIds, null, 2));
  console.log("listings:", JSON.stringify(kiosk.listings, null, 2));
}

debug().catch(console.error);
