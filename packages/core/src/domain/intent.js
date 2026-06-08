import { estimateUsdcForKes, parseKesAmount } from "./amounts.js";

export function parseRecipientAlias(text) {
  const normalized = String(text || "").toLowerCase();
  if (normalized.includes("sister")) return "Sister";
  if (normalized.includes("aunt")) return "Auntie";
  if (normalized.includes("dad")) return "Dad";
  if (normalized.includes("mum") || normalized.includes("mom") || normalized.includes("mother")) return "Mom";
  return "Family";
}

export function parseSchedule(text, deliveryMode = "schedule") {
  const normalized = String(text || "").toLowerCase();
  if (deliveryMode === "now" || /now|today|immediate|once/.test(normalized)) {
    return { deliveryMode: "now", cadence: "once", dayLabel: "today" };
  }

  if (/monday/.test(normalized)) {
    return { deliveryMode: "schedule", cadence: "weekly", dayLabel: "Monday" };
  }

  if (/15/.test(normalized)) {
    return { deliveryMode: "schedule", cadence: "monthly", dayLabel: "15th" };
  }

  return { deliveryMode: "schedule", cadence: "monthly", dayLabel: "1st" };
}

export function parseTransferIntent(commandText, options = {}) {
  const schedule = parseSchedule(commandText, options.deliveryMode);
  const amountMinor = parseKesAmount(commandText, options.fallbackAmount || 50000);

  return {
    rawCommand: commandText,
    recipientAlias: parseRecipientAlias(commandText),
    amountMinor,
    sourceAsset: options.sourceAsset || "USDC",
    destinationAsset: options.destinationAsset || "KESm",
    estimatedSourceAmount: estimateUsdcForKes(amountMinor),
    corridor: options.corridor || "US to Kenya",
    ...schedule,
  };
}
