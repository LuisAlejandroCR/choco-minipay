import { formatUnits, isAddress, parseUnits } from "viem";
import { APP_CONFIG } from "../lib/app-config.js";
import { ADDRESSES, assertAddress, makePublicClient, makeWalletClient } from "./client.js";
import { CKES_SWAP_ABI, ERC20_ABI, MENTO_BROKER_ABI } from "./abis.js";
import { applyExactOutputBuffer, approveTokenIfNeeded, usdcAmountForIntent, sourceAmountForIntent } from "./tokens.js";

function readErc20Balance(publicClient, token, account) {
  return publicClient.readContract({ address: token, abi: ERC20_ABI, functionName: "balanceOf", args: [account] });
}

function readErc20Allowance(publicClient, token, owner, spender) {
  return publicClient.readContract({ address: token, abi: ERC20_ABI, functionName: "allowance", args: [owner, spender] });
}

function formatUsdc(amount) {
  return `${Number(formatUnits(amount, 6)).toLocaleString("en-US", { maximumFractionDigits: 6 })} USDC`;
}

function routeError(error) {
  const reason = error?.shortMessage || error?.details || error?.message || "gateway route reverted";
  return new Error(`Choco route could not execute before wallet signing: ${reason}`);
}

// Send now. cKES transfers go wallet → recipient directly. USDC routes USDC → USDm → cKES through
// the Mento Broker (each hop signed by the wallet), then the received cKES is delivered to the recipient.
export async function sendNow({ account, recipient, intent }) {
  assertAddress(account, "Wallet");
  assertAddress(recipient, "Recipient");
  assertAddress(ADDRESSES.feeCurrency, "VITE_FEE_CURRENCY_ADDRESS");

  const publicClient = makePublicClient();
  const walletClient = makeWalletClient(account);

  // Direct cKES send — no swap needed.
  if (intent.sourceAsset === APP_CONFIG.assets.destination) {
    const hash = await walletClient.writeContract({
      address: ADDRESSES.kesm,
      abi: ERC20_ABI,
      functionName: "transfer",
      args: [recipient, sourceAmountForIntent(intent)],
      feeCurrency: ADDRESSES.feeCurrency,
    });
    await publicClient.waitForTransactionReceipt({ hash });
    return { approveHash: null, hash };
  }

  const usdcAmount = usdcAmountForIntent(intent);
  const MENTO = APP_CONFIG.mento;

  // 2-confirmation fast path via ChocoGateway (approve + swapAndSend[Exact]).
  // Falls back to the 5-step direct Mento path when ckesSwap is not configured.
  if (isAddress(ADDRESSES.ckesSwap || "")) {
    // Exact-output path: user typed a cKES amount — deliver it precisely, return surplus.
    if (intent.amountKes) {
      const ckesExact = parseUnits(String(Number(intent.amountKes)), 18);
      const quotedUsdcNeeded = await publicClient.readContract({
        address: ADDRESSES.ckesSwap,
        abi: CKES_SWAP_ABI,
        functionName: "quoteExactOut",
        args: [ckesExact],
      });
      const usdcNeeded = applyExactOutputBuffer(quotedUsdcNeeded);
      const usdcBalance = await readErc20Balance(publicClient, ADDRESSES.usdc, account);
      if (usdcBalance < usdcNeeded) {
        throw new Error(`Insufficient USDC balance. Choco needs ${formatUsdc(usdcNeeded)} for this route, but your wallet has ${formatUsdc(usdcBalance)}.`);
      }

      const approveHash = await approveTokenIfNeeded({
        account,
        tokenAddress: ADDRESSES.usdc,
        spender: ADDRESSES.ckesSwap,
        amount: usdcNeeded,
      });

      const allowance = await readErc20Allowance(publicClient, ADDRESSES.usdc, account, ADDRESSES.ckesSwap);
      if (allowance < usdcNeeded) {
        throw new Error(`USDC approval is lower than the route cost. Approved ${formatUsdc(allowance)}, needed ${formatUsdc(usdcNeeded)}.`);
      }

      try {
        await publicClient.simulateContract({
          account,
          address: ADDRESSES.ckesSwap,
          abi: CKES_SWAP_ABI,
          functionName: "swapAndSendExact",
          args: [recipient, usdcNeeded, ckesExact],
        });
      } catch (error) {
        throw routeError(error);
      }

      const hash = await walletClient.writeContract({
        address: ADDRESSES.ckesSwap,
        abi: CKES_SWAP_ABI,
        functionName: "swapAndSendExact",
        args: [recipient, usdcNeeded, ckesExact],
        feeCurrency: ADDRESSES.feeCurrency,
      });
      await publicClient.waitForTransactionReceipt({ hash });
      return { approveHash, swap1Hash: null, swap2Hash: null, hash, ckesReceived: ckesExact };
    }

    // Fixed-input fallback: used when only a USDC amount is specified (no cKES target).
    const ckesQuoted = await publicClient.readContract({
      address: ADDRESSES.ckesSwap,
      abi: CKES_SWAP_ABI,
      functionName: "quote",
      args: [usdcAmount],
    });
    const ckesMinOut = (ckesQuoted * 985n) / 1000n;

    const usdcBalance = await readErc20Balance(publicClient, ADDRESSES.usdc, account);
    if (usdcBalance < usdcAmount) {
      throw new Error(`Insufficient USDC balance. Choco needs ${formatUsdc(usdcAmount)} for this route, but your wallet has ${formatUsdc(usdcBalance)}.`);
    }

    const ckesBefore = await readErc20Balance(publicClient, ADDRESSES.kesm, recipient);
    const approveHash = await approveTokenIfNeeded({
      account,
      tokenAddress: ADDRESSES.usdc,
      spender: ADDRESSES.ckesSwap,
      amount: usdcAmount,
    });
    const allowance = await readErc20Allowance(publicClient, ADDRESSES.usdc, account, ADDRESSES.ckesSwap);
    if (allowance < usdcAmount) {
      throw new Error(`USDC approval is lower than the route cost. Approved ${formatUsdc(allowance)}, needed ${formatUsdc(usdcAmount)}.`);
    }

    try {
      await publicClient.simulateContract({
        account,
        address: ADDRESSES.ckesSwap,
        abi: CKES_SWAP_ABI,
        functionName: "swapAndSend",
        args: [recipient, usdcAmount, ckesMinOut],
      });
    } catch (error) {
      throw routeError(error);
    }

    const hash = await walletClient.writeContract({
      address: ADDRESSES.ckesSwap,
      abi: CKES_SWAP_ABI,
      functionName: "swapAndSend",
      args: [recipient, usdcAmount, ckesMinOut],
      feeCurrency: ADDRESSES.feeCurrency,
    });
    await publicClient.waitForTransactionReceipt({ hash });
    const ckesAfter = await readErc20Balance(publicClient, ADDRESSES.kesm, recipient);
    const ckesReceived = ckesAfter > ckesBefore ? ckesAfter - ckesBefore : ckesMinOut;
    return { approveHash, swap1Hash: null, swap2Hash: null, hash, ckesReceived };
  }

  // Direct Mento path (5-step): USDC → USDm → cKES → transfer to recipient.
  assertAddress(ADDRESSES.mentoBroker, "VITE_MENTO_BROKER_ADDRESS");
  assertAddress(ADDRESSES.mentoProvider, "VITE_MENTO_BIPOOL_ADDRESS");

  // Hop 1: USDC -> USDm
  const usdmQuote = await publicClient.readContract({
    address: ADDRESSES.mentoBroker,
    abi: MENTO_BROKER_ABI,
    functionName: "getAmountOut",
    args: [ADDRESSES.mentoProvider, MENTO.usdcToUsdm, ADDRESSES.usdc, ADDRESSES.usdm, usdcAmount],
  });
  const approveHash = await approveTokenIfNeeded({ account, tokenAddress: ADDRESSES.usdc, spender: ADDRESSES.mentoBroker, amount: usdcAmount });
  const usdmBefore = await readErc20Balance(publicClient, ADDRESSES.usdm, account);
  const swap1Hash = await walletClient.writeContract({
    address: ADDRESSES.mentoBroker,
    abi: MENTO_BROKER_ABI,
    functionName: "swapIn",
    args: [ADDRESSES.mentoProvider, MENTO.usdcToUsdm, ADDRESSES.usdc, ADDRESSES.usdm, usdcAmount, (usdmQuote * 985n) / 1000n],
    feeCurrency: ADDRESSES.feeCurrency,
  });
  await publicClient.waitForTransactionReceipt({ hash: swap1Hash });
  const usdmAfter = await readErc20Balance(publicClient, ADDRESSES.usdm, account);
  const usdmReceived = usdmAfter > usdmBefore ? usdmAfter - usdmBefore : usdmQuote;

  // Hop 2: USDm -> cKES
  const ckesQuote = await publicClient.readContract({
    address: ADDRESSES.mentoBroker,
    abi: MENTO_BROKER_ABI,
    functionName: "getAmountOut",
    args: [ADDRESSES.mentoProvider, MENTO.usdmToCkes, ADDRESSES.usdm, ADDRESSES.kesm, usdmReceived],
  });
  await approveTokenIfNeeded({ account, tokenAddress: ADDRESSES.usdm, spender: ADDRESSES.mentoBroker, amount: usdmReceived });
  const ckesBefore = await readErc20Balance(publicClient, ADDRESSES.kesm, account);
  const swap2Hash = await walletClient.writeContract({
    address: ADDRESSES.mentoBroker,
    abi: MENTO_BROKER_ABI,
    functionName: "swapIn",
    args: [ADDRESSES.mentoProvider, MENTO.usdmToCkes, ADDRESSES.usdm, ADDRESSES.kesm, usdmReceived, (ckesQuote * 985n) / 1000n],
    feeCurrency: ADDRESSES.feeCurrency,
  });
  await publicClient.waitForTransactionReceipt({ hash: swap2Hash });
  const ckesAfter = await readErc20Balance(publicClient, ADDRESSES.kesm, account);
  const ckesReceived = ckesAfter > ckesBefore ? ckesAfter - ckesBefore : ckesQuote;

  // Deliver received cKES to recipient.
  const hash = await walletClient.writeContract({
    address: ADDRESSES.kesm,
    abi: ERC20_ABI,
    functionName: "transfer",
    args: [recipient, ckesReceived],
    feeCurrency: ADDRESSES.feeCurrency,
  });
  await publicClient.waitForTransactionReceipt({ hash });
  return { approveHash, swap1Hash, swap2Hash, hash, ckesReceived };
}
