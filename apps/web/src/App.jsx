import { useEffect, useMemo, useState } from "react";
import { Bell, MessageCircleQuestionMark, X } from "lucide-react";
import { useMiniPayWallet } from "./modules/wallet/useMiniPayWallet.js";
import { useContacts } from "./modules/contacts/useContacts.js";
import { useAgentPreflight } from "./modules/preflight/useAgentPreflight.js";
import {
  API_BASE_URL,
  INITIAL_SCREEN,
  WORLD_MAP_URL,
} from "./config/runtime.js";
import {
  DEFAULT_COMMANDS,
  TESTNET_SCENARIO,
  defaultPlan,
  defaultTransaction,
} from "./data/testnetScenario.js";
import {
  SPLASH_DURATION_MS,
  buildPlanFromCommand,
  buildPlanFromIntent,
  buildTransactionFromPlan,
  findRecentSimilarTransfer,
  findSimilarPlan,
  rememberDemoChoice,
  shouldShowDemoPrompt,
} from "./utils/planUtils.js";
import { PitchScreen } from "./components/PitchScreen.jsx";
import { QuickInfoPanel } from "./screens/QuickInfoPanel.jsx";
import { SplashScreen } from "./screens/SplashScreen.jsx";
import { PlanScreen } from "./screens/PlanScreen.jsx";
import { WalletGateScreen } from "./screens/WalletGateScreen.jsx";
import { DemoTourScreen } from "./screens/DemoTourScreen.jsx";
import { PlansScreen } from "./screens/PlansScreen.jsx";
import { HistoryScreen } from "./screens/HistoryScreen.jsx";
import { ReceiptDetailScreen } from "./screens/ReceiptDetailScreen.jsx";
import { PlanDetailScreen } from "./screens/PlanDetailScreen.jsx";
import { PlanEditorScreen } from "./screens/PlanEditorScreen.jsx";
import { DeletePlanScreen } from "./screens/DeletePlanScreen.jsx";
import { ProcessingScreen } from "./screens/ProcessingScreen.jsx";
import { DuplicateGuardScreen } from "./screens/DuplicateGuardScreen.jsx";
import { ReviewScreen } from "./screens/ReviewScreen.jsx";

