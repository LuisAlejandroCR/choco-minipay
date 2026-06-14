import { APP_CONFIG } from "./app-config.js";
import { buildAgentChocoIntent, formatDay, normalizeCommand } from "./agent-choco.js";

export const DEFAULT_COMMAND = "";
export const DEFAULT_KES_PER_USDC = APP_CONFIG.transfer.kesPerUsdc;
export const MONTH_SECONDS = 30 * 24 * 60 * 60;

export { formatDay, normalizeCommand };

export function nextMonthlyRun(dayOfMonth, from = new Date()) {
  const now = new Date(from);
  const next = new Date(now);
  next.setUTCSeconds(0, 0);
  next.setUTCHours(APP_CONFIG.transfer.defaultScheduleHour, 0, 0, 0);
  next.setUTCDate(dayOfMonth);
  if (next.getTime() <= now.getTime()) {
    next.setUTCMonth(next.getUTCMonth() + 1);
    next.setUTCDate(dayOfMonth);
  }
  return Math.floor(next.getTime() / 1000);
}

export function estimateUsdcForKes(kesAmount, kesPerUsdc = DEFAULT_KES_PER_USDC) {
  if (!Number(kesAmount)) return 0;
  const value = Number(kesAmount) / Number(kesPerUsdc || DEFAULT_KES_PER_USDC);
  return Math.ceil(value * 100) / 100;
}

export function parseTransferIntent(text, options = {}) {
  const command = normalizeCommand(text);
  const agent = buildAgentChocoIntent(command, options);
  const dayOfMonth = agent.timing.dayOfMonth;
  const firstRunAt = nextMonthlyRun(dayOfMonth, options.now || new Date());
  const kesPerUsdc = Number(options.kesPerUsdc || DEFAULT_KES_PER_USDC);
  const inputAsset = agent.currency.code;
  const destinationAsset = APP_CONFIG.assets.destination;
  const sourceAsset = APP_CONFIG.assets.source;
  const currencyInferred = !inputAsset && Boolean(agent.recipient.label && agent.amount.value && agent.timing.confidence >= 0.7);
  const missing = agent.missing.filter((field) => !(field === "currency" && currencyInferred));
  const confidence = currencyInferred
    ? Math.round(((agent.recipient.confidence + agent.amount.confidence + 0.86 + agent.timing.confidence) / 4) * 100) / 100
    : agent.confidence;
  const isSourceAmount = inputAsset === sourceAsset;
  const sourceAmount = isSourceAmount ? agent.amount.value : estimateUsdcForKes(agent.amount.value, kesPerUsdc);
  const amountKes = isSourceAmount ? Math.max(1, Math.round(agent.amount.value * kesPerUsdc)) : agent.amount.value;
  const isReady = missing.length === 0 && confidence >= agent.minimumConfidence;

  return {
    rawCommand: command,
    agent,
    isReady,
    missing,
    confidence,
    minimumConfidence: agent.minimumConfidence,
    recipientAlias: agent.recipient.label,
    recipientSource: agent.recipient.source,
    receiptLabel: agent.recipient.label,
    // Always require contact resolution for labels (family-alias, bill-intent, etc.)
    // The user must paste the wallet address and optionally save to Supabase
    contactResolutionRequired: Boolean(agent.recipient.label),
    amountKes,
    amountLabel: amountKes ? `${amountKes.toLocaleString("en-US")} ${destinationAsset}` : "",
    transferAsset: destinationAsset,
    sourceAsset,
    sourceAmount,
    sourceAmountLabel: sourceAmount ? `${sourceAmount.toLocaleString("en-US", { maximumFractionDigits: 2 })} ${sourceAsset}` : "",
    destinationAsset,
    destinationAmount: amountKes,
    destinationAmountLabel: amountKes ? `${amountKes.toLocaleString("en-US")} ${destinationAsset}` : "",
    destinationCurrency: destinationAsset,
    inputAsset,
    currencyInferred,
    deliveryMode: agent.timing.deliveryMode,
    dayOfMonth,
    dayLabel: formatDay(dayOfMonth),
    cadenceLabel: agent.timing.label || `Every ${formatDay(dayOfMonth)} of the month`,
    firstRunAt,
    firstRunLabel: new Intl.DateTimeFormat("en", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    }).format(new Date(firstRunAt * 1000)),
    estimatedUsdc: sourceAmount,
    kesPerUsdc,
    corridor: APP_CONFIG.transfer.corridor,
    retryPolicy: APP_CONFIG.transfer.retryPolicy,
  };
}
