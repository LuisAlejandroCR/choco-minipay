import { decodeEventLog, keccak256, toHex } from "viem";
import { ADDRESSES, assertAddress, makePublicClient, makeWalletClient } from "./client.js";
import { REGISTRY_ABI, REGISTRY_EVENTS_ABI } from "./abis.js";
import { fundScheduleRun, isEscrowConfigured } from "./escrow.js";
import {
  approveTokenIfNeeded,
  destinationAmountForIntent,
  sourceAmountForIntent,
  sourceAssetAddressForIntent,
} from "./tokens.js";

// Pull the new schedule's on-chain id out of the MonthlyScheduleCreated event so we can fund its
// first run in the escrow. Returns null if it can't be found (we then skip funding rather than guess).
function extractScheduleId(receipt, registryAddress, owner) {
  for (const log of receipt.logs) {
    if (String(log.address).toLowerCase() !== String(registryAddress).toLowerCase()) continue;
    try {
      const decoded = decodeEventLog({ abi: REGISTRY_EVENTS_ABI, data: log.data, topics: log.topics, strict: false });
      if (decoded.eventName === "MonthlyScheduleCreated"
        && String(decoded.args.owner).toLowerCase() === String(owner).toLowerCase()) {
        return decoded.args.id;
      }
    } catch { /* not this event */ }
  }
  return null;
}

export async function createScheduleViaRegistry({ account, recipient, intent }) {
  assertAddress(account, "Wallet");
  assertAddress(recipient, "Recipient");
  const ledgerOrRegistry = ADDRESSES.ledger || ADDRESSES.registry;
  assertAddress(ledgerOrRegistry, "VITE_LEDGER_ADDRESS or VITE_REGISTRY_ADDRESS");
  assertAddress(ADDRESSES.feeCurrency, "VITE_FEE_CURRENCY_ADDRESS");

  const amount = sourceAmountForIntent(intent);
  const sourceAsset = sourceAssetAddressForIntent(intent);
  assertAddress(sourceAsset, "Source asset");

  // Escrow mode (USDC-funded plans): the next run's USDC is locked in ChocoScheduleEscrow instead
  // of relying on a standing settlement-spender allowance, so the run can't fail on insufficient
  // funds. Dormant until VITE_SCHEDULE_ESCROW_ADDRESS is set — legacy behavior is unchanged.
  const escrowMode = isEscrowConfigured() && sourceAsset.toLowerCase() === String(ADDRESSES.usdc).toLowerCase();
  const settlementSpender = escrowMode ? ADDRESSES.scheduleEscrow : ADDRESSES.settlementSpender;
  assertAddress(settlementSpender, escrowMode ? "VITE_SCHEDULE_ESCROW_ADDRESS" : "VITE_SETTLEMENT_SPENDER_ADDRESS");

  const walletClient = makeWalletClient(account);
  const publicClient = makePublicClient();

  // Legacy: pre-approve the settlement spender to pull at run time. Escrow mode locks the run
  // below instead, so no run-time spender allowance is needed here.
  const approveHash = escrowMode ? null : await approveTokenIfNeeded({
    account,
    tokenAddress: sourceAsset,
    spender: settlementSpender,
    amount,
  });

  const receiptLabel = String(intent.receiptLabel || "").trim().toLowerCase();
  const receiptLabelHash = receiptLabel ? keccak256(toHex(receiptLabel)) : `0x${"0".repeat(64)}`;

  const hash = await walletClient.writeContract({
    address: ledgerOrRegistry,
    abi: REGISTRY_ABI,
    functionName: "createMonthlySchedule",
    args: [
      recipient,
      settlementSpender,
      sourceAsset,
      amount,
      destinationAmountForIntent(intent),
      intent.dayOfMonth,
      BigInt(intent.firstRunAt),
      keccak256(toHex(intent.rawCommand)),
      receiptLabelHash,
    ],
    feeCurrency: ADDRESSES.feeCurrency, // use the configured MiniPay fee currency adapter
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });

  // Lock the first run's USDC immediately so the plan is funded and the keeper can settle it.
  let fundHash = null;
  if (escrowMode) {
    const scheduleId = extractScheduleId(receipt, ledgerOrRegistry, account);
    if (scheduleId !== null) {
      const funded = await fundScheduleRun({ account, scheduleId, usdcPerRun: amount });
      fundHash = funded.hash;
    }
  }

  return { approveHash, hash, fundHash };
}

export async function cancelScheduleViaRegistry({ account, id }) {
  assertAddress(account, "Wallet");
  const ledgerOrRegistry = ADDRESSES.ledger || ADDRESSES.registry;
  assertAddress(ledgerOrRegistry, "VITE_LEDGER_ADDRESS or VITE_REGISTRY_ADDRESS");
  if (id === undefined || id === null || id === "") throw new Error("Missing on-chain schedule id.");

  const walletClient = makeWalletClient(account);
  const publicClient = makePublicClient();
  const hash = await walletClient.writeContract({
    address: ledgerOrRegistry,
    abi: REGISTRY_ABI,
    functionName: "cancelSchedule",
    args: [BigInt(id)],
    feeCurrency: ADDRESSES.feeCurrency, // use the configured MiniPay fee currency adapter
  });
  await publicClient.waitForTransactionReceipt({ hash });
  return { hash };
}

async function updateSchedulePauseState({ account, id, paused }) {
  assertAddress(account, "Wallet");
  const ledgerOrRegistry = ADDRESSES.ledger || ADDRESSES.registry;
  assertAddress(ledgerOrRegistry, "VITE_LEDGER_ADDRESS or VITE_REGISTRY_ADDRESS");
  if (id === undefined || id === null || id === "") throw new Error("Missing on-chain schedule id.");

  const walletClient = makeWalletClient(account);
  const publicClient = makePublicClient();
  const hash = await walletClient.writeContract({
    address: ledgerOrRegistry,
    abi: REGISTRY_ABI,
    functionName: paused ? "pauseSchedule" : "resumeSchedule",
    args: [BigInt(id)],
    feeCurrency: ADDRESSES.feeCurrency, // use the configured MiniPay fee currency adapter
  });
  await publicClient.waitForTransactionReceipt({ hash });
  return { hash };
}

export async function pauseScheduleViaRegistry({ account, id }) {
  return updateSchedulePauseState({ account, id, paused: true });
}

export async function resumeScheduleViaRegistry({ account, id }) {
  return updateSchedulePauseState({ account, id, paused: false });
}
