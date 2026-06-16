import { useState } from "react";
import { AlertCircle, ArrowDownLeft, CalendarDays, Clock, ReceiptText, Search } from "lucide-react";
import { BottomNav } from "../components/BottomNav.jsx";

function dayKey(sortKey) {
  if (!sortKey) return "Pending";
  const ts = sortKey * 1000;
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const yesterdayStart = new Date(todayStart.getTime() - 86400000);
  if (ts >= todayStart.getTime()) return "Today";
  if (ts >= yesterdayStart.getTime()) return "Yesterday";
  return new Date(ts).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function groupByDay(transactions) {
  const groups = [];
  const index = new Map();
  for (const tx of transactions) {
    const key = dayKey(tx.sortKey);
    if (!index.has(key)) {
      const group = { label: key, items: [] };
      groups.push(group);
      index.set(key, group);
    }
    index.get(key).items.push(tx);
  }
  return groups;
}

function timeLabel(sortKey) {
  if (!sortKey) return "";
  return new Date(sortKey * 1000).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

function isScheduleEvent(tx) {
  return tx.type === "Plan confirmed" || tx.type === "Plan updated" || tx.status === "Scheduled";
}

function TxDot({ tx }) {
  if (tx.status === "Failed") return <span className="tx-dot failed" aria-label="Failed"><AlertCircle size={16} /></span>;
  if (isScheduleEvent(tx)) return <span className="tx-dot plan" aria-label="Scheduled"><CalendarDays size={16} /></span>;
  if (!tx.sortKey) return <span className="tx-dot plan" aria-label="Pending"><Clock size={16} /></span>;
  return <span className="tx-dot sent" aria-label="Sent"><ArrowDownLeft size={16} /></span>;
}

function TxAmount({ tx }) {
  const cls = tx.status === "Failed" ? "tx-amount failed" : isScheduleEvent(tx) ? "tx-amount plan" : "tx-amount sent";
  const prefix = isScheduleEvent(tx) || tx.status === "Failed" ? "" : "−";
  return (
    <div className={cls}>
      <span>{prefix}{tx.amount}</span>
      <small>{tx.asset}</small>
    </div>
  );
}

const TYPE_FILTERS = [
  { id: "all", label: "All" },
  { id: "sent", label: "Sent" },
  { id: "schedules", label: "Schedules" },
];

function applyFilters(transactions, typeFilter, query) {
  let result = transactions;
  if (typeFilter === "sent") result = result.filter((tx) => !isScheduleEvent(tx) && tx.status !== "Failed");
  if (typeFilter === "schedules") result = result.filter((tx) => isScheduleEvent(tx));
  if (query.trim()) {
    const q = query.trim().toLowerCase();
    result = result.filter(
      (tx) =>
        String(tx.recipient || "").toLowerCase().includes(q) ||
        String(tx.type || "").toLowerCase().includes(q) ||
        String(tx.amount || "").includes(q),
    );
  }
  return result;
}

export function HistoryScreen({ transactions, onSelectTransaction, onHome, onPlans }) {
  const [typeFilter, setTypeFilter] = useState("all");
  const [query, setQuery] = useState("");

  const visible = applyFilters(transactions, typeFilter, query);
  const groups = groupByDay(visible);

  return (
    <div className="screen history-screen">
      <div className="screen-hero">
        <span className="screen-hero-label">Receipts</span>
        <h2 className="screen-hero-title">Movements</h2>
      </div>

      <div className="screen-filters">
        <div className="filter-pills" role="group" aria-label="Filter movements">
          {TYPE_FILTERS.map((f) => (
            <button
              key={f.id}
              className={`filter-pill${typeFilter === f.id ? " active" : ""}`}
              type="button"
              onClick={() => setTypeFilter(f.id)}
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
            placeholder="Search recipient or amount…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search movements"
          />
        </div>
      </div>

      {visible.length > 0 ? (
        <div className="history-list" aria-label="Transaction history">
          {groups.map(({ label, items }) => (
            <div key={label} className="tx-day-group">
              <div className="tx-day-label">{label}</div>
              {items.map((item) => (
                <button
                  className="transaction-row"
                  type="button"
                  key={item.id}
                  onClick={() => onSelectTransaction(item.id)}
                >
                  <TxDot tx={item} />
                  <div className="tx-details">
                    <b>{item.recipient}</b>
                    <span>{item.type}</span>
                  </div>
                  <div className="tx-right">
                    <TxAmount tx={item} />
                    {item.sortKey ? <time className="tx-time">{timeLabel(item.sortKey)}</time> : null}
                  </div>
                </button>
              ))}
            </div>
          ))}
        </div>
      ) : (
        <div className="empty-plans">
          <ReceiptText size={30} />
          <h2>{query ? "No matches" : typeFilter === "all" ? "No receipts yet" : `No ${typeFilter} movements`}</h2>
          <p>{query ? "Try a different search term." : typeFilter === "all" ? "Completed wallet-signed sends and scheduled actions will appear here." : "Try a different filter."}</p>
        </div>
      )}

      <BottomNav active="history" onHome={onHome} onPlans={onPlans} onHistory={() => {}} />
    </div>
  );
}
