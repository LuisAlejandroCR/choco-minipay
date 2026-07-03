import { isEscrowConfigured, readLockedRun, refundScheduleRun } from "../../chain/escrow.js";
import { cancelScheduleViaRegistry, pauseScheduleViaRegistry, resumeScheduleViaRegistry } from "../../lib/celo.js";
import { humanisePlanError } from "../../utils/appHelpers.js";

export function useAppPlanActions({
  wallet,
  appStatus,
  activePlan,
  removePlan,
  patchPlan,
  refreshLedgerFresh,
  refreshBalances,
  goTo,
  onPlanDeleted,
}) {
  async function togglePlanPaused() {
    if (!activePlan) { goTo("plans"); return; }
    const planToToggle = activePlan;
    const isPaused = planToToggle.status === "Paused" || planToToggle.active === false;
    try {
      appStatus.setStatus("pending");
      appStatus.setMessage(isPaused ? "Resuming plan..." : "Pausing plan...");
      if (isPaused) {
        await resumeScheduleViaRegistry({ account: wallet.address, id: planToToggle.onchainId });
      } else {
        await pauseScheduleViaRegistry({ account: wallet.address, id: planToToggle.onchainId });
      }
      appStatus.setStatus("idle");
      // Optimistic patch: status flips instantly without waiting for the full 11s refresh.
      patchPlan(planToToggle.onchainId, isPaused
        ? { status: "Active", active: true }
        : { status: "Paused", active: false });
      goTo("plans");
      // Background refresh to sync any other changes; cache cleared so it reads fresh.
      window.setTimeout(() => { void refreshLedgerFresh(); }, 2000);
    } catch (error) {
      appStatus.setStatus("error");
      appStatus.setMessage(humanisePlanError(error));
    }
  }

  async function confirmDeletePlan() {
    if (!activePlan) { goTo("plans"); return; }
    const planToDelete = activePlan;
    try {
      appStatus.setStatus("pending");
      // Reclaim any escrow-locked next run first so the user gets their reserved USDC back.
      if (isEscrowConfigured() && wallet.address) {
        try {
          const locked = await readLockedRun({ owner: wallet.address, scheduleId: planToDelete.onchainId });
          if (locked > 0n) {
            appStatus.setMessage("Returning your locked funds...");
            await refundScheduleRun({ account: wallet.address, scheduleId: planToDelete.onchainId });
          }
        } catch (refundError) {
          console.warn("Escrow refund skipped:", refundError?.message || refundError);
        }
      }
      appStatus.setMessage("Cancelling schedule...");
      await cancelScheduleViaRegistry({ account: wallet.address, id: planToDelete.onchainId });
      appStatus.setStatus("idle");
      // Optimistic remove: plan disappears immediately, background refresh confirms on-chain state.
      removePlan(planToDelete.onchainId);
      onPlanDeleted?.();
      goTo("plans");
      window.setTimeout(() => { void refreshLedgerFresh(); void refreshBalances(wallet.address); }, 2000);
    } catch (error) {
      appStatus.setStatus("error");
      appStatus.setMessage(humanisePlanError(error));
    }
  }

  // Standalone "reclaim" — return a plan's set-aside USDC to the wallet WITHOUT cancelling the plan, so a
  // user can always get held funds back (audit H-2). The plan stays active-but-unfunded; the app prompts
  // to re-fund the next run.
  async function reclaimPlanFunds() {
    if (!activePlan || !wallet.address) { goTo("plans"); return; }
    const plan = activePlan;
    try {
      appStatus.setStatus("pending");
      appStatus.setMessage("Returning your set-aside funds...");
      const locked = await readLockedRun({ owner: wallet.address, scheduleId: plan.onchainId });
      if (locked === 0n) {
        appStatus.setStatus("error");
        appStatus.setMessage("Nothing is set aside for this plan right now.");
        return;
      }
      await refundScheduleRun({ account: wallet.address, scheduleId: plan.onchainId });
      appStatus.setStatus("idle");
      appStatus.setMessage("");
      window.setTimeout(() => { void refreshLedgerFresh(); void refreshBalances(wallet.address); }, 2000);
    } catch (error) {
      appStatus.setStatus("error");
      appStatus.setMessage(humanisePlanError(error));
    }
  }

  return { togglePlanPaused, confirmDeletePlan, reclaimPlanFunds };
}
