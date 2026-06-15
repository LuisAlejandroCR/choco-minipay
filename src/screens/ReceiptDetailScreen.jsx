import { CalendarDays, Check, ChevronDown, ChevronUp, CircleDollarSign, ExternalLink, QrCode, ReceiptText, Share2, Wallet } from "lucide-react";
import { useState } from "react";
import { QrCanvas } from "../components/QrCode.jsx";
import { BottomNav } from "../components/BottomNav.jsx";
import { ReceiptRow } from "../components/SheetPrimitives.jsx";
import { formatTransactionHash, getTransactionExplorerUrl, isTransactionHash } from "../lib/transactions.js";
import { getTimingLabel } from "../utils/planUtils.js";

export function ReceiptDetailScreen({ transaction, onBack, onHome, onPlans }) {
  const [shareState, setShareState] = useState("");
  const [showVerification, setShowVerification] = useState(false);
  const hasHash = isTransactionHash(transaction.hash);
  const verifyUrl = getTransactionExplorerUrl(transaction.hash);
  const shareText = [
    `Choco receipt: ${transaction.amount} ${transaction.asset} to ${transaction.recipient}`,
    `Timing: ${getTimingLabel(transaction)}`,
    `Status: ${transaction.status}`,
    `From: ${transaction.from}`,
    `To: ${transaction.to}`,
    `Hash: ${formatTransactionHash(transaction.hash)}`,
    hasHash ? `Verify: ${verifyUrl}` : "Verify: pending wallet signature",
  ].join("\n");

  async function shareMovement() {
    try {
      if (navigator.share) {
        await navigator.share({ title: "Choco movement receipt", text: shareText });
        setShareState("Shared");
        return;
      }

      await navigator.clipboard?.writeText(shareText);
      setShareState("Copied");
    } catch {
      setShareState("Ready");
    }
  }

  return (
    <div className="screen receipt-detail-screen">
      <section className="receipt-detail-card">
        <div className="sheet-top">
          <div className="sheet-icon success"><ReceiptText size={24} /></div>
          <h2>Movement details</h2>
          <span className="sheet-chip">{transaction.status}</span>
        </div>

        <div className="receipt-card">
          <ReceiptRow icon={<Check size={18} />} label="Status" value={transaction.status} />
          <ReceiptRow icon={<CircleDollarSign size={18} />} label="Amount" value={`${transaction.amount} ${transaction.asset}`} />
          <ReceiptRow icon={<CalendarDays size={18} />} label="Timing" value={getTimingLabel(transaction)} />
        </div>

        <button
          className="receipt-expand"
          type="button"
          onClick={() => setShowVerification((isOpen) => !isOpen)}
          aria-expanded={showVerification}
        >
          <span><QrCode size={18} />Verification</span>
          {showVerification ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </button>

        {showVerification && (
          <section className="verify-panel" aria-label="Transaction verification">
            {hasHash ? (
              <div className="qr-card">
                <QrCanvas data={verifyUrl} size={132} />
                <a href={verifyUrl} target="_blank" rel="noreferrer">
                  Click here to verify transaction
                  <ExternalLink size={15} />
                </a>
              </div>
            ) : (
              <div className="notice">Explorer receipt appears after the wallet signs and the transaction is mined.</div>
            )}
            <div className="verify-list">
              <ReceiptRow icon={<Wallet size={18} />} label="From" value={transaction.from} mono />
              <ReceiptRow
                icon={<Check size={18} />}
                label="To"
                value={
                  transaction.toAddress
                    ? `${transaction.to} · ${transaction.toAddress.slice(0, 6)}...${transaction.toAddress.slice(-4)}`
                    : transaction.to
                }
              />
              <ReceiptRow icon={<CalendarDays size={18} />} label="Date" value={transaction.date} />
              <ReceiptRow icon={<ReceiptText size={18} />} label="Hash" value={formatTransactionHash(transaction.hash)} mono />
            </div>
            {transaction.approveHash && isTransactionHash(transaction.approveHash) && (
              <a
                className="receipt-link"
                href={getTransactionExplorerUrl(transaction.approveHash)}
                target="_blank"
                rel="noreferrer"
              >
                <ExternalLink size={15} /> View approval tx
              </a>
            )}
            {hasHash && (
              <a
                className="receipt-link"
                href={verifyUrl}
                target="_blank"
                rel="noreferrer"
              >
                <ExternalLink size={15} /> View receipt tx
              </a>
            )}
          </section>
        )}

        <button className="primary-cta" type="button" onClick={shareMovement}>
          <Share2 size={18} />
          {shareState ? `${shareState} receipt` : "Share receipt"}
        </button>
        <button className="secondary-dark" type="button" onClick={onBack}>Back to movements</button>
      </section>

      <BottomNav active="history" onHome={onHome} onPlans={onPlans} onHistory={onBack} />
    </div>
  );
}
