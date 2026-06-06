import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowLeft,
  ArrowRight,
  Bell,
  CalendarDays,
  Check,
  CircleDollarSign,
  History,
  ListChecks,
  MessageCircleQuestionMark,
  Mic,
  Pencil,
  Plus,
  ReceiptText,
  RefreshCw,
  Share2,
  ShieldCheck,
  Trash2,
  Wallet,
  X,
} from "lucide-react";
import "./styles.css";

const SPLASH_DURATION_MS = 2600;
const DEMO_STEP_MS = 6000;
const WORLD_MAP_URL = "https://upload.wikimedia.org/wikipedia/commons/5/51/BlankMap-Equirectangular.svg";

const defaultPlan = {
  id: "mom-monthly",
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
  status: "Active",
  phone: "+254 7xx xxx 214",
  schedule: "Every 1st - 9:00 AM",
};

const defaultTransaction = {
  id: "tx-july-1",
  planId: defaultPlan.id,
  recipient: defaultPlan.recipient,
  amount: defaultPlan.amount,
  asset: defaultPlan.asset,
  payAsset: defaultPlan.payAsset,
  schedule: defaultPlan.schedule,
  date: "July 1",
  status: "Filed",
  hash: defaultPlan.hash,
  routeEstimate: defaultPlan.routeEstimate,
  type: "Scheduled transfer",
};

function buildPlanFromCommand(commandText, basePlan = defaultPlan) {
  const text = commandText.toLowerCase();
  const recipient = text.includes("sister")
    ? "Sister"
    : text.includes("aunt")
      ? "Auntie"
      : text.includes("dad")
        ? "Dad"
        : "Mom";
  const amount = text.includes("75")
    ? "75,000"
    : text.includes("25")
      ? "25,000"
      : text.includes("20")
        ? "20,000"
        : "50,000";
  const day = text.includes("15") ? "15th" : text.includes("monday") ? "Monday" : "1st";
  const schedule = day === "Monday" ? "Every Monday - 9:00 AM" : `Every ${day} - 9:00 AM`;
  const nextDate = day === "15th" ? "July 15" : day === "Monday" ? "Next Monday" : "July 1";
  const routeEstimate = {
    "20,000": "$154.57 USDC",
    "25,000": "$193.21 USDC",
    "50,000": "$386.42 USDC",
    "75,000": "$579.63 USDC",
  }[amount];

  return {
    ...basePlan,
    amount,
    recipient,
    schedule,
    nextDate,
    routeEstimate,
    status: "Active",
  };
}

function buildTransactionFromPlan(plan, type = "Plan confirmed") {
  return {
    id: `tx-${Date.now()}`,
    planId: plan.id,
    recipient: plan.recipient,
    amount: plan.amount,
    asset: plan.asset,
    payAsset: plan.payAsset,
    schedule: plan.schedule,
    date: "Today",
    status: "Filed",
    hash: plan.hash,
    routeEstimate: plan.routeEstimate,
    type,
  };
}

function shouldShowDemoPrompt() {
  return true;
}

function rememberDemoChoice() {
  try {
    window.localStorage.setItem("choco-demo-seen", "yes");
  } catch {
    // Local storage is optional in embedded browsers.
  }
}

const demoSteps = [
  {
    title: "Home is your plan list",
    copy: "Tap a saved plan to open details. No command is required just to review.",
  },
  {
    title: "Plans is for management",
    copy: "Create new schedules here, or choose an active plan to update.",
  },
  {
    title: "Details shows control",
    copy: "See route, schedule, retries, and edit or delete the selected plan.",
  },
  {
    title: "History keeps receipts",
    copy: "Select a transaction to review proof before sharing anything.",
  },
  {
    title: "Share only what matters",
    copy: "Choose recipient, amount, schedule, or onchain hash before sharing.",
  },
];

const DEMO_TOTAL_SECONDS = Math.round((demoSteps.length * DEMO_STEP_MS) / 1000);

