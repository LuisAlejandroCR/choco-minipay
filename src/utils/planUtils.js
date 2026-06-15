import { parseTransferIntent } from "../lib/intent.js";
import { KES_PER_USDC } from "../config/runtime.js";
import {
  CHOCO_SCENARIO,
  defaultPlan,
  formatRouteEstimate,
  getNextDateForIntent,
  getScenarioTimestamp,
  getScheduleLabelForIntent,
} from "../data/chocoScenario.js";

export const SPLASH_DURATION_MS = 1200;

export function formatLocalTimestamp(date = new Date()) {
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

export function formatLocalDate(date = new Date()) {
  return new Intl.DateTimeFormat("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  }).format(date);
}

export function formatHistoryDate(timestamp) {
  const datePart = String(timestamp).match(/\d{2}\/\d{2}\/\d{4}/)?.[0];
  if (!datePart) return timestamp;
  const [month, day] = datePart.split("/");
  return `${month}/${day}`;
}

export function getMovementTimestamp(plan) {
  if (plan.deliveryMode === "now") return formatLocalTimestamp();
  return getScenarioTimestamp(plan.nextDate);
}

export const deliveryModes = {
  now: { label: "Now", detail: "One-time" },
  schedule: { label: "Schedule", detail: "Repeat" },
};

export function getTimingLabel(item) {
  return item.deliveryMode === "now" ? "Send once now" : item.schedule;
}

export function getRecipientContactLabel(plan) {
  return plan.recipientContact || plan.recipient;
}

export function getPlanSignature(plan) {
  return [
    plan.recipient,
    plan.amount,
    plan.asset,
    getTimingLabel(plan),
  ].join("|").toLowerCase();
}

export function getMovementSignature(item) {
  return [
    item.recipient,
    item.amount,
    item.asset,
    item.deliveryMode || "schedule",
  ].join("|").toLowerCase();
}

export function findSimilarPlan(plans, candidate, excludeId = "") {
  if (!candidate || candidate.deliveryMode === "now") return null;
  const candidateSignature = getPlanSignature(candidate);
  return plans.find((plan) => plan.id !== excludeId && getPlanSignature(plan) === candidateSignature) || null;
}

export function findRecentSimilarTransfer(transactions, candidate) {
  if (!candidate || candidate.deliveryMode !== "now") return null;
  const lastTransfer = transactions.find((item) => item.deliveryMode === "now");
  if (!lastTransfer) return null;
  return getMovementSignature(lastTransfer) === getMovementSignature(candidate) ? lastTransfer : null;
}

export function getSimilarPlanIds(plans) {
  const groups = new Map();
  plans.forEach((plan) => {
    const signature = getPlanSignature(plan);
    groups.set(signature, [...(groups.get(signature) || []), plan.id]);
  });
  return new Set(
    [...groups.values()].filter((ids) => ids.length > 1).flat(),
  );
}

export function getTransactionStatus(plan, type) {
  if (type === "Action sent") return "Sent";
  if (plan.deliveryMode === "now") return "Sent";
  if (type === "Plan updated") return "Updated";
  return "Scheduled";
}

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
    schedule: deliveryMode === "now" ? "Send once now" : getScheduleLabelForIntent({ ...intent, deliveryMode }),
    nextDate: deliveryMode === "now" ? "Today" : getNextDateForIntent({ ...intent, deliveryMode }),
    routeEstimate: formatRouteEstimate(intent.amountKes, intent.sourceAsset, KES_PER_USDC, intent.sourceAmount),
    status: intent.isReady ? (deliveryMode === "now" ? "Ready" : "Active") : "Draft",
    deliveryMode,
    intent,
  };
}

export function buildPlanFromCommand(commandText, basePlan = defaultPlan, selectedDeliveryMode = "") {
  const intent = parseTransferIntent(commandText, {
    kesPerUsdc: KES_PER_USDC,
    deliveryMode: selectedDeliveryMode,
  });
  return buildPlanFromIntent(intent, basePlan, selectedDeliveryMode);
}

export function buildTransactionFromPlan(plan, type = "Plan confirmed", fromAddress = "", toAddress = "") {
  return {
    id: `tx-${Date.now()}`,
    planId: plan.id,
    recipient: plan.recipient || "Recipient",
    amount: plan.amount,
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
    to: plan.recipient ? `${getRecipientContactLabel(plan)} - MiniPay contact` : "Recipient pending",
    toAddress,
  };
}

export function formatDemoTime(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}
