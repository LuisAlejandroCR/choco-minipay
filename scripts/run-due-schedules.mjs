// Batch keeper for Choco scheduled plans.
//
// Dry run:
//   node scripts/run-due-schedules.mjs
//
// Execute due plans and record them in ChocoLedger:
//   $env:KEEPER_KEY="0x..."
//   node scripts/run-due-schedules.mjs --send
//
// This script keeps Choco non-custodial: the gateway pulls USDC from the user's
// prior allowance, sends KESm to the recipient, then the keeper records the
// SettlementReceipt in ChocoLedger.

import { ethers } from "ethers";

const args = new Set(process.argv.slice(2));
const shouldSend = args.has("--send");
const recordOnly = args.has("--record-only");

const LEDGER = process.env.VITE_LEDGER_ADDRESS || "";
const GATEWAY = process.env.VITE_SETTLEMENT_SPENDER_ADDRESS || process.env.VITE_CKES_SWAP_CONTRACT_ADDRESS || "";
const DEPLOY_BLOCK = Number(process.env.VITE_LEDGER_DEPLOY_BLOCK || 0);
const OWNER_FILTER = String(process.env.SCHEDULE_OWNER || "").toLowerCase();
const RPC_URL = process.env.RPC_URL || process.env.CELO_RPC_URL || process.env.VITE_CELO_RPC_URL || "https://forno.celo.org";
const KEEPER_KEY = process.env.KEEPER_KEY || "";
const LOG_CHUNK_SIZE = Number(process.env.LOG_CHUNK_SIZE || 20000);

if (!LEDGER) throw new Error("Set VITE_LEDGER_ADDRESS.");
if (shouldSend && !KEEPER_KEY) throw new Error("Set KEEPER_KEY to the current ChocoLedger keeper private key.");
if (shouldSend && !recordOnly && !GATEWAY) throw new Error("Set VITE_SETTLEMENT_SPENDER_ADDRESS or VITE_CKES_SWAP_CONTRACT_ADDRESS.");

const provider = new ethers.JsonRpcProvider(RPC_URL, { chainId: 42220, name: "celo" });
const signer = shouldSend ? new ethers.Wallet(KEEPER_KEY, provider) : null;

const LEDGER_ABI = [
  "function keeper() view returns (address)",
  "function scheduleCount() view returns (uint256)",
  "function getSchedule(uint256) view returns (tuple(address owner,address recipient,address settlementSpender,address sourceAsset,uint256 sourceAmount,uint256 destinationAmount,uint8 dayOfMonth,uint8 maxRetries,uint64 firstRunAt,bool active,bool cancelled,bytes32 commandHash,bytes32 receiptLabelHash))",
  "function recordSettlement(uint256,bool,address,uint256,uint256,bytes32,string) external",
  "event SettlementReceipt(uint256 indexed id,bool success,address sourceAsset,uint256 sourceAmount,uint256 destinationAmount,bytes32 settlementRef,string note)",
];

const GATEWAY_ABI = [
  "function executeScheduledExact(uint256 scheduleId,address payer,address recipient,uint256 usdcAmountIn,uint256 ckesExactOut) external returns (uint256)",
];

const ledgerReader = new ethers.Contract(LEDGER, LEDGER_ABI, provider);
const ledgerWriter = signer ? ledgerReader.connect(signer) : null;
const gatewayWriter = signer && GATEWAY ? new ethers.Contract(GATEWAY, GATEWAY_ABI, signer) : null;

function sameMonth(left, right) {
  return left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth();
}

function formatAddress(address) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function formatToken(value, decimals) {
  return ethers.formatUnits(value, decimals);
}

function formatLocal(seconds) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(Number(seconds) * 1000));
}

function scheduleWindowForCurrentMonth(schedule, now = new Date()) {
  const firstRun = new Date(Number(schedule.firstRunAt) * 1000);
  const current = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    Number(schedule.dayOfMonth) - 1,
    firstRun.getUTCHours(),
    firstRun.getUTCMinutes(),
    0,
    0,
  ));
  current.setUTCDate(Number(schedule.dayOfMonth));
  return Math.floor(current.getTime() / 1000);
}

async function queryFilterChunked(filter, fromBlock, toBlock) {
  const logs = [];
  const from = Math.max(0, Number(fromBlock || 0));
  const to = Number(toBlock);
  for (let start = from; start <= to; start += LOG_CHUNK_SIZE + 1) {
    const end = Math.min(to, start + LOG_CHUNK_SIZE);
    logs.push(...await ledgerReader.queryFilter(filter, start, end));
  }
  return logs;
}

