import { useEffect, useState } from "react";
import { CalendarDays, Pencil, Trash2 } from "lucide-react";
import { DetailLine } from "../components/SheetPrimitives.jsx";
import { getPlanExecutionState, getTimingLabel } from "../utils/planUtils.js";

export function PlanDetailScreen({ plan, onEdit, onDelete, operationStatus = "", operationMessage = "", onClearError }) {
  const execution = getPlanExecutionState(plan);
  const isPaused = execution.status === "Paused";
  const isPending = operationStatus === "pending";

  const [toastVisible, setToastVisible] = useState(false);

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
            <h2 className="screen-hero-title">{plan.recipient}</h2>
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
        <DetailLine label="Route" value={`${plan.payAsset} to ${plan.asset}`} />
        <DetailLine
          label="Execution"
          value={
            isPaused
              ? "Paused on-chain"
              : execution.status === "Run recorded"
                ? "This month is recorded in History"
                : "Auto-runs on the scheduled day"
          }
        />
        <DetailLine label="Retries" value="3 attempts if a transfer fails" />
      </div>

      <div className="notice compact notice-hint">
        {isPaused
          ? "This plan is paused on-chain. Delete it or create a new plan when you are ready."
          : "Your wallet authorized this plan once. Funds stay in your wallet until Choco runs the scheduled transfer. Delete the plan to stop future runs."}
      </div>

      <div className="plan-actions detail-bottom-actions">
        <button type="button" disabled={isPending} onClick={onEdit}><Pencil size={18} />Edit</button>
        <button className="danger-action" type="button" disabled={isPending} onClick={onDelete}><Trash2 size={18} />Delete</button>
      </div>
    </div>
  );
}