function formatDemoTime(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

const infoPanels = {
  future: {
    eyebrow: "Future development",
    title: "More corridors, more channels",
    copy: "Choco lives in Mini Apps now. The next layer is social chat access and another remittance corridor.",
    items: ["UK to NGN corridor", "WhatsApp, Telegram, Messenger", "Recipient status alerts"],
    Icon: Bell,
  },
  support: {
    eyebrow: "Support",
    title: "Help with a plan",
    copy: "Use this when a transfer, receipt, or schedule needs a quick explanation before you continue.",
    items: ["Plan setup guidance", "Receipt and hash review", "Wallet and route checks"],
    Icon: MessageCircleQuestionMark,
  },
};

function App() {
  const [screen, setScreen] = useState("splash");
  const [command, setCommand] = useState("send my mum 50k KES every 1st");
  const [voiceState, setVoiceState] = useState("Text or voice");
  const [runStep, setRunStep] = useState(0);
  const [demoStep, setDemoStep] = useState(0);
  const [demoElapsedSeconds, setDemoElapsedSeconds] = useState(0);
  const [plans, setPlans] = useState([defaultPlan]);
  const [transactions, setTransactions] = useState([defaultTransaction]);
  const [selectedPlanId, setSelectedPlanId] = useState(defaultPlan.id);
  const [selectedTransactionId, setSelectedTransactionId] = useState(defaultTransaction.id);
  const [reviewMode, setReviewMode] = useState("create");
  const [showDemoPrompt, setShowDemoPrompt] = useState(shouldShowDemoPrompt);
  const [activeInfoPanel, setActiveInfoPanel] = useState(null);

  const activePlan = useMemo(
    () => plans.find((item) => item.id === selectedPlanId) || plans[0] || null,
    [plans, selectedPlanId],
  );
  const previewPlan = useMemo(
    () => buildPlanFromCommand(command, activePlan || defaultPlan),
    [activePlan, command],
  );
  const activeTransaction = useMemo(
    () => transactions.find((item) => item.id === selectedTransactionId) || transactions[0] || null,
    [selectedTransactionId, transactions],
  );
  useEffect(() => {
    if (screen !== "splash") return undefined;
    const timer = window.setTimeout(() => setScreen("pitch"), SPLASH_DURATION_MS);
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

  useEffect(() => {
    if (screen !== "demoTour") return undefined;
    setDemoStep(0);
    setDemoElapsedSeconds(0);
    return undefined;
  }, [screen]);

  useEffect(() => {
    if (screen !== "demoTour") return undefined;
    const timer = window.setInterval(() => {
      setDemoElapsedSeconds((seconds) => seconds + 1);
    }, 1000);

    return () => window.clearInterval(timer);
  }, [screen]);

  useEffect(() => {
    if (screen !== "demoTour") return undefined;
    const timer = window.setTimeout(() => {
      if (demoStep === demoSteps.length - 1) {
        setScreen("plan");
        return;
      }

      setDemoStep((currentStep) => Math.min(currentStep + 1, demoSteps.length - 1));
    }, DEMO_STEP_MS);

    return () => window.clearTimeout(timer);
  }, [demoStep, screen]);

  function captureVoice() {
    setVoiceState("Voice captured");
    window.setTimeout(() => setVoiceState("Text or voice"), 1400);
  }

  function dismissDemoPrompt() {
    setShowDemoPrompt(false);
  }

  function skipDemoPrompt() {
    rememberDemoChoice();
    setShowDemoPrompt(false);
  }

  function runDemo() {
    skipDemoPrompt();
    setReviewMode("demo");
    setCommand("send my mum 50k KES every 1st");
    setDemoStep(0);
    setDemoElapsedSeconds(0);
    setScreen("demoTour");
  }

  function openNewPlan() {
    setReviewMode("create");
    setCommand("send my mum 50k KES every 1st");
    setScreen("planEditor");
  }

  function openEditPlan() {
    const targetPlan = activePlan || defaultPlan;
    setReviewMode("update");
    setCommand(`change ${targetPlan.recipient}'s plan to 75k KES every 15th`);
    setScreen("planEditor");
  }

  function buildPlan() {
    setScreen("processing");
  }

  function nextDemoStep() {
    setDemoStep((currentStep) => Math.min(currentStep + 1, demoSteps.length - 1));
  }

  function previousDemoStep() {
    setDemoStep((currentStep) => Math.max(currentStep - 1, 0));
  }

  function finishDemo() {
    setScreen("plan");
  }

  function confirmPlan() {
    let committedPlan;

    if (reviewMode === "update" && activePlan) {
      committedPlan = {
        ...activePlan,
        ...previewPlan,
        id: activePlan.id,
        hash: "0x43b2...celo-sepolia-309",
      };
      setPlans((items) => items.map((item) => (item.id === activePlan.id ? committedPlan : item)));
    } else {
      committedPlan = {
        ...previewPlan,
        id: `plan-${Date.now()}`,
        hash: "0x8f34...celo-sepolia-309",
      };
      setPlans((items) => [committedPlan, ...items]);
    }

    setSelectedPlanId(committedPlan.id);
    const transaction = buildTransactionFromPlan(
      committedPlan,
      reviewMode === "update" ? "Plan updated" : "Plan confirmed",
    );
    setTransactions((items) => [transaction, ...items]);
    setSelectedTransactionId(transaction.id);
    setScreen("history");
  }

  function confirmDeletePlan() {
    if (!activePlan) {
      setScreen("plans");
      return;
    }

    const remainingPlans = plans.filter((item) => item.id !== activePlan.id);
    setPlans(remainingPlans);
    setSelectedPlanId(remainingPlans[0]?.id || "");
    setScreen("plans");
  }

  const screenTitle = useMemo(() => {
    if (screen === "splash") return "Choco";
    if (screen === "pitch") return "Choco";
    if (screen === "plans") return "Plans";
    if (screen === "planDetail") return "Details";
    if (screen === "history") return "History";
    if (screen === "receiptDetail") return "Receipt";
    if (screen === "planEditor") return reviewMode === "update" ? "Edit plan" : "New plan";
    if (screen === "deletePlan") return "Delete";
    if (screen === "demoTour") return "Demo";
    if (screen === "processing") return "Planning";
    if (screen === "review") return "Quote";
    return "Home";
  }, [reviewMode, screen]);

  return (
    <main className="stage">
      <img className="map-preload" src={WORLD_MAP_URL} alt="" aria-hidden="true" />
      <section className="miniapp" aria-label="Choco Mini App">
        <StatusBar />
        <div className="topbar">
          <button className="icon-button" type="button" aria-label="Back to home" onClick={() => setScreen("plan")}>
            <X size={34} strokeWidth={2.4} />
          </button>
          <div className="app-title">{screenTitle}</div>
          <div className="topbar-actions" aria-label="Feature and support shortcuts">
            <button
              className="header-icon future"
              type="button"
              aria-label="Future development"
              title="Future development"
              onClick={() => setActiveInfoPanel("future")}
            >
              <Bell size={21} strokeWidth={2.4} />
            </button>
            <button
              className="header-icon"
              type="button"
              aria-label="Support"
              title="Support"
              onClick={() => setActiveInfoPanel("support")}
            >
              <MessageCircleQuestionMark size={22} strokeWidth={2.4} />
            </button>
          </div>
        </div>

        <div className={`app-panel tone-${screen}`}>
          {screen === "splash" && <SplashScreen onStart={() => setScreen("pitch")} />}
          {screen === "pitch" && <PitchScreen onClose={() => setScreen("plan")} />}
          {screen === "plan" && (
            <PlanScreen
              plans={plans}
              showDemoPrompt={showDemoPrompt}
              onPlans={() => setScreen("plans")}
              onHistory={() => setScreen("history")}
              onSelectPlan={(planId) => {
                setSelectedPlanId(planId);
                setScreen("planDetail");
              }}
              onRunDemo={runDemo}
              onSkipDemo={skipDemoPrompt}
              onCloseDemo={dismissDemoPrompt}
            />
          )}
          {screen === "demoTour" && (
            <DemoTourScreen
              step={demoStep}
              elapsedSeconds={demoElapsedSeconds}
              onSkip={() => setScreen("plan")}
              onPrevious={previousDemoStep}
              onNext={nextDemoStep}
              onFinish={finishDemo}
            />
          )}
          {screen === "plans" && (
            <PlansScreen
              plans={plans}
              onHome={() => setScreen("plan")}
              onHistory={() => setScreen("history")}
              onNewPlan={openNewPlan}
              onSelectPlan={(planId) => {
                setSelectedPlanId(planId);
                setScreen("planDetail");
              }}
            />
          )}
          {screen === "planDetail" && activePlan && (
            <PlanDetailScreen
              plan={activePlan}
              onHome={() => setScreen("plan")}
              onHistory={() => setScreen("history")}
              onBack={() => setScreen("plans")}
              onEdit={openEditPlan}
              onDelete={() => setScreen("deletePlan")}
            />
          )}
          {screen === "history" && (
            <HistoryScreen
              transactions={transactions}
              onHome={() => setScreen("plan")}
              onPlans={() => setScreen("plans")}
              onSelectTransaction={(transactionId) => {
                setSelectedTransactionId(transactionId);
                setScreen("receiptDetail");
              }}
            />
          )}
          {screen === "receiptDetail" && activeTransaction && (
            <ReceiptDetailScreen
              transaction={activeTransaction}
              onBack={() => setScreen("history")}
              onHome={() => setScreen("plan")}
              onPlans={() => setScreen("plans")}
            />
          )}
          {screen === "planEditor" && (
            <PlanEditorScreen
              mode={reviewMode}
              command={command}
              setCommand={setCommand}
              voiceState={voiceState}
              onVoice={captureVoice}
              onCancel={() => setScreen(reviewMode === "update" ? "planDetail" : "plans")}
              onBuild={buildPlan}
            />
          )}
          {screen === "deletePlan" && activePlan && (
            <DeletePlanScreen plan={activePlan} onCancel={() => setScreen("planDetail")} onDelete={confirmDeletePlan} />
          )}
          {screen === "processing" && <ProcessingScreen step={runStep} plan={previewPlan} command={command} />}
          {screen === "review" && (
            <ReviewScreen
              plan={previewPlan}
              mode={reviewMode}
              onEdit={() => setScreen(reviewMode === "update" ? "planEditor" : "plan")}
              onConfirm={confirmPlan}
            />
          )}
          {activeInfoPanel && (
            <QuickInfoPanel type={activeInfoPanel} onClose={() => setActiveInfoPanel(null)} />
          )}
        </div>
      </section>

      <ProjectPanel setScreen={setScreen} />
    </main>
  );
}

function QuickInfoPanel({ type, onClose }) {
  const panel = infoPanels[type] || infoPanels.support;
  const Icon = panel.Icon;

  return (
    <div className="quick-info-overlay" role="dialog" aria-label={panel.title}>
      <section className="quick-info-card">
        <div className="quick-info-head">
          <div className="quick-info-icon"><Icon size={22} strokeWidth={2.4} /></div>
          <div>
            <span>{panel.eyebrow}</span>
            <h2>{panel.title}</h2>
          </div>
          <button type="button" aria-label="Close" onClick={onClose}><X size={18} strokeWidth={3} /></button>
        </div>
        <p>{panel.copy}</p>
        <div className="quick-info-list">
          {panel.items.map((item) => (
            <div key={item}>
              <Check size={15} />
              <span>{item}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
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

function PitchScreen({ onClose }) {
  return (
    <div className="screen pitch-screen">
      <button className="pitch-close" type="button" aria-label="Close intro" onClick={onClose}>
        <X size={18} strokeWidth={3} />
      </button>

      <section className="pitch-visual" aria-label="USA to Kenya remittance">
        <div className="mobile-world">
          <div className="globe-core" aria-hidden="true">
            <svg className="world-map" viewBox="0 0 360 180" role="img" aria-label="World map with USA and Kenya highlighted">
              <image
                className="map-base"
                href={WORLD_MAP_URL}
                x="0"
                y="0"
                width="360"
                height="180"
                preserveAspectRatio="xMidYMid meet"
              />
              <g className="map-country-label usa-map-label">
                <circle cx="82" cy="51" r="2.6" />
                <text x="86" y="49">USA</text>
              </g>
              <g className="map-country-label kenya-map-label">
                <circle cx="218" cy="90" r="2.6" />
                <text x="222" y="88">Kenya</text>
              </g>
            </svg>
          </div>

          <div className="route-person sender-person" aria-hidden="true">
            <svg className="person-svg sender-silhouette" viewBox="0 0 56 56" role="img">
              <g className="afro-hair">
                <circle cx="17" cy="20" r="9" />
                <circle cx="24" cy="13" r="10" />
                <circle cx="35" cy="13" r="10" />
                <circle cx="42" cy="22" r="9" />
                <circle cx="29" cy="23" r="13" />
              </g>
              <circle className="person-fill" cx="29" cy="27" r="9" />
              <path className="person-mouth" d="M36 29 C39 29 40 31 37 33" />
              <path className="person-fill" d="M13 54 C15 42 21 36 29 36 C37 36 43 42 45 54 Z" />
              <path className="person-cut" d="M24 30 C27 32 31 32 34 30" />
              <path className="voice-mark" d="M45 22 C49 26 50 31 49 36" />
            </svg>
          </div>

          <div className="route-person recipient-person" aria-hidden="true">
            <svg className="person-svg recipient-silhouette" viewBox="0 0 64 72" role="img">
              <path
                className="person-hair"
                d="M32 5 C45 5 54 16 53 31 C52 43 58 50 55 64 L43 64 C39 52 40 41 44 32 C39 38 36 51 34 68 L20 68 C18 52 14 42 11 33 C8 18 18 5 32 5 Z"
              />
              <circle className="person-fill" cx="32" cy="25" r="9" />
              <path className="person-fill" d="M17 68 C19 53 25 45 32 45 C39 45 45 53 47 68 Z" />
              <path className="person-cut" d="M27 29 C30 31 34 31 37 29" />
            </svg>
          </div>

          <div className="transfer-bundle" aria-hidden="true">
            <span className="choco-dollar-token">
              <ChocoMark size="tiny" />
              <span>$</span>
            </span>
            <span className="typing-bubble travel-chat"><span /><span /><span /></span>
          </div>
        </div>
      </section>

      <section className="pitch-copy">
        <span>Voice remittance</span>
        <h1>Send USA to Kenya by voice.</h1>
        <p>Create the plan once. Choco sends every month, retries failures, notifies family, and saves receipts.</p>
      </section>

      <button className="primary-cta" type="button" onClick={onClose}>Continue</button>
    </div>
  );
}

function PlanScreen({
  plans,
  showDemoPrompt,
  onPlans,
  onHistory,
  onSelectPlan,
  onRunDemo,
  onSkipDemo,
  onCloseDemo,
}) {
  const nextPlan = plans[0] || defaultPlan;

  return (
    <div className="screen plan-screen">
      <div className="home-hero">
        <div className="home-actions">
          <button type="button" aria-label="Profile"><ChocoMark size="tiny" /></button>
          <span className="home-title-pill">Choco</span>
          <button type="button" aria-label="Support"><ShieldCheck size={20} /></button>
        </div>
        <div className="balance-copy">
          <span>Next transfer</span>
          <strong>{nextPlan.amount}</strong>
          <p>{nextPlan.asset} to {nextPlan.recipient} - {nextPlan.schedule}</p>
        </div>
      </div>

      <section className="home-list" aria-label="Home plan list">
        <div className="section-heading">
          <span>Active plans</span>
          <button type="button" onClick={onPlans}>Manage</button>
        </div>

        {plans.map((item) => (
          <button className="plan-row" type="button" key={item.id} onClick={() => onSelectPlan(item.id)}>
            <div className="plan-row-icon"><ChocoMark size="tiny" /></div>
            <div>
              <b>{item.recipient}</b>
              <span>{item.amount} {item.asset} - {item.schedule}</span>
            </div>
            <small>{item.status}</small>
          </button>
        ))}
      </section>

      <BottomNav active="home" onHome={() => {}} onPlans={onPlans} onHistory={onHistory} />
      {showDemoPrompt && <DemoPrompt onRunDemo={onRunDemo} onSkipDemo={onSkipDemo} onCloseDemo={onCloseDemo} />}
    </div>
  );
}

function DemoPrompt({ onRunDemo, onSkipDemo, onCloseDemo }) {
  return (
    <div className="demo-overlay" role="dialog" aria-label="Choco demo">
      <div className="demo-card">
        <button className="demo-close" type="button" aria-label="Close demo" onClick={onCloseDemo}>
          <X size={18} strokeWidth={3} />
        </button>
        <ChocoMark size="small" />
        <h2>Try Choco in {DEMO_TOTAL_SECONDS} seconds</h2>
        <p>A guided tour shows home, plans, details, history, and sharing. Skip anytime.</p>
        <div className="demo-actions">
          <button type="button" onClick={onRunDemo}>Run demo</button>
          <button type="button" onClick={onSkipDemo}>Skip</button>
        </div>
      </div>
    </div>
  );
}

function DemoTourScreen({ step, elapsedSeconds, onSkip, onPrevious, onNext, onFinish }) {
  const currentStep = demoSteps[step];
  const isLastStep = step === demoSteps.length - 1;
  const progress = `${((step + 1) / demoSteps.length) * 100}%`;

  return (
    <div className="screen demo-tour-screen">
      <div className="demo-tour-top">
        <div>
          <span>{DEMO_TOTAL_SECONDS} second tour</span>
          <time dateTime={`PT${elapsedSeconds}S`}>{formatDemoTime(elapsedSeconds)} spent</time>
        </div>
        <button type="button" onClick={onSkip}>Skip</button>
      </div>

      <div className="demo-progress" aria-label="Demo progress">
        <span style={{ width: progress }} />
      </div>

      <div className="demo-step-controls" aria-label="Demo step controls">
        <button
          className="demo-square-button"
          type="button"
          aria-label="Previous demo step"
          disabled={step === 0}
          onClick={onPrevious}
        >
          <ArrowLeft size={18} />
        </button>
        <span>{step + 1}/{demoSteps.length}</span>
        <button
          className="demo-square-button"
          type="button"
          aria-label={isLastStep ? "Finish demo" : "Next demo step"}
          onClick={isLastStep ? onFinish : onNext}
        >
          <ArrowRight size={18} />
        </button>
      </div>

      <section className="demo-tour-card">
        <span>Step {step + 1} of {demoSteps.length}</span>
        <h2>{currentStep.title}</h2>
        <p>{currentStep.copy}</p>
        <DemoVisual step={step} />
      </section>

      <div className="demo-tour-actions">
        <button className="secondary-dark" type="button" onClick={onSkip}>Skip demo</button>
        <button className="primary-cta" type="button" onClick={isLastStep ? onFinish : onNext}>
          {isLastStep ? "Finish demo" : "Next"}
        </button>
      </div>
    </div>
  );
}

function DemoVisual({ step }) {
  if (step === 0) {
    return (
      <div className="demo-visual saved-plan">
        <div className="plan-row-icon"><ChocoMark size="tiny" /></div>
        <div><b>Mom</b><span>50,000 KESm - Every 1st</span></div>
        <small>Active</small>
      </div>
    );
  }

  if (step === 1) {
    return (
      <div className="demo-visual plans-preview">
        <button type="button"><Plus size={18} />New plan</button>
        <button type="button"><ListChecks size={18} />All active plans</button>
      </div>
    );
  }

  if (step === 2) {
    return (
      <div className="demo-visual details-preview">
        <SummaryCard label="Route" value="USDC to KESm" />
        <SummaryCard label="Retry" value="3 attempts" />
        <SummaryCard label="Schedule" value="Every 1st" />
        <SummaryCard label="Receipt" value="Onchain" />
      </div>
    );
  }

  if (step === 3) {
    return (
      <div className="demo-visual history-preview">
        <div className="receipt-icon"><ReceiptText size={18} /></div>
        <div><b>Mom</b><span>50,000 KESm - Plan confirmed</span></div>
        <small>Today</small>
      </div>
    );
  }

  if (step === 4) {
    return (
      <div className="demo-visual share-preview">
        <label><Check size={16} />Recipient</label>
        <label><Check size={16} />Amount</label>
        <label>Schedule</label>
        <label>Hash</label>
      </div>
    );
  }

  return (
    <div className="demo-visual saved-plan" />
  );
}

function PlansScreen({ plans, onSelectPlan, onNewPlan, onHome, onHistory }) {
  return (
    <div className="screen plans-screen">
      <div className="layer-heading">
        <div>
          <span>Manage</span>
          <h2>Plans</h2>
        </div>
        <button type="button" onClick={onNewPlan}><Plus size={18} />New</button>
      </div>

      {plans.length > 0 ? (
        <div className="plans-list" aria-label="Plans list">
          {plans.map((item) => (
            <button className="plan-row" type="button" key={item.id} onClick={() => onSelectPlan(item.id)}>
              <div className="plan-row-icon"><ChocoMark size="tiny" /></div>
              <div>
                <b>{item.recipient}</b>
                <span>{item.amount} {item.asset} - {item.schedule}</span>
              </div>
              <small>{item.status}</small>
            </button>
          ))}
        </div>
      ) : (
        <div className="empty-plans">
          <ChocoMark size="small" />
          <h2>No plans yet</h2>
          <p>Create one with a text or voice instruction. Choco will show a quote before anything is activated.</p>
          <button type="button" onClick={onNewPlan}>New plan</button>
        </div>
      )}

      <BottomNav active="plans" onHome={onHome} onPlans={() => {}} onHistory={onHistory} />
    </div>
  );
}

function HistoryScreen({ transactions, onSelectTransaction, onHome, onPlans }) {
  return (
    <div className="screen history-screen">
      <div className="layer-heading">
        <div>
          <span>Receipts</span>
          <h2>History</h2>
        </div>
      </div>

      <div className="history-list" aria-label="Transaction history">
        {transactions.map((item) => (
          <button className="transaction-row" type="button" key={item.id} onClick={() => onSelectTransaction(item.id)}>
            <div className="receipt-icon"><ReceiptText size={18} /></div>
            <div>
              <b>{item.recipient}</b>
              <span>{item.amount} {item.asset} - {item.type}</span>
            </div>
            <small>{item.date}</small>
          </button>
        ))}
      </div>

      <BottomNav active="history" onHome={onHome} onPlans={onPlans} onHistory={() => {}} />
    </div>
  );
}

function ReceiptDetailScreen({ transaction, onBack, onHome, onPlans }) {
  const shareItems = [
    { id: "recipient", label: "Recipient", value: transaction.recipient },
    { id: "amount", label: "Amount", value: `${transaction.amount} ${transaction.asset}` },
    { id: "schedule", label: "Schedule", value: transaction.schedule },
    { id: "status", label: "Status", value: transaction.status },
    { id: "hash", label: "Onchain hash", value: transaction.hash },
  ];
  const [selectedFields, setSelectedFields] = useState(["recipient", "amount", "status"]);

  function toggleField(fieldId) {
    setSelectedFields((items) => (
      items.includes(fieldId) ? items.filter((item) => item !== fieldId) : [...items, fieldId]
    ));
  }

  return (
    <div className="screen receipt-detail-screen">
      <section className="receipt-detail-card">
        <div className="sheet-top">
          <div className="sheet-icon success"><ReceiptText size={24} /></div>
          <h2>Receipt details</h2>
          <span className="sheet-chip">{transaction.status}</span>
        </div>

        <div className="receipt-card">
          <ReceiptRow icon={<Check size={18} />} label="Status" value={transaction.status} />
          <ReceiptRow icon={<CalendarDays size={18} />} label="Schedule" value={transaction.schedule} />
          <ReceiptRow icon={<CircleDollarSign size={18} />} label="Amount" value={`${transaction.amount} ${transaction.asset}`} />
          <ReceiptRow icon={<ReceiptText size={18} />} label="Receipt hash" value={transaction.hash} mono />
        </div>

        <div className="share-panel">
          <div className="section-heading">
            <span>Share fields</span>
            <small>{selectedFields.length} selected</small>
          </div>
          {shareItems.map((item) => (
            <label className="share-option" key={item.id}>
              <input
                type="checkbox"
                checked={selectedFields.includes(item.id)}
                onChange={() => toggleField(item.id)}
              />
              <span>{item.label}</span>
              <b>{item.value}</b>
            </label>
          ))}
        </div>

        <button className="primary-cta" type="button"><Share2 size={18} />Share selected</button>
        <button className="secondary-dark" type="button" onClick={onBack}>Back to history</button>
      </section>

      <BottomNav active="history" onHome={onHome} onPlans={onPlans} onHistory={onBack} />
    </div>
  );
}

function PlanDetailScreen({ plan, onHome, onHistory, onBack, onEdit, onDelete }) {
  return (
    <div className="screen details-screen">
      <section className="asset-card compact" aria-label="Plan summary">
        <div className="asset-row">
          <div className="asset-icon"><ChocoMark size="small" /></div>
          <div>
            <h2>{plan.recipient}</h2>
            <p>{plan.routeEstimate} - {plan.fee} network fee</p>
          </div>
          <span className="status-chip">{plan.status}</span>
        </div>

        <div className="pay-row">
          <Wallet size={26} strokeWidth={2.5} />
          <strong>{plan.amount} {plan.asset}</strong>
          <span>{plan.nextDate}</span>
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
        <SummaryTile label="Schedule" value={plan.schedule} />
        <SummaryTile label="Receipt" value="Onchain" />
      </div>

      <div className="plan-actions">
        <button type="button" onClick={onEdit}><Pencil size={18} />Edit</button>
        <button className="danger-action" type="button" onClick={onDelete}><Trash2 size={18} />Delete</button>
      </div>

      <button className="secondary-dark" type="button" onClick={onBack}>Back to plans</button>
      <BottomNav active="plans" onHome={onHome} onPlans={onBack} onHistory={onHistory} />
    </div>
  );
}

function PlanEditorScreen({ mode, command, setCommand, voiceState, onVoice, onCancel, onBuild }) {
  const title = mode === "update" ? "Describe the update" : "Describe the transfer";

  return (
    <div className="screen editor-screen">
      <section className="editor-card">
        <ChocoMark size="small" />
        <div>
          <span>{mode === "update" ? "Edit plan" : "New plan"}</span>
          <h2>{title}</h2>
          <p>Use text or voice. You will review the quote before anything is saved.</p>
        </div>
      </section>

      <section className="composer" aria-label="Command composer">
        <div className="composer-label">
          <span>{voiceState}</span>
          <span></span>
        </div>
        <div className="composer-box">
          <input value={command} onChange={(event) => setCommand(event.target.value)} aria-label="Plan instruction" />
          <button className="pill-button" type="button" aria-label="Record voice command" onClick={onVoice}>
            <Mic size={20} strokeWidth={2.6} />
          </button>
          <button className="pill-button send" type="button" aria-label="Review quote" onClick={onBuild}>
            <ArrowRight size={24} strokeWidth={3} />
          </button>
        </div>
      </section>

      <button className="primary-cta" type="button" onClick={onBuild}>
        {mode === "update" ? "Review update" : "Review quote"}
      </button>
      <button className="secondary-dark" type="button" onClick={onCancel}>Cancel</button>
    </div>
  );
}

function DeletePlanScreen({ plan, onCancel, onDelete }) {
  return (
    <LightSheet>
      <div className="sheet-top">
        <div className="sheet-icon"><Trash2 size={24} /></div>
        <h2>Delete this plan?</h2>
      </div>

      <div className="notice">
        {plan.recipient} will no longer have the {plan.amount} {plan.asset} scheduled transfer in this Mini App demo.
      </div>

      <button className="danger-cta" type="button" onClick={onDelete}>Delete plan</button>
      <button className="secondary-cta" type="button" onClick={onCancel}>Keep plan</button>
    </LightSheet>
  );
}

function ProcessingScreen({ step, plan, command }) {
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

        <div className="agent-bubble user">{command}</div>

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

function ReviewScreen({ plan, mode, onEdit, onConfirm }) {
  const chip = mode === "update" ? "UPDATE" : mode === "demo" ? "DEMO" : "NEW";

  return (
    <LightSheet>
      <div className="sheet-top">
        <div className="sheet-icon"><ChocoMark size="small" /></div>
        <h2>Choco monthly plan</h2>
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
          <small>Pay on Celo</small>
        </div>
        <div className="route-arrow"><ArrowRight size={22} /></div>
        <div className="route-node">
          <b>{plan.asset}</b>
          <small>{plan.recipient} - Kenya</small>
        </div>
      </div>

      <div className="summary-grid">
        <SummaryCard label="Amount" value={`${plan.amount} ${plan.asset}`} />
        <SummaryCard label="Schedule" value={plan.schedule.replace(" - 9:00 AM", "")} />
        <SummaryCard label="Fee" value={plan.fee} />
        <SummaryCard label="Retries" value="3 attempts" />
      </div>

      <div className="notice">Choco will ask for confirmation before activating the monthly plan. No private key is stored in this Mini App.</div>

      <button className="primary-cta" type="button" onClick={onConfirm}>Confirm plan</button>
      <button className="secondary-cta" type="button" onClick={onEdit}>Edit instruction</button>
    </LightSheet>
  );
}

function BottomNav({ active, onHome, onPlans, onHistory }) {
  return (
    <nav className="bottom-nav" aria-label="Mini App navigation">
      <button className={active === "home" ? "active" : ""} type="button" onClick={onHome}><Wallet size={20} />Home</button>
      <button className={active === "plans" ? "active" : ""} type="button" onClick={onPlans}><ListChecks size={20} />Plans</button>
      <button className={active === "history" ? "active" : ""} type="button" onClick={onHistory}><History size={20} />History</button>
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
