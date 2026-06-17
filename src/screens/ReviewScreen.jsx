import { CalendarDays, Check, CircleDollarSign, Pencil, Trash2, Wallet } from "lucide-react";
import { isAddress } from "viem";
import { useEffect, useState } from "react";
import { ContactCapture } from "../components/ContactCapture.jsx";
import { ContactPicker } from "../components/ContactPicker.jsx";
import { DetailLine } from "../components/SheetPrimitives.jsx";
import { APP_CONFIG } from "../lib/app-config.js";
import { shortAddress } from "../lib/celo.js";
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
    return shortAddress(a);
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
        : "Authorize plan";
  const canCaptureContact = !supabaseReady || contactLookupStatus === "missing";
  const contactErrorNeedsWallet = !walletReady || /wallet/i.test(contactLookupMessage);
  const contactErrorActionLabel = contactErrorNeedsWallet ? "Connect wallet" : "Retry saved contacts";
  const onContactErrorAction = contactErrorNeedsWallet ? onConnect : onPickContact;
  return (
    <div className="screen review-screen">
      <div className="screen-hero">
        <span className="screen-hero-label">{isSendNow ? "Send now" : "Schedule"}</span>
        <div className="screen-hero-row">
          <div>
            <h2 className="screen-hero-title">{isSendNow ? "Confirm send" : "Authorize plan"}</h2>
            <p className="screen-hero-detail">{receiptLabel}</p>
          </div>
          <span className="sheet-chip">{APP_CONFIG.network.badge}</span>
        </div>
      </div>

      <div className="detail-list">
        <DetailLine label="Recipient gets" value={recipientGets} />
        <DetailLine label="Wallet pays" value={walletPays} />
        <DetailLine label="Timing" value={timingLabel} />
        <DetailLine label="Fees" value={feeLabel} />
        {totalCostLabel && <DetailLine label="Total cost" value={totalCostLabel} />}
      </div>

      {contactResolutionRequired && (
        <section className="contact-resolution-card" aria-label="One-time recipient contact">
          {resolvedContact?.address ? (
            /* ── Resolved: show label + address with edit / change / delete ── */
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
            /* ── Checking: brief loading state ── */
            <div>
              <span>Contact</span>
              <b>Looking up {receiptLabel}…</b>
            </div>
          ) : contactLookupStatus === "error" ? (
            <>
              <div>
                <span>Contact</span>
                <b>Could not check saved contacts</b>
                <small>{contactLookupMessage || "Try loading saved contacts again before entering a new address."}</small>
              </div>
              <button type="button" onClick={onContactErrorAction}>
                {contactErrorActionLabel}
              </button>
            </>
          ) : (
            /* ── Not resolved: inline list + address fallback ── */
            <>
              <div>
                <span>Contact</span>
                <b>Select {receiptLabel}</b>
              </div>
              <ContactPicker
                inline
                ownerWallet={walletAccount}
                onSelect={(c) => onResolveContact(c.address, { label: c.label, source: "contacts", contactId: c.contactId, saveContact: false })}
                onClose={() => {}}
              />
              {canCaptureContact && (
                <>
                  <div className="contact-or-divider"><span>or enter address</span></div>
                  <ContactCapture
                    alias={receiptLabel}
                    supabaseReady={supabaseReady}
                    onSubmit={(address, opts) => onResolveContact(address, { label: receiptLabel, phone: "", saveContact: opts?.saveContact })}
                  />
                </>
              )}
            </>
          )}
        </section>
      )}

      <div className="reference-card">
        <span>Reference</span>
        <b>{reference}</b>
      </div>

      <div className="notice compact">
        {!walletReady
          ? "Connect and verify your wallet to continue."
          : isSendNow
            ? supabaseReady
              ? "Wallet signs after confirmation. Saved contacts are visible only to your connected wallet."
              : "Wallet signs after confirmation. Choco reads your wallet balance only — no contact data is stored."
            : "Wallet authorizes this plan once. Funds stay in your wallet until the scheduled execution."}
      </div>
      {status === "error" && message && <div className="notice danger compact">{message}</div>}
      {setupNotice && <div className="notice compact">{setupNotice}</div>}
            
      <button className="primary-cta" type="button" disabled={walletReady ? !actionReady || status === "pending" : status === "pending"} onClick={walletReady ? onConfirm : onConnect}>
        {isSendNow ? <CircleDollarSign size={18} /> : walletReady ? <CalendarDays size={18} /> : <Wallet size={18} />}
        {primaryLabel}
      </button>
      <button className="secondary-dark" type="button" onClick={onEdit}>Edit instruction</button>
    </div>
  );
}
