import { decodeEventLog, formatUnits, isAddress, toEventHash } from "viem";
import { APP_CONFIG } from "../lib/app-config.js";
import { ADDRESSES, makePublicClient } from "./client.js";
import { ATTEMPT_EVENT_ABI, REGISTRY_EVENTS_ABI, SWAP_EVENT_ABI, TRANSFER_EVENT_ABI } from "./abis.js";
import {
  uniqueAddresses,
  composeMovementHistory,
  formatChainDate,
  tailAddress,
  unitsToNumber,
  mapAttemptToMovement,
  mapScheduleToPlan,
  isSendNowAttempt,
  mergeSendNowHistory,
  logOrder,
} from "./history-mappers.js";

// Re-export so existing consumers of history.js continue to work unchanged.
export { uniqueAddresses, composeMovementHistory };

const LOG_CHUNK_SIZE = 900n; // forno rejects ranges >~1000 blocks
const EXPLORER_TX_OFFSET = 10000;
const OPTIONAL_RPC_TIMEOUT_MS = 4500;
const SELECTORS = {
  createSchedule: "0x09b549a3",
  cancelSchedule: "0x237fc2a6",
  pauseSchedule: "0xd2c9f4a0",
  resumeSchedule: "0x635c1c6c",
  recordSettlement: "0xa74c3b74",
  recordSettlementLegacy: "0xebc97f9d",
  swapAndSend: "0x28b16ca8",
  swapAndSendExact: "0x47f703ee",
};

// ── Module-level result cache ─────────────────────────────────────────────────
// Navigating Plans → Home → Plans returns cached data instantly.
// Mutations (create/pause/cancel) must call clearLedgerCache() before refreshing.
let _cache = null; // { owner: string, result: object, ts: number }
const CACHE_TTL_MS = 120_000; // 2 minutes

export function clearLedgerCache() {
  _cache = null;
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

function hexToBigInt(value) {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") return BigInt(value);
  if (typeof value === "string" && value.startsWith("0x")) return BigInt(value);
  return BigInt(Number(value || 0));
}

function hexToNumber(value) {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.startsWith("0x")) return parseInt(value, 16);
  return Number(value || 0);
}

function eventAbiByName(eventName) {
  return REGISTRY_EVENTS_ABI.find((item) => item.type === "event" && item.name === eventName);
}

async function fetchExplorerLogs(contractAddress, fromBlock, eventName) {
  if (!APP_CONFIG.network.explorerApiUrl) return null;
  const eventAbi = eventAbiByName(eventName);
  if (!eventAbi) return null;

  try {
    const url = new URL(APP_CONFIG.network.explorerApiUrl);
    url.searchParams.set("module", "logs");
    url.searchParams.set("action", "getLogs");
    url.searchParams.set("address", contractAddress);
    url.searchParams.set("fromBlock", String(fromBlock || 0n));
    url.searchParams.set("toBlock", "latest");
    url.searchParams.set("topic0", toEventHash(eventAbi));
    url.searchParams.set("sort", "asc");
    if (APP_CONFIG.network.explorerApiKey) {
      url.searchParams.set("apikey", APP_CONFIG.network.explorerApiKey);
    }

    const response = await fetch(url.toString());
    if (!response.ok) return null;
    const json = await response.json();
    if (json.status === "0") return [];
    if (!Array.isArray(json.result)) return null;

    return json.result.map((raw) => {
      try {
        const decoded = decodeEventLog({
          abi: [eventAbi],
          data: raw.data,
          topics: raw.topics,
          strict: false,
        });
        if (decoded.eventName !== eventName) return null;
        return {
          address: contractAddress,
          transactionHash: raw.transactionHash,
          blockNumber: hexToBigInt(raw.blockNumber),
          logIndex: hexToNumber(raw.logIndex || 0),
          args: decoded.args,
        };
      } catch {
        return null;
      }
    }).filter(Boolean);
  } catch {
    return null;
  }
}

function sameAddress(a, b) {
  return String(a || "").toLowerCase() === String(b || "").toLowerCase();
}

function txSelector(tx) {
  return String(tx?.input || "").slice(0, 10).toLowerCase();
}

function isSuccessfulTx(tx) {
  return String(tx?.isError || "0") !== "1";
}

