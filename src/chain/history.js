import { formatUnits, isAddress } from "viem";
import { APP_CONFIG } from "../lib/app-config.js";
import { ADDRESSES, makePublicClient } from "./client.js";
import { REGISTRY_EVENTS_ABI, SWAP_EVENT_ABI, TRANSFER_EVENT_ABI } from "./abis.js";

// --- Private formatting helpers ---

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

// Display just the last 4 hex chars for anonymous recipients. Supabase contact labels
// override this in useChocoLedger.attachContactLabels before the UI sees the value.
function tailAddress(address) {
  return isAddress(address) ? `...${address.slice(-4)}` : "Unknown";
}

// --- Private log → model mappers ---

function mapScheduleToPlan(log) {
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
    nextDate: formatDay(a.dayOfMonth),
    fee: APP_CONFIG.transfer.networkFeeLabel,
    routeEstimate: "",
    hash: log.transactionHash,
    status: "Active",
    deliveryMode: "schedule",
  };
}

function mapScheduleToMovement(log, timestamp) {
  const a = log.args;
  const amountKes = Math.round(Number(formatUnits(a.destinationAmount, 18)));
  return {
    id: `tx-${log.transactionHash}-${log.logIndex}`,
    planId: `schedule-${a.id}`,
    recipient: tailAddress(a.recipient),
    amount: amountKes.toLocaleString("en-US"),
    asset: APP_CONFIG.assets.destination,
    payAsset: isCkesAsset(a.sourceAsset) ? APP_CONFIG.assets.destination : APP_CONFIG.assets.source,
    schedule: `Every ${formatDay(a.dayOfMonth)} - ${scheduleTimeLabel()}`,
    date: formatChainDate(timestamp),
    status: "Scheduled",
    hash: log.transactionHash,
    type: "Plan confirmed",
    deliveryMode: "schedule",
    from: a.owner,
    to: tailAddress(a.recipient),
    toAddress: a.recipient,
    routeEstimate: "",
    sortKey: timestamp || 0,
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

// --- Private: send-now history reader ---

// cKES ERC20 Transfer events + ChocoCkesSwap UsdcToCkesSwap events feed the send-now history.
// We treat each (txHash, logIndex) as a unique movement; swaps that immediately re-transfer cKES
// to a recipient produce two events in the same tx and are correlated by txHash.
async function readSendNowHistory(publicClient, owner, fromBlock) {
  const ckesAddress = ADDRESSES.kesm;
  const swapAddress = APP_CONFIG.contracts.ckesSwap;

  // Direct cKES transfers sent by the owner (pure sends or old two-hop swap path)
  const transfers = await publicClient.getContractEvents({
    address: ckesAddress,
    abi: TRANSFER_EVENT_ABI,
    eventName: "Transfer",
    args: { from: owner },
    fromBlock,
    toBlock: "latest",
  });

  let swaps = [];
  if (swapAddress && isAddress(swapAddress)) {
    swaps = await publicClient.getContractEvents({
      address: swapAddress,
      abi: SWAP_EVENT_ABI,
      eventName: "UsdcToCkesSwap",
      args: { payer: owner },
      fromBlock,
      toBlock: "latest",
    });
  }

  const swapByTx = new Map(swaps.map((log) => [log.transactionHash, log]));

  // txHashes where the owner personally sent cKES (direct send or old swap() path)
  const directTxHashes = new Set(
    transfers
      .filter((log) => String(log.args.to).toLowerCase() !== String(owner).toLowerCase())
      .map((log) => log.transactionHash),
  );

  // Direct send movements: owner → recipient, skip the old swap's intermediate return leg
  const directMovements = transfers
    .filter((log) => String(log.args.to).toLowerCase() !== String(owner).toLowerCase())
    .filter((log) => !(swapAddress && String(log.args.from).toLowerCase() === String(swapAddress).toLowerCase()))
    .map((log) => ({ transferLog: log, swapLog: swapByTx.get(log.transactionHash) || null }));

  // swapAndSend movements: owner paid USDC but cKES was delivered by the swap contract
  // directly to the recipient — so there is no owner-initiated cKES transfer in directMovements.
  const swapOnlySwaps = swaps.filter((s) => !directTxHashes.has(s.transactionHash));
  let swapDeliveryMovements = [];
  if (swapOnlySwaps.length > 0 && swapAddress && isAddress(swapAddress)) {
    const swapOnlySet = new Set(swapOnlySwaps.map((s) => s.transactionHash));
    const deliveries = await publicClient.getContractEvents({
      address: ckesAddress,
      abi: TRANSFER_EVENT_ABI,
      eventName: "Transfer",
      args: { from: swapAddress },
      fromBlock,
      toBlock: "latest",
    });
    swapDeliveryMovements = deliveries
      .filter((log) => swapOnlySet.has(log.transactionHash))
      .map((log) => ({ transferLog: log, swapLog: swapByTx.get(log.transactionHash) || null }));
  }

  // Fallback: capture cKES Transfers FROM the swap contract that didn't correlate with a
  // UsdcToCkesSwap event (ABI mismatch or event not emitted). Appear as "cKES send" in history
  // rather than "USDC swap + cKES send" since the swap log is unavailable.
  const capturedTxHashes = new Set([
    ...directMovements.map((e) => e.transferLog.transactionHash),
    ...swapDeliveryMovements.map((e) => e.transferLog.transactionHash),
  ]);
  let orphanSwapDeliveries = [];
  if (swapAddress && isAddress(swapAddress)) {
    const allSwapDeliveries = await publicClient.getContractEvents({
      address: ckesAddress,
      abi: TRANSFER_EVENT_ABI,
      eventName: "Transfer",
      args: { from: swapAddress },
      fromBlock,
      toBlock: "latest",
    });
    orphanSwapDeliveries = allSwapDeliveries
      .filter((log) => !capturedTxHashes.has(log.transactionHash))
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

// --- Public: full ledger read ---

// Rebuild the owner's plans and movement history from ledger events. Returns empty lists
// (no error) until a ledger address is configured, so the UI degrades cleanly pre-deploy.
export async function readOwnerLedger(owner) {
  if (!owner || !isAddress(owner)) return { plans: [], history: [] };

  const publicClient = makePublicClient();
  const deployBlock = APP_CONFIG.contracts.ledgerDeployBlock || APP_CONFIG.contracts.registryDeployBlock;
  const fromBlock = deployBlock ? BigInt(deployBlock) : 0n;

  // Send-now history is always read (cKES Transfers + Swap events). Schedule data only when the
  // ledger is deployed, so the UI still has History for send-now transactions pre-deploy.
  let sendNowHistory = [];
  try {
    sendNowHistory = await readSendNowHistory(publicClient, owner, fromBlock);
  } catch {
    sendNowHistory = [];
  }

  const ledgerOrRegistry = ADDRESSES.ledger || ADDRESSES.registry;
  if (!ledgerOrRegistry || !isAddress(ledgerOrRegistry)) {
    return { plans: [], history: sendNowHistory.sort((a, b) => b.sortKey - a.sortKey) };
  }

  try {
    const created = await publicClient.getContractEvents({
      address: ledgerOrRegistry,
      abi: REGISTRY_EVENTS_ABI,
      eventName: "MonthlyScheduleCreated",
      args: { owner },
      fromBlock,
      toBlock: "latest",
    });
    const cancelled = await publicClient.getContractEvents({
      address: ledgerOrRegistry,
      abi: REGISTRY_EVENTS_ABI,
      eventName: "ScheduleCancelled",
      fromBlock,
      toBlock: "latest",
    });
    const ids = created.map((log) => log.args.id);
    const settlements = ids.length
      ? await publicClient.getContractEvents({
        address: ledgerOrRegistry,
        abi: REGISTRY_EVENTS_ABI,
        eventName: "SettlementReceipt",
        args: { id: ids },
        fromBlock,
        toBlock: "latest",
      })
      : [];

    const blockNumbers = [...new Set([...created, ...settlements].map((log) => log.blockNumber))];
    const blocks = await Promise.all(blockNumbers.map((blockNumber) => publicClient.getBlock({ blockNumber })));
    const timeByBlock = new Map(blocks.map((block) => [block.number, Number(block.timestamp)]));

    const cancelledIds = new Set(cancelled.map((log) => String(log.args.id)));
    const scheduleById = new Map(created.map((log) => [String(log.args.id), log.args]));

    const plans = created
      .filter((log) => !cancelledIds.has(String(log.args.id)))
      .map(mapScheduleToPlan);

    const history = [
      ...sendNowHistory,
      ...created.map((log) => mapScheduleToMovement(log, timeByBlock.get(log.blockNumber))),
      ...settlements.map((log) => mapSettlementToMovement(log, scheduleById.get(String(log.args.id)), timeByBlock.get(log.blockNumber))),
    ].sort((a, b) => b.sortKey - a.sortKey);

    return { plans, history };
  } catch (error) {
    return { plans: [], history: sendNowHistory, error: `Could not read on-chain ledger: ${error.shortMessage || error.message}` };
  }
}
