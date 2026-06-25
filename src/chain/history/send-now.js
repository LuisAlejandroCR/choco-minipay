// Send-now history readers: reconstruct one-off USDC→KESm sends from chain state. The canonical
// source is the ledger's AttemptLogged (explorer-first); the Transfer/Swap heuristic and the
// explorer-txlist→receipts path are fallbacks that also surface legacy swap contracts.
import { formatUnits, isAddress } from "viem";
import { APP_CONFIG } from "../../lib/app-config.js";
import { ADDRESSES } from "../client.js";
import { ATTEMPT_EVENT_ABI, SWAP_EVENT_ABI, TRANSFER_EVENT_ABI } from "../abis.js";
import {
  mapAttemptToMovement,
  isSendNowAttempt,
  tailAddress,
  formatChainDate,
  unitsToNumber,
  mergeSendNowHistory,
} from "../history-mappers.js";
import {
  getSwapAddresses,
  getContractEventsChunked,
  fetchExplorerTransactions,
  fetchExplorerLogs,
  decodeReceiptEvents,
  readReceipts,
  sameAddress,
  txSelector,
  isSuccessfulTx,
  uniqueExplorerTransactions,
  ownerTopic,
  SELECTORS,
} from "./sources.js";

// Transfer + all UsdcToCkesSwap streams start simultaneously (each sequential inside).
// Single combined swap-delivery fetch covers both swapDelivery and orphan paths.
export async function readSendNowHistory(publicClient, owner, fromBlock) {
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
        schedule: "One-time send",
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

export async function readSendNowHistoryFromReceipts(publicClient, owner, fromBlock) {
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
    // route, including the UniV3 backup where cKES is delivered pool->recipient.
    const attemptLog = isAddress(ADDRESSES.ledger || "")
      ? decodeReceiptEvents(receipt, ADDRESSES.ledger, ATTEMPT_EVENT_ABI, "AttemptLogged")
        .find((log) => sameAddress(log.args.senderWallet, owner) && isSendNowAttempt(log))
      : null;
    if (attemptLog) {
      attemptLogs.push(attemptLog);
      continue;
    }

    // Fallback for routes that don't log to the ledger (e.g. the legacy ChocoGateway).
    const transferLog = decodeReceiptEvents(receipt, ADDRESSES.kesm, TRANSFER_EVENT_ABI, "Transfer")
      .find((log) => sameAddress(log.args.from, swapAddress)
        || (!sameAddress(log.args.to, owner) && !sameAddress(log.args.to, swapAddress)));
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
        schedule: "One-time send",
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

// Explorer-first: one owner-filtered getLogs call (with inline block times) instead of hundreds of
// 900-block RPC chunks + a getBlock per block. This is the main browser-history speedup — the public
// RPC CORS-throttles browser origins, so the chunked scan is what made the browser lag behind mobile.
async function readAttemptHistoryFromExplorer(owner, fromBlock, contractAddress) {
  const logs = await fetchExplorerLogs(contractAddress, fromBlock, "AttemptLogged", { topic2: ownerTopic(owner) });
  if (logs === null) return null; // explorer unavailable → caller falls back to RPC
  return logs
    .filter(isSendNowAttempt)
    .map((log) => mapAttemptToMovement(log, log.timeStamp || 0))
    .sort((a, b) => b.sortKey - a.sortKey);
}

export async function readAttemptHistory(publicClient, owner, fromBlock, contractAddress) {
  const fromExplorer = await readAttemptHistoryFromExplorer(owner, fromBlock, contractAddress);
  if (fromExplorer !== null) return fromExplorer;

  // RPC fallback (explorer unavailable): chunked scan + a getBlock per unique block for timestamps.
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
