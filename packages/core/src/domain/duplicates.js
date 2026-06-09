// planSignature handles both intent-shape (recipientAlias, amountMinor, destinationAsset,
// cadence, dayLabel) and plan-shape (recipient, amount, asset) via field-name fallbacks.
// buildPlanFromIntent in planUtils.js preserves the raw intent fields on every committed
// plan, so the worker and the frontend always produce the same signature for the same
// logical transfer. This convergence is required before Block 14.
export function planSignature(plan) {
  return [
    plan.recipientAlias ?? plan.recipient,
    plan.amountMinor ?? plan.amount,
    plan.destinationAsset ?? plan.asset,
    plan.deliveryMode,
    plan.cadence ?? null,
    plan.dayLabel ?? null,
  ].join("|").toLowerCase();
}

export function getDuplicatePlan(plans, candidate, excludeId = "") {
  if (!candidate || candidate.deliveryMode !== "schedule") return null;
  const candidateSignature = planSignature(candidate);
  return plans.find((plan) => plan.id !== excludeId && planSignature(plan) === candidateSignature) || null;
}

export function hasRecentSimilarSend(transfers, candidate) {
  if (!candidate || candidate.deliveryMode !== "now") return false;
  return transfers.some((transfer) => {
    if (transfer.deliveryMode !== "now") return false;
    // Support both intent-shape and plan-shape stored on transfers.
    const sameRecipient =
      (transfer.recipientAlias ?? transfer.recipient) ===
      (candidate.recipientAlias ?? candidate.recipient);
    const sameAmount =
      Number(transfer.amountMinor ?? transfer.amount) ===
      Number(candidate.amountMinor ?? candidate.amount);
    const sameAsset =
      (transfer.destinationAsset ?? transfer.asset) ===
      (candidate.destinationAsset ?? candidate.asset);
    return sameRecipient && sameAmount && sameAsset;
  });
}
