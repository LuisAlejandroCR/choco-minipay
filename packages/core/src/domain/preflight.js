import { getCeloNetworkConfig, normalizeChainId } from "../config/celo.js";

export { normalizeChainId } from "../config/celo.js";

export const CELO_SEPOLIA_TESTNET = getCeloNetworkConfig("celoSepolia");

const PREFLIGHT_NETWORK_LABEL = `${CELO_SEPOLIA_TESTNET.name} testnet`;

export function hasPositiveWeiBalance(balanceWei) {
  if (!balanceWei) return false;
  try {
    return BigInt(balanceWei) > 0n;
  } catch {
    return false;
  }
}

export function formatCeloBalance(balanceWei) {
  if (!hasPositiveWeiBalance(balanceWei)) return "0 CELO";
  const wei = BigInt(balanceWei);
  const base = 10n ** 18n;
  const whole = wei / base;
  const fraction = ((wei % base) / (10n ** 14n)).toString().padStart(4, "0").replace(/0+$/, "");
  return `${whole}${fraction ? `.${fraction}` : ""} CELO`;
}

function buildCheck(id, label, pass, detail) {
  return {
    id,
    label,
    status: pass ? "pass" : "block",
    detail,
  };
}

/**
 * Block 12: Format a USDC amount in 6-decimal minor units to a display string.
 * Used in the USDC balance check detail message.
 * @param {string | bigint} minorValue
 */
function formatUsdcBalance(minorValue) {
  const n = typeof minorValue === "bigint" ? minorValue : BigInt(String(minorValue));
  const whole = n / 1_000_000n;
  const frac = (n % 1_000_000n).toString().padStart(6, "0").replace(/0+$/, "");
  return `${whole}${frac ? `.${frac}` : ""} USDC`;
}

export function evaluateAgentPreflight({
  walletAddress = "",
  chainId = "",
  gasBalanceWei = "0x0",
  recipientContact = "",
  usdcBalanceMinor = null,   // Block 12: string or BigInt. Omit to skip the balance check.
  requiredUsdcMinor = null,  // Block 12: string or BigInt. Omit to skip the balance check.
} = {}) {
  const normalizedChainId = normalizeChainId(chainId);
  const isTestnet = normalizedChainId === CELO_SEPOLIA_TESTNET.chainId;
  const hasWallet = /^0x[a-fA-F0-9]{40}$/.test(walletAddress);
  const hasGas = hasPositiveWeiBalance(gasBalanceWei);
  const hasContact = /^0x[a-fA-F0-9]{40}$/.test(String(recipientContact || ""));
  const gasBalanceLabel = formatCeloBalance(gasBalanceWei);

  const checks = [
    buildCheck(
      "network",
      PREFLIGHT_NETWORK_LABEL,
      isTestnet,
      isTestnet ? `Wallet is on ${CELO_SEPOLIA_TESTNET.name}.` : `Switch wallet to ${PREFLIGHT_NETWORK_LABEL}.`,
    ),
    buildCheck(
      "wallet",
      "Wallet address",
      hasWallet,
      hasWallet ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}` : "Connect a valid wallet address.",
    ),
    buildCheck(
      "gas",
      "Testnet gas funds",
      hasGas,
      hasGas ? `${gasBalanceLabel} available for network fees.` : `Add ${CELO_SEPOLIA_TESTNET.name} CELO before testing send or schedule.`,
    ),
    buildCheck(
      "contact",
      "Recipient wallet",
      hasContact,
      hasContact
        ? `${String(recipientContact).slice(0, 6)}...${String(recipientContact).slice(-4)}`
        : "Add the recipient's Celo Sepolia wallet address in the review screen.",
    ),
  ];

  // Block 12: 5th check — USDC balance vs required amount.
  // Only added when both values are provided; omitting either skips the check
  // so existing callers that do not read USDC balance remain unaffected.
  if (usdcBalanceMinor !== null && requiredUsdcMinor !== null) {
    try {
      const balanceBigInt = BigInt(String(usdcBalanceMinor));
      const requiredBigInt = BigInt(String(requiredUsdcMinor));
      const hasSufficientUsdc = balanceBigInt >= requiredBigInt;
      checks.push(buildCheck(
        "balance",
        "USDC balance",
        hasSufficientUsdc,
        hasSufficientUsdc
          ? `${formatUsdcBalance(balanceBigInt)} available.`
          : `Insufficient USDC. Need ${formatUsdcBalance(requiredBigInt)}, have ${formatUsdcBalance(balanceBigInt)}.`,
      ));
    } catch {
      // BigInt conversion failed — omit the check rather than crashing.
    }
  }

  const ok = checks.every((check) => check.status === "pass");

  return {
    agent: "Choco Agent AI",
    network: CELO_SEPOLIA_TESTNET.name,
    status: ok ? "ready" : "blocked",
    ok,
    gasBalanceLabel,
    checks,
    summary: ok
      ? "Wallet check passed. Choco can continue to quote review on testnet."
      : "Wallet check needs attention before continuing.",
  };
}
