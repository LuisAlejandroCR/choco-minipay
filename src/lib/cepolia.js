// Cepolia Skill — math + readiness layer for the Confirm Send screen.
// Responsibilities: quote USDC -> cKES (real-time via Mento), estimate gas, compute total cost,
// and verify the transaction is ready (recipient + wallet + balance + contract addresses).
// Pure functions where possible; on-chain reads use the public client.

import { formatUnits, isAddress, parseUnits } from "viem";
import { ADDRESSES, MENTO_BROKER_ABI, makePublicClient, readUsdcBalance, selectTransferRouteExactOut } from "./celo.js";
import { APP_CONFIG } from "./app-config.js";
import { estimateTransferFeeUsdc } from "./cepolia-fees.js";


// Readiness verdicts (UX-only — never written on-chain). The audit contract is for events that
// actually touched the chain (SUCCESS / FAILED_*). Pre-flight reasons live here, surfaced as
// human messages in the UI.
export const READINESS_REASON = {
  OK: "OK",
  NO_INTENT: "NO_INTENT",
  NO_WALLET: "NO_WALLET",
  NO_RECIPIENT: "NO_RECIPIENT",
  INSUFFICIENT_USDC: "INSUFFICIENT_USDC",
  BALANCE_READ_FAILED: "BALANCE_READ_FAILED",
  ROUTE_UNAVAILABLE: "ROUTE_UNAVAILABLE",
};

// Quote reads (Mento getAmountOut + UniV3 slot0) occasionally fail on a transient RPC/oracle hiccup.
// Retry a few times before declaring the route unavailable, so the review screen doesn't flash
// "temporarily unavailable" (and block confirm) for a transfer that works on the next attempt.
async function withQuoteRetry(fn, attempts = 3, delayMs = 400) {
  let lastError;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (i < attempts - 1) await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastError;
}

// Cepolia Skill — readiness check before Review. Returns { ok, reason, message, required, available }.
// Never signs or logs anything; this is pure validation. Failures are surfaced as UX messages
// (e.g. "Fund your account with USDC before continuing").
export async function verifyReadiness({ account, intent }) {
  if (!intent || !intent.isReady) {
    return { ok: false, reason: READINESS_REASON.NO_INTENT, message: "Choco Agent still needs more detail." };
  }
  if (!account || !isAddress(account)) {
    return { ok: false, reason: READINESS_REASON.NO_WALLET, message: "Connect your wallet to continue." };
  }

  const isUsdcSource = intent.sourceAsset === APP_CONFIG.assets.source;
  if (!isUsdcSource || !(Number(intent.sourceAmount) > 0)) {
    return { ok: true, reason: READINESS_REASON.OK };
  }

  try {
    let required = parseUnits(Number(intent.sourceAmount).toFixed(6), 6);
    if (Number(intent.amountKes) > 0) {
      try {
        const exactRequired = await withQuoteRetry(() => quoteExactOutputUsdc(parseUnits(String(Number(intent.amountKes)), 18)));
        if (exactRequired > 0n) required = exactRequired;
      } catch {
        // Transient route-quote failure (e.g. Mento "no valid median" right after a prior send): keep
        // the intent's stated USDC amount for the balance check instead of aborting the send. sendNow
        // re-quotes (with its own retry) at confirm time, so the precise amount is resolved there.
      }
    }
    const available = await readUsdcBalance(account);
    if (available < required) {
      return {
        ok: false,
        reason: READINESS_REASON.INSUFFICIENT_USDC,
        message: "Insufficient USDC. Fund your account with USDC before continuing.",
        required,
        available,
      };
    }
    return { ok: true, reason: READINESS_REASON.OK, required, available };
  } catch (error) {
    return {
      ok: false,
      reason: READINESS_REASON.BALANCE_READ_FAILED,
      message: `Could not check USDC balance: ${error.shortMessage || error.message}`,
    };
  }
}

const SWAP_ABI = [
  { type: "function", name: "quote", stateMutability: "view", inputs: [{ name: "usdcAmountIn", type: "uint256" }], outputs: [{ name: "ckesAmountOut", type: "uint256" }] },
  { type: "function", name: "quoteExactOut", stateMutability: "view", inputs: [{ name: "ckesExactOut", type: "uint256" }], outputs: [{ name: "usdcAmountIn", type: "uint256" }] },
];

async function quoteExactOutputUsdc(ckesAmountRaw) {
  const selectedRoute = await selectTransferRouteExactOut({ ckesAmountRaw });
  if (!selectedRoute.ok) throw new Error(selectedRoute.message);
  return selectedRoute.usdcAmountIn;
}

