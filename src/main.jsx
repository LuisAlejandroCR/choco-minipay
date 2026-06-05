import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowRight,
  CalendarDays,
  Check,
  CircleDollarSign,
  Mic,
  ReceiptText,
  RefreshCw,
  Send,
  ShieldCheck,
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
  const [screen, setScreen] = useState("splash");
  const [command, setCommand] = useState("send my mum 50k KES every 1st");
  const [voiceState, setVoiceState] = useState("Text or voice");
  const [runStep, setRunStep] = useState(0);

  useEffect(() => {
    if (screen !== "splash") return undefined;
    const timer = window.setTimeout(() => setScreen("plan"), 1250);
    return () => window.clearTimeout(timer);
  }, [screen]);

  useEffect(() => {
    if (screen !== "processing") return undefined;
    setRunStep(0);
    const timers = [
      window.setTimeout(() => setRunStep(1), 320),
      window.setTimeout(() => setRunStep(2), 860),
      window.setTimeout(() => setRunStep(3), 1400),
      window.setTimeout(() => setScreen("review"), 2450),
    ];
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [screen]);

  function captureVoice() {
    setVoiceState("Voice captured");
    window.setTimeout(() => setVoiceState("Text or voice"), 1400);
  }

  const screenTitle = useMemo(() => {
    if (screen === "splash") return "Choco";
    if (screen === "details") return "Plan";
    if (screen === "processing") return "Planning";
    if (screen === "receipt") return "Receipt";
    if (screen === "review") return "Quote";
    return "Home";
  }, [screen]);

  return (
    <main className="stage">
      <section className="miniapp" aria-label="Choco Mini App">
        <StatusBar />
        <div className="topbar">
          <button className="icon-button" type="button" aria-label="Back to home" onClick={() => setScreen("plan")}>
            <X size={34} strokeWidth={2.4} />
          </button>
          <div className="app-title">{screenTitle}</div>
          <button className="support" type="button">
            Support
          </button>
        </div>

        <div className={`app-panel tone-${screen}`}>
          {screen === "splash" && <SplashScreen onStart={() => setScreen("plan")} />}
          {screen === "plan" && (
            <PlanScreen
              command={command}
              setCommand={setCommand}
              voiceState={voiceState}
              onVoice={captureVoice}
              onDetails={() => setScreen("details")}
              onReview={() => setScreen("processing")}
              onReceipt={() => setScreen("receipt")}
            />
          )}
          {screen === "details" && <DetailsScreen onHome={() => setScreen("plan")} onReview={() => setScreen("processing")} onReceipt={() => setScreen("receipt")} />}
          {screen === "processing" && <ProcessingScreen step={runStep} />}
          {screen === "review" && <ReviewScreen onEdit={() => setScreen("plan")} onConfirm={() => setScreen("receipt")} />}
          {screen === "receipt" && <ReceiptScreen onHome={() => setScreen("plan")} />}
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

function ChocoMark({ size = "large" }) {
  return (
    <div className={`choco-mark ${size}`} aria-label="Choco logo">
      <span className="cacao-shadow" />
      <span className="cacao-pod" />
      <span className="cacao-ridge ridge-a" />
      <span className="cacao-ridge ridge-b" />
      <span className="cacao-ridge ridge-c" />
      <span className="cacao-nib nib-a" />
      <span className="cacao-nib nib-b" />
    </div>
  );
}

function SplashScreen({ onStart }) {
  return (
    <button className="screen splash-screen" type="button" onClick={onStart} aria-label="Open Choco">
      <ChocoMark />
      <div className="splash-footer">
        <b>Built by Choco</b>
        <span>Remittance concierge for MiniPay</span>
      </div>
    </button>
  );
}

function PlanScreen({ command, setCommand, voiceState, onVoice, onDetails, onReview, onReceipt }) {
  return (
    <div className="screen plan-screen">
      <div className="home-hero">
        <div className="home-actions">
          <button type="button" aria-label="Profile"><ChocoMark size="tiny" /></button>
          <button type="button" onClick={onDetails}>Active plan</button>
          <button type="button" aria-label="Support"><ShieldCheck size={20} /></button>
        </div>
        <div className="balance-copy">
          <span>{plan.corridor}</span>
          <strong>{plan.amount}</strong>
          <p>{plan.asset} to {plan.recipient} · {plan.schedule}</p>
        </div>
        <div className="hero-buttons">
          <button type="button" onClick={onReview}>Review quote</button>
          <button type="button" onClick={onDetails}>Details</button>
        </div>
      </div>

      <section className="composer" aria-label="Command composer">
        <div className="composer-label">
          <span>{voiceState}</span>
          <span></span>
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
        Continue
      </button>
      <BottomNav active="home" onHome={() => {}} onDetails={onDetails} onReceipt={onReceipt} />
    </div>
  );
}

function DetailsScreen({ onHome, onReview, onReceipt }) {
  return (
    <div className="screen details-screen">
      <section className="asset-card compact" aria-label="Plan summary">
        <div className="asset-row">
          <div className="asset-icon"><ChocoMark size="small" /></div>
          <div>
            <h2>Family transfer</h2>
            <p>{plan.routeEstimate} · {plan.fee} network fee</p>
          </div>
          <span className="status-chip">Ready</span>
        </div>

        <div className="pay-row">
          <Wallet size={26} strokeWidth={2.5} />
          <strong>Pay {plan.payAsset}</strong>
          <span>on Celo</span>
        </div>
      </section>

      <div className="schedule-bar" aria-label="Monthly schedule">
        <span>Now</span>
        <div className="track" />
        <span>{plan.nextDate}</span>
      </div>

      <div className="detail-grid" aria-label="Plan details">
        <SummaryTile label="Route" value={`${plan.payAsset} to ${plan.asset}`} />
        <SummaryTile label="Retry" value="3 attempts" />
        <SummaryTile label="Fee" value={plan.fee} />
        <SummaryTile label="Receipt" value="Onchain" />
      </div>

      <button className="primary-cta" type="button" onClick={onReview}>Review quote</button>
      <BottomNav active="details" onHome={onHome} onDetails={() => {}} onReceipt={onReceipt} />
    </div>
  );
}

function ProcessingScreen({ step }) {
  const feed = [
    {
      icon: <Check size={15} />,
      title: "Intent detected",
      copy: "Text or voice becomes one monthly transfer plan.",
    },
    {
      icon: <RefreshCw size={15} />,
      title: "Route prepared",
      copy: "USDC is quoted into KESm on Celo.",
    },
    {
      icon: <ReceiptText size={15} />,
      title: "Guardrails attached",
      copy: "Retries, recipient notice, and receipt are ready.",
    },
  ];

  return (
    <div className="screen processing-screen">
      <div className="agent-phone-card" aria-live="polite">
        <div className="agent-phone-head">
          <ChocoMark size="small" />
          <div>
            <span>Choco agent run</span>
            <b>Mini App</b>
          </div>
        </div>

        <div className="agent-bubble user">send my mum 50k KES every 1st</div>

        <div className={`agent-toast ${step >= 1 ? "show" : ""}`}>
          <ChocoMark size="tiny" />
          <span>Plan detected</span>
        </div>

        <div className={`agent-plan ${step >= 1 ? "lift" : ""}`}>
          <span>Monthly transfer</span>
          <strong>{plan.amount} {plan.asset}</strong>
          <small>To {plan.recipient} - {plan.schedule}</small>
        </div>

        <div className="agent-feed">
          {feed.map((item, index) => (
            <div className={`agent-line ${step > index ? "show" : ""}`} key={item.title}>
              <div className="agent-line-icon">{item.icon}</div>
              <div>
                <b>{item.title}</b>
                <span>{item.copy}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="agent-next">Opening quote review</div>
      </div>
    </div>
  );
}

function ReviewScreen({ onEdit, onConfirm }) {
  return (
    <LightSheet>
      <div className="sheet-top">
        <div className="sheet-icon"><ChocoMark size="small" /></div>
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

function ReceiptScreen({ onHome }) {
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

      <button className="primary-cta" type="button" onClick={onHome}>Return home</button>
    </LightSheet>
  );
}

function BottomNav({ active, onHome, onDetails, onReceipt }) {
  return (
    <nav className="bottom-nav" aria-label="Mini App navigation">
      <button className={active === "home" ? "active" : ""} type="button" onClick={onHome}><Wallet size={20} />Home</button>
      <button className={active === "details" ? "active" : ""} type="button" onClick={onDetails}><CalendarDays size={20} />Details</button>
      <button type="button" onClick={onReceipt}><ReceiptText size={20} />Receipt</button>
    </nav>
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

function SummaryTile({ label, value }) {
  return (
    <div className="summary-tile">
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
        <button type="button" onClick={() => setScreen("plan")}>Open app</button>
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
