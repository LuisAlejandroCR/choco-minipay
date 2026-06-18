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
import { isDueThisMonth, sameMonth, scheduleWindowForCurrentMonth } from "../src/lib/keeper-window.js";

const args = new Set(process.argv.slice(2));
const shouldSend = args.has("--send");
const recordOnly = args.has("--record-only");

const LEDGER = process.env.VITE_LEDGER_ADDRESS || "";
const GATEWAY = process.env.VITE_SETTLEMENT_SPENDER_ADDRESS || process.env.VITE_CKES_SWAP_CONTRACT_ADDRESS || "";
const DEPLOY_BLOCK = Number(process.env.VITE_LEDGER_DEPLOY_BLOCK || 0);
const OWNER_FILTER = String(process.env.SCHEDULE_OWNER || "").toLowerCase();
const RPC_URL = process.env.RPC_URL || process.env.CELO_RPC_URL || process.env.VITE_CELO_RPC_URL || "https://forno.celo.org";
const EXPLORER_API = process.env.VITE_BLOCK_EXPLORER_API_URL || "https://celo.blockscout.com/api";
const KEEPER_KEY = process.env.KEEPER_KEY || "";
const LOG_CHUNK_SIZE = Number(process.env.LOG_CHUNK_SIZE || 20000);

if (!LEDGER) throw new Error("Set VITE_LEDGER_ADDRESS.");
if (shouldSend && !KEEPER_KEY) throw new Error("Set KEEPER_KEY to the current ChocoLedger keeper private key.");
if (shouldSend && !recordOnly && !GATEWAY) throw new Error("Set VITE_SETTLEMENT_SPENDER_ADDRESS or VITE_CKES_SWAP_CONTRACT_ADDRESS.");

const provider = new ethers.JsonRpcProvider(RPC_URL, { chainId: 42220, name: "celo" });
const signer = shouldSend ? new ethers.Wallet(KEEPER_KEY, provider) : null;

const LEDGER_ABI = [
  "function keeper() view returns (address)",
  "function recordSettlement(uint256,bool,address,uint256,uint256,bytes32,string) external",
  "event MonthlyScheduleCreated(uint256 indexed id,address indexed owner,address indexed recipient,address settlementSpender,address sourceAsset,uint256 sourceAmount,uint256 destinationAmount,uint8 dayOfMonth,uint64 firstRunAt,uint8 maxRetries,bytes32 commandHash)",
  "event ScheduleCancelled(uint256 indexed id,address indexed by)",
  "event SchedulePaused(uint256 indexed id,address indexed by)",
  "event ScheduleResumed(uint256 indexed id,address indexed by)",
  "event SettlementReceipt(uint256 indexed id,bool success,address sourceAsset,uint256 sourceAmount,uint256 destinationAmount,bytes32 settlementRef,string note)",
];

const GATEWAY_ABI = [
  "function executeScheduledExact(uint256 scheduleId,address payer,address recipient,uint256 usdcAmountIn,uint256 ckesExactOut) external returns (uint256)",
];

const ledgerReader = new ethers.Contract(LEDGER, LEDGER_ABI, provider);
const ledgerWriter = signer ? ledgerReader.connect(signer) : null;
const gatewayWriter = signer && GATEWAY ? new ethers.Contract(GATEWAY, GATEWAY_ABI, signer) : null;

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

async function queryFilterChunked(filter, fromBlock, toBlock) {
  const logs = [];
  const from = Math.max(0, Number(fromBlock || 0));
  const to = Number(toBlock);
  for (let start = from; start <= to; start += LOG_CHUNK_SIZE + 1) {
    const end = Math.min(to, start + LOG_CHUNK_SIZE);
    logs.push(...await ledgerReader.queryFilter(filter, start, end));
    if (start + LOG_CHUNK_SIZE + 1 <= to) await new Promise((r) => setTimeout(r, 300));
  }
  return logs;
}

async function currentMonthSettlementIds() {
  if (!DEPLOY_BLOCK) return new Set();
  const now = new Date();
  const monthStartSec = Math.floor(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) / 1000);

  // Blockscout includes timestamp in each log — no per-block RPC needed
  const explorerLogs = await getEventLogsFromExplorer("SettlementReceipt");
  if (explorerLogs !== null) {
    const settled = new Set();
    for (const log of explorerLogs) {
      if (log.timestamp >= monthStartSec) settled.add(String(log.args.id));
    }
    return settled;
  }

  // RPC fallback: estimate month-start block to minimise scan range
  const latest = await provider.getBlockNumber();
  const secondsSinceMonthStart = Math.floor(Date.now() / 1000) - monthStartSec;
  const CELO_BLOCK_TIME = 2;
  const BUFFER_BLOCKS = 7200;
  const estimatedMonthStartBlock = Math.max(DEPLOY_BLOCK, latest - Math.ceil(secondsSinceMonthStart / CELO_BLOCK_TIME) - BUFFER_BLOCKS);
  const rpcLogs = await queryFilterChunked(ledgerReader.filters.SettlementReceipt(), estimatedMonthStartBlock, latest);
  const blockCache = new Map();
  const settled = new Set();
  for (const log of rpcLogs) {
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

function hexToNum(value) {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.startsWith("0x")) return parseInt(value, 16);
  return Number(value);
}

