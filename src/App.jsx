import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Bell, Flag, MessageCircleQuestionMark } from "lucide-react";
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
import { usePullToRefresh } from "./modules/ui/usePullToRefresh.js";
import { PullToRefreshIndicator } from "./components/PullToRefreshIndicator.jsx";
import {
  SPLASH_DURATION_MS,
  buildSafePreviewPlan,
  findRecentSimilarTransfer,
  findSimilarPlan,
} from "./utils/planUtils.js";
import {
  ADDRESSES,
  cancelScheduleViaRegistry,
  isMiniPay,
  pauseScheduleViaRegistry,
  readStablecoinBalances,
  resumeScheduleViaRegistry,
} from "./lib/celo.js";
import { BottomNav } from "./components/BottomNav.jsx";
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
import { isEscrowConfigured, readLockedRun, refundScheduleRun } from "./chain/escrow.js";
import { useScheduleNotices } from "./modules/notifications/useScheduleNotices.js";
import { ProcessingScreen } from "./screens/ProcessingScreen.jsx";
import { DuplicateGuardScreen } from "./screens/DuplicateGuardScreen.jsx";
import { ReviewScreen } from "./screens/ReviewScreen.jsx";
import { TransactionSuccessScreen } from "./screens/TransactionSuccessScreen.jsx";
import { CorridorPickerScreen } from "./screens/CorridorPickerScreen.jsx";
import { humaniseConnectError, humanisePlanError, mergeTransactionDetails, pickById } from "./utils/appHelpers.js";
import { RAMP_READY, openRampOnramp } from "./lib/ramp.js";

