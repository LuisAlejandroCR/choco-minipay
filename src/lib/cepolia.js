// Cepolia Skill — math + readiness layer for the Confirm Send screen.
// Responsibilities: quote USDC -> cKES (real-time via Mento), estimate gas, compute total cost,
// and verify the transaction is ready (recipient + wallet + balance + contract addresses).
// Pure functions where possible; on-chain reads use the public client.

import { formatUnits, isAddress, parseUnits } from "viem";
import { ADDRESSES, ERC20_ABI, MENTO_BROKER_ABI, makePublicClient, readUsdcBalance } from "./celo.js";
import { APP_CONFIG } from "./app-config.js";

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
};

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
    const required = parseUnits(Number(intent.sourceAmount).toFixed(6), 6);
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
];

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

// Estimate gas in CELO wei for an ERC20 transfer of the destination amount. We use a representative
// call (cKES.transfer) because it bounds the most common path; swap calls are estimated separately
// only when the user lands on a USDC-source path. Returns native wei.
async function estimateTransferGasWei(account, recipient, ckesAmountRaw) {
  if (!account || !isAddress(account) || !isAddress(recipient) || ckesAmountRaw === 0n) return 0n;
  const publicClient = makePublicClient();
  try {
    const gas = await publicClient.estimateContractGas({
      account,
      address: ADDRESSES.kesm,
      abi: ERC20_ABI,
      functionName: "transfer",
      args: [recipient, ckesAmountRaw],
    });
    const gasPrice = await publicClient.getGasPrice();
    return gas * gasPrice;
  } catch {
    // If the simulation fails (e.g. insufficient cKES because the swap hasn't run yet), fall back
    // to a conservative default rather than blocking the Review screen.
    return 0n;
  }
}

// Cepolia readiness summary for the Confirm Send screen. All numeric values are returned both as
// raw bigints (for further on-chain calls) and formatted strings (for display).
export async function summariseTransfer({ account, recipient, intent, walletReady }) {
  const sourceAsset = intent?.sourceAsset || APP_CONFIG.assets.source;
  const isUsdcSource = sourceAsset === APP_CONFIG.assets.source;
  const usdcRequested = isUsdcSource ? Number(intent?.sourceAmount || 0) : 0;
  const ckesRequested = Number(intent?.amountKes || intent?.destinationAmount || 0);

  let ckesRaw = ckesRequested ? parseUnits(String(Math.max(1, Math.floor(ckesRequested))), 18) : 0n;
  let liveQuote = false;
  if (isUsdcSource && usdcRequested > 0) {
    try {
      ckesRaw = await quoteUsdcToCkes(usdcRequested);
      liveQuote = ckesRaw > 0n;
    } catch {
      // Quote failure leaves the requested amount as the displayed value.
    }
  }
  const ckesFloat = Number(formatUnits(ckesRaw, 18));

  const gasWei = walletReady && recipient ? await estimateTransferGasWei(account, recipient, ckesRaw) : 0n;
  const gasNativeFloat = Number(formatUnits(gasWei, 18));

  return {
    recipientReceives: ckesFloat,
    recipientReceivesLabel: ckesFloat ? `${ckesFloat.toLocaleString("en-US", { maximumFractionDigits: 2 })} ${APP_CONFIG.assets.destination}` : "",
    walletPays: isUsdcSource ? usdcRequested : ckesRequested,
    walletPaysLabel: isUsdcSource
      ? `${usdcRequested.toLocaleString("en-US", { maximumFractionDigits: 2 })} ${APP_CONFIG.assets.source}`
      : `${ckesRequested.toLocaleString("en-US", { maximumFractionDigits: 2 })} ${APP_CONFIG.assets.destination}`,
    networkFeeLabel: gasNativeFloat ? `~${gasNativeFloat.toFixed(6)} CELO` : APP_CONFIG.transfer.networkFeeLabel,
    totalCostLabel: isUsdcSource
      ? `${usdcRequested.toLocaleString("en-US", { maximumFractionDigits: 2 })} ${APP_CONFIG.assets.source}${gasNativeFloat ? ` + ~${gasNativeFloat.toFixed(6)} CELO` : ""}`
      : `${ckesRequested.toLocaleString("en-US", { maximumFractionDigits: 2 })} ${APP_CONFIG.assets.destination}${gasNativeFloat ? ` + ~${gasNativeFloat.toFixed(6)} CELO` : ""}`,
    liveQuote,
    readyToConfirm: walletReady && isAddress(recipient || "") && (isUsdcSource ? usdcRequested > 0 : ckesRequested > 0),
  };
}
