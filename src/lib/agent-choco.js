import { APP_CONFIG } from "./app-config.js";

const RECIPIENT_ALIASES = [
  [/\b(mum|mom|mother|mama)\b/i, "Mum"],
  [/\b(dad|father|papa)\b/i, "Dad"],
  [/\b(sister|sis)\b/i, "Sister"],
  [/\b(aunt|auntie)\b/i, "Auntie"],
  [/\b(brother|bro)\b/i, "Brother"],
];

const CURRENCY_ALIASES = [
  [/\b(cke|ckes|c-kes|kes|kesm|kenyan shillings?|shillings?)\b/i, APP_CONFIG.assets.destination],
  [/\b(usdc)\b/i, APP_CONFIG.assets.source],
];

const RESERVED_RECIPIENT_WORDS = new Set([
  "cke",
  "ckes",
  "c-kes",
  "every",
  "kes",
  "kesm",
  "now",
  "schedule",
  "today",
  "tomorrow",
  "usdc",
]);

export function normalizeCommand(text) {
  return String(text || "").trim().replace(/\s+/g, " ");
}

function formatRecipientLabel(value) {
  const label = String(value || "").trim().replace(/\b(my|the|a)\b/gi, "").trim();
  if (!label) return "";
  return label[0] + label.slice(1);
}

function isReservedRecipient(value) {
  return RESERVED_RECIPIENT_WORDS.has(String(value || "").trim().toLowerCase());
}

