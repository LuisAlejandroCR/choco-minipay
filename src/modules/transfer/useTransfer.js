import { useState } from "react";
import { SUPABASE_READY, findContactByLabel } from "../../lib/contacts.js";
import { getCachedSession } from "../../lib/supabase.js";
import { sendNow, createScheduleViaRegistry } from "../../lib/celo.js";
import { verifyReadiness } from "../../lib/cepolia.js";
import { buildSafePreviewPlan, buildTransactionFromPlan } from "../../utils/planUtils.js";

function humaniseTransferError(error) {
  const msg = String(error?.message || error || "");
  if (/user rejected|user denied|rejected the request/i.test(msg)) {
    return "Transfer cancelled — you declined the wallet request.";
  }
  if (/invalid signature|eip.?2612/i.test(msg)) {
    return "The permit signature was rejected or expired. Please try again.";
  }
  if (/insufficient.*funds|insufficient.*balance/i.test(msg)) {
    return "Insufficient balance for this transfer or network fee.";
  }
  if (/allowance|approval|approve/i.test(msg)) {
    return "Approval failed. Confirm the wallet approval and try again.";
  }
  if (/gateway|route|quote|swap|mento|reverted|execution reverted/i.test(msg)) {
    return "Route failed before completion. Refresh the quote and try again.";
  }
  if (/network|fetch|timeout/i.test(msg)) {
    return "Network error. Check your connection and try again.";
  }
  return "Transfer failed. Please try again or contact support.";
}

// Owns the full transfer lifecycle: plan building, pre-flight checks, on-chain execution,
// and receipt creation. App.jsx wires it to the rest of the UI via callbacks.
export function useTransfer({
  wallet,
  appStatus,            // { status, setStatus, message, setMessage } from useAppStatus
  onPlanBuilt,          // (plan) => void  — calls setResolvedPreviewPlan
  onContactResolved,    // (key, contact) => void  — merges into resolvedContacts
  onTransactionCreated, // (transactionId) => void  — sets selectedTransactionId
  onNavigate,           // (screen) => void  — calls goTo
  onRefreshLedger,      // () => Promise<void>
  onRefreshBalances,    // (address) => Promise<void>
}) {
  // status/message live in useAppStatus so contact resolution can write to the same surface.
  const { setStatus, setMessage } = appStatus;
  const [approvalHash, setApprovalHash] = useState("");
  const [txHash, setTxHash] = useState("");
  const [lastReceipt, setLastReceipt] = useState(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  async function buildPlan(commandText, basePlan, deliveryMode) {
    setStatus("idle");
    setMessage("");
    const plan = buildSafePreviewPlan(commandText, basePlan, deliveryMode);
    onPlanBuilt(plan);
    setApprovalHash("");
    setTxHash("");

    if (!plan.intent?.isReady) {
      setStatus("error");
      setMessage(`Agent Choco needs: ${plan.intent?.missing?.join(", ") || "more detail"}.`);
      return;
    }

    if (wallet.address && deliveryMode === "now") {
      const readiness = await verifyReadiness({ account: wallet.address, intent: plan.intent });
      if (!readiness.ok) {
        setStatus("error");
        setMessage(readiness.message || "Cepolia Skill could not verify readiness.");
        return;
      }
    }

    // Pre-resolve contact label against Supabase so the review screen skips the picker
    // when the user has already saved this recipient. Uses cached session only — never
    // triggers personal_sign here; that happens explicitly in pickContact.
    const labelForAudit = plan?.receiptLabel || plan?.recipient || plan?.intent?.receiptLabel || "";
    if (SUPABASE_READY && wallet.address && labelForAudit) {
      try {
        const session = await getCachedSession();
        if (session) {
          const contact = await findContactByLabel({ ownerWallet: wallet.address, label: labelForAudit });
          if (contact?.wallet_address) {
            onContactResolved(labelForAudit.toLowerCase(), {
              address: contact.wallet_address,
              label: contact.label,
              phone: "",
              source: "contacts",
              contactId: contact.id,
            });
          }
        }
      } catch (contactError) {
        console.warn("Contact lookup failed:", contactError.message);
      }
    }

    setStatus(wallet.address ? "review" : "idle");
    setMessage(wallet.address ? "Review the action before signing." : "Connect your wallet so Choco can check stablecoin funds.");
    onNavigate("review");
  }

  function commitReceipt(plan, hash, approveHash, recipientAddress, reviewMode) {
    const committedPlan = {
      ...plan,
      hash,
      approveHash,
      status: plan.deliveryMode === "now" ? "Sent" : "Active",
    };
    const type = plan.deliveryMode === "now"
      ? "Action sent"
      : reviewMode === "update" ? "Plan updated" : "Plan authorized";
    const transaction = buildTransactionFromPlan(committedPlan, type, wallet.address, recipientAddress);
    setLastReceipt(transaction);
    if (plan.deliveryMode === "schedule") {
      onTransactionCreated("");
      onNavigate("plans");
    } else {
      onTransactionCreated(transaction.id);
      onNavigate("receiptDetail");
    }
  }

  async function confirmAction(reviewPlan, recipientAddress, reviewMode) {
    try {
      // Wallet connect on demand (rare path — actionReady gate normally ensures address is set)
      let address = wallet.address;
      if (!address) {
        setStatus("pending");
        setMessage("Opening wallet...");
        address = await wallet.verifyWallet();
        await onRefreshBalances(address);
        if (!address) return;
      }

      setStatus("pending");
      setMessage(reviewPlan.deliveryMode === "now"
        ? "Preparing wallet-signed send now..."
        : "Preparing wallet-signed monthly action...");

      const result = reviewPlan.deliveryMode === "now"
        ? await sendNow({ account: address, recipient: recipientAddress, intent: reviewPlan.intent })
        : await createScheduleViaRegistry({ account: address, recipient: recipientAddress, intent: reviewPlan.intent });

      setApprovalHash(result.approveHash || "");
      setTxHash(result.hash);
      setStatus("success");
      setMessage(reviewPlan.deliveryMode === "now"
        ? "Money sent from your wallet. Receipt filed."
        : "Monthly plan authorized. Choco can auto-run it on the scheduled day.");

      // Navigate first so the user doesn't stay on the review screen while the
      // ledger sync runs (which could take 5-10 s and leaves the button re-enabled).
      commitReceipt(reviewPlan, result.hash, result.approveHash || "", recipientAddress, reviewMode);

      if (reviewPlan.deliveryMode === "schedule") {
        onRefreshLedger().catch(() => {});
      }
      onRefreshBalances(address).catch(() => {});
      window.setTimeout(() => { onRefreshLedger().catch(() => {}); }, 3000);
      window.setTimeout(() => { onRefreshLedger().catch(() => {}); }, 8000);
    } catch (error) {
      setStatus("error");
      setMessage(humaniseTransferError(error));
    }
  }

  return {
    approvalHash,
    txHash,
    lastReceipt,
    showSuccessModal, setShowSuccessModal,
    buildPlan,
    confirmAction,
  };
}
