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
