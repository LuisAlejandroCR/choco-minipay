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
import { ChocoMark } from "./components/ChocoMark.jsx";
import { DemoVisual } from "./components/DemoVisual.jsx";
import { PitchScreen } from "./components/PitchScreen.jsx";
import { QrCanvas } from "./components/QrCode.jsx";
import {
  DEMO_STEP_MS,
  DEMO_TOTAL_SECONDS,
  demoPromptContent,
  demoSteps,
} from "./content/demoFlow.js";
import {
  infoPanels,
  publicReviewLinks,
  supportAboutContent,
} from "./content/reviewLinks.js";
import { formatKesAmount } from "@core/domain/amounts.js";
import { parseTransferIntent } from "@core/domain/intent.js";
import {
  API_BASE_URL,
  INITIAL_SCREEN,
  KES_PER_USDC,
  LIVE_DEMO_URL,
  SHOW_DEMO_PROMPT,
  WORLD_MAP_URL,
  getVerifyTransactionUrl,
} from "./config/runtime.js";
import {
  DEFAULT_COMMANDS,
  TESTNET_SCENARIO,
  defaultPlan,
  defaultTransaction,
  formatRouteEstimate,
  getNextDateForIntent,
  getScenarioTimestamp,
  getScheduleLabelForIntent,
} from "./data/testnetScenario.js";

const SPLASH_DURATION_MS = 2600;

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
  return getScenarioTimestamp(plan.nextDate);
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

function getTimingLabel(item) {
  return item.deliveryMode === "now" ? "Send once now" : item.schedule;
}

function getRecipientContactLabel(plan) {
  return plan.recipientContact || plan.recipient;
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

function getTransactionStatus(plan, type) {
  if (plan.deliveryMode === "now") return "Preflight";
  if (type === "Plan updated") return "Updated";
  return "Scheduled";
}

function buildPlanFromCommand(commandText, basePlan = defaultPlan, selectedDeliveryMode = "") {
  const intent = parseTransferIntent(commandText, {
    deliveryMode: selectedDeliveryMode,
    fallbackAmount: basePlan.amount,
    sourceAsset: basePlan.payAsset,
    destinationAsset: basePlan.asset,
    corridor: basePlan.corridor,
    kesPerUsdc: KES_PER_USDC,
  });

  return {
    ...basePlan,
    amount: formatKesAmount(intent.amountMinor),
    recipient: intent.recipientAlias,
    schedule: getScheduleLabelForIntent(intent),
    nextDate: getNextDateForIntent(intent),
    routeEstimate: formatRouteEstimate(intent.amountMinor, intent.sourceAsset, KES_PER_USDC),
    status: intent.deliveryMode === "now" ? "Ready" : "Active",
    deliveryMode: intent.deliveryMode,
  };
}

function buildTransactionFromPlan(plan, type = "Plan confirmed", fromAddress = "") {
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
    from: fromAddress || TESTNET_SCENARIO.senderAddress,
    to: getRecipientContactLabel(plan),
  };
}

function shouldShowDemoPrompt() {
  return SHOW_DEMO_PROMPT;
}

function rememberDemoChoice() {
  try {
    window.localStorage.setItem("choco-demo-seen", "yes");
  } catch {
    // Local storage is optional in embedded browsers.
  }
}

