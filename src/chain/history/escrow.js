// Holding-funds history reader: surfaces the gateway's escrow lifecycle (RunLocked / RunRefunded) as
// "held" movements, so the USDC that leaves the wallet at plan creation is visible and traceable.
import { ADDRESSES } from "../client.js";
import { ESCROW_EVENTS_ABI } from "../abis.js";
import { mapEscrowToMovement } from "../history-mappers.js";
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
