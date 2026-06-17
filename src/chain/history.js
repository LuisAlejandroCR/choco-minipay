import { formatUnits, isAddress } from "viem";
import { APP_CONFIG } from "../lib/app-config.js";
import { ADDRESSES, makePublicClient } from "./client.js";
import { REGISTRY_EVENTS_ABI, SWAP_EVENT_ABI, TRANSFER_EVENT_ABI } from "./abis.js";

const LOG_CHUNK_SIZE = 45_000n;

// ── Module-level result cache ─────────────────────────────────────────────────
// Navigating Plans → Home → Plans returns cached data instantly.
// Mutations (create/pause/cancel) must call clearLedgerCache() before refreshing.
let _cache = null; // { owner: string, result: object, ts: number }
const CACHE_TTL_MS = 120_000; // 2 minutes

export function clearLedgerCache() {
  _cache = null;
}

// --- Private formatting helpers ---

export function uniqueAddresses(values = []) {
  const seen = new Set();
  return values
    .filter((value) => isAddress(value || ""))
    .map((value) => value)
    .filter((value) => {
      const key = String(value).toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function getSwapAddresses() {
  return uniqueAddresses([
    ...(APP_CONFIG.contracts.ckesSwapAddresses || []),
    APP_CONFIG.contracts.ckesSwap,
  ]);
}

// Sequential for-loop — one 45K-block chunk at a time per event type.
// Running N of these in parallel = N concurrent forno requests (safe).
async function getContractEventsChunked(publicClient, params) {
  const latest = params.toBlock && params.toBlock !== "latest"
    ? BigInt(params.toBlock)
    : await publicClient.getBlockNumber();
  const first = params.fromBlock ? BigInt(params.fromBlock) : 0n;
  if (first > latest) return [];

  const logs = [];
  for (let from = first; from <= latest; from += LOG_CHUNK_SIZE + 1n) {
    const to = from + LOG_CHUNK_SIZE > latest ? latest : from + LOG_CHUNK_SIZE;
    logs.push(...await publicClient.getContractEvents({
      ...params,
      fromBlock: from,
      toBlock: to,
    }));
  }
  return logs;
}

function formatDay(day) {
  const value = Number(day);
  if (value === 1) return "1st";
  if (value === 2) return "2nd";
  if (value === 3) return "3rd";
  return `${value}th`;
}

function scheduleTimeLabel() {
  const hour = APP_CONFIG.transfer.defaultScheduleHour;
  const period = hour < 12 ? "AM" : "PM";
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display}:00 ${period}`;
}

function formatChainDate(seconds) {
  if (!seconds) return "Pending";
  const date = new Date(Number(seconds) * 1000);
  const formatted = new Intl.DateTimeFormat("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(date);
  return `${formatted.replace(",", "")} Local`;
}

function isCkesAsset(address) {
  return String(address).toLowerCase() === String(ADDRESSES.kesm).toLowerCase();
}

function tailAddress(address) {
  return isAddress(address) ? `...${address.slice(-4)}` : "Unknown";
}

// --- Private log → model mappers ---

function logOrder(log) {
  return BigInt(log.blockNumber || 0n) * 100000n + BigInt(log.logIndex || 0);
}

function mapScheduleToPlan(log, lastSettlementAt = 0, active = true) {
  const a = log.args;
  const amountKes = Math.round(Number(formatUnits(a.destinationAmount, 18)));
  return {
    id: `schedule-${a.id}`,
    onchainId: Number(a.id),
    recipient: tailAddress(a.recipient),
    recipientAddress: a.recipient,
    amount: amountKes.toLocaleString("en-US"),
    amountMinor: amountKes,
    amountKes,
    asset: APP_CONFIG.assets.destination,
    payAsset: isCkesAsset(a.sourceAsset) ? APP_CONFIG.assets.destination : APP_CONFIG.assets.source,
    corridor: APP_CONFIG.transfer.corridor,
    schedule: `Every ${formatDay(a.dayOfMonth)} - ${scheduleTimeLabel()}`,
    dayLabel: formatDay(a.dayOfMonth),
    dayOfMonth: Number(a.dayOfMonth),
    nextDate: formatDay(a.dayOfMonth),
    firstRunAt: Number(a.firstRunAt || 0),
    lastSettlementAt,
    fee: APP_CONFIG.transfer.networkFeeLabel,
    routeEstimate: "",
    hash: log.transactionHash,
    status: active ? "Active" : "Paused",
    active,
    deliveryMode: "schedule",
  };
}

function mapSettlementToMovement(log, schedule, timestamp) {
  const a = log.args;
  const amountKes = Math.round(Number(formatUnits(a.destinationAmount, 18)));
  return {
    id: `settle-${log.transactionHash}-${log.logIndex}`,
    planId: `schedule-${a.id}`,
    recipient: schedule ? tailAddress(schedule.recipient) : "Recipient",
    amount: amountKes.toLocaleString("en-US"),
    asset: APP_CONFIG.assets.destination,
    payAsset: schedule && isCkesAsset(schedule.sourceAsset) ? APP_CONFIG.assets.destination : APP_CONFIG.assets.source,
    schedule: schedule ? `Every ${formatDay(schedule.dayOfMonth)} - ${scheduleTimeLabel()}` : "Scheduled",
    date: formatChainDate(timestamp),
    status: a.success ? "Sent" : "Failed",
    hash: log.transactionHash,
    type: a.success ? "Settlement sent" : "Settlement failed",
    deliveryMode: "schedule",
    from: schedule ? schedule.owner : "",
    to: schedule ? tailAddress(schedule.recipient) : "Recipient",
    toAddress: schedule ? schedule.recipient : "",
    routeEstimate: "",
    sortKey: timestamp || 0,
  };
}

export function composeMovementHistory({
  sendNowHistory = [],
  settlements = [],
  scheduleById = new Map(),
  timeByBlock = new Map(),
} = {}) {
  return [
    ...sendNowHistory,
    ...settlements.map((log) =>
      mapSettlementToMovement(log, scheduleById.get(String(log.args.id)), timeByBlock.get(log.blockNumber))),
  ].sort((a, b) => b.sortKey - a.sortKey);
}

// --- Private: send-now history reader ---

// Transfer + all UsdcToCkesSwap streams start simultaneously (each sequential inside).
// Single combined swap-delivery fetch covers both swapDelivery and orphan paths.
// Peak: 2–3 concurrent forno requests per chunk iteration.
async function readSendNowHistory(publicClient, owner, fromBlock) {
  const ckesAddress = ADDRESSES.kesm;
  const swapAddresses = getSwapAddresses();
  const swapAddressSet = new Set(swapAddresses.map((address) => String(address).toLowerCase()));

  const [transfers, ...swapGroups] = await Promise.all([
    getContractEventsChunked(publicClient, {
      address: ckesAddress,
      abi: TRANSFER_EVENT_ABI,
      eventName: "Transfer",
      args: { from: owner },
      fromBlock,
      toBlock: "latest",
    }),
    ...swapAddresses.map((swapAddress) =>
      getContractEventsChunked(publicClient, {
        address: swapAddress,
        abi: SWAP_EVENT_ABI,
        eventName: "UsdcToCkesSwap",
        args: { payer: owner },
        fromBlock,
        toBlock: "latest",
      }),
    ),
  ]);
  const swaps = swapGroups.flat();

  const swapByTx = new Map(swaps.map((log) => [log.transactionHash, log]));

  const directTxHashes = new Set(
    transfers
      .filter((log) => String(log.args.to).toLowerCase() !== String(owner).toLowerCase())
      .map((log) => log.transactionHash),
  );

  const directMovements = transfers
    .filter((log) => String(log.args.to).toLowerCase() !== String(owner).toLowerCase())
    .filter((log) => !swapAddressSet.has(String(log.args.from).toLowerCase()))
    .map((log) => ({ transferLog: log, swapLog: swapByTx.get(log.transactionHash) || null }));

  const swapOnlySwaps = swaps.filter((s) => !directTxHashes.has(s.transactionHash));

  // Single combined fetch for all swap-contract deliveries — avoids the previous double query.
  let allSwapDeliveries = [];
  if (swapAddresses.length > 0) {
    const deliveryGroups = await Promise.all(
      swapAddresses.map((swapAddress) =>
        getContractEventsChunked(publicClient, {
          address: ckesAddress,
          abi: TRANSFER_EVENT_ABI,
          eventName: "Transfer",
          args: { from: swapAddress },
          fromBlock,
          toBlock: "latest",
        }),
      ),
    );
    allSwapDeliveries = deliveryGroups.flat();
  }

  const swapOnlySet = new Set(swapOnlySwaps.map((s) => s.transactionHash));
  const swapDeliveryMovements = allSwapDeliveries
    .filter((log) => swapOnlySet.has(log.transactionHash))
    .filter((log) => String(log.args.to).toLowerCase() !== String(owner).toLowerCase())
    .map((log) => ({ transferLog: log, swapLog: swapByTx.get(log.transactionHash) || null }));

  const capturedTxHashes = new Set([
    ...directMovements.map((e) => e.transferLog.transactionHash),
    ...swapDeliveryMovements.map((e) => e.transferLog.transactionHash),
  ]);
  const orphanCandidates = allSwapDeliveries
    .filter((log) => !capturedTxHashes.has(log.transactionHash))
    .filter((log) => String(log.args.to).toLowerCase() !== String(owner).toLowerCase());

  let orphanSwapDeliveries = [];
  if (orphanCandidates.length > 0) {
    const txs = await Promise.all(
      orphanCandidates.map((log) => publicClient.getTransaction({ hash: log.transactionHash })),
    );
    orphanSwapDeliveries = orphanCandidates
      .filter((_, i) => String(txs[i].from).toLowerCase() === String(owner).toLowerCase())
      .map((log) => ({ transferLog: log, swapLog: null }));
  }

  const movements = [...directMovements, ...swapDeliveryMovements, ...orphanSwapDeliveries];

  const blockNumbers = [...new Set(movements.map((entry) => entry.transferLog.blockNumber))];
  const blocks = await Promise.all(blockNumbers.map((blockNumber) => publicClient.getBlock({ blockNumber })));
  const timeByBlock = new Map(blocks.map((block) => [block.number, Number(block.timestamp)]));

  return movements
    .map(({ transferLog, swapLog }) => {
      const amountKes = Math.round(Number(formatUnits(transferLog.args.value, 18)));
      const usdcIn = swapLog ? Number(formatUnits(swapLog.args.usdcIn, 6)) : 0;
      const timestamp = timeByBlock.get(transferLog.blockNumber);
      return {
        id: `send-${transferLog.transactionHash}-${transferLog.logIndex}`,
        planId: "send-now",
        recipient: tailAddress(transferLog.args.to),
        recipientAddress: transferLog.args.to,
        amount: amountKes.toLocaleString("en-US"),
        amountMinor: amountKes,
        asset: APP_CONFIG.assets.destination,
        payAsset: swapLog ? APP_CONFIG.assets.source : APP_CONFIG.assets.destination,
        payAmount: swapLog ? usdcIn : amountKes,
        schedule: "Send once now",
        date: formatChainDate(timestamp),
        status: "Sent",
        hash: transferLog.transactionHash,
        type: swapLog ? "USDC swap + cKES send" : "cKES send",
        deliveryMode: "now",
        from: swapLog ? swapLog.args.payer : transferLog.args.from,
        to: tailAddress(transferLog.args.to),
        toAddress: transferLog.args.to,
        routeEstimate: swapLog ? `${usdcIn} USDC -> ${amountKes} cKES via Mento` : "",
        sortKey: timestamp || 0,
      };
    })
    .sort((a, b) => b.sortKey - a.sortKey);
}

// --- Private: schedule data reader ---

// Four schedule event types run in parallel (each sequential inside — 1 chunk at a time).
// Peak: 4 concurrent forno requests. Settlement is sequential after owner IDs are known.
async function readScheduleData(publicClient, owner, fromBlock, contractAddress) {
  const [created, cancelled, paused, resumed] = await Promise.all([
    getContractEventsChunked(publicClient, {
      address: contractAddress,
      abi: REGISTRY_EVENTS_ABI,
      eventName: "MonthlyScheduleCreated",
      args: { owner },
      fromBlock,
      toBlock: "latest",
    }),
    getContractEventsChunked(publicClient, {
      address: contractAddress,
      abi: REGISTRY_EVENTS_ABI,
      eventName: "ScheduleCancelled",
      fromBlock,
      toBlock: "latest",
    }),
    getContractEventsChunked(publicClient, {
      address: contractAddress,
      abi: REGISTRY_EVENTS_ABI,
      eventName: "SchedulePaused",
      fromBlock,
      toBlock: "latest",
    }),
    getContractEventsChunked(publicClient, {
      address: contractAddress,
      abi: REGISTRY_EVENTS_ABI,
      eventName: "ScheduleResumed",
      fromBlock,
      toBlock: "latest",
    }),
  ]);

  const ids = created.map((log) => log.args.id);
  const settlements = ids.length
    ? await getContractEventsChunked(publicClient, {
      address: contractAddress,
      abi: REGISTRY_EVENTS_ABI,
      eventName: "SettlementReceipt",
      args: { id: ids },
      fromBlock,
      toBlock: "latest",
    })
    : [];

  return { created, cancelled, paused, resumed, settlements };
}

// --- Public: full ledger read ---

export async function readOwnerLedger(owner) {
  if (!owner || !isAddress(owner)) return { plans: [], history: [] };

  const ownerLower = owner.toLowerCase();
  if (_cache && _cache.owner === ownerLower && Date.now() - _cache.ts < CACHE_TTL_MS) {
    return _cache.result;
  }

  const publicClient = makePublicClient();
  const deployBlock = APP_CONFIG.contracts.ledgerDeployBlock || APP_CONFIG.contracts.registryDeployBlock;
  const fromBlock = deployBlock ? BigInt(deployBlock) : 0n;
  const sendNowDeployBlock = APP_CONFIG.contracts.ckesSwapDeployBlock || deployBlock;
  const sendNowFromBlock = sendNowDeployBlock ? BigInt(sendNowDeployBlock) : 0n;

  const ledgerOrRegistry = ADDRESSES.ledger || ADDRESSES.registry;
  const hasLedger = Boolean(ledgerOrRegistry && isAddress(ledgerOrRegistry));

  // sendNow and schedule run in parallel:
  // - sendNow: Transfer + Swaps simultaneously (2–3 sequential streams, ~1 forno req each at a time)
  // - schedule: Created + Cancelled + Paused + Resumed simultaneously (4 sequential streams)
  // Peak: ~6 concurrent forno requests — well within forno's limit.
  const [sendNowHistory, scheduleData] = await Promise.all([
    readSendNowHistory(publicClient, owner, sendNowFromBlock).catch(() => []),
    hasLedger
      ? readScheduleData(publicClient, owner, fromBlock, ledgerOrRegistry).catch(() => null)
      : Promise.resolve(null),
  ]);

  if (!scheduleData) {
    const result = { plans: [], history: sendNowHistory.sort((a, b) => b.sortKey - a.sortKey) };
    _cache = { owner: ownerLower, result, ts: Date.now() };
    return result;
  }

  const { created, cancelled, paused, resumed, settlements } = scheduleData;

  const blockNumbers = [...new Set(settlements.map((log) => log.blockNumber))];
  const blocks = await Promise.all(blockNumbers.map((blockNumber) => publicClient.getBlock({ blockNumber })));
  const timeByBlock = new Map(blocks.map((block) => [block.number, Number(block.timestamp)]));

  const cancelledIds = new Set(cancelled.map((log) => String(log.args.id)));
  const scheduleById = new Map(created.map((log) => [String(log.args.id), log.args]));
  const ownerIds = new Set(scheduleById.keys());
  const pausedById = new Map();
  [...paused.map((log) => ({ log, paused: true })), ...resumed.map((log) => ({ log, paused: false }))]
    .filter((entry) => ownerIds.has(String(entry.log.args.id)))
    .sort((a, b) => (logOrder(a.log) < logOrder(b.log) ? -1 : 1))
    .forEach((entry) => pausedById.set(String(entry.log.args.id), entry.paused));
  const settlementTimestampById = new Map();
  settlements.forEach((log) => {
    const id = String(log.args.id);
    const timestamp = timeByBlock.get(log.blockNumber) || 0;
    settlementTimestampById.set(id, Math.max(settlementTimestampById.get(id) || 0, timestamp));
  });

  const plans = created
    .filter((log) => !cancelledIds.has(String(log.args.id)))
    .map((log) => {
      const id = String(log.args.id);
      return mapScheduleToPlan(log, settlementTimestampById.get(id) || 0, !pausedById.get(id));
    });

  const history = composeMovementHistory({
    sendNowHistory,
    settlements,
    scheduleById,
    timeByBlock,
  });

  const result = { plans, history };
  _cache = { owner: ownerLower, result, ts: Date.now() };
  return result;
}
