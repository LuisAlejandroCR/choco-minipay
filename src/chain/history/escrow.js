// Holding-funds history reader: surfaces the gateway's escrow lifecycle (RunLocked / RunRefunded) as
// "held" movements, so the USDC that leaves the wallet at plan creation is visible and traceable.
import { ADDRESSES } from "../client.js";
import { ESCROW_EVENTS_ABI } from "../abis.js";
import { mapEscrowToMovement, settledRunKey } from "../history-mappers.js";
import { getContractEventsChunked, fetchExplorerLogs, ownerTopic } from "./sources.js";

// Funds are held in the gateway/escrow (scheduleEscrow points at the live ChocoGateway).
function escrowAddress() {
  return ADDRESSES.scheduleEscrow || ADDRESSES.ckesSwap || "";
}

async function readFromExplorer(owner, fromBlock, address) {
  const topic = ownerTopic(owner); // owner is the 1st indexed param of both events → topic1
  const [locked, refunded] = await Promise.all([
    fetchExplorerLogs(address, fromBlock, "RunLocked", { topic1: topic }),
    fetchExplorerLogs(address, fromBlock, "RunRefunded", { topic1: topic }),
  ]);
  if (locked === null || refunded === null) return null; // explorer unavailable → RPC fallback
  return [
    ...locked.map((log) => mapEscrowToMovement(log, log.timeStamp || 0, "lock")),
    ...refunded.map((log) => mapEscrowToMovement(log, log.timeStamp || 0, "refund")),
  ];
}

export async function readEscrowHistory(publicClient, owner, fromBlock) {
  const address = escrowAddress();
  if (!address) return [];

  const fromExplorer = await readFromExplorer(owner, fromBlock, address);
  if (fromExplorer !== null) return fromExplorer.sort((a, b) => b.sortKey - a.sortKey);

  // RPC fallback (explorer unavailable): chunked scan + a getBlock per unique block for timestamps.
  const [locked, refunded] = await Promise.all([
    getContractEventsChunked(publicClient, { address, abi: ESCROW_EVENTS_ABI, eventName: "RunLocked", args: { owner }, fromBlock, toBlock: "latest" }),
    getContractEventsChunked(publicClient, { address, abi: ESCROW_EVENTS_ABI, eventName: "RunRefunded", args: { owner }, fromBlock, toBlock: "latest" }),
  ]);
  const all = [...locked, ...refunded];
  if (!all.length) return [];

  const blockNumbers = [...new Set(all.map((log) => log.blockNumber))];
  const blocks = await Promise.all(blockNumbers.map((blockNumber) => publicClient.getBlock({ blockNumber })));
  const timeByBlock = new Map(blocks.map((block) => [block.number, Number(block.timestamp)]));

  return [
    ...locked.map((log) => mapEscrowToMovement(log, timeByBlock.get(log.blockNumber), "lock")),
    ...refunded.map((log) => mapEscrowToMovement(log, timeByBlock.get(log.blockNumber), "refund")),
  ].sort((a, b) => b.sortKey - a.sortKey);
}

// Gateway-backed settlement confirmations (RunSettled) → a Set of period-keys (scheduleId|YYYY-M), so the
// UI can mark a ledger SettlementReceipt "verified" only when a fund-backed RunSettled matches it (audit
// M-2). Best-effort: any read error yields an empty set → movements just show no "verified" badge.
export async function readSettledRuns(publicClient, owner, fromBlock) {
  const address = escrowAddress();
  if (!address) return new Set();
  try {
    const fromExplorer = await fetchExplorerLogs(address, fromBlock, "RunSettled", { topic1: ownerTopic(owner) });
    if (fromExplorer !== null) {
      return new Set(fromExplorer.map((log) => settledRunKey(log.args.scheduleId, log.timeStamp || 0)));
    }
    const logs = await getContractEventsChunked(publicClient, {
      address, abi: ESCROW_EVENTS_ABI, eventName: "RunSettled", args: { owner }, fromBlock, toBlock: "latest",
    });
    if (!logs.length) return new Set();
    const blockNumbers = [...new Set(logs.map((log) => log.blockNumber))];
    const blocks = await Promise.all(blockNumbers.map((blockNumber) => publicClient.getBlock({ blockNumber })));
    const timeByBlock = new Map(blocks.map((block) => [block.number, Number(block.timestamp)]));
    return new Set(logs.map((log) => settledRunKey(log.args.scheduleId, timeByBlock.get(log.blockNumber))));
  } catch {
    return new Set();
  }
}
