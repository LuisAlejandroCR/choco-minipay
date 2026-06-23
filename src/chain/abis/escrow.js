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
];
