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

  const receiptLabel = String(intent.receiptLabel || "").trim().toLowerCase();
  const receiptLabelHash = receiptLabel ? keccak256(toHex(receiptLabel)) : `0x${"0".repeat(64)}`;

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
      receiptLabelHash,
    ],
    feeCurrency: ADDRESSES.feeCurrency,
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
    feeCurrency: ADDRESSES.feeCurrency,
  });
  await publicClient.waitForTransactionReceipt({ hash });
  return { hash };
}
