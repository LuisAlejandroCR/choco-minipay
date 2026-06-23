// Create + fund ONE scheduled plan on the live ChocoLedger/ChocoGateway, for keeper testing.
// Mirrors the frontend (createScheduleViaRegistry + fundScheduleRun) but as a standalone script.
//
// The owner wallet must hold USDC (for the run) AND a little CELO (native gas — this script does
// not use MiniPay fee abstraction). Choco stays non-custodial: you run it with your own key.
//
// Usage (PowerShell), from the project root:
//   $env:OWNER_KEY="0x<owner private key>"     # wallet that owns + funds the plan (has USDC + CELO)
//   $env:TEST_KES="1"                          # KESm to deliver per run (default 1)
//   node scripts/create-test-schedule.mjs
// Then force the keeper to settle it now:
//   $env:KEEPER_KEY="0x<keeper key>"; $env:FORCE_SCHEDULE_ID="<printed id>"
//   node scripts/run-due-schedules.mjs --send

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ethers } from "ethers";

// Load project .env (fills only unset vars, so inline $env:OWNER_KEY=... still wins).
try {
  const envPath = resolve(dirname(fileURLToPath(import.meta.url)), "..", ".env");
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
} catch {}

const RPC     = process.env.CELO_RPC_URL || "https://forno.celo.org";
const LEDGER  = process.env.VITE_LEDGER_ADDRESS;
const GATEWAY = process.env.VITE_SCHEDULE_ESCROW_ADDRESS || process.env.VITE_CKES_SWAP_CONTRACT_ADDRESS;
const USDC    = process.env.VITE_USDC_ADDRESS || "0xcebA9300f2b948710d2653dD7B07f33A8B32118C";
const ownerKey = process.env.OWNER_KEY || process.env.DEPLOYER_PRIVATE_KEY;

if (!LEDGER)   throw new Error("Set VITE_LEDGER_ADDRESS (the new ChocoLedger).");
if (!GATEWAY)  throw new Error("Set VITE_SCHEDULE_ESCROW_ADDRESS (the new ChocoGateway).");
if (!ownerKey) throw new Error("Set OWNER_KEY to the plan owner's private key (needs USDC + CELO).");

const provider = new ethers.JsonRpcProvider(RPC, { chainId: 42220, name: "celo" });
const owner = new ethers.Wallet(ownerKey, provider);
const recipient = process.env.TEST_RECIPIENT || owner.address; // default: self-send
const destKes = ethers.parseUnits(process.env.TEST_KES || "1", 18);
const day = Math.min(28, Math.max(1, Number(process.env.TEST_DAY || new Date().getUTCDate())));
const firstRunAt = Math.floor(Date.now() / 1000); // now; FORCE_SCHEDULE_ID bypasses the time window

const ledger = new ethers.Contract(LEDGER, [
  "function createMonthlySchedule(address,address,uint256,uint256,uint8,uint64,bytes32,bytes32) external returns (uint256)",
  "function scheduleCount() view returns (uint256)",
  "event MonthlyScheduleCreated(uint256 indexed id,address indexed owner,address indexed recipient,address sourceAsset,uint256 sourceAmount,uint256 destinationAmount,uint8 dayOfMonth,uint64 firstRunAt,bytes32 commandHash)",
], owner);
const gateway = new ethers.Contract(GATEWAY, [
  "function quoteExactOut(uint256 ckesExactOut) view returns (uint256)",
  "function fundRun(uint256 scheduleId,uint256 usdcAmount) external",
  "function lockedOf(address,uint256) view returns (uint256)",
], owner);
const usdc = new ethers.Contract(USDC, [
  "function approve(address,uint256) external returns (bool)",
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
], owner);

const sourceAmount = await gateway.quoteExactOut(destKes);
if (sourceAmount === 0n || sourceAmount === ethers.MaxUint256) throw new Error("quoteExactOut failed (dry pool?).");

const bal = await usdc.balanceOf(owner.address);
console.log("Ledger      :", LEDGER);
console.log("Gateway     :", GATEWAY);
console.log("Owner       :", owner.address);
console.log("Recipient   :", recipient);
console.log("Deliver     :", ethers.formatUnits(destKes, 18), "KESm");
console.log("USDC needed :", ethers.formatUnits(sourceAmount, 6), "USDC (incl. buffer)");
console.log("USDC balance:", ethers.formatUnits(bal, 6), "USDC");
if (bal < sourceAmount) throw new Error("Owner USDC balance is below the quoted amount.");

const commandHash = ethers.id(`test-schedule-${Date.now()}`);
const labelHash = ethers.ZeroHash;
console.log("\n1/3 createMonthlySchedule...");
const txC = await ledger.createMonthlySchedule(recipient, USDC, sourceAmount, destKes, day, firstRunAt, commandHash, labelHash);
const rcC = await txC.wait();
const ev = rcC.logs.map((l) => { try { return ledger.interface.parseLog(l); } catch { return null; } })
  .find((p) => p && p.name === "MonthlyScheduleCreated");
const id = ev ? ev.args.id : await ledger.scheduleCount();
console.log("    schedule id:", id.toString(), "tx:", txC.hash);

console.log("2/3 approve USDC -> gateway...");
if ((await usdc.allowance(owner.address, GATEWAY)) < sourceAmount) {
  await (await usdc.approve(GATEWAY, sourceAmount)).wait();
}
console.log("3/3 fundRun (lock the run's USDC)...");
const txF = await gateway.fundRun(id, sourceAmount);
await txF.wait();
console.log("    locked:", ethers.formatUnits(await gateway.lockedOf(owner.address, id), 6), "USDC  tx:", txF.hash);

console.log(`\n✅ Plan #${id} created + funded on the new ledger. Now settle it:`);
console.log(`   $env:KEEPER_KEY="0x<keeper key>"; $env:FORCE_SCHEDULE_ID="${id}"`);
console.log(`   node scripts/run-due-schedules.mjs --send`);
