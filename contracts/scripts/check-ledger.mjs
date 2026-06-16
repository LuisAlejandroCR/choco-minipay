import "dotenv/config";
import { ethers } from "ethers";

const privateKey    = process.env.DEPLOYER_PRIVATE_KEY || process.env.PRIVATE_KEY;
const ledgerAddress = process.env.VITE_LEDGER_ADDRESS  || process.env.LEDGER_ADDRESS;
const swapAddress   = process.env.VITE_CKES_SWAP_CONTRACT_ADDRESS;
const rpcUrl        = process.env.CELO_RPC_URL || "https://rpc.ankr.com/celo";

if (!ledgerAddress) throw new Error("Set VITE_LEDGER_ADDRESS");

const rpc = new ethers.JsonRpcProvider(rpcUrl, { chainId: 42220, name: "celo" });

async function tryCall(contract, fn, ...args) {
  try { return await contract[fn](...args); }
  catch { return null; }
}

// Try every known public getter across ChocoLedger, ChocoGateway, ChocoScheduleRegistry
const iface = new ethers.Contract(ledgerAddress, [
  "function admin() view returns (address)",
  "function keeper() view returns (address)",
  "function ledger() view returns (address)",
  "function feeRecipient() view returns (address)",
  "function feeBps() view returns (uint16)",
  "function txCount() view returns (uint256)",
  "function scheduleCount() view returns (uint256)",
  "function attemptCount() view returns (uint256)",
  "function authorizedSwapContracts(address) view returns (bool)",
], rpc);

console.log("\n── Contract at VITE_LEDGER_ADDRESS ────────────────────────");
console.log("Address      :", ledgerAddress);

const admin         = await tryCall(iface, "admin");
const keeper        = await tryCall(iface, "keeper");
const innerLedger   = await tryCall(iface, "ledger");
const feeRecipient  = await tryCall(iface, "feeRecipient");
const feeBps        = await tryCall(iface, "feeBps");
const txCount       = await tryCall(iface, "txCount");
const scheduleCount = await tryCall(iface, "scheduleCount");
const attemptCount  = await tryCall(iface, "attemptCount");

console.log("admin()      :", admin       ?? "— (not present)");
console.log("keeper()     :", keeper      ?? "— (not present)");
console.log("ledger()     :", innerLedger ?? "— (not present)");
console.log("feeRecipient :", feeRecipient ?? "— (not present)");
console.log("feeBps       :", feeBps != null ? `${feeBps} (${(Number(feeBps)/100).toFixed(2)}%)` : "— (not present)");
console.log("txCount      :", txCount       ?? "— (not present)");
console.log("scheduleCount:", scheduleCount ?? "— (not present)");
console.log("attemptCount :", attemptCount  ?? "— (not present)");

// Identify the contract type
if (innerLedger !== null && feeRecipient !== null && scheduleCount === null) {
  console.log("\n🔍 Identified as: ChocoGateway (standalone swap + fee + records)");
  console.log("   → This is NOT a ChocoLedger. VITE_LEDGER_ADDRESS should point to a ChocoLedger.");
  if (innerLedger === ethers.ZeroAddress) {
    console.log("   → inner ledger() = address(0) — gateway is not connected to any ChocoLedger");
  } else {
    console.log("   → inner ledger() =", innerLedger, "— gateway logs to this ChocoLedger address");
  }
} else if (scheduleCount !== null && attemptCount !== null && keeper !== null) {
  console.log("\n🔍 Identified as: ChocoLedger (unified schedules + audit log)");
} else if (scheduleCount !== null && keeper === null) {
  console.log("\n🔍 Identified as: ChocoScheduleRegistry (legacy)");
} else {
  console.log("\n🔍 Contract type: unknown");
}

if (privateKey && admin) {
  const caller = new ethers.Wallet(privateKey).address;
  console.log("\n── Caller ──────────────────────────────────────────────────");
  console.log("Your wallet  :", caller);
  console.log("Is admin?    :", admin.toLowerCase() === caller.toLowerCase() ? "✅ YES" : "❌ NO");
}

if (swapAddress) {
  console.log("\n── ChocoCkesSwap at VITE_CKES_SWAP_CONTRACT_ADDRESS ────────");
  console.log("Address      :", swapAddress);
  const swapIface = new ethers.Contract(swapAddress, [
    "function ledger() view returns (address)",
    "function feeRecipient() view returns (address)",
    "function feeBps() view returns (uint16)",
    "function txCount() view returns (uint256)",
  ], rpc);
  const swapLedger      = await tryCall(swapIface, "ledger");
  const swapFeeRecipient = await tryCall(swapIface, "feeRecipient");
  const swapFeeBps      = await tryCall(swapIface, "feeBps");
  const swapTxCount     = await tryCall(swapIface, "txCount");
  console.log("ledger()     :", swapLedger       ?? "— (not present)");
  console.log("feeRecipient :", swapFeeRecipient  ?? "— (not present)");
  console.log("feeBps       :", swapFeeBps != null ? `${swapFeeBps}` : "— (not present)");
  console.log("txCount      :", swapTxCount       ?? "— (not present)");
  if (swapLedger === ethers.ZeroAddress) {
    console.log("⚠️  Swap ledger = address(0) — swaps are NOT logged to ChocoLedger");
  } else if (swapLedger) {
    console.log("✅ Swap is connected to ledger:", swapLedger);
  }
}

console.log("\n────────────────────────────────────────────────────────────\n");
