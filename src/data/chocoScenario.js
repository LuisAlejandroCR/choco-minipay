import { DEFAULT_COMMAND, estimateUsdcForKes } from "../lib/intent.js";
import { APP_CONFIG } from "../lib/app-config.js";

export const CHOCO_SCENARIO = {
  senderAddress: "",
  scheduledTimeLabel: "9:00 AM",
  defaultAmountKes: 0,
  kesPerUsdc: APP_CONFIG.transfer.kesPerUsdc,
  scheduledTimestamp: "Next 1st - 9:00 AM Local",
  scheduledTimestampsByDate: {
    "15th": "Next 15th - 9:00 AM Local",
    "Next Monday": "Next Monday - 9:00 AM Local",
  },
  hashes: {
    default: "",
    updated: "",
  },
};

export const DEFAULT_COMMANDS = {
  schedule: DEFAULT_COMMAND,
  now: DEFAULT_COMMAND,
  edit: (recipient) => `change ${recipient || APP_CONFIG.recipients.defaultLabel}'s plan`,
};

export function formatRouteEstimate(amountKes, sourceAsset = "USDC", kesPerUsdc = CHOCO_SCENARIO.kesPerUsdc, sourceAmount = 0) {
  if (!Number(amountKes)) return "";
  if (sourceAsset === APP_CONFIG.assets.destination) return `Direct ${APP_CONFIG.assets.destination} transfer`;
  if (sourceAsset === APP_CONFIG.assets.source) {
    const payAmount = sourceAmount || estimateUsdcForKes(amountKes, kesPerUsdc);
    return `${Number(payAmount).toLocaleString("en-US", { maximumFractionDigits: 2 })} ${sourceAsset} -> ${Number(amountKes).toLocaleString("en-US")} ${APP_CONFIG.assets.destination} via Mento`;
  }
  return `${estimateUsdcForKes(amountKes, kesPerUsdc).toLocaleString("en-US")} ${sourceAsset}`;
}

export function getScheduleLabelForIntent(intent) {
  if (intent.deliveryMode === "now") return "Send once now";
  if (intent.cadence === "weekly") return `Every ${intent.dayLabel} - ${CHOCO_SCENARIO.scheduledTimeLabel}`;
  return `Every ${intent.dayLabel} - ${CHOCO_SCENARIO.scheduledTimeLabel}`;
}

export function getNextDateForIntent(intent) {
  if (intent.deliveryMode === "now") return "Today";
  if (intent.cadence === "weekly") return "Next Monday";
  if (intent.dayLabel === "15th") return "15th";
  return "1st";
}

export const defaultPlan = {
  id: "draft-plan",
  amount: "0",
  amountMinor: CHOCO_SCENARIO.defaultAmountKes,
  asset: APP_CONFIG.assets.destination,
  corridor: APP_CONFIG.transfer.corridor,
  payAsset: APP_CONFIG.assets.source,
  recipient: "",
  schedule: `Every 1st - ${CHOCO_SCENARIO.scheduledTimeLabel}`,
  nextDate: "1st",
  fee: "Network fee",
  routeEstimate: formatRouteEstimate(CHOCO_SCENARIO.defaultAmountKes),
  hash: CHOCO_SCENARIO.hashes.default,
  status: "Active",
  deliveryMode: "schedule",
};

export const defaultTransaction = {
  id: "",
  planId: defaultPlan.id,
  recipient: "",
  amount: defaultPlan.amount,
  asset: defaultPlan.asset,
  payAsset: defaultPlan.payAsset,
  schedule: defaultPlan.schedule,
  date: CHOCO_SCENARIO.scheduledTimestamp,
  status: "Pending",
  hash: "",
  routeEstimate: defaultPlan.routeEstimate,
  type: "Wallet action",
  deliveryMode: defaultPlan.deliveryMode,
  from: CHOCO_SCENARIO.senderAddress,
  to: "",
  toAddress: "",
};

export function getScenarioTimestamp(nextDate) {
  return CHOCO_SCENARIO.scheduledTimestampsByDate[nextDate] || CHOCO_SCENARIO.scheduledTimestamp;
}