export default function App({ privyAuth = null }) {
  // --- Core app state ---
  const [screen, setScreen] = useState(INITIAL_SCREEN);
  const [command, setCommand] = useState(DEFAULT_COMMANDS.schedule);
  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [selectedPlanFallback, setSelectedPlanFallback] = useState(null);
  const [selectedTransactionId, setSelectedTransactionId] = useState("");
  const [selectedTransactionFallback, setSelectedTransactionFallback] = useState(null);
  const [reviewMode, setReviewMode] = useState("create");
  const [deliveryMode, setDeliveryMode] = useState("schedule");
  const [activeInfoPanel, setActiveInfoPanel] = useState(null);
  const [resolvedPreviewPlan, setResolvedPreviewPlan] = useState(null);
  const [balances, setBalances] = useState([]);
  const [showDemoPrompt, setShowDemoPrompt] = useState(APP_CONFIG.ui.showDemoPrompt);

  // --- Platform hooks ---
  const wallet = useMiniPayWallet();
  const walletCanSign = wallet.canSign;
  // walletHasAddress unlocks read-only views (home, plans, history) for pasted/read-only addresses.
  // walletCanSign is reserved for operations that require signing (review confirm button, actionReady).
  const walletHasAddress = wallet.isReady;
  const { plans, transactions, loading: ledgerLoading, error: ledgerError, refresh: refreshLedger, refreshFresh: refreshLedgerFresh, patchPlan, removePlan } = useChocoLedger(wallet.address);
  const visibleScreen = resolveVisibleScreen(screen, walletHasAddress);

  // --- Helpers (defined before feature hooks; closures capture hook values at call time) ---
  async function refreshBalances(address = wallet.address) {
    if (!address) return;
    setBalances(await readStablecoinBalances(address));
  }

  // --- Pull-to-refresh + auto-update: one refresh updates balance + plans + history together ---
  const panelRef = useRef(null);
  const pullRefresh = useCallback(async () => {
    // Await only the fast balance read so the spinner is brief; the ledger refresh runs in the
    // background and fills the list in when it resolves.
    void refreshLedgerFresh?.();
    await refreshBalances(wallet.address);
  }, [wallet.address]); // eslint-disable-line react-hooks/exhaustive-deps
  const { pullDistance, refreshing: ptrRefreshing } = usePullToRefresh(
    panelRef,
    pullRefresh,
    { enabled: ["plan", "plans", "history"].includes(visibleScreen) },
  );

  // Auto-update balances when the app regains focus. (useChocoLedger already refreshes plans/history
  // on visibility/focus, so we only add the balance read here to avoid a double ledger refresh.)
  useEffect(() => {
    if (!wallet.address) return undefined;
    function onVisible() {
      if (document.visibilityState !== "visible") return;
      void refreshBalances(wallet.address);
    }
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [wallet.address]); // eslint-disable-line react-hooks/exhaustive-deps

  function goTo(nextScreen) {
    setScreen(resolveVisibleScreen(nextScreen, walletHasAddress));
  }

  // --- Derived plan values (must be computed before feature hooks that consume them) ---
  const demoRecipientAddress = ADDRESSES.demoRecipient || "";
  const registryReady = Boolean(ADDRESSES.ledger || ADDRESSES.registry);
  const settlementReady = Boolean(ADDRESSES.settlementSpender);
  const activePlan = useMemo(
    () => pickById(plans, selectedPlanId, selectedPlanFallback) || plans[0] || null,
    [plans, selectedPlanFallback, selectedPlanId],
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
    onPlanCreated: (plan) => {
      setSelectedPlanId(plan.id);
      setSelectedPlanFallback(plan);
    },
    onTransactionCreated: (transaction) => {
      if (!transaction) {
        setSelectedTransactionId("");
        setSelectedTransactionFallback(null);
        return;
      }
      setSelectedTransactionId(transaction.id);
      setSelectedTransactionFallback(transaction);
    },
    onNavigate: goTo,
    onRefreshLedger: refreshLedgerFresh,
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
    () => {
      const selected =
        pickById(transactions, selectedTransactionId, selectedTransactionFallback) ||
        (transfer.lastReceipt?.id === selectedTransactionId ? transfer.lastReceipt : null);
      // The locally-built receipt (id `tx-<timestamp>`) never matches a chain-indexed row, so once
      // the on-chain movement for this hash is loaded, prefer it: it is authoritative and fully
      // populated (recipient, exact amount, route), fixing the blank/partial receipt seen right
      // after sending. Falls back to the local receipt until the ledger refresh catches up.
      if (selected?.hash) {
        const chainRow = transactions.find(
          (item) => item !== selected && item.hash && item.hash.toLowerCase() === selected.hash.toLowerCase(),
        );
        if (chainRow) return mergeTransactionDetails(selected, chainRow);
      }
      return selected;
    },
    [selectedTransactionFallback, transfer.lastReceipt, selectedTransactionId, transactions],
  );
  const scheduleNotices = useScheduleNotices(plans, wallet.address);
  const actionReady = Boolean(
    walletCanSign &&
    contacts.recipientAddress &&
    reviewPlan.intent?.isReady &&
    (reviewPlan.deliveryMode === "now" || (registryReady && settlementReady)),
  );
  const setupNotice =
    walletCanSign && reviewPlan.deliveryMode === "schedule" && (!registryReady || !settlementReady)
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

  // When buildPlan lands on "review" and a duplicate exists, redirect to the guard screen.
  // Gate on status === "review": the duplicate check is a PRE-confirm gate. Once the user confirms,
  // confirmAction creates the plan on-chain (sign 1) and the ledger refresh pulls it into `plans`,
  // so findSimilarPlan would match the just-created plan and wrongly re-fire the guard during
  // fundRun (sign 2). While a confirm is in flight the status is "pending"/"success", so skip it.
  useEffect(() => {
    if (visibleScreen !== "review" || reviewMode === "update" || !duplicateAttempt) return;
    if (appStatus.status !== "review") return; // not while a confirm/submit is in flight
    goTo("duplicateGuard");
  }, [visibleScreen, duplicateAttempt, reviewMode, appStatus.status]); // eslint-disable-line react-hooks/exhaustive-deps

  // Privy email-wallet bridge: after the OTP succeeds, attach Privy's embedded EIP-1193
  // provider as Choco's active signer. MiniPay's native provider always takes priority.
  // Errors are captured inside connectPrivyWallet → wallet.error (shown on WalletGateScreen).
  useEffect(() => {
    if (!privyAuth?.ready || !privyAuth.authenticated || !privyAuth.embeddedWallet) return;
    if (isMiniPay()) return;
    if (wallet.isReady || wallet.status === "opening-wallet") return;
    let active = true;
    wallet.connectPrivyWallet(privyAuth.embeddedWallet)
      .then(async (address) => {
        if (!active || !address) return;
        await refreshBalances(address);
        appStatus.setStatus("review");
        appStatus.setMessage("Email wallet connected. Choose now or schedule.");
        setScreen("corridorPicker");
      })
      .catch(() => { /* wallet.error is already set by connectPrivyWallet */ });
    return () => { active = false; };
  }, [privyAuth?.ready, privyAuth?.authenticated, !!privyAuth?.embeddedWallet, wallet.isReady, wallet.status]); // eslint-disable-line

  // --- Event handlers ---
  async function connectWallet() {
    appStatus.setStatus("pending");
    appStatus.setMessage("Opening wallet...");
    try {
      const address = await wallet.verifyWallet();
      await refreshBalances(address);
      appStatus.setStatus("review");
      appStatus.setMessage("Wallet connected. Choose now or schedule.");
      return address;
    } catch (error) {
      appStatus.setStatus("error");
      appStatus.setMessage(humaniseConnectError(error));
      return "";
    }
  }

  async function handleBuildPlan(nextCommand = "") {
    const commandForBuild = nextCommand || command || DEFAULT_COMMANDS.schedule;
    if (nextCommand) setCommand(nextCommand);
    await transfer.buildPlan(commandForBuild, activePlan || defaultPlan, deliveryMode);
  }

  function handleEditInstruction() {
    setCommand("");
    setResolvedPreviewPlan(null);
    appStatus.setStatus("idle");
    appStatus.setMessage("");
    goTo("planEditor");
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
    setSelectedPlanFallback(null);
    setReviewMode("create");
    setDeliveryMode("schedule");
    setCommand(DEFAULT_COMMANDS.schedule);
    goTo("planEditor");
  }

  function openImmediateSend() {
    setResolvedPreviewPlan(null);
    setSelectedPlanFallback(null);
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

  // existingPlanId is passed directly from DuplicateGuardScreen (captured at render time)
  // to avoid depending on similarPlan which may go stale if plans reload mid-flow.
  function continueDuplicateAttempt(existingPlanId = null) {
    if (previewPlan.deliveryMode === "now") {
      goTo("review");
      return;
    }
    const targetId = existingPlanId || similarPlan?.id;
    if (targetId) {
      setSelectedPlanId(targetId);
      setSelectedPlanFallback(null);
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
    const planToDelete = activePlan;
    try {
      appStatus.setStatus("pending");
      // Reclaim any escrow-locked next run first so the user gets their reserved USDC back.
      if (isEscrowConfigured() && wallet.address) {
        try {
          const locked = await readLockedRun({ owner: wallet.address, scheduleId: planToDelete.onchainId });
          if (locked > 0n) {
            appStatus.setMessage("Returning your locked funds...");
            await refundScheduleRun({ account: wallet.address, scheduleId: planToDelete.onchainId });
          }
        } catch (refundError) {
          console.warn("Escrow refund skipped:", refundError?.message || refundError);
        }
      }
      appStatus.setMessage("Cancelling schedule...");
      await cancelScheduleViaRegistry({ account: wallet.address, id: planToDelete.onchainId });
      appStatus.setStatus("idle");
      // Optimistic remove: plan disappears immediately, background refresh confirms on-chain state.
      removePlan(planToDelete.onchainId);
      setSelectedPlanId("");
      setSelectedPlanFallback(null);
      goTo("plans");
      window.setTimeout(() => { void refreshLedgerFresh(); void refreshBalances(wallet.address); }, 2000);
    } catch (error) {
      appStatus.setStatus("error");
      appStatus.setMessage(humanisePlanError(error));
    }
  }

  // Standalone "reclaim" — return a plan's set-aside USDC to the wallet WITHOUT cancelling the plan, so a
  // user can always get held funds back (audit H-2). The plan stays active-but-unfunded; the app prompts
  // to re-fund the next run.
  async function reclaimPlanFunds() {
    if (!activePlan || !wallet.address) { goTo("plans"); return; }
    const plan = activePlan;
    try {
      appStatus.setStatus("pending");
      appStatus.setMessage("Returning your set-aside funds...");
      const locked = await readLockedRun({ owner: wallet.address, scheduleId: plan.onchainId });
      if (locked === 0n) {
        appStatus.setStatus("error");
        appStatus.setMessage("Nothing is set aside for this plan right now.");
        return;
      }
      await refundScheduleRun({ account: wallet.address, scheduleId: plan.onchainId });
      appStatus.setStatus("idle");
      appStatus.setMessage("");
      window.setTimeout(() => { void refreshLedgerFresh(); void refreshBalances(wallet.address); }, 2000);
    } catch (error) {
      appStatus.setStatus("error");
      appStatus.setMessage(humanisePlanError(error));
    }
  }

  async function togglePlanPaused() {
    if (!activePlan) {
      goTo("plans");
      return;
    }
    const planToToggle = activePlan;
    const isPaused = planToToggle.status === "Paused" || planToToggle.active === false;
    try {
      appStatus.setStatus("pending");
      appStatus.setMessage(isPaused ? "Resuming plan..." : "Pausing plan...");
      if (isPaused) {
        await resumeScheduleViaRegistry({ account: wallet.address, id: planToToggle.onchainId });
      } else {
        await pauseScheduleViaRegistry({ account: wallet.address, id: planToToggle.onchainId });
      }
      appStatus.setStatus("idle");
      // Optimistic patch: status flips instantly without waiting for the full 11s refresh.
      patchPlan(planToToggle.onchainId, isPaused
        ? { status: "Active", active: true }
        : { status: "Paused", active: false });
      goTo("plans");
      // Background refresh to sync any other changes; cache cleared so it reads fresh.
      window.setTimeout(() => { void refreshLedgerFresh(); }, 2000);
    } catch (error) {
      appStatus.setStatus("error");
      appStatus.setMessage(humanisePlanError(error));
    }
  }


  return (
    <main className="stage">
      <img className="map-preload" src={WORLD_MAP_URL} alt="" aria-hidden="true" />
      <section className="miniapp" aria-label="Choco Mini App">
        <div className="topbar">
          {/* Deep screens (New Transfer, Receipt) get a single top-left back control instead of the
              global nav + shortcuts, so the user can't accidentally leave mid-flow. */}
          {visibleScreen === "planEditor" ? (
            <button className="header-back" type="button" aria-label="Back to Home" onClick={() => setScreen("plan")}>
              <ArrowLeft size={22} strokeWidth={2.6} />
            </button>
          ) : visibleScreen === "planDetail" ? (
            <button className="header-back" type="button" aria-label="Back to Plans" onClick={() => goTo("plans")}>
              <ArrowLeft size={22} strokeWidth={2.6} />
            </button>
          ) : visibleScreen === "deletePlan" ? (
            <button className="header-back" type="button" aria-label="Back to plan details" onClick={() => goTo("planDetail")}>
              <ArrowLeft size={22} strokeWidth={2.6} />
            </button>
          ) : visibleScreen === "receiptDetail" ? (
            <button className="header-back" type="button" aria-label="Back to Movements" onClick={() => goTo("history")}>
              <ArrowLeft size={22} strokeWidth={2.6} />
            </button>
          ) : (
            <div aria-hidden="true" />
          )}
          <div className="app-title" aria-hidden="true" />
          <div className="topbar-actions" aria-label="Support shortcuts">
            {visibleScreen === "receiptDetail" ? (
              // On a receipt the only shortcut is "report an issue with this transaction".
              <button
                className="header-icon"
                type="button"
                aria-label="Report an issue with this transaction"
                title="Report an issue"
                onClick={() => setActiveInfoPanel("report")}
              >
                <Flag size={20} strokeWidth={2.4} />
              </button>
            ) : ["planEditor", "planDetail", "deletePlan", "review"].includes(visibleScreen) ? null : (
              <>
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
                  aria-label="Notifications and upcoming features"
                  title="Notifications and upcoming features"
                  onClick={() => setActiveInfoPanel("future")}
                >
                  <Bell size={21} strokeWidth={2.4} />
                </button>
              </>
            )}
          </div>
        </div>

        <div className={`app-panel tone-${screen}`} ref={panelRef}>
          <PullToRefreshIndicator pullDistance={pullDistance} refreshing={ptrRefreshing} />
          {visibleScreen === "splash" && <SplashScreen onStart={() => setScreen("pitch")} />}
          {visibleScreen === "pitch" && <PitchScreen onClose={() => setScreen("plan")} />}
          {visibleScreen === "plan" && (
            <PlanScreen
              plans={plans}
              isWalletVerified={walletHasAddress}
              wallet={wallet}
              balances={balances}
              walletStatusLabel={getWalletStatusLabel(walletHasAddress)}
              onVerifyWallet={() => setScreen("walletGate")}
              onPlans={() => goTo("plans")}
              onHistory={() => goTo("history")}
              onSendNow={openImmediateSend}
              onSelectPlan={(planId) => {
                setSelectedPlanId(planId);
                setSelectedPlanFallback(null);
                goTo("planDetail");
              }}
              onFundWallet={RAMP_READY && !wallet.isMiniPay ? () => openRampOnramp(wallet.address) : null}
              showDemoPrompt={showDemoPrompt && !walletHasAddress}
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
                if (address) setScreen(isMiniPay() ? "plan" : "corridorPicker");
              }}
              onHome={() => setScreen("plan")}
              onEmailLogin={privyAuth?.login ?? null}
              emailAuth={privyAuth}
            />
          )}
          {visibleScreen === "corridorPicker" && (
            <CorridorPickerScreen
              onSendToAfrica={() => setScreen("plan")}
              onWithdrawToBank={null}
              onKeepAsUsdc={() => setScreen("plan")}
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
              loading={ledgerLoading}
              onHome={() => setScreen("plan")}
              onHistory={() => goTo("history")}
              onNewPlan={openNewPlan}
              onSelectPlan={(planId) => {
                setSelectedPlanId(planId);
                setSelectedPlanFallback(null);
                goTo("planDetail");
              }}
            />
          )}
          {visibleScreen === "planDetail" && activePlan && (
            <PlanDetailScreen
              plan={activePlan}
              onHome={() => setScreen("plan")}
              onHistory={() => goTo("history")}
              onEdit={openEditPlan}
              onTogglePause={togglePlanPaused}
              onDelete={() => goTo("deletePlan")}
              onReclaim={reclaimPlanFunds}
              onCheckHeld={(id) => readLockedRun({ owner: wallet.address, scheduleId: id })}
              operationStatus={appStatus.status}
              operationMessage={appStatus.message}
              onClearError={() => { appStatus.setStatus("idle"); appStatus.setMessage(""); }}
            />
          )}
          {visibleScreen === "history" && (
            <HistoryScreen
              transactions={transactions}
              loading={ledgerLoading}
              walletAddress={wallet.address}
              ledgerError={ledgerError}
              onRefresh={refreshLedgerFresh}
              onHome={() => setScreen("plan")}
              onPlans={() => goTo("plans")}
              onSelectTransaction={(transactionId) => {
                setSelectedTransactionId(transactionId);
                setSelectedTransactionFallback(null);
                goTo("receiptDetail");
              }}
            />
          )}
          {/* Pure confetti effect (browser only — gated in useTransfer). commitReceipt has already
              navigated to the receipt/plan detail, so this just plays over it and auto-clears. */}
          {transfer.showSuccessModal && (
            <TransactionSuccessScreen onDone={() => transfer.setShowSuccessModal(false)} />
          )}
          {visibleScreen === "receiptDetail" && activeTransaction && (
            <ReceiptDetailScreen
              transaction={activeTransaction}
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
              />
            </>
          )}
          {visibleScreen === "deletePlan" && activePlan && (
            <DeletePlanScreen
              plan={activePlan}
              onCancel={() => goTo("planDetail")}
              onDelete={confirmDeletePlan}
              isPending={appStatus.status === "pending"}
            />
          )}
          {visibleScreen === "processing" && (
            <ProcessingScreen
              plan={reviewPlan}
              command={command}
              duplicateAttempt={duplicateAttempt}
              onComplete={duplicateAttempt ? () => goTo("duplicateGuard") : undefined}
              onApprove={() => goTo("review")}
              onEdit={handleEditInstruction}
            />
          )}
          {visibleScreen === "duplicateGuard" && duplicateAttempt && (
            <DuplicateGuardScreen
              plan={reviewPlan}
              match={duplicateAttempt}
              onEdit={handleEditInstruction}
              onProceed={continueDuplicateAttempt}
            />
          )}
          {visibleScreen === "review" && (
            <ReviewScreen
              plan={reviewPlan}
              walletReady={walletCanSign}
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
              onEdit={handleEditInstruction}
              onPickContact={contacts.pickContact}
              onResolveContact={contacts.resolveContact}
              onEditContact={contacts.editContact}
              onRemoveContact={contacts.removeResolvedContact}
              contactLookupStatus={contacts.contactLookupStatus}
              contactLookupMessage={contacts.contactLookupMessage}
              supabaseReady={contacts.supabaseEnabled}
            />
          )}
          {activeInfoPanel && (
            <QuickInfoPanel
              type={activeInfoPanel}
              reportHash={activeInfoPanel === "report" ? (activeTransaction?.hash || "") : ""}
              notices={scheduleNotices}
              onClose={() => setActiveInfoPanel(null)}
            />
          )}
          {contacts.showContactPicker && (
            <ContactPicker
              ownerWallet={wallet.address}
              supabaseEnabled={contacts.supabaseEnabled}
              onSelect={({ address, label, contactId }) => {
                contacts.resolveContact(address, { label, source: "contacts", contactId });
              }}
              onClose={() => contacts.setShowContactPicker(false)}
            />
          )}
        </div>
        {!["splash", "pitch", "review", "planEditor", "receiptDetail", "planDetail", "deletePlan"].includes(visibleScreen) && (
          <BottomNav
            active={
              ["history", "receiptDetail"].includes(visibleScreen) ? "history"
              : ["plans", "planDetail", "deletePlan"].includes(visibleScreen) ? "plans"
              : ["plan", "walletGate"].includes(visibleScreen) ? "home"
              : ""
            }
            onHome={() => setScreen("plan")}
            onPlans={() => goTo("plans")}
            onHistory={() => goTo("history")}
          />
        )}
      </section>
    </main>
  );
}
