import { useState } from "react";
import { Check, Plus, Search } from "lucide-react";
import { ChocoMark } from "../components/ChocoMark.jsx";
import { getPlanExecutionState, getSimilarPlanIds, getTimingLabel } from "../utils/planUtils.js";

const STATUS_FILTERS = [
  { id: "all", label: "All" },
  { id: "active", label: "Active" },
];

function applyFilters(plans, statusFilter, query) {
  let result = plans;
  if (statusFilter === "active") {
    result = result.filter((p) => getPlanExecutionState(p).status !== "Paused");
  }
  if (query.trim()) {
    const q = query.trim().toLowerCase();
    result = result.filter(
      (p) =>
        String(p.recipient || "").toLowerCase().includes(q) ||
        String(p.amount || "").includes(q) ||
        String(p.asset || "").toLowerCase().includes(q),
    );
  }
  return result;
}

export function PlansScreen({ plans, loading = false, onSelectPlan, onNewPlan, onHome, onHistory }) {
  const [statusFilter, setStatusFilter] = useState("all");
  const [query, setQuery] = useState("");

  const similarPlanIds = getSimilarPlanIds(plans);
  const visible = applyFilters(plans, statusFilter, query);

  return (
    <div className="screen plans-screen">
      <div className="screen-header">
      <div className="screen-hero">
        <span className="screen-hero-label">Manage</span>
        <div className="screen-hero-row">
          <h2 className="screen-hero-title">Plans</h2>
          <button className="screen-hero-action" type="button" onClick={onNewPlan}>
            <Plus size={16} />Schedule
          </button>
        </div>
      </div>

      <div className="screen-filters">
        <div className="filter-pills" role="group" aria-label="Filter plans">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.id}
              className={`filter-pill${statusFilter === f.id ? " active" : ""}`}
              type="button"
              onClick={() => setStatusFilter(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="filter-search-row">
          <Search size={15} className="filter-search-icon" />
          <input
            className="filter-search-input"
            type="search"
            placeholder="Search recipient…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search plans"
          />
        </div>
      </div>
      </div>

      {loading && plans.length === 0 ? (
        <div className="empty-plans">
          <div className="loading-sync"><ChocoMark size="small" /></div>
          <h2>Loading plans…</h2>
          <p>Syncing with your wallet.</p>
        </div>
      ) : visible.length > 0 ? (
        <>
          {similarPlanIds.size > 0 && (
            <div className="plan-alert">
              <Check size={16} />
              <span>Similar plan already exists. Review before scheduling again.</span>
            </div>
          )}
          <div className="plan-alert plan-info">
            <Check size={16} />
            <span>Plans are wallet-authorized auto-runs. Funds stay in your wallet until the scheduled execution.</span>
          </div>
          <div className="plans-list" aria-label="Plans list">
            {visible.map((item) => {
              const isSimilar = similarPlanIds.has(item.id);
              const execution = getPlanExecutionState(item);
              return (
                <button className="plan-row" type="button" key={item.id} onClick={() => onSelectPlan(item.id)}>
                  <div className="plan-row-icon"><ChocoMark size="tiny" /></div>
                  <div>
                    <b>{item.recipient}</b>
                    <span>{item.amount} {item.asset} · {getTimingLabel(item)}</span>
                  </div>
                  <small className={isSimilar ? "warning" : execution.tone}>{isSimilar ? "Similar" : execution.label}</small>
                </button>
              );
            })}
          </div>
        </>
      ) : (
        <div className="empty-plans">
          <ChocoMark size="small" />
          <h2>{query ? "No matches" : statusFilter === "all" ? "No plans yet" : `No ${statusFilter} plans`}</h2>
          <p>{query ? "Try a different search term." : statusFilter === "all" ? "Create a scheduled transfer with text or voice. One-time sends stay in history." : "Try a different filter."}</p>
          {!query && statusFilter === "all" && (
            <button type="button" onClick={onNewPlan}>Schedule transfer</button>
          )}
        </div>
      )}

    </div>
  );
}
