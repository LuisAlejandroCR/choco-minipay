// Pure helpers lifted out of App.jsx: plan-operation error messaging, and the local↔chain transaction
// merge that prefers authoritative on-chain receipt fields over the optimistic local ones.

export function humanisePlanError(error) {
  // Log full viem error chain for debugging — check browser console when a plan action fails.
  console.error("[Choco] plan operation error:", error);
  const reason = String(error?.cause?.reason || "");
  const msg = [
    error?.message,
    error?.shortMessage,
    error?.cause?.message,
    error?.cause?.shortMessage,
    reason,
  ].filter(Boolean).join(" ");

  if (/user rejected|user denied|rejected the request/i.test(msg)) {
    return "Cancelled — you declined the wallet request.";
  }
  if (/not owner|not admin/i.test(msg) || reason === "not owner") {
    return "Not authorised: this plan wasn't created by this wallet.";
  }
  if (reason === "cancelled" || (/cancelled/i.test(msg) && !/user rejected|user denied/i.test(msg) && /reverted|revert/i.test(msg))) {
    return "This plan is already cancelled — it can't be paused or resumed.";
  }
  if (/missing.*ledger|missing.*registry|vite_ledger|vite_registry/i.test(msg)) {
    return "On-chain ledger is not configured. Contact support.";
  }
  if (/reverted|execution reverted/i.test(msg)) {
    return "Transaction reverted — check the plan state and try again.";
  }
  if (/network|fetch|timeout/i.test(msg)) {
    return "Network error. Check your connection and try again.";
  }
  return "Something went wrong. Please try again.";
}

// Matches transient network/RPC failures across providers: browser fetch failures, viem HTTP
// errors ("HTTP request failed... Failed to fetch"), forno rate limits, and gateway timeouts.
const NETWORK_HICCUP = /network|fetch|timeout|timed out|connection|econn|rate limit|429|50[234]|http request failed|load failed/i;

// Friendly copy for background reads (movements, balances). Raw viem/RPC errors must never
// reach the UI — the full error is logged to the console for debugging instead.
export function humaniseReadError(error, fallback = "Something didn't load. Please try again.") {
  console.error("[Choco] read error:", error);
  const msg = String(error?.shortMessage || error?.message || error || "");
  if (NETWORK_HICCUP.test(msg)) {
    return "We couldn't reach the network. Check your connection and try again.";
  }
  return fallback;
}

// Friendly copy for wallet-connection failures (connect button, wallet gate).
export function humaniseConnectError(error) {
  console.error("[Choco] wallet connect error:", error);
  const msg = String(error?.shortMessage || error?.message || error || "");
  if (/user rejected|user denied|rejected the request/i.test(msg)) {
    return "Connection cancelled — you closed the wallet request.";
  }
  if (NETWORK_HICCUP.test(msg)) {
    return "We couldn't reach the network. Check your connection and try again.";
  }
  return "We couldn't connect your wallet. Please try again.";
}

// Resolve the selected entity for a detail screen: prefer the live list row, else a locally-stashed
// fallback (used optimistically right after creation, before the chain read catches up).
export function pickById(list, id, fallback) {
  return (list || []).find((item) => item.id === id)
    || (fallback?.id === id ? fallback : null)
    || null;
}

function isUsefulTransactionValue(value) {
  if (value === 0) return true;
  return value !== undefined && value !== null && value !== "" && value !== "Recipient" && value !== "Unknown" && value !== "Pending";
}

function preferTransactionValue(chainValue, localValue) {
  return isUsefulTransactionValue(chainValue) ? chainValue : localValue;
}

export function mergeTransactionDetails(localTransaction, chainTransaction) {
  if (!chainTransaction) return localTransaction;
  if (!localTransaction) return chainTransaction;
  return {
    ...localTransaction,
    ...chainTransaction,
    id: localTransaction.id || chainTransaction.id,
    recipient: preferTransactionValue(chainTransaction.recipient, localTransaction.recipient),
    amount: preferTransactionValue(chainTransaction.amount, localTransaction.amount),
    asset: preferTransactionValue(chainTransaction.asset, localTransaction.asset),
    payAsset: preferTransactionValue(chainTransaction.payAsset, localTransaction.payAsset),
    payAmount: preferTransactionValue(chainTransaction.payAmount, localTransaction.payAmount),
    schedule: preferTransactionValue(chainTransaction.schedule, localTransaction.schedule),
    date: preferTransactionValue(chainTransaction.date, localTransaction.date),
    status: preferTransactionValue(chainTransaction.status, localTransaction.status),
    type: preferTransactionValue(chainTransaction.type, localTransaction.type),
    routeEstimate: preferTransactionValue(chainTransaction.routeEstimate, localTransaction.routeEstimate),
    from: preferTransactionValue(chainTransaction.from, localTransaction.from),
    to: preferTransactionValue(chainTransaction.to, localTransaction.to),
    toAddress: preferTransactionValue(chainTransaction.toAddress, localTransaction.toAddress),
    approveHash: preferTransactionValue(chainTransaction.approveHash, localTransaction.approveHash),
    hash: preferTransactionValue(chainTransaction.hash, localTransaction.hash),
  };
}
