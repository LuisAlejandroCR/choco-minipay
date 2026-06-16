import { useEffect, useMemo, useState } from "react";
import { Bell, MessageCircleQuestionMark, X } from "lucide-react";
import { useMiniPayWallet } from "./modules/wallet/useMiniPayWallet.js";
import { useChocoLedger } from "./modules/ledger/useChocoLedger.js";
import { useAppStatus } from "./modules/app/useAppStatus.js";
import { useTransfer } from "./modules/transfer/useTransfer.js";
import { useContactResolution } from "./modules/contacts/useContactResolution.js";
import { SUPABASE_READY } from "./lib/contacts.js";
import { INITIAL_SCREEN, WORLD_MAP_URL } from "./config/runtime.js";
import { DEFAULT_COMMANDS, defaultPlan } from "./data/chocoScenario.js";
import { getWalletStatusLabel, resolveVisibleScreen } from "./lib/access-control.js";
import { APP_CONFIG } from "./lib/app-config.js";
import { getTransactionExplorerUrl } from "./lib/transactions.js";
import {
  SPLASH_DURATION_MS,
  buildSafePreviewPlan,
  findRecentSimilarTransfer,
  findSimilarPlan,
} from "./utils/planUtils.js";
import { ADDRESSES, cancelScheduleViaRegistry, readStablecoinBalances } from "./lib/celo.js";
import { ContactPicker } from "./components/ContactPicker.jsx";
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
import { TransactionSuccessScreen } from "./screens/TransactionSuccessScreen.jsx";

// Static topbar titles by screen. planEditor is the one dynamic case (depends on review/delivery
// mode) and is handled separately in the screenTitle memo below.
const SCREEN_TITLES = {
  splash: "Choco",
  pitch: "Choco",
  plans: "Plans",
  planDetail: "Details",
  history: "History",
  receiptDetail: "Receipt",
  deletePlan: "Delete",
  demoTour: "Demo",
  processing: "Planning",
  duplicateGuard: "Choco",
  review: "Quote",
  walletGate: "Wallet",
  plan: "Home",
};

