import { formatUnits, parseUnits } from "viem";
import { APP_CONFIG, STABLECOINS } from "../lib/app-config.js";
import { ADDRESSES, assertAddress, makePublicClient, makeWalletClient } from "./client.js";
import { ERC20_ABI } from "./abis.js";

// --- Intent amount helpers (shared by swap.js and schedule.js) ---

export function usdcAmountForIntent(intent) {
  return parseUnits(Number(intent.sourceAmount || intent.estimatedUsdc).toFixed(6), 6);
}

export function applyExactOutputBuffer(usdcAmount) {
  // Buffer = max(bps% of the quote, a small floor). For LARGE sends the on-chain exact-out quote (a
  // linear extrapolation from a 1-USDC sample, ignoring price impact) under-estimates the true cost, so
  // the amountInMaximum cap can be too low and the swap reverts (audit M-4). Scale the bps up past a
  // threshold so big transfers keep a safe cap; any unused surplus refunds to the sender as USDm.
  const baseBps = Math.max(0, Math.round(Number(APP_CONFIG.transfer.exactOutputBufferBps || 0)));
  const largeBps = Math.max(baseBps, Math.round(Number(APP_CONFIG.transfer.largeExactOutputBufferBps || baseBps)));
  const threshold = parseUnits(Number(APP_CONFIG.transfer.largeSendThresholdUsdc || 0).toFixed(6), 6);
  const bufferBps = BigInt(threshold > 0n && usdcAmount >= threshold ? largeBps : baseBps);

  const bpsBuffer = (usdcAmount * bufferBps) / 10000n;
  const minBuffer = parseUnits(Number(APP_CONFIG.transfer.minExactOutputBufferUsdc || 0).toFixed(6), 6);
  const buffer = bpsBuffer > minBuffer ? bpsBuffer : minBuffer;
  return usdcAmount + buffer;
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

export async function approveTokenIfNeeded({ account, tokenAddress, spender, amount, minAllowance }) {
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

  // Re-approve only when the live allowance can't cover the actual need (minAllowance, default = amount).
  // When we DO approve, approve the larger `amount` so back-to-back sends reuse the allowance — the
  // second, third… send skips the approval entirely (one sign per batch instead of one per send).
  if (allowance >= (minAllowance ?? amount)) return null;

  const hash = await walletClient.writeContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: "approve",
    args: [spender, amount],
    feeCurrency: ADDRESSES.feeCurrency, // use the configured MiniPay fee currency adapter
  });
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}
