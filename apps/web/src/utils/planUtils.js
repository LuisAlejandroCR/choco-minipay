// planUtils.js — pure module-scope helpers extracted from App.jsx.
// App.jsx imports everything it needs from here; screen files import
// only the helpers they actually call.
import { formatKesAmount } from "@core/domain/amounts.js";
import { parseTransferIntent } from "@core/domain/intent.js";
import {
  KES_PER_USDC,
  SHOW_DEMO_PROMPT,
} from "../config/runtime.js";
import {
  TESTNET_SCENARIO,
  defaultPlan,
  formatRouteEstimate,
  getNextDateForIntent,
  getScenarioTimestamp,
  getScheduleLabelForIntent,
} from "../data/testnetScenario.js";

export const SPLASH_DURATION_MS = 2600;

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
  if (datePart === formatLocalDate()) return "Today";
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
  if (plan.deliveryMode === "now") return "Preflight";
  if (type === "Plan updated") return "Updated";
  return "Scheduled";
}

export function buildPlanFromIntent(intent, basePlan = defaultPlan) {
  return {
    ...basePlan,
    amount: formatKesAmount(intent.amountMinor),
    recipient: intent.recipientAlias,
    // Preserve raw intent fields so the worker and packages/core/duplicates.js can
    // operate on them without reformatting — Block 14 convergence prerequisite.
    amountMinor: intent.amountMinor,
    cadence: intent.cadence ?? null,
    dayLabel: intent.dayLabel ?? null,
    schedule: getScheduleLabelForIntent(intent),
    nextDate: getNextDateForIntent(intent),
    routeEstimate: formatRouteEstimate(intent.amountMinor, intent.sourceAsset, KES_PER_USDC),
    status: intent.deliveryMode === "now" ? "Ready" : "Active",
    deliveryMode: intent.deliveryMode,
  };
}

export function buildPlanFromCommand(commandText, basePlan = defaultPlan, selectedDeliveryMode = "") {
  const intent = parseTransferIntent(commandText, {
    deliveryMode: selectedDeliveryMode,
    fallbackAmount: basePlan.amount,
    sourceAsset: basePlan.payAsset,
    destinationAsset: basePlan.asset,
    corridor: basePlan.corridor,
    kesPerUsdc: KES_PER_USDC,
  });
  return buildPlanFromIntent(intent, basePlan);
}

export function buildTransactionFromPlan(plan, type = "Plan confirmed", fromAddress = "", toAddress = "") {
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
    toAddress, // resolved 0x wallet address; "" until Block 11 contact is saved
  };
}

export function shouldShowDemoPrompt() {
  return SHOW_DEMO_PROMPT;
}

export function rememberDemoChoice() {
  try {
    window.localStorage.setItem("choco-demo-seen", "yes");
  } catch {
    // Local storage is optional in embedded browsers.
  }
}

export function formatDemoTime(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}
