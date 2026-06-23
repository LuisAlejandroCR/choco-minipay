// Schedule data readers: reconstruct a wallet's plans + settlement receipts from chain state.
// Explorer-logs first (fast), then a chunked RPC scan, then an explorer-txlist→receipts fallback —
// each keeps the UI hydrated when the layer above is unavailable or rate-limited.
import { REGISTRY_EVENTS_ABI } from "../abis.js";
import {
  getContractEventsChunked,
  fetchExplorerLogs,
  fetchExplorerTransactions,
  decodeReceiptEvents,
  readReceipts,
  sameAddress,
  txSelector,
  isSuccessfulTx,
  uniqueExplorerTransactions,
  withTimeout,
  SELECTORS,
} from "./sources.js";

// Four schedule event types run in parallel (each sequential inside — 1 chunk at a time).
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

export async function readScheduleDataWithFallback(publicClient, owner, fromBlock, contractAddress) {
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
