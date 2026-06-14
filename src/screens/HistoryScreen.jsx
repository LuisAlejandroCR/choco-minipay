import { ReceiptText } from "lucide-react";
import { BottomNav } from "../components/BottomNav.jsx";
import { formatHistoryDate } from "../utils/planUtils.js";

export function HistoryScreen({ transactions, onSelectTransaction, onHome, onPlans }) {
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
          {transactions.map((item) => (
            <button className="transaction-row" type="button" key={item.id} onClick={() => onSelectTransaction(item.id)}>
              <div className="receipt-icon"><ReceiptText size={18} /></div>
              <div>
                <b>{item.recipient}</b>
                <span>{item.amount} {item.asset} - {item.type}</span>
              </div>
              <small>{formatHistoryDate(item.date)}</small>
            </button>
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
