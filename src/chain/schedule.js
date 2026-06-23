import { decodeEventLog, keccak256, toHex } from "viem";
import { ADDRESSES, assertAddress, makePublicClient, makeWalletClient } from "./client.js";
import { REGISTRY_ABI, REGISTRY_EVENTS_ABI } from "./abis.js";
import { createAndFundScheduleRun, isEscrowConfigured } from "./escrow.js";
import {
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

  const receiptLabel = String(intent.receiptLabel || "").trim().toLowerCase();
  const receiptLabelHash = receiptLabel ? keccak256(toHex(receiptLabel)) : `0x${"0".repeat(64)}`;
  const commandHash = keccak256(toHex(intent.rawCommand));
  const destinationAmount = destinationAmountForIntent(intent);

  // Escrow mode (USDC-funded plans): the first run's USDC is locked in the gateway. The new
  // ChocoLedger+ChocoGateway pair has no settlement-spender concept — the gateway settles from its
  // own locked funds — so there is no standing approval to pre-grant.
  const escrowMode = isEscrowConfigured() && sourceAsset.toLowerCase() === String(ADDRESSES.usdc).toLowerCase();

  // One-signature path: createAndFundRun creates the plan on the ledger AND locks its first run in a
  // single tx, so the user signs once (plus a one-time USDC approval the first time they schedule).
  // The MonthlyScheduleCreated event is still emitted by the ledger, so the id extraction is unchanged.
  if (escrowMode) {
    const { approveHash, hash, receipt } = await createAndFundScheduleRun({
      account,
      recipient,
      sourceAmount: amount,
      destinationAmount,
      dayOfMonth: intent.dayOfMonth,
      firstRunAt: intent.firstRunAt,
      commandHash,
      receiptLabelHash,
    });
    const scheduleId = extractScheduleId(receipt, ledgerOrRegistry, account);
    return { approveHash, hash, fundHash: hash, scheduleId: scheduleId === null ? null : scheduleId.toString() };
  }

  // Legacy path (cKES-source plans, or escrow not configured): create on the ledger only. These plans
  // settle from the owner's standing allowance, so there is no separate funding step.
  const walletClient = makeWalletClient(account);
  const publicClient = makePublicClient();
  const hash = await walletClient.writeContract({
    address: ledgerOrRegistry,
    abi: REGISTRY_ABI,
    functionName: "createMonthlySchedule",
    args: [
      recipient,
      sourceAsset,
      amount,
      destinationAmount,
      intent.dayOfMonth,
      BigInt(intent.firstRunAt),
      commandHash,
      receiptLabelHash,
    ],
    feeCurrency: ADDRESSES.feeCurrency, // use the configured MiniPay fee currency adapter
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  const scheduleId = extractScheduleId(receipt, ledgerOrRegistry, account);
  return { approveHash: null, hash, fundHash: null, scheduleId: scheduleId === null ? null : scheduleId.toString() };
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
