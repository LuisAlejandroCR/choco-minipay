import { isAddress } from "viem";
import { ADDRESSES, assertAddress, makePublicClient, makeWalletClient } from "./client.js";
import { approveTokenIfNeeded } from "./tokens.js";

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

// How many runs of USDC allowance to grant the escrow at funding time, so the keeper can auto-lock
// upcoming runs from the wallet without re-prompting. The escrow only ever pulls one run per month.
const AUTO_LOCK_RUNS = 6;

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

// Lock the next run's USDC for a plan. Approves AUTO_LOCK_RUNS worth so the keeper can re-lock
// later runs silently, then funds exactly one run now.
export async function fundScheduleRun({ account, scheduleId, usdcPerRun }) {
  assertAddress(account, "Wallet");
  assertAddress(ADDRESSES.scheduleEscrow, "VITE_SCHEDULE_ESCROW_ADDRESS");
  const publicClient = makePublicClient();
  const walletClient = makeWalletClient(account);

  const approveHash = await approveTokenIfNeeded({
    account,
    tokenAddress: ADDRESSES.usdc,
    spender: ADDRESSES.scheduleEscrow,
    amount: usdcPerRun * BigInt(AUTO_LOCK_RUNS),
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
// run's USDC in a single tx (createAndFundRun), so the user signs once instead of twice (create +
// fund). Approves AUTO_LOCK_RUNS worth up front so the keeper can re-lock later runs silently.
// Returns the receipt so the caller can read the new schedule id from the MonthlyScheduleCreated log.
export async function createAndFundScheduleRun({
  account, recipient, sourceAmount, destinationAmount, dayOfMonth, firstRunAt, commandHash, receiptLabelHash,
}) {
  assertAddress(account, "Wallet");
  assertAddress(ADDRESSES.scheduleEscrow, "VITE_SCHEDULE_ESCROW_ADDRESS");
  const publicClient = makePublicClient();
  const walletClient = makeWalletClient(account);

  const approveHash = await approveTokenIfNeeded({
    account,
    tokenAddress: ADDRESSES.usdc,
    spender: ADDRESSES.scheduleEscrow,
    amount: sourceAmount * BigInt(AUTO_LOCK_RUNS),
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
