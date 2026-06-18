import { keccak256, toHex } from "viem";
import { ADDRESSES, assertAddress, makePublicClient, makeWalletClient } from "./client.js";
import { REGISTRY_ABI } from "./abis.js";
import {
  approveTokenIfNeeded,
  destinationAmountForIntent,
  sourceAmountForIntent,
  sourceAssetAddressForIntent,
} from "./tokens.js";

export async function createScheduleViaRegistry({ account, recipient, intent }) {
  assertAddress(account, "Wallet");
  assertAddress(recipient, "Recipient");
  const ledgerOrRegistry = ADDRESSES.ledger || ADDRESSES.registry;
  assertAddress(ledgerOrRegistry, "VITE_LEDGER_ADDRESS or VITE_REGISTRY_ADDRESS");
  assertAddress(ADDRESSES.settlementSpender, "VITE_SETTLEMENT_SPENDER_ADDRESS");
  assertAddress(ADDRESSES.feeCurrency, "VITE_FEE_CURRENCY_ADDRESS");

  const amount = sourceAmountForIntent(intent);
  const sourceAsset = sourceAssetAddressForIntent(intent);
  assertAddress(sourceAsset, "Source asset");

  const walletClient = makeWalletClient(account);
  const publicClient = makePublicClient();
  const approveHash = await approveTokenIfNeeded({
    account,
    tokenAddress: sourceAsset,
    spender: ADDRESSES.settlementSpender,
    amount,
  });

  const hash = await walletClient.writeContract({
    address: ledgerOrRegistry,
    abi: REGISTRY_ABI,
    functionName: "createMonthlySchedule",
    args: [
      recipient,
      ADDRESSES.settlementSpender,
      sourceAsset,
      amount,
      destinationAmountForIntent(intent),
      intent.dayOfMonth,
      BigInt(intent.firstRunAt),
      keccak256(toHex(intent.rawCommand)),
    ],
    feeCurrency: ADDRESSES.usdm, // pay gas in USDm so USDC balance stays unchanged
  });
  await publicClient.waitForTransactionReceipt({ hash });
  return { approveHash, hash };
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
    feeCurrency: ADDRESSES.usdm, // pay gas in USDm so USDC balance stays unchanged
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
    feeCurrency: ADDRESSES.usdm, // pay gas in USDm so USDC balance stays unchanged
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
