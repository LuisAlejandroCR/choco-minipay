// Plan + transaction builders: turn a typed command / parsed intent into the plan and receipt objects
// the UI renders.
import { parseTransferIntent } from "../lib/intent.js";
import { APP_CONFIG } from "../lib/app-config.js";
import { labelWithAddress, shortAddress } from "../lib/celo.js";
import { KES_PER_USDC } from "../config/runtime.js";
import {
  CHOCO_SCENARIO,
  defaultPlan,
  formatRouteEstimate,
  getNextDateForIntent,
  getScheduleLabelForIntent,
} from "../data/chocoScenario.js";
import { getMovementTimestamp, getTransactionStatus, getRecipientContactLabel } from "./planDerive.js";

export function buildPlanFromIntent(intent, basePlan = defaultPlan, selectedDeliveryMode = "") {
  const deliveryMode = selectedDeliveryMode || intent.deliveryMode || "schedule";
  const amount = intent.amountKes ? intent.amountKes.toLocaleString("en-US") : "";
  const recipient = intent.recipientAlias || "";
  return {
    ...basePlan,
    amount,
    amountMinor: intent.amountKes,
    recipient,
    receiptLabel: intent.receiptLabel || recipient,
    contactResolutionRequired: Boolean(intent.contactResolutionRequired),
    amountKes: intent.amountKes,
    asset: intent.transferAsset || intent.destinationAsset,
    payAsset: intent.sourceAsset,
    corridor: intent.corridor,
    cadence: deliveryMode === "now" ? null : "monthly",
    dayLabel: intent.dayLabel,
    schedule: deliveryMode === "now" ? "One-time send" : getScheduleLabelForIntent({ ...intent, deliveryMode }),
    nextDate: deliveryMode === "now" ? "Today" : getNextDateForIntent({ ...intent, deliveryMode }),
    routeEstimate: formatRouteEstimate(intent.amountKes, intent.sourceAsset, KES_PER_USDC, intent.sourceAmount),
    status: intent.isReady ? (deliveryMode === "now" ? "Ready" : "Active") : "Draft",
    deliveryMode,
    intent,
  };
}

export function buildSafePreviewPlan(commandText, basePlan = defaultPlan, deliveryMode = "schedule") {
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
        agent: { isReady: false, confidence: 0, missing: ["recipient", "amount", "currency"] },
        error: error.message,
      },
    };
  }
}

export function buildPlanFromCommand(commandText, basePlan = defaultPlan, selectedDeliveryMode = "") {
  const intent = parseTransferIntent(commandText, {
    kesPerUsdc: KES_PER_USDC,
    deliveryMode: selectedDeliveryMode,
  });
  return buildPlanFromIntent(intent, basePlan, selectedDeliveryMode);
}

export function buildTransactionFromPlan(plan, type = "Plan confirmed", fromAddress = "", toAddress = "") {
  // Fall back to the parsed intent so a freshly-sent receipt is never blank when a plan field
  // (recipient label resolved via a saved contact, amount) didn't make it onto the plan top-level.
  const recipientLabel = plan.recipient || plan.receiptLabel || plan.intent?.recipientAlias || plan.intent?.receiptLabel || "Recipient";
  const amountLabel = plan.amount
    || (plan.amountKes ? Number(plan.amountKes).toLocaleString("en-US") : "")
    || (plan.intent?.amountKes ? Number(plan.intent.amountKes).toLocaleString("en-US") : "");
  return {
    id: `tx-${Date.now()}`,
    planId: plan.id,
    recipient: recipientLabel,
    amount: amountLabel,
    asset: plan.asset,
    payAsset: plan.payAsset,
    schedule: plan.schedule,
    date: getMovementTimestamp(plan),
    status: getTransactionStatus(plan, type),
    hash: plan.hash || "",
    approveHash: plan.approveHash || "",
    routeEstimate: plan.routeEstimate,
    type,
    deliveryMode: plan.deliveryMode,
    from: fromAddress || CHOCO_SCENARIO.senderAddress,
    to: toAddress
      ? (plan.recipient && !/^\.\.\./.test(plan.recipient)
          ? labelWithAddress(getRecipientContactLabel(plan), toAddress)
          : shortAddress(toAddress))
      : plan.recipient || "Recipient",
    toAddress,
  };
}
