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

export function mapSettlementToMovement(log, schedule, timestamp) {
  const a = log.args;
  const amountKes = Math.round(unitsToNumber(a.destinationAmount, 18));
  return {
    id: `settle-${log.transactionHash}-${log.logIndex}`,
    planId: `schedule-${a.id}`,
    recipient: schedule ? tailAddress(schedule.recipient) : "Recipient",
    amount: amountKes.toLocaleString("en-US"),
    asset: APP_CONFIG.assets.destination,
    payAsset: schedule && isCkesAsset(schedule.sourceAsset) ? APP_CONFIG.assets.destination : APP_CONFIG.assets.source,
    schedule: schedule ? formatScheduleLabel(formatDay(schedule.dayOfMonth), schedule.firstRunAt) : "Scheduled",
    date: formatChainDate(timestamp),
    status: a.success ? "Sent" : "Failed",
    hash: log.transactionHash,
    type: a.success ? "Settlement sent" : "Settlement failed",
    deliveryMode: "schedule",
    from: schedule ? schedule.owner : "",
    to: schedule ? tailAddress(schedule.recipient) : "Recipient",
    toAddress: schedule ? schedule.recipient : "",
    routeEstimate: "",
    sortKey: timestamp || 0,
  };
}

// Label the route by the protocols actually used, derived from the ledger note. The UniV3 swap
// contracts (notes …-v3 / -exact-v3 / -exact-v4) bridge USDC->USDm via Mento and USDm->KESm via
// Uniswap V3; the Mento-only gateway routes both hops through Mento.
export function routeLabelFromNote(note) {
  const n = String(note || "").toLowerCase();
  if (n.includes("v3") || n.includes("univ3") || n.includes("uniswap")) return "Mento + Uniswap V3";
  return "Mento";
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
    routeEstimate: `${usdcIn} ${APP_CONFIG.assets.source} -> ${amountKes} ${APP_CONFIG.assets.destination} via ${routeLabelFromNote(a.note)}`,
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
