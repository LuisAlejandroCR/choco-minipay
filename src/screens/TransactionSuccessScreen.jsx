import { Check, ChevronRight, Home, ReceiptText, Share2 } from "lucide-react";
import { useState } from "react";
import { BottomNav } from "../components/BottomNav.jsx";
import { getTransactionExplorerUrl, isTransactionHash } from "../lib/transactions.js";

export function TransactionSuccessScreen({ transaction, onViewDetails, onHome, onPlans }) {
  const [shareState, setShareState] = useState("");

  const amountLabel = `${transaction.amount} ${transaction.asset}`;
  const toLabel = transaction.recipient || "Recipient";
  const hasHash = isTransactionHash(transaction.hash);
  const receiptUrl = hasHash ? getTransactionExplorerUrl(transaction.hash) : "";

  async function share() {
    const lines = [
      `Choco sent ${amountLabel} to ${toLabel}`,
      `Status: ${transaction.status}`,
      `Date: ${transaction.date}`,
      hasHash ? `Receipt: ${receiptUrl}` : "",
    ].filter(Boolean);

    try {
      if (navigator.share) {
        await navigator.share({ title: "Choco receipt", text: lines.join("\n") });
      } else {
        await navigator.clipboard?.writeText(lines.join("\n"));
      }
      setShareState("Shared");
    } catch {
      setShareState("Ready");
    }
  }

  return (
    <div className="screen transaction-success-screen">
      <section className="success-card">
        <div className="success-badge">
          <Check size={40} strokeWidth={2.5} />
        </div>
        <h2 className="success-title">Money sent</h2>
        <p className="success-amount">{amountLabel}</p>
        <p className="success-recipient">to {toLabel}</p>

        <div className="success-actions">
          <button className="primary-cta" type="button" onClick={onViewDetails}>
            <ReceiptText size={18} />
            View movement details
            <ChevronRight size={16} />
          </button>
          <button className="secondary-dark" type="button" onClick={share}>
            <Share2 size={18} />
            {shareState ? `${shareState} receipt` : "Share receipt"}
          </button>
          <button className="secondary-cta" type="button" onClick={onHome}>
            <Home size={18} />
            Return to home
          </button>
        </div>
      </section>

      <BottomNav active="history" onHome={onHome} onPlans={onPlans} onHistory={onViewDetails} />
    </div>
  );
}
