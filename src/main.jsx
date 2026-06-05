import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowRight,
  CalendarDays,
  Check,
  ChevronRight,
  CircleDollarSign,
  Headphones,
  Mic,
  ReceiptText,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
  Wallet,
  X,
} from "lucide-react";
import "./styles.css";

const plan = {
  amount: "50,000",
  asset: "KESm",
  corridor: "US to Kenya",
  payAsset: "USDC",
  recipient: "Mom",
  phone: "+254 7•• ••• 214",
  schedule: "Every 1st · 9:00 AM",
  nextDate: "July 1",
  fee: "0.1%",
  routeEstimate: "$386.42 USDC",
  hash: "0x8f34...celo-sepolia-309",
};

function App() {
  const [screen, setScreen] = useState("intro");
  const [command, setCommand] = useState("send my mum 50k KES every 1st");
  const [voiceState, setVoiceState] = useState("Text or voice");

  useEffect(() => {
    if (screen !== "processing") return undefined;
    const timer = window.setTimeout(() => setScreen("review"), 1400);
    return () => window.clearTimeout(timer);
  }, [screen]);

  function captureVoice() {
    setVoiceState("Voice captured");
    window.setTimeout(() => setVoiceState("Text or voice"), 1400);
  }

  const screenTitle = useMemo(() => {
    if (screen === "intro") return "Choco";
    if (screen === "processing") return "Planning";
    if (screen === "receipt") return "Receipt";
    return "Send KES";
  }, [screen]);

  return (
    <main className="stage">
      <section className="miniapp" aria-label="Choco Mini App">
        <StatusBar />
        <div className="topbar">
          <button className="icon-button" type="button" aria-label="Back to start" onClick={() => setScreen("intro")}>
            <X size={34} strokeWidth={2.4} />
          </button>
          <div className="app-title">{screenTitle}</div>
          <button className="support" type="button">
            Support
          </button>
        </div>

        <div className={`app-panel tone-${screen}`}>
          {screen === "intro" && <IntroScreen onStart={() => setScreen("plan")} />}
          {screen === "plan" && (
            <PlanScreen
              command={command}
              setCommand={setCommand}
              voiceState={voiceState}
              onVoice={captureVoice}
              onReview={() => setScreen("processing")}
              onReceipt={() => setScreen("receipt")}
            />
          )}
          {screen === "processing" && <ProcessingScreen />}
          {screen === "review" && <ReviewScreen onEdit={() => setScreen("plan")} onConfirm={() => setScreen("receipt")} />}
          {screen === "receipt" && <ReceiptScreen onNewPlan={() => setScreen("plan")} />}
        </div>
      </section>

      <ProjectPanel setScreen={setScreen} />
    </main>
  );
}

function StatusBar() {
  return (
    <div className="statusbar">
      <span>9:41</span>
      <div className="status-icons" aria-hidden="true">
        <div className="signal">
          <span />
          <span />
          <span />
          <span />
        </div>
        <div className="wifi" />
        <div className="battery" />
      </div>
    </div>
  );
}

function IntroScreen({ onStart }) {
  return (
    <div className="screen intro-screen">
      <div className="intro-copy">
        <div className="eyebrow">Mini App remittance concierge</div>
        <h1>Send home without repeating yourself</h1>
        <p>Tell Choco once by text or voice. It plans the USDC to KESm transfer, retries failures, and files the receipt.</p>
      </div>

      <ChocoWalletArt />

      <button className="primary-cta" type="button" onClick={onStart}>
        Let's go
      </button>
    </div>
  );
}

function ChocoWalletArt() {
  return (
    <div className="choco-art" aria-hidden="true">
      <div className="coin small" />
      <div className="coin medium" />
      <div className="coin big">C</div>
      <Sparkles className="spark spark-one" size={48} strokeWidth={2.8} />
      <Sparkles className="spark spark-two" size={38} strokeWidth={2.8} />
      <div className="wallet-art">
        <Send className="wallet-plane" size={32} strokeWidth={3} />
        <div className="wallet-label">Mini<br />Pay</div>
        <div className="wallet-dot" />
      </div>
    </div>
  );
}