function formatDemoTime(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

const infoPanelIcons = {
  future: Bell,
  support: MessageCircleQuestionMark,
};

const publicReviewIcons = {
  external: ExternalLink,
  privacy: ShieldCheck,
  stats: ListChecks,
  support: MessageCircleQuestionMark,
  terms: ReceiptText,
};

function getPublicReviewHref(link) {
  return link.href === "live-demo" ? LIVE_DEMO_URL : link.href;
}

export function App() {
  const [screen, setScreen] = useState(INITIAL_SCREEN);
  const [command, setCommand] = useState(DEFAULT_COMMANDS.schedule);
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
  const [agentPreflight, setAgentPreflight] = useState(null);
  const [agentPreflightStatus, setAgentPreflightStatus] = useState("idle");
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
    setCommand(DEFAULT_COMMANDS.schedule);
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

  function startWalletVerification() {
    if (!wallet.hasProvider) {
      setScreen("walletGate");
      return;
    }

    void wallet.verifyWallet();
  }

  function openEditPlan() {
    const targetPlan = activePlan || defaultPlan;
    setReviewMode("update");
    setDeliveryMode(targetPlan.deliveryMode || "schedule");
    setCommand(DEFAULT_COMMANDS.edit(targetPlan.recipient));
    setScreen("planEditor");
  }

  function changeDeliveryMode(nextMode) {
    setDeliveryMode(nextMode);
    setCommand((currentCommand) => {
      if (nextMode === "now" && /every|weekly|monthly|monday|1st|15th/i.test(currentCommand)) {
        return DEFAULT_COMMANDS.now;
      }

      if (nextMode === "schedule" && /now|today|immediate|once/i.test(currentCommand)) {
        return DEFAULT_COMMANDS.schedule;
      }

      return currentCommand;
    });
  }

  function buildPlan(nextCommand = "") {
    const commandForBuild = nextCommand || command;
    if (nextCommand) {
      setCommand(nextCommand);
    }
    setAgentPreflight(null);
    setAgentPreflightStatus("idle");
    setTransferBlockMessage("");
    void runAgentPreflight(buildPlanFromCommand(commandForBuild, activePlan || defaultPlan, deliveryMode));
    setScreen("processing");
  }

  async function runAgentPreflight(plan = activePlan || defaultPlan) {
    if (!wallet.address) {
      setAgentPreflight({
        agent: "Choco Agent AI",
        status: "blocked",
        ok: false,
        summary: `Connect a ${wallet.network.name} testnet wallet before checking readiness.`,
        checks: [],
      });
      return;
    }

    setAgentPreflightStatus("loading");
    setTransferBlockMessage("");

    try {
      const response = await fetch(`${API_BASE_URL}/v1/agent/preflight`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          walletAddress: wallet.address,
          chainId: wallet.chainId,
          recipientContact: getRecipientContactLabel(plan),
          payAsset: plan.payAsset,
          amount: plan.routeEstimate,
        }),
      });
      const result = await response.json();
      setAgentPreflight(result);
      setAgentPreflightStatus("idle");
    } catch {
      setAgentPreflight({
        agent: "Choco Agent AI",
        status: "blocked",
        ok: false,
        summary: "Wallet check is unavailable right now. Try again before sending.",
        checks: [],
      });
      setAgentPreflightStatus("idle");
    }
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

    if (!agentPreflight?.ok) {
      setTransferBlockMessage("Choco needs a completed wallet check before creating a testnet transfer or schedule.");
      return;
    }

    if (previewPlan.deliveryMode === "now") {
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
        hash: TESTNET_SCENARIO.hashes.updated,
      };
      setPlans((items) => items.map((item) => (item.id === activePlan.id ? committedPlan : item)));
    } else {
      committedPlan = {
        ...previewPlan,
        id: `plan-${Date.now()}`,
        hash: TESTNET_SCENARIO.hashes.default,
      };
      setPlans((items) => [committedPlan, ...items]);
    }

    setSelectedPlanId(committedPlan.id);
    const transaction = buildTransactionFromPlan(
      committedPlan,
      reviewMode === "update" ? "Plan updated" : "Plan confirmed",
      wallet.address,
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
              onVerifyWallet={startWalletVerification}
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
              agentPreflight={agentPreflight}
              agentPreflightStatus={agentPreflightStatus}
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
  const Icon = infoPanelIcons[panel.icon] || MessageCircleQuestionMark;

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
      <section className="about-card" aria-label={supportAboutContent.label}>
        <div className="agent-badge">{supportAboutContent.badge}</div>
        <h3>{supportAboutContent.title}</h3>
        <p>{supportAboutContent.copy}</p>
      </section>

      <div className="support-link-grid" aria-label="Public review links">
        {publicReviewLinks.map((link) => {
          const Icon = publicReviewIcons[link.icon] || ExternalLink;
          const externalProps = link.external ? { target: "_blank", rel: "noreferrer" } : {};

          return (
            <a key={link.id} href={getPublicReviewHref(link)} {...externalProps}>
              <Icon size={17} />
              {link.label}
              <ExternalLink size={13} />
            </a>
          );
        })}
      </div>
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

function PlanScreen({
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

function WalletCheckStatus({ result, status }) {
  const isLoading = status === "loading";
  const checks = result?.checks || [];
  const failedChecks = checks.filter((check) => check.status !== "pass");
  const isReady = result?.ok === true;
  const hasCheckDetails = checks.length > 0;
  const statusTitle = isLoading
    ? "Checking wallet"
    : isReady
      ? "Wallet ready"
      : result
        ? hasCheckDetails
          ? "Wallet check needed"
          : "Check unavailable"
        : "Wallet check starts after quote";
  const statusCopy = isLoading
    ? "Checking network, gas, and recipient before the testnet transfer."
    : result?.summary || "Choco checks network, funds, and recipient before continuing.";

  return (
    <section className={`wallet-check-card ${isReady ? "ready" : result ? "blocked" : ""}`} aria-label="Wallet readiness status">
      <div className="wallet-check-icon">
        {isLoading ? <ShieldCheck size={18} /> : isReady ? <Check size={18} /> : <ListChecks size={18} />}
      </div>
      <div>
        <span>Choco Agent AI</span>
        <b>{statusTitle}</b>
        <small>{statusCopy}</small>
        {failedChecks.length > 0 && (
          <em>{failedChecks.map((check) => check.label).join(", ")}</em>
        )}
      </div>
    </section>
  );
}

function WalletGateScreen({ wallet, onHome, onVerifyWallet }) {
  const isVerifyingWallet = wallet.status === "loading" || wallet.status === "opening-wallet";
  const needsMobileWallet = wallet.needsMobileWallet;
  const needsDesktopWallet = !wallet.isMobile && !wallet.hasProvider;
  const showManualAddress = !wallet.hasProvider;
  const [manualWalletAddress, setManualWalletAddress] = useState("");

  function submitManualWalletAddress(event) {
    event.preventDefault();
    if (wallet.useManualAddress(manualWalletAddress)) {
      onHome();
    }
  }

  return (
    <div className="screen wallet-gate-screen">
      <section className="wallet-gate-card">
        <span className="guard-icon"><ShieldCheck size={24} /></span>
        <div>
          <span>Wallet access</span>
          <div className="wallet-network-label">{wallet.network.label}</div>
          <h2>
            {needsMobileWallet
              ? "Connect from a mobile wallet"
              : needsDesktopWallet
                ? "Connect a browser wallet"
                : "Verify testnet wallet first"}
          </h2>
          <p>
            {needsMobileWallet
              ? "This mobile browser can preview Choco. Wallet actions open in MetaMask Mobile now, or MiniPay when Choco is opened there."
              : needsDesktopWallet
                ? `Install MetaMask, or enable it for this browser/incognito window, then verify on ${wallet.network.name}.`
                : `Choco hides plans, movements, and receipts until the wallet is verified on ${wallet.network.name} testnet.`}
          </p>
          {wallet.error && <p className="wallet-error">{wallet.error}</p>}
        </div>
        {needsMobileWallet ? (
          <div className="wallet-mobile-actions">
            <button className="primary-cta" type="button" disabled={isVerifyingWallet} onClick={wallet.openMetaMaskMobile}>
              {isVerifyingWallet ? "Opening wallet" : "Open in MetaMask Mobile"}
            </button>
            <button className="secondary-dark" type="button" onClick={wallet.openMiniPay}>
              Open in MiniPay
            </button>
          </div>
        ) : needsDesktopWallet ? (
          <div className="wallet-mobile-actions">
            <button className="primary-cta" type="button" onClick={wallet.openMetaMaskDownload}>
              Get MetaMask
            </button>
            <button className="secondary-dark" type="button" disabled={isVerifyingWallet} onClick={onVerifyWallet}>
              {isVerifyingWallet ? "Checking wallet" : "I enabled it, check again"}
            </button>
          </div>
        ) : (
          <button className="primary-cta" type="button" disabled={isVerifyingWallet} onClick={onVerifyWallet}>
            {isVerifyingWallet ? "Verifying wallet" : "Verify testnet wallet"}
          </button>
        )}
        {showManualAddress && (
          <form className="wallet-address-form" onSubmit={submitManualWalletAddress}>
            <label htmlFor="manual-wallet-address">Paste wallet address</label>
            <div>
              <input
                id="manual-wallet-address"
                type="text"
                inputMode="text"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck="false"
                value={manualWalletAddress}
                placeholder="0x..."
                onChange={(event) => setManualWalletAddress(event.target.value)}
              />
              <button type="submit">Use</button>
            </div>
            <small>For testnet checks only</small>
          </form>
        )}
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
              <QrCanvas data={verifyUrl} size={132} />
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
    ? DEFAULT_COMMANDS.now
    : DEFAULT_COMMANDS.schedule;

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

function ReviewScreen({ plan, mode, agentPreflight, agentPreflightStatus, transferBlockMessage, onEdit, onConfirm }) {
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
        <SummaryCard label="Timing" value={isSendNow ? "Send once now" : plan.schedule.replace(` - ${TESTNET_SCENARIO.scheduledTimeLabel}`, "")} />
        <SummaryCard label="Fee" value={plan.fee} />
        <SummaryCard label="Retries" value="3 attempts" />
      </div>

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
