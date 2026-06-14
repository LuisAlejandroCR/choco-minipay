// Cepolia Skill — math + readiness layer for the Confirm Send screen.
// Responsibilities: quote USDC -> cKES (real-time via Mento), estimate gas, compute total cost,
// and verify the transaction is ready (recipient + wallet + balance + contract addresses).
// Pure functions where possible; on-chain reads use the public client.

import { formatUnits, isAddress, parseUnits } from "viem";
import { ADDRESSES, ERC20_ABI, MENTO_BROKER_ABI, makePublicClient, readUsdcBalance } from "./celo.js";
import { APP_CONFIG } from "./app-config.js";

// Fee currency adapter ABI (for debited gas token exchange rate)
const FEE_ADAPTER_ABI = [
  {
    type: "function",
    name: "getExchangeRate",
    stateMutability: "view",
    inputs: [{ name: "sellAmount", type: "uint256" }],
    outputs: [{ name: "buyAmount", type: "uint256" }],
  },
];

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

// Estimate gas cost in native CELO wei for USDC → cKES transfers (approve + 2-hop swap + transfer).
// Falls back to a conservative estimate if simulation fails.
async function estimateTransferGasWei(account, recipient, usdcAmountRaw) {
  if (!account || !isAddress(account) || !isAddress(recipient) || usdcAmountRaw === 0n) {
    return parseUnits("0.001", 18); // 0.001 CELO fallback
  }

  const publicClient = makePublicClient();

  try {
    // USDC → cKES path: approve + 2 Mento swaps + cKES transfer
    const approveGas = 50000n;   // ERC20 approve ~46k gas
    const swap1Gas = 100000n;    // USDC → USDm ~90-100k gas
    const swap2Gas = 100000n;    // USDm → cKES ~90-100k gas
    const transferGas = 65000n;  // cKES transfer ~52k gas
    const gasEstimate = approveGas + swap1Gas + swap2Gas + transferGas; // ~315k total

    const gasPrice = await publicClient.getGasPrice();
    return gasEstimate * gasPrice;
  } catch {
    // If gas price fetch fails, use conservative estimate
    return parseUnits("0.001", 18); // 0.001 CELO
  }
}

// Cepolia readiness summary for the Confirm Send screen. All numeric values are returned both as
// raw bigints (for further on-chain calls) and formatted strings (for display).
export async function summariseTransfer({ account, recipient, intent, walletReady }) {
  // Only USDC → cKES is allowed in this stage
  const usdcRequested = Number(intent?.sourceAmount || 0);
  const ckesRequested = Number(intent?.amountKes || intent?.destinationAmount || 0);

  // Get live cKES quote from Mento
  let ckesRaw = 0n;
  let liveQuote = false;
  if (usdcRequested > 0) {
    try {
      ckesRaw = await quoteUsdcToCkes(usdcRequested);
      liveQuote = ckesRaw > 0n;
    } catch {
      // Quote failure: use static estimate as fallback
      ckesRaw = ckesRequested ? parseUnits(String(Math.max(1, Math.floor(ckesRequested))), 18) : 0n;
    }
  }
  const ckesFloat = Number(formatUnits(ckesRaw, 18));

  const usdcRaw = usdcRequested > 0 ? parseUnits(Number(usdcRequested).toFixed(6), 6) : 0n;
  const gasWei = walletReady && recipient
    ? await estimateTransferGasWei(account, recipient, usdcRaw)
    : parseUnits("0.001", 18); // Conservative default if wallet not ready
  const gasNativeFloat = Number(formatUnits(gasWei, 18));

  // Convert gas cost from CELO to USDC using the fee adapter exchange rate
  let gasUsdcFloat = 0;
  if (gasWei > 0n && ADDRESSES.feeCurrency && isAddress(ADDRESSES.feeCurrency)) {
    try {
      // getExchangeRate returns how much USDC you need to buy 1 CELO worth of gas
      // Input: CELO amount (wei), Output: USDC amount (6 decimals)
      const gasUsdcRaw = await publicClient.readContract({
        address: ADDRESSES.feeCurrency,
        abi: FEE_ADAPTER_ABI,
        functionName: "getExchangeRate",
        args: [gasWei],
      });
      gasUsdcFloat = Number(formatUnits(gasUsdcRaw, 6));
    } catch {
      // Fallback: rough estimate ~$0.40 per CELO (adjust based on market)
      gasUsdcFloat = gasNativeFloat * 0.4;
    }
  }

  // Always show fee in USDC (converted from CELO via fee adapter)
  const feeLabel = gasUsdcFloat > 0
    ? `~${gasUsdcFloat.toFixed(4)} USDC`
    : APP_CONFIG.transfer.networkFeeLabel;

  const totalCost = gasUsdcFloat > 0 ? usdcRequested + gasUsdcFloat : usdcRequested;
  const totalCostLabel = totalCost > 0
    ? `${totalCost.toLocaleString("en-US", { maximumFractionDigits: 4 })} USDC`
    : `${usdcRequested.toLocaleString("en-US", { maximumFractionDigits: 2 })} USDC + fees`;

  return {
    recipientReceives: ckesFloat,
    recipientReceivesLabel: ckesFloat ? `${ckesFloat.toLocaleString("en-US", { maximumFractionDigits: 2 })} cKES` : "",
    walletPays: usdcRequested,
    walletPaysLabel: `${usdcRequested.toLocaleString("en-US", { maximumFractionDigits: 2 })} USDC`,
    networkFeeLabel: feeLabel,
    totalCostLabel,
    liveQuote,
    readyToConfirm: walletReady && isAddress(recipient || "") && usdcRequested > 0,
  };
}
