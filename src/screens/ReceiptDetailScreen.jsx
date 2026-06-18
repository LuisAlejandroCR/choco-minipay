import { CalendarDays, Check, ExternalLink, GitBranch, Share2, User, Wallet } from "lucide-react";
import { useState } from "react";
import { QrCanvas } from "../components/QrCode.jsx";
import { BottomNav } from "../components/BottomNav.jsx";
import { shortAddress } from "../lib/celo.js";
import { formatTransactionHash, getTransactionExplorerUrl, isTransactionHash } from "../lib/transactions.js";
import { getTimingLabel } from "../utils/planUtils.js";

export function ReceiptDetailScreen({ transaction, onBack, onHome, onPlans }) {
  const [shareState, setShareState] = useState("");
  const hasHash = isTransactionHash(transaction.hash);
  const verifyUrl = getTransactionExplorerUrl(transaction.hash);
  const timingLabel = getTimingLabel(transaction);
  const hasApproveHash = transaction.approveHash && isTransactionHash(transaction.approveHash);

  const shareText = [
    `Choco receipt: ${transaction.amount} ${transaction.asset} to ${transaction.recipient}`,
    `Timing: ${timingLabel}`,
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

      <div className="rds-hero">
        <div className="rds-hero-top">
          <span className="rds-hero-kicker">Choco receipt</span>
          <span className="sheet-chip">{transaction.status}</span>
        </div>
        <div className="rds-hero-recipient">{transaction.recipient || "Recipient"}</div>
        <div className="rds-hero-amount">
          {transaction.amount} <small>{transaction.asset}</small>
        </div>
        {transaction.date && <div className="rds-hero-date">{transaction.date}</div>}
      </div>

      <div className="rds-qr">
        {hasHash ? (
          <>
            <div className="rds-qr-wrapper">
              <QrCanvas data={verifyUrl} size={152} />
            </div>
            <a className="rds-qr-link" href={verifyUrl} target="_blank" rel="noreferrer">
              Verify on-chain <ExternalLink size={13} />
            </a>
          </>
        ) : (
          <div className="rds-qr-notice">
            Verification QR appears after the wallet signs and the transaction is mined.
          </div>
        )}
      </div>

      <div className="rds-fields">
        {(transaction.recipient || transaction.to) && (
          <div className="rds-field">
            <div className="rds-field-label">
              <span className="rds-field-icon"><User size={15} /></span>
              <span className="rds-field-key">To</span>
            </div>
            <span className="rds-field-value">
              {transaction.recipient}
              {transaction.to ? <span style={{ color: "var(--muted)", fontWeight: 600 }}> — {shortAddress(transaction.to)}</span> : null}
            </span>
          </div>
        )}

        {transaction.from && (
          <div className="rds-field">
            <div className="rds-field-label">
              <span className="rds-field-icon"><Wallet size={15} /></span>
              <span className="rds-field-key">From</span>
            </div>
            <span className="rds-field-value">{shortAddress(transaction.from)}</span>
          </div>
        )}

        <div className="rds-field">
          <div className="rds-field-label">
            <span className="rds-field-icon"><CalendarDays size={15} /></span>
            <span className="rds-field-key">Timing</span>
          </div>
          <span className="rds-field-value">{timingLabel}</span>
        </div>

        {transaction.routeEstimate && (
          <div className="rds-field">
            <div className="rds-field-label">
              <span className="rds-field-icon"><GitBranch size={15} /></span>
              <span className="rds-field-key">Route</span>
            </div>
            <span className="rds-field-value">{transaction.routeEstimate}</span>
          </div>
        )}

        {hasApproveHash && (
          <div className="rds-field">
            <div className="rds-field-label">
              <span className="rds-field-icon"><Check size={15} /></span>
              <span className="rds-field-key">Approval tx</span>
            </div>
            <a
              className="rds-field-value"
              href={getTransactionExplorerUrl(transaction.approveHash)}
              target="_blank"
              rel="noreferrer"
              style={{ color: "var(--latte-300)", display: "inline-flex", alignItems: "center", gap: 4 }}
            >
              View <ExternalLink size={11} />
            </a>
          </div>
        )}
      </div>

      <div className="rds-actions">
        <button className="primary-cta" type="button" onClick={shareMovement}>
          <Share2 size={18} />
          {shareState ? `${shareState} receipt` : "Share receipt"}
        </button>
        <button className="secondary-dark" type="button" onClick={onBack}>Back to movements</button>
      </div>

      <BottomNav active="history" onHome={onHome} onPlans={onPlans} onHistory={onBack} />
    </div>
  );
}
