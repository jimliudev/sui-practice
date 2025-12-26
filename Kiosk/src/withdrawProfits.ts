/**
 * 從 Kiosk 提取收益
 *
 * 當物品在 Kiosk 中售出後，收益會累積在 Kiosk 中。
 * 使用這個腳本可以將收益提取到您的錢包。
 *
 * 執行: npm run withdraw-profits
 */

import { Transaction } from "@mysten/sui/transactions";
import { KioskTransaction } from "@mysten/kiosk";
import { initializeClients } from "./utils.js";

async function withdrawProfits() {
  console.log("💰 從 Kiosk 提取收益...\n");

  const { suiClient, kioskClient, signer } = initializeClients();
  const address = signer.toSuiAddress();

  // 取得用戶的 Kiosk
  const { kioskOwnerCaps, kioskIds } = await kioskClient.getOwnedKiosks({
    address,
  });

  if (kioskIds.length === 0) {
    console.log("❌ 您尚未擁有任何 Kiosk");
    return;
  }

  let totalProfits = 0n;
  const kiosksWithProfits: { id: string; cap: any; profits: bigint }[] = [];

  // 檢查每個 Kiosk 的收益
  for (const kioskId of kioskIds) {
    const kiosk = await kioskClient.getKiosk({
      id: kioskId,
      options: { withKioskFields: true },
    });

    const profits = BigInt(kiosk.kiosk?.profits || 0);
    if (profits > 0n) {
      const cap = kioskOwnerCaps.find((cap) => cap.kioskId === kioskId);
      kiosksWithProfits.push({ id: kioskId, cap, profits });
      totalProfits += profits;
    }
  }

  if (kiosksWithProfits.length === 0) {
    console.log("📭 您的 Kiosk 中沒有待提取的收益");
    return;
  }

  console.log(`💰 總待提取收益: ${Number(totalProfits) / 1_000_000_000} SUI (${totalProfits} MIST)\n`);

  // 建立交易來提取所有收益
  const tx = new Transaction();

  for (const { id, cap, profits } of kiosksWithProfits) {
    console.log(`📋 Kiosk ${id}: ${Number(profits) / 1_000_000_000} SUI`);

    const kioskTx = new KioskTransaction({
      transaction: tx,
      kioskClient,
      cap: cap,
    });

    // 提取收益
    const coin = kioskTx.withdraw(address);
    kioskTx.finalize();
  }

  console.log("\n📝 簽署並執行交易...");

  tx.setSender(signer.toSuiAddress());
  const txBytes = await tx.build({ client: suiClient });
  const signature = await signer.signTransaction(txBytes);

  const result = await suiClient.executeTransactionBlock({
    transactionBlock: txBytes,
    signature: signature.signature,
    options: {
      showEffects: true,
      showBalanceChanges: true,
    },
  });

  const status = result.effects?.status.status;

  if (status === "success") {
    console.log("\n✅ 收益提取成功！");
    console.log(`📋 交易摘要: ${result.digest}`);

    // 顯示餘額變化
    if (result.balanceChanges) {
      console.log("\n💰 餘額變化:");
      for (const change of result.balanceChanges) {
        if (change.coinType === "0x2::sui::SUI") {
          const amount = BigInt(change.amount);
          console.log(
            `   ${amount >= 0n ? "+" : ""}${Number(amount) / 1_000_000_000} SUI`
          );
        }
      }
    }
  } else {
    console.log("\n❌ 交易失敗");
    console.log(`錯誤: ${result.effects?.status.error}`);
  }
}

withdrawProfits().catch(console.error);
