// ChocoGateway escrow lifecycle events. fundRun/lockFor lock a run's USDC (RunLocked); cancel/refund
// returns it (RunRefunded). Surfaced in movements history as "held funds" so the user can see where
// the USDC that left their wallet at plan creation went.
export const ESCROW_EVENTS_ABI = [
  {
    type: "event",
    name: "RunLocked",
    inputs: [
      { name: "owner", type: "address", indexed: true },
      { name: "scheduleId", type: "uint256", indexed: true },
      { name: "usdcAmount", type: "uint256", indexed: false },
      { name: "fundedBy", type: "address", indexed: true },
    ],
  },
  {
    type: "event",
    name: "RunRefunded",
    inputs: [
      { name: "owner", type: "address", indexed: true },
      { name: "scheduleId", type: "uint256", indexed: true },
      { name: "usdcAmount", type: "uint256", indexed: false },
    ],
  },
  // Gateway settlement confirmation — fund-backed (only emitted when settleScheduledRun actually swaps +
  // sends). Used to verify ledger SettlementReceipts aren't keeper-fabricated (audit M-2).
  {
    type: "event",
    name: "RunSettled",
    inputs: [
      { name: "owner", type: "address", indexed: true },
      { name: "scheduleId", type: "uint256", indexed: true },
      { name: "recipient", type: "address", indexed: false },
      { name: "usdcIn", type: "uint256", indexed: false },
      { name: "ckesOut", type: "uint256", indexed: false },
    ],
  },
];
