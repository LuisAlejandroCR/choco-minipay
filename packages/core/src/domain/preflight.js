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

export function evaluateAgentPreflight({
  walletAddress = "",
  chainId = "",
  gasBalanceWei = "0x0",
  recipientContact = "",
} = {}) {
  const normalizedChainId = normalizeChainId(chainId);
  const isTestnet = normalizedChainId === CELO_SEPOLIA_TESTNET.chainId;
  const hasWallet = /^0x[a-fA-F0-9]{40}$/.test(walletAddress);
  const hasGas = hasPositiveWeiBalance(gasBalanceWei);
  const hasContact = String(recipientContact).trim().length >= 3;
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
      "Recipient contact",
      hasContact,
      hasContact ? recipientContact : "Confirm the recipient phone, alias, or wallet contact.",
    ),
  ];

  const ok = checks.every((check) => check.status === "pass");

  return {
    agent: "Choco Agent AI",
    network: CELO_SEPOLIA_TESTNET.name,
    status: ok ? "ready" : "blocked",
    ok,
    gasBalanceLabel,
    checks,
    summary: ok
      ? "Agent preflight passed. Choco can continue to quote review on testnet."
      : "Agent preflight blocked. Fix the failed checks before continuing.",
  };
}
