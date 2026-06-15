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

// Estimate the USDC fee for a full USDC → cKES transfer using the CIP-64 fee currency approach.
//
// The actual execution path has 5 on-chain ops:
//   1. approve USDC  → Mento Broker
//   2. swapIn USDC   → USDm  (Mento V2 hop 1)
//   3. approve USDm  → Mento Broker
//   4. swapIn USDm   → cKES  (Mento V2 hop 2)
//   5. transfer cKES → recipient
//
// Celopedia CIP-64 rules (builder-guide.md):
//   • Pass feeCurrency to estimateContractGas — the node prices gas in the fee token.
//   • Call eth_gasPrice with the feeCurrency adapter address — returns price already in
//     fee-token units (18 dec normalised). No CELO→USDC conversion needed.
//   • formatUnits(totalGas × gasPriceHex, 18) = USDC display value.
//
// Ops 3-5 can't be estimated live (their inputs depend on the output of op 2), so we
// use celopedia-derived constants: ~150 k gas per Mento V2 swapIn hop.
async function estimateTransferFeeUsdc(account, usdcAmountRaw) {
  const publicClient = makePublicClient();
  const feeCurrency = ADDRESSES.feeCurrency;

  // Celopedia CIP-64: estimateContractGas must include feeCurrency for accurate pricing.
  let approveGas = 46000n;
  if (account && isAddress(account) && usdcAmountRaw > 0n) {
    try {
      approveGas = await publicClient.estimateContractGas({
        address: ADDRESSES.usdc,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [ADDRESSES.mentoBroker, usdcAmountRaw],
        account,
        feeCurrency,
      });
    } catch {}
  }

  // Constants for steps that can't be estimated without prior swap state.
  const swap1Gas   = 150000n; // Mento V2 swapIn USDC → USDm
  const approve2Gas = 46000n; // approve USDm for hop 2
  const swap2Gas   = 150000n; // Mento V2 swapIn USDm → cKES
  const transferGas = 52000n; // ERC-20 transfer cKES → recipient
  const totalGas = approveGas + swap1Gas + approve2Gas + swap2Gas + transferGas;

  // eth_gasPrice with feeCurrency returns the price denominated in the fee adapter
  // (18-dec USDC), so formatUnits(total, 18) gives the USDC cost directly.
  try {
    const gasPriceHex = await publicClient.request({
      method: "eth_gasPrice",
      params: [feeCurrency],
    });
    return Number(formatUnits(totalGas * BigInt(gasPriceHex), 18));
  } catch {
    return 0.003; // fallback reflecting 5-op reality
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
  const gasUsdcFloat = isAddress(ADDRESSES.feeCurrency || "")
    ? await estimateTransferFeeUsdc(account, usdcRaw)
    : 0.003;

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
