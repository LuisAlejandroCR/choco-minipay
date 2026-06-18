// Manual keeper test for scheduled plans.
//
// Dry-run only:
//   $env:SCHEDULE_ID="7"; $env:KEEPER_KEY="0x..."; node scripts/test-settle.mjs
//
// Record a test SettlementReceipt:
//   $env:SCHEDULE_ID="7"; $env:KEEPER_KEY="0x..."; node scripts/test-settle.mjs --send
//
// This script records the on-chain receipt that the keeper would emit after a scheduled
// settlement. It does not move funds by itself.

import { ethers } from "ethers";

const LEDGER = process.env.VITE_LEDGER_ADDRESS || "0xd8F54CCbc314014443DEbAA8558B09D4ccC57A9E";
const LEDGER_DEPLOY_BLOCK = BigInt(process.env.VITE_LEDGER_DEPLOY_BLOCK || 69697824);
const EXPLORER_API_URL = process.env.VITE_BLOCK_EXPLORER_API_URL || "https://celo.blockscout.com/api";
const DEFAULT_SCHEDULE_ID = 7n;

const args = new Set(process.argv.slice(2));
const shouldSend = args.has("--send");
const force = args.has("--force");
const scheduleId = BigInt(process.env.SCHEDULE_ID || DEFAULT_SCHEDULE_ID);
const keeperKey = process.env.KEEPER_KEY;
const timeoutMs = Number(process.env.RPC_TIMEOUT_MS || 12000);
const skipKeeperCheck = process.env.SKIP_KEEPER_CHECK === "true";
const skipScheduleRead = process.env.SKIP_SCHEDULE_READ === "true";
const preferEventLookup = process.env.PREFER_EVENT_LOOKUP !== "false";

if (!keeperKey) {
  console.error("Set KEEPER_KEY to the private key of the current ChocoLedger keeper.");
  process.exit(1);
}

function formatToken(value, decimals) {
  return ethers.formatUnits(value, decimals);
}

function formatLocal(seconds) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZoneName: "short",
  }).format(new Date(Number(seconds) * 1000));
}