function PlanScreen({ command, setCommand, voiceState, onVoice, onReview, onReceipt }) {
  return (
    <div className="screen plan-screen">
      <div className="promo-banner">
        <b>Plan 50k KES for Mom</b>
        <span>{plan.corridor} · monthly on the 1st</span>
      </div>

      <div className="segmented" role="tablist" aria-label="Choco app sections">
        <button className="active" type="button">Plan</button>
        <button type="button" onClick={onReview}>Quote</button>
        <button type="button" onClick={onReceipt}>Receipt</button>
      </div>

      <section className="asset-card" aria-label="Remittance plan">
        <div className="asset-row">
          <div className="asset-icon"><Wallet size={26} strokeWidth={2.7} /></div>
          <div>
            <h2>Family transfer</h2>
            <p>{plan.routeEstimate} · {plan.fee} fee</p>
          </div>
          <span className="status-chip">Ready</span>
        </div>

        <div className="amount-block">
          <strong>{plan.amount}</strong>
          <span>{plan.asset} for {plan.recipient}</span>
        </div>

        <div className="pay-row">
          <CircleDollarSign size={28} strokeWidth={2.5} />
          <strong>Pay {plan.payAsset}</strong>
          <span>on Celo</span>
        </div>
      </section>

      <div className="schedule-bar" aria-label="Monthly schedule">
        <span>Now</span>
        <div className="track" />
        <span>{plan.nextDate}</span>
      </div>

      <section className="composer" aria-label="Command composer">
        <div className="composer-label">
          <span>{voiceState}</span>
          <span>v1</span>
        </div>
        <div className="composer-box">
          <input value={command} onChange={(event) => setCommand(event.target.value)} aria-label="Remittance instruction" />
          <button className="pill-button" type="button" aria-label="Record voice command" onClick={onVoice}>
            <Mic size={20} strokeWidth={2.6} />
          </button>
          <button className="pill-button send" type="button" aria-label="Send instruction" onClick={onReview}>
            <ArrowRight size={24} strokeWidth={3} />
          </button>
        </div>
      </section>

      <button className="primary-cta" type="button" onClick={onReview}>
        Review plan
      </button>
      <p className="microcopy">Text and voice are included in the first version. Choco lives inside Mini Apps for now.</p>
    </div>
  );
}

function ProcessingScreen() {
  return (
    <div className="screen processing-screen">
      <div className="spinner" aria-hidden="true" />
      <div className="loader-logo" aria-hidden="true">
        <span />
      </div>
      <div className="processing-copy">
        <h2>Choco is building your plan</h2>
        <p>Parsing the instruction, quoting USDC to KESm, and preparing the monthly execution.</p>
      </div>
      <div className="steps" aria-live="polite">
        <div className="step"><Check size={15} />Text or voice intent detected</div>
        <div className="step"><RefreshCw size={15} />USDC to KESm route prepared</div>
        <div className="step"><ReceiptText size={15} />Receipt and retry policy attached</div>
      </div>
    </div>
  );
}