// Returns the cKES output for a given USDC amount, going through the deployed Choco swap
// wrapper if configured; otherwise through Mento Broker's two-hop quote.
export async function quoteUsdcToCkes(usdcAmountFloat) {
  if (!(Number(usdcAmountFloat) > 0)) return 0n;
  const publicClient = makePublicClient();
  const usdcAmount = parseUnits(Number(usdcAmountFloat).toFixed(6), 6);
  const swapAddress = APP_CONFIG.contracts.ckesSwap;
  if (isAddress(swapAddress)) {
    return publicClient.readContract({ address: swapAddress, abi: SWAP_ABI, functionName: "quote", args: [usdcAmount] });
  }
  const usdmOut = await publicClient.readContract({
    address: ADDRESSES.mentoBroker, abi: MENTO_BROKER_ABI, functionName: "getAmountOut",
    args: [ADDRESSES.mentoProvider, APP_CONFIG.mento.usdcToUsdm, ADDRESSES.usdc, ADDRESSES.usdm, usdcAmount],
  });
  return publicClient.readContract({
    address: ADDRESSES.mentoBroker, abi: MENTO_BROKER_ABI, functionName: "getAmountOut",
    args: [ADDRESSES.mentoProvider, APP_CONFIG.mento.usdmToCkes, ADDRESSES.usdm, ADDRESSES.kesm, usdmOut],
  });
}

// Cepolia readiness summary for the Confirm Send screen. All numeric values are returned both as
// raw bigints (for further on-chain calls) and formatted strings (for display).
export async function summariseTransfer({ account, recipient, intent, walletReady }) {
  // Only USDC → cKES is allowed in this stage
  const usdcRequested = Number(intent?.sourceAmount || 0);
  const ckesRequested = Number(intent?.amountKes || intent?.destinationAmount || 0);

  // When the user stated an exact cKES target (amountKes), that IS what recipient gets —
  // no need to quote. Only live-quote when cKES is not explicitly known (USDC-only intent).
  let ckesRaw = 0n;
  let liveQuote = false;
  if (ckesRequested > 0) {
    ckesRaw = parseUnits(String(ckesRequested), 18);
  } else if (usdcRequested > 0) {
    try {
      ckesRaw = await quoteUsdcToCkes(usdcRequested);
      liveQuote = ckesRaw > 0n;
    } catch {
      ckesRaw = 0n;
    }
  }
  const ckesFloat = Number(formatUnits(ckesRaw, 18));

  let usdcRaw = usdcRequested > 0 ? parseUnits(Number(usdcRequested).toFixed(6), 6) : 0n;
  if (ckesRequested > 0) {
    try {
      const exactRequired = await withQuoteRetry(() => quoteExactOutputUsdc(ckesRaw));
      if (exactRequired > 0n) usdcRaw = exactRequired;
    } catch {
      // Display-only quote: sendNow re-quotes AND falls back to the user's estimate at confirm time, so
      // a transient review-quote failure must never block confirm or flash the "unavailable" banner —
      // keep showing the fallback estimate. The send (with its own retry + fallback) is the real gate.
    }
  }
  const walletPaysFloat = Number(formatUnits(usdcRaw, 6));
  const gasUsdcFloat = isAddress(ADDRESSES.feeCurrency || "")
    ? await estimateTransferFeeUsdc(account, usdcRaw)
    : 0.003;

  // Always show fee in USDC (converted from CELO via fee adapter)
  const feeLabel = gasUsdcFloat > 0
    ? `~${gasUsdcFloat.toFixed(4)} USDC`
    : APP_CONFIG.transfer.networkFeeLabel;

  const totalCost = gasUsdcFloat > 0 ? walletPaysFloat + gasUsdcFloat : walletPaysFloat;
  const totalCostLabel = totalCost > 0
    ? `${totalCost.toLocaleString("en-US", { maximumFractionDigits: 4 })} USDC`
    : `${walletPaysFloat.toLocaleString("en-US", { maximumFractionDigits: 4 })} USDC + fees`;

  return {
    recipientReceives: ckesFloat,
    recipientReceivesLabel: ckesFloat ? `${ckesFloat.toLocaleString("en-US", { maximumFractionDigits: 2 })} KESm` : "",
    walletPays: walletPaysFloat,
    walletPaysLabel: `${walletPaysFloat.toLocaleString("en-US", { maximumFractionDigits: 4 })} USDC`,
    networkFeeLabel: feeLabel,
    totalCostLabel,
    liveQuote,
    readyToConfirm: walletReady && isAddress(recipient || "") && usdcRequested > 0,
  };
}
