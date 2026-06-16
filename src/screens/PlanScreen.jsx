import { useState } from "react";
import { CalendarDays, CircleDollarSign, Clock, Eye, EyeOff, ExternalLink, List, ShieldCheck, X } from "lucide-react";
import { ChocoMark } from "../components/ChocoMark.jsx";
import { BottomNav } from "../components/BottomNav.jsx";
import { formatWalletAddress } from "../modules/wallet/useMiniPayWallet.js";
import { getTimingLabel } from "../utils/planUtils.js";
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
  onNewSchedule,
  onSelectPlan,
  showDemoPrompt = false,
  liveDemoUrl = "",
  onDismissDemo = () => {},
  onRunDemo = () => {},
}) {
  const [hideBalance, setHideBalance] = useState(false);

  const nextPlan = plans[0] || null;
  const isVerifyingWallet = wallet.status === "loading" || wallet.status === "opening-wallet";
  const visibleBalances = balances.filter((item) => item.raw && item.raw !== 0n);
  const usdcBalance = visibleBalances.find((b) => b.key === "usdc");
  const primaryAmount = usdcBalance?.formatted ?? visibleBalances[0]?.formatted ?? "0.00";
  const walletShort = formatWalletAddress(wallet.address);

  const heroSub = isWalletVerified
    ? wallet.isReadOnly
      ? `${walletShort} — connect wallet app to sign.`
      : nextPlan
        ? `Next: ${nextPlan.amount} ${nextPlan.asset} → ${nextPlan.recipient} · ${getTimingLabel(nextPlan)}`
        : `${walletShort} · no active schedules`
    : "";

  const connectLabel = wallet.needsMobileWallet
    ? "Connect mobile wallet"
    : !wallet.hasProvider
      ? "Connect browser wallet"
      : isVerifyingWallet
        ? "Verifying wallet…"
        : "Verify wallet";

  const connectHelp = wallet.needsMobileWallet
    ? "Choose MetaMask Mobile or MiniPay"
    : !wallet.hasProvider
      ? "Install or enable MetaMask"
      : walletStatusLabel;

  return (
    <div className="screen plan-screen">

      {/* ── HERO ────────────────────────────────────────────────────── */}
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

      {/* ── QUICK ACTIONS ───────────────────────────────────────────── */}
      {isWalletVerified ? (
        <div className="home-quick-actions" aria-label="Quick actions">
          <button type="button" className="quick-action" onClick={onSendNow}>
            <span className="quick-action-icon"><CircleDollarSign size={22} /></span>
            <span>Send</span>
          </button>
          <button type="button" className="quick-action" onClick={onNewSchedule}>
            <span className="quick-action-icon"><CalendarDays size={22} /></span>
            <span>Schedule</span>
          </button>
          <button type="button" className="quick-action" onClick={onPlans}>
            <span className="quick-action-icon"><List size={22} /></span>
            <span>Plans</span>
          </button>
          <button type="button" className="quick-action" onClick={onHistory}>
            <span className="quick-action-icon"><Clock size={22} /></span>
            <span>History</span>
          </button>
        </div>
      ) : (
        <button
          className="home-start-action verify-action"
          type="button"
          disabled={isVerifyingWallet}
          onClick={onVerifyWallet}
        >
          <span className="home-start-icon"><ShieldCheck size={20} /></span>
          <span>
            <b>{connectLabel}</b>
            <small>{connectHelp}</small>
          </span>
        </button>
      )}

      {/* ── WALLET ASSETS + SCHEDULED PLANS ─────────────────────────── */}
      {isWalletVerified && (
        <section className="home-list" aria-label="Wallet overview">
          <div className="section-heading">
            <span>Wallet assets</span>
            {visibleBalances.length > 1 && (
              <small className="section-count">{visibleBalances.length} assets</small>
            )}
          </div>

          {visibleBalances.length > 0 ? (
            <div className="balance-chips">
              {visibleBalances.map((item) => (
                <div className="balance-chip" key={item.key}>
                  <b>{hideBalance ? "••" : item.formatted}</b>
                  <span>{item.label}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-inline">No supported balances in this wallet yet.</div>
          )}

          {plans.length > 0 && (
            <>
              <div className="section-heading secondary-heading">
                <span>Scheduled transfers</span>
                {plans.length > 1 && (
                  <small className="section-count">{plans.length} active</small>
                )}
              </div>
              {plans.slice(0, 3).map((item) => (
                <button
                  className="plan-row compact-row"
                  type="button"
                  key={item.id}
                  onClick={() => onSelectPlan(item.id)}
                >
                  <div className="plan-row-icon"><ChocoMark size="tiny" /></div>
                  <div>
                    <b>{item.recipient}</b>
                    <span>{item.amount} {item.asset} · {getTimingLabel(item)}</span>
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
