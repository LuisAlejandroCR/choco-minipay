import { parseUnits } from "viem";
import { APP_CONFIG } from "../lib/app-config.js";
import { ADDRESSES, assertAddress, makePublicClient, makeWalletClient } from "./client.js";
import { CKES_SWAP_ABI, ERC20_ABI, MENTO_BROKER_ABI } from "./abis.js";
import { applyExactOutputBuffer, approveTokenIfNeeded, usdcAmountForIntent, sourceAmountForIntent } from "./tokens.js";
import { hasAnyExecutableRoute, selectTransferRouteExactOutWithRetry, selectTransferRouteForwardIn } from "./routes.js";
import {
  batchApproveAmount,
  readErc20Balance,
  readErc20Allowance,
  formatUsdc,
  routeError,
  confirmTransactionInBackground,
  simulateSwapWithRetry,
  sendGasLimit,
} from "./swap-helpers.js";

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
    confirmTransactionInBackground(publicClient, hash);
    return { approveHash: null, hash };
  }

  const usdcAmount = usdcAmountForIntent(intent);
  const MENTO = APP_CONFIG.mento;

  // 2-confirmation fast path via swap contract (approve + swapAndSend[Exact]).
  // Route system tries Mento first, falls back to Uniswap V3 automatically if oracle is down.
  // Falls back to the 5-step direct Mento path only when NO swap contract is configured at all.
  if (hasAnyExecutableRoute()) {
    // Exact-output path: user typed a cKES amount — deliver it precisely, return surplus.
    if (intent.amountKes) {
      const ckesExact = parseUnits(String(Number(intent.amountKes)), 18);
      // The route quote only feeds the max-USDC cap; the simulate below runs the REAL swap and is the
      // true guard. So a transient quote failure (Mento "no valid median" / forno rate-limit right after
      // a prior send — the cause of the "second transfer" break) must NOT block the send: fall back to
      // the user's buffered USDC estimate as the cap. swapAndSendExact delivers exactly ckesExact and
      // refunds any surplus, so an over-estimate is safe, and the simulate still catches a true outage.
      const selectedRoute = await selectTransferRouteExactOutWithRetry({ ckesAmountRaw: ckesExact, publicClient });
      const usdcNeeded = selectedRoute.ok ? selectedRoute.usdcAmountIn : applyExactOutputBuffer(usdcAmount);
      const swapContract = selectedRoute.ok
        ? selectedRoute.contractAddress
        : (ADDRESSES.ckesSwapUniV3 || ADDRESSES.ckesSwap);
      if (!(usdcNeeded > 0n)) throw new Error(selectedRoute.message || "Enter a KESm amount before sending.");
      assertAddress(swapContract, "Swap contract");
      const usdcBalance = await readErc20Balance(publicClient, ADDRESSES.usdc, account);
      if (usdcBalance < usdcNeeded) {
        throw new Error(`Insufficient USDC balance. Choco needs ${formatUsdc(usdcNeeded)} for this route, but your wallet has ${formatUsdc(usdcBalance)}.`);
      }

      const approveHash = await approveTokenIfNeeded({
        account,
        tokenAddress: ADDRESSES.usdc,
        spender: swapContract,
        amount: batchApproveAmount(usdcNeeded, usdcBalance), // batch (capped at balance) so repeat sends skip the approval
        minAllowance: usdcNeeded,                            // …but only re-approve when the live allowance can't cover this send
      });

      const allowance = await readErc20Allowance(publicClient, ADDRESSES.usdc, account, swapContract);
      if (allowance < usdcNeeded) {
        throw new Error(`USDC approval is lower than the route cost. Approved ${formatUsdc(allowance)}, needed ${formatUsdc(usdcNeeded)}.`);
      }

      const sim = await simulateSwapWithRetry(publicClient, { account, swapContract, recipient, usdcNeeded, ckesExact });
      if (!sim.ok) {
        // Proceed when the route is fundamentally UP — i.e. the inverse quote just succeeded (on-chain
        // audit shows quoteExactOut keeps working even while a swapAndSendExact simulate momentarily
        // reverts on a Mento/RPC blip), or we already committed an approve this round. usdcNeeded is the
        // buffered quote, so it's a sufficient cap; a transient simulate blip must NOT surface as the
        // (misleading) "temporarily unavailable" and block an otherwise-valid send — the real tx lands
        // seconds later once the blip clears. Only hard-fail when the quote ALSO failed (route genuinely
        // down) AND nothing was committed.
        if (!selectedRoute.ok && !approveHash) throw routeError(sim.error);
        console.warn("Choco: swap simulate blipped but the route quoted OK / approval committed — sending anyway.", sim.error);
      }

      const swapGas = await sendGasLimit(publicClient, {
        account, address: swapContract, abi: CKES_SWAP_ABI,
        functionName: "swapAndSendExact", args: [recipient, usdcNeeded, ckesExact],
      });
      const hash = await walletClient.writeContract({
        address: swapContract,
        abi: CKES_SWAP_ABI,
        functionName: "swapAndSendExact",
        args: [recipient, usdcNeeded, ckesExact],
        gas: swapGas,
        feeCurrency: ADDRESSES.feeCurrency,
      });
      confirmTransactionInBackground(publicClient, hash);
      return { approveHash, swap1Hash: null, swap2Hash: null, hash, ckesReceived: ckesExact };
    }

    // Fixed-input fallback: used when only a USDC amount is specified (no cKES target).
    // Uses the same route system as the exact-output path — Mento first, UniV3 backup.
    const selectedRouteIn = await selectTransferRouteForwardIn({ usdcAmountRaw: usdcAmount, publicClient });
    if (!selectedRouteIn.ok) throw new Error(selectedRouteIn.message);
    const ckesMinOut = (selectedRouteIn.ckesAmountOut * 985n) / 1000n;
    const swapContractIn = selectedRouteIn.contractAddress;

    const usdcBalance = await readErc20Balance(publicClient, ADDRESSES.usdc, account);
    if (usdcBalance < usdcAmount) {
      throw new Error(`Insufficient USDC balance. Choco needs ${formatUsdc(usdcAmount)} for this route, but your wallet has ${formatUsdc(usdcBalance)}.`);
    }
    const approveHash = await approveTokenIfNeeded({
      account,
      tokenAddress: ADDRESSES.usdc,
      spender: swapContractIn,
      amount: batchApproveAmount(usdcAmount, usdcBalance), // batch (capped at balance) so repeat sends skip the approval
      minAllowance: usdcAmount,                            // …but only re-approve when the live allowance can't cover this send
    });
    const allowance = await readErc20Allowance(publicClient, ADDRESSES.usdc, account, swapContractIn);
    if (allowance < usdcAmount) {
      throw new Error(`USDC approval is lower than the route cost. Approved ${formatUsdc(allowance)}, needed ${formatUsdc(usdcAmount)}.`);
    }

    try {
      await publicClient.simulateContract({
        account,
        address: swapContractIn,
        abi: CKES_SWAP_ABI,
        functionName: "swapAndSend",
        args: [recipient, usdcAmount, ckesMinOut],
      });
    } catch (error) {
      throw routeError(error);
    }

    const swapGas = await sendGasLimit(publicClient, {
      account, address: swapContractIn, abi: CKES_SWAP_ABI,
      functionName: "swapAndSend", args: [recipient, usdcAmount, ckesMinOut],
    });
    const hash = await walletClient.writeContract({
      address: swapContractIn,
      abi: CKES_SWAP_ABI,
      functionName: "swapAndSend",
      args: [recipient, usdcAmount, ckesMinOut],
      gas: swapGas,
      feeCurrency: ADDRESSES.feeCurrency,
    });
    confirmTransactionInBackground(publicClient, hash);
    return { approveHash, swap1Hash: null, swap2Hash: null, hash, ckesReceived: selectedRouteIn.ckesAmountOut };
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
  confirmTransactionInBackground(publicClient, hash);
  return { approveHash, swap1Hash, swap2Hash, hash, ckesReceived };
}
