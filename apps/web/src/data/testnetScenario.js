import {
  DEFAULT_KES_PER_USDC,
  estimateUsdcForKes,
  formatUsdcAmount,
} from "@core/domain/amounts.js";

export const TESTNET_SCENARIO = {
  senderAddress: "0xb7b2...0426d",
  scheduledTimeLabel: "9:00 AM",
  defaultAmountKes: 10,
  kesPerUsdc: DEFAULT_KES_PER_USDC,
  scheduledTimestamp: "Next 1st · 9:00 AM Local",
  scheduledTimestampsByDate: {
    "15th": "Next 15th · 9:00 AM Local",
    "Next Monday": "Next Monday · 9:00 AM Local",
  },
  hashes: {
    default: "0x8f34...celo-sepolia-309",
    updated: "0x43b2...celo-sepolia-309",
  },
};

export const DEFAULT_COMMANDS = {
  schedule: "send my mum 10 KES every 1st",
  now: "send my mum 10 KES now",
  edit: (recipient) => `change ${recipient}'s plan to 25 KES every 15th`,
};

export function formatRouteEstimate(amountKes, sourceAsset = "USDC", kesPerUsdc = TESTNET_SCENARIO.kesPerUsdc) {
  return `$${formatUsdcAmount(estimateUsdcForKes(amountKes, kesPerUsdc))} ${sourceAsset}`;
}

export function getScheduleLabelForIntent(intent) {
  if (intent.deliveryMode === "now") return "Send once now";
  if (intent.cadence === "weekly") return `Every ${intent.dayLabel} - ${TESTNET_SCENARIO.scheduledTimeLabel}`;
  return `Every ${intent.dayLabel} - ${TESTNET_SCENARIO.scheduledTimeLabel}`;
}

export function getNextDateForIntent(intent) {
  if (intent.deliveryMode === "now") return "Today";
  if (intent.cadence === "weekly") return "Next Monday";
  if (intent.dayLabel === "15th") return "15th";
  return "1st";
}

export const defaultPlan = {
  id: "mom-monthly",
  amount: String(TESTNET_SCENARIO.defaultAmountKes),
  asset: "KESm",
  corridor: "US to Kenya",
  payAsset: "USDC",
  recipient: "Mom",
  schedule: `Every 1st - ${TESTNET_SCENARIO.scheduledTimeLabel}`,
  nextDate: "1st",
  fee: "0.1%",
  routeEstimate: formatRouteEstimate(TESTNET_SCENARIO.defaultAmountKes),
  hash: TESTNET_SCENARIO.hashes.default,
  status: "Active",
  deliveryMode: "schedule",
};

export const defaultTransaction = {
  id: "tx-july-1",
  planId: defaultPlan.id,
  recipient: defaultPlan.recipient,
  amount: defaultPlan.amount,
  asset: defaultPlan.asset,
  payAsset: defaultPlan.payAsset,
  schedule: defaultPlan.schedule,
  date: TESTNET_SCENARIO.scheduledTimestamp,
  status: "Scheduled",
  hash: defaultPlan.hash,
  routeEstimate: defaultPlan.routeEstimate,
  type: "Scheduled run",
  deliveryMode: defaultPlan.deliveryMode,
  from: TESTNET_SCENARIO.senderAddress,
  to: defaultPlan.recipient,
};

export function getScenarioTimestamp(nextDate) {
  return TESTNET_SCENARIO.scheduledTimestampsByDate[nextDate] || TESTNET_SCENARIO.scheduledTimestamp;
}
