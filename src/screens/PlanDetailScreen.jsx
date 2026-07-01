import { useEffect, useState } from "react";
import { CalendarDays, Pencil, Trash2, Undo2 } from "lucide-react";
import { DetailLine } from "../components/SheetPrimitives.jsx";
import { getPlanExecutionState, getTimingLabel, recipientLabel } from "../utils/planUtils.js";

export function PlanDetailScreen({ plan, onEdit, onDelete, onReclaim, onCheckHeld, operationStatus = "", operationMessage = "", onClearError }) {
  const execution = getPlanExecutionState(plan);
  const isPaused = execution.status === "Paused";
  const isPending = operationStatus === "pending";

  const [toastVisible, setToastVisible] = useState(false);
  const [heldUsdc, setHeldUsdc] = useState(0n);
  useEffect(() => {
    let active = true;
    if (!plan?.onchainId || typeof onCheckHeld !== "function") { setHeldUsdc(0n); return undefined; }
    onCheckHeld(plan.onchainId)
      .then((value) => { if (active) setHeldUsdc(value || 0n); })
      .catch(() => { if (active) setHeldUsdc(0n); });
    return () => { active = false; };
  }, [plan?.onchainId]); // eslint-disable-line react-hooks/exhaustive-deps
  const hasHeld = heldUsdc > 0n;

  useEffect(() => {
    if (operationStatus === "error" && operationMessage) {
      setToastVisible(true);
      const timer = window.setTimeout(() => {
        setToastVisible(false);
        onClearError?.();
      }, 8000);
      return () => window.clearTimeout(timer);
    }
    setToastVisible(false);
    return undefined;
  }, [operationStatus, operationMessage]); // eslint-disable-line react-hooks/exhaustive-deps

  function dismissToast() {
    setToastVisible(false);
    onClearError?.();
  }

  return (
    <div className="screen details-screen">
      {toastVisible && (
        <div className="plan-error-toast" role="alert" onClick={dismissToast}>
          {operationMessage}
        </div>
      )}

      <div className="screen-hero">
        <span className="screen-hero-label">Plan details</span>
        <div className="screen-hero-row">
          <div className="plan-detail-hero-copy">
            <h2 className="screen-hero-title">{recipientLabel(plan)}</h2>
            <p className="screen-hero-detail">{plan.amount} {plan.asset}</p>
            <span className={`plan-status-label ${execution.tone}`}>{execution.label}</span>
          </div>
        </div>
      </div>

      <div className="plan-timing-row">
        <CalendarDays size={21} strokeWidth={2.5} />
        <strong>{getTimingLabel(plan)}</strong>
      </div>

      <div className="detail-list" aria-label="Plan details">
        <DetailLine label="Converts" value={`${plan.payAsset} → ${plan.asset}`} />
        <DetailLine
          label="Schedule"
          value={
            isPaused
              ? "Paused"
              : execution.status === "Run recorded"
                ? "This month's payment is done"
                : "Sends automatically on the scheduled day"
          }
        />
        <DetailLine label="If it fails" value="Choco tries up to 3 times" />
      </div>

      <div className="notice compact notice-hint">
        {isPaused
          ? "This plan is paused. Delete it or create a new plan when you are ready."
          : "You approved this plan once. Your money stays in your wallet until each scheduled payment. Delete the plan to stop future payments."}
      </div>

      <div className="plan-actions detail-bottom-actions">
        {hasHeld && onReclaim && (
          <button type="button" disabled={isPending} onClick={onReclaim}><Undo2 size={18} />Reclaim funds</button>
        )}
        <button type="button" disabled={isPending} onClick={onEdit}><Pencil size={18} />Edit</button>
        <button className="danger-action" type="button" disabled={isPending} onClick={onDelete}><Trash2 size={18} />Delete</button>
      </div>
    </div>
  );
}
