export const ERC20_ABI = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "allowance", stateMutability: "view", inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ name: "", type: "bool" }] },
  { type: "function", name: "transfer", stateMutability: "nonpayable", inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ name: "", type: "bool" }] },
];

// Mento V2 Broker — the only swap surface Choco touches. No custom router contract.
// Mainnet has no direct USDC/cKES pool, so USDC settles in two oracle-priced hops: USDC -> USDm -> cKES.
export const MENTO_BROKER_ABI = [
  {
    type: "function",
    name: "getAmountOut",
    stateMutability: "view",
    inputs: [
      { name: "exchangeProvider", type: "address" },
      { name: "exchangeId", type: "bytes32" },
      { name: "tokenIn", type: "address" },
      { name: "tokenOut", type: "address" },
      { name: "amountIn", type: "uint256" },
    ],
    outputs: [{ name: "amountOut", type: "uint256" }],
  },
  {
    type: "function",
    name: "swapIn",
    stateMutability: "nonpayable",
    inputs: [
      { name: "exchangeProvider", type: "address" },
      { name: "exchangeId", type: "bytes32" },
      { name: "tokenIn", type: "address" },
      { name: "tokenOut", type: "address" },
      { name: "amountIn", type: "uint256" },
      { name: "amountOutMin", type: "uint256" },
    ],
    outputs: [{ name: "amountOut", type: "uint256" }],
  },
];

// REGISTRY_ABI targets the deployed ChocoLedger (0xd8F54…).
// Falls back to ChocoScheduleRegistry (old) via ADDRESSES.registry when ADDRESSES.ledger is unset.
export const REGISTRY_ABI = [
  {
    type: "function",
    name: "createMonthlySchedule",
    stateMutability: "nonpayable",
    inputs: [
      { name: "recipient", type: "address" },
      { name: "settlementSpender", type: "address" },
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
      { name: "settlementSpender", type: "address", indexed: false },
      { name: "sourceAsset", type: "address", indexed: false },
      { name: "sourceAmount", type: "uint256", indexed: false },
      { name: "destinationAmount", type: "uint256", indexed: false },
      { name: "dayOfMonth", type: "uint8", indexed: false },
      { name: "firstRunAt", type: "uint64", indexed: false },
      { name: "maxRetries", type: "uint8", indexed: false },
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

export const CKES_SWAP_ABI = [
  {
    type: "function",
    name: "swapAndSend",
    stateMutability: "nonpayable",
    inputs: [
      { name: "recipient", type: "address" },
      { name: "usdcAmountIn", type: "uint256" },
      { name: "ckesMinOut", type: "uint256" },
    ],
    outputs: [{ name: "ckesAmountOut", type: "uint256" }],
  },
  {
    type: "function",
    name: "quote",
    stateMutability: "view",
    inputs: [{ name: "usdcAmountIn", type: "uint256" }],
    outputs: [{ name: "ckesAmountOut", type: "uint256" }],
  },
  {
    type: "function",
    name: "quoteWithFee",
    stateMutability: "view",
    inputs: [{ name: "usdcAmountIn", type: "uint256" }],
    outputs: [
      { name: "ckesAmountOut", type: "uint256" },
      { name: "feeUsdc",       type: "uint256" },
      { name: "swapUsdc",      type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "quoteExactOut",
    stateMutability: "view",
    inputs: [{ name: "ckesExactOut", type: "uint256" }],
    outputs: [{ name: "usdcAmountIn", type: "uint256" }],
  },
  {
    type: "function",
    name: "swapAndSendExact",
    stateMutability: "nonpayable",
    inputs: [
      { name: "recipient",    type: "address" },
      { name: "usdcAmountIn", type: "uint256" },
      { name: "ckesExactOut", type: "uint256" },
    ],
    outputs: [{ name: "ckesAmountOut", type: "uint256" }],
  },
];

// cKES ERC20 Transfer events used to reconstruct send-now history from chain state.
export const TRANSFER_EVENT_ABI = [
  {
    type: "event",
    name: "Transfer",
    inputs: [
      { name: "from", type: "address", indexed: true },
      { name: "to", type: "address", indexed: true },
      { name: "value", type: "uint256", indexed: false },
    ],
  },
];

// ChocoGateway (0xBB1e…) emits a 5-param event — payer indexed, no recipient param.
// Old contracts (0xB555CC…, 0x9375F1…) emit different signatures; those events don't decode
// with this ABI and are captured instead by the orphan-delivery fallback in history.js.
export const SWAP_EVENT_ABI = [
  {
    type: "event",
    name: "UsdcToCkesSwap",
    inputs: [
      { name: "payer",      type: "address", indexed: true },
      { name: "usdcIn",     type: "uint256", indexed: false },
      { name: "usdmMid",    type: "uint256", indexed: false },
      { name: "ckesOut",    type: "uint256", indexed: false },
      { name: "ckesMinOut", type: "uint256", indexed: false },
    ],
  },
];
