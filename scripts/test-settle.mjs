// Manual keeper test: calls recordSettlement on ChocoLedger for schedule #7.
// This simulates what the keeper does at 9 AM without waiting for tomorrow.
//
// Usage:
//   KEEPER_KEY=0x<private-key-of-0xCAA38B34...0AA80F> node scripts/test-settle.mjs
//
// The keeper address on ChocoLedger mainnet is 0xCAA38B341d421E1D3e6F5a9F011130B7cB0AA80F

import { ethers } from "ethers";

const LEDGER = "0xd8F54CCbc314014443DEbAA8558B09D4ccC57A9E";
const USDC   = "0xcebA9300f2b948710d2653dD7B07f33A8B32118C";

// Schedule #7 — "dad · 1 KESm · Every 18th · 9:00 AM" (active, owner 0x...274B66)
const SCHEDULE_ID   = 7n;
const SRC_AMOUNT    = 10_000n;               // 0.01 USDC (6 decimals)
const DST_AMOUNT    = 1_000_000_000_000_000_000n; // 1 KESm (18 decimals)

const keeperKey = process.env.KEEPER_KEY;
if (!keeperKey) {
  console.error("Set KEEPER_KEY env var to the private key of 0xCAA38B341d421E1D3e6F5a9F011130B7cB0AA80F");
  process.exit(1);
}

const rpcUrl = process.env.RPC_URL || "https://forno.celo.org";
const provider = new ethers.JsonRpcProvider(rpcUrl, { chainId: 42220, name: "celo" });
const keeper   = new ethers.Wallet(keeperKey, provider);
console.log("Keeper wallet:", keeper.address);

const ledger = new ethers.Contract(LEDGER, [
  "function recordSettlement(uint256,bool,address,uint256,uint256,bytes32,string) external",
  "function getSchedule(uint256) external view returns (address,address,address,address,uint256,uint256,uint8,uint8,uint64,bool,bytes32,bytes32)",
], keeper);

// Verify schedule is still active before sending
const s = await ledger.getSchedule(SCHEDULE_ID);
const [owner,,,, srcAmt, dstAmt,,,,active] = s;
console.log(`Schedule #${SCHEDULE_ID}: active=${active} owner=${owner} src=${srcAmt} dst=${dstAmt}`);
if (!active) {
  console.error("Schedule is not active — cannot settle.");
  process.exit(1);
}

console.log("Sending recordSettlement...");
const tx = await ledger.recordSettlement(
  SCHEDULE_ID,
  true,           // success = true
  USDC,
  SRC_AMOUNT,
  DST_AMOUNT,
  ethers.ZeroHash, // no swap ref hash for test
  "test settlement via test-settle.mjs",
);
console.log("Tx hash:", tx.hash);
const receipt = await tx.wait();
console.log("Confirmed in block:", receipt.blockNumber);
console.log("Done — refresh History in the app to see the SettlementReceipt event.");
