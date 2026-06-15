import { CalendarDays, Check, CircleDollarSign, Pencil, ReceiptText, Trash2, Wallet } from "lucide-react";
import { isAddress } from "viem";
import { useEffect, useState } from "react";
import { ChocoMark } from "../components/ChocoMark.jsx";
import { ContactCapture } from "../components/ContactCapture.jsx";
import { LightSheet } from "../components/LightSheet.jsx";
import { SummaryCard } from "../components/SheetPrimitives.jsx";
import { APP_CONFIG } from "../lib/app-config.js";
import { getApprovalTarget } from "../lib/celo.js";
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
  supabaseReady = false,
  onConnect,
  onConfirm,
  onEdit,
  onPickContact,
  onResolveContact,
  onEditContact,
  onRemoveContact,
  contactLookupStatus = "idle",
  contactLookupMessage = "",
}) {
  const [cepoliaSummary, setCepoliaSummary] = useState(null);
  const [editAddr, setEditAddr] = useState("");
  const [showEdit, setShowEdit] = useState(false);
  const [pendingDel, setPendingDel] = useState(false);

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

  useEffect(() => {
    setShowEdit(false);
    setEditAddr("");
    setPendingDel(false);
  }, [resolvedContact?.address]);

  function shortAddr(a) {
    const s = String(a || "");
    return s.length < 14 ? s : `${s.slice(0, 8)}…${s.slice(-6)}`;
  }

  function handleSaveEdit() {
    if (!isAddress(editAddr)) return;
    onEditContact?.(editAddr);
    setShowEdit(false);
    setEditAddr("");
  }

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
  const approvalTarget = getApprovalTarget({
    deliveryMode: plan.deliveryMode,
    intent: plan.intent,
  });
  const showApprovalTarget = walletReady && approvalTarget?.address && isAddress(approvalTarget.address);

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
          {resolvedContact?.address ? (
            <>
              {showEdit ? (
                <div>
                  <span>Contact</span>
                  <b>{resolvedContact.label}</b>
                  <input
                    className="contact-picker-input"
                    type="text"
                    inputMode="text"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck="false"
                    value={editAddr}
                    onChange={(e) => setEditAddr(e.target.value)}
                    placeholder="New wallet address…"
                    aria-label="New wallet address"
                  />
                  <div className="contact-picker-edit-actions">
                    <button type="button" className="cp-btn-save" onClick={handleSaveEdit} disabled={!isAddress(editAddr)}>
                      <Check size={14} /> Save
                    </button>
                    <button type="button" className="cp-btn-cancel" onClick={() => { setShowEdit(false); setEditAddr(""); }}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="contact-resolved-row">
                  <div className="contact-resolved-info">
                    <span>Contact</span>
                    <b>{resolvedContact.label}</b>
                    <small>{shortAddr(resolvedContact.address)}</small>
                  </div>
                  <div className="contact-resolved-actions">
                    <button
                      type="button"
                      className="cp-icon"
                      onClick={() => { setShowEdit(true); setEditAddr(""); setPendingDel(false); }}
                      aria-label="Edit contact address"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      type="button"
                      className={`cp-icon${pendingDel ? " cp-icon-danger" : ""}`}
                      onClick={() => { if (pendingDel) { onRemoveContact?.(); } else { setPendingDel(true); } }}
                      aria-label={pendingDel ? "Confirm delete contact" : "Delete contact"}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              )}
              <button type="button" onClick={() => { setPendingDel(false); onPickContact(); }}>
                Change contact
              </button>
            </>
          ) : contactLookupStatus === "checking" ? (
            <div>
              <span>Contact</span>
              <b>Checking saved contacts</b>
              <small>{contactLookupMessage || "Choco checks Supabase before asking to create a contact."}</small>
            </div>
          ) : (
            <>
              <div>
                <span>Contact</span>
                <b>{`Select ${receiptLabel}`}</b>
                <small>
                  {contactLookupStatus === "missing"
                    ? "No saved contact found. Add a one-time address or save it for next time."
                    : contactLookupStatus === "error"
                      ? contactLookupMessage || "Could not check saved contacts. Add a one-time address to continue."
                      : "Pick a saved contact or paste an address below."}
                </small>
              </div>
              <button type="button" onClick={onPickContact}>Select contact</button>
              <ContactCapture
                alias={receiptLabel}
                supabaseReady={supabaseReady}
                onSubmit={(address, opts) => onResolveContact(address, { label: receiptLabel, phone: "", saveContact: opts?.saveContact })}
              />
            </>
          )}
        </section>
      )}

      {showApprovalTarget && (
        <section className="approval-target-card" aria-label="Wallet approval target">
          <span>Wallet approval</span>
          <b>{approvalTarget.name}</b>
          <small>
            {approvalTarget.asset} approval to {shortAddr(approvalTarget.address)}. If MiniPay shows "unknown contract", compare this address before approving.
          </small>
        </section>
      )}

      <div className="reference-card">
        <span>Reference</span>
        <b>{reference}</b>
      </div>

      <div className="notice compact">
        {!walletReady
          ? "Connect and verify your wallet to continue."
          : supabaseReady
            ? "Wallet signs after confirmation. Saved contacts are visible only to your connected wallet."
            : "Wallet signs after confirmation. Choco reads your wallet balance only — no contact data is stored."}
      </div>
      {status === "error" && message && <div className="notice danger compact">{message}</div>}
      {setupNotice && <div className="notice compact">{setupNotice}</div>}
            
      <button className="primary-cta" type="button" disabled={walletReady ? !actionReady || status === "pending" : status === "pending"} onClick={walletReady ? onConfirm : onConnect}>
        {isSendNow ? <CircleDollarSign size={18} /> : walletReady ? <CalendarDays size={18} /> : <Wallet size={18} />}
        {primaryLabel}
      </button>
      <button className="secondary-cta" type="button" onClick={onEdit}>Edit instruction</button>
    </LightSheet>
  );
}
