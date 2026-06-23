// History orchestrator: kicks off the send-now + schedule readers in parallel, merges the results
// into the plans + movement history the UI renders, and caches the result per owner. The heavy
// lifting lives in ./history/{sources,send-now,schedules}.js.
import { isAddress } from "viem";
import { APP_CONFIG } from "../lib/app-config.js";
import { ADDRESSES, makePublicClient } from "./client.js";
import {
  uniqueAddresses,
  composeMovementHistory,
  mapScheduleToPlan,
  mergeSendNowHistory,
  logOrder,
} from "./history-mappers.js";
import {
  readSendNowHistory,
  readSendNowHistoryFromReceipts,
  readAttemptHistory,
} from "./history/send-now.js";
import { readScheduleDataWithFallback } from "./history/schedules.js";
import { readEscrowHistory } from "./history/escrow.js";
import { withTimeout } from "./history/sources.js";

// Re-export so existing consumers of history.js continue to work unchanged.
export { uniqueAddresses, composeMovementHistory };

// ── Module-level result cache ─────────────────────────────────────────────────
// Navigating Plans → Home → Plans returns cached data instantly.
// Mutations (create/pause/cancel) must call clearLedgerCache() before refreshing.
let _cache = null; // { owner: string, result: object, ts: number }
const CACHE_TTL_MS = 120_000; // 2 minutes

export function clearLedgerCache() {
  _cache = null;
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
  const [sendNowFallback, sendNowReceiptFallback, scheduleData, ledgerAttempts, escrowHistory] = await Promise.all([
    withTimeout(readSendNowHistory(publicClient, owner, sendNowFromBlock), []).catch(() => []),
    // The explorer/receipts path is bounded by the wallet's tx count (one txlist call), not by
    // block range, so it can afford to scan from the full ledger-era block. This is what surfaces
    // legacy swap contracts (e.g. the old ChocoGateway) whose txs predate the current swap deploy.
    readSendNowHistoryFromReceipts(publicClient, owner, fromBlock).catch(() => []),
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
    // Held funds: gateway RunLocked/RunRefunded for this owner, from the swap/escrow deploy block.
    withTimeout(readEscrowHistory(publicClient, owner, sendNowFromBlock), []).catch(() => []),
  ]);
  const sendNowHistory = mergeSendNowHistory(
    ledgerAttempts,
    mergeSendNowHistory(sendNowReceiptFallback, sendNowFallback),
  );

  if (!scheduleData) {
    return {
      plans: [],
      history: [...sendNowHistory, ...escrowHistory].sort((a, b) => b.sortKey - a.sortKey),
    };
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

  const history = [
    ...composeMovementHistory({ sendNowHistory, settlements, scheduleById, timeByBlock }),
    ...escrowHistory,
  ].sort((a, b) => b.sortKey - a.sortKey);

  const result = { plans, history };
  _cache = { owner: ownerLower, result, ts: Date.now() };
  return result;
}
