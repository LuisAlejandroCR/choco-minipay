import { formatUnits, isAddress } from "viem";
import { APP_CONFIG } from "../lib/app-config.js";
import { formatScheduleLabel } from "../lib/schedule-time.js";
import { ADDRESSES, shortAddress } from "./client.js";

export function uniqueAddresses(values = []) {
  const seen = new Set();
  return values
    .filter((value) => isAddress(value || ""))
    .map((value) => value)
    .filter((value) => {
      const key = String(value).toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function formatDay(day) {
  const value = Number(day);
  if (value === 1) return "1st";
  if (value === 2) return "2nd";
  if (value === 3) return "3rd";
  return `${value}th`;
}

export function formatChainDate(seconds) {
  if (!seconds) return "Pending";
  const date = new Date(Number(seconds) * 1000);
  const formatted = new Intl.DateTimeFormat("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(date);
  return `${formatted.replace(",", "")} Local`;
}

export function isCkesAsset(address) {
  return String(address).toLowerCase() === String(ADDRESSES.kesm).toLowerCase();
}

export function tailAddress(address) {
  return isAddress(address) ? shortAddress(address) : "Unknown";
}

export function unitsToNumber(value, decimals) {
  return Number(formatUnits(value ?? 0n, decimals));
}

export function logOrder(log) {
  return BigInt(log.blockNumber || 0n) * 100000n + BigInt(log.logIndex || 0);
}

export function mapScheduleToPlan(log, lastSettlementAt = 0, active = true) {
  const a = log.args;
  const amountKes = Math.round(Number(formatUnits(a.destinationAmount, 18)));
  const dayLabel = formatDay(a.dayOfMonth);
  return {
    id: `schedule-${a.id}`,
    onchainId: Number(a.id),
    recipient: tailAddress(a.recipient),
    recipientAddress: a.recipient,
    amount: amountKes.toLocaleString("en-US"),
    amountMinor: amountKes,
    amountKes,
    asset: APP_CONFIG.assets.destination,
    payAsset: isCkesAsset(a.sourceAsset) ? APP_CONFIG.assets.destination : APP_CONFIG.assets.source,
    // Per-run USDC the escrow locks/settles (0 for cKES-source plans). Used by the bell notices.
    usdcPerRun: isCkesAsset(a.sourceAsset) ? 0 : Number(formatUnits(a.sourceAmount, 6)),
    corridor: APP_CONFIG.transfer.corridor,
    schedule: formatScheduleLabel(dayLabel, a.firstRunAt),
    dayLabel,
    dayOfMonth: Number(a.dayOfMonth),
    nextDate: formatDay(a.dayOfMonth),
    firstRunAt: Number(a.firstRunAt || 0),
    lastSettlementAt,
    fee: APP_CONFIG.transfer.networkFeeLabel,
    routeEstimate: "",
    hash: log.transactionHash,
    status: active ? "Active" : "Paused",
    active,
    deliveryMode: "schedule",
  };
}

// When one contact (recipient address) has 2+ plans, their plan rows and Held entries otherwise read
// identically ("Mom", "Mom"). Tag each with a MINIMAL distinguishing suffix — amount, then +day,
// then +on-chain id — so they render e.g. "Mom · 50,000 KESm" vs "Mom · 30,000 KESm". Mutates each
// plan's `nameSuffix` and returns a Map(onchainId → suffix) so the matching Held movements reuse it.
export function assignPlanDisambiguators(plans = []) {
  const groups = new Map();
  for (const plan of plans) {
    if (!isAddress(plan.recipientAddress || "")) continue;
    const key = String(plan.recipientAddress).toLowerCase();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(plan);
  }
  const suffixByScheduleId = new Map();
  for (const group of groups.values()) {
    if (group.length < 2) continue; // only ambiguous when a contact has more than one plan
    const amountUnique = new Set(group.map((p) => p.amount)).size === group.length;
    const amountDayUnique = new Set(group.map((p) => `${p.amount}|${p.dayLabel}`)).size === group.length;
    for (const plan of group) {
      let suffix = `${plan.amount} ${plan.asset}`;
      if (!amountUnique) {
        suffix = amountDayUnique
          ? `${suffix} · ${plan.dayLabel}`
          : `${suffix} · ${plan.dayLabel} · #${plan.onchainId}`;
      }
      plan.nameSuffix = suffix;
      suffixByScheduleId.set(Number(plan.onchainId), suffix);
    }
  }
  return suffixByScheduleId;
}

// Held movements only carry a scheduleId; resolve each to its plan's recipient (so contact labels
// attach instead of a bare plan id) and the same disambiguation suffix the plan list uses. Pure.
export function enrichEscrowHistory(escrowHistory = [], scheduleById = new Map(), suffixByScheduleId = new Map()) {
  return escrowHistory.map((movement) => {
    const sched = movement.scheduleId ? scheduleById.get(String(movement.scheduleId)) : null;
    if (!sched?.recipient) return movement;
    const nameSuffix = suffixByScheduleId.get(Number(movement.scheduleId));
    return {
      ...movement,
      recipient: tailAddress(sched.recipient),
      recipientAddress: sched.recipient,
      toAddress: sched.recipient,
      ...(nameSuffix ? { nameSuffix } : {}),
    };
  });
}

function readScheduleAddress(schedule, primary, fallback = "") {
  return schedule?.[primary] || (fallback ? schedule?.[fallback] : "") || "";
}

function readScheduleSourceAmount(schedule) {
  if (!schedule) return 0;
  if (schedule.sourceAmount !== undefined && schedule.sourceAmount !== null && schedule.sourceAmount !== "") {
    try {
      return unitsToNumber(schedule.sourceAmount, 6);
    } catch {
      return Number(schedule.sourceAmount) || 0;
    }
  }
  return Number(schedule.payAmount || schedule.usdcPerRun || 0);
}
export function mapSettlementToMovement(log, schedule, timestamp) {
  const a = log.args;
  const amountKes = Math.round(unitsToNumber(a.destinationAmount, 18));
  const recipientAddress = readScheduleAddress(schedule, "recipient", "recipientAddress");
  const ownerAddress = readScheduleAddress(schedule, "owner", "from");
  const sourceAsset = schedule?.sourceAsset || "";
  const payAsset = sourceAsset
    ? isCkesAsset(sourceAsset) ? APP_CONFIG.assets.destination : APP_CONFIG.assets.source
    : schedule?.payAsset || APP_CONFIG.assets.source;
  const payAmount = readScheduleSourceAmount(schedule);
  const scheduleLabel = schedule?.schedule
    || (schedule ? formatScheduleLabel(formatDay(schedule.dayOfMonth), schedule.firstRunAt) : "Scheduled");
  const routeEstimate = payAmount
    ? `${Number(payAmount.toFixed(4))} ${payAsset} -> ${amountKes} ${APP_CONFIG.assets.destination} - ${routeCorridorLabel()}`
    : routeCorridorLabel();

  return {
    id: `settle-${log.transactionHash}-${log.logIndex}`,
    planId: `schedule-${a.id}`,
    recipient: recipientAddress ? tailAddress(recipientAddress) : "Recipient",
    recipientAddress,
    amount: amountKes.toLocaleString("en-US"),
    amountMinor: amountKes,
    asset: APP_CONFIG.assets.destination,
    payAsset,
    payAmount,
    schedule: scheduleLabel,
    date: formatChainDate(timestamp),
    status: a.success ? "Sent" : "Failed",
    hash: log.transactionHash,
    type: a.success ? "Settlement sent" : "Settlement failed",
    deliveryMode: "schedule",
    from: ownerAddress,
    to: recipientAddress ? tailAddress(recipientAddress) : "Recipient",
    toAddress: recipientAddress,
    routeEstimate,
    sortKey: timestamp || 0,
  };
}

// Show the corridor (e.g. "US to Kenya") rather than the underlying DEX path — the protocol names
// are noise for end users; the corridor is the meaningful detail.
export function routeCorridorLabel() {
  return APP_CONFIG.transfer.corridor;
}

export function mapAttemptToMovement(log, timestamp) {
  const a = log.args;
  const kind = Number(a.kind ?? 0);
  const isSuccess = kind === 0;
  const amountKes = Math.round(unitsToNumber(a.ckesAmount, 18));
  const usdcIn = unitsToNumber(a.usdcAmount, 6);

  return {
    id: `attempt-${String(a.attemptId ?? log.transactionHash)}-${log.logIndex}`,
    planId: "send-now",
    recipient: tailAddress(a.recipientWallet),
    recipientAddress: a.recipientWallet,
    amount: amountKes.toLocaleString("en-US"),
    amountMinor: amountKes,
    asset: APP_CONFIG.assets.destination,
    payAsset: APP_CONFIG.assets.source,
    payAmount: usdcIn,
    schedule: "Send once now",
    date: formatChainDate(timestamp),
    status: isSuccess ? "Sent" : "Failed",
    hash: log.transactionHash,
    type: isSuccess ? "USDC swap + KESm send" : "Send failed",
    deliveryMode: "now",
    from: a.senderWallet,
    to: tailAddress(a.recipientWallet),
    toAddress: a.recipientWallet,
    routeEstimate: `${usdcIn} ${APP_CONFIG.assets.source} -> ${amountKes} ${APP_CONFIG.assets.destination} · ${routeCorridorLabel()}`,
    sortKey: timestamp || 0,
  };
}

// Escrow lifecycle → movement. kind: "lock" (USDC reserved for the next run) or "refund" (returned).
export function mapEscrowToMovement(log, timestamp, kind) {
  const a = log.args;
  const usdc = unitsToNumber(a.usdcAmount, 6);
  const planNo = String(a.scheduleId);
  const isRefund = kind === "refund";
  return {
    id: `${isRefund ? "refund" : "held"}-${log.transactionHash}-${log.logIndex}`,
    planId: `schedule-${planNo}`,
    scheduleId: planNo, // used to enrich with the plan's recipient (contact name) in readOwnerLedger
    recipient: "Scheduled plan",
    recipientAddress: "",
    amount: usdc.toLocaleString("en-US", { maximumFractionDigits: 4 }),
    amountMinor: usdc,
    asset: APP_CONFIG.assets.source,
    payAsset: APP_CONFIG.assets.source,
    payAmount: usdc,
    schedule: isRefund ? "Returned to your wallet" : "Reserved for the next run",
    date: formatChainDate(timestamp),
    status: isRefund ? "Returned" : "Reserved",
    hash: log.transactionHash,
    type: isRefund ? "Returned to wallet" : "Reserved for next run",
    deliveryMode: "held",
    from: a.owner,
    to: "Scheduled plan",
    toAddress: "",
    routeEstimate: isRefund
      ? `${usdc} ${APP_CONFIG.assets.source} returned to your wallet`
      : `${usdc} ${APP_CONFIG.assets.source} held for the next run`,
    sortKey: timestamp || 0,
  };
}

export function isSendNowAttempt(log) {
  const note = String(log.args?.note || "").toLowerCase();
  return note.includes("send-now");
}

export function mergeSendNowHistory(primary = [], fallback = []) {
  const seen = new Set();
  return [...primary, ...fallback]
    .filter((tx) => {
      const key = tx.hash ? String(tx.hash).toLowerCase() : tx.id;
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => b.sortKey - a.sortKey);
}

export function composeMovementHistory({
  sendNowHistory = [],
  sendNowAttempts = [],
  settlements = [],
  scheduleById = new Map(),
  timeByBlock = new Map(),
} = {}) {
  return [
    ...mergeSendNowHistory(sendNowAttempts, sendNowHistory),
    ...settlements.map((log) =>
      mapSettlementToMovement(log, scheduleById.get(String(log.args.id)), timeByBlock.get(log.blockNumber))),
  ].sort((a, b) => b.sortKey - a.sortKey);
}
