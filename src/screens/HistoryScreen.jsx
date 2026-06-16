import { AlertCircle, ArrowDownLeft, CalendarDays, Clock, ReceiptText } from "lucide-react";
import { BottomNav } from "../components/BottomNav.jsx";

// Group a sorted transaction list into day buckets for display.
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

// A "Plan confirmed" is a schedule registration — no money moved yet.
function isScheduleEvent(tx) {
  return tx.type === "Plan confirmed" || tx.type === "Plan updated" || tx.status === "Scheduled";
}

function TxDot({ tx }) {
  if (tx.status === "Failed") {
    return (
      <span className="tx-dot failed" aria-label="Failed">
        <AlertCircle size={16} />
      </span>
    );
  }
  if (isScheduleEvent(tx)) {
    return (
      <span className="tx-dot plan" aria-label="Scheduled">
        <CalendarDays size={16} />
      </span>
    );
  }
  if (!tx.sortKey) {
    return (
      <span className="tx-dot plan" aria-label="Pending">
        <Clock size={16} />
      </span>
    );
  }
  return (
    <span className="tx-dot sent" aria-label="Sent">
      <ArrowDownLeft size={16} />
    </span>
  );
}

function TxAmount({ tx }) {
  const cls = tx.status === "Failed"
    ? "tx-amount failed"
    : isScheduleEvent(tx)
      ? "tx-amount plan"
      : "tx-amount sent";

  const prefix = isScheduleEvent(tx) || tx.status === "Failed" ? "" : "−";

  return (
    <div className={cls}>
      <span>{prefix}{tx.amount}</span>
      <small>{tx.asset}</small>
    </div>
  );
}

export function HistoryScreen({ transactions, onSelectTransaction, onHome, onPlans }) {
  const groups = groupByDay(transactions);

  return (
    <div className="screen history-screen">
      <div className="layer-heading">
        <div>
          <span>Receipts</span>
          <h2>Movements</h2>
        </div>
      </div>

      {transactions.length > 0 ? (
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
          <h2>No receipts yet</h2>
          <p>Completed wallet-signed sends and scheduled actions will appear here.</p>
        </div>
      )}

      <BottomNav active="history" onHome={onHome} onPlans={onPlans} onHistory={() => {}} />
    </div>
  );
}
