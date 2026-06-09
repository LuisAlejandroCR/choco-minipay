import {
  DEFAULT_KES_PER_USDC,
  DEFAULT_TEST_KES_AMOUNT,
  estimateUsdcForKes,
  parseKesAmount,
} from "./amounts.js";

export const DEFAULT_CORRIDOR = "US to Kenya";
export const DEFAULT_SOURCE_ASSET = "USDC";
export const DEFAULT_DESTINATION_ASSET = "KESm";

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

  if (/\b15(th)?\b/.test(normalized)) {
    return { deliveryMode: "schedule", cadence: "monthly", dayLabel: "15th" };
  }

  return { deliveryMode: "schedule", cadence: "monthly", dayLabel: "1st" };
}

export function parseTransferIntent(commandText, options = {}) {
  const schedule = parseSchedule(commandText, options.deliveryMode);
  const amountMinor = parseKesAmount(commandText, options.fallbackAmount ?? DEFAULT_TEST_KES_AMOUNT);
  const kesPerUsdc = Number(options.kesPerUsdc || DEFAULT_KES_PER_USDC);

  return {
    rawCommand: commandText,
    recipientAlias: parseRecipientAlias(commandText),
    amountMinor,
    sourceAsset: options.sourceAsset || DEFAULT_SOURCE_ASSET,
    destinationAsset: options.destinationAsset || DEFAULT_DESTINATION_ASSET,
    estimatedSourceAmount: estimateUsdcForKes(amountMinor, kesPerUsdc),
    kesPerUsdc,
    corridor: options.corridor || DEFAULT_CORRIDOR,
    ...schedule,
  };
}
