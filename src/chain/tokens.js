import { formatUnits, parseUnits } from "viem";
import { APP_CONFIG, STABLECOINS } from "../lib/app-config.js";
import { ADDRESSES, assertAddress, makePublicClient, makeWalletClient } from "./client.js";
import { ERC20_ABI } from "./abis.js";

// --- Intent amount helpers (shared by swap.js and schedule.js) ---

export function usdcAmountForIntent(intent) {
  return parseUnits(Number(intent.sourceAmount || intent.estimatedUsdc).toFixed(6), 6);
}

export function sourceAmountForIntent(intent) {
  const decimals = intent.sourceAsset === APP_CONFIG.assets.source ? 6 : 18;
  const amount = intent.sourceAsset === APP_CONFIG.assets.source
    ? Number(intent.sourceAmount || intent.estimatedUsdc).toFixed(6)
    : String(intent.amountKes);
  return parseUnits(amount, decimals);
}

export function sourceAssetAddressForIntent(intent) {
  return intent.sourceAsset === APP_CONFIG.assets.source ? ADDRESSES.usdc : ADDRESSES.kesm;
}

export function destinationAmountForIntent(intent) {
  return parseUnits(String(Math.max(1, Math.floor(Number(intent.destinationAmount || intent.amountKes)))), 18);
}

// --- Token reads ---

export async function readUsdcBalance(account) {
  assertAddress(account, "Wallet");
  const publicClient = makePublicClient();
  return publicClient.readContract({
    address: ADDRESSES.usdc, abi: ERC20_ABI, functionName: "balanceOf", args: [account],
  });
}

export async function readStablecoinBalances(account) {
  assertAddress(account, "Wallet");
  const publicClient = makePublicClient();

  const values = await Promise.all(STABLECOINS.map((token) => (
    token.native
      ? publicClient.getBalance({ address: account })
      : publicClient.readContract({
        address: token.address,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [account],
      })
  )));

  return STABLECOINS.map((token, index) => ({
    ...token,
    raw: values[index],
    formatted: Number(formatUnits(values[index], token.decimals)).toLocaleString("en-US", { maximumFractionDigits: 4 }),
  }));
}

// --- Approval ---

export async function approveTokenIfNeeded({ account, tokenAddress, spender, amount }) {
  assertAddress(tokenAddress, "Source asset");
  assertAddress(spender, "Settlement spender");
  const publicClient = makePublicClient();
  const walletClient = makeWalletClient(account);
  const allowance = await publicClient.readContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: [account, spender],
  });

  if (allowance >= amount) return null;

  const hash = await walletClient.writeContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: "approve",
    args: [spender, amount],
    feeCurrency: ADDRESSES.usdm, // pay gas in USDm so USDC balance stays unchanged
  });
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}
