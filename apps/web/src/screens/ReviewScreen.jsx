import { ArrowRight } from "lucide-react";
import { ChocoMark } from "../components/ChocoMark.jsx";
import { LightSheet } from "../components/LightSheet.jsx";
import { SummaryCard } from "../components/SheetPrimitives.jsx";
import { ContactCapture } from "../components/ContactCapture.jsx";
import { WalletCheckStatus } from "../components/WalletCheckStatus.jsx";
import { formatContactShort } from "@core/domain/contacts.js";
import { TESTNET_SCENARIO } from "../data/testnetScenario.js";

export function ReviewScreen({ plan, mode, quote, agentPreflight, agentPreflightStatus, transferBlockMessage, resolvedContact, onSaveContact, onEdit, onConfirm }) {
  const isSendNow = plan.deliveryMode === "now";
  const chip = isSendNow ? "SEND NOW" : mode === "update" ? "UPDATE" : mode === "demo" ? "DEMO" : "NEW";
  const isWalletCheckLoading = agentPreflightStatus === "loading";
  const isWalletCheckReady = agentPreflight?.ok === true;
  const primaryLabel = isWalletCheckLoading
    ? "Checking wallet"
    : !isWalletCheckReady
      ? "Wallet check needed"
      : isSendNow
        ? "Prepare testnet send"
        : "Confirm schedule";

  // Block 12: live values — fall back to plan values while quote is loading.
  const displayAmount = quote
    ? `${quote.destinationAmount} ${quote.destinationAsset}`
    : `${plan.amount} ${plan.asset}`;
  const displayCost = quote
    ? `≈${quote.sourceAmount} ${quote.sourceAsset}`
    : plan.routeEstimate ?? "—";

  return (
    <LightSheet>
      <div className="sheet-top">
        <div className="sheet-icon"><ChocoMark size="small" /></div>
        <h2>{isSendNow ? "Choco send now" : "Choco scheduled plan"}</h2>
        <span className="sheet-chip">{chip}</span>
      </div>

      <div className="sheet-tabs">
        <span className="active">Overview</span>
        <span>Confirm</span>
        <span>Receipt</span>
      </div>

      <div className="route-card">
        <div className="route-node">
          <b>{plan.payAsset}</b>
          {/* Block 12: show live USDC balance while quote is available */}
          <small>{quote ? quote.balanceUsdc : "Pay on Celo"}</small>
        </div>
        <div className="route-arrow"><ArrowRight size={22} /></div>
        <div className="route-node">
          <b>{displayAmount}</b>
          <small>
            {resolvedContact
              ? `${plan.recipient} · ${formatContactShort(resolvedContact)}`
              : `${plan.recipient} - Kenya`}
          </small>
        </div>
      </div>

      {/* Block 12: balance + cost summary banner */}
      {quote && (
        <div className={`quote-banner${quote.hasEnoughUsdc ? "" : " quote-banner--warn"}`}>
          <span>You have <strong>{quote.balanceUsdc}</strong></span>
          <span aria-hidden="true">—</span>
          <span>sending <strong>{quote.destinationAmount} {quote.destinationAsset}</strong> to {plan.recipient}</span>
          {!quote.hasEnoughUsdc && (
            <span className="quote-banner__warn">Insufficient USDC — add funds before sending</span>
          )}
        </div>
      )}

      <div className="summary-grid">
        <SummaryCard label="Amount" value={displayAmount} />
        <SummaryCard label="Timing" value={isSendNow ? "Send once now" : plan.schedule.replace(` - ${TESTNET_SCENARIO.scheduledTimeLabel}`, "")} />
        <SummaryCard label="Costs" value={displayCost} />
        <SummaryCard label="Your balance" value={quote?.balanceUsdc ?? "—"} />
      </div>

      {!resolvedContact && (
        <ContactCapture alias={plan.recipient} onSubmit={onSaveContact} />
      )}

      <WalletCheckStatus result={agentPreflight} status={agentPreflightStatus} />

      <div className="notice">
        {isSendNow
          ? "Testnet only. Choco prepares a draft after the wallet check passes."
          : "Choco will ask for confirmation before activating the schedule."}
      </div>

      {transferBlockMessage && <div className="notice danger">{transferBlockMessage}</div>}

      <button className="primary-cta" type="button" disabled={!isWalletCheckReady || isWalletCheckLoading} onClick={onConfirm}>
        {primaryLabel}
      </button>
      <button className="secondary-cta" type="button" onClick={onEdit}>Edit instruction</button>
    </LightSheet>
  );
}
