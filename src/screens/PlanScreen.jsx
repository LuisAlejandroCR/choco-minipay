import { useState } from "react";
import { ArrowRight, CircleDollarSign, Eye, EyeOff, ExternalLink, ShieldCheck, X } from "lucide-react";
import { ChocoMark } from "../components/ChocoMark.jsx";
import { formatWalletAddress } from "../modules/wallet/useMiniPayWallet.js";
import { scheduledLocalDateForPlan } from "../lib/schedule-time.js";
import { getPlanExecutionState, getTimingLabel, recipientLabel } from "../utils/planUtils.js";
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

function getNextPlanRunMs(plan, from = new Date()) {
  const nowMs = from.getTime();
  const firstRunMs = plan.firstRunAt ? Number(plan.firstRunAt) * 1000 : 0;
  if (firstRunMs && firstRunMs >= nowMs) return firstRunMs;

  const scheduled = scheduledLocalDateForPlan(plan, from);
  if (!scheduled) return Number.MAX_SAFE_INTEGER;

  const next = new Date(scheduled);
  while (next.getTime() < nowMs) {
    next.setUTCMonth(next.getUTCMonth() + 1);
  }
  return next.getTime();
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
  const [hideBalance, setHideBalance] = useState(false);

  const isVerifyingWallet = wallet.status === "loading" || wallet.status === "opening-wallet";
  const usdcBalance = balances.find((b) => b.key === "usdc");
  const primaryAmount = usdcBalance?.formatted ?? "0.00";
  const walletShort = formatWalletAddress(wallet.address);
  const activePlans = plans.filter((plan) => getPlanExecutionState(plan).status !== "Paused");
  const upcomingPlans = [...activePlans].sort((a, b) => getNextPlanRunMs(a) - getNextPlanRunMs(b));
  const homePlans = upcomingPlans.slice(0, 2);
  const nextPlan = upcomingPlans[0] || null;

  const heroSub = isWalletVerified
    ? wallet.isReadOnly
      ? `${walletShort} — connect wallet app to sign.`
      : nextPlan
        ? `Next: ${nextPlan.amount} ${nextPlan.asset} → ${nextPlan.recipient} · ${getTimingLabel(nextPlan)}`
        : `${walletShort} · no active plans`
    : "";

  const connectLabel = wallet.needsMobileWallet
    ? "Connect mobile wallet"
    : !wallet.hasProvider
      ? "Connect browser wallet"
      : isVerifyingWallet
        ? "Verifying wallet…"
        : "Verify wallet";

  const connectHelp = wallet.needsMobileWallet
    ? "Open in MiniPay or wallet browser"
    : !wallet.hasProvider
      ? "Install or enable MetaMask"
      : walletStatusLabel;

  return (
    <div className="screen plan-screen">

      {/* ── STICKY HERO + CTA ─────────────────────────── */}
      <div className="screen-header">
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

        {isWalletVerified ? (
          <div className="balance-hero">
            <span className="balance-hero-label">USDC balance</span>
            <div className="balance-hero-row">
              <strong className="balance-hero-amount">
                {hideBalance ? "••••••" : primaryAmount}
              </strong>
              <button
                className="balance-toggle"
                type="button"
                aria-label={hideBalance ? "Show balance" : "Hide balance"}
                onClick={() => setHideBalance((v) => !v)}
              >
                {hideBalance ? <Eye size={16} /> : <EyeOff size={16} />}
              </button>
            </div>
            {heroSub && <p className="balance-hero-sub">{heroSub}</p>}
          </div>
        ) : (
          <div className="balance-copy">
            <span>Wallet access</span>
            <strong>Locked</strong>
            <p>{`Verify on ${wallet.network.label} to unlock transfers, schedules, and receipts.`}</p>
          </div>
        )}
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
          <b>{isWalletVerified ? "New transfer" : connectLabel}</b>
          <small>{isWalletVerified ? "Text or voice, then wallet confirms" : connectHelp}</small>
        </span>
        <ArrowRight size={21} />
      </button>
      {isWalletVerified && plans.length > 0 && (
        <div className="section-heading">
          <span>Plans</span>
          <button type="button" onClick={onPlans}>See all</button>
        </div>
      )}
      </div>

      {/* ── ACTIVE SCHEDULES (only when wallet is connected and plans exist) */}
      {isWalletVerified && plans.length > 0 && (
        <section className="home-list" aria-label="Plans">
          {homePlans.map((item) => {
            const execution = getPlanExecutionState(item);
            return (
            <button
              className="plan-row compact-row"
              type="button"
              key={item.id}
              onClick={() => onSelectPlan(item.id)}
            >
              <div className="plan-row-icon"><ChocoMark size="tiny" /></div>
              <div>
                <b>{recipientLabel(item)}</b>
                <span>{item.amount} {item.asset} · {getTimingLabel(item)}</span>
              </div>
              <small className={execution.tone}>{execution.label}</small>
            </button>
            );
          })}
        </section>
      )}

      {showDemoPrompt && (
        <DemoPrompt liveDemoUrl={liveDemoUrl} onDismiss={onDismissDemo} onRunDemo={onRunDemo} />
      )}
    </div>
  );
}
