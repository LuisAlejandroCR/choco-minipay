import { CalendarDays, CircleDollarSign } from "lucide-react";
import { DetailLine } from "../components/SheetPrimitives.jsx";

export function CheckpointScreen({ plan, onApprove, onEdit }) {
  const confidence = plan?.intent?.confidence;
  const confidencePct = confidence != null ? Math.round(confidence * 100) : null;
  const isSendNow = plan?.deliveryMode === "now";
  const route = `${plan?.payAsset || "USDC"} → ${plan?.asset || "KESm"} via Mento`;
  const timingLabel = isSendNow ? "Send once now" : (plan?.schedule || "Monthly schedule");
  const amountLabel = [plan?.amount, plan?.asset].filter(Boolean).join(" ") || "—";
  const tone = confidencePct != null && confidencePct >= 80 ? "success" : "neutral";

  return (
    <div className="screen checkpoint-screen">
      <div className="screen-hero">
        <span className="screen-hero-label">Agent Choco</span>
        <div className="screen-hero-row">
          <div>
            <h2 className="screen-hero-title">Ready to review</h2>
            <p className="screen-hero-detail">{plan?.recipient || ""}</p>
          </div>
          {confidencePct != null && (
            <span className={`sheet-chip ${tone}`}>{confidencePct}%</span>
          )}
        </div>
      </div>

      <div className="detail-list">
        <DetailLine label="Recipient gets" value={amountLabel} />
        <DetailLine label="Timing" value={timingLabel} />
        <DetailLine label="Route" value={route} />
      </div>

      <div className="notice compact">
        Choco interpreted your instruction. Tap <strong>Looks right</strong> to continue, or edit if anything needs adjusting.
      </div>

      <button className="primary-cta" type="button" onClick={onApprove}>
        {isSendNow ? <CircleDollarSign size={18} /> : <CalendarDays size={18} />}
        Looks right
      </button>
      <button className="secondary-dark" type="button" onClick={onEdit}>
        Edit instruction
      </button>
    </div>
  );
}