async function withTimeout(label, task, ms = timeoutMs) {
  let timer;
  try {
    return await Promise.race([
      task(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function fetchWithTimeout(label, url, ms = timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { signal: controller.signal });
  } catch (error) {
    if (error.name === "AbortError") throw new Error(`${label} timed out after ${ms}ms`);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

const rpcUrl = process.env.RPC_URL || process.env.CELO_RPC_URL || process.env.VITE_RPC_URL || "https://forno.celo.org";
const provider = new ethers.JsonRpcProvider(rpcUrl, { chainId: 42220, name: "celo" });
const keeper = new ethers.Wallet(keeperKey, provider);

const ledger = new ethers.Contract(LEDGER, [
  "function keeper() view returns (address)",
  "function recordSettlement(uint256,bool,address,uint256,uint256,bytes32,string) external",
  "function recordSettlement(uint256,uint256,uint256,bytes32) external",
  "function getSchedule(uint256) external view returns (address,address,address,address,uint256,uint256,uint8,uint8,uint64,bool,bool,bytes32,bytes32)",
  "function schedules(uint256) external view returns (address,address,address,address,uint256,uint256,uint8,uint8,uint64,bool,bool,bytes32,bytes32)",
  "function getPlan(uint256) external view returns (address,address,uint256,uint64,uint64,uint8)",
  "function plans(uint256) external view returns (address,address,uint256,uint64,uint64,uint8)",
  "event MonthlyScheduleCreated(uint256 indexed id,address indexed owner,address indexed recipient,address settlementSpender,address sourceAsset,uint256 sourceAmount,uint256 destinationAmount,uint8 dayOfMonth,uint64 firstRunAt,uint8 maxRetries,bytes32 commandHash)",
  "event ScheduleCancelled(uint256 indexed id,address indexed by)",
  "event SchedulePaused(uint256 indexed id,address indexed by)",
  "event ScheduleResumed(uint256 indexed id,address indexed by)",
], keeper);

async function tryRead(label, reader) {
  try {
    const value = await withTimeout(label, reader);
    return { label, value };
  } catch (error) {
    if (error.code === "BAD_DATA" || error.code === "CALL_EXCEPTION") return null;
    throw error;
  }
}

async function readSchedule(id) {
  if (skipScheduleRead) {
    return readScheduleFromEnv(id);
  }

  if (preferEventLookup) {
    const eventSchedule = await readScheduleFromEvents(id);
    if (eventSchedule) {
      return { type: "modern", source: "MonthlyScheduleCreated event", value: eventSchedule };
    }
  }

  const modern = await tryRead("getSchedule", () => ledger.getSchedule(id))
    || await tryRead("schedules", () => ledger.schedules(id));
  if (modern) {
    return { type: "modern", source: modern.label, value: modern.value };
  }

  const legacy = await tryRead("getPlan", () => ledger.getPlan(id))
    || await tryRead("plans", () => ledger.plans(id));
  if (legacy) {
    return { type: "legacy", source: legacy.label, value: legacy.value };
  }

  if (!preferEventLookup) {
    const eventSchedule = await readScheduleFromEvents(id);
    if (eventSchedule) {
      return { type: "modern", source: "MonthlyScheduleCreated event", value: eventSchedule };
    }
  }

  const code = await provider.getCode(LEDGER);
  const codeHint = code === "0x" ? "No contract code exists at this address." : "The contract ABI does not match ChocoLedger or the legacy plan registry.";
  throw new Error(`${codeHint} Check VITE_LEDGER_ADDRESS=${LEDGER}.`);
}

function readScheduleFromEnv(id) {
  const sourceAmount = BigInt(process.env.SOURCE_AMOUNT || process.env.SRC_AMOUNT || 0);
  const destinationAmount = BigInt(process.env.DESTINATION_AMOUNT || process.env.DST_AMOUNT || 0);
  if (!sourceAmount || !destinationAmount) {
    throw new Error("SKIP_SCHEDULE_READ=true requires SOURCE_AMOUNT and DESTINATION_AMOUNT.");
  }

  const firstRunAt = BigInt(process.env.FIRST_RUN_AT || Math.floor(Date.now() / 1000));
  return {
    type: "modern",
    source: "env override",
    value: [
      process.env.SCHEDULE_OWNER || keeper.address,
      process.env.SCHEDULE_RECIPIENT || ethers.ZeroAddress,
      process.env.SETTLEMENT_SPENDER || keeper.address,
      process.env.SOURCE_ASSET || process.env.VITE_USDC_ADDRESS || "0xcebA9300f2b948710d2653dD7B07f33A8B32118C",
      sourceAmount,
      destinationAmount,
      Number(process.env.DAY_OF_MONTH || new Date(Number(firstRunAt) * 1000).getUTCDate()),
      Number(process.env.MAX_RETRIES || 1),
      firstRunAt,
      process.env.SCHEDULE_ACTIVE !== "false",
      process.env.SCHEDULE_CANCELLED === "true",
      ethers.ZeroHash,
      ethers.ZeroHash,
    ],
  };
}

async function queryFilterChunked(filter, fromBlock, toBlock) {
  const chunk = 250n;
  const logs = [];
  for (let from = fromBlock; from <= toBlock; from += chunk + 1n) {
    const to = from + chunk > toBlock ? toBlock : from + chunk;
    logs.push(...await queryFilterRange(filter, from, to));
  }
  return logs;
}

async function queryFilterRange(filter, fromBlock, toBlock) {
  try {
    return await withTimeout(`queryFilter ${fromBlock}-${toBlock}`, () => ledger.queryFilter(filter, fromBlock, toBlock));
  } catch (error) {
    if (fromBlock >= toBlock) return [];
    const mid = (fromBlock + toBlock) / 2n;
    const [left, right] = await Promise.all([
      queryFilterRange(filter, fromBlock, mid),
      queryFilterRange(filter, mid + 1n, toBlock),
    ]);
    return [...left, ...right];
  }
}

async function readScheduleFromEvents(id) {
  let latest = "latest";
  let created = await readScheduleCreatedFromExplorer(id, LEDGER_DEPLOY_BLOCK, latest);
  if (!created.length) {
    latest = BigInt(await withTimeout("getBlockNumber", () => provider.getBlockNumber()));
    created = await queryFilterChunked(ledger.filters.MonthlyScheduleCreated(id), LEDGER_DEPLOY_BLOCK, BigInt(latest));
  }
  if (!created.length) return null;

  const event = created.at(-1);
  const eventBlock = BigInt(event.blockNumber);
  const [cancelled, paused, resumed] = await Promise.all([
    readEventLogsFromExplorer("ScheduleCancelled", id, eventBlock, latest),
    readEventLogsFromExplorer("SchedulePaused", id, eventBlock, latest),
    readEventLogsFromExplorer("ScheduleResumed", id, eventBlock, latest),
  ]);
  const lifecycle = [
    ...paused.map((log) => ({ log, active: false })),
    ...resumed.map((log) => ({ log, active: true })),
  ].sort((a, b) => Number(a.log.blockNumber - b.log.blockNumber) || Number(a.log.index - b.log.index));

  const active = cancelled.length ? false : lifecycle.at(-1)?.active ?? true;
  const a = event.args;
  return [
    a.owner,
    a.recipient,
    a.settlementSpender,
    a.sourceAsset,
    a.sourceAmount,
    a.destinationAmount,
    a.dayOfMonth,
    a.maxRetries,
    a.firstRunAt,
    active,
    Boolean(cancelled.length),
    a.commandHash,
    ethers.ZeroHash,
  ];
}

async function readScheduleCreatedFromExplorer(id, fromBlock, toBlock) {
  return readEventLogsFromExplorer("MonthlyScheduleCreated", id, fromBlock, toBlock);
}

async function readEventLogsFromExplorer(eventName, id, fromBlock, toBlock) {
  if (!EXPLORER_API_URL || typeof fetch !== "function") return [];

  const event = ledger.interface.getEvent(eventName);
  const topic0 = event.topicHash;
  const topic1 = ethers.zeroPadValue(ethers.toBeHex(id), 32);
  const url = new URL(EXPLORER_API_URL);
  url.searchParams.set("module", "logs");
  url.searchParams.set("action", "getLogs");
  url.searchParams.set("address", LEDGER);
  url.searchParams.set("fromBlock", String(fromBlock));
  url.searchParams.set("toBlock", String(toBlock));
  url.searchParams.set("topic0", topic0);
  url.searchParams.set("topic1", topic1);

  const response = await fetchWithTimeout(`explorer ${eventName}`, url.toString());
  if (!response.ok) return [];
  const json = await response.json();
  if (!Array.isArray(json.result)) return [];

  const iface = ledger.interface;
  return json.result
    .map((log) => {
      const parsed = iface.parseLog({
        topics: log.topics,
        data: log.data,
      });
      if (parsed.name !== eventName) return null;
      return {
        args: parsed.args,
        blockNumber: BigInt(log.blockNumber),
        index: Number(log.logIndex || 0),
      };
    })
    .filter(Boolean);
}

console.log("Ledger:", LEDGER);
console.log("RPC:", rpcUrl);
console.log("Keeper wallet:", keeper.address);

if (!skipKeeperCheck) {
  console.log("Checking ledger keeper...");
  const chainKeeper = await withTimeout("keeper()", () => ledger.keeper());
  if (chainKeeper.toLowerCase() !== keeper.address.toLowerCase()) {
    console.error(`Keeper mismatch. Ledger keeper is ${chainKeeper}.`);
    process.exit(1);
  }
} else {
  console.warn("Skipping keeper() check because SKIP_KEEPER_CHECK=true.");
}

console.log("Reading schedule...");
const scheduleRead = await readSchedule(scheduleId);
console.log("Schedule getter:", `${scheduleRead.source} (${scheduleRead.type})`);

let owner;
let recipient;
let settlementSpender;
let sourceAsset;
let sourceAmount;
let destinationAmount;
let dayOfMonth;
let maxRetries;
let firstRunAt;
let active;
let cancelled;

if (scheduleRead.type === "modern") {
  [
    owner,
    recipient,
    settlementSpender,
    sourceAsset,
    sourceAmount,
    destinationAmount,
    dayOfMonth,
    maxRetries,
    firstRunAt,
    active,
    cancelled,
  ] = scheduleRead.value;
} else {
  const intervalSeconds = 30n * 24n * 60n * 60n;
  const status = Number(scheduleRead.value[5]);
  [
    owner,
    recipient,
    sourceAmount,
    ,
    firstRunAt,
  ] = scheduleRead.value;
  settlementSpender = keeper.address;
  sourceAsset = process.env.VITE_USDC_ADDRESS || "0xcebA9300f2b948710d2653dD7B07f33A8B32118C";
  destinationAmount = process.env.DST_AMOUNT ? BigInt(process.env.DST_AMOUNT) : sourceAmount;
  dayOfMonth = new Date(Number(firstRunAt) * 1000).getUTCDate();
  maxRetries = 1;
  active = status === 0;
  cancelled = status === 2;
  console.log("Legacy interval seconds:", `${scheduleRead.value[3] || intervalSeconds}`);
}

const now = Math.floor(Date.now() / 1000);
const due = active && !cancelled && Number(firstRunAt) <= now;

console.log(`Schedule #${scheduleId}`);
console.log("Owner:", owner);
console.log("Recipient:", recipient);
console.log("Settlement spender:", settlementSpender);
console.log("Source amount:", `${formatToken(sourceAmount, 6)} USDC`);
console.log("Destination amount:", `${formatToken(destinationAmount, 18)} KESm`);
console.log("Day:", `${dayOfMonth}`);
console.log("Max retries:", `${maxRetries}`);
console.log("First run UTC:", new Date(Number(firstRunAt) * 1000).toISOString());
console.log("First run local:", formatLocal(firstRunAt));
console.log("Active:", active);
console.log("Cancelled:", cancelled);
console.log("Due now:", due);

if (!shouldSend) {
  console.log("\nDry run only. Add --send to record a test SettlementReceipt.");
  process.exit(0);
}

if (!due && !force) {
  console.error("\nSchedule is not due yet. Add --force only for manual UI testing.");
  process.exit(1);
}

console.log("\nSending recordSettlement...");
const tx = scheduleRead.type === "modern"
  ? await withTimeout("recordSettlement modern", () => ledger["recordSettlement(uint256,bool,address,uint256,uint256,bytes32,string)"](
    scheduleId,
    true,
    sourceAsset,
    sourceAmount,
    destinationAmount,
    ethers.ZeroHash,
    "test settlement via test-settle.mjs",
  ))
  : await withTimeout("recordSettlement legacy", () => ledger["recordSettlement(uint256,uint256,uint256,bytes32)"](
    scheduleId,
    sourceAmount,
    destinationAmount,
    ethers.ZeroHash,
  ));
console.log("Tx hash:", tx.hash);
const receipt = await withTimeout("tx.wait", () => tx.wait(), 60000);
console.log("Confirmed in block:", receipt.blockNumber);
console.log("Done. Refresh History in Choco to see the executed plan run.");
