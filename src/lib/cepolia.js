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

// Estimate the USDC fee for a USDC → cKES transfer using the CIP-64 fee currency approach.
// Celopedia pattern: eth_gasPrice with feeCurrency returns the gas price already denominated
// in the fee token (USDC adapter normalises 6-dec USDC to 18-dec for gas calculations).
// No CELO → USDC conversion needed — the RPC node applies the oracle rate internally.
async function estimateTransferFeeUsdc(account, recipient, usdcAmountRaw) {
  const publicClient = makePublicClient();

  // Gas units: actual approve estimate + conservative averages for swap + transfer
  let totalGas = 46000n + 120000n + 52000n; // ~218k gas baseline
  if (account && isAddress(account) && isAddress(recipient) && usdcAmountRaw > 0n) {
    try {
      const approveGas = await publicClient.estimateContractGas({
        address: ADDRESSES.usdc,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [ADDRESSES.mentoBroker, usdcAmountRaw],
        account,
      });
      totalGas = approveGas + 120000n + 52000n;
    } catch {}
  }

  // Gas price denominated in the USDC fee adapter (celopedia CIP-64 pattern).
  // The adapter normalises USDC (6 dec) to 18 dec, so formatUnits(fee, 18) = USDC display value.
  try {
    const gasPriceHex = await publicClient.request({
      method: "eth_gasPrice",
      params: [ADDRESSES.feeCurrency],
    });
    const feeInAdapter = totalGas * BigInt(gasPriceHex);
    return Number(formatUnits(feeInAdapter, 18));
  } catch {
    return 0.0015; // ~$0.0015 conservative fallback
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
    ? await estimateTransferFeeUsdc(account, recipient || "", usdcRaw)
    : 0.0015;

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
