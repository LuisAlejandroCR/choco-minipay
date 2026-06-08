export function planSignature(plan) {
  return [
    plan.recipientAlias,
    plan.amountMinor,
    plan.destinationAsset,
    plan.deliveryMode,
    plan.cadence,
    plan.dayLabel,
  ].join("|").toLowerCase();
}

export function getDuplicatePlan(plans, candidate, excludeId = "") {
  if (!candidate || candidate.deliveryMode !== "schedule") return null;
  const candidateSignature = planSignature(candidate);
  return plans.find((plan) => plan.id !== excludeId && planSignature(plan) === candidateSignature) || null;
}

export function hasRecentSimilarSend(transfers, candidate) {
  if (!candidate || candidate.deliveryMode !== "now") return false;
  return transfers.some((transfer) => (
    transfer.deliveryMode === "now"
    && transfer.recipientAlias === candidate.recipientAlias
    && Number(transfer.amountMinor) === Number(candidate.amountMinor)
    && transfer.destinationAsset === candidate.destinationAsset
  ));
}
