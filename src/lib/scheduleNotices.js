// Pure derivation of in-app ("ring bell") notices for scheduled plans, plus the reminder shown
// every time a user creates a plan. No backend: the caller reads plan + escrow-lock + balance state
// from chain and passes normalized numbers here, so notices are always accurate and never stale.
//
// Per-plan input shape (all USDC amounts are plain numbers, not raw units):
//   { id, recipient, amountUsdc, lockedUsdc, hasWalletFunds, nextRunLabel, active }

function formatUsdc(amount) {
  const n = Number(amount || 0);
  return `${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDC`;
}

export const CANCEL_HINT = "You can delete this plan anytime.";

// The reminder to show whenever a user opens the "new plan" flow.
export function planCreationReminder() {
  return {
    id: "plan-funding-explainer",
    kind: "explainer",
    tone: "info",
    title: "How plans stay funded",
    body: `The next run's USDC is locked so it can't be spent and never fails. After each run, the next month locks automatically. ${CANCEL_HINT}`,
  };
}

export function deriveScheduleNotices({ plans = [] } = {}) {
  const notices = [];
  for (const plan of plans) {
    if (!plan || plan.active === false) continue;
    const recipient = plan.recipient || "your recipient";
    const runLabel = plan.nextRunLabel || "the scheduled day";

    if (Number(plan.lockedUsdc) > 0) {
      notices.push({
        id: `funded-${plan.id}`,
        kind: "run-funded",
        tone: "info",
        title: `Next run funded for ${recipient}`,
        body: `${formatUsdc(plan.lockedUsdc)} is locked for ${runLabel} and can't be spent. ${CANCEL_HINT}`,
      });
    } else if (plan.hasWalletFunds) {
      notices.push({
        id: `lock-${plan.id}`,
        kind: "needs-lock",
        tone: "reminder",
        title: `Lock the next run for ${recipient}`,
        body: `Reserve ${formatUsdc(plan.amountUsdc)} so the run on ${runLabel} can't fail. ${CANCEL_HINT}`,
      });
    } else {
      notices.push({
        id: `topup-${plan.id}`,
        kind: "needs-topup",
        tone: "warning",
        title: `Top up to keep ${recipient}'s plan`,
        body: `Add ${formatUsdc(plan.amountUsdc)} before ${runLabel} or the next run won't go through. ${CANCEL_HINT}`,
      });
    }
  }
  return notices;
}
