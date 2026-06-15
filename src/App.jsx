import { useEffect, useMemo, useState } from "react";
import { Bell, MessageCircleQuestionMark, X } from "lucide-react";
import { useMiniPayWallet } from "./modules/wallet/useMiniPayWallet.js";
import { useChocoLedger } from "./modules/ledger/useChocoLedger.js";
import { parseUnits } from "viem";
import { AUDIT_KIND, logAuditAttempt } from "./lib/audit.js";
import { verifyReadiness } from "./lib/cepolia.js";
import { findContactByLabel, removeContact, upsertContact, SUPABASE_READY } from "./lib/contacts.js";
import { ensureSupabaseAuth, getCachedSession } from "./lib/supabase.js";
import { INITIAL_SCREEN, WORLD_MAP_URL } from "./config/runtime.js";
import { DEFAULT_COMMANDS, defaultPlan } from "./data/chocoScenario.js";
import { getWalletStatusLabel, resolveVisibleScreen } from "./lib/access-control.js";
import { APP_CONFIG } from "./lib/app-config.js";
import { getTransactionExplorerUrl } from "./lib/transactions.js";
import {
  SPLASH_DURATION_MS,
  buildPlanFromCommand,
  buildTransactionFromPlan,
  findRecentSimilarTransfer,
  findSimilarPlan,
} from "./utils/planUtils.js";
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
import {
  ADDRESSES,
  cancelScheduleViaRegistry,
  createScheduleViaRegistry,
  readStablecoinBalances,
  sendNow,
} from "./lib/celo.js";

function buildSafePreviewPlan(commandText, basePlan, deliveryMode) {
  try {
    return buildPlanFromCommand(commandText, basePlan, deliveryMode);
  } catch (error) {
    return {
      ...basePlan,
      amount: "",
      amountMinor: 0,
      recipient: "",
      asset: APP_CONFIG.assets.destination,
      payAsset: APP_CONFIG.assets.source,
      status: "Draft",
      deliveryMode,
      intent: {
        rawCommand: String(commandText || ""),
        isReady: false,
        missing: ["recipient", "amount", "currency"],
        confidence: 0,
        minimumConfidence: APP_CONFIG.transfer.minimumConfidence,
        agent: {
          isReady: false,
          confidence: 0,
          missing: ["recipient", "amount", "currency"],
        },
        error: error.message,
      },
    };
  }
}

function getPlanReceiptLabel(plan) {
  return plan?.receiptLabel || plan?.recipient || plan?.intent?.receiptLabel || "";
}

function contactCacheKey(label) {
  return String(label || "").trim().toLowerCase();
}