async function getEventLogsFromExplorer(eventName) {
  if (!EXPLORER_API || !DEPLOY_BLOCK) return null;
  try {
    const topic0 = ledgerReader.interface.getEvent(eventName).topicHash;
    const url = new URL(EXPLORER_API);
    url.searchParams.set("module", "logs");
    url.searchParams.set("action", "getLogs");
    url.searchParams.set("address", LEDGER);
    url.searchParams.set("fromBlock", String(DEPLOY_BLOCK));
    url.searchParams.set("toBlock", "latest");
    url.searchParams.set("topic0", topic0);
    url.searchParams.set("sort", "asc");
    const response = await fetch(url.toString());
    if (!response.ok) return null;
    const json = await response.json();
    // status "0" means no records — not an error, return empty so RPC is not used
    if (json.status === "0") return [];
    if (!Array.isArray(json.result)) return null;
    const iface = ledgerReader.interface;
    return json.result.map((raw) => {
      try {
        const parsed = iface.parseLog({ topics: raw.topics, data: raw.data });
        if (!parsed || parsed.name !== eventName) return null;
        return {
          args: parsed.args,
          blockNumber: hexToNum(raw.blockNumber),
          index: hexToNum(raw.logIndex || 0),
          timestamp: hexToNum(raw.timeStamp || 0),
        };
      } catch { return null; }
    }).filter(Boolean);
  } catch { return null; }
}

async function getEventLogs(eventName, filter) {
  const explorerLogs = await getEventLogsFromExplorer(eventName);
  if (explorerLogs !== null) {
    console.log(`  ${eventName}: ${explorerLogs.length} (Blockscout)`);
    return explorerLogs;
  }
  console.log(`  ${eventName}: Blockscout unavailable, falling back to RPC chunks`);
  const latest = await provider.getBlockNumber();
  const rpcLogs = await queryFilterChunked(filter, DEPLOY_BLOCK, latest);
  return rpcLogs.map((log) => ({ args: log.args, blockNumber: log.blockNumber, index: log.index ?? 0, timestamp: 0 }));
}

async function readSchedules() {
  const createdLogs = await getEventLogs("MonthlyScheduleCreated", ledgerReader.filters.MonthlyScheduleCreated());
  const cancelledLogs = await getEventLogs("ScheduleCancelled", ledgerReader.filters.ScheduleCancelled());
  const pausedLogs = await getEventLogs("SchedulePaused", ledgerReader.filters.SchedulePaused());
  const resumedLogs = await getEventLogs("ScheduleResumed", ledgerReader.filters.ScheduleResumed());

  const cancelledIds = new Set(cancelledLogs.map((log) => String(log.args.id)));

  const pauseState = new Map();
  [...pausedLogs.map((log) => ({ log, active: false })), ...resumedLogs.map((log) => ({ log, active: true }))]
    .sort((a, b) => a.log.blockNumber - b.log.blockNumber || Number(a.log.index ?? 0) - Number(b.log.index ?? 0))
    .forEach(({ log, active }) => pauseState.set(String(log.args.id), active));

  return createdLogs
    .filter((log) => !OWNER_FILTER || log.args.owner.toLowerCase() === OWNER_FILTER)
    .map((log) => {
      const a = log.args;
      const id = String(a.id);
      const cancelled = cancelledIds.has(id);
      const active = cancelled ? false : (pauseState.get(id) ?? true);
      return {
        id: Number(a.id),
        owner: a.owner,
        recipient: a.recipient,
        settlementSpender: a.settlementSpender,
        sourceAsset: a.sourceAsset,
        sourceAmount: a.sourceAmount,
        destinationAmount: a.destinationAmount,
        dayOfMonth: Number(a.dayOfMonth),
        maxRetries: Number(a.maxRetries),
        firstRunAt: Number(a.firstRunAt),
        active,
        cancelled,
      };
    });
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
    .filter((schedule) => isDueThisMonth(schedule, nowSec) && !schedule.alreadySettled);

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
