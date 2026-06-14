import { Check, Plus } from "lucide-react";
import { ChocoMark } from "../components/ChocoMark.jsx";
import { BottomNav } from "../components/BottomNav.jsx";
import { getSimilarPlanIds, getTimingLabel } from "../utils/planUtils.js";

export function PlansScreen({ plans, onSelectPlan, onNewPlan, onHome, onHistory }) {
  const similarPlanIds = getSimilarPlanIds(plans);

  return (
    <div className="screen plans-screen">
      <div className="layer-heading">
        <div>
          <span>Manage</span>
          <h2>Plans</h2>
        </div>
        <button type="button" onClick={onNewPlan}><Plus size={18} />Schedule</button>
      </div>

      {plans.length > 0 ? (
        <>
          {similarPlanIds.size > 0 && (
            <div className="plan-alert">
              <Check size={16} />
              <span>Similar plan already exists. Review before scheduling again.</span>
            </div>
          )}
          <div className="plans-list" aria-label="Plans list">
            {plans.map((item) => {
              const isSimilar = similarPlanIds.has(item.id);

              return (
                <button className="plan-row" type="button" key={item.id} onClick={() => onSelectPlan(item.id)}>
                  <div className="plan-row-icon"><ChocoMark size="tiny" /></div>
                  <div>
                    <b>{item.recipient}</b>
                    <span>{item.amount} {item.asset} - {getTimingLabel(item)}</span>
                  </div>
                  <small className={isSimilar ? "warning" : ""}>{isSimilar ? "Similar" : item.status}</small>
                </button>
              );
            })}
          </div>
        </>
      ) : (
        <div className="empty-plans">
          <ChocoMark size="small" />
          <h2>No plans yet</h2>
          <p>Create a scheduled transfer with text or voice. One-time sends stay in history.</p>
          <button type="button" onClick={onNewPlan}>Schedule transfer</button>
        </div>
      )}

      <BottomNav active="plans" onHome={onHome} onPlans={() => {}} onHistory={onHistory} />
    </div>
  );
}
