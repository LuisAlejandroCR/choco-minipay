// ChocoGateway: send-now / settlement entry points (swap + quote) and the UsdcToCkesSwap event.
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

// ChocoGateway emits a 5-param event — payer indexed, no recipient param. Older contracts emit
// different signatures; those events don't decode with this ABI and are captured instead by the
// orphan-delivery fallback in history/send-now.js.
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
