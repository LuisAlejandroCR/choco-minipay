// ChocoLedger: schedule registry functions, the schedule/settlement events used to rebuild plans +
// history from chain state, and the AttemptLogged audit event (the primary send-now history source).
// Falls back to ChocoScheduleRegistry (legacy) via ADDRESSES.registry when ADDRESSES.ledger is unset.
export const REGISTRY_ABI = [
  {
    type: "function",
    name: "createMonthlySchedule",
    stateMutability: "nonpayable",
    inputs: [
      { name: "recipient", type: "address" },
      { name: "sourceAsset", type: "address" },
      { name: "sourceAmount", type: "uint256" },
      { name: "destinationAmount", type: "uint256" },
      { name: "dayOfMonth", type: "uint8" },
      { name: "firstRunAt", type: "uint64" },
      { name: "commandHash", type: "bytes32" },
      { name: "receiptLabelHash", type: "bytes32" },
    ],
    outputs: [{ name: "id", type: "uint256" }],
  },
  {
    type: "function",
    name: "cancelSchedule",
    stateMutability: "nonpayable",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "pauseSchedule",
    stateMutability: "nonpayable",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "resumeSchedule",
    stateMutability: "nonpayable",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [],
  },
  // Live schedule state — read in real time so a just-cancelled/paused plan reflects immediately
  // instead of waiting for the explorer to index the ScheduleCancelled/Paused event (minutes of lag).
  {
    type: "function",
    name: "getSchedule",
    stateMutability: "view",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "owner", type: "address" },
          { name: "recipient", type: "address" },
          { name: "sourceAsset", type: "address" },
          { name: "sourceAmount", type: "uint256" },
          { name: "destinationAmount", type: "uint256" },
          { name: "dayOfMonth", type: "uint8" },
          { name: "firstRunAt", type: "uint64" },
          { name: "active", type: "bool" },
          { name: "cancelled", type: "bool" },
          { name: "commandHash", type: "bytes32" },
          { name: "receiptLabelHash", type: "bytes32" },
        ],
      },
    ],
  },
];

// Event ABI used to rebuild plans and history straight from chain state — nothing is stored off-chain.
export const REGISTRY_EVENTS_ABI = [
  {
    type: "event",
    name: "MonthlyScheduleCreated",
    inputs: [
      { name: "id", type: "uint256", indexed: true },
      { name: "owner", type: "address", indexed: true },
      { name: "recipient", type: "address", indexed: true },
      { name: "sourceAsset", type: "address", indexed: false },
      { name: "sourceAmount", type: "uint256", indexed: false },
      { name: "destinationAmount", type: "uint256", indexed: false },
      { name: "dayOfMonth", type: "uint8", indexed: false },
      { name: "firstRunAt", type: "uint64", indexed: false },
      { name: "commandHash", type: "bytes32", indexed: false },
    ],
  },
  {
    type: "event",
    name: "ScheduleCancelled",
    inputs: [
      { name: "id", type: "uint256", indexed: true },
      { name: "by", type: "address", indexed: true },
    ],
  },
  {
    type: "event",
    name: "SchedulePaused",
    inputs: [
      { name: "id", type: "uint256", indexed: true },
      { name: "by", type: "address", indexed: true },
    ],
  },
  {
    type: "event",
    name: "ScheduleResumed",
    inputs: [
      { name: "id", type: "uint256", indexed: true },
      { name: "by", type: "address", indexed: true },
    ],
  },
  {
    type: "event",
    name: "SettlementReceipt",
    inputs: [
      { name: "id", type: "uint256", indexed: true },
      { name: "success", type: "bool", indexed: false },
      { name: "sourceAsset", type: "address", indexed: false },
      { name: "sourceAmount", type: "uint256", indexed: false },
      { name: "destinationAmount", type: "uint256", indexed: false },
      { name: "settlementRef", type: "bytes32", indexed: false },
      { name: "note", type: "string", indexed: false },
    ],
  },
];

// ChocoLedger audit event. This is the primary source for send-now movement history.
export const ATTEMPT_EVENT_ABI = [
  {
    type: "event",
    name: "AttemptLogged",
    inputs: [
      { name: "attemptId", type: "uint256", indexed: true },
      { name: "senderWallet", type: "address", indexed: true },
      { name: "kind", type: "uint8", indexed: true },
      { name: "receiptLabelHash", type: "bytes32", indexed: false },
      { name: "recipientWallet", type: "address", indexed: false },
      { name: "usdcAmount", type: "uint256", indexed: false },
      { name: "ckesAmount", type: "uint256", indexed: false },
      { name: "swapTxHash", type: "bytes32", indexed: false },
      { name: "paymentTxHash", type: "bytes32", indexed: false },
      { name: "note", type: "string", indexed: false },
    ],
  },
];
