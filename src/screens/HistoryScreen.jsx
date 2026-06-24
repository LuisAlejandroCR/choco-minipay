import { useState } from "react";
import { AlertCircle, ArrowDownLeft, CalendarDays, Clock, Lock, ReceiptText, RefreshCw, Search, Undo2 } from "lucide-react";
import { ChocoMark } from "../components/ChocoMark.jsx";
import { shortAddress } from "../lib/celo.js";
import { formatClockTime, recipientLabel } from "../utils/planUtils.js";

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
  return formatClockTime(new Date(sortKey * 1000));
}

function isScheduleEvent(tx) {
  return tx.deliveryMode === "schedule";
}

function isHeldEvent(tx) {
  return tx.deliveryMode === "held";
}

function TxDot({ tx }) {
  if (tx.status === "Failed") return <span className="tx-dot failed" aria-label="Failed"><AlertCircle size={16} /></span>;
  if (isHeldEvent(tx)) return (
    <span className="tx-dot plan" aria-label={tx.status === "Returned" ? "Returned" : "Set aside"}>
      {tx.status === "Returned" ? <Undo2 size={16} /> : <Lock size={16} />}
    </span>
  );
  if (isScheduleEvent(tx)) return <span className="tx-dot plan" aria-label="Scheduled"><CalendarDays size={16} /></span>;
  if (!tx.sortKey) return <span className="tx-dot plan" aria-label="Pending"><Clock size={16} /></span>;
  return <span className="tx-dot sent" aria-label="Sent"><ArrowDownLeft size={16} /></span>;
}

function TxAmount({ tx }) {
  const cls = tx.status === "Failed"
    ? "tx-amount failed"
    : (isScheduleEvent(tx) || isHeldEvent(tx)) ? "tx-amount plan" : "tx-amount sent";
  const prefix = tx.status === "Failed" ? "" : tx.status === "Returned" ? "+" : "-";
  return (
    <div className={cls}>
      <span>{prefix}{tx.amount}</span>
      <small>{tx.asset}</small>
    </div>
  );
}

const TYPE_FILTERS = [
  { id: "all", label: "All" },
  { id: "sent", label: "Send now" },
  { id: "schedules", label: "Plan payments" },
  { id: "held", label: "Set aside" },
];

function applyFilters(transactions, typeFilter, query) {
  let result = transactions;
  if (typeFilter === "sent") result = result.filter((tx) => !isScheduleEvent(tx) && !isHeldEvent(tx) && tx.status !== "Failed");
  if (typeFilter === "schedules") result = result.filter((tx) => isScheduleEvent(tx));
  if (typeFilter === "held") result = result.filter((tx) => isHeldEvent(tx));
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

function shortWallet(address) {
  return address ? shortAddress(address) : "";
}

function movementDescription(tx) {
  return (isScheduleEvent(tx) || isHeldEvent(tx)) ? tx.schedule || tx.type : tx.type;
}

function movementTime(tx) {
  const label = timeLabel(tx.sortKey);
  if (!label) return "";
  return isScheduleEvent(tx) ? `Sent ${label}` : label;
}

export function HistoryScreen({
  transactions,
  loading = false,
  walletAddress = "",
  ledgerError = "",
  onRefresh,
  onSelectTransaction,
  onHome,
  onPlans,
}) {
  const [typeFilter, setTypeFilter] = useState("all");
  const [query, setQuery] = useState("");

  const visible = applyFilters(transactions, typeFilter, query);
  const groups = groupByDay(visible);
  const emptyTitle = query
    ? "No matches"
    : typeFilter === "all"
      ? "No receipts yet"
      : typeFilter === "schedules"
        ? "No plan payments"
        : typeFilter === "held"
          ? "No money set aside"
          : "No instant sends";

  return (
    <div className="screen history-screen">
      <div className="screen-header">
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
      </div>

      {loading && transactions.length === 0 ? (
        <div className="empty-plans">
          <div className="loading-sync"><ChocoMark size="small" /></div>
          <h2>Loading movements…</h2>
          <p>Syncing with your wallet.</p>
        </div>
      ) : visible.length > 0 ? (
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
                    <b>{recipientLabel(item)}</b>
                    <span>{movementDescription(item)}</span>
                  </div>
                  <div className="tx-right">
                    <TxAmount tx={item} />
                    {item.sortKey ? <time className="tx-time">{movementTime(item)}</time> : null}
                  </div>
                </button>
              ))}
            </div>
          ))}
        </div>
      ) : (
        <div className="empty-plans">
          <ReceiptText size={30} />
          <h2>{emptyTitle}</h2>
          <p>
            {query
              ? "Try a different search term."
              : typeFilter === "all"
                ? "Completed sends and plan payments will appear here."
                : "Try a different filter."}
          </p>
          {walletAddress ? <span className="empty-chain-hint">Checked wallet {shortWallet(walletAddress)}</span> : null}
          {ledgerError ? <span className="empty-chain-error">{ledgerError}</span> : null}
          {onRefresh ? (
            <button type="button" onClick={onRefresh} disabled={loading}>
              <RefreshCw size={16} />Refresh
            </button>
          ) : null}
        </div>
      )}

    </div>
  );
}
