import { createWalletClient, custom, isAddress, keccak256, stringToHex, zeroAddress } from "viem";
import { celo } from "viem/chains";
import { APP_CONFIG } from "./app-config.js";
import { ADDRESSES, makePublicClient } from "./celo.js";

// Only events that already touched the chain are audited. INSUFFICIENT_FUNDS and REJECTED are
// pre-flight UX states (handled by Cepolia Skill) and are intentionally not logged on-chain to
// avoid asking the user to sign just to record a non-event. The contract still supports kinds
// 3/4 for forward-compatibility — they're simply not called from this frontend.
export const AUDIT_KIND = {
  SUCCESS: 0,
  FAILED_SWAP: 1,
  FAILED_TRANSFER: 2,
};

export const AUDIT_ABI = [
  {
    type: "function",
    name: "logAttempt",
    stateMutability: "nonpayable",
    inputs: [
      { name: "kind", type: "uint8" },
      { name: "receiptLabelHash", type: "bytes32" },
      { name: "recipientWallet", type: "address" },
      { name: "usdcAmount", type: "uint256" },
      { name: "ckesAmount", type: "uint256" },
      { name: "swapTxHash", type: "bytes32" },
      { name: "paymentTxHash", type: "bytes32" },
      { name: "note", type: "string" },
    ],
    outputs: [{ name: "attemptId", type: "uint256" }],
  },
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

function auditAddress() {
  return APP_CONFIG.contracts.ledger || APP_CONFIG.contracts.audit;
}

export function isAuditConfigured() {
  const addr = auditAddress();
  return Boolean(addr && isAddress(addr));
}

export function labelHash(label) {
  const trimmed = String(label || "").trim().toLowerCase();
  if (!trimmed) return `0x${"0".repeat(64)}`;
  return keccak256(stringToHex(trimmed));
}

function makeWalletClient(account) {
  return createWalletClient({ account, chain: celo, transport: custom(window.ethereum) });
}

/// Append-only audit log call. Returns the audit tx hash, or "" if the audit contract is not
/// configured (so callers can short-circuit without erroring out the main flow).
export async function logAuditAttempt({
  account,
  kind,
  label = "",
  recipient = zeroAddress,
  usdcAmount = 0n,
  ckesAmount = 0n,
  swapTxHash = "",
  paymentTxHash = "",
  note = "",
}) {
  if (!isAuditConfigured()) return "";
  if (!account || !isAddress(account)) throw new Error("Connected wallet is required for audit log.");

  const publicClient = makePublicClient();
  const walletClient = makeWalletClient(account);

  const hash = await walletClient.writeContract({
    address: auditAddress(),
    abi: AUDIT_ABI,
    functionName: "logAttempt",
    args: [
      kind,
      labelHash(label),
      isAddress(recipient) ? recipient : zeroAddress,
      BigInt(usdcAmount || 0),
      BigInt(ckesAmount || 0),
      swapTxHash || `0x${"0".repeat(64)}`,
      paymentTxHash || `0x${"0".repeat(64)}`,
      String(note || "").slice(0, 120),
    ],
    feeCurrency: ADDRESSES.feeCurrency,
  });
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}
