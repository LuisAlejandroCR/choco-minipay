import { CalendarCheck2, CalendarDays, CircleDollarSign, CreditCard, Wallet, Zap } from "lucide-react";
import { useEffect, useState } from "react";
import { ReviewContactSection } from "../components/ReviewContactSection.jsx";
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
  const quoteReady = cepoliaSummary?.readyToConfirm !== false;
  const actionBlocked = !actionReady || !quoteReady;

  const noticeText = !walletReady
    ? "Connect and verify your wallet to continue."
    : isSendNow
      ? supabaseReady
        ? "Wallet signs after confirmation. Saved contacts are visible only to your connected wallet."
        : "Wallet signs after confirmation. Choco reads your wallet balance only - no contact data is stored."
      : "Wallet authorizes this plan once. Funds stay in your wallet until the scheduled execution.";

  return (
    <div className="screen review-screen">
      <div className="rds-hero">
        <div className="rds-hero-top">
          <span className="rds-hero-kicker">{isSendNow ? "Send now" : "Schedule"}</span>
        </div>
        <div className="rds-hero-recipient">{receiptLabel}</div>
        <div className="rds-hero-amount">
          {cepoliaSummary?.recipientReceives
            ? <>{cepoliaSummary.recipientReceives.toLocaleString("en-US", { maximumFractionDigits: 2 })} <small>KESm</small></>
            : recipientGets || "-"
          }
        </div>
      </div>

      {contactResolutionRequired && (
        <ReviewContactSection
          resolvedContact={resolvedContact}
          receiptLabel={receiptLabel}
          walletAccount={walletAccount}
          walletReady={walletReady}
          supabaseReady={supabaseReady}
          contactLookupStatus={contactLookupStatus}
          contactLookupMessage={contactLookupMessage}
          onConnect={onConnect}
          onPickContact={onPickContact}
          onResolveContact={onResolveContact}
          onEditContact={onEditContact}
          onRemoveContact={onRemoveContact}
        />
      )}

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
