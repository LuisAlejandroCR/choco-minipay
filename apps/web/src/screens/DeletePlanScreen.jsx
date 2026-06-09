import { Trash2 } from "lucide-react";
import { LightSheet } from "../components/LightSheet.jsx";

export function DeletePlanScreen({ plan, onCancel, onDelete }) {
  return (
    <LightSheet>
      <div className="sheet-top">
        <div className="sheet-icon"><Trash2 size={24} /></div>
        <h2>Delete this plan?</h2>
      </div>

      <div className="notice">
        {plan.recipient} will no longer have the {plan.amount} {plan.asset} scheduled transfer in this Mini App demo.
      </div>

      <button className="danger-cta" type="button" onClick={onDelete}>Delete plan</button>
      <button className="secondary-cta" type="button" onClick={onCancel}>Keep plan</button>
    </LightSheet>
  );
}
