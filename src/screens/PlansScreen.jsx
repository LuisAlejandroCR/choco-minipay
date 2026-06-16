import { useState } from "react";
import { Check, Plus } from "lucide-react";
import { ChocoMark } from "../components/ChocoMark.jsx";
import { BottomNav } from "../components/BottomNav.jsx";
import { getSimilarPlanIds, getTimingLabel } from "../utils/planUtils.js";

const PLAN_FILTERS = [
  { id: "all", label: "All" },
  { id: "Active", label: "Active" },
  { id: "Paused", label: "Paused" },
];

export function PlansScreen({ plans, onSelectPlan, onNewPlan, onHome, onHistory }) {
  const [filter, setFilter] = useState("all");
  const similarPlanIds = getSimilarPlanIds(plans);
  const visible = filter === "all" ? plans : plans.filter((p) => p.status === filter);

  return (
    <div className="screen plans-screen">
      <div className="layer-heading">
        <div>
          <span>Manage</span>
          <h2>Plans</h2>
        </div>
        <button type="button" onClick={onNewPlan}><Plus size={18} />Schedule</button>
      </div>

      <div className="filter-pills" role="group" aria-label="Filter plans">
        {PLAN_FILTERS.map((f) => (
          <button
            key={f.id}
            className={`filter-pill${filter === f.id ? " active" : ""}`}
            type="button"
            onClick={() => setFilter(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {visible.length > 0 ? (
        <>
          {similarPlanIds.size > 0 && (
            <div className="plan-alert">
              <Check size={16} />
              <span>Similar plan already exists. Review before scheduling again.</span>
            </div>
          )}
          <div className="plans-list" aria-label="Plans list">
            {visible.map((item) => {
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
          <h2>{filter === "all" ? "No plans yet" : `No ${filter.toLowerCase()} plans`}</h2>
          <p>{filter === "all" ? "Create a scheduled transfer with text or voice. One-time sends stay in history." : "Try a different filter."}</p>
          {filter === "all" && <button type="button" onClick={onNewPlan}>Schedule transfer</button>}
        </div>
      )}

      <BottomNav active="plans" onHome={onHome} onPlans={() => {}} onHistory={onHistory} />
    </div>
  );
}
