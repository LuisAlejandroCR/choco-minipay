import { CalendarDays, Pencil, Trash2 } from "lucide-react";
import { BottomNav } from "../components/BottomNav.jsx";
import { DetailLine } from "../components/SheetPrimitives.jsx";
import { getTimingLabel } from "../utils/planUtils.js";

export function PlanDetailScreen({ plan, onHome, onHistory, onBack, onEdit, onDelete }) {
  return (
    <div className="screen details-screen">
      <div className="screen-hero">
        <span className="screen-hero-label">Plan</span>
        <div className="screen-hero-row">
          <div>
            <h2 className="screen-hero-title">{plan.recipient}</h2>
            <p className="screen-hero-detail">{plan.amount} {plan.asset}</p>
          </div>
          <span className="sheet-chip">{plan.status}</span>
        </div>
      </div>

      <div className="plan-timing-row">
        <CalendarDays size={21} strokeWidth={2.5} />
        <strong>{getTimingLabel(plan)}</strong>
      </div>

      <div className="detail-list" aria-label="Plan details">
        <DetailLine label="Route" value={`${plan.payAsset} to ${plan.asset}`} />
        <DetailLine label="Retries" value="3 attempts if a transfer fails" />
      </div>

      <div className="plan-actions">
        <button type="button" onClick={onEdit}><Pencil size={18} />Edit</button>
        <button className="danger-action" type="button" onClick={onDelete}><Trash2 size={18} />Delete</button>
      </div>

      <button className="secondary-dark" type="button" onClick={onHome}>Back home</button>
      <BottomNav active="plans" onHome={onHome} onPlans={onBack} onHistory={onHistory} />
    </div>
  );
}