export default function App() {
  const [screen, setScreen] = useState(INITIAL_SCREEN);
  const [command, setCommand] = useState(DEFAULT_COMMANDS.schedule);
  const [lastReceipt, setLastReceipt] = useState(null);
  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [selectedTransactionId, setSelectedTransactionId] = useState("");
  const [reviewMode, setReviewMode] = useState("create");
  const [deliveryMode, setDeliveryMode] = useState("schedule");
  const [activeInfoPanel, setActiveInfoPanel] = useState(null);
  const [resolvedPreviewPlan, setResolvedPreviewPlan] = useState(null);
  const [balances, setBalances] = useState([]);
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState("Connect your wallet so Choco can check stablecoin funds.");
  const [approvalHash, setApprovalHash] = useState("");
  const [txHash, setTxHash] = useState("");
  const [showDemoPrompt, setShowDemoPrompt] = useState(APP_CONFIG.ui.showDemoPrompt);
  const [resolvedContacts, setResolvedContacts] = useState({});
  const [contactLookup, setContactLookup] = useState({ key: "", status: "idle", message: "" });
  const [showContactPicker, setShowContactPicker] = useState(false);

  const wallet = useMiniPayWallet();
  const { plans, transactions, refresh: refreshLedger } = useChocoLedger(wallet.address);
  const visibleScreen = resolveVisibleScreen(screen, wallet.isReady);
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
    () => transactions.find((item) => item.id === selectedTransactionId)
      || (lastReceipt && lastReceipt.id === selectedTransactionId ? lastReceipt : null),
    [lastReceipt, selectedTransactionId, transactions],
  );
  const reviewPlan = resolvedPreviewPlan ?? previewPlan;
  const receiptLabel = getPlanReceiptLabel(reviewPlan);
  const contactKey = contactCacheKey(receiptLabel);
  const contactResolutionRequired = Boolean(reviewPlan.contactResolutionRequired || reviewPlan.intent?.contactResolutionRequired);
  const resolvedContact = contactKey ? resolvedContacts[contactKey] : null;
  const recipientAddress = contactResolutionRequired
    ? resolvedContact?.address || ""
    : demoRecipientAddress;
  const contactLookupPending = Boolean(
    visibleScreen === "review" &&
    SUPABASE_READY &&
    contactResolutionRequired &&
    contactKey &&
    wallet.address &&
    !resolvedContact?.address &&
    contactLookup.key !== contactKey,
  );
  const actionReady = Boolean(
    wallet.address &&
    recipientAddress &&
    reviewPlan.intent?.isReady &&
    (reviewPlan.deliveryMode === "now" || (registryReady && settlementReady)),
  );
  const setupNotice = wallet.isReady && reviewPlan.deliveryMode === "schedule" && (!registryReady || !settlementReady)
    ? "Scheduling needs the on-chain ledger and keeper set (VITE_LEDGER_ADDRESS, VITE_SETTLEMENT_SPENDER_ADDRESS)."
    : "";
  const txUrl = getTransactionExplorerUrl(txHash);
  const approvalUrl = getTransactionExplorerUrl(approvalHash);

  useEffect(() => {
    if (screen !== "splash") return undefined;
    const timer = window.setTimeout(() => setScreen("pitch"), SPLASH_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [screen]);

  async function refreshBalances(address = wallet.address) {
    if (!address) return;
    setBalances(await readStablecoinBalances(address));
  }

  useEffect(() => {
    if (!wallet.address) {
      setBalances([]);
      return;
    }
    void refreshBalances(wallet.address);
  }, [wallet.address]);

  useEffect(() => {
    if (visibleScreen !== "review" || !contactResolutionRequired || !contactKey || !wallet.address || !SUPABASE_READY) {
      setContactLookup({ key: contactKey, status: "idle", message: "" });
      return undefined;
    }

    if (resolvedContact?.address) {
      setContactLookup({ key: contactKey, status: "resolved", message: "" });
      return undefined;
    }

    let active = true;
    setContactLookup({ key: contactKey, status: "checking", message: "Checking saved contacts..." });

    resolveSavedContactByLabel(reviewPlan, { requireAuth: true })
      .then((contact) => {
        if (!active) return;
        if (contact?.wallet_address) {
          setContactLookup({ key: contactKey, status: "resolved", message: "" });
          setMessage(`${contact.label} found in saved contacts.`);
          return;
        }
        setContactLookup({ key: contactKey, status: "missing", message: "No saved contact found." });
      })
      .catch((error) => {
        if (!active) return;
        setContactLookup({
          key: contactKey,
          status: "error",
          message: error.message || "Could not check saved contacts.",
        });
        setMessage(error.message || "Could not check saved contacts.");
      });

    return () => {
      active = false;
    };
  }, [visibleScreen, contactResolutionRequired, contactKey, receiptLabel, wallet.address, resolvedContact?.address]);

  async function verifyWallet() {
    try {
      setStatus("pending");
      setMessage("Opening wallet...");
      const address = await wallet.verifyWallet();
      await refreshBalances(address);
      setStatus("review");
      setMessage("Wallet connected on Celo Mainnet. Choose now or schedule.");
      return address;
    } catch (error) {
      setStatus("error");
      setMessage(error.message);
      return "";
    }
  }

  function goTo(nextScreen) {
    setScreen(resolveVisibleScreen(nextScreen, wallet.isReady));
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

  function cacheSavedContact(contact, keyOverride = "") {
    const key = keyOverride || contactCacheKey(contact?.label);
    if (!key || !contact?.wallet_address) return;
    setResolvedContacts((items) => ({
      ...items,
      [key]: {
        address: contact.wallet_address,
        label: contact.label,
        phone: contact.payment_reason || "",
        source: "contacts",
        contactId: contact.id,
      },
    }));
  }

  async function resolveSavedContactByLabel(plan, { requireAuth = false } = {}) {
    const label = getPlanReceiptLabel(plan);
    const key = contactCacheKey(label);
    if (!SUPABASE_READY || !wallet.address || !label || !key) return null;

    if (requireAuth) {
      await ensureSupabaseAuth(wallet.address);
    } else {
      const session = await getCachedSession();
      if (!session) return null;
    }

    const contact = await findContactByLabel({ ownerWallet: wallet.address, label });
    if (contact?.wallet_address) {
      cacheSavedContact(contact, key);
      return contact;
    }
    return null;
  }

  async function buildPlan(nextCommand = "") {
    const commandForBuild = nextCommand || command || DEFAULT_COMMANDS.schedule;
    if (nextCommand) setCommand(nextCommand);
    const plan = buildSafePreviewPlan(commandForBuild, activePlan || defaultPlan, deliveryMode);
    setResolvedPreviewPlan(plan);
    setApprovalHash("");
    setTxHash("");
    if (!plan.intent?.isReady) {
      setStatus("error");
      setMessage(`Agent Choco needs: ${plan.intent?.missing?.join(", ") || "more detail"}.`);
      return;
    }

    // Cepolia Skill owns transaction readiness (USDC balance, wallet, intent shape). The verdict
    // is UX-only — no on-chain audit is written for pre-flight failures, because nothing touched
    // the chain. The audit contract is reserved for SUCCESS / FAILED_SWAP / FAILED_TRANSFER.
    const labelForAudit = plan.intent?.receiptLabel || plan.recipient || "";
    if (wallet.address) {
      const readiness = await verifyReadiness({ account: wallet.address, intent: plan.intent });
      if (!readiness.ok) {
        setStatus("error");
        setMessage(readiness.message || "Cepolia Skill could not verify readiness.");
        return;
      }
    }

    // Contact lookup ("Receipt" by label). If Supabase has the label for this wallet, pre-resolve
    // the destination so the user does not have to paste an address. The persistence step (when
    // the user actually pastes an address) happens in resolveContactForTransfer below.
    if (SUPABASE_READY && wallet.address && labelForAudit) {
      try {
        // Use cached session only — never trigger personal_sign in the middle of plan building.
        // ensureSupabaseAuth (which prompts for a signature) runs in pickContactForTransfer
        // when the user explicitly taps "Select contact".
        const session = await getCachedSession();
        if (session) {
          const contact = await findContactByLabel({ ownerWallet: wallet.address, label: labelForAudit });
          if (contact?.wallet_address) {
            setResolvedContacts((items) => ({
              ...items,
              [labelForAudit.toLowerCase()]: {
                address: contact.wallet_address,
                label: contact.label,
                phone: "",
                source: "contacts",
                contactId: contact.id,
              },
            }));
          }
        }
      } catch (contactError) {
        console.warn("Contact lookup failed:", contactError.message);
      }
    }

    setStatus(wallet.address ? "review" : "idle");
    setMessage(wallet.address ? "Review the action before signing." : "Connect your wallet so Choco can check stablecoin funds.");
    goTo("processing");
  }

  async function resolveContactForTransfer(address, options = {}) {
    if (!contactKey) return;
    const { saveContact = false, ...details } = options;
    const label = details.label || receiptLabel;
    setResolvedContacts((items) => ({
      ...items,
      [contactKey]: {
        address,
        label,
        phone: details.phone || "",
        source: details.source || "manual",
        contactId: details.contactId || null,
      },
    }));
    setStatus("review");
    setMessage(`${label} selected for this transfer.`);

    // Persist contact to Supabase ONLY if user explicitly authorized it via checkbox.
    // Skip when the address came from a prior contact lookup (source === "contacts").
    if (SUPABASE_READY && wallet.address && saveContact && details.source !== "contacts") {
      try {
        await ensureSupabaseAuth(wallet.address);
        const saved = await upsertContact({
          ownerWallet: wallet.address,
          label,
          walletAddress: address,
          paymentReason: details.phone || "",
        });
        setResolvedContacts((items) => ({
          ...items,
          [contactKey]: { ...items[contactKey], source: "contacts", contactId: saved.id },
        }));
        setMessage(`${label} selected and saved for future transfers.`);
      } catch (saveError) {
        // Persistence failures should not block this transfer.
        console.warn("Could not save contact:", saveError.message);
      }
    }
  }

  async function handleEditContact(newAddress) {
    if (!resolvedContact?.contactId || !contactKey) return;
    try {
      await ensureSupabaseAuth(wallet.address);
      await upsertContact({ ownerWallet: wallet.address, label: resolvedContact.label, walletAddress: newAddress });
      setResolvedContacts((items) => ({
        ...items,
        [contactKey]: { ...items[contactKey], address: newAddress.toLowerCase() },
      }));
    } catch (err) {
      setStatus("error");
      setMessage(err.message || "Could not update contact address.");
    }
  }

  async function handleRemoveContact() {
    if (!resolvedContact?.contactId || !contactKey) return;
    try {
      await ensureSupabaseAuth(wallet.address);
      await removeContact({ ownerWallet: wallet.address, id: resolvedContact.contactId });
      setResolvedContacts((items) => {
        const next = { ...items };
        delete next[contactKey];
        return next;
      });
    } catch (err) {
      setStatus("error");
      setMessage(err.message || "Could not remove contact.");
    }
  }

  async function pickContactForTransfer() {
    if (!contactKey) return;
    if (SUPABASE_READY && wallet.address) {
      try {
        await ensureSupabaseAuth(wallet.address);
        // After sign-in, try to auto-resolve by label so the user skips the picker entirely
        const found = await findContactByLabel({ ownerWallet: wallet.address, label: contactKey });
        if (found?.wallet_address) {
          resolveContactForTransfer(found.wallet_address, {
            label: found.label,
            source: "contacts",
            contactId: found.id,
          });
          return;
        }
      } catch (authError) {
        setStatus("error");
        setMessage(authError.message || "Sign-in cancelled. Please try again.");
        return;
      }
      setShowContactPicker(true);
      return;
    }
    if (!navigator.contacts?.select) {
      setStatus("error");
      setMessage("No saved contacts. Enter an address below to continue.");
      return;
    }
    try {
      const [contact] = await navigator.contacts.select(["name", "tel"], { multiple: false });
      if (!contact) return;
      const label = contact.name?.[0] || receiptLabel;
      const phone = contact.tel?.[0] || "";
      resolveContactForTransfer(demoRecipientAddress, { label, phone });
      if (!demoRecipientAddress) {
        setStatus("error");
        setMessage("Contact selected. Add a one-time wallet address to continue until ODIS lookup is connected.");
      }
    } catch (error) {
      setStatus("error");
      setMessage(error.message || "Could not open contacts.");
    }
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
      setStatus("pending");
      setMessage("Cancelling schedule on-chain...");
      await cancelScheduleViaRegistry({ account: wallet.address, id: activePlan.onchainId });
      await refreshLedger();
      setStatus("idle");
      setMessage("Schedule cancelled on-chain.");
    } catch (error) {
      setStatus("error");
      setMessage(error.message);
    }
    setSelectedPlanId("");
    goTo("plans");
  }

  function commitPlanReceipt(plan, hash, approveHash = "") {
    const committedPlan = {
      ...plan,
      hash,
      approveHash,
      status: plan.deliveryMode === "now" ? "Sent" : "Active",
    };

    // History and plans are re-read from chain via refreshLedger(); this transient receipt only
    // backs the confirmation screen for the action that was just signed (nothing is stored).
    const transaction = buildTransactionFromPlan(
      committedPlan,
      plan.deliveryMode === "now" ? "Action sent" : reviewMode === "update" ? "Plan updated" : "Plan confirmed",
      wallet.address,
      recipientAddress,
    );
    setLastReceipt(transaction);
    setSelectedTransactionId(transaction.id);
    goTo("transactionSuccess");
  }

  async function confirmAction() {
    const labelForAudit = reviewPlan.intent?.receiptLabel || reviewPlan.recipient || "";
    const usdcRaw = reviewPlan.intent?.sourceAsset === APP_CONFIG.assets.source && reviewPlan.intent?.sourceAmount
      ? parseUnits(Number(reviewPlan.intent.sourceAmount).toFixed(6), 6)
      : 0n;
    try {
      const address = wallet.address || await verifyWallet();
      if (!address) return;

      setStatus("pending");
      setMessage(reviewPlan.deliveryMode === "now" ? "Preparing wallet-signed send now..." : "Preparing wallet-signed monthly action...");
      const result = reviewPlan.deliveryMode === "now"
        ? await sendNow({ account: address, recipient: recipientAddress, intent: reviewPlan.intent })
        : await createScheduleViaRegistry({ account: address, recipient: recipientAddress, intent: reviewPlan.intent });

      setApprovalHash(result.approveHash || "");
      setTxHash(result.hash);
      setStatus("success");
      setMessage(reviewPlan.deliveryMode === "now" ? "Money sent from your wallet. Receipt filed." : "Monthly action created. Receipt filed.");
      commitPlanReceipt(reviewPlan, result.hash, result.approveHash || "");
      refreshBalances(address).catch(() => {});
      refreshLedger().catch(() => {});

      // Audit-log success. Failures here do not roll back the transfer; the swap/transfer hashes
      // remain visible on-chain even if the audit row never lands.
      try {
        await logAuditAttempt({
          account: address,
          kind: AUDIT_KIND.SUCCESS,
          label: labelForAudit,
          recipient: recipientAddress,
          usdcAmount: usdcRaw,
          ckesAmount: result.ckesReceived || parseUnits(String(Math.max(1, Math.floor(Number(reviewPlan.intent?.amountKes || 0)))), 18),
          swapTxHash: result.swap1Hash || result.swap2Hash || "",
          paymentTxHash: result.hash,
          note: reviewPlan.deliveryMode === "now" ? "send-now" : "schedule-create",
        });
      } catch (auditError) {
        console.warn("Audit log (success) failed:", auditError.message);
      }
    } catch (error) {
      setStatus("error");
      setMessage(error.message);
      // Audit-log failure best-effort. The kind is heuristic: most reverts after the swap hop are
      // FAILED_TRANSFER; everything else is treated as FAILED_SWAP. The note captures the raw reason.
      const kind = /transfer/i.test(error.shortMessage || error.message || "")
        ? AUDIT_KIND.FAILED_TRANSFER
        : AUDIT_KIND.FAILED_SWAP;
      try {
        await logAuditAttempt({
          account: wallet.address,
          kind,
          label: labelForAudit,
          recipient: recipientAddress,
          usdcAmount: usdcRaw,
          note: (error.shortMessage || error.message || "transfer failed").slice(0, 120),
        });
      } catch (auditError) {
        console.warn("Audit log (failure) failed:", auditError.message);
      }
    }
  }

  const screenTitle = useMemo(() => {
    if (visibleScreen === "splash") return "Choco";
    if (visibleScreen === "pitch") return "Choco";
    if (visibleScreen === "plans") return "Plans";
    if (visibleScreen === "planDetail") return "Details";
    if (visibleScreen === "history") return "History";
    if (visibleScreen === "transactionSuccess") return "Sent";
    if (visibleScreen === "receiptDetail") return "Receipt";
    if (visibleScreen === "planEditor") return reviewMode === "update" ? "Edit plan" : deliveryMode === "now" ? "Send now" : "New schedule";
    if (visibleScreen === "deletePlan") return "Delete";
    if (visibleScreen === "demoTour") return "Demo";
    if (visibleScreen === "processing") return "Planning";
    if (visibleScreen === "duplicateGuard") return "Choco";
    if (visibleScreen === "review") return "Quote";
    if (visibleScreen === "walletGate") return "Wallet";
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
                const address = await verifyWallet();
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
          {visibleScreen === "transactionSuccess" && lastReceipt && (
            <TransactionSuccessScreen
              transaction={lastReceipt}
              onViewDetails={() => goTo("receiptDetail")}
              onHome={() => setScreen("plan")}
              onPlans={() => goTo("plans")}
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
                statusMessage={status === "error" ? message : ""}
                onBuild={buildPlan}
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
              status={status}
              message={message}
              setupNotice={setupNotice}
              actionReady={actionReady}
              approvalUrl={approvalUrl}
              txUrl={txUrl}
              contactResolutionRequired={contactResolutionRequired}
              resolvedContact={resolvedContact}
              recipientAddress={recipientAddress}
              walletAccount={wallet.address}
              onConnect={verifyWallet}
              onConfirm={confirmAction}
              onEdit={() => setScreen("planEditor")}
              onPickContact={pickContactForTransfer}
              onResolveContact={resolveContactForTransfer}
              onEditContact={handleEditContact}
              onRemoveContact={handleRemoveContact}
              contactLookupStatus={contactLookupPending ? "checking" : contactLookup.key === contactKey ? contactLookup.status : "idle"}
              contactLookupMessage={contactLookupPending ? "Checking saved contacts..." : contactLookup.key === contactKey ? contactLookup.message : ""}
              supabaseReady={SUPABASE_READY}
            />
          )}
          {activeInfoPanel && (
            <QuickInfoPanel type={activeInfoPanel} onClose={() => setActiveInfoPanel(null)} />
          )}
          {showContactPicker && (
            <ContactPicker
              ownerWallet={wallet.address}
              onSelect={({ address, label, contactId }) => {
                setShowContactPicker(false);
                resolveContactForTransfer(address, { label, source: "contacts", contactId });
              }}
              onClose={() => setShowContactPicker(false)}
            />
          )}
        </div>
      </section>
    </main>
  );
}