function ReviewScreen({ onEdit, onConfirm }) {
  return (
    <LightSheet>
      <div className="sheet-top">
        <div className="sheet-icon"><ShieldCheck size={27} strokeWidth={2.6} /></div>
        <h2>Choco monthly plan</h2>
        <span className="sheet-chip">NEW</span>
      </div>

      <div className="sheet-tabs">
        <span className="active">Overview</span>
        <span>Confirm</span>
        <span>Receipt</span>
      </div>

      <div className="route-card">
        <div className="route-node">
          <b>{plan.payAsset}</b>
          <small>Pay on Celo</small>
        </div>
        <div className="route-arrow"><ArrowRight size={22} /></div>
        <div className="route-node">
          <b>{plan.asset}</b>
          <small>{plan.recipient} · Kenya</small>
        </div>
      </div>

      <div className="summary-grid">
        <SummaryCard label="Amount" value={`${plan.amount} ${plan.asset}`} />
        <SummaryCard label="Schedule" value="Every 1st" />
        <SummaryCard label="Fee" value={plan.fee} />
        <SummaryCard label="Retries" value="3 attempts" />
      </div>

      <div className="notice">Choco will ask for confirmation before activating the monthly plan. No private key is stored in this Mini App.</div>

      <button className="primary-cta" type="button" onClick={onConfirm}>Confirm plan</button>
      <button className="secondary-cta" type="button" onClick={onEdit}>Edit instruction</button>
    </LightSheet>
  );
}

function ReceiptScreen({ onNewPlan }) {
  return (
    <LightSheet>
      <div className="sheet-top">
        <div className="sheet-icon success"><Check size={27} strokeWidth={3} /></div>
        <h2>Receipt ready</h2>
        <span className="sheet-chip">TESTNET</span>
      </div>

      <div className="receipt-card">
        <ReceiptRow icon={<Check size={18} />} label="Status" value="Monthly plan active" />
        <ReceiptRow icon={<CalendarDays size={18} />} label="Schedule" value={plan.schedule} />
        <ReceiptRow icon={<CircleDollarSign size={18} />} label="Amount" value={`${plan.amount} ${plan.asset}`} />
        <ReceiptRow icon={<ReceiptText size={18} />} label="Receipt hash" value={plan.hash} mono />
        <ReceiptRow icon={<Send size={18} />} label="Recipient notice" value={`${plan.recipient} gets transfer status and proof`} />
      </div>

      <div className="notice future">Future development: add UK to NGN and expand beyond Mini Apps into WhatsApp, Telegram, Facebook Messenger, and related social messaging networks.</div>

      <button className="primary-cta" type="button" onClick={onNewPlan}>Create another plan</button>
    </LightSheet>
  );
}

function LightSheet({ children }) {
  return <div className="screen light-sheet">{children}</div>;
}

function SummaryCard({ label, value }) {
  return (
    <div className="summary-card">
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}

function ReceiptRow({ icon, label, value, mono = false }) {
  return (
    <div className="receipt-row">
      <div className="receipt-icon">{icon}</div>
      <div>
        <span>{label}</span>
        <b className={mono ? "hash" : undefined}>{value}</b>
      </div>
    </div>
  );
}

function ProjectPanel({ setScreen }) {
  return (
    <aside className="project-panel" aria-label="Project summary">
      <div className="agent-badge">Agent #309 · Celo Sepolia</div>
      <h1>Remittance concierge for MiniPay.</h1>
      <p>
        A diaspora user sends one text or voice command. Choco turns it into a scheduled USDC to KESm
        family transfer, retries failures, notifies the recipient, and files a receipt.
      </p>

      <div className="scope-grid">
        <InfoCard title="First version" text="Mini Apps only, text and voice commands, US to Kenya, one monthly scheduled action." />
        <InfoCard title="Corridor" text="USDC in, KESm out, with a clear quote, fee, schedule, and receipt before activation." />
        <InfoCard title="Agent behavior" text="Parse intent, prepare route, execute on the 1st, retry on failure, and keep visible status." />
        <InfoCard title="Future" text="UK to NGN plus WhatsApp, Telegram, Facebook Messenger, and related social messaging networks." />
      </div>

      <div className="panel-actions">
        <button type="button" onClick={() => setScreen("plan")}>Open app flow</button>
        <a href="https://testnet.8004scan.io/agents/celo-sepolia/309" target="_blank" rel="noreferrer">Registry</a>
      </div>
    </aside>
  );
}

function InfoCard({ title, text }) {
  return (
    <div className="info-card">
      <b>{title}</b>
      <span>{text}</span>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
