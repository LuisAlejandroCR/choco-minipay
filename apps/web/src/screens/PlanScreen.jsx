import { ArrowRight, CircleDollarSign, ExternalLink, ShieldCheck, X } from "lucide-react";
import { ChocoMark } from "../components/ChocoMark.jsx";
import { BottomNav } from "../components/BottomNav.jsx";
import { formatWalletAddress } from "../modules/wallet/useMiniPayWallet.js";
import { getTimingLabel } from "../utils/planUtils.js";
import { defaultPlan } from "../data/testnetScenario.js";
import { LIVE_DEMO_URL } from "../config/runtime.js";
import { demoPromptContent } from "../content/demoFlow.js";

function DemoPrompt({ onRunDemo, onSkipDemo, onCloseDemo }) {
  return (
    <div className="demo-overlay" role="dialog" aria-label="Choco demo">
      <div className="demo-card">
        <button className="demo-close" type="button" aria-label="Close demo" onClick={onCloseDemo}>
          <X size={18} strokeWidth={3} />
        </button>
        <ChocoMark size="small" />
        <h2>{demoPromptContent.title}</h2>
        <p>{demoPromptContent.copy}</p>
        <a className="demo-live-link" href={LIVE_DEMO_URL} target="_blank" rel="noreferrer">
          {demoPromptContent.liveDemoLabel}
          <ExternalLink size={14} />
        </a>
        <div className="demo-actions">
          <button type="button" onClick={onRunDemo}>Run demo</button>
          <button type="button" onClick={onSkipDemo}>Skip</button>
        </div>
      </div>
    </div>
  );
}

export function PlanScreen({
  plans,
  showDemoPrompt,
  isWalletVerified,
  wallet,
  onVerifyWallet,
  onPlans,
  onHistory,
  onSendNow,
  onSelectPlan,
  onRunDemo,
  onSkipDemo,
  onCloseDemo,
}) {
  const nextPlan = plans[0] || defaultPlan;
  const isVerifyingWallet = wallet.status === "loading" || wallet.status === "opening-wallet";
  const isReadOnlyAddress = wallet.isReadOnly;
  const walletHelp = isWalletVerified
    ? `${formatWalletAddress(wallet.address)} - ${wallet.network.name} testnet`
    : wallet.statusLabel;
  const actionLabel = isWalletVerified
    ? "New transfer"
    : wallet.needsMobileWallet
      ? "Connect mobile wallet"
    : !wallet.hasProvider
      ? "Connect browser wallet"
    : isVerifyingWallet
      ? "Verifying testnet wallet"
      : "Verify testnet wallet";
  const actionHelp = isWalletVerified
    ? "Send now or schedule with voice"
    : wallet.needsMobileWallet
      ? "Choose MetaMask Mobile or MiniPay"
    : !wallet.hasProvider
      ? "Install or enable MetaMask"
    : walletHelp;

  return (
    <div className="screen plan-screen">
      <div className="home-hero">
        <div className="home-actions">
          <button type="button" aria-label="Profile"><ChocoMark size="tiny" /></button>
          <span className="home-title-pill">Choco</span>
          <button type="button" aria-label="Support"><ShieldCheck size={20} /></button>
        </div>
        <div className={`home-network-pill ${wallet.isTestnet ? "ready" : ""}`}>
          <span>{wallet.network.badge}</span>
          <b>{wallet.network.name}</b>
        </div>
        <div className="balance-copy">
          <span>{isWalletVerified ? isReadOnlyAddress ? "Address review" : "Next plan" : "Wallet access"}</span>
          <strong>{isWalletVerified ? isReadOnlyAddress ? "Ready" : nextPlan.amount : "Locked"}</strong>
          <p>
            {isWalletVerified
              ? isReadOnlyAddress
                ? `${formatWalletAddress(wallet.address)} - connect wallet app before signing.`
                : `${nextPlan.asset} to ${nextPlan.recipient} - ${getTimingLabel(nextPlan)}`
              : `Verify on ${wallet.network.name} testnet to unlock transfers, plans, and receipts.`}
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
      <section className="home-list" aria-label="Home plan list">
        <div className="section-heading">
          <span>Plans</span>
        </div>

        {plans.slice(0, 1).map((item) => (
          <button className="plan-row compact-row" type="button" key={item.id} onClick={() => onSelectPlan(item.id)}>
            <div className="plan-row-icon"><ChocoMark size="tiny" /></div>
            <div>
              <b>{item.recipient}</b>
              <span>{item.amount} {item.asset} - {getTimingLabel(item)}</span>
            </div>
            <small>{item.status}</small>
          </button>
        ))}
      </section>
      )}

      <BottomNav active="home" onHome={() => {}} onPlans={onPlans} onHistory={onHistory} />
      {showDemoPrompt && <DemoPrompt onRunDemo={onRunDemo} onSkipDemo={onSkipDemo} onCloseDemo={onCloseDemo} />}
    </div>
  );
}
