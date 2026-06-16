import { ArrowRight, CircleDollarSign, ExternalLink, ShieldCheck, X } from "lucide-react";
import { ChocoMark } from "../components/ChocoMark.jsx";
import { BottomNav } from "../components/BottomNav.jsx";
import { formatWalletAddress } from "../modules/wallet/useMiniPayWallet.js";
import { getTimingLabel } from "../utils/planUtils.js";
import { defaultPlan } from "../data/chocoScenario.js";
import { demoPromptContent } from "../content/demoFlow.js";

function DemoPrompt({ liveDemoUrl, onDismiss, onRunDemo }) {
  return (
    <div className="demo-overlay" role="dialog" aria-modal="true" aria-labelledby="demo-prompt-title">
      <div className="demo-card">
        <ChocoMark size="tiny" />
        <button className="demo-close" type="button" aria-label="Skip demo prompt" onClick={onDismiss}>
          <X size={18} />
        </button>
        <h2 id="demo-prompt-title">{demoPromptContent.title}</h2>
        <p>{demoPromptContent.copy}</p>
        <a className="demo-live-link" href={liveDemoUrl} target="_blank" rel="noreferrer">
          {demoPromptContent.liveDemoLabel}
          <ExternalLink size={15} />
        </a>
        <div className="demo-actions">
          <button type="button" onClick={onRunDemo}>Run demo</button>
          <button type="button" onClick={onDismiss}>Skip</button>
        </div>
      </div>
    </div>
  );
}

export function PlanScreen({
  plans,
  isWalletVerified,
  wallet,
  balances,
  walletStatusLabel,
  onVerifyWallet,
  onPlans,
  onHistory,
  onSendNow,
  onSelectPlan,
  showDemoPrompt = false,
  liveDemoUrl = "",
  onDismissDemo = () => {},
  onRunDemo = () => {},
}) {
  const nextPlan = plans[0] || defaultPlan;
  const isVerifyingWallet = wallet.status === "loading" || wallet.status === "opening-wallet";
  const isReadOnlyAddress = wallet.isReadOnly;
  const walletHelp = isWalletVerified
    ? `${formatWalletAddress(wallet.address)} - ${wallet.network.label}`
    : wallet.statusLabel;
  const actionLabel = isWalletVerified
    ? "New transfer"
    : wallet.needsMobileWallet
      ? "Connect mobile wallet"
    : !wallet.hasProvider
      ? "Connect browser wallet"
    : isVerifyingWallet
      ? "Verifying wallet"
      : "Verify wallet";
  const actionHelp = isWalletVerified
    ? "Send now or schedule with voice"
    : wallet.needsMobileWallet
      ? "Choose MetaMask Mobile or MiniPay"
    : !wallet.hasProvider
      ? "Install or enable MetaMask"
    : walletHelp;
  const visibleBalances = balances.filter((item) => item.raw && item.raw !== 0n);

  return (
    <div className="screen plan-screen">
      <div className="home-hero">
        <div className="home-actions">
          <button type="button" aria-label="Profile"><ChocoMark size="tiny" /></button>
          <span className="home-title-pill">Choco</span>
          <button type="button" aria-label="Support"><ShieldCheck size={20} /></button>
        </div>
        <div className={`home-network-pill ${wallet.isTestnet ? "" : "ready"}`}>
          <span>Network</span>
          <b>{wallet.network.label}</b>
        </div>
        <div className="balance-copy">
          <span>{isWalletVerified ? walletStatusLabel : "Wallet access"}</span>
          <strong>{isWalletVerified ? plans.length > 0 ? nextPlan.amount : "Ready" : "Locked"}</strong>
          <p>
            {isWalletVerified
              ? isReadOnlyAddress
                ? `${formatWalletAddress(wallet.address)} - connect wallet app before signing.`
                : plans.length > 0
                  ? `${nextPlan.asset} to ${nextPlan.recipient} - ${getTimingLabel(nextPlan)}`
                  : "No active plans yet. Start with a text or voice transfer instruction."
              : `Verify on ${wallet.network.label} to unlock wallet-signed transfers, scheduled actions, and receipts.`}
          </p>
        </div>
      </div>

      <button
        className={`home-start-action ${isWalletVerified ? "" : "verify-action"}`}
        type="button"
        disabled={!isWalletVerified && isVerifyingWallet}
        onClick={isWalletVerified ? onSendNow : onVerifyWallet}
      >
        <span className="home-start-icon">
          {isWalletVerified ? <CircleDollarSign size={20} /> : <ShieldCheck size={20} />}
        </span>
        <span>
          <b>{actionLabel}</b>
          <small>{actionHelp}</small>
        </span>
        <ArrowRight size={21} />
      </button>

      {isWalletVerified && (
      <section className="home-list" aria-label="Connected wallet assets">
        <div className="section-heading">
          <span>Connected wallet assets</span>
          {visibleBalances.length > 1 && <small className="section-count">{visibleBalances.length} assets</small>}
        </div>

        {visibleBalances.length > 0 ? visibleBalances.map((item) => (
          <div className="plan-row compact-row" key={item.key}>
            <div className="plan-row-icon"><ChocoMark size="tiny" /></div>
            <div>
              <b>{item.label}</b>
              <span>Read from wallet on-chain</span>
            </div>
            <small>{item.formatted}</small>
          </div>
        )) : (
          <div className="empty-inline">No supported asset balances detected in this wallet yet.</div>
        )}

        {plans.length > 0 && (
          <>
            <div className="section-heading secondary-heading">
              <span>Scheduled transfers</span>
              {plans.length > 1 && <small className="section-count">{plans.length} active</small>}
            </div>
            {plans.slice(0, 3).map((item) => (
              <button className="plan-row compact-row" type="button" key={item.id} onClick={() => onSelectPlan(item.id)}>
                <div className="plan-row-icon"><ChocoMark size="tiny" /></div>
                <div>
                  <b>{item.recipient}</b>
                  <span>{item.amount} {item.asset} - {getTimingLabel(item)}</span>
                </div>
                <small>{item.status}</small>
              </button>
            ))}
            {plans.length > 3 && (
              <button className="see-all-plans" type="button" onClick={onPlans}>
                See all {plans.length} plans
              </button>
            )}
          </>
        )}
      </section>
      )}
      <BottomNav active="home" onHome={() => {}} onPlans={onPlans} onHistory={onHistory} />
      {showDemoPrompt && (
        <DemoPrompt liveDemoUrl={liveDemoUrl} onDismiss={onDismissDemo} onRunDemo={onRunDemo} />
      )}
    </div>
  );
}
