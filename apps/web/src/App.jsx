import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Bell,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronUp,
  CircleDollarSign,
  ExternalLink,
  History,
  ListChecks,
  MessageCircleQuestionMark,
  Mic,
  Pencil,
  Plus,
  QrCode,
  ReceiptText,
  RefreshCw,
  Share2,
  ShieldCheck,
  Trash2,
  Wallet,
  X,
} from "lucide-react";
import {
  formatWalletAddress,
  useMiniPayWallet,
} from "./modules/wallet/useMiniPayWallet.js";

const SPLASH_DURATION_MS = 2600;
const DEMO_STEP_MS = 5000;
const WORLD_MAP_URL = "https://upload.wikimedia.org/wikipedia/commons/5/51/BlankMap-Equirectangular.svg";
const VERIFY_BASE_URL = "https://celo-sepolia.blockscout.com/tx";
const DEMO_FROM_ADDRESS = "0xb7b2...0426d";
const DEFAULT_SCHEDULED_TIMESTAMP = "07/01/2026 09:00 AM Local";

function formatLocalTimestamp(date = new Date()) {
  const timestamp = new Intl.DateTimeFormat("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(date);

  return `${timestamp.replace(",", "")} Local`;
}

function formatLocalDate(date = new Date()) {
  return new Intl.DateTimeFormat("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  }).format(date);
}

function formatHistoryDate(timestamp) {
  const datePart = String(timestamp).match(/\d{2}\/\d{2}\/\d{4}/)?.[0];
  if (!datePart) return timestamp;
  if (datePart === formatLocalDate()) return "Today";

  const [month, day] = datePart.split("/");
  return `${month}/${day}`;
}

function getMovementTimestamp(plan) {
  if (plan.deliveryMode === "now") return formatLocalTimestamp();
  if (plan.nextDate === "July 15") return "07/15/2026 09:00 AM Local";
  if (plan.nextDate === "Next Monday") return "06/15/2026 09:00 AM Local";
  return DEFAULT_SCHEDULED_TIMESTAMP;
}

const deliveryModes = {
  now: {
    label: "Now",
    detail: "One-time",
  },
  schedule: {
    label: "Schedule",
    detail: "Repeat",
  },
};

const defaultPlan = {
  id: "mom-monthly",
  amount: "50,000",
  asset: "KESm",
  corridor: "US to Kenya",
  payAsset: "USDC",
  recipient: "Mom",
  phone: "+254 7xx xxx 214",
  schedule: "Every 1st - 9:00 AM",
  nextDate: "July 1",
  fee: "0.1%",
  routeEstimate: "$386.42 USDC",
  hash: "0x8f34...celo-sepolia-309",
  status: "Active",
  phone: "+254 7xx xxx 214",
  schedule: "Every 1st - 9:00 AM",
  deliveryMode: "schedule",
};

const defaultTransaction = {
  id: "tx-july-1",
  planId: defaultPlan.id,
  recipient: defaultPlan.recipient,
  amount: defaultPlan.amount,
  asset: defaultPlan.asset,
  payAsset: defaultPlan.payAsset,
  schedule: defaultPlan.schedule,
  date: DEFAULT_SCHEDULED_TIMESTAMP,
  status: "Scheduled",
  hash: defaultPlan.hash,
  routeEstimate: defaultPlan.routeEstimate,
  type: "Scheduled run",
  deliveryMode: defaultPlan.deliveryMode,
  from: DEMO_FROM_ADDRESS,
  to: "Mom - +254 7xx xxx 214",
};

function getTimingLabel(item) {
  return item.deliveryMode === "now" ? "Send once now" : item.schedule;
}

function getPlanSignature(plan) {
  return [
    plan.recipient,
    plan.amount,
    plan.asset,
    getTimingLabel(plan),
  ].join("|").toLowerCase();
}

function getMovementSignature(item) {
  return [
    item.recipient,
    item.amount,
    item.asset,
    item.deliveryMode || "schedule",
  ].join("|").toLowerCase();
}

function getVerifyTransactionUrl(hash) {
  return `${VERIFY_BASE_URL}/${encodeURIComponent(hash)}`;
}

function findSimilarPlan(plans, candidate, excludeId = "") {
  if (!candidate || candidate.deliveryMode === "now") return null;
  const candidateSignature = getPlanSignature(candidate);
  return plans.find((plan) => plan.id !== excludeId && getPlanSignature(plan) === candidateSignature) || null;
}

function findRecentSimilarTransfer(transactions, candidate) {
  if (!candidate || candidate.deliveryMode !== "now") return null;
  const lastTransfer = transactions.find((item) => item.deliveryMode === "now");

  if (!lastTransfer) return null;

  return getMovementSignature(lastTransfer) === getMovementSignature(candidate) ? lastTransfer : null;
}

function getSimilarPlanIds(plans) {
  const groups = new Map();
  plans.forEach((plan) => {
    const signature = getPlanSignature(plan);
    groups.set(signature, [...(groups.get(signature) || []), plan.id]);
  });

  return new Set(
    [...groups.values()]
      .filter((ids) => ids.length > 1)
      .flat(),
  );
}

function formatKesAmount(value) {
  return Math.round(value).toLocaleString("en-US");
}

function parseKesAmount(text, fallbackAmount) {
  const kMatch = text.match(/(\d+(?:[.,]\d+)?)\s*k\b/i);
  if (kMatch) {
    return Number(kMatch[1].replace(",", ".")) * 1000;
  }

  const kesMatch = text.match(/(\d{4,})\s*(kes|kesm)\b/i);
  if (kesMatch) {
    return Number(kesMatch[1].replace(/,/g, ""));
  }

  return Number(String(fallbackAmount).replace(/,/g, "")) || 50000;
}

function getRouteEstimate(amountValue) {
  return `$${(amountValue / 129.39).toFixed(2)} USDC`;
}

function getTransactionStatus(plan, type) {
  if (plan.deliveryMode === "now") return "Preflight";
  if (type === "Plan updated") return "Updated";
  return "Scheduled";
}

function buildPlanFromCommand(commandText, basePlan = defaultPlan, selectedDeliveryMode = "") {
  const text = commandText.toLowerCase();
  const deliveryMode = selectedDeliveryMode || (/now|today|immediate|once/.test(text) ? "now" : "schedule");
  const recipient = text.includes("sister")
    ? "Sister"
    : text.includes("aunt")
      ? "Auntie"
      : text.includes("dad")
        ? "Dad"
        : "Mom";
  const amountValue = parseKesAmount(text, basePlan.amount);
  const amount = formatKesAmount(amountValue);
  const day = text.includes("15") ? "15th" : text.includes("monday") ? "Monday" : "1st";
  const schedule = deliveryMode === "now"
    ? "Send once now"
    : day === "Monday"
      ? "Every Monday - 9:00 AM"
      : `Every ${day} - 9:00 AM`;
  const nextDate = deliveryMode === "now"
    ? "Today"
    : day === "15th"
      ? "July 15"
      : day === "Monday"
        ? "Next Monday"
        : "July 1";
  const routeEstimate = getRouteEstimate(amountValue);

  return {
    ...basePlan,
    amount,
    recipient,
    schedule,
    nextDate,
    routeEstimate,
    status: deliveryMode === "now" ? "Ready" : "Active",
    deliveryMode,
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
    date: getMovementTimestamp(plan),
    status: getTransactionStatus(plan, type),
    hash: plan.hash,
    routeEstimate: plan.routeEstimate,
    type,
    deliveryMode: plan.deliveryMode,
    from: DEMO_FROM_ADDRESS,
    to: `${plan.recipient} - ${plan.phone || "Kenya wallet"}`,
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
    title: "Home starts the transfer",
    copy: "One entry point keeps the app simple. Voice or text can send now or schedule.",
  },
  {
    title: "Choose timing",
    copy: "Pick send now or schedule. Choco uses the same command box for both.",
  },
  {
    title: "Choco checks repeats",
    copy: "If a similar plan or send already exists, Choco asks before continuing.",
  },
  {
    title: "Plans stay light",
    copy: "Details show the essentials: amount, timing, route, retries, and actions.",
  },
  {
    title: "Movements verify proof",
    copy: "Receipts start short, then expand into QR, from, to, date, and hash.",
  },
  {
    title: "Share when needed",
    copy: "Share the receipt or open the explorer link when family asks for proof.",
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
    eyebrow: "Support first",
    title: "Support and about",
    copy: "Start here for help, review pages, and the short Choco story.",
    items: [],
    Icon: MessageCircleQuestionMark,
  },
};

export function App() {
  const [screen, setScreen] = useState("splash");
  const [command, setCommand] = useState("send my mum 50k KES every 1st");
  const [runStep, setRunStep] = useState(0);
  const [demoStep, setDemoStep] = useState(0);
  const [demoElapsedSeconds, setDemoElapsedSeconds] = useState(0);
  const [plans, setPlans] = useState([defaultPlan]);
  const [transactions, setTransactions] = useState([defaultTransaction]);
  const [selectedPlanId, setSelectedPlanId] = useState(defaultPlan.id);
  const [selectedTransactionId, setSelectedTransactionId] = useState(defaultTransaction.id);
  const [reviewMode, setReviewMode] = useState("create");
  const [deliveryMode, setDeliveryMode] = useState("schedule");
  const [showDemoPrompt, setShowDemoPrompt] = useState(shouldShowDemoPrompt);
  const [activeInfoPanel, setActiveInfoPanel] = useState(null);
  const [isContactConfirmed, setIsContactConfirmed] = useState(false);
  const [transferBlockMessage, setTransferBlockMessage] = useState("");
  const wallet = useMiniPayWallet();
  const isWalletVerified = wallet.isReady;

  const activePlan = useMemo(
    () => plans.find((item) => item.id === selectedPlanId) || plans[0] || null,
    [plans, selectedPlanId],
  );
  const previewPlan = useMemo(
    () => buildPlanFromCommand(command, activePlan || defaultPlan, deliveryMode),
    [activePlan, command, deliveryMode],
  );
  const similarPlan = useMemo(
    () => findSimilarPlan(plans, previewPlan, reviewMode === "update" ? activePlan?.id : ""),
    [activePlan, plans, previewPlan, reviewMode],
  );
  const similarTransfer = useMemo(
    () => findRecentSimilarTransfer(transactions, previewPlan),
    [previewPlan, transactions],
  );
  const duplicateAttempt = reviewMode === "update"
    ? null
    : previewPlan.deliveryMode === "now"
      ? similarTransfer
      : similarPlan;
  const activeTransaction = useMemo(
    () => transactions.find((item) => item.id === selectedTransactionId) || transactions[0] || null,
    [selectedTransactionId, transactions],
  );
  const guardedScreens = ["plans", "planDetail", "history", "receiptDetail", "planEditor", "deletePlan", "processing", "duplicateGuard", "review"];
  const visibleScreen = !isWalletVerified && guardedScreens.includes(screen) ? "walletGate" : screen;
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
      window.setTimeout(() => setScreen(duplicateAttempt ? "duplicateGuard" : "review"), 2450),
    ];
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [duplicateAttempt, screen]);

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
    setDeliveryMode("schedule");
    setCommand("send my mum 50k KES every 1st");
    setDemoStep(0);
    setDemoElapsedSeconds(0);
    setScreen("demoTour");
  }

  function openNewPlan() {
    setReviewMode("create");
    setDeliveryMode("schedule");
    setCommand("");
    setScreen("planEditor");
  }

  function openImmediateSend() {
    setReviewMode("create");
    setDeliveryMode("now");
    setCommand("");
    setScreen("planEditor");
  }

  function openEditPlan() {
    const targetPlan = activePlan || defaultPlan;
    setReviewMode("update");
    setDeliveryMode(targetPlan.deliveryMode || "schedule");
    setCommand(`change ${targetPlan.recipient}'s plan to 75k KES every 15th`);
    setScreen("planEditor");
  }

  function changeDeliveryMode(nextMode) {
    setDeliveryMode(nextMode);
    setCommand((currentCommand) => {
      if (nextMode === "now" && /every|weekly|monthly|monday|1st|15th/i.test(currentCommand)) {
        return "send my mum 50k KES now";
      }

      if (nextMode === "schedule" && /now|today|immediate|once/i.test(currentCommand)) {
        return "send my mum 50k KES every 1st";
      }

      return currentCommand;
    });
  }

  function buildPlan(nextCommand = "") {
    if (nextCommand) {
      setCommand(nextCommand);
    }
    setTransferBlockMessage("");
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

    if (previewPlan.deliveryMode === "now") {
      if (!wallet.hasTestnetGasFunds) {
        setTransferBlockMessage("Cannot send: this wallet has 0 CELO on Celo Sepolia testnet for network fees.");
        return;
      }

      setTransferBlockMessage("Testnet transfer execution is not connected yet. Choco prepared the route, but no funds were moved and no receipt was created.");
      return;
    }

    if (similarPlan) {
      setSelectedPlanId(similarPlan.id);
      setScreen("planDetail");
      return;
    }

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

  function continueDuplicateAttempt() {
    if (previewPlan.deliveryMode === "now") {
      setScreen("review");
      return;
    }

    if (similarPlan) {
      setSelectedPlanId(similarPlan.id);
      setScreen("planDetail");
      return;
    }

    setScreen("review");
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
    if (visibleScreen === "splash") return "Choco";
    if (visibleScreen === "pitch") return "Choco";
    if (visibleScreen === "plans") return "Plans";
    if (visibleScreen === "planDetail") return "Details";
    if (visibleScreen === "history") return "History";
    if (visibleScreen === "receiptDetail") return "Receipt";
    if (visibleScreen === "planEditor") return reviewMode === "update" ? "Edit plan" : deliveryMode === "now" ? "Send now" : "New schedule";
    if (visibleScreen === "deletePlan") return "Delete";
    if (visibleScreen === "demoTour") return "Demo";
    if (visibleScreen === "processing") return "Planning";
    if (visibleScreen === "duplicateGuard") return "Choco";
    if (visibleScreen === "review") return "Quote";
    if (visibleScreen === "walletGate") return "Locked";
    return "Home";
  }, [deliveryMode, reviewMode, visibleScreen]);

  return (
    <main className="stage">
      <img className="map-preload" src={WORLD_MAP_URL} alt="" aria-hidden="true" />
      <section className="miniapp" aria-label="Choco Mini App">
        <div className="topbar">
          <button className="icon-button" type="button" aria-label="Back to home" onClick={() => setScreen("plan")}>
            <X size={34} strokeWidth={2.4} />
          </button>
          <div className="app-title">{screenTitle}</div>
          <div className="topbar-actions" aria-label="Feature and support shortcuts">
            <button
              className="header-icon"
              type="button"
              aria-label="Support and about Choco"
              title="Support and about Choco"
              onClick={() => setActiveInfoPanel("support")}
            >
              <MessageCircleQuestionMark size={22} strokeWidth={2.4} />
            </button>
            <button
              className="header-icon future"
              type="button"
              aria-label="Future development"
              title="Future development"
              onClick={() => setActiveInfoPanel("future")}
            >
              <Bell size={21} strokeWidth={2.4} />
            </button>
          </div>
        </div>

        <div className={`app-panel tone-${screen}`}>
          {visibleScreen === "splash" && <SplashScreen onStart={() => setScreen("pitch")} />}
          {visibleScreen === "pitch" && <PitchScreen onClose={() => setScreen("plan")} />}
          {visibleScreen === "plan" && (
            <PlanScreen
              plans={plans}
              showDemoPrompt={showDemoPrompt}
              isWalletVerified={isWalletVerified}
              wallet={wallet}
              isContactConfirmed={isContactConfirmed}
              onVerifyWallet={wallet.verifyWallet}
              onToggleContact={() => setIsContactConfirmed((isConfirmed) => !isConfirmed)}
              onPlans={() => setScreen("plans")}
              onHistory={() => setScreen("history")}
              onSendNow={openImmediateSend}
              onSelectPlan={(planId) => {
                setSelectedPlanId(planId);
                setScreen("planDetail");
              }}
              onRunDemo={runDemo}
              onSkipDemo={skipDemoPrompt}
              onCloseDemo={dismissDemoPrompt}
            />
          )}
          {visibleScreen === "walletGate" && (
            <WalletGateScreen
              wallet={wallet}
              onVerifyWallet={wallet.verifyWallet}
              onHome={() => setScreen("plan")}
            />
          )}
          {visibleScreen === "demoTour" && (
            <DemoTourScreen
              step={demoStep}
              elapsedSeconds={demoElapsedSeconds}
              onSkip={() => setScreen("plan")}
              onPrevious={previousDemoStep}
              onNext={nextDemoStep}
              onFinish={finishDemo}
            />
          )}
          {visibleScreen === "plans" && (
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
          {visibleScreen === "planDetail" && activePlan && (
            <PlanDetailScreen
              plan={activePlan}
              onHome={() => setScreen("plan")}
              onHistory={() => setScreen("history")}
              onBack={() => setScreen("plans")}
              onEdit={openEditPlan}
              onDelete={() => setScreen("deletePlan")}
            />
          )}
          {visibleScreen === "history" && (
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
          {visibleScreen === "receiptDetail" && activeTransaction && (
            <ReceiptDetailScreen
              transaction={activeTransaction}
              onBack={() => setScreen("history")}
              onHome={() => setScreen("plan")}
              onPlans={() => setScreen("plans")}
            />
          )}
          {visibleScreen === "planEditor" && (
            <PlanEditorScreen
              mode={reviewMode}
              command={command}
              setCommand={setCommand}
              deliveryMode={deliveryMode}
              setDeliveryMode={changeDeliveryMode}
              onBuild={buildPlan}
              onHome={() => setScreen("plan")}
            />
          )}
          {visibleScreen === "deletePlan" && activePlan && (
            <DeletePlanScreen plan={activePlan} onCancel={() => setScreen("planDetail")} onDelete={confirmDeletePlan} />
          )}
          {visibleScreen === "processing" && (
            <ProcessingScreen
              step={runStep}
              plan={previewPlan}
              command={command}
              duplicateAttempt={duplicateAttempt}
            />
          )}
          {visibleScreen === "duplicateGuard" && duplicateAttempt && (
            <DuplicateGuardScreen
              plan={previewPlan}
              match={duplicateAttempt}
              onEdit={() => setScreen("planEditor")}
              onProceed={continueDuplicateAttempt}
            />
          )}
          {visibleScreen === "review" && (
            <ReviewScreen
              plan={previewPlan}
              mode={reviewMode}
              transferBlockMessage={transferBlockMessage}
              onEdit={() => setScreen("planEditor")}
              onConfirm={confirmPlan}
            />
          )}
          {activeInfoPanel && (
            <QuickInfoPanel type={activeInfoPanel} onClose={() => setActiveInfoPanel(null)} />
          )}
        </div>
      </section>
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
        {panel.items.length > 0 && (
          <div className="quick-info-list">
            {panel.items.map((item) => (
              <div key={item}>
                <Check size={15} />
                <span>{item}</span>
              </div>
            ))}
          </div>
        )}
        {type === "support" && <SupportAboutContent />}
      </section>
    </div>
  );
}

function SupportAboutContent() {
  return (
    <div className="support-about">
      <section className="about-card" aria-label="About Choco">
        <div className="agent-badge">Agent #309 - Celo Sepolia Testnet</div>
        <h3>Choco helps MiniPay users send family transfers with review, schedules, and receipts.</h3>
        <p>
          The app is production-candidate: support, privacy, terms, and stats stay close to the flow
          so reviewers can inspect the product without leaving the Choco behavior.
        </p>
      </section>

      <div className="support-link-grid" aria-label="Public review links">
        <a href="/support.html">
          <MessageCircleQuestionMark size={17} />
          Support
          <ExternalLink size={13} />
        </a>
        <a href="/privacy.html">
          <ShieldCheck size={17} />
          Privacy
          <ExternalLink size={13} />
        </a>
        <a href="/terms.html">
          <ReceiptText size={17} />
          Terms
          <ExternalLink size={13} />
        </a>
        <a href="/stats.html">
          <ListChecks size={17} />
          Stats
          <ExternalLink size={13} />
        </a>
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
              <g className="talk-mouth">
                <ellipse className="talk-mouth-open" cx="29" cy="31" rx="3.3" ry="2.2" />
                <path className="talk-mouth-line" d="M25 30 C28 32 32 32 35 30" />
              </g>
              <path className="person-fill" d="M13 54 C15 42 21 36 29 36 C37 36 43 42 45 54 Z" />
              <path className="voice-mark" d="M45 22 C49 26 50 31 49 36" />
            </svg>
          </div>

          <div className="route-person recipient-person" aria-hidden="true">
            <svg className="person-svg recipient-silhouette" viewBox="0 0 64 64" role="img">
              <circle className="recipient-badge" cx="32" cy="32" r="25" />
              <path
                className="recipient-hair-fill"
                d="M32 8 C44 8 52 17 52 30 C52 38 57 45 54 56 C49 58 44 57 40 53 C42 46 42 39 40 33 C37 37 34 39 32 39 C29 39 26 37 24 33 C22 39 22 46 24 53 C20 57 15 58 10 56 C7 45 12 38 12 30 C12 17 20 8 32 8 Z"
              />
              <ellipse className="recipient-face-fill" cx="32" cy="28" rx="9" ry="10" />
              <path className="recipient-body-fill" d="M18 57 C20 47 26 42 32 42 C38 42 44 47 46 57 Z" />
              <path className="recipient-hair-line" d="M23 28 C27 32 35 32 39 28" />
              <path className="recipient-part-line" d="M32 12 C29 18 27 22 24 25" />
            </svg>
          </div>

          <div className="transfer-bundle" aria-hidden="true">
            <span className="choco-dollar-token">
              <ChocoMark size="tiny" />
              <span>$</span>
            </span>
            <span className="voice-note travel-chat">
              <span className="voice-note-mic"><Mic size={11} strokeWidth={3} /></span>
              <span className="voice-wave">
                <span /><span /><span /><span /><span /><span /><span /><span /><span /><span />
              </span>
            </span>
          </div>
        </div>
      </section>

      <section className="pitch-copy">
        <span className="pitch-kicker">Voice remittance</span>
        <h1>
          Send USA to Kenya by{" "}
          <span className="voice-highlight">
            <span>voice</span>
            <span className="headline-wave" aria-hidden="true">
              <i /><i /><i /><i /><i />
            </span>
          </span>
          .
        </h1>
        <p className="pitch-memory">Plan once. Send now or on schedule.</p>
        <p className="pitch-support">Choco handles the rest.</p>
      </section>

      <button className="primary-cta" type="button" onClick={onClose}>Continue</button>
    </div>
  );
}

function PlanScreen({
  plans,
  showDemoPrompt,
  isWalletVerified,
  wallet,
  isContactConfirmed,
  onVerifyWallet,
  onToggleContact,
  onPlans,
  onHistory,
  onSendNow,
  onSelectPlan,
  onRunDemo,
  onSkipDemo,
  onCloseDemo,
}) {
  const nextPlan = plans[0] || defaultPlan;
  const isVerifyingWallet = wallet.status === "loading";
  const walletHelp = isWalletVerified
    ? `${formatWalletAddress(wallet.address)} - ${wallet.network.name} testnet`
    : wallet.statusLabel;
  const isReadyForTransfer = !isWalletVerified || (wallet.hasTestnetGasFunds && isContactConfirmed);
  const actionLabel = isWalletVerified
    ? isReadyForTransfer
      ? "New transfer"
      : wallet.hasTestnetGasFunds
        ? "Confirm recipient contact"
        : "Testnet funds required"
    : isVerifyingWallet
      ? "Verifying testnet wallet"
      : "Verify testnet wallet";
  const actionHelp = isWalletVerified
    ? isReadyForTransfer
      ? "Send now or schedule with voice"
      : wallet.hasTestnetGasFunds
        ? "Confirm the recipient before sending"
        : "Add Celo Sepolia testnet CELO for network fees"
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
          <span>{isWalletVerified ? "Next plan" : "Wallet access"}</span>
          <strong>{isWalletVerified ? nextPlan.amount : "Locked"}</strong>
          <p>
            {isWalletVerified
              ? `${nextPlan.asset} to ${nextPlan.recipient} - ${getTimingLabel(nextPlan)}`
              : `Verify on ${wallet.network.name} testnet to unlock transfers, plans, and receipts.`}
          </p>
        </div>
      </div>

      {isWalletVerified && (
        <ReadyChecks
          plan={nextPlan}
          wallet={wallet}
          isContactConfirmed={isContactConfirmed}
          onToggleContact={onToggleContact}
        />
      )}

      <button
        className={`home-start-action ${isWalletVerified ? "" : "verify-action"}`}
        type="button"
        disabled={(!isWalletVerified && isVerifyingWallet) || (isWalletVerified && !isReadyForTransfer)}
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

function ReadyChecks({ plan, wallet, isContactConfirmed, onToggleContact }) {
  return (
    <section className="ready-checks" aria-label="Transfer ready checks">
      <div className="section-heading">
        <span>Ready checks</span>
        <small>Before send or schedule</small>
      </div>

      <div className={`ready-check-row ${wallet.hasTestnetGasFunds ? "complete" : "blocked"}`}>
        <span className="ready-check-icon">{wallet.hasTestnetGasFunds ? <Check size={18} /> : <Wallet size={18} />}</span>
        <span>
          <b>{wallet.hasTestnetGasFunds ? "Testnet gas funds detected" : "No testnet gas funds detected"}</b>
          <small>{wallet.nativeBalanceLabel}. Add Celo Sepolia CELO before send or schedule.</small>
        </span>
      </div>

      <button
        className={`ready-check-row ${isContactConfirmed ? "complete" : ""}`}
        type="button"
        aria-pressed={isContactConfirmed}
        onClick={onToggleContact}
      >
        <span className="ready-check-icon">{isContactConfirmed ? <Check size={18} /> : <ShieldCheck size={18} />}</span>
        <span>
          <b>{isContactConfirmed ? "Recipient contact confirmed" : "Confirm recipient contact"}</b>
          <small>{plan.recipient} - {plan.phone || "recipient contact needed"}</small>
        </span>
      </button>
    </section>
  );
}

function WalletGateScreen({ wallet, onHome, onVerifyWallet }) {
  const isVerifyingWallet = wallet.status === "loading";

  return (
    <div className="screen wallet-gate-screen">
      <section className="wallet-gate-card">
        <span className="guard-icon"><ShieldCheck size={24} /></span>
        <div>
          <span>Wallet access</span>
          <div className="wallet-network-label">{wallet.network.label}</div>
          <h2>Verify testnet wallet first</h2>
          <p>Choco hides plans, movements, and receipts until the wallet is verified on Celo Sepolia testnet.</p>
          {wallet.error && <p className="wallet-error">{wallet.error}</p>}
        </div>
        <button className="primary-cta" type="button" disabled={isVerifyingWallet} onClick={onVerifyWallet}>
          {isVerifyingWallet ? "Verifying wallet" : "Verify testnet wallet"}
        </button>
        <button className="secondary-dark" type="button" onClick={onHome}>
          Back home
        </button>
      </section>
      <BottomNav active="home" onHome={onHome} onPlans={onHome} onHistory={onHome} />
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
        <p>A guided tour shows transfers, schedules, receipts, and sharing. Skip anytime.</p>
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
      <div className="demo-visual home-preview">
        <button type="button"><CircleDollarSign size={17} />New transfer<span>Voice or text</span></button>
        <div className="mini-plan-row">
          <div className="plan-row-icon"><ChocoMark size="tiny" /></div>
          <div><b>Mom </b><span>50,000 KESm - Every 1st</span></div>
          <small>Active</small>
        </div>
      </div>
    );
  }

  if (step === 1) {
    return (
      <div className="demo-visual timing-preview">
        <button className="active" type="button"><CircleDollarSign size={18} />Send now<span>One-time</span></button>
        <button type="button"><CalendarDays size={18} />Schedule<span>Repeat</span></button>
      </div>
    );
  }

  if (step === 2) {
    return (
      <div className="demo-visual duplicate-preview">
        <div className="agent-toast show">
          <ChocoMark size="tiny" />
          <span>Choco Agent AI</span>
        </div>
        <p>Similar plan already exists for Mom. Open it instead of creating a duplicate.</p>
      </div>
    );
  }

  if (step === 3) {
    return (
      <div className="demo-visual details-preview">
        <div className="mini-plan-row">
          <div className="plan-row-icon"><ChocoMark size="tiny" /></div>
          <div><b>Mom </b><span>50,000 KESm</span></div>
          <small>Active</small>
        </div>
        <DetailLine label="Timing" value="Every 1st" />
        <DetailLine label="Route" value="USDC to KESm" />
      </div>
    );
  }

  if (step === 4) {
    return (
      <div className="demo-visual verify-preview">
        <div className="mini-qr" aria-hidden="true">
          <span /><span /><span /><span /><span /><span /><span /><span /><span />
        </div>
        <div>
          <b>Verify receipt</b>
          <span>QR + explorer link</span>
        </div>
      </div>
    );
  }

  if (step === 5) {
    return (
      <div className="demo-visual share-preview">
        <label><Share2 size={16} />Share receipt</label>
        <label><ExternalLink size={16} />Open explorer</label>
      </div>
    );
  }

  return (
    <div className="demo-visual saved-plan" />
  );
}

function PlansScreen({ plans, onSelectPlan, onNewPlan, onHome, onHistory }) {
  const similarPlanIds = getSimilarPlanIds(plans);

  return (
    <div className="screen plans-screen">
      <div className="layer-heading">
        <div>
          <span>Manage</span>
          <h2>Plans</h2>
        </div>
        <button type="button" onClick={onNewPlan}><Plus size={18} />Schedule</button>
      </div>

      {plans.length > 0 ? (
        <>
          {similarPlanIds.size > 0 && (
            <div className="plan-alert">
              <Check size={16} />
              <span>Similar plan already exists. Review before scheduling again.</span>
            </div>
          )}
          <div className="plans-list" aria-label="Plans list">
            {plans.map((item) => {
              const isSimilar = similarPlanIds.has(item.id);

              return (
                <button className="plan-row" type="button" key={item.id} onClick={() => onSelectPlan(item.id)}>
                  <div className="plan-row-icon"><ChocoMark size="tiny" /></div>
                  <div>
                    <b>{item.recipient}</b>
                    <span>{item.amount} {item.asset} - {getTimingLabel(item)}</span>
                  </div>
                  <small className={isSimilar ? "warning" : ""}>{isSimilar ? "Similar" : item.status}</small>
                </button>
              );
            })}
          </div>
        </>
      ) : (
        <div className="empty-plans">
          <ChocoMark size="small" />
          <h2>No plans yet</h2>
          <p>Create a scheduled transfer with text or voice. One-time sends stay in history.</p>
          <button type="button" onClick={onNewPlan}>Schedule transfer</button>
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
          <h2>Movements</h2>
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
            <small>{formatHistoryDate(item.date)}</small>
          </button>
        ))}
      </div>

      <BottomNav active="history" onHome={onHome} onPlans={onPlans} onHistory={() => {}} />
    </div>
  );
}

function ReceiptDetailScreen({ transaction, onBack, onHome, onPlans }) {
  const [shareState, setShareState] = useState("");
  const [showVerification, setShowVerification] = useState(false);
  const verifyUrl = getVerifyTransactionUrl(transaction.hash);
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=132x132&margin=0&data=${encodeURIComponent(verifyUrl)}`;
  const shareText = [
    `Choco receipt: ${transaction.amount} ${transaction.asset} to ${transaction.recipient}`,
    `Timing: ${getTimingLabel(transaction)}`,
    `Status: ${transaction.status}`,
    `From: ${transaction.from}`,
    `To: ${transaction.to}`,
    `Hash: ${transaction.hash}`,
    `Verify: ${verifyUrl}`,
  ].join("\n");

  async function shareMovement() {
    try {
      if (navigator.share) {
        await navigator.share({ title: "Choco movement receipt", text: shareText });
        setShareState("Shared");
        return;
      }

      await navigator.clipboard?.writeText(shareText);
      setShareState("Copied");
    } catch {
      setShareState("Ready");
    }
  }

  return (
    <div className="screen receipt-detail-screen">
      <section className="receipt-detail-card">
        <div className="sheet-top">
          <div className="sheet-icon success"><ReceiptText size={24} /></div>
          <h2>Movement details</h2>
          <span className="sheet-chip">{transaction.status}</span>
        </div>

        <div className="receipt-card">
          <ReceiptRow icon={<Check size={18} />} label="Status" value={transaction.status} />
          <ReceiptRow icon={<CircleDollarSign size={18} />} label="Amount" value={`${transaction.amount} ${transaction.asset}`} />
          <ReceiptRow icon={<CalendarDays size={18} />} label="Timing" value={getTimingLabel(transaction)} />
        </div>

        <button
          className="receipt-expand"
          type="button"
          onClick={() => setShowVerification((isOpen) => !isOpen)}
          aria-expanded={showVerification}
        >
          <span><QrCode size={18} />Verification</span>
          {showVerification ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </button>

        {showVerification && (
          <section className="verify-panel" aria-label="Transaction verification">
            <div className="qr-card">
              <img src={qrUrl} alt="QR code to verify transaction" />
              <a href={verifyUrl} target="_blank" rel="noreferrer">
                Click here to verify transaction
                <ExternalLink size={15} />
              </a>
            </div>
            <div className="verify-list">
              <ReceiptRow icon={<Wallet size={18} />} label="From" value={transaction.from} mono />
              <ReceiptRow icon={<Check size={18} />} label="To" value={transaction.to} />
              <ReceiptRow icon={<CalendarDays size={18} />} label="Date" value={transaction.date} />
              <ReceiptRow icon={<ReceiptText size={18} />} label="Hash" value={transaction.hash} mono />
            </div>
          </section>
        )}

        <button className="primary-cta" type="button" onClick={shareMovement}>
          <Share2 size={18} />
          {shareState ? `${shareState} receipt` : "Share receipt"}
        </button>
        <button className="secondary-dark" type="button" onClick={onBack}>Back to movements</button>
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
            <p>{plan.amount} {plan.asset}</p>
          </div>
          <span className="status-chip">{plan.status}</span>
        </div>

        <div className="plan-timing-row">
          <CalendarDays size={21} strokeWidth={2.5} />
          <strong>{getTimingLabel(plan)}</strong>
        </div>
      </section>

      <div className="detail-list" aria-label="Plan details">
        <DetailLine label="Route" value={`${plan.payAsset} to ${plan.asset}`} />
        <DetailLine label="Retries" value="3 attempts if a transfer fails" />
      </div>

      <div className="plan-actions">
        <button type="button" onClick={onEdit}><Pencil size={18} />Edit</button>
        <button className="danger-action" type="button" onClick={onDelete}><Trash2 size={18} />Delete</button>
      </div>

      <button className="secondary-dark" type="button" onClick={onHome}>Back home</button>
      <BottomNav active="plans" onHome={onHome} onPlans={onBack} onHistory={onHistory} />
    </div>
  );
}

function PlanEditorScreen({
  mode,
  command,
  setCommand,
  deliveryMode,
  setDeliveryMode,
  onBuild,
  onHome,
}) {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const hasText = command.trim().length > 0;
  const title = mode === "update"
    ? "Update plan"
    : deliveryMode === "now"
      ? "Send money"
      : "Schedule transfer";
  const voiceTranscript = deliveryMode === "now"
    ? "send my mum 50k KES now"
    : "send my mum 50k KES every 1st";

  useEffect(() => {
    if (!isRecording || isPaused) return undefined;

    const timer = window.setInterval(() => {
      setRecordingSeconds((seconds) => seconds + 1);
    }, 1000);

    return () => window.clearInterval(timer);
  }, [isPaused, isRecording]);

  function startRecording() {
    setRecordingSeconds(0);
    setIsPaused(false);
    setIsRecording(true);
  }

  function cancelRecording() {
    setIsRecording(false);
    setIsPaused(false);
    setRecordingSeconds(0);
  }

  function submitRecording() {
    setIsRecording(false);
    setIsPaused(false);
    setRecordingSeconds(0);
    onBuild(voiceTranscript);
  }

  function submitComposer() {
    if (hasText) {
      onBuild();
      return;
    }

    startRecording();
  }

  return (
    <div className="screen editor-screen">
      <section className="editor-card">
        <ChocoMark size="small" />
        <div>
          <span>{mode === "update" ? "Edit plan" : "New transfer"}</span>
          <h2>{title}</h2>
          <p>Tell Choco with text or voice.</p>
        </div>
      </section>

      <section className="timing-choice" aria-label="Transfer timing">
        <span className="timing-label">When?</span>
        <div className="timing-toggle">
          {Object.entries(deliveryModes).map(([modeId, item]) => (
            <button
              className={deliveryMode === modeId ? "active" : ""}
              type="button"
              key={modeId}
              onClick={() => setDeliveryMode(modeId)}
            >
              {modeId === "now" ? <CircleDollarSign size={19} /> : <CalendarDays size={19} />}
              <span>{item.label}</span>
              <small>{item.detail}</small>
            </button>
          ))}
        </div>
      </section>

      <section className="composer" aria-label="Command composer">
        {isRecording ? (
          <div className="voice-recorder" aria-live="polite">
            <button className="recorder-delete" type="button" aria-label="Discard recording" onClick={cancelRecording}>
              <Trash2 size={18} />
            </button>
            <span className={`record-dot ${isPaused ? "paused" : ""}`} />
            <time dateTime={`PT${recordingSeconds}S`}>{formatDemoTime(recordingSeconds)}</time>
            <div className={`recorder-wave ${isPaused ? "paused" : ""}`} aria-hidden="true">
              <span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span />
            </div>
            <button
              className={`pause-mark ${isPaused ? "paused" : ""}`}
              type="button"
              aria-label={isPaused ? "Resume recording" : "Pause recording"}
              onClick={() => setIsPaused((paused) => !paused)}
            >
              <i /><i />
            </button>
            <button className="recorder-send" type="button" aria-label="Use voice note" onClick={submitRecording}>
              <ArrowRight size={24} strokeWidth={3} />
            </button>
          </div>
        ) : (
          <div className="composer-box">
            <input
              value={command}
              onChange={(event) => setCommand(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && hasText) onBuild();
              }}
              placeholder="Type a message"
              aria-label="Transfer instruction"
            />
            <button
              className={`composer-action ${hasText ? "send" : "mic"}`}
              type="button"
              aria-label={hasText ? "Review transfer" : "Record voice command"}
              onClick={submitComposer}
            >
              {hasText ? <ArrowRight size={24} strokeWidth={3} /> : <Mic size={20} strokeWidth={2.6} />}
            </button>
          </div>
        )}
      </section>

      {mode !== "update" && (
        <button className="secondary-dark editor-home-button" type="button" onClick={onHome}>Back home</button>
      )}
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

function ProcessingScreen({ step, plan, command, duplicateAttempt }) {
  const isSendNow = plan.deliveryMode === "now";
  const feed = [
    {
      icon: <Check size={15} />,
      title: "Intent detected",
      copy: isSendNow ? "Text or voice becomes a one-time transfer." : "Text or voice becomes a scheduled transfer plan.",
    },
    {
      icon: <RefreshCw size={15} />,
      title: "Route prepared",
      copy: "USDC is quoted into KESm on Celo.",
    },
    {
      icon: <ReceiptText size={15} />,
      title: "Guardrails checked",
      copy: duplicateAttempt ? "Choco found a similar movement to review." : "No similar movement was found.",
    },
  ];

  return (
    <div className="screen processing-screen">
      <div className="agent-phone-card" aria-live="polite">
        <div className="agent-phone-head">
          <ChocoMark size="small" />
          <div>
            <span>Choco Agent AI run</span>
            <b>Mini App</b>
          </div>
        </div>

        <div className="agent-bubble user">{command}</div>

        <div className={`agent-toast ${step >= 1 ? "show" : ""}`}>
          <ChocoMark size="tiny" />
          <span>{isSendNow ? "Send-now intent" : "Schedule detected"}</span>
        </div>

        <div className={`agent-plan ${step >= 1 ? "lift" : ""}`}>
          <span>{isSendNow ? "Send once now" : "Scheduled transfer"}</span>
          <strong>{plan.amount} {plan.asset}</strong>
          <small>To {plan.recipient} - {getTimingLabel(plan)}</small>
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

        <div className="agent-next">{duplicateAttempt ? "Opening Choco guardrail" : "Opening quote review"}</div>
      </div>
    </div>
  );
}

function DuplicateGuardScreen({ plan, match, onEdit, onProceed }) {
  const isSendNow = plan.deliveryMode === "now";

  return (
    <div className="screen duplicate-guard-screen">
      <section className="agent-guard-card">
        <div className="agent-phone-head">
          <ChocoMark size="small" />
          <div>
            <span>Choco Agent AI</span>
            <b>Repeat check</b>
          </div>
        </div>

        <div className="agent-bubble choco">
          {isSendNow
            ? `Similar transfer found for ${plan.recipient}. You already sent ${match.amount} ${match.asset} on ${match.date}.`
            : `Similar plan already exists for ${plan.recipient}. Open it instead of creating a duplicate.`}
        </div>

        <div className="guard-summary">
          <span>{isSendNow ? "Last send" : "Existing plan"}</span>
          <strong>{match.amount} {match.asset}</strong>
          <small>{getTimingLabel(match)}</small>
        </div>

        <button className="primary-cta" type="button" onClick={onProceed}>
          {isSendNow ? "Send again" : "Open existing plan"}
        </button>
        <button className="secondary-dark" type="button" onClick={onEdit}>Edit instruction</button>
      </section>
    </div>
  );
}

function ReviewScreen({ plan, mode, transferBlockMessage, onEdit, onConfirm }) {
  const isSendNow = plan.deliveryMode === "now";
  const chip = isSendNow ? "SEND NOW" : mode === "update" ? "UPDATE" : mode === "demo" ? "DEMO" : "NEW";

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
        <SummaryCard label="Timing" value={isSendNow ? "Send once now" : plan.schedule.replace(" - 9:00 AM", "")} />
        <SummaryCard label="Fee" value={plan.fee} />
        <SummaryCard label="Retries" value="3 attempts" />
      </div>

      <div className="notice">
        {isSendNow
          ? "Choco will run a testnet preflight. It will not mark funds sent until a real on-chain transaction succeeds."
          : "Choco will ask for confirmation before activating the schedule."}
      </div>

      {transferBlockMessage && <div className="notice danger">{transferBlockMessage}</div>}

      <button className="primary-cta" type="button" onClick={onConfirm}>
        {isSendNow ? "Run testnet preflight" : "Confirm schedule"}
      </button>
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

function DetailLine({ label, value }) {
  return (
    <div className="detail-line">
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