async function currentMonthSettlementIds() {
  if (!DEPLOY_BLOCK) return new Set();
  const latest = await provider.getBlockNumber();
  const logs = await queryFilterChunked(ledgerReader.filters.SettlementReceipt(), DEPLOY_BLOCK, latest);
  const now = new Date();
  const blockCache = new Map();
  const settled = new Set();

  for (const log of logs) {
    if (!blockCache.has(log.blockNumber)) {
      blockCache.set(log.blockNumber, await provider.getBlock(log.blockNumber));
    }
    const block = blockCache.get(log.blockNumber);
    if (block && sameMonth(new Date(Number(block.timestamp) * 1000), now)) {
      settled.add(String(log.args.id));
    }
  }
  return settled;
}

function normalizeSchedule(id, value) {
  return {
    id,
    owner: value.owner,
    recipient: value.recipient,
    settlementSpender: value.settlementSpender,
    sourceAsset: value.sourceAsset,
    sourceAmount: value.sourceAmount,
    destinationAmount: value.destinationAmount,
    dayOfMonth: Number(value.dayOfMonth),
    maxRetries: Number(value.maxRetries),
    firstRunAt: Number(value.firstRunAt),
    active: Boolean(value.active),
    cancelled: Boolean(value.cancelled),
  };
}

async function readSchedules() {
  const count = Number(await ledgerReader.scheduleCount());
  const schedules = [];
  for (let id = 1; id <= count; id += 1) {
    const schedule = normalizeSchedule(id, await ledgerReader.getSchedule(id));
    if (OWNER_FILTER && schedule.owner.toLowerCase() !== OWNER_FILTER) continue;
    schedules.push(schedule);
  }
  return schedules;
}

async function main() {
  const code = await provider.getCode(LEDGER);
  if (code === "0x") throw new Error(`No contract code at VITE_LEDGER_ADDRESS=${LEDGER}.`);

  console.log("Ledger:", LEDGER);
  console.log("Gateway:", GATEWAY || "(not set)");
  console.log("RPC:", RPC_URL);
  if (signer) console.log("Keeper wallet:", signer.address);

  if (shouldSend) {
    const keeper = await ledgerReader.keeper();
    if (keeper.toLowerCase() !== signer.address.toLowerCase()) {
      throw new Error(`Keeper mismatch. Ledger keeper is ${keeper}.`);
    }
  }

  const [schedules, settledIds] = await Promise.all([
    readSchedules(),
    currentMonthSettlementIds(),
  ]);

  const nowSec = Math.floor(Date.now() / 1000);
  const due = schedules
    .map((schedule) => ({
      ...schedule,
      runAt: scheduleWindowForCurrentMonth(schedule),
      alreadySettled: settledIds.has(String(schedule.id)),
    }))
    .filter((schedule) =>
      schedule.active &&
      !schedule.cancelled &&
      schedule.firstRunAt <= nowSec &&
      schedule.runAt <= nowSec &&
      !schedule.alreadySettled);

  console.log(`Schedules: ${schedules.length}`);
  console.log(`Due now: ${due.length}`);

  for (const schedule of due) {
    const route = `${formatToken(schedule.sourceAmount, 6)} USDC -> ${formatToken(schedule.destinationAmount, 18)} KESm`;
    console.log(`#${schedule.id} ${formatAddress(schedule.owner)} -> ${formatAddress(schedule.recipient)} | ${route} | ${formatLocal(schedule.runAt)}`);
  }

  if (!shouldSend) {
    console.log("\nDry run only. Add --send to execute due plans. Add --record-only only for manual audit testing.");
    return;
  }

  for (const schedule of due) {
    if (!recordOnly && schedule.settlementSpender.toLowerCase() !== GATEWAY.toLowerCase()) {
      console.warn(`#${schedule.id} skipped: settlementSpender ${schedule.settlementSpender} does not match gateway ${GATEWAY}.`);
      continue;
    }

    let settlementRef = ethers.ZeroHash;
    if (!recordOnly) {
      console.log(`#${schedule.id} executing scheduled gateway settlement...`);
      const settleTx = await gatewayWriter.executeScheduledExact(
        schedule.id,
        schedule.owner,
        schedule.recipient,
        schedule.sourceAmount,
        schedule.destinationAmount,
      );
      console.log(`#${schedule.id} gateway tx: ${settleTx.hash}`);
      await settleTx.wait();
      settlementRef = settleTx.hash;
    }

    console.log(`#${schedule.id} recording ledger settlement...`);
    const recordTx = await ledgerWriter.recordSettlement(
      schedule.id,
      true,
      schedule.sourceAsset,
      schedule.sourceAmount,
      schedule.destinationAmount,
      settlementRef,
      recordOnly ? "scheduled batch record-only" : "scheduled batch settlement",
    );
    console.log(`#${schedule.id} ledger tx: ${recordTx.hash}`);
    await recordTx.wait();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
