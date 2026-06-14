import { CalendarDays, Pencil, Trash2 } from "lucide-react";
import { ChocoMark } from "../components/ChocoMark.jsx";
import { BottomNav } from "../components/BottomNav.jsx";
import { DetailLine } from "../components/SheetPrimitives.jsx";
import { getTimingLabel } from "../utils/planUtils.js";

export function PlanDetailScreen({ plan, onHome, onHistory, onBack, onEdit, onDelete }) {
  return (
    <div className="screen details-screen">
      <section className="asset-card compact" aria-label="Plan summary">
        <div className="asset-row">
          <div className="asset-icon"><ChocoMark size="small" /></div>
          <div>
            <h2>{plan.recipient}</h2>
            <p>{plan.amount} {plan.asset}</p>
          </div>
          <span className="status-chip">{plan.status}</span>
        </div>

        <div className="plan-timing-row">
          <CalendarDays size={21} strokeWidth={2.5} />
          <strong>{getTimingLabel(plan)}</strong>
        </div>
      </section>

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
