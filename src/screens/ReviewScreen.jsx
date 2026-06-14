import { CalendarDays, CircleDollarSign, ReceiptText, Wallet } from "lucide-react";
import { useEffect, useState } from "react";
import { ChocoMark } from "../components/ChocoMark.jsx";
import { ContactCapture } from "../components/ContactCapture.jsx";
import { LightSheet } from "../components/LightSheet.jsx";
import { SummaryCard } from "../components/SheetPrimitives.jsx";
import { APP_CONFIG } from "../lib/app-config.js";
import { summariseTransfer } from "../lib/cepolia.js";

export function ReviewScreen({
  plan,
  walletReady,
  status,
  message,
  setupNotice = "",
  actionReady,
  approvalUrl,
  txUrl,
  contactResolutionRequired = false,
  resolvedContact = null,
  recipientAddress = "",
  walletAccount = "",
  onConnect,
  onConfirm,
  onEdit,
  onPickContact,
  onResolveContact,
}) {
  const [cepoliaSummary, setCepoliaSummary] = useState(null);

  useEffect(() => {
    let active = true;
    if (!walletReady || !plan?.intent) { setCepoliaSummary(null); return undefined; }
    summariseTransfer({
      account: walletAccount,
      recipient: recipientAddress,
      intent: plan.intent,
      walletReady,
    })
      .then((summary) => { if (active) setCepoliaSummary(summary); })
      .catch(() => { if (active) setCepoliaSummary(null); });
    return () => { active = false; };
  }, [plan?.intent?.rawCommand, plan?.intent?.sourceAmount, plan?.intent?.amountKes, recipientAddress, walletAccount, walletReady]);

  const isSendNow = plan.deliveryMode === "now";
  const reference = plan.intent?.rawCommand || "Agent Choco instruction";
  const receiptLabel = plan.receiptLabel || plan.recipient || plan.intent?.receiptLabel || "Recipient";
  const recipientGets = cepoliaSummary?.recipientReceivesLabel
    || plan.intent?.destinationAmountLabel
    || `${plan.amount || "Missing"} ${plan.asset || ""}`.trim();
  const walletPaysPrefix = plan.intent?.inputAsset === APP_CONFIG.assets.source ? "" : "~";
  const walletPays = cepoliaSummary?.walletPaysLabel
    || (plan.intent?.sourceAmountLabel ? `${walletPaysPrefix}${plan.intent.sourceAmountLabel}` : plan.payAsset || "USDC");
  const feeLabel = cepoliaSummary?.networkFeeLabel || APP_CONFIG.transfer.networkFeeLabel;
  const totalCostLabel = cepoliaSummary?.totalCostLabel || "";
  const timingLabel = isSendNow ? "Send once now" : plan.schedule;
  const primaryLabel = status === "pending"
    ? "Working"
    : !walletReady
      ? "Connect wallet"
      : isSendNow
        ? "Confirm send"
        : "Confirm schedule";

  return (
    <LightSheet>
      <div className="sheet-top compact-confirmation-head">
        <div className="sheet-icon"><ChocoMark size="small" /></div>
        <h2>{isSendNow ? "Confirm send" : "Confirm schedule"}</h2>
        <span className="sheet-chip">{APP_CONFIG.network.badge}</span>
      </div>

      <div className="summary-grid confirmation-grid">
        <SummaryCard label="Receipt label" value={receiptLabel} />
        <SummaryCard label="Recipient gets" value={recipientGets} />
        <SummaryCard label="Wallet pays" value={walletPays} />
        <SummaryCard label="Timing" value={timingLabel} />
        <SummaryCard label="Fees" value={feeLabel} />
        {totalCostLabel && <SummaryCard label="Total cost" value={totalCostLabel} />}
      </div>

      {contactResolutionRequired && (
        <section className="contact-resolution-card" aria-label="One-time recipient contact">
          <div>
            <span>Contact</span>
            <b>{resolvedContact?.label || `Select ${receiptLabel}`}</b>
            <small>{resolvedContact?.phone || "Used only for this transfer."}</small>
          </div>
          <button type="button" onClick={onPickContact}>Select contact</button>
          {!resolvedContact?.address && (
            <ContactCapture
              alias={receiptLabel}
              onSubmit={(address) => onResolveContact(address, { label: resolvedContact?.label || receiptLabel, phone: resolvedContact?.phone || "" })}
            />
          )}
        </section>
      )}

      <div className="reference-card">
        <span>Reference</span>
        <b>{reference}</b>
      </div>

      <div className="notice compact">
        {walletReady
          ? "Wallet signs after confirmation. Choco reads funds and contacts only for this transfer; contacts are not stored."
          : "Connect and verify your wallet to continue."}
      </div>
      {status === "error" && message && <div className="notice danger compact">{message}</div>}
      {setupNotice && <div className="notice compact">{setupNotice}</div>}

      {approvalUrl && <a className="receipt-link" href={approvalUrl} target="_blank" rel="noreferrer"><ReceiptText size={18} /> View approval</a>}
      {txUrl && <a className="receipt-link" href={txUrl} target="_blank" rel="noreferrer"><ReceiptText size={18} /> View receipt</a>}

      <button className="primary-cta" type="button" disabled={walletReady ? !actionReady || status === "pending" : status === "pending"} onClick={walletReady ? onConfirm : onConnect}>
        {isSendNow ? <CircleDollarSign size={18} /> : walletReady ? <CalendarDays size={18} /> : <Wallet size={18} />}
        {primaryLabel}
      </button>
      <button className="secondary-cta" type="button" onClick={onEdit}>Edit instruction</button>
    </LightSheet>
  );
}
