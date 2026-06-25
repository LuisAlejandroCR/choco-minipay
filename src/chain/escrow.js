import { isAddress } from "viem";
import { ADDRESSES, assertAddress, makePublicClient, makeWalletClient } from "./client.js";
import { approveTokenIfNeeded, readUsdcBalance } from "./tokens.js";

// ChocoScheduleEscrow — reserves one run's USDC per scheduled plan so it can't be spent before the
// keeper settles it. Only the owner-facing surface lives here; settlement is keeper-only (see
// scripts/choco-keeper.mjs). Funding pre-approves a few runs of allowance so the keeper can
// auto-lock the next run after each settlement without another wallet prompt.
export const SCHEDULE_ESCROW_ABI = [
  { type: "function", name: "lockedOf", stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }, { name: "scheduleId", type: "uint256" }],
    outputs: [{ type: "uint256" }] },
  { type: "function", name: "fundRun", stateMutability: "nonpayable",
    inputs: [{ name: "scheduleId", type: "uint256" }, { name: "usdcAmount", type: "uint256" }],
    outputs: [] },
  { type: "function", name: "refundRun", stateMutability: "nonpayable",
    inputs: [{ name: "scheduleId", type: "uint256" }], outputs: [] },
  // One-signature plan creation: create the schedule on the ledger AND lock its first run, atomically.
  { type: "function", name: "createAndFundRun", stateMutability: "nonpayable",
    inputs: [
      { name: "recipient", type: "address" },
      { name: "sourceAmount", type: "uint256" },
      { name: "destinationAmount", type: "uint256" },
      { name: "dayOfMonth", type: "uint8" },
      { name: "firstRunAt", type: "uint64" },
      { name: "commandHash", type: "bytes32" },
      { name: "receiptLabelHash", type: "bytes32" },
    ],
    outputs: [{ name: "scheduleId", type: "uint256" }] },
];

// Grant a standing USDC allowance to the gateway ONCE (bounded for trust), reused across plans AND
// send-now (same spender), so the wallet's approve popup doesn't reappear on every plan. ERC-20 needs an
// allowance before the gateway can pull USDC, and MiniPay can't fold that approve into the plan signature
// (no gasless permit) — so the first plan still needs one approval, but only the first.
const SCHEDULE_APPROVE_CAP = 1_000_000n; // 1.00 USDC (6 decimals) — same trust ceiling as send-now

// Approve up to the cap (or the whole balance if smaller), never below one run. Paired with
// minAllowance = one run, so approveTokenIfNeeded only re-prompts once the allowance is actually spent down.
function standingApproveAmount(perRun, balance) {
  const standing = balance < SCHEDULE_APPROVE_CAP ? balance : SCHEDULE_APPROVE_CAP;
  return standing > perRun ? standing : perRun;
}

export function isEscrowConfigured() {
  return isAddress(ADDRESSES.scheduleEscrow || "");
}

export async function readLockedRun({ owner, scheduleId, publicClient = makePublicClient() }) {
  if (!isEscrowConfigured() || !isAddress(owner || "")) return 0n;
  return publicClient.readContract({
    address: ADDRESSES.scheduleEscrow,
    abi: SCHEDULE_ESCROW_ABI,
    functionName: "lockedOf",
    args: [owner, BigInt(scheduleId)],
  });
}

// Lock the next run's USDC for a plan. Grants a standing allowance (reused, so no repeat approve popup),
// then funds exactly one run now.
export async function fundScheduleRun({ account, scheduleId, usdcPerRun }) {
  assertAddress(account, "Wallet");
  assertAddress(ADDRESSES.scheduleEscrow, "VITE_SCHEDULE_ESCROW_ADDRESS");
  const publicClient = makePublicClient();
  const walletClient = makeWalletClient(account);

  const balance = await readUsdcBalance(account);
  const approveHash = await approveTokenIfNeeded({
    account,
    tokenAddress: ADDRESSES.usdc,
    spender: ADDRESSES.scheduleEscrow,
    amount: standingApproveAmount(usdcPerRun, balance),
    minAllowance: usdcPerRun, // only re-approve once the standing allowance is actually used up
  });

  const hash = await walletClient.writeContract({
    address: ADDRESSES.scheduleEscrow,
    abi: SCHEDULE_ESCROW_ABI,
    functionName: "fundRun",
    args: [BigInt(scheduleId), usdcPerRun],
    feeCurrency: ADDRESSES.feeCurrency,
  });
  await publicClient.waitForTransactionReceipt({ hash });
  return { approveHash, hash };
}

// One-signature plan creation. The gateway creates the schedule on the ledger AND locks the first
// run's USDC in a single tx (createAndFundRun). A standing allowance is granted up front and reused, so
// the approve popup shows on the first plan only — not on every plan.
// Returns the receipt so the caller can read the new schedule id from the MonthlyScheduleCreated log.
export async function createAndFundScheduleRun({
  account, recipient, sourceAmount, destinationAmount, dayOfMonth, firstRunAt, commandHash, receiptLabelHash,
}) {
  assertAddress(account, "Wallet");
  assertAddress(ADDRESSES.scheduleEscrow, "VITE_SCHEDULE_ESCROW_ADDRESS");
  const publicClient = makePublicClient();
  const walletClient = makeWalletClient(account);

  const balance = await readUsdcBalance(account);
  const approveHash = await approveTokenIfNeeded({
    account,
    tokenAddress: ADDRESSES.usdc,
    spender: ADDRESSES.scheduleEscrow,
    amount: standingApproveAmount(sourceAmount, balance),
    minAllowance: sourceAmount, // only re-approve once the standing allowance is actually used up
  });

  const hash = await walletClient.writeContract({
    address: ADDRESSES.scheduleEscrow,
    abi: SCHEDULE_ESCROW_ABI,
    functionName: "createAndFundRun",
    args: [recipient, sourceAmount, destinationAmount, dayOfMonth, BigInt(firstRunAt), commandHash, receiptLabelHash],
    feeCurrency: ADDRESSES.feeCurrency,
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  return { approveHash, hash, receipt };
}

// Owner reclaims a locked run (e.g. on cancel/pause).
export async function refundScheduleRun({ account, scheduleId }) {
  assertAddress(account, "Wallet");
  assertAddress(ADDRESSES.scheduleEscrow, "VITE_SCHEDULE_ESCROW_ADDRESS");
  const publicClient = makePublicClient();
  const walletClient = makeWalletClient(account);
  const hash = await walletClient.writeContract({
    address: ADDRESSES.scheduleEscrow,
    abi: SCHEDULE_ESCROW_ABI,
    functionName: "refundRun",
    args: [BigInt(scheduleId)],
    feeCurrency: ADDRESSES.feeCurrency,
  });
  await publicClient.waitForTransactionReceipt({ hash });
  return { hash };
}