export default function App() {
  // --- Core app state ---
  const [screen, setScreen] = useState(INITIAL_SCREEN);
  const [command, setCommand] = useState(DEFAULT_COMMANDS.schedule);
  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [selectedTransactionId, setSelectedTransactionId] = useState("");
  const [reviewMode, setReviewMode] = useState("create");
  const [deliveryMode, setDeliveryMode] = useState("schedule");
  const [activeInfoPanel, setActiveInfoPanel] = useState(null);
  const [resolvedPreviewPlan, setResolvedPreviewPlan] = useState(null);
  const [balances, setBalances] = useState([]);
  const [showDemoPrompt, setShowDemoPrompt] = useState(APP_CONFIG.ui.showDemoPrompt);

  // --- Platform hooks ---
  const wallet = useMiniPayWallet();
  const { plans, transactions, refresh: refreshLedger } = useChocoLedger(wallet.address);
  const visibleScreen = resolveVisibleScreen(screen, wallet.isReady);

  // --- Helpers (defined before feature hooks; closures capture hook values at call time) ---
  async function refreshBalances(address = wallet.address) {
    if (!address) return;
    setBalances(await readStablecoinBalances(address));
  }

  function goTo(nextScreen) {
    setScreen(resolveVisibleScreen(nextScreen, wallet.isReady));
  }

  // --- Derived plan values (must be computed before feature hooks that consume them) ---
  const demoRecipientAddress = ADDRESSES.demoRecipient || "";
  const registryReady = Boolean(ADDRESSES.ledger || ADDRESSES.registry);
  const settlementReady = Boolean(ADDRESSES.settlementSpender);
  const activePlan = useMemo(
    () => plans.find((item) => item.id === selectedPlanId) || plans[0] || null,
    [plans, selectedPlanId],
  );
  const previewPlan = useMemo(
    () => buildSafePreviewPlan(command, activePlan || defaultPlan, deliveryMode),
    [activePlan, command, deliveryMode],
  );
  const reviewPlan = resolvedPreviewPlan ?? previewPlan;

  // --- Feature hooks ---
  // appStatus is the shared status/message surface. Declaring it first lets both feature hooks
  // write to it without referencing each other — no forward reference, no eslint-disable.
  const appStatus = useAppStatus();

  const contacts = useContactResolution({
    wallet,
    visibleScreen,
    reviewPlan,
    demoRecipientAddress,
    onError: appStatus.setMessage,
    onMessage: appStatus.setMessage,
  });

  const transfer = useTransfer({
    wallet,
    appStatus,
    onPlanBuilt: setResolvedPreviewPlan,
    onContactResolved: (key, contact) =>
      contacts.setResolvedContacts((prev) => ({ ...prev, [key]: contact })),
    onTransactionCreated: setSelectedTransactionId,
    onNavigate: goTo,
    onRefreshLedger: refreshLedger,
    onRefreshBalances: refreshBalances,
  });

  // --- Derived display values ---
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
    () =>
      transactions.find((item) => item.id === selectedTransactionId) ||
      (transfer.lastReceipt?.id === selectedTransactionId ? transfer.lastReceipt : null),
    [transfer.lastReceipt, selectedTransactionId, transactions],
  );
  const actionReady = Boolean(
    wallet.address &&
    contacts.recipientAddress &&
    reviewPlan.intent?.isReady &&
    (reviewPlan.deliveryMode === "now" || (registryReady && settlementReady)),
  );
  const setupNotice =
    wallet.isReady && reviewPlan.deliveryMode === "schedule" && (!registryReady || !settlementReady)
      ? "Scheduling needs the on-chain ledger and keeper set (VITE_LEDGER_ADDRESS, VITE_SETTLEMENT_SPENDER_ADDRESS)."
      : "";
  const txUrl = getTransactionExplorerUrl(transfer.txHash);
  const approvalUrl = getTransactionExplorerUrl(transfer.approvalHash);

  // --- Effects ---
  useEffect(() => {
    if (screen !== "splash") return undefined;
    const timer = window.setTimeout(() => setScreen("pitch"), SPLASH_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [screen]);

  useEffect(() => {
    if (!wallet.address) {
      setBalances([]);
      return;
    }
    void refreshBalances(wallet.address);
  }, [wallet.address]);

  // --- Event handlers ---
  async function connectWallet() {
    appStatus.setStatus("pending");
    appStatus.setMessage("Opening wallet...");
    try {
      const address = await wallet.verifyWallet();
      await refreshBalances(address);
      appStatus.setStatus("review");
      appStatus.setMessage("Wallet connected on Celo Mainnet. Choose now or schedule.");
      return address;
    } catch (error) {
      appStatus.setStatus("error");
      appStatus.setMessage(error.message);
      return "";
    }
  }

  async function handleBuildPlan(nextCommand = "") {
    const commandForBuild = nextCommand || command || DEFAULT_COMMANDS.schedule;
    if (nextCommand) setCommand(nextCommand);
    await transfer.buildPlan(commandForBuild, activePlan || defaultPlan, deliveryMode);
  }

  async function handleConfirmAction() {
    await transfer.confirmAction(reviewPlan, contacts.recipientAddress, reviewMode);
  }

  function runDemo() {
    setShowDemoPrompt(false);
    setReviewMode("demo");
    setDeliveryMode("schedule");
    setCommand(DEFAULT_COMMANDS.schedule);
    setScreen("demoTour");
  }

  function openNewPlan() {
    setResolvedPreviewPlan(null);
    setReviewMode("create");
    setDeliveryMode("schedule");
    setCommand(DEFAULT_COMMANDS.schedule);
    goTo("planEditor");
  }

  function openImmediateSend() {
    setResolvedPreviewPlan(null);
    setReviewMode("create");
    setDeliveryMode("now");
    setCommand(DEFAULT_COMMANDS.now);
    goTo("planEditor");
  }

  function openEditPlan() {
    const targetPlan = activePlan || defaultPlan;
    setResolvedPreviewPlan(null);
    setReviewMode("update");
    setDeliveryMode(targetPlan.deliveryMode || "schedule");
    setCommand(DEFAULT_COMMANDS.edit(targetPlan.recipient));
    goTo("planEditor");
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

  function continueDuplicateAttempt() {
    if (previewPlan.deliveryMode === "now") {
      goTo("review");
      return;
    }
    if (similarPlan) {
      setSelectedPlanId(similarPlan.id);
      goTo("planDetail");
      return;
    }
    goTo("review");
  }

  async function confirmDeletePlan() {
    if (!activePlan) {
      goTo("plans");
      return;
    }
    try {
      appStatus.setStatus("pending");
      appStatus.setMessage("Cancelling schedule on-chain...");
      await cancelScheduleViaRegistry({ account: wallet.address, id: activePlan.onchainId });
      await refreshLedger();
      appStatus.setStatus("idle");
      appStatus.setMessage("Schedule cancelled on-chain.");
    } catch (error) {
      appStatus.setStatus("error");
      appStatus.setMessage(error.message);
    }
    setSelectedPlanId("");
    goTo("plans");
  }

  const screenTitle = useMemo(() => {
    if (visibleScreen === "planEditor") {
      return reviewMode === "update" ? "Edit plan" : deliveryMode === "now" ? "Send now" : "New schedule";
    }
    return SCREEN_TITLES[visibleScreen] || "Home";
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
              isWalletVerified={wallet.isReady}
              wallet={wallet}
              balances={balances}
              walletStatusLabel={getWalletStatusLabel(wallet.isReady)}
              onVerifyWallet={() => setScreen("walletGate")}
              onPlans={() => goTo("plans")}
              onHistory={() => goTo("history")}
              onSendNow={openImmediateSend}
              onSelectPlan={(planId) => {
                setSelectedPlanId(planId);
                goTo("planDetail");
              }}
              showDemoPrompt={showDemoPrompt && !wallet.isReady}
              liveDemoUrl={APP_CONFIG.ui.liveDemoUrl}
              onDismissDemo={() => setShowDemoPrompt(false)}
              onRunDemo={runDemo}
            />
          )}
          {visibleScreen === "walletGate" && (
            <WalletGateScreen
              wallet={wallet}
              onVerifyWallet={async () => {
                const address = await connectWallet();
                if (address) setScreen("plan");
              }}
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
              onHistory={() => goTo("history")}
              onNewPlan={openNewPlan}
              onSelectPlan={(planId) => {
                setSelectedPlanId(planId);
                goTo("planDetail");
              }}
            />
          )}
          {visibleScreen === "planDetail" && activePlan && (
            <PlanDetailScreen
              plan={activePlan}
              onHome={() => setScreen("plan")}
              onHistory={() => goTo("history")}
              onBack={() => goTo("plans")}
              onEdit={openEditPlan}
              onDelete={() => goTo("deletePlan")}
            />
          )}
          {visibleScreen === "history" && (
            <HistoryScreen
              transactions={transactions}
              onHome={() => setScreen("plan")}
              onPlans={() => goTo("plans")}
              onSelectTransaction={(transactionId) => {
                setSelectedTransactionId(transactionId);
                goTo("receiptDetail");
              }}
            />
          )}
          {transfer.showSuccessModal && transfer.lastReceipt && (
            <TransactionSuccessScreen
              transaction={transfer.lastReceipt}
              onViewDetails={() => transfer.setShowSuccessModal(false)}
              onDismiss={() => transfer.setShowSuccessModal(false)}
            />
          )}
          {visibleScreen === "receiptDetail" && activeTransaction && (
            <ReceiptDetailScreen
              transaction={activeTransaction}
              onBack={() => setScreen("history")}
              onHome={() => setScreen("plan")}
              onPlans={() => goTo("plans")}
            />
          )}
          {visibleScreen === "planEditor" && (
            <>
              <PlanEditorScreen
                mode={reviewMode}
                command={command}
                setCommand={setCommand}
                deliveryMode={deliveryMode}
                setDeliveryMode={changeDeliveryMode}
                agentIntent={previewPlan.intent}
                statusMessage={appStatus.status === "error" ? appStatus.message : ""}
                onBuild={handleBuildPlan}
                onHome={() => setScreen("plan")}
                onBack={reviewMode === "update" ? () => goTo("planDetail") : null}
              />
            </>
          )}
          {visibleScreen === "deletePlan" && activePlan && (
            <DeletePlanScreen plan={activePlan} onCancel={() => goTo("planDetail")} onDelete={confirmDeletePlan} />
          )}
          {visibleScreen === "processing" && (
            <ProcessingScreen
              plan={reviewPlan}
              command={command}
              duplicateAttempt={duplicateAttempt}
              onComplete={() => goTo(duplicateAttempt ? "duplicateGuard" : "review")}
            />
          )}
          {visibleScreen === "duplicateGuard" && duplicateAttempt && (
            <DuplicateGuardScreen
              plan={reviewPlan}
              match={duplicateAttempt}
              onEdit={() => goTo("planEditor")}
              onProceed={continueDuplicateAttempt}
            />
          )}
          {visibleScreen === "review" && (
            <ReviewScreen
              plan={reviewPlan}
              walletReady={wallet.isReady}
              status={appStatus.status}
              message={appStatus.message}
              setupNotice={setupNotice}
              actionReady={actionReady}
              approvalUrl={approvalUrl}
              txUrl={txUrl}
              contactResolutionRequired={contacts.contactResolutionRequired}
              resolvedContact={contacts.resolvedContact}
              recipientAddress={contacts.recipientAddress}
              walletAccount={wallet.address}
              onConnect={connectWallet}
              onConfirm={handleConfirmAction}
              onEdit={() => setScreen("planEditor")}
              onPickContact={contacts.pickContact}
              onResolveContact={contacts.resolveContact}
              onEditContact={contacts.editContact}
              onRemoveContact={contacts.removeResolvedContact}
              contactLookupStatus={contacts.contactLookupStatus}
              contactLookupMessage={contacts.contactLookupMessage}
              supabaseReady={SUPABASE_READY}
            />
          )}
          {activeInfoPanel && (
            <QuickInfoPanel type={activeInfoPanel} onClose={() => setActiveInfoPanel(null)} />
          )}
          {contacts.showContactPicker && (
            <ContactPicker
              ownerWallet={wallet.address}
              onSelect={({ address, label, contactId }) => {
                contacts.resolveContact(address, { label, source: "contacts", contactId });
              }}
              onClose={() => contacts.setShowContactPicker(false)}
            />
          )}
        </div>
      </section>
    </main>
  );
}
