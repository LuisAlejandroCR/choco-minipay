import { CalendarCheck2, CalendarDays, Check, CircleDollarSign, CreditCard, Pencil, Trash2, Wallet, Zap } from "lucide-react";
import { isAddress } from "viem";
import { useEffect, useState } from "react";
import { ContactCapture } from "../components/ContactCapture.jsx";
import { ContactPicker } from "../components/ContactPicker.jsx";
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
  const quoteReady = cepoliaSummary?.readyToConfirm !== false;
  const actionBlocked = !actionReady || !quoteReady;

  const noticeText = !walletReady
    ? "Connect and verify your wallet to continue."
    : isSendNow
      ? supabaseReady
        ? "Wallet signs after confirmation. Saved contacts are visible only to your connected wallet."
        : "Wallet signs after confirmation. Choco reads your wallet balance only - no contact data is stored."
      : "Wallet authorizes this plan once. Funds stay in your wallet until the scheduled execution.";

  const contactSection = contactResolutionRequired ? (
    <section className="contact-resolution-card" aria-label="Recipient contact">
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
                placeholder="New wallet address..."
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
                <span>Recipient contact</span>
                <small>{shortAddr(resolvedContact.address)}</small>
              </div>
              <div className="contact-resolved-actions">
                <button
                  type="button"
                  className="contact-select-pill"
                  onClick={() => { setPendingDel(false); onPickContact(); }}
                >
                  Change
                </button>
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
        </>
      ) : contactLookupStatus === "checking" ? (
        <div>
          <span>Contact</span>
          <b>Looking up {receiptLabel}...</b>
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
  ) : null;

  return (
    <div className="screen review-screen">
      <div className="rds-hero">
        <div className="rds-hero-top">
          <span className="rds-hero-kicker">{isSendNow ? "Send now" : "Schedule"}</span>
          <span className="sheet-chip">{APP_CONFIG.network.badge}</span>
        </div>
        <div className="rds-hero-recipient">{receiptLabel}</div>
        <div className="rds-hero-amount">
          {cepoliaSummary?.recipientReceives
            ? <>{cepoliaSummary.recipientReceives.toLocaleString("en-US", { maximumFractionDigits: 2 })} <small>KESm</small></>
            : recipientGets || "-"
          }
        </div>
      </div>

      {contactSection}

      <div className="rds-fields">
        <div className="rds-field">
          <div className="rds-field-label">
            <span className="rds-field-icon"><Wallet size={15} /></span>
            <span className="rds-field-key">Pays</span>
          </div>
          <span className="rds-field-value">{walletPays}</span>
        </div>

        <div className="rds-field">
          <div className="rds-field-label">
            <span className="rds-field-icon"><CalendarDays size={15} /></span>
            <span className="rds-field-key">Timing</span>
          </div>
          <span className="rds-field-value">{timingLabel}</span>
        </div>

        <div className="rds-field">
          <div className="rds-field-label">
            <span className="rds-field-icon"><Zap size={15} /></span>
            <span className="rds-field-key">Fees</span>
          </div>
          <span className="rds-field-value">{feeLabel}</span>
        </div>

        {totalCostLabel && (
          <div className="rds-field">
            <div className="rds-field-label">
              <span className="rds-field-icon"><CreditCard size={15} /></span>
              <span className="rds-field-key">Total</span>
            </div>
            <span className="rds-field-value">{totalCostLabel}</span>
          </div>
        )}
      </div>

      {cepoliaSummary?.routeUnavailable && <div className="notice danger compact">{cepoliaSummary.routeUnavailableMessage}</div>}
      {status === "error" && message && <div className="notice danger compact">{message}</div>}
      {setupNotice && <div className="notice compact">{setupNotice}</div>}

      <div className="rds-actions">
        <div className="notice compact" style={{ marginBottom: 0 }}>{noticeText}</div>
        <button
          className="primary-cta"
          type="button"
          disabled={walletReady ? actionBlocked || status === "pending" || status === "success" : status === "pending"}
          onClick={walletReady ? onConfirm : onConnect}
        >
          {isSendNow ? <CircleDollarSign size={18} /> : walletReady ? <CalendarCheck2 size={18} /> : <Wallet size={18} />}
          {primaryLabel}
        </button>
        <button className="secondary-dark" type="button" onClick={onEdit}>Edit instruction</button>
      </div>
    </div>
  );
}