export function App() {
  // --- Core navigation / editor state ---
  const [screen, setScreen] = useState(INITIAL_SCREEN);
  const [command, setCommand] = useState(DEFAULT_COMMANDS.schedule);
  const [plans, setPlans] = useState([defaultPlan]);
  const [transactions, setTransactions] = useState([defaultTransaction]);
  const [selectedPlanId, setSelectedPlanId] = useState(defaultPlan.id);
  const [selectedTransactionId, setSelectedTransactionId] = useState(defaultTransaction.id);
  const [reviewMode, setReviewMode] = useState("create");
  const [deliveryMode, setDeliveryMode] = useState("schedule");
  const [showDemoPrompt, setShowDemoPrompt] = useState(shouldShowDemoPrompt);
  const [activeInfoPanel, setActiveInfoPanel] = useState(null);
  const [resolvedPreviewPlan, setResolvedPreviewPlan] = useState(null);

  // --- Hooks ---
  const wallet = useMiniPayWallet();
  const { getContact, saveContact } = useContacts();
  const preflight = useAgentPreflight({ wallet, getContact, apiBaseUrl: API_BASE_URL });
  const isWalletVerified = wallet.isReady;

  // --- Derived state ---
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

  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.debug(
      "[App] plan resolution path:",
      resolvedPreviewPlan ? "resolvedPreviewPlan (API)" : "previewPlan (local)",
      { recipient: (resolvedPreviewPlan ?? previewPlan).recipient, amount: (resolvedPreviewPlan ?? previewPlan).amount },
    );
  }

  // --- Effects ---

  // Advance splash → pitch automatically.
  useEffect(() => {
    if (screen !== "splash") return undefined;
    const timer = window.setTimeout(() => setScreen("pitch"), SPLASH_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [screen]);

  // --- Handlers ---

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
    setScreen("demoTour");
  }

  function openNewPlan() {
    setResolvedPreviewPlan(null);
    setReviewMode("create");
    setDeliveryMode("schedule");
    setCommand("");
    setScreen("planEditor");
  }

  function openImmediateSend() {
    setResolvedPreviewPlan(null);
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
    setResolvedPreviewPlan(null);
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

  async function buildPlan(nextCommand = "") {
    const commandForBuild = nextCommand || command;
    if (nextCommand) setCommand(nextCommand);
    preflight.reset();
    setResolvedPreviewPlan(null);

    let plan;
    try {
      const res = await fetch(`${API_BASE_URL}/v1/intent/preview`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ command: commandForBuild, deliveryMode }),
      });
      if (res.ok) {
        const { intent } = await res.json();
        plan = buildPlanFromIntent(intent, activePlan || defaultPlan);
      }
    } catch { /* API unavailable — local parse below */ }

    plan ??= buildPlanFromCommand(commandForBuild, activePlan || defaultPlan, deliveryMode);
    setResolvedPreviewPlan(plan);
    setScreen("processing");
    void preflight.run(plan);
  }

  // Save to localStorage and mirror to the API so the worker can read it.
  async function saveContactAndSync(alias, walletAddress) {
    saveContact(alias, walletAddress);
    try {
      await fetch(`${API_BASE_URL}/v1/contacts`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ alias, walletAddress, network: "celoSepolia" }),
      });
    } catch { /* non-blocking — API mirror is best-effort on testnet */ }
  }

  function confirmPlan() {
    const planToCommit = resolvedPreviewPlan || previewPlan;
    let committedPlan;

    if (!preflight.result?.ok) {
      preflight.block("Choco needs a completed wallet check before creating a testnet transfer or schedule.");
      return;
    }

    if (planToCommit.deliveryMode === "now") {
      preflight.block("Testnet transfer execution is not connected yet. Choco prepared the route, but no funds were moved and no receipt was created.");
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
        ...planToCommit,
        id: activePlan.id,
        hash: TESTNET_SCENARIO.hashes.updated,
      };
      setPlans((items) => items.map((item) => (item.id === activePlan.id ? committedPlan : item)));
    } else {
      committedPlan = {
        ...planToCommit,
        id: `plan-${Date.now()}`,
        hash: TESTNET_SCENARIO.hashes.default,
      };
      setPlans((items) => [committedPlan, ...items]);
    }

    setSelectedPlanId(committedPlan.id);
    const recipientContact = getContact(planToCommit.recipient);
    const transaction = buildTransactionFromPlan(
      committedPlan,
      reviewMode === "update" ? "Plan updated" : "Plan confirmed",
      wallet.address,
      recipientContact?.walletAddress || "",
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

  // --- Screen title ---

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

  // --- Router ---

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
              onSkip={() => setScreen("plan")}
              onFinish={() => setScreen("plan")}
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
              onBack={reviewMode === "update" ? () => setScreen("planDetail") : null}
            />
          )}
          {visibleScreen === "deletePlan" && activePlan && (
            <DeletePlanScreen plan={activePlan} onCancel={() => setScreen("planDetail")} onDelete={confirmDeletePlan} />
          )}
          {visibleScreen === "processing" && (
            <ProcessingScreen
              plan={resolvedPreviewPlan ?? previewPlan}
              command={command}
              duplicateAttempt={duplicateAttempt}
              onComplete={() => setScreen(duplicateAttempt ? "duplicateGuard" : "review")}
            />
          )}
          {visibleScreen === "duplicateGuard" && duplicateAttempt && (
            <DuplicateGuardScreen
              plan={resolvedPreviewPlan ?? previewPlan}
              match={duplicateAttempt}
              onEdit={() => setScreen("planEditor")}
              onProceed={continueDuplicateAttempt}
            />
          )}
          {visibleScreen === "review" && (
            <ReviewScreen
              plan={resolvedPreviewPlan ?? previewPlan}
              mode={reviewMode}
              agentPreflight={preflight.result}
              agentPreflightStatus={preflight.status}
              transferBlockMessage={preflight.blockMessage}
              resolvedContact={getContact((resolvedPreviewPlan ?? previewPlan).recipient)}
              onSaveContact={(address, shouldSave) => {
                const plan = resolvedPreviewPlan ?? previewPlan;
                if (shouldSave) void saveContactAndSync(plan.recipient, address);
                void preflight.run(plan, address);
              }}
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
