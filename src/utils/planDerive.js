// Derived plan/movement values: execution state, timing labels, signatures, and duplicate detection.
import { scheduledLocalDateForPlan } from "../lib/schedule-time.js";
import { getScenarioTimestamp } from "../data/chocoScenario.js";
import { formatLocalTimestamp } from "./planFormat.js";

export const deliveryModes = {
  now: { label: "Now", detail: "One-time" },
  schedule: { label: "Schedule", detail: "Repeat" },
};

export function getTimingLabel(item) {
  return item.deliveryMode === "now" ? "Send once now" : item.schedule;
}

export function getMovementTimestamp(plan) {
  if (plan.deliveryMode === "now") return formatLocalTimestamp();
  return getScenarioTimestamp(plan.nextDate);
}

export function getPlanExecutionState(plan, now = new Date()) {
  if (!plan || plan.deliveryMode === "now") {
    return { status: plan?.status || "Ready", label: plan?.status || "Ready", tone: "neutral" };
  }
  if (plan.status === "Paused" || plan.active === false) {
    return { status: "Paused", label: "Paused", tone: "paused" };
  }

  const day = Number(plan.dayOfMonth || String(plan.dayLabel || "").match(/\d+/)?.[0] || 0);
  const nowMs = now.getTime();
  const firstRunAtMs = plan.firstRunAt ? Number(plan.firstRunAt) * 1000 : 0;
  const lastSettlementAtMs = plan.lastSettlementAt ? Number(plan.lastSettlementAt) * 1000 : 0;

  const settledDate = lastSettlementAtMs ? new Date(lastSettlementAtMs) : null;
  const settledThisMonth = Boolean(
    settledDate &&
    settledDate.getFullYear() === now.getFullYear() &&
    settledDate.getMonth() === now.getMonth(),
  );
  if (settledThisMonth) {
    return { status: "Run recorded", label: "Run recorded", tone: "success" };
  }

  if (!day) return { status: "Authorized", label: "Authorized", tone: "neutral" };
  const firstRunDate = firstRunAtMs ? new Date(firstRunAtMs) : null;
  const firstRunIsToday = Boolean(
    firstRunDate &&
    firstRunDate.getFullYear() === now.getFullYear() &&
    firstRunDate.getMonth() === now.getMonth() &&
    firstRunDate.getDate() === now.getDate(),
  );

  if (firstRunAtMs && firstRunAtMs > nowMs) {
    return firstRunIsToday
      ? { status: "Runs today", label: "Runs today", tone: "due" }
      : { status: "Authorized", label: "Authorized", tone: "neutral" };
  }

  const scheduledToday = scheduledLocalDateForPlan(plan, now);
  const scheduledAtMs = scheduledToday?.getTime() || 0;
  const today = now.getDate();
  if (today === day && scheduledAtMs && nowMs < scheduledAtMs) {
    return { status: "Runs today", label: "Runs today", tone: "due" };
  }
  if ((today === day && (!scheduledAtMs || nowMs >= scheduledAtMs)) || today > day) {
    return { status: "Awaiting auto-run", label: "Awaiting run", tone: "warning" };
  }
  return { status: "Authorized", label: "Authorized", tone: "neutral" };
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
