import { CalendarDays, Check, ExternalLink, GitBranch, Share2, User, X } from "lucide-react";
import { useState } from "react";
import { QrCanvas } from "../components/QrCode.jsx";
import { shortAddress } from "../lib/celo.js";
import { formatTransactionHash, getTransactionExplorerUrl, isTransactionHash } from "../lib/transactions.js";
import { getTimingLabel } from "../utils/planUtils.js";

export function ReceiptDetailScreen({ transaction }) {
  const [shareState, setShareState] = useState("");
  const [showQrPreview, setShowQrPreview] = useState(false);
  const hasHash = isTransactionHash(transaction.hash);
  const verifyUrl = getTransactionExplorerUrl(transaction.hash);
  const timingLabel = getTimingLabel(transaction);
  const hasApproveHash = transaction.approveHash && isTransactionHash(transaction.approveHash);
  const recipientDetail = transaction.toAddress
    ? `${transaction.recipient} ${shortAddress(transaction.toAddress)}`
    : transaction.to && transaction.to !== transaction.recipient
      ? transaction.to
      : transaction.recipient;

  const shareText = [
    `Choco receipt: ${transaction.amount} ${transaction.asset} to ${transaction.recipient}`,
    `Timing: ${timingLabel}`,
    `Status: ${transaction.status}`,
    `Recipient: ${recipientDetail}`,
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
      <div className="rds-header">
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
              <button
                className="rds-qr-wrapper"
                type="button"
                aria-label="Preview transaction QR"
                onClick={() => setShowQrPreview(true)}
              >
                <QrCanvas data={verifyUrl} size={116} />
              </button>
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
      </div>

      <div className="rds-fields">
        {recipientDetail && (
          <div className="rds-field">
            <div className="rds-field-label">
              <span className="rds-field-icon"><User size={15} /></span>
              <span className="rds-field-key">Recipient</span>
            </div>
            <span className="rds-field-value">{recipientDetail}</span>
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


      {showQrPreview && hasHash && (
        <div className="qr-preview-backdrop" role="dialog" aria-modal="true" aria-label="Transaction QR preview" onClick={() => setShowQrPreview(false)}>
          <div className="qr-preview-sheet" onClick={(event) => event.stopPropagation()}>
            <button className="qr-preview-close" type="button" aria-label="Close QR preview" onClick={() => setShowQrPreview(false)}>
              <X size={18} strokeWidth={2.6} />
            </button>
            <QrCanvas data={verifyUrl} size={220} />
            <a className="rds-qr-link" href={verifyUrl} target="_blank" rel="noreferrer">
              Open on explorer <ExternalLink size={13} />
            </a>
          </div>
        </div>
      )}
      <div className="rds-actions">
        <button className="primary-cta" type="button" onClick={shareMovement}>
          <Share2 size={18} />
          {shareState ? `${shareState} receipt` : "Share receipt"}
        </button>
      </div>
    </div>
  );
}