async function fetchExplorerTransactions(address, fromBlock) {
  if (!APP_CONFIG.network.explorerApiUrl || typeof fetch !== "function") return [];

  const url = new URL(APP_CONFIG.network.explorerApiUrl);
  url.searchParams.set("module", "account");
  url.searchParams.set("action", "txlist");
  url.searchParams.set("address", address);
  url.searchParams.set("startblock", String(fromBlock || 0n));
  url.searchParams.set("endblock", "latest");
  url.searchParams.set("sort", "asc");
  url.searchParams.set("page", "1");
  url.searchParams.set("offset", String(EXPLORER_TX_OFFSET));
  if (APP_CONFIG.network.explorerApiKey) {
    url.searchParams.set("apikey", APP_CONFIG.network.explorerApiKey);
  }

  const response = await fetch(url.toString());
  if (!response.ok) throw new Error(`Explorer API ${response.status}`);

  const json = await response.json();
  if (json.status === "0" && /no transactions/i.test(String(json.message || json.result || ""))) return [];
  if (!Array.isArray(json.result)) throw new Error("Explorer API returned no transaction list");
  return json.result;
}

function uniqueExplorerTransactions(txs = []) {
  const seen = new Set();
  return txs.filter((tx) => {
    const key = String(tx?.hash || "").toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function readReceipts(publicClient, txs) {
  return Promise.all(
    txs.map((tx) => publicClient.getTransactionReceipt({ hash: tx.hash })),
  );
}

async function withTimeout(promise, fallback, ms = OPTIONAL_RPC_TIMEOUT_MS) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((resolve) => {
        timer = setTimeout(() => resolve(fallback), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function decodeReceiptEvents(receipt, contractAddress, abi, eventName) {
  return receipt.logs
    .filter((log) => sameAddress(log.address, contractAddress))
    .map((log) => {
      try {
        const decoded = decodeEventLog({
          abi,
          data: log.data,
          topics: log.topics,
          strict: false,
        });
        if (decoded.eventName !== eventName) return null;
        return { ...log, eventName: decoded.eventName, args: decoded.args };
      } catch {
        return null;
      }
    })
    .filter(Boolean);
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
        type: swapLog ? "USDC swap + KESm send" : "KESm send",
        deliveryMode: "now",
        from: swapLog ? swapLog.args.payer : transferLog.args.from,
        to: tailAddress(transferLog.args.to),
        toAddress: transferLog.args.to,
        routeEstimate: swapLog ? `${usdcIn} USDC -> ${amountKes} KESm via Mento` : "",
        sortKey: timestamp || 0,
      };
    })
    .sort((a, b) => b.sortKey - a.sortKey);
}

async function readSendNowHistoryFromReceipts(publicClient, owner, fromBlock) {
  const swapAddresses = getSwapAddresses();
  if (!swapAddresses.length) return [];
  const swapAddressSet = new Set(swapAddresses.map((address) => address.toLowerCase()));

  const [contractTxGroups, walletTxs] = await Promise.all([
    Promise.all(swapAddresses.map((swapAddress) => fetchExplorerTransactions(swapAddress, fromBlock)
      .then((txs) => txs
        .filter(isSuccessfulTx)
        .filter((tx) => sameAddress(tx.from, owner))
        .filter((tx) => sameAddress(tx.to, swapAddress))
        .filter((tx) => [SELECTORS.swapAndSend, SELECTORS.swapAndSendExact].includes(txSelector(tx)))
        .map((tx) => ({ ...tx, swapAddress }))))),
    fetchExplorerTransactions(owner, fromBlock)
      .then((txs) => txs
        .filter(isSuccessfulTx)
        .filter((tx) => sameAddress(tx.from, owner))
        .filter((tx) => swapAddressSet.has(String(tx.to || "").toLowerCase()))
        .filter((tx) => [SELECTORS.swapAndSend, SELECTORS.swapAndSendExact].includes(txSelector(tx)))
        .map((tx) => ({ ...tx, swapAddress: tx.to })))
      .catch(() => []),
  ]);
  const txs = uniqueExplorerTransactions([...contractTxGroups.flat(), ...walletTxs]);
  if (!txs.length) return [];

  const receipts = await readReceipts(publicClient, txs);
  const movements = [];     // legacy cKES-Transfer pairs (routes that don't log to the ledger)
  const attemptLogs = [];   // canonical ChocoLedger AttemptLogged events (preferred)

  for (let i = 0; i < receipts.length; i += 1) {
    const receipt = receipts[i];
    const swapAddress = txs[i].swapAddress;
    const swapLog = decodeReceiptEvents(receipt, swapAddress, SWAP_EVENT_ABI, "UsdcToCkesSwap")[0] || null;

    // Canonical source: ChocoLedger AttemptLogged carries recipient + exact USDC/cKES for EVERY
    // route, including the UniV3 backup where cKES is delivered pool->recipient and never leaves
    // the swap contract (so the cKES-Transfer-from-swap heuristic below can't observe it).
    const attemptLog = isAddress(ADDRESSES.ledger || "")
      ? decodeReceiptEvents(receipt, ADDRESSES.ledger, ATTEMPT_EVENT_ABI, "AttemptLogged")
        .find((log) => sameAddress(log.args.senderWallet, owner) && isSendNowAttempt(log))
      : null;
    if (attemptLog) {
      attemptLogs.push(attemptLog);
      continue;
    }

    // Fallback for routes that don't log to the ledger: find the cKES delivery to the recipient.
    // Don't require from==swapAddress — only that it lands on someone other than payer/contract.
    const transferLog = decodeReceiptEvents(receipt, ADDRESSES.kesm, TRANSFER_EVENT_ABI, "Transfer")
      .find((log) => !sameAddress(log.args.to, owner) && !sameAddress(log.args.to, swapAddress));
    if (!transferLog) continue;

    movements.push({ transferLog, swapLog });
  }

  const blockNumbers = [...new Set([
    ...movements.map((entry) => entry.transferLog.blockNumber),
    ...attemptLogs.map((log) => log.blockNumber),
  ])];
  const blocks = await Promise.all(blockNumbers.map((blockNumber) => publicClient.getBlock({ blockNumber })));
  const timeByBlock = new Map(blocks.map((block) => [block.number, Number(block.timestamp)]));

  const attemptMovements = attemptLogs.map((log) => mapAttemptToMovement(log, timeByBlock.get(log.blockNumber)));
  const transferMovements = movements
    .map(({ transferLog, swapLog }) => {
      const amountKes = Math.round(unitsToNumber(transferLog.args.value, 18));
      const usdcIn = swapLog ? unitsToNumber(swapLog.args.usdcIn, 6) : 0;
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
        type: swapLog ? "USDC swap + KESm send" : "KESm send",
        deliveryMode: "now",
        from: swapLog ? swapLog.args.payer : transferLog.args.from,
        to: tailAddress(transferLog.args.to),
        toAddress: transferLog.args.to,
        routeEstimate: swapLog ? `${usdcIn} USDC -> ${amountKes} KESm via Mento` : "",
        sortKey: timestamp || 0,
      };
    });

  return mergeSendNowHistory(attemptMovements, transferMovements);
}

async function readAttemptHistory(publicClient, owner, fromBlock, contractAddress) {
  const attempts = await getContractEventsChunked(publicClient, {
    address: contractAddress,
    abi: ATTEMPT_EVENT_ABI,
    eventName: "AttemptLogged",
    args: { senderWallet: owner },
    fromBlock,
    toBlock: "latest",
  });

  const sendNowAttempts = attempts.filter(isSendNowAttempt);
  const blockNumbers = [...new Set(sendNowAttempts.map((log) => log.blockNumber))];
  const blocks = await Promise.all(blockNumbers.map((blockNumber) => publicClient.getBlock({ blockNumber })));
  const timeByBlock = new Map(blocks.map((block) => [block.number, Number(block.timestamp)]));

  return sendNowAttempts
    .map((log) => mapAttemptToMovement(log, timeByBlock.get(log.blockNumber)))
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

async function readScheduleDataFromExplorerLogs(owner, fromBlock, contractAddress) {
  const [created, cancelled, paused, resumed] = await Promise.all([
    fetchExplorerLogs(contractAddress, fromBlock, "MonthlyScheduleCreated"),
    fetchExplorerLogs(contractAddress, fromBlock, "ScheduleCancelled"),
    fetchExplorerLogs(contractAddress, fromBlock, "SchedulePaused"),
    fetchExplorerLogs(contractAddress, fromBlock, "ScheduleResumed"),
  ]);

  if ([created, cancelled, paused, resumed].some((logs) => logs === null)) return null;

  const ownerCreated = created.filter((log) => sameAddress(log.args.owner, owner));
  const ownerIds = new Set(ownerCreated.map((log) => String(log.args.id)));
  const settlements = ownerIds.size
    ? await fetchExplorerLogs(contractAddress, fromBlock, "SettlementReceipt")
    : [];
  if (settlements === null) return null;

  return {
    created: ownerCreated,
    cancelled: cancelled.filter((log) => ownerIds.has(String(log.args.id)) || sameAddress(log.args.by, owner)),
    paused: paused.filter((log) => ownerIds.has(String(log.args.id)) || sameAddress(log.args.by, owner)),
    resumed: resumed.filter((log) => ownerIds.has(String(log.args.id)) || sameAddress(log.args.by, owner)),
    settlements: settlements.filter((log) => ownerIds.has(String(log.args.id))),
  };
}

async function readScheduleDataFromReceipts(publicClient, owner, fromBlock, contractAddress) {
  const scheduleSelectors = [
    SELECTORS.createSchedule,
    SELECTORS.cancelSchedule,
    SELECTORS.pauseSchedule,
    SELECTORS.resumeSchedule,
    SELECTORS.recordSettlement,
    SELECTORS.recordSettlementLegacy,
  ];
  const [contractTxs, walletTxs] = await Promise.all([
    fetchExplorerTransactions(contractAddress, fromBlock).catch(() => []),
    fetchExplorerTransactions(owner, fromBlock).catch(() => []),
  ]);
  const txs = uniqueExplorerTransactions([...contractTxs, ...walletTxs]);
  const relevantTxs = txs
    .filter(isSuccessfulTx)
    .filter((tx) => sameAddress(tx.to, contractAddress))
    .filter((tx) => scheduleSelectors.includes(txSelector(tx)));

  if (!relevantTxs.length) {
    return { created: [], cancelled: [], paused: [], resumed: [], settlements: [] };
  }

  const receipts = await readReceipts(publicClient, relevantTxs);
  const created = receipts.flatMap((receipt) =>
    decodeReceiptEvents(receipt, contractAddress, REGISTRY_EVENTS_ABI, "MonthlyScheduleCreated"))
    .filter((log) => sameAddress(log.args.owner, owner));
  const ownerIds = new Set(created.map((log) => String(log.args.id)));
  const cancelled = receipts.flatMap((receipt) =>
    decodeReceiptEvents(receipt, contractAddress, REGISTRY_EVENTS_ABI, "ScheduleCancelled"))
    .filter((log) => ownerIds.has(String(log.args.id)) || sameAddress(log.args.by, owner));
  const paused = receipts.flatMap((receipt) =>
    decodeReceiptEvents(receipt, contractAddress, REGISTRY_EVENTS_ABI, "SchedulePaused"))
    .filter((log) => ownerIds.has(String(log.args.id)) || sameAddress(log.args.by, owner));
  const resumed = receipts.flatMap((receipt) =>
    decodeReceiptEvents(receipt, contractAddress, REGISTRY_EVENTS_ABI, "ScheduleResumed"))
    .filter((log) => ownerIds.has(String(log.args.id)) || sameAddress(log.args.by, owner));
  const settlements = receipts.flatMap((receipt) =>
    decodeReceiptEvents(receipt, contractAddress, REGISTRY_EVENTS_ABI, "SettlementReceipt"))
    .filter((log) => ownerIds.has(String(log.args.id)));

  return { created, cancelled, paused, resumed, settlements };
}

async function readScheduleDataWithFallback(publicClient, owner, fromBlock, contractAddress) {
  const explorerLogs = await readScheduleDataFromExplorerLogs(owner, fromBlock, contractAddress);
  if (explorerLogs && (explorerLogs.created.length || explorerLogs.settlements.length)) {
    return explorerLogs;
  }

  try {
    const scheduleData = await withTimeout(
      readScheduleData(publicClient, owner, fromBlock, contractAddress),
      { created: [], cancelled: [], paused: [], resumed: [], settlements: [] },
    );
    if (scheduleData.created.length || scheduleData.settlements.length) {
      return scheduleData;
    }
  } catch {
    // Celo RPC can reject wide eth_getLogs ranges; receipt fallback keeps the UI hydrated.
  }

  return readScheduleDataFromReceipts(publicClient, owner, fromBlock, contractAddress);
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
  const [sendNowFallback, sendNowReceiptFallback, scheduleData, ledgerAttempts] = await Promise.all([
    withTimeout(readSendNowHistory(publicClient, owner, sendNowFromBlock), []).catch(() => []),
    readSendNowHistoryFromReceipts(publicClient, owner, sendNowFromBlock).catch(() => []),
    hasLedger
      ? readScheduleDataWithFallback(publicClient, owner, fromBlock, ledgerOrRegistry).catch(() => null)
      : Promise.resolve(null),
    hasLedger
      // Send-now attempts are scanned from the swap-contract deploy block, not the ledger deploy
      // block. The ledger predates the current swap by hundreds of thousands of blocks, and the
      // sequential 900-block chunking would blow past the 4.5s timeout (returning empty) as the
      // gap grows. Send-now movements only exist from the swap deploy onward, so this is both
      // correct and bounded. Schedule settlements still scan from the full ledger range below.
      ? withTimeout(readAttemptHistory(publicClient, owner, sendNowFromBlock, ledgerOrRegistry), []).catch(() => [])
      : Promise.resolve([]),
  ]);
  const sendNowHistory = mergeSendNowHistory(
    ledgerAttempts,
    mergeSendNowHistory(sendNowReceiptFallback, sendNowFallback),
  );

  if (!scheduleData) {
    return { plans: [], history: sendNowHistory.sort((a, b) => b.sortKey - a.sortKey) };
  }

  const { created, cancelled, paused, resumed, settlements } = scheduleData;

  const blockNumbers = [...new Set([...created, ...settlements].map((log) => log.blockNumber))];
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
    })
    .sort((a, b) => b.onchainId - a.onchainId);

  const history = composeMovementHistory({ sendNowHistory, settlements, scheduleById, timeByBlock });

  const result = { plans, history };
  _cache = { owner: ownerLower, result, ts: Date.now() };
  return result;
}