export function detectRecipient(text) {
  const command = normalizeCommand(text);
  for (const [pattern] of RECIPIENT_ALIASES) {
    const match = command.match(pattern);
    if (match?.[1]) return { label: match[1], source: "family-alias", confidence: 0.9 };
  }

  const toRecipient = command.match(/\bto\s+([a-z][a-z.'-]{1,32})\b/i);
  if (toRecipient?.[1]) {
    const label = formatRecipientLabel(toRecipient[1]);
    if (label && !isReservedRecipient(label)) return { label, source: "to-clause", confidence: 0.86 };
  }

  if (/\bpay\s+rent\b/i.test(command)) {
    return { label: "Rent", source: "bill-intent", confidence: 0.76 };
  }

  const leadingRecipient = command.match(/^([a-z][a-z.'-]{1,32})\s+\d/i);
  if (leadingRecipient?.[1]) {
    const label = formatRecipientLabel(leadingRecipient[1]);
    if (label && !isReservedRecipient(label)) return { label, source: "leading-name", confidence: 0.84 };
  }

  const amountFirstRecipient = command.match(/^\d+(?:\.\d+)?\s*(?:k|cke|ckes|c-kes|kes|kesm|usdc)?\s+([a-z][a-z.'-]{1,32})(?:\s|$)/i);
  if (amountFirstRecipient?.[1]) {
    const label = formatRecipientLabel(amountFirstRecipient[1]);
    if (label && !isReservedRecipient(label)) return { label, source: "amount-first-name", confidence: 0.82 };
  }

  const explicit = command.match(/\b(?:send|pay|transfer)\s+(?:to\s+)?([a-z][a-z\s.'-]{1,32}?)(?:\s+\d|\s+(?:cke|cKES|KES|KESm|USDC|now|every|tomorrow|on)\b|$)/i);
  if (explicit?.[1]) {
    const label = formatRecipientLabel(explicit[1]);
    if (label && !isReservedRecipient(label)) return { label, source: "text", confidence: 0.72 };
  }

  return { label: "", source: "missing", confidence: 0 };
}

export function detectAmount(text) {
  const command = normalizeCommand(text).replace(/,/g, "");
  const explicit = command.match(/(\d+(?:\.\d+)?)(?!\s*(?:st|nd|rd|th|am|pm)\b)\s*(cke|cKES|c-kes|KESm|KES|USDC|shillings?|k)?/i);
  if (!explicit) return { value: 0, raw: "", confidence: 0 };

  const amount = Number(explicit[1]);
  const suffix = String(explicit[2] || "").toLowerCase();
  const multiplier = suffix === "k" ? 1000 : 1;
  return {
    value: Math.max(1, Math.round(amount * multiplier)),
    raw: explicit[0],
    confidence: Number.isFinite(amount) ? 0.96 : 0,
  };
}

export function detectCurrency(text) {
  const command = normalizeCommand(text);
  for (const [pattern, code] of CURRENCY_ALIASES) {
    if (pattern.test(command)) return { code, confidence: 0.95 };
  }
  return { code: "", confidence: 0 };
}

function clampScheduleDay(day) {
  return Math.min(28, Math.max(1, Math.trunc(Number(day) || 1)));
}

function detectClockTime(command) {
  const twelveHour = command.match(/\b(?:at\s*)?(\d{1,2})(?::([0-5]\d))?\s*(am|pm)\b/i);
  if (twelveHour) {
    let hour = Number(twelveHour[1]);
    const minute = Number(twelveHour[2] || 0);
    const meridiem = twelveHour[3].toLowerCase();
    if (hour < 1 || hour > 12) return null;
    if (meridiem === "pm" && hour !== 12) hour += 12;
    if (meridiem === "am" && hour === 12) hour = 0;
    return { hour, minute };
  }

  const twentyFourHour = command.match(/\b(?:at\s*)?([01]?\d|2[0-3]):([0-5]\d)\b/i);
  if (twentyFourHour) {
    return { hour: Number(twentyFourHour[1]), minute: Number(twentyFourHour[2]) };
  }

  return null;
}

function buildExplicitFirstRunAt({ dayOffset = 0, clock = null, now = new Date() } = {}) {
  const runAt = new Date(now);
  runAt.setDate(runAt.getDate() + dayOffset);
  if (clock) runAt.setHours(clock.hour, clock.minute, 0, 0);
  return Math.floor(runAt.getTime() / 1000);
}

function buildMonthlyFirstRunAt(dayOfMonth, clock, now = new Date()) {
  const runAt = new Date(now);
  runAt.setDate(clampScheduleDay(dayOfMonth));
  runAt.setHours(clock.hour, clock.minute, 0, 0);
  if (runAt.getTime() <= new Date(now).getTime()) runAt.setMonth(runAt.getMonth() + 1);
  return Math.floor(runAt.getTime() / 1000);
}

export function detectTiming(text, selectedDeliveryMode = "", now = new Date()) {
  const command = normalizeCommand(text).toLowerCase();
  if (!command) return { deliveryMode: selectedDeliveryMode || "now", dayOfMonth: 1, label: "", confidence: 0 };

  const clock = detectClockTime(command);
  const hasToday = /\btoday\b/.test(command);
  const hasTomorrow = /\btomorrow\b/.test(command);
  const explicitNow = /\b(now|immediately|right away)\b/.test(command);

  if (explicitNow || (hasToday && selectedDeliveryMode !== "schedule" && !clock)) {
    return { deliveryMode: "now", dayOfMonth: 1, label: "Now", confidence: 0.95 };
  }

  if (hasTomorrow) {
    const firstRunAt = buildExplicitFirstRunAt({ dayOffset: 1, clock, now });
    const tomorrow = new Date(firstRunAt * 1000);
    return {
      deliveryMode: "schedule",
      dayOfMonth: clampScheduleDay(tomorrow.getDate()),
      firstRunAt,
      label: "Tomorrow",
      confidence: 0.9,
    };
  }

  const ordinal = command.match(/\bevery\s+(\d{1,2})(?:st|nd|rd|th)?\b/i);
  if (ordinal) {
    const day = clampScheduleDay(ordinal[1]);
    return {
      deliveryMode: "schedule",
      dayOfMonth: day,
      firstRunAt: clock ? buildMonthlyFirstRunAt(day, clock, now) : undefined,
      label: `Every ${formatDay(day)}`,
      confidence: Number.isFinite(day) ? 0.95 : 0,
    };
  }

  if ((hasToday || clock) && (selectedDeliveryMode === "schedule" || clock)) {
    const firstRunAt = clock ? buildExplicitFirstRunAt({ clock, now }) : undefined;
    const runAt = firstRunAt ? new Date(firstRunAt * 1000) : new Date(now);
    const day = clampScheduleDay(runAt.getDate());
    return {
      deliveryMode: "schedule",
      dayOfMonth: day,
      firstRunAt,
      label: hasToday ? "Today" : `Every ${formatDay(day)}`,
      confidence: clock ? 0.95 : 0.82,
    };
  }

  if (selectedDeliveryMode === "now") return { deliveryMode: "now", dayOfMonth: 1, label: "Now", confidence: 0.7 };
  if (!selectedDeliveryMode && /\b(send|pay|transfer)\b/.test(command)) {
    return { deliveryMode: "now", dayOfMonth: 1, label: "Now", confidence: 0.82 };
  }
  return { deliveryMode: "schedule", dayOfMonth: 1, label: "", confidence: 0.58 };
}

export function formatDay(day) {
  if (day === 1) return "1st";
  if (day === 2) return "2nd";
  if (day === 3) return "3rd";
  return `${day}th`;
}

export function buildAgentChocoIntent(text, options = {}) {
  const rawCommand = normalizeCommand(text);
  const recipient = detectRecipient(rawCommand);
  const amount = detectAmount(rawCommand);
  const currency = detectCurrency(rawCommand);
  const timing = detectTiming(rawCommand, options.deliveryMode, options.now || new Date());
  const signals = [recipient.confidence, amount.confidence, currency.confidence, timing.confidence];
  const confidence = Math.round((signals.reduce((sum, value) => sum + value, 0) / signals.length) * 100) / 100;
  const missing = [
    !recipient.label ? "recipient" : "",
    !amount.value ? "amount" : "",
    !currency.code ? "currency" : "",
    timing.confidence < 0.7 ? "timing" : "",
  ].filter(Boolean);

  return {
    rawCommand,
    recipient,
    amount,
    currency,
    timing,
    confidence,
    minimumConfidence: APP_CONFIG.transfer.minimumConfidence,
    missing,
    isReady: missing.length === 0 && confidence >= APP_CONFIG.transfer.minimumConfidence,
  };
}

